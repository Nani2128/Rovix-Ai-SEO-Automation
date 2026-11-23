import * as cheerio from 'cheerio';
import type {
  CrawlRunSummary,
  CrawlURLRecord,
  HreflangTag,
  RobotsAnalysisResult,
  SitemapAnalysisSummary,
} from '../../types/crawl';
import type {
  DetectionRuleDefinition,
  IssueCategory,
  IssueSeverity,
} from '../../types/technicalIssue';
import { normalizeCrawlUrl } from './security';

export const DETECTION_RULES: Record<string, DetectionRuleDefinition> = {
  'RULE-01-NOINDEX': {
    ruleId: 'RULE-01-NOINDEX',
    ruleName: 'Page Blocked by Noindex Directive',
    category: 'Indexability',
    severity: 'High',
    description: 'Meta robots or X-Robots-Tag header instructs search engines not to index this URL.',
    evidenceRequirements: 'Meta robots tag content or HTTP X-Robots-Tag header containing noindex.',
    confidence: 0.99,
    recommendedFix: 'Remove the noindex directive from pages intended to rank organically, or exclude them from XML sitemaps.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-01-SITEMAP-NOINDEX': {
    ruleId: 'RULE-01-SITEMAP-NOINDEX',
    ruleName: 'Noindex URL Listed in XML Sitemap',
    category: 'Indexability',
    severity: 'High',
    description: 'A URL declared inside the XML sitemap simultaneously sends a noindex signal.',
    evidenceRequirements: 'Sitemap <loc> match paired with meta/header noindex directive.',
    confidence: 0.98,
    recommendedFix: 'Remove non-indexable URLs from XML sitemaps so crawl budget aligns with canonical indexable pages.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-01-ROBOTS-BLOCKED': {
    ruleId: 'RULE-01-ROBOTS-BLOCKED',
    ruleName: 'URL Disallowed in robots.txt',
    category: 'Indexability',
    severity: 'Medium',
    description: 'Discovered internal or sitemap URL matches a Disallow rule in robots.txt.',
    evidenceRequirements: 'robots.txt rule snippet matching URL path.',
    confidence: 0.97,
    recommendedFix: 'Confirm whether crawling should remain blocked; if intended for search visibility, update robots.txt.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-02-CANONICAL-MISSING': {
    ruleId: 'RULE-02-CANONICAL-MISSING',
    ruleName: 'Missing Canonical Tag',
    category: 'Canonical',
    severity: 'Medium',
    description: 'Indexable HTML page does not specify a <link rel="canonical"> tag.',
    evidenceRequirements: 'HTML <head> inspection showing zero rel="canonical" link tags.',
    confidence: 0.95,
    recommendedFix: 'Add a self-referencing <link rel="canonical" href="..."> element in the document <head>.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-02-CANONICAL-CONFLICT': {
    ruleId: 'RULE-02-CANONICAL-CONFLICT',
    ruleName: 'Conflicting or Multiple Canonical Tags',
    category: 'Canonical',
    severity: 'Critical',
    description: 'Page emits multiple canonical link elements or points its canonical to an inconsistent URL/error page.',
    evidenceRequirements: 'Multiple canonical URLs extracted or canonical mismatch against final/sitemap URL.',
    confidence: 0.98,
    recommendedFix: 'Emit exactly one canonical link pointing to the authoritative indexable 200 OK URL.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-02-CANONICAL-ERROR': {
    ruleId: 'RULE-02-CANONICAL-ERROR',
    ruleName: 'Canonical Points to Error or Non-200 URL',
    category: 'Canonical',
    severity: 'Critical',
    description: 'Canonical URL resolves to a 4xx/5xx error or redirected destination.',
    evidenceRequirements: 'Canonical target URL paired with non-200 HTTP status.',
    confidence: 0.97,
    recommendedFix: 'Update canonical target to resolve cleanly to a 200 OK indexable destination.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-03-REDIRECT-CHAIN': {
    ruleId: 'RULE-03-REDIRECT-CHAIN',
    ruleName: 'Multi-Hop Redirect Chain',
    category: 'Redirects',
    severity: 'High',
    description: 'URL passes through 2 or more redirect hops before reaching its final destination.',
    evidenceRequirements: 'Recorded redirect hop sequence with HTTP 3xx status codes.',
    confidence: 0.99,
    recommendedFix: 'Collapse intermediate hops so internal links and redirects resolve directly to the final destination.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-03-REDIRECT-LOOP': {
    ruleId: 'RULE-03-REDIRECT-LOOP',
    ruleName: 'Redirect Loop Detected',
    category: 'Redirects',
    severity: 'Critical',
    description: 'Redirect sequence cycles back to a previously visited URL and cannot resolve.',
    evidenceRequirements: 'Hop cycle containing repeated URL.',
    confidence: 1.0,
    recommendedFix: 'Break the circular server/edge redirect rule immediately so the URL resolves cleanly.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-03-INTERNAL-REDIRECT': {
    ruleId: 'RULE-03-INTERNAL-REDIRECT',
    ruleName: 'Internal Links Point to Redirecting URLs',
    category: 'Internal linking',
    severity: 'Low',
    description: 'Pages link internally to URLs that respond with HTTP 301/302 instead of linking directly to the destination.',
    evidenceRequirements: 'Source page internal link matching a 3xx URL.',
    confidence: 0.94,
    recommendedFix: 'Update internal anchor hrefs to link directly to the canonical 200 OK destination.',
    responsibleRole: 'Editor',
    requiresDualApproval: false,
  },
  'RULE-04-BROKEN-4XX': {
    ruleId: 'RULE-04-BROKEN-4XX',
    ruleName: 'Broken Internal Page (HTTP 404/410)',
    category: 'Broken pages',
    severity: 'Critical',
    description: 'Crawled internal URL returned HTTP 404 or 410.',
    evidenceRequirements: 'HTTP status 404/410 and referring parent page URL.',
    confidence: 1.0,
    recommendedFix: 'Restore the missing resource, configure a relevant 301 redirect, or remove the broken internal link.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-04-SERVER-5XX': {
    ruleId: 'RULE-04-SERVER-5XX',
    ruleName: 'Server Error (HTTP 5xx)',
    category: 'Broken pages',
    severity: 'Critical',
    description: 'Origin returned an HTTP 5xx server error during crawl.',
    evidenceRequirements: 'HTTP status >= 500 response record.',
    confidence: 1.0,
    recommendedFix: 'Investigate application/server logs for failing route handlers or upstream timeouts.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-05-MISSING-TITLE': {
    ruleId: 'RULE-05-MISSING-TITLE',
    ruleName: 'Missing or Empty Title Tag',
    category: 'Metadata',
    severity: 'High',
    description: 'HTML document is missing a non-empty <title> element.',
    evidenceRequirements: 'HTML <head> inspection showing missing or empty <title>.',
    confidence: 0.99,
    recommendedFix: 'Add a unique, descriptive 30–60 character <title> summarizing primary page intent.',
    responsibleRole: 'SEO Strategist',
    requiresDualApproval: false,
  },
  'RULE-05-DUPLICATE-TITLE': {
    ruleId: 'RULE-05-DUPLICATE-TITLE',
    ruleName: 'Duplicate Title Tags Across URLs',
    category: 'Metadata',
    severity: 'Medium',
    description: 'Two or more distinct indexable URLs share an identical <title> tag.',
    evidenceRequirements: 'Identical normalized title text across >= 2 crawled URLs.',
    confidence: 0.96,
    recommendedFix: 'Differentiate page titles with unique topic modifiers to prevent keyword cannibalization.',
    responsibleRole: 'SEO Strategist',
    requiresDualApproval: false,
  },
  'RULE-05-MISSING-META-DESC': {
    ruleId: 'RULE-05-MISSING-META-DESC',
    ruleName: 'Missing Meta Description',
    category: 'Metadata',
    severity: 'Medium',
    description: 'HTML document lacks a <meta name="description"> element.',
    evidenceRequirements: 'HTML <head> inspection with no meta description content.',
    confidence: 0.98,
    recommendedFix: 'Author a concise 120–155 character meta description aligned with search intent.',
    responsibleRole: 'Editor',
    requiresDualApproval: false,
  },
  'RULE-05-TITLE-LENGTH': {
    ruleId: 'RULE-05-TITLE-LENGTH',
    ruleName: 'Title Length Outside Recommended Range',
    category: 'Metadata',
    severity: 'Low',
    description: 'Page title is shorter than 15 characters or exceeds 65 characters.',
    evidenceRequirements: 'Title character count and raw title string.',
    confidence: 0.92,
    recommendedFix: 'Refine title length to 30–60 characters so SERP snippets do not truncate prematurely.',
    responsibleRole: 'Editor',
    requiresDualApproval: false,
  },
  'RULE-06-MISSING-H1': {
    ruleId: 'RULE-06-MISSING-H1',
    ruleName: 'Missing Primary H1 Heading',
    category: 'Headings',
    severity: 'Medium',
    description: 'HTML page does not contain a primary <h1> heading.',
    evidenceRequirements: 'Heading DOM inspection with zero non-empty <h1> tags.',
    confidence: 0.97,
    recommendedFix: 'Add a single descriptive <h1> matching the primary topic of the page.',
    responsibleRole: 'Editor',
    requiresDualApproval: false,
  },
  'RULE-06-HEADING-HIERARCHY': {
    ruleId: 'RULE-06-HEADING-HIERARCHY',
    ruleName: 'Multiple H1s or Heading Hierarchy Skip',
    category: 'Headings',
    severity: 'Low',
    description: 'Page uses multiple H1 headings or skips heading levels (e.g. H1 directly to H3).',
    evidenceRequirements: 'Ordered heading outline showing skipped levels or duplicate H1s.',
    confidence: 0.91,
    recommendedFix: 'Maintain one <h1> and sequential nested heading levels (h2 -> h3).',
    responsibleRole: 'Editor',
    requiresDualApproval: false,
  },
  'RULE-07-INVALID-SCHEMA': {
    ruleId: 'RULE-07-INVALID-SCHEMA',
    ruleName: 'Invalid JSON-LD Structured Data',
    category: 'Schema',
    severity: 'High',
    description: 'A <script type="application/ld+json"> block failed JSON parsing or lacks @type/@context.',
    evidenceRequirements: 'Raw JSON-LD block snippet and parser error message.',
    confidence: 0.99,
    recommendedFix: 'Fix JSON syntax errors and ensure valid Schema.org @context and @type properties.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-08-HREFLANG-ERROR': {
    ruleId: 'RULE-08-HREFLANG-ERROR',
    ruleName: 'Hreflang Configuration or Return-Link Error',
    category: 'Hreflang',
    severity: 'High',
    description: 'Page contains invalid hreflang locale codes, missing reciprocal return links, or broken alternates.',
    evidenceRequirements: 'Extracted rel="alternate" hreflang tags and return-link / HTTP validation.',
    confidence: 0.95,
    recommendedFix: 'Use valid ISO 639-1/3166-1 hreflang codes and ensure bidirectional return tags across all alternate URLs.',
    responsibleRole: 'Developer',
    requiresDualApproval: true,
  },
  'RULE-09-STRUCTURE-HYGIENE': {
    ruleId: 'RULE-09-STRUCTURE-HYGIENE',
    ruleName: 'Missing Viewport, HTML Lang, or Image Alt Attributes',
    category: 'Page structure',
    severity: 'Low',
    description: 'Page omits mobile viewport meta, <html lang>, or includes images without alt attributes.',
    evidenceRequirements: 'DOM check for viewport meta, html[lang], and img elements missing alt.',
    confidence: 0.94,
    recommendedFix: 'Include <meta name="viewport">, declare <html lang="...">, and populate descriptive alt text.',
    responsibleRole: 'Developer',
    requiresDualApproval: false,
  },
  'RULE-09-ORPHAN-CANDIDATE': {
    ruleId: 'RULE-09-ORPHAN-CANDIDATE',
    ruleName: 'Sitemap-Only Orphan URL Candidate',
    category: 'Page structure',
    severity: 'Medium',
    description: 'URL is present in the XML sitemap but has zero incoming internal links discovered during crawl.',
    evidenceRequirements: 'Sitemap <loc> entry with 0 internal inbound links across crawled pages.',
    confidence: 0.9,
    recommendedFix: 'Link to valuable orphan pages from relevant hub/navigation templates or remove deprecated URLs from the sitemap.',
    responsibleRole: 'SEO Strategist',
    requiresDualApproval: false,
  },
  'RULE-10-LOW-INTERNAL-LINKS': {
    ruleId: 'RULE-10-LOW-INTERNAL-LINKS',
    ruleName: 'Pages with Few Incoming Internal Links',
    category: 'Internal linking',
    severity: 'Informational',
    description: 'Indexable 200 OK page receives fewer than 2 internal links from crawled pages.',
    evidenceRequirements: 'Inbound internal link count derived from crawl link graph.',
    confidence: 0.88,
    recommendedFix: 'Strengthen internal contextual links from high-authority hub pages.',
    responsibleRole: 'SEO Strategist',
    requiresDualApproval: false,
  },
};

export interface ExtractedHtmlSignals {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: { tag: string; text: string }[];
  canonicalLinks: string[];
  robotsDirectives: string[];
  schemaTypes: string[];
  schemaErrors: string[];
  hreflangTags: HreflangTag[];
  internalLinks: string[];
  externalLinks: string[];
  missingAltCount: number;
  hasViewport: boolean;
  htmlLang: string | null;
}

export function extractHtmlSignals(
  html: string,
  baseUrl: string,
  rootDomain: string,
): ExtractedHtmlSignals {
  const $ = cheerio.load(html);

  const rawTitle = $('head title').first().text().trim();
  const title = rawTitle.length > 0 ? rawTitle : null;

  const rawMetaDesc = $('meta[name="description" i]').first().attr('content')?.trim() ?? '';
  const metaDescription = rawMetaDesc.length > 0 ? rawMetaDesc : null;

  const headings: { tag: string; text: string }[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    headings.push({ tag, text });
  });
  const h1Node = headings.find((h) => h.tag === 'h1' && h.text.length > 0);
  const h1 = h1Node ? h1Node.text : null;

  const canonicalLinks: string[] = [];
  $('link[rel="canonical" i]').each((_i, el) => {
    const href = $(el).attr('href')?.trim();
    if (href) {
      const normalized = normalizeCrawlUrl(href, baseUrl) ?? href;
      canonicalLinks.push(normalized);
    }
  });

  const robotsDirectives: string[] = [];
  $('meta[name="robots" i], meta[name="googlebot" i]').each((_i, el) => {
    const content = $(el).attr('content');
    if (content) {
      for (const token of content.split(',')) {
        const clean = token.trim().toLowerCase();
        if (clean) robotsDirectives.push(clean);
      }
    }
  });

  const schemaTypes: string[] = [];
  const schemaErrors: string[] = [];
  $('script[type="application/ld+json" i]').each((idx, el) => {
    const rawJson = $(el).html()?.trim() ?? '';
    if (!rawJson) {
      schemaErrors.push(`JSON-LD block #${idx + 1} is empty.`);
      return;
    }
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown> | Record<string, unknown>[];
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const t = item['@type'];
        if (typeof t === 'string') {
          schemaTypes.push(t);
        } else if (Array.isArray(t)) {
          t.forEach((v) => {
            if (typeof v === 'string') schemaTypes.push(v);
          });
        } else if (!('@graph' in item)) {
          schemaErrors.push(`JSON-LD block #${idx + 1} is missing "@type".`);
        }
        if (!('@context' in item)) {
          schemaErrors.push(`JSON-LD block #${idx + 1} is missing "@context".`);
        }
      }
    } catch (err) {
      schemaErrors.push(
        `JSON-LD block #${idx + 1} syntax error: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      );
    }
  });

  // Microdata & RDFa detection
  $('[itemscope][itemtype]').each((_i, el) => {
    const typeUrl = $(el).attr('itemtype')?.trim();
    if (typeUrl) schemaTypes.push(`Microdata:${typeUrl.split('/').pop() ?? typeUrl}`);
  });
  $('[typeof]').each((_i, el) => {
    const t = $(el).attr('typeof')?.trim();
    if (t) schemaTypes.push(`RDFa:${t}`);
  });

  const hreflangTags: HreflangTag[] = [];
  $('link[rel="alternate" i][hreflang]').each((_i, el) => {
    const lang = $(el).attr('hreflang')?.trim() ?? '';
    const hrefRaw = $(el).attr('href')?.trim() ?? '';
    if (lang && hrefRaw) {
      const resolved = normalizeCrawlUrl(hrefRaw, baseUrl) ?? hrefRaw;
      hreflangTags.push({ lang, href: resolved });
    }
  });

  const internalLinksSet = new Set<string>();
  const externalLinksSet = new Set<string>();
  const cleanRoot = rootDomain.toLowerCase().replace(/^www\./, '');

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    const normalized = normalizeCrawlUrl(href, baseUrl);
    if (!normalized) return;
    try {
      const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
      if (host === cleanRoot || host.endsWith(`.${cleanRoot}`)) {
        internalLinksSet.add(normalized);
      } else {
        externalLinksSet.add(normalized);
      }
    } catch {
      // Ignore malformed link
    }
  });

  let missingAltCount = 0;
  $('img').each((_i, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      missingAltCount++;
    }
  });

  const hasViewport = $('meta[name="viewport" i]').length > 0;
  const htmlLang = $('html').attr('lang')?.trim() || null;

  return {
    title,
    metaDescription,
    h1,
    headings,
    canonicalLinks,
    robotsDirectives: Array.from(new Set(robotsDirectives)),
    schemaTypes: Array.from(new Set(schemaTypes)),
    schemaErrors,
    hreflangTags,
    internalLinks: Array.from(internalLinksSet),
    externalLinks: Array.from(externalLinksSet),
    missingAltCount,
    hasViewport,
    htmlLang,
  };
}

export interface DetectedFindingCandidate {
  ruleId: string;
  rootCauseKey: string;
  titleOverride?: string;
  urlId: string | null;
  url: string;
  evidenceType: string;
  source: 'raw_html' | 'rendered_dom' | 'http_headers' | 'robots_txt' | 'sitemap_xml';
  snippet: string;
  details: Record<string, unknown>;
}

export function isValidHreflangCode(code: string): boolean {
  const lower = code.trim().toLowerCase();
  if (lower === 'x-default') return true;
  // Standard ISO 639-1 (2 letters), optional script (4 letters), optional ISO 3166-1 alpha-2 (2 letters)
  if (!/^[a-z]{2}(?:-[a-z]{4})?(?:-[a-z]{2})?$/.test(lower)) return false;
  const lang = lower.slice(0, 2);
  // Reject clearly synthetic invalid codes like "xx", "zz", "qq"
  const INVALID_LANGS = new Set(['xx', 'yy', 'zz', 'qq']);
  return !INVALID_LANGS.has(lang);
}

export interface RuleEvaluationOutput {
  findingsByRootCause: Map<
    string,
    {
      rule: DetectionRuleDefinition;
      rootCauseKey: string;
      title: string;
      evidenceItems: DetectedFindingCandidate[];
    }
  >;
  urlIssueCountMap: Map<string, number>;
  summary: CrawlRunSummary;
}

export function evaluateCrawlRules(params: {
  urls: CrawlURLRecord[];
  robots: RobotsAnalysisResult | null;
  sitemapSummary: SitemapAnalysisSummary | null;
  robotsBlockedDiscovered: { url: string; matchedRule: string }[];
  loopDetectedUrls: { url: string; chain: string[] }[];
  canonicalLinkCountsByUrl: Map<string, number>;
}): RuleEvaluationOutput {
  const {
    urls,
    sitemapSummary,
    robotsBlockedDiscovered,
    loopDetectedUrls,
    canonicalLinkCountsByUrl,
  } = params;

  const findingsByRootCause = new Map<
    string,
    {
      rule: DetectionRuleDefinition;
      rootCauseKey: string;
      title: string;
      evidenceItems: DetectedFindingCandidate[];
    }
  >();

  const urlIssueCountMap = new Map<string, number>();

  const addFinding = (c: DetectedFindingCandidate) => {
    const rule = DETECTION_RULES[c.ruleId];
    if (!rule) return;
    const existing = findingsByRootCause.get(c.rootCauseKey);
    if (existing) {
      // Avoid duplicate evidence for same url + rootCauseKey
      if (!existing.evidenceItems.some((e) => e.url === c.url && e.evidenceType === c.evidenceType)) {
        existing.evidenceItems.push(c);
      }
    } else {
      findingsByRootCause.set(c.rootCauseKey, {
        rule,
        rootCauseKey: c.rootCauseKey,
        title: c.titleOverride ?? rule.ruleName,
        evidenceItems: [c],
      });
    }
    if (c.urlId) {
      urlIssueCountMap.set(c.urlId, (urlIssueCountMap.get(c.urlId) ?? 0) + 1);
    }
  };

  const urlByNormalized = new Map<string, CrawlURLRecord>();
  const inboundLinkCounts = new Map<string, number>();
  for (const u of urls) {
    urlByNormalized.set(u.normalizedUrl, u);
  }
  for (const u of urls) {
    for (const target of u.internalLinks) {
      inboundLinkCounts.set(target, (inboundLinkCounts.get(target) ?? 0) + 1);
    }
  }

  // Title & meta description duplicate maps (indexable 200 HTML pages only)
  const titleGroups = new Map<string, CrawlURLRecord[]>();
  for (const u of urls) {
    if (u.statusCode === 200 && u.indexability === 'Indexable' && u.title) {
      const key = u.title.trim().toLowerCase();
      const arr = titleGroups.get(key) ?? [];
      arr.push(u);
      titleGroups.set(key, arr);
    }
  }

  for (const [_titleKey, group] of titleGroups.entries()) {
    if (group.length > 1) {
      for (const u of group) {
        addFinding({
          ruleId: 'RULE-05-DUPLICATE-TITLE',
          rootCauseKey: `RULE-05-DUPLICATE-TITLE:${_titleKey.slice(0, 64)}`,
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'duplicate_title',
          source: u.renderingSource,
          snippet: `<title>${u.title}</title> (shared across ${group.length} URLs)`,
          details: {
            title: u.title,
            duplicateCount: group.length,
            peerUrls: group.map((p) => p.normalizedUrl),
          },
        });
      }
    }
  }

  // Robots blocked discovered URLs
  for (const blk of robotsBlockedDiscovered) {
    addFinding({
      ruleId: 'RULE-01-ROBOTS-BLOCKED',
      rootCauseKey: `RULE-01-ROBOTS-BLOCKED:${blk.matchedRule}`,
      urlId: null,
      url: blk.url,
      evidenceType: 'robots_disallow',
      source: 'robots_txt',
      snippet: `robots.txt ${blk.matchedRule} blocked ${blk.url}`,
      details: { matchedRule: blk.matchedRule },
    });
  }

  // Redirect loops
  for (const loop of loopDetectedUrls) {
    addFinding({
      ruleId: 'RULE-03-REDIRECT-LOOP',
      rootCauseKey: 'RULE-03-REDIRECT-LOOP:circular_redirect',
      urlId: urlByNormalized.get(loop.url)?.id ?? null,
      url: loop.url,
      evidenceType: 'redirect_loop',
      source: 'http_headers',
      snippet: `Redirect cycle: ${loop.chain.join(' -> ')}`,
      details: { chain: loop.chain },
    });
  }

  // Evaluate each crawled URL record
  for (const u of urls) {
    const hasMetaNoindex = u.robotsDirectives.includes('noindex');
    const hasHeaderNoindex = (u.xRobotsTag ?? '').toLowerCase().includes('noindex');

    if (hasMetaNoindex || hasHeaderNoindex) {
      addFinding({
        ruleId: 'RULE-01-NOINDEX',
        rootCauseKey: hasHeaderNoindex ? 'RULE-01-NOINDEX:header' : 'RULE-01-NOINDEX:meta',
        urlId: u.id,
        url: u.normalizedUrl,
        evidenceType: hasHeaderNoindex ? 'x_robots_tag' : 'meta_robots',
        source: hasHeaderNoindex ? 'http_headers' : u.renderingSource,
        snippet: hasHeaderNoindex
          ? `X-Robots-Tag: ${u.xRobotsTag}`
          : `<meta name="robots" content="${u.robotsDirectives.join(', ')}">`,
        details: {
          robotsDirectives: u.robotsDirectives,
          xRobotsTag: u.xRobotsTag,
        },
      });

      if (u.inSitemap) {
        addFinding({
          ruleId: 'RULE-01-SITEMAP-NOINDEX',
          rootCauseKey: 'RULE-01-SITEMAP-NOINDEX:sitemap_mismatch',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'sitemap_noindex',
          source: 'sitemap_xml',
          snippet: `${u.normalizedUrl} is listed in XML sitemap but returns noindex`,
          details: { inSitemap: true, robotsDirectives: u.robotsDirectives },
        });
      }
    }

    // Broken HTTP 4xx/5xx
    if (u.statusCode === 404 || u.statusCode === 410) {
      addFinding({
        ruleId: 'RULE-04-BROKEN-4XX',
        rootCauseKey: `RULE-04-BROKEN-4XX:status_${u.statusCode}`,
        urlId: u.id,
        url: u.normalizedUrl,
        evidenceType: 'http_status',
        source: 'http_headers',
        snippet: `HTTP ${u.statusCode} returned from ${u.requestedUrl}${u.parentUrl ? ` (linked from ${u.parentUrl})` : ''}`,
        details: { statusCode: u.statusCode, parentUrl: u.parentUrl },
      });
    } else if (u.statusCode >= 500 || u.statusCode === 0) {
      addFinding({
        ruleId: 'RULE-04-SERVER-5XX',
        rootCauseKey: `RULE-04-SERVER-5XX:status_${u.statusCode}`,
        urlId: u.id,
        url: u.normalizedUrl,
        evidenceType: 'http_5xx',
        source: 'http_headers',
        snippet: `HTTP ${u.statusCode || 'TIMEOUT'} from ${u.requestedUrl}`,
        details: { statusCode: u.statusCode, parentUrl: u.parentUrl },
      });
    }

    // Redirect chains (>= 2 hops)
    if (u.redirectChain.length >= 2) {
      addFinding({
        ruleId: 'RULE-03-REDIRECT-CHAIN',
        rootCauseKey: 'RULE-03-REDIRECT-CHAIN:multi_hop',
        urlId: u.id,
        url: u.normalizedUrl,
        evidenceType: 'redirect_chain',
        source: 'http_headers',
        snippet: `${u.redirectChain.length} redirect hops: ${u.redirectChain.map((h) => `${h.statusCode} ${h.url}`).join(' -> ')} -> ${u.finalUrl}`,
        details: { hops: u.redirectChain, finalUrl: u.finalUrl },
      });
    }

    // Internal links pointing to broken/redirecting targets
    if (u.statusCode === 200) {
      for (const target of u.internalLinks) {
        const targetRec = urlByNormalized.get(target);
        if (targetRec && (targetRec.statusCode === 301 || targetRec.statusCode === 302 || targetRec.statusCode === 307 || targetRec.statusCode === 308)) {
          addFinding({
            ruleId: 'RULE-03-INTERNAL-REDIRECT',
            rootCauseKey: 'RULE-03-INTERNAL-REDIRECT:redirecting_anchor',
            urlId: u.id,
            url: u.normalizedUrl,
            evidenceType: 'internal_redirect_link',
            source: u.renderingSource,
            snippet: `${u.normalizedUrl} links to redirecting URL ${target} (HTTP ${targetRec.statusCode})`,
            details: { sourceUrl: u.normalizedUrl, targetUrl: target, targetStatus: targetRec.statusCode },
          });
        }
      }
    }

    // Canonical rules (on 200 HTML pages)
    if (u.statusCode === 200 && u.contentType.includes('text/html')) {
      const canonicalCount = canonicalLinkCountsByUrl.get(u.normalizedUrl) ?? (u.canonicalUrl ? 1 : 0);
      if (canonicalCount > 1 || u.canonicalStatus === 'conflict' || u.canonicalStatus === 'multiple') {
        addFinding({
          ruleId: 'RULE-02-CANONICAL-CONFLICT',
          rootCauseKey: 'RULE-02-CANONICAL-CONFLICT:multiple_or_mismatch',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'canonical_conflict',
          source: u.renderingSource,
          snippet: `Canonical conflict on ${u.normalizedUrl}: ${canonicalCount} canonical tags found; resolved canonical="${u.canonicalUrl ?? 'none'}"`,
          details: { canonicalCount, canonicalUrl: u.canonicalUrl, finalUrl: u.finalUrl },
        });
      } else if (!u.canonicalUrl) {
        addFinding({
          ruleId: 'RULE-02-CANONICAL-MISSING',
          rootCauseKey: 'RULE-02-CANONICAL-MISSING:absent',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'missing_canonical',
          source: u.renderingSource,
          snippet: `No <link rel="canonical"> found in HTML <head> for ${u.normalizedUrl}`,
          details: { finalUrl: u.finalUrl },
        });
      } else {
        const canonicalTargetRec = urlByNormalized.get(u.canonicalUrl);
        if (canonicalTargetRec && canonicalTargetRec.statusCode >= 400) {
          addFinding({
            ruleId: 'RULE-02-CANONICAL-ERROR',
            rootCauseKey: 'RULE-02-CANONICAL-ERROR:points_to_error',
            urlId: u.id,
            url: u.normalizedUrl,
            evidenceType: 'canonical_error_target',
            source: u.renderingSource,
            snippet: `Canonical points to ${u.canonicalUrl} which returned HTTP ${canonicalTargetRec.statusCode}`,
            details: { canonicalUrl: u.canonicalUrl, targetStatus: canonicalTargetRec.statusCode },
          });
        }
      }

      // Metadata checks
      if (!u.title) {
        addFinding({
          ruleId: 'RULE-05-MISSING-TITLE',
          rootCauseKey: 'RULE-05-MISSING-TITLE:absent',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'missing_title',
          source: u.renderingSource,
          snippet: `HTML <head> missing non-empty <title> on ${u.normalizedUrl}`,
          details: {},
        });
      } else if (u.title.length < 15 || u.title.length > 65) {
        addFinding({
          ruleId: 'RULE-05-TITLE-LENGTH',
          rootCauseKey: 'RULE-05-TITLE-LENGTH:bounds',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'title_length',
          source: u.renderingSource,
          snippet: `<title> length is ${u.title.length} chars ("${u.title.slice(0, 70)}")`,
          details: { title: u.title, length: u.title.length },
        });
      }

      if (!u.metaDescription) {
        addFinding({
          ruleId: 'RULE-05-MISSING-META-DESC',
          rootCauseKey: 'RULE-05-MISSING-META-DESC:absent',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'missing_meta_description',
          source: u.renderingSource,
          snippet: `<meta name="description"> is missing on ${u.normalizedUrl}`,
          details: {},
        });
      }

      // Headings
      const h1s = u.headings.filter((h) => h.tag === 'h1' && h.text.length > 0);
      if (h1s.length === 0) {
        addFinding({
          ruleId: 'RULE-06-MISSING-H1',
          rootCauseKey: 'RULE-06-MISSING-H1:absent',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'missing_h1',
          source: u.renderingSource,
          snippet: `Zero non-empty <h1> elements detected on ${u.normalizedUrl}`,
          details: { headings: u.headings },
        });
      } else {
        let skipped = false;
        for (let i = 1; i < u.headings.length; i++) {
          const prevLvl = Number(u.headings[i - 1].tag.slice(1));
          const currLvl = Number(u.headings[i].tag.slice(1));
          if (currLvl - prevLvl > 1) {
            skipped = true;
            break;
          }
        }
        if (h1s.length > 1 || skipped) {
          addFinding({
            ruleId: 'RULE-06-HEADING-HIERARCHY',
            rootCauseKey: 'RULE-06-HEADING-HIERARCHY:order',
            urlId: u.id,
            url: u.normalizedUrl,
            evidenceType: 'heading_hierarchy',
            source: u.renderingSource,
            snippet: `${h1s.length} H1 tag(s); heading sequence: ${u.headings.map((h) => h.tag).join(' -> ')}`,
            details: { h1Count: h1s.length, headings: u.headings },
          });
        }
      }

      // Schema JSON-LD errors
      if (u.schemaErrors.length > 0) {
        addFinding({
          ruleId: 'RULE-07-INVALID-SCHEMA',
          rootCauseKey: 'RULE-07-INVALID-SCHEMA:json_ld_error',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'invalid_json_ld',
          source: u.renderingSource,
          snippet: u.schemaErrors.join(' | '),
          details: { schemaErrors: u.schemaErrors, schemaTypes: u.schemaTypes },
        });
      }

      // Hreflang validation (invalid codes, missing return link, broken alternate)
      if (u.hreflangTags.length > 0) {
        const hreflangProblems: string[] = [];
        for (const tag of u.hreflangTags) {
          if (!isValidHreflangCode(tag.lang)) {
            hreflangProblems.push(`Invalid hreflang locale "${tag.lang}"`);
          }
          const targetRec = urlByNormalized.get(tag.href);
          if (targetRec) {
            if (targetRec.statusCode >= 400) {
              hreflangProblems.push(`Alternate "${tag.lang}" points to HTTP ${targetRec.statusCode}`);
            } else {
              const hasReturn = targetRec.hreflangTags.some(
                (ret) => ret.href === u.normalizedUrl,
              );
              if (!hasReturn) {
                hreflangProblems.push(`Missing reciprocal return link from ${tag.href} (${tag.lang})`);
              }
            }
          }
        }
        if (hreflangProblems.length > 0) {
          addFinding({
            ruleId: 'RULE-08-HREFLANG-ERROR',
            rootCauseKey: 'RULE-08-HREFLANG-ERROR:validation',
            urlId: u.id,
            url: u.normalizedUrl,
            evidenceType: 'hreflang_error',
            source: u.renderingSource,
            snippet: hreflangProblems.join('; '),
            details: { hreflangTags: u.hreflangTags, problems: hreflangProblems },
          });
        }
      }

      // Page structure hygiene
      if (!u.hasViewport || !u.htmlLang || u.missingAltCount > 0) {
        const parts: string[] = [];
        if (!u.hasViewport) parts.push('missing viewport meta');
        if (!u.htmlLang) parts.push('missing <html lang>');
        if (u.missingAltCount > 0) parts.push(`${u.missingAltCount} img(s) missing alt`);
        addFinding({
          ruleId: 'RULE-09-STRUCTURE-HYGIENE',
          rootCauseKey: 'RULE-09-STRUCTURE-HYGIENE:dom_hygiene',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'page_structure',
          source: u.renderingSource,
          snippet: `${u.normalizedUrl}: ${parts.join(', ')}`,
          details: { hasViewport: u.hasViewport, htmlLang: u.htmlLang, missingAltCount: u.missingAltCount },
        });
      }

      // Orphan / low internal links
      const inboundCount = inboundLinkCounts.get(u.normalizedUrl) ?? 0;
      if (u.inSitemap && inboundCount === 0 && u.discoverySource === 'sitemap') {
        addFinding({
          ruleId: 'RULE-09-ORPHAN-CANDIDATE',
          rootCauseKey: 'RULE-09-ORPHAN-CANDIDATE:sitemap_only',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'sitemap_only_orphan',
          source: 'sitemap_xml',
          snippet: `${u.normalizedUrl} was discovered only via XML sitemap with 0 internal inbound links`,
          details: { inboundCount, discoverySource: u.discoverySource },
        });
      } else if (u.indexability === 'Indexable' && u.depth > 0 && inboundCount < 2) {
        addFinding({
          ruleId: 'RULE-10-LOW-INTERNAL-LINKS',
          rootCauseKey: 'RULE-10-LOW-INTERNAL-LINKS:weak_inlinks',
          urlId: u.id,
          url: u.normalizedUrl,
          evidenceType: 'low_internal_links',
          source: u.renderingSource,
          snippet: `${u.normalizedUrl} has only ${inboundCount} incoming internal link(s)`,
          details: { inboundCount },
        });
      }
    }
  }

  // Build summary from real URLs and grouped findings
  const statusDistribution: Record<string, number> = {};
  let indexableCount = 0;
  let nonIndexableCount = 0;
  let redirectCount = 0;
  let brokenCount = 0;
  let jsRenderedCount = 0;
  let jsRenderFailureCount = 0;

  for (const u of urls) {
    const bucket = u.statusCode === 0 ? 'Error' : `${Math.floor(u.statusCode / 100)}xx`;
    statusDistribution[bucket] = (statusDistribution[bucket] ?? 0) + 1;
    if (u.indexability === 'Indexable') indexableCount++;
    else nonIndexableCount++;
    if (u.statusCode >= 300 && u.statusCode < 400) redirectCount++;
    if (u.statusCode >= 400 || u.statusCode === 0) brokenCount++;
    if (u.renderingSource === 'rendered_dom') jsRenderedCount++;
    if (u.renderedDiff?.attempted && u.renderedDiff.status === 'failed') jsRenderFailureCount++;
  }

  let issuesCritical = 0;
  let issuesHigh = 0;
  let issuesMedium = 0;
  let issuesLow = 0;
  let issuesInfo = 0;

  for (const grp of findingsByRootCause.values()) {
    switch (grp.rule.severity) {
      case 'Critical':
        issuesCritical++;
        break;
      case 'High':
        issuesHigh++;
        break;
      case 'Medium':
        issuesMedium++;
        break;
      case 'Low':
        issuesLow++;
        break;
      case 'Informational':
        issuesInfo++;
        break;
    }
  }

  const issuesTotal = findingsByRootCause.size;
  const penalty =
    issuesCritical * 10 +
    issuesHigh * 5 +
    issuesMedium * 2 +
    issuesLow * 1;
  const healthScore = urls.length === 0 ? 0 : Math.max(12, Math.min(100, 100 - penalty));

  return {
    findingsByRootCause,
    urlIssueCountMap,
    summary: {
      statusDistribution,
      indexableCount,
      nonIndexableCount,
      redirectCount,
      brokenCount,
      issuesTotal,
      issuesCritical,
      issuesHigh,
      issuesMedium,
      issuesLow,
      issuesInfo,
      sitemapUrlCount: sitemapSummary?.totalEntries ?? 0,
      sitemapOnlyCount: sitemapSummary?.sitemapOnlyUrls.length ?? 0,
      jsRenderedCount,
      jsRenderFailureCount,
      healthScore,
    },
  };
}

export function groupIssuesByCategory(
  issues: { category: IssueCategory }[],
): { category: IssueCategory; count: number }[] {
  const counts = new Map<IssueCategory, number>();
  for (const item of issues) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

export function groupIssuesBySeverity(
  issues: { severity: IssueSeverity }[],
): { severity: IssueSeverity; count: number }[] {
  const order: IssueSeverity[] = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
  const counts = new Map<IssueSeverity, number>();
  for (const item of issues) {
    counts.set(item.severity, (counts.get(item.severity) ?? 0) + 1);
  }
  return order.map((severity) => ({ severity, count: counts.get(severity) ?? 0 }));
}
