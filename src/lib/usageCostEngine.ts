import type { AgentId } from '../types/agentFactory';
import type {
  AgentModelBreakdown,
  AgentUsageAnalyticsRow,
  BudgetAlertType,
  BudgetEnforcementPolicy,
  CostBasis,
  DailySpendPoint,
  ProviderPricingVersionRecord,
  ProviderUsageEventRecord,
  UsageBudgetConfigRecord,
  UsageBudgetEvaluation,
  UsageCostCalculationRecord,
  UsageLedgerRow,
  UsageMeasurementStatus,
  UsageSource,
  WorkflowCostBreakdownItem,
  WorkflowUsageAnalyticsRow,
} from '../types/usageIntelligence';

export const MICROS_PER_USD = 1_000_000;
const ONE_MILLION_BIGINT = 1_000_000n;
const HALF_MILLION_BIGINT = 500_000n;

export interface RawGeminiUsageMetadata {
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
  cachedContentTokenCount?: unknown;
  totalTokenCount?: unknown;
  thoughtsTokenCount?: unknown;
}

export interface ExtractedProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  usageSource: UsageSource;
  measurementStatus: UsageMeasurementStatus;
  rawMetadata: Record<string, unknown> | null;
}

function toSafeNonNegInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

/**
 * Extracts actual provider-reported token counts from Gemini usageMetadata.
 * NEVER guesses or approximates token counts from character length.
 */
export function extractGeminiUsageMetadata(
  rawUsage: RawGeminiUsageMetadata | null | undefined,
  source: UsageSource = 'provider_response',
): ExtractedProviderUsage {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      totalTokens: null,
      usageSource: 'unavailable',
      measurementStatus: 'unavailable',
      rawMetadata: null,
    };
  }

  const promptTokens = toSafeNonNegInt(rawUsage.promptTokenCount);
  const candidatesTokens = toSafeNonNegInt(rawUsage.candidatesTokenCount);
  const cachedTokens = toSafeNonNegInt(rawUsage.cachedContentTokenCount);
  const thoughtsTokens = toSafeNonNegInt(rawUsage.thoughtsTokenCount);
  const reportedTotal = toSafeNonNegInt(rawUsage.totalTokenCount);

  // If output tokens are reported alongside thinking tokens, keep candidatesTokenCount
  // as reported outputTokens (and retain thoughtsTokenCount in rawMetadata for auditability).
  const outputTokens = candidatesTokens;
  const inputTokens = promptTokens;

  let totalTokens: number | null = reportedTotal;
  if (totalTokens === null && inputTokens !== null && outputTokens !== null) {
    totalTokens = inputTokens + outputTokens + (thoughtsTokens ?? 0);
  }

  const sanitizedRaw: Record<string, unknown> = {};
  if (promptTokens !== null) sanitizedRaw.promptTokenCount = promptTokens;
  if (candidatesTokens !== null) sanitizedRaw.candidatesTokenCount = candidatesTokens;
  if (cachedTokens !== null) sanitizedRaw.cachedContentTokenCount = cachedTokens;
  if (thoughtsTokens !== null) sanitizedRaw.thoughtsTokenCount = thoughtsTokens;
  if (reportedTotal !== null) sanitizedRaw.totalTokenCount = reportedTotal;

  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      totalTokens: null,
      usageSource: 'unavailable',
      measurementStatus: 'unavailable',
      rawMetadata: Object.keys(sanitizedRaw).length > 0 ? sanitizedRaw : null,
    };
  }

  const measurementStatus: UsageMeasurementStatus =
    inputTokens !== null && outputTokens !== null && totalTokens !== null
      ? 'measured'
      : 'partial';

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: cachedTokens,
    totalTokens,
    usageSource: source,
    measurementStatus,
    rawMetadata: sanitizedRaw,
  };
}

/**
 * Exact BigInt multiplication for (tokens * pricePer1mMicros) / 1_000_000
 * rounded to nearest micro-USD (1 USD = 1,000,000 micro-USD) with zero floating-point drift.
 */
export function computeTokenBatchCostMicros(
  tokens: number,
  pricePer1mMicros: number,
): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  if (!Number.isFinite(pricePer1mMicros) || pricePer1mMicros <= 0) return 0;
  const t = BigInt(Math.trunc(tokens));
  const p = BigInt(Math.trunc(pricePer1mMicros));
  const numerator = t * p + HALF_MILLION_BIGINT;
  const micros = numerator / ONE_MILLION_BIGINT;
  return Number(micros);
}

export interface ComputedCostResult {
  pricingVersionId: string | null;
  pricingVersionLabel: string | null;
  pricingSourceLabel: string | null;
  costBasis: CostBasis;
  currency: string;
  inputCostMicros: number | null;
  outputCostMicros: number | null;
  cachedInputCostMicros: number | null;
  totalCostMicros: number | null;
  unavailableReason: string | null;
}

/**
 * Computes auditable, high-precision API cost in integer micro-USD.
 * Distinguishes calculated_actual_tokens, provider_reported_billed, internal_non_billed, and unavailable.
 */
