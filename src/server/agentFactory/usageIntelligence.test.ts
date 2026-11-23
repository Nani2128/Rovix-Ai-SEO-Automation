import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getAuditDb } from '../audit/db';
import type { User } from '../../types/auth';
import {
  acknowledgeWorkspaceBudgetAlert,
  buildUsageAnalyticsDashboard,
  createWorkspacePricingVersion,
  enforceBudgetsBeforeWorkflowLaunch,
  exportProjectUsageLedger,
  getPerAgentStationUsageSummaryMap,
  getWorkflowCostDetail,
  listUsageLedgerForProject,
  reconcileAndPersistWorkflowUsage,
  recordAgentExecutionUsage,
  removeWorkspaceUsageBudget,
  upsertWorkspaceUsageBudget,
} from './usageIntelligenceService';
import {
  createAgentWorkflow,
  setOrchestrationTestHooksForTests,
  waitForWorkflowToSettle,
} from './orchestrationEngine';
import { listPricingVersionsInDb } from './usageIntelligenceDb';

const OWNER_USER: User = {
  id: 'usr-stage5-owner',
  email: 'owner.stage5@rovixai.com',
  name: 'Simon Owner',
  role: 'Agency Owner',
  avatarInitials: 'SO',
  title: 'Agency Owner',
};

const QA_USER: User = {
  id: 'usr-stage5-qa',
  email: 'qa.stage5@rovixai.com',
  name: 'Maya QA',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Engineer',
};

function getPrimaryTenantAndProject(): { tenantId: string; projectId: string } {
  const db = getAuditDb();
  const projectRow = db
    .prepare('SELECT id, tenant_id FROM projects ORDER BY created_at ASC LIMIT 1')
    .get() as { id: string; tenant_id: string } | undefined;
  assert.ok(projectRow, 'Expected at least one seeded project in SQLite DB');
  return { tenantId: projectRow.tenant_id, projectId: projectRow.id };
}

test('Stage 5 migration 010 creates tables and seeds honest pricing versions (official GA + unconfigured preview)', () => {
  const db = getAuditDb();
  const mig = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('010_stage5_usage_cost_intelligence') as { version: string } | undefined;
  assert.equal(mig?.version, '010_stage5_usage_cost_intelligence');

  const { tenantId } = getPrimaryTenantAndProject();
  const versions = listPricingVersionsInDb(tenantId);
  const flash25 = versions.find((v) => v.model === 'gemini-2.5-flash');
  assert.ok(flash25, 'Should include official gemini-2.5-flash pricing');
  assert.equal(flash25.sourceType, 'official_provider_pricing');
  assert.equal(flash25.inputPricePer1mMicros, 300_000);

  const hydrogen = versions.find(
    (v) => v.model === 'gemini-4-hydrogen' && v.tenantId === null,
  );
  assert.ok(hydrogen, 'Should include transparent unconfigured record for gemini-4-hydrogen');
  assert.equal(hydrogen.sourceType, 'unconfigured');
  assert.equal(hydrogen.inputPricePer1mMicros, null);
});

test('Stage 5 usage persistence is strictly idempotent and tracks retries separately without double-billing', () => {
  const { tenantId, projectId } = getPrimaryTenantAndProject();
  const runTag = crypto.randomUUID().slice(0, 8);
  const idem1 = `test-idem-${runTag}-attempt1`;
  const idem2 = `test-idem-${runTag}-attempt2`;

  const first = recordAgentExecutionUsage({
    tenantId,
    projectId,
    workflowId: `wf-idem-${runTag}`,
    executionId: `exec-${runTag}-1`,
    taskId: `task-${runTag}`,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 10_000,
    outputTokens: 2_000,
    cachedInputTokens: 0,
    totalTokens: 12_000,
    providerRequestId: `req-${runTag}-1`,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    latencyMs: 950,
    status: 'failed',
    errorType: 'TRANSIENT_ERROR',
    isRetry: false,
    attemptNumber: 1,
    idempotencyKey: idem1,
  });
  assert.equal(first.deduplicated, false);
  // 10k * 0.30/1M = 3000 micros; 2k * 2.50/1M = 5000 micros => 8000 micros
  assert.equal(first.row.cost.totalCostMicros, 8_000);

  // Duplicate callback with same idempotencyKey MUST deduplicate and NOT create a second row
  const dup = recordAgentExecutionUsage({
    tenantId,
    projectId,
    workflowId: `wf-idem-${runTag}`,
    executionId: `exec-${runTag}-1`,
    taskId: `task-${runTag}`,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 10_000,
    outputTokens: 2_000,
    totalTokens: 12_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    status: 'failed',
    attemptNumber: 1,
    idempotencyKey: idem1,
  });
  assert.equal(dup.deduplicated, true);
  assert.equal(dup.row.event.id, first.row.event.id);

  // Retry attempt with distinct idempotencyKey IS recorded separately
  const retry = recordAgentExecutionUsage({
    tenantId,
    projectId,
    workflowId: `wf-idem-${runTag}`,
    executionId: `exec-${runTag}-2`,
    taskId: `task-${runTag}`,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 10_000,
    outputTokens: 4_000,
    cachedInputTokens: 2_000,
    totalTokens: 14_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    latencyMs: 1100,
    status: 'succeeded',
    isRetry: true,
    attemptNumber: 2,
    idempotencyKey: idem2,
  });
  assert.equal(retry.deduplicated, false);
  assert.equal(retry.row.event.isRetry, true);

  const ledger = listUsageLedgerForProject(tenantId, projectId, {
    workflowId: `wf-idem-${runTag}`,
  });
  assert.equal(ledger.length, 2, 'Exactly 2 immutable records (attempt 1 + retry attempt 2)');
});

