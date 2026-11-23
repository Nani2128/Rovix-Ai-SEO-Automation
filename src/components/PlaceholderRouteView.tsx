import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Compass, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type { AppRoute } from '../types/navigation';
import { CTAButton } from './CTAButton';

interface PlaceholderRouteViewProps {
  route: Exclude<AppRoute, '/'>;
  onNavigate: (route: AppRoute, sectionId?: string) => void;
}

export function PlaceholderRouteView({
  route,
  onNavigate,
}: PlaceholderRouteViewProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <main className="mx-auto max-w-[1040px] px-5 py-14 sm:px-8 sm:py-20">
      <button
        type="button"
        onClick={() => onNavigate('/')}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to Rovix AI Home</span>
      </button>

      <motion.div
        key={route}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-10 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.12)]"
      >
        {route === '/onboarding' && (
          <div>
            <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              Workspace Provisioning
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Launch Your Tenant SEO Workspace
            </h1>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
              Create your tenant workspace to verify domain ownership, run live
              HTTP and headless Chromium crawls, connect Google Search Console &amp;
              GA4 via OAuth, and manage engineering fixes with full audit trails.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  step: 'Step 1',
                  title: 'Create Tenant Account',
                  detail: 'Register with scrypt password hashing and HttpOnly session cookies.',
                },
                {
                  step: 'Step 2',
                  title: 'Add Domain & Crawl',
                  detail: 'Verify domain ownership and launch a live SSE-streamed technical audit.',
                },
                {
                  step: 'Step 3',
                  title: 'Connect Google OAuth',
                  detail: 'Authorize GSC & GA4 properties and sync real search metrics.',
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4"
                >
                  <div className="font-mono text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF]">
                    {s.step}
                  </div>
                  <h2 className="mt-1 font-display text-base font-bold text-[var(--text-primary)]">
                    {s.title}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    {s.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CTAButton
                variant="primary"
                size="lg"
                onClick={() => onNavigate('/signin')}
              >
                <span>Create Workspace Account</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CTAButton>
              <CTAButton
                variant="secondary"
                size="lg"
                onClick={() => onNavigate('/', 'platform-explorer')}
              >
                <Compass className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
                <span>Inspect 3D Architecture</span>
              </CTAButton>
            </div>
          </div>
        )}

        {route === '/signin' && (
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>Workspace Authentication</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Sign In or Create Workspace
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
              Access your multi-tenant Rovix AI dashboard on the dedicated login screen.
            </p>
          </div>
        )}

        {route === '/pricing' && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
                  Workspace Tiers
                </p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                  Tenant Capacity &amp; Feature Access
                </h1>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Self-serve billing checkout not yet active</span>
              </span>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              {[
                {
                  name: 'Starter',
                  quota: 'Up to 3 Domain Projects',
                  desc: 'Technical HTTP crawls, PageSpeed checks, and CSV/JSON exports.',
                },
                {
                  name: 'Growth',
                  quota: 'Multi-Domain + Google OAuth',
                  desc: 'Full GSC & GA4 OAuth sync, headless Chromium rendering, and RBAC approvals.',
                  featured: true,
                },
                {
                  name: 'Enterprise',
                  quota: 'Dedicated Tenant Governance',
                  desc: 'Custom crawl limits, WAL backup snapshots, and strict production isolation.',
                },
              ].map((tier) => (
                <div
                  key={tier.name}
                  className={`flex flex-col justify-between rounded-2xl border p-6 ${
                    tier.featured
                      ? 'border-[#7047EB]/50 bg-[#7047EB]/6'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div>
                    <div className="font-display text-lg font-bold text-[var(--text-primary)]">
                      {tier.name}
                    </div>
                    <div className="mt-2 font-mono text-sm font-semibold text-[#7047EB] dark:text-[#8B6BFF]">
                      {tier.quota}
                    </div>
                    <p className="mt-3 text-sm text-[var(--text-muted)]">{tier.desc}</p>
                  </div>
                  <div className="mt-6">
                    <CTAButton
                      variant={tier.featured ? 'primary' : 'secondary'}
                      className="w-full"
                      onClick={() => onNavigate('/signin')}
                    >
                      <span>Provision Workspace</span>
                    </CTAButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {route === '/resources' && (
          <div>
            <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              Platform Architecture Reference
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Technical Documentation &amp; Setup Guides
            </h1>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-[var(--text-muted)]">
              Operational documentation covering SSRF-safe crawling, Google OAuth
              connector configuration, and role-based issue reverification.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  title: 'Technical Crawler & Issue Rule Engine',
                  meta: 'Core Module · Active',
                  summary:
                    'Supports HTTP fetch and headless Chromium rendering, canonical/noindex checks, redirect chains, broken link detection, and diff comparison.',
                },
                {
                  title: 'Google Search Console & GA4 OAuth Setup',
                  meta: 'Connector Guide · Active',
                  summary:
                    'Configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and INTEGRATION_ENCRYPTION_KEY to authorize encrypted read-only sync.',
                },
              ].map((doc) => (
                <div
                  key={doc.title}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-5"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-[#7047EB] dark:text-[#8B6BFF]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{doc.meta}</span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold text-[var(--text-primary)]">
                    {doc.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                    {doc.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </main>
  );
}
