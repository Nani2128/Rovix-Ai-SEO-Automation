import type { ContentGapRecommendation } from '../types/competitors';
import type { CrawlURLRecord } from '../types/crawl';
import type { KeywordIntent } from '../types/dashboard';
import type { GeoTargetMarket } from '../types/geographic';
import type {
  KeywordCluster,
  KeywordIntelligenceRecord,
  KeywordUrlMappingRecord,
} from '../types/keywords';
import type {
  ExtractedImageSignal,
  ExtractedInternalAnchor,
  ExtractedSchemaBlock,
  OnPageCategoryScore,
  OnPageDraftContentPayload,
  OnPageEvidenceRef,
  OnPageHtmlExtract,
  OnPageIssueCategory,
  OnPageIssueSeverity,
  OnPageKeywordContext,
  OnPageOptimizationDraftRecord,
  OnPagePageAnalysisRecord,
  OnPageRecommendationTarget,
  OnPageScoreBreakdown,
  ValidationFieldDiff,
} from '../types/onPage';
import type {
  InternalLinkRecommendationRecord,
  SiteArchitecturePageRecord,
  StrategyConfidence,
} from '../types/strategy';
import type { TechnicalIssue } from '../types/technicalIssue';

const WEAK_ANCHOR_PHRASES = new Set([
  'click here',
  'read more',
  'learn more',
  'more',
  'here',
  'link',
  'details',
  'view more',
  'this page',
  'website',
]);

