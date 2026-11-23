import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  ListChecks,
  Search,
  X,
} from 'lucide-react';
import type {
  RoadmapPriority,
  SeoRoadmapItemRecord,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import {
  approvalLabel,
  approvalToneClass,
  priorityToneClass,
} from './strategyUiHelpers';

const PRIORITIES: readonly RoadmapPriority[] = [
  'Critical',
  'High',
  'Medium',
  'Low',
  'Needs Research',
];

const CATEGORY_LABELS: Record<SeoRoadmapItemRecord['category'], string> = {
  technical_foundation: 'Technical Foundation',
  site_architecture: 'Site Architecture',
  keyword_optimization: 'Keyword Optimization',
  internal_linking: 'Internal Linking',
  topical_content: 'Topical Content',
  local_geo_landing: 'Local / Geo Landing',
};

interface SeoRoadmapSectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
  onCreateTask: (itemId: string) => Promise<void>;
  onLaunchRoadmapWorkflow: (itemId: string) => Promise<void>;
}

export function SeoRoadmapSection({
  workspace,
  busyAction,
  onDecideApproval,
  onCreateTask,
  onLaunchRoadmapWorkflow,
}: SeoRoadmapSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<RoadmapPriority | 'all'>(
    'all',
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspace.roadmapItems.filter((item) => {
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.responsibleRole.toLowerCase().includes(q) ||
        (item.relatedUrl?.toLowerCase().includes(q) ?? false) ||
        (item.relatedKeyword?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [workspace.roadmapItems, searchQuery, priorityFilter]);

  if (!workspace.activeVersion) {
    return (
      <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
        Generate an SEO Strategy version first to review the explainable prioritized roadmap and promote approved tasks.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListChecks
                className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                aria-hidden="true"
              />
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Actionable SEO Roadmap &amp; Explainable Prioritization
              </h2>
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              Scores combine 7 transparent factors (Business Relevance, Search Intent, Technical Feasibility, Keyword Evidence, Competitor Gaps, Geography, Dependency Readiness). Effort ranges are labeled estimates; rankings, traffic, and revenue are never promised.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)] shrink-0">
            {filteredItems.length} of {workspace.roadmapItems.length} task
            {workspace.roadmapItems.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roadmap tasks, URLs, roles, or keywords..."
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as RoadmapPriority | 'all')
            }
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 divide-y divide-[var(--border-hairline)]">
          {filteredItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const isApproved = item.approvalStatus === 'approved';
            const b = item.scoreBreakdown;

            return (
              <div key={item.id} className="py-3.5 first:pt-1 last:pb-0">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${priorityToneClass(item.priority)}`}
                      >
                        {item.priority}
                        {item.priorityScore !== null
                          ? ` (${item.priorityScore}/100)`
                          : ''}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <h3 className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                      <span>{CATEGORY_LABELS[item.category]}</span>
                      <span>·</span>
                      <span>{item.estimatedEffort}</span>
                      <span>·</span>
                      <span>Owner: {item.responsibleRole}</span>
                      {item.recommendedAgentId && (
                        <>
                          <span>·</span>
                          <span>
                            Agent: {item.recommendedAgentId.replace(/_/g, ' ')}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span
                        className={`font-semibold ${approvalToneClass(item.approvalStatus)}`}
                      >
                        {approvalLabel(item.approvalStatus)}
                      </span>
                      <span>·</span>
                      <span className="capitalize text-[var(--text-secondary)]">
                        {item.implementationStatus.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                      {item.relatedUrl && (
                        <span className="font-mono truncate max-w-sm">
                          URL: {item.relatedUrl}
                        </span>
                      )}
                      {item.linkedTicketId && (
                        <Link
                          to="/tasks"
                          className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          <CheckSquare className="h-3 w-3" aria-hidden="true" />
                          <span>Ticket {item.linkedTicketId}</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                      {item.linkedWorkflowId && (
                        <Link
                          to="/agent-factory"
                          className="inline-flex items-center gap-1 font-mono font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:underline"
                        >
                          <Cpu className="h-3 w-3" aria-hidden="true" />
                          <span>Workflow {item.linkedWorkflowId}</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Governance & Execution Action Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : item.id)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Score &amp; Evidence</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>

                    {workspace.canApproveStrategy && (
                      <>
                        <button
                          type="button"
                          disabled={busyAction !== null || isApproved}
                          onClick={() =>
                            void onDecideApproval(
                              'roadmap_item',
                              item.id,
                              'approved',
                              `Approved roadmap task "${item.title}".`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={
                            busyAction !== null ||
                            item.approvalStatus === 'rejected'
                          }
                          onClick={() =>
                            void onDecideApproval(
                              'roadmap_item',
                              item.id,
                              'rejected',
                              `Rejected roadmap task "${item.title}".`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    )}

                    {workspace.canCreateTasks && !item.linkedTicketId && (
                      <button
                        type="button"
                        disabled={busyAction !== null || !isApproved}
                        title={
                          isApproved
                            ? 'Promote approved roadmap item into Tasks & Approvals'
                            : 'Approve this roadmap item first before creating a task'
                        }
                        onClick={() => void onCreateTask(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#7047EB]/40 bg-[#7047EB]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:bg-[#7047EB]/18 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                      >
                        <CheckSquare className="h-3 w-3" aria-hidden="true" />
                        <span>Create Task</span>
                      </button>
                    )}

                    {workspace.canLaunchWorkflows && !item.linkedWorkflowId && (
                      <button
                        type="button"
                        disabled={busyAction !== null || !isApproved}
                        title={
                          isApproved
                            ? 'Launch an Agent Factory workflow for this approved roadmap item'
                            : 'Approve this roadmap item first before launching an agent workflow'
                        }
                        onClick={() => void onLaunchRoadmapWorkflow(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                      >
                        <Cpu className="h-3 w-3" aria-hidden="true" />
                        <span>Launch Agent Workflow</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable 7-Factor Priority Breakdown & Evidence Drawer */}
                {isExpanded && (
                  <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs lg:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        7-Factor Priority Score Breakdown
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Business Relevance</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.businessRelevance}/20
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Search Intent</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.searchIntent}/15
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Technical Feasibility</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.technicalFeasibility}/15
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Keyword Evidence</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.keywordEvidence}/15
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Competitor Gaps</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.competitorGapEvidence}/15
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Geographic Fit</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.geographicRelevance}/10
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--text-muted)]">Dependency Ready</dt>
                          <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                            {b.dependencyReadiness}/10
                          </dd>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <dt className="text-[var(--text-primary)]">Total Score</dt>
                          <dd className="font-mono tabular-nums text-[#7047EB] dark:text-[#22D3EE]">
                            {item.priorityScore ?? 'Needs Research'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          Business Rationale &amp; Dependencies
                        </div>
                        <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">
                          {item.businessImpactRationale}
                        </p>
                        {item.dependencies.length > 0 && (
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            <strong className="text-[var(--text-secondary)]">
                              Dependencies:
                            </strong>{' '}
                            {item.dependencies.join(' · ')}
                          </p>
                        )}
                      </div>

                      {item.evidence.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                            Supporting Evidence
                          </div>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[var(--text-muted)]">
                            {item.evidence.map((ev, idx) => (
                              <li key={idx}>
                                <strong className="font-medium text-[var(--text-secondary)]">
                                  {ev.label}:
                                </strong>{' '}
                                {ev.observedDetail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
