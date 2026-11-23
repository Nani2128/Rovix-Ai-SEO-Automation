import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileCheck2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import { dashboardService } from '../../services/dashboardService';
import type {
  ActivityCategory,
  ActivityEvent,
  RecentActivityFeedResponse,
} from '../../types/dashboard';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

type FeedFilter = 'all' | 'crawl_completion' | 'error_report' | 'pending_task';

const EVENT_ICON: Record<ActivityEvent['type'], typeof CheckCircle2> = {
  crawl: RefreshCw,
  issue: AlertCircle,
  keyword_approval: CheckCircle2,
  content_review: FileCheck2,
  publishing: ClipboardList,
  verification: CheckCircle2,
  integration_failure: ShieldAlert,
  sync: Database,
};

const EVENT_TONE: Record<ActivityEvent['status'], BadgeTone> = {
  Succeeded: 'success',
  Warning: 'warning',
  Failed: 'danger',
  Pending: 'indigo',
};

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  crawl_completion: 'Crawl',
  error_report: 'Error Report',
  pending_task: 'Pending Task',
  system: 'System',
};

function inferCategory(ev: ActivityEvent): ActivityCategory {
  if (ev.category) return ev.category;
  if (ev.status === 'Failed' || ev.type === 'issue' || ev.type === 'integration_failure') {
    return 'error_report';
  }
  if (ev.status === 'Pending' || ev.type === 'publishing') {
    return 'pending_task';
  }
  if (ev.type === 'crawl' || ev.type === 'verification') {
    return 'crawl_completion';
  }
  return 'system';
}

