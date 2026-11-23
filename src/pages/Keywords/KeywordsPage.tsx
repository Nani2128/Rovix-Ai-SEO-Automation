import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Compass,
  Download,
  Layers,
  Link2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { keywordService } from '../../services/keywordService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import type {
  KeywordCluster,
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
  KeywordWorkspaceResponse,
} from '../../types/keywords';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { KeywordApprovalCenterPanel } from '../../components/keywords/KeywordApprovalCenterPanel';
import { KeywordClustersPanel } from '../../components/keywords/KeywordClustersPanel';
import { KeywordDetailDrawer } from '../../components/keywords/KeywordDetailDrawer';
import { KeywordDiscoveryPanel } from '../../components/keywords/KeywordDiscoveryPanel';
import { KeywordExplorerTable } from '../../components/keywords/KeywordExplorerTable';
import { KeywordMappingCannibalizationPanel } from '../../components/keywords/KeywordMappingCannibalizationPanel';
import { KeywordOverviewHeader } from '../../components/keywords/KeywordOverviewHeader';
import {
  InteractiveButton,
  SegmentedTabs,
} from '../../components/ui/InteractivePrimitives';
import {
  EmptyStateCard,
  ErrorStateCard,
  TableRowsSkeleton,
} from '../../components/ui/StateViews';

type KeywordTab = 'discovery' | 'explorer' | 'clusters' | 'mapping' | 'approvals';

const KEYWORD_TABS: { id: KeywordTab; label: string; icon: typeof Compass }[] = [
  { id: 'discovery', label: 'Context & Discovery', icon: Compass },
  { id: 'explorer', label: 'Keyword Explorer', icon: Search },
  { id: 'clusters', label: 'Topic Clusters', icon: Layers },
  { id: 'mapping', label: 'URL Mapping & Conflicts', icon: Link2 },
  { id: 'approvals', label: 'Approvals & Audit Trail', icon: CheckSquare },
];

