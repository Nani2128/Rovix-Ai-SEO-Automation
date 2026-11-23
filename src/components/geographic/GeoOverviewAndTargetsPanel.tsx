import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronDown,
  Globe2,
  History,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type { UserRole } from '../../types/auth';
import type {
  GeoMarketPriority,
  GeoProviderStatus,
  GeoTargetMarket,
  GeoWorkspaceResponse,
} from '../../types/geographic';
import { GEO_COUNTRY_CATALOG } from '../../server/geo/geoCatalog';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

const PROVIDER_BADGE: Record<
  GeoProviderStatus['state'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  connected: { label: 'Connected', tone: 'success' },
  available: { label: 'Ready', tone: 'success' },
  credentials_required: { label: 'Credentials Required', tone: 'neutral' },
  not_connected: { label: 'Not Connected', tone: 'neutral' },
  rate_limited: { label: 'Rate Limited', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  unavailable: { label: 'Unavailable', tone: 'neutral' },
};

export function GeoOverviewAndTargetsPanel({
  workspace,
  userRole,
  canApprove,
  canRecommend,
  savingMarket,
  onSaveMarket,
  onDecideMarket,
  onDeleteMarket,
  onSelectLocation,
}: {
  workspace: GeoWorkspaceResponse;
  userRole: UserRole;
  canApprove: boolean;
  canRecommend: boolean;
  savingMarket: boolean;
  onSaveMarket: (payload: {
    countryCode: string;
    stateRegion: string;
    city: string;
    language: string;
    serviceAreas: string[];
    priority: GeoMarketPriority;
    approve: boolean;
    reason: string;
  }) => Promise<void>;
  onDecideMarket: (
    marketId: string,
    action: 'approve' | 'reject',
    priority?: GeoMarketPriority,
  ) => Promise<void>;
  onDeleteMarket: (marketId: string) => Promise<void>;
  onSelectLocation: (loc: {
    kind: 'country' | 'state' | 'city';
    countryCode: string;
    countryName: string;
    stateRegion?: string;
    city?: string;
  }) => void;
}) {
  const [countryCode, setCountryCode] = useState('US');
  const [stateRegion, setStateRegion] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('en');
  const [serviceAreasInput, setServiceAreasInput] = useState('');
  const [priority, setPriority] = useState<GeoMarketPriority>('secondary');
  const [reason, setReason] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const handleSubmit = async (approve: boolean) => {
    const areas = serviceAreasInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await onSaveMarket({
      countryCode,
      stateRegion,
      city,
      language,
      serviceAreas: areas,
      priority,
      approve,
      reason,
    });
    setCity('');
    setStateRegion('');
    setServiceAreasInput('');
    setReason('');
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
      >
        <motion.div variants={fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Approved Target Markets
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.approvedMarketsCount}
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {workspace.summary.recommendedMarketsCount} recommended
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Owner-approved service territories
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Countries with GSC Data
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.countriesWithGscData}
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Country Dimension Only
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Observed Search Console traffic
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Geo-Scoped Keywords
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.totalGeoKeywords}
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {workspace.summary.opportunitiesCount} geo opportunities
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Synced with Keyword Intelligence
            </div>
          </GlassPanel>
        </motion.div>

        <motion.div variants={fadeInUp}>
          <GlassPanel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Location URL Coverage
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {workspace.summary.mappedLocationsCount}
                <span className="text-sm font-semibold text-[var(--text-muted)]">
                  /{workspace.targetMarkets.length}
                </span>
              </span>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {workspace.summary.missingLandingPagesCount} gap(s) ·{' '}
                {workspace.summary.duplicateOverlapWarningsCount} overlap(s)
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Verified crawl inventory matches
            </div>
          </GlassPanel>
        </motion.div>
      </motion.div>

      {/* Geographic Provider Readiness Grid */}
      <GlassPanel className="p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Geographic Data Source Readiness & Granularity Boundaries
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {workspace.granularityDisclosure}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {workspace.providerStatuses.map((ps) => {
            const meta = PROVIDER_BADGE[ps.state];
            return (
              <div
                key={ps.provider}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-[var(--text-primary)]">{ps.label}</div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {ps.detail}
                </p>
                <div className="mt-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
                  Scope: {ps.granularitySupported.join(', ')}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Target Market Configuration & Governance */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <GlassPanel className="p-5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Configure / Recommend Target Market
              </h3>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {userRole}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Business Owners & Agency Owners approve official service areas. SEO Strategists submit recommendations without overwriting owner-approved markets.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(canApprove);
            }}
            className="mt-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Country
                </span>
                <select
                  value={countryCode}
                  onChange={(e) => {
                    const nextCode = e.target.value;
                    setCountryCode(nextCode);
                    const match = GEO_COUNTRY_CATALOG.find(
                      (c) => c.alpha2 === nextCode,
                    );
                    if (match) setLanguage(match.defaultLanguage);
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  {GEO_COUNTRY_CATALOG.map((c) => (
                    <option key={c.alpha2} value={c.alpha2}>
                      {c.name} ({c.alpha2})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Language
                </span>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  State / Region (Optional)
                </span>
                <input
                  type="text"
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  placeholder="e.g. Texas, Ontario, England"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>

              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  City (Optional)
                </span>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Austin, London, Toronto"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Service Areas (comma-separated)
                </span>
                <input
                  type="text"
                  value={serviceAreasInput}
                  onChange={(e) => setServiceAreasInput(e.target.value)}
                  placeholder="Austin Metro, Central Texas"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>

              <label className="block text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Market Priority
                </span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as GeoMarketPriority)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="primary">Primary Market</option>
                  <option value="secondary">Secondary Market</option>
                </select>
              </label>
            </div>

            <label className="block text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">
                Justification / Service Eligibility Note
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Verified shipping/service coverage or strategic market demand"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </label>

            {!canRecommend ? (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-muted)]">
                Current role ({userRole}) has read-only geographic permissions.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canApprove && (
                  <InteractiveButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={savingMarket}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Approve Service Area & Market</span>
                  </InteractiveButton>
                )}
                <InteractiveButton
                  type="button"
                  variant={canApprove ? 'secondary' : 'primary'}
                  size="sm"
                  loading={savingMarket}
                  onClick={() => void handleSubmit(false)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Recommend Target Market</span>
                </InteractiveButton>
              </div>
            )}
          </form>
        </GlassPanel>

        <GlassPanel className="p-5 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe2
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Configured & Recommended Target Markets ({workspace.targetMarkets.length})
              </h3>
            </div>
          </div>

          {workspace.targetMarkets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
              No target markets configured yet. Add an approved primary country or city territory on the left.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {workspace.targetMarkets.map((mkt: GeoTargetMarket) => {
                const histOpen = expandedHistoryId === mkt.id;
                const label = [mkt.city, mkt.stateRegion, mkt.countryName]
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={mkt.id}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onSelectLocation({
                                kind: mkt.city
                                  ? 'city'
                                  : mkt.stateRegion
                                    ? 'state'
                                    : 'country',
                                countryCode: mkt.countryCode,
                                countryName: mkt.countryName,
                                stateRegion: mkt.stateRegion || undefined,
                                city: mkt.city || undefined,
                              })
                            }
                            className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{label}</span>
                          </button>
                          <StatusBadge
                            label={
                              mkt.priority === 'primary'
                                ? 'Primary'
                                : mkt.priority === 'secondary'
                                  ? 'Secondary'
                                  : 'Recommended'
                            }
                            tone={
                              mkt.priority === 'primary'
                                ? 'indigo'
                                : mkt.priority === 'secondary'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          />
                          <StatusBadge
                            label={mkt.approvalStatus.replace(/_/g, ' ')}
                            tone={
                              mkt.approvalStatus === 'approved'
                                ? 'success'
                                : mkt.approvalStatus === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          />
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                          <span>
                            Language:{' '}
                            <strong className="font-mono uppercase text-[var(--text-secondary)]">
                              {mkt.language}
                            </strong>
                          </span>
                          <span>
                            Service Areas:{' '}
                            <strong className="text-[var(--text-secondary)]">
                              {mkt.serviceAreas.join(', ') || label}
                            </strong>
                          </span>
                          {mkt.approvedBy && (
                            <span>
                              Approved by <strong>{mkt.approvedBy}</strong>
                            </span>
                          )}
                          {mkt.recommendedBy && !mkt.approvedBy && (
                            <span>
                              Recommended by <strong>{mkt.recommendedBy}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {canApprove && mkt.approvalStatus !== 'approved' && (
                          <InteractiveButton
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              void onDecideMarket(mkt.id, 'approve', 'secondary')
                            }
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            <span>Approve</span>
                          </InteractiveButton>
                        )}
                        {canApprove && mkt.approvalStatus === 'strategist_recommended' && (
                          <InteractiveButton
                            size="sm"
                            variant="danger"
                            onClick={() => void onDecideMarket(mkt.id, 'reject')}
                          >
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            <span>Decline</span>
                          </InteractiveButton>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryId(histOpen ? null : mkt.id)
                          }
                          aria-expanded={histOpen}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <History className="h-3 w-3" aria-hidden="true" />
                          <span>History ({mkt.approvalHistory.length})</span>
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${
                              histOpen ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        {canApprove && (
                          <button
                            type="button"
                            aria-label={`Remove target market ${label}`}
                            onClick={() => void onDeleteMarket(mkt.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {histOpen && mkt.approvalHistory.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-[var(--border-hairline)] pt-2.5 text-[11px]">
                        {mkt.approvalHistory.map((h) => (
                          <div
                            key={h.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)]"
                          >
                            <span>
                              <strong className="text-[var(--text-secondary)]">
                                {h.actorName}
                              </strong>{' '}
                              ({h.actorRole}): {h.previousStatus} →{' '}
                              <strong className="text-[var(--text-primary)]">
                                {h.newStatus}
                              </strong>{' '}
                              — {h.reason}
                            </span>
                            <span className="font-mono text-[10px]">
                              {new Date(h.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
