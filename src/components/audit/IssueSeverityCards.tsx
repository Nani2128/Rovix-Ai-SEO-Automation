import { motion, useReducedMotion } from 'motion/react';
import { SPRING_PILL } from '../../config/motion';
import type { IssueSeverity, TechnicalIssue } from '../../types/technicalIssue';
import { AnimatedCounter } from '../animation/MotionPrimitives';

const ORDER: IssueSeverity[] = [
  'Critical',
  'High',
  'Medium',
  'Low',
  'Informational',
];

const STYLES: Record<IssueSeverity, { pill: string; ring: string }> = {
  Critical: {
    pill: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    ring: 'border-rose-300 dark:border-rose-500/50',
  },
  High: {
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    ring: 'border-amber-300 dark:border-amber-500/50',
  },
  Medium: {
    pill: 'bg-[#7047EB]/10 text-[#7047EB] dark:bg-[#7047EB]/20 dark:text-[#C4B5FD]',
    ring: 'border-[#7047EB]/40',
  },
  Low: {
    pill: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    ring: 'border-sky-300 dark:border-sky-500/50',
  },
  Informational: {
    pill: 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
    ring: 'border-[var(--border-hairline)]',
  },
};

export function IssueSeverityCards({
  issues,
  activeSeverity,
  onSelectSeverity,
}: {
  issues: TechnicalIssue[];
  activeSeverity: IssueSeverity | 'All';
  onSelectSeverity: (sev: IssueSeverity | 'All') => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <motion.button
        type="button"
        onClick={() => onSelectSeverity('All')}
        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
        className={`relative rounded-2xl border p-4 text-left transition-colors cursor-pointer ${
          activeSeverity === 'All'
            ? 'border-[#7047EB] bg-[#7047EB]/5 dark:bg-[#7047EB]/12 shadow-sm'
            : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[#7047EB]/35'
        }`}
      >
        {activeSeverity === 'All' && (
          <motion.span
            layoutId="severity-active-ring"
            transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-[#7047EB]/35"
          />
        )}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          All Issues
        </div>
        <div className="mt-1 font-display text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
          <AnimatedCounter target={issues.length} />
        </div>
      </motion.button>

      {ORDER.map((sev) => {
        const count = issues.filter((i) => i.severity === sev).length;
        const selected = activeSeverity === sev;
        const st = STYLES[sev];
        return (
          <motion.button
            key={sev}
            type="button"
            onClick={() => onSelectSeverity(selected ? 'All' : sev)}
            whileHover={prefersReducedMotion ? undefined : { y: -2 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
            className={`relative rounded-2xl border p-4 text-left transition-colors cursor-pointer ${
              selected
                ? `${st.ring} bg-[var(--bg-subtle)] shadow-sm`
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[#7047EB]/35'
            }`}
          >
            {selected && (
              <motion.span
                layoutId="severity-active-ring"
                transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-[#7047EB]/30"
              />
            )}
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${st.pill}`}
            >
              {sev}
            </span>
            <div className="mt-1.5 font-display text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              <AnimatedCounter target={count} />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
