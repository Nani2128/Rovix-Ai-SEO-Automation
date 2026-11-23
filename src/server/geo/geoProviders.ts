import crypto from 'node:crypto';
import type {
  GeoMeasurementRecord,
  GeoProviderStatus,
} from '../../types/geographic';
import { getAuditDb, listLatestCrawledPagesForProject, listOAuthIntegrations } from '../audit/db';
import { getValidGoogleAccessToken } from '../integrations/googleOAuth';
import { resolveCountryEntry } from './geoCatalog';
import { buildGeoLocationKey } from './geoEngine';

function isoDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

export async function fetchGscCountryAnalytics(params: {
  tenantId: string;
  projectId: string;
  days?: number;
}): Promise<{
  status: GeoProviderStatus;
  measurements: GeoMeasurementRecord[];
}> {
  const now = new Date().toISOString();
  const integrations = listOAuthIntegrations(params.tenantId, params.projectId);
  const gscConn = integrations.find((i) => i.provider === 'gsc');

  if (!gscConn || gscConn.status !== 'Connected' || !gscConn.propertyId) {
    return {
      status: {
        provider: 'gsc_country',
        label: 'Google Search Console (Country Dimension)',
        state: 'not_connected',
        configured: false,
        granularitySupported: ['country'],
        metricNature: 'observed_site_traffic',
        lastCheckedAt: now,
        detail:
          'GSC OAuth property not connected for this project. Country clicks/impressions marked Unavailable (never simulated).',
        itemsReturned: 0,
      },
      measurements: [],
    };
  }

  try {
    const accessToken = await getValidGoogleAccessToken({
      tenantId: params.tenantId,
      projectId: params.projectId,
      provider: 'gsc',
    });

    const lookback = params.days ?? 30;
    const startDate = isoDateDaysAgo(lookback);
    const endDate = isoDateDaysAgo(1);
    const encodedSite = encodeURIComponent(gscConn.propertyId);
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchanalytics/query`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['country'],
        rowLimit: 50,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        status: {
          provider: 'gsc_country',
          label: 'Google Search Console (Country Dimension)',
          state: res.status === 429 ? 'rate_limited' : 'error',
          configured: true,
          granularitySupported: ['country'],
          metricNature: 'observed_site_traffic',
          lastCheckedAt: now,
          detail: `GSC country dimension request failed (HTTP ${res.status}): ${body.slice(0, 140)}`,
          itemsReturned: 0,
        },
        measurements: [],
      };
    }

    const json = (await res.json()) as {
      rows?: {
        keys?: string[];
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
      }[];
    };

    const measurements: GeoMeasurementRecord[] = [];
    for (const row of json.rows ?? []) {
      const rawCountry = String(row.keys?.[0] ?? '').trim();
      if (!rawCountry) continue;
      const catalog = resolveCountryEntry(rawCountry);
      const cc = catalog?.alpha2 || rawCountry.toUpperCase().slice(0, 2);
      const countryName = catalog?.name || rawCountry.toUpperCase();
      const locKey = buildGeoLocationKey({ countryCode: cc });

      measurements.push({
        id: `geomeas-${crypto.createHash('sha1').update(`${params.projectId}:country:${locKey}`).digest('hex').slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        marketId: null,
        granularity: 'country',
        locationKey: locKey,
        locationLabel: countryName,
        countryCode: cc,
        countryName,
        isoNumeric: catalog?.isoNumeric ?? '',
        stateRegion: '',
        city: '',
        latitude: catalog?.latitude ?? null,
        longitude: catalog?.longitude ?? null,
        gscClicks: Math.round(Number(row.clicks ?? 0)),
        gscImpressions: Math.round(Number(row.impressions ?? 0)),
        gscCtr: Number(row.ctr ?? 0),
        gscAvgPosition: Number(row.position ?? 0),
        gscGranularityNote:
          'Google Search Console Search Analytics API (dimensions: ["country"]). Country-level observed site traffic only.',
        relativeTrendIndex: null,
        trendDirection: 'unavailable',
        trendsNote: 'Trends 0–100 relative index stored separately when fetched.',
        gbpLocationsCount: null,
        gbpVisibilityNote: 'Google Business Profile not connected.',
        trackedRankPosition: null,
        trackedRankProvider: null,
        rankTrackingNote: 'No localized third-party rank tracker configured.',
        provenance: {
          source: `Google Search Console (${gscConn.propertyName || gscConn.propertyId})`,
          collectedAt: now,
          reportingPeriod: `${startDate} to ${endDate}`,
          measurementStatus: 'measured',
          granularity: 'country',
          methodology:
            'Direct Search Analytics query grouped strictly by country dimension.',
          limitations:
            'GSC does not report state/region or city breakdowns; values represent country totals only.',
        },
        collectedAt: now,
      });
    }

    return {
      status: {
        provider: 'gsc_country',
        label: 'Google Search Console (Country Dimension)',
        state: 'connected',
        configured: true,
        granularitySupported: ['country'],
        metricNature: 'observed_site_traffic',
        lastCheckedAt: now,
        detail: `Synced live country search performance across ${measurements.length} country/countries (${startDate} – ${endDate}).`,
        itemsReturned: measurements.length,
      },
      measurements,
    };
  } catch (err) {
    return {
      status: {
        provider: 'gsc_country',
        label: 'Google Search Console (Country Dimension)',
        state: 'error',
        configured: true,
        granularitySupported: ['country'],
        metricNature: 'observed_site_traffic',
        lastCheckedAt: now,
        detail: `GSC country sync failed: ${
          err instanceof Error ? err.message.slice(0, 140) : 'OAuth error'
        }. Zero fake data substituted.`,
        itemsReturned: 0,
      },
      measurements: [],
    };
  }
}

