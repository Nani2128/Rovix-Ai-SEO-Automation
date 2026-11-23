import type { AgentId, AgentStationId } from './agentFactory';

export type UsageSource =
  | 'provider_response'
  | 'provider_count_tokens_api'
  | 'internal_service'
  | 'unavailable';

export type UsageMeasurementStatus = 'measured' | 'partial' | 'unavailable';

export type CostBasis =
  | 'provider_reported_billed'
  | 'calculated_actual_tokens'
  | 'estimated'
  | 'internal_non_billed'
  | 'unavailable';

export type UsageEventStatus = 'succeeded' | 'failed' | 'timeout' | 'cancelled';

export type PricingSourceType =
  | 'official_provider_pricing'
  | 'workspace_configured'
  | 'internal_non_billed'
  | 'unconfigured';

export type BudgetPeriodType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'per_workflow'
  | 'per_agent';

export type BudgetEnforcementPolicy =
  | 'warn_only'
  | 'pause_execution'
  | 'require_approval';

export type BudgetAlertType =
  | 'warning'
  | 'limit_reached'
  | 'paused'
  | 'approval_required';

export interface ProviderUsageEventRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string | null;
  executionId: string | null;
  taskId: string | null;
  agentId: AgentId;
  provider: string;
  model: string | null;
  requestTimestamp: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  providerRequestId: string | null;
  usageSource: UsageSource;
  measurementStatus: UsageMeasurementStatus;
  latencyMs: number | null;
  status: UsageEventStatus;
  errorType: string | null;
  isQuotaError: boolean;
  isRetry: boolean;
  attemptNumber: number;
  rawUsageMetadata: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface ProviderPricingVersionRecord {
  id: string;
  tenantId: string | null;
  provider: string;
  model: string;
  /** Integer micro-USD per 1,000,000 input tokens (1 USD = 1_000_000 micros). Null if unconfigured. */
  inputPricePer1mMicros: number | null;
  /** Integer micro-USD per 1,000,000 output tokens (1 USD = 1_000_000 micros). Null if unconfigured. */
  outputPricePer1mMicros: number | null;
  /** Integer micro-USD per 1,000,000 cached input tokens. Null if not applicable. */
  cachedInputPricePer1mMicros: number | null;
  currency: string;
  effectiveDate: string;
  sourceOfPricing: string;
  sourceType: PricingSourceType;
  pricingVersion: string;
  isActive: boolean;
  configuredBy: string | null;
  auditNote: string | null;
  createdAt: string;
}

export interface UsageCostCalculationRecord {
  id: string;
  usageEventId: string;
  tenantId: string;
  projectId: string;
  workflowId: string | null;
  agentId: AgentId;
  pricingVersionId: string | null;
  pricingVersionLabel: string | null;
  pricingSourceLabel: string | null;
  costBasis: CostBasis;
  currency: string;
  /** Integer micro-USD (1 USD = 1_000_000 micros). Null when unavailable. */
  inputCostMicros: number | null;
  outputCostMicros: number | null;
  cachedInputCostMicros: number | null;
  totalCostMicros: number | null;
  unavailableReason: string | null;
  calculatedAt: string;
}

export interface UsageLedgerRow {
  event: ProviderUsageEventRecord;
  cost: UsageCostCalculationRecord;
}

