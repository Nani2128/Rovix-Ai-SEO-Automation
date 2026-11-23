import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import type {
  ApprovalStatus,
  KeywordIntent,
  KeywordOpportunity,
  OpportunityTier,
} from '../../types/dashboard';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import {
  filterAndSortKeywords,
  formatSearchVolume,
} from '../../utils/dashboardLogic';
import { AnimatedDrawer } from '../animation/MotionPrimitives';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const INTENT_TONES: Record<KeywordIntent, BadgeTone> = {
  Commercial: 'indigo',
  Informational: 'neutral',
  Transactional: 'success',
  Local: 'info',
  Navigational: 'neutral',
};

const OPPORTUNITY_TONES: Record<OpportunityTier, BadgeTone> = {
  High: 'success',
  Medium: 'warning',
  Low: 'neutral',
};

const APPROVAL_TONES: Record<ApprovalStatus, BadgeTone> = {
  Approved: 'success',
  Pending: 'warning',
  'Revision Requested': 'danger',
};

export function KeywordOpportunitiesTable({
  keywords,
  compactMode = true,
  onAddKeyword,
}: {
  keywords: KeywordOpportunity[];
  compactMode?: boolean;
  onAddKeyword?: () => void;
}) {
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.permissions);
  const updateKeywordStatus = useDashboardStore((s) => s.updateKeywordStatus);
  const pushToast = useToastStore((s) => s.pushToast);

  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState<KeywordIntent | 'All'>('All');
  const [tierFilter, setTierFilter] = useState<OpportunityTier | 'All'>('All');
  const [sortBy, setSortBy] = useState<'keyword' | 'searchVolume' | 'opportunity'>('searchVolume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedKeyword, setSelectedKeyword] =
    useState<KeywordOpportunity | null>(null);

  const pageSize = compactMode ? 4 : 8;

  const processed = useMemo(
    () =>
      filterAndSortKeywords(keywords, {
        search,
        intent: intentFilter,
        opportunity: tierFilter,
        sortBy,
        sortDir,
      }),
    [keywords, search, intentFilter, tierFilter, sortBy, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = processed.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const toggleSort = (col: 'keyword' | 'searchVolume' | 'opportunity') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  return (
    <GlassPanel
      as="section"
      animate
      ariaLabelledBy="keyword-opps-heading"
      className="p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="keyword-opps-heading"
            className="font-display text-lg font-bold text-[var(--text-primary)]"
          >
            Tracked Keywords &amp; GSC Queries
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Real tracked targets &amp; Search Console queries · Click any row for approval workflow
          </p>
        </div>

        {compactMode && (
          <Link
            to="/keywords"
            className="text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF] hover:underline whitespace-nowrap"
          >
            Open Keyword Lab →
          </Link>
        )}
      </div>

      {keywords.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filter keywords, markets, or URLs..."
              aria-label="Filter keyword opportunities"
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none transition-colors"
            />
          </div>

          <select
            aria-label="Filter by search intent"
            value={intentFilter}
            onChange={(e) => {
              setIntentFilter(e.target.value as KeywordIntent | 'All');
              setPage(1);
            }}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none cursor-pointer"
          >
            <option value="All">All Intents</option>
            <option value="Commercial">Commercial</option>
            <option value="Transactional">Transactional</option>
            <option value="Informational">Informational</option>
            <option value="Local">Local</option>
            <option value="Navigational">Navigational</option>
          </select>

          <select
            aria-label="Filter by opportunity tier"
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value as OpportunityTier | 'All');
              setPage(1);
            }}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none cursor-pointer"
          >
            <option value="All">All Opportunity</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        {keywords.length === 0 ? (
          <EmptyStateCard
            title="No tracked keywords yet"
            description={
              compactMode
                ? 'Sync Google Search Console queries or manually add target keywords in Keyword Lab.'
                : 'Sync Google Search Console queries in Integrations or manually add a target keyword above.'
            }
            actionLabel={
              compactMode
                ? 'Manage Keywords'
                : onAddKeyword
                  ? 'Add Target Keyword'
                  : 'Connect Integrations'
            }
            onAction={() => {
              if (compactMode) {
                navigate('/keywords');
              } else if (onAddKeyword) {
                onAddKeyword();
              } else {
                navigate('/integrations');
              }
            }}
          />
        ) : pagedRows.length === 0 ? (
          <EmptyStateCard
            title="No keyword opportunities match filters"
            description="Adjust your search query or reset filters to inspect all tracked keywords."
            actionLabel="Reset Filters"
            onAction={() => {
              setSearch('');
              setIntentFilter('All');
              setTierFilter('All');
            }}
          />
        ) : (
          <table className={`w-full border-collapse text-left ${compactMode ? '' : 'min-w-[680px]'}`}>
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                <th className="py-2.5 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('keyword')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>Keyword</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-1.5">Intent</th>
                {!compactMode && <th className="py-2.5 px-2">Market</th>}
                <th className="py-2.5 px-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('searchVolume')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>Volume / Impr.</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                {!compactMode && <th className="py-2.5 px-2">Target URL</th>}
                <th className="py-2.5 px-1.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('opportunity')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>Priority</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 pl-1.5 text-right">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-xs">
              {pagedRows.map((row) => {
                const volumeDisplay =
                  row.impressions !== null && row.impressions !== undefined
                    ? `${row.impressions.toLocaleString()} impr.`
                    : formatSearchVolume(row.searchVolume);

                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedKeyword(row)}
                    className="group cursor-pointer hover:bg-[#7047EB]/5 transition-colors"
                  >
                    <td className="py-3 pr-2 font-semibold text-[var(--text-primary)] group-hover:text-[#7047EB] dark:group-hover:text-[#8B6BFF] transition-colors">
                      <div className="flex items-center gap-2">
                        <span>{row.keyword}</span>
                        {row.sourceProvider && (
                          <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                            {row.sourceProvider}
                          </span>
                        )}
                      </div>
                      {compactMode && (
                        <div className="mt-0.5 font-mono text-[10.5px] font-normal text-[var(--text-muted)] truncate max-w-[195px]">
                          {row.targetMarket} · {row.targetUrl}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-1.5 whitespace-nowrap">
                      <StatusBadge
                        label={row.intent}
                        tone={INTENT_TONES[row.intent]}
                      />
                    </td>
                    {!compactMode && (
                      <td className="py-3 px-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {row.targetMarket}
                      </td>
                    )}
                    <td className="py-3 px-1.5 text-right font-mono text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                      {volumeDisplay}
                    </td>
                    {!compactMode && (
                      <td className="py-3 px-2 font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[140px]">
                        {row.targetUrl}
                      </td>
                    )}
                    <td className="py-3 px-1.5 whitespace-nowrap">
                      <StatusBadge
                        label={row.opportunity}
                        tone={OPPORTUNITY_TONES[row.opportunity]}
                      />
                    </td>
                    <td className="py-3 pl-1.5 text-right whitespace-nowrap">
                      <StatusBadge
                        label={row.approvalStatus}
                        tone={APPROVAL_TONES[row.approvalStatus]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-[var(--border-hairline)] pt-3 text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">
            Page {safePage} of {totalPages} ({processed.length} keywords)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous keyword page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next keyword page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <AnimatedDrawer
        open={Boolean(selectedKeyword)}
        onClose={() => setSelectedKeyword(null)}
        ariaLabel={
          selectedKeyword
            ? `Keyword details for ${selectedKeyword.keyword}`
            : 'Keyword details'
        }
        maxWidthClass="max-w-md"
      >
        {selectedKeyword && (
          <div className="flex h-full flex-col justify-between p-6">
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
                <div>
                  <p className="font-display text-xs font-semibold tracking-wider text-[#7047EB] dark:text-[#8B6BFF] uppercase">
                    Keyword Target Detail
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">
                    {selectedKeyword.keyword}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedKeyword(null)}
                  aria-label="Close keyword drawer"
                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-3">
                  <div className="text-[var(--text-muted)]">
                    {selectedKeyword.impressions !== null &&
                    selectedKeyword.impressions !== undefined
                      ? 'GSC Impressions'
                      : 'Search Volume'}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {selectedKeyword.impressions !== null &&
                    selectedKeyword.impressions !== undefined
                      ? selectedKeyword.impressions.toLocaleString()
                      : formatSearchVolume(selectedKeyword.searchVolume)}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-3">
                  <div className="text-[var(--text-muted)]">Avg Position</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {selectedKeyword.currentPosition !== null
                      ? `#${selectedKeyword.currentPosition}`
                      : 'Not Measured'}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-3">
                  <div className="text-[var(--text-muted)]">Target Market</div>
                  <div className="mt-1 font-semibold text-[var(--text-primary)]">
                    {selectedKeyword.targetMarket}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] p-3">
                  <div className="text-[var(--text-muted)]">Approval State</div>
                  <div className="mt-1">
                    <StatusBadge
                      label={selectedKeyword.approvalStatus}
                      tone={APPROVAL_TONES[selectedKeyword.approvalStatus]}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">Target URL</div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[#7047EB] dark:text-[#8B6BFF]">
                    <span>{selectedKeyword.targetUrl}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    Source &amp; Notes
                  </div>
                  <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">
                    {selectedKeyword.rationale}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-hairline)] pt-4">
              {permissions.canApproveKeywords ? (
                <div className="flex items-center gap-2.5">
                  <InteractiveButton
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      void updateKeywordStatus(selectedKeyword.id, 'Approved');
                      setSelectedKeyword({
                        ...selectedKeyword,
                        approvalStatus: 'Approved',
                      });
                      pushToast({
                        title: 'Keyword target approved',
                        detail: selectedKeyword.keyword,
                        tone: 'success',
                      });
                    }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Approve Target</span>
                  </InteractiveButton>
                  <InteractiveButton
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      void updateKeywordStatus(
                        selectedKeyword.id,
                        'Revision Requested',
                      );
                      setSelectedKeyword({
                        ...selectedKeyword,
                        approvalStatus: 'Revision Requested',
                      });
                      pushToast({
                        title: 'Revision requested',
                        detail: selectedKeyword.keyword,
                        tone: 'warning',
                      });
                    }}
                  >
                    Request Revision
                  </InteractiveButton>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/35 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-300">
                  Your current role does not have keyword approval permissions
                  (enforced server-side).
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatedDrawer>
    </GlassPanel>
  );
}
