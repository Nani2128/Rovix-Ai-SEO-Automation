import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, Cpu, RefreshCw } from 'lucide-react';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InternalLinkingSection } from '../../components/strategy/InternalLinkingSection';
import { KeywordPageMappingSection } from '../../components/strategy/KeywordPageMappingSection';
import { SeoRoadmapSection } from '../../components/strategy/SeoRoadmapSection';
import { SiteArchitectureBuilderSection } from '../../components/strategy/SiteArchitectureBuilderSection';
import { StrategyApprovalsHistorySection } from '../../components/strategy/StrategyApprovalsHistorySection';
import { StrategyOverviewSection } from '../../components/strategy/StrategyOverviewSection';
import { TopicalAuthoritySection } from '../../components/strategy/TopicalAuthoritySection';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
} from '../../components/ui/StateViews';
import {
  strategyService,
  type CreateArchitecturePagePayload,
  type UpdateArchitecturePagePayload,
} from '../../services/strategyService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import type {
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';

type StrategyTabId =
  | 'overview'
  | 'architecture'
  | 'mapping'
  | 'linking'
  | 'topical'
  | 'roadmap'
  | 'approvals';

const VALID_TABS: readonly StrategyTabId[] = [
  'overview',
  'architecture',
  'mapping',
  'linking',
  'topical',
  'roadmap',
  'approvals',
];

const TAB_ITEMS: readonly { id: StrategyTabId; label: string }[] = [
  { id: 'overview', label: 'Strategy Overview' },
  { id: 'architecture', label: 'Website Architecture' },
  { id: 'mapping', label: 'Keyword-to-Page Mapping' },
  { id: 'linking', label: 'Internal Linking' },
  { id: 'topical', label: 'Topical Authority' },
  { id: 'roadmap', label: 'SEO Roadmap' },
  { id: 'approvals', label: 'Approvals & History' },
];

