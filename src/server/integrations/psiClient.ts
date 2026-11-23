import type { PageSpeedCheckResult } from '../../types/integrations';
import type { PerformanceStrategy } from '../../types/performance';
import { getPageSpeedApiKey, isSandboxCrawlAllowed } from '../env';
import { SANDBOX_HOST, validateOutboundUrl } from '../audit/security';
import {
  parsePageSpeedResponse,
  type ParsedPageSpeedPayload,
  type RawPageSpeedApiResponse,
} from '../performance/diagnosticsEngine';

const MAX_PSI_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB safety limit
const PSI_TIMEOUT_MS = 28_000;

export type PsiFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function buildPageSpeedRequestUrl(params: {
  targetUrl: string;
  strategy: PerformanceStrategy;
  apiKey?: string | null;
}): string {
  const endpoint = new URL(
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
  );
  endpoint.searchParams.set('url', params.targetUrl);
  endpoint.searchParams.set('strategy', params.strategy);
  endpoint.searchParams.append('category', 'performance');
  endpoint.searchParams.append('category', 'seo');
  endpoint.searchParams.append('category', 'accessibility');
  endpoint.searchParams.append('category', 'best-practices');

  if (params.apiKey && params.apiKey.trim()) {
    endpoint.searchParams.set('key', params.apiKey.trim());
  }
  return endpoint.toString();
}

function redactSecret(text: string, apiKey: string | null): string {
  let cleaned = text.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  if (apiKey && apiKey.length >= 6) {
    cleaned = cleaned.split(apiKey).join('[REDACTED]');
  }
  return cleaned;
}

export async function fetchFullPageSpeedAudit(params: {
  url: string;
  strategy: PerformanceStrategy;
  fetcher?: PsiFetcher;
  apiKeyOverride?: string | null;
}): Promise<{
  parsed: ParsedPageSpeedPayload;
  sanitizedSnapshotJson: string;
}> {
  // Always enforce SSRF rules BEFORE any network or injected fetcher call
  const validated = await validateOutboundUrl(params.url, {
    allowSandboxHost: false,
  });

  if (validated.url.hostname === SANDBOX_HOST && !isSandboxCrawlAllowed()) {
    throw new Error(
      'BAD_REQUEST: Sandbox domains cannot be queried via PageSpeed Insights.',
    );
  }

  const apiKey =
    params.apiKeyOverride !== undefined
      ? params.apiKeyOverride
      : getPageSpeedApiKey();

  const endpointUrl = buildPageSpeedRequestUrl({
    targetUrl: validated.url.toString(),
    strategy: params.strategy,
    apiKey,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
  const activeFetcher: PsiFetcher = params.fetcher ?? ((u, i) => fetch(u, i));

  try {
    const res = await activeFetcher(endpointUrl, { signal: controller.signal });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new Error(
          'QUOTA_EXCEEDED: Google PageSpeed Insights public API quota exceeded (HTTP 429). Configure PAGESPEED_API_KEY in server environment variables or retry shortly.',
        );
      }
      if (res.status === 400 || res.status === 403) {
        const sanitized = redactSecret(errBody.slice(0, 220), apiKey);
        throw new Error(
          `PAGESPEED_API_ERROR (${res.status}): ${sanitized || 'Invalid URL or API key rejected by Google PageSpeed Insights.'}`,
        );
      }
      throw new Error(
        `PAGESPEED_API_ERROR (${res.status}): ${redactSecret(errBody.slice(0, 220), apiKey)}`,
      );
    }

    const rawText = await res.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_PSI_RESPONSE_BYTES) {
      throw new Error(
        'PAGESPEED_API_ERROR: PageSpeed Insights payload exceeded 5 MB safety threshold.',
      );
    }

    let rawJson: RawPageSpeedApiResponse;
    try {
      rawJson = JSON.parse(rawText) as RawPageSpeedApiResponse;
    } catch {
      throw new Error(
        'PAGESPEED_API_ERROR: Malformed JSON returned by PageSpeed Insights.',
      );
    }

    if (!rawJson.lighthouseResult) {
      throw new Error(
        'PAGESPEED_API_ERROR: Response did not include lighthouseResult data.',
      );
    }

    const parsed = parsePageSpeedResponse(rawJson, {
      url: validated.url.toString(),
      strategy: params.strategy,
    });

    // Store compact sanitized snapshot (never store API key)
    const compactSnapshot = {
      id: rawJson.id ?? parsed.url,
      strategy: params.strategy,
      collectedAt: parsed.collectedAt,
      lab: parsed.lab,
      field: parsed.field,
      resources: parsed.resources,
      usability: parsed.usability,
      diagnostics: parsed.diagnostics,
    };

    return {
      parsed,
      sanitizedSnapshotJson: JSON.stringify(compactSnapshot, null, 2),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runLivePageSpeedCheck(params: {
  url: string;
  strategy: 'mobile' | 'desktop';
  fetcher?: PsiFetcher;
}): Promise<PageSpeedCheckResult> {
  const { parsed } = await fetchFullPageSpeedAudit({
    url: params.url,
    strategy: params.strategy,
    fetcher: params.fetcher,
  });

  const fmtMs = (ms: number | null) =>
    ms === null ? null : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;

  return {
    url: parsed.url,
    strategy: parsed.strategy,
    fetchedAt: parsed.collectedAt,
    performanceScore: parsed.lab.performanceScore,
    seoScore: parsed.lab.seoScore,
    accessibilityScore: parsed.lab.accessibilityScore,
    bestPracticesScore: parsed.lab.bestPracticesScore,
    metrics: {
      lcp: fmtMs(parsed.lab.lcpMs),
      cls: parsed.lab.clsScore !== null ? parsed.lab.clsScore.toFixed(3) : null,
      inp:
        parsed.field.inp.percentileP75 !== null
          ? `${parsed.field.inp.percentileP75} ms`
          : null,
      fcp: fmtMs(parsed.lab.fcpMs),
      ttfb: fmtMs(parsed.lab.ttfbMs),
    },
    source: 'Google PageSpeed Insights v5 (Live API)',
  };
}
