import crypto from 'node:crypto';
import type {
  CompetitorPageSnapshot,
  CompetitorProviderStatus,
} from '../../types/competitors';
import {
  listGeoTargetMarkets,
  listKeywordIntelligenceRecords,
  listPerformanceAuditRuns,
  listProjectCrawledContentDetailed,
  getKeywordBusinessProfile,
} from '../audit/db';
import { isSandboxCrawlAllowed } from '../env';
import { SecurityBlockedError, validateOutboundUrl } from '../audit/security';
import {
  discoverInternalLinksFromHtml,
  extractHtmlPageSignals,
  normalizeCompetitorDomain,
} from './competitorEngine';

export interface LiveCompetitorFetchResult {
  status: CompetitorProviderStatus;
  pages: CompetitorPageSnapshot[];
  errors: string[];
}

export async function analyzeCompetitorUrlsLive(params: {
  tenantId: string;
  projectId: string;
  competitorId: string;
  homepageUrl: string;
  extraUrls?: string[];
  discoverInternalPages?: boolean;
  maxPages?: number;
}): Promise<LiveCompetitorFetchResult> {
  const now = new Date().toISOString();
  const maxPages = Math.min(Math.max(params.maxPages ?? 4, 1), 6);
  const seedUrls = Array.from(
    new Set(
      [params.homepageUrl, ...(params.extraUrls ?? [])]
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  ).slice(0, maxPages);

  const allowSandbox = isSandboxCrawlAllowed();
  const pages: CompetitorPageSnapshot[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  const queue = [...seedUrls];

  while (queue.length > 0 && pages.length < maxPages) {
    const rawUrl = queue.shift()!;
    const cleanTarget = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    if (visited.has(cleanTarget)) continue;
    visited.add(cleanTarget);

    try {
      const validated = await validateOutboundUrl(cleanTarget, {
        allowSandboxHost: allowSandbox,
      });
      if (validated.isSandboxFixture) {
        errors.push(`Sandbox URL skipped for external competitor fetch (${rawUrl}).`);
        continue;
      }

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(validated.url.toString(), {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'RovixSEOIntelligence/1.0 (+competitor-audit)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        const responseTimeMs = Math.max(1, Date.now() - started);

        if (res.status >= 300 && res.status < 400) {
          errors.push(`Redirect skipped for safety on ${validated.url.toString()}.`);
          continue;
        }
        if (!res.ok) {
          errors.push(`${validated.url.toString()} returned HTTP ${res.status}.`);
          continue;
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
          errors.push(`${validated.url.toString()} returned non-HTML (${contentType || 'unknown'}).`);
          continue;
        }

        const html = (await res.text()).slice(0, 1_500_000);
        const extracted = extractHtmlPageSignals({
          html,
          url: validated.url.toString(),
          statusCode: res.status,
          contentType: contentType.split(';')[0] || 'text/html',
          responseTimeMs,
          collectedAt: now,
        });

        pages.push({
          id: `cpg-${crypto.createHash('sha1').update(`${params.competitorId}:${extracted.normalizedUrl}`).digest('hex').slice(0, 12)}`,
          tenantId: params.tenantId,
          projectId: params.projectId,
          competitorId: params.competitorId,
          ...extracted,
        });

        // Optionally queue top internal service/guide links discovered on homepage
        if (params.discoverInternalPages !== false && pages.length === 1) {
          const innerLinks = discoverInternalLinksFromHtml(
            html,
            validated.url.toString(),
            maxPages - 1,
          );
          for (const link of innerLinks) {
            if (!visited.has(link) && queue.length < maxPages * 2) {
              queue.push(link);
            }
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof SecurityBlockedError) {
        errors.push(`SSRF Blocked (${rawUrl}): ${err.message}`);
      } else {
        const msg = err instanceof Error ? err.message : 'Request failed';
        errors.push(`Fetch failed (${rawUrl}): ${msg.slice(0, 100)}`);
      }
    }
  }

  return {
    status: {
      provider: 'competitor_html_analyzer',
      label: 'Live SSRF-Guarded Competitor HTML Analyzer',
      state: pages.length > 0 ? 'available' : errors.some((e) => e.includes('SSRF Blocked')) ? 'blocked' : 'error',
      configured: true,
      lastCheckedAt: now,
      detail:
        pages.length > 0
          ? `Analyzed ${pages.length} live competitor page(s)${errors.length > 0 ? ` (${errors.join('; ')})` : ''}.`
          : errors.join('; ') || 'No analyzable HTML pages retrieved.',
      itemsReturned: pages.length,
    },
    pages,
    errors,
  };
}

export interface SerpDiscoveryCandidate {
  domain: string;
  homepageUrl: string;
  matchedQuery: string;
  sampleUrl: string;
  position: number;
  source: string;
}

export async function discoverCompetitorsViaSerpApi(params: {
  queries: string[];
  excludeDomain: string;
  countryCode?: string;
}): Promise<{
  status: CompetitorProviderStatus;
  candidates: SerpDiscoveryCandidate[];
}> {
  const now = new Date().toISOString();
  const serpApiKey = process.env.SERPAPI_API_KEY?.trim();

  if (!serpApiKey) {
    return {
      status: {
        provider: 'serp_rank_api',
        label: 'External SERP Domain Discovery (SerpApi / DataForSEO)',
        state: 'credentials_required',
        configured: false,
        lastCheckedAt: now,
        detail:
          'No external SERP API key configured (SERPAPI_API_KEY). Automated SERP competitor discovery and rival SERP positions are marked Unavailable (never simulated).',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const cleanQueries = params.queries.map((q) => q.trim()).filter(Boolean).slice(0, 3);
  if (cleanQueries.length === 0) {
    return {
      status: {
        provider: 'serp_rank_api',
        label: 'External SERP Domain Discovery (SerpApi / DataForSEO)',
        state: 'unavailable',
        configured: true,
        lastCheckedAt: now,
        detail: 'No target keyword queries provided for SERP discovery.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const ownDomain = params.excludeDomain.toLowerCase().replace(/^www\./, '');
  const candidates: SerpDiscoveryCandidate[] = [];
  const seenDomains = new Set<string>();
  const gl = (params.countryCode || 'us').toLowerCase().slice(0, 2);

  for (const query of cleanQueries) {
    try {
      const endpoint = new URL('https://serpapi.com/search.json');
      endpoint.searchParams.set('engine', 'google');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('gl', gl);
      endpoint.searchParams.set('num', '10');
      endpoint.searchParams.set('api_key', serpApiKey);

      const res = await fetch(endpoint.toString());
      if (!res.ok) continue;
      const json = (await res.json()) as {
        organic_results?: { position?: number; link?: string; title?: string }[];
      };
      for (const item of json.organic_results ?? []) {
        if (!item.link) continue;
        try {
          const norm = normalizeCompetitorDomain(item.link);
          if (norm.domain === ownDomain || seenDomains.has(norm.domain)) continue;
          seenDomains.add(norm.domain);
          candidates.push({
            domain: norm.domain,
            homepageUrl: norm.homepageUrl,
            matchedQuery: query,
            sampleUrl: item.link,
            position: Number(item.position ?? 0),
            source: 'SerpApi Google Organic',
          });
        } catch {
          // ignore malformed URL
        }
      }
    } catch {
      // ignore transient query failure
    }
  }

  return {
    status: {
      provider: 'serp_rank_api',
      label: 'External SERP Domain Discovery (SerpApi / DataForSEO)',
      state: candidates.length > 0 ? 'connected' : 'unavailable',
      configured: true,
      lastCheckedAt: now,
      detail:
        candidates.length > 0
          ? `Discovered ${candidates.length} competing domain(s) across live Google organic results.`
          : 'SerpApi responded with 0 eligible external domains.',
      itemsReturned: candidates.length,
    },
    candidates,
  };
}

export function getCompetitorWorkspaceProviderStatuses(
  tenantId: string,
  projectId: string,
): CompetitorProviderStatus[] {
  const now = new Date().toISOString();
  const crawlPages = listProjectCrawledContentDetailed(tenantId, projectId, 10);
  const kwProfile = getKeywordBusinessProfile(tenantId, projectId);
  const keywords = listKeywordIntelligenceRecords(tenantId, projectId);
  const geoMarkets = listGeoTargetMarkets(tenantId, projectId).filter(
    (m) => m.approvalStatus === 'approved',
  );
  const perfRuns = listPerformanceAuditRuns(tenantId, projectId);
  const serpConfigured = Boolean(
    process.env.SERPAPI_API_KEY?.trim() || process.env.DATAFORSEO_LOGIN?.trim(),
  );
  const backlinksConfigured = Boolean(
    process.env.AHREFS_API_TOKEN?.trim() || process.env.MOZ_API_TOKEN?.trim(),
  );

  return [
    {
      provider: 'competitor_html_analyzer',
      label: 'SSRF-Guarded Competitor HTML Analyzer',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail:
        'Live HTTP HTML analysis extracting competitor titles, H1/headings, word counts, and JSON-LD schema types safely.',
      itemsReturned: 0,
    },
    {
      provider: 'site_crawl_baseline',
      label: 'Phase 3 Site Crawl Baseline',
      state: crawlPages.length > 0 ? 'available' : 'unavailable',
      configured: crawlPages.length > 0,
      lastCheckedAt: now,
      detail:
        crawlPages.length > 0
          ? 'Completed crawl inventory connected for genuine project-vs-competitor URL and schema comparison.'
          : 'No completed crawl found. Run Technical SEO Audit to enable own-site comparison scoring.',
      itemsReturned: crawlPages.length,
    },
    {
      provider: 'keyword_intelligence',
      label: 'Phase 7 Keyword & Business Profile',
      state:
        kwProfile.approvalStatus === 'approved' || keywords.length > 0
          ? 'available'
          : 'unavailable',
      configured: kwProfile.approvalStatus === 'approved',
      lastCheckedAt: now,
      detail:
        keywords.length > 0
          ? `${keywords.length} project keywords available for overlap & gap evaluation.`
          : 'Approve your business niche & services in Keyword Lab to ground competitor gap relevance.',
      itemsReturned: keywords.length,
    },
    {
      provider: 'geographic_markets',
      label: 'Phase 8 Approved Target Markets',
      state: geoMarkets.length > 0 ? 'available' : 'unavailable',
      configured: geoMarkets.length > 0,
      lastCheckedAt: now,
      detail:
        geoMarkets.length > 0
          ? `${geoMarkets.length} owner-approved target territory/territories synced.`
          : 'No owner-approved geographic markets configured yet.',
      itemsReturned: geoMarkets.length,
    },
    {
      provider: 'performance_telemetry',
      label: 'Phase 6 Core Web Vitals & Speed',
      state: perfRuns.length > 0 ? 'available' : 'unavailable',
      configured: perfRuns.length > 0,
      lastCheckedAt: now,
      detail:
        perfRuns.length > 0
          ? 'Project mobile/desktop speed baseline available in comparison matrix.'
          : 'Run Speed & Vitals audit to include project performance scores.',
      itemsReturned: perfRuns.length,
    },
    {
      provider: 'serp_rank_api',
      label: 'External SERP API (Discovery & Rival Positions)',
      state: serpConfigured ? 'connected' : 'credentials_required',
      configured: serpConfigured,
      lastCheckedAt: now,
      detail: serpConfigured
        ? 'External SERP API key configured for automated competitor ranking & domain discovery.'
        : 'SERPAPI_API_KEY / DATAFORSEO_LOGIN not configured. Rival SERP positions marked Unavailable.',
      itemsReturned: 0,
    },
    {
      provider: 'domain_authority_backlinks',
      label: 'Third-Party Domain Authority, Backlinks & Traffic',
      state: backlinksConfigured ? 'connected' : 'credentials_required',
      configured: backlinksConfigured,
      lastCheckedAt: now,
      detail: backlinksConfigured
        ? 'External backlink & domain authority connector active.'
        : 'No backlink/traffic API key configured (AHREFS_API_TOKEN / MOZ_API_TOKEN). Domain rating, backlinks, and estimated traffic remain Unavailable (never fabricated).',
      itemsReturned: 0,
    },
  ];
}
