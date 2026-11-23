import { GoogleGenAI, Type } from '@google/genai';
import * as cheerio from 'cheerio';
import type {
  KeywordIntent,
  KeywordProviderId,
  KeywordSourceType,
  ProviderAvailabilityStatus,
} from '../../types/keywords';
import { getGscTopQueries, listLatestCrawledPagesForProject } from '../audit/db';
import { SecurityBlockedError, validateOutboundUrl } from '../audit/security';
import { isSandboxCrawlAllowed } from '../env';
import { normalizeKeywordText } from './intelligenceEngine';

export interface ProviderKeywordCandidate {
  keyword: string;
  sourceProvider: KeywordProviderId;
  sourceType: KeywordSourceType;
  measurementKind:
    | 'observed_site_traffic'
    | 'market_search_volume'
    | 'relative_trend_index'
    | 'search_suggestion'
    | 'onsite_page_extraction'
    | 'competitor_page_topic'
    | 'ai_semantic_expansion';
  sourceUrl: string | null;
  summary: string;
  rawMetricValue: string | null;
  geographyScope: string;
  isAiSuggestion: boolean;
  gscClicks?: number | null;
  gscImpressions?: number | null;
  gscCtr?: number | null;
  gscAvgPosition?: number | null;
  gscObservedUrl?: string | null;
  relativeTrendIndex?: number | null;
  trendDirection?: 'rising' | 'stable' | 'declining' | 'unavailable';
  marketSearchVolume?: number | null;
  competitionLevel?: 'low' | 'medium' | 'high' | 'unavailable';
  cpcEstimate?: number | null;
}

export interface ProviderBatchResult {
  status: ProviderAvailabilityStatus;
  candidates: ProviderKeywordCandidate[];
}