const SCHEMA_REQUIRED_PROPS: Record<string, string[]> = {
  Organization: ['name', 'url'],
  LocalBusiness: ['name', 'address'],
  Article: ['headline', 'author'],
  BlogPosting: ['headline', 'datePublished'],
  Product: ['name', 'offers'],
  Service: ['name', 'provider'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  WebPage: ['name', 'url'],
};

export function normalizeUrlPath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const cleaned = parsed.pathname.replace(/\/+$/, '') || '/';
    return cleaned.toLowerCase();
  } catch {
    const clean = rawUrl.trim().split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    return (clean.startsWith('/') ? clean : `/${clean}`).toLowerCase();
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeExtractedText(raw: string, maxLen = 600): string {
  const withoutControls = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/```/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutControls.length > maxLen
    ? `${withoutControls.slice(0, maxLen)}…`
    : withoutControls;
}

function parseAttr(tag: string, attrName: string): { present: boolean; value: string | null } {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = tag.match(re);
  if (match) {
    const val = match[1] ?? match[2] ?? match[3] ?? '';
    return { present: true, value: decodeHtmlEntities(val) };
  }
  const bareRe = new RegExp(`\\b${attrName}(?=[\\s/>])`, 'i');
  if (bareRe.test(tag)) {
    return { present: true, value: '' };
  }
  return { present: false, value: null };
}

function inferReadableAltFromSrc(src: string, pageTitle: string | null): string {
  const cleanFile = src
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    ?.replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{3,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanFile && cleanFile.length >= 4 && !/^(img|image|photo|pic|banner|hero)$/i.test(cleanFile)) {
    const formatted = cleanFile.charAt(0).toUpperCase() + cleanFile.slice(1);
    return pageTitle ? `${formatted} — ${sanitizeExtractedText(pageTitle, 48)}` : formatted;
  }
  if (pageTitle) {
    return `Visual illustration for ${sanitizeExtractedText(pageTitle, 64)}`;
  }
  return 'Descriptive alt text required (inspect image visual context)';
}

/**
 * Safely parses persisted raw/rendered HTML snapshots without executing scripts or risking ReDoS.
 * Falls back transparently to crawl metadata when no HTML snapshot is stored.
 */
export function extractOnPageSignalsFromHtml(params: {
  crawlUrl: CrawlURLRecord;
  htmlSnapshot: string | null;
}): OnPageHtmlExtract {
  const { crawlUrl, htmlSnapshot } = params;
  const fallbackHeadings = Array.isArray(crawlUrl.headings) ? crawlUrl.headings : [];
  const fallbackH1s = fallbackHeadings
    .filter((h) => h.tag.toLowerCase() === 'h1')
    .map((h) => h.text);
  if (fallbackH1s.length === 0 && crawlUrl.h1) {
    fallbackH1s.push(crawlUrl.h1);
  }

  if (!htmlSnapshot || !htmlSnapshot.trim()) {
    return {
      htmlAvailable: false,
      renderingSource: 'metadata_only',
      wordCount: null,
      bodyTextExcerpt: '',
      headings: fallbackHeadings,
      h1List: fallbackH1s,
      images: [],
      imagesTotal: crawlUrl.missingAltCount > 0 ? crawlUrl.missingAltCount : 0,
      imagesMissingAlt: crawlUrl.missingAltCount,
      imagesEmptyAlt: 0,
      imagesMissingDimensions: 0,
      jsonLdBlocks: [],
      detectedSchemaTypes: [...crawlUrl.schemaTypes],
      invalidSchemaCount: crawlUrl.schemaErrors.length,
      internalAnchors: [],
      weakAnchorCount: 0,
    };
  }

  // Cap HTML inspected to 400KB to protect memory/CPU on unusually large pages
  const safeHtml = htmlSnapshot.slice(0, 400_000);

  // Extract JSON-LD blocks before stripping script tags
  const jsonLdBlocks: ExtractedSchemaBlock[] = [];
  const detectedSchemaSet = new Set<string>(crawlUrl.schemaTypes);
  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRe.exec(safeHtml)) !== null && jsonLdBlocks.length < 20) {
    const rawJson = scriptMatch[1].trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown> | Record<string, unknown>[];
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
          ? ((parsed as { '@graph': Record<string, unknown>[] })['@graph'])
          : [parsed];
      const types: string[] = [];
      const missingProps: string[] = [];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const rawT = item['@type'];
        const itemTypes = Array.isArray(rawT)
          ? rawT.map(String)
          : typeof rawT === 'string'
            ? [rawT]
            : [];
        for (const t of itemTypes) {
          types.push(t);
          detectedSchemaSet.add(t);
          const req = SCHEMA_REQUIRED_PROPS[t];
          if (req) {
            for (const prop of req) {
              if (item[prop] === undefined || item[prop] === null || item[prop] === '') {
                missingProps.push(`${t}.${prop}`);
              }
            }
          }
        }
      }

      jsonLdBlocks.push({
        rawType: types.length > 0 ? types : ['Unknown'],
        validJson: true,
        parseError: null,
        missingRecommendedProps: [...new Set(missingProps)],
        snippet: sanitizeExtractedText(rawJson, 220),
      });
    } catch (err) {
      jsonLdBlocks.push({
        rawType: ['Invalid JSON-LD'],
        validJson: false,
        parseError: err instanceof Error ? err.message : 'Malformed JSON-LD syntax',
        missingRecommendedProps: [],
        snippet: sanitizeExtractedText(rawJson, 180),
      });
    }
  }

  // Strip scripts, styles, noscript, svg for visible body extraction
  const bodyMatch = safeHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyRegion = bodyMatch ? bodyMatch[1] : safeHtml;
  const cleanedBodyHtml = bodyRegion
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ');

  // Extract headings H1-H6
  const headings: { tag: string; text: string }[] = [];
  const headingRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRe.exec(cleanedBodyHtml)) !== null && headings.length < 80) {
    const tag = hMatch[1].toLowerCase();
    const text = decodeHtmlEntities(hMatch[2].replace(/<[^>]+>/g, ' '));
    if (text) headings.push({ tag, text });
  }
  const finalHeadings = headings.length > 0 ? headings : fallbackHeadings;
  const h1List = finalHeadings
    .filter((h) => h.tag.toLowerCase() === 'h1')
    .map((h) => h.text);
  if (h1List.length === 0 && crawlUrl.h1) {
    h1List.push(crawlUrl.h1);
  }

  // Extract visible body text and word count
  const plainText = decodeHtmlEntities(cleanedBodyHtml.replace(/<[^>]+>/g, ' '));
  const words = plainText ? plainText.split(/\s+/).filter((w) => w.length > 0) : [];
  const wordCount = words.length;
  const bodyTextExcerpt = sanitizeExtractedText(plainText, 800);

  // Extract images
  const images: ExtractedImageSignal[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRe.exec(cleanedBodyHtml)) !== null && images.length < 60) {
    const tag = imgMatch[0];
    const srcAttr = parseAttr(tag, 'src');
    const altAttr = parseAttr(tag, 'alt');
    const widthAttr = parseAttr(tag, 'width');
    const heightAttr = parseAttr(tag, 'height');
    const loadingAttr = parseAttr(tag, 'loading');
    const src = srcAttr.value || '(missing src)';
    const isEmptyAlt = altAttr.present && !(altAttr.value ?? '').trim();
    const missingAlt = !altAttr.present;

    images.push({
      src,
      alt: altAttr.present ? (altAttr.value ?? '') : null,
      hasAltAttribute: altAttr.present,
      isEmptyAlt,
      width: widthAttr.value,
      height: heightAttr.value,
      loading: loadingAttr.value,
      surroundingContext: crawlUrl.h1 || crawlUrl.title || crawlUrl.normalizedUrl,
      suggestedAlt:
        missingAlt || isEmptyAlt
          ? inferReadableAltFromSrc(src, crawlUrl.h1 || crawlUrl.title)
          : null,
    });
  }

  const imagesMissingAlt = Math.max(
    crawlUrl.missingAltCount,
    images.filter((i) => !i.hasAltAttribute).length,
  );
  const imagesEmptyAlt = images.filter((i) => i.isEmptyAlt).length;
  const imagesMissingDimensions = images.filter((i) => !i.width || !i.height).length;

  // Extract internal anchor links & weak anchors
  const internalAnchors: ExtractedInternalAnchor[] = [];
  let pageOrigin = '';
  try {
    pageOrigin = new URL(crawlUrl.normalizedUrl).origin;
  } catch {
    pageOrigin = '';
  }

  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(cleanedBodyHtml)) !== null && internalAnchors.length < 100) {
    const attrs = linkMatch[1];
    const hrefAttr = parseAttr(`<a ${attrs}>`, 'href');
    if (!hrefAttr.value) continue;
    const href = hrefAttr.value.trim();
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      continue;
    }
    const isInternal =
      href.startsWith('/') || (pageOrigin && href.startsWith(pageOrigin));
    if (!isInternal) continue;
    const anchorText = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, ' '));
    const lower = anchorText.toLowerCase();
    const isWeakAnchor =
      !anchorText || anchorText.length < 3 || WEAK_ANCHOR_PHRASES.has(lower);
    internalAnchors.push({
      href,
      anchorText: anchorText || '(empty anchor)',
      isWeakAnchor,
    });
  }

  const invalidSchemaCount =
    jsonLdBlocks.filter((b) => !b.validJson || b.missingRecommendedProps.length > 0).length +
    (jsonLdBlocks.length === 0 ? crawlUrl.schemaErrors.length : 0);

  return {
    htmlAvailable: true,
    renderingSource: crawlUrl.renderingSource,
    wordCount,
    bodyTextExcerpt,
    headings: finalHeadings,
    h1List,
    images,
    imagesTotal: images.length,
    imagesMissingAlt,
    imagesEmptyAlt,
    imagesMissingDimensions,
    jsonLdBlocks,
    detectedSchemaTypes: [...detectedSchemaSet],
    invalidSchemaCount,
    internalAnchors,
    weakAnchorCount: internalAnchors.filter((a) => a.isWeakAnchor).length,
  };
}

export function inferPageTypeFromUrlAndStrategy(
  crawlUrl: CrawlURLRecord,
  archPage: SiteArchitecturePageRecord | null,
): string {
  if (archPage?.pageType) return archPage.pageType;
  const path = normalizeUrlPath(crawlUrl.normalizedUrl);
  if (path === '/') return 'homepage';
  if (/^\/(services?|solutions?)\b/.test(path)) return 'service';
  if (/^\/(products?|shop|pricing)\b/.test(path)) return 'product';
  if (/^\/(locations?|cities?|areas?)\b/.test(path)) return 'location';
  if (/^\/(blog|articles?|news|insights?)\b/.test(path)) return 'blog';
  if (/^\/(guides?|resources?|docs?|faq)\b/.test(path)) return 'resource';
  if (/^\/(case-stud|customers?)\b/.test(path)) return 'case_study';
  if (/^\/about\b/.test(path)) return 'about';
  if (/^\/contact\b/.test(path)) return 'contact';
  return 'resource';
}

export function recommendSchemaTypesForPage(
  pageType: string,
  detectedTypes: string[],
  hasFaqSignals: boolean,
): string[] {
  const detectedLower = new Set(detectedTypes.map((t) => t.toLowerCase()));
  const candidates: string[] = [];

  switch (pageType) {
    case 'homepage':
      candidates.push('Organization', 'WebSite');
      break;
    case 'service':
      candidates.push('Service', 'BreadcrumbList');
      break;
    case 'product':
      candidates.push('Product', 'BreadcrumbList');
      break;
    case 'location':
      candidates.push('LocalBusiness', 'BreadcrumbList');
      break;
    case 'blog':
    case 'resource':
    case 'case_study':
      candidates.push('Article', 'BreadcrumbList');
      break;
    case 'about':
      candidates.push('AboutPage', 'Organization');
      break;
    case 'contact':
      candidates.push('ContactPage', 'Organization');
      break;
    default:
      candidates.push('WebPage', 'BreadcrumbList');
      break;
  }

  if (hasFaqSignals) {
    candidates.push('FAQPage');
  }

  return candidates.filter((c) => !detectedLower.has(c.toLowerCase()));
}

function keywordTokensMatch(haystack: string | null | undefined, keyword: string | null): boolean {
  if (!haystack || !keyword) return false;
  const h = haystack.toLowerCase();
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  if (h.includes(k)) return true;
  const tokens = k.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const matched = tokens.filter((t) => h.includes(t)).length;
  return matched / tokens.length >= 0.7;
}

export interface GeneratedIssueDraft {
  issueKey: string;
  category: OnPageIssueCategory;
  severity: OnPageIssueSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  evidence: OnPageEvidenceRef[];
}

export interface GeneratedRecommendationDraft {
  targetField: OnPageRecommendationTarget;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  relatedKeyword: string | null;
  searchIntent: KeywordIntent | null;
  evidence: OnPageEvidenceRef[];
  confidence: StrategyConfidence;
}

export interface SinglePageOnPageEvaluation {
  pageType: string;
  htmlExtract: OnPageHtmlExtract;
  keywordContext: OnPageKeywordContext;
  suggestedSchemaTypes: string[];
  suggestedSubtopics: string[];
  scoreBreakdown: OnPageScoreBreakdown;
  issues: GeneratedIssueDraft[];
  recommendations: GeneratedRecommendationDraft[];
}

export interface OnPageAnalyzerInput {
  projectName: string;
  projectWebsite: string;
  crawledUrls: CrawlURLRecord[];
  htmlByUrlId: Record<string, string | null>;
  technicalIssues: TechnicalIssue[];
  keywords: KeywordIntelligenceRecord[];
  clusters: KeywordCluster[];
  keywordMappings: KeywordUrlMappingRecord[];
  approvedMarkets: GeoTargetMarket[];
  contentGaps: ContentGapRecommendation[];
  architecturePages: SiteArchitecturePageRecord[];
  internalLinkRecs: InternalLinkRecommendationRecord[];
}

/**
 * Deterministic 10-category On-Page SEO Scoring Engine.
 * Clearly separates unavailable evidence from failed checks and outputs
 * `overallScore: null` ("Insufficient Evidence") when fewer than 4 categories are verifiable.
 */
export function computeExplainableOnPageScore(
  categories: OnPageCategoryScore[],
): OnPageScoreBreakdown {
  const scored = categories.filter(
    (c) => c.status === 'scored' && c.score !== null,
  );
  const unavailableCount = categories.length - scored.length;

  if (scored.length < 4) {
    return {
      overallScore: null,
      scoreStatus: 'insufficient_evidence',
      scoredCategoriesCount: scored.length,
      unavailableCategoriesCount: unavailableCount,
      caveat:
        'Insufficient Evidence — Fewer than 4 on-page categories had verifiable crawl/keyword signals. Run a full HTML crawl and map keywords before relying on an aggregate score.',
      categories,
    };
  }

  const earned = scored.reduce((sum, c) => sum + (c.score ?? 0), 0);
  const possible = scored.reduce((sum, c) => sum + c.maxScore, 0);
  const normalized = possible > 0 ? Math.round((earned / possible) * 100) : null;

  return {
    overallScore: normalized,
    scoreStatus: normalized !== null ? 'scored' : 'insufficient_evidence',
    scoredCategoriesCount: scored.length,
    unavailableCategoriesCount: unavailableCount,
    caveat:
      'Deterministic score reflects verified on-page signals only. A high score does not guarantee search rankings, traffic, or conversions; editorial review is still required.',
    categories,
  };
}

/**
 * Analyzes every crawled URL using real crawl metadata, persisted HTML snapshots,
 * Module 5 keywords/clusters, Module 6 content gaps, and Module 7 architecture/internal links.
 */
export function analyzeCrawledPagesForOnPage(
  input: OnPageAnalyzerInput,
): Map<string, SinglePageOnPageEvaluation> {
  const results = new Map<string, SinglePageOnPageEvaluation>();

  // Precompute duplicate titles & duplicate meta descriptions across the real crawl
  const titleCounts = new Map<string, string[]>();
  const metaCounts = new Map<string, string[]>();
  const inboundCountByPath = new Map<string, number>();

  for (const u of input.crawledUrls) {
    const t = (u.title ?? '').trim().toLowerCase();
    if (t) {
      const list = titleCounts.get(t) ?? [];
      list.push(u.normalizedUrl);
      titleCounts.set(t, list);
    }
    const m = (u.metaDescription ?? '').trim().toLowerCase();
    if (m) {
      const list = metaCounts.get(m) ?? [];
      list.push(u.normalizedUrl);
      metaCounts.set(m, list);
    }
    for (const target of u.internalLinks) {
      const p = normalizeUrlPath(target);
      inboundCountByPath.set(p, (inboundCountByPath.get(p) ?? 0) + 1);
    }
  }

  // Index Module 7 architecture pages by path
  const archByPath = new Map<string, SiteArchitecturePageRecord>();
  const primaryKwToUrls = new Map<string, string[]>();
  for (const page of input.architecturePages) {
    if (page.pageStatus === 'archived' || page.archivedAt) continue;
    archByPath.set(normalizeUrlPath(page.existingUrl || page.proposedUrl), page);
    if (page.primaryKeyword) {
      const k = page.primaryKeyword.trim().toLowerCase();
      const list = primaryKwToUrls.get(k) ?? [];
      list.push(page.existingUrl || page.proposedUrl);
      primaryKwToUrls.set(k, list);
    }
  }

  // Index Module 5 keyword-to-URL mappings by path
  const mappingByPath = new Map<string, KeywordUrlMappingRecord[]>();
  for (const map of input.keywordMappings) {
    if (!map.targetUrl) continue;
    const p = normalizeUrlPath(map.targetUrl);
    const list = mappingByPath.get(p) ?? [];
    list.push(map);
    mappingByPath.set(p, list);

    const k = map.keyword.trim().toLowerCase();
    const urls = primaryKwToUrls.get(k) ?? [];
    if (!urls.includes(map.targetUrl)) urls.push(map.targetUrl);
    primaryKwToUrls.set(k, urls);
  }

  const kwById = new Map(input.keywords.map((k) => [k.id, k]));
  const approvedGeoLabels = input.approvedMarkets
    .filter((m) => m.approvalStatus === 'approved')
    .map((m) => m.city || m.stateRegion || m.countryName);

  for (const crawlUrl of input.crawledUrls) {
    const path = normalizeUrlPath(crawlUrl.normalizedUrl);
    const htmlSnapshot = input.htmlByUrlId[crawlUrl.id] ?? null;
    const htmlExtract = extractOnPageSignalsFromHtml({ crawlUrl, htmlSnapshot });
    const archPage = archByPath.get(path) ?? null;
    const pageType = inferPageTypeFromUrlAndStrategy(crawlUrl, archPage);
    const urlMappings = mappingByPath.get(path) ?? [];
    const primaryMapping = urlMappings[0] ?? null;

    // Resolve keyword context strictly from existing Module 5 / Module 7 evidence
    const existingPrimaryKeyword =
      archPage?.primaryKeyword ?? primaryMapping?.keyword ?? null;
    const secondaryKeywords = archPage?.secondaryKeywords?.length
      ? archPage.secondaryKeywords
      : urlMappings.slice(1).map((m) => m.keyword);

    const matchedKeywordRecord = existingPrimaryKeyword
      ? input.keywords.find(
          (k) => k.keyword.toLowerCase() === existingPrimaryKeyword.toLowerCase(),
        ) ?? null
      : null;

    const searchIntent: KeywordIntent | null =
      archPage?.searchIntent ?? matchedKeywordRecord?.intent ?? null;
    const targetGeography =
      archPage?.targetGeography ??
      (approvedGeoLabels.find((g) =>
        `${crawlUrl.normalizedUrl} ${crawlUrl.title ?? ''}`
          .toLowerCase()
          .includes(g.toLowerCase()),
      ) ??
        null);

    // Detect evidence-backed candidate keyword if currently unmapped (never auto-assign blindly)
    let recommendedPrimaryKeyword: string | null = null;
    let recommendedKeywordReason: string | null = null;
    const relatedClusterOpportunities: string[] = [];

    if (!existingPrimaryKeyword && input.clusters.length > 0) {
      const pageBag = `${crawlUrl.normalizedUrl} ${crawlUrl.title ?? ''} ${crawlUrl.h1 ?? ''}`.toLowerCase();
      for (const cluster of input.clusters) {
        if (cluster.approvalState === 'rejected') continue;
        const clusterSlug = cluster.suggestedLandingUrl
          ? normalizeUrlPath(cluster.suggestedLandingUrl)
          : null;
        if (
          clusterSlug === path ||
          keywordTokensMatch(pageBag, cluster.primaryKeyword)
        ) {
          recommendedPrimaryKeyword = cluster.primaryKeyword;
          recommendedKeywordReason = `Matched existing Module 5 cluster "${cluster.clusterName}" (${cluster.keywordsCount} keywords, ${cluster.dominantIntent} intent). Requires human approval before locking mapping.`;
          relatedClusterOpportunities.push(
            `${cluster.clusterName} (${cluster.primaryKeyword})`,
          );
          break;
        }
      }
    }

    // Cannibalization & conflicting intent warnings
    const cannibalizationWarnings: string[] = [];
    if (existingPrimaryKeyword) {
      const competingUrls = (
        primaryKwToUrls.get(existingPrimaryKeyword.trim().toLowerCase()) ?? []
      ).filter((u) => normalizeUrlPath(u) !== path);
      if (competingUrls.length > 0) {
        cannibalizationWarnings.push(
          `Primary keyword "${existingPrimaryKeyword}" is also targeted by ${competingUrls.slice(0, 3).join(', ')}. Consolidate or differentiate intent.`,
        );
      }
    }

    const mappingStatus: OnPageKeywordContext['mappingStatus'] =
      cannibalizationWarnings.length > 0
        ? 'conflict_detected'
        : existingPrimaryKeyword
          ? archPage?.mappingApprovalStatus === 'approved' ||
            primaryMapping?.mappingStatus === 'mapped_existing'
            ? 'mapped_approved'
            : 'mapped_pending'
          : 'unmapped';

    const keywordContext: OnPageKeywordContext = {
      existingPrimaryKeyword,
      secondaryKeywords,
      searchIntent,
      targetGeography,
      recommendedPrimaryKeyword,
      recommendedKeywordReason,
      mappingStatus,
      cannibalizationWarnings,
      relatedClusterOpportunities,
      optimizeExistingInsteadOfDuplicate:
        crawlUrl.statusCode >= 200 &&
        crawlUrl.statusCode < 300 &&
        (crawlUrl.issueCount > 0 || archPage?.pageStatus === 'optimize'),
    };

    const issues: GeneratedIssueDraft[] = [];
    const recommendations: GeneratedRecommendationDraft[] = [];
    const categories: OnPageCategoryScore[] = [];

    const activeTargetKw = existingPrimaryKeyword || recommendedPrimaryKeyword;

    // -----------------------------------------------------------------------
    // A. TITLE TAG (10 pts)
    // -----------------------------------------------------------------------
    {
      const rawTitle = (crawlUrl.title ?? '').trim();
      const dupes = rawTitle
        ? (titleCounts.get(rawTitle.toLowerCase()) ?? []).filter(
            (u) => u !== crawlUrl.normalizedUrl,
          )
        : [];
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: 'crawl_record',
          label: 'Crawled <title>',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: rawTitle
            ? `"${rawTitle}" (${rawTitle.length} chars)`
            : 'Missing or empty <title> element',
        },
      ];

      if (!rawTitle) {
        score = 0;
        problems.push('Title tag is missing or empty.');
        recs.push('Add a unique, descriptive 50–60 character <title> aligned to page topic.');
        issues.push({
          issueKey: 'onpage_missing_title',
          category: 'title',
          severity: 'Critical',
          title: 'Missing or Empty Title Tag',
          description: `Crawled URL ${path} has no usable <title> text.`,
          recommendedAction: `Draft a unique 50–60 character title incorporating the page topic${activeTargetKw ? ` ("${activeTargetKw}")` : ''} and brand name.`,
          evidence: ev,
        });
      } else {
        if (dupes.length > 0) {
          score -= 4;
          problems.push(`Duplicate title shared with ${dupes.length} other crawled URL(s).`);
          recs.push('Rewrite title so this page has a distinct search snippet.');
          issues.push({
            issueKey: 'onpage_duplicate_title',
            category: 'title',
            severity: 'High',
            title: 'Duplicate Title Tag Across Crawled URLs',
            description: `Title "${rawTitle}" is duplicated on ${dupes.slice(0, 3).join(', ')}.`,
            recommendedAction:
              'Differentiate the title tag to reflect this URL’s distinct topic and intent.',
            evidence: ev,
          });
        }
        if (rawTitle.length < 25) {
          score -= 2;
          problems.push(`Title is very short (${rawTitle.length} characters).`);
          recs.push('Expand title to 50–60 characters with descriptive topic context.');
          issues.push({
            issueKey: 'onpage_short_title',
            category: 'title',
            severity: 'Low',
            title: 'Title Tag Too Short',
            description: `Title is only ${rawTitle.length} characters ("${rawTitle}").`,
            recommendedAction: 'Expand title with topic clarity and brand context (50–60 chars).',
            evidence: ev,
          });
        } else if (rawTitle.length > 65) {
          score -= 2;
          problems.push(`Title exceeds 65 characters (${rawTitle.length} chars) and may truncate in SERPs.`);
          recs.push('Trim title to 50–60 characters while keeping the primary topic front-loaded.');
          issues.push({
            issueKey: 'onpage_long_title',
            category: 'title',
            severity: 'Medium',
            title: 'Title Tag Excessively Long',
            description: `Title is ${rawTitle.length} characters and risks SERP truncation.`,
            recommendedAction: 'Condense to 50–60 characters with the core topic at the front.',
            evidence: ev,
          });
        }
        if (activeTargetKw && !keywordTokensMatch(rawTitle, activeTargetKw)) {
          score -= 2;
          problems.push(`Mapped keyword "${activeTargetKw}" is not clearly reflected in the title.`);
          recs.push(`Include "${activeTargetKw}" naturally near the beginning of the title.`);
        }
      }

      if (problems.length > 0) {
        const baseTopic =
          activeTargetKw ||
          crawlUrl.h1 ||
          path.replace(/^\//, '').replace(/[-/]+/g, ' ') ||
          input.projectName;
        const cleanTopic =
          baseTopic.charAt(0).toUpperCase() + baseTopic.slice(1);
        const suggestedTitle = `${cleanTopic.slice(0, 42)} | ${input.projectName}`.slice(
          0,
          60,
        );
        recommendations.push({
          targetField: 'title',
          currentValue: rawTitle || '(Missing)',
          suggestedValue: suggestedTitle,
          reason: problems.join(' '),
          relatedKeyword: activeTargetKw,
          searchIntent,
          evidence: ev,
          confidence: activeTargetKw ? 'High' : 'Medium',
        });
      }

      categories.push({
        category: 'title',
        label: 'Title Optimization',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? `Unique, well-sized title (${rawTitle.length} chars).`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // B. META DESCRIPTION (10 pts)
    // -----------------------------------------------------------------------
    {
      const rawMeta = (crawlUrl.metaDescription ?? '').trim();
      const dupes = rawMeta
        ? (metaCounts.get(rawMeta.toLowerCase()) ?? []).filter(
            (u) => u !== crawlUrl.normalizedUrl,
          )
        : [];
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: 'crawl_record',
          label: 'Crawled Meta Description',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: rawMeta
            ? `"${sanitizeExtractedText(rawMeta, 140)}" (${rawMeta.length} chars)`
            : 'Missing or empty meta description',
        },
      ];

      if (!rawMeta) {
        score = 0;
        problems.push('Meta description is missing or empty.');
        recs.push('Write a concise 135–158 character summary aligned to search intent.');
        issues.push({
          issueKey: 'onpage_missing_meta_description',
          category: 'meta_description',
          severity: 'High',
          title: 'Missing Meta Description',
          description: `Crawled URL ${path} has no meta description tag.`,
          recommendedAction:
            'Add a unique 135–158 character meta description summarizing the page value proposition.',
          evidence: ev,
        });
      } else {
        if (dupes.length > 0) {
          score -= 4;
          problems.push(`Duplicate meta description shared with ${dupes.length} other URL(s).`);
          recs.push('Write a unique meta description tailored to this URL.');
          issues.push({
            issueKey: 'onpage_duplicate_meta_description',
            category: 'meta_description',
            severity: 'Medium',
            title: 'Duplicate Meta Description',
            description: `Meta description is duplicated across ${dupes.slice(0, 3).join(', ')}.`,
            recommendedAction:
              'Craft distinct meta descriptions for each indexable URL.',
            evidence: ev,
          });
        }
        if (rawMeta.length < 70) {
          score -= 2;
          problems.push(`Meta description is short (${rawMeta.length} chars).`);
          recs.push('Expand to 135–158 characters for stronger snippet clarity.');
        } else if (rawMeta.length > 165) {
          score -= 2;
          problems.push(`Meta description is too long (${rawMeta.length} chars).`);
          recs.push('Trim to <= 158 characters to prevent SERP truncation.');
        }
        if (activeTargetKw && !keywordTokensMatch(rawMeta, activeTargetKw)) {
          score -= 2;
          problems.push(`Target keyword "${activeTargetKw}" is absent from meta description.`);
          recs.push(`Mention "${activeTargetKw}" naturally in the description.`);
        }
      }

      if (problems.length > 0) {
        const subject = activeTargetKw || crawlUrl.h1 || crawlUrl.title || path;
        const suggestedMeta =
          `Explore ${subject} from ${input.projectName}. Review verified specifications, clear answers, and next steps tailored to your goals.`.slice(
            0,
            158,
          );
        recommendations.push({
          targetField: 'meta_description',
          currentValue: rawMeta || '(Missing)',
          suggestedValue: suggestedMeta,
          reason: problems.join(' '),
          relatedKeyword: activeTargetKw,
          searchIntent,
          evidence: ev,
          confidence: activeTargetKw ? 'High' : 'Medium',
        });
      }

      categories.push({
        category: 'metaDescription',
        label: 'Meta Description',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? `Unique meta description (${rawMeta.length} chars).`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // C. HEADING STRUCTURE (10 pts)
    // -----------------------------------------------------------------------
    {
      const h1s = htmlExtract.h1List;
      const headings = htmlExtract.headings;
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: htmlExtract.htmlAvailable ? 'html_snapshot' : 'crawl_record',
          label: 'Heading Inventory',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: `${h1s.length} H1(s), ${headings.length} total heading(s).`,
        },
      ];

      if (h1s.length === 0) {
        score -= 5;
        problems.push('Missing H1 heading.');
        recs.push('Add a single primary <h1> clearly stating the page topic.');
        issues.push({
          issueKey: 'onpage_missing_h1',
          category: 'headings',
          severity: 'High',
          title: 'Missing H1 Heading',
          description: `No <h1> heading was detected on ${path}.`,
          recommendedAction: 'Add one descriptive <h1> aligned with the primary keyword and user intent.',
          evidence: ev,
        });
      } else if (h1s.length > 1) {
        score -= 3;
        problems.push(`Multiple H1 elements detected (${h1s.length}).`);
        recs.push('Keep a single <h1> and demote secondary headings to <h2>.');
        issues.push({
          issueKey: 'onpage_multiple_h1',
          category: 'headings',
          severity: 'Medium',
          title: 'Multiple H1 Elements',
          description: `${h1s.length} <h1> elements detected on ${path}: ${h1s.slice(0, 3).join(' | ')}.`,
          recommendedAction: 'Consolidate to a single primary <h1> and convert secondary headings to <h2>.',
          evidence: ev,
        });
      }

      // Hierarchy skip check (e.g., H1 -> H3 without H2)
      let skippedLevel = false;
      let prevLevel = 0;
      const seenHeadingText = new Set<string>();
      let duplicateHeadingCount = 0;
      for (const h of headings) {
        const level = Number(h.tag.replace(/^h/i, ''));
        if (prevLevel > 0 && level > prevLevel + 1) {
          skippedLevel = true;
        }
        prevLevel = level;
        const norm = h.text.trim().toLowerCase();
        if (seenHeadingText.has(norm)) duplicateHeadingCount += 1;
        seenHeadingText.add(norm);
      }

      if (skippedLevel) {
        score -= 2;
        problems.push('Heading hierarchy skips heading levels (e.g. H1 directly to H3).');
        recs.push('Use sequential heading levels (H1 → H2 → H3) for readability and accessibility.');
      }
      if (duplicateHeadingCount > 0) {
        score -= 1;
        problems.push(`${duplicateHeadingCount} duplicate heading label(s) found on page.`);
      }
      if (headings.filter((h) => h.tag.toLowerCase() === 'h2').length === 0 && (htmlExtract.wordCount ?? 0) >= 250) {
        score -= 2;
        problems.push('No H2 subheadings found to organize body content.');
        recs.push('Break content into scannable H2 sections covering key user questions.');
      }
      if (activeTargetKw && h1s[0] && !keywordTokensMatch(h1s[0], activeTargetKw)) {
        score -= 2;
        problems.push(`Primary keyword "${activeTargetKw}" is not reflected in the H1.`);
        recs.push(`Align H1 phrasing with "${activeTargetKw}".`);
      }

      if (problems.length > 0 && (h1s.length === 0 || (activeTargetKw && !keywordTokensMatch(h1s[0], activeTargetKw)))) {
        recommendations.push({
          targetField: 'h1',
          currentValue: h1s[0] || '(Missing H1)',
          suggestedValue: activeTargetKw
            ? `${activeTargetKw.charAt(0).toUpperCase() + activeTargetKw.slice(1)}${targetGeography ? ` in ${targetGeography}` : ''}`
            : crawlUrl.title || 'Primary Page Topic Heading',
          reason: problems.join(' '),
          relatedKeyword: activeTargetKw,
          searchIntent,
          evidence: ev,
          confidence: activeTargetKw ? 'High' : 'Medium',
        });
      }

      categories.push({
        category: 'headings',
        label: 'Heading Structure',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? `Clean single-H1 hierarchy (${headings.length} headings).`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // D. CONTENT RELEVANCE & SUBTOPIC COVERAGE (15 pts)
    // -----------------------------------------------------------------------
    const suggestedSubtopics: string[] = [];
    {
      // Gather real subtopic opportunities from Module 6 competitor gaps + Module 5 cluster siblings
      for (const gap of input.contentGaps) {
        if (gap.workflowState === 'rejected') continue;
        if (
          gap.projectUrl &&
          normalizeUrlPath(gap.projectUrl) === path
        ) {
          suggestedSubtopics.push(
            ...gap.recommendedBrief.suggestedSections.slice(0, 4),
          );
        }
      }
      if (archPage?.clusterId) {
        const cl = input.clusters.find((c) => c.id === archPage.clusterId);
        if (cl) {
          for (const kwId of cl.keywordIds.slice(0, 5)) {
            const kw = kwById.get(kwId)?.keyword;
            if (kw && kw.toLowerCase() !== (activeTargetKw ?? '').toLowerCase()) {
              suggestedSubtopics.push(kw);
            }
          }
        }
      }
      const uniqueSubtopics = [...new Set(suggestedSubtopics)].slice(0, 6);
      suggestedSubtopics.length = 0;
      suggestedSubtopics.push(...uniqueSubtopics);

      if (!htmlExtract.htmlAvailable || htmlExtract.wordCount === null) {
        categories.push({
          category: 'contentRelevance',
          label: 'Content Relevance',
          status: 'unavailable_evidence',
          score: null,
          maxScore: 15,
          summary:
            'Unavailable Evidence — Raw/rendered HTML body snapshot was not stored for this crawl record.',
          problems: [],
          recommendations: [
            'Run a fresh full HTML crawl so visible body copy can be extracted and evaluated.',
          ],
          evidence: [
            {
              source: 'crawl_record',
              label: 'HTML Snapshot Unavailable',
              referenceId: crawlUrl.id,
              url: crawlUrl.normalizedUrl,
              observedDetail: 'No rawHtmlObjectRef or renderedDomObjectRef stored.',
            },
          ],
        });
      } else {
        const problems: string[] = [];
        const recs: string[] = [];
        let score = 15;
        const ev: OnPageEvidenceRef[] = [
          {
            source: 'html_snapshot',
            label: 'Extracted Body Copy',
            referenceId: crawlUrl.id,
            url: crawlUrl.normalizedUrl,
            observedDetail: `${htmlExtract.wordCount} visible word(s) parsed from ${htmlExtract.renderingSource}.`,
          },
        ];

        if (htmlExtract.wordCount < 150 && pageType !== 'contact') {
          score -= 7;
          problems.push(
            `Thin-content signal: only ${htmlExtract.wordCount} visible words extracted from crawled HTML.`,
          );
          recs.push(
            'Expand page with substantive, factual answers covering user questions and supporting subtopics.',
          );
          issues.push({
            issueKey: 'onpage_thin_content',
            category: 'content',
            severity: 'Medium',
            title: 'Thin Page Content Signal',
            description: `Only ${htmlExtract.wordCount} visible words extracted on ${path}.`,
            recommendedAction:
              'Add helpful, intent-aligned sections answering core user questions rather than filler copy.',
            evidence: ev,
          });
        } else if (htmlExtract.wordCount < 300 && (pageType === 'blog' || pageType === 'resource' || pageType === 'service')) {
          score -= 3;
          problems.push(`Limited content depth (${htmlExtract.wordCount} words for a ${pageType} page).`);
          recs.push('Deepen coverage with use cases, process clarity, and structured subheadings.');
        }

        if (activeTargetKw && !keywordTokensMatch(htmlExtract.bodyTextExcerpt, activeTargetKw)) {
          score -= 4;
          problems.push(`Primary keyword "${activeTargetKw}" is under-represented in opening body copy.`);
          recs.push(`Address "${activeTargetKw}" clearly within the introduction and core sections.`);
        }

        const missingSecondaries = secondaryKeywords.filter(
          (sk) => !keywordTokensMatch(htmlExtract.bodyTextExcerpt, sk),
        );
        if (missingSecondaries.length > 0) {
          score -= 2;
          problems.push(
            `Secondary keyword coverage gap: ${missingSecondaries.slice(0, 3).join(', ')}.`,
          );
          recs.push(`Cover related topics (${missingSecondaries.slice(0, 3).join(', ')}) naturally in subheadings.`);
        }

        if (suggestedSubtopics.length > 0) {
          issues.push({
            issueKey: 'onpage_content_coverage_gap',
            category: 'content',
            severity: 'Low',
            title: 'Supporting Subtopic Coverage Opportunity',
            description: `Related cluster/competitor subtopics identified for ${path}: ${suggestedSubtopics.slice(0, 4).join(', ')}.`,
            recommendedAction:
              'Add dedicated H2/H3 sections addressing these verified subtopics in the optimization draft.',
            evidence: ev,
          });
        }

        categories.push({
          category: 'contentRelevance',
          label: 'Content Relevance',
          status: 'scored',
          score: Math.max(0, score),
          maxScore: 15,
          summary:
            problems.length === 0
              ? `${htmlExtract.wordCount} words extracted with aligned topic coverage.`
              : problems[0],
          problems,
          recommendations: recs,
          evidence: ev,
        });
      }
    }

    // -----------------------------------------------------------------------
    // E. KEYWORD ALIGNMENT (10 pts)
    // -----------------------------------------------------------------------
    {
      if (input.keywords.length === 0 && !existingPrimaryKeyword) {
        categories.push({
          category: 'keywordAlignment',
          label: 'Keyword Alignment',
          status: 'unavailable_evidence',
          score: null,
          maxScore: 10,
          summary:
            'Unavailable Evidence — No project keywords discovered in Keyword Lab yet.',
          problems: [],
          recommendations: [
            'Discover and cluster keywords in Keyword Lab (Module 5) before scoring keyword alignment.',
          ],
          evidence: [],
        });
      } else {
        const problems: string[] = [];
        const recs: string[] = [];
        let score = 10;
        const ev: OnPageEvidenceRef[] = [
          {
            source: 'keyword_intelligence',
            label: 'Keyword Mapping State',
            url: crawlUrl.normalizedUrl,
            observedDetail: existingPrimaryKeyword
              ? `Mapped primary keyword "${existingPrimaryKeyword}" (${mappingStatus}).`
              : 'No primary keyword mapped to this URL.',
          },
        ];

        if (!existingPrimaryKeyword) {
          score -= 5;
          problems.push('Page has no approved primary keyword mapping.');
          recs.push(
            recommendedPrimaryKeyword
              ? `Review evidence-matched candidate "${recommendedPrimaryKeyword}" and approve mapping.`
              : 'Assign a verified primary keyword in Strategy & Architecture or Keyword Lab.',
          );
        }
        if (cannibalizationWarnings.length > 0) {
          score -= 5;
          problems.push(...cannibalizationWarnings);
          recs.push('Resolve keyword conflict by assigning distinct primary targets or consolidating pages.');
          issues.push({
            issueKey: 'onpage_keyword_cannibalization',
            category: 'keyword_alignment',
            severity: 'High',
            title: 'Keyword Mapping Conflict / Cannibalization',
            description: cannibalizationWarnings[0],
            recommendedAction:
              'Differentiate primary keyword targets or consolidate competing URLs.',
            evidence: ev,
          });
        }

        categories.push({
          category: 'keywordAlignment',
          label: 'Keyword Alignment',
          status: 'scored',
          score: Math.max(0, score),
          maxScore: 10,
          summary:
            problems.length === 0
              ? `Aligned with mapped keyword "${existingPrimaryKeyword}".`
              : problems[0],
          problems,
          recommendations: recs,
          evidence: ev,
        });
      }
    }

    // -----------------------------------------------------------------------
    // F. URL STRUCTURE & CANONICAL CONSISTENCY (10 pts)
    // -----------------------------------------------------------------------
    {
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: 'crawl_record',
          label: 'URL & Canonical State',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: `Path "${path}", canonicalStatus=${crawlUrl.canonicalStatus}, canonical=${crawlUrl.canonicalUrl ?? 'none'}.`,
        },
      ];

      const hasQueryParams = crawlUrl.normalizedUrl.includes('?');
      const hasUppercaseOrUnderscore = /[A-Z_]/.test(path);
      const depthSegments = path === '/' ? 0 : path.split('/').filter(Boolean).length;

      if (hasQueryParams) {
        score -= 2;
        problems.push('URL contains query parameters that may create duplicate crawl variants.');
        recs.push('Prefer clean, static hyphenated URLs with self-referencing canonicals.');
      }
      if (hasUppercaseOrUnderscore) {
        score -= 1;
        problems.push('URL path uses uppercase characters or underscores instead of lowercase hyphens.');
      }
      if (depthSegments > 4) {
        score -= 2;
        problems.push(`Deep URL nesting (${depthSegments} path segments).`);
      }
      if (crawlUrl.canonicalStatus !== 'self_referencing') {
        score -= 4;
        problems.push(`Canonical inconsistency detected (${crawlUrl.canonicalStatus}).`);
        recs.push('Verify canonical tag points cleanly to the authoritative indexable URL.');
        issues.push({
          issueKey: 'onpage_canonical_mismatch',
          category: 'url_structure',
          severity:
            crawlUrl.canonicalStatus === 'conflict' ||
            crawlUrl.canonicalStatus === 'points_error'
              ? 'High'
              : 'Medium',
          title: `Canonical URL Issue (${crawlUrl.canonicalStatus.replace(/_/g, ' ')})`,
          description: `Crawled URL ${path} reports canonical status "${crawlUrl.canonicalStatus}" (canonical: ${crawlUrl.canonicalUrl ?? 'missing'}).`,
          recommendedAction:
            'Emit a single self-referencing canonical tag on authoritative indexable URLs.',
          evidence: ev,
        });
      }

      categories.push({
        category: 'urlStructure',
        label: 'URL & Canonical Structure',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? 'Clean, readable URL with self-referencing canonical.'
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // G. IMAGE OPTIMIZATION (10 pts)
    // -----------------------------------------------------------------------
    {
      if (!htmlExtract.htmlAvailable && crawlUrl.missingAltCount === 0) {
        categories.push({
          category: 'images',
          label: 'Image Optimization',
          status: 'unavailable_evidence',
          score: null,
          maxScore: 10,
          summary:
            'Unavailable Evidence — Image elements could not be inspected without an HTML snapshot.',
          problems: [],
          recommendations: ['Run an HTML crawl to inspect image alt text, dimensions, and loading attributes.'],
          evidence: [],
        });
      } else {
        const problems: string[] = [];
        const recs: string[] = [];
        let score = 10;
        const ev: OnPageEvidenceRef[] = [
          {
            source: htmlExtract.htmlAvailable ? 'html_snapshot' : 'crawl_record',
            label: 'Image Alt & Attribute Check',
            referenceId: crawlUrl.id,
            url: crawlUrl.normalizedUrl,
            observedDetail: `${htmlExtract.imagesTotal} image(s), ${htmlExtract.imagesMissingAlt} missing alt, ${htmlExtract.imagesEmptyAlt} empty alt, ${htmlExtract.imagesMissingDimensions} missing dimensions.`,
          },
        ];

        if (htmlExtract.imagesMissingAlt > 0) {
          score -= Math.min(6, htmlExtract.imagesMissingAlt * 2);
          problems.push(`${htmlExtract.imagesMissingAlt} image(s) missing alt attributes.`);
          recs.push('Add descriptive, context-accurate alt text for every informational image.');
          issues.push({
            issueKey: 'onpage_missing_image_alt',
            category: 'images',
            severity: 'Medium',
            title: `Missing Image Alt Text (${htmlExtract.imagesMissingAlt} image${htmlExtract.imagesMissingAlt === 1 ? '' : 's'})`,
            description: `${htmlExtract.imagesMissingAlt} image element(s) on ${path} lack alt text.`,
            recommendedAction:
              'Review extracted image sources in Image Optimization and approve descriptive alt attributes.',
            evidence: ev,
          });
        }
        if (htmlExtract.imagesEmptyAlt > 0) {
          score -= 2;
          problems.push(`${htmlExtract.imagesEmptyAlt} image(s) have empty alt="" attributes (confirm decorative intent).`);
        }
        if (htmlExtract.imagesMissingDimensions > 0) {
          score -= 2;
          problems.push(`${htmlExtract.imagesMissingDimensions} image(s) lack explicit width/height attributes (CLS risk).`);
          recs.push('Set explicit width and height attributes and loading="lazy" for below-the-fold images.');
        }

        const firstMissingImg = htmlExtract.images.find(
          (img) => (!img.hasAltAttribute || img.isEmptyAlt) && img.suggestedAlt,
        );
        if (firstMissingImg && firstMissingImg.suggestedAlt) {
          recommendations.push({
            targetField: 'image_alt',
            currentValue: `${firstMissingImg.src} (alt: ${firstMissingImg.alt === null ? 'missing' : '""'})`,
            suggestedValue: firstMissingImg.suggestedAlt,
            reason: 'Improves accessibility and image topical context.',
            relatedKeyword: activeTargetKw,
            searchIntent,
            evidence: ev,
            confidence: 'Medium',
          });
        }

        categories.push({
          category: 'images',
          label: 'Image Optimization',
          status: 'scored',
          score: Math.max(0, score),
          maxScore: 10,
          summary:
            problems.length === 0
              ? htmlExtract.imagesTotal === 0
                ? 'No images detected in body HTML.'
                : `All ${htmlExtract.imagesTotal} image(s) have alt attributes and dimensions.`
              : problems[0],
          problems,
          recommendations: recs,
          evidence: ev,
        });
      }
    }

    // -----------------------------------------------------------------------
    // H. STRUCTURED DATA / SCHEMA (10 pts)
    // -----------------------------------------------------------------------
    const hasFaqSignals = htmlExtract.headings.some((h) =>
      /\bfaq|frequently asked|questions?\b/i.test(h.text),
    );
    const suggestedSchemaTypes = recommendSchemaTypesForPage(
      pageType,
      htmlExtract.detectedSchemaTypes,
      hasFaqSignals,
    );
    {
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: htmlExtract.htmlAvailable ? 'html_snapshot' : 'crawl_record',
          label: 'Detected JSON-LD Schema',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail:
            htmlExtract.detectedSchemaTypes.length > 0
              ? `Detected: ${htmlExtract.detectedSchemaTypes.join(', ')} (${htmlExtract.invalidSchemaCount} error/incomplete block(s)).`
              : 'No JSON-LD structured data detected.',
        },
      ];

      if (htmlExtract.invalidSchemaCount > 0 || crawlUrl.schemaErrors.length > 0) {
        score -= 6;
        problems.push(
          `Invalid or incomplete JSON-LD structured data detected (${Math.max(htmlExtract.invalidSchemaCount, crawlUrl.schemaErrors.length)} issue(s)).`,
        );
        recs.push('Fix JSON-LD syntax errors and populate required schema properties.');
        issues.push({
          issueKey: 'onpage_invalid_schema',
          category: 'structured_data',
          severity: 'High',
          title: 'Invalid or Incomplete Structured Data',
          description: `Schema validation flagged ${Math.max(htmlExtract.invalidSchemaCount, crawlUrl.schemaErrors.length)} error(s) on ${path}.`,
          recommendedAction:
            'Correct JSON-LD formatting and required fields before re-crawling.',
          evidence: ev,
        });
      } else if (htmlExtract.detectedSchemaTypes.length === 0) {
        score -= 4;
        problems.push('No JSON-LD structured data detected on this page.');
        if (suggestedSchemaTypes.length > 0) {
          recs.push(`Consider adding ${suggestedSchemaTypes.join(', ')} JSON-LD markup matching visible page content.`);
          issues.push({
            issueKey: 'onpage_missing_schema',
            category: 'structured_data',
            severity: 'Low',
            title: 'Missing Structured Data Markup',
            description: `No JSON-LD schema detected on ${path} (${pageType} page).`,
            recommendedAction: `Draft and approve ${suggestedSchemaTypes.join(', ')} JSON-LD matching verified page facts.`,
            evidence: ev,
          });
          recommendations.push({
            targetField: 'schema',
            currentValue: 'No JSON-LD detected',
            suggestedValue: `Suggested schema types: ${suggestedSchemaTypes.join(', ')}`,
            reason: `Aligns machine-readable entity context for ${pageType} pages without fabricating unverified fields.`,
            relatedKeyword: activeTargetKw,
            searchIntent,
            evidence: ev,
            confidence: 'Medium',
          });
        }
      }

      categories.push({
        category: 'structuredData',
        label: 'Structured Data',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? `Valid schema detected (${htmlExtract.detectedSchemaTypes.join(', ')}).`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // I. INTERNAL LINKING (10 pts) — reuses Module 7 recommendations + crawl link graph
    // -----------------------------------------------------------------------
    {
      const inboundCount = inboundCountByPath.get(path) ?? 0;
      const outboundCount = crawlUrl.internalLinks.length;
      const pageLinkRecs = input.internalLinkRecs.filter(
        (r) =>
          normalizeUrlPath(r.sourceUrl) === path ||
          normalizeUrlPath(r.targetUrl) === path,
      );
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 10;
      const ev: OnPageEvidenceRef[] = [
        {
          source: 'internal_links',
          label: 'Crawl Internal Link Graph',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: `${inboundCount} inbound internal link(s), ${outboundCount} outbound internal link(s), ${htmlExtract.weakAnchorCount} weak anchor(s), ${pageLinkRecs.length} Module 7 link recommendation(s).`,
        },
      ];

      if (path !== '/' && inboundCount === 0) {
        score -= 5;
        problems.push('Crawl-confirmed orphan page (0 inbound internal links).');
        recs.push('Add contextual internal links from parent hub/category pages.');
      } else if (path !== '/' && inboundCount === 1) {
        score -= 2;
        problems.push('Under-linked page (only 1 inbound internal link in latest crawl).');
        recs.push('Add 1–2 contextual links from thematically related pages.');
      }
      if (outboundCount === 0 && crawlUrl.indexability === 'Indexable') {
        score -= 3;
        problems.push('Dead-end page with 0 outbound internal links.');
        recs.push('Link out to relevant parent hubs and supporting pages.');
      }
      if (htmlExtract.weakAnchorCount > 0) {
        score -= 2;
        problems.push(`${htmlExtract.weakAnchorCount} weak or empty internal link anchor(s) (e.g., "click here", "read more").`);
        recs.push('Replace generic anchors with descriptive topical anchor text.');
      }

      if (problems.length > 0) {
        issues.push({
          issueKey: 'onpage_weak_internal_linking',
          category: 'internal_linking',
          severity: path !== '/' && inboundCount === 0 ? 'High' : 'Medium',
          title:
            path !== '/' && inboundCount === 0
              ? 'Orphan Page — Zero Inbound Internal Links'
              : 'Weak Internal Linking or Generic Anchors',
          description: problems.join(' '),
          recommendedAction:
            'Approve and implement contextual Module 7 internal link recommendations.',
          evidence: ev,
        });
      }

      categories.push({
        category: 'internalLinking',
        label: 'Internal Linking',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 10,
        summary:
          problems.length === 0
            ? `${inboundCount} inbound / ${outboundCount} outbound internal links.`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    // -----------------------------------------------------------------------
    // J. TECHNICAL PAGE SIGNALS (5 pts)
    // -----------------------------------------------------------------------
    {
      const problems: string[] = [];
      const recs: string[] = [];
      let score = 5;
      const ev: OnPageEvidenceRef[] = [
        {
          source: 'crawl_record',
          label: 'HTTP & Indexability Signals',
          referenceId: crawlUrl.id,
          url: crawlUrl.normalizedUrl,
          observedDetail: `HTTP ${crawlUrl.statusCode}, ${crawlUrl.indexability} (${crawlUrl.indexabilityReason}), viewport=${crawlUrl.hasViewport}, lang=${crawlUrl.htmlLang ?? 'missing'}.`,
        },
      ];

      if (crawlUrl.statusCode >= 400) {
        score = 0;
        problems.push(`HTTP ${crawlUrl.statusCode} error status code.`);
      } else if (crawlUrl.statusCode >= 300) {
        score -= 2;
        problems.push(`Redirect status HTTP ${crawlUrl.statusCode}.`);
      }
      if (crawlUrl.indexability !== 'Indexable') {
        score -= 2;
        problems.push(`Non-indexable page (${crawlUrl.indexabilityReason}).`);
      }
      if (!crawlUrl.hasViewport) {
        score -= 1;
        problems.push('Missing mobile viewport meta tag.');
      }

      categories.push({
        category: 'technicalSignals',
        label: 'Technical Page Signals',
        status: 'scored',
        score: Math.max(0, score),
        maxScore: 5,
        summary:
          problems.length === 0
            ? `HTTP ${crawlUrl.statusCode}, indexable, mobile viewport present.`
            : problems[0],
        problems,
        recommendations: recs,
        evidence: ev,
      });
    }

    const scoreBreakdown = computeExplainableOnPageScore(categories);

    results.set(crawlUrl.id, {
      pageType,
      htmlExtract,
      keywordContext,
      suggestedSchemaTypes,
      suggestedSubtopics,
      scoreBreakdown,
      issues,
      recommendations,
    });
  }

  return results;
}

/**
 * Verifies an externally applied optimization draft against a freshly crawled URL record.
 * Never claims Verified unless observed crawl data actually matches proposed values.
 */
export function verifyDraftAgainstFreshCrawl(params: {
  draft: OnPageOptimizationDraftRecord;
  freshCrawlUrl: CrawlURLRecord | null;
  freshHtmlSnapshot: string | null;
}): {
  verificationStatus:
    | 'verified'
    | 'partially_verified'
    | 'not_reflected'
    | 'crawl_missing';
  matchedChecksCount: number;
  totalChecksCount: number;
  diffs: ValidationFieldDiff[];
  summary: string;
} {
  if (!params.freshCrawlUrl) {
    return {
      verificationStatus: 'crawl_missing',
      matchedChecksCount: 0,
      totalChecksCount: 0,
      diffs: [],
      summary:
        'Fresh crawl record not found for this URL. Run a new authorized crawl before verifying live changes.',
    };
  }

  const freshExtract = extractOnPageSignalsFromHtml({
    crawlUrl: params.freshCrawlUrl,
    htmlSnapshot: params.freshHtmlSnapshot,
  });
  const proposed: OnPageDraftContentPayload = params.draft.proposed;
  const diffs: ValidationFieldDiff[] = [];

  if (proposed.proposedTitle.trim()) {
    const expected = proposed.proposedTitle.trim();
    const observed = (params.freshCrawlUrl.title ?? '').trim();
    const matched = observed.toLowerCase() === expected.toLowerCase();
    diffs.push({
      field: 'title',
      expected,
      observedInCrawl: observed || '(Missing)',
      matched,
      detail: matched
        ? 'Fresh crawl confirmed proposed <title> is live.'
        : 'Fresh crawl <title> does not yet match approved draft.',
    });
  }

  if (proposed.proposedMetaDescription.trim()) {
    const expected = proposed.proposedMetaDescription.trim();
    const observed = (params.freshCrawlUrl.metaDescription ?? '').trim();
    const matched = observed.toLowerCase() === expected.toLowerCase();
    diffs.push({
      field: 'meta_description',
      expected,
      observedInCrawl: observed || '(Missing)',
      matched,
      detail: matched
        ? 'Fresh crawl confirmed proposed meta description is live.'
        : 'Fresh crawl meta description does not yet match approved draft.',
    });
  }

  if (proposed.proposedH1.trim()) {
    const expected = proposed.proposedH1.trim();
    const observed = (freshExtract.h1List[0] ?? params.freshCrawlUrl.h1 ?? '').trim();
    const matched = observed.toLowerCase() === expected.toLowerCase();
    diffs.push({
      field: 'h1',
      expected,
      observedInCrawl: observed || '(Missing)',
      matched,
      detail: matched
        ? 'Fresh crawl confirmed proposed H1 is live.'
        : 'Fresh crawl H1 does not yet match approved draft.',
    });
  }

  if (proposed.proposedSchemaTypes.length > 0) {
    const detectedLower = new Set(
      freshExtract.detectedSchemaTypes.map((s) => s.toLowerCase()),
    );
    const matched = proposed.proposedSchemaTypes.every((t) =>
      detectedLower.has(t.toLowerCase()),
    );
    diffs.push({
      field: 'schema',
      expected: proposed.proposedSchemaTypes.join(', '),
      observedInCrawl:
        freshExtract.detectedSchemaTypes.join(', ') || '(None detected)',
      matched,
      detail: matched
        ? 'All proposed JSON-LD schema types confirmed in fresh crawl.'
        : 'One or more proposed schema types are not yet detected in fresh crawl.',
    });
  }

  if (proposed.proposedImageAlts.length > 0) {
    const matched = freshExtract.imagesMissingAlt === 0;
    diffs.push({
      field: 'image_alt',
      expected: '0 images missing alt attributes',
      observedInCrawl: `${freshExtract.imagesMissingAlt} image(s) missing alt`,
      matched,
      detail: matched
        ? 'Fresh crawl confirmed zero missing image alt attributes.'
        : `Fresh crawl still observes ${freshExtract.imagesMissingAlt} image(s) missing alt text.`,
    });
  }

  const totalChecksCount = diffs.length;
  const matchedChecksCount = diffs.filter((d) => d.matched).length;

  if (totalChecksCount === 0) {
    return {
      verificationStatus: 'not_reflected',
      matchedChecksCount: 0,
      totalChecksCount: 0,
      diffs,
      summary: 'Draft contains no verifiable fields to check against crawl data.',
    };
  }

  if (matchedChecksCount === totalChecksCount) {
    return {
      verificationStatus: 'verified',
      matchedChecksCount,
      totalChecksCount,
      diffs,
      summary: `Verified — All ${matchedChecksCount}/${totalChecksCount} approved draft fields confirmed in fresh crawl ${params.freshCrawlUrl.crawlId}.`,
    };
  }

  if (matchedChecksCount > 0) {
    return {
      verificationStatus: 'partially_verified',
      matchedChecksCount,
      totalChecksCount,
      diffs,
      summary: `Partially Verified — ${matchedChecksCount}/${totalChecksCount} draft fields reflected in fresh crawl ${params.freshCrawlUrl.crawlId}.`,
    };
  }

  return {
    verificationStatus: 'not_reflected',
    matchedChecksCount: 0,
    totalChecksCount,
    diffs,
    summary: `Not Yet Reflected — 0/${totalChecksCount} draft changes observed in fresh crawl ${params.freshCrawlUrl.crawlId}.`,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeOnPageReportToCsv(
  pages: OnPagePageAnalysisRecord[],
): string {
  const headers = [
    'URL',
    'Page Type',
    'HTTP Status',
    'Indexability',
    'Overall Score',
    'Score Status',
    'Issues',
    'Primary Keyword',
    'Mapping Status',
    'Title',
    'Meta Description',
    'H1',
    'Detected Schema',
    'Missing Alt Count',
    'Lifecycle Status',
  ];
  const rows = pages.map((p) =>
    [
      p.url,
      p.pageType,
      String(p.statusCode),
      p.indexability,
      p.overallScore !== null ? String(p.overallScore) : 'Insufficient Evidence',
      p.scoreStatus,
      String(p.issueCount),
      p.keywordContext.existingPrimaryKeyword ?? 'Unmapped',
      p.keywordContext.mappingStatus,
      p.title ?? '',
      p.metaDescription ?? '',
      p.h1 ?? '',
      p.htmlExtract.detectedSchemaTypes.join('; '),
      String(p.htmlExtract.imagesMissingAlt),
      p.lifecycleStatus,
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}
