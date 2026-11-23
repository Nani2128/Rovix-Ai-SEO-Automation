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
import { BarChart3, Download, FileBarChart2, History, ShieldCheck } from 'lucide-react';
import { geoService } from '../../services/geoService';
import type { GeoWorkspaceResponse } from '../../types/geographic';
import { GlassPanel } from '../ui/GlassPanel';
import { StatusBadge } from '../ui/StateViews';

type ComparisonChartDimension = 'gsc_impressions' | 'trends_index' | 'geo_keywords';

export function GeoComparisonReportsPanel({
  workspace,
  onSelectLocation,
}: {
  workspace: GeoWorkspaceResponse;
  onSelectLocation: (loc: {
    kind: 'country' | 'state' | 'city';
    countryCode: string;
    countryName: string;
    stateRegion?: string;
    city?: string;
  }) => void;
}) {
  const [chartDimension, setChartDimension] =
    useState<ComparisonChartDimension>('geo_keywords');

  const chartData = workspace.comparisonRows
    .map((r) => ({
      name: r.locationLabel,
      value:
        chartDimension === 'gsc_impressions'
          ? r.gscDimension.impressions
          : chartDimension === 'trends_index'
            ? r.trendsDimension.relativeIndex
            : r.geoKeywordCount,
    }))
    .filter((d) => d.value !== null && d.value !== undefined);

  const hasChartValues = chartData.some((d) => (d.value ?? 0) > 0);

  return (
    <div className="space-y-5">
      {/* Side-by-Side Market Comparison Table (Strictly Separated Dimensions) */}
      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Geographic Market Comparison & Performance
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Incomparable metrics (GSC country impressions, Trends 0–100 relative index, city SERP ranks, and GBP) are always displayed in separate dimensions — never blended into a composite score.
            </p>
          </div>

          <div
            className="inline-flex flex-wrap rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
            role="group"
            aria-label="Chart Metric Dimension"
          >
            <button
              type="button"
              onClick={() => setChartDimension('geo_keywords')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                chartDimension === 'geo_keywords'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Geo Keywords
            </button>
            <button
              type="button"
              onClick={() => setChartDimension('gsc_impressions')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                chartDimension === 'gsc_impressions'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              GSC Country Impressions
            </button>
            <button
              type="button"
              onClick={() => setChartDimension('trends_index')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                chartDimension === 'trends_index'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Trends Relative (0–100)
            </button>
          </div>
        </div>

        {/* Single-Dimension Chart */}
        {chartData.length === 0 || !hasChartValues ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 p-6 text-center text-xs text-[var(--text-muted)]">
            {chartDimension === 'gsc_impressions'
              ? 'No measured GSC country impressions collected yet for configured markets (Unavailable).'
              : chartDimension === 'trends_index'
                ? 'No Google Trends 0–100 relative index values available yet for configured markets.'
                : 'No geo-scoped keywords discovered for configured markets yet. Run Geographic Discovery to compare keyword footprints.'}
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                />
                <YAxis
                  domain={chartDimension === 'trends_index' ? [0, 100] : ['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="var(--accent-primary)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          {workspace.comparisonRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
              Add at least one target market to inspect side-by-side comparison.
            </div>
          ) : (
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3">Market</th>
                  <th className="py-2.5 px-3">Scope & Priority</th>
                  <th className="py-2.5 px-3">GSC Observed (Country)</th>
                  <th className="py-2.5 px-3">Trends Index (0–100)</th>
                  <th className="py-2.5 px-3">City / Regional Rank</th>
                  <th className="py-2.5 px-3">Google Business Profile</th>
                  <th className="py-2.5 pl-3 text-right">URLs & Keywords</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {workspace.comparisonRows.map((row) => (
                  <tr key={row.marketId} className="hover:bg-[var(--bg-subtle)]/60">
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectLocation({
                            kind:
                              row.granularity === 'state_region'
                                ? 'state'
                                : row.granularity,
                            countryCode: row.countryCode,
                            countryName: row.locationLabel,
                            stateRegion: row.stateRegion || undefined,
                            city: row.city || undefined,
                          })
                        }
                        className="font-display font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer text-left"
                      >
                        {row.locationLabel}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        label={`${row.priority} · ${row.granularity.replace('_', ' ')}`}
                        tone={row.approvalStatus === 'approved' ? 'success' : 'warning'}
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      {row.gscDimension.status === 'measured' &&
                      row.gscDimension.impressions !== null ? (
                        <div>
                          <div className="text-[var(--text-primary)] font-semibold">
                            {(row.gscDimension.clicks ?? 0).toLocaleString()} clicks ·{' '}
                            {row.gscDimension.impressions.toLocaleString()} impr
                          </div>
                          <div className="font-sans text-[10.5px] text-[var(--text-muted)]">
                            Pos {row.gscDimension.avgPosition?.toFixed(1) ?? 'N/A'}
                          </div>
                        </div>
                      ) : (
                        <span className="font-sans text-[11px] text-[var(--text-muted)]">
                          Unavailable ({row.gscDimension.scopeNote})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      {row.trendsDimension.relativeIndex !== null ? (
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {row.trendsDimension.relativeIndex}/100
                          </span>
                          <div className="font-sans text-[10.5px] text-[var(--text-muted)]">
                            {row.trendsDimension.direction} (relative)
                          </div>
                        </div>
                      ) : (
                        <span className="font-sans text-[11px] text-[var(--text-muted)]">
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">
                      {row.rankTrackerDimension.avgRank !== null
                        ? `#${row.rankTrackerDimension.avgRank.toFixed(1)}`
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">
                      {row.gbpDimension.profilesMatched !== null
                        ? `${row.gbpDimension.profilesMatched} profile(s)`
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      <div>{row.geoKeywordCount} kw</div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        {row.urlCoverage.mappedCount} mapped / {row.urlCoverage.missingPageCount} gap
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassPanel>

      {/* Geographic Reports & Export */}
      <GlassPanel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileBarChart2
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Geographic Reports & Provenance Export
              </h3>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Exports approved target markets, country GSC telemetry, Trends indices, URL gaps, and explainable opportunities with explicit &ldquo;Unavailable&rdquo; markers for disconnected sources.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={geoService.getExportUrl(workspace.projectId, 'csv')}
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/45 transition-colors"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export CSV Report</span>
            </a>
            <a
              href={geoService.getExportUrl(workspace.projectId, 'json')}
              download
              className="inline-flex items-center gap-1.5 rounded-xl [background-image:linear-gradient(90deg,var(--accent-pill-start),var(--accent-pill-end))] px-3.5 py-2 text-xs font-semibold text-[var(--accent-on-pill)] hover:opacity-95 transition-opacity"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export JSON Bundle</span>
            </a>
          </div>
        </div>
      </GlassPanel>

      {/* Research History & Governance Audit Trail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2">
            <History
              className="h-4 w-4 text-[var(--accent-primary)]"
              aria-hidden="true"
            />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Geographic Research Runs ({workspace.researchRuns.length})
            </h3>
          </div>
          {workspace.researchRuns.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No geographic discovery runs executed yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {workspace.researchRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-[var(--text-primary)]">
                      {[run.targetCity, run.targetStateRegion, run.targetCountry]
                        .filter(Boolean)
                        .join(', ')}{' '}
                      ({run.targetLanguage.toUpperCase()})
                    </span>
                    <StatusBadge
                      label={run.status}
                      tone={
                        run.status === 'Completed'
                          ? 'success'
                          : run.status === 'Completed with Warnings'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Seeds: {run.seedTerms.join(', ') || 'Project default'} · Discovered{' '}
                    <strong className="font-mono">{run.keywordsDiscovered}</strong> keywords ·{' '}
                    {run.triggeredBy} · {new Date(run.startedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-[var(--accent-primary)]"
              aria-hidden="true"
            />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Market Approval & Governance Audit Log ({workspace.approvalAuditTrail.length})
            </h3>
          </div>
          {workspace.approvalAuditTrail.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No market approvals or URL mapping changes logged yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {workspace.approvalAuditTrail.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {entry.actorName} ({entry.actorRole})
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {entry.previousState} → <strong>{entry.newState}</strong>: {entry.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
