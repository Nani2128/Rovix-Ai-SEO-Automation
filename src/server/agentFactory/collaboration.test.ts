import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';
import {
  agentDelegations,
  agentExecutions,
  agentMessages,
  agentOutputs,
  approvalStates,
  handoffs,
  tasks,
  workflowConflicts,
  workflowContextItems,
  workflowEdges,
  workflowNodes,
  workflows,
} from '../../db/agentWorkflowSchema';
import type { User } from '../../types/auth';
import { clearAgentFactoryBusForTests } from '../activity/activityBus';
import {
  createProjectRecord,
  getAuditDb,
  resetDbConnectionForTests,
  upsertKeywordBusinessProfile,
} from '../audit/db';
import {
  buildCollaborationMonitorPayload,
  requestIntelligentDelegation,
  resolveWorkflowConflict,
  runConflictDetectionForWorkflow,
  sendAgentMessage,
  writeWorkflowContextItem,
} from './collaborationService';
import { listWorkflowContextItems } from './collaborationDb';
import { upsertAgentConfigInDb } from './orchestrationDb';
import {
  createAgentWorkflow,
  getAgentWorkflowDetailScoped,
  waitForWorkflowToSettle,
} from './orchestrationEngine';

const TENANT_A = 'ten-stage3-a';
const TENANT_B = 'ten-stage3-b';
const PROJ_A = 'proj-stage3-a1';
const PROJ_B = 'proj-stage3-b1';

const OWNER_A: User = {
  id: 'usr-s3-owner',
  name: 'Elena Agency Owner',
  email: 'elena@alpha.example',
  role: 'Agency Owner',
  avatarInitials: 'EO',
  title: 'Agency Owner',
};

const QA_USER_A: User = {
  id: 'usr-s3-qa',
  name: 'Maya QA Reviewer',
  email: 'maya@alpha.example',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Reviewer',
};

