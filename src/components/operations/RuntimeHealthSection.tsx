import { useState } from 'react';
import { Activity, Cpu, RefreshCw } from 'lucide-react';
import { operationsService } from '../../services/operationsService';
import type { OperationsControlCenterPayload } from '../../types/autonomousOperations';

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'Unavailable';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function RuntimeHealthSection({
  projectId,
  data,
  onRefresh,
}: {
  projectId: string;
  data: OperationsControlCenterPayload;
  onRefresh: () => Promise<void>;
}) {
  const { health, activeLeases } = data;
  const [runningTick, setRunningTick] = useState(false);
  const [tickMessage, setTickMessage] = useState<string | null>(null);
  const [tickError, setTickError] = useState<string | null>(null);

  const handleRunMaintenanceTick = async () => {
    setRunningTick(true);
    setTickError(null);
    setTickMessage(null);
    try {
      const res = await operationsService.runMaintenanceTick(projectId);
      setTickMessage(
        `Worker ${res.tickResult.workerId} completed tick: ${res.tickResult.claimedSchedules} due schedule(s) claimed, ${res.tickResult.launchedWorkflowIds.length} workflow(s) launched, ${res.recovery.reclaimedLeasesCount} stale lease(s) reclaimed, ${res.recovery.recoveredWorkflowsCount} workflow(s) recovered.`,
      );
      await onRefresh();
    } catch (err) {
      setTickError(
        err instanceof Error
          ? err.message
          : 'Unable to execute maintenance tick.',
      );
    } finally {
      setRunningTick(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Runtime Health, Worker Leases &amp; Queue Diagnostics
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Live SQLite-persisted worker heartbeats, active workflow/schedule leases, execution latency, and queue depth telemetry.
          </p>
        </div>
        {data.canManageOperations && (
          <button
            type="button"
            disabled={runningTick}
            onClick={() => void handleRunMaintenanceTick()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${runningTick ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {runningTick
                ? 'Running Tick…'
                : 'Run Maintenance & Recovery Tick'}
            </span>
          </button>
        )}
      </div>

      {tickMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          {tickMessage}
        </div>
      )}
      {tickError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {tickError}
        </div>
      )}

      {/* Telemetry Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Queue Depth &amp; Oldest Task
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)] tabular-nums">
            {health.queuedTasksCount}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
            Oldest wait:{' '}
            {health.queuedTasksCount === 0 &&
            health.oldestQueuedTaskAgeMs === null
              ? 'None queued'
              : formatDurationMs(health.oldestQueuedTaskAgeMs)}
          </div>
        </div>

        <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Avg Execution Latency
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)] tabular-nums">
            {formatDurationMs(health.avgExecutionLatencyMs)}
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            Measured across finished tasks
          </div>
        </div>

        <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Workflow Failure Rate
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)] tabular-nums">
            {health.failureRatePct !== null
              ? `${health.failureRatePct.toFixed(1)}%`
              : 'Unavailable'}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
            {health.failedWorkflowsCount} failed · {health.recentRecoveriesCount}{' '}
            recovered
          </div>
        </div>

        <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Active Worker Leases
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)] tabular-nums">
            {health.activeLeasesCount}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
            {health.activeWorkerCount} healthy worker(s)
          </div>
        </div>
      </div>

      {/* Worker Heartbeats Table */}
      <section
        aria-label="Background worker heartbeats"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-5 py-3.5">
          <Cpu className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Runtime Worker Heartbeats
          </h3>
        </div>
        {health.workers.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No worker heartbeats recorded in database yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Worker ID</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last Heartbeat</th>
                  <th className="px-4 py-2.5">Processed Ticks</th>
                  <th className="px-4 py-2.5">Last Tick Duration</th>
                  <th className="px-5 py-2.5">Last Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {health.workers.map((w) => (
                  <tr key={w.workerId}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                      {w.workerId}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-semibold capitalize ${
                          w.status === 'healthy'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : w.status === 'degraded'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      {formatTs(w.lastHeartbeatAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-primary)] tabular-nums">
                      {w.processedTicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      {formatDurationMs(w.lastTickDurationMs)}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-muted)]">
                      {w.lastError || 'None'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active Leases Table */}
      <section
        aria-label="Active worker leases"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-5 py-3.5">
          <Activity
            className="h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Active Distributed Locks &amp; Leases ({activeLeases.length})
          </h3>
        </div>
        {activeLeases.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No active leases currently held for this project.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Lease Key</th>
                  <th className="px-4 py-2.5">Kind</th>
                  <th className="px-4 py-2.5">Owner Worker</th>
                  <th className="px-4 py-2.5">Acquired</th>
                  <th className="px-5 py-2.5">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {activeLeases.map((lease) => (
                  <tr key={lease.leaseKey}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                      {lease.leaseKey}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-[var(--text-secondary)]">
                      {lease.leaseKind}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {lease.workerId}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(lease.acquiredAt)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(lease.expiresAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
