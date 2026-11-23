import crypto from 'node:crypto';
import type { User } from '../../types/auth';
import type {
  GeoApprovalHistoryEntry,
  GeoGranularity,
  GeoMarketApprovalStatus,
  GeoMarketPriority,
  GeoMeasurementRecord,
  GeoProviderStatus,
  GeoResearchRun,
  GeoTargetMarket,
  GeoUrlMappingRecord,
  GeoWorkspaceResponse,
} from '../../types/geographic';
import type { KeywordIntent } from '../../types/keywords';
import {
  createGeoResearchRun,
  deleteGeoTargetMarket,
  getAuditDb,
  getGeoTargetMarketById,
  getGeoUrlMappingById,
  getKeywordBusinessProfile,
  getProjectById,
  listGeoAuditTrail,
  listGeoMeasurements,
  listGeoResearchRuns,
  listGeoTargetMarkets,
  listGeoUrlMappings,
  listKeywordIntelligenceRecords,
  listLatestCrawledPagesForProject,
  recordActivityEvent,
  recordAuditTrail,
  updateGeoResearchRun,
  upsertGeoMeasurement,
  upsertGeoTargetMarket,
  upsertGeoUrlMapping,
} from '../audit/db';
import { runKeywordDiscoveryWorkflow } from '../keywords/keywordService';
import { resolveCityCoordinates, resolveCountryEntry, resolveStateEntry } from './geoCatalog';
import {
  applyStrategistRecommendation,
  buildGeoComparisonRows,
  buildGeoLocationKey,
  buildGeoOpportunities,
  buildMapCountryFeatures,
  canUserApproveGeoMarkets,
  canUserModifyGeoMappings,
  canUserRecommendGeoMarkets,
  determineGranularity,
  evaluateGeoUrlMappings,
  formatGeoLocationLabel,
  parseMarketTargetStrings,
  validateMeasurementGranularity,
} from './geoEngine';
import {
  buildGeoModifiedSeeds,
  fetchGoogleTrendsGeoInterest,
  fetchGscCountryAnalytics,
  getBaselineGeoProviderStatuses,
  getGeoRankTrackerProviderStatus,
  getGoogleBusinessProfileStatus,
} from './geoProviders';
import { emitRealAgentEvent } from '../agentFactory/agentFactoryService';

function syncProjectTargetMarketsSummary(tenantId: string, projectId: string): void {
  const markets = listGeoTargetMarkets(tenantId, projectId).filter(
    (m) => m.approvalStatus === 'approved',
  );
  if (markets.length === 0) return;

  const summaryList = Array.from(
    new Set(
      markets.map((m) =>
        m.city
          ? `${m.city}, ${m.countryCode}`
          : m.stateRegion
            ? `${m.stateRegion}, ${m.countryCode}`
            : m.countryName,
      ),
    ),
  ).slice(0, 12);

  const db = getAuditDb();
  db.prepare(
    'UPDATE projects SET target_markets_json = ? WHERE id = ? AND tenant_id = ?',
  ).run(JSON.stringify(summaryList), projectId, tenantId);
}

