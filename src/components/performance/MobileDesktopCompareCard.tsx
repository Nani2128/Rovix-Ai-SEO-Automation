import { Monitor, Smartphone } from 'lucide-react';
import type { PerformanceDashboardOverview } from '../../types/performance';
import { AnimatedProgress } from '../animation/MotionPrimitives';
import { GlassPanel } from '../ui/GlassPanel';
import { StatusBadge } from '../ui/StateViews';

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms} ms`;
}

function metricTone(
  val: number | null,
  goodMax: number,
  warnMax: number,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (val === null) return 'neutral';
  if (val <= goodMax) return 'success';
  if (val <= warnMax) return 'warning';
  return 'danger';
}

export function MobileDesktopCompareCard({
  overview,
}: {
  overview: PerformanceDashboardOverview;
}) {
  const { mobileSummary, desktopSummary } = overview;

  const metricRows = [
    {
      label: 'LCP (Largest Contentful Paint)',
      target: '<= 2.5s',
      mobile: fmtMs(mobileSummary.lcpMs),
      desktop: fmtMs(desktopSummary.lcpMs),
      mobTone: metricTone(mobileSummary.lcpMs, 2500, 4000),
      deskTone: metricTone(desktopSummary.lcpMs, 2500, 4000),
    },
    {
      label: 'TBT (Total Blocking Time)',
      target: '<= 200 ms',
      mobile: fmtMs(mobileSummary.tbtMs),
      desktop: fmtMs(desktopSummary.tbtMs),
      mobTone: metricTone(mobileSummary.tbtMs, 200, 600),
      deskTone: metricTone(desktopSummary.tbtMs, 200, 600),
    },
    {
      label: 'CLS (Cumulative Layout Shift)',
      target: '<= 0.100',
      mobile:
        mobileSummary.clsScore !== null ? mobileSummary.clsScore.toFixed(3) : '—',
      desktop:
        desktopSummary.clsScore !== null
          ? desktopSummary.clsScore.toFixed(3)
          : '—',
      mobTone: metricTone(mobileSummary.clsScore, 0.1, 0.25),
      deskTone: metricTone(desktopSummary.clsScore, 0.1, 0.25),
    },
    {
      label: 'FCP (First Contentful Paint)',
      target: '<= 1.8s',
      mobile: fmtMs(mobileSummary.fcpMs),
      desktop: fmtMs(desktopSummary.fcpMs),
      mobTone: metricTone(mobileSummary.fcpMs, 1800, 3000),
      deskTone: metricTone(desktopSummary.fcpMs, 1800, 3000),
    },
    {
      label: 'TTFB (Server Response)',
      target: '<= 600 ms',
      mobile: fmtMs(mobileSummary.ttfbMs),
      desktop: fmtMs(desktopSummary.ttfbMs),
      mobTone: metricTone(mobileSummary.ttfbMs, 600, 1200),
      deskTone: metricTone(desktopSummary.ttfbMs, 600, 1200),
    },
    {
      label: 'Speed Index',
      target: '<= 3.4s',
      mobile: fmtMs(mobileSummary.speedIndexMs),
      desktop: fmtMs(desktopSummary.speedIndexMs),
      mobTone: metricTone(mobileSummary.speedIndexMs, 3400, 5800),
      deskTone: metricTone(desktopSummary.speedIndexMs, 3400, 5800),
    },
  ];

  return (
    <GlassPanel as="section" animate className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Mobile vs Desktop Lab Comparison
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Measured Lighthouse v5 synthetic device emulation across tested project URLs
          </p>
        </div>
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          Source: Google PageSpeed Insights v5 (Lab)
        </span>
      </div>

      {/* Score gauges */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-[#7047EB] dark:text-[#A78BFA]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Mobile Emulation
              </span>
            </div>
            <span className="font-mono text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
              {mobileSummary.score !== null ? `${mobileSummary.score}/100` : 'Not Run'}
            </span>
          </div>
          <div className="mt-2.5">
            <AnimatedProgress
              value={mobileSummary.score ?? 0}
              tone={
                mobileSummary.score === null
                  ? 'brand'
                  : mobileSummary.score >= 90
                    ? 'success'
                    : mobileSummary.score >= 50
                      ? 'warning'
                      : 'danger'
              }
              heightClass="h-2.5"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>{mobileSummary.measuredUrls} URL(s) measured</span>
            <span>
              Usability:{' '}
              {mobileSummary.usabilityScore !== null
                ? `${mobileSummary.usabilityScore}%`
                : '—'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-[#0891B2] dark:text-[#22D3EE]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Desktop Emulation
              </span>
            </div>
            <span className="font-mono text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
              {desktopSummary.score !== null ? `${desktopSummary.score}/100` : 'Not Run'}
            </span>
          </div>
          <div className="mt-2.5">
            <AnimatedProgress
              value={desktopSummary.score ?? 0}
              tone={
                desktopSummary.score === null
                  ? 'brand'
                  : desktopSummary.score >= 90
                    ? 'success'
                    : desktopSummary.score >= 50
                      ? 'warning'
                      : 'danger'
              }
              heightClass="h-2.5"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>{desktopSummary.measuredUrls} URL(s) measured</span>
            <span>
              Accessibility:{' '}
              {overview.measurements.find(
                (m) => m.strategy === 'desktop' && m.status === 'Succeeded',
              )?.lab.accessibilityScore !== null &&
              overview.measurements.find(
                (m) => m.strategy === 'desktop' && m.status === 'Succeeded',
              )?.lab.accessibilityScore !== undefined
                ? `${
                    overview.measurements.find(
                      (m) => m.strategy === 'desktop' && m.status === 'Succeeded',
                    )!.lab.accessibilityScore
                  }%`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed CWV metric comparison table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[11px] text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-semibold">Core Metric</th>
              <th className="py-2 px-3 font-semibold">Good Target</th>
              <th className="py-2 px-3 font-semibold text-right">Mobile (Lab)</th>
              <th className="py-2 pl-3 font-semibold text-right">Desktop (Lab)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {metricRows.map((row) => (
              <tr key={row.label} className="hover:bg-[var(--bg-subtle)]/60">
                <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)]">
                  {row.label}
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                  {row.target}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <StatusBadge label={row.mobile} tone={row.mobTone} />
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <StatusBadge label={row.desktop} tone={row.deskTone} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
