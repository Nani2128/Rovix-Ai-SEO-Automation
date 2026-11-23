import type {
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
} from '../../types/onPage';
import {
  approvalStatusLabel,
  approvalTextClass,
  targetFieldLabel,
} from './onPageUiHelpers';

interface OnPageMetadataSectionProps {
  pages: OnPagePageAnalysisRecord[];
  recommendations: OnPageRecommendationRecord[];
  canApprove: boolean;
  busyAction: string | null;
  onOpenDraftEditor: (pageId: string) => void;
  onDecideApproval: (
    entityKind: 'recommendation',
    entityId: string,
    decision: 'approved' | 'rejected',
  ) => void;
}

export function OnPageMetadataSection({
  pages,
  recommendations,
  canApprove,
  busyAction,
  onOpenDraftEditor,
  onDecideApproval,
}: OnPageMetadataSectionProps) {
  const metaRecs = recommendations.filter(
    (r) =>
      r.targetField === 'title' ||
      r.targetField === 'meta_description' ||
      r.targetField === 'h1',
  );

  return (
    <div className="space-y-5">
      {/* Title / Meta / H1 Audit Matrix */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
          Title Tag, Meta Description &amp; H1 Audit ({pages.length} Pages)
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Character lengths are measured strictly from crawled metadata. Optimal guidance: Titles 30–60 chars, Meta Descriptions 110–160 chars.
        </p>

        {pages.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            No analyzed pages yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2.5 pr-3 font-semibold">URL</th>
                  <th className="pb-2.5 px-3 font-semibold">Title Tag</th>
                  <th className="pb-2.5 px-3 font-semibold">Meta Description</th>
                  <th className="pb-2.5 px-3 font-semibold">Primary H1</th>
                  <th className="pb-2.5 pl-3 text-right font-semibold">Editor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {pages.map((pg) => {
                  const titleLen = pg.title?.trim().length ?? 0;
                  const metaLen = pg.metaDescription?.trim().length ?? 0;
                  return (
                    <tr key={pg.id} className="align-top">
                      <td className="py-3 pr-3 font-mono text-xs text-[var(--text-primary)] max-w-[180px] truncate">
                        {pg.slug}
                      </td>
                      <td className="py-3 px-3 max-w-[230px]">
                        <p className="text-[var(--text-primary)]">
                          {pg.title || (
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              Missing Title
                            </span>
                          )}
                        </p>
                        <p
                          className={`mt-0.5 font-mono text-[11px] ${
                            titleLen === 0 || titleLen > 60 || titleLen < 30
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {titleLen} chars
                        </p>
                      </td>
                      <td className="py-3 px-3 max-w-[260px]">
                        <p className="line-clamp-2 text-[var(--text-secondary)]">
                          {pg.metaDescription || (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              Missing Meta Description
                            </span>
                          )}
                        </p>
                        <p
                          className={`mt-0.5 font-mono text-[11px] ${
                            metaLen === 0 || metaLen > 160 || metaLen < 110
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {metaLen} chars
                        </p>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <p className="text-[var(--text-primary)]">
                          {pg.h1 || (
                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                              Missing H1
                            </span>
                          )}
                        </p>
                        {pg.htmlExtract.h1List.length > 1 && (
                          <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            {pg.htmlExtract.h1List.length} H1 tags found
                          </p>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenDraftEditor(pg.id)}
                          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:border-[#7047EB]/45 cursor-pointer"
                        >
                          Edit Draft
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

      {/* Metadata Recommendations Queue */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
          Metadata Optimization Recommendations ({metaRecs.length})
        </h3>
        {metaRecs.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            No metadata optimization recommendations pending.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-hairline)]">
            {metaRecs.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {targetFieldLabel(rec.targetField)}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {rec.pageUrl}
                    </span>
                    <span className="font-mono text-[11px] text-[#7047EB] dark:text-[#22D3EE]">
                      {rec.isAiGenerated ? `AI (${rec.aiModel ?? 'Gemini'})` : 'Deterministic'}
                    </span>
                    <span className={`text-[11px] ${approvalTextClass(rec.approvalStatus)}`}>
                      {approvalStatusLabel(rec.approvalStatus)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Current: {rec.currentValue}
                  </p>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Proposed: {rec.suggestedValue}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {rec.reason}
                  </p>
                </div>

                {canApprove && rec.approvalStatus === 'pending_review' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        onDecideApproval('recommendation', rec.id, 'approved')
                      }
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        onDecideApproval('recommendation', rec.id, 'rejected')
                      }
                      className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/45 cursor-pointer disabled:opacity-50"
                    >
                      Reject
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