export function StrategyWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pushToast = useToastStore((s) => s.pushToast);

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();

  const initialTab = searchParams.get('tab') as StrategyTabId | null;
  const [activeTab, setActiveTab] = useState<StrategyTabId>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'overview',
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  const [workspace, setWorkspace] = useState<StrategyWorkspacePayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      void loadProjectsOnly();
    }
  }, [projects.length, loadProjectsOnly]);

  const activeProjectId =
    selectedProjectId || (projects.length > 0 ? projects[0].id : '');

  const loadWorkspace = useCallback(
    async (
      projectId: string,
      versionId?: string | null,
      silent = false,
    ) => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await strategyService.getWorkspace(projectId, versionId);
        setWorkspace(data);
        setSelectedVersionId(data.activeVersion?.id ?? null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load SEO Strategy & Website Architecture workspace.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    setSelectedVersionId(null);
    void loadWorkspace(activeProjectId, null, false);
  }, [activeProjectId, loadWorkspace]);

  const handleTabChange = (nextTab: StrategyTabId) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    if (activeProjectId) {
      void loadWorkspace(activeProjectId, versionId, true);
    }
  };

  const runMutation = async (
    actionKey: string,
    fn: () => Promise<{ title?: string; detail?: string; tone?: 'success' | 'info' } | void>,
    fallbackTitle: string,
    fallbackDetail?: string,
  ) => {
    setBusyAction(actionKey);
    try {
      const override = await fn();
      pushToast({
        title: override?.title ?? fallbackTitle,
        detail: override?.detail ?? fallbackDetail,
        tone: override?.tone ?? 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Action failed',
        detail: err instanceof Error ? err.message : 'Unexpected server error',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateStrategy = () => {
    if (!activeProjectId) return;
    void runMutation(
      'generate',
      async () => {
        const result = await strategyService.generateStrategy(activeProjectId);
        setWorkspace(result.workspace);
        setSelectedVersionId(result.version.id);
      },
      'SEO Strategy Generated',
      'New versioned strategy, architecture tree, links, topical clusters, and roadmap saved.',
    );
  };

  const handleCreatePage = async (payload: CreateArchitecturePagePayload) => {
    if (!activeProjectId) return;
    await runMutation(
      'create-page',
      async () => {
        await strategyService.createPage(activeProjectId, payload);
        await loadWorkspace(activeProjectId, selectedVersionId, true);
      },
      'Proposed Page Created',
      `${payload.title} (${payload.slug}) added to site architecture draft.`,
    );
  };

  const handleUpdatePage = async (
    pageId: string,
    payload: UpdateArchitecturePagePayload,
  ) => {
    if (!activeProjectId) return;
    await runMutation(
      'update-page',
      async () => {
        await strategyService.updatePage(activeProjectId, pageId, payload);
        await loadWorkspace(activeProjectId, selectedVersionId, true);
      },
      'Page Updated',
      'Architecture page metadata and keyword mapping saved.',
    );
  };

  const handleMovePage = async (
    pageId: string,
    newParentPageId: string | null,
  ) => {
    if (!activeProjectId) return;
    await runMutation(
      'move-page',
      async () => {
        await strategyService.movePage(activeProjectId, pageId, {
          newParentPageId,
        });
        await loadWorkspace(activeProjectId, selectedVersionId, true);
      },
      'Hierarchy Updated',
      'Page reparented cleanly without circular dependencies.',
    );
  };

  const handleArchivePage = async (pageId: string, reason?: string) => {
    if (!activeProjectId) return;
    await runMutation(
      'archive-page',
      async () => {
        await strategyService.archivePage(activeProjectId, pageId, reason);
        await loadWorkspace(activeProjectId, selectedVersionId, true);
      },
      'Page Archived',
      'Page safely archived from planning tree without affecting the live site.',
    );
  };

  const handleDecideApproval = async (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => {
    if (!activeProjectId) return;
    await runMutation(
      `approve-${entityId}`,
      async () => {
        await strategyService.decideApproval(activeProjectId, {
          entityKind,
          entityId,
          decision,
          comment,
        });
        await loadWorkspace(activeProjectId, selectedVersionId, true);
      },
      decision === 'approved' ? 'Approval Recorded' : 'Rejection Recorded',
      'Governance audit log updated.',
    );
  };

  const handleCreateTask = async (itemId: string) => {
    if (!activeProjectId) return;
    await runMutation(
      `task-${itemId}`,
      async () => {
        const res = await strategyService.createTaskFromRoadmapItem(
          activeProjectId,
          itemId,
        );
        await loadWorkspace(activeProjectId, selectedVersionId, true);
        return {
          title: `Created Task ${res.ticket.id}`,
          detail: 'Promoted approved roadmap item to Tasks & Approvals.',
          tone: 'success' as const,
        };
      },
      'Task Queued',
    );
  };

  const handleLaunchWorkflow = async (
    objective?: string,
    roadmapItemId?: string | null,
  ) => {
    if (!activeProjectId) return;
    await runMutation(
      roadmapItemId ? `wf-${roadmapItemId}` : 'wf-strategy',
      async () => {
        const res = await strategyService.launchWorkflow(activeProjectId, {
          roadmapItemId: roadmapItemId ?? null,
          strategyVersionId: selectedVersionId,
          objective,
        });
        await loadWorkspace(activeProjectId, selectedVersionId, true);
        return {
          title: `Workflow ${res.workflow.id} Launched`,
          detail: `${res.workflow.name} started in Agent Factory.`,
          tone: 'info' as const,
        };
      },
      'Agent Workflow Dispatched',
    );
  };

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Select or create a website project first to generate an evidence-backed SEO Strategy, Visual Website Architecture, Keyword-to-Page Matrix, and Roadmap."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-5">
      {/* Header & Workspace Controls */}
      <header className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#22D3EE]">
                <Compass className="h-4 w-4" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                SEO Strategy &amp; Website Architecture
              </h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
              Evidence-backed SEO strategy synthesis, interactive sitemap planning tree, cannibalization-checked keyword-to-page mapping, crawl-verified internal linking, topical authority clusters, and approval-governed execution roadmap.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 xl:flex-nowrap">
            {projects.length > 0 && (
              <select
                aria-label="Select project workspace"
                value={activeProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="max-w-[200px] truncate rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            {workspace && workspace.versions.length > 0 && (
              <select
                aria-label="Select strategy version"
                value={selectedVersionId ?? workspace.activeVersion?.id ?? ''}
                onChange={(e) => handleSelectVersion(e.target.value)}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                {workspace.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} · {v.approvalStatus.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={refreshing || loading}
              onClick={() =>
                void loadWorkspace(activeProjectId, selectedVersionId, true)
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>

            <Link
              to="/agent-factory"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Agent Factory</span>
            </Link>
          </div>
        </div>

        {/* 7-Section Workspace Tab Bar */}
        <nav
          aria-label="Strategy Workspace Sections"
          className="mt-4 flex items-center gap-1.5 overflow-x-auto border-t border-[var(--border-hairline)] pt-3"
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.id;
            const badgeCount =
              !workspace
                ? null
                : tab.id === 'architecture'
                  ? workspace.pages.filter((p) => p.pageStatus !== 'archived')
                      .length
                  : tab.id === 'mapping'
                    ? workspace.mappingDiagnostics.length
                    : tab.id === 'linking'
                      ? workspace.internalLinks.length
                      : tab.id === 'topical'
                        ? workspace.topicalClusters.length
                        : tab.id === 'roadmap'
                          ? workspace.roadmapItems.length
                          : tab.id === 'approvals'
                            ? workspace.approvals.length
                            : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'text-[var(--accent-on-pill)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                      }
                    : undefined
                }
              >
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span
                    className={`font-mono text-[10.5px] tabular-nums ${
                      active
                        ? 'text-[var(--accent-on-pill)]/90'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <ErrorStateCard
          message={error}
          onRetry={() =>
            void loadWorkspace(activeProjectId, selectedVersionId, false)
          }
        />
      ) : workspace ? (
        <div>
          {activeTab === 'overview' && (
            <StrategyOverviewSection
              workspace={workspace}
              busyAction={busyAction}
              onGenerateStrategy={handleGenerateStrategy}
              onLaunchWorkflow={(objective) =>
                void handleLaunchWorkflow(objective, null)
              }
              onDecideApproval={(kind, id, decision, comment) =>
                void handleDecideApproval(kind, id, decision, comment)
              }
            />
          )}

          {activeTab === 'architecture' && (
            <SiteArchitectureBuilderSection
              workspace={workspace}
              busyAction={busyAction}
              onCreatePage={handleCreatePage}
              onUpdatePage={handleUpdatePage}
              onMovePage={handleMovePage}
              onArchivePage={handleArchivePage}
              onDecideApproval={handleDecideApproval}
            />
          )}

          {activeTab === 'mapping' && (
            <KeywordPageMappingSection
              workspace={workspace}
              busyAction={busyAction}
              onUpdatePage={handleUpdatePage}
              onDecideApproval={handleDecideApproval}
            />
          )}

          {activeTab === 'linking' && (
            <InternalLinkingSection
              workspace={workspace}
              busyAction={busyAction}
              onDecideApproval={handleDecideApproval}
            />
          )}

          {activeTab === 'topical' && (
            <TopicalAuthoritySection
              workspace={workspace}
              busyAction={busyAction}
              onDecideApproval={handleDecideApproval}
            />
          )}

          {activeTab === 'roadmap' && (
            <SeoRoadmapSection
              workspace={workspace}
              busyAction={busyAction}
              onDecideApproval={handleDecideApproval}
              onCreateTask={handleCreateTask}
              onLaunchRoadmapWorkflow={(itemId) =>
                handleLaunchWorkflow(undefined, itemId)
              }
            />
          )}

          {activeTab === 'approvals' && (
            <StrategyApprovalsHistorySection
              workspace={workspace}
              busyAction={busyAction}
              onSelectVersion={handleSelectVersion}
              onDecideApproval={handleDecideApproval}
            />
          )}
        </div>
      ) : null}
    </PageTransition>
  );
}
