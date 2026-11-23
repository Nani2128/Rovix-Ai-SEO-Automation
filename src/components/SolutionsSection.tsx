import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { AppRoute } from '../types/navigation';
import { CTAButton } from './CTAButton';

gsap.registerPlugin(ScrollTrigger);

interface SolutionsSectionProps {
  onNavigate: (route: AppRoute, sectionId?: string) => void;
}

const WORKFLOW_OUTCOMES = [
  {
    index: '01.',
    title: 'Real-Time Website Crawling & Rule Engine',
    summary:
      'Execute sitemap discovery, internal link BFS, canonical/noindex validation, redirect chain detection, and optional Chromium DOM rendering on verified domains.',
    capability: 'SSRF-Protected Live SSE Stream',
  },
  {
    index: '02.',
    title: 'Encrypted Google Search Console & GA4 OAuth',
    summary:
      'Connect your verified Google properties server-side with AES-256-GCM encrypted token storage, automatic refresh rotation, and deduplicated sync jobs.',
    capability: 'Direct Search Analytics & Organic Data',
  },
  {
    index: '03.',
    title: 'Dual-Approval Engineering Remediation',
    summary:
      'Convert detected technical issues into engineering tickets, enforce Developer + Lead approval gates, and re-crawl live URLs before marking any issue fixed.',
    capability: 'Audit Trail + Live URL Reverification',
  },
];

export function SolutionsSection({ onNavigate }: SolutionsSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray<HTMLElement>('.solution-row');
      gsap.fromTo(
        rows,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.12,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 84%',
            once: true,
          },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      id="solutions"
      ref={sectionRef}
      aria-labelledby="solutions-heading"
      className="bg-[var(--bg-surface)] py-20 sm:py-24"
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              Verified Engineering Workflows
            </p>
            <h2
              id="solutions-heading"
              className="mt-2 font-display text-3xl sm:text-[36px] font-bold leading-[1.15] tracking-tight text-[var(--text-primary)] text-balance"
            >
              Built for teams who demand evidence over guesswork
            </h2>
            <p className="mt-4 text-[15.5px] leading-[1.65] text-[var(--text-secondary)]">
              Rovix AI connects technical crawling, Google OAuth telemetry, and
              role-gated remediation into a single auditable system.
            </p>
            <div className="mt-8">
              <CTAButton
                size="lg"
                variant="primary"
                onClick={() => onNavigate('/signin')}
              >
                <span>Open Workspace</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CTAButton>
            </div>
          </div>

          <div className="lg:col-span-7 divide-y divide-[var(--border-hairline)] border-y border-[var(--border-hairline)]">
            {WORKFLOW_OUTCOMES.map((item) => (
              <article
                key={item.index}
                className="solution-row py-7 sm:py-8 first:pt-6 last:pb-6"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                    <span className="mr-2.5 font-mono text-base font-semibold text-[#7047EB] dark:text-[#8B6BFF] tabular-nums">
                      {item.index}
                    </span>
                    {item.title}
                  </h3>
                  <span className="font-mono text-xs font-medium text-[#0D9488] dark:text-[#2DD4BF]">
                    {item.capability}
                  </span>
                </div>
                <p className="mt-2.5 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-muted)]">
                  {item.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
