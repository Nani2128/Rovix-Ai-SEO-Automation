import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate SQLite DB in a temp directory BEFORE importing server DB modules
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-stage6-test-'));
process.env.ROVIX_DB_PATH = path.join(tempDir, 'stage6-test.sqlite');

import type { User } from '../../types/auth';
import { createProjectRecord, getAuditDb } from '../audit/db';
import { upsertBudgetConfigInDb } from './usageIntelligenceDb';
import {
  calculateTokenCostWithRegistry,
  listWorkspacePricingRegistry,
  publishPricingVersion,
} from './pricingRegistryService';
import {
  acquireWorkerLeaseInDb,
  claimDueSchedulesInDb,
  listDeadLetterTasksInDb,
  listOperationsPolicyAuditInDb,
  listRecoveryRecordsInDb,
  listTriggerEventsInDb,
  reclaimExpiredWorkerLeasesInDb,
  updateWorkflowScheduleInDb,
  upsertDeadLetterTaskInDb,
} from './operationsDb';
import {
  buildOperationsControlCenterPayload,
  createProjectSchedule,
  createTriggerSubscription,
  deleteProjectSchedule,
  dispatchDomainTriggerEvent,
  handleInboundWebhookEvent,
  pauseAgentWorkflow,
  reclaimStaleLeasesAndRecover,
  replayAgentWorkflow,
  resolveDeadLetterTask,
  resumeAgentWorkflow,
  toggleProjectScheduleStatus,
  updateProjectAutonomyPolicy,
} from './operationsService';
import {
  createAgentWorkflow,
  getAgentWorkflowDetailScoped,
} from './orchestrationEngine';
import { runSchedulerTickNow } from './schedulerRuntime';
import { computeWebhookHmacSignature } from './webhookSecurity';

const TENANT_A = 'tenant-stage6-a';
const TENANT_B = 'tenant-stage6-b';
const PROJECT_A = 'proj-stage6-a';
const PROJECT_B = 'proj-stage6-b';

const OWNER_USER: User = {
  id: 'usr-owner-s6',
  name: 'Simon Owner',
  email: 'simon@test.local',
  role: 'Agency Owner',
  avatarInitials: 'SO',
  title: 'Agency Owner',
};

const QA_USER: User = {
  id: 'usr-qa-s6',
  name: 'Maya QA',
  email: 'maya@test.local',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Reviewer',
};

