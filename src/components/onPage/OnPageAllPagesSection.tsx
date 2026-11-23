import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { OnPagePageAnalysisRecord } from '../../types/onPage';
import {
  lifecycleLabel,
  lifecycleTextClass,
  scoreTextClass,
} from './onPageUiHelpers';

interface OnPageAllPagesSectionProps {
  pages: OnPagePageAnalysisRecord[];
  selectedPageId: string | null;
  onSelectPageAndOpenTab: (
    pageId: string,
    tab: 'analyzer' | 'content' | 'metadata',
  ) => void;
}

export function OnPageAllPagesSection({
  pages,
  selectedPageId,
  onSelectPageAndOpenTab,
}: OnPageAllPagesSectionProps) {
  const [search, setSearch] = useState('');
  const [pageTypeFilter, setPageTypeFilter] = useState('all');
  const [mappingFilter, setMappingFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');

  const pageTypes = useMemo(
    () => [...new Set(pages.map((p) => p.pageType))].sort(),
    [pages],
  );

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => {
      if (q) {
        const hay = `${p.url} ${p.title ?? ''} ${p.keywordContext.existingPrimaryKeyword ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (pageTypeFilter !== 'all' && p.pageType !== pageTypeFilter) return false;
      if (
        mappingFilter !== 'all' &&
        p.keywordContext.mappingStatus !== mappingFilter
      ) {
        return false;
      }
      if (scoreFilter === 'low' && (p.overallScore === null || p.overallScore >= 60)) {
        return false;
      }
      if (
        scoreFilter === 'medium' &&
        (p.overallScore === null || p.overallScore < 60 || p.overallScore >= 80)
      ) {
        return false;
      }
      if (scoreFilter === 'high' && (p.overallScore === null || p.overallScore < 80)) {
        return false;
      }
      if (scoreFilter === 'insufficient' && p.scoreStatus !== 'insufficient_evidence') {
        return false;
      }
      return true;
    });
  }, [pages, search, pageTypeFilter, mappingFilter, scoreFilter]);

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Analyzed Website Pages ({filteredPages.length} of {pages.length})
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Every row reflects an actual crawled URL from your latest crawl run.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter URL, title, keyword…"
              aria-label="Filter analyzed pages"
              className="w-52 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by page type"
            value={pageTypeFilter}
            onChange={(e) => setPageTypeFilter(e.target.value)}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Page Types</option>
            {pageTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by keyword mapping"
            value={mappingFilter}
            onChange={(e) => setMappingFilter(e.target.value)}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Keyword States</option>
            <option value="mapped_approved">Mapped (Approved)</option>
            <option value="mapped_pending">Mapped (Pending)</option>
            <option value="unmapped">Unmapped</option>
            <option value="conflict_detected">Cannibalization Risk</option>
          </select>

          <select
            aria-label="Filter by score tier"
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value)}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Scores</option>
            <option value="low">Needs Work (&lt;60)</option>
            <option value="medium">Moderate (60–79)</option>
            <option value="high">Strong (80+)</option>
            <option value="insufficient">Insufficient Evidence</option>
          </select>
        </div>
      </div>

      {filteredPages.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
          No analyzed pages match your current filter.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="pb-2.5 pr-3 font-semibold">Page URL &amp; Title</th>
                <th className="pb-2.5 px-3 font-semibold">Type</th>
                <th className="pb-2.5 px-3 font-semibold">Score</th>
                <th className="pb-2.5 px-3 font-semibold">Issues</th>
                <th className="pb-2.5 px-3 font-semibold">Target Keyword</th>
                <th className="pb-2.5 px-3 font-semibold">Lifecycle</th>
                <th className="pb-2.5 pl-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filteredPages.map((pg) => {
                const isSelected = pg.id === selectedPageId;
                return (
                  <tr
                    key={pg.id}
                    className={
                      isSelected
                        ? 'bg-[#7047EB]/6 dark:bg-[#22D3EE]/8'
                        : 'hover:bg-[var(--bg-subtle)]/70'
                    }
                  >
                    <td className="py-3 pr-3 max-w-[300px]">
                      <p className="truncate font-mono text-xs font-medium text-[var(--text-primary)]">
                        {pg.slug}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                        {pg.title || '(Missing title tag)'}
                      </p>
                    </td>
                    <td className="py-3 px-3 capitalize text-[var(--text-secondary)]">
                      {pg.pageType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-bold tabular-nums ${scoreTextClass(pg.overallScore)}`}
                      >
                        {pg.overallScore !== null
                          ? `${pg.overallScore}/100`
                          : 'Insufficient'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <span
                        className={
                          pg.criticalHighIssueCount > 0
                            ? 'font-semibold text-amber-600 dark:text-amber-400'
                            : 'text-[var(--text-secondary)]'
                        }
                      >
                        {pg.issueCount}
                      </span>
                      {pg.criticalHighIssueCount > 0 && (
                        <span className="ml-1 text-[11px] text-rose-600 dark:text-rose-400">
                          ({pg.criticalHighIssueCount} crit/high)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-[200px]">
                      <p className="truncate text-[var(--text-primary)]">
                        {pg.keywordContext.existingPrimaryKeyword || (
                          <span className="text-[var(--text-muted)]">Unmapped</span>
                        )}
                      </p>
                      {pg.keywordContext.cannibalizationWarnings.length > 0 && (
                        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          Cannibalization risk
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className={lifecycleTextClass(pg.lifecycleStatus)}>
                        {lifecycleLabel(pg.lifecycleStatus)}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectPageAndOpenTab(pg.id, 'analyzer')}
                          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
                        >
                          Analyze
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPageAndOpenTab(pg.id, 'content')}
                          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:border-[#7047EB]/45 cursor-pointer"
                        >
                          Draft Editor
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