export function calculateUsageCostMicros(params: {
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  usageSource: UsageSource;
  measurementStatus: UsageMeasurementStatus;
  pricing: ProviderPricingVersionRecord | null;
  providerReportedBilledMicros?: number | null;
}): ComputedCostResult {
  // 1. Provider-reported direct billing takes top precedence if ever supplied
  if (
    typeof params.providerReportedBilledMicros === 'number' &&
    Number.isFinite(params.providerReportedBilledMicros) &&
    params.providerReportedBilledMicros >= 0
  ) {
    return {
      pricingVersionId: params.pricing?.id ?? null,
      pricingVersionLabel: params.pricing?.pricingVersion ?? null,
      pricingSourceLabel: 'Provider Reported Billed Amount',
      costBasis: 'provider_reported_billed',
      currency: params.pricing?.currency ?? 'USD',
      inputCostMicros: null,
      outputCostMicros: null,
      cachedInputCostMicros: null,
      totalCostMicros: Math.round(params.providerReportedBilledMicros),
      unavailableReason: null,
    };
  }

  // 2. Internal non-billed Rovix services (crawler, keyword ruleset, geo catalog, etc.)
  if (
    params.usageSource === 'internal_service' ||
    params.pricing?.sourceType === 'internal_non_billed'
  ) {
    return {
      pricingVersionId: params.pricing?.id ?? null,
      pricingVersionLabel: params.pricing?.pricingVersion ?? 'internal-v1',
      pricingSourceLabel:
        params.pricing?.sourceOfPricing ?? 'Internal Rovix Service (No External Token Billing)',
      costBasis: 'internal_non_billed',
      currency: 'USD',
      inputCostMicros: 0,
      outputCostMicros: 0,
      cachedInputCostMicros: 0,
      totalCostMicros: 0,
      unavailableReason: null,
    };
  }

  // 3. Missing pricing configuration or unconfigured model
  if (
    !params.pricing ||
    params.pricing.sourceType === 'unconfigured' ||
    params.pricing.inputPricePer1mMicros === null ||
    params.pricing.outputPricePer1mMicros === null
  ) {
    return {
      pricingVersionId: params.pricing?.id ?? null,
      pricingVersionLabel: params.pricing?.pricingVersion ?? null,
      pricingSourceLabel: params.pricing?.sourceOfPricing ?? null,
      costBasis: 'unavailable',
      currency: params.pricing?.currency ?? 'USD',
      inputCostMicros: null,
      outputCostMicros: null,
      cachedInputCostMicros: null,
      totalCostMicros: null,
      unavailableReason: `No active pricing rate configured for ${params.provider}${params.model ? ` / ${params.model}` : ''}.`,
    };
  }

  // 4. Missing provider-reported token counts
  if (
    params.measurementStatus === 'unavailable' ||
    params.inputTokens === null ||
    params.outputTokens === null
  ) {
    return {
      pricingVersionId: params.pricing.id,
      pricingVersionLabel: params.pricing.pricingVersion,
      pricingSourceLabel: params.pricing.sourceOfPricing,
      costBasis: 'unavailable',
      currency: params.pricing.currency,
      inputCostMicros: null,
      outputCostMicros: null,
      cachedInputCostMicros: null,
      totalCostMicros: null,
      unavailableReason: 'Provider did not return complete input/output token usage metadata.',
    };
  }

  // Gemini promptTokenCount includes cachedContentTokenCount; split non-cached vs cached cleanly
  const cachedTokens = Math.max(
    0,
    Math.min(params.cachedInputTokens ?? 0, params.inputTokens),
  );
  const billableRegularInputTokens = Math.max(0, params.inputTokens - cachedTokens);

  const inputCostMicros = computeTokenBatchCostMicros(
    billableRegularInputTokens,
    params.pricing.inputPricePer1mMicros,
  );
  const outputCostMicros = computeTokenBatchCostMicros(
    params.outputTokens,
    params.pricing.outputPricePer1mMicros,
  );
  const cachedRate =
    params.pricing.cachedInputPricePer1mMicros ?? params.pricing.inputPricePer1mMicros;
  const cachedInputCostMicros =
    cachedTokens > 0 ? computeTokenBatchCostMicros(cachedTokens, cachedRate) : 0;

  const totalCostMicros = inputCostMicros + outputCostMicros + cachedInputCostMicros;

  const costBasis: CostBasis =
    params.usageSource === 'provider_count_tokens_api'
      ? 'estimated'
      : 'calculated_actual_tokens';

  return {
    pricingVersionId: params.pricing.id,
    pricingVersionLabel: params.pricing.pricingVersion,
    pricingSourceLabel: params.pricing.sourceOfPricing,
    costBasis,
    currency: params.pricing.currency,
    inputCostMicros,
    outputCostMicros,
    cachedInputCostMicros,
    totalCostMicros,
    unavailableReason: null,
  };
}

// ============================================================================
// TIERED TOKEN COST CALCULATION (EXACT BIGINT MICRO-USD ARITHMETIC)
// ============================================================================

export interface PricingTierRule {
  tierId: string;
  label: string;
  /** Minimum prompt/input tokens inclusive for this tier to match (default 0). */
  minInputTokens: number;
  /** Maximum prompt/input tokens inclusive for this tier, or null for unbounded upper tier. */
  maxInputTokens: number | null;
  /** Rate per 1,000,000 non-cached input tokens in integer micro-USD ($1.00 = 1,000,000). */
  inputPricePer1mMicros: number;
  /** Rate per 1,000,000 output tokens in integer micro-USD. */
  outputPricePer1mMicros: number;
  /** Optional rate per 1,000,000 cached input tokens in integer micro-USD. */
  cachedInputPricePer1mMicros: number | null;
}

export interface TieredCostCalculationResult extends ComputedCostResult {
  appliedTierId: string | null;
  appliedTierLabel: string | null;
  appliedInputRatePer1mMicros: number | null;
  appliedOutputRatePer1mMicros: number | null;
  appliedCachedInputRatePer1mMicros: number | null;
  regularInputTokensBilled: number;
  cachedInputTokensBilled: number;
  outputTokensBilled: number;
}

/**
 * Published Gemini GA context-tier schedules in exact integer micro-USD per 1M tokens.
 * Models without verified published GA rates (e.g., preview aliases) are intentionally
 * omitted so callers must supply explicit workspace-configured pricing tiers.
 */
