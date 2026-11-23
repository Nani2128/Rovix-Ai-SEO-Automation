import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Cable, LineChart, RefreshCw } from 'lucide-react';
import type { AnalyticsWorkspaceData } from '../../types/integrations';
import { integrationsService } from '../../services/integrationsService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { DataProvenanceStrip } from '../../components/ui/DataProvenanceMeta';
import { EmptyStateCard, ErrorStateCard, StatusBadge, TableRowsSkeleton } from '../../components/ui/StateViews';

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { projects, selectedProjectId, loadProjectsOnly } = useDashboardStore();
  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const [analytics, setAnalytics] = useState<AnalyticsWorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  const loadAnalytics = useCallback(async () => {
    if (!selectedProjectId) {
      setAnalytics(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsService.fetchAnalytics(selectedProjectId);
      setAnalytics(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load search & analytics metrics.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Analytics &amp; Attribution
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Verified telemetry from connected Google Search Console and Google Analytics 4 properties
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {activeProject && (
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {activeProject.website}
            </span>
          )}
          <InteractiveButton
            variant="secondary"
            size="md"
            disabled={loading || !selectedProjectId}
            onClick={() => void loadAnalytics()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </InteractiveButton>
        </div>
      </div>

      {!selectedProjectId ? (
        <EmptyStateCard
          title="No domain project selected"
          description="Create a domain project first, then authorize Google Search Console or GA4 to populate analytics."
          actionLabel="Add Domain Project"
          onAction={() => navigate('/projects')}
        />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadAnalytics()} />
      ) : loading && !analytics ? (
        <TableRowsSkeleton rows={6} />
      ) : (
        analytics && (
          <>
            {/* Google Search Console Section */}
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-4">
                <div className="flex items-center gap-2.5">
                  <LineChart className="h-5 w-5 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
                  <div>
                    <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                      Google Search Console Performance
                    </h2>
                    <DataProvenanceStrip
                      source="Google Search Console API"
                      collectedAt={analytics.gscLastSyncedAt}
                      reportingPeriod={analytics.reportingPeriod}
                      measurementStatus={analytics.gscMeasurementStatus}
                    />
                  </div>
                </div>
                <StatusBadge
                  label={analytics.gscConnected ? 'GSC Connected' : 'GSC Not Connected'}
                  tone={analytics.gscConnected ? 'success' : 'neutral'}
                />
              </div>

              {!analytics.gscConnected || !analytics.gscTotals ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="Google Search Console Not Connected"
                    description="Connect a verified Google Search Console property in Integrations to load clicks, impressions, CTR, and top search queries."
                    actionLabel="Connect Search Console"
                    onAction={() => navigate('/integrations')}
                  />
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Total Clicks', value: analytics.gscTotals.clicks.toLocaleString() },
                      { label: 'Total Impressions', value: analytics.gscTotals.impressions.toLocaleString() },
                      { label: 'Average CTR', value: `${(analytics.gscTotals.ctr * 100).toFixed(2)}%` },
                      { label: 'Avg Position', value: `#${analytics.gscTotals.avgPosition.toFixed(1)}` },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {stat.label}
                        </div>
                        <div className="mt-1 font-display text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {analytics.gscDaily.length > 0 && (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.gscDaily}>
                          <defs>
                            <linearGradient id="gscClicksGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7047EB" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#7047EB" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={44}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-hairline)',
                              borderRadius: 12,
                              color: 'var(--text-primary)',
                              fontSize: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="clicks"
                            stroke="#7047EB"
                            strokeWidth={2}
                            fill="url(#gscClicksGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {analytics.gscTopQueries.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            <th className="py-2 pr-3">Query</th>
                            <th className="py-2 px-3">Top Page</th>
                            <th className="py-2 px-3 text-right">Clicks</th>
                            <th className="py-2 px-3 text-right">Impressions</th>
                            <th className="py-2 px-3 text-right">CTR</th>
                            <th className="py-2 pl-3 text-right">Position</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-hairline)]">
                          {analytics.gscTopQueries.slice(0, 15).map((q, idx) => (
                            <tr key={`${q.query}-${idx}`}>
                              <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)]">
                                {q.query}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                                {q.page}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                                {q.clicks.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                                {q.impressions.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                                {(q.ctr * 100).toFixed(1)}%
                              </td>
                              <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                                #{q.avgPosition.toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Google Analytics 4 Section */}
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-4">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="h-5 w-5 text-[#0891B2] dark:text-[#22D3EE]" aria-hidden="true" />
                  <div>
                    <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                      Google Analytics 4 Organic Traffic &amp; Key Events
                    </h2>
                    <DataProvenanceStrip
                      source="Google Analytics 4 Data API"
                      collectedAt={analytics.ga4LastSyncedAt}
                      reportingPeriod={analytics.reportingPeriod}
                      measurementStatus={analytics.ga4MeasurementStatus}
                    />
                  </div>
                </div>
                <StatusBadge
                  label={analytics.ga4Connected ? 'GA4 Connected' : 'GA4 Not Connected'}
                  tone={analytics.ga4Connected ? 'success' : 'neutral'}
                />
              </div>

              {!analytics.ga4Connected || !analytics.ga4Totals ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="Google Analytics 4 Not Connected"
                    description="Authorize GA4 in Integrations to monitor organic sessions, active users, key events, and top landing pages."
                    actionLabel="Connect GA4"
                    onAction={() => navigate('/integrations')}
                  />
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Organic Sessions', value: analytics.ga4Totals.sessions.toLocaleString() },
                      { label: 'Active Users', value: analytics.ga4Totals.activeUsers.toLocaleString() },
                      { label: 'Key Events', value: analytics.ga4Totals.keyEvents.toLocaleString() },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {stat.label}
                        </div>
                        <div className="mt-1 font-display text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {analytics.ga4Daily.length > 0 && (
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.ga4Daily}>
                          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={44}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-hairline)',
                              borderRadius: 12,
                              color: 'var(--text-primary)',
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="sessions" fill="#0891B2" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Honest CRM / Revenue Disclosure */}
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                    <Cable className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                        CRM &amp; Pipeline ROI Attribution
                      </h2>
                      <StatusBadge label="CRM Connector Not Configured" tone="neutral" />
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {analytics.crmNotice}
                    </p>
                    <DataProvenanceStrip
                      source="CRM Attribution Connector"
                      collectedAt={null}
                      reportingPeriod={analytics.reportingPeriod}
                      measurementStatus={analytics.crmMeasurementStatus}
                    />
                  </div>
                </div>
                <Link
                  to="/integrations"
                  className="text-xs font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline whitespace-nowrap"
                >
                  Integrations →
                </Link>
              </div>
            </section>
          </>
        )
      )}
    </PageTransition>
  );
}
