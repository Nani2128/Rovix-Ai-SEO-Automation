import { Link } from 'react-router-dom';
import type {
  OnPagePageAnalysisRecord,
  OnPageWorkspacePayload,
} from '../../types/onPage';

interface OnPageInternalLinkingSectionProps {
  pages: OnPagePageAnalysisRecord[];
  module7InternalLinks: OnPageWorkspacePayload['module7InternalLinks'];
  onOpenAnalyzer: (pageId: string) => void;
}

export function OnPageInternalLinkingSection({
  pages,
  module7InternalLinks,
  onOpenAnalyzer,
}: OnPageInternalLinkingSectionProps) {
  const weakAnchorRows = pages.flatMap((pg) =>
    pg.htmlExtract.internalAnchors
      .filter((a) => a.isWeakAnchor)
      .map((a) => ({
        pageId: pg.id,
        sourceSlug: pg.slug,
        href: a.href,
        anchorText: a.anchorText,
      })),
  );

  return (
    <div className="space-y-5">
      {/* Weak Anchor Diagnostics from Crawled HTML */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Weak Internal Anchor Text Detected in Crawled HTML ({weakAnchorRows.length})
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Generic anchors like &ldquo;click here&rdquo;, &ldquo;read more&rdquo;, or empty links reduce topical clarity for search engines and screen readers.
          </p>
        </div>

        {weakAnchorRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            No weak internal anchors detected in parsed HTML snapshots.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2.5 pr-3 font-semibold">Source Page</th>
                  <th className="pb-2.5 px-3 font-semibold">Weak Anchor Text</th>
                  <th className="pb-2.5 px-3 font-semibold">Target Href</th>
                  <th className="pb-2.5 pl-3 text-right font-semibold">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {weakAnchorRows.slice(0, 60).map((row, idx) => (
                  <tr key={`${row.pageId}-${row.href}-${idx}`}>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-primary)]">
                      {row.sourceSlug}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-amber-600 dark:text-amber-400">
                      &ldquo;{row.anchorText}&rdquo;
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {row.href}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenAnalyzer(row.pageId)}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reused Module 7 Internal-Link Recommendations */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Strategy Internal-Link Recommendations (Reused from Module 7 · {module7InternalLinks.length})
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Synced directly from your latest SEO Strategy &amp; Architecture version without duplicating the internal-link graph engine.
            </p>
          </div>
          <Link
            to="/strategy?tab=linking"
            className="text-xs font-semibold text-[#7047EB] hover:underline dark:text-[#22D3EE]"
          >
            Manage in Strategy Workspace →
          </Link>
        </div>

        {module7InternalLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            No Module 7 internal-link recommendations generated yet. Generate a Strategy version in Strategy &amp; Architecture to populate contextual link opportunities.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2.5 pr-3 font-semibold">Source → Target</th>
                  <th className="pb-2.5 px-3 font-semibold">Suggested Anchor</th>
                  <th className="pb-2.5 px-3 font-semibold">Crawl Evidence</th>
                  <th className="pb-2.5 pl-3 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {module7InternalLinks.slice(0, 50).map((link) => (
                  <tr key={link.id} className="align-top">
                    <td className="py-3 pr-3 font-mono text-[11px] text-[var(--text-primary)]">
                      <p>{link.sourceUrl}</p>
                      <p className="text-[#7047EB] dark:text-[#22D3EE]">
                        → {link.targetUrl}
                      </p>
                    </td>
                    <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">
                      {link.suggestedAnchorText}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[var(--text-muted)]">
                      {link.existsInCrawl
                        ? `Present in crawl (${link.currentInboundCount ?? 0} inbound)`
                        : 'Missing in latest crawl'}
                    </td>
                    <td className="py-3 pl-3 text-[var(--text-secondary)]">
                      {link.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
