import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Download, History, ShieldCheck } from 'lucide-react';
import { competitorService } from '../../services/competitorService';
import type { CompetitorWorkspaceResponse } from '../../types/competitors';
import { GlassPanel } from '../ui/GlassPanel';
import { StatusBadge } from '../ui/StateViews';

type ChartMetric = 'avg_word_count' | 'analyzed_pages' | 'topics_observed';

export function CompetitorComparisonAndReportsPanel({
  workspace,
}: {
  workspace: CompetitorWorkspaceResponse;
}) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>('analyzed_pages');

  const chartData = workspace.comparisonRows
    .map((r) => ({
      name: r.domain,
      value:
        chartMetric === 'avg_word_count'
          ? r.avgWordCount
          : chartMetric === 'topics_observed'
            ? r.topicKeywordsCount
            : r.analyzedPagesCount,
    }))
    .filter((d) => d.value !== null && d.value !== undefined);

  const hasChartValues = chartData.some((d) => (d.value ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Side-by-Side Comparison Matrix + Single-Dimension Chart */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Competitor Benchmark Comparison Matrix
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Measured HTML crawl metrics are shown side by side. Unconfigured external Domain Authority, Backlinks, and Estimated Monthly Traffic remain explicitly Unavailable.
            </p>
          </div>

          <div
            className="inline-flex flex-wrap shrink-0 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
            role="group"
            aria-label="Select Single Comparison Chart Metric"
          >
            <button
              type="button"
              onClick={() => setChartMetric('analyzed_pages')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'analyzed_pages'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Analyzed Pages
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('avg_word_count')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'avg_word_count'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Avg Word Count
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('topics_observed')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                chartMetric === 'topics_observed'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Topics Extracted
            </button>
          </div>
        </div>

        {!hasChartValues ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 p-6 text-center text-xs text-[var(--text-muted)]">
            No measured {chartMetric.replace(/_/g, ' ')} telemetry recorded yet across project or competitor pages. Run live page analysis to populate this chart.
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-2.5 pr-3 font-semibold">Domain</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pages</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg Words</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg ms</th>
                <th className="py-2.5 px-3 font-semibold text-right">Speed (M / D)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Shared KW</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gap Opps</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ext. DA / Traffic</th>
                <th className="py-2.5 pl-3 font-semibold">Backlinks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {workspace.comparisonRows.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--bg-subtle)]/40">
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-[var(--text-primary)]">{row.name}</div>
                    <div className="font-mono text-[11px] text-[var(--accent-primary)]">
                      {row.domain}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge
                      label={row.entityType === 'project' ? 'Own Site' : row.approvalStatus.replace(/_/g, ' ')}
                      tone={row.entityType === 'project' ? 'indigo' : row.approvalStatus === 'approved' ? 'success' : 'neutral'}
                    />
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {row.analyzedPagesCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {row.avgWordCount !== null ? row.avgWordCount.toLocaleString() : 'Unavailable'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {row.avgResponseTimeMs !== null ? `${row.avgResponseTimeMs}ms` : 'Unavailable'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {row.projectAvgPerfMobile !== null || row.projectAvgPerfDesktop !== null
                      ? `${row.projectAvgPerfMobile ?? '—'} / ${row.projectAvgPerfDesktop ?? '—'}`
                      : 'Unavailable'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {row.sharedKeywordsCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                    {row.gapOpportunitiesCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                    {row.externalDomainAuthority ?? 'Unavailable'} /{' '}
                    {row.externalMonthlyTraffic ?? 'Unavailable'}
                  </td>
                  <td className="py-3 pl-3 font-mono text-[var(--text-muted)]">
                    {row.externalBacklinksCount ?? 'Unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Export Downloads */}
      <GlassPanel className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Export Competitor & Content Gap Report
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Includes full data provenance disclosure, analyzed page metrics, overlap rows, and approved content briefs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={competitorService.getExportUrl(workspace.projectId, 'csv')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </a>
          <a
            href={competitorService.getExportUrl(workspace.projectId, 'json')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export JSON Bundle</span>
          </a>
        </div>
      </GlassPanel>

      {/* Research Run History & Governance Audit Trail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlassPanel className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Competitor Research Runs ({workspace.researchRuns.length})
            </h3>
          </div>
          {workspace.researchRuns.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No competitor analysis or discovery runs recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {workspace.researchRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)] font-mono">
                      {run.competitorDomain} · {run.runKind.replace(/_/g, ' ')}
                    </span>
                    <StatusBadge
                      label={run.status}
                      tone={
                        run.status === 'Completed'
                          ? 'success'
                          : run.status === 'Completed with Warnings'
                            ? 'warning'
                            : run.status === 'Failed'
                              ? 'danger'
                              : 'info'
                      }
                    />
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
                    URLs: {run.urlsScanned} · Topics: {run.topicsExtracted} · Overlaps: {run.overlapsFound} · Gaps: {run.gapsIdentified}
                  </div>
                  {run.errorSummary && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                      {run.errorSummary}
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--text-muted)]">
                    By {run.triggeredBy} · {new Date(run.startedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Governance & Approval Audit Trail ({workspace.auditTrail.length})
            </h3>
          </div>
          {workspace.auditTrail.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No competitor or content gap audit events yet.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {workspace.auditTrail.map((evt) => (
                <div
                  key={evt.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {evt.actorName} ({evt.actorRole})
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {evt.entityType.replace(/_/g, ' ')}: {evt.previousState} →{' '}
                    <span className="font-semibold">{evt.newState}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{evt.reason}</div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
