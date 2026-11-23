import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { operationsService } from '../../services/operationsService';
import type { OperationsControlCenterPayload } from '../../types/autonomousOperations';

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusToneClass(status: string): string {
  switch (status) {
    case 'healthy':
    case 'completed':
    case 'active':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'running':
    case 'queued':
      return 'text-sky-600 dark:text-sky-400';
    case 'paused':
    case 'waiting_approval':
    case 'degraded':
      return 'text-amber-600 dark:text-amber-400';
    case 'failed':
    case 'stopped':
      return 'text-rose-600 dark:text-rose-400';
    default:
      return 'text-[var(--text-secondary)]';
  }
}

export function OperationsOverviewSection({
  projectId,
  data,
  onNavigateTab,
  onRefresh,
}: {
  projectId: string;
  data: OperationsControlCenterPayload;
  onNavigateTab: (
    tab: 'schedules' | 'automations' | 'recovery' | 'policies' | 'health',
  ) => void;
  onRefresh: () => Promise<void>;
}) {
  const { overview, health, policy, workflows } = data;
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleWorkflowAction = async (
    workflowId: string,
    action: 'pause' | 'resume' | 'replay',
  ) => {
    setBusyWorkflowId(workflowId);
    setActionError(null);
    setActionMessage(null);
    try {
      if (action === 'pause') {
        await operationsService.pauseWorkflow(
          projectId,
          workflowId,
          'Paused from Operations Control Center',
        );
        setActionMessage(`Workflow ${workflowId} paused safely.`);
      } else if (action === 'resume') {
        await operationsService.resumeWorkflow(
          projectId,
          workflowId,
          'Resumed from Operations Control Center',
        );
        setActionMessage(`Workflow ${workflowId} resumed.`);
      } else {
        await operationsService.replayWorkflow(
          projectId,
          workflowId,
          'Replayed from Operations Control Center',
        );
        setActionMessage(
          `Created traceable replay run from workflow ${workflowId}.`,
        );
      }
      await onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Unable to ${action} workflow.`,
      );
    } finally {
      setBusyWorkflowId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid */}
      <section aria-label="Autonomous operations summary metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
              <span>Active Workflows</span>
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.activeWorkflows}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {overview.queuedTasks} queued task(s) · {overview.pausedWorkflows}{' '}
              paused
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
              <span>Scheduled Jobs &amp; Triggers</span>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.scheduledJobs}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {overview.activeTriggers} active automation trigger(s)
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
              <span>Completed vs Failed</span>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.succeededWorkflows}
              <span className="mx-1 text-base font-normal text-[var(--text-muted)]">
                /
              </span>
              <span
                className={
                  overview.failedWorkflows > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[var(--text-primary)]'
                }
              >
                {overview.failedWorkflows}
              </span>
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {overview.pendingApprovals} pending human approval(s)
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
              <span>Open Dead-Letter Tasks</span>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
                overview.openDeadLetters > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {overview.openDeadLetters}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {health.recentRecoveriesCount} recovery action(s) logged
            </div>
          </div>
        </div>
      </section>

      {/* Runtime Health & Policy Posture Summary */}
      <section
        aria-label="Scheduler, worker, and autonomy posture"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Scheduler Status
              </div>
              <div
                className={`mt-1 text-sm font-semibold capitalize ${statusToneClass(health.schedulerStatus)}`}
              >
                {health.schedulerStatus}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Worker Health
              </div>
              <div
                className={`mt-1 text-sm font-semibold capitalize ${statusToneClass(health.workerStatus)}`}
              >
                {health.workerStatus} ({health.activeWorkerCount} active)
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Autonomy Mode
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
                {policy.autonomyMode === 'automatic_low_risk'
                  ? 'Automatic (Low-Risk)'
                  : policy.autonomyMode === 'approval_required'
                    ? 'Approval Required'
                    : 'Restricted'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Last Worker Heartbeat
              </div>
              <div className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                {formatTimestamp(health.lastHeartbeatAt)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('schedules')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Manage Schedules</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('automations')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Triggers</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('policies')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Autonomy Policy</span>
            </button>
          </div>
        </div>
      </section>

      {actionMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {actionError}
        </div>
      )}

      {/* Recent Workflow Runs & Inline Lifecycle Controls */}
      <section
        aria-label="Recent workflow executions"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Recent Autonomous &amp; Manual Workflow Runs
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Pause running DAGs cleanly, resume paused workflows, or launch traceable replays.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('recovery')}
            className="text-xs font-semibold text-[var(--accent-primary)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Recovery Center
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-[var(--text-muted)]">
            No workflow executions recorded for this project yet. Launch a workflow from Agent Factory, Workflow Studio, or create a persistent schedule.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-3">Workflow</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage / Reason</th>
                  <th className="px-4 py-3">Triggered By</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {workflows.slice(0, 12).map((wf) => {
                  const isBusy = busyWorkflowId === wf.id;
                  const canPause =
                    wf.status === 'running' || wf.status === 'queued';
                  const canResume = wf.status === 'paused';
                  return (
                    <tr
                      key={wf.id}
                      className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {wf.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                          {wf.id}
                          {wf.replayedFromWorkflowId
                            ? ` · replay of ${wf.replayedFromWorkflowId}`
                            : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold capitalize ${statusToneClass(wf.status)}`}
                        >
                          {wf.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="truncate text-[var(--text-secondary)]">
                          {wf.blockingReason || wf.currentStage || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {wf.createdBy}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                        {formatTimestamp(wf.updatedAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {data.canManageOperations && canPause && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleWorkflowAction(wf.id, 'pause')}
                              aria-label={`Pause workflow ${wf.name}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-amber-500/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Pause className="h-3 w-3" aria-hidden="true" />
                              <span>Pause</span>
                            </button>
                          )}
                          {data.canManageOperations && canResume && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleWorkflowAction(wf.id, 'resume')}
                              aria-label={`Resume workflow ${wf.name}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="h-3 w-3" aria-hidden="true" />
                              <span>Resume</span>
                            </button>
                          )}
                          {data.canManageOperations && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleWorkflowAction(wf.id, 'replay')}
                              aria-label={`Replay workflow ${wf.name}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>Replay</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
