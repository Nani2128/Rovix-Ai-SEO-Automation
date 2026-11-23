import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CARD_STAGGER_CONTAINER,
  CARD_STAGGER_ITEM,
  DRAWER_TRANSITION,
  MODAL_TRANSITION,
  MOTION_EASE,
  POPOVER_TRANSITION,
  PAGE_TRANSITION,
} from '../../config/motion';
import { clampProgressPct, interpolateFromTo } from '../../utils/uiMotionLogic';

export function PageTransition({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : PAGE_TRANSITION.initial}
      animate={PAGE_TRANSITION.animate}
      exit={prefersReducedMotion ? undefined : PAGE_TRANSITION.exit}
      transition={PAGE_TRANSITION.transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedCounter({
  target,
  prefix = '',
  suffix = '',
  decimals = 0,
  durationMs = 700,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const prevTargetRef = useRef<number>(prefersReducedMotion ? target : 0);
  const [display, setDisplay] = useState<number>(
    prefersReducedMotion ? target : 0,
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      prevTargetRef.current = target;
      setDisplay(target);
      return;
    }

    const fromValue = prevTargetRef.current;
    let rafId = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / durationMs);
      const nextVal = interpolateFromTo(fromValue, target, progress, decimals);
      setDisplay(nextVal);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        prevTargetRef.current = target;
      }
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      prevTargetRef.current = target;
    };
  }, [target, decimals, durationMs, prefersReducedMotion]);

  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

export const CountUpNumber = AnimatedCounter;

export function StaggerContainer({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      variants={CARD_STAGGER_CONTAINER}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={CARD_STAGGER_ITEM} className={className}>
      {children}
    </motion.div>
  );
}

export function AnimatedCard({
  children,
  className = '',
  interactive = false,
  onClick,
  delay = 0,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  delay?: number;
  ariaLabel?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

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
        whileTap={prefersReducedMotion ? undefined : { scale: 0.992 }}
        className={className}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.34,
        delay: prefersReducedMotion ? 0 : delay,
        ease: MOTION_EASE,
      }}
      whileHover={
        interactive && !prefersReducedMotion ? { y: -2 } : undefined
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionSection({
  children,
  className = '',
  id,
  ariaLabelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  ariaLabelledBy?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      id={id}
      aria-labelledby={ariaLabelledBy}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.45, ease: MOTION_EASE }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export function FloatingPopover({
  open,
  onClose,
  children,
  className = '',
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        anchorRef?.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          initial={prefersReducedMotion ? false : POPOVER_TRANSITION.initial}
          animate={POPOVER_TRANSITION.animate}
          exit={prefersReducedMotion ? undefined : POPOVER_TRANSITION.exit}
          transition={POPOVER_TRANSITION.transition}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AnimatedDrawer({
  open,
  onClose,
  ariaLabel,
  maxWidthClass = 'max-w-xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]"
          />
            <motion.div
            initial={prefersReducedMotion ? false : DRAWER_TRANSITION.initial}
            animate={DRAWER_TRANSITION.animate}
            exit={prefersReducedMotion ? undefined : DRAWER_TRANSITION.exit}
            transition={DRAWER_TRANSITION.transition}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 flex h-full w-full ${maxWidthClass} flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl`}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SmoothModal({
  open,
  onClose,
  ariaLabel,
  maxWidthClass = 'max-w-lg',
  alignTop = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  alignTop?: boolean;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const modalTree = (
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 z-[90] flex justify-center px-4 ${
            alignTop ? 'items-start pt-20' : 'items-center'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60"
          />
          <motion.div
            initial={prefersReducedMotion ? false : MODAL_TRANSITION.initial}
            animate={MODAL_TRANSITION.animate}
            exit={prefersReducedMotion ? undefined : MODAL_TRANSITION.exit}
            transition={MODAL_TRANSITION.transition}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[0_28px_60px_-15px_rgba(15,23,42,0.42)]`}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') {
    return modalTree;
  }
  return createPortal(modalTree, document.body);
}

export function AnimatedTooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.span
            role="tooltip"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: 3, scale: 0.96 }}
            transition={{ duration: 0.14, ease: MOTION_EASE }}
            className="pointer-events-none absolute right-0 bottom-full z-40 mb-2 w-56 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-lg"
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function LoadingShimmer({ className = '' }: { className?: string }) {
  return <div className={`rovix-shimmer rounded-2xl ${className}`} />;
}

export function AnimatedProgress({
  value,
  tone = 'brand',
  active = false,
  heightClass = 'h-2.5',
}: {
  value: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  active?: boolean;
  heightClass?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const pct = clampProgressPct(value);

  const barClass =
    tone === 'danger'
      ? 'bg-rose-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : tone === 'success'
          ? 'bg-[#0D9488]'
          : 'bg-gradient-to-r from-[#7047EB] via-[#2563EB] to-[#0891B2]';

  return (
    <div
      className={`${heightClass} w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: MOTION_EASE }}
        style={{ transformOrigin: 'left center' }}
        className={`relative h-full w-full rounded-full ${barClass}`}
      >
        {active && !prefersReducedMotion && (
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            style={{ animation: 'shimmer-sweep 1.6s linear infinite' }}
          />
        )}
      </motion.div>
    </div>
  );
}

export function SuccessTransition({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      initial={prefersReducedMotion ? false : { scale: 0.78, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: MOTION_EASE }}
      className={`text-emerald-600 ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <motion.path
        d="M7.5 12.2L10.6 15.2L16.5 9.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={prefersReducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.36, delay: 0.08, ease: MOTION_EASE }}
      />
    </motion.svg>
  );
}
