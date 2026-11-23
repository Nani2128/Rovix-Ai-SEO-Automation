import { Sparkles, TicketPlus } from 'lucide-react';
import type {
  OnPageIssueRecord,
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
} from '../../types/onPage';
import {
  approvalStatusLabel,
  approvalTextClass,
  lifecycleLabel,
  lifecycleTextClass,
  scoreTextClass,
  severityTextClass,
  targetFieldLabel,
} from './onPageUiHelpers';

interface OnPageAnalyzerSectionProps {
  pages: OnPagePageAnalysisRecord[];
  selectedPage: OnPagePageAnalysisRecord | null;
  pageIssues: OnPageIssueRecord[];
  pageRecommendations: OnPageRecommendationRecord[];
  canEdit: boolean;
  canApprove: boolean;
  canCreateTasks: boolean;
  geminiConfigured: boolean;
  busyAction: string | null;
  onSelectPage: (pageId: string) => void;
  onGenerateAiForPage: (pageId: string) => void;
  onCreateTaskFromIssue: (issueId: string) => void;
  onDecideApproval: (
    entityKind: 'recommendation' | 'issue',
    entityId: string,
    decision: 'approved' | 'rejected',
  ) => void;
  onOpenDraftEditor: (pageId: string) => void;
}

export function OnPageAnalyzerSection({
  pages,
  selectedPage,
  pageIssues,
  pageRecommendations,
  canEdit,
  canApprove,
  canCreateTasks,
  geminiConfigured,
  busyAction,
  onSelectPage,
  onGenerateAiForPage,
  onCreateTaskFromIssue,
  onDecideApproval,
  onOpenDraftEditor,
}: OnPageAnalyzerSectionProps) {
  if (!selectedPage) {
    return (
      <div className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-muted)]">
        Run On-Page Analysis first to inspect page-level diagnostics and 10-category explainable scores.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Selector & Header Summary */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="onpage-analyzer-page-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Inspect Crawled Page
            </label>
            <select
              id="onpage-analyzer-page-select"
              value={selectedPage.id}
              onChange={(e) => onSelectPage(e.target.value)}
              className="mt-1 w-full max-w-xl rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.slug} — Score:{' '}
                  {p.overallScore !== null ? `${p.overallScore}/100` : 'Insufficient'} (
                  {p.issueCount} issues)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canEdit || busyAction !== null}
              onClick={() => onGenerateAiForPage(selectedPage.id)}
              title={
                geminiConfigured
                  ? 'Generate AI-powered optimization recommendations via Gemini (Stage 5 budget checked)'
                  : 'Requires server-side GEMINI_API_KEY configuration'
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/50 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#22D3EE]" />
              <span>
                {busyAction === `ai:${selectedPage.id}`
                  ? 'Generating AI Suggestions…'
                  : 'AI Optimize Page'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenDraftEditor(selectedPage.id)}
              className="rounded-xl bg-[#7047EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer"
            >
              Open Side-by-Side Draft Editor
            </button>
          </div>
        </div>

        {/* Verified Page Signals Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-4 lg:grid-cols-6">
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Overall Score</p>
            <p
              className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${scoreTextClass(selectedPage.overallScore)}`}
            >
              {selectedPage.overallScore !== null
                ? `${selectedPage.overallScore}/100`
                : 'Insufficient Evidence'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">HTTP / Indexability</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--text-primary)]">
              {selectedPage.statusCode} · {selectedPage.indexability}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Body Word Count</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--text-primary)]">
              {selectedPage.htmlExtract.wordCount !== null
                ? `${selectedPage.htmlExtract.wordCount} words`
                : 'Unavailable (no HTML)'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Canonical</p>
            <p className="mt-0.5 text-xs font-semibold capitalize text-[var(--text-primary)]">
              {selectedPage.canonicalStatus.replace(/_/g, ' ')}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Detected Schema</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-primary)]">
              {selectedPage.htmlExtract.detectedSchemaTypes.length > 0
                ? selectedPage.htmlExtract.detectedSchemaTypes.join(', ')
                : 'None detected'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Lifecycle</p>
            <p className={`mt-0.5 text-xs ${lifecycleTextClass(selectedPage.lifecycleStatus)}`}>
              {lifecycleLabel(selectedPage.lifecycleStatus)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          {selectedPage.scoreBreakdown.caveat}
        </p>
      </section>

      {/* Keyword-Aware Mapping & Cannibalization Panel */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
          Keyword-Aware Page Alignment (Module 5 &amp; Module 7 Evidence)
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Assigned Primary Keyword
            </p>
            <p className="mt-1 font-semibold text-[var(--text-primary)]">
              {selectedPage.keywordContext.existingPrimaryKeyword ||
                'Not yet mapped (requires verified assignment)'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Status:{' '}
              <span className="font-medium capitalize text-[var(--text-secondary)]">
                {selectedPage.keywordContext.mappingStatus.replace(/_/g, ' ')}
              </span>
              {selectedPage.keywordContext.searchIntent
                ? ` · Intent: ${selectedPage.keywordContext.searchIntent}`
                : ''}
              {selectedPage.keywordContext.targetGeography
                ? ` · Geo: ${selectedPage.keywordContext.targetGeography}`
                : ''}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Candidate / Supporting Keywords
            </p>
            <p className="mt-1 text-[var(--text-primary)]">
              {selectedPage.keywordContext.recommendedPrimaryKeyword
                ? `Recommended: ${selectedPage.keywordContext.recommendedPrimaryKeyword}`
                : selectedPage.keywordContext.secondaryKeywords.length > 0
                  ? selectedPage.keywordContext.secondaryKeywords.join(', ')
                  : 'No unmapped candidate keywords discovered for this URL.'}
            </p>
            {selectedPage.keywordContext.recommendedKeywordReason && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {selectedPage.keywordContext.recommendedKeywordReason}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Cannibalization &amp; Duplication Check
            </p>
            {selectedPage.keywordContext.cannibalizationWarnings.length > 0 ? (
              <ul className="mt-1 space-y-1 text-rose-600 dark:text-rose-400">
                {selectedPage.keywordContext.cannibalizationWarnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                No keyword cannibalization conflict detected against current project mappings.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 10-Category Explainable Deterministic Score Breakdown */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              10-Category Explainable On-Page Score Breakdown
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Scored categories ({selectedPage.scoreBreakdown.scoredCategoriesCount}/10) are separated strictly from Unavailable Evidence ({selectedPage.scoreBreakdown.unavailableCategoriesCount}/10).
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {selectedPage.scoreBreakdown.categories.map((cat) => (
            <div
              key={cat.category}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  {cat.label}
                </h4>
                {cat.status === 'unavailable_evidence' ? (
                  <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)]">
                    Unavailable Evidence
                  </span>
                ) : (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${scoreTextClass(
                      cat.score !== null
                        ? Math.round((cat.score / cat.maxScore) * 100)
                        : null,
                    )}`}
                  >
                    {cat.score}/{cat.maxScore}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {cat.summary}
              </p>
              {cat.problems.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-amber-700 dark:text-amber-300">
                  {cat.problems.map((p, idx) => (
                    <li key={idx}>• Problem: {p}</li>
                  ))}
                </ul>
              )}
              {cat.recommendations.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--text-muted)]">
                  {cat.recommendations.map((r, idx) => (
                    <li key={idx}>→ {r}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Page Issues & Recommendations Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Detected Page Issues ({pageIssues.length})
          </h3>
          {pageIssues.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No open on-page issues detected on this URL.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {pageIssues.map((iss) => (
                <div key={iss.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`text-xs ${severityTextClass(iss.severity)}`}>
                        {iss.severity}
                      </span>{' '}
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {iss.title}
                      </span>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {iss.description}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Action: {iss.recommendedAction}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {iss.linkedTicketId ? (
                        <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {iss.linkedTicketId}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!canCreateTasks || busyAction !== null}
                          onClick={() => onCreateTaskFromIssue(iss.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer disabled:opacity-50"
                        >
                          <TicketPlus className="h-3 w-3" />
                          <span>Create Task</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Page Recommendations ({pageRecommendations.length})
          </h3>
          {pageRecommendations.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No recommendations stored for this URL yet. Click AI Optimize Page or inspect metadata.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {pageRecommendations.map((rec) => (
                <div key={rec.id} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {targetFieldLabel(rec.targetField)}
                      {rec.isAiGenerated ? (
                        <span className="ml-1.5 font-mono text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE]">
                          [AI · {rec.aiModel ?? 'Gemini'}]
                        </span>
                      ) : (
                        <span className="ml-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                          [Deterministic]
                        </span>
                      )}
                    </span>
                    <span className={`text-[11px] ${approvalTextClass(rec.approvalStatus)}`}>
                      {approvalStatusLabel(rec.approvalStatus)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Current: {rec.currentValue}
                  </p>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Suggested: {rec.suggestedValue}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {rec.reason}
                  </p>
                  {canApprove && rec.approvalStatus === 'pending_review' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          onDecideApproval('recommendation', rec.id, 'approved')
                        }
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          onDecideApproval('recommendation', rec.id, 'rejected')
                        }
                        className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/50 cursor-pointer disabled:opacity-50"
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
    </div>
  );
}