export async function fetchGoogleTrendsGeoInterest(params: {
  keyword: string;
  countryCode: string;
}): Promise<{
  status: GeoProviderStatus;
  subregions: { name: string; relativeInterest: number }[];
  countryRelativeIndex: number | null;
}> {
  const now = new Date().toISOString();
  const cleanKw = params.keyword.trim();
  const geo = (resolveCountryEntry(params.countryCode)?.alpha2 || params.countryCode || 'US')
    .toUpperCase()
    .slice(0, 2);

  if (!cleanKw) {
    return {
      status: {
        provider: 'google_trends_geo',
        label: 'Google Trends Geographic Interest (0–100)',
        state: 'unavailable',
        configured: true,
        granularitySupported: ['country', 'state_region'],
        metricNature: 'relative_interest_0_100',
        lastCheckedAt: now,
        detail: 'No topic query provided for Google Trends geographic breakdown.',
        itemsReturned: 0,
      },
      subregions: [],
      countryRelativeIndex: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const reqObj = {
      comparisonItem: [{ keyword: cleanKw, geo, time: 'today 3-m' }],
      category: 0,
      property: '',
    };
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(
      JSON.stringify(reqObj),
    )}`;
    const exploreRes = await fetch(exploreUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RovixSEOIntelligence/1.0)',
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (exploreRes.status === 429) {
      return {
        status: {
          provider: 'google_trends_geo',
          label: 'Google Trends Geographic Interest (0–100)',
          state: 'rate_limited',
          configured: true,
          granularitySupported: ['country', 'state_region'],
          metricNature: 'relative_interest_0_100',
          lastCheckedAt: now,
          detail:
            'Google Trends returned HTTP 429 rate-limit. Regional interest marked Unavailable (never fabricated).',
          itemsReturned: 0,
        },
        subregions: [],
        countryRelativeIndex: null,
      };
    }

    if (!exploreRes.ok) {
      return {
        status: {
          provider: 'google_trends_geo',
          label: 'Google Trends Geographic Interest (0–100)',
          state: 'blocked',
          configured: true,
          granularitySupported: ['country', 'state_region'],
          metricNature: 'relative_interest_0_100',
          lastCheckedAt: now,
          detail: `Google Trends responded HTTP ${exploreRes.status}. Relative interest marked Unavailable.`,
          itemsReturned: 0,
        },
        subregions: [],
        countryRelativeIndex: null,
      };
    }

    const rawExplore = (await exploreRes.text()).replace(/^\)\]\}'\s*,?\s*/, '');
    const exploreJson = JSON.parse(rawExplore) as {
      widgets?: { id?: string; token?: string; request?: unknown }[];
    };
    const geoWidget = exploreJson.widgets?.find((w) => w.id === 'GEO_MAP');
    if (!geoWidget?.token || !geoWidget?.request) {
      return {
        status: {
          provider: 'google_trends_geo',
          label: 'Google Trends Geographic Interest (0–100)',
          state: 'unavailable',
          configured: true,
          granularitySupported: ['country', 'state_region'],
          metricNature: 'relative_interest_0_100',
          lastCheckedAt: now,
          detail:
            'Google Trends did not return a GEO_MAP widget token (low threshold or CAPTCHA). Marked Unavailable.',
          itemsReturned: 0,
        },
        subregions: [],
        countryRelativeIndex: null,
      };
    }

    const geoUrl = `https://trends.google.com/trends/api/widgetdata/comparedgeo?hl=en-US&tz=0&req=${encodeURIComponent(
      JSON.stringify(geoWidget.request),
    )}&token=${encodeURIComponent(geoWidget.token)}`;
    const geoRes = await fetch(geoUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RovixSEOIntelligence/1.0)',
      },
    });
    if (!geoRes.ok) {
      return {
        status: {
          provider: 'google_trends_geo',
          label: 'Google Trends Geographic Interest (0–100)',
          state: geoRes.status === 429 ? 'rate_limited' : 'unavailable',
          configured: true,
          granularitySupported: ['country', 'state_region'],
          metricNature: 'relative_interest_0_100',
          lastCheckedAt: now,
          detail: `Google Trends regional widget failed (${geoRes.status}). Marked Unavailable.`,
          itemsReturned: 0,
        },
        subregions: [],
        countryRelativeIndex: null,
      };
    }

    const geoText = (await geoRes.text()).replace(/^\)\]\}'\s*,?\s*/, '');
    const geoJson = JSON.parse(geoText) as {
      default?: {
        geoMapData?: { geoName?: string; value?: number[]; hasData?: boolean[] }[];
      };
    };

    const items = (geoJson.default?.geoMapData ?? [])
      .filter((d) => d.geoName && d.hasData?.[0] !== false && Array.isArray(d.value))
      .map((d) => ({
        name: String(d.geoName),
        relativeInterest: Math.max(0, Math.min(100, Math.round(Number(d.value?.[0] ?? 0)))),
      }))
      .filter((d) => d.relativeInterest > 0)
      .slice(0, 12);

    const avg =
      items.length > 0
        ? Math.round(items.reduce((s, i) => s + i.relativeInterest, 0) / items.length)
        : null;

    return {
      status: {
        provider: 'google_trends_geo',
        label: 'Google Trends Geographic Interest (0–100)',
        state: items.length > 0 ? 'available' : 'unavailable',
        configured: true,
        granularitySupported: ['country', 'state_region'],
        metricNature: 'relative_interest_0_100',
        lastCheckedAt: now,
        detail:
          items.length > 0
            ? `Fetched relative 0–100 regional interest (not absolute volume) across ${items.length} region(s) in ${geo}.`
            : `No measurable regional trend distribution returned for "${cleanKw}" in ${geo}.`,
        itemsReturned: items.length,
      },
      subregions: items,
      countryRelativeIndex: avg,
    };
  } catch {
    return {
      status: {
        provider: 'google_trends_geo',
        label: 'Google Trends Geographic Interest (0–100)',
        state: 'unavailable',
        configured: true,
        granularitySupported: ['country', 'state_region'],
        metricNature: 'relative_interest_0_100',
        lastCheckedAt: now,
        detail:
          'Google Trends endpoint unreachable or blocked in sandbox environment. Regional interest marked Unavailable.',
        itemsReturned: 0,
      },
      subregions: [],
      countryRelativeIndex: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getGoogleBusinessProfileStatus(
  tenantId: string,
  projectId: string,
): GeoProviderStatus {
  const now = new Date().toISOString();
  const db = getAuditDb();
  const gbpRow = db
    .prepare(
      "SELECT status, scopes_json FROM oauth_integrations WHERE tenant_id = ? AND project_id = ? AND provider = 'gbp'",
    )
    .get(tenantId, projectId) as { status?: string; scopes_json?: string } | undefined;

  const hasEnvClient = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  if (gbpRow?.status === 'Connected') {
    return {
      provider: 'google_business_profile',
      label: 'Google Business Profile (Local Pack)',
      state: 'connected',
      configured: true,
      granularitySupported: ['city'],
      metricNature: 'gbp_local_pack',
      lastCheckedAt: now,
      detail: 'Google Business Profile OAuth active for verified business locations.',
      itemsReturned: 0,
    };
  }

  return {
    provider: 'google_business_profile',
    label: 'Google Business Profile (Local Pack)',
    state: hasEnvClient ? 'not_connected' : 'credentials_required',
    configured: false,
    granularitySupported: ['city'],
    metricNature: 'gbp_local_pack',
    lastCheckedAt: now,
    detail:
      'Google Business Profile API not connected. Map pack views, calls, and GBP NAP verification are honestly marked Unavailable.',
    itemsReturned: 0,
  };
}

export function getGeoRankTrackerProviderStatus(): GeoProviderStatus {
  const now = new Date().toISOString();
  const hasSerpApi = Boolean(process.env.SERPAPI_API_KEY?.trim());
  const hasDataForSeo = Boolean(
    process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim(),
  );

  if (!hasSerpApi && !hasDataForSeo) {
    return {
      provider: 'geo_rank_tracker',
      label: 'Localized SERP Rank Tracker (City / Region)',
      state: 'credentials_required',
      configured: false,
      granularitySupported: ['country', 'state_region', 'city'],
      metricNature: 'localized_rank_serp',
      lastCheckedAt: now,
      detail:
        'No localized SERP rank tracking API key configured (SERPAPI_API_KEY or DATAFORSEO_LOGIN). City/state SERP positions are marked Unavailable.',
      itemsReturned: 0,
    };
  }

  return {
    provider: 'geo_rank_tracker',
    label: 'Localized SERP Rank Tracker (City / Region)',
    state: 'available',
    configured: true,
    granularitySupported: ['country', 'state_region', 'city'],
    metricNature: 'localized_rank_serp',
    lastCheckedAt: now,
    detail: hasSerpApi
      ? 'SerpApi localized location-parameter SERP tracking configured.'
      : 'DataForSEO localized location SERP tracking configured.',
    itemsReturned: 0,
  };
}

export function getBaselineGeoProviderStatuses(
  tenantId: string,
  projectId: string,
): GeoProviderStatus[] {
  const now = new Date().toISOString();
  const integrations = listOAuthIntegrations(tenantId, projectId);
  const gscConn = integrations.find((i) => i.provider === 'gsc');
  const crawlPages = listLatestCrawledPagesForProject(tenantId, projectId, 5);

  return [
    {
      provider: 'gsc_country',
      label: 'Google Search Console (Country Dimension)',
      state:
        gscConn?.status === 'Connected' && gscConn.propertyId
          ? 'connected'
          : 'not_connected',
      configured: Boolean(gscConn?.status === 'Connected' && gscConn.propertyId),
      granularitySupported: ['country'],
      metricNature: 'observed_site_traffic',
      lastCheckedAt: now,
      detail:
        gscConn?.status === 'Connected' && gscConn.propertyId
          ? `Connected to ${gscConn.propertyName || gscConn.propertyId}. Ready to sync country-level clicks, impressions, CTR, and position.`
          : 'Connect Google Search Console in Integrations to import country-level traffic metrics.',
      itemsReturned: 0,
    },
    {
      provider: 'google_trends_geo',
      label: 'Google Trends Geographic Interest (0–100)',
      state: 'available',
      configured: true,
      granularitySupported: ['country', 'state_region'],
      metricNature: 'relative_interest_0_100',
      lastCheckedAt: now,
      detail:
        'Measures relative 0–100 search interest index (never absolute monthly volume) on demand.',
      itemsReturned: 0,
    },
    getGoogleBusinessProfileStatus(tenantId, projectId),
    getGeoRankTrackerProviderStatus(),
    {
      provider: 'crawl_inventory',
      label: 'Site Crawl Location URL Inventory',
      state: crawlPages.length > 0 ? 'available' : 'unavailable',
      configured: crawlPages.length > 0,
      granularitySupported: ['country', 'state_region', 'city'],
      metricNature: 'onsite_url_inventory',
      lastCheckedAt: now,
      detail:
        crawlPages.length > 0
          ? 'Live crawled URL inventory available for location-to-URL mapping and overlap checks.'
          : 'No completed technical crawl found. Run a Technical SEO Audit crawl to map regional landing pages.',
      itemsReturned: crawlPages.length,
    },
    {
      provider: 'autocomplete_geo',
      label: 'Localized Search Autocomplete (hl / gl)',
      state: 'available',
      configured: true,
      granularitySupported: ['country', 'city'],
      metricNature: 'localized_suggestions',
      lastCheckedAt: now,
      detail: 'Collects locale-scoped autocomplete suggestions using Google gl & hl market parameters.',
      itemsReturned: 0,
    },
  ];
}

export function buildGeoModifiedSeeds(params: {
  baseSeeds: string[];
  countryName: string;
  stateRegion?: string;
  city?: string;
}): string[] {
  const cleanSeeds = params.baseSeeds.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const locationModifier =
    params.city?.trim() || params.stateRegion?.trim() || params.countryName.trim();
  if (!locationModifier) return cleanSeeds;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const seed of cleanSeeds) {
    const candidates = [
      seed,
      `${seed} ${locationModifier}`,
      `${seed} in ${locationModifier}`,
    ];
    for (const c of candidates) {
      const norm = c.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(c);
      }
    }
  }
  return out.slice(0, 5);
}
