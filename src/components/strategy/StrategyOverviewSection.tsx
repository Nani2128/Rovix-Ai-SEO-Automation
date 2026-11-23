import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Cpu,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategySectionRecommendation,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import {
  approvalLabel,
  approvalToneClass,
  confidenceToneClass,
  formatShortDate,
} from './strategyUiHelpers';

interface StrategyOverviewSectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onGenerateStrategy: () => void;
  onLaunchWorkflow: (objective?: string) => void;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => void;
}

function RecommendationGroupCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: StrategySectionRecommendation[];
}) {
  return (
    <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[11.5px] text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <span className="font-mono text-xs tabular-nums text-[var(--text-muted)] shrink-0">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-3 divide-y divide-[var(--border-hairline)]">
        {items.map((item) => (
          <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                {item.title}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className={confidenceToneClass(item.confidence)}>
                  {item.needsResearch
                    ? 'Needs Research'
                    : `${item.confidence} confidence`}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-muted)]">{item.source}</span>
                {item.isAiGenerated && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      AI Suggestion
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {item.summary}
            </p>
            {item.evidence.length > 0 && (
              <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-muted)]">
                {item.evidence.slice(0, 2).map((ev, idx) => (
                  <div key={`${item.id}-ev-${idx}`} className="truncate">
                    <span className="font-medium text-[var(--text-secondary)]">
                      Evidence:
                    </span>{' '}
                    {ev.label} — {ev.observedDetail}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function StrategyOverviewSection({
  workspace,
  busyAction,
  onGenerateStrategy,
  onLaunchWorkflow,
  onDecideApproval,
}: StrategyOverviewSectionProps) {
  const [workflowObjective, setWorkflowObjective] = useState('');
  const { evidenceReadiness: r, activeVersion, objectives } = workspace;

  const readinessTone =
    r.overallReadiness === 'Ready'
      ? 'text-emerald-600 dark:text-emerald-400'
      : r.overallReadiness === 'Partial Evidence'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

  const intentEntries = activeVersion
    ? Object.entries(activeVersion.payload.searchIntentBreakdown)
    : [];
  const totalIntentCount = intentEntries.reduce((acc, [, v]) => acc + v, 0);

  return (
    <div className="space-y-5">
      {/* Evidence Readiness Bar */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-display font-semibold text-[var(--text-primary)]">
                Evidence Readiness
              </span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className={`font-semibold ${readinessTone}`}>
                {r.overallReadiness}
              </span>
              {r.latestCrawlAt && (
                <>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span className="text-[var(--text-muted)]">
                    Latest crawl {formatShortDate(r.latestCrawlAt)}
                  </span>
                </>
              )}
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              Every recommendation is strictly grounded in verified project modules. Missing inputs are explicitly marked &ldquo;Needs Research&rdquo; and never fabricated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {workspace.canEditStrategy && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={onGenerateStrategy}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--accent-on-pill)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                }}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${busyAction === 'generate' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {activeVersion
                    ? 'Regenerate Strategy Version'
                    : 'Generate Evidence-Driven Strategy'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 6 Evidence Counters */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Crawled URLs
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {r.crawledUrlsCount}
            </div>
            <Link
              to="/audit"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7047EB] dark:text-[#22D3EE] hover:underline"
            >
              <span>Audit &amp; Crawl</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Open Tech Issues
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {r.technicalIssuesCount}
            </div>
            <Link
              to="/audit/issues"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7047EB] dark:text-[#22D3EE] hover:underline"
            >
              <span>Tech Issues</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Keywords / Clusters
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {r.keywordsCount} / {r.keywordClustersCount}
            </div>
            <Link
              to="/keywords"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7047EB] dark:text-[#22D3EE] hover:underline"
            >
              <span>Keyword Lab</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Approved Markets
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {r.approvedLocationsCount}
            </div>
            <Link
              to="/geographic-intelligence"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7047EB] dark:text-[#22D3EE] hover:underline"
            >
              <span>Geo Intel</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Competitor Gaps
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {r.contentGapsCount}
            </div>
            <Link
              to="/competitors"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#7047EB] dark:text-[#22D3EE] hover:underline"
            >
              <span>Competitors</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Business Profile
            </div>
            <div className="mt-1 text-sm font-bold text-[var(--text-primary)]">
              {r.businessProfileApproved
                ? 'Approved'
                : r.hasBusinessProfile
                  ? 'Pending Review'
                  : 'Needs Setup'}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Vitals runs: <span className="font-mono tabular-nums">{r.performanceMeasurementsCount}</span>
            </div>
          </div>
        </div>

        {/* Missing Evidence Callout */}
        {r.missingDataItems.length > 0 && (
          <div className="mt-3.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Missing Evidence ({r.missingDataItems.length} item
                {r.missingDataItems.length === 1 ? '' : 's'}) — Flagged as &ldquo;Needs Research&rdquo;
              </span>
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-[var(--text-secondary)]">
              {r.missingDataItems.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!activeVersion ? (
        <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center">
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            No SEO Strategy Version Generated Yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
            Generate your first evidence-backed SEO Strategy &amp; Website Architecture blueprint for{' '}
            <strong className="text-[var(--text-primary)]">
              {workspace.projectName}
            </strong>
            . The engine analyzes your existing crawl, technical issues, keyword clusters, approved target locations, and competitor content gaps without fabricating data.
          </p>
          {workspace.canEditStrategy && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={onGenerateStrategy}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-[var(--accent-on-pill)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                }}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${busyAction === 'generate' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Generate Strategy v1</span>
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Active Strategy Version Governance Header */}
          <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                    v{activeVersion.versionNumber}: {activeVersion.title}
                  </h2>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span
                    className={`text-xs font-semibold ${approvalToneClass(activeVersion.approvalStatus)}`}
                  >
                    {approvalLabel(activeVersion.approvalStatus)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {activeVersion.summary}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                  <span>Created by {activeVersion.createdBy}</span>
                  <span>·</span>
                  <span>{formatShortDate(activeVersion.createdAt)}</span>
                  {activeVersion.approvedBy && (
                    <>
                      <span>·</span>
                      <span>
                        Reviewed by {activeVersion.approvedBy} (
                        {formatShortDate(activeVersion.approvedAt)})
                      </span>
                    </>
                  )}
                </div>
              </div>

              {workspace.canApproveStrategy && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={
                      busyAction !== null ||
                      activeVersion.approvalStatus === 'approved'
                    }
                    onClick={() =>
                      onDecideApproval(
                        'strategy_version',
                        activeVersion.id,
                        'approved',
                        'Approved SEO strategy version for architecture & roadmap execution.',
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Approve Strategy</span>
                  </button>
                  <button
                    type="button"
                    disabled={
                      busyAction !== null ||
                      activeVersion.approvalStatus === 'rejected'
                    }
                    onClick={() =>
                      onDecideApproval(
                        'strategy_version',
                        activeVersion.id,
                        'rejected',
                        'Requires further evidence or strategy revision before approval.',
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>

            {/* Target Audience + Search Intent Breakdown */}
            <div className="mt-4 grid gap-4 border-t border-[var(--border-hairline)] pt-4 lg:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Target Audience &amp; Positioning
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-primary)]">
                  {activeVersion.payload.targetAudienceSummary}
                </p>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Recommended Structure Summary
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {activeVersion.payload.recommendedStructureSummary}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  <span>Search Intent Distribution</span>
                  <span className="font-mono tabular-nums normal-case">
                    {totalIntentCount} mapped signal{totalIntentCount === 1 ? '' : 's'}
                  </span>
                </div>
                {totalIntentCount === 0 ? (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    Needs Research — Discover and verify keyword intent in Keyword Lab.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {intentEntries.map(([intent, count]) => {
                      const pct = Math.round((count / totalIntentCount) * 100);
                      return (
                        <div key={intent} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[var(--text-primary)]">
                              {intent}
                            </span>
                            <span className="font-mono tabular-nums text-[var(--text-muted)]">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                            <div
                              className="h-full rounded-full bg-[#7047EB] dark:bg-[#22D3EE]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Primary SEO Objectives with Approval Controls */}
          <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                  Primary SEO Objectives
                </h3>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  Explainable objectives derived from project evidence with human approval governance.
                </p>
              </div>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                {objectives.length} objective{objectives.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {objectives.map((obj) => (
                <div
                  key={obj.id}
                  className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {obj.title}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span
                        className={`text-[11px] font-semibold ${confidenceToneClass(obj.confidence)}`}
                      >
                        {obj.needsResearch ? 'Needs Research' : obj.confidence}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span
                        className={`text-[11px] font-semibold ${approvalToneClass(obj.approvalStatus)}`}
                      >
                        {approvalLabel(obj.approvalStatus)}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {obj.source}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {obj.rationale}
                    </p>
                    {obj.evidence.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        {obj.evidence.slice(0, 3).map((ev, i) => (
                          <span key={`${obj.id}-e-${i}`}>
                            <strong className="font-medium text-[var(--text-secondary)]">
                              {ev.label}:
                            </strong>{' '}
                            {ev.observedDetail}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {workspace.canApproveStrategy && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={
                          busyAction !== null || obj.approvalStatus === 'approved'
                        }
                        onClick={() =>
                          onDecideApproval('objective', obj.id, 'approved')
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          busyAction !== null || obj.approvalStatus === 'rejected'
                        }
                        onClick={() =>
                          onDecideApproval('objective', obj.id, 'rejected')
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
          </section>

          {/* 4 Structured Strategy Recommendation Sections */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RecommendationGroupCard
              title="Recommended Service & Core Pages"
              subtitle="Derived from approved Business Profile services and crawled commercial URLs"
              items={activeVersion.payload.recommendedServicePages}
            />
            <RecommendationGroupCard
              title="Recommended Landing Pages"
              subtitle="Commercial and transactional clusters needing dedicated landing pages"
              items={activeVersion.payload.recommendedLandingPages}
            />
            <RecommendationGroupCard
              title="Approved Geographic Location Pages"
              subtitle="Strictly restricted to owner-approved markets in Geographic Intelligence"
              items={activeVersion.payload.recommendedLocationPages}
            />
            <RecommendationGroupCard
              title="Blog, Resource & Technical Priorities"
              subtitle="Informational clusters, competitor gaps, and open technical blockers"
              items={[
                ...activeVersion.payload.technicalAndContentPriorities,
                ...activeVersion.payload.blogContentCategories,
              ]}
            />
          </div>

          {/* Agent Factory Orchestration Integration */}
          <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Cpu
                    className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                    aria-hidden="true"
                  />
                  <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                    Agent Factory Multi-Agent Strategy Workflow
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Orchestrate Research, Keyword Intelligence, Competitor Intelligence, Technical SEO, Content Strategy, and QA agents via the existing Stage 2–6 workflow engine with human approval gates and token budget checks.
                </p>
              </div>
              <Link
                to="/agent-factory"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:underline whitespace-nowrap shrink-0"
              >
                <span>Open Agent Factory</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {workspace.canLaunchWorkflows && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={workflowObjective}
                  onChange={(e) => setWorkflowObjective(e.target.value)}
                  placeholder="Optional custom strategy workflow objective (e.g., Audit commercial service page gaps & internal link plan)..."
                  className="min-w-0 flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    onLaunchWorkflow(workflowObjective.trim() || undefined);
                    setWorkflowObjective('');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#7047EB]/40 bg-[#7047EB]/10 px-3.5 py-2 text-xs font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:bg-[#7047EB]/18 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Launch Strategy Agent Workflow</span>
                </button>
              </div>
            )}

            {workspace.recentStrategyWorkflows.length > 0 && (
              <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Recent Project Workflows
                </div>
                <div className="mt-2 divide-y divide-[var(--border-hairline)]">
                  {workspace.recentStrategyWorkflows.slice(0, 4).map((wf) => (
                    <div
                      key={wf.workflowId}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0 truncate font-medium text-[var(--text-primary)]">
                        {wf.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] shrink-0">
                        <span className="font-mono">{wf.workflowId}</span>
                        <span>·</span>
                        <span className="capitalize text-[var(--text-secondary)]">
                          {wf.status.replace(/_/g, ' ')}
                        </span>
                        <span>·</span>
                        <span>{formatShortDate(wf.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
