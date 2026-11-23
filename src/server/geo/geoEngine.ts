import crypto from 'node:crypto';
import type { UserRole } from '../../types/auth';
import type {
  GeoApprovalHistoryEntry,
  GeoGranularity,
  GeoMapRegionFeature,
  GeoMarketApprovalStatus,
  GeoMarketComparisonRow,
  GeoMarketPriority,
  GeoMeasurementRecord,
  GeoOpportunityRecommendation,
  GeoTargetMarket,
  GeoUrlMappingRecord,
} from '../../types/geographic';
import type { CrawledPageOption, KeywordIntelligenceRecord } from '../../types/keywords';
import { normalizeKeywordText, tokenizeKeyword } from '../keywords/intelligenceEngine';
import {
  GEO_COUNTRY_CATALOG,
  resolveCityCoordinates,
  resolveCountryEntry,
  resolveStateEntry,
} from './geoCatalog';

const GEO_OWNER_APPROVER_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
];

const GEO_RECOMMEND_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
];

export function canUserApproveGeoMarkets(role: UserRole): boolean {
  return GEO_OWNER_APPROVER_ROLES.includes(role);
}

export function canUserRecommendGeoMarkets(role: UserRole): boolean {
  return GEO_RECOMMEND_ROLES.includes(role);
}

export function canUserModifyGeoMappings(role: UserRole): boolean {
  return role !== 'QA' && role !== 'Outreach Lead' && role !== 'Publisher';
}

export function determineGranularity(params: {
  countryCode: string;
  stateRegion?: string;
  city?: string;
}): GeoGranularity {
  if (params.city && params.city.trim().length > 0) return 'city';
  if (params.stateRegion && params.stateRegion.trim().length > 0) return 'state_region';
  return 'country';
}

export function formatGeoLocationLabel(params: {
  countryCode: string;
  countryName?: string;
  stateRegion?: string;
  city?: string;
}): string {
  const country = resolveCountryEntry(params.countryCode)?.name || params.countryName || params.countryCode;
  const parts = [params.city?.trim(), params.stateRegion?.trim(), country].filter(
    (p): p is string => Boolean(p && p.length > 0),
  );
  return parts.join(', ');
}

