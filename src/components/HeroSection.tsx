import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Compass } from 'lucide-react';
import type { AppRoute } from '../types/navigation';
import { AnimatedBackground } from './AnimatedBackground';
import { CTAButton } from './CTAButton';
import { DashboardPreview } from './DashboardPreview';

interface HeroSectionProps {
  onNavigate: (route: AppRoute, sectionId?: string) => void;
}

export function HeroSection({ onNavigate }: HeroSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  const headingLines = [
    { text: 'Technical SEO &', highlight: false },
    { text: 'Verified Search ', highlight: false, suffix: 'Intelligence.' },
  ];

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-[var(--bg-surface)] pt-12 pb-20 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28"
    >
      <AnimatedBackground />

      <div className="relative z-10 mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 flex items-center gap-2.5"
          >
            <span
              className="h-[2px] w-7 rounded-full bg-gradient-to-r from-[#7047EB] via-[#2563EB] to-[#0891B2]"
              aria-hidden="true"
            />
            <span className="font-display text-xs font-semibold tracking-[0.14em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              SEO Intelligence &amp; Automation
            </span>
          </motion.div>

          <h1
            id="hero-heading"
            className="font-display text-[clamp(2.2rem,3.6vw,3.5rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--text-primary)]"
          >
            {headingLines.map((line, idx) => (
              <span key={line.text} className="block overflow-hidden">
                <motion.span
                  initial={prefersReducedMotion ? false : { opacity: 0, y: '100%' }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.6,
                    delay: prefersReducedMotion ? 0 : 0.14 + idx * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="block"
                >
                  {line.text}
                  {line.suffix && (
                    <span className="bg-gradient-to-r from-[#7047EB] via-[#2563EB] to-[#0891B2] bg-clip-text text-transparent sm:whitespace-nowrap">
                      {line.suffix}
                    </span>
                  )}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.55,
              delay: prefersReducedMotion ? 0 : 0.32,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="mt-5 max-w-[54ch] text-[16.5px] leading-[1.68] text-[var(--text-secondary)]"
          >
            Crawl verified domains with live HTTP &amp; headless Chromium
            rendering, connect Google Search Console &amp; GA4 via OAuth, run
            PageSpeed Core Web Vitals diagnostics, and ship engineering fixes
            with dual-approval verification.
          </motion.p>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.55,
              delay: prefersReducedMotion ? 0 : 0.42,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="mt-8 flex flex-wrap items-center gap-3.5"
          >
            <CTAButton
              size="lg"
              variant="primary"
              onClick={() => onNavigate('/signin')}
            >
              <span>Create Workspace or Sign In</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CTAButton>

            <CTAButton
              size="lg"
              variant="secondary"
              onClick={() => onNavigate('/', 'platform-explorer')}
            >
              <Compass
                className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF]"
                aria-hidden="true"
              />
              <span>Explore Core Architecture</span>
            </CTAButton>
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.5,
              delay: prefersReducedMotion ? 0 : 0.55,
            }}
            className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--border-hairline)] pt-5 text-[13px] font-medium text-[var(--text-muted)]"
          >
            <span className="whitespace-nowrap text-[var(--text-secondary)]">
              SSRF-Protected Live Crawler
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap text-[var(--text-secondary)]">
              Google Search Console &amp; GA4 OAuth
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap text-[var(--text-secondary)]">
              Zero Fabricated Metrics
            </span>
          </motion.div>
        </div>

        <div className="lg:col-span-6">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
