import type { AgentStationId } from '../types/agentFactory';
import type {
  BudgetEnforcementPolicy,
  BudgetPeriodType,
  PricingSourceType,
  ProviderPricingVersionRecord,
  UsageAnalyticsDashboardPayload,
  UsageBudgetAlertRecord,
  UsageBudgetConfigRecord,
  UsageLedgerFilterParams,
  UsageLedgerRow,
  UsageReconciliationRecord,
  WorkflowCostDetailPayload,
} from '../types/usageIntelligence';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed with HTTP ${res.status}`,
    );
  }
  return payload as T;
}

function buildFilterQuery(filters?: UsageLedgerFilterParams): string {
  if (!filters) return '';
  const qs = new URLSearchParams();
  if (filters.agentId) qs.set('agentId', filters.agentId);
  if (filters.workflowId) qs.set('workflowId', filters.workflowId);
  if (filters.provider) qs.set('provider', filters.provider);
  if (filters.model) qs.set('model', filters.model);
  if (filters.status) qs.set('status', filters.status);
  if (filters.costBasis) qs.set('costBasis', filters.costBasis);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (filters.limit) qs.set('limit', String(filters.limit));
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const usageIntelligenceService = {
  async getDashboard(
    projectId: string,
    opts?: { from?: string | null; to?: string | null },
  ): Promise<UsageAnalyticsDashboardPayload> {
    const qs = new URLSearchParams();
    if (opts?.from) qs.set('from', opts.from);
    if (opts?.to) qs.set('to', opts.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/dashboard${suffix}`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<UsageAnalyticsDashboardPayload>(res);
  },

  async getWorkflowCostDetail(
    projectId: string,
    workflowId: string,
  ): Promise<WorkflowCostDetailPayload> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/workflows/${encodeURIComponent(workflowId)}`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<WorkflowCostDetailPayload>(res);
  },

  async reconcileWorkflow(
    projectId: string,
    workflowId: string,
  ): Promise<UsageReconciliationRecord> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/workflows/${encodeURIComponent(workflowId)}/reconcile`,
      { method: 'POST', credentials: 'include' },
    );
    return parseJsonOrThrow<UsageReconciliationRecord>(res);
  },

  async getLedger(
    projectId: string,
    filters?: UsageLedgerFilterParams,
  ): Promise<{ rows: UsageLedgerRow[]; totalCount: number }> {
    const suffix = buildFilterQuery(filters);
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/ledger${suffix}`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<{ rows: UsageLedgerRow[]; totalCount: number }>(res);
  },

  async createPricingVersion(
    projectId: string,
    input: {
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
      auditNote?: string;
    },
  ): Promise<ProviderPricingVersionRecord> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/pricing`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return parseJsonOrThrow<ProviderPricingVersionRecord>(res);
  },

  async upsertBudget(
    projectId: string,
    input: {
      id?: string;
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
    },
  ): Promise<UsageBudgetConfigRecord> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/budgets`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return parseJsonOrThrow<UsageBudgetConfigRecord>(res);
  },

  async deleteBudget(projectId: string, budgetId: string): Promise<void> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/budgets/${encodeURIComponent(budgetId)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    await parseJsonOrThrow<{ ok: boolean }>(res);
  },

  async acknowledgeAlert(
    projectId: string,
    alertId: string,
  ): Promise<UsageBudgetAlertRecord> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      { method: 'POST', credentials: 'include' },
    );
    return parseJsonOrThrow<UsageBudgetAlertRecord>(res);
  },

  async downloadExport(
    projectId: string,
    format: 'csv' | 'json',
    filters?: UsageLedgerFilterParams,
  ): Promise<{ filename: string; sizeBytes: number }> {
    const qs = new URLSearchParams();
    qs.set('format', format);
    if (filters?.agentId) qs.set('agentId', filters.agentId);
    if (filters?.workflowId) qs.set('workflowId', filters.workflowId);
    if (filters?.provider) qs.set('provider', filters.provider);
    if (filters?.model) qs.set('model', filters.model);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.costBasis) qs.set('costBasis', filters.costBasis);
    if (filters?.from) qs.set('from', filters.from);
    if (filters?.to) qs.set('to', filters.to);

    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/usage/export?${qs.toString()}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        typeof (err as { error?: unknown }).error === 'string'
          ? (err as { error: string }).error
          : `Export failed with HTTP ${res.status}`,
      );
    }

    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') ?? '';
    const match = disp.match(/filename="([^"]+)"/);
    const filename =
      match?.[1] ??
      `rovix-usage-ledger-${projectId}.${format}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { filename, sizeBytes: blob.size };
  },
};
