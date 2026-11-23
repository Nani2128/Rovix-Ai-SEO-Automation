import type { ElementType, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { fadeInUp } from '../../lib/motion';

export interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  interactive?: boolean;
  animate?: boolean;
  as?: 'div' | 'section' | 'article';
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export function GlassPanel({
  children,
  className = '',
  elevated = false,
  interactive = false,
  animate = false,
  as = 'div',
  ariaLabel,
  ariaLabelledBy,
}: GlassPanelProps) {
  const prefersReducedMotion = useReducedMotion();

  const shadowClass = elevated
    ? 'shadow-[var(--shadow-elevated)]'
    : 'shadow-[var(--shadow-soft)]';
  const interactiveClass = interactive
    ? 'transition-all duration-150 hover:border-[var(--accent-primary)]/45 hover:shadow-[var(--shadow-elevated)]'
    : '';
  const baseClass = `rovix-glass-surface rounded-[22px] ${shadowClass} ${interactiveClass} ${className}`;

  if (animate && !prefersReducedMotion) {
    const MotionTag =
      as === 'section'
        ? motion.section
        : as === 'article'
          ? motion.article
          : motion.div;

    return (
      <MotionTag
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={baseClass}
      >
        {children}
      </MotionTag>
    );
  }

  const Tag = as as ElementType;
  return (
    <Tag
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={baseClass}
    >
      {children}
    </Tag>
  );
}
