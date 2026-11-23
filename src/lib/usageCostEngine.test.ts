import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateAgentUsageRows,
  buildDailySpendSeries,
  calculateUsageCostMicros,
  computeTokenBatchCostMicros,
  evaluateBudgetsAgainstUsage,
  extractGeminiUsageMetadata,
  formatMicroUsd,
  isProviderQuotaError,
  reconcileWorkflowUsage,
  serializeUsageLedgerToCsv,
  serializeUsageLedgerToJson,
  usdToMicros,
} from './usageCostEngine';
import type {
  ProviderPricingVersionRecord,
  UsageBudgetConfigRecord,
  UsageLedgerRow,
} from '../types/usageIntelligence';

function makePricing(
  overrides: Partial<ProviderPricingVersionRecord> = {},
): ProviderPricingVersionRecord {
  return {
    id: 'prc-test-1',
    tenantId: null,
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputPricePer1mMicros: 300_000, // $0.30 / 1M
    outputPricePer1mMicros: 2_500_000, // $2.50 / 1M
    cachedInputPricePer1mMicros: 75_000, // $0.075 / 1M
    currency: 'USD',
    effectiveDate: '2025-06-17',
    sourceOfPricing: 'Google Gemini API Published Pricing',
    sourceType: 'official_provider_pricing',
    pricingVersion: 'v1.0-official',
    isActive: true,
    configuredBy: 'system',
    auditNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLedgerRow(overrides: {
  id: string;
  workflowId?: string | null;
  taskId?: string | null;
  agentId?: UsageLedgerRow['event']['agentId'];
  provider?: string;
  model?: string | null;
  requestTimestamp?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
  status?: UsageLedgerRow['event']['status'];
  isRetry?: boolean;
  attemptNumber?: number;
  latencyMs?: number | null;
  totalCostMicros?: number | null;
  costBasis?: UsageLedgerRow['cost']['costBasis'];
  unavailableReason?: string | null;
}): UsageLedgerRow {
  const ts = overrides.requestTimestamp ?? '2026-05-10T12:00:00.000Z';
  const agentId = overrides.agentId ?? 'content_generation_agent';
  return {
    event: {
      id: overrides.id,
      tenantId: 'tenant-1',
      projectId: 'proj-1',
      workflowId: overrides.workflowId === undefined ? 'wf-1' : overrides.workflowId,
      executionId: `exec-${overrides.id}`,
      taskId: overrides.taskId === undefined ? 'task-1' : overrides.taskId,
      agentId,
      provider: overrides.provider ?? 'google_gemini',
      model: overrides.model === undefined ? 'gemini-2.5-flash' : overrides.model,
      requestTimestamp: ts,
      inputTokens: overrides.inputTokens === undefined ? 10_000 : overrides.inputTokens,
      outputTokens: overrides.outputTokens === undefined ? 2_000 : overrides.outputTokens,
      cachedInputTokens: overrides.cachedInputTokens ?? 0,
      totalTokens: overrides.totalTokens === undefined ? 12_000 : overrides.totalTokens,
      providerRequestId: `req-${overrides.id}`,
      usageSource: 'provider_response',
      measurementStatus:
        overrides.inputTokens === null ? 'unavailable' : 'measured',
      latencyMs: overrides.latencyMs === undefined ? 1200 : overrides.latencyMs,
      status: overrides.status ?? 'succeeded',
      errorType: null,
      isQuotaError: false,
      isRetry: overrides.isRetry ?? false,
      attemptNumber: overrides.attemptNumber ?? 1,
      rawUsageMetadata: null,
      idempotencyKey: `idem-${overrides.id}`,
      createdAt: ts,
    },
    cost: {
      id: `cost-${overrides.id}`,
      usageEventId: overrides.id,
      tenantId: 'tenant-1',
      projectId: 'proj-1',
      workflowId: overrides.workflowId === undefined ? 'wf-1' : overrides.workflowId,
      agentId,
      pricingVersionId: 'prc-test-1',
      pricingVersionLabel: 'v1.0-official',
      pricingSourceLabel: 'Google Gemini API Published Pricing',
      costBasis: overrides.costBasis ?? 'calculated_actual_tokens',
      currency: 'USD',
      inputCostMicros: overrides.totalCostMicros === null ? null : 3_000,
      outputCostMicros: overrides.totalCostMicros === null ? null : 5_000,
      cachedInputCostMicros: 0,
      totalCostMicros:
        overrides.totalCostMicros === undefined ? 8_000 : overrides.totalCostMicros,
      unavailableReason: overrides.unavailableReason ?? null,
      calculatedAt: ts,
    },
  };
}

test('extractGeminiUsageMetadata parses real provider fields including cached tokens and never guesses missing usage', () => {
  const full = extractGeminiUsageMetadata({
    promptTokenCount: 15_000,
    candidatesTokenCount: 3_200,
    cachedContentTokenCount: 5_000,
    totalTokenCount: 18_200,
  });
  assert.equal(full.inputTokens, 15_000);
  assert.equal(full.outputTokens, 3_200);
  assert.equal(full.cachedInputTokens, 5_000);
  assert.equal(full.totalTokens, 18_200);
  assert.equal(full.usageSource, 'provider_response');
  assert.equal(full.measurementStatus, 'measured');

  const missing = extractGeminiUsageMetadata(undefined);
  assert.equal(missing.inputTokens, null);
  assert.equal(missing.outputTokens, null);
  assert.equal(missing.totalTokens, null);
  assert.equal(missing.usageSource, 'unavailable');
  assert.equal(missing.measurementStatus, 'unavailable');

  const partial = extractGeminiUsageMetadata(
    { promptTokenCount: 1_200 },
    'provider_count_tokens_api',
  );
  assert.equal(partial.inputTokens, 1_200);
  assert.equal(partial.outputTokens, null);
  assert.equal(partial.measurementStatus, 'partial');
  assert.equal(partial.usageSource, 'provider_count_tokens_api');
});

test('calculateUsageCostMicros uses exact integer BigInt arithmetic with zero floating-point drift and separates cached tokens', () => {
  // 100,000 prompt tokens (40,000 cached + 60,000 regular) at $0.30/1M regular & $0.075/1M cached
  // Regular input: 60,000 * 300,000 / 1,000,000 = 18,000 micros ($0.0180)
  // Cached input:  40,000 *  75,000 / 1,000,000 =  3,000 micros ($0.0030)
  // Output:        20,000 * 2,500,000 / 1,000,000 = 50,000 micros ($0.0500)
  // Total = 71,000 micros ($0.0710 exact)
  const cost = calculateUsageCostMicros({
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 100_000,
    outputTokens: 20_000,
    cachedInputTokens: 40_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing: makePricing(),
  });
  assert.equal(cost.costBasis, 'calculated_actual_tokens');
  assert.equal(cost.inputCostMicros, 18_000);
  assert.equal(cost.cachedInputCostMicros, 3_000);
  assert.equal(cost.outputCostMicros, 50_000);
  assert.equal(cost.totalCostMicros, 71_000);
  assert.equal(formatMicroUsd(cost.totalCostMicros), '$0.0710');

  // Verify small batch rounding without float drift: 1,000 tokens * $0.30/1M = 300 micros ($0.0003)
  assert.equal(computeTokenBatchCostMicros(1_000, 300_000), 300);
  assert.equal(usdToMicros(0.3), 300_000);
});

test('calculateUsageCostMicros marks cost unavailable when pricing or token usage is missing and distinguishes internal non-billed', () => {
  const unpriced = calculateUsageCostMicros({
    provider: 'google_gemini',
    model: 'gemini-4-hydrogen',
    inputTokens: 5_000,
    outputTokens: 1_000,
    cachedInputTokens: 0,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing: makePricing({
      model: 'gemini-4-hydrogen',
      inputPricePer1mMicros: null,
      outputPricePer1mMicros: null,
      sourceType: 'unconfigured',
    }),
  });
  assert.equal(unpriced.costBasis, 'unavailable');
  assert.equal(unpriced.totalCostMicros, null);
  assert.ok(unpriced.unavailableReason?.includes('No active pricing rate configured'));

  const missingTokens = calculateUsageCostMicros({
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    usageSource: 'unavailable',
    measurementStatus: 'unavailable',
    pricing: makePricing(),
  });
  assert.equal(missingTokens.costBasis, 'unavailable');
  assert.equal(missingTokens.totalCostMicros, null);

  const internal = calculateUsageCostMicros({
    provider: 'rovix_backend_service',
    model: null,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    usageSource: 'internal_service',
    measurementStatus: 'unavailable',
    pricing: makePricing({
      provider: 'rovix_backend_service',
      model: '*',
      inputPricePer1mMicros: 0,
      outputPricePer1mMicros: 0,
      sourceType: 'internal_non_billed',
    }),
  });
  assert.equal(internal.costBasis, 'internal_non_billed');
  assert.equal(internal.totalCostMicros, 0);
});

test('reconcileWorkflowUsage prevents double-counting duplicates and isolates retry, failed, and unavailable costs', () => {
  const row1 = makeLedgerRow({
    id: 'ev-1',
    agentId: 'content_generation_agent',
    taskId: 'task-gen',
    totalCostMicros: 12_000,
    totalTokens: 15_000,
    attemptNumber: 1,
    isRetry: false,
    status: 'failed',
  });
  const row1Duplicate = makeLedgerRow({
    id: 'ev-1', // same ID — must NEVER double count!
    agentId: 'content_generation_agent',
    taskId: 'task-gen',
    totalCostMicros: 12_000,
    totalTokens: 15_000,
  });
  const row2Retry = makeLedgerRow({
    id: 'ev-2',
    agentId: 'content_generation_agent',
    taskId: 'task-gen',
    totalCostMicros: 14_000,
    totalTokens: 18_000,
    attemptNumber: 2,
    isRetry: true,
    status: 'succeeded',
  });
  const row3Unavailable = makeLedgerRow({
    id: 'ev-3',
    agentId: 'research_agent',
    taskId: 'task-res',
    provider: 'google_gemini',
    model: 'gemini-4-hydrogen',
    totalCostMicros: null,
    costBasis: 'unavailable',
    unavailableReason: 'No active pricing rate configured for google_gemini / gemini-4-hydrogen.',
  });

  const result = reconcileWorkflowUsage({
    workflowId: 'wf-1',
    workflowName: 'SEO Content Pipeline',
    templateId: 'seo_content_pipeline',
    status: 'completed',
    createdAt: '2026-05-10T12:00:00.000Z',
    completedAt: '2026-05-10T12:01:30.000Z',
    rows: [row1, row1Duplicate, row2Retry, row3Unavailable],
  });

  assert.equal(result.summary.uniqueEventCount, 3);
  assert.equal(result.summary.measuredCostMicros, 26_000);
  assert.equal(result.summary.retryCostMicros, 14_000);
  assert.equal(result.summary.failedExecutionCostMicros, 12_000);
  assert.equal(result.summary.retryRequests, 1);
  assert.equal(result.summary.failedRequests, 1);
  assert.equal(result.summary.unavailableCostEventCount, 1);
  assert.equal(result.summary.isReconciled, true);
  assert.equal(result.summary.discrepancyMicros, 0);
  assert.equal(result.summary.durationMs, 90_000);
  assert.equal(result.reconciliation.unavailableComponents.length, 1);
});

test('evaluateBudgetsAgainstUsage enforces warn_only, pause_execution, and require_approval accurately', () => {
  const now = new Date('2026-05-10T15:00:00.000Z');
  const rows = [
    makeLedgerRow({
      id: 'b-1',
      requestTimestamp: '2026-05-10T10:00:00.000Z',
      totalCostMicros: 850_000, // $0.85 spent today
      totalTokens: 120_000,
    }),
  ];

  const warnBudget: UsageBudgetConfigRecord = {
    id: 'bdg-warn',
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    scopeType: 'project',
    scopeTargetId: null,
    agentId: null,
    name: 'Daily Warning Cap',
    periodType: 'daily',
    budgetLimitMicros: 1_000_000, // $1.00
    maxExecutionCostMicros: null,
    maxTokensPerRun: null,
    warningThresholdPct: 80,
    enforcementPolicy: 'warn_only',
    enabled: true,
    updatedBy: 'Simon',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  const warnEval = evaluateBudgetsAgainstUsage({
    budgets: [warnBudget],
    rows,
    now,
  });
  assert.equal(warnEval.evaluations[0].status, 'warning');
  assert.equal(warnEval.evaluations[0].remainingMicros, 150_000);
  assert.equal(warnEval.blockingAction, 'warn');
  assert.equal(warnEval.triggeredAlerts.length, 1);
  assert.equal(warnEval.triggeredAlerts[0].alertType, 'warning');

  const pauseBudget: UsageBudgetConfigRecord = {
    ...warnBudget,
    id: 'bdg-pause',
    name: 'Daily Hard Stop',
    budgetLimitMicros: 500_000, // $0.50 (already exceeded by $0.85)
    enforcementPolicy: 'pause_execution',
  };

  const pauseEval = evaluateBudgetsAgainstUsage({
    budgets: [pauseBudget],
    rows,
    now,
  });
  assert.equal(pauseEval.evaluations[0].status, 'limit_reached');
  assert.equal(pauseEval.blockingAction, 'pause_execution');
  assert.equal(pauseEval.triggeredAlerts[0].alertType, 'paused');

  const approvalBudget: UsageBudgetConfigRecord = {
    ...warnBudget,
    id: 'bdg-appr',
    name: 'Token Cap Approval',
    budgetLimitMicros: null,
    maxTokensPerRun: 100_000, // exceeded by 120,000
    enforcementPolicy: 'require_approval',
  };

  const apprEval = evaluateBudgetsAgainstUsage({
    budgets: [approvalBudget],
    rows,
    now,
  });
  assert.equal(apprEval.blockingAction, 'require_approval');
  assert.equal(apprEval.triggeredAlerts[0].alertType, 'approval_required');
});

test('CSV and JSON exports escape formula injection and preserve full provenance', () => {
  const row = makeLedgerRow({
    id: 'ev-csv-1',
    model: '=CMD|evil',
    totalCostMicros: 25_000,
    totalTokens: 12_000,
  });
  const csv = serializeUsageLedgerToCsv([row]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('cost_basis'));
  assert.ok(lines[1].includes("'=CMD|evil"), 'Must neutralize leading = formula injection');
  assert.ok(lines[1].includes('0.025000'));

  const jsonStr = serializeUsageLedgerToJson({
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    exportedAt: '2026-05-10T12:00:00.000Z',
    rows: [row],
  });
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.recordCount, 1);
  assert.equal(parsed.summary.totalMeasuredCostMicros, 25_000);
  assert.equal(parsed.summary.totalTokens, 12_000);
});

test('aggregateAgentUsageRows, buildDailySpendSeries, and isProviderQuotaError work accurately', () => {
  const rows = [
    makeLedgerRow({ id: 'a1', requestTimestamp: '2026-05-09T09:00:00.000Z', totalCostMicros: 10_000 }),
    makeLedgerRow({ id: 'a2', requestTimestamp: '2026-05-10T10:00:00.000Z', totalCostMicros: 20_000 }),
  ];
  const agents = aggregateAgentUsageRows({
    rows,
    agentCatalog: [{ agentId: 'content_generation_agent', name: 'Content Generation Agent' }],
  });
  assert.equal(agents[0].totalRequests, 2);
  assert.equal(agents[0].measuredCostMicros, 30_000);
  assert.equal(agents[0].avgCostPerExecutionMicros, 15_000);

  const daily = buildDailySpendSeries(rows);
  assert.equal(daily.length, 2);
  assert.equal(daily[0].date, '2026-05-09');
  assert.equal(daily[1].measuredCostMicros, 20_000);

  assert.equal(isProviderQuotaError('RESOURCE_EXHAUSTED: 429 quota exceeded'), true);
  assert.equal(isProviderQuotaError('NETWORK_TIMEOUT'), false);
});
