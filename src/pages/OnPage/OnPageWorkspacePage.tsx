import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu, FileSearch2, Play, RefreshCw } from 'lucide-react';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { OnPageAllPagesSection } from '../../components/onPage/OnPageAllPagesSection';
import { OnPageAnalyzerSection } from '../../components/onPage/OnPageAnalyzerSection';
import { OnPageApprovalsCmsSection } from '../../components/onPage/OnPageApprovalsCmsSection';
import { OnPageBulkSection } from '../../components/onPage/OnPageBulkSection';
import { OnPageContentEditorSection } from '../../components/onPage/OnPageContentEditorSection';
import { OnPageImagesSection } from '../../components/onPage/OnPageImagesSection';
import { OnPageInternalLinkingSection } from '../../components/onPage/OnPageInternalLinkingSection';
import { OnPageMetadataSection } from '../../components/onPage/OnPageMetadataSection';
import { OnPageOverviewSection } from '../../components/onPage/OnPageOverviewSection';
import { OnPageSchemaSection } from '../../components/onPage/OnPageSchemaSection';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
} from '../../components/ui/StateViews';
import { onPageService } from '../../services/onPageService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import type {
  CmsPlatform,
  OnPageDraftContentPayload,
  OnPageWorkspacePayload,
} from '../../types/onPage';

type OnPageTabId =
  | 'overview'
  | 'pages'
  | 'analyzer'
  | 'metadata'
  | 'content'
  | 'images'
  | 'schema'
  | 'linking'
  | 'bulk'
  | 'approvals';

const VALID_TABS: readonly OnPageTabId[] = [
  'overview',
  'pages',
  'analyzer',
  'metadata',
  'content',
  'images',
  'schema',
  'linking',
  'bulk',
  'approvals',
];

const TAB_ITEMS: readonly { id: OnPageTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pages', label: 'All Pages' },
  { id: 'analyzer', label: 'Page Analyzer' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'content', label: 'Content Editor' },
  { id: 'images', label: 'Images' },
  { id: 'schema', label: 'Schema' },
  { id: 'linking', label: 'Internal Linking' },
  { id: 'bulk', label: 'Bulk Optimize' },
  { id: 'approvals', label: 'Approvals & CMS' },
];

