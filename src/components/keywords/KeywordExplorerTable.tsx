import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpRight,
  Filter,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type {
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordWorkflowState,
} from '../../types/keywords';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const WORKFLOW_TONES: Record<KeywordWorkflowState, BadgeTone> = {
  discovered: 'neutral',
  enriched: 'info',
  'needs-data': 'warning',
  recommended: 'indigo',
  rejected: 'danger',
  approved: 'success',
  assigned: 'indigo',
  implemented: 'info',
  measured: 'success',
};

export function KeywordExplorerTable({
  keywords,
  onSelectKeyword,
  onStartDiscovery,
}: {
  keywords: KeywordIntelligenceRecord[];
  onSelectKeyword: (kw: KeywordIntelligenceRecord) => void;
  onStartDiscovery: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return keywords.filter((kw) => {
      if (q) {
        const matches =
          kw.keyword.toLowerCase().includes(q) ||
          (kw.clusterName ?? '').toLowerCase().includes(q) ||
          (kw.mapping?.targetUrl ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (stateFilter !== 'all' && kw.workflowState !== stateFilter) return false;
      if (intentFilter !== 'all' && kw.intent !== (intentFilter as KeywordIntent))
        return false;
      if (sourceFilter === 'ai_only' && !kw.isAiSuggestion) return false;
      if (sourceFilter === 'verified_only' && kw.isAiSuggestion) return false;
      if (sourceFilter === 'gsc' && !kw.sources.includes('gsc_query')) return false;
      return true;
    });
  }, [keywords, search, stateFilter, intentFilter, sourceFilter]);

  if (keywords.length === 0) {
    return (
      <EmptyStateCard
        title="No discovered keywords yet"
        description="Run Keyword Discovery or add a manual target keyword to evaluate real Search Console queries, crawl topics, and search suggestions."
        actionLabel="Launch Keyword Discovery"
        onAction={onStartDiscovery}
      />
    );
  }

  return (
    <GlassPanel className="p-4 sm:p-5 space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter keywords, clusters, or URLs..."
            aria-label="Filter discovered keywords"
            className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
              showFilters
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filters</span>
          </button>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {filtered.length} / {keywords.length} shown
          </span>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 sm:grid-cols-3 text-xs">
          <div>
            <label
              htmlFor="kw-filter-state"
              className="block font-semibold text-[var(--text-primary)]"
            >
              Workflow Stage
            </label>
            <select
              id="kw-filter-state"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="all">All Stages</option>
              <option value="discovered">Discovered</option>
              <option value="enriched">Enriched</option>
              <option value="needs-data">Needs Data</option>
              <option value="recommended">Recommended</option>
              <option value="approved">Approved</option>
              <option value="assigned">Assigned</option>
              <option value="implemented">Implemented</option>
              <option value="measured">Measured</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="kw-filter-intent"
              className="block font-semibold text-[var(--text-primary)]"
            >
              Search Intent
            </label>
            <select
              id="kw-filter-intent"
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="all">All Intents</option>
              <option value="Transactional">Transactional</option>
              <option value="Commercial">Commercial</option>
              <option value="Local">Local</option>
              <option value="Informational">Informational</option>
              <option value="Navigational">Navigational</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="kw-filter-source"
              className="block font-semibold text-[var(--text-primary)]"
            >
              Evidence Provenance
            </label>
            <select
              id="kw-filter-source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="all">All Sources</option>
              <option value="gsc">GSC Observed Queries</option>
              <option value="verified_only">Non-AI Evidence Only</option>
              <option value="ai_only">AI Suggestions Only</option>
            </select>
          </div>
        </div>
      )}

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-2.5 pr-3">Keyword &amp; Provenance</th>
              <th className="py-2.5 px-2.5">Intent</th>
              <th className="py-2.5 px-2.5 text-right">Score</th>
              <th className="py-2.5 px-2.5 text-right">GSC Observed</th>
              <th className="py-2.5 px-2.5 text-right">Trends (0–100)</th>
              <th className="py-2.5 px-2.5 text-right">Market Vol.</th>
              <th className="py-2.5 px-2.5">Target Page</th>
              <th className="py-2.5 px-2.5">State</th>
              <th className="py-2.5 pl-2.5 text-right">Inspect</th>
            </tr>
          </thead>
          <motion.tbody
            variants={staggerContainer}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            className="divide-y divide-[var(--border-hairline)]"
          >
            {filtered.map((kw) => {
              const targetDisplay =
                kw.mapping?.targetUrl ??
                (kw.mapping?.mappingStatus === 'recommend_new_page'
                  ? `New: ${kw.mapping.recommendedSlug ?? '/topic'}`
                  : 'Unmapped');

              return (
                <motion.tr
                  key={kw.id}
                  variants={fadeInUp}
                  className="group transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <td className="py-3 pr-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectKeyword(kw)}
                        className="font-display text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] text-left cursor-pointer"
                      >
                        {kw.keyword}
                      </button>
                      {kw.isAiSuggestion && (
                        <span className="inline-flex items-center gap-1 rounded border border-purple-300/60 dark:border-purple-700/60 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                          AI Suggestion
                        </span>
                      )}
                      {kw.mapping &&
                        kw.mapping.cannibalizationRisk !== 'none' && (
                          <span
                            title={kw.mapping.resolutionRecommendation ?? 'Cannibalization risk'}
                            className="inline-flex items-center gap-1 rounded border border-amber-300/60 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                            Conflict
                          </span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
                      <span>
                        {kw.targetCountry}
                        {kw.targetCity ? ` · ${kw.targetCity}` : ''} ({kw.targetLanguage})
                      </span>
                      <span>· Sources: {kw.sources.join(', ')}</span>
                      {kw.clusterName && (
                        <span className="text-[var(--accent-primary)] font-medium">
                          · Cluster: {kw.clusterName}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-2.5 align-top">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {kw.intent}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {kw.intentInferred ? 'Inferred' : 'Verified'}
                    </div>
                  </td>

                  <td className="py-3 px-2.5 align-top text-right font-mono">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 font-bold tabular-nums ${
                        kw.opportunityScore >= 70
                          ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                          : kw.opportunityScore >= 45
                            ? 'bg-indigo-500/12 text-[var(--accent-primary)]'
                            : 'bg-slate-500/12 text-[var(--text-muted)]'
                      }`}
                    >
                      {kw.opportunityScore}/100
                    </span>
                    {!kw.scoreBreakdown.relevanceGatePassed && (
                      <div className="mt-0.5 text-[9.5px] text-rose-600 dark:text-rose-400">
                        Gate Failed
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-2.5 align-top text-right font-mono tabular-nums">
                    {kw.gscImpressions !== null ? (
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">
                          {kw.gscImpressions.toLocaleString()} impr.
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {kw.gscClicks ?? 0} clicks · pos {kw.gscAvgPosition?.toFixed(1) ?? '—'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">Not in GSC</span>
                    )}
                  </td>

                  <td className="py-3 px-2.5 align-top text-right font-mono tabular-nums">
                    {kw.relativeTrendIndex !== null ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                        {kw.trendDirection === 'rising' && (
                          <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                        )}
                        {kw.trendDirection === 'declining' && (
                          <TrendingDown className="h-3 w-3 text-rose-500" aria-hidden="true" />
                        )}
                        {kw.relativeTrendIndex}/100
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">Unavailable</span>
                    )}
                  </td>

                  <td className="py-3 px-2.5 align-top text-right font-mono tabular-nums">
                    {kw.marketSearchVolume !== null ? (
                      <span className="font-semibold text-[var(--text-primary)]">
                        {kw.marketSearchVolume.toLocaleString()}
                      </span>
                    ) : (
                      <span
                        title="Google Ads Keyword Planner credentials required for monthly market volume"
                        className="text-[var(--text-muted)]"
                      >
                        Unavailable
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-2.5 align-top max-w-[200px]">
                    <div
                      title={targetDisplay}
                      className="truncate font-mono text-[11px] text-[var(--text-secondary)]"
                    >
                      {targetDisplay}
                    </div>
                    {kw.mapping?.pageStatusCode && (
                      <div className="text-[10px] text-[var(--text-muted)]">
                        HTTP {kw.mapping.pageStatusCode} ·{' '}
                        {kw.mapping.pageIndexable ? 'Indexable' : 'Non-Indexable'}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-2.5 align-top">
                    <StatusBadge
                      label={kw.workflowState}
                      tone={WORKFLOW_TONES[kw.workflowState]}
                    />
                  </td>

                  <td className="py-3 pl-2.5 align-top text-right">
                    <button
                      type="button"
                      onClick={() => onSelectKeyword(kw)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/50 cursor-pointer transition-colors"
                    >
                      <span>Inspect</span>
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
