import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Box,
  CalendarClock,
  Coins,
  Cpu,
  ExternalLink,
  Focus,
  Layers,
  Network,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Settings2,
  Workflow,
} from 'lucide-react';
import { FloatingPopover, PageTransition } from '../../components/animation/MotionPrimitives';
import { AgentFactory2DView } from '../../components/agentFactory/AgentFactory2DView';
import { AgentFactoryCollaborationMonitor } from '../../components/agentFactory/AgentFactoryCollaborationMonitor';
import { AgentFactoryErrorBoundary } from '../../components/agentFactory/AgentFactoryErrorBoundary';
import { AgentFactoryInspectorDrawer } from '../../components/agentFactory/AgentFactoryInspectorDrawer';
import type { AgentFactorySceneSettings } from '../../components/agentFactory/AgentFactoryScene3D';
import { AgentFactorySidebar } from '../../components/agentFactory/AgentFactorySidebar';
import { AgentFactoryWorkflowPanel } from '../../components/agentFactory/AgentFactoryWorkflowPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import {
  EmptyStateCard,
  ErrorStateCard,
  StatusBadge,
} from '../../components/ui/StateViews';
import {
  applyAgentFactoryEvent,
  createInitialAgentFactoryState,
  getStateVisualSpec,
  pruneExpiredCommunicationLinks,
  type AgentFactoryClientState,
} from '../../lib/agentFactoryState';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import {
  agentFactoryService,
  type AgentFactoryConnectionStatus,
} from '../../services/agentFactoryService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useThemeStore } from '../../stores/useThemeStore';
import type {
  AgentId,
  AgentOrchestrationOverview,
  AgentWorkflowDetail,
  CollaborationMonitorPayload,
} from '../../types/agentFactory';

const AgentFactoryScene3D = lazy(() =>
  import('../../components/agentFactory/AgentFactoryScene3D').then((m) => ({
    default: m.AgentFactoryScene3D,
  })),
);

