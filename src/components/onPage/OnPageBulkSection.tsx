import { useMemo, useState } from 'react';
import { CheckSquare, Download, Sparkles } from 'lucide-react';
import type {
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
} from '../../types/onPage';
import { onPageService } from '../../services/onPageService';
import {
  scoreTextClass,
  triggerFileDownload,
} from './onPageUiHelpers';

interface OnPageBulkSectionProps {
  projectId: string;
  pages: OnPagePageAnalysisRecord[];
  recommendations: OnPageRecommendationRecord[];
  canEdit: boolean;
  canBulkApprove: boolean;
  busyAction: string | null;
  onRunBulkAi: (pageIds: string[]) => void;
  onBulkApproveRecommendations: (recommendationIds: string[]) => void;
}

export function OnPageBulkSection({
  projectId,
  pages,
  recommendations,
  canEdit,
  canBulkApprove,
  busyAction,
  onRunBulkAi,
  onBulkApproveRecommendations,
}: OnPageBulkSectionProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [missingMetaOnly, setMissingMetaOnly] = useState(false);
  const [lowScoreOnly, setLowScoreOnly] = useState(false);
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);

  const filteredPages = useMemo(() => {
    return pages.filter((p) => {
      if (missingMetaOnly && p.title && p.metaDescription) return false;
      if (lowScoreOnly && (p.overallScore === null || p.overallScore >= 70)) {
        return false;
      }
      if (unmappedOnly && p.keywordContext.mappingStatus !== 'unmapped') {
        return false;
      }
      return true;
    });
  }, [pages, missingMetaOnly, lowScoreOnly, unmappedOnly]);

  const selectedSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds]);

  const pendingRecIdsForSelected = useMemo(() => {
    if (selectedSet.size === 0) return [];
    return recommendations
      .filter(
        (r) =>
          selectedSet.has(r.pageAnalysisId) && r.approvalStatus === 'pending_review',
      )
      .map((r) => r.id);
  }, [recommendations, selectedSet]);

  const toggleAllVisible = () => {
    const visibleIds = filteredPages.map((p) => p.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
    if (allSelected) {
      setSelectedPageIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedPageIds((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const togglePage = (id: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Bulk Page Optimization &amp; Exports
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Select crawled pages to run budget-checked AI recommendations, bulk approve pending recommendations, or export filtered CSV/JSON reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={
              !canEdit || selectedPageIds.length === 0 || busyAction !== null
            }
            onClick={() => setConfirmAiOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7047EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Bulk AI Suggest ({selectedPageIds.length})</span>
          </button>

          <button
            type="button"
            disabled={
              !canBulkApprove ||
              pendingRecIdsForSelected.length === 0 ||
              busyAction !== null
            }
            onClick={() =>
              onBulkApproveRecommendations(pendingRecIdsForSelected)
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Bulk Approve ({pendingRecIdsForSelected.length})</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerFileDownload(
                onPageService.getExportUrl(
                  projectId,
                  'csv',
                  selectedPageIds.length > 0 ? selectedPageIds : undefined,
                ),
                'rovix-onpage-report.csv',
              )
            }
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerFileDownload(
                onPageService.getExportUrl(
                  projectId,
                  'json',
                  selectedPageIds.length > 0 ? selectedPageIds : undefined,
                ),
                'rovix-onpage-report.json',
              )
            }
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Inline Bulk AI Confirmation Banner (zero window.confirm) */}
      {confirmAiOpen && (
        <div className="rounded-xl border border-[#7047EB]/40 bg-[#7047EB]/8 p-4 space-y-2.5">
          <p className="text-xs font-bold text-[var(--text-primary)]">
            Confirm Bulk AI Recommendation Batch ({selectedPageIds.length} page(s))
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            This will invoke server-side Gemini AI for {selectedPageIds.length} selected page(s), subject to your active Stage 5 token/cost budget rules. All generated outputs are stored as pending recommendations and require human approval.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => {
                setConfirmAiOpen(false);
                onRunBulkAi(selectedPageIds);
              }}
              className="rounded-xl bg-[#7047EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
            >
              Confirm &amp; Generate
            </button>
            <button
              type="button"
              onClick={() => setConfirmAiOpen(false)}
              className="rounded-xl border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 border-y border-[var(--border-hairline)] py-3 text-xs text-[var(--text-secondary)]">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={missingMetaOnly}
            onChange={(e) => setMissingMetaOnly(e.target.checked)}
            className="accent-[#7047EB]"
          />
          <span>Missing Title or Meta Description</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={lowScoreOnly}
            onChange={(e) => setLowScoreOnly(e.target.checked)}
            className="accent-[#7047EB]"
          />
          <span>Score &lt; 70</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={unmappedOnly}
            onChange={(e) => setUnmappedOnly(e.target.checked)}
            className="accent-[#7047EB]"
          />
          <span>Unmapped Keyword Only</span>
        </label>
      </div>

      {/* Multi-Select Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="pb-2.5 pr-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all filtered pages"
                  checked={
                    filteredPages.length > 0 &&
                    filteredPages.every((p) => selectedSet.has(p.id))
                  }
                  onChange={toggleAllVisible}
                  className="accent-[#7047EB]"
                />
              </th>
              <th className="pb-2.5 px-3 font-semibold">Page URL</th>
              <th className="pb-2.5 px-3 font-semibold">Score</th>
              <th className="pb-2.5 px-3 font-semibold">Issues</th>
              <th className="pb-2.5 px-3 font-semibold">Missing Metadata</th>
              <th className="pb-2.5 pl-3 font-semibold">Pending Recs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {filteredPages.map((pg) => {
              const pendingCount = recommendations.filter(
                (r) =>
                  r.pageAnalysisId === pg.id &&
                  r.approvalStatus === 'pending_review',
              ).length;
              return (
                <tr key={pg.id}>
                  <td className="py-2.5 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${pg.slug}`}
                      checked={selectedSet.has(pg.id)}
                      onChange={() => togglePage(pg.id)}
                      className="accent-[#7047EB]"
                    />
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-[var(--text-primary)]">
                    {pg.slug}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`font-mono font-bold tabular-nums ${scoreTextClass(pg.overallScore)}`}
                    >
                      {pg.overallScore !== null ? `${pg.overallScore}` : 'N/A'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-secondary)]">
                    {pg.issueCount}
                  </td>
                  <td className="py-2.5 px-3 text-[var(--text-muted)]">
                    {[
                      !pg.title ? 'Title' : null,
                      !pg.metaDescription ? 'Meta' : null,
                      !pg.h1 ? 'H1' : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Complete'}
                  </td>
                  <td className="py-2.5 pl-3 font-mono tabular-nums text-[var(--text-primary)]">
                    {pendingCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