export interface UsageBudgetConfigRecord {
  id: string;
  tenantId: string;
  projectId: string | null;
  scopeType: 'tenant' | 'project' | 'workflow' | 'agent';
  scopeTargetId: string | null;
  agentId: AgentStationId | null;
  name: string;
  periodType: BudgetPeriodType;
  /** Integer micro-USD limit (null if token-only limit). */
  budgetLimitMicros: number | null;
  /** Optional hard cap per single workflow execution in micro-USD. */
  maxExecutionCostMicros: number | null;
  /** Optional max total tokens per run. */
  maxTokensPerRun: number | null;
  warningThresholdPct: number;
  enforcementPolicy: BudgetEnforcementPolicy;
  enabled: boolean;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageBudgetEvaluation {
  budget: UsageBudgetConfigRecord;
  periodWindowLabel: string;
  measuredSpendMicros: number;
  measuredTokens: number;
  remainingMicros: number | null;
  utilizationPct: number | null;
  status: 'within_budget' | 'warning' | 'limit_reached';
  unpricedEventCount: number;
}

export interface UsageBudgetAlertRecord {
  id: string;
  budgetId: string;
  tenantId: string;
  projectId: string | null;
  workflowId: string | null;
  agentId: AgentId | null;
  alertType: BudgetAlertType;
  periodWindow: string;
  measuredSpendMicros: number;
  budgetLimitMicros: number | null;
  measuredTokens: number | null;
  tokenLimit: number | null;
  message: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface UsageReconciliationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  underlyingEventCount: number;
  measuredEventCount: number;
  unavailableCostEventCount: number;
  sumEventCostMicros: number;
  aggregatedWorkflowCostMicros: number;
  isReconciled: boolean;
  discrepancyMicros: number;
  unavailableComponents: string[];
  reconciledAt: string;
}

export interface AgentModelBreakdown {
  provider: string;
  model: string | null;
  requests: number;
  totalTokens: number;
  measuredCostMicros: number;
  unavailableCostCount: number;
}

export interface AgentUsageAnalyticsRow {
  agentId: AgentId;
  agentName: string;
  totalRequests: number;
  measuredTokenRequests: number;
  unavailableTokenRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  measuredCostMicros: number;
  hasUnavailableCostEvents: boolean;
  unavailableCostEventCount: number;
  avgCostPerExecutionMicros: number | null;
  failedRequests: number;
  retryRequests: number;
  timeoutRequests: number;
  quotaErrorCount: number;
  avgLatencyMs: number | null;
  avgQueueWaitMs: number | null;
  avgExecutionDurationMs: number | null;
  primaryCostBasis: CostBasis;
  providerModels: AgentModelBreakdown[];
}

export interface WorkflowCostBreakdownItem {
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
  costBasis: CostBasis;
  avgLatencyMs: number | null;
}

export interface WorkflowUsageAnalyticsRow {
  workflowId: string;
  workflowName: string;
  templateId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalRequests: number;
  uniqueEventCount: number;
  retryRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  measuredCostMicros: number;
  retryCostMicros: number;
  failedExecutionCostMicros: number;
  unavailableCostEventCount: number;
  unavailableComponents: string[];
  isReconciled: boolean;
  discrepancyMicros: number;
  primaryCostBasis: CostBasis;
  agentBreakdown: {
    agentId: AgentId;
    requests: number;
    totalTokens: number;
    measuredCostMicros: number;
    unavailableCostCount: number;
  }[];
}

export interface WorkflowCostDetailPayload {
  summary: WorkflowUsageAnalyticsRow;
  tasks: WorkflowCostBreakdownItem[];
  ledgerRows: UsageLedgerRow[];
  reconciliation: UsageReconciliationRecord | null;
}

export interface ProviderAnalyticsRow {
  provider: string;
  displayName: string;
  category: 'llm' | 'external_seo_api' | 'internal_engine';
  connectionStatus: 'connected' | 'partial' | 'unconfigured';
  statusNote: string;
  requests: number;
  succeededRequests: number;
  failedRequests: number;
  quotaErrors: number;
  errorRatePct: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  measuredCostMicros: number;
  unavailableCostCount: number;
  avgLatencyMs: number | null;
  models: {
    model: string;
    requests: number;
    totalTokens: number;
    measuredCostMicros: number;
    activePricingVersion: string | null;
    pricingSourceType: PricingSourceType;
  }[];
}

export interface PerformanceIntelligenceSummary {
  totalTasksMeasured: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  timeoutCount: number;
  retryCount: number;
  avgQueueWaitMs: number | null;
  avgExecutionDurationMs: number | null;
  avgProviderLatencyMs: number | null;
  avgWorkflowCompletionMs: number | null;
  completionRatePct: number | null;
  failureRatePct: number | null;
}

export interface DailySpendPoint {
  date: string;
  requests: number;
  totalTokens: number;
  measuredCostMicros: number;
  failedRequests: number;
}

export interface UsageAnalyticsDashboardPayload {
  tenantId: string;
  projectId: string;
  generatedAt: string;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  overview: {
    totalRequests: number;
    measuredTokenEvents: number;
    unavailableTokenEvents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedInputTokens: number;
    totalTokens: number;
    totalMeasuredCostMicros: number;
    todayMeasuredCostMicros: number;
    unpricedCostEvents: number;
    activeExecutions: number;
    failedExecutions: number;
    avgLatencyMs: number | null;
    costBasisCounts: Record<CostBasis, number>;
  };
  performance: PerformanceIntelligenceSummary;
  agents: AgentUsageAnalyticsRow[];
  workflows: WorkflowUsageAnalyticsRow[];
  providers: ProviderAnalyticsRow[];
  pricingVersions: ProviderPricingVersionRecord[];
  budgets: UsageBudgetEvaluation[];
  alerts: UsageBudgetAlertRecord[];
  dailySpend: DailySpendPoint[];
  canManagePricingAndBudgets: boolean;
}

export interface AgentStationUsageSummary {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  measuredCostMicros: number | null;
  costBasis: CostBasis;
  unavailableCostCount: number;
  avgLatencyMs: number | null;
  failedRequests: number;
  retryRequests: number;
  providerModels: AgentModelBreakdown[];
}

export interface UsageLedgerFilterParams {
  agentId?: string | null;
  workflowId?: string | null;
  provider?: string | null;
  model?: string | null;
  status?: string | null;
  costBasis?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}
