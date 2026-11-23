import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface CTAButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}

export function CTAButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  className = '',
  ariaLabel,
}: CTAButtonProps) {
  const prefersReducedMotion = useReducedMotion();

  const sizeClasses =
    size === 'sm'
      ? 'px-4 py-2 text-sm min-h-[40px]'
      : size === 'lg'
        ? 'px-6 py-3.5 text-[15px] min-h-[46px]'
        : 'px-5 py-2.5 text-sm min-h-[42px]';

  const variantClasses =
    variant === 'primary'
      ? 'bg-gradient-to-r from-[#7047EB] to-[#2563EB] text-white shadow-[0_10px_24px_-6px_rgba(112,71,235,0.45)] hover:shadow-[0_14px_28px_-6px_rgba(112,71,235,0.58)]'
      : variant === 'secondary'
        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[0_4px_14px_rgba(15,23,42,0.06)] hover:border-[#7047EB]/45 hover:bg-[var(--bg-subtle)]'
        : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]';

  return (
    <motion.button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={prefersReducedMotion ? undefined : { y: -1.5, scale: 1.015 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </motion.button>
  );
}