export function getGeoWorkspace(
  tenantId: string,
  projectId: string,
): GeoWorkspaceResponse {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  let targetMarkets = listGeoTargetMarkets(tenantId, projectId);
  const invalidPlaceholders = targetMarkets.filter(
    (m) =>
      !m.isoNumeric &&
      ['sandbox', 'global', 'worldwide'].includes(m.countryName.trim().toLowerCase()),
  );
  if (invalidPlaceholders.length > 0) {
    for (const inv of invalidPlaceholders) {
      deleteGeoTargetMarket(tenantId, inv.id);
    }
    targetMarkets = listGeoTargetMarkets(tenantId, projectId);
  }
  if (targetMarkets.length === 0 && project.targetMarkets.length > 0) {
    const initial = parseMarketTargetStrings(
      projectId,
      tenantId,
      project.targetMarkets,
    );
    for (const m of initial) {
      upsertGeoTargetMarket(m);
    }
    targetMarkets = listGeoTargetMarkets(tenantId, projectId);
  }

  const crawledPages = listLatestCrawledPagesForProject(tenantId, projectId, 150);
  const existingMappings = listGeoUrlMappings(tenantId, projectId);
  const evaluatedMappings = evaluateGeoUrlMappings({
    tenantId,
    projectId,
    markets: targetMarkets,
    crawledPages,
    existingMappings,
    actorName: 'System',
  });
  for (const mapping of evaluatedMappings) {
    upsertGeoUrlMapping(mapping);
  }

  const urlMappings = listGeoUrlMappings(tenantId, projectId);
  const measurements = listGeoMeasurements(tenantId, projectId);
  const geoKeywords = listKeywordIntelligenceRecords(tenantId, projectId);
  const researchRuns = listGeoResearchRuns(tenantId, projectId, 25);

  const opportunities = buildGeoOpportunities({
    markets: targetMarkets,
    measurements,
    geoKeywords,
    urlMappings,
  });

  const comparisonRows = buildGeoComparisonRows({
    markets: targetMarkets,
    measurements,
    geoKeywords,
    urlMappings,
  });

  const mapCountries = buildMapCountryFeatures({
    markets: targetMarkets,
    measurements,
    geoKeywords,
    urlMappings,
  });

  const latestRun = researchRuns[0];
  const providerStatuses =
    latestRun && latestRun.providerStatuses.length > 0
      ? latestRun.providerStatuses
      : getBaselineGeoProviderStatuses(tenantId, projectId);

  const entityIds = [
    ...targetMarkets.map((m) => m.id),
    ...urlMappings.map((u) => u.id),
  ];
  const approvalAuditTrail = listGeoAuditTrail(tenantId, entityIds, 40);

  return {
    projectId: project.id,
    projectName: project.name,
    projectWebsite: project.website,
    summary: {
      approvedMarketsCount: targetMarkets.filter((m) => m.approvalStatus === 'approved')
        .length,
      recommendedMarketsCount: targetMarkets.filter(
        (m) => m.approvalStatus === 'strategist_recommended',
      ).length,
      pendingApprovalCount: targetMarkets.filter(
        (m) =>
          m.approvalStatus === 'pending_owner_approval' ||
          m.approvalStatus === 'strategist_recommended',
      ).length,
      countriesWithGscData: measurements.filter(
        (m) => m.granularity === 'country' && (m.gscImpressions ?? 0) > 0,
      ).length,
      totalGeoKeywords: geoKeywords.length,
      mappedLocationsCount: urlMappings.filter(
        (u) => u.mappingStatus === 'mapped_existing',
      ).length,
      missingLandingPagesCount: urlMappings.filter(
        (u) =>
          u.mappingStatus === 'recommend_new_page' || u.mappingStatus === 'unmapped',
      ).length,
      duplicateOverlapWarningsCount: urlMappings.filter(
        (u) => u.mappingStatus === 'duplicate_overlap',
      ).length,
      opportunitiesCount: opportunities.length,
    },
    granularityDisclosure:
      'Geographic granularity integrity is strictly enforced: Google Search Console provides country-level site analytics only (never extrapolated to states/cities); Google Trends provides relative 0–100 interest indices (not monthly search volumes); localized city/region SERP rankings require a connected rank-tracking provider.',
    providerStatuses,
    targetMarkets,
    measurements,
    mapCountries,
    geoKeywords,
    urlMappings,
    opportunities,
    comparisonRows,
    researchRuns,
    crawledUrls: crawledPages.map(({ headings: _h, ...rest }) => rest),
    approvalAuditTrail,
  };
}

