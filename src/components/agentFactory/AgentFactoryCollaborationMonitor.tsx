import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  GitBranch,
  Lock,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { getAgentCatalogDefinition } from '../../lib/agentFactoryCatalog';
import { isOfficialConflictResolverRole } from '../../lib/collaborationGovernance';
import { agentFactoryService } from '../../services/agentFactoryService';
import { useAuthStore } from '../../stores/useAuthStore';
import type {
  AgentId,
  AgentMessageStatus,
  AgentMessageType,
  CollaborationMonitorPayload,
  WorkflowConflictRecord,
} from '../../types/agentFactory';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

type MonitorTab = 'messages' | 'delegations' | 'conflicts' | 'context';

export interface AgentFactoryCollaborationMonitorProps {
  projectId: string;
  selectedWorkflowId: string | null;
  collaboration: CollaborationMonitorPayload | null;
  onRefreshCollaboration: () => Promise<void>;
  onSelectAgent: (agentId: AgentId) => void;
}

const MESSAGE_TYPE_LABELS: Record<AgentMessageType, string> = {
  research_request: 'Research Request',
  verification_request: 'Verification Request',
  evidence_share: 'Evidence Share',
  clarification_question: 'Clarification',
  findings_response: 'Findings Response',
  delegation_request: 'Delegation Request',
  conflict_report: 'Conflict Report',
  rejection_notice: 'Rejection Notice',
};

function formatShortTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getAgentDisplayName(agentId: AgentId): string {
  try {
    return getAgentCatalogDefinition(agentId).shortName;
  } catch {
    return agentId;
  }
}

function getMessageStatusTone(
  status: AgentMessageStatus,
): 'success' | 'warning' | 'danger' | 'indigo' | 'neutral' {
  if (status === 'delivered' || status === 'acknowledged') return 'success';
  if (status === 'sent') return 'indigo';
  if (status === 'failed' || status === 'rejected') return 'danger';
  return 'neutral';
}