export function OnPageWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pushToast = useToastStore((s) => s.pushToast);

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();

  const initialTab = searchParams.get('tab') as OnPageTabId | null;
  const [activeTab, setActiveTab] = useState<OnPageTabId>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'overview',
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<OnPageWorkspacePayload | null>(
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
    async (projectId: string, silent = false) => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await onPageService.getWorkspace(projectId);
        setWorkspace(data);
        setSelectedPageId((prev) =>
          prev && data.pages.some((p) => p.id === prev)
            ? prev
            : (data.pages[0]?.id ?? null),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load On-Page SEO Optimization workspace.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeProjectId) {
      void loadWorkspace(activeProjectId, false);
    }
  }, [activeProjectId, loadWorkspace]);

  const switchTab = (tab: OnPageTabId) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const selectPageAndOpenTab = (
    pageId: string,
    tab: 'analyzer' | 'content' | 'metadata',
  ) => {
    setSelectedPageId(pageId);
    switchTab(tab);
  };

  const runMutation = async (
    actionKey: string,
    fn: () => Promise<{
      title: string;
      detail?: string;
      tone?: 'success' | 'info' | 'warning';
    } | void>,
    fallbackToastTitle: string,
  ) => {
    if (!activeProjectId) return;
    setBusyAction(actionKey);
    try {
      const override = await fn();
      await loadWorkspace(activeProjectId, true);
      pushToast({
        title: override?.title ?? fallbackToastTitle,
        detail: override?.detail,
        tone: override?.tone ?? 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Action failed',
        detail: err instanceof Error ? err.message : 'Unexpected error',
        tone: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const selectedPage = useMemo(() => {
    if (!workspace || workspace.pages.length === 0) return null;
    return (
      workspace.pages.find((p) => p.id === selectedPageId) ?? workspace.pages[0]
    );
  }, [workspace, selectedPageId]);

  const selectedPageIssues = useMemo(() => {
    if (!workspace || !selectedPage) return [];
    return workspace.issues.filter(
      (i) => i.pageAnalysisId === selectedPage.id || i.pageUrl === selectedPage.url,
    );
  }, [workspace, selectedPage]);

  const selectedPageRecs = useMemo(() => {
    if (!workspace || !selectedPage) return [];
    return workspace.recommendations.filter(
      (r) => r.pageAnalysisId === selectedPage.id || r.pageUrl === selectedPage.url,
    );
  }, [workspace, selectedPage]);

  const handleRunAnalysis = () => {
    void runMutation(
      'analyze',
      async () => {
        const res = await onPageService.runAnalysis(activeProjectId);
        return {
          title: `Analyzed ${res.pages.length} Crawled Page(s)`,
          detail: `${res.issues.length} deduplicated finding(s) recorded from crawl ${res.run.crawlId ?? ''}.`,
        };
      },
      'On-Page Analysis Completed',
    );
  };

  const handleGenerateAiForPage = (pageId: string) => {
    void runMutation(
      `ai:${pageId}`,
      async () => {
        const res = await onPageService.generateAiRecommendations(
          activeProjectId,
          { pageAnalysisIds: [pageId] },
        );
        return {
          title: `Generated ${res.recommendations.length} AI Recommendation(s)`,
          detail: 'All AI recommendations are labeled and queued for human approval.',
        };
      },
      'AI Recommendations Generated',
    );
  };

  const handleRunBulkAi = (pageIds: string[]) => {
    void runMutation(
      'bulk-ai',
      async () => {
        const res = await onPageService.generateAiRecommendations(
          activeProjectId,
          { pageAnalysisIds: pageIds, confirmedBulk: true },
        );
        return {
          title: `Generated ${res.recommendations.length} Bulk AI Recommendation(s)`,
          detail: `Processed ${res.processedPageIds.length} page(s) within Stage 5 budget guardrails.`,
        };
      },
      'Bulk AI Generation Completed',
    );
  };

  const handleSaveDraft = (
    pageAnalysisId: string,
    proposed: OnPageDraftContentPayload,
    changeSummary: string,
  ) => {
    void runMutation(
      'save-draft',
      async () => {
        const res = await onPageService.saveDraft(activeProjectId, {
          pageAnalysisId,
          proposed,
          changeSummary,
        });
        return {
          title: `Saved Optimization Draft v${res.draft.versionNumber}`,
          detail: 'Draft stored safely in Rovix AI — live site untouched.',
        };
      },
      'Optimization Draft Saved',
    );
  };

  const handleDecideApproval = (
    entityKind: 'recommendation' | 'draft' | 'issue',
    entityId: string,
    decision: 'approved' | 'rejected',
  ) => {
    void runMutation(
      `approve:${entityId}`,
      async () => {
        await onPageService.decideApproval(activeProjectId, {
          items: [{ entityKind, entityId }],
          decision,
        });
        return {
          title: decision === 'approved' ? 'Item Approved' : 'Item Rejected',
          detail: 'Recorded in immutable On-Page approval audit log.',
        };
      },
      'Approval Recorded',
    );
  };

  const handleBulkApproveRecs = (recommendationIds: string[]) => {
    void runMutation(
      'bulk-approve',
      async () => {
        const res = await onPageService.decideApproval(activeProjectId, {
          items: recommendationIds.map((entityId) => ({
            entityKind: 'recommendation' as const,
            entityId,
          })),
          decision: 'approved',
          comment: 'Bulk approved from On-Page Optimization workspace',
        });
        return {
          title: `Bulk Approved ${res.updatedCount} Recommendation(s)`,
          detail: 'All approvals logged to audit trail.',
        };
      },
      'Bulk Approval Completed',
    );
  };

  const handleMarkAppliedExternally = (
    draftId: string,
    channel: string,
    note: string,
  ) => {
    void runMutation(
      `apply:${draftId}`,
      async () => {
        await onPageService.markAppliedExternally(activeProjectId, draftId, {
          channel,
          note,
        });
        return {
          title: 'Marked Applied Externally',
          detail: 'Run a fresh crawl and click Verify Against Latest Crawl to confirm live changes.',
          tone: 'info',
        };
      },
      'Marked Applied Externally',
    );
  };

  const handleVerifyDraft = (draftId: string) => {
    void runMutation(
      `verify:${draftId}`,
      async () => {
        const res = await onPageService.verifyDraftAgainstCrawl(
          activeProjectId,
          draftId,
        );
        return {
          title:
            res.validation.verificationStatus === 'verified'
              ? 'Draft Verified in Fresh Crawl'
              : 'Crawl Verification Diff Recorded',
          detail: res.validation.summary,
          tone:
            res.validation.verificationStatus === 'verified'
              ? 'success'
              : 'warning',
        };
      },
      'Crawl Verification Complete',
    );
  };

  const handleCreateTaskFromIssue = (issueId: string) => {
    void runMutation(
      `task:${issueId}`,
      async () => {
        const res = await onPageService.createTaskFromIssue(
          activeProjectId,
          issueId,
        );
        return {
          title: `Task ${res.ticket.id} Created`,
          detail: 'Linked to Tasks & Approvals execution queue.',
        };
      },
      'Execution Task Created',
    );
  };

  const handleLaunchWorkflow = () => {
    void runMutation(
      'workflow',
      async () => {
        const res = await onPageService.launchWorkflow(activeProjectId, {
          pageAnalysisId: selectedPage?.id ?? null,
        });
        return {
          title: `Workflow ${res.workflow.workflow.id} Launched`,
          detail: `${res.workflow.workflow.name} started in Agent Factory.`,
          tone: 'info',
        };
      },
      'Agent Factory Workflow Launched',
    );
  };

  const handleConfigureCms = (
    platform: CmsPlatform,
    siteUrl: string,
    credentials: Record<string, string>,
  ) => {
    void runMutation(
      `cms:${platform}`,
      async () => {
        const res = await onPageService.configureCms(activeProjectId, platform, {
          siteUrl,
          credentials,
        });
        return {
          title: `${platform.toUpperCase()} Credentials Encrypted`,
          detail: `Status: ${res.connection.status.replace(/_/g, ' ')}. Auto-publish remains disabled.`,
        };
      },
      'CMS Adapter Configured',
    );
  };

  const handleRemoveCms = (platform: CmsPlatform) => {
    void runMutation(
      `cms-del:${platform}`,
      async () => {
        await onPageService.removeCms(activeProjectId, platform);
        return {
          title: `${platform.toUpperCase()} Configuration Removed`,
          detail: 'Encrypted credentials deleted from workspace vault.',
          tone: 'info',
        };
      },
      'CMS Configuration Removed',
    );
  };

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Select or create a website project first to run crawl-backed On-Page SEO Analysis, draft optimizations, and fresh-crawl verifications."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-5">
      {/* Header & Single-Row Controls */}
      <header className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#22D3EE]">
                <FileSearch2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
                On-Page SEO Optimization &amp; Page Intelligence
              </h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
              Crawl-verified page diagnostics, deterministic 10-category scoring, keyword alignment, side-by-side optimization drafts, bulk exports, approval gates, and fresh-crawl verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 xl:flex-nowrap">
            {projects.length > 0 && (
              <select
                aria-label="Select project workspace"
                value={activeProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="max-w-[190px] truncate rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={
                !workspace?.canEditOnPage ||
                !workspace?.latestCrawlId ||
                busyAction !== null
              }
              onClick={handleRunAnalysis}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#7047EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {busyAction === 'analyze'
                  ? 'Analyzing…'
                  : 'Run On-Page Analysis'}
              </span>
            </button>

            <button
              type="button"
              disabled={refreshing || loading}
              onClick={() => void loadWorkspace(activeProjectId, true)}
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

        {/* 10-Section Workspace Tab Bar */}
        <nav
          aria-label="On-Page SEO Workspace Sections"
          className="mt-4 flex items-center gap-1 overflow-x-auto border-t border-[var(--border-hairline)] pt-3 pr-4 pb-1"
        >
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.id;
            const count = !workspace
              ? null
              : tab.id === 'pages'
                ? workspace.pages.length
                : tab.id === 'approvals'
                  ? workspace.approvals.length
                  : tab.id === 'linking'
                    ? workspace.module7InternalLinks.length
                    : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#7047EB] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                {count !== null && count > 0 && (
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? 'text-white/85' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Body States */}
      {loading && !workspace ? (
        <DashboardSkeleton />
      ) : error && !workspace ? (
        <ErrorStateCard
          message={error}
          onRetry={() => void loadWorkspace(activeProjectId, false)}
        />
      ) : workspace ? (
        <>
          {activeTab === 'overview' && (
            <OnPageOverviewSection
              workspace={workspace}
              busyAction={busyAction}
              onRunAnalysis={handleRunAnalysis}
              onLaunchWorkflow={handleLaunchWorkflow}
              onSelectPageAndOpenTab={selectPageAndOpenTab}
              onNavigateTab={(t) => switchTab(t)}
            />
          )}

          {activeTab === 'pages' && (
            <OnPageAllPagesSection
              pages={workspace.pages}
              selectedPageId={selectedPage?.id ?? null}
              onSelectPageAndOpenTab={selectPageAndOpenTab}
            />
          )}

          {activeTab === 'analyzer' && (
            <OnPageAnalyzerSection
              pages={workspace.pages}
              selectedPage={selectedPage}
              pageIssues={selectedPageIssues}
              pageRecommendations={selectedPageRecs}
              canEdit={workspace.canEditOnPage}
              canApprove={workspace.canApproveOnPage}
              canCreateTasks={workspace.canCreateTasks}
              geminiConfigured={workspace.geminiConfigured}
              busyAction={busyAction}
              onSelectPage={setSelectedPageId}
              onGenerateAiForPage={handleGenerateAiForPage}
              onCreateTaskFromIssue={handleCreateTaskFromIssue}
              onDecideApproval={(kind, id, dec) =>
                handleDecideApproval(kind, id, dec)
              }
              onOpenDraftEditor={(pageId) =>
                selectPageAndOpenTab(pageId, 'content')
              }
            />
          )}

          {activeTab === 'metadata' && (
            <OnPageMetadataSection
              pages={workspace.pages}
              recommendations={workspace.recommendations}
              canApprove={workspace.canApproveOnPage}
              busyAction={busyAction}
              onOpenDraftEditor={(pageId) =>
                selectPageAndOpenTab(pageId, 'content')
              }
              onDecideApproval={(kind, id, dec) =>
                handleDecideApproval(kind, id, dec)
              }
            />
          )}

          {activeTab === 'content' && (
            <OnPageContentEditorSection
              projectId={workspace.projectId}
              pages={workspace.pages}
              selectedPage={selectedPage}
              drafts={workspace.drafts}
              validations={workspace.validations}
              canEdit={workspace.canEditOnPage}
              canApprove={workspace.canApproveOnPage}
              busyAction={busyAction}
              onSelectPage={setSelectedPageId}
              onSaveDraft={handleSaveDraft}
              onApproveDraft={(draftId, dec) =>
                handleDecideApproval('draft', draftId, dec)
              }
              onMarkAppliedExternally={handleMarkAppliedExternally}
              onVerifyDraft={handleVerifyDraft}
            />
          )}

          {activeTab === 'images' && (
            <OnPageImagesSection
              pages={workspace.pages}
              onOpenDraftEditor={(pageId) =>
                selectPageAndOpenTab(pageId, 'content')
              }
            />
          )}

          {activeTab === 'schema' && (
            <OnPageSchemaSection
              pages={workspace.pages}
              onOpenDraftEditor={(pageId) =>
                selectPageAndOpenTab(pageId, 'content')
              }
            />
          )}

          {activeTab === 'linking' && (
            <OnPageInternalLinkingSection
              pages={workspace.pages}
              module7InternalLinks={workspace.module7InternalLinks}
              onOpenAnalyzer={(pageId) =>
                selectPageAndOpenTab(pageId, 'analyzer')
              }
            />
          )}

          {activeTab === 'bulk' && (
            <OnPageBulkSection
              projectId={workspace.projectId}
              pages={workspace.pages}
              recommendations={workspace.recommendations}
              canEdit={workspace.canEditOnPage}
              canBulkApprove={workspace.canBulkApprove}
              busyAction={busyAction}
              onRunBulkAi={handleRunBulkAi}
              onBulkApproveRecommendations={handleBulkApproveRecs}
            />
          )}

          {activeTab === 'approvals' && (
            <OnPageApprovalsCmsSection
              projectWebsite={workspace.projectWebsite}
              approvals={workspace.approvals}
              validations={workspace.validations}
              cmsConnections={workspace.cmsConnections}
              cmsPlatforms={workspace.cmsPlatforms}
              canManageCms={workspace.canManageCms}
              busyAction={busyAction}
              onConfigureCms={handleConfigureCms}
              onRemoveCms={handleRemoveCms}
            />
          )}
        </>
      ) : null}
    </PageTransition>
  );
}
