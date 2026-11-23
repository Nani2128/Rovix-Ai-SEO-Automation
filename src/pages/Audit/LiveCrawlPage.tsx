import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { CrawlEventRecord, CrawlRun, CrawlURLRecord } from '../../types/crawl';
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
import { CrawlActivityFeed } from '../../components/audit/CrawlActivityFeed';
import { CrawlProgressPanel } from '../../components/audit/CrawlProgressPanel';
import { CrawlVisualization } from '../../components/audit/CrawlVisualization';
import { URLDetailsDrawer } from '../../components/audit/URLDetailsDrawer';

const OPERATOR_ROLES = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Developer',
];

export function LiveCrawlPage() {
  const { crawlId: routeCrawlId } = useParams<{ crawlId?: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { selectedProjectId, projects } = useDashboardStore();

  const [activeCrawlId, setActiveCrawlId] = useState<string | null>(
    routeCrawlId ?? null,
  );
  const [crawlRun, setCrawlRun] = useState<CrawlRun | null>(null);
  const [events, setEvents] = useState<CrawlEventRecord[]>([]);
  const [urls, setUrls] = useState<CrawlURLRecord[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<CrawlURLRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const canCancel = OPERATOR_ROLES.includes(user?.role ?? 'QA');

  useEffect(() => {
    if (routeCrawlId) {
      setActiveCrawlId(routeCrawlId);
      return;
    }
    if (!selectedProjectId) {
      setActiveCrawlId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    crawlService
      .listProjectCrawls(selectedProjectId)
      .then((res) => {
        if (res.crawls[0]) {
          setActiveCrawlId(res.crawls[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          useAuthStore.getState().expireSession();
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to locate crawls.');
        setLoading(false);
      });
  }, [routeCrawlId, selectedProjectId]);

  const refreshDetails = useCallback(async (id: string) => {
    try {
      const res = await crawlService.fetchCrawlDetails(id);
      setCrawlRun(res.crawlRun);
      setEvents(res.events);
      setUrls(res.urls);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load crawl details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeCrawlId) return;
    setLoading(true);
    void refreshDetails(activeCrawlId);

    const unsubscribe = crawlService.subscribeCrawlEvents(activeCrawlId, {
      onSnapshot: (snap) => {
        setCrawlRun(snap.crawlRun);
        setEvents(snap.events);
        setLoading(false);
      },
      onEvent: (msg) => {
        setEvents((prev) =>
          prev.some((e) => e.id === msg.event.id) ? prev : [...prev, msg.event],
        );
        if (msg.crawlRun) {
          setCrawlRun(msg.crawlRun);
        }
        if (
          msg.event.eventType === 'url_crawled' ||
          msg.event.eventType === 'crawl_completed' ||
          msg.event.eventType === 'crawl_cancelled'
        ) {
          void crawlService
            .fetchCrawlUrls(activeCrawlId, { page: 1, pageSize: 60 })
            .then((u) => setUrls(u.items))
            .catch(() => {});
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [activeCrawlId, refreshDetails]);

  const handleCancel = async () => {
    if (!activeCrawlId) return;
    setCancelling(true);
    try {
      const res = await crawlService.cancelCrawl(activeCrawlId);
      setCrawlRun(res.crawlRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel request failed.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Live Crawl Execution Monitor
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Real-time SSE telemetry, discovery topology graph, and worker activity log.
          </p>
        </div>

        {activeCrawlId && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/audit/urls/${activeCrawlId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <span>Inspect URLs</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              to="/audit/issues"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#7047EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5E38D8]"
            >
              <span>View Detected Issues</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>

      <AuditSubNav
        latestCrawlId={activeCrawlId}
        activeProjectName={activeProject?.name}
      />

      {loading && <DashboardSkeleton />}
      {!loading && error && (
        <ErrorStateCard
          message={error}
          onRetry={() => activeCrawlId && void refreshDetails(activeCrawlId)}
        />
      )}

      {!loading && !error && !crawlRun && (
        <EmptyStateCard
          title="No crawl selected"
          description={
            selectedProjectId
              ? 'Start a new crawl from the configuration wizard to watch real-time URL discovery.'
              : 'Create a domain project first before starting your initial crawl.'
          }
          actionLabel={selectedProjectId ? 'Start New Crawl' : 'Go to Projects'}
          onAction={() => navigate(selectedProjectId ? '/audit/new' : '/projects')}
        />
      )}

      {!loading && crawlRun && (
        <>
          <CrawlProgressPanel
            crawlRun={crawlRun}
            canCancel={canCancel}
            cancelling={cancelling}
            onCancel={() => void handleCancel()}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <CrawlVisualization urls={urls} onSelectUrl={setSelectedUrl} />
            </div>
            <div className="lg:col-span-5">
              <CrawlActivityFeed events={events} />
            </div>
          </div>
        </>
      )}

      <URLDetailsDrawer
        crawlId={activeCrawlId ?? ''}
        urlRecord={selectedUrl}
        onClose={() => setSelectedUrl(null)}
      />
    </PageTransition>
  );
}