export const GEMINI_STANDARD_PRICING_TIERS: Readonly<Record<string, readonly PricingTierRule[]>> = {
  'gemini-2.5-flash': [
    {
      tierId: 'standard',
      label: 'Standard Context',
      minInputTokens: 0,
      maxInputTokens: null,
      inputPricePer1mMicros: 300_000,
      outputPricePer1mMicros: 2_500_000,
      cachedInputPricePer1mMicros: 75_000,
    },
  ],
  'gemini-2.5-pro': [
    {
      tierId: 'prompts_up_to_200k',
      label: 'Standard Context (<= 200k tokens)',
      minInputTokens: 0,
      maxInputTokens: 200_000,
      inputPricePer1mMicros: 1_250_000,
      outputPricePer1mMicros: 10_000_000,
      cachedInputPricePer1mMicros: 312_500,
    },
    {
      tierId: 'prompts_over_200k',
      label: 'Long Context (> 200k tokens)',
      minInputTokens: 200_001,
      maxInputTokens: null,
      inputPricePer1mMicros: 2_500_000,
      outputPricePer1mMicros: 15_000_000,
      cachedInputPricePer1mMicros: 625_000,
    },
  ],
};

/**
 * Selects the applicable pricing tier for a given prompt/input token count.
 * Sorts tiers deterministically by minInputTokens ascending and matches the exact bracket.
 */
export function resolveEffectivePricingTier(
  inputTokens: number,
  tiers: readonly PricingTierRule[],
): PricingTierRule | null {
  if (!Number.isFinite(inputTokens) || inputTokens < 0 || tiers.length === 0) {
    return null;
  }
  const normalizedInput = Math.trunc(inputTokens);
  const sorted = [...tiers].sort((a, b) => a.minInputTokens - b.minInputTokens);
  for (const tier of sorted) {
    const meetsMin = normalizedInput >= Math.max(0, Math.trunc(tier.minInputTokens));
    const meetsMax =
      tier.maxInputTokens === null || normalizedInput <= Math.trunc(tier.maxInputTokens);
    if (meetsMin && meetsMax) {
      return tier;
    }
  }
  return sorted[sorted.length - 1] ?? null;
}

/**
 * Calculates token costs across Gemini models and configured pricing tiers using exact
 * BigInt integer micro-USD arithmetic (zero floating-point rounding drift).
 */
export function calculateTieredTokenCostMicros(params: {
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens?: number | null;
  usageSource: UsageSource;
  measurementStatus: UsageMeasurementStatus;
  pricing: ProviderPricingVersionRecord | null;
  customTiers?: readonly PricingTierRule[] | null;
  providerReportedBilledMicros?: number | null;
}): TieredCostCalculationResult {
  // Resolve effective tier list: explicit custom tiers > model GA tier schedule (only if pricing is official) > single flat tier from ProviderPricingVersionRecord
  let tiersToUse: readonly PricingTierRule[] = [];
  if (params.customTiers && params.customTiers.length > 0) {
    tiersToUse = params.customTiers;
  } else if (
    params.pricing &&
    params.pricing.sourceType === 'official_provider_pricing' &&
    params.provider === 'google_gemini' &&
    params.model &&
    GEMINI_STANDARD_PRICING_TIERS[params.model]
  ) {
    tiersToUse = GEMINI_STANDARD_PRICING_TIERS[params.model];
  } else if (
    params.pricing &&
    params.pricing.sourceType !== 'unconfigured' &&
    params.pricing.sourceType !== 'internal_non_billed' &&
    params.pricing.inputPricePer1mMicros !== null &&
    params.pricing.outputPricePer1mMicros !== null
  ) {
    tiersToUse = [
      {
        tierId: 'configured_flat',
        label: 'Configured Flat Rate',
        minInputTokens: 0,
        maxInputTokens: null,
        inputPricePer1mMicros: params.pricing.inputPricePer1mMicros,
        outputPricePer1mMicros: params.pricing.outputPricePer1mMicros,
        cachedInputPricePer1mMicros: params.pricing.cachedInputPricePer1mMicros,
      },
    ];
  }

  // Fallback to standard calculateUsageCostMicros for provider-billed, internal non-billed, unconfigured, or unavailable usage
  if (
    typeof params.providerReportedBilledMicros === 'number' ||
    params.usageSource === 'internal_service' ||
    params.pricing?.sourceType === 'internal_non_billed' ||
    tiersToUse.length === 0 ||
    params.measurementStatus === 'unavailable' ||
    params.inputTokens === null ||
    params.outputTokens === null
  ) {
    const base = calculateUsageCostMicros({
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cachedInputTokens: params.cachedInputTokens ?? null,
      usageSource: params.usageSource,
      measurementStatus: params.measurementStatus,
      pricing: params.pricing,
      providerReportedBilledMicros: params.providerReportedBilledMicros,
    });
    return {
      ...base,
      appliedTierId: null,
      appliedTierLabel: null,
      appliedInputRatePer1mMicros: null,
      appliedOutputRatePer1mMicros: null,
      appliedCachedInputRatePer1mMicros: null,
      regularInputTokensBilled: 0,
      cachedInputTokensBilled: 0,
      outputTokensBilled: 0,
    };
  }

  const matchedTier = resolveEffectivePricingTier(params.inputTokens, tiersToUse);
  if (!matchedTier) {
    return {
      pricingVersionId: params.pricing?.id ?? null,
      pricingVersionLabel: params.pricing?.pricingVersion ?? null,
      pricingSourceLabel: params.pricing?.sourceOfPricing ?? null,
      costBasis: 'unavailable',
      currency: params.pricing?.currency ?? 'USD',
      inputCostMicros: null,
      outputCostMicros: null,
      cachedInputCostMicros: null,
      totalCostMicros: null,
      unavailableReason: 'No matching pricing tier found for input token volume.',
      appliedTierId: null,
      appliedTierLabel: null,
      appliedInputRatePer1mMicros: null,
      appliedOutputRatePer1mMicros: null,
      appliedCachedInputRatePer1mMicros: null,
      regularInputTokensBilled: 0,
      cachedInputTokensBilled: 0,
      outputTokensBilled: 0,
    };
  }

  const normalizedInput = Math.max(0, Math.trunc(params.inputTokens));
  const normalizedOutput = Math.max(0, Math.trunc(params.outputTokens));
  const cachedTokens = Math.max(
    0,
    Math.min(Math.trunc(params.cachedInputTokens ?? 0), normalizedInput),
  );
  const regularInputTokens = Math.max(0, normalizedInput - cachedTokens);

  const cachedRate =
    matchedTier.cachedInputPricePer1mMicros ?? matchedTier.inputPricePer1mMicros;

  // Exact BigInt micro-USD computation per component (zero floating-point drift)
  const inputCostBig =
    (BigInt(regularInputTokens) * BigInt(Math.trunc(matchedTier.inputPricePer1mMicros)) +
      HALF_MILLION_BIGINT) /
    ONE_MILLION_BIGINT;
  const outputCostBig =
    (BigInt(normalizedOutput) * BigInt(Math.trunc(matchedTier.outputPricePer1mMicros)) +
      HALF_MILLION_BIGINT) /
    ONE_MILLION_BIGINT;
  const cachedCostBig =
    cachedTokens > 0
      ? (BigInt(cachedTokens) * BigInt(Math.trunc(cachedRate)) + HALF_MILLION_BIGINT) /
        ONE_MILLION_BIGINT
      : 0n;
  const totalCostBig = inputCostBig + outputCostBig + cachedCostBig;

  const costBasis: CostBasis =
    params.usageSource === 'provider_count_tokens_api'
      ? 'estimated'
      : 'calculated_actual_tokens';

  return {
    pricingVersionId: params.pricing?.id ?? null,
    pricingVersionLabel: params.pricing?.pricingVersion ?? null,
    pricingSourceLabel: params.pricing?.sourceOfPricing ?? 'Configured Pricing Tier',
    costBasis,
    currency: params.pricing?.currency ?? 'USD',
    inputCostMicros: Number(inputCostBig),
    outputCostMicros: Number(outputCostBig),
    cachedInputCostMicros: Number(cachedCostBig),
    totalCostMicros: Number(totalCostBig),
    unavailableReason: null,
    appliedTierId: matchedTier.tierId,
    appliedTierLabel: matchedTier.label,
    appliedInputRatePer1mMicros: matchedTier.inputPricePer1mMicros,
    appliedOutputRatePer1mMicros: matchedTier.outputPricePer1mMicros,
    appliedCachedInputRatePer1mMicros: cachedRate,
    regularInputTokensBilled: regularInputTokens,
    cachedInputTokensBilled: cachedTokens,
    outputTokensBilled: normalizedOutput,
  };
}

