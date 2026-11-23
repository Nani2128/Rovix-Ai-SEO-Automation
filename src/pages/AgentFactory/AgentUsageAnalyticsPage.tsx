import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Coins, Cpu, Download, RefreshCw, Workflow } from 'lucide-react';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { EmptyStateCard, ErrorStateCard } from '../../components/ui/StateViews';
import { AgentUsageSection } from '../../components/usageAnalytics/AgentUsageSection';
import { BudgetManagementSection } from '../../components/usageAnalytics/BudgetManagementSection';
import { ProviderPricingSection } from '../../components/usageAnalytics/ProviderPricingSection';
import { UsageLedgerSection } from '../../components/usageAnalytics/UsageLedgerSection';
import { UsageOverviewSection } from '../../components/usageAnalytics/UsageOverviewSection';
import { WorkflowCostSection } from '../../components/usageAnalytics/WorkflowCostSection';
import { usageIntelligenceService } from '../../services/usageIntelligenceService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { UsageAnalyticsDashboardPayload } from '../../types/usageIntelligence';

type AnalyticsTabId =
  | 'overview'
  | 'agents'
  | 'workflows'
  | 'providers'
  | 'budgets'
  | 'ledger';

type DateRangePreset = 'all' | 'today' | '7d' | '30d';

const VALID_TABS: readonly AnalyticsTabId[] = [
  'overview',
  'agents',
  'workflows',
  'providers',
  'budgets',
  'ledger',
];

const TAB_ITEMS: readonly { id: AnalyticsTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'agents', label: 'Agent Analytics' },
  { id: 'workflows', label: 'Workflow Analytics' },
  { id: 'providers', label: 'Provider & Pricing' },
  { id: 'budgets', label: 'Budgets & Alerts' },
  { id: 'ledger', label: 'Usage Ledger' },
];

function resolveDateRange(preset: DateRangePreset): {
  from: string | null;
  to: string | null;
} {
  if (preset === 'all') return { from: null, to: null };
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return { from: start.toISOString(), to: null };
  }
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - days * 86_400_000);
  return { from: start.toISOString(), to: null };
}

