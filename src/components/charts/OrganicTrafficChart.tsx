import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle } from 'lucide-react';
import type {
  DataLoadStatus,
  MetricProvenance,
  TrafficMetric,
} from '../../types/dashboard';
import { LoadingShimmer } from '../animation/MotionPrimitives';
import { DataProvenanceStrip } from '../ui/DataProvenanceMeta';
import { GlassPanel } from '../ui/GlassPanel';
import { SegmentedTabs } from '../ui/InteractivePrimitives';
import { EmptyStateCard, ErrorStateCard } from '../ui/StateViews';

type MetricTab = 'sessions' | 'clicks' | 'impressions';

const TAB_LABELS: { id: MetricTab; label: string; unit: string }[] = [
  { id: 'sessions', label: 'Sessions', unit: 'visits' },
  { id: 'clicks', label: 'Clicks', unit: 'clicks' },
  { id: 'impressions', label: 'Impressions', unit: 'impr.' },
];

export function OrganicTrafficChart({
  data,
  provenance,
  status,
  isStale,
  onRetry,
}: {
  data: TrafficMetric[];
  provenance?: MetricProvenance;
  status: DataLoadStatus;
  isStale: boolean;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<MetricTab>('sessions');
  const [showComparison, setShowComparison] = useState(false);

  const prevKey =
    activeTab === 'sessions'
      ? 'previousSessions'
      : activeTab === 'clicks'
        ? 'previousClicks'
        : 'previousImpressions';

  const currentTabMeta =
    TAB_LABELS.find((t) => t.id === activeTab) ?? TAB_LABELS[0];

  const validPoints = useMemo(
    () =>
      data.filter(
        (pt) => pt[activeTab] !== null && pt[activeTab] !== undefined,
      ),
    [data, activeTab],
  );

  const hasAnySeries = validPoints.length > 0;
  const activeSource =
    activeTab === 'sessions' ? 'Google Analytics 4' : 'Google Search Console';

  return (
    <GlassPanel
      as="section"
      ariaLabelledBy="organic-traffic-chart-heading"
      animate
      className="p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              id="organic-traffic-chart-heading"
              className="font-display text-lg font-bold text-[var(--text-primary)]"
            >
              Organic Search &amp; Traffic Trend
            </h2>
            {isStale && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Stale Sync
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {activeTab === 'sessions'
              ? 'Google Analytics 4 organic sessions over selected period'
              : `Google Search Console ${currentTabMeta.label.toLowerCase()} over selected period`}
          </p>
          <DataProvenanceStrip
            source={activeSource}
            collectedAt={provenance?.collectedAt ?? null}
            reportingPeriod={provenance?.reportingPeriod ?? 'Last 30 days'}
            measurementStatus={hasAnySeries ? 'measured' : 'unavailable'}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasAnySeries}
            onClick={() => setShowComparison((p) => !p)}
            aria-pressed={showComparison}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
              showComparison
                ? 'border-[#7047EB]/45 bg-[#7047EB]/10 text-[#7047EB] dark:text-[#C4B5FD]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Compare Prev
          </button>

          <SegmentedTabs
            tabs={TAB_LABELS}
            activeId={activeTab}
            onChange={setActiveTab}
            layoutGroupId="traffic-metric-tabs"
            variant="indigo"
          />
        </div>
      </div>

      <div className="mt-5">
        {status === 'loading' ? (
          <LoadingShimmer className="h-[255px] w-full rounded-2xl" />
        ) : status === 'error' ? (
          <ErrorStateCard
            message="Failed to fetch search performance time-series."
            onRetry={onRetry}
          />
        ) : !hasAnySeries ? (
          <EmptyStateCard
            title={
              activeTab === 'sessions'
                ? 'Google Analytics 4 Not Connected'
                : 'Google Search Console Not Connected'
            }
            description={
              activeTab === 'sessions'
                ? 'Connect a GA4 property via OAuth to stream organic sessions and key events for this domain.'
                : `Authorize Google Search Console to sync daily search ${currentTabMeta.label.toLowerCase()} for this domain.`
            }
            actionLabel="Configure Integrations"
            onAction={() => navigate('/integrations')}
          />
        ) : (
          <div className="h-[255px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart
                data={validPoints}
                margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashTrafficFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--accent-secondary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--chart-axis)', fontSize: 11.5 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                  tickFormatter={(val: number) =>
                    val >= 1000 ? `${Math.round(val / 1000)}k` : String(val)
                  }
                />
                <Tooltip
                  cursor={{ stroke: '#8B6BFF', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                    boxShadow: '0 14px 30px -10px rgba(15,23,42,0.45)',
                  }}
                  labelStyle={{ color: '#C4B5FD', marginBottom: '2px', fontWeight: 600 }}
                  itemStyle={{ color: '#FFFFFF' }}
                  formatter={(val, name) => [
                    `${Number(val ?? 0).toLocaleString()} ${currentTabMeta.unit}`,
                    name === prevKey ? 'Previous period' : currentTabMeta.label,
                  ]}
                />
                {showComparison && (
                  <Area
                    type="monotone"
                    dataKey={prevKey}
                    stroke="#94A3B8"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    fill="none"
                    connectNulls
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={550}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={activeTab}
                  stroke="var(--accent-primary)"
                  strokeWidth={2.75}
                  fill="url(#dashTrafficFill)"
                  connectNulls
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={750}
                  activeDot={{
                    r: 5.5,
                    fill: 'var(--accent-primary)',
                    stroke: '#FFFFFF',
                    strokeWidth: 2.5,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
