import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Compass,
  Globe,
  Link2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { geoService } from '../../services/geoService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import type { GeoMarketPriority, GeoWorkspaceResponse } from '../../types/geographic';
import type { KeywordIntent } from '../../types/keywords';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { GeoComparisonReportsPanel } from '../../components/geographic/GeoComparisonReportsPanel';
import { GeoExplorersPanel } from '../../components/geographic/GeoExplorersPanel';
import { GeoKeywordsMappingPanel } from '../../components/geographic/GeoKeywordsMappingPanel';
import {
  GeoLocationDetailDrawer,
  type SelectedGeoDetail,
} from '../../components/geographic/GeoLocationDetailDrawer';
import { GeoOverviewAndTargetsPanel } from '../../components/geographic/GeoOverviewAndTargetsPanel';
import { InteractiveGeoMap } from '../../components/geographic/InteractiveGeoMap';
import {
  InteractiveButton,
  SegmentedTabs,
} from '../../components/ui/InteractivePrimitives';
import {
  EmptyStateCard,
  ErrorStateCard,
  TableRowsSkeleton,
} from '../../components/ui/StateViews';

type GeoTab = 'overview' | 'explorers' | 'keywords_mapping' | 'comparison_reports';

const GEO_TABS: { id: GeoTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview & Target Markets', icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'explorers', label: 'Country / State / City Explorers', icon: <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'keywords_mapping', label: 'Geo Keywords & URL Mapping', icon: <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  { id: 'comparison_reports', label: 'Comparison, Reports & History', icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> },
];

