import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  GitCommit,
  History,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type {
  AgentFactoryEvent,
  AgentWorkflowDetail,
} from '../../types/agentFactory';
import type {
  StudioValidationReport,
  StudioWorkflowVersionRecord,
} from '../../types/workflowStudio';

interface StudioBottomDrawerProps {
  validation: StudioValidationReport | null;
  activeExecution: AgentWorkflowDetail | null;
  liveEvents: AgentFactoryEvent[];
  versions: StudioWorkflowVersionRecord[];
  canEdit: boolean;
  canApprove: boolean;
  onFocusNode: (nodeId: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onApproveGate: (approvalId: string, decision: 'approved' | 'rejected') => void;
}

type DrawerTab = 'validation' | 'logs' | 'history' | 'events' | 'versions';

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function StudioBottomDrawer({
  validation,
  activeExecution,
  liveEvents,
  versions,
  canEdit,
  canApprove,
  onFocusNode,
  onRestoreVersion,
  onApproveGate,
}: StudioBottomDrawerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('validation');

  const errorCount = validation?.errorCount ?? 0;
  const warningCount = validation?.warningCount ?? 0;
  const pendingApprovals = (activeExecution?.approvals ?? []).filter(
    (a) => a.status === 'pending',
  );

  const combinedLogs = (() => {
    const map = new Map<string, AgentFactoryEvent>();
    for (const ev of activeExecution?.events ?? []) map.set(ev.id, ev);
    for (const ev of liveEvents) {
      if (!activeExecution || ev.workflowId === activeExecution.workflow.id) {
        map.set(ev.id, ev);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  })();

  return (
    <section
      aria-label="Workflow Diagnostics and Execution Drawer"
      className={`flex shrink-0 flex-col border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] ${
        collapsed ? 'h-[40px]' : 'h-[212px]'
      }`}
    >
      {/* Header / Tab Bar */}
      <div className="flex h-[40px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('validation');
              setCollapsed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === 'validation'
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {errorCount > 0 ? (
              <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            )}
            <span>
              Validation ({errorCount} err · {warningCount} warn)
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              setCollapsed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Execution Logs ({combinedLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              setCollapsed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Node History ({activeExecution?.tasks.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('events');
              setCollapsed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === 'events'
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Approvals & Handoffs
              {pendingApprovals.length > 0 ? ` (${pendingApprovals.length} pending)` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('versions');
              setCollapsed(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === 'versions'
                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <GitCommit className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Versions ({versions.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand bottom diagnostics panel' : 'Collapse bottom diagnostics panel'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          {collapsed ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
          {activeTab === 'validation' && (
            <div className="space-y-1.5">
              {!validation ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Click Validate in the top toolbar to run DAG, capability, and governance checks.
                </p>
              ) : validation.issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Workflow graph is valid ({validation.topologicalOrder.length} executable nodes across {validation.layers.length} stage layer(s)). Ready to save, publish, or execute.
                  </span>
                </div>
              ) : (
                validation.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {issue.severity === 'error' ? (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text-primary)]">
                          {issue.message}
                        </div>
                        {issue.remediation && (
                          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {issue.remediation}
                          </div>
                        )}
                      </div>
                    </div>
                    {issue.nodeId && (
                      <button
                        type="button"
                        onClick={() => onFocusNode(issue.nodeId!)}
                        className="shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
                      >
                        Focus Node
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-1">
              {combinedLogs.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No real execution events recorded for this workflow yet.
                </p>
              ) : (
                combinedLogs.slice(0, 60).map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--border-hairline)]/60 py-1.5 text-xs"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">
                        {formatTime(ev.timestamp)}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] font-semibold text-[var(--accent-primary)]">
                        {ev.eventType}
                      </span>
                      <span className="truncate text-[var(--text-primary)]">
                        {ev.taskTitle}: {ev.summary}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[10.5px] capitalize text-[var(--text-muted)]">
                      {ev.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {!activeExecution ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Execute this workflow to track real task durations, attempts, and outputs.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-[10.5px] uppercase text-[var(--text-muted)]">
                      <th className="py-1.5 pr-3 font-semibold">Node</th>
                      <th className="py-1.5 pr-3 font-semibold">Status</th>
                      <th className="py-1.5 pr-3 font-semibold">Attempts</th>
                      <th className="py-1.5 pr-3 font-semibold">Duration</th>
                      <th className="py-1.5 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExecution.tasks.map((task) => {
                      const isSkipped =
                        task.status === 'cancelled' &&
                        Boolean(task.blockingReason?.startsWith('Skipped:'));
                      return (
                        <tr
                          key={task.id}
                          className="border-b border-[var(--border-hairline)]/60 hover:bg-[var(--bg-subtle)]"
                        >
                          <td className="py-1.5 pr-3 font-medium text-[var(--text-primary)]">
                            <button
                              type="button"
                              onClick={() => onFocusNode(task.nodeKey)}
                              className="text-left hover:text-[var(--accent-primary)] cursor-pointer"
                            >
                              {task.title}
                            </button>
                          </td>
                          <td className="py-1.5 pr-3 capitalize">
                            {isSkipped ? 'skipped' : task.status.replace(/_/g, ' ')}
                          </td>
                          <td className="py-1.5 pr-3 font-mono tabular-nums">
                            {task.attemptCount}
                          </td>
                          <td className="py-1.5 pr-3 font-mono tabular-nums text-[var(--text-muted)]">
                            {task.durationMs !== null ? `${task.durationMs}ms` : '—'}
                          </td>
                          <td className="max-w-[360px] truncate py-1.5 text-[var(--text-secondary)]">
                            {task.errorSummary || task.blockingReason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-2.5">
              {pendingApprovals.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                    Pending Human Approvals
                  </div>
                  {pendingApprovals.map((appr) => (
                    <div
                      key={appr.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {appr.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {appr.summary}
                        </div>
                      </div>
                      {canApprove ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApproveGate(appr.id, 'approved')}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                          >
                            Approve & Resume
                          </button>
                          <button
                            type="button"
                            onClick={() => onApproveGate(appr.id, 'rejected')}
                            className="rounded-md border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Owner/Admin sign-off required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                  Validated Agent Handoffs ({activeExecution?.handoffs.length ?? 0})
                </div>
                {(activeExecution?.handoffs ?? []).length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    No handoffs recorded in the active execution yet.
                  </p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {activeExecution!.handoffs.slice(0, 20).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)]/60 py-1 text-xs"
                      >
                        <span className="truncate text-[var(--text-primary)]">
                          <span className="font-mono text-[11px] text-[var(--accent-primary)]">
                            {h.sourceAgentId} → {h.destinationAgentId}
                          </span>{' '}
                          · {h.validationSummary}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-[var(--text-muted)]">
                          {h.evidenceRefs.length} ref(s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-1.5">
              {versions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Save or execute this workflow to record immutable version snapshots.
                </p>
              ) : (
                versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                        <span className="font-mono">v{ver.versionNumber}</span>
                        <span>·</span>
                        <span className="capitalize">{ver.status}</span>
                        <span>·</span>
                        <span className="truncate font-normal text-[var(--text-secondary)]">
                          {ver.changeSummary}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        <span>{new Date(ver.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{ver.createdBy}</span>
                        <span>·</span>
                        <span>{ver.graph.nodes.length} nodes</span>
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onRestoreVersion(ver.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
