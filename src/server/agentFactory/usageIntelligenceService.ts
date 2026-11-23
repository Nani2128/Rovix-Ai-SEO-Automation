import { AGENT_CATALOG } from '../../lib/agentFactoryCatalog';
import {
  aggregateAgentUsageRows,
  buildDailySpendSeries,
  evaluateBudgetsAgainstUsage,
  reconcileWorkflowUsage,
  serializeUsageLedgerToCsv,
  serializeUsageLedgerToJson,
} from '../../lib/usageCostEngine';
import type { AgentId, AgentStationId } from '../../types/agentFactory';
import type { User, UserRole } from '../../types/auth';
import type {
  AgentStationUsageSummary,
  BudgetEnforcementPolicy,
  BudgetPeriodType,
  CostBasis,
  PricingSourceType,
  ProviderAnalyticsRow,
  ProviderPricingVersionRecord,
  UsageAnalyticsDashboardPayload,
  UsageBudgetAlertRecord,
  UsageBudgetConfigRecord,
  UsageLedgerFilterParams,
  UsageLedgerRow,
  UsageReconciliationRecord,
  WorkflowCostDetailPayload,
  WorkflowUsageAnalyticsRow,
} from '../../types/usageIntelligence';
import { getOAuthIntegrationRow, getProjectById } from '../audit/db';
import { getPageSpeedApiKey } from '../env';
import { isGeminiProviderConfigured } from './contentGenerationAdapter';
import {
  getWorkflowDetailById,
  listWorkflowsForProject,
} from './orchestrationDb';
import {
  acknowledgeBudgetAlertInDb,
  createPricingVersionInDb,
  deleteBudgetConfigInDb,
  getLatestReconciliationForWorkflowInDb,
  getPerformanceTimingTelemetryInDb,
  insertBudgetAlertInDb,
  insertReconciliationRecordInDb,
  listBudgetAlertsInDb,
  listBudgetConfigsInDb,
  listPricingVersionsInDb,
  listTenantUsageLedgerRowsInDb,
  listUsageLedgerRowsInDb,
  recordUsageEventWithCostInDb,
  upsertBudgetConfigInDb,
  type RecordUsageEventInput,
} from './usageIntelligenceDb';

const GOVERNANCE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
]);

export function canManageUsageGovernance(role: UserRole): boolean {
  return GOVERNANCE_ROLES.has(role);
}