export function buildGeoLocationKey(params: {
  countryCode: string;
  stateRegion?: string;
  city?: string;
}): string {
  const cc = (resolveCountryEntry(params.countryCode)?.alpha2 || params.countryCode)
    .trim()
    .toUpperCase();
  const state = (params.stateRegion ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const city = (params.city ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return [cc, state || '_', city || '_'].join('::');
}

/**
 * Enforces strict geographic granularity boundaries:
 * Google Search Console country-dimension metrics CANNOT be copied or extrapolated
 * down to state/region or city records.
 */
export function validateMeasurementGranularity(params: {
  recordGranularity: GeoGranularity;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscSourceDimension: 'country' | 'none';
}): {
  valid: boolean;
  sanitizedClicks: number | null;
  sanitizedImpressions: number | null;
  note: string;
} {
  if (
    params.gscSourceDimension === 'country' &&
    params.recordGranularity !== 'country' &&
    (params.gscClicks !== null || params.gscImpressions !== null)
  ) {
    return {
      valid: false,
      sanitizedClicks: null,
      sanitizedImpressions: null,
      note: 'GSC provides country-level search analytics only; city/state-level GSC impressions are unavailable and never extrapolated from country totals.',
    };
  }
  return {
    valid: true,
    sanitizedClicks: params.gscClicks,
    sanitizedImpressions: params.gscImpressions,
    note:
      params.recordGranularity === 'country'
        ? 'Country-level Google Search Console search analytics dimension.'
        : 'City/region-level GSC search analytics is not exposed by Search Console API (Unavailable).',
  };
}

export function parseMarketTargetStrings(
  projectId: string,
  tenantId: string,
  rawMarkets: string[],
): GeoTargetMarket[] {
  const now = new Date().toISOString();
  const markets: GeoTargetMarket[] = [];
  const seen = new Set<string>();

  rawMarkets.forEach((raw, idx) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const country = resolveCountryEntry(cleaned) ??
      resolveCountryEntry(cleaned.split(/[-–,/]/)[0]?.trim() || '');
    if (!country) return;

    const countryCode = country.alpha2;
    const countryName = country.name;
    const isoNumeric = country.isoNumeric;
    const lang = country.defaultLanguage || 'en';

    const key = `${countryCode}::::${lang}`;
    if (seen.has(key)) return;
    seen.add(key);

    markets.push({
      id: `geomkt-${crypto.createHash('sha1').update(`${projectId}:${key}`).digest('hex').slice(0, 10)}`,
      tenantId,
      projectId,
      granularity: 'country',
      countryCode,
      countryName,
      isoNumeric,
      stateRegion: '',
      stateFips: null,
      city: '',
      language: lang,
      serviceAreas: [countryName],
      priority: idx === 0 ? 'primary' : 'secondary',
      approvalStatus: 'approved',
      approvedBy: 'Project Settings',
      approvedAt: now,
      recommendedBy: null,
      recommendedReason: 'Synced from project configured target markets.',
      latitude: country?.latitude ?? null,
      longitude: country?.longitude ?? null,
      approvalHistory: [
        {
          id: `geoah-${crypto.randomUUID().slice(0, 8)}`,
          actorName: 'Project Settings',
          actorRole: 'Business Owner',
          previousStatus: 'none',
          newStatus: 'approved',
          reason: 'Initial configured target market from project setup.',
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
  });

  return markets;
}

export function applyStrategistRecommendation(params: {
  existing: GeoTargetMarket | null;
  tenantId: string;
  projectId: string;
  countryCode: string;
  stateRegion?: string;
  city?: string;
  language?: string;
  serviceAreas?: string[];
  recommendedReason: string;
  actorName: string;
  actorRole: string;
}): GeoTargetMarket {
  const now = new Date().toISOString();
  const country = resolveCountryEntry(params.countryCode);
  const cc = country?.alpha2 || params.countryCode.trim().toUpperCase().slice(0, 2);
  const countryName = country?.name || params.countryCode.trim();
  const state = (params.stateRegion ?? '').trim();
  const city = (params.city ?? '').trim();
  const language = (params.language || country?.defaultLanguage || 'en').trim().toLowerCase();
  const stateEntry = state ? resolveStateEntry(cc, state) : null;
  const coords = resolveCityCoordinates(cc, state, city);

  // Never overwrite an owner-approved primary/secondary market into unapproved recommended status
  if (params.existing && params.existing.approvalStatus === 'approved') {
    const historyEntry = {
      id: `geoah-${crypto.randomUUID().slice(0, 8)}`,
      actorName: params.actorName,
      actorRole: params.actorRole,
      previousStatus: params.existing.approvalStatus,
      newStatus: params.existing.approvalStatus,
      reason: `Strategist note recorded without overwriting owner-approved market: ${params.recommendedReason || 'Confirmed market priority'}`,
      timestamp: now,
    };
    return {
      ...params.existing,
      recommendedBy: params.actorName,
      recommendedReason: params.recommendedReason || params.existing.recommendedReason,
      approvalHistory: [historyEntry, ...params.existing.approvalHistory].slice(0, 25),
      updatedAt: now,
    };
  }

  const prevStatus: GeoMarketApprovalStatus | 'none' =
    params.existing?.approvalStatus ?? 'none';
  const entry: GeoApprovalHistoryEntry = {
    id: `geoah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.actorName,
    actorRole: params.actorRole,
    previousStatus: prevStatus,
    newStatus: 'strategist_recommended',
    reason: params.recommendedReason.trim() || 'Strategist target market recommendation.',
    timestamp: now,
  };

  return {
    id: params.existing?.id ?? `geomkt-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    granularity: determineGranularity({ countryCode: cc, stateRegion: state, city }),
    countryCode: cc,
    countryName,
    isoNumeric: country?.isoNumeric ?? '',
    stateRegion: stateEntry?.name ?? state,
    stateFips: stateEntry?.fips ?? null,
    city,
    language,
    serviceAreas:
      params.serviceAreas && params.serviceAreas.length > 0
        ? params.serviceAreas
        : [formatGeoLocationLabel({ countryCode: cc, countryName, stateRegion: state, city })],
    priority: 'recommended',
    approvalStatus: 'strategist_recommended',
    approvedBy: params.existing?.approvedBy ?? null,
    approvedAt: params.existing?.approvedAt ?? null,
    recommendedBy: params.actorName,
    recommendedReason: params.recommendedReason.trim(),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    approvalHistory: [entry, ...(params.existing?.approvalHistory ?? [])].slice(0, 25),
    createdAt: params.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function evaluateGeoUrlMappings(params: {
  tenantId: string;
  projectId: string;
  markets: GeoTargetMarket[];
  crawledPages: (CrawledPageOption & { headings?: string[] })[];
  existingMappings: GeoUrlMappingRecord[];
  actorName: string;
}): GeoUrlMappingRecord[] {
  const now = new Date().toISOString();
  const existingByMarketId = new Map(params.existingMappings.map((m) => [m.marketId, m]));
  const pageByUrl = new Map(params.crawledPages.map((p) => [p.url, p]));
  const results: GeoUrlMappingRecord[] = [];
  const targetUrlUsage = new Map<string, GeoTargetMarket[]>();

  // First pass: find matching crawled pages per market & check duplicate location pages
  for (const market of params.markets) {
    const existing = existingByMarketId.get(market.id);
    const locLabel = formatGeoLocationLabel({
      countryCode: market.countryCode,
      countryName: market.countryName,
      stateRegion: market.stateRegion,
      city: market.city,
    });

    const locationSlugPart = [market.countryCode.toLowerCase(), market.stateRegion, market.city]
      .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      .filter(Boolean)
      .join('/');
    const recommendedSlug = `/${locationSlugPart || market.countryCode.toLowerCase()}`;

    const locationTerms = new Set<string>(
      tokenizeKeyword(
        `${market.countryName} ${market.countryCode} ${market.stateRegion} ${market.city}`,
      ),
    );
    if (market.countryCode.toLowerCase() === 'gb') locationTerms.add('uk');
    if (market.countryCode.toLowerCase() === 'us') locationTerms.add('usa');

    const matchingPages: { url: string; score: number }[] = [];
    for (const page of params.crawledPages) {
      if (page.statusCode >= 400 || page.indexability === 'Non-Indexable') continue;
      let pathname = '/';
      try {
        pathname = new URL(page.url).pathname;
      } catch {
        pathname = page.url;
      }
      const pageText = `${pathname.replace(/[-_/]/g, ' ')} ${page.title ?? ''} ${page.h1 ?? ''} ${(page.headings ?? []).slice(0, 3).join(' ')}`.toLowerCase();
      let score = 0;
      if (market.city && pageText.includes(market.city.toLowerCase())) score += 3;
      if (market.stateRegion && pageText.includes(market.stateRegion.toLowerCase())) score += 2;
      if (
        pathname.toLowerCase().includes(`/${market.countryCode.toLowerCase()}/`) ||
        pathname.toLowerCase() === `/${market.countryCode.toLowerCase()}` ||
        pageText.includes(market.countryName.toLowerCase())
      ) {
        score += 2;
      }
      // Root homepage matches primary country market only if there is only a single root site
      if (pathname === '/' && market.granularity === 'country' && market.priority === 'primary') {
        score += 1;
      }
      if (score >= 1) {
        matchingPages.push({ url: page.url, score });
      }
    }

    matchingPages.sort((a, b) => b.score - a.score);

    const chosenUrl =
      existing?.targetUrl !== undefined
        ? existing.targetUrl
        : matchingPages[0]?.url ?? null;

    if (chosenUrl) {
      const list = targetUrlUsage.get(chosenUrl) ?? [];
      list.push(market);
      targetUrlUsage.set(chosenUrl, list);
    }

    const pageMeta = chosenUrl ? pageByUrl.get(chosenUrl) : undefined;
    const competingUrls = matchingPages
      .slice(0, 4)
      .map((p) => p.url)
      .filter((u) => u !== chosenUrl);

    const hasMultipleLocalPages =
      market.granularity !== 'country' && matchingPages.filter((p) => p.score >= 2).length >= 2;

    const doorwayRiskWarning =
      !chosenUrl && market.granularity === 'city'
        ? 'Avoid mass-generating thin city doorway pages. Create dedicated local landing pages only for verified service areas with unique local proof, case studies, and NAP signals.'
        : hasMultipleLocalPages
          ? `Multiple pages match "${locLabel}". Consolidate or canonicalize duplicate location content to prevent cannibalization.`
          : null;

    const duplicateRisk: GeoUrlMappingRecord['duplicateRisk'] =
      hasMultipleLocalPages ? 'high' : competingUrls.length > 0 ? 'medium' : 'none';

    const mappingStatus: GeoUrlMappingRecord['mappingStatus'] =
      hasMultipleLocalPages
        ? 'duplicate_overlap'
        : chosenUrl
          ? 'mapped_existing'
          : market.approvalStatus === 'approved'
            ? 'recommend_new_page'
            : 'unmapped';

    const resolutionRecommendation = hasMultipleLocalPages
      ? `Consolidate ${competingUrls.slice(0, 2).join(', ')} into canonical landing page ${chosenUrl || recommendedSlug}.`
      : !chosenUrl
        ? `No dedicated page mapped for ${locLabel}. Review recommending ${recommendedSlug} with unique regional content.`
        : null;

    results.push({
      id: existing?.id ?? `geomap-${crypto.createHash('sha1').update(`${params.projectId}:${market.id}`).digest('hex').slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      marketId: market.id,
      locationLabel: locLabel,
      granularity: market.granularity,
      countryCode: market.countryCode,
      stateRegion: market.stateRegion,
      city: market.city,
      targetUrl: chosenUrl,
      mappingStatus,
      recommendedSlug: chosenUrl ? null : recommendedSlug,
      pageTitle: pageMeta?.title ?? existing?.pageTitle ?? null,
      pageH1: pageMeta?.h1 ?? existing?.pageH1 ?? null,
      pageStatusCode: pageMeta?.statusCode ?? existing?.pageStatusCode ?? null,
      pageIndexable: pageMeta
        ? pageMeta.indexability === 'Indexable'
        : existing?.pageIndexable ?? null,
      duplicateRisk,
      competingUrls,
      doorwayRiskWarning,
      resolutionRecommendation,
      approvalState: existing?.approvalState ?? 'Pending',
      approvedBy: existing?.approvedBy ?? null,
      approvedAt: existing?.approvedAt ?? null,
      updatedBy: existing?.updatedBy ?? params.actorName,
      updatedAt: existing?.updatedAt ?? now,
    });
  }

  // Second pass: detect two different city/state markets sharing the exact same non-root URL
  return results.map((mapping) => {
    if (!mapping.targetUrl) return mapping;
    const shared = targetUrlUsage.get(mapping.targetUrl) ?? [];
    let pathname = '/';
    try {
      pathname = new URL(mapping.targetUrl).pathname;
    } catch {
      pathname = mapping.targetUrl;
    }
    if (shared.length >= 2 && pathname !== '/' && mapping.granularity !== 'country') {
      const others = shared
        .filter((m) => m.id !== mapping.marketId)
        .map((m) =>
          formatGeoLocationLabel({
            countryCode: m.countryCode,
            countryName: m.countryName,
            stateRegion: m.stateRegion,
            city: m.city,
          }),
        );
      return {
        ...mapping,
        mappingStatus: 'duplicate_overlap',
        duplicateRisk: 'medium',
        doorwayRiskWarning: `URL ${mapping.targetUrl} is assigned to multiple sub-national locations (${others.join(', ')}). Ensure differentiated regional landing pages only where service coverage exists.`,
        resolutionRecommendation:
          mapping.resolutionRecommendation ??
          `Decide whether ${mapping.targetUrl} covers all of these regions or assign a distinct canonical URL.`,
      };
    }
    return mapping;
  });
}

export function buildGeoOpportunities(params: {
  markets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  geoKeywords: KeywordIntelligenceRecord[];
  urlMappings: GeoUrlMappingRecord[];
}): GeoOpportunityRecommendation[] {
  const measByLoc = new Map(
    params.measurements.map((m) => [`${m.granularity}::${m.locationKey}`, m]),
  );
  const countryMeasByCode = new Map(
    params.measurements
      .filter((m) => m.granularity === 'country')
      .map((m) => [m.countryCode, m]),
  );
  const mapByMarketId = new Map(params.urlMappings.map((m) => [m.marketId, m]));

  const opportunities: GeoOpportunityRecommendation[] = [];

  for (const market of params.markets) {
    if (market.approvalStatus === 'rejected') continue;
    const locKey = buildGeoLocationKey({
      countryCode: market.countryCode,
      stateRegion: market.stateRegion,
      city: market.city,
    });
    const exactMeas = measByLoc.get(`${market.granularity}::${locKey}`);
    const countryMeas = countryMeasByCode.get(market.countryCode);
    const mapping = mapByMarketId.get(market.id);
    const locLabel = formatGeoLocationLabel({
      countryCode: market.countryCode,
      countryName: market.countryName,
      stateRegion: market.stateRegion,
      city: market.city,
    });

    const relatedKws = params.geoKeywords.filter((k) => {
      if (k.targetCountry.toUpperCase() !== market.countryCode.toUpperCase()) return false;
      if (market.city) {
        return (
          k.targetCity.toLowerCase() === market.city.toLowerCase() ||
          normalizeKeywordText(k.keyword).includes(market.city.toLowerCase())
        );
      }
      if (market.stateRegion) {
        return normalizeKeywordText(k.keyword).includes(market.stateRegion.toLowerCase());
      }
      return true;
    });

    const evidence: string[] = [];
    const missingInfo: string[] = [];
    const sources: string[] = [];

    if (exactMeas?.gscImpressions !== null && exactMeas?.gscImpressions !== undefined) {
      evidence.push(
        `GSC country traffic: ${exactMeas.gscClicks ?? 0} clicks, ${exactMeas.gscImpressions.toLocaleString()} impressions, avg pos ${exactMeas.gscAvgPosition?.toFixed(1) ?? 'N/A'}.`,
      );
      sources.push('Google Search Console (country dimension)');
    } else if (market.granularity === 'country') {
      missingInfo.push('Google Search Console country-level impressions/clicks unavailable (connect & sync GSC).');
    } else {
      missingInfo.push(
        `City/state-level GSC impressions are unavailable for ${locLabel}${
          countryMeas?.gscImpressions !== null && countryMeas?.gscImpressions !== undefined
            ? ` (parent country ${market.countryCode} has ${countryMeas.gscImpressions.toLocaleString()} impressions).`
            : '.'
        }`,
      );
    }

    const trendVal = exactMeas?.relativeTrendIndex ?? countryMeas?.relativeTrendIndex ?? null;
    if (trendVal !== null) {
      evidence.push(
        `Google Trends relative interest: ${trendVal}/100 (${exactMeas?.trendDirection ?? countryMeas?.trendDirection ?? 'stable'}) in ${market.countryCode}.`,
      );
      sources.push('Google Trends (relative 0–100)');
    } else {
      missingInfo.push('Google Trends regional relative interest unavailable or rate-limited.');
    }

    if (relatedKws.length > 0) {
      evidence.push(`${relatedKws.length} localized/geo-scoped keyword target(s) tracked for this market.`);
      sources.push('Keyword Intelligence Engine');
    } else {
      missingInfo.push('No geo-scoped keywords researched for this specific location yet.');
    }

    if (exactMeas?.trackedRankPosition !== null && exactMeas?.trackedRankPosition !== undefined) {
      evidence.push(`Localized SERP rank avg: #${exactMeas.trackedRankPosition.toFixed(1)}.`);
      sources.push(exactMeas.trackedRankProvider || 'Geo Rank Tracker');
    } else {
      missingInfo.push('Localized city/region SERP rank tracking provider not connected.');
    }

    if (exactMeas?.gbpLocationsCount === null || exactMeas?.gbpLocationsCount === undefined) {
      if (market.granularity === 'city') {
        missingInfo.push('Google Business Profile connector not authorized for local pack insights.');
      }
    }

    const hasMissingUrl = mapping?.mappingStatus === 'recommend_new_page' || mapping?.mappingStatus === 'unmapped';
    const hasDuplicateOverlap = mapping?.mappingStatus === 'duplicate_overlap';

    if (hasMissingUrl) {
      evidence.push(
        `Landing page coverage gap: no crawled URL specifically targets ${locLabel}.`,
      );
      sources.push('Site Crawl Inventory');
    } else if (hasDuplicateOverlap) {
      evidence.push(
        `Duplicate/overlapping regional targeting detected across ${mapping?.competingUrls.length || 2} URLs.`,
      );
      sources.push('Site Crawl Inventory');
    } else if (mapping?.targetUrl) {
      evidence.push(`Existing URL mapped: ${mapping.targetUrl} (HTTP ${mapping.pageStatusCode ?? 200}).`);
      sources.push('Site Crawl Inventory');
    }

    // Score only when real measurable signals exist; otherwise honestly mark Needs Evidence with null score
    const hasHardSignal =
      (exactMeas?.gscImpressions ?? 0) > 0 ||
      trendVal !== null ||
      relatedKws.length > 0 ||
      hasDuplicateOverlap;

    let score: number | null = null;
    if (hasHardSignal) {
      let computed = market.priority === 'primary' ? 42 : market.priority === 'secondary' ? 34 : 26;
      if ((exactMeas?.gscImpressions ?? 0) >= 500) computed += 22;
      else if ((exactMeas?.gscImpressions ?? 0) > 0) computed += 14;
      if ((exactMeas?.gscAvgPosition ?? 99) >= 4 && (exactMeas?.gscAvgPosition ?? 99) <= 20) computed += 12;
      if (trendVal !== null) computed += Math.round(trendVal * 0.14);
      if (relatedKws.length > 0) computed += Math.min(16, relatedKws.length * 4);
      if (hasMissingUrl || hasDuplicateOverlap) computed += 10;
      score = Math.min(100, computed);
    }

    const priorityTier: GeoOpportunityRecommendation['priorityTier'] =
      score === null
        ? 'Needs Evidence'
        : score >= 72
          ? 'High'
          : score >= 50
            ? 'Medium'
            : 'Low';

    const confidence: GeoOpportunityRecommendation['confidence'] =
      evidence.length >= 3 ? 'High' : evidence.length === 2 ? 'Medium' : 'Low';

    const headline = hasDuplicateOverlap
      ? `Resolve overlapping location URLs for ${locLabel}`
      : hasMissingUrl && market.approvalStatus === 'approved'
        ? `Build unique local landing page for ${locLabel}`
        : (exactMeas?.gscAvgPosition ?? 99) > 5 && (exactMeas?.gscAvgPosition ?? 99) <= 20
          ? `Improve CTR & regional page relevance in ${locLabel} (avg pos ${exactMeas?.gscAvgPosition?.toFixed(1)})`
          : score === null
            ? `Collect geographic search evidence for ${locLabel}`
            : `Expand localized keyword coverage for ${locLabel}`;

    const recommendedNextAction = hasDuplicateOverlap
      ? mapping?.resolutionRecommendation || 'Consolidate overlapping regional landing pages.'
      : market.approvalStatus !== 'approved'
        ? 'Review & approve target market service area with Business/Agency Owner before creating pages.'
        : hasMissingUrl
          ? `Approve localized page plan (${mapping?.recommendedSlug || '/location'}) with unique regional proof and run Geo Keyword Discovery.`
          : missingInfo.length >= 3
            ? 'Connect Google Search Console or run Geographic Discovery to collect regional evidence.'
            : 'Optimize mapped landing page H1, local schema, and internal links using top geo keywords.';

    opportunities.push({
      id: `geoopp-${market.id}`,
      marketId: market.id,
      locationLabel: locLabel,
      granularity: market.granularity,
      countryCode: market.countryCode,
      stateRegion: market.stateRegion,
      city: market.city,
      priorityTier,
      score,
      confidence,
      headline,
      explanation:
        evidence[0] ??
        `Configured as ${market.priority} market (${market.approvalStatus}), awaiting live regional data.`,
      supportingEvidence: evidence,
      sourceSummary: sources.length > 0 ? Array.from(new Set(sources)).join(' + ') : 'Target Market Config Only',
      coverageDescription: `${market.granularity === 'country' ? 'Country' : market.granularity === 'state_region' ? 'State / Region' : 'City'} scope · ${
        mapping?.targetUrl ? `Mapped to ${mapping.targetUrl}` : 'No mapped URL yet'
      }`,
      missingInfo,
      recommendedNextAction,
      blockedByMissingData: score === null,
    });
  }

  return opportunities.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export function buildGeoComparisonRows(params: {
  markets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  geoKeywords: KeywordIntelligenceRecord[];
  urlMappings: GeoUrlMappingRecord[];
}): GeoMarketComparisonRow[] {
  const measByLoc = new Map(
    params.measurements.map((m) => [`${m.granularity}::${m.locationKey}`, m]),
  );
  const countryMeas = new Map(
    params.measurements
      .filter((m) => m.granularity === 'country')
      .map((m) => [m.countryCode, m]),
  );
  const mapByMarket = new Map(params.urlMappings.map((m) => [m.marketId, m]));

  return params.markets.map((mkt) => {
    const locKey = buildGeoLocationKey({
      countryCode: mkt.countryCode,
      stateRegion: mkt.stateRegion,
      city: mkt.city,
    });
    const exact = measByLoc.get(`${mkt.granularity}::${locKey}`);
    const countryFallback = countryMeas.get(mkt.countryCode);
    const mapping = mapByMarket.get(mkt.id);

    const kws = params.geoKeywords.filter((k) => {
      if (k.targetCountry.toUpperCase() !== mkt.countryCode.toUpperCase()) return false;
      if (mkt.city) {
        return (
          k.targetCity.toLowerCase() === mkt.city.toLowerCase() ||
          normalizeKeywordText(k.keyword).includes(mkt.city.toLowerCase())
        );
      }
      return true;
    });

    const isCountry = mkt.granularity === 'country';
    const hasExactGsc = isCountry && exact?.gscImpressions !== null && exact?.gscImpressions !== undefined;

    const trendScore = exact?.relativeTrendIndex ?? countryFallback?.relativeTrendIndex ?? null;
    const trendDir = exact?.trendDirection && exact.trendDirection !== 'unavailable'
      ? exact.trendDirection
      : countryFallback?.trendDirection ?? 'unavailable';

    return {
      marketId: mkt.id,
      locationLabel: formatGeoLocationLabel({
        countryCode: mkt.countryCode,
        countryName: mkt.countryName,
        stateRegion: mkt.stateRegion,
        city: mkt.city,
      }),
      granularity: mkt.granularity,
      countryCode: mkt.countryCode,
      stateRegion: mkt.stateRegion,
      city: mkt.city,
      priority: mkt.priority,
      approvalStatus: mkt.approvalStatus,
      gscDimension: {
        status: hasExactGsc ? 'measured' : 'unavailable',
        clicks: hasExactGsc ? exact!.gscClicks : null,
        impressions: hasExactGsc ? exact!.gscImpressions : null,
        ctr: hasExactGsc ? exact!.gscCtr : null,
        avgPosition: hasExactGsc ? exact!.gscAvgPosition : null,
        scopeNote: isCountry
          ? hasExactGsc
            ? 'GSC country-level observed site traffic'
            : 'No GSC country traffic synced'
          : 'GSC API only reports country granularity (city/state unavailable)',
      },
      trendsDimension: {
        status: trendScore !== null ? 'relative_interest' : 'unavailable',
        relativeIndex: trendScore,
        direction: trendDir,
        scopeNote:
          trendScore !== null
            ? mkt.granularity === 'country'
              ? 'Google Trends 0–100 relative index (country)'
              : `Country-level (${mkt.countryCode}) Google Trends 0–100 index (not local volume)`
            : 'Google Trends unavailable or rate-limited',
      },
      rankTrackerDimension: {
        status: exact?.trackedRankPosition !== null && exact?.trackedRankPosition !== undefined
          ? 'measured'
          : 'unavailable',
        avgRank: exact?.trackedRankPosition ?? null,
        scopeNote: exact?.trackedRankProvider
          ? `Provider: ${exact.trackedRankProvider}`
          : 'Geo Rank Tracker credentials not configured',
      },
      gbpDimension: {
        status: exact?.gbpLocationsCount !== null && exact?.gbpLocationsCount !== undefined
          ? 'measured'
          : 'unavailable',
        profilesMatched: exact?.gbpLocationsCount ?? null,
        scopeNote: exact?.gbpVisibilityNote || 'Google Business Profile not connected',
      },
      urlCoverage: {
        mappedCount: mapping?.mappingStatus === 'mapped_existing' ? 1 : 0,
        missingPageCount:
          mapping?.mappingStatus === 'recommend_new_page' || mapping?.mappingStatus === 'unmapped'
            ? 1
            : 0,
        overlapWarningCount: mapping?.mappingStatus === 'duplicate_overlap' ? 1 : 0,
      },
      geoKeywordCount: kws.length,
    };
  });
}

export function buildMapCountryFeatures(params: {
  markets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  geoKeywords: KeywordIntelligenceRecord[];
  urlMappings: GeoUrlMappingRecord[];
}): GeoMapRegionFeature[] {
  const countryMarkets = params.markets.filter((m) => m.granularity === 'country');
  const marketByIso = new Map(countryMarkets.map((m) => [m.isoNumeric, m]));
  const measByIso = new Map(
    params.measurements
      .filter((m) => m.granularity === 'country' && m.isoNumeric)
      .map((m) => [m.isoNumeric, m]),
  );

  // Include every country in our catalog + any additional GSC measured countries
  const seenIso = new Set<string>();
  const features: GeoMapRegionFeature[] = [];

  for (const cat of GEO_COUNTRY_CATALOG) {
    seenIso.add(cat.isoNumeric);
    const matchingMarkets = params.markets.filter(
      (m) => m.isoNumeric === cat.isoNumeric || m.countryCode === cat.alpha2,
    );
    const mkt =
      marketByIso.get(cat.isoNumeric) ??
      matchingMarkets.find((m) => m.approvalStatus === 'approved' && m.priority === 'primary') ??
      matchingMarkets.find((m) => m.approvalStatus === 'approved') ??
      matchingMarkets[0];
    const meas = measByIso.get(cat.isoNumeric);
    const kwsCount = params.geoKeywords.filter(
      (k) => k.targetCountry.toUpperCase() === cat.alpha2,
    ).length;
    const countryMappings = params.urlMappings.filter(
      (m) => m.countryCode.toUpperCase() === cat.alpha2,
    );
    const mappedCount = countryMappings.filter((m) => m.mappingStatus === 'mapped_existing').length;
    const missingCount = countryMappings.filter(
      (m) => m.mappingStatus === 'recommend_new_page' || m.mappingStatus === 'unmapped',
    ).length;

    const hasGsc = meas?.gscImpressions !== null && meas?.gscImpressions !== undefined;
    const hasTrend = meas?.relativeTrendIndex !== null && meas?.relativeTrendIndex !== undefined;

    features.push({
      isoNumeric: cat.isoNumeric,
      countryCode: cat.alpha2,
      countryName: cat.name,
      isConfiguredTarget: Boolean(mkt),
      targetPriority: mkt?.priority ?? null,
      approvalStatus: mkt?.approvalStatus ?? null,
      gscClicks: hasGsc ? meas!.gscClicks : null,
      gscImpressions: hasGsc ? meas!.gscImpressions : null,
      gscCtr: hasGsc ? meas!.gscCtr : null,
      gscAvgPosition: hasGsc ? meas!.gscAvgPosition : null,
      relativeTrendIndex: hasTrend ? meas!.relativeTrendIndex : null,
      geoKeywordCount: kwsCount,
      mappedUrlsCount: mappedCount,
      missingPageGapsCount: missingCount,
      hasMeasuredGscData: hasGsc,
      hasRelativeTrendData: hasTrend,
      dataAvailabilityLabel: hasGsc
        ? 'Measured (GSC Country)'
        : hasTrend
          ? 'Relative Interest (Trends)'
          : mkt
            ? 'Target Configured · Metrics Unavailable'
            : 'Unavailable',
    });
  }

  return features;
}
