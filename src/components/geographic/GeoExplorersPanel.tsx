import { useMemo, useState } from 'react';
import { Building2, Globe, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import type { GeoGranularity, GeoWorkspaceResponse } from '../../types/geographic';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function GeoExplorersPanel({
  workspace,
  syncingGsc,
  onSyncGsc,
  onSelectLocation,
}: {
  workspace: GeoWorkspaceResponse;
  syncingGsc: boolean;
  onSyncGsc: () => Promise<void>;
  onSelectLocation: (loc: {
    kind: 'country' | 'state' | 'city';
    countryCode: string;
    countryName: string;
    stateRegion?: string;
    city?: string;
  }) => void;
}) {
  const [explorerMode, setExplorerMode] = useState<GeoGranularity>('country');
  const [searchTerm, setSearchTerm] = useState('');

  const countryRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return workspace.mapCountries
      .filter((c) => {
        if (!c.isConfiguredTarget && !c.hasMeasuredGscData && !c.hasRelativeTrendData && !q) {
          return false;
        }
        return (
          !q ||
          c.countryName.toLowerCase().includes(q) ||
          c.countryCode.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.isConfiguredTarget !== b.isConfiguredTarget) {
          return a.isConfiguredTarget ? -1 : 1;
        }
        return (b.gscImpressions ?? -1) - (a.gscImpressions ?? -1);
      });
  }, [workspace.mapCountries, searchTerm]);

  const stateMeasurementsAndTargets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const fromTargets = workspace.targetMarkets.filter((m) => m.granularity === 'state_region');
    const fromMeasurements = workspace.measurements.filter(
      (m) => m.granularity === 'state_region',
    );

    const rows = new Map<
      string,
      {
        key: string;
        countryCode: string;
        countryName: string;
        stateRegion: string;
        isTarget: boolean;
        approvalStatus: string | null;
        relativeTrendIndex: number | null;
        geoKeywords: number;
        mappedUrl: string | null;
      }
    >();

    for (const m of fromTargets) {
      const key = `${m.countryCode}::${m.stateRegion.toLowerCase()}`;
      const mapping = workspace.urlMappings.find((u) => u.marketId === m.id);
      const kwCount = workspace.geoKeywords.filter(
        (k) =>
          k.targetCountry === m.countryCode &&
          k.keyword.toLowerCase().includes(m.stateRegion.toLowerCase()),
      ).length;
      rows.set(key, {
        key,
        countryCode: m.countryCode,
        countryName: m.countryName,
        stateRegion: m.stateRegion,
        isTarget: true,
        approvalStatus: m.approvalStatus,
        relativeTrendIndex: null,
        geoKeywords: kwCount,
        mappedUrl: mapping?.targetUrl ?? null,
      });
    }

    for (const meas of fromMeasurements) {
      const key = `${meas.countryCode}::${meas.stateRegion.toLowerCase()}`;
      const existing = rows.get(key);
      rows.set(key, {
        key,
        countryCode: meas.countryCode,
        countryName: meas.countryName,
        stateRegion: meas.stateRegion,
        isTarget: existing?.isTarget ?? false,
        approvalStatus: existing?.approvalStatus ?? null,
        relativeTrendIndex: meas.relativeTrendIndex,
        geoKeywords: existing?.geoKeywords ?? 0,
        mappedUrl: existing?.mappedUrl ?? null,
      });
    }

    return Array.from(rows.values()).filter(
      (r) =>
        !q ||
        r.stateRegion.toLowerCase().includes(q) ||
        r.countryName.toLowerCase().includes(q),
    );
  }, [workspace]);

  const cityRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const cityTargets = workspace.targetMarkets.filter((m) => m.granularity === 'city');
    return cityTargets
      .map((mkt) => {
        const mapping = workspace.urlMappings.find((u) => u.marketId === mkt.id);
        const kws = workspace.geoKeywords.filter(
          (k) =>
            k.targetCountry === mkt.countryCode &&
            (k.targetCity.toLowerCase() === mkt.city.toLowerCase() ||
              k.keyword.toLowerCase().includes(mkt.city.toLowerCase())),
        );
        const meas = workspace.measurements.find(
          (m) =>
            m.granularity === 'city' &&
            m.countryCode === mkt.countryCode &&
            m.city.toLowerCase() === mkt.city.toLowerCase(),
        );
        return {
          market: mkt,
          mapping,
          keywordCount: kws.length,
          measurement: meas ?? null,
        };
      })
      .filter(
        (r) =>
          !q ||
          r.market.city.toLowerCase().includes(q) ||
          r.market.countryName.toLowerCase().includes(q),
      );
  }, [workspace]);

  return (
    <GlassPanel className="p-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            Granular Geographic Explorers
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Inspect Countries, States/Regions, and Cities with strict scope separation — never blending country GSC traffic into city metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
            role="group"
            aria-label="Explorer Granularity"
          >
            <button
              type="button"
              onClick={() => setExplorerMode('country')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                explorerMode === 'country'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Country Explorer</span>
            </button>
            <button
              type="button"
              onClick={() => setExplorerMode('state_region')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                explorerMode === 'state_region'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>State / Region Explorer</span>
            </button>
            <button
              type="button"
              onClick={() => setExplorerMode('city')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                explorerMode === 'city'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>City Explorer</span>
            </button>
          </div>

          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter locations..."
            aria-label="Filter locations"
            className="h-9 w-48 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />

          <InteractiveButton
            variant="secondary"
            size="sm"
            loading={syncingGsc}
            onClick={() => void onSyncGsc()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sync GSC Countries</span>
          </InteractiveButton>
        </div>
      </div>

      {/* Granularity Integrity Banner for State & City Modes */}
      {explorerMode !== 'country' && (
        <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong>
                {explorerMode === 'state_region'
                  ? 'State & Region Granularity Disclosure'
                  : 'City Granularity Disclosure'}
              </strong>
              <span className="ml-1.5">
                {explorerMode === 'state_region'
                  ? 'Google Search Console reports traffic at the country dimension only. State/region metrics display Trends 0–100 relative regional interest and URL coverage gaps where available.'
                  : 'City-level GSC impressions are Unavailable. City SERP rankings and Local Pack metrics require connected localized rank tracking or Google Business Profile OAuth.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Country Explorer Table */}
      {explorerMode === 'country' && (
        <div className="overflow-x-auto">
          {countryRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
              No configured countries or GSC country measurements found yet. Add a Target Market or sync Google Search Console.
            </div>
          ) : (
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3">Country</th>
                  <th className="py-2.5 px-3">Market Status</th>
                  <th className="py-2.5 px-3 text-right">GSC Clicks</th>
                  <th className="py-2.5 px-3 text-right">GSC Impressions</th>
                  <th className="py-2.5 px-3 text-right">GSC Avg Pos</th>
                  <th className="py-2.5 px-3 text-right">Trends (0–100)</th>
                  <th className="py-2.5 px-3 text-right">Geo Keywords</th>
                  <th className="py-2.5 pl-3">Data Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {countryRows.map((c) => (
                  <tr
                    key={c.countryCode}
                    className="hover:bg-[var(--bg-subtle)]/70 transition-colors"
                  >
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectLocation({
                            kind: 'country',
                            countryCode: c.countryCode,
                            countryName: c.countryName,
                          })
                        }
                        className="font-display font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                      >
                        {c.countryName} ({c.countryCode})
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      {c.isConfiguredTarget ? (
                        <StatusBadge
                          label={`${c.approvalStatus === 'approved' ? 'Approved' : 'Recommended'} · ${c.targetPriority ?? 'target'}`}
                          tone={c.approvalStatus === 'approved' ? 'success' : 'warning'}
                        />
                      ) : (
                        <StatusBadge label="Observed Only" tone="neutral" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {c.gscClicks !== null ? c.gscClicks.toLocaleString() : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {c.gscImpressions !== null
                        ? c.gscImpressions.toLocaleString()
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {c.gscAvgPosition !== null
                        ? c.gscAvgPosition.toFixed(1)
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {c.relativeTrendIndex !== null
                        ? `${c.relativeTrendIndex}/100`
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {c.geoKeywordCount}
                    </td>
                    <td className="py-2.5 pl-3 text-[11px] text-[var(--text-muted)]">
                      {c.dataAvailabilityLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* State & Region Explorer */}
      {explorerMode === 'state_region' && (
        <div className="overflow-x-auto">
          {stateMeasurementsAndTargets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
              No state/region target markets or Google Trends subregion readings stored yet. Add a State/Region target market or run Geographic Discovery.
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3">State / Region</th>
                  <th className="py-2.5 px-3">Target Status</th>
                  <th className="py-2.5 px-3 text-right">Trends Subregion (0–100)</th>
                  <th className="py-2.5 px-3 text-right">GSC Metrics</th>
                  <th className="py-2.5 px-3 text-right">Regional Keywords</th>
                  <th className="py-2.5 pl-3">Mapped URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {stateMeasurementsAndTargets.map((r) => (
                  <tr key={r.key} className="hover:bg-[var(--bg-subtle)]/70">
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectLocation({
                            kind: 'state',
                            countryCode: r.countryCode,
                            countryName: r.countryName,
                            stateRegion: r.stateRegion,
                          })
                        }
                        className="font-display font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                      >
                        {r.stateRegion}, {r.countryCode}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        label={r.isTarget ? r.approvalStatus ?? 'Target' : 'Trends Region'}
                        tone={r.approvalStatus === 'approved' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {r.relativeTrendIndex !== null
                        ? `${r.relativeTrendIndex}/100`
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[11px] text-[var(--text-muted)]">
                      Unavailable (Country scope only)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {r.geoKeywords}
                    </td>
                    <td className="py-2.5 pl-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {r.mappedUrl ?? 'No dedicated URL mapped'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* City Explorer */}
      {explorerMode === 'city' && (
        <div className="overflow-x-auto">
          {cityRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-8 text-center text-xs text-[var(--text-muted)]">
              No city-level target markets configured yet. Configure a city territory (e.g. Austin, London, Toronto) in Overview & Target Markets.
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3">City & Territory</th>
                  <th className="py-2.5 px-3">Approval</th>
                  <th className="py-2.5 px-3">City Rank Tracking</th>
                  <th className="py-2.5 px-3">GBP Local Pack</th>
                  <th className="py-2.5 px-3 text-right">City Keywords</th>
                  <th className="py-2.5 pl-3">Landing URL Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {cityRows.map(({ market, mapping, keywordCount, measurement }) => (
                  <tr key={market.id} className="hover:bg-[var(--bg-subtle)]/70">
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectLocation({
                            kind: 'city',
                            countryCode: market.countryCode,
                            countryName: market.countryName,
                            stateRegion: market.stateRegion || undefined,
                            city: market.city,
                          })
                        }
                        className="font-display font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                      >
                        {[market.city, market.stateRegion, market.countryCode]
                          .filter(Boolean)
                          .join(', ')}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        label={market.approvalStatus.replace(/_/g, ' ')}
                        tone={market.approvalStatus === 'approved' ? 'success' : 'warning'}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">
                      {measurement?.trackedRankPosition !== null &&
                      measurement?.trackedRankPosition !== undefined
                        ? `#${measurement.trackedRankPosition.toFixed(1)}`
                        : 'Unavailable (Provider needed)'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-muted)]">
                      {measurement?.gbpLocationsCount !== null &&
                      measurement?.gbpLocationsCount !== undefined
                        ? `${measurement.gbpLocationsCount} profile(s)`
                        : 'Unavailable (GBP OAuth)'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {keywordCount}
                    </td>
                    <td className="py-2.5 pl-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {mapping?.targetUrl ??
                        `Missing (${mapping?.recommendedSlug ?? '/city'})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
