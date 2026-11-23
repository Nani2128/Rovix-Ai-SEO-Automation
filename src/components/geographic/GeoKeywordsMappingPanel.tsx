import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Link2,
  Search,
  Sparkles,
} from 'lucide-react';
import type { GeoWorkspaceResponse } from '../../types/geographic';
import type { KeywordIntent } from '../../types/keywords';
import { GEO_COUNTRY_CATALOG } from '../../server/geo/geoCatalog';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function GeoKeywordsMappingPanel({
  workspace,
  canApprove,
  canModifyMappings,
  discovering,
  onRunDiscovery,
  onUpdateMapping,
  onSelectLocation,
}: {
  workspace: GeoWorkspaceResponse;
  canApprove: boolean;
  canModifyMappings: boolean;
  discovering: boolean;
  onRunDiscovery: (payload: {
    countryCode: string;
    stateRegion: string;
    city: string;
    language: string;
    seedTerms: string[];
    intentFocus: KeywordIntent | 'all';
    includeAutocomplete: boolean;
    includeTrends: boolean;
    includeAiExpansion: boolean;
  }) => Promise<void>;
  onUpdateMapping: (
    mappingId: string,
    payload: {
      targetUrl?: string | null;
      recommendedSlug?: string | null;
      approveNewPage?: boolean;
    },
  ) => Promise<void>;
  onSelectLocation: (loc: {
    kind: 'country' | 'state' | 'city';
    countryCode: string;
    countryName: string;
    stateRegion?: string;
    city?: string;
  }) => void;
}) {
  const defaultMarket = workspace.targetMarkets[0];
  const [countryCode, setCountryCode] = useState(defaultMarket?.countryCode ?? 'US');
  const [stateRegion, setStateRegion] = useState(defaultMarket?.stateRegion ?? '');
  const [city, setCity] = useState(defaultMarket?.city ?? '');
  const [language, setLanguage] = useState(defaultMarket?.language ?? 'en');
  const [seedInput, setSeedInput] = useState('');
  const [intentFocus, setIntentFocus] = useState<KeywordIntent | 'all'>('all');
  const [includeAutocomplete, setIncludeAutocomplete] = useState(true);
  const [includeTrends, setIncludeTrends] = useState(true);
  const [includeAiExpansion, setIncludeAiExpansion] = useState(false);

  const [kwFilterCountry, setKwFilterCountry] = useState<string>('ALL');
  const [kwSearch, setKwSearch] = useState('');

  const filteredKeywords = useMemo(() => {
    const q = kwSearch.trim().toLowerCase();
    return workspace.geoKeywords.filter((kw) => {
      if (kwFilterCountry !== 'ALL' && kw.targetCountry !== kwFilterCountry) {
        return false;
      }
      if (!q) return true;
      return (
        kw.keyword.toLowerCase().includes(q) ||
        kw.targetCity.toLowerCase().includes(q) ||
        kw.targetCountry.toLowerCase().includes(q)
      );
    });
  }, [workspace.geoKeywords, kwFilterCountry, kwSearch]);

  const distinctKwCountries = useMemo(
    () => Array.from(new Set(workspace.geoKeywords.map((k) => k.targetCountry))),
    [workspace.geoKeywords],
  );

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    const seeds = seedInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await onRunDiscovery({
      countryCode,
      stateRegion,
      city,
      language,
      seedTerms: seeds,
      intentFocus,
      includeAutocomplete,
      includeTrends,
      includeAiExpansion,
    });
  };

  return (
    <div className="space-y-5">
      {/* Geographic Keyword Discovery Launcher */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            Geographic Keyword & Demand Discovery
          </h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Generates location-scoped search queries via live localized Autocomplete (<code className="font-mono">hl/gl</code>), Crawl Inventory, GSC Signals, and Trends GEO_MAP without fabricating local volumes. Discovered terms sync into the Phase 7 Keyword Intelligence workflow.
        </p>

        <form onSubmit={(e) => void handleLaunch(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">Country</span>
              <select
                value={countryCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setCountryCode(code);
                  const found = GEO_COUNTRY_CATALOG.find((c) => c.alpha2 === code);
                  if (found) setLanguage(found.defaultLanguage);
                }}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
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
                State / Region
              </span>
              <input
                type="text"
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                placeholder="Optional (e.g. Texas)"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </label>

            <label className="block text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">City</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Optional (e.g. Austin)"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </label>

            <label className="block text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">Intent Focus</span>
              <select
                value={intentFocus}
                onChange={(e) => setIntentFocus(e.target.value as KeywordIntent | 'all')}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="all">All Intents</option>
                <option value="Local">Local</option>
                <option value="Transactional">Transactional</option>
                <option value="Commercial">Commercial</option>
                <option value="Informational">Informational</option>
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">
                Seed Services (comma-separated)
              </span>
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="e.g. technical seo audit, agency"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAutocomplete}
                  onChange={(e) => setIncludeAutocomplete(e.target.checked)}
                />
                <span>Localized Autocomplete (hl/gl)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTrends}
                  onChange={(e) => setIncludeTrends(e.target.checked)}
                />
                <span>Google Trends GEO_MAP (0–100)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAiExpansion}
                  onChange={(e) => setIncludeAiExpansion(e.target.checked)}
                />
                <span>Optional AI Variations (Tagged Unverified)</span>
              </label>
            </div>

            <InteractiveButton type="submit" variant="primary" size="sm" loading={discovering}>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Run Geographic Discovery</span>
            </InteractiveButton>
          </div>
        </form>
      </GlassPanel>

      {/* Location-Based Opportunities (Explainable Scoring & Missing Info) */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            Explainable Location-Based Opportunities ({workspace.opportunities.length})
          </h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Every recommendation explains supporting evidence, provenance source, geographic coverage, confidence level, and missing data. Locations without hard search telemetry show <strong className="text-[var(--text-secondary)]">Needs Evidence</strong> rather than fabricated scores.
        </p>

        {workspace.opportunities.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            Configure or approve at least one target market to evaluate location-based opportunities.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {workspace.opportunities.map((opp) => (
              <div
                key={opp.id}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectLocation({
                          kind: opp.granularity === 'state_region' ? 'state' : opp.granularity,
                          countryCode: opp.countryCode,
                          countryName: opp.locationLabel,
                          stateRegion: opp.stateRegion || undefined,
                          city: opp.city || undefined,
                        })
                      }
                      className="font-display text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-left cursor-pointer"
                    >
                      {opp.headline}
                    </button>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {opp.coverageDescription}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge
                      label={opp.priorityTier}
                      tone={
                        opp.priorityTier === 'High'
                          ? 'success'
                          : opp.priorityTier === 'Medium'
                            ? 'indigo'
                            : opp.priorityTier === 'Needs Evidence'
                              ? 'warning'
                              : 'neutral'
                      }
                    />
                    <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                      {opp.score !== null ? `${opp.score}/100` : 'Unscored'}
                    </span>
                  </div>
                </div>

                {opp.supportingEvidence.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[11.5px] text-[var(--text-secondary)]">
                    {opp.supportingEvidence.map((ev, idx) => (
                      <li key={idx}>{ev}</li>
                    ))}
                  </ul>
                )}

                {opp.missingInfo.length > 0 && (
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
                    <strong className="text-[var(--text-secondary)]">Missing Info:</strong>{' '}
                    {opp.missingInfo[0]}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                  <span className="text-[var(--text-muted)]">
                    Source: <strong>{opp.sourceSummary}</strong> · Confidence:{' '}
                    <strong>{opp.confidence}</strong>
                  </span>
                  <span className="font-medium text-[var(--accent-primary)]">
                    Next: {opp.recommendedNextAction}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Location-to-URL Mapping & Doorway Safeguards */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            Location-to-URL Mapping & Anti-Doorway Safeguards ({workspace.urlMappings.length})
          </h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Map crawled landing pages to approved regions, review missing regional page gaps, and prevent duplicate or doorway-style location clones.
        </p>

        {workspace.urlMappings.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            No target market mappings yet. Configure target markets first.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3">Location</th>
                  <th className="py-2.5 px-3">Mapping Status</th>
                  <th className="py-2.5 px-3">Assigned / Crawled URL</th>
                  <th className="py-2.5 px-3">Overlap / Doorway Safeguard</th>
                  <th className="py-2.5 pl-3 text-right">Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {workspace.urlMappings.map((mp) => (
                  <tr key={mp.id} className="align-top hover:bg-[var(--bg-subtle)]/60">
                    <td className="py-3 pr-3">
                      <div className="font-display font-bold text-[var(--text-primary)]">
                        {mp.locationLabel}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] capitalize">
                        {mp.granularity.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="py-3 px-3">
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
                      {mp.recommendedSlug && !mp.targetUrl && (
                        <div className="mt-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                          Suggested: {mp.recommendedSlug}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {canModifyMappings ? (
                        <select
                          aria-label={`Assign landing URL for ${mp.locationLabel}`}
                          value={mp.targetUrl ?? ''}
                          onChange={(e) =>
                            void onUpdateMapping(mp.id, {
                              targetUrl: e.target.value || null,
                            })
                          }
                          className="w-full max-w-xs rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)]"
                        >
                          <option value="">— No URL mapped (Recommend New Page) —</option>
                          {workspace.crawledUrls.map((u) => (
                            <option key={u.url} value={u.url}>
                              {u.url} ({u.statusCode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                          {mp.targetUrl ?? mp.recommendedSlug ?? 'Unmapped'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-xs text-[11px]">
                      {mp.doorwayRiskWarning ? (
                        <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{mp.doorwayRiskWarning}</span>
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          {mp.resolutionRecommendation ?? 'No duplicate location overlap detected.'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {mp.approvalState === 'Approved' ? (
                        <StatusBadge
                          label={`Approved (${mp.approvedBy ?? 'Owner'})`}
                          tone="success"
                        />
                      ) : canApprove ? (
                        <InteractiveButton
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void onUpdateMapping(mp.id, { approveNewPage: true })
                          }
                        >
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          <span>Approve Plan</span>
                        </InteractiveButton>
                      ) : (
                        <StatusBadge label="Pending Owner Review" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {/* Geographic Keywords Table */}
      <GlassPanel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              Geographic Keyword Research Records ({filteredKeywords.length})
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Integrated directly with Phase 7 Keyword Intelligence. Monthly market search volumes remain honestly Unavailable when Keyword Planner is disconnected.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter geo keywords by country"
              value={kwFilterCountry}
              onChange={(e) => setKwFilterCountry(e.target.value)}
              className="h-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 text-xs text-[var(--text-primary)]"
            >
              <option value="ALL">All Countries ({workspace.geoKeywords.length})</option>
              {distinctKwCountries.map((cc) => (
                <option key={cc} value={cc}>
                  {cc}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={kwSearch}
              onChange={(e) => setKwSearch(e.target.value)}
              placeholder="Search geo keywords..."
              aria-label="Search geo keywords"
              className="h-8 w-44 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        {filteredKeywords.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-xs text-[var(--text-muted)]">
            No geo-scoped keywords stored yet. Run Geographic Discovery above to discover localized keywords.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 px-3">Location Scope</th>
                  <th className="py-2 px-3">Intent</th>
                  <th className="py-2 px-3 text-right">Score</th>
                  <th className="py-2 px-3 text-right">Trends (0–100)</th>
                  <th className="py-2 px-3 text-right">Market Vol</th>
                  <th className="py-2 pl-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredKeywords.slice(0, 40).map((kw) => (
                  <tr key={kw.id} className="hover:bg-[var(--bg-subtle)]/60">
                    <td className="py-2.5 pr-3 font-semibold text-[var(--text-primary)]">
                      {kw.keyword}
                      {kw.isAiSuggestion && (
                        <span className="ml-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-300">
                          (AI Suggestion)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                      {kw.targetCountry}
                      {kw.targetCity ? ` · ${kw.targetCity}` : ''} ({kw.metricGeographyScope})
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">{kw.intent}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {kw.opportunityScore}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {kw.relativeTrendIndex !== null
                        ? `${kw.relativeTrendIndex}/100`
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">
                      {kw.marketSearchVolume !== null
                        ? kw.marketSearchVolume.toLocaleString()
                        : 'Unavailable'}
                    </td>
                    <td className="py-2.5 pl-3">
                      <StatusBadge
                        label={kw.workflowState}
                        tone={
                          kw.workflowState === 'approved' ||
                          kw.workflowState === 'implemented'
                            ? 'success'
                            : kw.workflowState === 'rejected'
                              ? 'danger'
                              : 'neutral'
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