function assertGovernanceRole(role: UserRole, actionLabel: string): void {
  if (!canManageUsageGovernance(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to ${actionLabel}. Only Platform Admin, Agency Owner, or Business Owner may perform this action.`,
    );
  }
}

export type BudgetThresholdTriggerHook = (event: {
  tenantId: string;
  projectId: string;
  budgetId: string;
  alertType: string;
  periodWindow: string;
  measuredSpendMicros: number;
  budgetLimitMicros: number | null;
  message: string;
}) => void;

let budgetThresholdTriggerHook: BudgetThresholdTriggerHook | null = null;

export function setBudgetThresholdTriggerHook(
  hook: BudgetThresholdTriggerHook | null,
): void {
  budgetThresholdTriggerHook = hook;
}

/**
 * Centralized Stage 5 usage recording entry point.
 * Persists the immutable event + cost calculation idempotently and evaluates active budgets for alerts.
 */
export function recordAgentExecutionUsage(
  input: RecordUsageEventInput,
): { row: UsageLedgerRow; deduplicated: boolean } {
  const result = recordUsageEventWithCostInDb(input);

  // Evaluate budgets asynchronously-safe after a new non-deduplicated event is recorded
  if (!result.deduplicated) {
    try {
      const budgets = listBudgetConfigsInDb(input.tenantId, input.projectId).filter(
        (b) => b.enabled,
      );
      if (budgets.length > 0) {
        const tenantRows = listTenantUsageLedgerRowsInDb(input.tenantId, 2000);
        const evalRes = evaluateBudgetsAgainstUsage({
          budgets,
          rows: tenantRows,
          targetWorkflowId: input.workflowId ?? null,
          targetAgentIds: [input.agentId],
        });
        for (const alert of evalRes.triggeredAlerts) {
          insertBudgetAlertInDb({
            budgetId: alert.budgetId,
            tenantId: input.tenantId,
            projectId: input.projectId,
            workflowId: input.workflowId ?? null,
            agentId: input.agentId,
            alertType: alert.alertType,
            periodWindow: alert.periodWindow,
            measuredSpendMicros: alert.measuredSpendMicros,
            budgetLimitMicros: alert.budgetLimitMicros,
            measuredTokens: alert.measuredTokens,
            tokenLimit: alert.tokenLimit,
            message: alert.message,
          });
          if (budgetThresholdTriggerHook) {
            try {
              budgetThresholdTriggerHook({
                tenantId: input.tenantId,
                projectId: input.projectId,
                budgetId: alert.budgetId,
                alertType: alert.alertType,
                periodWindow: alert.periodWindow,
                measuredSpendMicros: alert.measuredSpendMicros,
                budgetLimitMicros: alert.budgetLimitMicros,
                message: alert.message,
              });
            } catch {
              // Non-fatal
            }
          }
        }
      }
    } catch {
      // Never block execution telemetry if alert recording encounters a transient lock
    }
  }

  return result;
}

/**
 * Evaluates configured budgets before launching a workflow or studio execution.
 * Enforces `warn_only`, `pause_execution`, and `require_approval` policies strictly.
 */
export function enforceBudgetsBeforeWorkflowLaunch(params: {
  tenantId: string;
  projectId: string;
  targetAgentIds: AgentId[];
  workflowId?: string | null;
  budgetApprovalBypassedBy?: User | null;
}): {
  allowed: boolean;
  requiresApproval: boolean;
  blockingAction: 'allow' | 'warn' | 'pause_execution' | 'require_approval';
  blockingReason: string | null;
  alertsRecorded: UsageBudgetAlertRecord[];
} {
  const budgets = listBudgetConfigsInDb(params.tenantId, params.projectId).filter(
    (b) => b.enabled,
  );
  if (budgets.length === 0) {
    return {
      allowed: true,
      requiresApproval: false,
      blockingAction: 'allow',
      blockingReason: null,
      alertsRecorded: [],
    };
  }

  const tenantRows = listTenantUsageLedgerRowsInDb(params.tenantId, 2000);
  const evalRes = evaluateBudgetsAgainstUsage({
    budgets,
    rows: tenantRows,
    targetWorkflowId: params.workflowId ?? null,
    targetAgentIds: params.targetAgentIds,
  });

  const alertsRecorded: UsageBudgetAlertRecord[] = [];
  for (const trig of evalRes.triggeredAlerts) {
    alertsRecorded.push(
      insertBudgetAlertInDb({
        budgetId: trig.budgetId,
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: params.workflowId ?? null,
        agentId: null,
        alertType: trig.alertType,
        periodWindow: trig.periodWindow,
        measuredSpendMicros: trig.measuredSpendMicros,
        budgetLimitMicros: trig.budgetLimitMicros,
        measuredTokens: trig.measuredTokens,
        tokenLimit: trig.tokenLimit,
        message: trig.message,
      }),
    );
  }

  if (evalRes.blockingAction === 'pause_execution') {
    return {
      allowed: false,
      requiresApproval: false,
      blockingAction: 'pause_execution',
      blockingReason: evalRes.blockingReason,
      alertsRecorded,
    };
  }

  if (evalRes.blockingAction === 'require_approval') {
    const canBypass =
      params.budgetApprovalBypassedBy &&
      canManageUsageGovernance(params.budgetApprovalBypassedBy.role);
    if (!canBypass) {
      return {
        allowed: false,
        requiresApproval: true,
        blockingAction: 'require_approval',
        blockingReason: evalRes.blockingReason,
        alertsRecorded,
      };
    }
  }

  return {
    allowed: true,
    requiresApproval: false,
    blockingAction: evalRes.blockingAction,
    blockingReason: evalRes.blockingReason,
    alertsRecorded,
  };
}

/**
 * Reconciles a workflow's immutable usage events against its aggregated cost and persists
 * a reconciliation audit record.
 */
export function reconcileAndPersistWorkflowUsage(
  tenantId: string,
  projectId: string,
  workflowId: string,
): UsageReconciliationRecord | null {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail || detail.workflow.projectId !== projectId) return null;

  const rows = listUsageLedgerRowsInDb(tenantId, projectId, {
    workflowId,
    limit: 1000,
  });
  const taskTitleMap = new Map(
    detail.tasks.map((t) => [t.id, { title: t.title, nodeKey: t.nodeKey }]),
  );

  const reconciled = reconcileWorkflowUsage({
    workflowId,
    workflowName: detail.workflow.name,
    templateId: detail.workflow.templateId,
    status: detail.workflow.status,
    createdAt: detail.workflow.createdAt,
    completedAt: detail.workflow.completedAt,
    rows,
    taskTitleMap,
  });

  return insertReconciliationRecordInDb({
    tenantId,
    projectId,
    workflowId,
    ...reconciled.reconciliation,
  });
}

function buildProviderAnalyticsRows(params: {
  tenantId: string;
  projectId: string;
  rows: UsageLedgerRow[];
  pricingVersions: ProviderPricingVersionRecord[];
}): ProviderAnalyticsRow[] {
  const geminiConfigured = isGeminiProviderConfigured();
  const hasPsiKey = getPageSpeedApiKey() !== null;
  const gscConn = getOAuthIntegrationRow(params.tenantId, params.projectId, 'gsc');
  const hasSerpKey = Boolean(
    process.env.SERPER_API_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim(),
  );

  // Only genuinely integrated Rovix providers — never fake disconnected SaaS vendors
  const baseProviders: {
    provider: string;
    displayName: string;
    category: ProviderAnalyticsRow['category'];
    connectionStatus: ProviderAnalyticsRow['connectionStatus'];
    statusNote: string;
  }[] = [
    {
      provider: 'google_gemini',
      displayName: 'Google Gemini (@google/genai)',
      category: 'llm',
      connectionStatus: geminiConfigured ? 'connected' : 'unconfigured',
      statusNote: geminiConfigured
        ? 'GEMINI_API_KEY configured on server (actual usageMetadata tracked per request)'
        : 'GEMINI_API_KEY not configured on server',
    },
    {
      provider: 'google_pagespeed_insights',
      displayName: 'Google PageSpeed Insights v5',
      category: 'external_seo_api',
      connectionStatus: hasPsiKey ? 'connected' : 'partial',
      statusNote: hasPsiKey
        ? 'Dedicated PageSpeed Insights API key configured'
        : 'Public quota mode (optional PSI API key not set)',
    },
    {
      provider: 'google_search_console',
      displayName: 'Google Search Console OAuth',
      category: 'external_seo_api',
      connectionStatus: gscConn?.status === 'Connected' ? 'connected' : 'unconfigured',
      statusNote:
        gscConn?.status === 'Connected'
          ? 'Project OAuth property connected'
          : 'Not connected for this project',
    },
    {
      provider: 'serp_discovery',
      displayName: 'SERP Discovery Provider',
      category: 'external_seo_api',
      connectionStatus: hasSerpKey ? 'connected' : 'unconfigured',
      statusNote: hasSerpKey
        ? 'SERP API key configured'
        : 'Optional SERP API key not configured (direct HTML analyzer active)',
    },
    {
      provider: 'rovix_backend_service',
      displayName: 'Rovix SEO Engine (Crawler / Keyword / Geo / QA)',
      category: 'internal_engine',
      connectionStatus: 'connected',
      statusNote: 'Internal non-billed specialist execution services',
    },
    {
      provider: 'rovix_workflow_studio',
      displayName: 'Rovix Workflow Studio Runtime',
      category: 'internal_engine',
      connectionStatus: 'connected',
      statusNote: 'Internal trigger, condition, transform, and approval node runner',
    },
  ];

  // Include any additional provider strings present in recorded ledger rows
  const knownSet = new Set(baseProviders.map((p) => p.provider));
  for (const { event } of params.rows) {
    if (!knownSet.has(event.provider)) {
      knownSet.add(event.provider);
      baseProviders.push({
        provider: event.provider,
        displayName: event.provider,
        category: 'llm',
        connectionStatus: 'connected',
        statusNote: 'Recorded via persisted usage ledger',
      });
    }
  }

  const activePricingByProviderModel = new Map<string, ProviderPricingVersionRecord>();
  for (const pv of params.pricingVersions) {
    if (!pv.isActive) continue;
    const key = `${pv.provider}::${pv.model}`;
    // Tenant-specific active pricing takes precedence over global seed
    const existing = activePricingByProviderModel.get(key);
    if (!existing || (pv.tenantId !== null && existing.tenantId === null)) {
      activePricingByProviderModel.set(key, pv);
    }
  }

  return baseProviders.map((meta) => {
    const providerRows = params.rows.filter((r) => r.event.provider === meta.provider);
    let succeededRequests = 0;
    let failedRequests = 0;
    let quotaErrors = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let totalTokens = 0;
    let measuredCostMicros = 0;
    let unavailableCostCount = 0;
    let latencySum = 0;
    let latencyCount = 0;

    const modelAcc = new Map<
      string,
      { model: string; requests: number; totalTokens: number; measuredCostMicros: number }
    >();

    for (const { event, cost } of providerRows) {
      if (event.status === 'succeeded') succeededRequests += 1;
      else failedRequests += 1;
      if (event.isQuotaError) quotaErrors += 1;
      inputTokens += event.inputTokens ?? 0;
      outputTokens += event.outputTokens ?? 0;
      cachedInputTokens += event.cachedInputTokens ?? 0;
      totalTokens += event.totalTokens ?? 0;

      if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
        measuredCostMicros += cost.totalCostMicros;
      } else {
        unavailableCostCount += 1;
      }
      if (event.latencyMs !== null && event.latencyMs >= 0) {
        latencySum += event.latencyMs;
        latencyCount += 1;
      }

      const modelKey = event.model ?? 'default';
      const m = modelAcc.get(modelKey) ?? {
        model: modelKey,
        requests: 0,
        totalTokens: 0,
        measuredCostMicros: 0,
      };
      m.requests += 1;
      m.totalTokens += event.totalTokens ?? 0;
      if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
        m.measuredCostMicros += cost.totalCostMicros;
      }
      modelAcc.set(modelKey, m);
    }

    // Ensure configured models for google_gemini appear even when 0 requests yet
    if (meta.provider === 'google_gemini') {
      for (const pv of activePricingByProviderModel.values()) {
        if (pv.provider === 'google_gemini' && !modelAcc.has(pv.model)) {
          modelAcc.set(pv.model, {
            model: pv.model,
            requests: 0,
            totalTokens: 0,
            measuredCostMicros: 0,
          });
        }
      }
    }

    const models = Array.from(modelAcc.values())
      .map((m) => {
        const pv =
          activePricingByProviderModel.get(`${meta.provider}::${m.model}`) ??
          activePricingByProviderModel.get(`${meta.provider}::*`) ??
          null;
        return {
          ...m,
          activePricingVersion: pv?.pricingVersion ?? null,
          pricingSourceType: pv?.sourceType ?? ('unconfigured' as PricingSourceType),
        };
      })
      .sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));

    return {
      ...meta,
      requests: providerRows.length,
      succeededRequests,
      failedRequests,
      quotaErrors,
      errorRatePct:
        providerRows.length > 0
          ? Math.round((failedRequests / providerRows.length) * 1000) / 10
          : null,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalTokens,
      measuredCostMicros,
      unavailableCostCount,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
      models,
    };
  });
}

export function buildUsageAnalyticsDashboard(params: {
  tenantId: string;
  projectId: string;
  userRole: UserRole;
  from?: string | null;
  to?: string | null;
}): UsageAnalyticsDashboardPayload {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const nowIso = new Date().toISOString();
  const todayPrefix = nowIso.slice(0, 10);

  const ledgerRows = listUsageLedgerRowsInDb(params.tenantId, params.projectId, {
    from: params.from ?? null,
    to: params.to ?? null,
    limit: 2000,
  });
  const pricingVersions = listPricingVersionsInDb(params.tenantId);
  const budgets = listBudgetConfigsInDb(params.tenantId, params.projectId);
  const alerts = listBudgetAlertsInDb(params.tenantId, params.projectId, 60);
  const timing = getPerformanceTimingTelemetryInDb(params.tenantId, params.projectId);

  // Overview aggregates strictly from deduplicated ledgerRows
  let measuredTokenEvents = 0;
  let unavailableTokenEvents = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalTokens = 0;
  let totalMeasuredCostMicros = 0;
  let todayMeasuredCostMicros = 0;
  let unpricedCostEvents = 0;
  let failedExecutions = 0;
  let latencySum = 0;
  let latencyCount = 0;
  const costBasisCounts: Record<CostBasis, number> = {
    provider_reported_billed: 0,
    calculated_actual_tokens: 0,
    estimated: 0,
    internal_non_billed: 0,
    unavailable: 0,
  };

  for (const { event, cost } of ledgerRows) {
    costBasisCounts[cost.costBasis] += 1;
    if (event.measurementStatus === 'unavailable') unavailableTokenEvents += 1;
    else measuredTokenEvents += 1;

    totalInputTokens += event.inputTokens ?? 0;
    totalOutputTokens += event.outputTokens ?? 0;
    totalCachedInputTokens += event.cachedInputTokens ?? 0;
    totalTokens += event.totalTokens ?? 0;

    if (cost.totalCostMicros !== null && cost.costBasis !== 'unavailable') {
      totalMeasuredCostMicros += cost.totalCostMicros;
      if (event.requestTimestamp.startsWith(todayPrefix)) {
        todayMeasuredCostMicros += cost.totalCostMicros;
      }
    } else {
      unpricedCostEvents += 1;
    }

    if (event.status !== 'succeeded') failedExecutions += 1;
    if (event.latencyMs !== null && event.latencyMs >= 0) {
      latencySum += event.latencyMs;
      latencyCount += 1;
    }
  }

  // Per-agent analytics
  const agents = aggregateAgentUsageRows({
    rows: ledgerRows,
    agentCatalog: AGENT_CATALOG.map((a) => ({ agentId: a.agentId, name: a.name })),
    taskTimingByAgent: timing.perAgentTiming,
  });

  // Per-workflow reconciliation (strictly zero double-counting)
  const persistedWorkflows = listWorkflowsForProject(
    params.tenantId,
    params.projectId,
    60,
  );
  const workflows: WorkflowUsageAnalyticsRow[] = persistedWorkflows.map((wf) => {
    const wfRows = ledgerRows.filter((r) => r.event.workflowId === wf.id);
    return reconcileWorkflowUsage({
      workflowId: wf.id,
      workflowName: wf.name,
      templateId: wf.templateId,
      status: wf.status,
      createdAt: wf.createdAt,
      completedAt: wf.completedAt,
      rows: wfRows,
    }).summary;
  });
  workflows.sort(
    (a, b) =>
      b.measuredCostMicros - a.measuredCostMicros ||
      b.totalTokens - a.totalTokens ||
      b.createdAt.localeCompare(a.createdAt),
  );

  // Provider analytics
  const providers = buildProviderAnalyticsRows({
    tenantId: params.tenantId,
    projectId: params.projectId,
    rows: ledgerRows,
    pricingVersions,
  });

  // Budget evaluations (against tenant rows so tenant-scoped budgets see all tenant spend)
  const allTenantRows = listTenantUsageLedgerRowsInDb(params.tenantId, 2000);
  const budgetEval = evaluateBudgetsAgainstUsage({
    budgets,
    rows: allTenantRows,
  });

  const dailySpend = buildDailySpendSeries(ledgerRows);

  return {
    tenantId: params.tenantId,
    projectId: params.projectId,
    generatedAt: nowIso,
    dateRange: {
      from: params.from ?? null,
      to: params.to ?? null,
    },
    overview: {
      totalRequests: ledgerRows.length,
      measuredTokenEvents,
      unavailableTokenEvents,
      totalInputTokens,
      totalOutputTokens,
      totalCachedInputTokens,
      totalTokens,
      totalMeasuredCostMicros,
      todayMeasuredCostMicros,
      unpricedCostEvents,
      activeExecutions: timing.activeExecutions,
      failedExecutions,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
      costBasisCounts,
    },
    performance: timing.summary,
    agents,
    workflows,
    providers,
    pricingVersions,
    budgets: budgetEval.evaluations,
    alerts,
    dailySpend,
    canManagePricingAndBudgets: canManageUsageGovernance(params.userRole),
  };
}

export function getWorkflowCostDetail(
  tenantId: string,
  projectId: string,
  workflowId: string,
): WorkflowCostDetailPayload {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail || detail.workflow.projectId !== projectId) {
    throw new Error('NOT_FOUND: Workflow not found.');
  }

  const rows = listUsageLedgerRowsInDb(tenantId, projectId, {
    workflowId,
    limit: 1000,
  });
  const taskTitleMap = new Map(
    detail.tasks.map((t) => [t.id, { title: t.title, nodeKey: t.nodeKey }]),
  );

  const reconciled = reconcileWorkflowUsage({
    workflowId: detail.workflow.id,
    workflowName: detail.workflow.name,
    templateId: detail.workflow.templateId,
    status: detail.workflow.status,
    createdAt: detail.workflow.createdAt,
    completedAt: detail.workflow.completedAt,
    rows,
    taskTitleMap,
  });

  const latestRecon = getLatestReconciliationForWorkflowInDb(
    tenantId,
    projectId,
    workflowId,
  );

  return {
    summary: reconciled.summary,
    tasks: reconciled.tasks,
    ledgerRows: rows,
    reconciliation: latestRecon,
  };
}

/**
 * Compact per-agent measured usage & cost summary for Agent Factory 3D station overlays and Inspector Drawer.
 */
export function getPerAgentStationUsageSummaryMap(
  tenantId: string,
  projectId: string,
): Map<AgentId, AgentStationUsageSummary> {
  const rows = listUsageLedgerRowsInDb(tenantId, projectId, { limit: 1500 });
  const aggregated = aggregateAgentUsageRows({
    rows,
    agentCatalog: AGENT_CATALOG.map((a) => ({ agentId: a.agentId, name: a.name })),
  });
  const map = new Map<AgentId, AgentStationUsageSummary>();
  for (const ag of aggregated) {
    const hasMeasuredCost =
      ag.totalRequests > 0 && ag.unavailableCostEventCount < ag.totalRequests;
    map.set(ag.agentId, {
      totalRequests: ag.totalRequests,
      totalTokens: ag.totalTokens,
      inputTokens: ag.inputTokens,
      outputTokens: ag.outputTokens,
      cachedInputTokens: ag.cachedInputTokens,
      measuredCostMicros: hasMeasuredCost ? ag.measuredCostMicros : null,
      costBasis: ag.primaryCostBasis,
      unavailableCostCount: ag.unavailableCostEventCount,
      avgLatencyMs: ag.avgLatencyMs,
      failedRequests: ag.failedRequests,
      retryRequests: ag.retryRequests,
      providerModels: ag.providerModels,
    });
  }
  return map;
}

export function listUsageLedgerForProject(
  tenantId: string,
  projectId: string,
  filters?: UsageLedgerFilterParams,
): UsageLedgerRow[] {
  const project = getProjectById(tenantId, projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');
  return listUsageLedgerRowsInDb(tenantId, projectId, filters);
}

export function createWorkspacePricingVersion(params: {
  tenantId: string;
  user: User;
  provider: string;
  model: string;
  inputPricePer1mMicros: number | null;
  outputPricePer1mMicros: number | null;
  cachedInputPricePer1mMicros?: number | null;
  currency?: string;
  effectiveDate?: string;
  sourceOfPricing: string;
  sourceType?: PricingSourceType;
  pricingVersion?: string;
  auditNote?: string | null;
}): ProviderPricingVersionRecord {
  assertGovernanceRole(params.user.role, 'configure provider pricing versions');

  if (!params.provider.trim() || !params.model.trim()) {
    throw new Error('BAD_REQUEST: Provider and model identifier are required.');
  }
  if (!params.sourceOfPricing.trim()) {
    throw new Error('BAD_REQUEST: Source of pricing is required for auditability.');
  }
  if (
    params.inputPricePer1mMicros !== null &&
    (!Number.isFinite(params.inputPricePer1mMicros) || params.inputPricePer1mMicros < 0)
  ) {
    throw new Error('BAD_REQUEST: Input price per 1M tokens must be a non-negative number.');
  }
  if (
    params.outputPricePer1mMicros !== null &&
    (!Number.isFinite(params.outputPricePer1mMicros) || params.outputPricePer1mMicros < 0)
  ) {
    throw new Error('BAD_REQUEST: Output price per 1M tokens must be a non-negative number.');
  }

  return createPricingVersionInDb({
    tenantId: params.tenantId,
    provider: params.provider,
    model: params.model,
    inputPricePer1mMicros:
      params.inputPricePer1mMicros !== null
        ? Math.round(params.inputPricePer1mMicros)
        : null,
    outputPricePer1mMicros:
      params.outputPricePer1mMicros !== null
        ? Math.round(params.outputPricePer1mMicros)
        : null,
    cachedInputPricePer1mMicros:
      params.cachedInputPricePer1mMicros !== undefined &&
      params.cachedInputPricePer1mMicros !== null
        ? Math.round(params.cachedInputPricePer1mMicros)
        : null,
    currency: params.currency ?? 'USD',
    effectiveDate: params.effectiveDate,
    sourceOfPricing: params.sourceOfPricing,
    sourceType: params.sourceType ?? 'workspace_configured',
    pricingVersion: params.pricingVersion,
    configuredBy: `${params.user.name} (${params.user.role})`,
    auditNote: params.auditNote ?? null,
  });
}

export function upsertWorkspaceUsageBudget(params: {
  id?: string | null;
  tenantId: string;
  projectId: string | null;
  user: User;
  scopeType: UsageBudgetConfigRecord['scopeType'];
  scopeTargetId?: string | null;
  agentId?: AgentStationId | null;
  name: string;
  periodType: BudgetPeriodType;
  budgetLimitMicros: number | null;
  maxExecutionCostMicros?: number | null;
  maxTokensPerRun?: number | null;
  warningThresholdPct: number;
  enforcementPolicy: BudgetEnforcementPolicy;
  enabled: boolean;
}): UsageBudgetConfigRecord {
  assertGovernanceRole(params.user.role, 'configure usage budgets and spending limits');

  if (!params.name.trim()) {
    throw new Error('BAD_REQUEST: Budget name is required.');
  }
  if (
    params.budgetLimitMicros === null &&
    params.maxExecutionCostMicros === null &&
    params.maxTokensPerRun === null
  ) {
    throw new Error(
      'BAD_REQUEST: Specify at least one cost limit or token limit for this budget.',
    );
  }
  if (
    params.warningThresholdPct < 1 ||
    params.warningThresholdPct > 100 ||
    !Number.isFinite(params.warningThresholdPct)
  ) {
    throw new Error('BAD_REQUEST: Warning threshold must be between 1% and 100%.');
  }

  return upsertBudgetConfigInDb({
    id: params.id ?? null,
    tenantId: params.tenantId,
    projectId: params.scopeType === 'tenant' ? null : params.projectId,
    scopeType: params.scopeType,
    scopeTargetId: params.scopeTargetId ?? null,
    agentId: params.scopeType === 'agent' ? params.agentId ?? null : null,
    name: params.name,
    periodType: params.periodType,
    budgetLimitMicros:
      params.budgetLimitMicros !== null ? Math.round(params.budgetLimitMicros) : null,
    maxExecutionCostMicros:
      params.maxExecutionCostMicros !== undefined &&
      params.maxExecutionCostMicros !== null
        ? Math.round(params.maxExecutionCostMicros)
        : null,
    maxTokensPerRun:
      params.maxTokensPerRun !== undefined && params.maxTokensPerRun !== null
        ? Math.round(params.maxTokensPerRun)
        : null,
    warningThresholdPct: params.warningThresholdPct,
    enforcementPolicy: params.enforcementPolicy,
    enabled: params.enabled,
    updatedBy: `${params.user.name} (${params.user.role})`,
  });
}

export function removeWorkspaceUsageBudget(params: {
  tenantId: string;
  budgetId: string;
  user: User;
}): boolean {
  assertGovernanceRole(params.user.role, 'delete usage budgets');
  return deleteBudgetConfigInDb(params.tenantId, params.budgetId);
}

export function acknowledgeWorkspaceBudgetAlert(params: {
  tenantId: string;
  alertId: string;
  user: User;
}): UsageBudgetAlertRecord {
  assertGovernanceRole(params.user.role, 'acknowledge spending alerts');
  const updated = acknowledgeBudgetAlertInDb(
    params.tenantId,
    params.alertId,
    `${params.user.name} (${params.user.role})`,
  );
  if (!updated) {
    throw new Error('NOT_FOUND: Budget alert not found.');
  }
  return updated;
}

export function exportProjectUsageLedger(params: {
  tenantId: string;
  projectId: string;
  format: 'csv' | 'json';
  filters?: UsageLedgerFilterParams;
}): { filename: string; contentType: string; content: string; recordCount: number } {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const rows = listUsageLedgerRowsInDb(params.tenantId, params.projectId, {
    ...params.filters,
    limit: 2000,
  });
  const stamp = new Date().toISOString().slice(0, 10);

  if (params.format === 'csv') {
    return {
      filename: `rovix-usage-ledger-${params.projectId}-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: serializeUsageLedgerToCsv(rows),
      recordCount: rows.length,
    };
  }

  return {
    filename: `rovix-usage-ledger-${params.projectId}-${stamp}.json`,
    contentType: 'application/json; charset=utf-8',
    content: serializeUsageLedgerToJson({
      tenantId: params.tenantId,
      projectId: params.projectId,
      exportedAt: new Date().toISOString(),
      rows,
    }),
    recordCount: rows.length,
  };
}
