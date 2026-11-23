import { useMemo, useState } from 'react';
import { ExternalLink, FileCode2, KeyRound, Search } from 'lucide-react';
import type {
  CompetitorWorkspaceResponse,
  KeywordOverlapType,
} from '../../types/competitors';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const OVERLAP_TONE: Record<KeywordOverlapType, BadgeTone> = {
  shared: 'info',
  competitor_only_gap: 'warning',
  project_advantage: 'success',
};

const OVERLAP_LABEL: Record<KeywordOverlapType, string> = {
  shared: 'Shared Topic',
  competitor_only_gap: 'Competitor Gap',
  project_advantage: 'Project Advantage',
};

export function CompetitorPagesAndOverlapPanel({
  workspace,
}: {
  workspace: CompetitorWorkspaceResponse;
}) {
  const [selectedCompetitorFilter, setSelectedCompetitorFilter] = useState<string>('all');
  const [overlapFilter, setOverlapFilter] = useState<'all' | KeywordOverlapType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const competitorById = useMemo(
    () => new Map(workspace.competitors.map((c) => [c.id, c])),
    [workspace.competitors],
  );

  const filteredPages = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return workspace.pages.filter((p) => {
      if (selectedCompetitorFilter !== 'all' && p.competitorId !== selectedCompetitorFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.normalizedUrl.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.h1.toLowerCase().includes(q) ||
        p.extractedTopics.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [workspace.pages, selectedCompetitorFilter, searchTerm]);

  const filteredOverlaps = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return workspace.overlaps.filter((o) => {
      if (selectedCompetitorFilter !== 'all' && o.competitorId !== selectedCompetitorFilter) {
        return false;
      }
      if (overlapFilter !== 'all' && o.overlapType !== overlapFilter) {
        return false;
      }
      if (!q) return true;
      return (
        o.keyword.toLowerCase().includes(q) ||
        o.competitorDomain.toLowerCase().includes(q) ||
        o.competitorMatchReason.toLowerCase().includes(q)
      );
    });
  }, [workspace.overlaps, selectedCompetitorFilter, overlapFilter, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <GlassPanel className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search URLs, titles, topics, keywords..."
              aria-label="Filter competitor pages and keywords"
              className="w-64 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <select
            value={selectedCompetitorFilter}
            onChange={(e) => setSelectedCompetitorFilter(e.target.value)}
            aria-label="Filter by competitor"
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            <option value="all">All Competitors ({workspace.competitors.length})</option>
            {workspace.competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.domain}
              </option>
            ))}
          </select>
        </div>

        <div
          className="inline-flex flex-wrap rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
          role="group"
          aria-label="Filter Keyword Overlap Type"
        >
          {(
            [
              { id: 'all', label: 'All Signals' },
              { id: 'competitor_only_gap', label: 'Competitor Gaps' },
              { id: 'shared', label: 'Shared Topics' },
              { id: 'project_advantage', label: 'Project Advantage' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setOverlapFilter(btn.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                overlapFilter === btn.id
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </GlassPanel>

      {/* Analyzed Competitor Pages Table */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Live Competitor Page Snapshots ({filteredPages.length})
            </h3>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            HTML structure, headings, visible words, and JSON-LD extracted from live HTTP fetches
          </span>
        </div>

        {filteredPages.length === 0 ? (
          <EmptyStateCard
            title="No competitor page snapshots collected"
            description="Click 'Analyze Live Pages' on any competitor in the Overview & Registry tab to inspect live title, H1, headings, word count, and JSON-LD schema."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 font-semibold">Competitor & URL</th>
                  <th className="py-2.5 px-3 font-semibold">Title / H1</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Words</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Headings</th>
                  <th className="py-2.5 px-3 font-semibold">Schema JSON-LD</th>
                  <th className="py-2.5 px-3 font-semibold">Extracted Topics</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">HTTP / Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredPages.map((page) => {
                  const comp = competitorById.get(page.competitorId);
                  return (
                    <tr key={page.id} className="align-top hover:bg-[var(--bg-subtle)]/40">
                      <td className="py-3 pr-3 max-w-[220px]">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {comp?.domain ?? 'Competitor'}
                        </div>
                        <a
                          href={page.normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-[var(--accent-primary)] hover:underline break-all"
                        >
                          <span>{page.normalizedUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                      </td>
                      <td className="py-3 px-3 max-w-[240px]">
                        <div className="font-medium text-[var(--text-primary)] line-clamp-2">
                          {page.title || 'Missing <title>'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)] line-clamp-1">
                          H1: {page.h1 || 'Missing <h1>'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                        {page.wordCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {page.headings.length}
                      </td>
                      <td className="py-3 px-3 max-w-[160px] text-[11px] text-[var(--text-secondary)]">
                        {page.schemaTypes.length > 0
                          ? page.schemaTypes.join(', ')
                          : 'None detected'}
                      </td>
                      <td className="py-3 px-3 max-w-[210px] text-[11px] text-[var(--text-secondary)]">
                        {page.extractedTopics.length > 0
                          ? page.extractedTopics.slice(0, 4).join(' · ')
                          : 'None extracted'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                        {page.statusCode} · {page.responseTimeMs}ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {/* Keyword Overlap Analysis Table */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Keyword & Topic Overlap Analysis ({filteredOverlaps.length})
            </h3>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Compares competitor extracted topics & SERP matches against Phase 3 crawl & Phase 7 keywords. Unconnected Volume/SERP metrics remain Unavailable.
          </span>
        </div>

        {filteredOverlaps.length === 0 ? (
          <EmptyStateCard
            title="No keyword overlap rows match your filter"
            description="Run live competitor page analysis (or configure SERPAPI_API_KEY) to compute shared keywords, competitor-only gaps, and project advantages."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 font-semibold">Keyword / Topic</th>
                  <th className="py-2.5 px-3 font-semibold">Competitor</th>
                  <th className="py-2.5 px-3 font-semibold">Overlap Type</th>
                  <th className="py-2.5 px-3 font-semibold">Own Site Coverage</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Own GSC Pos / Clicks</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Rival SERP Pos</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Ext. Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredOverlaps.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-[var(--bg-subtle)]/40">
                    <td className="py-3 pr-3 max-w-[240px]">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {row.keyword}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {row.intent} · {row.targetCountry} · {row.competitorMatchReason}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {row.competitorDomain}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={OVERLAP_LABEL[row.overlapType]}
                        tone={OVERLAP_TONE[row.overlapType]}
                      />
                    </td>
                    <td className="py-3 px-3 text-[11px]">
                      <div className="font-semibold capitalize text-[var(--text-primary)]">
                        {row.projectCoverageStatus}
                      </div>
                      {row.projectUrl && (
                        <div className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[180px]">
                          {row.projectUrl}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {row.projectGscPosition !== null
                        ? `#${row.projectGscPosition.toFixed(1)} · ${row.projectGscClicks ?? 0} clicks`
                        : 'Unavailable'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {row.competitorSerpPosition !== null
                        ? `#${row.competitorSerpPosition}`
                        : 'Unavailable'}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                      {row.externalSearchVolume !== null
                        ? row.externalSearchVolume.toLocaleString()
                        : 'Unavailable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
