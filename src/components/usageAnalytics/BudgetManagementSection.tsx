import { useState, type FormEvent } from 'react';
import { AGENT_CATALOG } from '../../lib/agentFactoryCatalog';
import { formatMicroUsd, usdToMicros } from '../../lib/usageCostEngine';
import { usageIntelligenceService } from '../../services/usageIntelligenceService';
import type { AgentStationId } from '../../types/agentFactory';
import type {
  BudgetEnforcementPolicy,
  BudgetPeriodType,
  UsageAnalyticsDashboardPayload,
  UsageBudgetConfigRecord,
} from '../../types/usageIntelligence';

const PERIOD_LABELS: Record<BudgetPeriodType, string> = {
  daily: 'Daily (UTC)',
  weekly: 'Weekly (7-day UTC)',
  monthly: 'Monthly (UTC)',
  per_workflow: 'Per Workflow Run',
  per_agent: 'Per Agent',
};

const POLICY_LABELS: Record<BudgetEnforcementPolicy, string> = {
  warn_only: 'Warn Only (Emit Alert)',
  pause_execution: 'Pause Execution (Block Launch)',
  require_approval: 'Require Human Approval',
};

const SPECIALIST_AGENTS = AGENT_CATALOG.filter((a) => !a.isOrchestrator);

function formatIsoShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BudgetManagementSection({
  projectId,
  dashboard,
  onBudgetsUpdated,
}: {
  projectId: string;
  dashboard: UsageAnalyticsDashboardPayload;
  onBudgetsUpdated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] =
    useState<UsageBudgetConfigRecord['scopeType']>('project');
  const [agentId, setAgentId] = useState<AgentStationId>('content_generation_agent');
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('daily');
  const [budgetLimitUsd, setBudgetLimitUsd] = useState('10.00');
  const [maxExecutionUsd, setMaxExecutionUsd] = useState('');
  const [maxTokensPerRun, setMaxTokensPerRun] = useState('');
  const [warningThresholdPct, setWarningThresholdPct] = useState('80');
  const [enforcementPolicy, setEnforcementPolicy] =
    useState<BudgetEnforcementPolicy>('warn_only');

  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyBudgetId, setBusyBudgetId] = useState<string | null>(null);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  async function handleCreateBudget(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Budget policy name is required.');
      return;
    }

    const parsedLimitUsd = budgetLimitUsd.trim() ? Number(budgetLimitUsd) : null;
    const parsedMaxExecUsd = maxExecutionUsd.trim()
      ? Number(maxExecutionUsd)
      : null;
    const parsedMaxTokens = maxTokensPerRun.trim()
      ? Math.trunc(Number(maxTokensPerRun))
      : null;
    const parsedWarningPct = Number(warningThresholdPct);

    if (
      parsedLimitUsd !== null &&
      (!Number.isFinite(parsedLimitUsd) || parsedLimitUsd <= 0)
    ) {
      setFormError('Period spend limit must be greater than $0.');
      return;
    }
    if (
      parsedMaxExecUsd !== null &&
      (!Number.isFinite(parsedMaxExecUsd) || parsedMaxExecUsd <= 0)
    ) {
      setFormError('Max single execution cost must be greater than $0.');
      return;
    }
    if (
      parsedMaxTokens !== null &&
      (!Number.isFinite(parsedMaxTokens) || parsedMaxTokens <= 0)
    ) {
      setFormError('Max tokens per run must be a positive integer.');
      return;
    }
    if (
      parsedLimitUsd === null &&
      parsedMaxExecUsd === null &&
      parsedMaxTokens === null
    ) {
      setFormError(
        'Provide at least one cap: period spend limit, max execution cost, or max tokens per run.',
      );
      return;
    }
    if (
      !Number.isFinite(parsedWarningPct) ||
      parsedWarningPct < 10 ||
      parsedWarningPct > 100
    ) {
      setFormError('Warning threshold must be between 10% and 100%.');
      return;
    }

    setSubmitting(true);
    try {
      await usageIntelligenceService.upsertBudget(projectId, {
        name: trimmedName,
        scopeType,
        agentId: scopeType === 'agent' ? agentId : null,
        periodType,
        budgetLimitMicros:
          parsedLimitUsd !== null ? usdToMicros(parsedLimitUsd) : null,
        maxExecutionCostMicros:
          parsedMaxExecUsd !== null ? usdToMicros(parsedMaxExecUsd) : null,
        maxTokensPerRun: parsedMaxTokens,
        warningThresholdPct: Math.round(parsedWarningPct),
        enforcementPolicy,
        enabled: true,
      });
      setName('');
      setMaxExecutionUsd('');
      setMaxTokensPerRun('');
      setFormSuccess(
        `Saved budget policy "${trimmedName}". Active policies are evaluated before new workflow launches.`,
      );
      await onBudgetsUpdated();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save budget policy.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteBudget(budgetId: string) {
    setBusyBudgetId(budgetId);
    setFormError(null);
    setFormSuccess(null);
    try {
      await usageIntelligenceService.deleteBudget(projectId, budgetId);
      setConfirmDeleteId(null);
      setFormSuccess('Budget policy removed.');
      await onBudgetsUpdated();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to remove budget policy.',
      );
    } finally {
      setBusyBudgetId(null);
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    setBusyAlertId(alertId);
    try {
      await usageIntelligenceService.acknowledgeAlert(projectId, alertId);
      await onBudgetsUpdated();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to acknowledge alert.',
      );
    } finally {
      setBusyAlertId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Configured Budgets & Live Utilization */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Active Budget Policies &amp; Utilization
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Evaluated directly against measured provider spend before launching new multi-agent workflows
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
            {dashboard.budgets.length} configured
          </span>
        </div>

        {dashboard.budgets.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs text-[var(--text-secondary)]">
            No budget policies are active for this workspace yet. Create a daily, weekly,
            monthly, per-workflow, or per-agent cap below.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border-hairline)]">
            {dashboard.budgets.map((ev) => {
              const b = ev.budget;
              const pct = Math.min(100, Math.max(0, ev.utilizationPct ?? 0));
              const statusTone =
                ev.status === 'limit_reached'
                  ? 'text-red-600 dark:text-red-400'
                  : ev.status === 'warning'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400';
              const barTone =
                ev.status === 'limit_reached'
                  ? 'bg-red-600'
                  : ev.status === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-600';

              const limitDisplay =
                b.budgetLimitMicros !== null
                  ? formatMicroUsd(b.budgetLimitMicros)
                  : b.maxTokensPerRun !== null
                    ? `${b.maxTokensPerRun.toLocaleString()} tokens`
                    : 'Token/Run cap';

              return (
                <div key={b.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
                          {b.name}
                        </span>
                        <span className={`font-semibold ${statusTone}`}>
                          {ev.status === 'limit_reached'
                            ? 'Limit Reached'
                            : ev.status === 'warning'
                              ? 'Warning Threshold'
                              : 'Within Budget'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Scope: {b.scopeType}
                        {b.agentId ? ` (${b.agentId})` : ''} ·{' '}
                        {PERIOD_LABELS[b.periodType]} · {ev.periodWindowLabel} ·{' '}
                        Policy: {POLICY_LABELS[b.enforcementPolicy]}
                      </div>
                      {(b.maxExecutionCostMicros !== null ||
                        b.maxTokensPerRun !== null) && (
                        <div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                          {b.maxExecutionCostMicros !== null
                            ? `Max run cost ${formatMicroUsd(b.maxExecutionCostMicros)}`
                            : ''}
                          {b.maxExecutionCostMicros !== null &&
                          b.maxTokensPerRun !== null
                            ? ' · '
                            : ''}
                          {b.maxTokensPerRun !== null
                            ? `Max ${b.maxTokensPerRun.toLocaleString()} tokens/run`
                            : ''}
                        </div>
                      )}
                      {ev.unpricedEventCount > 0 && (
                        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          Note: {ev.unpricedEventCount} unpriced usage event(s) in this
                          window have unavailable USD cost and are excluded from spend total.
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right font-mono text-xs tabular-nums">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {formatMicroUsd(ev.measuredSpendMicros)} / {limitDisplay}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {ev.utilizationPct !== null
                            ? `${ev.utilizationPct.toFixed(1)}% used`
                            : `${ev.measuredTokens.toLocaleString()} tokens`}
                          {ev.remainingMicros !== null
                            ? ` · ${formatMicroUsd(Math.max(0, ev.remainingMicros))} left`
                            : ''}
                        </div>
                      </div>

                      {dashboard.canManagePricingAndBudgets && (
                        <div className="flex items-center gap-1.5">
                          {confirmDeleteId === b.id ? (
                            <>
                              <button
                                type="button"
                                disabled={busyBudgetId === b.id}
                                onClick={() => void handleDeleteBudget(b.id)}
                                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {busyBudgetId === b.id ? 'Removing…' : 'Confirm Delete'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete budget ${b.name}`}
                              onClick={() => setConfirmDeleteId(b.id)}
                              className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-red-500/60 hover:text-red-600 dark:hover:text-red-400 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={`h-full rounded-full transition-all ${barTone}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create Budget Policy Form (RBAC-Gated) */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Create Spending or Token Budget Policy
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Enforce automated warnings, workflow launch pauses, or human approval gates when limits are reached
            </p>
          </div>
          {!dashboard.canManagePricingAndBudgets && (
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Read-only · Requires Platform Admin, Agency Owner, or Business Owner role
            </span>
          )}
        </div>

        {dashboard.canManagePricingAndBudgets ? (
          <form onSubmit={(e) => void handleCreateBudget(e)} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Budget Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Gemini Spend Guardrail"
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Scope
                </span>
                <select
                  value={scopeType}
                  onChange={(e) =>
                    setScopeType(
                      e.target.value as UsageBudgetConfigRecord['scopeType'],
                    )
                  }
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                >
                  <option value="project">Current Project</option>
                  <option value="tenant">Entire Tenant Workspace</option>
                  <option value="agent">Specific Specialist Agent</option>
                </select>
              </label>

              {scopeType === 'agent' ? (
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-[var(--text-secondary)]">
                    Target Agent
                  </span>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value as AgentStationId)}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                  >
                    {SPECIALIST_AGENTS.map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-[var(--text-secondary)]">
                    Budget Period
                  </span>
                  <select
                    value={periodType}
                    onChange={(e) =>
                      setPeriodType(e.target.value as BudgetPeriodType)
                    }
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                  >
                    <option value="daily">Daily (UTC)</option>
                    <option value="weekly">Weekly (7-day UTC)</option>
                    <option value="monthly">Monthly (UTC)</option>
                    <option value="per_workflow">Per Workflow Run</option>
                    <option value="per_agent">Per Agent</option>
                  </select>
                </label>
              )}

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Period Spend Limit (USD)
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={budgetLimitUsd}
                  onChange={(e) => setBudgetLimitUsd(e.target.value)}
                  placeholder="10.00"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Max Cost per Execution (USD, optional)
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={maxExecutionUsd}
                  onChange={(e) => setMaxExecutionUsd(e.target.value)}
                  placeholder="1.50"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Max Tokens per Run (optional)
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={maxTokensPerRun}
                  onChange={(e) => setMaxTokensPerRun(e.target.value)}
                  placeholder="250000"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Warning Threshold (%)
                </span>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={warningThresholdPct}
                  onChange={(e) => setWarningThresholdPct(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs sm:col-span-2">
                <span className="font-medium text-[var(--text-secondary)]">
                  Enforcement Policy When Limit Reached
                </span>
                <select
                  value={enforcementPolicy}
                  onChange={(e) =>
                    setEnforcementPolicy(e.target.value as BudgetEnforcementPolicy)
                  }
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                >
                  <option value="warn_only">
                    Warn Only — Log persistent spending alert and continue
                  </option>
                  <option value="pause_execution">
                    Pause Execution — Block new workflow launches (HTTP 402)
                  </option>
                  <option value="require_approval">
                    Require Approval — Hold launch for owner override (HTTP 409)
                  </option>
                </select>
              </label>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-300/70 bg-red-50/70 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300"
              >
                {formError}
              </div>
            )}

            {formSuccess && (
              <div
                role="status"
                className="rounded-xl border border-emerald-300/70 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300"
              >
                {formSuccess}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {submitting ? 'Saving Budget…' : 'Create Budget Policy'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            Budget governance policies can only be created or modified by Platform Admin,
            Agency Owner, or Business Owner accounts.
          </div>
        )}
      </section>

      {/* Persistent Budget Alerts Feed */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Budget &amp; Threshold Alerts
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Persistent audit log of threshold warnings, paused executions, and approval blocks
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
            {dashboard.alerts.length} alert(s)
          </span>
        </div>

        {dashboard.alerts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-5 text-center text-xs text-[var(--text-muted)]">
            No budget alerts have been triggered for this project.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border-hairline)] text-xs">
            {dashboard.alerts.map((alert) => {
              const toneClass =
                alert.alertType === 'paused' || alert.alertType === 'limit_reached'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-700 dark:text-amber-400';
              return (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold uppercase ${toneClass}`}>
                        {alert.alertType.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                        · {alert.periodWindow} · {formatIsoShort(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--text-primary)]">{alert.message}</p>
                    <div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      Measured {formatMicroUsd(alert.measuredSpendMicros)}
                      {alert.budgetLimitMicros !== null
                        ? ` / Limit ${formatMicroUsd(alert.budgetLimitMicros)}`
                        : ''}
                      {alert.acknowledgedAt
                        ? ` · Acknowledged ${formatIsoShort(alert.acknowledgedAt)}`
                        : ''}
                    </div>
                  </div>
                  {!alert.acknowledgedAt && dashboard.canManagePricingAndBudgets && (
                    <button
                      type="button"
                      disabled={busyAlertId === alert.id}
                      onClick={() => void handleAcknowledgeAlert(alert.id)}
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {busyAlertId === alert.id ? 'Saving…' : 'Acknowledge'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
