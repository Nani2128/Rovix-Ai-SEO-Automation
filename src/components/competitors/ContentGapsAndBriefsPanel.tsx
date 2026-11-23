import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Layers,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  CompetitorWorkspaceResponse,
  ContentGapRecommendation,
  ContentGapType,
  ContentGapWorkflowState,
} from '../../types/competitors';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const PRIORITY_TONE: Record<ContentGapRecommendation['priorityTier'], BadgeTone> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'info',
  'Needs Evidence': 'neutral',
};

const WORKFLOW_TONE: Record<ContentGapWorkflowState, BadgeTone> = {
  discovered: 'neutral',
  strategist_recommended: 'indigo',
  owner_approved: 'success',
  rejected: 'danger',
  queued_for_content: 'success',
};

const GAP_TYPE_LABEL: Record<ContentGapType, string> = {
  missing_topic_page: 'Missing Topic Page',
  shallow_depth: 'Shallow Depth / Content',
  missing_schema: 'Missing JSON-LD Schema',
  missing_geo_coverage: 'Missing Geo Market Coverage',
  weak_heading_structure: 'Weak Heading Structure',
};

export function ContentGapsAndBriefsPanel({
  workspace,
  canApprove,
  canRecommend,
  busyGapId,
  onDecideGap,
}: {
  workspace: CompetitorWorkspaceResponse;
  canApprove: boolean;
  canRecommend: boolean;
  busyGapId: string | null;
  onDecideGap: (
    gapId: string,
    action: 'recommend' | 'approve' | 'reject' | 'send_to_keywords' | 'create_task',
    notes?: string,
  ) => Promise<void>;
}) {
  const [gapTypeFilter, setGapTypeFilter] = useState<'all' | ContentGapType>('all');
  const [stateFilter, setStateFilter] = useState<'all' | ContentGapWorkflowState>('all');
  const [expandedBriefs, setExpandedBriefs] = useState<Record<string, boolean>>({});
  const [notesByGap, setNotesByGap] = useState<Record<string, string>>({});

  const filteredGaps = useMemo(() => {
    return workspace.contentGaps.filter((g) => {
      if (gapTypeFilter !== 'all' && g.gapType !== gapTypeFilter) return false;
      if (stateFilter !== 'all' && g.workflowState !== stateFilter) return false;
      return true;
    });
  }, [workspace.contentGaps, gapTypeFilter, stateFilter]);

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <GlassPanel className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={gapTypeFilter}
            onChange={(e) => setGapTypeFilter(e.target.value as 'all' | ContentGapType)}
            aria-label="Filter by Content Gap Type"
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            <option value="all">All Gap Types ({workspace.contentGaps.length})</option>
            <option value="missing_topic_page">Missing Topic Page</option>
            <option value="missing_schema">Missing Schema</option>
            <option value="missing_geo_coverage">Missing Geo Coverage</option>
            <option value="shallow_depth">Shallow Content Depth</option>
            <option value="weak_heading_structure">Weak Headings</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as 'all' | ContentGapWorkflowState)}
            aria-label="Filter by Workflow State"
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            <option value="all">All Workflow States</option>
            <option value="discovered">Discovered</option>
            <option value="strategist_recommended">Strategist Recommended</option>
            <option value="owner_approved">Owner Approved</option>
            <option value="queued_for_content">Queued for Content</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          Scores are rule-based & transparent; when own-site crawl baseline is missing, gaps report Needs Evidence.
        </div>
      </GlassPanel>

      {filteredGaps.length === 0 ? (
        <EmptyStateCard
          title="No content gap recommendations found"
          description="Add a competitor and click 'Analyze Live Pages' to compare competitor headings, schema types, word counts, and topics against your crawled project pages and geographic markets."
        />
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap) => {
            const isBusy = busyGapId === gap.id;
            const briefOpen = Boolean(expandedBriefs[gap.id]);

            return (
              <GlassPanel key={gap.id} className="p-5 space-y-4">
                {/* Header & Score */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-[var(--text-primary)]">
                        {gap.topicTitle}
                      </span>
                      <StatusBadge
                        label={GAP_TYPE_LABEL[gap.gapType]}
                        tone="indigo"
                      />
                      <StatusBadge
                        label={gap.priorityTier}
                        tone={PRIORITY_TONE[gap.priorityTier]}
                      />
                      <StatusBadge
                        label={gap.workflowState.replace(/_/g, ' ')}
                        tone={WORKFLOW_TONE[gap.workflowState]}
                      />
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Target Keyword: <span className="font-semibold text-[var(--text-primary)]">{gap.targetKeyword}</span> · Rival:{' '}
                      <span className="font-mono">{gap.competitorDomain}</span> · Market: {gap.targetMarket} · Confidence: {gap.confidence}
                    </div>
                  </div>

                  <div className="shrink-0 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Opportunity Score
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
                      {gap.opportunityScore !== null ? `${gap.opportunityScore}/100` : 'Needs Evidence'}
                    </div>
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {gap.explanation}
                </p>

                {/* Side-by-Side Content Comparison */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-3.5 space-y-1.5 text-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Project Crawled Page
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-primary)] truncate">
                      {gap.projectUrl ?? 'No matching crawled URL found'}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Title: {gap.projectTitle || 'Unavailable'}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      H1: {gap.projectH1 || 'Unavailable'} · Word Count:{' '}
                      {gap.projectWordCount !== null ? gap.projectWordCount : 'Unavailable'}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Schema: {gap.projectSchemaTypes.length > 0 ? gap.projectSchemaTypes.join(', ') : 'None observed'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-3.5 space-y-1.5 text-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Competitor Live Snapshot ({gap.competitorDomain})
                    </div>
                    <div className="font-mono text-[11px] text-[var(--accent-primary)] truncate">
                      {gap.competitorUrl}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Title: {gap.competitorTitle || 'Unavailable'}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      H1: {gap.competitorH1 || 'Unavailable'} · Word Count:{' '}
                      <span className="font-mono font-semibold">
                        {gap.competitorWordCount !== null ? gap.competitorWordCount.toLocaleString() : 'Unavailable'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Schema: {gap.competitorSchemaTypes.length > 0 ? gap.competitorSchemaTypes.join(', ') : 'None detected'}
                    </div>
                  </div>
                </div>

                {/* Evidence & Missing Info */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[11px]">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 space-y-1">
                    <div className="font-semibold text-[var(--text-primary)]">Supporting Evidence</div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[var(--text-secondary)]">
                      {gap.supportingEvidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  {gap.missingInfo.length > 0 && (
                    <div className="rounded-xl border border-amber-300/40 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Missing Evidence / External Limits</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-800 dark:text-amber-200/90">
                        {gap.missingInfo.map((mi, i) => (
                          <li key={i}>{mi}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Collapsible Content Brief Plan */}
                <div className="border-t border-[var(--border-hairline)] pt-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBriefs((prev) => ({
                          ...prev,
                          [gap.id]: !prev[gap.id],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                    >
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {briefOpen ? 'Hide Content Brief Plan' : 'Inspect Recommended Content Brief'}
                      </span>
                    </button>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      {gap.linkedKeywordId && (
                        <Link
                          to="/keywords"
                          className="font-semibold text-[var(--accent-primary)] hover:underline"
                        >
                          Linked Keyword ({gap.linkedKeywordId})
                        </Link>
                      )}
                      {gap.linkedTicketId && (
                        <Link
                          to="/tasks"
                          className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Task Queued ({gap.linkedTicketId})
                        </Link>
                      )}
                    </div>
                  </div>

                  {briefOpen && (
                    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs space-y-2">
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">Target Slug:</span>{' '}
                        <span className="font-mono text-[var(--accent-primary)]">{gap.recommendedBrief.targetSlug}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">Suggested Title:</span>{' '}
                        {gap.recommendedBrief.suggestedTitle}
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">Suggested H1:</span>{' '}
                        {gap.recommendedBrief.suggestedH1}
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">Recommended Sections:</span>
                        <ul className="mt-1 list-disc pl-5 text-[var(--text-secondary)]">
                          {gap.recommendedBrief.suggestedSections.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Schema Suggestion: {gap.recommendedBrief.schemaSuggestion.join(', ')} · Geo:{' '}
                        {gap.recommendedBrief.geoAlignment}
                      </div>
                    </div>
                  )}

                  {/* Strategist Notes & Human-in-the-Loop Action Buttons */}
                  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                    <input
                      type="text"
                      aria-label={`Notes for ${gap.topicTitle}`}
                      value={notesByGap[gap.id] ?? gap.strategistNotes ?? ''}
                      onChange={(e) =>
                        setNotesByGap((prev) => ({ ...prev, [gap.id]: e.target.value }))
                      }
                      placeholder="Add editorial note or approval rationale..."
                      disabled={!canRecommend || isBusy}
                      className="w-full lg:max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canRecommend && gap.workflowState === 'discovered' && (
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          loading={isBusy}
                          onClick={() =>
                            void onDecideGap(gap.id, 'recommend', notesByGap[gap.id])
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Recommend</span>
                        </InteractiveButton>
                      )}

                      {canApprove && gap.workflowState !== 'owner_approved' && gap.workflowState !== 'queued_for_content' && (
                        <InteractiveButton
                          variant="primary"
                          size="sm"
                          loading={isBusy}
                          onClick={() =>
                            void onDecideGap(gap.id, 'approve', notesByGap[gap.id])
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Approve Plan</span>
                        </InteractiveButton>
                      )}

                      {canApprove && gap.workflowState !== 'rejected' && (
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          loading={isBusy}
                          onClick={() =>
                            void onDecideGap(gap.id, 'reject', notesByGap[gap.id])
                          }
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reject</span>
                        </InteractiveButton>
                      )}

                      {canRecommend && !gap.linkedKeywordId && (
                        <InteractiveButton
                          variant="subtle"
                          size="sm"
                          loading={isBusy}
                          onClick={() =>
                            void onDecideGap(gap.id, 'send_to_keywords', notesByGap[gap.id])
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Send to Keyword Lab</span>
                        </InteractiveButton>
                      )}

                      {canRecommend &&
                        !gap.linkedTicketId &&
                        (gap.workflowState === 'owner_approved' || canApprove) && (
                          <InteractiveButton
                            variant="secondary"
                            size="sm"
                            loading={isBusy}
                            onClick={() =>
                              void onDecideGap(gap.id, 'create_task', notesByGap[gap.id])
                            }
                          >
                            {gap.workflowState === 'owner_approved' ? (
                              <Send className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>Queue Action Task</span>
                          </InteractiveButton>
                        )}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