/**
 * Formats integer micro-USD (1 USD = 1,000,000 micro-USD) cleanly for UI & reports.
 */
export function formatMicroUsd(
  micros: number | null | undefined,
  opts?: { compact?: boolean; unavailableLabel?: string },
): string {
  if (micros === null || micros === undefined || !Number.isFinite(micros)) {
    return opts?.unavailableLabel ?? 'Unavailable';
  }
  const usd = micros / MICROS_PER_USD;
  if (micros === 0) return '$0.00';
  if (Math.abs(usd) < 0.01) {
    return `$${usd.toFixed(opts?.compact ? 4 : 6)}`;
  }
  if (Math.abs(usd) < 1) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}

/**
 * Converts a USD numeric input (e.g. "$0.30" per 1M tokens) into exact integer micro-USD.
 */
export function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * MICROS_PER_USD);
}

/**
 * Reconciles a workflow's total token usage and API cost from deduplicated immutable usage events.
 * Guarantees zero double-counting across parent-child links, handoffs, or repeated messages.
 */
export function reconcileWorkflowUsage(params: {
  workflowId: string;
  workflowName: string;
  templateId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  rows: UsageLedgerRow[];
  taskTitleMap?: Map<string, { title: string; nodeKey: string }>;
}): {
  summary: WorkflowUsageAnalyticsRow;
  tasks: WorkflowCostBreakdownItem[];
  reconciliation: {
    underlyingEventCount: number;
    measuredEventCount: number;
    unavailableCostEventCount: number;
    sumEventCostMicros: number;
    aggregatedWorkflowCostMicros: number;
    isReconciled: boolean;
    discrepancyMicros: number;
    unavailableComponents: string[];
  };
} {
  // Deduplicate strictly by unique event.id
  const uniqueRowsMap = new Map<string, UsageLedgerRow>();
  for (const row of params.rows) {
    if (row.event.workflowId !== params.workflowId) continue;
    if (!uniqueRowsMap.has(row.event.id)) {
      uniqueRowsMap.set(row.event.id, row);
    }
  }
  const uniqueRows = Array.from(uniqueRowsMap.values());

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let totalTokens = 0;
  let measuredCostMicros = 0;
  let retryCostMicros = 0;
  let failedExecutionCostMicros = 0;
  let retryRequests = 0;
  let failedRequests = 0;
  let unavailableCostEventCount = 0;
  let measuredEventCount = 0;
  const unavailableComponentsSet = new Set<string>();
  const basisCounts: Record<CostBasis, number> = {
    provider_reported_billed: 0,
    calculated_actual_tokens: 0,
    estimated: 0,
    internal_non_billed: 0,
    unavailable: 0,
  };

  const byAgent = new Map<
    AgentId,
    {
      agentId: AgentId;
      requests: number;
      totalTokens: number;
      measuredCostMicros: number;
      unavailableCostCount: number;
    }
  >();

  const byTask = new Map<
    string,
    {
      taskId: string | null;
      nodeKey: string | null;
      taskTitle: string;
      agentId: AgentId;
      requests: number;
      retryRequests: number;
      failedRequests: number;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      totalTokens: number;
      measuredCostMicros: number;
      unavailableCostCount: number;
      basisCounts: Record<CostBasis, number>;
      latencySum: number;
      latencyCount: number;
    }
  >();

  for (const { event, cost } of uniqueRows) {
    basisCounts[cost.costBasis] += 1;
    const isRetry = event.isRetry || event.attemptNumber > 1;
    const isFailed = event.status !== 'succeeded';
    if (isRetry) retryRequests += 1;
    if (isFailed) failedRequests += 1;

    if (event.inputTokens !== null) inputTokens += event.inputTokens;
    if (event.outputTokens !== null) outputTokens += event.outputTokens;
    if (event.cachedInputTokens !== null) cachedInputTokens += event.cachedInputTokens;
    if (event.totalTokens !== null) totalTokens += event.totalTokens;

    if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
      measuredEventCount += 1;
      measuredCostMicros += cost.totalCostMicros;
      if (isRetry) retryCostMicros += cost.totalCostMicros;
      if (isFailed) failedExecutionCostMicros += cost.totalCostMicros;
    } else {
      unavailableCostEventCount += 1;
      unavailableComponentsSet.add(
        `${event.agentId} (${event.provider}${event.model ? `/${event.model}` : ''}): ${cost.unavailableReason ?? 'Cost unavailable'}`,
      );
    }

    // Per-agent accumulator
    const ag = byAgent.get(event.agentId) ?? {
      agentId: event.agentId,
      requests: 0,
      totalTokens: 0,
      measuredCostMicros: 0,
      unavailableCostCount: 0,
    };
    ag.requests += 1;
    ag.totalTokens += event.totalTokens ?? 0;
    if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
      ag.measuredCostMicros += cost.totalCostMicros;
    } else {
      ag.unavailableCostCount += 1;
    }
    byAgent.set(event.agentId, ag);

    // Per-task accumulator
    const taskKey = event.taskId ?? `agent:${event.agentId}`;
    const taskMeta = event.taskId ? params.taskTitleMap?.get(event.taskId) : undefined;
    const tk = byTask.get(taskKey) ?? {
      taskId: event.taskId,
      nodeKey: taskMeta?.nodeKey ?? null,
      taskTitle: taskMeta?.title ?? event.agentId,
      agentId: event.agentId,
      requests: 0,
      retryRequests: 0,
      failedRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      measuredCostMicros: 0,
      unavailableCostCount: 0,
      basisCounts: {
        provider_reported_billed: 0,
        calculated_actual_tokens: 0,
        estimated: 0,
        internal_non_billed: 0,
        unavailable: 0,
      },
      latencySum: 0,
      latencyCount: 0,
    };
    tk.requests += 1;
    if (isRetry) tk.retryRequests += 1;
    if (isFailed) tk.failedRequests += 1;
    tk.inputTokens += event.inputTokens ?? 0;
    tk.outputTokens += event.outputTokens ?? 0;
    tk.cachedInputTokens += event.cachedInputTokens ?? 0;
    tk.totalTokens += event.totalTokens ?? 0;
    tk.basisCounts[cost.costBasis] += 1;
    if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
      tk.measuredCostMicros += cost.totalCostMicros;
    } else {
      tk.unavailableCostCount += 1;
    }
    if (event.latencyMs !== null && event.latencyMs >= 0) {
      tk.latencySum += event.latencyMs;
      tk.latencyCount += 1;
    }
    byTask.set(taskKey, tk);
  }

  const agentBreakdown = Array.from(byAgent.values()).sort(
    (a, b) => b.measuredCostMicros - a.measuredCostMicros || b.totalTokens - a.totalTokens,
  );
  const sumByAgents = agentBreakdown.reduce((acc, a) => acc + a.measuredCostMicros, 0);
  const discrepancyMicros = measuredCostMicros - sumByAgents;

  const durationMs =
    params.completedAt && params.createdAt
      ? Math.max(0, Date.parse(params.completedAt) - Date.parse(params.createdAt))
      : null;

  const unavailableComponents = Array.from(unavailableComponentsSet);

  const summary: WorkflowUsageAnalyticsRow = {
    workflowId: params.workflowId,
    workflowName: params.workflowName,
    templateId: params.templateId,
    status: params.status,
    createdAt: params.createdAt,
    completedAt: params.completedAt,
    durationMs: durationMs !== null && Number.isFinite(durationMs) ? durationMs : null,
    totalRequests: uniqueRows.length,
    uniqueEventCount: uniqueRows.length,
    retryRequests,
    failedRequests,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalTokens,
    measuredCostMicros,
    retryCostMicros,
    failedExecutionCostMicros,
    unavailableCostEventCount,
    unavailableComponents,
    isReconciled: discrepancyMicros === 0,
    discrepancyMicros,
    primaryCostBasis: resolvePrimaryCostBasis(basisCounts),
    agentBreakdown,
  };

  const tasks: WorkflowCostBreakdownItem[] = Array.from(byTask.values()).map((t) => ({
    taskId: t.taskId,
    nodeKey: t.nodeKey,
    taskTitle: t.taskTitle,
    agentId: t.agentId,
    requests: t.requests,
    retryRequests: t.retryRequests,
    failedRequests: t.failedRequests,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cachedInputTokens: t.cachedInputTokens,
    totalTokens: t.totalTokens,
    measuredCostMicros: t.measuredCostMicros,
    unavailableCostCount: t.unavailableCostCount,
    costBasis: resolvePrimaryCostBasis(t.basisCounts),
    avgLatencyMs: t.latencyCount > 0 ? Math.round(t.latencySum / t.latencyCount) : null,
  }));

  return {
    summary,
    tasks,
    reconciliation: {
      underlyingEventCount: uniqueRows.length,
      measuredEventCount,
      unavailableCostEventCount,
      sumEventCostMicros: measuredCostMicros,
      aggregatedWorkflowCostMicros: sumByAgents,
      isReconciled: discrepancyMicros === 0,
      discrepancyMicros,
      unavailableComponents,
    },
  };
}

