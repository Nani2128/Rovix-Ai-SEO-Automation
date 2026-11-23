import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import { LoadingShimmer } from '../animation/MotionPrimitives';
import { InteractiveButton } from './InteractivePrimitives';

export type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'indigo'
  | 'neutral'
  | 'info';

const TONE_MAP: Record<BadgeTone, string> = {
  success:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
  warning:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
  danger:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
  indigo:
    'bg-[#7047EB]/10 text-[#7047EB] border-[#7047EB]/25 dark:bg-[#8B6BFF]/15 dark:text-[#C4B5FD] dark:border-[#8B6BFF]/30',
  info:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60',
  neutral:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
};

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 ${TONE_MAP[tone]}`}
    >
      {label}
    </span>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard data" role="status">
      <LoadingShimmer className="h-[156px] w-full rounded-[22px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <LoadingShimmer key={i} className="h-[124px] w-full rounded-[18px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <LoadingShimmer className="h-[340px] w-full rounded-[20px] lg:col-span-7" />
        <LoadingShimmer className="h-[340px] w-full rounded-[20px] lg:col-span-5" />
      </div>
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-3" role="status" aria-label="Loading table records">
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingShimmer key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: MOTION_EASE }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-6 py-10 text-center"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF]">
        <Inbox className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3 font-display text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      {actionLabel && onAction && (
        <InteractiveButton
          variant="primary"
          size="md"
          onClick={onAction}
          className="mt-4"
        >
          {actionLabel}
        </InteractiveButton>
      )}
    </motion.div>
  );
}

export function ErrorStateCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      role="alert"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: MOTION_EASE }}
      className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/75 dark:bg-rose-950/35 px-5 py-4 sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <div>
          <h3 className="font-display text-sm font-semibold text-rose-950 dark:text-rose-200">
            Unable to refresh data
          </h3>
          <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{message}</p>
        </div>
      </div>
      {onRetry && (
        <InteractiveButton
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/60 shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Retry</span>
        </InteractiveButton>
      )}
    </motion.div>
  );
}
