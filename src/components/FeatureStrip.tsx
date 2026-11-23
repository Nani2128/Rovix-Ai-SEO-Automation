import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, useReducedMotion } from 'motion/react';
import {
  CheckSquare,
  Gauge,
  Globe2,
  ScanSearch,
  TrendingUp,
} from 'lucide-react';
import type { SeoPillarId } from '../types/navigation';
import { SEO_PILLARS } from '../utils/seoPreviewLogic';

gsap.registerPlugin(ScrollTrigger);

interface FeatureStripProps {
  activePillar: SeoPillarId;
  onSelectPillar: (id: SeoPillarId) => void;
}

const PILLAR_ICONS: Record<SeoPillarId, typeof ScanSearch> = {
  'technical-seo': ScanSearch,
  'keyword-intelligence': Globe2,
  'ai-content': Gauge,
  'geo-visibility': CheckSquare,
  'analytics-roi': TrendingUp,
};

const REAL_PILLAR_COPY: Record<SeoPillarId, { title: string; shortDesc: string }> = {
  'technical-seo': {
    title: 'Technical Crawl Engine',
    shortDesc:
      'Discover URLs via sitemaps and internal links with HTTP and headless Chromium inspection.',
  },
  'keyword-intelligence': {
    title: 'Search Console Sync',
    shortDesc:
      'Pull real query clicks, impressions, CTR, and average position from connected GSC properties.',
  },
  'ai-content': {
    title: 'PageSpeed Diagnostics',
    shortDesc:
      'Measure live Lighthouse Performance, SEO, LCP, CLS, and TTFB metrics via PageSpeed v5.',
  },
  'geo-visibility': {
    title: 'Fix Reverification',
    shortDesc:
      'Dispatch developer tickets, require dual RBAC approvals, and re-crawl target URLs to verify.',
  },
  'analytics-roi': {
    title: 'GA4 Organic Attribution',
    shortDesc:
      'Sync Google Analytics 4 organic search sessions, active users, and landing page key events.',
  },
};

export function FeatureStrip({
  activePillar,
  onSelectPillar,
}: FeatureStripProps) {
  const prefersReducedMotion = useReducedMotion();
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion || !stripRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('.feature-strip-card');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: stripRef.current,
            start: 'top 88%',
            once: true,
          },
        },
      );
    }, stripRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      id="features"
      aria-labelledby="features-strip-heading"
      className="relative z-20 bg-[var(--bg-surface)] py-12 sm:py-16 border-b border-[var(--border-hairline)]"
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              Shipped Platform Capabilities
            </p>
            <h2
              id="features-strip-heading"
              className="mt-1.5 font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[var(--text-primary)] text-balance"
            >
              Five connected engines grounded in real domain evidence
            </h2>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Select any module to inspect its spatial workflow below.
          </p>
        </div>

        <div
          ref={stripRef}
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5"
        >
          {SEO_PILLARS.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.id];
            const isSelected = activePillar === pillar.id;
            const copy = REAL_PILLAR_COPY[pillar.id];

            return (
              <motion.button
                key={pillar.id}
                type="button"
                onClick={() => {
                  onSelectPillar(pillar.id);
                  const explorer = document.getElementById('platform-explorer');
                  if (explorer) {
                    explorer.scrollIntoView({
                      behavior: prefersReducedMotion ? 'auto' : 'smooth',
                      block: 'start',
                    });
                  }
                }}
                whileHover={prefersReducedMotion ? undefined : { y: -3 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className={`feature-strip-card group flex flex-col items-start rounded-2xl border p-5 text-left cursor-pointer transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
                  isSelected
                    ? 'border-[#7047EB]/50 bg-[#7047EB]/8 shadow-[0_14px_28px_-14px_rgba(112,71,235,0.28)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[#7047EB]/35 hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150 ${
                    isSelected
                      ? 'bg-[#7047EB] text-white'
                      : 'bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF] group-hover:bg-[#7047EB] group-hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>

                <h3 className="mt-4 font-display text-[15.5px] font-semibold text-[var(--text-primary)]">
                  {copy.title}
                </h3>

                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {copy.shortDesc}
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