describe('Stage 3 Multi-Agent Collaboration, Drizzle Models & SQLite Integration', () => {
  let tmpDir = '';
  let prevDbPath: string | undefined;
  let prevGeminiKey: string | undefined;

  before(() => {
    prevDbPath = process.env.ROVIX_DB_PATH;
    prevGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-stage3-'));
    process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-stage3.db');
    resetDbConnectionForTests();
    clearAgentFactoryBusForTests();

    const db = getAuditDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(TENANT_A, 'Stage3 Alpha', now, TENANT_B, 'Stage3 Beta', now);

    createProjectRecord({
      id: PROJ_A,
      tenantId: TENANT_A,
      name: 'Alpha Solar Roofing',
      website: 'https://alphasolar.example',
      targetMarkets: ['US'],
      owner: OWNER_A.name,
    });

    createProjectRecord({
      id: PROJ_B,
      tenantId: TENANT_B,
      name: 'Beta Plumbing Co',
      website: 'https://betaplumbing.example',
      targetMarkets: ['UK'],
      owner: 'Beta Owner',
    });

    upsertKeywordBusinessProfile({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvedNiche: 'Residential Solar & Roof Replacement',
      approvedServices: ['Solar Roof Installation', 'Battery Backup Systems'],
      targetAudience: 'Homeowners in Phoenix and Scottsdale',
      targetCountry: 'US',
      targetCity: 'Phoenix',
      targetLanguage: 'en',
      competitorUrls: ['https://sunpeakrival.example'],
      approvalStatus: 'approved',
      approvedBy: OWNER_A.name,
      approvedAt: now,
    });
  });

  after(() => {
    resetDbConnectionForTests();
    if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
    else process.env.ROVIX_DB_PATH = prevDbPath;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('defines typed Drizzle ORM tables matching the persistent SQLite schema', () => {
    assert.equal(getTableName(workflows), 'agent_workflows');
    assert.equal(getTableName(workflowNodes), 'agent_workflow_nodes');
    assert.equal(getTableName(workflowEdges), 'agent_workflow_edges');
    assert.equal(getTableName(tasks), 'agent_tasks');
    assert.equal(getTableName(agentExecutions), 'agent_executions');
    assert.equal(getTableName(agentOutputs), 'agent_outputs');
    assert.equal(getTableName(handoffs), 'agent_handoffs');
    assert.equal(getTableName(approvalStates), 'agent_approval_requests');
    assert.equal(getTableName(agentMessages), 'agent_messages');
    assert.equal(getTableName(workflowContextItems), 'workflow_context_items');
    assert.equal(getTableName(agentDelegations), 'agent_delegations');
    assert.equal(getTableName(workflowConflicts), 'workflow_conflicts');
  });

  it('executes Stage 3 competitor_research_collaboration end-to-end with real persisted messages, shared context, evidence trust, and governed delegation', async () => {
    const created = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      templateId: 'competitor_research_collaboration',
      name: 'Stage 3 Competitor Research Run',
      objective: 'Verify peer messaging, shared context, and intelligent delegation',
      user: OWNER_A,
      autoStart: true,
    });

    const settled = await waitForWorkflowToSettle(
      TENANT_A,
      created.workflow.id,
      15_000,
    );
    assert.ok(settled);
    assert.ok(
      settled.workflow.status === 'waiting_for_approval' ||
        settled.workflow.status === 'completed',
      `Unexpected workflow status: ${settled.workflow.status}`,
    );

    const monitor = buildCollaborationMonitorPayload({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
    });

    assert.ok(
      monitor.messages.length >= 2,
      `Expected >= 2 persisted peer messages, got ${monitor.messages.length}`,
    );
    assert.ok(
      monitor.contextItems.length >= 3,
      `Expected seeded + agent shared workflow context items, got ${monitor.contextItems.length}`,
    );
    assert.ok(
      monitor.evidenceSummary.outputsAudited >= 2,
      'Expected outputs audited for Evidence Trust',
    );
    assert.ok(
      monitor.evidenceSummary.verifiedFactsCount >= 1,
      'Expected verified facts recorded in Evidence Trust',
    );

    // Every persisted message must include required Stage 3 protocol fields
    for (const msg of monitor.messages) {
      assert.ok(msg.messageId);
      assert.equal(msg.workflowId, created.workflow.id);
      assert.ok(msg.executionId);
      assert.ok(msg.sourceAgentId);
      assert.ok(msg.destinationAgentId);
      assert.ok(msg.correlationId);
      assert.ok(msg.timestamp);
      assert.ok(Array.isArray(msg.evidenceReferences));
    }

    // Verify dynamic delegation also works cleanly via service API and preserves DAG validity
    const rootTask = settled.tasks.find((t) => t.agentId === 'research_agent');
    assert.ok(rootTask);
    const delegated = requestIntelligentDelegation({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
      parentTaskId: rootTask.id,
      sourceAgentId: 'research_agent',
      targetAgentId: 'technical_seo_agent',
      reason: 'Verify crawl indexability before approving competitor landing page plan',
      requestedObjective: 'Confirm indexable URL structure for solar roof service pages',
      evidenceReferences: ['https://alphasolar.example/'],
    });
    assert.equal(delegated.delegation.delegationDepth, 1);
    assert.equal(delegated.delegation.status, 'scheduled');
    assert.ok(delegated.delegatedTask);

    const updatedDetail = getAgentWorkflowDetailScoped(
      TENANT_A,
      PROJ_A,
      created.workflow.id,
    );
    assert.ok(
      updatedDetail?.tasks.some((t) => t.id === delegated.delegatedTask?.id),
      'Dynamically delegated task must be persisted in workflow tasks',
    );
  });

  it('protects approved shared workflow context from silent overwrite and enforces RBAC conflict resolution', () => {
    const created = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      templateId: 'technical_seo_collaboration',
      name: 'Context Protection & Conflict Test',
      objective: 'Verify approved baseline lock and RBAC resolution',
      user: OWNER_A,
      autoStart: false,
    });

    // Seeded approved business profile exists with isApprovedLock = true
    const beforeItems = listWorkflowContextItems({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
      contextScope: 'approved_business_profile',
    });
    const baseline = beforeItems.find(
      (c) => c.contextKey === 'business_profile' && c.isApprovedLock,
    );
    assert.ok(baseline, 'Expected approved locked business_profile baseline');

    // Non-orchestrator agent attempting to write to approved baseline must NOT overwrite it
    const writeResult = writeWorkflowContextItem({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
      contextScope: 'approved_business_profile',
      contextKey: 'business_profile',
      source: 'research_agent_proposal',
      sourceAgentId: 'research_agent',
      payload: { approvedServices: ['Commercial Wind Turbines'] },
      evidenceReferences: ['https://alphasolar.example/'],
    });

    assert.equal(writeResult.item.version, baseline.version + 1);
    assert.equal(writeResult.item.approvalStatus, 'proposed');
    assert.equal(writeResult.item.isApprovedLock, false);
    assert.equal(writeResult.item.conflictFlag, true);
    assert.ok(writeResult.conflictCreated, 'Expected approved_context_protection conflict');
    assert.equal(
      writeResult.conflictCreated.conflictType,
      'approved_context_protection',
    );

    // Verify original approved baseline is still untouched
    const afterItems = listWorkflowContextItems({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
      contextScope: 'approved_business_profile',
    });
    const preserved = afterItems.find((c) => c.id === baseline.id);
    assert.ok(preserved);
    assert.equal(preserved.isApprovedLock, true);
    assert.equal(preserved.approvalStatus, 'approved');

    // QA role MUST be blocked from resolving business-impacting conflict
    assert.throws(
      () =>
        resolveWorkflowConflict({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          conflictId: writeResult.conflictCreated!.id,
          selectedResolution: 'keep_a',
          resolutionNote: 'QA attempt',
          user: QA_USER_A,
        }),
      /FORBIDDEN/,
    );

    // Agency Owner resolves cleanly with audit note
    const resolved = resolveWorkflowConflict({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      conflictId: writeResult.conflictCreated.id,
      selectedResolution: 'keep_a',
      resolutionNote: 'Keep approved Residential Solar baseline; wind turbines are out of scope.',
      user: OWNER_A,
    });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.selectedResolution, 'keep_a');
    assert.equal(resolved.resolvedByName, OWNER_A.name);
    assert.equal(resolved.resolvedByRole, 'Agency Owner');

    // Run conflict detection scan idempotently
    const scanned = runConflictDetectionForWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
    });
    assert.ok(Array.isArray(scanned));
  });

  it('records failed message delivery when destination agent is disabled and enforces strict cross-tenant isolation', () => {
    const created = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      templateId: 'content_production_collaboration',
      name: 'Disabled Agent & Isolation Test',
      objective: 'Verify failed delivery recording and tenant isolation',
      user: OWNER_A,
      autoStart: false,
    });

    // Disable performance_analysis_agent in project A
    upsertAgentConfigInDb({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      agentId: 'performance_analysis_agent',
      enabled: false,
      maxRetries: 1,
      timeoutMs: 30_000,
      preferredModel: 'gemini-2.5-flash',
      updatedBy: OWNER_A.name,
    });

    const failedMsg = sendAgentMessage({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: created.workflow.id,
      executionId: 'exec-fail-test',
      sourceAgentId: 'technical_seo_agent',
      destinationAgentId: 'performance_analysis_agent',
      messageType: 'verification_request',
      payload: { summary: 'Check LCP regression on /solar-roof' },
      evidenceReferences: ['https://alphasolar.example/solar-roof'],
    });
    assert.equal(failedMsg.status, 'failed');
    assert.ok(failedMsg.errorSummary?.includes('disabled'));

    // Cross-tenant isolation: Tenant B cannot read Tenant A's project collaboration monitor or send messages to Tenant A's workflow
    assert.throws(
      () =>
        buildCollaborationMonitorPayload({
          tenantId: TENANT_B,
          projectId: PROJ_A,
        }),
      /NOT_FOUND/,
    );

    assert.throws(
      () =>
        sendAgentMessage({
          tenantId: TENANT_B,
          projectId: PROJ_B,
          workflowId: created.workflow.id,
          executionId: 'exec-xtenant',
          sourceAgentId: 'research_agent',
          destinationAgentId: 'keyword_intelligence_agent',
          messageType: 'evidence_share',
          payload: { summary: 'Unauthorized cross-tenant message' },
          evidenceReferences: [],
        }),
      /NOT_FOUND/,
    );
  });
});
