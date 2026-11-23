import type { OnPagePageAnalysisRecord } from '../../types/onPage';

interface OnPageSchemaSectionProps {
  pages: OnPagePageAnalysisRecord[];
  onOpenDraftEditor: (pageId: string) => void;
}

export function OnPageSchemaSection({
  pages,
  onOpenDraftEditor,
}: OnPageSchemaSectionProps) {
  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div>
        <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
          Structured Data (JSON-LD) Audit — Detected vs. Suggested
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Clearly separates verified JSON-LD blocks detected in crawled HTML from recommended schema types matched to each page type.
        </p>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
          No analyzed pages yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="pb-2.5 pr-3 font-semibold">Page &amp; Type</th>
                <th className="pb-2.5 px-3 font-semibold">Detected JSON-LD</th>
                <th className="pb-2.5 px-3 font-semibold">Validation Status</th>
                <th className="pb-2.5 px-3 font-semibold">Suggested Schema Types</th>
                <th className="pb-2.5 pl-3 text-right font-semibold">Draft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {pages.map((pg) => {
                const invalidBlocks = pg.htmlExtract.jsonLdBlocks.filter(
                  (b) => !b.validJson || b.missingRecommendedProps.length > 0,
                );
                return (
                  <tr key={pg.id} className="align-top">
                    <td className="py-3 pr-3 max-w-[200px]">
                      <p className="truncate font-mono text-xs font-medium text-[var(--text-primary)]">
                        {pg.slug}
                      </p>
                      <p className="mt-0.5 capitalize text-[11px] text-[var(--text-muted)]">
                        {pg.pageType.replace(/_/g, ' ')}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      {pg.htmlExtract.detectedSchemaTypes.length > 0 ? (
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                          {pg.htmlExtract.detectedSchemaTypes.join(', ')}
                        </p>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          None detected in crawl
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-[260px]">
                      {pg.htmlExtract.invalidSchemaCount > 0 ? (
                        <div className="space-y-1 text-rose-600 dark:text-rose-400">
                          <p className="font-semibold">
                            {pg.htmlExtract.invalidSchemaCount} schema warning(s)
                          </p>
                          {invalidBlocks.slice(0, 2).map((blk, i) => (
                            <p key={i} className="text-[11px]">
                              {blk.parseError
                                ? `Parse error: ${blk.parseError}`
                                : `Missing props: ${blk.missingRecommendedProps.join(', ')}`}
                            </p>
                          ))}
                        </div>
                      ) : pg.htmlExtract.detectedSchemaTypes.length > 0 ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Valid JSON-LD
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Missing structured data
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#7047EB] dark:text-[#22D3EE]">
                      {pg.suggestedSchemaTypes.length > 0
                        ? pg.suggestedSchemaTypes.join(', ')
                        : '—'}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDraftEditor(pg.id)}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
                      >
                        Add in Draft
                      </button>
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