test('Stage 5 pricing version updates are append-only and preserve historical event cost provenance', () => {
  const { projectId } = getPrimaryTenantAndProject();
  const isolatedTenant = `tenant-price-${crypto.randomUUID().slice(0, 8)}`;

  // 1. Create v1 pricing for custom model ($1.00/1M in, $2.00/1M out)
  const v1 = createWorkspacePricingVersion({
    tenantId: isolatedTenant,
    user: OWNER_USER,
    provider: 'google_gemini',
    model: 'gemini-custom-test',
    inputPricePer1mMicros: 1_000_000,
    outputPricePer1mMicros: 2_000_000,
    sourceOfPricing: 'Contract Rate v1',
    pricingVersion: 'v1.0-contract',
  });

  const ev1 = recordAgentExecutionUsage({
    tenantId: isolatedTenant,
    projectId,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-custom-test',
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    totalTokens: 1_500_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    status: 'succeeded',
    idempotencyKey: `prc-hist-${isolatedTenant}-1`,
  });
  assert.equal(ev1.row.cost.totalCostMicros, 2_000_000); // $1 + $1 = $2.00
  assert.equal(ev1.row.cost.pricingVersionId, v1.id);

  // 2. Append v2 pricing ($2.00/1M in, $4.00/1M out)
  const v2 = createWorkspacePricingVersion({
    tenantId: isolatedTenant,
    user: OWNER_USER,
    provider: 'google_gemini',
    model: 'gemini-custom-test',
    inputPricePer1mMicros: 2_000_000,
    outputPricePer1mMicros: 4_000_000,
    sourceOfPricing: 'Contract Rate v2',
    pricingVersion: 'v2.0-contract',
  });

  const ev2 = recordAgentExecutionUsage({
    tenantId: isolatedTenant,
    projectId,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-custom-test',
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    totalTokens: 1_500_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    status: 'succeeded',
    idempotencyKey: `prc-hist-${isolatedTenant}-2`,
  });
  assert.equal(ev2.row.cost.totalCostMicros, 4_000_000); // $2 + $2 = $4.00
  assert.equal(ev2.row.cost.pricingVersionId, v2.id);

  // Historical event 1 MUST remain bound to v1 and $2.00
  const allVersions = listPricingVersionsInDb(isolatedTenant).filter(
    (v) => v.model === 'gemini-custom-test',
  );
  assert.equal(allVersions.length, 2);
  assert.equal(allVersions.find((v) => v.id === v1.id)?.isActive, false);
  assert.equal(allVersions.find((v) => v.id === v2.id)?.isActive, true);
});

