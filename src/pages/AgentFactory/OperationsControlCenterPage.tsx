import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  Coins,
  Cpu,
  RefreshCw,
  Workflow,
} from 'lucide-react';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { AutomationMonitorSection } from '../../components/operations/AutomationMonitorSection';
import { AutonomyPoliciesSection } from '../../components/operations/AutonomyPoliciesSection';
import { OperationsOverviewSection } from '../../components/operations/OperationsOverviewSection';
import { RecoveryCenterSection } from '../../components/operations/RecoveryCenterSection';
import { RuntimeHealthSection } from '../../components/operations/RuntimeHealthSection';
import { ScheduleManagerSection } from '../../components/operations/ScheduleManagerSection';
import { EmptyStateCard, ErrorStateCard } from '../../components/ui/StateViews';
import { operationsService } from '../../services/operationsService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { OperationsControlCenterPayload } from '../../types/autonomousOperations';

type OperationsTabId =
  | 'overview'
  | 'schedules'
  | 'automations'
  | 'recovery'
  | 'policies'
  | 'health';

const VALID_TABS: readonly OperationsTabId[] = [
  'overview',
  'schedules',
  'automations',
  'recovery',
  'policies',
  'health',
];

const TAB_ITEMS: readonly { id: OperationsTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedules', label: 'Schedule Manager' },
  { id: 'automations', label: 'Automation Monitor' },
  { id: 'recovery', label: 'Recovery Center' },
  { id: 'policies', label: 'Autonomy Policies' },
  { id: 'health', label: 'Runtime Health' },
];

export function OperationsControlCenterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();

  const initialTab = searchParams.get('tab') as OperationsTabId | null;
  const [activeTab, setActiveTab] = useState<OperationsTabId>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'overview',
  );

  const [data, setData] = useState<OperationsControlCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      void loadProjectsOnly();
    }
  }, [projects.length, loadProjectsOnly]);

  const activeProjectId =
    selectedProjectId || (projects.length > 0 ? projects[0].id : '');

  const loadData = useCallback(async (projectId: string, silent = false) => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await operationsService.getControlCenter(projectId);
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Stage 6 Operations Control Center.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    void loadData(activeProjectId, false);
  }, [activeProjectId, loadData]);

  const handleTabChange = (nextTab: OperationsTabId) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Select or create a website project first to configure persistent schedules, event-driven triggers, self-healing recovery, and autonomy governance policies."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-5">
      {/* Header & Workspace Controls */}
      <header className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#22D3EE]">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                Autonomous Operations Control Center
              </h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
              Persistent multi-worker scheduler, domain &amp; signed webhook automations, dead-letter recovery, autonomy governance policies, and live runtime health diagnostics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              to="/agent-factory"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 transition-colors"
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agent Factory</span>
            </Link>

            <Link
              to="/agent-factory/workflows"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 transition-colors"
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Workflow Studio</span>
            </Link>

            <Link
              to="/agent-factory/analytics"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 transition-colors"
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Usage &amp; Cost</span>
            </Link>
          </div>
        </div>

        {/* Workspace Selector & Refresh Toolbar */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {projects.length > 0 && (
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Project
                </span>
                <select
                  aria-label="Select operations project workspace"
                  value={activeProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="max-w-[180px] truncate bg-transparent font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
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

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadData(activeProjectId, true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
          </div>

          {data && (
            <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
              Scheduler:{' '}
              <span className="font-semibold capitalize text-[var(--text-primary)]">
                {data.health.schedulerStatus}
              </span>{' '}
              · Workers:{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {data.health.activeWorkerCount}
              </span>
            </div>
          )}
        </div>

        {/* Full-Width 6-Tab Navigation Row */}
        <nav
          aria-label="Operations Control Center Sections"
          className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-hairline)] pt-3.5"
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.id;
            const badgeCount =
              tab.id === 'recovery' && data && data.overview.openDeadLetters > 0
                ? data.overview.openDeadLetters
                : tab.id === 'schedules' && data && data.overview.scheduledJobs > 0
                  ? data.overview.scheduledJobs
                  : null;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span
                    className={`font-mono text-[10.5px] tabular-nums ${
                      active ? 'text-white/90' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    ({badgeCount})
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {error && (
        <ErrorStateCard
          message={error}
          onRetry={() => void loadData(activeProjectId, false)}
        />
      )}

      {loading && !data ? (
        <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-12 text-center text-xs text-[var(--text-muted)]">
          Loading autonomous operations runtime state…
        </div>
      ) : data ? (
        <main>
          {activeTab === 'overview' && (
            <OperationsOverviewSection
              projectId={activeProjectId}
              data={data}
              onNavigateTab={(tab) => handleTabChange(tab)}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
          {activeTab === 'schedules' && (
            <ScheduleManagerSection
              projectId={activeProjectId}
              data={data}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
          {activeTab === 'automations' && (
            <AutomationMonitorSection
              projectId={activeProjectId}
              data={data}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
          {activeTab === 'recovery' && (
            <RecoveryCenterSection
              projectId={activeProjectId}
              data={data}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
          {activeTab === 'policies' && (
            <AutonomyPoliciesSection
              projectId={activeProjectId}
              data={data}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
          {activeTab === 'health' && (
            <RuntimeHealthSection
              projectId={activeProjectId}
              data={data}
              onRefresh={() => loadData(activeProjectId, true)}
            />
          )}
        </main>
      ) : null}
    </PageTransition>
  );
}
