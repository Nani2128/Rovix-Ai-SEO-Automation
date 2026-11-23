import { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
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

export function RecoveryCenterSection({
  projectId,
  data,
  onRefresh,
}: {
  projectId: string;
  data: OperationsControlCenterPayload;
  onRefresh: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actionableWorkflows = data.workflows.filter(
    (w) =>
      w.status === 'failed' ||
      w.status === 'paused' ||
      w.status === 'running' ||
      w.status === 'queued' ||
      w.status === 'waiting_approval',
  );

  const handleDeadLetterAction = async (
    dlqId: string,
    action: 'retry_task' | 'replay_workflow' | 'resolve',
  ) => {
    setBusyId(dlqId);
    setError(null);
    setFeedback(null);
    try {
      if (action === 'resolve') {
        await operationsService.resolveDeadLetter(
          projectId,
          dlqId,
          'Resolved from Recovery Center',
        );
        setFeedback(`Marked dead-letter entry ${dlqId} as resolved.`);
      } else {
        await operationsService.replayDeadLetter(
          projectId,
          dlqId,
          action,
          `Triggered ${action} from Recovery Center`,
        );
        setFeedback(
          action === 'retry_task'
            ? `Queued manual task retry for dead-letter entry ${dlqId}.`
            : `Launched traceable full workflow replay from dead-letter entry ${dlqId}.`,
        );
      }
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to perform dead-letter recovery action.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleWorkflowControl = async (
    workflowId: string,
    action: 'pause' | 'resume' | 'replay' | 'cancel',
  ) => {
    setBusyId(workflowId);
    setError(null);
    setFeedback(null);
    try {
      if (action === 'pause') {
        await operationsService.pauseWorkflow(
          projectId,
          workflowId,
          'Paused from Recovery Center',
        );
        setFeedback(`Paused workflow ${workflowId}.`);
      } else if (action === 'resume') {
        await operationsService.resumeWorkflow(
          projectId,
          workflowId,
          'Resumed from Recovery Center',
        );
        setFeedback(`Resumed workflow ${workflowId}.`);
      } else if (action === 'replay') {
        await operationsService.replayWorkflow(
          projectId,
          workflowId,
          'Replayed from Recovery Center',
        );
        setFeedback(`Launched traceable replay for workflow ${workflowId}.`);
      } else {
        await operationsService.cancelWorkflow(projectId, workflowId);
        setConfirmCancelId(null);
        setFeedback(`Cancelled workflow ${workflowId}.`);
      }
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Unable to ${action} workflow.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
          Self-Healing Recovery Center &amp; Dead-Letter Queue
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Inspect permanently failed or non-retryable tasks, safely pause/resume/cancel active workflows, and trigger audited retries or traceable workflow replays.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Dead-Letter Queue */}
      <section
        aria-label="Dead-letter task queue"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Dead-Letter Task Queue ({data.deadLetters.length})
          </h3>
        </div>

        {data.deadLetters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <CheckCircle2
              className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              No dead-lettered tasks
            </div>
            <p className="max-w-md text-xs text-[var(--text-muted)]">
              Tasks that exhaust retries or hit non-retryable validation, policy, or budget errors appear here for operator triage.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-3">Task &amp; Workflow</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Error Details</th>
                  <th className="px-4 py-3">Attempts / Status</th>
                  <th className="px-5 py-3 text-right">Recovery Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.deadLetters.map((dlq) => {
                  const isBusy = busyId === dlq.id;
                  return (
                    <tr key={dlq.id}>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {dlq.taskTitle}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                          {dlq.agentId} · {dlq.workflowName} ({dlq.workflowId})
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={`font-mono text-[11px] font-semibold ${
                            dlq.errorClassification === 'non_retryable'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {dlq.errorClassification}
                        </div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                          {dlq.errorCode}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[280px] text-[var(--text-secondary)]">
                        <div className="line-clamp-2">{dlq.errorMessage}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] tabular-nums">
                        <div className="text-[var(--text-primary)]">
                          {dlq.attemptCount} / {dlq.maxRetries + 1}
                        </div>
                        <div className="mt-0.5 text-[10.5px] capitalize text-[var(--text-muted)]">
                          {dlq.status}
                          {dlq.replayedWorkflowId
                            ? ` -> ${dlq.replayedWorkflowId}`
                            : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {data.canManageOperations && dlq.status === 'open' ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDeadLetterAction(
                                  dlq.id,
                                  'retry_task',
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>Retry Task</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDeadLetterAction(
                                  dlq.id,
                                  'replay_workflow',
                                )
                              }
                              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Replay Workflow
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDeadLetterAction(dlq.id, 'resolve')
                              }
                              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/60 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Resolve
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)] capitalize">
                            {dlq.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active, Paused & Failed Workflows Lifecycle Controls */}
      <section
        aria-label="Workflow lifecycle recovery controls"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Active, Paused &amp; Failed Workflows
          </h3>
        </div>
        {actionableWorkflows.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No active, paused, or failed workflows requiring operator intervention.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Workflow</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Blocking / Failure Reason</th>
                  <th className="px-4 py-2.5">Tasks</th>
                  <th className="px-5 py-2.5 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {actionableWorkflows.map((wf) => {
                  const isBusy = busyId === wf.id;
                  const canPause =
                    wf.status === 'running' || wf.status === 'queued';
                  const canResume = wf.status === 'paused';
                  const canCancel =
                    wf.status === 'running' ||
                    wf.status === 'queued' ||
                    wf.status === 'paused' ||
                    wf.status === 'waiting_approval';
                  const isConfirmCancel = confirmCancelId === wf.id;
                  return (
                    <tr key={wf.id}>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {wf.name}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--text-muted)]">
                          {wf.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold capitalize text-[var(--text-primary)]">
                        {wf.status.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 max-w-[260px] truncate text-[var(--text-secondary)]">
                        {wf.blockingReason || wf.currentStage || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {wf.queuedTaskCount} queued · {wf.failedTaskCount} failed
                      </td>
                      <td className="px-5 py-3 text-right">
                        {data.canManageOperations ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {canPause && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleWorkflowControl(wf.id, 'pause')
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Pause className="h-3 w-3" aria-hidden="true" />
                                <span>Pause</span>
                              </button>
                            )}
                            {canResume && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleWorkflowControl(wf.id, 'resume')
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Play className="h-3 w-3" aria-hidden="true" />
                                <span>Resume</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleWorkflowControl(wf.id, 'replay')
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>Replay</span>
                            </button>
                            {canCancel &&
                              (isConfirmCancel ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      void handleWorkflowControl(
                                        wf.id,
                                        'cancel',
                                      )
                                    }
                                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    Confirm Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(null)}
                                    className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setConfirmCancelId(wf.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <XCircle
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  <span>Cancel</span>
                                </button>
                              ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recovery Audit Trail */}
      <section
        aria-label="Recovery audit records"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Recovery &amp; Self-Healing Audit Log
          </h3>
        </div>
        {data.recoveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            <AlertOctagon className="h-5 w-5 opacity-60" aria-hidden="true" />
            <span>No recovery actions recorded for this project yet.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Transition</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-5 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.recoveries.slice(0, 25).map((rec) => (
                  <tr key={rec.id}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(rec.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                      {rec.actionType}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {rec.previousStatus} {'->'} {rec.newStatus}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {rec.actor}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                      {rec.reason}
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
