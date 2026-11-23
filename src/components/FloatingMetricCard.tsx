import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface FloatingMetricCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  delay?: number;
  className?: string;
}

export function FloatingMetricCard({
  icon,
  title,
  subtitle,
  delay = 0.55,
  className = '',
}: FloatingMetricCardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.55,
        delay: prefersReducedMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.025 }}
      className={`rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 py-3.5 shadow-[0_18px_36px_-12px_rgba(112,71,235,0.20)] transition-shadow duration-200 hover:shadow-[0_22px_42px_-12px_rgba(112,71,235,0.28)] ${className}`}
    >
      <div className="flex flex-col items-center text-center gap-1.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF]">
          {icon}
        </div>
        <span className="font-display text-[13.5px] font-semibold text-[var(--text-primary)] whitespace-nowrap">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
            {subtitle}
          </span>
        )}
      </div>
    </motion.div>
  );
}