export function AgentUsageAnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();

  const initialTabParam = searchParams.get('tab') as AnalyticsTabId | null;
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>(
    initialTabParam && VALID_TABS.includes(initialTabParam)
      ? initialTabParam
      : 'overview',
  );
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('all');
  const [ledgerAgentFilter, setLedgerAgentFilter] = useState<string | null>(
    searchParams.get('agentId'),
  );
  const [ledgerWorkflowFilter, setLedgerWorkflowFilter] = useState<
    string | null
  >(searchParams.get('workflowId'));

  const [dashboard, setDashboard] =
    useState<UsageAnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickExportMsg, setQuickExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      void loadProjectsOnly();
    }
  }, [projects.length, loadProjectsOnly]);

  const activeProjectId =
    selectedProjectId || (projects.length > 0 ? projects[0].id : '');

  const resolvedRange = useMemo(
    () => resolveDateRange(dateRangePreset),
    [dateRangePreset],
  );

  const loadDashboard = useCallback(
    async (projectId: string, silent = false) => {
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
        const data = await usageIntelligenceService.getDashboard(projectId, {
          from: resolvedRange.from,
          to: resolvedRange.to,
        });
        setDashboard(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load Stage 5 usage and cost intelligence.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [resolvedRange.from, resolvedRange.to],
  );

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    void loadDashboard(activeProjectId, false);
  }, [activeProjectId, loadDashboard]);

  const handleTabChange = (nextTab: AnalyticsTabId) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    if (nextTab !== 'ledger') {
      nextParams.delete('agentId');
      nextParams.delete('workflowId');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleFilterLedgerByAgent = (agentId: string) => {
    setLedgerAgentFilter(agentId);
    setLedgerWorkflowFilter(null);
    setActiveTab('ledger');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'ledger');
    nextParams.set('agentId', agentId);
    nextParams.delete('workflowId');
    setSearchParams(nextParams, { replace: true });
  };

  const handleFilterLedgerByWorkflow = (workflowId: string) => {
    setLedgerWorkflowFilter(workflowId);
    setLedgerAgentFilter(null);
    setActiveTab('ledger');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'ledger');
    nextParams.set('workflowId', workflowId);
    nextParams.delete('agentId');
    setSearchParams(nextParams, { replace: true });
  };

  const handleQuickExport = async (format: 'csv' | 'json') => {
    if (!activeProjectId) return;
    setQuickExportMsg(null);
    try {
      const result = await usageIntelligenceService.downloadExport(
        activeProjectId,
        format,
        {
          from: resolvedRange.from,
          to: resolvedRange.to,
        },
      );
      setQuickExportMsg(
        `Downloaded ${result.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB).`,
      );
    } catch (err) {
      setQuickExportMsg(
        err instanceof Error ? err.message : 'Unable to export usage report.',
      );
    }
  };

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Select or create a website project first to inspect Agent Factory token consumption, reconciled API costs, performance timing, and spending budgets."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  const unackAlertCount =
    dashboard?.alerts.filter((a) => !a.acknowledgedAt).length ?? 0;

  return (
    <PageTransition className="space-y-5">
      {/* Page Header & Controls */}
      <header className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#22D3EE]">
                <Coins className="h-4 w-4" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                Agent Usage, Cost &amp; Performance Intelligence
              </h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
              Measured provider token consumption, integer micro-USD cost reconciliation, pricing registry provenance, execution timing, and active spending guardrails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              to="/agent-factory"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] whitespace-nowrap shrink-0 transition-colors"
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agent Factory</span>
            </Link>

            <Link
              to="/agent-factory/workflows"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] whitespace-nowrap shrink-0 transition-colors"
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Workflow Studio</span>
            </Link>
          </div>
        </div>

        {/* Filter & Export Toolbar Row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Project
              </span>
              <select
                aria-label="Select project for usage analytics"
                value={activeProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="max-w-[165px] truncate bg-transparent font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
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

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Window
            </span>
            <select
              aria-label="Filter usage analytics by date range"
              value={dateRangePreset}
              onChange={(e) =>
                setDateRangePreset(e.target.value as DateRangePreset)
              }
              className="bg-transparent font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="all" className="bg-[var(--bg-surface)]">
                All Time
              </option>
              <option value="today" className="bg-[var(--bg-surface)]">
                Today (UTC)
              </option>
              <option value="7d" className="bg-[var(--bg-surface)]">
                Last 7 Days
              </option>
              <option value="30d" className="bg-[var(--bg-surface)]">
                Last 30 Days
              </option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleQuickExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              activeProjectId && void loadDashboard(activeProjectId, true)
            }
            disabled={refreshing}
            aria-label="Refresh usage analytics"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="sr-only sm:not-sr-only">Refresh</span>
          </button>
        </div>

        {/* Full-Width Accessible 6-Tab Navigation */}
        <div
          role="tablist"
          aria-label="Usage and Cost Intelligence sections"
          className="mt-4 flex items-center gap-1 overflow-x-auto border-t border-[var(--border-hairline)] pt-3"
        >
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const badgeSuffix =
              tab.id === 'budgets' && unackAlertCount > 0
                ? ` (${unackAlertCount})`
                : '';
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#7047EB] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
                {badgeSuffix}
              </button>
            );
          })}
        </div>
      </header>

      {quickExportMsg && (
        <div
          role="status"
          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-secondary)]"
        >
          {quickExportMsg}
        </div>
      )}

      {error && (
        <ErrorStateCard
          message={error}
          onRetry={() => activeProjectId && void loadDashboard(activeProjectId)}
        />
      )}

      {loading && !dashboard ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      ) : dashboard ? (
        <div role="tabpanel">
          {activeTab === 'overview' && (
            <UsageOverviewSection
              dashboard={dashboard}
              onNavigateTab={(tab) => handleTabChange(tab)}
            />
          )}

          {activeTab === 'agents' && (
            <AgentUsageSection
              agents={dashboard.agents}
              onFilterLedgerByAgent={handleFilterLedgerByAgent}
            />
          )}

          {activeTab === 'workflows' && (
            <WorkflowCostSection
              projectId={activeProjectId}
              workflows={dashboard.workflows}
              onFilterLedgerByWorkflow={handleFilterLedgerByWorkflow}
            />
          )}

          {activeTab === 'providers' && (
            <ProviderPricingSection
              projectId={activeProjectId}
              dashboard={dashboard}
              onPricingUpdated={() => loadDashboard(activeProjectId, true)}
            />
          )}

          {activeTab === 'budgets' && (
            <BudgetManagementSection
              projectId={activeProjectId}
              dashboard={dashboard}
              onBudgetsUpdated={() => loadDashboard(activeProjectId, true)}
            />
          )}

          {activeTab === 'ledger' && (
            <UsageLedgerSection
              projectId={activeProjectId}
              initialAgentId={ledgerAgentFilter}
              initialWorkflowId={ledgerWorkflowFilter}
              dateFrom={resolvedRange.from}
              dateTo={resolvedRange.to}
            />
          )}
        </div>
      ) : null}
    </PageTransition>
  );
}
