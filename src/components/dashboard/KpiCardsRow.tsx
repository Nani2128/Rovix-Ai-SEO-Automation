import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  BarChart2,
  Info,
  ShieldCheck,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type { KpiMetricItem } from '../../types/dashboard';
import {
  AnimatedCounter,
  AnimatedTooltip,
} from '../animation/MotionPrimitives';
import { MiniSparkline } from '../charts/MiniSparkline';
import { DataProvenanceStrip } from '../ui/DataProvenanceMeta';

const KPI_STYLE: Record<
  KpiMetricItem['id'],
  { icon: typeof TrendingUp; iconBg: string; iconColor: string; sparkColor: string }
> = {
  traffic: {
    icon: TrendingUp,
    iconBg: 'bg-[#7047EB]/12 dark:bg-[#8B6BFF]/15',
    iconColor: 'text-[#7047EB] dark:text-[#8B6BFF]',
    sparkColor: '#7047EB',
  },
  keywords: {
    icon: BarChart2,
    iconBg: 'bg-[#2563EB]/12 dark:bg-[#60A5FA]/15',
    iconColor: 'text-[#2563EB] dark:text-[#60A5FA]',
    sparkColor: '#2563EB',
  },
  health: {
    icon: ShieldCheck,
    iconBg: 'bg-[#0D9488]/12 dark:bg-[#2DD4BF]/15',
    iconColor: 'text-[#0D9488] dark:text-[#2DD4BF]',
    sparkColor: '#0D9488',
  },
  conversions: {
    icon: UserCheck,
    iconBg: 'bg-[#0891B2]/12 dark:bg-[#22D3EE]/15',
    iconColor: 'text-[#0891B2] dark:text-[#22D3EE]',
    sparkColor: '#0891B2',
  },
};

export function KpiCardsRow({ kpis }: { kpis: KpiMetricItem[] }) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      aria-label="Key SEO Metrics"
      variants={staggerContainer}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {kpis.map((kpi) => {
        const visual = KPI_STYLE[kpi.id];
        const Icon = visual.icon;
        const isPositive = kpi.trendDirection === 'up';
        const hasValue = kpi.available && kpi.value !== null && Number.isFinite(kpi.value);

        return (
          <motion.button
            key={kpi.id}
            type="button"
            variants={fadeInUp}
            whileHover={prefersReducedMotion ? undefined : { y: -2 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
            onClick={() => navigate(kpi.route)}
            aria-label={`${kpi.label}: ${
              hasValue
                ? `${kpi.value!.toLocaleString()}${kpi.unitSuffix ?? ''}`
                : kpi.emptyReason ?? 'Not connected'
            }`}
            className="rovix-glass-surface group relative flex flex-col justify-between rounded-[22px] p-4.5 text-left shadow-[var(--shadow-soft)] hover:border-[#7047EB]/45 hover:shadow-[var(--shadow-elevated)] cursor-pointer transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB]"
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105 ${visual.iconBg} ${visual.iconColor}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--text-secondary)]">
                    {kpi.label}
                  </div>
                  <div className="truncate text-[10.5px] font-medium text-[var(--text-muted)]">
                    Source: {kpi.source}
                  </div>
                </div>
              </div>

              <AnimatedTooltip content={kpi.tooltipDetail}>
                <span
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:text-[#7047EB] dark:hover:text-[#8B6BFF] focus-visible:outline-2 focus-visible:outline-[#7047EB]"
                  aria-label={`${kpi.label} data source info`}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </AnimatedTooltip>
            </div>

            <div className="mt-4 flex items-end justify-between gap-2 w-full">
              {hasValue ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums">
                      <AnimatedCounter target={kpi.value!} />
                    </span>
                    {kpi.unitSuffix && (
                      <span className="font-mono text-xs font-medium text-[var(--text-muted)]">
                        {kpi.unitSuffix}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                        kpi.trendDirection === 'flat'
                          ? 'bg-slate-100 dark:bg-slate-800 text-[var(--text-muted)]'
                          : isPositive
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {kpi.trendDirection === 'flat'
                        ? ''
                        : isPositive
                          ? '↑ '
                          : '↓ '}
                      {kpi.comparisonLabel}
                    </span>
                  </div>

                  {kpi.sparkline.length > 1 && (
                    <MiniSparkline points={kpi.sparkline} color={visual.sparkColor} />
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-display text-sm font-bold text-[var(--text-secondary)]">
                    {kpi.emptyReason ?? 'Not Connected'}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {kpi.comparisonLabel}
                  </span>
                </div>
              )}
            </div>

            <DataProvenanceStrip
              source={kpi.source}
              collectedAt={kpi.collectedAt}
              reportingPeriod={kpi.reportingPeriod}
              measurementStatus={kpi.measurementStatus}
              compact
            />
          </motion.button>
        );
      })}
    </motion.section>
  );
}
