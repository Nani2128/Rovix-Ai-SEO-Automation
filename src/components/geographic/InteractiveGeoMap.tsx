import { useMemo, useState } from 'react';
import { geoAlbersUsa, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import worldAtlasRaw from 'world-atlas/countries-110m.json';
import usAtlasRaw from 'us-atlas/states-10m.json';
import { Globe, Layers, LocateFixed, MapPin, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  GeoMapRegionFeature,
  GeoMeasurementRecord,
  GeoTargetMarket,
} from '../../types/geographic';
import { US_STATE_CATALOG } from '../../server/geo/geoCatalog';
import { GlassPanel } from '../ui/GlassPanel';

export type GeoMapLayer =
  | 'target_markets'
  | 'gsc_performance'
  | 'trends_interest'
  | 'coverage_gaps';

export type GeoMapScope = 'world' | 'us_states';

interface MapSelectionPayload {
  kind: 'country' | 'state' | 'city';
  countryCode: string;
  countryName: string;
  stateRegion?: string;
  city?: string;
}

const LAYER_OPTIONS: { id: GeoMapLayer; label: string }[] = [
  { id: 'target_markets', label: 'Target Markets' },
  { id: 'gsc_performance', label: 'GSC Country Traffic' },
  { id: 'trends_interest', label: 'Trends Interest (0–100)' },
  { id: 'coverage_gaps', label: 'URL Coverage & Gaps' },
];

function padIsoNumeric(id: unknown): string {
  const s = String(id ?? '').trim();
  if (!s) return '';
  return s.padStart(3, '0');
}

export function InteractiveGeoMap({
  mapCountries,
  targetMarkets,
  measurements,
  selectedCountryCode,
  onSelectLocation,
}: {
  mapCountries: GeoMapRegionFeature[];
  targetMarkets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  selectedCountryCode?: string | null;
  onSelectLocation: (loc: MapSelectionPayload) => void;
}) {
  const [layer, setLayer] = useState<GeoMapLayer>('target_markets');
  const [scope, setScope] = useState<GeoMapScope>('world');
  const [zoom, setZoom] = useState(1);
  const [hoveredInfo, setHoveredInfo] = useState<{
    title: string;
    subtitle: string;
    metricLabel: string;
    available: boolean;
  } | null>(null);

  const countryFeatureMap = useMemo(() => {
    const map = new Map<string, GeoMapRegionFeature>();
    for (const c of mapCountries) {
      map.set(padIsoNumeric(c.isoNumeric), c);
    }
    return map;
  }, [mapCountries]);

  const maxGscImpressions = useMemo(() => {
    let max = 0;
    for (const c of mapCountries) {
      if ((c.gscImpressions ?? 0) > max) max = c.gscImpressions ?? 0;
    }
    return max;
  }, [mapCountries]);

  const worldProjection = useMemo(
    () => geoNaturalEarth1().scale(178).translate([480, 255]),
    [],
  );
  const worldPathGen = useMemo(() => geoPath(worldProjection), [worldProjection]);

  const worldGeometries = useMemo(() => {
    const topo = worldAtlasRaw as unknown as Topology;
    const obj = topo.objects.countries as Parameters<typeof feature>[1];
    const fc = feature(topo, obj) as unknown as GeoJSON.FeatureCollection;
    // Exclude Antarctica ('010') for cleaner executive framing
    return fc.features.filter((f) => padIsoNumeric(f.id) !== '010');
  }, []);

  const usProjection = useMemo(
    () => geoAlbersUsa().scale(1020).translate([480, 250]),
    [],
  );
  const usPathGen = useMemo(() => geoPath(usProjection), [usProjection]);

  const usStateGeometries = useMemo(() => {
    const topo = usAtlasRaw as unknown as Topology;
    const obj = topo.objects.states as Parameters<typeof feature>[1];
    const fc = feature(topo, obj) as unknown as GeoJSON.FeatureCollection;
    return fc.features;
  }, []);

  const cityMarkers = useMemo(() => {
    const points: {
      id: string;
      label: string;
      countryCode: string;
      countryName: string;
      stateRegion: string;
      city: string;
      coords: [number, number];
      priority: GeoTargetMarket['priority'];
      approvalStatus: GeoTargetMarket['approvalStatus'];
    }[] = [];

    for (const mkt of targetMarkets) {
      if (mkt.latitude === null || mkt.longitude === null) continue;
      if (scope === 'us_states' && mkt.countryCode !== 'US') continue;
      if (mkt.granularity === 'country' && scope === 'us_states') continue;
      const projFn = scope === 'world' ? worldProjection : usProjection;
      const projected = projFn([mkt.longitude, mkt.latitude]);
      if (!projected) continue;
      points.push({
        id: mkt.id,
        label: mkt.city || mkt.stateRegion || mkt.countryName,
        countryCode: mkt.countryCode,
        countryName: mkt.countryName,
        stateRegion: mkt.stateRegion,
        city: mkt.city,
        coords: [projected[0], projected[1]],
        priority: mkt.priority,
        approvalStatus: mkt.approvalStatus,
      });
    }
    return points;
  }, [targetMarkets, scope, worldProjection, usProjection]);

  const stateMeasurementByName = useMemo(() => {
    const map = new Map<string, GeoMeasurementRecord>();
    for (const m of measurements) {
      if (m.countryCode === 'US' && m.stateRegion) {
        map.set(m.stateRegion.toLowerCase(), m);
      }
    }
    return map;
  }, [measurements]);

  const resolveCountryStyle = (
    isoNum: string,
    fallbackName: string,
  ): {
    fill: string;
    fillOpacity: number;
    metricLabel: string;
    available: boolean;
    catalog?: GeoMapRegionFeature;
  } => {
    const rec = countryFeatureMap.get(isoNum);
    if (!rec) {
      return {
        fill: 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))',
        fillOpacity: 0.9,
        metricLabel: `${fallbackName}: Unavailable`,
        available: false,
      };
    }

    if (layer === 'target_markets') {
      if (rec.isConfiguredTarget) {
        if (rec.approvalStatus === 'approved' && rec.targetPriority === 'primary') {
          return {
            fill: 'var(--accent-primary)',
            fillOpacity: 0.86,
            metricLabel: 'Approved Primary Market',
            available: true,
            catalog: rec,
          };
        }
        if (rec.approvalStatus === 'approved') {
          return {
            fill: '#0D9488',
            fillOpacity: 0.75,
            metricLabel: 'Approved Secondary Market',
            available: true,
            catalog: rec,
          };
        }
        return {
          fill: '#D97706',
          fillOpacity: 0.72,
          metricLabel: 'Strategist Recommended (Pending Owner Approval)',
          available: true,
          catalog: rec,
        };
      }
      return {
        fill: 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))',
        fillOpacity: 0.92,
        metricLabel: 'Not Targeted · Data Unavailable',
        available: false,
        catalog: rec,
      };
    }

    if (layer === 'gsc_performance') {
      if (rec.hasMeasuredGscData && rec.gscImpressions !== null) {
        const ratio =
          maxGscImpressions > 0 ? rec.gscImpressions / maxGscImpressions : 0.4;
        return {
          fill: 'var(--accent-primary)',
          fillOpacity: Math.max(0.28, Math.min(0.95, 0.28 + ratio * 0.67)),
          metricLabel: `GSC Country: ${(rec.gscClicks ?? 0).toLocaleString()} clicks · ${rec.gscImpressions.toLocaleString()} impr`,
          available: true,
          catalog: rec,
        };
      }
      return {
        fill: 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))',
        fillOpacity: 0.9,
        metricLabel: 'GSC Country Metrics: Unavailable',
        available: false,
        catalog: rec,
      };
    }

    if (layer === 'trends_interest') {
      if (rec.hasRelativeTrendData && rec.relativeTrendIndex !== null) {
        return {
          fill: '#0D9488',
          fillOpacity: Math.max(0.25, Math.min(0.92, rec.relativeTrendIndex / 100)),
          metricLabel: `Trends Relative Index: ${rec.relativeTrendIndex}/100 (not volume)`,
          available: true,
          catalog: rec,
        };
      }
      return {
        fill: 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))',
        fillOpacity: 0.9,
        metricLabel: 'Trends Relative Index: Unavailable',
        available: false,
        catalog: rec,
      };
    }

    // coverage_gaps
    if (rec.missingPageGapsCount > 0) {
      return {
        fill: '#D97706',
        fillOpacity: 0.78,
        metricLabel: `${rec.missingPageGapsCount} Missing Geo Landing Page Gap(s)`,
        available: true,
        catalog: rec,
      };
    }
    if (rec.mappedUrlsCount > 0) {
      return {
        fill: '#0D9488',
        fillOpacity: 0.78,
        metricLabel: `${rec.mappedUrlsCount} Mapped Existing URL(s)`,
        available: true,
        catalog: rec,
      };
    }
    return {
      fill: 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))',
      fillOpacity: 0.9,
      metricLabel: 'Coverage Data: Unavailable',
      available: false,
      catalog: rec,
    };
  };

  const viewWidth = 960;
  const viewHeight = 470;
  const scaledW = viewWidth / zoom;
  const scaledH = viewHeight / zoom;
  const viewX = (viewWidth - scaledW) / 2;
  const viewY = (viewHeight - scaledH) / 2;

  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Interactive Geographic Coverage & Demand Map
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Click any country, US state, or city pin to inspect granular evidence. Areas with neutral shading have <span className="font-semibold text-[var(--text-secondary)]">Unavailable</span> metrics (never shown as low-performing).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
            role="group"
            aria-label="Map Geographic Scope"
          >
            <button
              type="button"
              onClick={() => {
                setScope('world');
                setZoom(1);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                scope === 'world'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              World Countries
            </button>
            <button
              type="button"
              onClick={() => {
                setScope('us_states');
                setZoom(1);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                scope === 'us_states'
                  ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              US States & Cities
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1">
            <button
              type="button"
              aria-label="Zoom in map"
              onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.4).toFixed(2))))}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Zoom out map"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))))}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Reset map zoom"
              onClick={() => setZoom(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Map Data Layer Switcher */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Map Data Layer">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] mr-1">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Layer:
          </span>
          {LAYER_OPTIONS.map((opt) => {
            const active = layer === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => setLayer(opt.id)}
                className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)]/40 hover:text-[var(--text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          Zoom {zoom.toFixed(1)}x · {cityMarkers.length} pinned marker{cityMarkers.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* SVG Map Canvas */}
      <div
        data-testid="interactive-geo-map"
        className="relative mt-3 overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)]"
      >
        <svg
          viewBox={`${viewX} ${viewY} ${scaledW} ${scaledH}`}
          className="h-[340px] w-full select-none sm:h-[410px]"
          role="img"
          aria-label={
            scope === 'world'
              ? 'Interactive world map of target markets and geographic search data'
              : 'Interactive United States regional and city search map'
          }
        >
          <defs>
            <pattern
              id="geo-unavailable-hatch"
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="var(--border-hairline)"
                strokeWidth="1.2"
              />
            </pattern>
          </defs>

          {scope === 'world' &&
            worldGeometries.map((feat, idx) => {
              const isoNum = padIsoNumeric(feat.id);
              const name = String(
                (feat.properties as { name?: string } | undefined)?.name ?? 'Region',
              );
              const d = worldPathGen(feat) || '';
              if (!d) return null;
              const style = resolveCountryStyle(isoNum, name);
              const isSelected =
                Boolean(selectedCountryCode) &&
                style.catalog?.countryCode === selectedCountryCode;

              return (
                <path
                  key={`${isoNum}-${idx}`}
                  d={d}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={
                    isSelected
                      ? 'var(--accent-primary)'
                      : 'color-mix(in srgb, var(--text-muted) 36%, var(--border-hairline))'
                  }
                  strokeWidth={isSelected ? 1.75 / zoom : 0.75 / zoom}
                  className="cursor-pointer transition-opacity duration-150 hover:opacity-100 focus:outline-none focus-visible:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${style.catalog?.countryName ?? name} — ${style.metricLabel}`}
                  onMouseEnter={() =>
                    setHoveredInfo({
                      title: style.catalog?.countryName ?? name,
                      subtitle: style.catalog?.countryCode ?? 'ISO Region',
                      metricLabel: style.metricLabel,
                      available: style.available,
                    })
                  }
                  onMouseLeave={() => setHoveredInfo(null)}
                  onClick={() => {
                    onSelectLocation({
                      kind: 'country',
                      countryCode:
                        style.catalog?.countryCode ??
                        name.slice(0, 2).toUpperCase(),
                      countryName: style.catalog?.countryName ?? name,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectLocation({
                        kind: 'country',
                        countryCode:
                          style.catalog?.countryCode ??
                          name.slice(0, 2).toUpperCase(),
                        countryName: style.catalog?.countryName ?? name,
                      });
                    }
                  }}
                />
              );
            })}

          {scope === 'us_states' &&
            usStateGeometries.map((feat, idx) => {
              const fips = String(feat.id ?? '').padStart(2, '0');
              const stateCat = US_STATE_CATALOG.find((s) => s.fips === fips);
              const stateName =
                stateCat?.name ||
                String((feat.properties as { name?: string } | undefined)?.name ?? 'State');
              const d = usPathGen(feat) || '';
              if (!d) return null;

              const hasTarget = targetMarkets.some(
                (m) =>
                  m.countryCode === 'US' &&
                  (m.stateFips === fips ||
                    m.stateRegion.toLowerCase() === stateName.toLowerCase()),
              );
              const stateMeas = stateMeasurementByName.get(stateName.toLowerCase());
              const hasTrend =
                stateMeas?.relativeTrendIndex !== null &&
                stateMeas?.relativeTrendIndex !== undefined;

              let fill = 'color-mix(in srgb, var(--text-muted) 16%, var(--bg-surface))';
              let fillOpacity = 0.92;
              let metricLabel = 'No target or regional measurement (Unavailable)';
              let available = false;

              if (hasTarget) {
                fill = 'var(--accent-primary)';
                fillOpacity = 0.72;
                metricLabel = 'Targeted US State / Service Region';
                available = true;
              } else if (hasTrend && layer === 'trends_interest') {
                fill = '#0D9488';
                fillOpacity = Math.max(
                  0.25,
                  Math.min(0.92, (stateMeas!.relativeTrendIndex ?? 0) / 100),
                );
                metricLabel = `Trends Relative Interest: ${stateMeas!.relativeTrendIndex}/100`;
                available = true;
              }

              return (
                <path
                  key={`${fips}-${idx}`}
                  d={d}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke="color-mix(in srgb, var(--text-muted) 40%, var(--border-hairline))"
                  strokeWidth={0.95 / zoom}
                  className="cursor-pointer transition-opacity duration-150 hover:opacity-100 focus:outline-none focus-visible:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${stateName}, United States — ${metricLabel}`}
                  onMouseEnter={() =>
                    setHoveredInfo({
                      title: stateName,
                      subtitle: 'United States · State Scope',
                      metricLabel,
                      available,
                    })
                  }
                  onMouseLeave={() => setHoveredInfo(null)}
                  onClick={() =>
                    onSelectLocation({
                      kind: 'state',
                      countryCode: 'US',
                      countryName: 'United States',
                      stateRegion: stateName,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectLocation({
                        kind: 'state',
                        countryCode: 'US',
                        countryName: 'United States',
                        stateRegion: stateName,
                      });
                    }
                  }}
                />
              );
            })}

          {/* Pinned Target Market / City Coordinate Markers */}
          {cityMarkers.map((pin) => {
            const markerColor =
              pin.approvalStatus === 'approved'
                ? pin.priority === 'primary'
                  ? 'var(--accent-primary)'
                  : '#0D9488'
                : '#D97706';
            return (
              <g
                key={pin.id}
                transform={`translate(${pin.coords[0]}, ${pin.coords[1]})`}
                className="cursor-pointer focus:outline-none focus-visible:outline-none"
                role="button"
                tabIndex={0}
                aria-label={`Pinned market: ${pin.label} (${pin.countryCode})`}
                onMouseEnter={() =>
                  setHoveredInfo({
                    title: pin.label,
                    subtitle: `${pin.countryName}${pin.city ? ' · City Marker' : ' · Market Marker'}`,
                    metricLabel:
                      pin.approvalStatus === 'approved'
                        ? `Approved ${pin.priority} market`
                        : 'Strategist recommended market',
                    available: true,
                  })
                }
                onMouseLeave={() => setHoveredInfo(null)}
                onClick={() =>
                  onSelectLocation({
                    kind: pin.city ? 'city' : 'country',
                    countryCode: pin.countryCode,
                    countryName: pin.countryName,
                    stateRegion: pin.stateRegion || undefined,
                    city: pin.city || undefined,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectLocation({
                      kind: pin.city ? 'city' : 'country',
                      countryCode: pin.countryCode,
                      countryName: pin.countryName,
                      stateRegion: pin.stateRegion || undefined,
                      city: pin.city || undefined,
                    });
                  }
                }}
              >
                <circle
                  r={6.5 / zoom}
                  fill={markerColor}
                  fillOpacity={0.22}
                />
                <circle
                  r={3.8 / zoom}
                  fill={markerColor}
                  stroke="var(--bg-surface)"
                  strokeWidth={1.2 / zoom}
                />
              </g>
            );
          })}
        </svg>

        {/* Live Map Inspector Pill / Hover Card */}
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-3 py-2 shadow-sm backdrop-blur-md">
          {hoveredInfo ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                  {hoveredInfo.title}
                </span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {hoveredInfo.subtitle}
                </span>
              </div>
              <div
                className={`mt-0.5 text-[11px] font-medium ${
                  hoveredInfo.available
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--text-muted)] italic'
                }`}
              >
                {hoveredInfo.metricLabel}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
              <span>Hover or select any region on the map to inspect details</span>
            </div>
          )}
        </div>
      </div>

      {/* Clear Map Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent-primary)]" />
            <span>
              {layer === 'gsc_performance'
                ? 'Measured GSC Country Traffic'
                : 'Approved Primary / Target'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#0D9488]" />
            <span>
              {layer === 'trends_interest'
                ? 'Relative Trends Interest (0–100)'
                : layer === 'coverage_gaps'
                  ? 'Mapped Existing URL'
                  : 'Approved Secondary'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#D97706]" />
            <span>
              {layer === 'coverage_gaps'
                ? 'Missing Geo Landing Page'
                : 'Strategist Recommended'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[var(--border-hairline)] bg-[var(--bg-subtle)]" />
            <span>Data Unavailable (Never 0 / Low-Performing)</span>
          </span>
        </div>

        <span className="font-mono text-[10.5px]">
          GSC = Country Granularity · Trends = 0–100 Relative Index
        </span>
      </div>
    </GlassPanel>
  );
}