function formatActivityTime(isoOrText: string): string {
  const date = new Date(isoOrText);
  if (Number.isNaN(date.getTime())) return isoOrText;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMs >= 0 && diffMin < 1) return 'Just now';
  if (diffMs >= 0 && diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffMs >= 0 && diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RecentActivityTimeline({
  events,
  projectId,
}: {
  events: ActivityEvent[];
  projectId?: string;
}) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const [filter, setFilter] = useState<FeedFilter>('all');
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [liveFeed, setLiveFeed] = useState<RecentActivityFeedResponse | null>(null);

  // Reset cached stream snapshot when initial prop or active project changes
  useEffect(() => {
    setLiveFeed(null);
  }, [projectId, events]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const feed = await dashboardService.fetchRecentActivity({
        projectId,
        limit: 30,
      });
      setLiveFeed(feed);
    } catch {
      // Keep existing rendered events on transient error
    } finally {
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!liveEnabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setStreamConnected(false);
      return;
    }

    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const source = new EventSource(`/api/activity/stream${qs}`);

    const onFeedPayload = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as RecentActivityFeedResponse;
        if (Array.isArray(parsed.events)) {
          setLiveFeed(parsed);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    source.onopen = () => setStreamConnected(true);
    source.addEventListener('activity_snapshot', onFeedPayload as EventListener);
    source.addEventListener('activity_update', onFeedPayload as EventListener);
    source.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      source.removeEventListener('activity_snapshot', onFeedPayload as EventListener);
      source.removeEventListener('activity_update', onFeedPayload as EventListener);
      source.close();
      setStreamConnected(false);
    };
  }, [liveEnabled, projectId]);

  const activeEvents = useMemo(
    () => liveFeed?.events ?? events,
    [liveFeed, events],
  );

  const counts = useMemo(() => {
    if (liveFeed?.counts) return liveFeed.counts;
    return {
      all: activeEvents.length,
      crawl_completion: activeEvents.filter((e) => inferCategory(e) === 'crawl_completion').length,
      error_report: activeEvents.filter((e) => inferCategory(e) === 'error_report').length,
      pending_task: activeEvents.filter((e) => inferCategory(e) === 'pending_task').length,
    };
  }, [liveFeed, activeEvents]);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return activeEvents;
    return activeEvents.filter((ev) => inferCategory(ev) === filter);
  }, [activeEvents, filter]);

  const filterTabs: { id: FeedFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'crawl_completion', label: 'Crawl Completions', count: counts.crawl_completion },
    { id: 'error_report', label: 'Error Reports', count: counts.error_report },
    { id: 'pending_task', label: 'Pending Tasks', count: counts.pending_task },
  ];

  return (
    <GlassPanel
      as="section"
      animate
      ariaLabelledBy="recent-activity-heading"
      className="p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="recent-activity-heading"
              className="font-display text-lg font-bold text-[var(--text-primary)]"
            >
              Recent Activity
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                liveEnabled && streamConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-300'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  liveEnabled && streamConnected
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-400'
                }`}
                aria-hidden="true"
              />
              <span>
                {liveEnabled
                  ? streamConnected
                    ? 'Live Stream'
                    : 'Connecting'
                  : 'Paused'}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Real-time stream of crawl completions, error reports, and pending workspace tasks
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLiveEnabled((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            {liveEnabled ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pause Feed</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resume Live</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            aria-label="Refresh recent activity feed"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Category filter bar */}
      <div
        role="tablist"
        aria-label="Filter recent activity by category"
        className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-[var(--border-hairline)] pb-3"
      >
        {filterTabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-[#7047EB]/35 bg-[#7047EB]/10 text-[#7047EB] dark:border-[#8B6BFF]/40 dark:bg-[#8B6BFF]/15 dark:text-[#C4B5FD]'
                  : 'border-transparent bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-md px-1.5 py-0.2 font-mono text-[10.5px] ${
                  active
                    ? 'bg-[#7047EB]/15 text-[#7047EB] dark:bg-[#8B6BFF]/25 dark:text-[#DDD6FE]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {visibleEvents.length === 0 ? (
        <div className="mt-4">
          <EmptyStateCard
            title={
              filter === 'all'
                ? 'No recorded workspace activity yet'
                : `No ${filterTabs.find((t) => t.id === filter)?.label.toLowerCase()} recorded yet`
            }
            description={
              filter === 'all'
                ? 'Every website crawl completion, error report, and pending task will stream here automatically with timestamped evidence.'
                : 'Switch back to All or run a new technical crawl to capture events in this category.'
            }
            actionLabel={filter === 'all' ? 'Open Audit Engine' : 'Show All Activity'}
            onAction={() => {
              if (filter === 'all') {
                navigate('/audit');
              } else {
                setFilter('all');
              }
            }}
          />
        </div>
      ) : (
        <ol className="mt-3 divide-y divide-[var(--border-hairline)]">
          {visibleEvents.slice(0, 15).map((ev, idx) => {
            const Icon = EVENT_ICON[ev.type] ?? CheckCircle2;
            const cat = inferCategory(ev);
            return (
              <motion.li
                key={ev.id}
                initial={prefersReducedMotion ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.24,
                  delay: prefersReducedMotion ? 0 : Math.min(idx, 8) * 0.035,
                  ease: MOTION_EASE,
                }}
                className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[#7047EB] dark:text-[#8B6BFF]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                      {ev.action}
                    </div>
                    {ev.detail && (
                      <div className="mt-0.5 text-[11.5px] text-[var(--text-secondary)] truncate">
                        {ev.detail}
                      </div>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <span>{ev.actor}</span>
                      <span aria-hidden="true">·</span>
                      <span title={ev.timestamp}>{formatActivityTime(ev.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-[var(--text-secondary)]">
                        {CATEGORY_LABEL[cat]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-11 sm:pl-0 shrink-0">
                  <StatusBadge label={ev.status} tone={EVENT_TONE[ev.status]} />
                  {ev.evidenceUrl && (
                    <Link
                      to={ev.evidenceUrl}
                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#7047EB] dark:text-[#8B6BFF] hover:underline whitespace-nowrap shrink-0"
                    >
                      <span>Inspect</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </GlassPanel>
  );
}
