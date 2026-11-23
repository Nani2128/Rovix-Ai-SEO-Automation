import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { ChevronDown, MoreHorizontal, RotateCcw, Search } from 'lucide-react';
import {
  CARD_TILT_SPRING,
  MOTION_EASE,
  POPOVER_TRANSITION,
  SPRING_PHYSICS,
} from '../../config/motion';
import type { MeasurementStatus } from '../../types/dashboard';
import { DataProvenanceStrip } from './DataProvenanceMeta';

import { GlassPanel } from './GlassPanel';
export { GlassPanel } from './GlassPanel';

export function PremiumCard({
  children,
  className = '',
  interactive = false,
  tilt = false,
  onClick,
  ariaLabel,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  tilt?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  delay?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const springX = useSpring(pointerX, CARD_TILT_SPRING);
  const springY = useSpring(pointerY, CARD_TILT_SPRING);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-4, 4]);
  const rotateX = useTransform(springY, [-0.5, 0.5], [4, -4]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tilt || prefersReducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerX.set((e.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.34,
          delay: prefersReducedMotion ? 0 : delay,
          ease: MOTION_EASE,
        }}
        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
        className={`rovix-soft-card rounded-[20px] text-left transition-all duration-150 hover:border-[#7047EB]/40 hover:shadow-[var(--shadow-elevated)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${className}`}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      onPointerMove={tilt ? handlePointerMove : undefined}
      onPointerLeave={tilt ? handlePointerLeave : undefined}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.36,
        delay: prefersReducedMotion ? 0 : delay,
        ease: MOTION_EASE,
      }}
      whileHover={interactive && !prefersReducedMotion ? { y: -2 } : undefined}
      style={
        tilt && !prefersReducedMotion
          ? { rotateX, rotateY, transformPerspective: 1000 }
          : undefined
      }
      className={`rovix-soft-card rounded-[20px] transition-shadow duration-150 ${
        interactive ? 'hover:border-[#7047EB]/35 hover:shadow-[var(--shadow-elevated)]' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function MetricCard({
  title,
  source,
  valueSlot,
  badgeSlot,
  sparklineSlot,
  collectedAt,
  reportingPeriod,
  measurementStatus,
  onClick,
  ariaLabel,
  delay = 0,
}: {
  title: string;
  source: string;
  valueSlot: ReactNode;
  badgeSlot?: ReactNode;
  sparklineSlot?: ReactNode;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: MeasurementStatus;
  onClick?: () => void;
  ariaLabel?: string;
  delay?: number;
}) {
  return (
    <PremiumCard
      onClick={onClick}
      ariaLabel={ariaLabel}
      delay={delay}
      interactive
      className="group relative flex flex-col justify-between p-4.5 w-full"
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--text-secondary)]">
            {title}
          </div>
          <div className="truncate text-[10.5px] font-medium text-[var(--text-muted)]">
            Source: {source}
          </div>
        </div>
        {badgeSlot}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2 w-full">
        <div className="min-w-0">{valueSlot}</div>
        {sparklineSlot}
      </div>

      <DataProvenanceStrip
        source={source}
        collectedAt={collectedAt}
        reportingPeriod={reportingPeriod}
        measurementStatus={measurementStatus}
        compact
      />
    </PremiumCard>
  );
}

export function AnimatedChartCard({
  headingId,
  title,
  subtitle,
  headerActions,
  provenance,
  children,
  className = '',
}: {
  headingId: string;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  provenance?: {
    source: string;
    collectedAt: string | null;
    reportingPeriod: string;
    measurementStatus: MeasurementStatus;
  };
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      aria-labelledby={headingId}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: MOTION_EASE }}
      className={`rovix-soft-card rounded-[22px] p-5 sm:p-6 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="font-display text-lg font-bold text-[var(--text-primary)]"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
          )}
          {provenance && (
            <DataProvenanceStrip
              source={provenance.source}
              collectedAt={provenance.collectedAt}
              reportingPeriod={provenance.reportingPeriod}
              measurementStatus={provenance.measurementStatus}
            />
          )}
        </div>
        {headerActions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerActions}
          </div>
        )}
      </div>

      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

export function StatusIndicator({
  label,
  tone = 'neutral',
  liveStream = false,
}: {
  label: string;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  liveStream?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const dotColor =
    tone === 'success'
      ? 'bg-[#0D9488] dark:bg-[#2DD4BF]'
      : tone === 'warning'
        ? 'bg-[#D97706] dark:bg-[#FBBF24]'
        : tone === 'danger'
          ? 'bg-[#E05275] dark:bg-[#FB7185]'
          : tone === 'brand'
            ? 'bg-[#7047EB] dark:bg-[#8B6BFF]'
            : 'bg-slate-400';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center">
        {liveStream && !prefersReducedMotion && (
          <span
            aria-hidden="true"
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColor}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <span>{label}</span>
    </span>
  );
}

export function DataProvenanceCard({
  title,
  source,
  collectedAt,
  reportingPeriod,
  measurementStatus,
  note,
}: {
  title: string;
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: MeasurementStatus;
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="font-display text-xs font-bold text-[var(--text-primary)]">
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
            expanded ? 'rotate-180 text-[#7047EB]' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      <DataProvenanceStrip
        source={source}
        collectedAt={collectedAt}
        reportingPeriod={reportingPeriod}
        measurementStatus={measurementStatus}
      />
      <AnimatePresence initial={false}>
        {expanded && note && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            className="overflow-hidden pt-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FloatingActionMenu({
  label = 'Quick Actions',
  actions,
}: {
  label?: string;
  actions: readonly {
    id: string;
    label: string;
    hint?: string;
    icon?: ReactNode;
    onSelect: () => void;
  }[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-block">
      <motion.button
        type="button"
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        transition={SPRING_PHYSICS}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] shadow-2xs hover:border-[#7047EB]/40 cursor-pointer"
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
        <span>{label}</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={prefersReducedMotion ? false : POPOVER_TRANSITION.initial}
            animate={POPOVER_TRANSITION.animate}
            exit={prefersReducedMotion ? undefined : POPOVER_TRANSITION.exit}
            transition={POPOVER_TRANSITION.transition}
            className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-elevated)]"
          >
            {actions.map((act) => (
              <button
                key={act.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  act.onSelect();
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
              >
                {act.icon && (
                  <span className="mt-0.5 text-[#7047EB] dark:text-[#8B6BFF] shrink-0">
                    {act.icon}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)]">{act.label}</div>
                  {act.hint && (
                    <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                      {act.hint}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InteractiveFilterPanel<T extends string>({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter items...',
  chips,
  activeChip,
  onChipChange,
  onReset,
  rightSlot,
}: {
  searchValue?: string;
  onSearchChange?: (next: string) => void;
  searchPlaceholder?: string;
  chips: readonly { id: T; label: string; count?: number }[];
  activeChip: T;
  onChipChange: (id: T) => void;
  onReset?: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 sm:px-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange !== undefined && (
          <label className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-44 sm:w-56 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
            />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filters">
          {chips.map((chip) => {
            const active = chip.id === activeChip;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChipChange(chip.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#7047EB] text-white shadow-2xs'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[#7047EB]/35 hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? 'text-white/85' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset filters"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