export function KeywordsPage() {
  const navigate = useNavigate();
  const { projects, selectedProjectId, setSelectedProjectId, loadProjectsOnly, loadDashboardData } =
    useDashboardStore();
  const permissions = useAuthStore((s) => s.permissions);
  const pushToast = useToastStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<KeywordTab>('explorer');
  const [workspace, setWorkspace] = useState<KeywordWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const discoverySectionRef = useRef<HTMLDivElement | null>(null);

  const canApprove = permissions.canApproveKeywords;
  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;

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
      const data = await keywordService.getWorkspace(selectedProjectId);
      setWorkspace(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Keyword & Demand Intelligence workspace.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectedKeyword: KeywordIntelligenceRecord | null =
    workspace?.keywords.find((k) => k.id === selectedKeywordId) ?? null;

  const handleSaveProfile = async (payload: {
    approvedNiche: string;
    approvedServices: string[];
    targetAudience: string;
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    competitorUrls: string[];
    approveProfile: boolean;
  }) => {
    if (!selectedProjectId) return;
    try {
      await keywordService.saveBusinessProfile(selectedProjectId, payload);
      await loadWorkspace();
      pushToast({
        title: payload.approveProfile
          ? 'Business context approved'
          : 'Business context saved',
        detail: payload.approvedNiche || 'Keyword profile updated',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Unable to save business context',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleRunDiscovery = async (payload: {
    seedTerms: string[];
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    intentFocus: KeywordIntent | 'all';
    competitorUrls: string[];
    includeAutocomplete: boolean;
    includeTrends: boolean;
    includeAiExpansion: boolean;
  }) => {
    if (!selectedProjectId) return;
    try {
      const res = await keywordService.runDiscovery(selectedProjectId, payload);
      await loadWorkspace();
      void loadDashboardData();
      setActiveTab('explorer');
      pushToast({
        title: 'Keyword discovery completed',
        detail: `${res.discoveredCount} keywords evaluated · ${res.clustersCount} clusters formed`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Keyword discovery failed',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleAddManual = async (payload: {
    keyword: string;
    intent?: KeywordIntent;
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    notes?: string;
  }) => {
    if (!selectedProjectId) return;
    try {
      const res = await keywordService.addManualKeyword(selectedProjectId, payload);
      await loadWorkspace();
      void loadDashboardData();
      setSelectedKeywordId(res.keyword.id);
      pushToast({
        title: 'Manual keyword added',
        detail: res.keyword.keyword,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Unable to add keyword',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleTransitionState = async (
    keywordId: string,
    payload: {
      nextState: KeywordWorkflowState;
      assignedTo?: string | null;
      notes?: string;
    },
  ) => {
    try {
      const res = await keywordService.transitionWorkflow(keywordId, payload);
      await loadWorkspace();
      void loadDashboardData();
      pushToast({
        title: `Keyword moved to ${res.keyword.workflowState}`,
        detail: res.keyword.keyword,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Workflow transition blocked',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleUpdateDetails = async (
    keywordId: string,
    payload: {
      intent?: KeywordIntent;
      targetUrl?: string | null;
      mappingStatus?: KeywordUrlMappingRecord['mappingStatus'];
      recommendedSlug?: string | null;
      notes?: string;
    },
  ) => {
    try {
      const res = await keywordService.updateKeywordDetails(keywordId, payload);
      await loadWorkspace();
      pushToast({
        title: 'Keyword details updated',
        detail: `${res.keyword.keyword} (${res.keyword.intent})`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Update failed',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleUpdateCluster = async (
    clusterId: string,
    payload: {
      clusterName?: string;
      suggestedLandingUrl?: string | null;
      approvalState?: KeywordCluster['approvalState'];
      notes?: string;
    },
  ) => {
    try {
      const res = await keywordService.updateCluster(clusterId, payload);
      await loadWorkspace();
      pushToast({
        title: 'Cluster updated',
        detail: `${res.cluster.clusterName} (${res.cluster.approvalState})`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Cluster update blocked',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleMergeClusters = async (payload: {
    clusterIds: string[];
    mergedName?: string;
  }) => {
    if (!selectedProjectId) return;
    try {
      const res = await keywordService.mergeClusters(selectedProjectId, payload);
      await loadWorkspace();
      pushToast({
        title: 'Clusters merged',
        detail: `${res.cluster.clusterName} (${res.cluster.keywordsCount} keywords)`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Merge failed',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    }
  };

  const handleDownloadExport = async (format: 'csv' | 'json') => {
    if (!selectedProjectId) return;
    try {
      const token = sessionStorage.getItem('rovix_auth_token');
      const url = keywordService.getExportUrl(selectedProjectId, format);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `rovix-keywords-${selectedProjectId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      pushToast({
        title: 'Export failed',
        detail: err instanceof Error ? err.message : 'Unable to export keywords.',
        tone: 'warning',
      });
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1380px] space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Keyword &amp; Demand Intelligence
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {activeProject
              ? `Evidence-backed discovery, semantic topic clustering, cannibalization checks & 9-stage governance for ${activeProject.name}`
              : 'Select or add a domain project to run evidence-backed keyword intelligence'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {projects.length > 1 && (
            <select
              aria-label="Select active project"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {selectedProjectId && (
            <>
              <InteractiveButton
                variant="secondary"
                size="md"
                disabled={loading}
                onClick={() => void loadWorkspace()}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Refresh</span>
              </InteractiveButton>
              <InteractiveButton
                variant="secondary"
                size="md"
                onClick={() => void handleDownloadExport('csv')}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>CSV</span>
              </InteractiveButton>
              <InteractiveButton
                variant="secondary"
                size="md"
                onClick={() => void handleDownloadExport('json')}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>JSON</span>
              </InteractiveButton>
            </>
          )}
        </div>
      </div>

      {!selectedProjectId ? (
        <EmptyStateCard
          title="No domain project selected"
          description="Add a domain project first to configure business keyword context, import Search Console signals, and launch keyword discovery."
          actionLabel="Add Domain Project"
          onAction={() => navigate('/projects')}
        />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadWorkspace()} />
      ) : loading && !workspace ? (
        <TableRowsSkeleton rows={6} />
      ) : workspace ? (
        <>
          <KeywordOverviewHeader
            workspace={workspace}
            onJumpToProfile={() => {
              setActiveTab('discovery');
              discoverySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            onJumpToCannibalization={() => setActiveTab('mapping')}
          />

          <div ref={discoverySectionRef} className="overflow-x-auto pb-1">
            <SegmentedTabs
              tabs={KEYWORD_TABS.map((t) => ({
                id: t.id,
                label: t.label,
                icon: <t.icon className="h-3.5 w-3.5" aria-hidden="true" />,
              }))}
              activeId={activeTab}
              onChange={setActiveTab}
              layoutGroupId="keyword-intelligence-tabs"
            />
          </div>

          {activeTab === 'discovery' && (
            <KeywordDiscoveryPanel
              profile={workspace.businessProfile}
              runs={workspace.researchRuns}
              canApproveProfile={canApprove}
              onSaveProfile={handleSaveProfile}
              onRunDiscovery={handleRunDiscovery}
              onAddManual={handleAddManual}
            />
          )}

          {activeTab === 'explorer' && (
            <KeywordExplorerTable
              keywords={workspace.keywords}
              onSelectKeyword={(kw) => setSelectedKeywordId(kw.id)}
              onStartDiscovery={() => setActiveTab('discovery')}
            />
          )}

          {activeTab === 'clusters' && (
            <KeywordClustersPanel
              clusters={workspace.clusters}
              keywords={workspace.keywords}
              crawledUrls={workspace.crawledUrls}
              businessProfile={workspace.businessProfile}
              canApprove={canApprove}
              onSelectKeyword={(kw) => setSelectedKeywordId(kw.id)}
              onUpdateCluster={handleUpdateCluster}
              onMergeClusters={handleMergeClusters}
              onStartDiscovery={() => setActiveTab('discovery')}
            />
          )}

          {activeTab === 'mapping' && (
            <KeywordMappingCannibalizationPanel
              keywords={workspace.keywords}
              alerts={workspace.cannibalizationAlerts}
              onSelectKeyword={(kw) => setSelectedKeywordId(kw.id)}
              onStartDiscovery={() => setActiveTab('discovery')}
            />
          )}

          {activeTab === 'approvals' && (
            <KeywordApprovalCenterPanel
              keywords={workspace.keywords}
              businessProfile={workspace.businessProfile}
              auditTrail={workspace.recentAuditTrail}
              canApprove={canApprove}
              onSelectKeyword={(kw) => setSelectedKeywordId(kw.id)}
              onTransitionState={handleTransitionState}
              onJumpToProfile={() => setActiveTab('discovery')}
            />
          )}

          <KeywordDetailDrawer
            keyword={selectedKeyword}
            businessProfile={workspace.businessProfile}
            crawledUrls={workspace.crawledUrls}
            canApprove={canApprove}
            onClose={() => setSelectedKeywordId(null)}
            onTransitionState={handleTransitionState}
            onUpdateDetails={handleUpdateDetails}
          />
        </>
      ) : null}
    </PageTransition>
  );
}
