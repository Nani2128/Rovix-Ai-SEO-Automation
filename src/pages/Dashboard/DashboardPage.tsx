import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Globe2,
  Info,
  Plus,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import {
  DashboardSkeleton,
  ErrorStateCard,
} from '../../components/ui/StateViews';
import { WelcomeHeader } from '../../components/dashboard/WelcomeHeader';
import { AutomationStatusHero } from '../../components/dashboard/AutomationStatusHero';
import { KpiCardsRow } from '../../components/dashboard/KpiCardsRow';
import { OrganicTrafficChart } from '../../components/charts/OrganicTrafficChart';
import { SeoHealthBreakdown } from '../../components/dashboard/SeoHealthBreakdown';
import { KeywordOpportunitiesTable } from '../../components/dashboard/KeywordOpportunitiesTable';
import { OngoingAutomationsPanel } from '../../components/dashboard/OngoingAutomationsPanel';
import { MultiProjectPortfolio } from '../../components/dashboard/MultiProjectPortfolio';
import { RecentActivityTimeline } from '../../components/dashboard/RecentActivityTimeline';

export function DashboardPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const {
    overview,
    projects,
    sandboxFixturesEnabled,
    loadStatus,
    errorMessage,
    loadDashboardData,
    createProject,
    registerSandboxProject,
    actionNotice,
    clearActionNotice,
  } = useDashboardStore();

  const [domainName, setDomainName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [market, setMarket] = useState('US');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const handleQuickCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    setCreating(true);
    const created = await createProject({
      name: domainName.trim() || websiteUrl.replace(/^https?:\/\//i, ''),
      website: websiteUrl.trim(),
      targetMarkets: [market.trim() || 'US'],
    });
    setCreating(false);
    if (created) {
      setDomainName('');
      setWebsiteUrl('');
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <WelcomeHeader />

      {/* Explicit Real Telemetry Status Notice */}
      {overview && overview.dataSourceNotice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#7047EB]/20 bg-[#7047EB]/5 dark:bg-[#8B6BFF]/10 px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <Info
              className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]"
              aria-hidden="true"
            />
            <span>{overview.dataSourceNotice}</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-[#7047EB] dark:text-[#C4B5FD]">
            Live SQLite Telemetry
          </span>
        </div>
      )}

      {actionNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/35 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={clearActionNotice}
            aria-label="Dismiss notice"
            className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {overview?.isStale && overview.project && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <span>
            Integration telemetry requires refresh or re-authentication for{' '}
            <strong>{overview.project.name}</strong>. Displayed metrics reflect the
            last verified database sync.
          </span>
        </div>
      )}

      {loadStatus === 'loading' && !overview ? (
        <DashboardSkeleton />
      ) : loadStatus === 'error' && !overview ? (
        <ErrorStateCard
          message={errorMessage ?? 'Failed to load workspace overview.'}
          onRetry={() => void loadDashboardData()}
        />
      ) : overview ? (
        <>
          {projects.length === 0 && (
            <section
              aria-label="Create first domain project"
              className="rounded-[22px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.12)]"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-lg">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF]">
                    <Globe2 className="h-4 w-4" aria-hidden="true" />
                    <span>First-Run Workspace Setup</span>
                  </div>
                  <h2 className="mt-1.5 font-display text-xl font-bold text-[var(--text-primary)]">
                    Add your first domain to start auditing
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                    This workspace starts completely clean with zero fabricated sample
                    domains or numbers. Register your domain below to run technical
                    crawls and connect Google Search Console or GA4.
                  </p>
                </div>

                {permissions.canManageProjects ? (
                  <form
                    onSubmit={handleQuickCreate}
                    className="grid grid-cols-1 gap-2.5 sm:grid-cols-4 flex-1 max-w-2xl"
                  >
                    <input
                      type="text"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                      placeholder="Project name (e.g. Company Website)"
                      aria-label="Project display name"
                      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
                    />
                    <input
                      type="url"
                      required
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      aria-label="Website URL"
                      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none sm:col-span-2"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={market}
                        onChange={(e) => setMarket(e.target.value)}
                        placeholder="US"
                        aria-label="Target market"
                        className="w-16 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
                      />
                      <InteractiveButton
                        type="submit"
                        variant="primary"
                        size="md"
                        loading={creating}
                        className="flex-1"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Add Domain</span>
                      </InteractiveButton>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-muted)]">
                    Ask an Agency Owner, Strategist, or Project Manager in your workspace
                    to register the first domain project.
                  </div>
                )}
              </div>

              {sandboxFixturesEnabled && permissions.canManageProjects && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4 text-xs text-[var(--text-muted)]">
                  <div className="flex items-center gap-2">
                    <FlaskConical
                      className="h-4 w-4 text-[#0891B2] dark:text-[#22D3EE]"
                      aria-hidden="true"
                    />
                    <span>
                      Local development mode active: optionally register the built-in
                      loopback crawler test fixture.
                    </span>
                  </div>
                  <InteractiveButton
                    variant="secondary"
                    size="sm"
                    onClick={() => void registerSandboxProject()}
                  >
                    Register Local Sandbox Target
                  </InteractiveButton>
                </div>
              )}
            </section>
          )}

          <AutomationStatusHero
            automations={overview.automations}
            lastSuccessfulRun={overview.project?.lastSuccessfulRun ?? null}
            hasProject={Boolean(overview.project)}
          />

          <KpiCardsRow kpis={overview.kpis} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <OrganicTrafficChart
                data={overview.trafficSeries}
                provenance={overview.trafficProvenance}
                status={loadStatus}
                isStale={overview.isStale}
                onRetry={() => void loadDashboardData()}
              />
            </div>
            <div className="xl:col-span-5">
              <SeoHealthBreakdown
                score={overview.computedHealthScore}
                categories={overview.healthBreakdown}
                provenance={overview.healthProvenance}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <KeywordOpportunitiesTable
                keywords={overview.keywords}
                compactMode
              />
            </div>
            <div className="xl:col-span-5">
              <OngoingAutomationsPanel automations={overview.automations} />
            </div>
          </div>

          <MultiProjectPortfolio projects={projects} />

          <RecentActivityTimeline
            events={overview.recentActivity}
            projectId={overview.project?.id}
          />
        </>
      ) : null}
    </PageTransition>
  );
}
