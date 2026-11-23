import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMicroUsd, MICROS_PER_USD } from '../../lib/usageCostEngine';
import type {
  CostBasis,
  UsageAnalyticsDashboardPayload,
} from '../../types/usageIntelligence';

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'Unavailable';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return 'Unavailable';
  return `${pct.toFixed(1)}%`;
}

const COST_BASIS_LABELS: Record<CostBasis, string> = {
  provider_reported_billed: 'Provider Billed',
  calculated_actual_tokens: 'Calculated (Actual Tokens)',
  estimated: 'Estimated (countTokens API)',
  internal_non_billed: 'Internal Non-Billed ($0.00)',
  unavailable: 'Cost Unavailable',
};

export function UsageOverviewSection({
  dashboard,
  onNavigateTab,
}: {
  dashboard: UsageAnalyticsDashboardPayload;
  onNavigateTab: (tab: 'agents' | 'workflows' | 'providers' | 'budgets' | 'ledger') => void;
}) {
  const { overview, performance, dailySpend } = dashboard;

  const chartData = dailySpend.map((d) => ({
    date: d.date,
    costUsd: Number((d.measuredCostMicros / MICROS_PER_USD).toFixed(6)),
    tokens: d.totalTokens,
    requests: d.requests,
  }));

  const unacknowledgedAlerts = dashboard.alerts.filter((a) => !a.acknowledgedAt);

  return (
    <div className="space-y-6">
      {/* Primary Measured KPI Strip */}
      <section aria-label="Measured usage and cost overview">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Total Measured Tokens
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.measuredTokenEvents > 0
                ? overview.totalTokens.toLocaleString()
                : '0'}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
              In {overview.totalInputTokens.toLocaleString()} · Out{' '}
              {overview.totalOutputTokens.toLocaleString()}
              {overview.totalCachedInputTokens > 0
                ? ` · Cached ${overview.totalCachedInputTokens.toLocaleString()}`
                : ''}
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Total Measured Cost
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.totalRequests > 0 &&
              overview.unpricedCostEvents === overview.totalRequests
                ? 'Unavailable'
                : formatMicroUsd(overview.totalMeasuredCostMicros)}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              {overview.unpricedCostEvents > 0
                ? `${overview.unpricedCostEvents} unpriced event(s) excluded`
                : 'All metered events priced'}
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Today&apos;s Measured Spend
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {formatMicroUsd(overview.todayMeasuredCostMicros)}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              UTC day · {overview.totalRequests.toLocaleString()} total requests
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Active Executions
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {overview.activeExecutions}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              Running in orchestration engine
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Avg Provider Latency
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {formatMs(overview.avgLatencyMs)}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              Measured response round-trip
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Failed Executions
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
                overview.failedExecutions > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {overview.failedExecutions}
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              Failure rate {formatPct(performance.failureRatePct)}
            </div>
          </div>
        </div>
      </section>

      {/* Spend Trend & Performance Intelligence Split */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Daily Measured Spend Chart */}
        <section className="xl:col-span-7 rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Daily Measured API Spend
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Aggregated from deduplicated provider usage events (USD)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('ledger')}
              className="text-xs font-medium text-[#7047EB] hover:underline dark:text-[#22D3EE] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Inspect Usage Ledger
            </button>
          </div>

          {chartData.length === 0 ? (
            <div className="mt-6 flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-6 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No provider usage events recorded yet
              </p>
              <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">
                Execute a workflow in AI Agent Factory or Workflow Studio to capture real
                token telemetry, provider latency, and reconciled cost calculations.
              </p>
            </div>
          ) : (
            <div className="mt-4 h-60 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartData.length <= 2 ? (
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-hairline)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={{ stroke: 'var(--border-hairline)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v.toFixed(v < 0.01 ? 4 : 2)}`}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(value: unknown) => [
                        `$${Number(value ?? 0).toFixed(6)}`,
                        'Measured Cost',
                      ]}
                    />
                    <Bar
                      dataKey="costUsd"
                      fill="#7047EB"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={64}
                    />
                  </BarChart>
                ) : (
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-hairline)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={{ stroke: 'var(--border-hairline)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v.toFixed(v < 0.01 ? 4 : 2)}`}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(value: unknown) => [
                        `$${Number(value ?? 0).toFixed(6)}`,
                        'Measured Cost',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="costUsd"
                      stroke="#7047EB"
                      strokeWidth={2}
                      fill="#7047EB"
                      fillOpacity={0.14}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Performance Intelligence Timing Breakdown */}
        <section className="xl:col-span-5 rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Execution Performance Intelligence
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Real queue wait vs task execution vs provider latency
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
              {performance.totalTasksMeasured} tasks
            </span>
          </div>

          <dl className="mt-4 divide-y divide-[var(--border-hairline)] text-xs">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">Average Queue Wait Time</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatMs(performance.avgQueueWaitMs)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">Average Task Execution Duration</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatMs(performance.avgExecutionDurationMs)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">Average Provider Response Latency</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatMs(performance.avgProviderLatencyMs)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">Average Workflow Completion</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatMs(performance.avgWorkflowCompletionMs)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">Completion / Failure Rate</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatPct(performance.completionRatePct)} /{' '}
                {formatPct(performance.failureRatePct)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-secondary)]">
                Retries · Timeouts · Cancellations
              </dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {performance.retryCount} · {performance.timeoutCount} ·{' '}
                {performance.cancelledTasks}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Cost Provenance & Budget Status Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Measurement & Cost Provenance Audit */}
        <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Cost Basis &amp; Measurement Provenance
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Actual provider usage is strictly separated from estimates and unpriced items
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('providers')}
              className="text-xs font-medium text-[#7047EB] hover:underline dark:text-[#22D3EE] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pricing Registry
            </button>
          </div>

          <div className="mt-4 divide-y divide-[var(--border-hairline)] text-xs">
            {(Object.keys(COST_BASIS_LABELS) as CostBasis[]).map((basis) => {
              const count = overview.costBasisCounts[basis] ?? 0;
              return (
                <div
                  key={basis}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-[var(--text-secondary)]">
                    {COST_BASIS_LABELS[basis]}
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {count.toLocaleString()} event{count === 1 ? '' : 's'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Active Budgets & Unacknowledged Alerts Summary */}
        <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Budgets &amp; Active Alerts
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {dashboard.budgets.length} configured budget(s) ·{' '}
                {unacknowledgedAlerts.length} unacknowledged alert(s)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('budgets')}
              className="text-xs font-medium text-[#7047EB] hover:underline dark:text-[#22D3EE] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Budgets
            </button>
          </div>

          {dashboard.budgets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs text-[var(--text-secondary)]">
              No spending or token budgets configured for this workspace. Create daily,
              weekly, monthly, or per-workflow caps in Budget Management to trigger alerts
              or pause execution automatically.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.budgets.slice(0, 4).map((ev) => {
                const limitLabel =
                  ev.budget.budgetLimitMicros !== null
                    ? formatMicroUsd(ev.budget.budgetLimitMicros)
                    : ev.budget.maxTokensPerRun !== null
                      ? `${ev.budget.maxTokensPerRun.toLocaleString()} tokens`
                      : 'Limit unset';
                const barPct = Math.min(100, Math.max(0, ev.utilizationPct ?? 0));
                const toneColor =
                  ev.status === 'limit_reached'
                    ? 'bg-red-600'
                    : ev.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-600';
                return (
                  <div key={ev.budget.id} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {ev.budget.name}
                        <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                          · {ev.periodWindowLabel}
                        </span>
                      </span>
                      <span className="font-mono text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                        {formatMicroUsd(ev.measuredSpendMicros)} / {limitLabel}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                      <div
                        className={`h-full rounded-full transition-all ${toneColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
