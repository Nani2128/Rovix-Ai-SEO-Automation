import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FileSearch,
  Layers,
  RefreshCw,
  Users,
} from 'lucide-react';
import { competitorService } from '../../services/competitorService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import type {
  CompetitorCategory,
  CompetitorProfileRecord,
  CompetitorWorkspaceResponse,
} from '../../types/competitors';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { CompetitorComparisonAndReportsPanel } from '../../components/competitors/CompetitorComparisonAndReportsPanel';
import { CompetitorDetailDrawer } from '../../components/competitors/CompetitorDetailDrawer';
import { CompetitorOverviewAndRegistryPanel } from '../../components/competitors/CompetitorOverviewAndRegistryPanel';
import { CompetitorPagesAndOverlapPanel } from '../../components/competitors/CompetitorPagesAndOverlapPanel';
import { ContentGapsAndBriefsPanel } from '../../components/competitors/ContentGapsAndBriefsPanel';
import {
  InteractiveButton,
  SegmentedTabs,
} from '../../components/ui/InteractivePrimitives';
import {
  EmptyStateCard,
  ErrorStateCard,
  TableRowsSkeleton,
} from '../../components/ui/StateViews';

type CompetitorTab =
  | 'overview'
  | 'pages_overlap'
  | 'content_gaps'
  | 'comparison_reports';

const COMPETITOR_TABS: {
  id: CompetitorTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'overview',
    label: 'Overview & Registry',
    icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    id: 'pages_overlap',
    label: 'Pages & Keyword Overlap',
    icon: <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    id: 'content_gaps',
    label: 'Content Gaps & Briefs',
    icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    id: 'comparison_reports',
    label: 'Comparison & Reports',
    icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
];

