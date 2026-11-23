import { useReducedMotion } from 'motion/react';

export function AnimatedBackground() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      <div
        className="absolute inset-0 opacity-[0.42] dark:opacity-[0.28]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(112, 71, 235, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(37, 99, 235, 0.05) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 50% 25%, #000 35%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 25%, #000 35%, transparent 100%)',
        }}
      />

      <div
        className={`absolute -top-28 -left-24 h-[520px] w-[520px] rounded-full ${
          prefersReducedMotion ? '' : 'animate-orb-slow'
        }`}
        style={{
          background:
            'radial-gradient(circle at center, rgba(112, 71, 235, 0.16) 0%, rgba(37, 99, 235, 0.05) 45%, transparent 72%)',
        }}
      />
      <div
        className={`absolute top-8 -right-24 h-[640px] w-[640px] rounded-full ${
          prefersReducedMotion ? '' : 'animate-orb-reverse'
        }`}
        style={{
          background:
            'radial-gradient(circle at center, rgba(37, 99, 235, 0.14) 0%, rgba(8, 145, 178, 0.08) 45%, transparent 72%)',
        }}
      />

      <svg
        className="absolute bottom-0 left-0 w-full h-[180px] sm:h-[220px] lg:h-[240px]"
        viewBox="0 0 1440 240"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hero-wave-back" x1="0" y1="0" x2="1440" y2="240" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7047EB" stopOpacity="0.10" />
            <stop offset="55%" stopColor="#2563EB" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#0891B2" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="hero-wave-front" x1="200" y1="40" x2="1440" y2="240" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7047EB" stopOpacity="0.06" />
            <stop offset="65%" stopColor="#2563EB" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0D9488" stopOpacity="0.10" />
          </linearGradient>
        </defs>
        <path
          d="M0 155C260 198 510 112 790 132C1070 152 1245 78 1440 24V240H0V155Z"
          fill="url(#hero-wave-back)"
        />
        <path
          d="M0 192C310 218 595 162 885 178C1145 192 1300 132 1440 94V240H0V192Z"
          fill="url(#hero-wave-front)"
        />
        <path
          d="M0 228C420 228 960 228 1440 228V240H0V228Z"
          fill="var(--bg-surface)"
        />
      </svg>
    </div>
  );
}