export function upsertTargetMarketWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  marketId?: string;
  countryCode: string;
  stateRegion?: string;
  city?: string;
  language?: string;
  serviceAreas?: string[];
  priority?: GeoMarketPriority;
  approve?: boolean;
  reason?: string;
}): GeoTargetMarket {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  if (!canUserRecommendGeoMarkets(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot add or modify geographic target markets.`,
    );
  }

  const wantsApproval = Boolean(params.approve);
  if (wantsApproval && !canUserApproveGeoMarkets(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot approve business service areas or target markets. Save as a recommendation instead.`,
    );
  }

  const country = resolveCountryEntry(params.countryCode);
  if (!country && params.countryCode.trim().length < 2) {
    throw new Error('BAD_REQUEST: Specify a valid target country code or country name.');
  }

  const cc = country?.alpha2 || params.countryCode.trim().toUpperCase().slice(0, 2);
  const countryName = country?.name || params.countryCode.trim();
  const stateInput = (params.stateRegion ?? '').trim();
  const stateEntry = stateInput ? resolveStateEntry(cc, stateInput) : null;
  const stateRegion = stateEntry?.name ?? stateInput;
  const city = (params.city ?? '').trim();
  const language = (params.language || country?.defaultLanguage || 'en')
    .trim()
    .toLowerCase()
    .slice(0, 8);

  const existingById = params.marketId
    ? getGeoTargetMarketById(params.tenantId, params.marketId)
    : null;
  const existingByKey =
    existingById ??
    listGeoTargetMarkets(params.tenantId, params.projectId).find(
      (m) =>
        m.countryCode === cc &&
        m.stateRegion.toLowerCase() === stateRegion.toLowerCase() &&
        m.city.toLowerCase() === city.toLowerCase() &&
        m.language === language,
    ) ??
    null;

  // Strategists recommending markets NEVER silently overwrite owner-approved markets
  if (!wantsApproval) {
    const saved = applyStrategistRecommendation({
      existing: existingByKey,
      tenantId: params.tenantId,
      projectId: params.projectId,
      countryCode: cc,
      stateRegion,
      city,
      language,
      serviceAreas: params.serviceAreas,
      recommendedReason:
        params.reason?.trim() || 'Strategist geographic market expansion recommendation.',
      actorName: params.user.name,
      actorRole: params.user.role,
    });
    upsertGeoTargetMarket(saved);

    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'geo_market',
      entityId: saved.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existingByKey?.approvalStatus ?? 'none',
      newState: saved.approvalStatus,
      reason: saved.recommendedReason,
    });

    recordActivityEvent({
      tenantId: params.tenantId,
      projectId: params.projectId,
      type: 'keyword_approval',
      actor: params.user.name,
      action: `Recommended target market ${formatGeoLocationLabel({
        countryCode: cc,
        countryName,
        stateRegion,
        city,
      })}`,
      status: 'Pending',
      evidenceUrl: '/geographic-intelligence',
    });

    return saved;
  }

  const now = new Date().toISOString();
  const coords = resolveCityCoordinates(cc, stateRegion, city);
  const granularity: GeoGranularity = determineGranularity({
    countryCode: cc,
    stateRegion,
    city,
  });
  const priority: GeoMarketPriority =
    params.priority === 'primary' || params.priority === 'secondary'
      ? params.priority
      : existingByKey?.priority && existingByKey.priority !== 'recommended'
        ? existingByKey.priority
        : 'secondary';

  const serviceAreas =
    params.serviceAreas && params.serviceAreas.length > 0
      ? params.serviceAreas.map((s) => s.trim()).filter(Boolean)
      : existingByKey?.serviceAreas && existingByKey.serviceAreas.length > 0
        ? existingByKey.serviceAreas
        : [
            formatGeoLocationLabel({
              countryCode: cc,
              countryName,
              stateRegion,
              city,
            }),
          ];

  const prevStatus: GeoMarketApprovalStatus | 'none' =
    existingByKey?.approvalStatus ?? 'none';
  const historyEntry: GeoApprovalHistoryEntry = {
    id: `geoah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousStatus: prevStatus,
    newStatus: 'approved',
    reason:
      params.reason?.trim() ||
      `Approved ${priority} target market & service area (${serviceAreas.join(', ')})`,
    timestamp: now,
  };

  const saved: GeoTargetMarket = {
    id: existingByKey?.id ?? `geomkt-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    granularity,
    countryCode: cc,
    countryName,
    isoNumeric: country?.isoNumeric ?? existingByKey?.isoNumeric ?? '',
    stateRegion,
    stateFips: stateEntry?.fips ?? existingByKey?.stateFips ?? null,
    city,
    language,
    serviceAreas,
    priority,
    approvalStatus: 'approved',
    approvedBy: params.user.name,
    approvedAt: now,
    recommendedBy: existingByKey?.recommendedBy ?? null,
    recommendedReason:
      params.reason?.trim() || existingByKey?.recommendedReason || '',
    latitude: coords?.latitude ?? existingByKey?.latitude ?? null,
    longitude: coords?.longitude ?? existingByKey?.longitude ?? null,
    approvalHistory: [historyEntry, ...(existingByKey?.approvalHistory ?? [])].slice(
      0,
      25,
    ),
    createdAt: existingByKey?.createdAt ?? now,
    updatedAt: now,
  };

  upsertGeoTargetMarket(saved);
  syncProjectTargetMarketsSummary(params.tenantId, params.projectId);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'geo_market',
    entityId: saved.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: prevStatus,
    newState: 'approved',
    reason: historyEntry.reason,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'keyword_approval',
    actor: params.user.name,
    action: `Approved target market ${formatGeoLocationLabel({
      countryCode: cc,
      countryName,
      stateRegion,
      city,
    })}`,
    status: 'Succeeded',
    evidenceUrl: '/geographic-intelligence',
  });

  return saved;
}

