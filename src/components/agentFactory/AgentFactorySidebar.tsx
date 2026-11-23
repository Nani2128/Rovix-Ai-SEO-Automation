import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { getStateVisualSpec } from '../../lib/agentFactoryState';
import type { AgentFactoryConnectionStatus } from '../../services/agentFactoryService';
import type {
  AgentExecutionState,
  AgentFactorySnapshot,
  AgentId,
  AgentStationNodeSnapshot,
} from '../../types/agentFactory';
import { GlassPanel } from '../ui/GlassPanel';
import { StatusBadge } from '../ui/StateViews';

type SidebarFilter = 'all' | 'active' | 'waiting' | 'issues';

export interface AgentFactorySidebarProps {
  snapshot: AgentFactorySnapshot | null;
  connectionStatus: AgentFactoryConnectionStatus;
  selectedAgentId: AgentId;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSelectAgent: (agentId: AgentId) => void;
  onInspectAgent: (agentId: AgentId) => void;
}

function formatDurationShort(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getSystemHealthDisplay(
  health: AgentFactorySnapshot['systemHealth'] | undefined,
): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (health) {
    case 'healthy':
      return { label: 'Healthy', tone: 'success' };
    case 'attention_required':
      return { label: 'Attention Required', tone: 'danger' };
    case 'degraded':
      return { label: 'Degraded', tone: 'warning' };
    default:
      return { label: 'Initializing', tone: 'neutral' };
  }
}

function isWorkingState(state: AgentExecutionState): boolean {
  return (
    state === 'running' ||
    state === 'communicating' ||
    state === 'queued' ||
    state === 'retrying'
  );
}