function seedProjects() {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO tenants (id, name, plan, primary_domain, created_at) VALUES (?, ?, 'Enterprise', ?, ?)`,
  ).run(TENANT_A, 'Alpha Agency', 'alpha-example.test', now);
  db.prepare(
    `INSERT OR IGNORE INTO tenants (id, name, plan, primary_domain, created_at) VALUES (?, ?, 'Enterprise', ?, ?)`,
  ).run(TENANT_B, 'Beta Agency', 'beta-example.test', now);

  createProjectRecord({
    id: PROJECT_A,
    tenantId: TENANT_A,
    name: 'Alpha SEO Workspace',
    website: 'https://alpha-example.test',
    owner: OWNER_USER.name,
  });
  createProjectRecord({
    id: PROJECT_B,
    tenantId: TENANT_B,
    name: 'Beta Isolated Workspace',
    website: 'https://beta-example.test',
    owner: OWNER_USER.name,
  });
}

test.before(() => {
  seedProjects();
});

test.after(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup race on Windows/Linux
  }
});

test('Part 1 Integration: Pricing Registry service publishes versioned rates, calculates exact tiered costs, and enforces RBAC', () => {
  assert.throws(
    () =>
      publishPricingVersion({
        tenantId: TENANT_A,
        user: QA_USER,
        provider: 'google_gemini',
        model: 'gemini-2.5-pro',
        inputPricePer1mMicros: 1_250_000,
        outputPricePer1mMicros: 10_000_000,
        sourceOfPricing: 'Unauthorized attempt',
      }),
    /FORBIDDEN/,
  );

  const published = publishPricingVersion({
    tenantId: TENANT_A,
    user: OWNER_USER,
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
    inputPricePer1mMicros: 1_250_000,
    outputPricePer1mMicros: 10_000_000,
    cachedInputPricePer1mMicros: 312_500,
    sourceOfPricing: 'Google Gemini Official GA Pricing (Test)',
    sourceType: 'official_provider_pricing',
    auditNote: 'Verified official Gemini 2.5 Pro rates',
  });

  assert.equal(published.record.model, 'gemini-2.5-pro');
  assert.equal(published.tiers.length, 2);

  const registry = listWorkspacePricingRegistry(TENANT_A);
  assert.ok(registry.some((e) => e.record.id === published.record.id));

  // Verify >200k long context tier automatically selected via BigInt math
  const cost = calculateTokenCostWithRegistry({
    tenantId: TENANT_A,
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
    inputTokens: 250_000,
    outputTokens: 10_000,
    cachedInputTokens: 50_000,
  });
  assert.equal(cost.appliedTierId, 'prompts_over_200k');
  assert.equal(cost.totalCostMicros, 681_250);
});

test('Stage 6 Integration: Persistent schedule survives pause/resume, atomic multi-worker lock prevents duplicates, and RBAC/tenant isolation hold', () => {
  // QA cannot create schedules
  assert.throws(
    () =>
      createProjectSchedule({
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        user: QA_USER,
        payload: {
          name: 'QA Blocked Schedule',
          targetKind: 'workflow_template',
          templateId: 'technical_performance_audit',
          frequency: 'daily',
          hourOfDay: 4,
          minuteOfHour: 0,
          timezone: 'UTC',
          catchUpPolicy: 'run_once',
        },
      }),
    /FORBIDDEN/,
  );

  const schedule = createProjectSchedule({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    payload: {
      name: 'Nightly Technical Audit',
      targetKind: 'workflow_template',
      templateId: 'technical_performance_audit',
      frequency: 'hourly',
      minuteOfHour: 0,
      timezone: 'UTC',
      catchUpPolicy: 'run_once',
    },
  });
  assert.equal(schedule.status, 'active');
  assert.ok(schedule.nextRunAt);

  // Tenant B cannot see Tenant A's schedule
  const tenantBPayload = buildOperationsControlCenterPayload({
    tenantId: TENANT_B,
    projectId: PROJECT_B,
    userRole: 'Agency Owner',
  });
  assert.equal(
    tenantBPayload.schedules.some((s) => s.id === schedule.id),
    false,
  );

  // Pause and resume
  const paused = toggleProjectScheduleStatus({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    scheduleId: schedule.id,
    action: 'pause',
    user: OWNER_USER,
  });
  assert.equal(paused.status, 'paused');

  const resumed = toggleProjectScheduleStatus({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    scheduleId: schedule.id,
    action: 'resume',
    user: OWNER_USER,
  });
  assert.equal(resumed.status, 'active');

  // Force schedule due in the past and simulate two concurrent workers racing to claim it
  const pastIso = new Date(Date.now() - 5 * 60_000).toISOString();
  updateWorkflowScheduleInDb({
    tenantId: TENANT_A,
    scheduleId: schedule.id,
    nextRunAt: pastIso,
  });

  const nowIso = new Date().toISOString();
  const claimedByWorkerA = claimDueSchedulesInDb({
    workerId: 'worker-alpha',
    nowIso,
    leaseDurationMs: 60_000,
    limit: 10,
  });
  const claimedByWorkerB = claimDueSchedulesInDb({
    workerId: 'worker-beta',
    nowIso,
    leaseDurationMs: 60_000,
    limit: 10,
  });

  assert.equal(claimedByWorkerA.some((s) => s.id === schedule.id), true);
  assert.equal(claimedByWorkerB.some((s) => s.id === schedule.id), false);

  // Clean up test schedule
  const deleted = deleteProjectSchedule({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    scheduleId: schedule.id,
    user: OWNER_USER,
  });
  assert.equal(deleted, true);
});

test('Stage 6 Integration: Expired worker lease reclamation & recovery record persistence', () => {
  // Create a lease that is already expired
  const leaseKey = `workflow:wf-abandoned-${crypto.randomUUID().slice(0, 6)}`;
  const acquired = acquireWorkerLeaseInDb({
    leaseKey,
    leaseKind: 'workflow',
    resourceId: 'wf-abandoned-1',
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    workerId: 'worker-crashed-node',
    leaseDurationMs: 1,
  });
  assert.equal(acquired, true);

  const futureNow = new Date(Date.now() + 60_000).toISOString();
  const reclaimed = reclaimExpiredWorkerLeasesInDb(futureNow);
  assert.ok(reclaimed.some((l) => l.leaseKey === leaseKey));

  // Verify scheduler tick + recovery routine runs cleanly and updates worker heartbeat
  const tick = runSchedulerTickNow({ workerId: 'worker-test-runner' });
  assert.equal(tick.workerId, 'worker-test-runner');

  const recovery = reclaimStaleLeasesAndRecover({ actor: 'Test Maintainer' });
  assert.equal(typeof recovery.reclaimedLeasesCount, 'number');
});

test('Stage 6 Integration: Event trigger idempotency & external signed webhook security (HMAC-SHA256, replay window, rate limit)', () => {
  // Allow sufficient concurrency for multi-dispatch webhook rate-limit verification
  updateProjectAutonomyPolicy({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    payload: {
      autonomyMode: 'automatic_low_risk',
      maxConcurrentWorkflows: 10,
      maxActiveAgentTasks: 30,
      maxWorkflowDurationMs: 600_000,
      maxTokensPerWorkflow: null,
      maxSpendMicrosPerRun: null,
      allowedTemplates: [],
      allowedAgents: [],
      requireApprovalForHighImpact: true,
      allowAutonomousRetries: true,
      allowExternalWebhooks: true,
      enabled: true,
    },
  });

  // 1. Domain event trigger with idempotency deduplication
  const domainSub = createTriggerSubscription({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    name: 'Crawl Completed Automation',
    triggerType: 'crawl_completed',
    targetKind: 'workflow_template',
    templateId: 'technical_performance_audit',
    rateLimitPerMinute: 10,
  });

  const firstDispatch = dispatchDomainTriggerEvent({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    triggerType: 'crawl_completed',
    idempotencyKey: 'crawl-evt-unique-001',
    payloadSummary: 'Crawl finished with 4 issues',
    payload: { crawlId: 'crawl-1' },
  });
  assert.equal(firstDispatch.length, 1);

  const duplicateDispatch = dispatchDomainTriggerEvent({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    triggerType: 'crawl_completed',
    idempotencyKey: 'crawl-evt-unique-001',
    payloadSummary: 'Crawl finished with 4 issues (duplicate)',
    payload: { crawlId: 'crawl-1' },
  });
  assert.equal(duplicateDispatch.length, 1);
  assert.equal(duplicateDispatch[0].status, 'deduplicated');

  // 2. Signed external webhook verification
  const webhookCreated = createTriggerSubscription({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    name: 'External CI Webhook',
    triggerType: 'external_webhook',
    targetKind: 'workflow_template',
    templateId: 'technical_performance_audit',
    rateLimitPerMinute: 4,
  });
  assert.ok(webhookCreated.webhookSigningSecret);
  const secret = webhookCreated.webhookSigningSecret!;
  const subId = webhookCreated.subscription.id;
  const rawBody = JSON.stringify({ event: 'deploy', commit: 'abc123' });
  const nowSec = Math.floor(Date.now() / 1000);

  // Invalid signature -> 401 (counts 1)
  const badSig = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: 'sha256=deadbeef',
    timestampHeader: String(nowSec),
    idempotencyKeyHeader: 'wh-bad-sig-1',
  });
  assert.equal(badSig.httpStatus, 401);
  assert.equal(badSig.accepted, false);

  // Expired timestamp (> 5 minutes old) -> 401 (counts 2)
  const oldTs = String(nowSec - 600);
  const staleSig = computeWebhookHmacSignature(secret, oldTs, rawBody);
  const staleRes = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: staleSig,
    timestampHeader: oldTs,
    idempotencyKeyHeader: 'wh-stale-1',
  });
  assert.equal(staleRes.httpStatus, 401);

  // Valid signature -> 202 (counts 3)
  const validTs = String(nowSec);
  const validSig = computeWebhookHmacSignature(secret, validTs, rawBody);
  const accepted = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: validSig,
    timestampHeader: validTs,
    idempotencyKeyHeader: 'wh-valid-1',
  });
  assert.equal(accepted.httpStatus, 202);
  assert.equal(accepted.accepted, true);

  // Same idempotency key -> 200 deduplicated (still 3 rows)
  const dedup = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: validSig,
    timestampHeader: validTs,
    idempotencyKeyHeader: 'wh-valid-1',
  });
  assert.equal(dedup.httpStatus, 200);
  assert.equal(dedup.deduplicated, true);

  // 4th unique event fills rate limit window -> 202 (counts 4)
  const fourth = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: validSig,
    timestampHeader: validTs,
    idempotencyKeyHeader: 'wh-valid-2',
  });
  assert.equal(fourth.httpStatus, 202);

  // 5th event exceeds rate limit (4/min) -> 429
  const rateLimited = handleInboundWebhookEvent({
    subscriptionId: subId,
    rawBody,
    signatureHeader: validSig,
    timestampHeader: validTs,
    idempotencyKeyHeader: 'wh-ratelimit-5',
  });
  assert.equal(rateLimited.httpStatus, 429);

  const events = listTriggerEventsInDb(TENANT_A, PROJECT_A, 50);
  assert.ok(events.some((e) => e.subscriptionId === domainSub.subscription.id));
});

test('Stage 6 Integration: Pause, resume, traceable replay, dead-letter resolution, policy audit & Stage 5 budget blocking', () => {
  // Clean up prior test workflows so tenant active-workflow limit (4) has room for lifecycle + replay tests
  getAuditDb()
    .prepare(`UPDATE agent_workflows SET status = 'cancelled' WHERE tenant_id = ? AND status IN ('queued', 'running', 'paused')`)
    .run(TENANT_A);

  // Launch a real workflow without auto-starting background timers so state transitions are deterministic
  const created = createAgentWorkflow({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    templateId: 'technical_performance_audit',
    name: 'Lifecycle Test Workflow',
    autoStart: false,
  });

  // Pause -> Resume -> Traceable Replay
  const paused = pauseAgentWorkflow({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    workflowId: created.workflow.id,
    user: OWNER_USER,
    reason: 'Operator inspection pause',
  });
  assert.equal(paused.workflow.status, 'paused');

  const resumed = resumeAgentWorkflow({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    workflowId: created.workflow.id,
    user: OWNER_USER,
    reason: 'Resuming after inspection',
  });
  assert.equal(resumed.workflow.status, 'running');

  const replayed = replayAgentWorkflow({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    workflowId: created.workflow.id,
    user: OWNER_USER,
    reason: 'Traceable replay test',
    autoStart: false,
  });
  assert.notEqual(replayed.workflow.id, created.workflow.id);
  const replayDetail = getAgentWorkflowDetailScoped(TENANT_A, PROJECT_A, replayed.workflow.id);
  assert.equal(
    replayDetail?.workflow.config?.replayedFromWorkflowId,
    created.workflow.id,
  );

  // Dead-letter record + operator resolution
  const firstTask = created.tasks[0];
  const dlq = upsertDeadLetterTaskInDb({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    workflowId: created.workflow.id,
    workflowName: created.workflow.name,
    taskId: firstTask.id,
    nodeKey: firstTask.nodeKey,
    agentId: firstTask.agentId,
    taskTitle: firstTask.title,
    errorClassification: 'non_retryable',
    errorCode: 'PROVIDER_UNAVAILABLE',
    errorMessage: 'PROVIDER_UNAVAILABLE: Missing API key',
    attemptCount: 1,
    maxRetries: 1,
  });
  assert.equal(dlq.status, 'open');

  const resolved = resolveDeadLetterTask({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    deadLetterId: dlq.id,
    user: OWNER_USER,
    reason: 'API key configured',
  });
  assert.equal(resolved.status, 'resolved');
  assert.ok(listDeadLetterTasksInDb(TENANT_A, PROJECT_A).some((d) => d.id === dlq.id));
  assert.ok(listRecoveryRecordsInDb(TENANT_A, PROJECT_A).length >= 2);

  // Update Autonomy Policy (QA rejected, Owner succeeds + writes audit trail)
  assert.throws(
    () =>
      updateProjectAutonomyPolicy({
        tenantId: TENANT_A,
        projectId: PROJECT_A,
        user: QA_USER,
        payload: {
          autonomyMode: 'restricted',
          maxConcurrentWorkflows: 1,
          maxActiveAgentTasks: 2,
          maxWorkflowDurationMs: 300_000,
          maxTokensPerWorkflow: null,
          maxSpendMicrosPerRun: null,
          allowedTemplates: [],
          allowedAgents: [],
          requireApprovalForHighImpact: true,
          allowAutonomousRetries: true,
          allowExternalWebhooks: false,
          enabled: true,
        },
      }),
    /FORBIDDEN/,
  );

  const updatedPolicy = updateProjectAutonomyPolicy({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    payload: {
      autonomyMode: 'restricted',
      maxConcurrentWorkflows: 2,
      maxActiveAgentTasks: 4,
      maxWorkflowDurationMs: 600_000,
      maxTokensPerWorkflow: 100_000,
      maxSpendMicrosPerRun: 500_000,
      allowedTemplates: ['technical_performance_audit'],
      allowedAgents: [],
      requireApprovalForHighImpact: true,
      allowAutonomousRetries: true,
      allowExternalWebhooks: true,
      enabled: true,
    },
  });
  assert.equal(updatedPolicy.autonomyMode, 'restricted');
  assert.ok(listOperationsPolicyAuditInDb(TENANT_A, PROJECT_A).length >= 1);

  // Stage 5 budget enforcement check: create a $0.00 block_new_runs budget and verify autonomous trigger is blocked
  updateProjectAutonomyPolicy({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    user: OWNER_USER,
    payload: {
      autonomyMode: 'automatic_low_risk',
      maxConcurrentWorkflows: 10,
      maxActiveAgentTasks: 20,
      maxWorkflowDurationMs: 600_000,
      maxTokensPerWorkflow: null,
      maxSpendMicrosPerRun: null,
      allowedTemplates: [],
      allowedAgents: [],
      requireApprovalForHighImpact: true,
      allowAutonomousRetries: true,
      allowExternalWebhooks: true,
      enabled: true,
    },
  });

  upsertBudgetConfigInDb({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    scopeType: 'project',
    scopeTargetId: PROJECT_A,
    agentId: null,
    name: 'Hard Zero Test Budget',
    periodType: 'monthly',
    budgetLimitMicros: 0,
    maxExecutionCostMicros: 0,
    maxTokensPerRun: 0,
    warningThresholdPct: 80,
    enforcementPolicy: 'pause_execution',
    enabled: true,
    updatedBy: OWNER_USER.name,
  });

  const blockedEvents = dispatchDomainTriggerEvent({
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    triggerType: 'crawl_completed',
    idempotencyKey: 'crawl-evt-budget-block-001',
    payloadSummary: 'Should be blocked by Stage 5 budget',
    payload: {},
  });
  assert.equal(blockedEvents.length, 1);
  assert.equal(blockedEvents[0].status, 'blocked_by_budget');
});