export function resolvePrimaryCostBasis(counts: Record<CostBasis, number>): CostBasis {
  if (counts.provider_reported_billed > 0) return 'provider_reported_billed';
  if (counts.calculated_actual_tokens > 0) return 'calculated_actual_tokens';
  if (counts.estimated > 0) return 'estimated';
  if (counts.unavailable > 0) return 'unavailable';
  if (counts.internal_non_billed > 0) return 'internal_non_billed';
  return 'unavailable';
}

export function aggregateAgentUsageRows(params: {
  rows: UsageLedgerRow[];
  agentCatalog: { agentId: AgentId; name: string }[];
  taskTimingByAgent?: Map<
    AgentId,
    { avgQueueWaitMs: number | null; avgExecutionDurationMs: number | null }
  >;
}): AgentUsageAnalyticsRow[] {
  const uniqueMap = new Map<string, UsageLedgerRow>();
  for (const r of params.rows) {
    if (!uniqueMap.has(r.event.id)) uniqueMap.set(r.event.id, r);
  }
  const uniqueRows = Array.from(uniqueMap.values());

  return params.agentCatalog.map((agent) => {
    const agentRows = uniqueRows.filter((r) => r.event.agentId === agent.agentId);
    let measuredTokenRequests = 0;
    let unavailableTokenRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let totalTokens = 0;
    let measuredCostMicros = 0;
    let unavailableCostEventCount = 0;
    let failedRequests = 0;
    let retryRequests = 0;
    let timeoutRequests = 0;
    let quotaErrorCount = 0;
    let latencySum = 0;
    let latencyCount = 0;
    const basisCounts: Record<CostBasis, number> = {
      provider_reported_billed: 0,
      calculated_actual_tokens: 0,
      estimated: 0,
      internal_non_billed: 0,
      unavailable: 0,
    };

    const pmMap = new Map<string, AgentModelBreakdown>();

    for (const { event, cost } of agentRows) {
      basisCounts[cost.costBasis] += 1;
      if (event.measurementStatus === 'unavailable') {
        unavailableTokenRequests += 1;
      } else {
        measuredTokenRequests += 1;
      }
      if (event.inputTokens !== null) inputTokens += event.inputTokens;
      if (event.outputTokens !== null) outputTokens += event.outputTokens;
      if (event.cachedInputTokens !== null) cachedInputTokens += event.cachedInputTokens;
      if (event.totalTokens !== null) totalTokens += event.totalTokens;

      if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
        measuredCostMicros += cost.totalCostMicros;
      } else {
        unavailableCostEventCount += 1;
      }

      if (event.status === 'failed') failedRequests += 1;
      if (event.status === 'timeout') {
        timeoutRequests += 1;
        failedRequests += 1;
      }
      if (event.isRetry || event.attemptNumber > 1) retryRequests += 1;
      if (event.isQuotaError) quotaErrorCount += 1;
      if (event.latencyMs !== null && event.latencyMs >= 0) {
        latencySum += event.latencyMs;
        latencyCount += 1;
      }

      const pmKey = `${event.provider}::${event.model ?? ''}`;
      const pm = pmMap.get(pmKey) ?? {
        provider: event.provider,
        model: event.model,
        requests: 0,
        totalTokens: 0,
        measuredCostMicros: 0,
        unavailableCostCount: 0,
      };
      pm.requests += 1;
      pm.totalTokens += event.totalTokens ?? 0;
      if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
        pm.measuredCostMicros += cost.totalCostMicros;
      } else {
        pm.unavailableCostCount += 1;
      }
      pmMap.set(pmKey, pm);
    }

    const timing = params.taskTimingByAgent?.get(agent.agentId);
    const measuredCostRequests = agentRows.length - unavailableCostEventCount;

    return {
      agentId: agent.agentId,
      agentName: agent.name,
      totalRequests: agentRows.length,
      measuredTokenRequests,
      unavailableTokenRequests,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalTokens,
      measuredCostMicros,
      hasUnavailableCostEvents: unavailableCostEventCount > 0,
      unavailableCostEventCount,
      avgCostPerExecutionMicros:
        measuredCostRequests > 0
          ? Math.round(measuredCostMicros / measuredCostRequests)
          : null,
      failedRequests,
      retryRequests,
      timeoutRequests,
      quotaErrorCount,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
      avgQueueWaitMs: timing?.avgQueueWaitMs ?? null,
      avgExecutionDurationMs: timing?.avgExecutionDurationMs ?? null,
      primaryCostBasis:
        agentRows.length > 0 ? resolvePrimaryCostBasis(basisCounts) : 'unavailable',
      providerModels: Array.from(pmMap.values()).sort((a, b) => b.requests - a.requests),
    };
  });
}

