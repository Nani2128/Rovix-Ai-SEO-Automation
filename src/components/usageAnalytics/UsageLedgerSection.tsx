import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { AGENT_CATALOG } from '../../lib/agentFactoryCatalog';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import { usageIntelligenceService } from '../../services/usageIntelligenceService';
import type {
  CostBasis,
  UsageLedgerFilterParams,
  UsageLedgerRow,
} from '../../types/usageIntelligence';

const COST_BASIS_LABELS: Record<CostBasis, string> = {
  provider_reported_billed: 'Provider Billed',
  calculated_actual_tokens: 'Calculated (Actual)',
  estimated: 'Estimated (countTokens)',
  internal_non_billed: 'Internal ($0.00)',
  unavailable: 'Unavailable',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function UsageLedgerSection({
  projectId,
  initialAgentId,
  initialWorkflowId,
  dateFrom,
  dateTo,
}: {
  projectId: string;
  initialAgentId?: string | null;
  initialWorkflowId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const [agentId, setAgentId] = useState(initialAgentId ?? '');
  const [workflowId, setWorkflowId] = useState(initialWorkflowId ?? '');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [costBasis, setCostBasis] = useState('');

  const [rows, setRows] = useState<UsageLedgerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  useEffect(() => {
    if (initialAgentId !== undefined) {
      setAgentId(initialAgentId ?? '');
    }
  }, [initialAgentId]);

  useEffect(() => {
    if (initialWorkflowId !== undefined) {
      setWorkflowId(initialWorkflowId ?? '');
    }
  }, [initialWorkflowId]);

  const buildFilters = useCallback(
    (): UsageLedgerFilterParams => ({
      agentId: agentId || null,
      workflowId: workflowId.trim() || null,
      provider: provider || null,
      status: status || null,
      costBasis: costBasis || null,
      from: dateFrom ?? null,
      to: dateTo ?? null,
      limit: 200,
    }),
    [agentId, workflowId, provider, status, costBasis, dateFrom, dateTo],
  );

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usageIntelligenceService.getLedger(
        projectId,
        buildFilters(),
      );
      setRows(data.rows);
      setTotalCount(data.totalCount);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load usage ledger.',
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, buildFilters]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  async function handleExport(format: 'csv' | 'json') {
    setExporting(format);
    setExportStatus(null);
    try {
      const result = await usageIntelligenceService.downloadExport(
        projectId,
        format,
        buildFilters(),
      );
      setExportStatus(
        `Exported ${result.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB).`,
      );
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}.`,
      );
    } finally {
      setExporting(null);
    }
  }

  function handleResetFilters() {
    setAgentId('');
    setWorkflowId('');
    setProvider('');
    setStatus('');
    setCostBasis('');
  }

  return (
    <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Immutable Provider Usage &amp; Cost Ledger
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Every metered LLM and specialist execution event with exact token source, pricing version, and cost basis
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{exporting === 'csv' ? 'Exporting CSV…' : 'Export CSV'}</span>
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void handleExport('json')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{exporting === 'json' ? 'Exporting JSON…' : 'Export JSON'}</span>
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mt-4 grid grid-cols-1 gap-3 border-y border-[var(--border-hairline)] py-3.5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block space-y-1 text-[11px]">
          <span className="font-medium text-[var(--text-muted)]">Agent</span>
          <select
            aria-label="Filter ledger by agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
          >
            <option value="">All Agents</option>
            {AGENT_CATALOG.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-[11px]">
          <span className="font-medium text-[var(--text-muted)]">Provider</span>
          <select
            aria-label="Filter ledger by provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
          >
            <option value="">All Providers</option>
            <option value="google_gemini">google_gemini</option>
            <option value="rovix_backend_service">rovix_backend_service</option>
            <option value="rovix_workflow_studio">rovix_workflow_studio</option>
            <option value="pagespeed">pagespeed</option>
          </select>
        </label>

        <label className="block space-y-1 text-[11px]">
          <span className="font-medium text-[var(--text-muted)]">Status</span>
          <select
            aria-label="Filter ledger by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
          >
            <option value="">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="timeout">Timeout</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label className="block space-y-1 text-[11px]">
          <span className="font-medium text-[var(--text-muted)]">Cost Basis</span>
          <select
            aria-label="Filter ledger by cost basis"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
          >
            <option value="">All Bases</option>
            <option value="calculated_actual_tokens">Calculated (Actual)</option>
            <option value="provider_reported_billed">Provider Billed</option>
            <option value="estimated">Estimated</option>
            <option value="internal_non_billed">Internal Non-Billed</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>

        <label className="block space-y-1 text-[11px]">
          <span className="font-medium text-[var(--text-muted)]">Workflow ID</span>
          <input
            type="text"
            aria-label="Filter ledger by workflow ID"
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            placeholder="wf_..."
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleResetFilters}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {exportStatus && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs text-[var(--text-secondary)]"
        >
          {exportStatus}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-300/70 bg-red-50/70 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span className="font-mono tabular-nums">
          Showing {rows.length.toLocaleString()} of {totalCount.toLocaleString()} recorded event(s)
        </span>
        <span>Deduplicated by immutable idempotency key</span>
      </div>

      {loading ? (
        <div className="mt-4 py-10 text-center text-xs text-[var(--text-muted)]">
          Loading immutable usage ledger…
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-8 text-center text-xs text-[var(--text-muted)]">
          No usage events match the active filters.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="py-2.5 pr-3">Timestamp</th>
                <th className="py-2.5 pr-3">Agent &amp; Workflow</th>
                <th className="py-2.5 pr-3">Provider / Model</th>
                <th className="py-2.5 pr-3">Status</th>
                <th className="py-2.5 pr-3 text-right">Tokens (In / Out / Total)</th>
                <th className="py-2.5 pr-3 text-right">Measured Cost</th>
                <th className="py-2.5 pr-3">Cost Basis &amp; Version</th>
                <th className="py-2.5 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {rows.map(({ event, cost }) => {
                const statusColor =
                  event.status === 'succeeded'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : event.status === 'cancelled'
                      ? 'text-[var(--text-muted)]'
                      : 'text-red-600 dark:text-red-400';

                return (
                  <tr
                    key={event.id}
                    className="align-top transition-colors hover:bg-[var(--bg-subtle)]/70"
                  >
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                      {formatTimestamp(event.requestTimestamp)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {event.agentId}
                      </div>
                      <div className="font-mono text-[10.5px] text-[var(--text-muted)]">
                        {event.workflowId ? `wf:${event.workflowId.slice(0, 14)}` : 'standalone'}
                        {event.taskId ? ` · task:${event.taskId.slice(0, 10)}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">
                      <div className="text-[var(--text-primary)]">{event.provider}</div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        {event.model ?? '—'}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className={`font-semibold capitalize ${statusColor}`}>
                        {event.status}
                      </div>
                      {(event.isRetry || event.isQuotaError) && (
                        <div className="text-[10.5px] text-amber-700 dark:text-amber-400">
                          {event.isRetry ? `Retry #${event.attemptNumber}` : ''}
                          {event.isRetry && event.isQuotaError ? ' · ' : ''}
                          {event.isQuotaError ? 'Quota Error' : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                      {event.totalTokens !== null ? (
                        <>
                          <div className="text-[var(--text-primary)]">
                            {(event.inputTokens ?? 0).toLocaleString()} /{' '}
                            {(event.outputTokens ?? 0).toLocaleString()} /{' '}
                            <span className="font-semibold">
                              {event.totalTokens.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-[var(--text-muted)]">
                            {event.cachedInputTokens
                              ? `Cached ${event.cachedInputTokens.toLocaleString()} · `
                              : ''}
                            {event.usageSource}
                          </div>
                        </>
                      ) : (
                        <div className="text-[var(--text-muted)]">
                          Unavailable ({event.usageSource})
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {cost.totalCostMicros !== null
                        ? formatMicroUsd(cost.totalCostMicros)
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-[var(--text-primary)]">
                        {COST_BASIS_LABELS[cost.costBasis]}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        {cost.pricingVersionLabel ??
                          cost.unavailableReason ??
                          'No pricing record'}
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                      {formatMs(event.latencyMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
