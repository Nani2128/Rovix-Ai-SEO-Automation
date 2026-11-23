import { useMemo, useState } from 'react';
import { Check, Layers, X } from 'lucide-react';
import type {
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
  TopicalCoverageClassification,
} from '../../types/strategy';
import {
  COVERAGE_LABELS,
  approvalLabel,
  approvalToneClass,
  confidenceToneClass,
  coverageToneClass,
} from './strategyUiHelpers';

const CLASSIFICATIONS: readonly TopicalCoverageClassification[] = [
  'verified_existing',
  'recommended_opportunity',
  'ai_suggestion',
  'unavailable_evidence',
];

interface TopicalAuthoritySectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
}

export function TopicalAuthoritySection({
  workspace,
  busyAction,
  onDecideApproval,
}: TopicalAuthoritySectionProps) {
  const [filter, setFilter] = useState<TopicalCoverageClassification | 'all'>(
    'all',
  );

  const pageById = useMemo(
    () => new Map(workspace.pages.map((p) => [p.id, p])),
    [workspace.pages],
  );

  const filteredClusters = useMemo(
    () =>
      workspace.topicalClusters.filter((c) =>
        filter === 'all' ? true : c.coverageClassification === filter,
      ),
    [workspace.topicalClusters, filter],
  );

  if (!workspace.activeVersion) {
    return (
      <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
        Generate an SEO Strategy version first to map pillar topics, supporting subtopics, and verified vs opportunity coverage.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers
                className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                aria-hidden="true"
              />
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Topical Authority &amp; Content Coverage Clusters
              </h2>
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              Strictly separates Verified Existing Coverage (from crawled URLs), Recommended Opportunities (from keyword clusters &amp; competitor gaps), AI Suggestions, and Unavailable Evidence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                filter === 'all'
                  ? 'bg-[#7047EB]/15 text-[#7047EB] dark:text-[#22D3EE] font-semibold'
                  : 'border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              All ({workspace.topicalClusters.length})
            </button>
            {CLASSIFICATIONS.map((cls) => {
              const count = workspace.topicalClusters.filter(
                (c) => c.coverageClassification === cls,
              ).length;
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setFilter(cls)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    filter === cls
                      ? 'bg-[#7047EB]/15 text-[#7047EB] dark:text-[#22D3EE] font-semibold'
                      : 'border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {COVERAGE_LABELS[cls]} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredClusters.map((cluster) => (
          <article
            key={cluster.id}
            className="flex flex-col justify-between rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
          >
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {cluster.pillarTopic}
                </h3>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <span
                    className={coverageToneClass(cluster.coverageClassification)}
                  >
                    {COVERAGE_LABELS[cluster.coverageClassification]}
                  </span>
                  {cluster.priorityScore !== null && (
                    <>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="font-mono tabular-nums text-[var(--text-primary)]">
                        Score {cluster.priorityScore}/100
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className={confidenceToneClass(cluster.confidence)}>
                  {cluster.confidence}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className={approvalToneClass(cluster.approvalStatus)}>
                  {approvalLabel(cluster.approvalStatus)}
                </span>
                {cluster.isAiGenerated && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      AI Suggestion
                    </span>
                  </>
                )}
              </div>

              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                {cluster.evidenceSummary}
              </p>

              {cluster.supportingSubtopics.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em]">
                    Supporting Subtopics
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-primary)]">
                    {cluster.supportingSubtopics.join(' · ')}
                  </p>
                </div>
              )}

              {cluster.verifiedPageUrls.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-[0.04em]">
                    Verified Existing URLs ({cluster.verifiedPageUrls.length})
                  </div>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    {cluster.verifiedPageUrls.map((url) => (
                      <li key={url} className="truncate">
                        {url}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cluster.missingOpportunities.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] uppercase tracking-[0.04em]">
                    Missing Content Opportunities
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--text-secondary)]">
                    {cluster.missingOpportunities.map((opp, idx) => (
                      <li key={idx}>{opp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {cluster.linkedPageIds.length > 0 && (
                <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                  <strong className="font-semibold text-[var(--text-secondary)]">
                    Linked Architecture Pages:
                  </strong>{' '}
                  {cluster.linkedPageIds
                    .map((id) => pageById.get(id)?.slug ?? id)
                    .join(', ')}
                </div>
              )}
            </div>

            {workspace.canApproveStrategy && (
              <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-[var(--border-hairline)] pt-3">
                <button
                  type="button"
                  disabled={
                    busyAction !== null || cluster.approvalStatus === 'approved'
                  }
                  onClick={() =>
                    void onDecideApproval(
                      'topical_cluster',
                      cluster.id,
                      'approved',
                      `Approved topical cluster "${cluster.pillarTopic}".`,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span>Approve Cluster</span>
                </button>
                <button
                  type="button"
                  disabled={
                    busyAction !== null || cluster.approvalStatus === 'rejected'
                  }
                  onClick={() =>
                    void onDecideApproval(
                      'topical_cluster',
                      cluster.id,
                      'rejected',
                      `Rejected topical cluster "${cluster.pillarTopic}".`,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  <span>Reject</span>
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