export function CompetitorsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<CompetitorTab>('overview');
  const [workspace, setWorkspace] = useState<CompetitorWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCompetitor, setSavingCompetitor] = useState(false);
  const [analyzingCompetitorId, setAnalyzingCompetitorId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [busyGapId, setBusyGapId] = useState<string | null>(null);
  const [inspectedCompetitor, setInspectedCompetitor] =
    useState<CompetitorProfileRecord | null>(null);

  const userRole = user?.role ?? 'QA';
  const canApprove =
    userRole === 'Platform Admin' ||
    userRole === 'Agency Owner' ||
    userRole === 'Business Owner';
  const canManage =
    canApprove ||
    userRole === 'SEO Strategist' ||
    userRole === 'Project Manager';

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedProjectId) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await competitorService.getWorkspace(selectedProjectId);
      setWorkspace(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Competitor & Content Gap Intelligence workspace.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSaveCompetitor = async (payload: {
    domainOrUrl: string;
    name?: string;
    category: CompetitorCategory;
    targetMarkets?: string[];
    notes?: string;
    approve: boolean;
  }) => {
    if (!selectedProjectId) return;
    setSavingCompetitor(true);
    try {
      const res = await competitorService.upsertCompetitor(selectedProjectId, payload);
      await loadWorkspace();
      pushToast({
        title: payload.approve
          ? `Approved competitor (${res.competitor.domain})`
          : `Recommended competitor (${res.competitor.domain})`,
        detail: `Status: ${res.competitor.approvalStatus.replace(/_/g, ' ')}`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Competitor save failed',
        detail: err instanceof Error ? err.message : 'Unable to save competitor.',
        tone: 'error',
      });
    } finally {
      setSavingCompetitor(false);
    }
  };

  const handleDecideCompetitor = async (
    competitorId: string,
    action: 'approve' | 'reject' | 'archive',
  ) => {
    setSavingCompetitor(true);
    try {
      const res = await competitorService.decideCompetitor(competitorId, { action });
      await loadWorkspace();
      pushToast({
        title: `Competitor ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'archived'}`,
        detail: `${res.competitor.domain} updated with preserved history.`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Decision failed',
        detail: err instanceof Error ? err.message : 'Unable to update decision.',
        tone: 'error',
      });
    } finally {
      setSavingCompetitor(false);
    }
  };

  const handleDeleteCompetitor = async (competitorId: string) => {
    setSavingCompetitor(true);
    try {
      await competitorService.deleteCompetitor(competitorId);
      await loadWorkspace();
      pushToast({
        title: 'Competitor removed',
        detail: 'Audit log updated.',
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Remove failed',
        detail: err instanceof Error ? err.message : 'Unable to remove competitor.',
        tone: 'error',
      });
    } finally {
      setSavingCompetitor(false);
    }
  };

  const handleAnalyzeCompetitor = async (
    competitorId: string,
    urlsToAnalyze?: string[],
  ) => {
    setAnalyzingCompetitorId(competitorId);
    try {
      const res = await competitorService.analyzeCompetitor(competitorId, {
        urlsToAnalyze,
        discoverInternalPages: true,
      });
      await loadWorkspace();
      pushToast({
        title: `Live Analysis ${res.run.status}`,
        detail: `${res.pagesAnalyzed} page(s) analyzed · ${res.overlapsFound} keyword overlap(s) · ${res.gapsIdentified} gap(s).`,
        tone: res.run.status === 'Completed' ? 'success' : res.run.status === 'Failed' ? 'error' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'Competitor analysis failed',
        detail: err instanceof Error ? err.message : 'Unable to analyze competitor URLs.',
        tone: 'error',
      });
    } finally {
      setAnalyzingCompetitorId(null);
    }
  };

  const handleDiscoverCompetitors = async (queries?: string[]) => {
    if (!selectedProjectId) return;
    setDiscovering(true);
    try {
      const res = await competitorService.discoverCompetitors(selectedProjectId, {
        queries,
      });
      await loadWorkspace();
      const totalAdded = res.importedFromProfile.length + res.discoveredFromSerp.length;
      pushToast({
        title:
          totalAdded > 0
            ? `Discovered ${totalAdded} competitor candidate(s)`
            : 'Discovery completed',
        detail: res.serpStatusDetail,
        tone: res.run.status === 'Completed' ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'Competitor discovery failed',
        detail: err instanceof Error ? err.message : 'Unable to discover competitors.',
        tone: 'error',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleDecideGap = async (
    gapId: string,
    action: 'recommend' | 'approve' | 'reject' | 'send_to_keywords' | 'create_task',
    notes?: string,
  ) => {
    setBusyGapId(gapId);
    try {
      const res = await competitorService.decideContentGap(gapId, { action, notes });
      await loadWorkspace();
      const actionMsg =
        action === 'send_to_keywords'
          ? 'Promoted keyword to Keyword Lab'
          : action === 'create_task'
            ? 'Queued execution task in Tasks & Approvals'
            : `Updated plan (${res.gap.workflowState.replace(/_/g, ' ')})`;
      pushToast({
        title: actionMsg,
        detail: res.gap.targetKeyword,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Content gap action failed',
        detail: err instanceof Error ? err.message : 'Unable to update content gap.',
        tone: 'error',
      });
    } finally {
      setBusyGapId(null);
    }
  };

  return (
    <PageTransition className="space-y-6">
      {/* Header & Project Switcher */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Competitor & Content Gap Intelligence
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Live HTML page analysis, keyword overlap benchmarking, explainable content gap scoring, and owner-approved editorial plans.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {projects.length > 0 && (
            <select
              aria-label="Select Active Project"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.website})
                </option>
              ))}
            </select>
          )}
          <InteractiveButton
            variant="secondary"
            size="md"
            loading={loading}
            onClick={() => void loadWorkspace()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </InteractiveButton>
        </div>
      </div>

      {/* Tab Navigation */}
      <SegmentedTabs
        tabs={COMPETITOR_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        layoutGroupId="competitor-intelligence-tabs"
      />

      {/* Body */}
      {!selectedProjectId && projects.length === 0 ? (
        <EmptyStateCard
          title="No projects available"
          description="Create or verify a website project in Projects before benchmarking competitors and analyzing content gaps."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadWorkspace()} />
      ) : loading && !workspace ? (
        <TableRowsSkeleton rows={6} />
      ) : workspace ? (
        <>
          {activeTab === 'overview' && (
            <CompetitorOverviewAndRegistryPanel
              workspace={workspace}
              canApprove={canApprove}
              canManage={canManage}
              savingCompetitor={savingCompetitor}
              analyzingCompetitorId={analyzingCompetitorId}
              discovering={discovering}
              onSaveCompetitor={handleSaveCompetitor}
              onDecideCompetitor={handleDecideCompetitor}
              onDeleteCompetitor={handleDeleteCompetitor}
              onAnalyzeCompetitor={handleAnalyzeCompetitor}
              onDiscoverCompetitors={handleDiscoverCompetitors}
              onInspectCompetitor={setInspectedCompetitor}
            />
          )}

          {activeTab === 'pages_overlap' && (
            <CompetitorPagesAndOverlapPanel workspace={workspace} />
          )}

          {activeTab === 'content_gaps' && (
            <ContentGapsAndBriefsPanel
              workspace={workspace}
              canApprove={canApprove}
              canRecommend={canManage}
              busyGapId={busyGapId}
              onDecideGap={handleDecideGap}
            />
          )}

          {activeTab === 'comparison_reports' && (
            <CompetitorComparisonAndReportsPanel workspace={workspace} />
          )}
        </>
      ) : null}

      <CompetitorDetailDrawer
        competitor={inspectedCompetitor}
        workspace={workspace}
        onClose={() => setInspectedCompetitor(null)}
      />
    </PageTransition>
  );
}