function SidebarBody({
  snapshot,
  connectionStatus,
  selectedAgentId,
  onSelectAgent,
  onInspectAgent,
  onCloseMobile,
  isMobile,
}: {
  snapshot: AgentFactorySnapshot | null;
  connectionStatus: AgentFactoryConnectionStatus;
  selectedAgentId: AgentId;
  onSelectAgent: (agentId: AgentId) => void;
  onInspectAgent: (agentId: AgentId) => void;
  onCloseMobile?: () => void;
  isMobile?: boolean;
}) {
  const [filter, setFilter] = useState<SidebarFilter>('all');
  const [query, setQuery] = useState('');

  const nodes = snapshot?.nodes ?? [];
  const counts = snapshot?.counts;
  const healthMeta = getSystemHealthDisplay(snapshot?.systemHealth);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (filter === 'active') {
        if (!isWorkingState(node.state) && node.metrics.queueDepth === 0 && node.metrics.runningCount === 0) {
          return false;
        }
      } else if (filter === 'waiting') {
        if (node.state !== 'waiting_for_approval' && node.metrics.waitingApprovalCount === 0) {
          return false;
        }
      } else if (filter === 'issues') {
        if (
          node.state !== 'failed' &&
          node.state !== 'unavailable' &&
          node.metrics.failedCount === 0
        ) {
          return false;
        }
      }

      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.shortName.toLowerCase().includes(q) ||
        node.role.toLowerCase().includes(q)
      );
    });
  }, [nodes, filter, query]);

  const totalQueuedAll = useMemo(
    () =>
      nodes.reduce((sum, n) => sum + (n.isOrchestrator ? 0 : n.metrics.queueDepth), 0),
    [nodes],
  );

  const totalWaitingAll = useMemo(
    () =>
      nodes.reduce(
        (sum, n) => sum + (n.isOrchestrator ? 0 : n.metrics.waitingApprovalCount),
        0,
      ),
    [nodes],
  );

  const connectionColor =
    connectionStatus === 'connected'
      ? '#10B981'
      : connectionStatus === 'connecting'
        ? '#F59E0B'
        : '#EF4444';
  const connectionText =
    connectionStatus === 'connected'
      ? 'SSE Stream Active'
      : connectionStatus === 'connecting'
        ? 'Connecting Stream'
        : 'Stream Reconnecting';

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Activity
            className="h-4 w-4 shrink-0 text-[var(--accent-primary)]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-bold text-[var(--text-primary)]">
              Agent Telemetry
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: connectionColor }}
              />
              <span className="truncate">{connectionText}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge label={healthMeta.label} tone={healthMeta.tone} />
          {isMobile && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close agent telemetry sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Queue & Health Strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Active / Running
          </div>
          <div
            data-testid="sidebar-metric-active"
            className="mt-0.5 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums"
          >
            {counts ? counts.activeAgents : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Task Queue
          </div>
          <div
            data-testid="sidebar-metric-queued"
            className="mt-0.5 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums"
          >
            {counts ? Math.max(counts.queuedTasks, totalQueuedAll) : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Waiting Approval
          </div>
          <div
            data-testid="sidebar-metric-approvals"
            className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
              (counts?.waitingApprovalTasks ?? totalWaitingAll) > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {counts ? Math.max(counts.waitingApprovalTasks, totalWaitingAll) : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            Failed Stations
          </div>
          <div
            data-testid="sidebar-metric-failed"
            className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
              (counts?.failedExecutions ?? 0) > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {counts ? counts.failedExecutions : '—'}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter SEO agents…"
            aria-label="Filter SEO agents in sidebar"
            className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
        </div>

        <div
          role="group"
          aria-label="Filter agents by runtime state"
          className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-[11px]"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'waiting', label: 'Gates' },
              { id: 'issues', label: 'Alerts' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-lg py-1 font-semibold transition-colors cursor-pointer ${
                filter === item.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Individual Agent Cards */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredNodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] px-3 py-6 text-center text-xs text-[var(--text-muted)]">
            No SEO agents match this filter.
          </div>
        ) : (
          filteredNodes.map((node: AgentStationNodeSnapshot) => {
            const spec = getStateVisualSpec(node.state);
            const isSelected = node.agentId === selectedAgentId;
            const totalTokens =
              node.metrics.tokenUsageAvailable &&
              node.metrics.totalInputTokens !== null &&
              node.metrics.totalOutputTokens !== null
                ? node.metrics.totalInputTokens + node.metrics.totalOutputTokens
                : null;

            return (
              <div
                key={node.agentId}
                className={`rounded-2xl border p-2.5 transition-colors ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)]/45'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAgent(node.agentId);
                      if (isMobile && onCloseMobile) onCloseMobile();
                    }}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: spec.colorHex }}
                      />
                      <span className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
                        {node.shortName}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                      {node.role}
                    </div>
                  </button>
                  <StatusBadge label={spec.label} tone={spec.badgeTone} />
                </div>

                {/* Current Task or Availability */}
                <div className="mt-1.5 truncate text-[11px] text-[var(--text-secondary)]">
                  {node.currentTask
                    ? `Active: ${node.currentTask.title}`
                    : node.availabilityStatus === 'unavailable'
                      ? 'Unavailable (config needed)'
                      : node.lastExecution
                        ? node.lastExecution.summary
                        : 'Standing by for workflow dispatch'}
                </div>

                {/* Queue + Performance Metrics Row */}
                <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-[var(--border-hairline)] pt-1.5 font-mono text-[10.5px] tabular-nums">
                  <div className="text-[var(--text-muted)]" title="Queue & Active depth">
                    <span>Q:{node.metrics.queueDepth}</span>
                    {node.metrics.runningCount > 0 && (
                      <span className="ml-1 text-cyan-600 dark:text-cyan-400">
                        R:{node.metrics.runningCount}
                      </span>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-0.5 text-[var(--text-muted)]"
                    title="Average execution duration"
                  >
                    <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    <span>{formatDurationShort(node.metrics.avgDurationMs)}</span>
                  </div>
                  <div className="text-right">
                    {node.metrics.failedCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                        <span>{node.metrics.failedCount} err</span>
                      </span>
                    ) : totalTokens !== null ? (
                      <span className="text-[var(--text-secondary)]" title="Measured LLM tokens">
                        {totalTokens.toLocaleString()} tok
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[var(--text-muted)]">
                        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                        <span>{node.metrics.completedCount} ok</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Inspect Trigger when Selected */}
                {isSelected && (
                  <div className="mt-2 flex items-center justify-between gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--text-muted)]">
                      {node.metrics.waitingApprovalCount > 0 && (
                        <>
                          <ShieldAlert className="h-3 w-3 text-amber-500" aria-hidden="true" />
                          <span>{node.metrics.waitingApprovalCount} approval gate</span>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onInspectAgent(node.agentId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
                    >
                      <Layers className="h-3 w-3" aria-hidden="true" />
                      <span>Inspect</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function AgentFactorySidebar({
  snapshot,
  connectionStatus,
  selectedAgentId,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
  onSelectAgent,
  onInspectAgent,
}: AgentFactorySidebarProps) {
  const nodes = snapshot?.nodes ?? [];

  return (
    <>
      {/* Desktop Responsive Collapsible Rail */}
      <aside
        aria-label="Agent Telemetry Sidebar"
        className={`hidden xl:flex xl:flex-col xl:shrink-0 transition-[width] duration-200 ${
          collapsed ? 'xl:w-[68px]' : 'xl:w-[300px]'
        }`}
      >
        <GlassPanel className="flex h-[636px] flex-col p-3">
          {collapsed ? (
            <div className="flex h-full flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand agent telemetry sidebar"
                title="Expand agent telemetry sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="my-1 h-px w-8 bg-[var(--border-hairline)]" />

              <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-1">
                {nodes.map((node) => {
                  const spec = getStateVisualSpec(node.state);
                  const isSelected = node.agentId === selectedAgentId;
                  return (
                    <button
                      key={node.agentId}
                      type="button"
                      onClick={() => onSelectAgent(node.agentId)}
                      title={`${node.name} — ${spec.label} (Q:${node.metrics.queueDepth}, OK:${node.metrics.completedCount})`}
                      aria-label={`Select ${node.name} (${spec.label})`}
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)]/45'
                      }`}
                    >
                      <Cpu className="h-4 w-4 text-[var(--text-primary)]" aria-hidden="true" />
                      <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: spec.colorHex }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="relative flex h-full flex-col">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse agent telemetry sidebar"
                title="Collapse sidebar"
                className="mb-2 inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span>Live Agent Fleet ({nodes.length})</span>
                <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <div className="min-h-0 flex-1">
                <SidebarBody
                  snapshot={snapshot}
                  connectionStatus={connectionStatus}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                  onInspectAgent={onInspectAgent}
                />
              </div>
            </div>
          )}
        </GlassPanel>
      </aside>

      {/* Mobile & Tablet Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Agent Telemetry Drawer"
        >
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-950/60"
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-[min(90vw,340px)] flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 shadow-2xl">
            <SidebarBody
              snapshot={snapshot}
              connectionStatus={connectionStatus}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              onInspectAgent={onInspectAgent}
              onCloseMobile={onCloseMobile}
              isMobile
            />
          </aside>
        </div>
      )}
    </>
  );
}
