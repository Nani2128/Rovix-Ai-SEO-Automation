import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { MOTION_EASE, POPOVER_TRANSITION, SPRING_PILL } from '../../config/motion';
import { useToastStore, type ToastTone } from '../../stores/useToastStore';
import { nextCommandIndex } from '../../utils/uiMotionLogic';

type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    '[background-image:linear-gradient(90deg,var(--accent-pill-start),var(--accent-pill-end))] text-[var(--accent-on-pill)] shadow-[0_10px_22px_-8px_var(--focus-ring)] hover:opacity-95',
  secondary:
    'border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/45 hover:bg-[var(--bg-subtle)]',
  subtle:
    'border border-[var(--accent-primary)]/25 bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90',
  danger:
    'border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-xs rounded-xl gap-1.5',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export function InteractiveButton({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ariaLabel,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      whileHover={isDisabled || prefersReducedMotion ? undefined : { y: -1 }}
      whileTap={isDisabled || prefersReducedMotion ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.14, ease: MOTION_EASE }}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </motion.button>
  );
}

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function AnimatedDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  icon,
  disabled = false,
  className = '',
  align = 'left',
}: {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  align?: 'left' | 'right';
}) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlighted(idx >= 0 ? idx : 0);

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((prev) => nextCommandIndex(prev, options.length, 'down'));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((prev) => nextCommandIndex(prev, options.length, 'up'));
      } else if (e.key === 'Enter') {
        const chosen = options[highlighted];
        if (chosen) {
          e.preventDefault();
          onChange(chosen.value);
          setOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, options, value, highlighted, onChange]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] disabled:opacity-50 cursor-pointer transition-colors"
      >
        <span className="inline-flex items-center gap-2 min-w-0 truncate">
          {icon}
          <span className="truncate">{selected?.label ?? value}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel}
            initial={prefersReducedMotion ? false : POPOVER_TRANSITION.initial}
            animate={POPOVER_TRANSITION.animate}
            exit={prefersReducedMotion ? undefined : POPOVER_TRANSITION.exit}
            transition={POPOVER_TRANSITION.transition}
            className={`absolute top-full z-40 mt-1.5 min-w-[200px] max-w-[280px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1.5 shadow-[0_18px_36px_-12px_rgba(15,23,42,0.3)] ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlighted;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#7047EB]/12 text-[#7047EB] dark:text-[#C4B5FD] font-semibold'
                      : isHighlighted
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{opt.label}</div>
                    {opt.hint && (
                      <div className="truncate text-[10.5px] text-[var(--text-muted)]">
                        {opt.hint}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  layoutGroupId,
  variant = 'indigo',
  className = '',
}: {
  tabs: readonly { id: T; label: string; icon?: ReactNode }[];
  activeId: T;
  onChange: (id: T) => void;
  layoutGroupId: string;
  variant?: 'indigo' | 'light';
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-1 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
              active
                ? variant === 'indigo'
                  ? 'text-[var(--accent-on-pill)]'
                  : 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutGroupId}
                transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                className={`absolute inset-0 rounded-lg ${
                  variant === 'indigo'
                    ? '[background-image:linear-gradient(90deg,var(--accent-pill-start),var(--accent-pill-end))] shadow-[0_6px_14px_-4px_var(--focus-ring)]'
                    : 'bg-[var(--bg-surface)] shadow-2xs'
                }`}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {tab.icon}
              <span>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TOAST_STYLES: Record<ToastTone, { box: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: {
    box: 'border-emerald-200 dark:border-emerald-800/70 bg-[var(--bg-surface)] text-[var(--text-primary)]',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  info: {
    box: 'border-[#7047EB]/35 bg-[var(--bg-surface)] text-[var(--text-primary)]',
    icon: Info,
    iconColor: 'text-[#7047EB] dark:text-[#8B6BFF]',
  },
  warning: {
    box: 'border-amber-200 dark:border-amber-800/70 bg-[var(--bg-surface)] text-[var(--text-primary)]',
    icon: AlertCircle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    box: 'border-rose-200 dark:border-rose-800/70 bg-[var(--bg-surface)] text-[var(--text-primary)]',
    icon: AlertCircle,
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
};

export function ToastViewport() {
  const prefersReducedMotion = useReducedMotion();
  const { toasts, dismissToast } = useToastStore();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 bottom-20 z-50 flex w-full max-w-sm flex-col gap-2 sm:right-6 lg:bottom-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const st = TOAST_STYLES[toast.tone];
          const Icon = st.icon;
          return (
            <motion.div
              key={toast.id}
              layout={!prefersReducedMotion}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: MOTION_EASE }}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border p-3.5 shadow-[0_18px_38px_-14px_rgba(15,23,42,0.32)] ${st.box}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${st.iconColor}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-semibold text-[var(--text-primary)]">{toast.title}</div>
                {toast.detail && (
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                    {toast.detail}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
