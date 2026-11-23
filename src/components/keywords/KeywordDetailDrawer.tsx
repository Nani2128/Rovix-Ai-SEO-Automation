import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CrawledPageOption,
  KeywordBusinessProfile,
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
} from '../../types/keywords';
import { AnimatedDrawer } from '../animation/MotionPrimitives';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function KeywordDetailDrawer({
  keyword,
  businessProfile,
  crawledUrls,
  canApprove,
  onClose,
  onTransitionState,
  onUpdateDetails,
}: {
  keyword: KeywordIntelligenceRecord | null;
  businessProfile: KeywordBusinessProfile;
  crawledUrls: CrawledPageOption[];
  canApprove: boolean;
  onClose: () => void;
  onTransitionState: (
    keywordId: string,
    payload: {
      nextState: KeywordWorkflowState;
      assignedTo?: string | null;
      notes?: string;
    },
  ) => Promise<void>;
  onUpdateDetails: (
    keywordId: string,
    payload: {
      intent?: KeywordIntent;
      targetUrl?: string | null;
      mappingStatus?: KeywordUrlMappingRecord['mappingStatus'];
      recommendedSlug?: string | null;
      notes?: string;
    },
  ) => Promise<void>;
}) {
  const [intent, setIntent] = useState<KeywordIntent>('Informational');
  const [mappingStatus, setMappingStatus] =
    useState<KeywordUrlMappingRecord['mappingStatus']>('mapped_existing');
  const [targetUrl, setTargetUrl] = useState('');
  const [recommendedSlug, setRecommendedSlug] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!keyword) return;
    setIntent(keyword.intent);
    setMappingStatus(keyword.mapping?.mappingStatus ?? 'recommend_new_page');
    setTargetUrl(keyword.mapping?.targetUrl ?? '');
    setRecommendedSlug(keyword.mapping?.recommendedSlug ?? '');
    setAssignedTo(keyword.assignedTo ?? '');
    setNotes(keyword.strategistNotes ?? '');
  }, [keyword]);

  if (!keyword) {
    return (
      <AnimatedDrawer
        open={false}
        onClose={onClose}
        ariaLabel="Keyword intelligence details"
      >
        <div />
      </AnimatedDrawer>
    );
  }

  const sb = keyword.scoreBreakdown;
  const factors = [
    { label: 'Business Relevance', value: sb.businessRelevance, weight: '28%' },
    { label: 'Search Intent', value: sb.searchIntent, weight: '16%' },
    { label: 'Evidence Quality', value: sb.evidenceQuality, weight: '18%' },
    { label: 'Market Alignment', value: sb.marketRelevance, weight: '12%' },
    { label: 'Page Suitability', value: sb.pageSuitability, weight: '12%' },
    { label: 'Competition Evidence', value: sb.competitionEvidence, weight: '6%' },
    { label: 'Conversion Potential', value: sb.conversionPotential, weight: '8%' },
  ];

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      await onUpdateDetails(keyword.id, {
        intent,
        mappingStatus,
        targetUrl: mappingStatus === 'mapped_existing' ? targetUrl : null,
        recommendedSlug:
          mappingStatus === 'recommend_new_page' ? recommendedSlug : null,
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleWorkflow = async (nextState: KeywordWorkflowState) => {
    setSaving(true);
    try {
      await onTransitionState(keyword.id, {
        nextState,
        assignedTo: nextState === 'assigned' ? assignedTo || 'SEO Strategist' : assignedTo || null,
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  const profileApproved = businessProfile.approvalStatus === 'approved';

  return (
    <AnimatedDrawer
      open={Boolean(keyword)}
      onClose={onClose}
      ariaLabel={`Inspect keyword ${keyword.keyword}`}
      maxWidthClass="max-w-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-extrabold text-[var(--text-primary)]">
              {keyword.keyword}
            </h2>
            <StatusBadge
              label={keyword.workflowState}
              tone={
                keyword.workflowState === 'approved' || keyword.workflowState === 'measured'
                  ? 'success'
                  : keyword.workflowState === 'rejected'
                    ? 'danger'
                    : 'indigo'
              }
            />
            {keyword.isAiSuggestion && (
              <span className="inline-flex items-center gap-1 rounded border border-purple-300/60 bg-purple-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-purple-700 dark:text-purple-300">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI Suggestion
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {keyword.targetCountry}
            {keyword.targetCity ? ` · ${keyword.targetCity}` : ''} ({keyword.targetLanguage}) ·
            Metric geo scope: {keyword.metricGeographyScope} · Score {keyword.opportunityScore}/100
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyword drawer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        {/* Strict Data Separation Snapshot */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Market Monthly Vol.
            </div>
            <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)]">
              {keyword.marketSearchVolume !== null
                ? keyword.marketSearchVolume.toLocaleString()
                : 'Unavailable'}
            </div>
            <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
              Source: {keyword.volumeSource === 'unavailable' ? 'Planner API required' : 'Keyword Planner'}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Trends Index (0–100)
            </div>
            <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)]">
              {keyword.relativeTrendIndex !== null
                ? `${keyword.relativeTrendIndex}/100 (${keyword.trendDirection})`
                : 'Unavailable'}
            </div>
            <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
              Relative interest, never volume
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              GSC Site Performance
            </div>
            <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)]">
              {keyword.gscImpressions !== null
                ? `${keyword.gscImpressions.toLocaleString()} impr.`
                : 'Not observed'}
            </div>
            <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
              {keyword.gscClicks !== null
                ? `${keyword.gscClicks} clicks · pos ${keyword.gscAvgPosition?.toFixed(1)}`
                : 'Site-only metric, not market demand'}
            </div>
          </div>
        </div>

        {/* Explainable Opportunity Score Breakdown */}
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Explainable Opportunity Score ({keyword.opportunityScore}/100)
            </h3>
            <StatusBadge
              label={sb.relevanceGatePassed ? 'Relevance Gate Passed' : 'Relevance Gate Failed'}
              tone={sb.relevanceGatePassed ? 'success' : 'danger'}
            />
          </div>

          <div className="space-y-2">
            {factors.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--text-secondary)]">
                    {f.label} ({f.weight})
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {f.value}/100
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, Math.min(100, f.value))}%`,
                      background:
                        'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <ul className="space-y-1 border-t border-[var(--border-hairline)] pt-2.5 text-[11px] text-[var(--text-muted)]">
            {sb.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>

        {/* Cannibalization Warning if present */}
        {keyword.mapping && keyword.mapping.cannibalizationRisk !== 'none' && (
          <div className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/35 p-3.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Cannibalization Risk ({keyword.mapping.cannibalizationRisk.toUpperCase()})
              </span>
            </div>
            <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
              {keyword.mapping.resolutionRecommendation}
            </p>
          </div>
        )}

        {/* Intent & URL Mapping Editor */}
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[var(--text-primary)]">
            <Link2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>Intent Verification &amp; Target URL Mapping</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="kw-edit-intent" className="block font-semibold text-[var(--text-primary)]">
                Intent ({keyword.intentInferred ? 'Currently Inferred' : 'Verified'})
              </label>
              <select
                id="kw-edit-intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value as KeywordIntent)}
                disabled={!canApprove}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="Informational">Informational</option>
                <option value="Navigational">Navigational</option>
                <option value="Commercial">Commercial</option>
                <option value="Transactional">Transactional</option>
                <option value="Local">Local</option>
              </select>
            </div>

            <div>
              <label htmlFor="kw-edit-map-mode" className="block font-semibold text-[var(--text-primary)]">
                Target Strategy
              </label>
              <select
                id="kw-edit-map-mode"
                value={mappingStatus}
                onChange={(e) =>
                  setMappingStatus(
                    e.target.value as KeywordUrlMappingRecord['mappingStatus'],
                  )
                }
                disabled={!canApprove}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="mapped_existing">Map to Existing Page</option>
                <option value="recommend_new_page">Recommend New Page</option>
                <option value="unmapped">Leave Unmapped</option>
              </select>
            </div>
          </div>

          {mappingStatus === 'mapped_existing' && (
            <div>
              <label htmlFor="kw-edit-url" className="block font-semibold text-[var(--text-primary)]">
                Target Crawled URL
              </label>
              {crawledUrls.length > 0 ? (
                <select
                  id="kw-edit-url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  disabled={!canApprove}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                >
                  <option value="">Select crawled page...</option>
                  {crawledUrls.map((u) => (
                    <option key={u.url} value={u.url}>
                      {u.url} ({u.statusCode} · {u.indexability})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="kw-edit-url"
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  disabled={!canApprove}
                  placeholder="https://yourdomain.com/target-page"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                />
              )}
            </div>
          )}

          {mappingStatus === 'recommend_new_page' && (
            <div>
              <label htmlFor="kw-edit-slug" className="block font-semibold text-[var(--text-primary)]">
                Recommended New URL Slug
              </label>
              <input
                id="kw-edit-slug"
                type="text"
                value={recommendedSlug}
                onChange={(e) => setRecommendedSlug(e.target.value)}
                disabled={!canApprove}
                placeholder="/recommended-topic-page"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
              />
            </div>
          )}

          <div>
            <label htmlFor="kw-edit-notes" className="block font-semibold text-[var(--text-primary)]">
              Strategist Rationale &amp; Notes
            </label>
            <textarea
              id="kw-edit-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canApprove}
              placeholder="Document SERP angle, content brief focus, or internal link targets..."
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>

          {canApprove && (
            <div className="flex justify-end">
              <InteractiveButton
                variant="secondary"
                size="sm"
                loading={saving}
                onClick={() => void handleSaveDetails()}
              >
                <span>Save Intent &amp; Mapping</span>
              </InteractiveButton>
            </div>
          )}
        </div>

        {/* 9-State Workflow Approval & Assignment */}
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Approval &amp; Execution Workflow
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Current: {keyword.workflowState}
            </span>
          </div>

          {!profileApproved && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              Owner approval of Business Context Profile is required before approving or assigning keywords.
            </div>
          )}

          {canApprove ? (
            <>
              <div>
                <label htmlFor="kw-assign-to" className="block font-semibold text-[var(--text-primary)]">
                  Assignee (Strategist / Content Owner)
                </label>
                <input
                  id="kw-assign-to"
                  type="text"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="e.g., Content Team / Simon Baler"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {(['approved', 'assigned', 'implemented', 'measured', 'needs-data', 'rejected'] as KeywordWorkflowState[]).map(
                  (st) => {
                    const disabled =
                      saving ||
                      keyword.workflowState === st ||
                      ((st === 'approved' || st === 'assigned' || st === 'implemented' || st === 'measured') &&
                        !profileApproved);
                    return (
                      <InteractiveButton
                        key={st}
                        variant={st === 'approved' ? 'primary' : st === 'rejected' ? 'danger' : 'secondary'}
                        size="sm"
                        disabled={disabled}
                        onClick={() => void handleWorkflow(st)}
                      >
                        {st === 'approved' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                        <span className="capitalize">{st}</span>
                      </InteractiveButton>
                    );
                  },
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">
              Your current role has read-only access to keyword workflow approvals.
            </p>
          )}
        </div>

        {/* Evidence Items Timeline */}
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-2.5">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Source Evidence Provenance ({keyword.evidence.length})
          </h3>
          {keyword.evidence.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              No detailed evidence snapshots recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {keyword.evidence.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {ev.sourceProvider} · {ev.measurementKind.replace(/_/g, ' ')}
                    </span>
                    {ev.rawMetricValue && (
                      <span className="font-mono text-[10.5px] font-semibold text-[var(--accent-primary)]">
                        {ev.rawMetricValue}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {ev.summary}
                  </p>
                  {ev.sourceUrl && (
                    <div className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      <span className="truncate">{ev.sourceUrl}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AnimatedDrawer>
  );
}