type TimelineFilter = 'all' | 'errors' | 'communications';

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function AgentFactoryPage() {
  const navigate = useNavigate();
  const prefersReducedMotion = Boolean(useReducedMotion());
  const themePreset = useThemeStore((s) => s.preset);
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();

  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [webglFallbackNotice, setWebglFallbackNotice] = useState<string | null>(
    null,
  );
  const [connectionStatus, setConnectionStatus] =
    useState<AgentFactoryConnectionStatus>('connecting');
  const [clientState, setClientState] = useState<AgentFactoryClientState | null>(
    null,
  );
  const [overview, setOverview] = useState<AgentOrchestrationOverview | null>(
    null,
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [selectedWorkflowDetail, setSelectedWorkflowDetail] =
    useState<AgentWorkflowDetail | null>(null);
  const [collaboration, setCollaboration] =
    useState<CollaborationMonitorPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('orchestrator');
  const [hoveredAgentId, setHoveredAgentId] = useState<AgentId | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const [resetSignal, setResetSignal] = useState(0);
  const [focusSelectedSignal, setFocusSelectedSignal] = useState(0);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<AgentFactorySceneSettings>({
    showLabels: true,
    ambientAnimation: true,
    focusOnSelect: true,
    showSecondaryLinks: true,
  });

  // Ensure projects list is hydrated when deep-linking directly to /agent-factory
  useEffect(() => {
    if (projects.length === 0) {
      void loadProjectsOnly();
    }
  }, [projects.length, loadProjectsOnly]);

  const activeProjectId =
    selectedProjectId || (projects.length > 0 ? projects[0].id : '');

  const selectedWorkflowIdRef = useRef<string | null>(selectedWorkflowId);
  selectedWorkflowIdRef.current = selectedWorkflowId;

  const refreshCollaboration = useCallback(
    async (projectId: string, workflowId?: string | null) => {
      if (!projectId) return;
      try {
        const next = await agentFactoryService.getCollaborationMonitor(
          projectId,
          workflowId ? { workflowId } : undefined,
        );
        setCollaboration(next);
      } catch {
        // Keep existing collaboration view on transient fetch failure
      }
    },
    [],
  );

  const refreshOrchestration = useCallback(
    async (projectId: string, focusWorkflowId?: string) => {
      if (!projectId) return;
      try {
        const nextOverview =
          await agentFactoryService.getOrchestrationOverview(projectId);
        setOverview(nextOverview);
        const targetWfId =
          focusWorkflowId ??
          selectedWorkflowIdRef.current ??
          nextOverview.workflows[0]?.id ??
          null;
        if (targetWfId) {
          setSelectedWorkflowId(targetWfId);
          try {
            const detail = await agentFactoryService.getWorkflowDetail(
              projectId,
              targetWfId,
            );
            setSelectedWorkflowDetail(detail);
          } catch {
            setSelectedWorkflowDetail(null);
          }
          await refreshCollaboration(projectId, targetWfId);
        } else {
          setSelectedWorkflowDetail(null);
          await refreshCollaboration(projectId, null);
        }
      } catch {
        // Keep snapshot visible even if overview fails transiently
      }
    },
    [refreshCollaboration],
  );

  const loadSnapshot = useCallback(
    async (projectId: string) => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [snap] = await Promise.all([
          agentFactoryService.getSnapshot(projectId),
          refreshOrchestration(projectId),
        ]);
        setClientState(createInitialAgentFactoryState(snap));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load Agent Factory telemetry snapshot.',
        );
      } finally {
        setLoading(false);
      }
    },
    [refreshOrchestration],
  );

  // Load initial snapshot + Stage 2 overview & open authenticated SSE stream
  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedWorkflowId(null);
    setSelectedWorkflowDetail(null);
    setCollaboration(null);
    void loadSnapshot(activeProjectId);

    let refreshTimer: number | null = null;
    const scheduleOverviewSync = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (!cancelled) {
          void refreshOrchestration(activeProjectId);
        }
      }, 280);
    };

    const unsubscribe = agentFactoryService.subscribeToStream(activeProjectId, {
      onStatusChange: (status) => {
        if (!cancelled) setConnectionStatus(status);
      },
      onSnapshot: (snap) => {
        if (cancelled) return;
        setClientState(createInitialAgentFactoryState(snap));
        setLoading(false);
        setError(null);
      },
      onEvent: (event) => {
        if (cancelled) return;
        setClientState((prev) =>
          prev ? applyAgentFactoryEvent(prev, event) : prev,
        );
        if (
          event.eventType === 'workflow.started' ||
          event.eventType === 'workflow.completed' ||
          event.eventType === 'workflow.failed' ||
          event.eventType === 'workflow.cancelled' ||
          event.eventType === 'task.waiting_approval' ||
          event.eventType === 'approval.decided' ||
          event.eventType === 'agent.completed' ||
          event.eventType === 'agent.failed' ||
          event.eventType === 'agent.retrying' ||
          event.eventType === 'handoff.recorded' ||
          event.eventType === 'agent.message.sent' ||
          event.eventType === 'agent.message.delivered' ||
          event.eventType === 'agent.message.failed' ||
          event.eventType === 'agent.delegation.created' ||
          event.eventType === 'agent.delegation.completed' ||
          event.eventType === 'context.versioned' ||
          event.eventType === 'conflict.detected' ||
          event.eventType === 'conflict.resolved' ||
          event.eventType === 'workflow.paused' ||
          event.eventType === 'workflow.resumed' ||
          event.eventType === 'workflow.recovered' ||
          event.eventType === 'schedule.triggered' ||
          event.eventType === 'trigger.fired' ||
          event.eventType === 'task.dead_lettered'
        ) {
          scheduleOverviewSync();
        }
      },
    });

    return () => {
      cancelled = true;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      unsubscribe();
    };
  }, [activeProjectId, loadSnapshot, refreshOrchestration]);

  // Load workflow detail when user picks another workflow in the orchestration panel
  const handleSelectWorkflow = useCallback(
    async (workflowId: string) => {
      setSelectedWorkflowId(workflowId);
      if (!activeProjectId) return;
      try {
        const detail = await agentFactoryService.getWorkflowDetail(
          activeProjectId,
          workflowId,
        );
        setSelectedWorkflowDetail(detail);
      } catch {
        setSelectedWorkflowDetail(null);
      }
      await refreshCollaboration(activeProjectId, workflowId);
    },
    [activeProjectId, refreshCollaboration],
  );

  // Prune expired real-event communication links cleanly only while links exist
  const activeLinksCount = clientState?.snapshot.activeLinks.length ?? 0;
  useEffect(() => {
    if (activeLinksCount === 0) return;
    const timer = window.setInterval(() => {
      setClientState((prev) =>
        prev ? pruneExpiredCommunicationLinks(prev) : prev,
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeLinksCount]);

  const handleWebGLUnavailable = useCallback(() => {
    setWebglFallbackNotice(
      'WebGL 3D rendering is unavailable in this browser context. Switched automatically to 2D topology view.',
    );
    setViewMode('2d');
  }, []);

  const handleSelectAgent = useCallback(
    (agentId: AgentId) => {
      setSelectedAgentId(agentId);
      if (viewMode === '3d' && settings.focusOnSelect) {
        setFocusSelectedSignal((c) => c + 1);
      }
    },
    [viewMode, settings.focusOnSelect],
  );

  const handleResetView = useCallback(() => {
    setSelectedAgentId('orchestrator');
    setResetSignal((c) => c + 1);
  }, []);

  const snapshot = clientState?.snapshot ?? null;
  const nodes = snapshot?.nodes ?? [];
  const selectedAgent = useMemo(
    () =>
      nodes.find((n) => n.agentId === selectedAgentId) ?? nodes[0] ?? null,
    [nodes, selectedAgentId],
  );

  const filteredTimeline = useMemo(() => {
    const events = snapshot?.recentEvents ?? [];
    if (timelineFilter === 'errors') {
      return events.filter(
        (e) =>
          e.eventType === 'agent.failed' ||
          e.eventType === 'workflow.failed' ||
          e.eventType === 'agent.retrying' ||
          e.eventType === 'agent.message.failed',
      );
    }
    if (timelineFilter === 'communications') {
      return events.filter(
        (e) =>
          e.eventType === 'agent.communication' ||
          e.eventType === 'handoff.recorded' ||
          e.eventType === 'agent.message.sent' ||
          e.eventType === 'agent.message.delivered' ||
          e.eventType === 'agent.delegation.created' ||
          e.eventType === 'agent.delegation.completed' ||
          e.eventType === 'conflict.detected' ||
          e.eventType === 'conflict.resolved',
      );
    }
    return events;
  }, [snapshot?.recentEvents, timelineFilter]);

  const handleStationKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (nodes.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = nodes[(idx + 1) % nodes.length];
        handleSelectAgent(next.agentId);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = nodes[(idx - 1 + nodes.length) % nodes.length];
        handleSelectAgent(prev.agentId);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        setInspectorOpen(true);
      }
    },
    [nodes, handleSelectAgent],
  );

  const connectionDotColor =
    connectionStatus === 'connected'
      ? '#10B981'
      : connectionStatus === 'connecting'
        ? '#F59E0B'
        : '#EF4444';
  const connectionLabel =
    connectionStatus === 'connected'
      ? 'Live Connected'
      : connectionStatus === 'connecting'
        ? 'Connecting Stream'
        : 'Disconnected';

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Create or select a website project first so the AI Agent Factory can execute multi-agent workflows and stream real crawl, keyword, performance, and competitor telemetry."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-4">
      {/* TOP BAR */}
      <GlassPanel as="section" ariaLabel="Agent Factory Controls" className="p-4">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
                <Cpu className="h-4 w-4" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                AI Agent Factory
              </h1>
              <StatusBadge label="Stage 3 · Collaborative Engine" tone="indigo" />
              <span
                data-testid="agent-factory-connection-status"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: connectionDotColor }}
                />
                <span>{connectionLabel}</span>
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Multi-agent DAG orchestration with peer-to-peer messaging, governed delegation, shared versioned context, conflict resolution, and Evidence Trust verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Mobile / Tablet Sidebar Drawer Trigger */}
            <InteractiveButton
              variant="secondary"
              size="sm"
              className="xl:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              ariaLabel="Open agent telemetry sidebar"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agent Fleet</span>
            </InteractiveButton>

            {/* Stage 4 Visual Workflow Studio Link */}
            <Link
              to="/agent-factory/workflows"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] whitespace-nowrap shrink-0"
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Workflow Studio</span>
            </Link>

            {/* Stage 5 Usage & Cost Intelligence Link */}
            <Link
              to="/agent-factory/analytics"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] whitespace-nowrap shrink-0"
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Usage &amp; Cost</span>
            </Link>

            {/* Stage 6 Autonomous Operations Link */}
            <Link
              to="/agent-factory/operations"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] whitespace-nowrap shrink-0"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Operations</span>
            </Link>

            {/* Project Workspace Selector */}
            {projects.length > 0 && (
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Project
                </span>
                <select
                  aria-label="Select project workspace"
                  value={activeProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="max-w-[155px] truncate bg-transparent font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-[var(--bg-surface)] text-[var(--text-primary)]"
                    >
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* 3D / 2D Toggle */}
            <div
              role="group"
              aria-label="Viewport Dimension Mode"
              className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={viewMode === '3d'}
                onClick={() => {
                  setWebglFallbackNotice(null);
                  setViewMode('3d');
                }}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === '3d'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Box className="h-3.5 w-3.5" aria-hidden="true" />
                <span>3D</span>
              </button>
              <button
                type="button"
                aria-pressed={viewMode === '2d'}
                onClick={() => setViewMode('2d')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Network className="h-3.5 w-3.5" aria-hidden="true" />
                <span>2D</span>
              </button>
            </div>

            {/* Focus Selected & Camera Reset to Central Orchestrator */}
            <InteractiveButton
              variant="secondary"
              size="sm"
              disabled={viewMode !== '3d'}
              onClick={() => setFocusSelectedSignal((c) => c + 1)}
              ariaLabel="Focus camera on selected agent"
              title="Focus camera on selected agent"
            >
              <Focus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Focus</span>
            </InteractiveButton>

            <InteractiveButton
              variant="secondary"
              size="sm"
              disabled={viewMode !== '3d'}
              onClick={handleResetView}
              ariaLabel="Reset 3D camera view"
              title="Reset view to central AI Orchestrator"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reset View</span>
            </InteractiveButton>

            <InteractiveButton
              variant="secondary"
              size="sm"
              onClick={() => activeProjectId && void loadSnapshot(activeProjectId)}
              ariaLabel="Refresh snapshot telemetry"
              title="Refresh backend snapshot"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </InteractiveButton>

            {/* Settings Popover */}
            <div className="relative">
              <button
                ref={settingsBtnRef}
                type="button"
                aria-expanded={settingsOpen}
                aria-label="Agent Factory visual settings"
                onClick={() => setSettingsOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/45 cursor-pointer transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              <FloatingPopover
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                anchorRef={settingsBtnRef}
                className="right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 shadow-[0_18px_40px_-14px_rgba(15,23,42,0.35)]"
              >
                <div className="font-display text-xs font-bold text-[var(--text-primary)]">
                  3D Environment Preferences
                </div>
                <div className="mt-2.5 space-y-2 text-xs">
                  {(
                    [
                      {
                        key: 'showLabels',
                        label: 'Show station labels',
                      },
                      {
                        key: 'ambientAnimation',
                        label: 'Animate active conduits',
                      },
                      {
                        key: 'focusOnSelect',
                        label: 'Smooth camera focus on select',
                      },
                      {
                        key: 'showSecondaryLinks',
                        label: 'Highlight peer pathways',
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {opt.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={settings[opt.key]}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            [opt.key]: e.target.checked,
                          }))
                        }
                        className="h-3.5 w-3.5 accent-[#7047EB] cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </FloatingPopover>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* STAGE 6: COMPACT AUTONOMOUS RUNTIME STATUS BAR */}
      {snapshot?.runtimeSummary && (
        <section
          aria-label="Autonomous Operations Runtime Summary"
          data-testid="agent-factory-runtime-strip"
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Scheduler:</span>
              <span
                className={`font-semibold capitalize ${
                  snapshot.runtimeSummary.schedulerStatus === 'healthy'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : snapshot.runtimeSummary.schedulerStatus === 'degraded'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {snapshot.runtimeSummary.schedulerStatus}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Workers:</span>
              <span
                className={`font-semibold capitalize ${
                  snapshot.runtimeSummary.workerStatus === 'healthy'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : snapshot.runtimeSummary.workerStatus === 'degraded'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {snapshot.runtimeSummary.workerStatus}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
              {snapshot.runtimeSummary.activeSchedules} schedule(s) ·{' '}
              {snapshot.runtimeSummary.activeTriggers} trigger(s)
            </div>
            {(snapshot.runtimeSummary.pausedWorkflows > 0 ||
              snapshot.runtimeSummary.openDeadLetters > 0 ||
              snapshot.runtimeSummary.recentRecoveries > 0) && (
              <div className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                {snapshot.runtimeSummary.pausedWorkflows > 0 && (
                  <span className="mr-2 text-amber-600 dark:text-amber-400">
                    {snapshot.runtimeSummary.pausedWorkflows} paused
                  </span>
                )}
                {snapshot.runtimeSummary.openDeadLetters > 0 && (
                  <span className="mr-2 text-rose-600 dark:text-rose-400">
                    {snapshot.runtimeSummary.openDeadLetters} dead-letter
                  </span>
                )}
                {snapshot.runtimeSummary.recentRecoveries > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {snapshot.runtimeSummary.recentRecoveries} recovered
                  </span>
                )}
              </div>
            )}
            <div className="text-[11px] text-[var(--text-muted)]">
              Autonomy:{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {snapshot.runtimeSummary.autonomyMode === 'automatic_low_risk'
                  ? 'Auto (Low-Risk)'
                  : snapshot.runtimeSummary.autonomyMode === 'approval_required'
                    ? 'Approval Required'
                    : 'Restricted'}
              </span>
            </div>
          </div>

          <Link
            to="/agent-factory/operations"
            className="text-xs font-semibold text-[var(--accent-primary)] hover:underline whitespace-nowrap shrink-0"
          >
            Operations Control Center {'->'}
          </Link>
        </section>
      )}

      {error && (
        <ErrorStateCard
          message={error}
          onRetry={() => activeProjectId && void loadSnapshot(activeProjectId)}
        />
      )}

      {/* MAIN WORKSPACE: RESPONSIVE TELEMETRY SIDEBAR + 3D/2D VIEWPORT + SELECTED AGENT CARD */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
        <AgentFactorySidebar
          snapshot={snapshot}
          connectionStatus={connectionStatus}
          selectedAgentId={selectedAgentId}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onSelectAgent={handleSelectAgent}
          onInspectAgent={(id) => {
            handleSelectAgent(id);
            setInspectorOpen(true);
          }}
        />

        {/* CENTER VIEWPORT + ACCESSIBLE STATION STRIP */}
        <section
          aria-label="3D AI Agent Factory Viewport"
          className="flex min-w-0 flex-1 flex-col gap-3"
        >
          <div className="h-[440px] w-full sm:h-[520px] xl:h-[580px]">
            {loading && !snapshot ? (
              <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)]">
                Loading real-time factory telemetry…
              </div>
            ) : viewMode === '3d' ? (
              <AgentFactoryErrorBoundary
                onErrorFallback={handleWebGLUnavailable}
                fallback={
                  <AgentFactory2DView
                    nodes={nodes}
                    activeLinks={snapshot?.activeLinks ?? []}
                    selectedAgentId={selectedAgentId}
                    onSelectAgent={handleSelectAgent}
                    fallbackNotice="WebGL 3D context failed to initialize. Showing accessible 2D topology view."
                  />
                }
              >
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)]">
                      Initializing 3D Operations Center…
                    </div>
                  }
                >
                  <AgentFactoryScene3D
                    nodes={nodes}
                    activeLinks={snapshot?.activeLinks ?? []}
                    selectedAgentId={selectedAgentId}
                    hoveredAgentId={hoveredAgentId}
                    themePreset={themePreset}
                    reducedMotion={prefersReducedMotion}
                    resetSignal={resetSignal}
                    focusSelectedSignal={focusSelectedSignal}
                    settings={settings}
                    onSelectAgent={handleSelectAgent}
                    onHoverAgent={setHoveredAgentId}
                    onWebGLUnavailable={handleWebGLUnavailable}
                  />
                </Suspense>
              </AgentFactoryErrorBoundary>
            ) : (
              <AgentFactory2DView
                nodes={nodes}
                activeLinks={snapshot?.activeLinks ?? []}
                selectedAgentId={selectedAgentId}
                onSelectAgent={handleSelectAgent}
                fallbackNotice={webglFallbackNotice}
              />
            )}
          </div>

          {/* Accessible Keyboard-Navigable Station Selector Strip */}
          <div
            role="listbox"
            aria-label="Agent Workstations"
            className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2"
          >
            {nodes.map((node, idx) => {
              const spec = getStateVisualSpec(node.state);
              const isSelected = node.agentId === selectedAgentId;
              return (
                <button
                  key={node.agentId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectAgent(node.agentId)}
                  onKeyDown={(e) => handleStationKeyDown(e, idx)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
                    isSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: spec.colorHex }}
                  />
                  <span>{node.shortName}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* RIGHT PANEL: SELECTED AGENT DETAILS & STAGE 2 PERFORMANCE TELEMETRY */}
        <GlassPanel
          as="section"
          ariaLabel="Selected Agent Telemetry"
          className="flex w-full shrink-0 flex-col justify-between gap-4 p-4 xl:w-[310px]"
        >
          {selectedAgent ? (
            <>
              <div className="space-y-3.5">
                <div className="border-b border-[var(--border-hairline)] pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                      data-testid="selected-agent-name"
                      className="font-display text-sm font-bold text-[var(--text-primary)]"
                    >
                      {selectedAgent.name}
                    </h2>
                    <StatusBadge
                      label={getStateVisualSpec(selectedAgent.state).label}
                      tone={getStateVisualSpec(selectedAgent.state).badgeTone}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {selectedAgent.role}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={
                        selectedAgent.availabilityStatus === 'connected'
                          ? 'Connected Backend'
                          : selectedAgent.availabilityStatus === 'partial'
                            ? 'Partial Config'
                            : 'Unavailable'
                      }
                      tone={
                        selectedAgent.availabilityStatus === 'connected'
                          ? 'success'
                          : selectedAgent.availabilityStatus === 'partial'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </div>
                </div>

                {/* Performance Summary Strip */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1.5">
                    <div className="text-[10px] text-[var(--text-muted)]">Runs</div>
                    <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                      {selectedAgent.metrics.completedCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1.5">
                    <div className="text-[10px] text-[var(--text-muted)]">Avg Time</div>
                    <div className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                      {formatDuration(selectedAgent.metrics.avgDurationMs)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1.5">
                    <div className="text-[10px] text-[var(--text-muted)]">Errors</div>
                    <div
                      className={`font-mono font-bold tabular-nums ${
                        selectedAgent.metrics.failedCount > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {selectedAgent.metrics.failedCount}
                    </div>
                  </div>
                </div>

                {/* Stage 5 Concise Metered Spend & Tokens Row */}
                {selectedAgent.metrics.usageTelemetry && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px]">
                    <span className="text-[var(--text-muted)]">
                      Metered Usage
                    </span>
                    <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedAgent.metrics.usageTelemetry.totalTokens > 0
                        ? `${selectedAgent.metrics.usageTelemetry.totalTokens.toLocaleString()} tok · `
                        : ''}
                      {selectedAgent.metrics.usageTelemetry.totalRequests === 0
                        ? 'No runs'
                        : selectedAgent.metrics.usageTelemetry
                              .measuredCostMicros !== null
                          ? formatMicroUsd(
                              selectedAgent.metrics.usageTelemetry
                                .measuredCostMicros,
                            )
                          : 'Unavailable'}
                    </span>
                  </div>
                )}

                {/* Current Task */}
                <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Current Task
                  </div>
                  {selectedAgent.currentTask ? (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {selectedAgent.currentTask.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <span>Progress</span>
                        <span className="font-mono font-semibold">
                          {selectedAgent.currentTask.progressPct !== null
                            ? `${selectedAgent.currentTask.progressPct}%`
                            : 'Active'}
                        </span>
                      </div>
                      {selectedAgent.currentTask.progressPct !== null && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-hairline)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-300"
                            style={{
                              width: `${selectedAgent.currentTask.progressPct}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[var(--text-muted)]">
                      No active backend task running.
                    </p>
                  )}
                </div>

                {/* Last Recorded Status */}
                <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Last Recorded Status
                  </div>
                  {selectedAgent.lastExecution ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        {selectedAgent.lastExecution.summary}
                      </div>
                      <div className="font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                        {formatShortTime(selectedAgent.lastExecution.timestamp)}
                      </div>
                      {selectedAgent.lastExecution.errorSummary && (
                        <div className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-rose-300/60 bg-rose-50/80 p-2 text-[11px] text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{selectedAgent.lastExecution.errorSummary}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[var(--text-muted)]">
                      {selectedAgent.providerSummary}
                    </p>
                  )}
                </div>

                {/* Recent Station Events */}
                <div className="space-y-1.5">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Recent Station Events
                  </div>
                  {selectedAgent.recentEvents.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border-hairline)] px-3 py-3 text-center text-[11px] text-[var(--text-muted)]">
                      No live events recorded for this station yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedAgent.recentEvents.slice(0, 3).map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--text-muted)]">
                            <span>{ev.eventType}</span>
                            <span className="tabular-nums">
                              {formatShortTime(ev.timestamp)}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[var(--text-primary)]">
                            {ev.summary}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <InteractiveButton
                variant="primary"
                size="md"
                onClick={() => setInspectorOpen(true)}
                className="w-full"
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Inspect Agent &amp; Deliverables</span>
              </InteractiveButton>
            </>
          ) : (
            <div className="text-xs text-[var(--text-muted)]">
              Select a station to inspect telemetry.
            </div>
          )}
        </GlassPanel>
      </div>

      {/* STAGE 2: MULTI-AGENT ORCHESTRATION ENGINE PANEL */}
      <AgentFactoryWorkflowPanel
        projectId={activeProjectId}
        overview={overview}
        selectedWorkflowDetail={selectedWorkflowDetail}
        selectedWorkflowId={selectedWorkflowId}
        onSelectWorkflow={(wfId) => void handleSelectWorkflow(wfId)}
        onRefreshOrchestration={(focusId) =>
          refreshOrchestration(activeProjectId, focusId)
        }
        onSelectAgent={handleSelectAgent}
        onOpenAgentOutput={(agentId) => {
          handleSelectAgent(agentId);
          setInspectorOpen(true);
        }}
      />

      {/* STAGE 3: MULTI-AGENT COLLABORATION MONITOR */}
      <AgentFactoryCollaborationMonitor
        projectId={activeProjectId}
        selectedWorkflowId={selectedWorkflowId}
        collaboration={collaboration}
        onRefreshCollaboration={() =>
          refreshCollaboration(activeProjectId, selectedWorkflowId)
        }
        onSelectAgent={handleSelectAgent}
      />

      {/* BOTTOM PANEL: LIVE EXECUTION TIMELINE */}
      <GlassPanel
        as="section"
        ariaLabel="Live Execution Timeline"
        className="p-4"
      >
        <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Live Execution Timeline
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Real agent events, inter-agent structured handoffs, human approval gates, and completion or error notifications.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-xs">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'communications', label: 'Handoffs' },
                { id: 'errors', label: 'Errors & Retries' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimelineFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
                  timelineFilter === tab.id
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="mt-3 flex flex-col items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-5 text-center sm:flex-row sm:text-left">
            <div className="text-xs text-[var(--text-muted)]">
              No live execution events recorded in this session yet. Launch a multi-agent workflow above or start a{' '}
              <Link to="/audit/new" className="font-semibold text-[var(--accent-primary)] hover:underline">
                Technical Crawl
              </Link>
              ,{' '}
              <Link to="/performance" className="font-semibold text-[var(--accent-primary)] hover:underline">
                Speed Audit
              </Link>
              ,{' '}
              <Link to="/keywords" className="font-semibold text-[var(--accent-primary)] hover:underline">
                Keyword Discovery
              </Link>
              , or{' '}
              <Link to="/competitors" className="font-semibold text-[var(--accent-primary)] hover:underline">
                Competitor Analysis
              </Link>{' '}
              to watch real packets and station states stream live.
            </div>
          </div>
        ) : (
          <ol
            data-testid="agent-factory-timeline"
            className="mt-3 max-h-[240px] divide-y divide-[var(--border-hairline)] overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]"
          >
            {filteredTimeline.map((ev) => {
              const spec = getStateVisualSpec(ev.status);
              const nodeName =
                nodes.find((n) => n.agentId === ev.agentId)?.name ?? ev.agentId;
              return (
                <li
                  key={ev.id}
                  className="flex flex-col gap-1.5 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                    <span
                      aria-hidden="true"
                      className="mt-1 h-2 w-2 shrink-0 rounded-full sm:mt-0"
                      style={{ backgroundColor: spec.colorHex }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                          {ev.eventType}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSelectAgent(ev.agentId)}
                          className="font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          {nodeName}
                        </button>
                        <StatusBadge label={spec.label} tone={spec.badgeTone} />
                      </div>
                      <div className="truncate text-[var(--text-secondary)]">
                        {ev.summary}
                      </div>
                      {ev.errorSummary && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400">
                          Error: {ev.errorSummary}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                    {ev.progressPct !== null && <span>{ev.progressPct}%</span>}
                    <span>{formatShortTime(ev.timestamp)}</span>
                    {ev.evidenceUrl && (
                      <Link
                        to={ev.evidenceUrl}
                        className="inline-flex items-center gap-0.5 font-sans font-semibold text-[var(--accent-primary)] hover:underline"
                      >
                        <span>Details</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </GlassPanel>

      {/* STAGE 2 & 3 INSPECTOR DRAWER */}
      <AgentFactoryInspectorDrawer
        open={inspectorOpen}
        agent={selectedAgent}
        allNodes={nodes}
        workflowDetail={selectedWorkflowDetail}
        collaboration={collaboration}
        onClose={() => setInspectorOpen(false)}
        onSelectConnectedAgent={(peerId) => handleSelectAgent(peerId)}
        onRetryTask={(taskId) => {
          if (!activeProjectId) return;
          void agentFactoryService
            .retryTask(activeProjectId, taskId)
            .then((updated) => refreshOrchestration(activeProjectId, updated.workflow.id));
        }}
      />
    </PageTransition>
  );
}
