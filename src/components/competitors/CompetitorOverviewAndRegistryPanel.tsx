import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  Eye,
  FileSearch,
  Globe,
  History,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type {
  CompetitorCategory,
  CompetitorProfileRecord,
  CompetitorWorkspaceResponse,
} from '../../types/competitors';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const PROVIDER_TONE: Record<string, BadgeTone> = {
  available: 'success',
  connected: 'success',
  credentials_required: 'warning',
  blocked: 'danger',
  error: 'danger',
  unavailable: 'neutral',
};

const APPROVAL_TONE: Record<string, BadgeTone> = {
  approved: 'success',
  pending_owner_approval: 'warning',
  rejected: 'danger',
  archived: 'neutral',
};

const CATEGORY_LABEL: Record<CompetitorCategory, string> = {
  direct: 'Direct Rival',
  indirect: 'Indirect Peer',
  serp_peer: 'SERP Peer',
  local: 'Local Competitor',
};

export function CompetitorOverviewAndRegistryPanel({
  workspace,
  canApprove,
  canManage,
  savingCompetitor,
  analyzingCompetitorId,
  discovering,
  onSaveCompetitor,
  onDecideCompetitor,
  onDeleteCompetitor,
  onAnalyzeCompetitor,
  onDiscoverCompetitors,
  onInspectCompetitor,
}: {
  workspace: CompetitorWorkspaceResponse;
  canApprove: boolean;
  canManage: boolean;
  savingCompetitor: boolean;
  analyzingCompetitorId: string | null;
  discovering: boolean;
  onSaveCompetitor: (payload: {
    domainOrUrl: string;
    name?: string;
    category: CompetitorCategory;
    targetMarkets?: string[];
    notes?: string;
    approve: boolean;
  }) => Promise<void>;
  onDecideCompetitor: (
    competitorId: string,
    action: 'approve' | 'reject' | 'archive',
  ) => Promise<void>;
  onDeleteCompetitor: (competitorId: string) => Promise<void>;
  onAnalyzeCompetitor: (
    competitorId: string,
    urlsToAnalyze?: string[],
  ) => Promise<void>;
  onDiscoverCompetitors: (queries?: string[]) => Promise<void>;
  onInspectCompetitor: (competitor: CompetitorProfileRecord) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [domainInput, setDomainInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [category, setCategory] = useState<CompetitorCategory>('direct');
  const [marketsInput, setMarketsInput] = useState(
    workspace.projectBaseline.approvedGeoMarkets.slice(0, 3).join(', '),
  );
  const [notesInput, setNotesInput] = useState('');
  const [discoveryQueriesInput, setDiscoveryQueriesInput] = useState('');
  const [customAnalyzeUrls, setCustomAnalyzeUrls] = useState<Record<string, string>>({});
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  const handleSubmit = async (approve: boolean) => {
    if (!domainInput.trim()) return;
    await onSaveCompetitor({
      domainOrUrl: domainInput.trim(),
      name: nameInput.trim() || undefined,
      category,
      targetMarkets: marketsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      notes: notesInput.trim() || undefined,
      approve,
    });
    setDomainInput('');
    setNameInput('');
    setNotesInput('');
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <motion.div variants={prefersReducedMotion ? undefined : fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Approved Competitors
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.approvedCompetitors}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {workspace.summary.pendingApprovalCompetitors} pending approval
              </span>
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={prefersReducedMotion ? undefined : fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Analyzed Competitor Pages
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.analyzedPages}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Own crawl: {workspace.projectBaseline.crawledUrlsCount} URLs
              </span>
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={prefersReducedMotion ? undefined : fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Keyword Overlap Signals
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.sharedKeywords} shared
              </span>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                {workspace.summary.competitorGapKeywords} gap terms
              </span>
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={prefersReducedMotion ? undefined : fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Content Gap Opportunities
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.openContentGaps}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                {workspace.summary.approvedContentGaps} owner approved
              </span>
            </div>
          </GlassPanel>
        </motion.div>
      </motion.div>

      {/* Baseline & Evidence Readiness Banner + Provider Matrix */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Real-Evidence & Provider Readiness
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Competitor HTML snapshots are fetched live through our SSRF-guarded parser. Unconfigured external DA, backlink, and traffic APIs remain marked Unavailable (never estimated).
            </p>
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
            Baseline: {workspace.projectBaseline.crawledUrlsCount} crawled ·{' '}
            {workspace.projectBaseline.keywordsCount} keywords ·{' '}
            {workspace.projectBaseline.approvedGeoMarkets.length} markets
          </div>
        </div>

        {!workspace.projectBaseline.hasCompletedCrawl && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <span className="font-semibold">Own-Site Crawl Baseline Missing:</span>{' '}
              Run a Phase 3 Technical Crawl for <span className="font-mono">{workspace.projectWebsite}</span> so content gap scoring can compare competitor pages against your live URLs (gaps currently report Needs Evidence until your own site is crawled).
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspace.providerStatuses.map((p) => (
            <div
              key={p.provider}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/65 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {p.label}
                </span>
                <StatusBadge
                  label={p.state.replace(/_/g, ' ')}
                  tone={PROVIDER_TONE[p.state] ?? 'neutral'}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                {p.detail}
              </p>
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Add / Recommend Competitor + Profile / SERP Discovery */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <GlassPanel className="p-5 lg:col-span-7 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Add or Recommend Competitor Domain
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Strategists can recommend peer domains with evidence without overwriting owner-approved competitors. Owners/Admins can approve competitors directly.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="comp-domain-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Competitor Domain or URL
              </label>
              <input
                id="comp-domain-input"
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="e.g. semrush.com or https://moz.com"
                disabled={!canManage || savingCompetitor}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="comp-name-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Display Name (Optional)
              </label>
              <input
                id="comp-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Moz SEO Platform"
                disabled={!canManage || savingCompetitor}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="comp-category-select"
                className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Competitor Category
              </label>
              <select
                id="comp-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as CompetitorCategory)}
                disabled={!canManage || savingCompetitor}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              >
                <option value="direct">Direct Rival</option>
                <option value="indirect">Indirect Peer</option>
                <option value="serp_peer">SERP Peer</option>
                <option value="local">Local Competitor</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="comp-markets-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Target Markets (Comma Separated)
              </label>
              <input
                id="comp-markets-input"
                type="text"
                value={marketsInput}
                onChange={(e) => setMarketsInput(e.target.value)}
                placeholder="US, UK, Austin TX"
                disabled={!canManage || savingCompetitor}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="comp-notes-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Evidence / Rationale Note
            </label>
            <input
              id="comp-notes-input"
              type="text"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Why this domain competes for project topics or SERPs..."
              disabled={!canManage || savingCompetitor}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {canApprove && (
              <InteractiveButton
                variant="primary"
                size="md"
                loading={savingCompetitor}
                disabled={!canManage || !domainInput.trim()}
                onClick={() => void handleSubmit(true)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add & Approve Competitor</span>
              </InteractiveButton>
            )}
            <InteractiveButton
              variant={canApprove ? 'secondary' : 'primary'}
              size="md"
              loading={savingCompetitor}
              disabled={!canManage || !domainInput.trim()}
              onClick={() => void handleSubmit(false)}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save as Pending Recommendation</span>
            </InteractiveButton>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5 lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Competitor Discovery
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Imports competitor domains stored in your approved Phase 7 Keyword Business Profile, and queries external SERP organic rankings if <span className="font-mono">SERPAPI_API_KEY</span> is configured. Never fabricates domains.
          </p>

          <div>
            <label
              htmlFor="comp-discover-queries"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Discovery Seed Queries (Optional)
            </label>
            <input
              id="comp-discover-queries"
              type="text"
              value={discoveryQueriesInput}
              onChange={(e) => setDiscoveryQueriesInput(e.target.value)}
              placeholder="Leave blank to use approved services & top keywords"
              disabled={!canManage || discovering}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <InteractiveButton
            variant="secondary"
            size="md"
            loading={discovering}
            disabled={!canManage}
            onClick={() =>
              void onDiscoverCompetitors(
                discoveryQueriesInput
                  .split(',')
                  .map((q) => q.trim())
                  .filter(Boolean),
              )
            }
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Discover from Profile & SERP</span>
          </InteractiveButton>
        </GlassPanel>
      </div>

      {/* Competitor Registry Cards */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Competitor Registry & Live HTML Analysis
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Each competitor tracks discovery provenance, owner approval status, preserved approval history, and live HTML inspection runs.
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
            {workspace.competitors.length} registered
          </span>
        </div>

        {workspace.competitors.length === 0 ? (
          <EmptyStateCard
            title="No competitors registered yet"
            description="Add an approved competitor domain above or run Discovery from your Keyword Business Profile. No synthetic competitors are ever seeded."
          />
        ) : (
          <div className="space-y-3">
            {workspace.competitors.map((comp) => {
              const showHistory = Boolean(expandedHistoryIds[comp.id]);
              const isAnalyzing = analyzingCompetitorId === comp.id;

              return (
                <div
                  key={comp.id}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-4 space-y-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                          {comp.name}
                        </span>
                        <span className="font-mono text-xs text-[var(--accent-primary)]">
                          {comp.domain}
                        </span>
                        <StatusBadge
                          label={comp.approvalStatus.replace(/_/g, ' ')}
                          tone={APPROVAL_TONE[comp.approvalStatus] ?? 'neutral'}
                        />
                      </div>

                      <div className="text-xs text-[var(--text-muted)]">
                        {CATEGORY_LABEL[comp.category]} · Origin:{' '}
                        {comp.discoveryOrigin.replace(/_/g, ' ')} · Analyzed Pages:{' '}
                        <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                          {comp.analyzedPagesCount}
                        </span>
                        {comp.targetMarkets.length > 0 && (
                          <> · Markets: {comp.targetMarkets.join(', ')}</>
                        )}
                      </div>

                      {comp.discoveryEvidence && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          Evidence: {comp.discoveryEvidence}
                        </p>
                      )}

                      <div className="text-[11px] text-[var(--text-muted)]">
                        DA: Unavailable · Est. Traffic: Unavailable · Backlinks: Unavailable · Provenance:{' '}
                        {comp.provenance.source}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <InteractiveButton
                        variant="subtle"
                        size="sm"
                        loading={isAnalyzing}
                        disabled={!canManage}
                        onClick={() => {
                          const extraRaw = customAnalyzeUrls[comp.id] ?? '';
                          const extra = extraRaw
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          void onAnalyzeCompetitor(
                            comp.id,
                            extra.length > 0 ? extra : undefined,
                          );
                        }}
                      >
                        <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Analyze Live Pages</span>
                      </InteractiveButton>

                      <InteractiveButton
                        variant="secondary"
                        size="sm"
                        onClick={() => onInspectCompetitor(comp)}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Inspect</span>
                      </InteractiveButton>

                      {canApprove && comp.approvalStatus !== 'approved' && (
                        <InteractiveButton
                          variant="primary"
                          size="sm"
                          disabled={savingCompetitor}
                          onClick={() => void onDecideCompetitor(comp.id, 'approve')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Approve</span>
                        </InteractiveButton>
                      )}

                      {canApprove && comp.approvalStatus !== 'rejected' && (
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          disabled={savingCompetitor}
                          onClick={() => void onDecideCompetitor(comp.id, 'reject')}
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reject</span>
                        </InteractiveButton>
                      )}

                      {canApprove && (
                        <InteractiveButton
                          variant="danger"
                          size="sm"
                          disabled={savingCompetitor}
                          ariaLabel={`Remove ${comp.domain}`}
                          onClick={() => void onDeleteCompetitor(comp.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </InteractiveButton>
                      )}
                    </div>
                  </div>

                  {/* Optional specific competitor URLs to inspect + history toggle */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-hairline)] sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        aria-label={`Specific URLs to analyze for ${comp.domain}`}
                        value={customAnalyzeUrls[comp.id] ?? ''}
                        onChange={(e) =>
                          setCustomAnalyzeUrls((prev) => ({
                            ...prev,
                            [comp.id]: e.target.value,
                          }))
                        }
                        placeholder={`Optional specific paths/URLs on ${comp.domain} (comma-separated)`}
                        disabled={!canManage || isAnalyzing}
                        className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <a
                        href={comp.homepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)] whitespace-nowrap"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        <span>Open Site</span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHistoryIds((prev) => ({
                            ...prev,
                            [comp.id]: !prev[comp.id],
                          }))
                        }
                        className="inline-flex items-center gap-1 font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
                      >
                        <History className="h-3 w-3" aria-hidden="true" />
                        <span>
                          Approval History ({comp.approvalHistory.length})
                        </span>
                      </button>
                    </div>
                  </div>

                  {showHistory && comp.approvalHistory.length > 0 && (
                    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 space-y-1.5">
                      {comp.approvalHistory.map((h) => (
                        <div
                          key={h.id}
                          className="flex flex-col gap-0.5 text-[11px] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {h.actorName}
                            </span>{' '}
                            ({h.actorRole}) moved {h.previousStatus} →{' '}
                            <span className="font-semibold">{h.newStatus}</span> ·{' '}
                            {h.reason}
                          </div>
                          <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                            {new Date(h.timestamp).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
