import { useMemo, useState } from 'react';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import type { AgentUsageAnalyticsRow } from '../../types/usageIntelligence';

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function AgentUsageSection({
  agents,
  onFilterLedgerByAgent,
}: {
  agents: AgentUsageAnalyticsRow[];
  onFilterLedgerByAgent: (agentId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<'cost' | 'tokens' | 'requests' | 'failures'>('cost');
  const [onlyActive, setOnlyActive] = useState(false);

  const sortedAgents = useMemo(() => {
    const filtered = onlyActive
      ? agents.filter((a) => a.totalRequests > 0)
      : [...agents];
    filtered.sort((a, b) => {
      if (sortBy === 'cost') {
        return b.measuredCostMicros - a.measuredCostMicros || b.totalTokens - a.totalTokens;
      }
      if (sortBy === 'tokens') {
        return b.totalTokens - a.totalTokens || b.totalRequests - a.totalRequests;
      }
      if (sortBy === 'failures') {
        return b.failedRequests - a.failedRequests || b.retryRequests - a.retryRequests;
      }
      return b.totalRequests - a.totalRequests;
    });
    return filtered;
  }, [agents, sortBy, onlyActive]);

  const maxTokens = Math.max(1, ...sortedAgents.map((a) => a.totalTokens));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Per-Agent Token Consumption, Cost &amp; Reliability
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Measured strictly from persisted execution events across all specialist stations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--border-hairline)] accent-[#7047EB]"
            />
            <span>Hide agents with 0 requests</span>
          </label>

          <div
            role="group"
            aria-label="Sort agents by"
            className="flex items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
          >
            {(
              [
                ['cost', 'Cost'],
                ['tokens', 'Tokens'],
                ['requests', 'Requests'],
                ['failures', 'Failures'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  sortBy === key
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <table className="w-full min-w-[860px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
              <th className="px-4 py-3">Agent</th>
              <th className="px-3 py-3 text-right">Requests</th>
              <th className="px-3 py-3 text-right">Input / Output / Cached</th>
              <th className="px-3 py-3 text-right">Total Tokens</th>
              <th className="px-3 py-3 text-right">Measured Cost</th>
              <th className="px-3 py-3 text-right">Avg / Exec</th>
              <th className="px-3 py-3 text-right">Failed / Retries</th>
              <th className="px-3 py-3 text-right">Avg Latency</th>
              <th className="px-4 py-3 text-right">Provider / Model</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {sortedAgents.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-xs text-[var(--text-muted)]"
                >
                  No agent executions match the current filter.
                </td>
              </tr>
            ) : (
              sortedAgents.map((agent) => {
                const tokenSharePct =
                  agent.totalTokens > 0
                    ? Math.max(3, Math.round((agent.totalTokens / maxTokens) * 100))
                    : 0;
                const allUnpriced =
                  agent.totalRequests > 0 &&
                  agent.unavailableCostEventCount === agent.totalRequests;
                return (
                  <tr
                    key={agent.agentId}
                    className="transition-colors hover:bg-[var(--bg-subtle)]/60"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onFilterLedgerByAgent(agent.agentId)}
                        className="text-left font-medium text-[var(--text-primary)] hover:text-[#7047EB] dark:hover:text-[#22D3EE] cursor-pointer"
                      >
                        {agent.agentName}
                      </button>
                      <div className="mt-0.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                        {agent.agentId}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[var(--text-primary)] tabular-nums">
                      {agent.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      {agent.measuredTokenRequests > 0
                        ? `${agent.inputTokens.toLocaleString()} / ${agent.outputTokens.toLocaleString()} / ${agent.cachedInputTokens.toLocaleString()}`
                        : 'None reported'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        {agent.totalTokens.toLocaleString()}
                      </div>
                      {tokenSharePct > 0 && (
                        <div className="mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                          <div
                            className="h-full rounded-full bg-[#7047EB] dark:bg-[#22D3EE]"
                            style={{ width: `${tokenSharePct}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={
                          allUnpriced
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[var(--text-primary)]'
                        }
                      >
                        {allUnpriced
                          ? 'Unavailable'
                          : formatMicroUsd(agent.measuredCostMicros)}
                      </span>
                      {agent.unavailableCostEventCount > 0 && !allUnpriced && (
                        <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                          +{agent.unavailableCostEventCount} unpriced
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                      {formatMicroUsd(agent.avgCostPerExecutionMicros, {
                        unavailableLabel: '—',
                      })}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          agent.failedRequests > 0
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : 'text-[var(--text-secondary)]'
                        }
                      >
                        {agent.failedRequests}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {' '}
                        / {agent.retryRequests}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                      {formatMs(agent.avgLatencyMs)}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-[var(--text-secondary)]">
                      {agent.providerModels.length === 0 ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        agent.providerModels.slice(0, 2).map((pm) => (
                          <div key={`${pm.provider}-${pm.model ?? 'default'}`} className="font-mono">
                            {pm.model ?? pm.provider}
                            <span className="text-[var(--text-muted)]"> ({pm.requests})</span>
                          </div>
                        ))
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
