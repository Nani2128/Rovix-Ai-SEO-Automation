import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Blocks, Cable, Shield } from 'lucide-react';
import { MODULE_METADATA } from '../../config/navigation';
import { useAuthStore } from '../../stores/useAuthStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { StatusBadge } from '../../components/ui/StateViews';

const PROVIDER_REQUIREMENTS: Record<
  string,
  { providerLabel: string; detail: string }
> = {
  '/competitors': {
    providerLabel: 'SERP & Competitive Intelligence Provider Required',
    detail:
      'Competitor share-of-voice and domain gap tables require an external SERP/domain authority API connector. Rovix AI never displays simulated competitor numbers.',
  },
  '/content': {
    providerLabel: 'CMS & Editorial Provider Connector Required',
    detail:
      'Content brief publishing and editorial scoring connect to external CMS workspaces or LLM editorial keys when configured. Until connected, no fabricated content metrics are generated.',
  },
  '/backlinks': {
    providerLabel: 'Backlink Index Provider Required',
    detail:
      'Referring domain counts, anchor distributions, and link velocity require an external backlink index provider key. Unverified or synthetic backlink data is strictly disabled.',
  },
  '/local-seo': {
    providerLabel: 'Google Business Profile Connector Required',
    detail:
      'Location pack tracking and NAP listing checks require Google Business Profile API authorization.',
  },
  '/geo-visibility': {
    providerLabel: 'AI Answer-Engine Monitoring Provider Required',
    detail:
      'Citation recall across generative answer engines requires active external answer-engine sampling credentials.',
  },
};

export function ModulePlaceholderPage() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const meta = MODULE_METADATA[location.pathname] ?? {
    title: 'External Intelligence Module',
    subtitle: 'External data provider connection required',
    phaseTarget: 'Connector Pending',
    description:
      'This module displays live metrics exclusively once its upstream external data provider is connected.',
  };

  const req = PROVIDER_REQUIREMENTS[location.pathname] ?? {
    providerLabel: 'External Data Provider Required',
    detail: meta.description,
  };

  return (
    <PageTransition className="mx-auto max-w-[1160px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Main Dashboard</span>
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              {meta.title}
            </h1>
            <StatusBadge label="Provider Not Connected" tone="neutral" />
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{meta.subtitle}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)]">
          <Shield className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
          <span>Active role: {user?.role}</span>
        </div>
      </div>

      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7047EB]/10 text-[#7047EB] dark:text-[#A78BFA]">
            <Cable className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1 space-y-3">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {req.providerLabel}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              {req.detail}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to="/integrations"
                className="inline-flex items-center gap-2 rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E35DA] transition-colors"
              >
                <Blocks className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Manage Workspace Integrations</span>
              </Link>
              <Link
                to="/audit"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/40 transition-colors"
              >
                <span>Open Technical SEO Audit</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
