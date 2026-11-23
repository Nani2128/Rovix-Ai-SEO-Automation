import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, FlaskConical, Users } from 'lucide-react';
import type {
  CruxMetricDistribution,
  PerformanceDashboardOverview,
} from '../../types/performance';
import { GlassPanel } from '../ui/GlassPanel';
import { SegmentedTabs } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const VIEW_TABS = [
  { id: 'field' as const, label: 'CrUX Field (Real Users)' },
  { id: 'lab' as const, label: 'Lighthouse Lab (Synthetic)' },
];

const CRUX_TONE: Record<CruxMetricDistribution['category'], BadgeTone> = {
  FAST: 'success',
  AVERAGE: 'warning',
  SLOW: 'danger',
  UNAVAILABLE: 'neutral',
};

function fmtCruxVal(
  val: number | null,
  unit: 'ms' | 'cls',
): string {
  if (val === null) return 'Unavailable';
  if (unit === 'cls') return val.toFixed(3);
  if (val >= 1000) return `${(val / 1000).toFixed(2)}s`;
  return `${val} ms`;
}

export function CwvVitalsAndTrendPanel({
  overview,
  onLaunchAudit,
}: {
  overview: PerformanceDashboardOverview;
  onLaunchAudit: () => void;
}) {
  const [dataView, setDataView] = useState<'field' | 'lab'>('field');
  const { fieldSummary, mobileSummary, desktopSummary, trendHistory } = overview;

  const cruxRows = [
    {
      label: 'Largest Contentful Paint (LCP)',
      dist: fieldSummary.lcp,
      unit: 'ms' as const,
      target: '<= 2.5s p75',
    },
    {
      label: 'Interaction to Next Paint (INP)',
      dist: fieldSummary.inp,
      unit: 'ms' as const,
      target: '<= 200 ms p75',
    },
    {
      label: 'Cumulative Layout Shift (CLS)',
      dist: fieldSummary.cls,
      unit: 'cls' as const,
      target: '<= 0.100 p75',
    },
    {
      label: 'First Contentful Paint (FCP)',
      dist: fieldSummary.fcp,
      unit: 'ms' as const,
      target: '<= 1.8s p75',
    },
    {
      label: 'Time to First Byte (TTFB)',
      dist: fieldSummary.ttfb,
      unit: 'ms' as const,
      target: '<= 800 ms p75',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Strict Lab vs Field Inspector */}
      <GlassPanel as="section" animate className="p-5 sm:p-6 lg:col-span-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Lab vs Real-User Field Telemetry
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Lighthouse Lab captures and Chrome UX Report (CrUX) are kept strictly separated
            </p>
          </div>
          <SegmentedTabs
            tabs={VIEW_TABS}
            activeId={dataView}
            onChange={setDataView}
            layoutGroupId="cwv-lab-field-tabs"
            variant="light"
          />
        </div>

        {dataView === 'field' ? (
          <div className="mt-4">
            {!fieldSummary.available ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-5">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      Chrome UX Report Field Data Unavailable
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                      {fieldSummary.note}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                      Rovix AI never substitutes synthetic Lab numbers as CrUX field results. Switch to the <strong>Lighthouse Lab</strong> tab to inspect measured synthetic metrics.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-[11.5px]">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {fieldSummary.source}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {fieldSummary.reportingPeriod}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {cruxRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            {row.label}
                          </div>
                          <div className="text-[10.5px] text-[var(--text-muted)]">
                            Target: {row.target}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                            {fmtCruxVal(row.dist.percentileP75, row.unit)}
                          </span>
                          <StatusBadge
                            label={row.dist.category}
                            tone={CRUX_TONE[row.dist.category]}
                          />
                        </div>
                      </div>

                      {row.dist.goodPct !== null && (
                        <div className="mt-2">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              style={{ width: `${row.dist.goodPct}%` }}
                              className="bg-emerald-500"
                              title={`Good: ${row.dist.goodPct}%`}
                            />
                            <div
                              style={{ width: `${row.dist.needsImprovementPct ?? 0}%` }}
                              className="bg-amber-400"
                              title={`Needs Improvement: ${row.dist.needsImprovementPct ?? 0}%`}
                            />
                            <div
                              style={{ width: `${row.dist.poorPct ?? 0}%` }}
                              className="bg-rose-500"
                              title={`Poor: ${row.dist.poorPct ?? 0}%`}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums">
                            <span>Good {row.dist.goodPct}%</span>
                            <span>Needs Work {row.dist.needsImprovementPct ?? 0}%</span>
                            <span>Poor {row.dist.poorPct ?? 0}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <FlaskConical className="h-3.5 w-3.5 text-[#7047EB]" />
                Lighthouse v5 Synthetic Emulation
              </span>
              <span className="text-[var(--text-muted)]">
                Simulated CPU &amp; Network Throttling
              </span>
            </div>

            {mobileSummary.measuredUrls === 0 && desktopSummary.measuredUrls === 0 ? (
              <EmptyStateCard
                title="No Lighthouse Lab capture yet"
                description="Run a live PageSpeed performance audit on your project URLs to capture LCP, TBT, CLS, TTFB, and resource weights."
                actionLabel="Run Performance Audit"
                onAction={onLaunchAudit}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Mobile Perf Score</div>
                  <div className="mt-1 font-display text-xl font-bold text-[var(--text-primary)] tabular-nums">
                    {mobileSummary.score !== null ? `${mobileSummary.score}/100` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Desktop Perf Score</div>
                  <div className="mt-1 font-display text-xl font-bold text-[var(--text-primary)] tabular-nums">
                    {desktopSummary.score !== null ? `${desktopSummary.score}/100` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Mobile TBT</div>
                  <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {fmtCruxVal(mobileSummary.tbtMs, 'ms')}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Mobile Usability</div>
                  <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {mobileSummary.usabilityScore !== null
                      ? `${mobileSummary.usabilityScore}%`
                      : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Right: Historical Performance Audit Comparison */}
      <GlassPanel as="section" animate className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-6">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Historical Performance Comparison
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Mobile &amp; Desktop Lighthouse scores tracked across persisted SQLite audit runs
              </p>
            </div>
            {overview.previousRun && overview.latestRun && (
              <StatusBadge
                label={`${trendHistory.length} runs`}
                tone="indigo"
              />
            )}
          </div>
        </div>

        {trendHistory.length === 0 ? (
          <div className="mt-4">
            <EmptyStateCard
              title="No audit history yet"
              description="Completed performance audits will chart score deltas and regression checks over time here."
              actionLabel="Launch First Performance Audit"
              onAction={onLaunchAudit}
            />
          </div>
        ) : (
          <div className="mt-4 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendHistory} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="mobileScore"
                  name="Mobile Score"
                  stroke="#7047EB"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="desktopScore"
                  name="Desktop Score"
                  stroke="#0891B2"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {overview.latestRun?.errorSummary && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{overview.latestRun.errorSummary}</span>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
