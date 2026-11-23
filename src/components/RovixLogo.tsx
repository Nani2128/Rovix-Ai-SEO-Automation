import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface RovixLogoProps {
  showWordmark?: boolean;
  className?: string;
}

export function RovixLogo({ showWordmark = true, className = '' }: RovixLogoProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradId = useId();

  return (
    <motion.span
      initial={prefersReducedMotion ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${className}`}
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8B6BFF" />
            <stop offset="55%" stopColor="#7047EB" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <path
          d="M5 6.5C5 5.12 6.12 4 7.5 4H18.2C23.06 4 26.5 6.95 26.5 11.2C26.5 14.3 24.45 16.75 21.1 17.7L26.2 25.4C27.05 26.68 26.13 28.4 24.59 28.4H21.2C20.38 28.4 19.62 27.99 19.16 27.31L13.9 19.35H10.5V26.2C10.5 27.42 9.52 28.4 8.3 28.4H7.5C6.12 28.4 5 27.28 5 25.9V6.5ZM10.5 9.2V14.4H17.6C19.65 14.4 20.95 13.3 20.95 11.8C20.95 10.3 19.65 9.2 17.6 9.2H10.5Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M5 14.5H12.8L10.4 18.8H5V14.5Z"
          fill="#22D3EE"
          fillOpacity="0.48"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-[19px] font-bold tracking-tight text-[var(--text-primary)]">
          Rovix <span className="text-[#7047EB] dark:text-[#8B6BFF]">AI</span>
        </span>
      )}
    </motion.span>
  );
}
