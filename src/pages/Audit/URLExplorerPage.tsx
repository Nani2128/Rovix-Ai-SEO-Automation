import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CrawlRun, CrawlURLRecord } from '../../types/crawl';
import { ApiError } from '../../services/apiClient';
import { crawlService } from '../../services/crawlService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
} from '../../components/ui/StateViews';
import { AuditSubNav } from '../../components/audit/AuditSubNav';
import { CrawlVisualization } from '../../components/audit/CrawlVisualization';
import { URLDetailsDrawer } from '../../components/audit/URLDetailsDrawer';
import { URLInventoryTable } from '../../components/audit/URLInventoryTable';
import { SegmentedTabs } from '../../components/ui/InteractivePrimitives';

export function URLExplorerPage() {
  const { crawlId: routeCrawlId } = useParams<{ crawlId?: string }>();
  const navigate = useNavigate();
  const { selectedProjectId, projects } = useDashboardStore();

  const [crawls, setCrawls] = useState<CrawlRun[]>([]);
  const [selectedCrawlId, setSelectedCrawlId] = useState<string>(
    routeCrawlId ?? '',
  );
  const [viewMode, setViewMode] = useState<'table' | 'topology'>('table');
  const [items, setItems] = useState<CrawlURLRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<
    'normalized_url' | 'status_code' | 'depth' | 'issue_count'
  >('depth');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedUrl, setSelectedUrl] = useState<CrawlURLRecord | null>(null);
  const [loadingCrawls, setLoadingCrawls] = useState(true);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  useEffect(() => {
    if (!selectedProjectId && !routeCrawlId) {
      setCrawls([]);
      setSelectedCrawlId('');
      setLoadingCrawls(false);
      return;
    }
    setLoadingCrawls(true);
    if (!selectedProjectId && routeCrawlId) {
      setSelectedCrawlId(routeCrawlId);
      setLoadingCrawls(false);
      return;
    }
    crawlService
      .listProjectCrawls(selectedProjectId)
      .then((res) => {
        setCrawls(res.crawls);
        if (routeCrawlId) {
          setSelectedCrawlId(routeCrawlId);
        } else if (res.crawls[0]) {
          setSelectedCrawlId(res.crawls[0].id);
        } else {
          setSelectedCrawlId('');
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          useAuthStore.getState().expireSession();
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load crawls.');
      })
      .finally(() => setLoadingCrawls(false));
  }, [routeCrawlId, selectedProjectId]);

  const loadUrls = useCallback(async () => {
    if (!selectedCrawlId) return;
    setLoadingUrls(true);
    setError(null);
    try {
      const res = await crawlService.fetchCrawlUrls(selectedCrawlId, {
        search,
        filter,
        sortBy,
        sortDir,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load crawled URLs.');
    } finally {
      setLoadingUrls(false);
    }
  }, [selectedCrawlId, search, filter, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    void loadUrls();
  }, [loadUrls]);

  const handleSortChange = (
    col: 'normalized_url' | 'status_code' | 'depth' | 'issue_count',
  ) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            URL Inventory Explorer
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Server-backed search, indexability filtering, metadata inspection, and 2D/3D link topology.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedCrawlId && (
            <SegmentedTabs
              tabs={[
                { id: 'table' as const, label: 'URL Table' },
                { id: 'topology' as const, label: 'Topology Graph' },
              ]}
              activeId={viewMode}
              onChange={setViewMode}
              layoutGroupId="url-explorer-mode"
              variant="light"
            />
          )}

          {crawls.length > 0 && (
            <select
              aria-label="Select crawl run"
              value={selectedCrawlId}
              onChange={(e) => {
                setSelectedCrawlId(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              {crawls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.status} ({c.processedCount} URLs)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <AuditSubNav
        latestCrawlId={selectedCrawlId || null}
        activeProjectName={activeProject?.name}
      />

      {loadingCrawls && <DashboardSkeleton />}
      {!loadingCrawls && error && (
        <ErrorStateCard message={error} onRetry={() => void loadUrls()} />
      )}

      {!loadingCrawls && !error && !selectedCrawlId && (
        <EmptyStateCard
          title="No crawled URLs available"
          description={
            selectedProjectId
              ? 'Launch a technical crawl first to populate the URL inventory.'
              : 'Create a domain project first before inspecting crawled URLs.'
          }
          actionLabel={selectedProjectId ? 'Start Crawl' : 'Go to Projects'}
          onAction={() => navigate(selectedProjectId ? '/audit/new' : '/projects')}
        />
      )}

      {!loadingCrawls && selectedCrawlId && viewMode === 'topology' && (
        <CrawlVisualization urls={items} onSelectUrl={setSelectedUrl} />
      )}

      {!loadingCrawls && selectedCrawlId && viewMode === 'table' && (
        <URLInventoryTable
          items={items}
          total={total}
          page={page}
          pageSize={pageSize}
          search={search}
          filter={filter}
          sortBy={sortBy}
          sortDir={sortDir}
          loading={loadingUrls}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          onFilterChange={(val) => {
            setFilter(val);
            setPage(1);
          }}
          onSortChange={handleSortChange}
          onPageChange={setPage}
          onSelectUrl={setSelectedUrl}
          onExportCsv={() =>
            void crawlService.downloadUrlsCsv(selectedCrawlId, {
              search,
              filter,
            })
          }
        />
      )}

      <URLDetailsDrawer
        crawlId={selectedCrawlId}
        urlRecord={selectedUrl}
        onClose={() => setSelectedUrl(null)}
      />
    </PageTransition>
  );
}
