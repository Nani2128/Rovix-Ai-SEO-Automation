import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  Database,
  Globe2,
  Lock,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';

export function LoginVisualPanel() {
  const prefersReducedMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!isDesktop) return null;

  return (
    <div
      aria-hidden="true"
      className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#F3F1FF] via-[#E9F0FF] to-[#E6F8F5] dark:from-[#0B111E] dark:via-[#101827] dark:to-[#0C1D24] p-10 xl:p-14 border-l border-[var(--border-hairline)]"
    >
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-[460px] w-[460px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(112,71,235,0.24) 0%, rgba(37,99,235,0.08) 55%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(13,148,136,0.18) 0%, rgba(112,71,235,0.08) 50%, transparent 75%)',
        }}
      />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: MOTION_EASE }}
        className="relative z-10"
      >
        <span className="font-display text-xs font-semibold tracking-[0.14em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
          Rovix Intelligence Workspace
        </span>
        <h2 className="mt-2 max-w-md font-display text-2xl xl:text-[28px] font-bold leading-snug tracking-tight text-[var(--text-primary)]">
          Verified technical audits, real Google OAuth data, and RBAC remediation.
        </h2>
      </motion.div>

      <div className="relative z-10 my-auto py-8" style={{ perspective: 1200 }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, x: 20, y: -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: MOTION_EASE }}
          className="ml-auto mb-3 w-fit rounded-2xl rovix-glass-surface px-4 py-2.5 shadow-[var(--shadow-elevated)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0D9488]/12 text-[#0D9488] dark:text-[#2DD4BF]">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <div className="font-display text-xs font-bold text-[var(--text-primary)]">
                AES-256-GCM Vault
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Encrypted OAuth token storage
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24, rotateY: -6 }}
          animate={
            prefersReducedMotion
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: [0, -6, 0], rotateY: -3 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.3 }
              : {
                  opacity: { duration: 0.65, delay: 0.15, ease: MOTION_EASE },
                  y: { duration: 6, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
                }
          }
          className="rounded-[24px] rovix-glass-surface p-6 shadow-[var(--shadow-elevated)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#7047EB]" />
              <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Tenant Architecture Checklist
              </span>
            </div>
            <span className="font-mono text-xs font-medium text-[#0D9488] dark:text-[#2DD4BF]">
              Zero Mock Telemetry
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {[
              {
                icon: ScanSearch,
                color: 'text-[#7047EB] dark:text-[#8B6BFF] bg-[#7047EB]/12',
                title: '1. SSRF-Guarded Technical Crawler',
                desc: 'Verify domain ownership, crawl URLs via HTTP or Chromium, and persist snapshots.',
              },
              {
                icon: Globe2,
                color: 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/12',
                title: '2. Google Search Console & GA4 OAuth',
                desc: 'Authorize properties and sync genuine clicks, impressions, and organic sessions.',
              },
              {
                icon: Database,
                color: 'text-[#0891B2] dark:text-[#22D3EE] bg-[#0891B2]/12',
                title: '3. SQLite WAL Multi-Tenant Persistence',
                desc: 'Every project, crawl, issue, and ticket is isolated cleanly per tenant workspace.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-display text-xs font-bold text-[var(--text-primary)]">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
                      {item.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, x: -16, y: 12 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: MOTION_EASE }}
          className="mt-4 w-fit rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 py-2.5 shadow-[0_16px_32px_-12px_rgba(15,23,42,0.16)]"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
            <CheckCircle2 className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
            <span>10-role RBAC enforcement &amp; dual-approval fix verification</span>
          </div>
        </motion.div>
      </div>

      <div className="relative z-10 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF]" />
        <span>Server-verified HttpOnly sessions &amp; Origin CSRF protection</span>
      </div>
    </div>
  );
}
