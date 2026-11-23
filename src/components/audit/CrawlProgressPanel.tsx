import { OctagonX } from 'lucide-react';
import type { CrawlRun } from '../../types/crawl';
import {
  AnimatedCounter,
  AnimatedProgress,
  SuccessTransition,
} from '../animation/MotionPrimitives';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';
import { crawlStatusTone } from './AuditSubNav';

export function CrawlProgressPanel({
  crawlRun,
  canCancel,
  cancelling,
  onCancel,
}: {
  crawlRun: CrawlRun;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const isActive =
    crawlRun.status === 'Queued' ||
    crawlRun.status === 'Running' ||
    crawlRun.status === 'Retrying';

  const targetTotal = Math.max(
    crawlRun.discoveredCount || 1,
    crawlRun.processedCount || 1,
  );
  const pct =
    crawlRun.status === 'Succeeded'
      ? 100
      : Math.min(100, Math.round((crawlRun.processedCount / targetTotal) * 100));

  const elapsedMs = crawlRun.completedAt
    ? new Date(crawlRun.completedAt).getTime() - new Date(crawlRun.startedAt).getTime()
    : Date.now() - new Date(crawlRun.startedAt).getTime();
  const elapsedSec = Math.max(0.1, Number((elapsedMs / 1000).toFixed(1)));

  const progressTone =
    crawlRun.status === 'Failed'
      ? 'danger'
      : crawlRun.status === 'Partial'
        ? 'warning'
        : crawlRun.status === 'Succeeded'
          ? 'success'
          : 'brand';

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            {crawlRun.status === 'Succeeded' && <SuccessTransition size={20} />}
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Crawl Run {crawlRun.id}
            </h2>
            <StatusBadge
              label={crawlRun.status}
              tone={crawlStatusTone(crawlRun.status)}
            />
            {isActive && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#7047EB] dark:text-[#8B6BFF]">
                <span className="h-2 w-2 rounded-full bg-[#7047EB] animate-pulse" />
                Live SSE
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {crawlRun.crawlType === 'reverification'
                ? 'Targeted Reverification'
                : 'Full Site Audit'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Seed: {crawlRun.configuration.startingUrl} · Triggered by{' '}
            {crawlRun.triggeredBy}
          </p>
        </div>

        {isActive && canCancel && (
          <InteractiveButton
            variant="danger"
            size="md"
            loading={cancelling}
            disabled={cancelling}
            onClick={onCancel}
            className="self-start"
          >
            <OctagonX className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{cancelling ? 'Cancelling...' : 'Cancel Crawl'}</span>
          </InteractiveButton>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
          <span>
            Processed {crawlRun.processedCount} of {crawlRun.discoveredCount}{' '}
            discovered URLs
          </span>
          <span className="font-mono font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2">
          <AnimatedProgress
            value={pct}
            tone={progressTone}
            active={isActive}
            heightClass="h-2.5"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Discovered', value: crawlRun.discoveredCount },
          { label: 'Crawled', value: crawlRun.processedCount },
          { label: 'Issues Found', value: crawlRun.summary.issuesTotal },
          { label: 'Transport / 5xx Errors', value: crawlRun.errorCount },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3"
          >
            <div className="text-[11px] text-[var(--text-muted)]">{metric.label}</div>
            <div className="mt-0.5 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
              <AnimatedCounter target={metric.value} durationMs={450} />
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Elapsed Time</div>
          <div className="mt-0.5 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
            {elapsedSec.toFixed(1)}s
          </div>
        </div>
      </div>
    </section>
  );
}
