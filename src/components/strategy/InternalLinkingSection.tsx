import { useMemo, useState } from 'react';
import { ArrowRight, Check, Link2, Search, X } from 'lucide-react';
import type {
  InternalLinkCategory,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import {
  LINK_CATEGORY_LABELS,
  approvalLabel,
  approvalToneClass,
  confidenceToneClass,
} from './strategyUiHelpers';

const CATEGORIES: readonly InternalLinkCategory[] = [
  'orphan_rescue',
  'authority_hub',
  'parent_child',
  'topical_crosslink',
  'weak_link_fix',
];

interface InternalLinkingSectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
}

export function InternalLinkingSection({
  workspace,
  busyAction,
  onDecideApproval,
}: InternalLinkingSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    InternalLinkCategory | 'all'
  >('all');
  const [crawlStateFilter, setCrawlStateFilter] = useState<
    'all' | 'missing' | 'exists'
  >('all');

  const filteredLinks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspace.internalLinks.filter((l) => {
      if (categoryFilter !== 'all' && l.linkCategory !== categoryFilter) {
        return false;
      }
      if (crawlStateFilter === 'missing' && l.existsInCrawl) return false;
      if (crawlStateFilter === 'exists' && !l.existsInCrawl) return false;
      if (!q) return true;
      return (
        l.sourceUrl.toLowerCase().includes(q) ||
        l.targetUrl.toLowerCase().includes(q) ||
        l.suggestedAnchorText.toLowerCase().includes(q) ||
        l.reason.toLowerCase().includes(q)
      );
    });
  }, [workspace.internalLinks, searchQuery, categoryFilter, crawlStateFilter]);

  if (!workspace.activeVersion) {
    return (
      <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
        Generate an SEO Strategy version first to analyze crawl link graph opportunities and orphan pages.
      </div>
    );
  }

  const orphanCount = workspace.internalLinks.filter(
    (l) => l.linkCategory === 'orphan_rescue',
  ).length;
  const missingInCrawlCount = workspace.internalLinks.filter(
    (l) => !l.existsInCrawl,
  ).length;

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link2
                className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                aria-hidden="true"
              />
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Crawl-Verified Internal Linking Strategy
              </h2>
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              Built from parsed crawl internal link graphs and proposed site hierarchy. Clearly distinguishes links confirmed in the latest crawl vs recommended links not yet present on your site.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
            <span className="text-[var(--text-primary)] font-semibold">
              {workspace.internalLinks.length} links
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-rose-600 dark:text-rose-400">
              {orphanCount} orphan rescue
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-amber-600 dark:text-amber-400">
              {missingInCrawlCount} not yet in crawl
            </span>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by source URL, target URL, anchor text, or reason..."
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by link category"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as InternalLinkCategory | 'all')
            }
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Link Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LINK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by crawl verification"
            value={crawlStateFilter}
            onChange={(e) =>
              setCrawlStateFilter(e.target.value as 'all' | 'missing' | 'exists')
            }
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Crawl States</option>
            <option value="missing">Not Yet Present in Crawl</option>
            <option value="exists">Confirmed in Crawl</option>
          </select>
        </div>

        {filteredLinks.length === 0 ? (
          <p className="mt-4 py-6 text-center text-xs text-[var(--text-muted)]">
            {workspace.internalLinks.length === 0
              ? 'Needs Research — Run a technical site crawl to inspect live internal links and orphan pages.'
              : 'No internal link recommendations match the current filter.'}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-hairline)]">
            {filteredLinks.map((link) => (
              <div
                key={link.id}
                className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {link.sourceTitle}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-[#7047EB] dark:text-[#22D3EE]">
                      {link.targetTitle}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                    <span className="truncate">{link.sourceUrl}</span>
                    <span>→</span>
                    <span className="truncate">{link.targetUrl}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                    <span className="text-[var(--text-secondary)]">
                      Anchor:{' '}
                      <strong className="font-semibold text-[var(--text-primary)]">
                        &ldquo;{link.suggestedAnchorText}&rdquo;
                      </strong>
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="font-medium text-[var(--text-secondary)]">
                      {LINK_CATEGORY_LABELS[link.linkCategory]}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span
                      className={
                        link.existsInCrawl
                          ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                          : 'font-semibold text-amber-600 dark:text-amber-400'
                      }
                    >
                      {link.existsInCrawl
                        ? 'Confirmed in Crawl'
                        : 'Not Yet Present in Crawl'}
                    </span>
                    {link.currentInboundCount !== null && (
                      <>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="font-mono tabular-nums text-[var(--text-muted)]">
                          Current inbound: {link.currentInboundCount}
                        </span>
                      </>
                    )}
                    <span className="text-[var(--text-muted)]">·</span>
                    <span
                      className={`font-semibold ${confidenceToneClass(link.confidence)}`}
                    >
                      {link.confidence}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span
                      className={`font-semibold ${approvalToneClass(link.approvalStatus)}`}
                    >
                      {approvalLabel(link.approvalStatus)}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    {link.reason}
                  </p>
                </div>

                {workspace.canApproveStrategy && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={
                        busyAction !== null || link.approvalStatus === 'approved'
                      }
                      onClick={() =>
                        void onDecideApproval(
                          'internal_link',
                          link.id,
                          'approved',
                          `Approved contextual internal link "${link.suggestedAnchorText}".`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        busyAction !== null || link.approvalStatus === 'rejected'
                      }
                      onClick={() =>
                        void onDecideApproval(
                          'internal_link',
                          link.id,
                          'rejected',
                          `Rejected internal link suggestion "${link.suggestedAnchorText}".`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