test('Stage 5 RBAC blocks non-governance roles from pricing/budget mutations and enforces tenant isolation', () => {
  const { tenantId, projectId } = getPrimaryTenantAndProject();

  assert.throws(
    () =>
      createWorkspacePricingVersion({
        tenantId,
        user: QA_USER,
        provider: 'google_gemini',
        model: 'gemini-4-hydrogen',
        inputPricePer1mMicros: 500_000,
        outputPricePer1mMicros: 1_500_000,
        sourceOfPricing: 'Unauthorized attempt',
      }),
    /FORBIDDEN:/,
  );

  assert.throws(
    () =>
      upsertWorkspaceUsageBudget({
        tenantId,
        projectId,
        user: QA_USER,
        scopeType: 'project',
        name: 'Unauthorized Budget',
        periodType: 'daily',
        budgetLimitMicros: 5_000_000,
        warningThresholdPct: 80,
        enforcementPolicy: 'warn_only',
        enabled: true,
      }),
    /FORBIDDEN:/,
  );

  // Tenant isolation check: events in isolatedTenant must NOT appear in primary tenant dashboard
  const isolatedTenant = `tenant-iso-${crypto.randomUUID().slice(0, 8)}`;
  recordAgentExecutionUsage({
    tenantId: isolatedTenant,
    projectId,
    agentId: 'content_generation_agent',
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 99_999,
    outputTokens: 11_111,
    totalTokens: 111_110,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    status: 'succeeded',
    idempotencyKey: `iso-ev-${isolatedTenant}`,
  });

  const primaryLedger = listUsageLedgerForProject(tenantId, projectId, { limit: 2000 });
  assert.equal(
    primaryLedger.some((r) => r.event.idempotencyKey === `iso-ev-${isolatedTenant}`),
    false,
    'Cross-tenant usage events must never leak into another tenant ledger',
  );
});

