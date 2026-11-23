import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import { usageIntelligenceService } from '../../services/usageIntelligenceService';
import type {
  WorkflowCostDetailPayload,
  WorkflowUsageAnalyticsRow,
} from '../../types/usageIntelligence';

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function WorkflowCostSection({
  projectId,
  workflows,
  onFilterLedgerByWorkflow,
}: {
  projectId: string;
  workflows: WorkflowUsageAnalyticsRow[];
  onFilterLedgerByWorkflow: (workflowId: string) => void;
}) {
  const [expandedWfId, setExpandedWfId] = useState<string | null>(null);
  const [detailByWf, setDetailByWf] = useState<
    Record<string, WorkflowCostDetailPayload>
  >({});
  const [loadingWfId, setLoadingWfId] = useState<string | null>(null);
  const [reconcilingWfId, setReconcilingWfId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleExpand = async (workflowId: string) => {
    if (expandedWfId === workflowId) {
      setExpandedWfId(null);
      return;
    }
    setExpandedWfId(workflowId);
    setErrorMsg(null);
    if (!detailByWf[workflowId]) {
      setLoadingWfId(workflowId);
      try {
        const detail = await usageIntelligenceService.getWorkflowCostDetail(
          projectId,
          workflowId,
        );
        setDetailByWf((prev) => ({ ...prev, [workflowId]: detail }));
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load workflow breakdown.');
      } finally {
        setLoadingWfId(null);
      }
    }
  };

  const handleReconcile = async (workflowId: string) => {
    setReconcilingWfId(workflowId);
    setErrorMsg(null);
    try {
      await usageIntelligenceService.reconcileWorkflow(projectId, workflowId);
      const detail = await usageIntelligenceService.getWorkflowCostDetail(
        projectId,
        workflowId,
      );
      setDetailByWf((prev) => ({ ...prev, [workflowId]: detail }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to run reconciliation.');
    } finally {
      setReconcilingWfId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
          Workflow Cost Attribution &amp; Reconciliation
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Deduplicated strictly by underlying usage event ID — parent/child links and
          handoffs never double-count spend. Retries and failed executions are isolated.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}

      <div className="overflow-x-auto rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
              <th className="w-9 px-3 py-3" aria-label="Expand row" />
              <th className="px-3 py-3">Workflow</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Events</th>
              <th className="px-3 py-3 text-right">Total Tokens</th>
              <th className="px-3 py-3 text-right">Measured Cost</th>
              <th className="px-3 py-3 text-right">Retry / Failed Cost</th>
              <th className="px-3 py-3 text-right">Duration</th>
              <th className="px-4 py-3 text-right">Reconciliation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {workflows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-xs text-[var(--text-muted)]"
                >
                  No executed workflows found for this project yet.
                </td>
              </tr>
            ) : (
              workflows.map((wf) => {
                const isExpanded = expandedWfId === wf.workflowId;
                const detail = detailByWf[wf.workflowId];
                const allUnpriced =
                  wf.totalRequests > 0 &&
                  wf.unavailableCostEventCount === wf.totalRequests;

                return (
                  <tr key={wf.workflowId} className="group align-top">
                    <td colSpan={9} className="p-0">
                      <div className="grid grid-cols-[36px_minmax(200px,2fr)_96px_68px_100px_115px_135px_85px_120px] items-center hover:bg-[var(--bg-subtle)]/50">
                        <div className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleExpand(wf.workflowId)}
                            aria-expanded={isExpanded}
                            aria-label={`Toggle breakdown for ${wf.workflowName}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        <div className="min-w-0 px-3 py-3">
                          <div className="truncate font-medium text-[var(--text-primary)]">
                            {wf.workflowName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-[var(--text-muted)]">
                            <span>{wf.workflowId}</span>
                            <span aria-hidden="true">·</span>
                            <span>{wf.createdAt.slice(0, 10)}</span>
                          </div>
                        </div>
                        <div className="px-3 py-3 capitalize text-[var(--text-secondary)]">
                          {wf.status.replace(/_/g, ' ')}
                        </div>
                        <div className="px-3 py-3 text-right font-mono text-[var(--text-primary)] tabular-nums">
                          {wf.uniqueEventCount}
                        </div>
                        <div className="px-3 py-3 text-right font-mono text-[var(--text-primary)] tabular-nums">
                          {wf.totalTokens.toLocaleString()}
                        </div>
                        <div className="px-3 py-3 text-right font-mono font-semibold tabular-nums">
                          <span
                            className={
                              allUnpriced
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--text-primary)]'
                            }
                          >
                            {allUnpriced
                              ? 'Unavailable'
                              : formatMicroUsd(wf.measuredCostMicros)}
                          </span>
                          {wf.unavailableCostEventCount > 0 && !allUnpriced && (
                            <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                              +{wf.unavailableCostEventCount} unpriced
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-3 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                          {formatMicroUsd(wf.retryCostMicros)} /{' '}
                          {formatMicroUsd(wf.failedExecutionCostMicros)}
                        </div>
                        <div className="px-3 py-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                          {formatMs(wf.durationMs)}
                        </div>
                        <div className="px-4 py-3 text-right">
                          <span
                            className={`text-[11px] font-medium ${
                              wf.isReconciled
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {wf.isReconciled
                              ? 'Reconciled'
                              : `Diff ${formatMicroUsd(wf.discrepancyMicros)}`}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 px-6 py-4 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-[var(--text-secondary)]">
                              <span className="font-semibold text-[var(--text-primary)]">
                                Task-Level Breakdown
                              </span>{' '}
                              · Primary cost basis:{' '}
                              <span className="font-mono">{wf.primaryCostBasis}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => onFilterLedgerByWorkflow(wf.workflowId)}
                                className="text-xs font-medium text-[#7047EB] hover:underline dark:text-[#22D3EE] whitespace-nowrap cursor-pointer"
                              >
                                View Ledger Entries
                              </button>
                              <button
                                type="button"
                                disabled={reconcilingWfId === wf.workflowId}
                                onClick={() => void handleReconcile(wf.workflowId)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                              >
                                <RefreshCw
                                  className={`h-3 w-3 ${
                                    reconcilingWfId === wf.workflowId ? 'animate-spin' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                                <span>Verify Reconciliation</span>
                              </button>
                            </div>
                          </div>

                          {loadingWfId === wf.workflowId ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              Loading per-task reconciliation breakdown...
                            </p>
                          ) : detail && detail.tasks.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                              <table className="w-full border-collapse text-left text-[11.5px]">
                                <thead>
                                  <tr className="border-b border-[var(--border-hairline)] text-[10.5px] text-[var(--text-muted)]">
                                    <th className="px-3 py-2">Task / Agent</th>
                                    <th className="px-3 py-2 text-right">Requests (Retries)</th>
                                    <th className="px-3 py-2 text-right">Tokens</th>
                                    <th className="px-3 py-2 text-right">Measured Cost</th>
                                    <th className="px-3 py-2 text-right">Cost Basis</th>
                                    <th className="px-3 py-2 text-right">Avg Latency</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-hairline)]">
                                  {detail.tasks.map((t, idx) => (
                                    <tr key={`${t.taskId ?? t.agentId}-${idx}`}>
                                      <td className="px-3 py-2">
                                        <div className="font-medium text-[var(--text-primary)]">
                                          {t.taskTitle}
                                        </div>
                                        <div className="font-mono text-[10px] text-[var(--text-muted)]">
                                          {t.agentId}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                                        {t.requests} ({t.retryRequests})
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                                        {t.totalTokens.toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                                        {t.unavailableCostCount === t.requests
                                          ? 'Unavailable'
                                          : formatMicroUsd(t.measuredCostMicros)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-[10.5px] text-[var(--text-secondary)]">
                                        {t.costBasis}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                                        {formatMs(t.avgLatencyMs)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">
                              No provider usage events recorded for this workflow yet.
                            </p>
                          )}

                          {wf.unavailableComponents.length > 0 && (
                            <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3.5 py-2.5 text-[11.5px] text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                              <div className="font-semibold">
                                Unavailable Cost Components ({wf.unavailableComponents.length})
                              </div>
                              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                {wf.unavailableComponents.map((c, i) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