export function fetchGscKeywordSignals(
  tenantId: string,
  projectId: string,
): ProviderBatchResult {
  const now = new Date().toISOString();
  const rows = getGscTopQueries(tenantId, projectId, 40);
  if (rows.length === 0) {
    return {
      status: {
        provider: 'gsc',
        label: 'Google Search Console',
        state: 'not_connected',
        configured: false,
        lastCheckedAt: now,
        detail:
          'No synced GSC queries stored for this project. Connect GSC in Integrations to import real search queries (clicks, impressions, avg position).',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const candidates: ProviderKeywordCandidate[] = rows.map((r) => ({
    keyword: r.query,
    sourceProvider: 'gsc',
    sourceType: 'gsc_query',
    measurementKind: 'observed_site_traffic',
    sourceUrl: r.page,
    summary: `Observed in GSC: ${r.clicks} clicks, ${r.impressions} impressions, CTR ${(r.ctr * 100).toFixed(1)}%, avg pos ${r.avgPosition.toFixed(1)} (site performance only, not total market volume).`,
    rawMetricValue: `${r.impressions} impr / pos ${r.avgPosition.toFixed(1)}`,
    geographyScope: 'site_observed',
    isAiSuggestion: false,
    gscClicks: r.clicks,
    gscImpressions: r.impressions,
    gscCtr: r.ctr,
    gscAvgPosition: r.avgPosition,
    gscObservedUrl: r.page,
  }));

  return {
    status: {
      provider: 'gsc',
      label: 'Google Search Console',
      state: 'connected',
      configured: true,
      lastCheckedAt: now,
      detail: `Imported ${candidates.length} observed queries from synced Search Console data.`,
      itemsReturned: candidates.length,
    },
    candidates,
  };
}

export function fetchCrawlContentKeywordCandidates(
  tenantId: string,
  projectId: string,
): ProviderBatchResult {
  const now = new Date().toISOString();
  const pages = listLatestCrawledPagesForProject(tenantId, projectId, 80);
  if (pages.length === 0) {
    return {
      status: {
        provider: 'crawl',
        label: 'Site Crawl Topic Extractor',
        state: 'unavailable',
        configured: false,
        lastCheckedAt: now,
        detail:
          'No completed site crawl found. Run a Technical SEO Audit crawl to extract real page titles, H1/H2 headings, and URL topics.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const seen = new Set<string>();
  const candidates: ProviderKeywordCandidate[] = [];

  for (const page of pages) {
    if (page.statusCode >= 400) continue;
    const rawPhrases = [
      page.h1 ?? '',
      ...(page.title ? page.title.split(/[|\-–—:]/) : []),
      ...(page.headings ?? []).slice(0, 3),
    ];

    for (const phrase of rawPhrases) {
      const cleaned = phrase.replace(/\s+/g, ' ').trim();
      const words = cleaned.split(' ').filter(Boolean);
      if (words.length < 2 || words.length > 7) continue;
      const norm = normalizeKeywordText(cleaned);
      if (norm.length < 6 || seen.has(norm)) continue;
      seen.add(norm);

      candidates.push({
        keyword: cleaned.toLowerCase(),
        sourceProvider: 'crawl',
        sourceType: 'crawl_content',
        measurementKind: 'onsite_page_extraction',
        sourceUrl: page.url,
        summary: `Extracted from live crawled page (${page.statusCode}) metadata/heading on ${page.url}.`,
        rawMetricValue: `HTTP ${page.statusCode}`,
        geographyScope: 'site_observed',
        isAiSuggestion: false,
      });
      if (candidates.length >= 25) break;
    }
    if (candidates.length >= 25) break;
  }

  return {
    status: {
      provider: 'crawl',
      label: 'Site Crawl Topic Extractor',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail: `Analyzed ${pages.length} crawled pages and extracted ${candidates.length} on-site keyword topics.`,
      itemsReturned: candidates.length,
    },
    candidates,
  };
}

export async function fetchSearchSuggestions(params: {
  seeds: string[];
  countryCode: string;
  languageCode: string;
}): Promise<ProviderBatchResult> {
  const now = new Date().toISOString();
  const seeds = params.seeds.map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (seeds.length === 0) {
    return {
      status: {
        provider: 'autocomplete',
        label: 'Search Autocomplete Suggestions',
        state: 'unavailable',
        configured: true,
        lastCheckedAt: now,
        detail: 'No seed terms supplied for autocomplete expansion.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const gl = (params.countryCode || 'US').toLowerCase().slice(0, 2);
  const hl = (params.languageCode || 'en').toLowerCase().slice(0, 2);
  const seen = new Set<string>();
  const candidates: ProviderKeywordCandidate[] = [];
  let failureCount = 0;

  for (const seed of seeds) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(
        seed,
      )}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'RovixSEOIntelligence/1.0',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        failureCount += 1;
        continue;
      }
      const data = (await res.json()) as unknown[];
      const suggestions = Array.isArray(data[1]) ? data[1] : [];
      for (const item of suggestions) {
        const kw = String(item ?? '').trim();
        const norm = normalizeKeywordText(kw);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        candidates.push({
          keyword: kw,
          sourceProvider: 'autocomplete',
          sourceType: 'search_autocomplete',
          measurementKind: 'search_suggestion',
          sourceUrl: null,
          summary: `Live Google search autocomplete suggestion for seed "${seed}" (locale ${hl}-${gl.toUpperCase()}). Search volume not provided by autocomplete.`,
          rawMetricValue: `Seed: "${seed}"`,
          geographyScope: `country:${gl.toUpperCase()}`,
          isAiSuggestion: false,
        });
      }
    } catch {
      failureCount += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  if (candidates.length === 0 && failureCount > 0) {
    return {
      status: {
        provider: 'autocomplete',
        label: 'Search Autocomplete Suggestions',
        state: 'error',
        configured: true,
        lastCheckedAt: now,
        detail:
          'Unable to reach Google Autocomplete endpoint within timeout (network or rate-limit). No suggestions synthesized.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  return {
    status: {
      provider: 'autocomplete',
      label: 'Search Autocomplete Suggestions',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail: `Collected ${candidates.length} live autocomplete queries across ${seeds.length} seed term(s).`,
      itemsReturned: candidates.length,
    },
    candidates,
  };
}

export async function fetchGoogleTrendsInterest(params: {
  terms: string[];
  countryCode: string;
}): Promise<{
  status: ProviderAvailabilityStatus;
  signals: Map<
    string,
    {
      relativeTrendIndex: number;
      trendDirection: 'rising' | 'stable' | 'declining';
      geographyScope: string;
    }
  >;
}> {
  const now = new Date().toISOString();
  const signals = new Map<
    string,
    {
      relativeTrendIndex: number;
      trendDirection: 'rising' | 'stable' | 'declining';
      geographyScope: string;
    }
  >();

  const terms = params.terms.map((t) => t.trim()).filter(Boolean).slice(0, 5);
  if (terms.length === 0) {
    return {
      status: {
        provider: 'google_trends',
        label: 'Google Trends (Relative 0-100)',
        state: 'unavailable',
        configured: true,
        lastCheckedAt: now,
        detail: 'No terms queued for trend inspection.',
        itemsReturned: 0,
      },
      signals,
    };
  }

  const geo = (params.countryCode || 'US').toUpperCase().slice(0, 2);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const reqObj = {
      comparisonItem: terms.map((keyword) => ({
        keyword,
        geo,
        time: 'today 3-m',
      })),
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
          provider: 'google_trends',
          label: 'Google Trends (Relative 0-100)',
          state: 'rate_limited',
          configured: true,
          lastCheckedAt: now,
          detail:
            'Google Trends returned HTTP 429 rate-limit. Trend index marked Unavailable (never simulated).',
          itemsReturned: 0,
        },
        signals,
      };
    }

    if (!exploreRes.ok) {
      return {
        status: {
          provider: 'google_trends',
          label: 'Google Trends (Relative 0-100)',
          state: 'blocked',
          configured: true,
          lastCheckedAt: now,
          detail: `Google Trends responded HTTP ${exploreRes.status}. Trend metrics left Unavailable.`,
          itemsReturned: 0,
        },
        signals,
      };
    }

    const rawText = await exploreRes.text();
    const cleaned = rawText.replace(/^\)\]\}'\s*,?\s*/, '');
    const exploreJson = JSON.parse(cleaned) as {
      widgets?: { id?: string; token?: string; request?: unknown }[];
    };
    const timelineWidget = exploreJson.widgets?.find((w) => w.id === 'TIMESERIES');
    if (!timelineWidget?.token || !timelineWidget?.request) {
      return {
        status: {
          provider: 'google_trends',
          label: 'Google Trends (Relative 0-100)',
          state: 'unavailable',
          configured: true,
          lastCheckedAt: now,
          detail:
            'Google Trends did not return a timeseries widget token (likely CAPTCHA or low search threshold). Marked Unavailable.',
          itemsReturned: 0,
        },
        signals,
      };
    }

    const multilineUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(
      JSON.stringify(timelineWidget.request),
    )}&token=${encodeURIComponent(timelineWidget.token)}`;
    const dataRes = await fetch(multilineUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RovixSEOIntelligence/1.0)',
      },
    });
    if (!dataRes.ok) {
      return {
        status: {
          provider: 'google_trends',
          label: 'Google Trends (Relative 0-100)',
          state: dataRes.status === 429 ? 'rate_limited' : 'unavailable',
          configured: true,
          lastCheckedAt: now,
          detail: `Google Trends widget request failed (${dataRes.status}). Relative interest left Unavailable.`,
          itemsReturned: 0,
        },
        signals,
      };
    }

    const dataText = (await dataRes.text()).replace(/^\)\]\}'\s*,?\s*/, '');
    const dataJson = JSON.parse(dataText) as {
      default?: { timelineData?: { value?: number[] }[] };
    };
    const timeline = dataJson.default?.timelineData ?? [];
    if (timeline.length === 0) {
      return {
        status: {
          provider: 'google_trends',
          label: 'Google Trends (Relative 0-100)',
          state: 'unavailable',
          configured: true,
          lastCheckedAt: now,
          detail: 'Google Trends returned empty timeseries points for these queries.',
          itemsReturned: 0,
        },
        signals,
      };
    }

    terms.forEach((term, idx) => {
      const series = timeline
        .map((pt) => Number(pt.value?.[idx] ?? 0))
        .filter((n) => !Number.isNaN(n));
      if (series.length === 0) return;
      const latestWindow = series.slice(-4);
      const earlierWindow = series.slice(0, Math.max(1, series.length - 4));
      const latestAvg =
        latestWindow.reduce((a, b) => a + b, 0) / latestWindow.length;
      const earlierAvg =
        earlierWindow.reduce((a, b) => a + b, 0) / earlierWindow.length;

      const relativeIndex = Math.max(0, Math.min(100, Math.round(latestAvg)));
      const trendDirection: 'rising' | 'stable' | 'declining' =
        latestAvg - earlierAvg >= 8
          ? 'rising'
          : earlierAvg - latestAvg >= 8
            ? 'declining'
            : 'stable';

      signals.set(normalizeKeywordText(term), {
        relativeTrendIndex: relativeIndex,
        trendDirection,
        geographyScope: `country:${geo}`,
      });
    });

    return {
      status: {
        provider: 'google_trends',
        label: 'Google Trends (Relative 0-100)',
        state: 'available',
        configured: true,
        lastCheckedAt: now,
        detail: `Fetched relative 0–100 interest (not absolute search volume) for ${signals.size} term(s) in ${geo}.`,
        itemsReturned: signals.size,
      },
      signals,
    };
  } catch {
    return {
      status: {
        provider: 'google_trends',
        label: 'Google Trends (Relative 0-100)',
        state: 'unavailable',
        configured: true,
        lastCheckedAt: now,
        detail:
          'Google Trends endpoint unreachable or blocked in current network environment. Trend index kept Unavailable (zero fake values).',
        itemsReturned: 0,
      },
      signals,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGoogleAdsKeywordPlannerStatus(): Promise<ProviderAvailabilityStatus> {
  const now = new Date().toISOString();
  const hasToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const hasCustomerId = Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID?.trim());

  if (!hasToken || !hasCustomerId) {
    return {
      provider: 'google_ads_planner',
      label: 'Google Ads Keyword Planner',
      state: 'credentials_required',
      configured: false,
      lastCheckedAt: now,
      detail:
        'Missing GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID. Monthly market search volumes & CPC are honestly marked "Unavailable".',
      itemsReturned: 0,
    };
  }

  return {
    provider: 'google_ads_planner',
    label: 'Google Ads Keyword Planner',
    state: 'credentials_required',
    configured: false,
    lastCheckedAt: now,
    detail:
      'Google Ads Keyword Planner requires an active authorized Google Ads account grant; monthly volume marked "Unavailable".',
    itemsReturned: 0,
  };
}

export async function fetchCompetitorPageTopics(params: {
  competitorUrls: string[];
}): Promise<ProviderBatchResult> {
  const now = new Date().toISOString();
  const urls = params.competitorUrls.map((u) => u.trim()).filter(Boolean).slice(0, 3);
  if (urls.length === 0) {
    return {
      status: {
        provider: 'competitor_fetch',
        label: 'Competitor Page Analyzer',
        state: 'unavailable',
        configured: true,
        lastCheckedAt: now,
        detail: 'No competitor URLs provided for topic comparison.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  const allowSandbox = isSandboxCrawlAllowed();
  const candidates: ProviderKeywordCandidate[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const rawUrl of urls) {
    try {
      const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const validated = await validateOutboundUrl(normalized, {
        allowSandboxHost: allowSandbox,
      });
      if (validated.isSandboxFixture) {
        errors.push(`Sandbox URL skipped for external competitor comparison (${rawUrl}).`);
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(validated.url.toString(), {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'RovixSEOIntelligence/1.0',
            Accept: 'text/html',
          },
        });
        if (res.status >= 300 && res.status < 400) {
          errors.push(`Redirect skipped for safety on ${rawUrl}.`);
          continue;
        }
        if (!res.ok) {
          errors.push(`${rawUrl} returned HTTP ${res.status}.`);
          continue;
        }
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          errors.push(`${rawUrl} returned non-HTML content.`);
          continue;
        }
        const html = (await res.text()).slice(0, 1_500_000);
        const $ = cheerio.load(html);
        const rawTopics: string[] = [
          $('title').first().text(),
          $('h1').first().text(),
          ...$('h2')
            .slice(0, 6)
            .map((_, el) => $(el).text())
            .get(),
        ];

        for (const t of rawTopics) {
          const cleaned = t.replace(/\s+/g, ' ').trim();
          const words = cleaned.split(' ').filter(Boolean);
          if (words.length < 2 || words.length > 7) continue;
          const norm = normalizeKeywordText(cleaned);
          if (seen.has(norm)) continue;
          seen.add(norm);

          candidates.push({
            keyword: cleaned.toLowerCase(),
            sourceProvider: 'competitor_fetch',
            sourceType: 'competitor_page',
            measurementKind: 'competitor_page_topic',
            sourceUrl: validated.url.toString(),
            summary: `Extracted live topic heading from competitor URL ${validated.url.hostname}.`,
            rawMetricValue: `HTTP ${res.status}`,
            geographyScope: 'external_page',
            isAiSuggestion: false,
          });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof SecurityBlockedError) {
        errors.push(`SSRF Blocked (${rawUrl}): ${err.message}`);
      } else {
        errors.push(`Fetch failed (${rawUrl})`);
      }
    }
  }

  return {
    status: {
      provider: 'competitor_fetch',
      label: 'Competitor Page Analyzer',
      state: candidates.length > 0 ? 'available' : errors.length > 0 ? 'blocked' : 'unavailable',
      configured: true,
      lastCheckedAt: now,
      detail:
        candidates.length > 0
          ? `Extracted ${candidates.length} competitor topic phrases${errors.length > 0 ? ` (${errors.join('; ')})` : ''}.`
          : errors.join('; ') || 'No extractable heading topics returned.',
      itemsReturned: candidates.length,
    },
    candidates,
  };
}

export async function fetchGeminiKeywordExpansions(params: {
  niche: string;
  services: string[];
  seeds: string[];
  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  intentFocus: KeywordIntent | 'all';
}): Promise<ProviderBatchResult> {
  const now = new Date().toISOString();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: {
        provider: 'gemini_ai',
        label: 'AI Semantic Expansion (Optional)',
        state: 'credentials_required',
        configured: false,
        lastCheckedAt: now,
        detail:
          'GEMINI_API_KEY not configured. Relying strictly on real observed GSC, crawl, and autocomplete evidence.',
        itemsReturned: 0,
      },
      candidates: [],
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = [
      `Generate 8 realistic SEO keyword expansion ideas strictly aligned to this business:`,
      `Niche: ${params.niche || 'SEO & Digital Services'}`,
      `Approved services: ${params.services.join(', ') || 'General'}`,
      `Seed terms: ${params.seeds.join(', ')}`,
      `Market: Country=${params.targetCountry}, City=${params.targetCity || 'Nationwide'}, Language=${params.targetLanguage}`,
      `Intent focus: ${params.intentFocus}`,
      `Rules: Never invent search volumes, CPC, or rankings. Return concise search queries only.`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
                required: ['keyword', 'rationale'],
              },
            },
          },
          required: ['suggestions'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      suggestions?: { keyword?: string; rationale?: string }[];
    };
    const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const seen = new Set<string>();
    const candidates: ProviderKeywordCandidate[] = [];

    for (const item of list.slice(0, 10)) {
      const kw = String(item.keyword ?? '').trim();
      const norm = normalizeKeywordText(kw);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      candidates.push({
        keyword: kw,
        sourceProvider: 'gemini_ai',
        sourceType: 'ai_expansion',
        measurementKind: 'ai_semantic_expansion',
        sourceUrl: null,
        summary: `AI Semantic Suggestion (unverified demand): ${String(
          item.rationale ?? 'Semantic variation of approved seed.',
        ).slice(0, 180)}`,
        rawMetricValue: 'AI Suggestion (volume unverified)',
        geographyScope: `country:${params.targetCountry}`,
        isAiSuggestion: true,
      });
    }

    return {
      status: {
        provider: 'gemini_ai',
        label: 'AI Semantic Expansion (Optional)',
        state: 'available',
        configured: true,
        lastCheckedAt: now,
        detail: `Generated ${candidates.length} semantic expansion ideas (explicitly flagged as AI Suggestions pending volume/GSC evidence).`,
        itemsReturned: candidates.length,
      },
      candidates,
    };
  } catch (err) {
    return {
      status: {
        provider: 'gemini_ai',
        label: 'AI Semantic Expansion (Optional)',
        state: 'error',
        configured: true,
        lastCheckedAt: now,
        detail: `Gemini expansion unavailable: ${
          err instanceof Error ? err.message.slice(0, 120) : 'Request failed'
        }. Continuing with non-AI evidence.`,
        itemsReturned: 0,
      },
      candidates: [],
    };
  }
}
