import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Play, ShieldCheck } from 'lucide-react';
import type { AuditOverviewResponse } from '../../types/audit';
import { ApiError } from '../../services/apiClient';
import { auditService } from '../../services/auditService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { AnimatedCard, PageTransition } from '../../components/animation/MotionPrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
  StatusBadge,
} from '../../components/ui/StateViews';
import { AuditSubNav, crawlStatusTone, severityTone } from '../../components/audit/AuditSubNav';
import { AuditSummaryCards } from '../../components/audit/AuditSummaryCards';

const STATUS_COLORS = ['#0D9488', '#D97706', '#E05275', '#7047EB'];

export function AuditOverviewPage() {
  const navigate = useNavigate();
  const { selectedProjectId, projects, loadProjectsOnly } = useDashboardStore();
  const [overview, setOverview] = useState<AuditOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!selectedProjectId) {
      setOverview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await auditService.fetchAuditOverview(selectedProjectId);
      setOverview(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load technical audit overview.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (projects.length === 0) void loadProjectsOnly();
  }, [projects.length, loadProjectsOnly]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const statusChartData = overview?.latestCrawl
    ? Object.entries(overview.latestCrawl.summary.statusDistribution).map(
        ([name, value]) => ({ name, value }),
      )
    : [];

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Technical SEO Audit &amp; Crawl Engine
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Real HTTP crawling, indexability diagnostics, developer workflows, and evidence-based reverification.
          </p>
        </div>

        <Link
          to={selectedProjectId ? '/audit/new' : '/projects'}
          className="inline-flex items-center gap-1.5 self-start rounded-xl bg-gradient-to-r from-[#7047EB] to-[#2563EB] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_22px_-8px_rgba(112,71,235,0.5)] transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{selectedProjectId ? 'Configure & Start Crawl' : 'Add Domain First'}</span>
        </Link>
      </div>

      <AuditSubNav
        latestCrawlId={overview?.latestCrawl?.id}
        activeProjectName={overview?.projectName}
      />

      {!selectedProjectId && !loading && (
        <EmptyStateCard
          title="No domain project selected"
          description="Register a domain project before configuring website verification and launching technical crawls."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      )}

      {selectedProjectId && loading && <DashboardSkeleton />}
      {selectedProjectId && !loading && error && (
        <ErrorStateCard message={error} onRetry={() => void loadOverview()} />
      )}

      {selectedProjectId && !loading && !error && overview && (
        <>
          <AuditSummaryCards overview={overview} />

          {!overview.latestCrawl ? (
            <EmptyStateCard
              title={`No crawls executed yet for ${overview.projectName}`}
              description={`Verify domain ownership for ${overview.website} and start your first technical crawl to inspect real URLs, indexability, and grouped SEO issues.`}
              actionLabel="Configure First Crawl"
              onAction={() => navigate('/audit/new')}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <AnimatedCard
                  delay={0.05}
                  className="rovix-soft-card rounded-[22px] p-5 lg:col-span-7"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                    <div>
                      <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                        Crawl Discovery &amp; Issue Trend
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        URLs crawled and grouped issues detected across recent runs
                      </p>
                    </div>
                    <StatusBadge
                      label={overview.latestCrawl.status}
                      tone={crawlStatusTone(overview.latestCrawl.status)}
                    />
                  </div>
                  <div className="mt-4 h-[230px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.discoverySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                        />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0F172A',
                            borderColor: '#334155',
                            borderRadius: '10px',
                            color: '#F8FAFC',
                            fontSize: '12px',
                          }}
                        />
                        <Bar
                          dataKey="processed"
                          name="Crawled URLs"
                          fill="#7047EB"
                          barSize={32}
                          maxBarSize={40}
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="issues"
                          name="Issue Groups"
                          fill="#0D9488"
                          barSize={32}
                          maxBarSize={40}
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </AnimatedCard>

                <AnimatedCard
                  delay={0.1}
                  className="rovix-soft-card rounded-[22px] p-5 lg:col-span-5"
                >
                  <div className="pb-3 border-b border-[var(--border-hairline)]">
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      HTTP Status Code Distribution
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Latest crawl ({overview.latestCrawl.id}) response breakdown
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
                    <div className="h-[200px] w-[200px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={3}
                          >
                            {statusChartData.map((entry, index) => (
                              <Cell
                                key={entry.name}
                                fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0F172A',
                              borderColor: '#334155',
                              borderRadius: '10px',
                              color: '#F8FAFC',
                              fontSize: '12px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2 text-xs w-full">
                      {statusChartData.map((entry, index) => (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2"
                        >
                          <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS[index % STATUS_COLORS.length],
                              }}
                            />
                            {entry.name}
                          </span>
                          <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            {entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AnimatedCard>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 lg:col-span-7">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Top Priority Technical Issues
                    </h2>
                    <Link
                      to="/audit/issues"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF] hover:underline"
                    >
                      <span>View All Issues</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {overview.topCriticalIssues.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                        Zero open technical issues remaining on this project.
                      </div>
                    ) : (
                      overview.topCriticalIssues.map((iss) => (
                        <Link
                          key={iss.id}
                          to={`/audit/issues/${iss.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-3 hover:border-[#7047EB]/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                label={iss.severity}
                                tone={severityTone(iss.severity)}
                              />
                              <span className="font-display text-xs font-bold text-[var(--text-primary)] truncate">
                                {iss.title}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                              {iss.category} · {iss.affectedUrlCount} URL(s) ·{' '}
                              {iss.status}
                            </div>
                          </div>
                          <ArrowRight
                            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                            aria-hidden="true"
                          />
                        </Link>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 lg:col-span-5">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Recently Verified Fixes &amp; Tickets
                    </h2>
                    <Link
                      to="/audit/reverify"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF] hover:underline"
                    >
                      <span>Reverification Queue</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {overview.recentlyVerifiedFixes.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                        No reverification runs recorded yet. Open any technical
                        issue to create a developer ticket and verify fixes.
                      </div>
                    ) : (
                      overview.recentlyVerifiedFixes.map((vr) => (
                        <Link
                          key={vr.id}
                          to={`/audit/issues/${vr.issueId}`}
                          className="block rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 hover:border-[#7047EB]/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge
                              label={vr.result}
                              tone={vr.result === 'Verified' ? 'success' : 'danger'}
                            />
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {new Date(vr.verifiedAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-[var(--text-primary)]">
                            {vr.evidence.summary}
                          </p>
                        </Link>
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
                    <ShieldCheck
                      className="h-4 w-4 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]"
                      aria-hidden="true"
                    />
                    <span>
                      Domain verification:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {overview.verification.verified
                          ? `${overview.verification.canonicalDomain} (Verified)`
                          : 'Pending'}
                      </strong>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </PageTransition>
  );
}
