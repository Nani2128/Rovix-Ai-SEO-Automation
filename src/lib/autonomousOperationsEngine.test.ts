import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyExecutionError,
  computeBackoffWithJitterMs,
  computeMissedScheduleRuns,
  computeNextScheduledRunAt,
  DEFAULT_HIGH_IMPACT_ACTIONS,
  evaluateAutonomyPolicy,
  isValidIanaTimezone,
  isWithinExecutionWindow,
  validateScheduleInput,
} from './autonomousOperationsEngine';
import {
  calculateTieredTokenCostMicros,
  GEMINI_STANDARD_PRICING_TIERS,
  resolveEffectivePricingTier,
} from './usageCostEngine';
import type { AutonomyPolicyRecord } from '../types/autonomousOperations';
import type { ProviderPricingVersionRecord } from '../types/usageIntelligence';

function makeOfficialGeminiPricing(model: string): ProviderPricingVersionRecord {
  return {
    id: `pv-${model}`,
    tenantId: 'tenant-1',
    provider: 'google_gemini',
    model,
    inputPricePer1mMicros: model === 'gemini-2.5-pro' ? 1_250_000 : 300_000,
    outputPricePer1mMicros: model === 'gemini-2.5-pro' ? 10_000_000 : 2_500_000,
    cachedInputPricePer1mMicros: model === 'gemini-2.5-pro' ? 312_500 : 75_000,
    currency: 'USD',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    sourceOfPricing: 'Google Gemini Official GA Pricing',
    sourceType: 'official_provider_pricing',
    pricingVersion: 'v1.0',
    isActive: true,
    configuredBy: 'System',
    auditNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeBasePolicy(overrides?: Partial<AutonomyPolicyRecord>): AutonomyPolicyRecord {
  return {
    id: 'pol-1',
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    name: 'Default Policy',
    autonomyMode: 'automatic_low_risk',
    maxConcurrentWorkflows: 3,
    maxActiveAgentTasks: 6,
    maxWorkflowDurationMs: 900_000,
    maxTokensPerWorkflow: 250_000,
    maxSpendMicrosPerRun: 2_000_000,
    allowedTemplates: [],
    allowedAgents: [],
    requireApprovalForHighImpact: true,
    highImpactActionTypes: [...DEFAULT_HIGH_IMPACT_ACTIONS],
    allowAutonomousRetries: true,
    allowExternalWebhooks: true,
    enabled: true,
    updatedBy: 'Admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('Part 1: Gemini 2.5 Pro switches context tiers at >200k tokens with exact BigInt micro-USD math', () => {
  const pricing = makeOfficialGeminiPricing('gemini-2.5-pro');

  // Tier 1: <= 200,000 input tokens
  // 100,000 input (20,000 cached, 80,000 regular) + 10,000 output
  // Regular input: 80,000 * 1,250,000 / 1,000,000 = 100,000 micros ($0.10)
  // Cached input: 20,000 * 312,500 / 1,000,000 = 6,250 micros ($0.00625)
  // Output: 10,000 * 10,000,000 / 1,000,000 = 100,000 micros ($0.10)
  // Total = 206,250 micros ($0.20625)
  const standardTier = calculateTieredTokenCostMicros({
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
    inputTokens: 100_000,
    outputTokens: 10_000,
    cachedInputTokens: 20_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing,
  });

  assert.equal(standardTier.appliedTierId, 'prompts_up_to_200k');
  assert.equal(standardTier.regularInputTokensBilled, 80_000);
  assert.equal(standardTier.cachedInputTokensBilled, 20_000);
  assert.equal(standardTier.inputCostMicros, 100_000);
  assert.equal(standardTier.cachedInputCostMicros, 6_250);
  assert.equal(standardTier.outputCostMicros, 100_000);
  assert.equal(standardTier.totalCostMicros, 206_250);
  assert.equal(standardTier.costBasis, 'calculated_actual_tokens');

  // Tier 2: > 200,000 input tokens (250,000 total, 50,000 cached, 200,000 regular; 10,000 output)
  // Regular input: 200,000 * 2,500,000 / 1,000,000 = 500,000 micros
  // Cached input: 50,000 * 625,000 / 1,000,000 = 31,250 micros
  // Output: 10,000 * 15,000,000 / 1,000,000 = 150,000 micros
  // Total = 681,250 micros
  const longContext = calculateTieredTokenCostMicros({
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
    inputTokens: 250_000,
    outputTokens: 10_000,
    cachedInputTokens: 50_000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing,
  });

  assert.equal(longContext.appliedTierId, 'prompts_over_200k');
  assert.equal(longContext.inputCostMicros, 500_000);
  assert.equal(longContext.cachedInputCostMicros, 31_250);
  assert.equal(longContext.outputCostMicros, 150_000);
  assert.equal(longContext.totalCostMicros, 681_250);
});

test('Part 1: BigInt micro-USD calculation avoids IEEE-754 floating-point drift on large/odd token counts', () => {
  const pricing = makeOfficialGeminiPricing('gemini-2.5-flash');
  // 333,333 regular input @ 300,000 micros/1M = 99,999.9 -> rounds half-up to 100,000 micros
  // 777,777 output @ 2,500,000 micros/1M = 1,944,442.5 -> rounds half-up to 1,944,443 micros
  const result = calculateTieredTokenCostMicros({
    provider: 'google_gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 333_333,
    outputTokens: 777_777,
    cachedInputTokens: 0,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing,
  });

  assert.equal(result.inputCostMicros, 100_000);
  assert.equal(result.outputCostMicros, 1_944_443);
  assert.equal(result.totalCostMicros, 2_044_443);

  const tier = resolveEffectivePricingTier(200_001, GEMINI_STANDARD_PRICING_TIERS['gemini-2.5-pro']);
  assert.equal(tier?.tierId, 'prompts_over_200k');

  // Unconfigured model pricing returns unavailable without fabricating cost
  const unconfigured = calculateTieredTokenCostMicros({
    provider: 'google_gemini',
    model: 'unknown-future-model',
    inputTokens: 5000,
    outputTokens: 1000,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    pricing: null,
  });
  assert.equal(unconfigured.costBasis, 'unavailable');
  assert.equal(unconfigured.totalCostMicros, null);
});

test('Stage 6 Scheduler: validates IANA timezones and computes accurate next run across timezones and windows', () => {
  assert.equal(isValidIanaTimezone('America/New_York'), true);
  assert.equal(isValidIanaTimezone('Asia/Tokyo'), true);
  assert.equal(isValidIanaTimezone('Not/A_Timezone'), false);

  const bad = validateScheduleInput({
    name: '',
    targetKind: 'workflow_template',
    templateId: null,
    frequency: 'weekly',
    daysOfWeek: [],
    timezone: 'Invalid/Zone',
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length >= 3);

  // Daily 09:30 in Asia/Tokyo (UTC+9 -> 00:30 UTC)
  const after = new Date('2026-06-10T00:00:00.000Z');
  const nextTokyo = computeNextScheduledRunAt(
    {
      frequency: 'daily',
      hourOfDay: 9,
      minuteOfHour: 30,
      daysOfWeek: [],
      dayOfMonth: null,
      runAtIso: null,
      timezone: 'Asia/Tokyo',
    },
    after,
  );
  assert.equal(nextTokyo, '2026-06-10T00:30:00.000Z');

  // Hourly restricted to 02:00-04:00 UTC window
  const nextWindowed = computeNextScheduledRunAt(
    {
      frequency: 'hourly',
      hourOfDay: null,
      minuteOfHour: 15,
      daysOfWeek: [],
      dayOfMonth: null,
      runAtIso: null,
      timezone: 'UTC',
      executionWindow: { startHour: 2, endHour: 4 },
    },
    new Date('2026-06-10T00:30:00.000Z'),
  );
  assert.equal(nextWindowed, '2026-06-10T02:15:00.000Z');
  assert.equal(
    isWithinExecutionWindow(new Date('2026-06-10T03:00:00.000Z'), 'UTC', {
      startHour: 2,
      endHour: 4,
    }),
    true,
  );
  assert.equal(
    isWithinExecutionWindow(new Date('2026-06-10T06:00:00.000Z'), 'UTC', {
      startHour: 2,
      endHour: 4,
    }),
    false,
  );
});

test('Stage 6 Scheduler: catch-up policies skip, run_once, and run_all_capped behave deterministically', () => {
  const baseSpec = {
    frequency: 'hourly' as const,
    minuteOfHour: 0,
    hourOfDay: null,
    daysOfWeek: [],
    dayOfMonth: null,
    runAtIso: null,
    timezone: 'UTC',
    nextRunAt: '2026-06-10T01:00:00.000Z',
    maxCatchUpRuns: 2,
  };
  // 5 missed hourly slots: 01:00, 02:00, 03:00, 04:00, 05:00; now is 05:10 (outside 2-min grace)
  const now = new Date('2026-06-10T05:10:00.000Z');

  const skipRes = computeMissedScheduleRuns({ ...baseSpec, catchUpPolicy: 'skip' }, now);
  assert.equal(skipRes.runsToExecute.length, 0);
  assert.equal(skipRes.skippedCount, 5);
  assert.equal(skipRes.nextFutureRunAt, '2026-06-10T06:00:00.000Z');

  const onceRes = computeMissedScheduleRuns({ ...baseSpec, catchUpPolicy: 'run_once' }, now);
  assert.equal(onceRes.runsToExecute.length, 1);
  assert.equal(onceRes.runsToExecute[0], '2026-06-10T05:00:00.000Z');
  assert.equal(onceRes.skippedCount, 4);

  const cappedRes = computeMissedScheduleRuns(
    { ...baseSpec, catchUpPolicy: 'run_all_capped', maxCatchUpRuns: 2 },
    now,
  );
  assert.equal(cappedRes.runsToExecute.length, 2);
  assert.equal(cappedRes.skippedCount, 3);
});

test('Stage 6 Recovery: classifies retryable vs non-retryable errors and bounds exponential backoff jitter', () => {
  assert.equal(classifyExecutionError('FORBIDDEN: insufficient role').classification, 'non_retryable');
  assert.equal(classifyExecutionError('BUDGET_EXCEEDED: monthly spend hit').classification, 'non_retryable');
  assert.equal(classifyExecutionError('HTTP 401 unauthorized key').classification, 'non_retryable');
  assert.equal(classifyExecutionError('ETIMEDOUT upstream socket hangup').classification, 'retryable');
  assert.equal(classifyExecutionError('HTTP 429 rate limit exceeded').classification, 'retryable');

  const b1Low = computeBackoffWithJitterMs(1, { baseDelayMs: 1000, maxDelayMs: 10_000, jitterRatio: 0.25, randomValue: 0 });
  const b1High = computeBackoffWithJitterMs(1, { baseDelayMs: 1000, maxDelayMs: 10_000, jitterRatio: 0.25, randomValue: 1 });
  const b5Max = computeBackoffWithJitterMs(5, { baseDelayMs: 1000, maxDelayMs: 10_000, jitterRatio: 0.25, randomValue: 1 });

  assert.equal(b1Low, 750);
  assert.equal(b1High, 1250);
  assert.equal(b5Max, 10_000);
});

test('Stage 6 Governance: autonomy policy enforces restricted mode, concurrency, template/agent scope, and high-impact approval', () => {
  const restricted = evaluateAutonomyPolicy({
    policy: makeBasePolicy({ autonomyMode: 'restricted' }),
    triggerSource: 'schedule',
    templateId: 'technical_performance_audit',
    targetAgentIds: ['technical_seo_agent'],
    activeWorkflowCount: 0,
    activeTaskCount: 0,
  });
  assert.equal(restricted.allowed, false);
  assert.match(restricted.blockingReason ?? '', /Restricted/);

  const concurrencyBlocked = evaluateAutonomyPolicy({
    policy: makeBasePolicy({ maxConcurrentWorkflows: 2 }),
    triggerSource: 'event_trigger',
    templateId: 'technical_performance_audit',
    targetAgentIds: ['technical_seo_agent'],
    activeWorkflowCount: 2,
    activeTaskCount: 1,
  });
  assert.equal(concurrencyBlocked.allowed, false);
  assert.match(concurrencyBlocked.blockingReason ?? '', /concurrency limit/i);

  const highImpact = evaluateAutonomyPolicy({
    policy: makeBasePolicy({ autonomyMode: 'automatic_low_risk', requireApprovalForHighImpact: true }),
    triggerSource: 'schedule',
    templateId: 'seo_content_pipeline',
    targetAgentIds: ['content_generation_agent'],
    activeWorkflowCount: 0,
    activeTaskCount: 0,
    containsHighImpactActions: true,
  });
  assert.equal(highImpact.allowed, true);
  assert.equal(highImpact.enforcedApprovalGateRequired, true);

  const webhookDisabled = evaluateAutonomyPolicy({
    policy: makeBasePolicy({ allowExternalWebhooks: false }),
    triggerSource: 'external_webhook',
    templateId: 'technical_performance_audit',
    targetAgentIds: ['technical_seo_agent'],
    activeWorkflowCount: 0,
    activeTaskCount: 0,
  });
  assert.equal(webhookDisabled.allowed, false);
  assert.match(webhookDisabled.blockingReason ?? '', /webhook/i);
});
