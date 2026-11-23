import { ArrowUpDown, Download, ExternalLink, Search } from 'lucide-react';
import type { CrawlURLRecord } from '../../types/crawl';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge, TableRowsSkeleton } from '../ui/StateViews';

const FILTERS = [
  { id: 'all', label: 'All URLs' },
  { id: 'indexable', label: 'Indexable' },
  { id: 'non_indexable', label: 'Non-Indexable' },
  { id: 'errors', label: 'Errors (4xx/5xx)' },
  { id: 'redirects', label: 'Redirects (3xx)' },
  { id: 'canonical_issues', label: 'Canonical Issues' },
  { id: 'missing_metadata', label: 'Missing Metadata' },
  { id: 'schema_issues', label: 'Schema Errors' },
] as const;

export function URLInventoryTable({
  items,
  total,
  page,
  pageSize,
  search,
  filter,
  sortBy,
  sortDir,
  loading,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onPageChange,
  onSelectUrl,
  onExportCsv,
}: {
  items: CrawlURLRecord[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  filter: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  loading: boolean;
  onSearchChange: (val: string) => void;
  onFilterChange: (val: string) => void;
  onSortChange: (col: 'normalized_url' | 'status_code' | 'depth' | 'issue_count') => void;
  onPageChange: (nextPage: number) => void;
  onSelectUrl: (urlRecord: CrawlURLRecord) => void;
  onExportCsv: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statusTone = (code: number) => {
    if (code >= 200 && code < 300) return 'success';
    if (code >= 300 && code < 400) return 'warning';
    return 'danger';
  };

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search URL, title, or H1..."
              aria-label="Search crawled URLs"
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-2 pr-3 pl-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none transition-colors"
            />
          </div>

          <select
            aria-label="Filter URLs"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none transition-colors"
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {total} URL(s) matched
          </span>
          <InteractiveButton variant="secondary" size="md" onClick={onExportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </InteractiveButton>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        {loading ? (
          <TableRowsSkeleton rows={6} />
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-2.5 pr-3">
                  <button
                    type="button"
                    onClick={() => onSortChange('normalized_url')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                  >
                    <span>URL &amp; Title</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onSortChange('status_code')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                  >
                    <span>Status</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Indexability</th>
                <th className="py-2.5 px-3">Canonical</th>
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onSortChange('depth')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                  >
                    <span>Depth</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Render</th>
                <th className="py-2.5 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSortChange('issue_count')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                  >
                    <span>Issues</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-muted)]">
                    No URLs match the current filter.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onSelectUrl(row)}
                    className="group hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors duration-150"
                  >
                    <td className="py-3 pr-3 max-w-[320px]">
                      <div className="flex items-center gap-1.5 font-mono text-[11.5px] font-semibold text-[var(--text-primary)] group-hover:text-[#7047EB] dark:group-hover:text-[#A78BFA] truncate transition-colors">
                        <span className="truncate">{row.normalizedUrl}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                        {row.title ?? 'Missing <title>'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={row.statusCode === 0 ? 'ERR' : String(row.statusCode)}
                        tone={statusTone(row.statusCode)}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={row.indexability}
                        tone={
                          row.indexability === 'Indexable' ? 'success' : 'warning'
                        }
                      />
                      <div className="mt-0.5 max-w-[170px] truncate text-[10.5px] text-[var(--text-muted)]">
                        {row.indexabilityReason}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[160px]">
                      <div className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                        {row.canonicalStatus}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[var(--text-secondary)]">
                      {row.depth}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        label={
                          row.renderingSource === 'rendered_dom'
                            ? 'JS DOM'
                            : 'Raw HTML'
                        }
                        tone={
                          row.renderingSource === 'rendered_dom'
                            ? 'indigo'
                            : 'neutral'
                        }
                      />
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {row.issueCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">
          Page {page} of {totalPages} ({sortBy} · {sortDir})
        </span>
        <div className="flex items-center gap-2">
          <InteractiveButton
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </InteractiveButton>
          <InteractiveButton
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </InteractiveButton>
        </div>
      </div>
    </section>
  );
}
