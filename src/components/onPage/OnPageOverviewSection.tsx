import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileSearch2,
  Play,
  ShieldCheck,
} from 'lucide-react';
import type { OnPageWorkspacePayload } from '../../types/onPage';
import {
  formatShortTimestamp,
  lifecycleLabel,
  lifecycleTextClass,
  scoreTextClass,
  severityTextClass,
} from './onPageUiHelpers';

interface OnPageOverviewSectionProps {
  workspace: OnPageWorkspacePayload;
  busyAction: string | null;
  onRunAnalysis: () => void;
  onLaunchWorkflow: () => void;
  onSelectPageAndOpenTab: (
    pageId: string,
    tab: 'analyzer' | 'content' | 'metadata',
  ) => void;
  onNavigateTab: (
    tab: 'pages' | 'analyzer' | 'metadata' | 'content' | 'bulk' | 'approvals',
  ) => void;
}

export function OnPageOverviewSection({
  workspace,
  busyAction,
  onRunAnalysis,
  onLaunchWorkflow,
  onSelectPageAndOpenTab,
  onNavigateTab,
}: OnPageOverviewSectionProps) {
  const { overview } = workspace;
  const topIssues = workspace.issues.slice(0, 8);
  const lowestScoringPages = [...workspace.pages]
    .sort((a, b) => (a.overallScore ?? -1) - (b.overallScore ?? -1))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Honest Empty State when no crawl or no analysis run yet */}
      {workspace.pages.length === 0 ? (
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {workspace.latestCrawlId
                  ? 'Ready to Analyze Crawled Website Pages'
                  : 'Website Crawl Required Before On-Page Analysis'}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                {workspace.latestCrawlId
                  ? `Latest verified crawl ${workspace.latestCrawlId} (${formatShortTimestamp(workspace.latestCrawlAt)}) is available. Run On-Page Analysis to inspect title tags, meta descriptions, headings, visible body copy, image alt attributes, JSON-LD schema, keyword alignment, and internal linking across every crawled URL.`
                  : 'Rovix AI never fabricates SEO scores without crawl data. Run an authorized site crawl in Audit & Crawl first, then return here to evaluate every discovered URL.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {workspace.latestCrawlId ? (
                <button
                  type="button"
                  disabled={!workspace.canEditOnPage || busyAction !== null}
                  onClick={onRunAnalysis}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {busyAction === 'analyze'
                      ? 'Analyzing Crawled Pages…'
                      : 'Run On-Page Analysis'}
                  </span>
                </button>
              ) : (
                <Link
                  to="/audit/new"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1]"
                >
                  <span>Start Authorized Crawl</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Real Persisted KPI Row (Zero fabricated metrics) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Pages Analyzed
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {overview.crawledPagesAnalyzed}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {overview.scoredPagesCount} scored · {overview.unavailableEvidenceCount} limited evidence
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Avg Deterministic Score
          </p>
          <p
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${scoreTextClass(overview.averageScore)}`}
          >
            {overview.averageScore !== null ? `${overview.averageScore}/100` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {overview.averageScore !== null
              ? '10-category verified signals'
              : 'Insufficient Evidence'}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Open Issues
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {overview.totalOpenIssues}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Across {overview.pagesWithIssues} page(s)
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Awaiting Approval
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {overview.pagesAwaitingApproval}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {overview.draftRecommendationsCount} pending recommendations
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Approved Drafts
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#7047EB] dark:text-[#22D3EE]">
            {overview.approvedDraftsCount}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {workspace.drafts.length} total versioned drafts
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Crawl Verified
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {overview.verifiedImprovementsCount}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Confirmed via fresh recrawl
          </p>
        </div>
      </section>

      {/* Main 2-Column Overview Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Top Priority On-Page Findings */}
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Priority On-Page Findings
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Deduplicated findings detected directly from verified crawl metadata &amp; HTML snapshots.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('pages')}
              className="text-xs font-semibold text-[#7047EB] hover:underline dark:text-[#22D3EE] cursor-pointer"
            >
              Inspect All Pages →
            </button>
          </div>

          {topIssues.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
              No on-page issues recorded yet. Run On-Page Analysis against your latest crawl.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {topIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={severityTextClass(issue.severity)}>
                        {issue.severity}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {issue.title}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
                      {issue.pageUrl}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {issue.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPageAndOpenTab(issue.pageAnalysisId, 'analyzer')
                    }
                    className="shrink-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
                  >
                    Analyze
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Rail: Lowest-Scoring Pages + Governance + Agent Factory */}
        <div className="space-y-5 lg:col-span-5">
          <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Pages Needing Attention
              </h2>
              <FileSearch2
                className="h-4 w-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
            </div>

            {lowestScoringPages.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Analyzed pages will appear here ranked by deterministic score and open findings.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[var(--border-hairline)]">
                {lowestScoringPages.map((pg) => (
                  <div
                    key={pg.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-medium text-[var(--text-primary)]">
                        {pg.slug}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {pg.issueCount} issue(s) ·{' '}
                        <span className={lifecycleTextClass(pg.lifecycleStatus)}>
                          {lifecycleLabel(pg.lifecycleStatus)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${scoreTextClass(pg.overallScore)}`}
                      >
                        {pg.overallScore !== null ? `${pg.overallScore}` : 'N/A'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectPageAndOpenTab(pg.id, 'content')}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer"
                      >
                        Draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Agent Factory Multi-Agent Coordination & Governance Guardrail */}
          <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu
                  className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                  aria-hidden="true"
                />
                <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Agent Factory On-Page Pipeline
                </h2>
              </div>
              <button
                type="button"
                disabled={!workspace.canLaunchWorkflows || busyAction !== null}
                onClick={onLaunchWorkflow}
                className="rounded-xl bg-[#7047EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'workflow' ? 'Dispatching…' : 'Launch DAG'}
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              Coordinates existing specialist agents (Technical SEO, Keyword Intelligence, Content Strategy, Content Generation, QA, Reporting) with human approval gates and Stage 5 budget controls.
            </p>

            {workspace.recentOnPageWorkflows.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-[var(--border-hairline)] pt-3">
                {workspace.recentOnPageWorkflows.slice(0, 3).map((wf) => (
                  <div
                    key={wf.workflowId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {wf.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                      {wf.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--text-muted)]">
              <ShieldCheck
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                Safe Governance: Rovix AI never modifies live websites automatically. All edits stay versioned drafts until approved, applied externally, and verified by a fresh crawl.
              </span>
            </div>

            {workspace.latestRun && (
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Last Run: {formatShortTimestamp(workspace.latestRun.completedAt)}
                </span>
                <span className="font-mono">{workspace.latestRun.crawlId}</span>
              </div>
            )}

            {!workspace.geminiConfigured && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Deterministic crawl analysis is active. Configure <span className="font-mono">GEMINI_API_KEY</span> on the server to enable AI-assisted recommendations.
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