export function GeographicIntelligencePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadProjectsOnly,
  } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<GeoTab>('overview');
  const [workspace, setWorkspace] = useState<GeoWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingMarket, setSavingMarket] = useState(false);
  const [syncingGsc, setSyncingGsc] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [drawerSelection, setDrawerSelection] =
    useState<SelectedGeoDetail | null>(null);

  const userRole = user?.role ?? 'QA';
  const canApprove =
    userRole === 'Platform Admin' ||
    userRole === 'Agency Owner' ||
    userRole === 'Business Owner';
  const canRecommend =
    canApprove ||
    userRole === 'SEO Strategist' ||
    userRole === 'Project Manager';
  const canModifyMappings =
    userRole !== 'QA' &&
    userRole !== 'Outreach Lead' &&
    userRole !== 'Publisher';

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
      const data = await geoService.getWorkspace(selectedProjectId);
      setWorkspace(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Geographic Search Intelligence workspace.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSaveMarket = async (payload: {
    countryCode: string;
    stateRegion?: string;
    city?: string;
    language?: string;
    serviceAreas?: string[];
    priority?: GeoMarketPriority;
    approve: boolean;
    reason?: string;
  }) => {
    if (!selectedProjectId) return;
    setSavingMarket(true);
    try {
      const res = await geoService.upsertTargetMarket(selectedProjectId, payload);
      await loadWorkspace();
      pushToast({
        title: payload.approve
          ? `Approved target market (${res.market.countryCode})`
          : `Saved market recommendation (${res.market.countryCode})`,
        detail: [res.market.city, res.market.stateRegion, res.market.countryName]
          .filter(Boolean)
          .join(', '),
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Target market update failed',
        detail: err instanceof Error ? err.message : 'Unable to save market.',
        tone: 'error',
      });
    } finally {
      setSavingMarket(false);
    }
  };

  const handleDecideMarket = async (
    marketId: string,
    action: 'approve' | 'reject',
    priority?: GeoMarketPriority,
  ) => {
    setSavingMarket(true);
    try {
      await geoService.decideTargetMarket(marketId, { action, priority });
      await loadWorkspace();
      pushToast({
        title: action === 'approve' ? 'Target market approved' : 'Recommendation declined',
        detail: 'Approval history preserved.',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Decision failed',
        detail: err instanceof Error ? err.message : 'Unable to update market decision.',
        tone: 'error',
      });
    } finally {
      setSavingMarket(false);
    }
  };

  const handleDeleteMarket = async (marketId: string) => {
    setSavingMarket(true);
    try {
      await geoService.deleteTargetMarket(marketId);
      await loadWorkspace();
      pushToast({
        title: 'Target market removed',
        detail: 'Audit log updated.',
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Remove failed',
        detail: err instanceof Error ? err.message : 'Unable to remove market.',
        tone: 'error',
      });
    } finally {
      setSavingMarket(false);
    }
  };

  const handleSyncGsc = async () => {
    if (!selectedProjectId) return;
    setSyncingGsc(true);
    try {
      const res = await geoService.syncGscCountries(selectedProjectId);
      await loadWorkspace();
      pushToast({
        title:
          res.status.state === 'connected'
            ? `Synced ${res.syncedCountries} GSC countries`
            : 'GSC country sync status',
        detail: res.status.detail,
        tone: res.status.state === 'connected' ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'GSC country sync failed',
        detail: err instanceof Error ? err.message : 'Unable to sync Search Console.',
        tone: 'error',
      });
    } finally {
      setSyncingGsc(false);
    }
  };

  const handleRunDiscovery = async (payload: {
    countryCode: string;
    stateRegion?: string;
    city?: string;
    language?: string;
    seedTerms?: string[];
    intentFocus?: KeywordIntent | 'all';
    includeAutocomplete?: boolean;
    includeTrends?: boolean;
    includeAiExpansion?: boolean;
  }) => {
    if (!selectedProjectId) return;
    setDiscovering(true);
    try {
      const res = await geoService.runDiscovery(selectedProjectId, payload);
      await loadWorkspace();
      pushToast({
        title: `Geographic Discovery ${res.run.status}`,
        detail: `${res.keywordsDiscovered} keyword(s), ${res.measurementsCollected} regional signal(s) collected.`,
        tone: res.run.status === 'Completed' ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'Geographic discovery failed',
        detail: err instanceof Error ? err.message : 'Unable to run discovery.',
        tone: 'error',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleUpdateMapping = async (
    mappingId: string,
    payload: {
      targetUrl?: string | null;
      recommendedSlug?: string | null;
      approveNewPage?: boolean;
    },
  ) => {
    try {
      const res = await geoService.updateUrlMapping(mappingId, payload);
      await loadWorkspace();
      pushToast({
        title: payload.approveNewPage
          ? 'Location landing page plan approved'
          : 'Location-to-URL mapping updated',
        detail: res.mapping.targetUrl ?? res.mapping.recommendedSlug ?? res.mapping.locationLabel,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Mapping update failed',
        detail: err instanceof Error ? err.message : 'Unable to update URL mapping.',
        tone: 'error',
      });
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1440px] space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Geographic Search Intelligence
            </h1>
            <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Module 02 · Real Provenance
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Interactive geographic demand map, owner-approved target territories, GSC country analytics, Trends regional interest, and anti-doorway location URL mapping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <select
              aria-label="Select project for Geographic Intelligence"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-9 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)]"
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
            size="sm"
            loading={syncingGsc}
            onClick={() => void handleSyncGsc()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sync GSC Countries</span>
          </InteractiveButton>

          <InteractiveButton
            variant="subtle"
            size="sm"
            onClick={() => navigate('/keywords')}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Keyword Lab</span>
          </InteractiveButton>
        </div>
      </div>

      {/* State Guards */}
      {!selectedProjectId && projects.length === 0 ? (
        <EmptyStateCard
          title="No project selected"
          description="Create a website project first to configure approved target markets, explore geographic search visibility, and map regional landing pages."
          actionLabel="Open Projects"
          onAction={() => navigate('/projects')}
        />
      ) : loading && !workspace ? (
        <TableRowsSkeleton rows={5} />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadWorkspace()} />
      ) : workspace ? (
        <>
          {/* Section Navigation Tabs */}
          <SegmentedTabs
            tabs={GEO_TABS}
            activeId={activeTab}
            layoutGroupId="geo-workspace-tabs"
            onChange={(next) => setActiveTab(next as GeoTab)}
          />

          {/* Interactive Geographic Map shown prominently on Overview & Explorers */}
          {(activeTab === 'overview' || activeTab === 'explorers') && (
            <InteractiveGeoMap
              mapCountries={workspace.mapCountries}
              targetMarkets={workspace.targetMarkets}
              measurements={workspace.measurements}
              selectedCountryCode={drawerSelection?.countryCode ?? null}
              onSelectLocation={(loc) => setDrawerSelection(loc)}
            />
          )}

          {activeTab === 'overview' && (
            <GeoOverviewAndTargetsPanel
              workspace={workspace}
              userRole={userRole}
              canApprove={canApprove}
              canRecommend={canRecommend}
              savingMarket={savingMarket}
              onSaveMarket={handleSaveMarket}
              onDecideMarket={handleDecideMarket}
              onDeleteMarket={handleDeleteMarket}
              onSelectLocation={(loc) => setDrawerSelection(loc)}
            />
          )}

          {activeTab === 'explorers' && (
            <GeoExplorersPanel
              workspace={workspace}
              syncingGsc={syncingGsc}
              onSyncGsc={handleSyncGsc}
              onSelectLocation={(loc) => setDrawerSelection(loc)}
            />
          )}

          {activeTab === 'keywords_mapping' && (
            <GeoKeywordsMappingPanel
              workspace={workspace}
              canApprove={canApprove}
              canModifyMappings={canModifyMappings}
              discovering={discovering}
              onRunDiscovery={handleRunDiscovery}
              onUpdateMapping={handleUpdateMapping}
              onSelectLocation={(loc) => setDrawerSelection(loc)}
            />
          )}

          {activeTab === 'comparison_reports' && (
            <GeoComparisonReportsPanel
              workspace={workspace}
              onSelectLocation={(loc) => setDrawerSelection(loc)}
            />
          )}

          {/* Location Detail Slide-Over Drawer */}
          <GeoLocationDetailDrawer
            selection={drawerSelection}
            onClose={() => setDrawerSelection(null)}
            targetMarkets={workspace.targetMarkets}
            measurements={workspace.measurements}
            mapCountries={workspace.mapCountries}
            geoKeywords={workspace.geoKeywords}
            urlMappings={workspace.urlMappings}
            opportunities={workspace.opportunities}
            canApprove={canApprove}
            discovering={discovering}
            onDiscoverLocation={(loc) =>
              handleRunDiscovery({
                countryCode: loc.countryCode,
                stateRegion: loc.stateRegion,
                city: loc.city,
              })
            }
            onAddOrApproveMarket={(loc) =>
              handleSaveMarket({
                countryCode: loc.countryCode,
                stateRegion: loc.stateRegion,
                city: loc.city,
                approve: loc.approve,
                priority: 'secondary',
              })
            }
          />
        </>
      ) : null}
    </PageTransition>
  );
}