export function buildDailySpendSeries(rows: UsageLedgerRow[]): DailySpendPoint[] {
  const byDay = new Map<string, DailySpendPoint>();
  const seen = new Set<string>();
  for (const { event, cost } of rows) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const day = event.requestTimestamp.slice(0, 10);
    if (!day) continue;
    const entry = byDay.get(day) ?? {
      date: day,
      requests: 0,
      totalTokens: 0,
      measuredCostMicros: 0,
      failedRequests: 0,
    };
    entry.requests += 1;
    entry.totalTokens += event.totalTokens ?? 0;
    if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
      entry.measuredCostMicros += cost.totalCostMicros;
    }
    if (event.status !== 'succeeded') {
      entry.failedRequests += 1;
    }
    byDay.set(day, entry);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function getBudgetPeriodWindow(
  periodType: UsageBudgetConfigRecord['periodType'],
  now: Date = new Date(),
): { startIso: string | null; label: string } {
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();

  if (periodType === 'daily') {
    const start = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0, 0));
    return { startIso: start.toISOString(), label: start.toISOString().slice(0, 10) };
  }
  if (periodType === 'weekly') {
    const dayOfWeek = now.getUTCDay(); // 0=Sun .. 6=Sat
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const start = new Date(
      Date.UTC(utcYear, utcMonth, utcDate - diffToMonday, 0, 0, 0, 0),
    );
    return {
      startIso: start.toISOString(),
      label: `Week of ${start.toISOString().slice(0, 10)}`,
    };
  }
  if (periodType === 'monthly') {
    const start = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0));
    return { startIso: start.toISOString(), label: start.toISOString().slice(0, 7) };
  }
  return { startIso: null, label: periodType === 'per_workflow' ? 'Per Workflow' : 'Per Agent' };
}

