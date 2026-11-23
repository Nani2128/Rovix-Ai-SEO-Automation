import { AlertTriangle, CheckCircle2, Globe, ShieldAlert } from 'lucide-react';
import type { AuditOverviewResponse } from '../../types/audit';
import { AnimatedCard, AnimatedCounter } from '../animation/MotionPrimitives';

export function AuditSummaryCards({
  overview,
}: {
  overview: AuditOverviewResponse;
}) {
  const latest = overview.latestCrawl;
  const openCriticalOrHigh = overview.severityBreakdown
    .filter((s) => s.severity === 'Critical' || s.severity === 'High')
    .reduce((acc, s) => acc + s.count, 0);
  const verifiedFixesCount = overview.recentlyVerifiedFixes.filter(
    (v) => v.result === 'Verified',
  ).length;

  const cards = [
    {
      label: 'Site Health Score',
      renderValue: () =>
        latest ? (
          <>
            <AnimatedCounter target={latest.summary.healthScore} />
            <span className="text-base font-bold text-[var(--text-muted)]">/100</span>
          </>
        ) : (
          'No crawl yet'
        ),
      hint: latest
        ? `Based on ${latest.processedCount} crawled URLs`
        : 'Run initial crawl to compute score',
      icon: CheckCircle2,
      iconBg:
        'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Crawled & Indexable',
      renderValue: () =>
        latest ? (
          <>
            <AnimatedCounter target={latest.summary.indexableCount} />
            <span className="text-base font-bold text-[var(--text-muted)]">
              {' / '}
              <AnimatedCounter target={latest.processedCount} />
            </span>
          </>
        ) : (
          '0 / 0'
        ),
      hint: latest
        ? `${latest.summary.nonIndexableCount} non-indexable · ${latest.summary.redirectCount} redirects`
        : 'Waiting for crawl inventory',
      icon: Globe,
      iconBg: 'bg-[#7047EB]/12 dark:bg-[#8B6BFF]/15 text-[#7047EB] dark:text-[#8B6BFF]',
    },
    {
      label: 'Open Critical & High Issues',
      renderValue: () => <AnimatedCounter target={openCriticalOrHigh} />,
      hint: `${overview.topCriticalIssues.length} active grouped root causes`,
      icon: ShieldAlert,
      iconBg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Verified Fixes',
      renderValue: () => <AnimatedCounter target={verifiedFixesCount} />,
      hint: `${overview.developerTickets.length} developer ticket(s) tracked`,
      icon: AlertTriangle,
      iconBg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <AnimatedCard
            key={card.label}
            delay={idx * 0.05}
            interactive
            className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] transition-colors hover:border-[#7047EB]/35"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-[var(--text-muted)]">
                  {card.label}
                </div>
                <div className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums">
                  {card.renderValue()}
                </div>
              </div>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-[11.5px] text-[var(--text-muted)]">{card.hint}</div>
          </AnimatedCard>
        );
      })}
    </div>
  );
}
