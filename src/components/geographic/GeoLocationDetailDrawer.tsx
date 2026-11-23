import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Compass, Globe, Link2, MapPin, ShieldAlert, X } from 'lucide-react';
import { drawerSlide } from '../../lib/motion';
import type {
  GeoMapRegionFeature,
  GeoMeasurementRecord,
  GeoOpportunityRecommendation,
  GeoTargetMarket,
  GeoUrlMappingRecord,
} from '../../types/geographic';
import type { KeywordIntelligenceRecord } from '../../types/keywords';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export interface SelectedGeoDetail {
  kind: 'country' | 'state' | 'city';
  countryCode: string;
  countryName: string;
  stateRegion?: string;
  city?: string;
}

export function GeoLocationDetailDrawer({
  selection,
  onClose,
  targetMarkets,
  measurements,
  mapCountries,
  geoKeywords,
  urlMappings,
  opportunities,
  canApprove,
  discovering,
  onDiscoverLocation,
  onAddOrApproveMarket,
}: {
  selection: SelectedGeoDetail | null;
  onClose: () => void;
  targetMarkets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  mapCountries: GeoMapRegionFeature[];
  geoKeywords: KeywordIntelligenceRecord[];
  urlMappings: GeoUrlMappingRecord[];
  opportunities: GeoOpportunityRecommendation[];
  canApprove: boolean;
  discovering: boolean;
  onDiscoverLocation: (loc: {
    countryCode: string;
    stateRegion?: string;
    city?: string;
  }) => Promise<void>;
  onAddOrApproveMarket: (loc: {
    countryCode: string;
    stateRegion?: string;
    city?: string;
    approve: boolean;
  }) => Promise<void>;
}) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, onClose]);

  const cc = selection?.countryCode.toUpperCase() ?? '';
  const countryInfo = mapCountries.find((c) => c.countryCode === cc) ?? null;

  const matchingCountryMarkets = selection
    ? targetMarkets.filter((m) => m.countryCode === cc)
    : [];

  const matchingMarket = selection
    ? matchingCountryMarkets.find((m) =>
        selection.city
          ? m.city.toLowerCase() === selection.city.toLowerCase()
          : selection.stateRegion
            ? m.stateRegion.toLowerCase() === selection.stateRegion.toLowerCase() && !m.city
            : m.granularity === 'country',
      ) ?? null
    : null;

  const exactMeasurement = selection
    ? measurements.find(
        (m) =>
          m.countryCode === cc &&
          (selection.city
            ? m.city.toLowerCase() === selection.city.toLowerCase()
            : selection.stateRegion
              ? m.stateRegion.toLowerCase() === selection.stateRegion.toLowerCase()
              : m.granularity === 'country'),
      ) ?? null
    : null;

  const countryMeasurement = selection
    ? measurements.find((m) => m.countryCode === cc && m.granularity === 'country') ?? null
    : null;

  const relatedKeywords = selection
    ? geoKeywords.filter((k) => {
        if (k.targetCountry.toUpperCase() !== cc) return false;
        if (selection.city) {
          return (
            k.targetCity.toLowerCase() === selection.city.toLowerCase() ||
            k.keyword.toLowerCase().includes(selection.city.toLowerCase())
          );
        }
        return true;
      })
    : [];

  const relatedMappings = selection
    ? urlMappings.filter((m) => {
        if (m.countryCode.toUpperCase() !== cc) return false;
        if (selection.city) {
          return m.city.toLowerCase() === selection.city.toLowerCase();
        }
        return true;
      })
    : [];

  const relatedOpps = selection
    ? opportunities.filter((o) => o.countryCode.toUpperCase() === cc)
    : [];

  const displayTitle = selection
    ? [selection.city, selection.stateRegion, selection.countryName]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <AnimatePresence>
      {selection && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Location details for ${displayTitle}`}
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
          />

          <motion.aside
            variants={drawerSlide}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            exit={prefersReducedMotion ? undefined : 'exit'}
            className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
                  <h2 className="truncate font-display text-lg font-bold text-[var(--text-primary)]">
                    {displayTitle}
                  </h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-mono uppercase">{selection.countryCode}</span>
                  <span>·</span>
                  <span>
                    Granularity:{' '}
                    <strong className="text-[var(--text-secondary)]">
                      {selection.kind === 'city'
                        ? 'City'
                        : selection.kind === 'state'
                          ? 'State / Region'
                          : 'Country'}
                    </strong>
                  </span>
                  {matchingMarket ? (
                    <StatusBadge
                      label={
                        matchingMarket.approvalStatus === 'approved'
                          ? `Approved (${matchingMarket.priority})`
                          : matchingMarket.approvalStatus === 'strategist_recommended'
                            ? 'Strategist Recommended'
                            : 'Pending Approval'
                      }
                      tone={
                        matchingMarket.approvalStatus === 'approved'
                          ? 'success'
                          : 'warning'
                      }
                    />
                  ) : matchingCountryMarkets.length > 0 && selection.kind === 'country' ? (
                    <StatusBadge
                      label={`${matchingCountryMarkets.length} Active Regional Target${matchingCountryMarkets.length === 1 ? '' : 's'}`}
                      tone={
                        matchingCountryMarkets.some((m) => m.approvalStatus === 'approved')
                          ? 'success'
                          : 'warning'
                      }
                    />
                  ) : (
                    <StatusBadge label="Not Configured as Target" tone="neutral" />
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close location details"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Strict Granularity Notice */}
              {selection.kind !== 'country' && (
                <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <div className="font-semibold">Granularity Boundary Protected</div>
                      <p className="mt-0.5 leading-relaxed">
                        Google Search Console reports observed site traffic strictly at the{' '}
                        <strong>country</strong> level ({selection.countryCode}). City/state-level GSC impressions are unavailable and are never extrapolated from country totals.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Metrics Grid (Strictly Separated Providers) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    GSC Observed Traffic ({selection.kind === 'country' ? cc : `${cc} Country Only`})
                  </div>
                  {selection.kind === 'country' &&
                  countryInfo?.hasMeasuredGscData &&
                  countryInfo.gscImpressions !== null ? (
                    <div className="mt-2 space-y-1 font-mono text-xs tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Clicks</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {(countryInfo.gscClicks ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Impressions</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {countryInfo.gscImpressions.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Avg Position</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {countryInfo.gscAvgPosition?.toFixed(1) ?? 'Unavailable'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                      {selection.kind === 'country'
                        ? 'Unavailable — Sync connected Google Search Console.'
                        : `Unavailable at ${selection.kind} scope (Country ${cc} impressions: ${
                            countryMeasurement?.gscImpressions?.toLocaleString() ?? 'Unavailable'
                          }).`}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    Google Trends (Relative 0–100)
                  </div>
                  {(exactMeasurement?.relativeTrendIndex ??
                    countryMeasurement?.relativeTrendIndex) !== null &&
                  (exactMeasurement?.relativeTrendIndex ??
                    countryMeasurement?.relativeTrendIndex) !== undefined ? (
                    <div className="mt-2">
                      <div className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">
                        {exactMeasurement?.relativeTrendIndex ??
                          countryMeasurement?.relativeTrendIndex}
                        <span className="text-xs font-normal text-[var(--text-muted)]">
                          /100
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Relative regional interest index only (not absolute search volume).
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                      Unavailable — Run Geographic Discovery to query Trends GEO_MAP.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    Localized Rank Tracking
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    {exactMeasurement?.trackedRankPosition !== null &&
                    exactMeasurement?.trackedRankPosition !== undefined
                      ? `Avg Rank #${exactMeasurement.trackedRankPosition.toFixed(1)}`
                      : 'Unavailable (Localized SERP provider credentials not configured).'}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    Google Business Profile
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    {exactMeasurement?.gbpLocationsCount !== null &&
                    exactMeasurement?.gbpLocationsCount !== undefined
                      ? `${exactMeasurement.gbpLocationsCount} verified profile(s)`
                      : 'Unavailable (GBP OAuth not connected).'}
                  </div>
                </div>
              </div>

              {/* Provenance */}
              {exactMeasurement && (
                <div className="rounded-xl border border-[var(--border-hairline)] p-3.5 text-xs space-y-1">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Measurement Provenance & Methodology
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <strong>Source:</strong> {exactMeasurement.provenance.source}
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    <strong>Period:</strong> {exactMeasurement.provenance.reportingPeriod}
                  </div>
                  <div className="text-[var(--text-muted)]">
                    <strong>Methodology:</strong> {exactMeasurement.provenance.methodology}
                  </div>
                  <div className="text-[var(--text-muted)]">
                    <strong>Limitations:</strong> {exactMeasurement.provenance.limitations}
                  </div>
                </div>
              )}

              {/* URL Mapping Status */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                  <Link2 className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span>Location-to-URL Mappings ({relatedMappings.length})</span>
                </div>
                {relatedMappings.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No target market mapping configured for this location yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {relatedMappings.map((mp) => (
                      <div
                        key={mp.id}
                        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {mp.locationLabel}
                          </span>
                          <StatusBadge
                            label={mp.mappingStatus.replace(/_/g, ' ')}
                            tone={
                              mp.mappingStatus === 'mapped_existing'
                                ? 'success'
                                : mp.mappingStatus === 'duplicate_overlap'
                                  ? 'danger'
                                  : 'warning'
                            }
                          />
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)] break-all">
                          {mp.targetUrl ?? `Recommended Slug: ${mp.recommendedSlug ?? 'TBD'}`}
                        </div>
                        {mp.doorwayRiskWarning && (
                          <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                            {mp.doorwayRiskWarning}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Geo Keywords */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                  <Globe className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span>Associated Geographic Keywords ({relatedKeywords.length})</span>
                </div>
                {relatedKeywords.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No geo-scoped keywords discovered for {displayTitle} yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {relatedKeywords.slice(0, 8).map((kw) => (
                      <div
                        key={kw.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text-primary)]">
                            {kw.keyword}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {kw.intent} · {kw.workflowState}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                          {kw.opportunityScore}/100
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Opportunity Summary */}
              {relatedOpps[0] && (
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {relatedOpps[0].headline}
                  </div>
                  <div className="mt-1 text-[var(--text-secondary)]">
                    {relatedOpps[0].recommendedNextAction}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] px-5 py-3.5">
              {!matchingMarket && (
                <InteractiveButton
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onAddOrApproveMarket({
                      countryCode: selection.countryCode,
                      stateRegion: selection.stateRegion,
                      city: selection.city,
                      approve: canApprove,
                    })
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {canApprove ? 'Approve as Target Market' : 'Recommend Target Market'}
                  </span>
                </InteractiveButton>
              )}

              <InteractiveButton
                variant="primary"
                size="sm"
                loading={discovering}
                onClick={() =>
                  onDiscoverLocation({
                    countryCode: selection.countryCode,
                    stateRegion: selection.stateRegion,
                    city: selection.city,
                  })
                }
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Run Geo Discovery Here</span>
              </InteractiveButton>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