function extractMessageSummary(payload: Record<string, unknown>, fallback: string): string {
  const candidates = [
    payload.summary,
    payload.requestedObjective,
    payload.objective,
    payload.question,
    payload.reason,
    payload.detail,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return fallback;
}

function ConflictCard({
  projectId,
  conflict,
  canResolve,
  onSelectAgent,
  onResolved,
}: {
  projectId: string;
  conflict: WorkflowConflictRecord;
  canResolve: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onResolved: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<'keep_a' | 'keep_b' | 'custom'>('keep_a');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed =
    conflict.status === 'resolved' || conflict.status === 'dismissed';

  const handleResolve = async (dismiss = false) => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Enter a resolution note explaining the decision for the audit log.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await agentFactoryService.resolveConflict(projectId, conflict.id, {
        selectedResolution: choice,
        resolutionNote: trimmed,
        dismiss,
      });
      setNote('');
      await onResolved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to resolve conflict.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid={`conflict-card-${conflict.id}`}
      className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 shrink-0 ${
                conflict.severity === 'high'
                  ? 'text-rose-500'
                  : conflict.severity === 'medium'
                    ? 'text-amber-500'
                    : 'text-sky-500'
              }`}
              aria-hidden="true"
            />
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              {conflict.title}
            </h3>
            <StatusBadge
              label={conflict.conflictType.replace(/_/g, ' ')}
              tone={conflict.severity === 'high' ? 'danger' : 'warning'}
            />
            <StatusBadge
              label={conflict.status}
              tone={
                conflict.status === 'resolved'
                  ? 'success'
                  : conflict.status === 'dismissed'
                    ? 'neutral'
                    : 'warning'
              }
            />
          </div>
          <p className="text-[var(--text-secondary)]">{conflict.summary}</p>
        </div>

        <div className="font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
          {formatShortTimestamp(conflict.createdAt)}
        </div>
      </div>

      {/* Preserved Side-by-Side Original Outputs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectAgent(conflict.agentAId)}
              className="font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              Output A: {getAgentDisplayName(conflict.agentAId)}
            </button>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {conflict.outputARef}
            </span>
          </div>
          <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-[var(--bg-subtle)] p-2 font-mono text-[10.5px] text-[var(--text-secondary)] whitespace-pre-wrap">
            {JSON.stringify(conflict.outputASnapshot, null, 2)}
          </pre>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectAgent(conflict.agentBId)}
              className="font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              Output B: {getAgentDisplayName(conflict.agentBId)}
            </button>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {conflict.outputBRef}
            </span>
          </div>
          <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-[var(--bg-subtle)] p-2 font-mono text-[10.5px] text-[var(--text-secondary)] whitespace-pre-wrap">
            {JSON.stringify(conflict.outputBSnapshot, null, 2)}
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px] text-[var(--text-muted)]">
        <span>Affected nodes: {conflict.affectedNodeKeys.join(', ') || 'workflow'}</span>
        {conflict.verificationMessageId && (
          <span>Verification msg: {conflict.verificationMessageId}</span>
        )}
      </div>

      {isClosed ? (
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/70 px-3 py-2 text-[11.5px] text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="font-semibold">
            {conflict.status === 'dismissed' ? 'Dismissed' : 'Resolved'} ({conflict.selectedResolution ?? 'custom'}) by{' '}
            {conflict.resolvedByName ?? 'Reviewer'} ({conflict.resolvedByRole ?? 'Owner'})
          </div>
          {conflict.resolutionNote && (
            <div className="mt-0.5">{conflict.resolutionNote}</div>
          )}
        </div>
      ) : canResolve ? (
        <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">
              Resolution Decision:
            </span>
            {(
              [
                { id: 'keep_a', label: 'Keep Output A' },
                { id: 'keep_b', label: 'Keep Output B' },
                { id: 'custom', label: 'Custom Synthesis' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={choice === opt.id}
                onClick={() => setChoice(opt.id)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  choice === opt.id
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              Audit Resolution Note (required)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Document why this source or override was selected..."
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </label>

          {error && (
            <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <InteractiveButton
              variant="primary"
              size="sm"
              disabled={submitting}
              onClick={() => void handleResolve(false)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{submitting ? 'Saving...' : 'Resolve Conflict'}</span>
            </InteractiveButton>
            <InteractiveButton
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => void handleResolve(true)}
            >
              <span>Dismiss</span>
            </InteractiveButton>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
          Human resolution requires Platform Admin, Agency Owner, or Business Owner role.
        </div>
      )}
    </div>
  );
}

export function AgentFactoryCollaborationMonitor({
  projectId,
  selectedWorkflowId,
  collaboration,
  onRefreshCollaboration,
  onSelectAgent,
}: AgentFactoryCollaborationMonitorProps) {
  const user = useAuthStore((s) => s.user);
  const canResolveConflicts = isOfficialConflictResolverRole(user?.role);

  const [activeTab, setActiveTab] = useState<MonitorTab>('messages');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const summary = collaboration?.summary ?? {
    activeCollaborations: 0,
    totalMessages: 0,
    failedMessages: 0,
    pendingRequests: 0,
    delegatedTasks: 0,
    openConflicts: 0,
    resolvedConflicts: 0,
    contextVersions: 0,
    verifiedEvidenceRefs: 0,
    unsupportedClaimsCount: 0,
  };

  const filteredMessages = useMemo(() => {
    const list = collaboration?.messages ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((m) => {
      if (
        agentFilter !== 'all' &&
        m.sourceAgentId !== agentFilter &&
        m.destinationAgentId !== agentFilter
      ) {
        return false;
      }
      if (typeFilter !== 'all' && m.messageType !== typeFilter) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (q) {
        const hay = `${m.sourceAgentId} ${m.destinationAgentId} ${m.messageType} ${m.correlationId} ${JSON.stringify(m.payload)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [collaboration?.messages, agentFilter, typeFilter, statusFilter, searchQuery]);

  const delegations = collaboration?.delegations ?? [];
  const conflicts = collaboration?.conflicts ?? [];
  const contextItems = collaboration?.contextItems ?? [];
  const evidenceSummary = collaboration?.evidenceSummary;

  const participantAgentIds = useMemo(() => {
    const set = new Set<AgentId>();
    for (const m of collaboration?.messages ?? []) {
      set.add(m.sourceAgentId);
      set.add(m.destinationAgentId);
    }
    return Array.from(set);
  }, [collaboration?.messages]);

  return (
    <GlassPanel
      as="section"
      ariaLabel="Multi-Agent Collaboration Monitor"
      className="p-4 space-y-4"
    >
      {/* Header & Stage 3 Summary Strip */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Multi-Agent Collaboration Monitor
            </h2>
            <StatusBadge label="Stage 3 Protocol" tone="indigo" />
            {selectedWorkflowId && (
              <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                Scoped to workflow {selectedWorkflowId.slice(0, 12)}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-[var(--text-muted)]">
            Persisted agent-to-agent messages, governed dynamic delegations, versioned shared context, conflict resolution, and Evidence Trust separation.
          </p>
        </div>

        {/* 4-Tab Switcher */}
        <div
          role="tablist"
          aria-label="Collaboration Monitor Sections"
          className="inline-flex shrink-0 flex-wrap items-center gap-0.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-xs"
        >
          {(
            [
              {
                id: 'messages',
                label: `Messages (${summary.totalMessages})`,
              },
              {
                id: 'delegations',
                label: `Delegated (${summary.delegatedTasks})`,
              },
              {
                id: 'conflicts',
                label: `Conflicts (${summary.openConflicts})`,
              },
              {
                id: 'context',
                label: `Context & Trust (${summary.contextVersions})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Metrics Bar */}
      <div
        data-testid="collaboration-kpi-strip"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
      >
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Active Collaborations
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
            {summary.activeCollaborations}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Persisted Messages
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
            {summary.totalMessages}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Delegated Subtasks
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
            {summary.delegatedTasks}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Open Conflicts
          </div>
          <div
            className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
              summary.openConflicts > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {summary.openConflicts}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Context Versions
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
            {summary.contextVersions}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">
            Verified Evidence Refs
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {summary.verifiedEvidenceRefs}
          </div>
        </div>
      </div>

      {/* TAB 1: MESSAGES & ACTIVE COLLABORATIONS */}
      {activeTab === 'messages' && (
        <div data-testid="collaboration-messages-panel" className="space-y-3">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search collaboration messages"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search payloads, correlation..."
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>

            <select
              aria-label="Filter messages by agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="all">All Agents</option>
              {participantAgentIds.map((id) => (
                <option key={id} value={id}>
                  {getAgentDisplayName(id)}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter messages by type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="all">All Message Types</option>
              {(Object.keys(MESSAGE_TYPE_LABELS) as AgentMessageType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {MESSAGE_TYPE_LABELS[t]}
                  </option>
                ),
              )}
            </select>

            <select
              aria-label="Filter messages by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              No persisted agent-to-agent messages match the current filters. Launch a Stage 3 collaborative workflow (e.g., Competitor Research Collaboration, Technical SEO Collaboration, or Content Production Collaboration) to watch real peer messages and delegations stream here.
            </div>
          ) : (
            <ol className="max-h-[300px] divide-y divide-[var(--border-hairline)] overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
              {filteredMessages.map((msg) => (
                <li
                  key={msg.messageId}
                  className="flex flex-col gap-1.5 px-3.5 py-2.5 text-xs sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <MessageSquare
                        className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => onSelectAgent(msg.sourceAgentId)}
                        className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        {getAgentDisplayName(msg.sourceAgentId)}
                      </button>
                      <ArrowRight
                        className="h-3 w-3 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => onSelectAgent(msg.destinationAgentId)}
                        className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        {getAgentDisplayName(msg.destinationAgentId)}
                      </button>
                      <StatusBadge
                        label={
                          MESSAGE_TYPE_LABELS[msg.messageType] ?? msg.messageType
                        }
                        tone="neutral"
                      />
                      <StatusBadge
                        label={msg.status}
                        tone={getMessageStatusTone(msg.status)}
                      />
                    </div>

                    <div className="text-[var(--text-secondary)]">
                      {extractMessageSummary(msg.payload, msg.messageType)}
                    </div>

                    {msg.errorSummary && (
                      <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        {msg.errorSummary}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--text-muted)]">
                      <span>corr:{msg.correlationId.slice(0, 14)}</span>
                      <span>·</span>
                      <span>{msg.evidenceReferences.length} evidence ref(s)</span>
                      {msg.replyToMessageId && (
                        <>
                          <span>·</span>
                          <span>reply:{msg.replyToMessageId.slice(0, 12)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                    {formatShortTimestamp(msg.timestamp)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* TAB 2: GOVERNED DELEGATED SUBTASKS */}
      {activeTab === 'delegations' && (
        <div data-testid="collaboration-delegations-panel" className="space-y-2.5">
          {delegations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              No dynamic subtasks have been delegated yet. When an agent encounters missing keyword, geographic, performance, or competitor evidence during execution, governed delegations (depth &lt;= 2) appear here.
            </div>
          ) : (
            <ul className="space-y-2">
              {delegations.map((del) => (
                <li
                  key={del.id}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <GitBranch
                        className="h-3.5 w-3.5 text-[var(--accent-primary)]"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => onSelectAgent(del.sourceAgentId)}
                        className="font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                      >
                        {getAgentDisplayName(del.sourceAgentId)}
                      </button>
                      <ArrowRight
                        className="h-3 w-3 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => onSelectAgent(del.targetAgentId)}
                        className="font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                      >
                        {getAgentDisplayName(del.targetAgentId)}
                      </button>
                      <StatusBadge
                        label={`Depth ${del.delegationDepth}`}
                        tone="neutral"
                      />
                      <StatusBadge
                        label={del.status}
                        tone={
                          del.status === 'completed'
                            ? 'success'
                            : del.status === 'failed' || del.status === 'rejected'
                              ? 'danger'
                              : 'indigo'
                        }
                      />
                    </div>
                    <span className="font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                      {formatShortTimestamp(del.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1.5 font-medium text-[var(--text-primary)]">
                    {del.requestedObjective}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Reason: {del.reason}
                  </div>
                  {del.errorSummary && (
                    <div className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {del.errorSummary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* TAB 3: CONFLICTS & HUMAN RESOLUTION */}
      {activeTab === 'conflicts' && (
        <div data-testid="collaboration-conflicts-panel" className="space-y-3">
          {conflicts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <span>
                No open or historical conflicts detected between agents in this scope.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  projectId={projectId}
                  conflict={conflict}
                  canResolve={canResolveConflicts}
                  onSelectAgent={onSelectAgent}
                  onResolved={onRefreshCollaboration}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SHARED WORKFLOW CONTEXT & EVIDENCE TRUST */}
      {activeTab === 'context' && (
        <div
          data-testid="collaboration-context-panel"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          {/* Shared Context Versions */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Shared Workflow Context ({contextItems.length})</span>
              </h3>
            </div>

            {contextItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                Shared workflow context snapshots appear automatically when a workflow is created and seeded from approved project data.
              </div>
            ) : (
              <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {contextItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.contextScope.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                          v{item.version}
                        </span>
                        <StatusBadge
                          label={item.approvalStatus}
                          tone={
                            item.approvalStatus === 'approved' ||
                            item.approvalStatus === 'verified_evidence'
                              ? 'success'
                              : item.conflictFlag
                                ? 'warning'
                                : 'neutral'
                          }
                        />
                        {item.isApprovedLock && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-300">
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                            Protected
                          </span>
                        )}
                        {item.conflictFlag && (
                          <StatusBadge label="Conflict Proposed" tone="danger" />
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">
                        {formatShortTimestamp(item.createdAt)}
                      </span>
                    </div>
                    <div className="font-mono text-[10.5px] text-[var(--text-muted)]">
                      Key: {item.contextKey} · Source: {item.source} ·{' '}
                      {item.evidenceReferences.length} evidence ref(s)
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Evidence Trust Audit Breakdown */}
          <div className="space-y-2.5">
            <h3 className="inline-flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Evidence Trust Audit</span>
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/25">
                <div className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Verified Facts
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-emerald-900 dark:text-emerald-100 tabular-nums">
                  {evidenceSummary?.verifiedFactsCount ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-sky-300/60 bg-sky-50/60 p-3 dark:border-sky-800/50 dark:bg-sky-950/25">
                <div className="text-[10.5px] font-semibold text-sky-700 dark:text-sky-300">
                  Measured Metrics
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-sky-900 dark:text-sky-100 tabular-nums">
                  {evidenceSummary?.measuredMetricsCount ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-indigo-300/60 bg-indigo-50/60 p-3 dark:border-indigo-800/50 dark:bg-indigo-950/25">
                <div className="text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Inferred Findings
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-indigo-900 dark:text-indigo-100 tabular-nums">
                  {evidenceSummary?.inferredFindingsCount ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-950/25">
                <div className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
                  AI Suggestions (Review)
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                  {evidenceSummary?.aiSuggestionsCount ?? 0}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">
                  Outputs Audited by Evidence Policy
                </span>
                <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                  {evidenceSummary?.outputsAudited ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Explicitly Declared Unavailable Items</span>
                <span className="font-mono font-semibold tabular-nums">
                  {evidenceSummary?.unavailableItemsCount ?? 0}
                </span>
              </div>
            </div>

            {evidenceSummary && evidenceSummary.unsupportedClaims.length > 0 && (
              <div className="rounded-xl border border-rose-300/70 bg-rose-50/80 p-3 text-xs dark:border-rose-800/60 dark:bg-rose-950/35">
                <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    Unsupported Claims Flagged ({evidenceSummary.unsupportedClaims.length})
                  </span>
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-rose-900 dark:text-rose-200">
                  {evidenceSummary.unsupportedClaims.slice(0, 5).map((u, idx) => (
                    <li key={idx}>
                      <span className="font-mono">[{u.agentId}]</span> {u.claim}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
