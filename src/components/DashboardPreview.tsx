import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  Activity,
  CheckCircle2,
  Database,
  Globe2,
  Lock,
  ScanSearch,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { FloatingMetricCard } from './FloatingMetricCard';

export function DashboardPreview() {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { stiffness: 120, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 120, damping: 20 });

  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-8, 2]);
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [5, -3]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(normX);
    mouseY.set(normY);
  };

  const handlePointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative mx-auto w-full max-w-[590px] pt-4 pb-10 sm:pb-12"
      style={{ perspective: 1300 }}
    >
      {/* Floating Top-Right Security/Integrity Badge */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: -14, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: prefersReducedMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -top-2 right-2 sm:-right-3 z-20 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-[0_18px_36px_-10px_rgba(13,148,136,0.22)]"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0D9488]/12 text-[#0D9488] dark:text-[#2DD4BF]">
            <ShieldCheck className="h-4 w-4 stroke-[2.2]" />
          </span>
          <div>
            <div className="font-display text-xs sm:text-sm font-bold leading-none text-[var(--text-primary)]">
              Zero Fake Data
            </div>
            <div className="mt-0.5 text-[10.5px] sm:text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap">
              Real crawls &amp; OAuth telemetry
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main 3D Perspective Workspace Architecture Preview */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 28, rotateX: 8, rotateY: -10 }}
        animate={
          prefersReducedMotion
            ? { opacity: 1, y: 0 }
            : {
                opacity: 1,
                y: [0, -6, 0],
              }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.35 }
            : {
                opacity: { duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] },
                y: {
                  duration: 6,
                  repeat: Infinity,
                  repeatType: 'mirror',
                  ease: 'easeInOut',
                  delay: 0.9,
                },
              }
        }
        style={
          prefersReducedMotion
            ? undefined
            : {
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }
        }
        className="relative z-10 rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]/98 p-4 sm:p-5 shadow-[var(--shadow-elevated)]"
        data-testid="dashboard-preview-card"
      >
        {/* Browser Chrome Top Row */}
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3 pr-44 sm:pr-48">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
            </div>
            <span className="truncate text-[11px] font-medium text-[var(--text-muted)] tracking-tight">
              Architecture Preview (Connect project after sign-in)
            </span>
          </div>
        </div>

        {/* Core Modules Status Matrix */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Crawler Engine</span>
              <ScanSearch className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-xs font-semibold text-[#0D9488] dark:text-[#2DD4BF]">
              HTTP + Chromium
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              SSRF-guarded SSE stream
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Google OAuth</span>
              <Globe2 className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
              GSC &amp; GA4 API
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              AES-256-GCM token vault
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Fix Verification</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0891B2] dark:text-[#22D3EE]" aria-hidden="true" />
            </div>
            <div className="mt-2 font-mono text-xs font-semibold text-[#0891B2] dark:text-[#22D3EE]">
              Dual Signoff
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Live URL re-crawl check
            </div>
          </div>
        </div>

        {/* Pipeline Execution Blueprint */}
        <div className="mt-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                End-to-End SEO Data Pipeline
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Every workspace metric traces directly to SQLite crawl runs or synced Google connectors
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#7047EB] dark:text-[#8B6BFF]">
              Tenant Isolated
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {[
              {
                step: '01',
                label: 'Domain Ownership Verification & Crawl Policy',
                detail: 'DNS TXT / HTML Meta / Domain approval gate',
                color: 'bg-[#7047EB]',
              },
              {
                step: '02',
                label: 'Live Technical Crawl & PageSpeed Core Web Vitals',
                detail: 'Status codes, canonicals, schema, LCP/CLS/INP',
                color: 'bg-[#2563EB]',
              },
              {
                step: '03',
                label: 'Google Search Console & GA4 Organic Sync',
                detail: 'Clicks, impressions, queries & organic sessions',
                color: 'bg-[#0891B2]',
              },
              {
                step: '04',
                label: 'Ticket Dispatch, Dual Approval & Reverification',
                detail: 'Developer + Lead signoff before re-crawl confirmation',
                color: 'bg-[#0D9488]',
              },
            ].map((row) => (
              <div
                key={row.step}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[10.5px] font-bold text-white ${row.color}`}
                  >
                    {row.step}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {row.label}
                    </div>
                    <div className="truncate text-[10.5px] text-[var(--text-muted)]">
                      {row.detail}
                    </div>
                  </div>
                </div>
                <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Overlapping Floating Action Tiles */}
      <div className="relative z-20 -mt-6 grid grid-cols-3 gap-2.5 sm:gap-3.5 px-2 sm:px-6">
        <FloatingMetricCard
          icon={<Zap className="h-4 w-4" />}
          title="Crawl"
          subtitle="Live SSE Engine"
          delay={0.55}
        />
        <FloatingMetricCard
          icon={<Database className="h-4 w-4" />}
          title="Verify"
          subtitle="SQLite WAL Audit"
          delay={0.68}
        />
        <FloatingMetricCard
          icon={<Activity className="h-4 w-4" />}
          title="Connect"
          subtitle="GSC + GA4 + PSI"
          delay={0.8}
        />
      </div>
    </div>
  );
}