export function approveOrRejectTargetMarketWorkflow(params: {
  tenantId: string;
  marketId: string;
  user: User;
  action: 'approve' | 'reject';
  priority?: GeoMarketPriority;
  reason?: string;
}): GeoTargetMarket {
  const existing = getGeoTargetMarketById(params.tenantId, params.marketId);
  if (!existing) throw new Error('NOT_FOUND: Geographic target market not found.');

  if (!canUserApproveGeoMarkets(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot approve or reject business target markets.`,
    );
  }

  const now = new Date().toISOString();
  const nextStatus = params.action === 'approve' ? 'approved' : 'rejected';
  const nextPriority: GeoMarketPriority =
    params.action === 'approve'
      ? params.priority && params.priority !== 'recommended'
        ? params.priority
        : existing.priority === 'recommended'
          ? 'secondary'
          : existing.priority
      : existing.priority;

  const historyEntry = {
    id: `geoah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousStatus: existing.approvalStatus,
    newStatus: nextStatus as GeoTargetMarket['approvalStatus'],
    reason:
      params.reason?.trim() ||
      (params.action === 'approve'
        ? `Owner approved target market (${nextPriority})`
        : 'Owner declined target market recommendation'),
    timestamp: now,
  };

  const updated: GeoTargetMarket = {
    ...existing,
    priority: nextPriority,
    approvalStatus: nextStatus,
    approvedBy: params.action === 'approve' ? params.user.name : existing.approvedBy,
    approvedAt: params.action === 'approve' ? now : existing.approvedAt,
    approvalHistory: [historyEntry, ...existing.approvalHistory].slice(0, 25),
    updatedAt: now,
  };

  upsertGeoTargetMarket(updated);
  syncProjectTargetMarketsSummary(params.tenantId, existing.projectId);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'geo_market',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.approvalStatus,
    newState: nextStatus,
    reason: historyEntry.reason,
  });

  return updated;
}

