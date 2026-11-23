import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Info, MinusCircle, PlusCircle } from 'lucide-react';
import type { CrawlComparisonResponse } from '../../types/audit';
import { AnimatedCard } from '../animation/MotionPrimitives';
import { StatusBadge } from '../ui/StateViews';

export function CrawlComparison({
  comparison,
}: {
  comparison: CrawlComparisonResponse;
}) {
  const { previousCrawl, currentCrawl, incompleteExcludedCount } = comparison;

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-5">
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Completed Crawl Comparison
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Diffs issue regressions, resolved conditions, and URL status changes across completed full crawls
          </p>
        </div>
        {incompleteExcludedCount > 0 && (
          <StatusBadge
            label={`${incompleteExcludedCount} Partial/Failed/Cancelled excluded`}
            tone="warning"
          />
        )}
      </div>

      {!previousCrawl || !currentCrawl ? (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs text-[var(--text-secondary)]">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]"
            aria-hidden="true"
          />
          <div>
            At least two completed full crawls (
            <span className="font-semibold text-[var(--text-primary)]">Succeeded</span>) are
            required to compute a historical diff. Run another full crawl on this
            project to compare changes.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AnimatedCard
              delay={0}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs"
            >
              <div className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                Baseline Crawl (Previous)
              </div>
              <div className="mt-1 font-mono font-bold text-[var(--text-primary)]">
                {previousCrawl.id}
              </div>
              <div className="mt-1 text-[var(--text-muted)] tabular-nums">
                {new Date(previousCrawl.startedAt).toLocaleString()} ·{' '}
                {previousCrawl.processedCount} URLs · Health{' '}
                {previousCrawl.summary.healthScore}/100
              </div>
            </AnimatedCard>

            <AnimatedCard
              delay={0.05}
              className="rounded-xl border border-[#7047EB]/30 bg-[#7047EB]/6 p-4 text-xs"
            >
              <div className="text-[11px] font-semibold uppercase text-[#7047EB] dark:text-[#C4B5FD]">
                Latest Completed Crawl (Current)
              </div>
              <div className="mt-1 font-mono font-bold text-[var(--text-primary)]">
                {currentCrawl.id}
              </div>
              <div className="mt-1 text-[var(--text-secondary)] tabular-nums">
                {new Date(currentCrawl.startedAt).toLocaleString()} ·{' '}
                {currentCrawl.processedCount} URLs · Health{' '}
                {currentCrawl.summary.healthScore}/100
              </div>
            </AnimatedCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AnimatedCard
              interactive
              delay={0.08}
              className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/30 p-4"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>New Regressions ({comparison.newIssues.length})</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-xs">
                {comparison.newIssues.length === 0 ? (
                  <li className="text-[var(--text-muted)]">No new issue regressions.</li>
                ) : (
                  comparison.newIssues.map((iss) => (
                    <li key={iss.id}>
                      <Link
                        to={`/audit/issues/${iss.id}`}
                        className="font-semibold text-rose-900 dark:text-rose-200 hover:underline"
                      >
                        {iss.title}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </AnimatedCard>

            <AnimatedCard
              interactive
              delay={0.13}
              className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/30 p-4"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Cleared in Latest Crawl ({comparison.resolvedIssues.length})</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-xs">
                {comparison.resolvedIssues.length === 0 ? (
                  <li className="text-[var(--text-muted)]">
                    No conditions cleared between runs.
                  </li>
                ) : (
                  comparison.resolvedIssues.map((iss) => (
                    <li key={iss.id}>
                      <Link
                        to={`/audit/issues/${iss.id}`}
                        className="font-semibold text-emerald-900 dark:text-emerald-200 hover:underline"
                      >
                        {iss.title}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </AnimatedCard>

            <AnimatedCard
              interactive
              delay={0.18}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                <MinusCircle className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                <span>Persistent Issues ({comparison.unchangedIssues.length})</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-xs">
                {comparison.unchangedIssues.slice(0, 6).map((iss) => (
                  <li key={iss.id} className="truncate">
                    <Link
                      to={`/audit/issues/${iss.id}`}
                      className="font-medium text-[var(--text-secondary)] hover:text-[#7047EB] dark:hover:text-[#8B6BFF] transition-colors"
                    >
                      {iss.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </AnimatedCard>
          </div>

          {comparison.changedUrls.length > 0 && (
            <div className="rounded-xl border border-[var(--border-hairline)] p-4">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                Changed URL States ({comparison.changedUrls.length})
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                {comparison.changedUrls.slice(0, 12).map((u) => (
                  <div
                    key={u.url}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 transition-colors hover:bg-[#7047EB]/5"
                  >
                    <span className="font-mono text-[11px] text-[var(--text-primary)] truncate">
                      {u.url}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      <span>
                        {u.previousStatus ?? 'None'} ({u.previousIndexability ?? '—'})
                      </span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {u.currentStatus ?? 'Removed'} ({u.currentIndexability ?? '—'})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
