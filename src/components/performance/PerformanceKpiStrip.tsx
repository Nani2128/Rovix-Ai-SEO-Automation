import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  Gauge,
  Monitor,
  Smartphone,
  Users,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type { PerformanceDashboardOverview } from '../../types/performance';
import { DataProvenanceStrip } from '../ui/DataProvenanceMeta';
import { GlassPanel } from '../ui/GlassPanel';

function scoreBadgeColor(score: number | null): string {
  if (score === null) return 'text-[var(--text-muted)]';
  if (score >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function formatMsShort(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms} ms`;
}

export function PerformanceKpiStrip({
  overview,
}: {
  overview: PerformanceDashboardOverview;
}) {
  const prefersReducedMotion = useReducedMotion();
  const { mobileSummary, desktopSummary, fieldSummary, latestRun } = overview;

  const cards = [
    {
      id: 'mobile-score',
      label: 'Mobile Performance',
      icon: Smartphone,
      accent: 'text-[#7047EB] dark:text-[#A78BFA] bg-[#7047EB]/10',
      value:
        mobileSummary.score !== null ? `${mobileSummary.score}` : 'Unavailable',
      suffix: mobileSummary.score !== null ? '/100' : '',
      valueClass: scoreBadgeColor(mobileSummary.score),
      subtext:
        mobileSummary.measuredUrls > 0
          ? `${mobileSummary.measuredUrls} URL(s) · TBT ${formatMsShort(mobileSummary.tbtMs)}`
          : 'No mobile Lighthouse run yet',
      provenance: mobileSummary.provenance,
    },
    {
      id: 'desktop-score',
      label: 'Desktop Performance',
      icon: Monitor,
      accent: 'text-[#0891B2] dark:text-[#22D3EE] bg-[#0891B2]/10',
      value:
        desktopSummary.score !== null ? `${desktopSummary.score}` : 'Unavailable',
      suffix: desktopSummary.score !== null ? '/100' : '',
      valueClass: scoreBadgeColor(desktopSummary.score),
      subtext:
        desktopSummary.measuredUrls > 0
          ? `${desktopSummary.measuredUrls} URL(s) · TTFB ${formatMsShort(desktopSummary.ttfbMs)}`
          : 'No desktop Lighthouse run yet',
      provenance: desktopSummary.provenance,
    },
    {
      id: 'lab-cwv',
      label: 'Mobile LCP / CLS (Lab)',
      icon: Activity,
      accent: 'text-[#0D9488] dark:text-[#2DD4BF] bg-[#0D9488]/10',
      value:
        mobileSummary.lcpMs !== null
          ? formatMsShort(mobileSummary.lcpMs)
          : desktopSummary.lcpMs !== null
            ? formatMsShort(desktopSummary.lcpMs)
            : 'Unavailable',
      suffix: '',
      valueClass:
        (mobileSummary.lcpMs ?? desktopSummary.lcpMs ?? 9999) <= 2500
          ? 'text-emerald-600 dark:text-emerald-400'
          : (mobileSummary.lcpMs ?? desktopSummary.lcpMs) !== null
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-[var(--text-muted)]',
      subtext:
        mobileSummary.clsScore !== null
          ? `CLS ${mobileSummary.clsScore.toFixed(3)} · FCP ${formatMsShort(mobileSummary.fcpMs)}`
          : desktopSummary.clsScore !== null
            ? `Desktop CLS ${desktopSummary.clsScore.toFixed(3)}`
            : 'Awaiting synthetic capture',
      provenance:
        mobileSummary.measuredUrls > 0
          ? mobileSummary.provenance
          : desktopSummary.provenance,
    },
    {
      id: 'crux-field',
      label: 'CrUX Real-User Field',
      icon: fieldSummary.available ? Users : Gauge,
      accent: 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/10',
      value: fieldSummary.available
        ? fieldSummary.lcp.percentileP75 !== null
          ? formatMsShort(fieldSummary.lcp.percentileP75)
          : 'Measured'
        : 'Unavailable',
      suffix: fieldSummary.available && fieldSummary.lcp.percentileP75 !== null ? ' p75' : '',
      valueClass: fieldSummary.available
        ? fieldSummary.lcp.category === 'FAST'
          ? 'text-emerald-600 dark:text-emerald-400'
          : fieldSummary.lcp.category === 'AVERAGE'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-rose-600 dark:text-rose-400'
        : 'text-[var(--text-muted)]',
      subtext: fieldSummary.available
        ? `${fieldSummary.scope === 'url' ? 'URL' : 'Origin'} 28d CrUX · INP ${formatMsShort(fieldSummary.inp.percentileP75)}`
        : latestRun
          ? 'No eligible CrUX 28d traffic sample'
          : 'Run audit to check CrUX availability',
      provenance: {
        source: fieldSummary.source,
        collectedAt: fieldSummary.collectedAt,
        reportingPeriod: fieldSummary.reportingPeriod,
        measurementStatus: fieldSummary.measurementStatus,
      },
    },
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.id}
            variants={fadeInUp}
            className="h-full"
          >
            <GlassPanel className="flex h-full flex-col justify-between p-4 sm:p-5">
              <div>
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.accent}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-snug text-[var(--text-secondary)]">
                      {card.label}
                    </div>
                    <div className="truncate text-[10.5px] font-medium text-[var(--text-muted)]">
                      Source: {card.provenance.source}
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-baseline gap-1">
                  <span
                    className={`font-display text-2xl font-extrabold tracking-tight tabular-nums ${card.valueClass}`}
                  >
                    {card.value}
                  </span>
                  {card.suffix && (
                    <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
                      {card.suffix}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-[var(--text-muted)] leading-snug">
                  {card.subtext}
                </p>
              </div>

              <DataProvenanceStrip
                compact
                source={card.provenance.source}
                collectedAt={card.provenance.collectedAt}
                reportingPeriod={card.provenance.reportingPeriod}
                measurementStatus={card.provenance.measurementStatus}
              />
            </GlassPanel>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