test('Stage 5 real workflow execution records usage, reconciles workflow cost, enforces pause_execution budget, and exports CSV/JSON', async () => {
  const { tenantId, projectId } = getPrimaryTenantAndProject();
  const tag = crypto.randomUUID().slice(0, 8);

  // Use test hook for content_generation_agent with deterministic Gemini 2.5 Flash tokens
  setOrchestrationTestHooksForTests({
    llmGenerator: async (input) => ({
      provider: 'google_gemini',
      model: 'gemini-2.5-flash',
      inputTokens: 20_000,
      outputTokens: 4_000,
      cachedInputTokens: 4_000,
      totalTokens: 24_000,
      providerRequestId: `resp-${tag}`,
      latencyMs: 640,
      usageSource: 'provider_response',
      measurementStatus: 'measured',
      rawUsageMetadata: {
        promptTokenCount: 20_000,
        candidatesTokenCount: 4_000,
        cachedContentTokenCount: 4_000,
        totalTokenCount: 24_000,
      },
      draft: {
        aiDraftLabel: 'AI-Generated Draft (Pending Human Review — Auto-Publish Disabled)',
        autoPublishPermitted: false,
        targetKeyword: input.targetKeyword,
        seoTitle: `${input.targetKeyword} Enterprise SEO Guide`,
        metaDescription: `Evidence-backed guide for ${input.targetKeyword}.`,
        h1: `${input.targetKeyword} Guide`,
        outline: ['Overview', 'Implementation', 'FAQ'],
        fullContentDraft:
          `${input.targetKeyword} requires structured technical audits, crawl verification, clean internal linking, and consistent evidence validation across all approved landing pages. `.repeat(
            6,
          ),
        faqSuggestions: [
          { question: 'How is this verified?', answer: 'Against real crawl inventory.' },
        ],
        internalLinkingSuggestions: [
          {
            anchorText: 'Homepage',
            targetUrl: input.internalProjectUrls[0] ?? `https://${input.projectWebsite}/`,
            rationale: 'Primary entry URL',
          },
        ],
        schemaRecommendations: ['Article', 'FAQPage'],
        sourcedFacts: [`Verified project domain ${input.projectWebsite}`],
        aiGeneratedSuggestions: ['Add comparison checklist'],
        supportingEvidenceReferences: input.supportingEvidence.map((e) => e.sourceUrl),
      },
    }),
  });

  let createdBudgetId: string | null = null;
  try {
    const wf = createAgentWorkflow({
      tenantId,
      projectId,
      user: OWNER_USER,
      templateId: 'custom_dag',
      name: `Stage 5 Usage Verification ${tag}`,
      objective: 'Verify Stage 5 token and cost accounting end-to-end',
      config: { targetKeyword: 'enterprise technical seo' },
      nodes: [
        {
          nodeKey: 'strategy',
          agentId: 'content_strategy_agent',
          title: 'Content Strategy Brief',
          approvalRequired: false,
        },
        {
          nodeKey: 'draft',
          agentId: 'content_generation_agent',
          title: 'AI Draft Generation',
          approvalRequired: false,
        },
      ],
      edges: [{ fromNodeKey: 'strategy', toNodeKey: 'draft' }],
      autoStart: true,
    });

    await waitForWorkflowToSettle(tenantId, wf.workflow.id, 15_000);

    const recon = reconcileAndPersistWorkflowUsage(tenantId, projectId, wf.workflow.id);
    assert.ok(recon, 'Reconciliation record should exist');
    assert.equal(recon.isReconciled, true);
    assert.equal(recon.discrepancyMicros, 0);

    const wfDetail = getWorkflowCostDetail(tenantId, projectId, wf.workflow.id);
    assert.equal(wfDetail.summary.totalTokens, 24_000);
    // Regular input: 16,000 * 0.30/1M = 4,800; Cached: 4,000 * 0.075/1M = 300; Output: 4,000 * 2.50/1M = 10,000 => 15,100 micros
    assert.equal(wfDetail.summary.measuredCostMicros, 15_100);
    assert.equal(wfDetail.summary.isReconciled, true);

    // Station usage summary map for 3D Factory & Inspector
    const stationMap = getPerAgentStationUsageSummaryMap(tenantId, projectId);
    const contentGenTelemetry = stationMap.get('content_generation_agent');
    assert.ok(contentGenTelemetry);
    assert.ok(contentGenTelemetry.totalTokens >= 24_000);
    assert.ok((contentGenTelemetry.measuredCostMicros ?? 0) >= 15_100);

    // Dashboard & Exports
    const dashboard = buildUsageAnalyticsDashboard({
      tenantId,
      projectId,
      userRole: OWNER_USER.role,
    });
    assert.ok(dashboard.overview.totalTokens >= 24_000);
    assert.ok(dashboard.overview.totalMeasuredCostMicros >= 15_100);
    assert.equal(dashboard.canManagePricingAndBudgets, true);

    const csvExport = exportProjectUsageLedger({
      tenantId,
      projectId,
      format: 'csv',
      filters: { workflowId: wf.workflow.id },
    });
    assert.ok(csvExport.content.includes('gemini-2.5-flash'));
    assert.ok(csvExport.content.includes('0.015100'));

    const jsonExport = exportProjectUsageLedger({
      tenantId,
      projectId,
      format: 'json',
      filters: { workflowId: wf.workflow.id },
    });
    const parsedExport = JSON.parse(jsonExport.content);
    assert.equal(parsedExport.summary.totalMeasuredCostMicros, 15_100);

    // Budget enforcement test: set daily pause_execution cap BELOW current spend ($0.001 = 1,000 micros)
    const budget = upsertWorkspaceUsageBudget({
      tenantId,
      projectId,
      user: OWNER_USER,
      scopeType: 'project',
      name: `Strict Daily Pause ${tag}`,
      periodType: 'daily',
      budgetLimitMicros: 1_000,
      warningThresholdPct: 80,
      enforcementPolicy: 'pause_execution',
      enabled: true,
    });
    createdBudgetId = budget.id;

    const check = enforceBudgetsBeforeWorkflowLaunch({
      tenantId,
      projectId,
      targetAgentIds: ['content_generation_agent'],
    });
    assert.equal(check.allowed, false);
    assert.equal(check.blockingAction, 'pause_execution');
    assert.ok(check.alertsRecorded.length >= 1);

    // Acknowledge the generated alert
    const acked = acknowledgeWorkspaceBudgetAlert({
      tenantId,
      alertId: check.alertsRecorded[0].id,
      user: OWNER_USER,
    });
    assert.ok(acked.acknowledgedBy?.includes('Simon Owner'));

    // Launching a new workflow MUST fail with BUDGET_EXCEEDED
    assert.throws(
      () =>
        createAgentWorkflow({
          tenantId,
          projectId,
          user: OWNER_USER,
          templateId: 'custom_dag',
          name: 'Should Be Blocked By Budget',
          nodes: [
            {
              nodeKey: 'strategy',
              agentId: 'content_strategy_agent',
              title: 'Blocked Strategy',
            },
          ],
          edges: [],
          autoStart: true,
        }),
      /BUDGET_EXCEEDED:/,
    );
  } finally {
    setOrchestrationTestHooksForTests(null);
    if (createdBudgetId) {
      removeWorkspaceUsageBudget({
        tenantId,
        budgetId: createdBudgetId,
        user: OWNER_USER,
      });
    }
  }
});
