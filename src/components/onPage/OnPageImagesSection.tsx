import { useMemo, useState } from 'react';
import type { OnPagePageAnalysisRecord } from '../../types/onPage';

interface OnPageImagesSectionProps {
  pages: OnPagePageAnalysisRecord[];
  onOpenDraftEditor: (pageId: string) => void;
}

export function OnPageImagesSection({
  pages,
  onOpenDraftEditor,
}: OnPageImagesSectionProps) {
  const [onlyIssues, setOnlyIssues] = useState(true);

  const imageRows = useMemo(() => {
    const rows: {
      pageId: string;
      slug: string;
      src: string;
      alt: string | null;
      hasAltAttribute: boolean;
      isEmptyAlt: boolean;
      width: string | null;
      height: string | null;
      loading: string | null;
      suggestedAlt: string | null;
      hasProblem: boolean;
    }[] = [];

    for (const pg of pages) {
      for (const img of pg.htmlExtract.images) {
        const hasProblem =
          !img.hasAltAttribute || img.isEmptyAlt || !img.width || !img.height;
        if (onlyIssues && !hasProblem) continue;
        rows.push({
          pageId: pg.id,
          slug: pg.slug,
          src: img.src,
          alt: img.alt,
          hasAltAttribute: img.hasAltAttribute,
          isEmptyAlt: img.isEmptyAlt,
          width: img.width,
          height: img.height,
          loading: img.loading,
          suggestedAlt: img.suggestedAlt,
          hasProblem,
        });
      }
    }
    return rows;
  }, [pages, onlyIssues]);

  const totals = useMemo(() => {
    let totalImages = 0;
    let missingAlt = 0;
    let missingDims = 0;
    for (const pg of pages) {
      totalImages += pg.htmlExtract.imagesTotal;
      missingAlt += pg.htmlExtract.imagesMissingAlt;
      missingDims += pg.htmlExtract.imagesMissingDimensions;
    }
    return { totalImages, missingAlt, missingDims };
  }, [pages]);

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Image Alt Text &amp; Attribute Optimization
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Parsed from stored HTML snapshots: {totals.totalImages} total image(s) ·{' '}
            {totals.missingAlt} missing alt · {totals.missingDims} missing width/height dimensions.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
            className="rounded border-[var(--border-hairline)] accent-[#7047EB]"
          />
          <span>Show images with alt/dimension gaps only</span>
        </label>
      </div>

      {imageRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
          {totals.totalImages === 0
            ? 'No <img> elements were extracted from stored HTML snapshots yet.'
            : 'No images match the current issue filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="pb-2.5 pr-3 font-semibold">Page</th>
                <th className="pb-2.5 px-3 font-semibold">Image Source</th>
                <th className="pb-2.5 px-3 font-semibold">Alt Status</th>
                <th className="pb-2.5 px-3 font-semibold">Dimensions / Loading</th>
                <th className="pb-2.5 px-3 font-semibold">Suggested Alt</th>
                <th className="pb-2.5 pl-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {imageRows.slice(0, 120).map((row, idx) => (
                <tr key={`${row.pageId}-${row.src}-${idx}`} className="align-top">
                  <td className="py-3 pr-3 font-mono text-[11px] text-[var(--text-primary)] max-w-[160px] truncate">
                    {row.slug}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[var(--text-secondary)] max-w-[200px] truncate">
                    {row.src}
                  </td>
                  <td className="py-3 px-3">
                    {!row.hasAltAttribute ? (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        Missing alt attribute
                      </span>
                    ) : row.isEmptyAlt ? (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        Empty alt=&quot;&quot;
                      </span>
                    ) : (
                      <span className="text-[var(--text-primary)]">{row.alt}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[var(--text-muted)]">
                    {row.width && row.height
                      ? `${row.width}×${row.height}`
                      : 'Missing W/H'}
                    {row.loading ? ` · loading=${row.loading}` : ''}
                  </td>
                  <td className="py-3 px-3 max-w-[220px] text-[var(--text-secondary)]">
                    {row.suggestedAlt || '—'}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenDraftEditor(row.pageId)}
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:border-[#7047EB]/45 cursor-pointer"
                    >
                      Draft Fix
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
