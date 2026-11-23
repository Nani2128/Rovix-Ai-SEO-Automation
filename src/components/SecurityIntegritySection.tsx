import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';
import {
  Database,
  KeyRound,
  Lock,
  ScanSearch,
  ShieldCheck,
  Users,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const INTEGRITY_PILLARS = [
  {
    icon: Lock,
    accent: 'text-[#7047EB] dark:text-[#A78BFA] bg-[#7047EB]/12',
    title: 'AES-256-GCM Credential Vault',
    spec: 'Server-Side Token Encryption',
    detail:
      'Google Search Console and GA4 refresh tokens are encrypted at rest server-side and never exposed in client localStorage or URL payloads.',
  },
  {
    icon: ScanSearch,
    accent: 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/12',
    title: 'SSRF-Protected Live Crawler',
    spec: 'DNS + Ownership Verification Gate',
    detail:
      'Blocks private IPv4/IPv6 ranges and enforces domain ownership checks via DNS TXT or meta tags before dispatching any crawl worker.',
  },
  {
    icon: Users,
    accent: 'text-[#0D9488] dark:text-[#2DD4BF] bg-[#0D9488]/12',
    title: '10-Role RBAC & Dual Approvals',
    spec: 'Enforced on Every API Route',
    detail:
      'Separates Platform Admins, Owners, Strategists, Developers, and QA with mandatory re-crawl evidence before marking fixes verified.',
  },
  {
    icon: Database,
    accent: 'text-[#0891B2] dark:text-[#22D3EE] bg-[#0891B2]/12',
    title: 'Strict 4-Field Data Provenance',
    spec: 'Zero Mock Telemetry Guarantee',
    detail:
      'Every metric exposes its exact source, collection timestamp, reporting period, and measured/estimated/unavailable provenance tag.',
  },
] as const;

export function SecurityIntegritySection() {
  const prefersReducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion || !gridRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('.integrity-card');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.08,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: gridRef.current,
            start: 'top 85%',
            once: true,
          },
        },
      );
    }, gridRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      id="security-integrity"
      aria-labelledby="security-integrity-heading"
      className="relative overflow-hidden border-t border-[var(--border-hairline)] bg-[#101827] py-20 sm:py-24 text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-1/4 h-[340px] w-[340px] rounded-full opacity-35"
        style={{
          background:
            'radial-gradient(circle, rgba(112,71,235,0.45) 0%, rgba(37,99,235,0.12) 55%, transparent 75%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/4 h-[320px] w-[320px] rounded-full opacity-30"
        style={{
          background:
            'radial-gradient(circle, rgba(13,148,136,0.4) 0%, rgba(8,145,178,0.1) 55%, transparent 75%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 font-display text-xs font-semibold tracking-[0.14em] text-[#2DD4BF] uppercase">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Enterprise Security &amp; Real-Data Architecture</span>
            </div>
            <h2
              id="security-integrity-heading"
              className="mt-2 font-display text-3xl sm:text-[34px] font-bold leading-tight tracking-tight text-white text-balance"
            >
              Built on auditable storage, encrypted OAuth, and honest measurement
            </h2>
          </div>

          <div className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-700/80 bg-slate-900/70 px-3.5 py-2 text-xs text-slate-300 md:self-auto">
            <KeyRound className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
            <span>HttpOnly HMAC Sessions · SQLite WAL Isolation</span>
          </div>
        </div>

        <div
          ref={gridRef}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {INTEGRITY_PILLARS.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="integrity-card flex flex-col justify-between rounded-[20px] border border-slate-800 bg-slate-900/75 p-5 shadow-[0_18px_36px_-18px_rgba(0,0,0,0.65)] transition-colors hover:border-[#7047EB]/60"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.accent}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[10.5px] font-medium text-slate-400">
                      {item.spec}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
                    {item.detail}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