export interface BudgetEvaluationDecision {
  evaluations: UsageBudgetEvaluation[];
  triggeredAlerts: {
    budgetId: string;
    alertType: BudgetAlertType;
    periodWindow: string;
    measuredSpendMicros: number;
    budgetLimitMicros: number | null;
    measuredTokens: number;
    tokenLimit: number | null;
    enforcementPolicy: BudgetEnforcementPolicy;
    message: string;
  }[];
  blockingAction: 'allow' | 'warn' | 'pause_execution' | 'require_approval';
  blockingReason: string | null;
}

/**
 * Evaluates configured budgets against real persisted usage events.
 * Returns accurate spend utilization, alerts, and enforcement action.
 */
export function evaluateBudgetsAgainstUsage(params: {
  budgets: UsageBudgetConfigRecord[];
  rows: UsageLedgerRow[];
  targetWorkflowId?: string | null;
  targetAgentIds?: AgentId[];
  now?: Date;
}): BudgetEvaluationDecision {
  const now = params.now ?? new Date();
  const uniqueRowsMap = new Map<string, UsageLedgerRow>();
  for (const r of params.rows) {
    if (!uniqueRowsMap.has(r.event.id)) uniqueRowsMap.set(r.event.id, r);
  }
  const uniqueRows = Array.from(uniqueRowsMap.values());

  const evaluations: UsageBudgetEvaluation[] = [];
  const triggeredAlerts: BudgetEvaluationDecision['triggeredAlerts'] = [];
  let blockingAction: BudgetEvaluationDecision['blockingAction'] = 'allow';
  let blockingReason: string | null = null;

  for (const budget of params.budgets) {
    const window = getBudgetPeriodWindow(budget.periodType, now);

    const matchingRows = uniqueRows.filter(({ event }) => {
      if (budget.projectId && event.projectId !== budget.projectId) return false;
      if (budget.scopeType === 'agent' && budget.agentId && event.agentId !== budget.agentId) {
        return false;
      }
      if (budget.periodType === 'per_workflow') {
        const wfTarget = params.targetWorkflowId ?? budget.scopeTargetId;
        if (!wfTarget || event.workflowId !== wfTarget) return false;
      } else if (window.startIso && event.requestTimestamp < window.startIso) {
        return false;
      }
      return true;
    });

    let measuredSpendMicros = 0;
    let measuredTokens = 0;
    let unpricedEventCount = 0;

    for (const { event, cost } of matchingRows) {
      measuredTokens += event.totalTokens ?? 0;
      if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
        measuredSpendMicros += cost.totalCostMicros;
      } else {
        unpricedEventCount += 1;
      }
    }

    const effectiveCostLimit =
      budget.periodType === 'per_workflow'
        ? budget.maxExecutionCostMicros ?? budget.budgetLimitMicros
        : budget.budgetLimitMicros;

    const remainingMicros =
      effectiveCostLimit !== null
        ? Math.max(0, effectiveCostLimit - measuredSpendMicros)
        : null;

    const costUtilPct =
      effectiveCostLimit !== null && effectiveCostLimit > 0
        ? Math.round((measuredSpendMicros / effectiveCostLimit) * 1000) / 10
        : null;
    const tokenUtilPct =
      budget.maxTokensPerRun !== null && budget.maxTokensPerRun > 0
        ? Math.round((measuredTokens / budget.maxTokensPerRun) * 1000) / 10
        : null;

    const utilizationPct =
      costUtilPct !== null && tokenUtilPct !== null
        ? Math.max(costUtilPct, tokenUtilPct)
        : costUtilPct ?? tokenUtilPct;

    const costReached =
      effectiveCostLimit !== null && measuredSpendMicros >= effectiveCostLimit;
    const tokenReached =
      budget.maxTokensPerRun !== null && measuredTokens >= budget.maxTokensPerRun;
    const limitReached = costReached || tokenReached;

    const warningReached =
      !limitReached &&
      utilizationPct !== null &&
      utilizationPct >= Math.max(1, Math.min(100, budget.warningThresholdPct));

    const status: UsageBudgetEvaluation['status'] = limitReached
      ? 'limit_reached'
      : warningReached
        ? 'warning'
        : 'within_budget';

    evaluations.push({
      budget,
      periodWindowLabel: window.label,
      measuredSpendMicros,
      measuredTokens,
      remainingMicros,
      utilizationPct,
      status,
      unpricedEventCount,
    });

    if (!budget.enabled) continue;

    // If checking a specific agent set for pre-launch enforcement, ignore unrelated agent-scoped budgets
    const appliesToLaunch =
      budget.scopeType !== 'agent' ||
      !budget.agentId ||
      !params.targetAgentIds ||
      params.targetAgentIds.includes(budget.agentId);

    if (limitReached && appliesToLaunch) {
      const alertType: BudgetAlertType =
        budget.enforcementPolicy === 'pause_execution'
          ? 'paused'
          : budget.enforcementPolicy === 'require_approval'
            ? 'approval_required'
            : 'limit_reached';
      const detail = costReached
        ? `Measured spend ${formatMicroUsd(measuredSpendMicros)} reached budget limit ${formatMicroUsd(effectiveCostLimit)} (${budget.name} · ${window.label}).`
        : `Measured tokens ${measuredTokens.toLocaleString()} reached limit ${budget.maxTokensPerRun?.toLocaleString()} (${budget.name} · ${window.label}).`;

      triggeredAlerts.push({
        budgetId: budget.id,
        alertType,
        periodWindow: window.label,
        measuredSpendMicros,
        budgetLimitMicros: effectiveCostLimit,
        measuredTokens,
        tokenLimit: budget.maxTokensPerRun,
        enforcementPolicy: budget.enforcementPolicy,
        message: detail,
      });

      if (budget.enforcementPolicy === 'pause_execution') {
        blockingAction = 'pause_execution';
        blockingReason = detail;
      } else if (
        budget.enforcementPolicy === 'require_approval' &&
        blockingAction !== 'pause_execution'
      ) {
        blockingAction = 'require_approval';
        blockingReason = detail;
      } else if (blockingAction === 'allow') {
        blockingAction = 'warn';
      }
    } else if (warningReached && appliesToLaunch) {
      triggeredAlerts.push({
        budgetId: budget.id,
        alertType: 'warning',
        periodWindow: window.label,
        measuredSpendMicros,
        budgetLimitMicros: effectiveCostLimit,
        measuredTokens,
        tokenLimit: budget.maxTokensPerRun,
        enforcementPolicy: budget.enforcementPolicy,
        message: `Budget warning (${utilizationPct}% of limit): ${budget.name} (${window.label}) has spent ${formatMicroUsd(measuredSpendMicros)}.`,
      });
      if (blockingAction === 'allow') {
        blockingAction = 'warn';
      }
    }
  }

  return {
    evaluations,
    triggeredAlerts,
    blockingAction,
    blockingReason,
  };
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Mitigate spreadsheet formula injection
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function serializeUsageLedgerToCsv(rows: UsageLedgerRow[]): string {
  const headers = [
    'usage_event_id',
    'request_timestamp',
    'tenant_id',
    'project_id',
    'workflow_id',
    'execution_id',
    'task_id',
    'agent_id',
    'provider',
    'model',
    'provider_request_id',
    'status',
    'attempt_number',
    'is_retry',
    'is_quota_error',
    'latency_ms',
    'input_tokens',
    'output_tokens',
    'cached_input_tokens',
    'total_tokens',
    'usage_source',
    'measurement_status',
    'cost_basis',
    'pricing_version',
    'pricing_source',
    'currency',
    'input_cost_usd',
    'output_cost_usd',
    'cached_input_cost_usd',
    'total_cost_usd',
    'unavailable_reason',
  ];

  const lines = [headers.join(',')];
  for (const { event, cost } of rows) {
    const microsToPlainUsd = (m: number | null) =>
      m === null ? '' : (m / MICROS_PER_USD).toFixed(6);
    const cols = [
      event.id,
      event.requestTimestamp,
      event.tenantId,
      event.projectId,
      event.workflowId ?? '',
      event.executionId ?? '',
      event.taskId ?? '',
      event.agentId,
      event.provider,
      event.model ?? '',
      event.providerRequestId ?? '',
      event.status,
      event.attemptNumber,
      event.isRetry ? 'true' : 'false',
      event.isQuotaError ? 'true' : 'false',
      event.latencyMs ?? '',
      event.inputTokens ?? '',
      event.outputTokens ?? '',
      event.cachedInputTokens ?? '',
      event.totalTokens ?? '',
      event.usageSource,
      event.measurementStatus,
      cost.costBasis,
      cost.pricingVersionLabel ?? '',
      cost.pricingSourceLabel ?? '',
      cost.currency,
      microsToPlainUsd(cost.inputCostMicros),
      microsToPlainUsd(cost.outputCostMicros),
      microsToPlainUsd(cost.cachedInputCostMicros),
      microsToPlainUsd(cost.totalCostMicros),
      cost.unavailableReason ?? '',
    ];
    lines.push(cols.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

export function serializeUsageLedgerToJson(params: {
  tenantId: string;
  projectId: string;
  exportedAt: string;
  rows: UsageLedgerRow[];
}): string {
  const totalTokens = params.rows.reduce(
    (sum, r) => sum + (r.event.totalTokens ?? 0),
    0,
  );
  const totalMeasuredCostMicros = params.rows.reduce(
    (sum, r) =>
      sum +
      (r.cost.totalCostMicros !== null && r.cost.costBasis !== 'unavailable'
        ? r.cost.totalCostMicros
        : 0),
    0,
  );
  return JSON.stringify(
    {
      schemaVersion: '1.0',
      exportedAt: params.exportedAt,
      tenantId: params.tenantId,
      projectId: params.projectId,
      recordCount: params.rows.length,
      summary: {
        totalTokens,
        totalMeasuredCostMicros,
        totalMeasuredCostUsd: Number(
          (totalMeasuredCostMicros / MICROS_PER_USD).toFixed(6),
        ),
        unavailableCostRecords: params.rows.filter(
          (r) => r.cost.costBasis === 'unavailable',
        ).length,
      },
      records: params.rows,
    },
    null,
    2,
  );
}

/**
 * Helper to detect quota / rate limit errors from provider error text.
 */
export function isProviderQuotaError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('resource_exhausted') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  );
}