export function deleteTargetMarketWorkflow(params: {
  tenantId: string;
  marketId: string;
  user: User;
}): void {
  const existing = getGeoTargetMarketById(params.tenantId, params.marketId);
  if (!existing) throw new Error('NOT_FOUND: Geographic target market not found.');

  if (!canUserApproveGeoMarkets(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot remove business target markets.`,
    );
  }

  deleteGeoTargetMarket(params.tenantId, params.marketId);
  syncProjectTargetMarketsSummary(params.tenantId, existing.projectId);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'geo_market',
    entityId: existing.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.approvalStatus,
    newState: 'deleted',
    reason: `Removed target market ${formatGeoLocationLabel({
      countryCode: existing.countryCode,
      countryName: existing.countryName,
      stateRegion: existing.stateRegion,
      city: existing.city,
    })}`,
  });
}

export async function syncGscCountriesWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  days?: number;
}): Promise<{
  status: GeoProviderStatus;
  syncedCountries: number;
}> {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const gscRes = await fetchGscCountryAnalytics({
    tenantId: params.tenantId,
    projectId: params.projectId,
    days: params.days ?? 30,
  });

  for (const m of gscRes.measurements) {
    const check = validateMeasurementGranularity({
      recordGranularity: m.granularity,
      gscClicks: m.gscClicks,
      gscImpressions: m.gscImpressions,
      gscSourceDimension: 'country',
    });
    if (check.valid) {
      upsertGeoMeasurement(m);
    }
  }

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'sync',
    actor: params.user.name,
    action: `Synced Google Search Console country breakdown (${gscRes.measurements.length} countries)`,
    status: gscRes.status.state === 'connected' ? 'Succeeded' : 'Warning',
    evidenceUrl: '/geographic-intelligence',
  });

  return {
    status: gscRes.status,
    syncedCountries: gscRes.measurements.length,
  };
}

export async function runGeoDiscoveryWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  countryCode: string;
  stateRegion?: string;
  city?: string;
  language?: string;
  seedTerms?: string[];
  intentFocus?: KeywordIntent | 'all';
  includeAutocomplete?: boolean;
  includeTrends?: boolean;
  includeAiExpansion?: boolean;
}): Promise<{
  run: GeoResearchRun;
  keywordsDiscovered: number;
  measurementsCollected: number;
}> {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const country = resolveCountryEntry(params.countryCode);
  const cc = country?.alpha2 || params.countryCode.trim().toUpperCase().slice(0, 2);
  const countryName = country?.name || params.countryCode.trim();
  const stateRegion = (params.stateRegion ?? '').trim();
  const city = (params.city ?? '').trim();
  const language = (params.language || country?.defaultLanguage || 'en')
    .trim()
    .toLowerCase();

  const businessProfile = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const rawSeeds = (
    params.seedTerms && params.seedTerms.length > 0
      ? params.seedTerms
      : businessProfile.approvedServices.length > 0
        ? businessProfile.approvedServices
        : [project.name]
  )
    .map((s) => s.trim())
    .filter(Boolean);

  const geoSeeds = buildGeoModifiedSeeds({
    baseSeeds: rawSeeds,
    countryName,
    stateRegion,
    city,
  });

  const now = new Date().toISOString();
  const runId = `georun-${crypto.randomUUID().slice(0, 10)}`;
  const initialRun = createGeoResearchRun({
    id: runId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    targetCountry: cc,
    targetStateRegion: stateRegion,
    targetCity: city,
    targetLanguage: language,
    seedTerms: geoSeeds,
    intentFocus: params.intentFocus ?? 'all',
    status: 'Running',
    keywordsDiscovered: 0,
    measurementsCollected: 0,
    opportunitiesGenerated: 0,
    providerStatuses: [],
    triggeredBy: params.user.name,
    startedAt: now,
    completedAt: null,
  });

  const geoTaskTitle = `Geo Discovery (${city || stateRegion || countryName})`;
  emitRealAgentEvent({
    eventType: 'agent.started',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'geographic_intelligence_agent',
    status: 'running',
    taskTitle: geoTaskTitle,
    summary: `Analyzing geographic signals for ${city || stateRegion || countryName}.`,
    evidenceUrl: '/geographic-intelligence',
  });
  emitRealAgentEvent({
    eventType: 'agent.communication',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'keyword_intelligence_agent',
    sourceAgentId: 'geographic_intelligence_agent',
    destinationAgentId: 'keyword_intelligence_agent',
    status: 'communicating',
    taskTitle: geoTaskTitle,
    summary: `Requesting geo-modified keyword signals for ${cc}.`,
    evidenceUrl: '/geographic-intelligence',
  });

  // 1. Run GSC Country Dimension Sync + Google Trends Geo + Phase 7 Keyword Discovery
  const [gscCountryRes, trendsGeoRes, kwResult] = await Promise.all([
    fetchGscCountryAnalytics({
      tenantId: params.tenantId,
      projectId: params.projectId,
    }),
    params.includeTrends !== false
      ? fetchGoogleTrendsGeoInterest({
          keyword: rawSeeds[0] ?? project.name,
          countryCode: cc,
        })
      : Promise.resolve({
          status: {
            provider: 'google_trends_geo' as const,
            label: 'Google Trends Geographic Interest (0–100)',
            state: 'unavailable' as const,
            configured: true,
            granularitySupported: ['country', 'state_region'] as GeoGranularity[],
            metricNature: 'relative_interest_0_100' as const,
            lastCheckedAt: now,
            detail: 'Google Trends check skipped by user.',
            itemsReturned: 0,
          },
          subregions: [],
          countryRelativeIndex: null,
        }),
    runKeywordDiscoveryWorkflow({
      tenantId: params.tenantId,
      projectId: params.projectId,
      user: params.user,
      seedTerms: geoSeeds,
      targetCountry: cc,
      targetCity: city,
      targetLanguage: language,
      intentFocus: params.intentFocus ?? 'all',
      includeAutocomplete: params.includeAutocomplete !== false,
      includeTrends: params.includeTrends !== false,
      includeAiExpansion: Boolean(params.includeAiExpansion),
    }),
  ]);

  let measurementsCollected = 0;

  // Store GSC country metrics cleanly
  for (const m of gscCountryRes.measurements) {
    upsertGeoMeasurement(m);
    measurementsCollected += 1;
  }

  // Store Google Trends country relative interest if returned (strictly relative_interest, never volume)
  if (trendsGeoRes.countryRelativeIndex !== null) {
    const locKey = buildGeoLocationKey({ countryCode: cc });
    upsertGeoMeasurement({
      id: `geomeas-${crypto.createHash('sha1').update(`${params.projectId}:country:${locKey}`).digest('hex').slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      marketId: null,
      granularity: 'country',
      locationKey: locKey,
      locationLabel: countryName,
      countryCode: cc,
      countryName,
      isoNumeric: country?.isoNumeric ?? '',
      stateRegion: '',
      city: '',
      latitude: country?.latitude ?? null,
      longitude: country?.longitude ?? null,
      gscClicks: null,
      gscImpressions: null,
      gscCtr: null,
      gscAvgPosition: null,
      gscGranularityNote:
        'GSC country metrics updated separately when Search Console OAuth is connected.',
      relativeTrendIndex: trendsGeoRes.countryRelativeIndex,
      trendDirection: 'stable',
      trendsNote: `Google Trends 0–100 relative regional interest for "${rawSeeds[0] ?? project.name}" in ${cc} (not absolute search volume).`,
      gbpLocationsCount: null,
      gbpVisibilityNote: 'Google Business Profile not connected.',
      trackedRankPosition: null,
      trackedRankProvider: null,
      rankTrackingNote: 'Localized rank tracking not connected.',
      provenance: {
        source: 'Google Trends (GEO_MAP)',
        collectedAt: now,
        reportingPeriod: 'Last 90 days (relative 0–100 index)',
        measurementStatus: 'relative_interest',
        granularity: 'country',
        methodology: 'Normalized 0–100 search interest index within target country.',
        limitations: 'Relative popularity score only; does not indicate absolute monthly search volume.',
      },
      collectedAt: now,
    });
    measurementsCollected += 1;
  }

  // Store subregion Trends records strictly as state_region measurements (no GSC extrapolation!)
  for (const sub of trendsGeoRes.subregions) {
    const st = resolveStateEntry(cc, sub.name);
    const locKey = buildGeoLocationKey({ countryCode: cc, stateRegion: sub.name });
    upsertGeoMeasurement({
      id: `geomeas-${crypto.createHash('sha1').update(`${params.projectId}:state:${locKey}`).digest('hex').slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      marketId: null,
      granularity: 'state_region',
      locationKey: locKey,
      locationLabel: `${sub.name}, ${cc}`,
      countryCode: cc,
      countryName,
      isoNumeric: country?.isoNumeric ?? '',
      stateRegion: sub.name,
      city: '',
      latitude: st?.latitude ?? country?.latitude ?? null,
      longitude: st?.longitude ?? country?.longitude ?? null,
      gscClicks: null,
      gscImpressions: null,
      gscCtr: null,
      gscAvgPosition: null,
      gscGranularityNote:
        'State/region GSC impressions unavailable (GSC API exposes country granularity only).',
      relativeTrendIndex: sub.relativeInterest,
      trendDirection: 'stable',
      trendsNote: `Google Trends 0–100 subregion interest index in ${sub.name}, ${cc}.`,
      gbpLocationsCount: null,
      gbpVisibilityNote: 'Google Business Profile not connected.',
      trackedRankPosition: null,
      trackedRankProvider: null,
      rankTrackingNote: 'Localized rank tracking not connected.',
      provenance: {
        source: 'Google Trends (Subregion GEO_MAP)',
        collectedAt: now,
        reportingPeriod: 'Last 90 days (relative 0–100 index)',
        measurementStatus: 'relative_interest',
        granularity: 'state_region',
        methodology: 'Subregional normalized 0–100 Google Trends index.',
        limitations: 'Normalized index relative to peak subregion inside country; not absolute search volume.',
      },
      collectedAt: now,
    });
    measurementsCollected += 1;
  }

  const gbpStatus = getGoogleBusinessProfileStatus(params.tenantId, params.projectId);
  const rankStatus = getGeoRankTrackerProviderStatus();
  const autoStatusKw = kwResult.run.providerStatuses.find(
    (p) => p.provider === 'autocomplete',
  );
  const crawlStatusKw = kwResult.run.providerStatuses.find(
    (p) => p.provider === 'crawl',
  );

  const providerStatuses: GeoProviderStatus[] = [
    gscCountryRes.status,
    trendsGeoRes.status,
    gbpStatus,
    rankStatus,
    {
      provider: 'crawl_inventory',
      label: 'Site Crawl Location URL Inventory',
      state: crawlStatusKw?.state === 'available' ? 'available' : 'unavailable',
      configured: crawlStatusKw?.configured ?? false,
      granularitySupported: ['country', 'state_region', 'city'],
      metricNature: 'onsite_url_inventory',
      lastCheckedAt: now,
      detail: crawlStatusKw?.detail ?? 'Crawl inventory checked.',
      itemsReturned: crawlStatusKw?.itemsReturned ?? 0,
    },
    {
      provider: 'autocomplete_geo',
      label: 'Localized Search Autocomplete (hl / gl)',
      state:
        autoStatusKw?.state === 'available'
          ? 'available'
          : autoStatusKw?.state === 'error'
            ? 'error'
            : 'unavailable',
      configured: true,
      granularitySupported: ['country', 'city'],
      metricNature: 'localized_suggestions',
      lastCheckedAt: now,
      detail: autoStatusKw?.detail ?? 'Autocomplete evaluated.',
      itemsReturned: autoStatusKw?.itemsReturned ?? 0,
    },
  ];

  const hasWarnings = providerStatuses.some(
    (s) => s.state === 'error' || s.state === 'rate_limited' || s.state === 'blocked',
  );

  const ws = getGeoWorkspace(params.tenantId, params.projectId);

  const completed = updateGeoResearchRun(params.tenantId, initialRun.id, {
    status: hasWarnings ? 'Completed with Warnings' : 'Completed',
    keywordsDiscovered: kwResult.discoveredCount,
    measurementsCollected,
    opportunitiesGenerated: ws.opportunities.length,
    providerStatuses,
    completedAt: new Date().toISOString(),
  })!;

  emitRealAgentEvent({
    eventType: 'agent.completed',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: initialRun.id,
    taskId: initialRun.id,
    agentId: 'geographic_intelligence_agent',
    status: 'completed',
    taskTitle: geoTaskTitle,
    summary: `Collected ${measurementsCollected} geo measurement(s) and ${kwResult.discoveredCount} geo keyword(s).`,
    evidenceUrl: '/geographic-intelligence',
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'sync',
    actor: params.user.name,
    action: `Ran Geographic Search Intelligence discovery for ${formatGeoLocationLabel({
      countryCode: cc,
      countryName,
      stateRegion,
      city,
    })} (${kwResult.discoveredCount} keywords)`,
    status: hasWarnings ? 'Warning' : 'Succeeded',
    evidenceUrl: '/geographic-intelligence',
  });

  return {
    run: completed,
    keywordsDiscovered: kwResult.discoveredCount,
    measurementsCollected,
  };
}

export function updateGeoUrlMappingWorkflow(params: {
  tenantId: string;
  mappingId: string;
  user: User;
  targetUrl?: string | null;
  recommendedSlug?: string | null;
  approveNewPage?: boolean;
}): GeoUrlMappingRecord {
  const existing = getGeoUrlMappingById(params.tenantId, params.mappingId);
  if (!existing) throw new Error('NOT_FOUND: Geographic URL mapping not found.');

  if (!canUserModifyGeoMappings(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot modify location-to-URL mappings.`,
    );
  }

  if (params.approveNewPage && !canUserApproveGeoMarkets(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot approve new location landing page plans.`,
    );
  }

  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    existing.projectId,
    150,
  );
  const nextUrl =
    params.targetUrl !== undefined
      ? params.targetUrl?.trim() || null
      : existing.targetUrl;
  const pageMeta = nextUrl
    ? crawledPages.find((p) => p.url === nextUrl)
    : undefined;
  const now = new Date().toISOString();

  const updated: GeoUrlMappingRecord = {
    ...existing,
    targetUrl: nextUrl,
    mappingStatus: nextUrl ? 'mapped_existing' : 'recommend_new_page',
    recommendedSlug:
      params.recommendedSlug !== undefined
        ? params.recommendedSlug?.trim() || null
        : nextUrl
          ? null
          : existing.recommendedSlug,
    pageTitle: pageMeta?.title ?? null,
    pageH1: pageMeta?.h1 ?? null,
    pageStatusCode: pageMeta?.statusCode ?? null,
    pageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
    approvalState: params.approveNewPage
      ? 'Approved'
      : existing.approvalState,
    approvedBy: params.approveNewPage ? params.user.name : existing.approvedBy,
    approvedAt: params.approveNewPage ? now : existing.approvedAt,
    updatedBy: params.user.name,
    updatedAt: now,
  };

  upsertGeoUrlMapping(updated);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'geo_mapping',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.targetUrl ?? existing.approvalState,
    newState: updated.targetUrl ?? updated.approvalState,
    reason: params.approveNewPage
      ? `Approved landing page plan for ${updated.locationLabel} (${updated.recommendedSlug ?? updated.targetUrl})`
      : `Updated location-to-URL mapping for ${updated.locationLabel} -> ${updated.targetUrl ?? 'Recommended New Page'}`,
  });

  return updated;
}

export function exportGeoReportBundle(tenantId: string, projectId: string) {
  const ws = getGeoWorkspace(tenantId, projectId);
  return {
    exportedAt: new Date().toISOString(),
    projectId: ws.projectId,
    projectName: ws.projectName,
    projectWebsite: ws.projectWebsite,
    granularityDisclosure: ws.granularityDisclosure,
    summary: ws.summary,
    providerStatuses: ws.providerStatuses,
    targetMarkets: ws.targetMarkets,
    comparisonRows: ws.comparisonRows,
    opportunities: ws.opportunities,
    urlMappings: ws.urlMappings,
  };
}
