import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import type { UserRole } from '../../types/auth';
import type {
  CompetitorApprovalHistoryEntry,
  CompetitorApprovalStatus,
  CompetitorCategory,
  CompetitorComparisonRow,
  CompetitorDataProvenance,
  CompetitorKeywordOverlapRow,
  CompetitorPageSnapshot,
  CompetitorProfileRecord,
  ContentGapRecommendation,
  ContentGapType,
  ProjectCrawledContentSummary,
} from '../../types/competitors';
import type { GeoTargetMarket } from '../../types/geographic';
import type { KeywordBusinessProfile, KeywordIntelligenceRecord } from '../../types/keywords';
import {
  classifyKeywordIntent,
  normalizeKeywordText,
  tokenizeKeyword,
} from '../keywords/intelligenceEngine';

const COMP_OWNER_APPROVER_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
];

const COMP_STRATEGIST_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
];

const STOP_PHRASE_PATTERNS = [
  /^privacy policy$/i,
  /^terms of service$/i,
  /^terms and conditions$/i,
  /^cookie policy$/i,
  /^sign in$/i,
  /^log in$/i,
  /^contact us$/i,
  /^about us$/i,
  /^all rights reserved$/i,
  /^skip to content$/i,
  /^menu$/i,
];

export function canUserApproveCompetitors(role: UserRole): boolean {
  return COMP_OWNER_APPROVER_ROLES.includes(role);
}

export function canUserManageCompetitors(role: UserRole): boolean {
  return COMP_STRATEGIST_ROLES.includes(role);
}

export function canUserApproveContentGaps(role: UserRole): boolean {
  return COMP_OWNER_APPROVER_ROLES.includes(role);
}

export function canUserRecommendContentGaps(role: UserRole): boolean {
  return COMP_STRATEGIST_ROLES.includes(role);
}

export function normalizeCompetitorDomain(rawInput: string): {
  domain: string;
  homepageUrl: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('BAD_REQUEST: Competitor domain or URL is required.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`BAD_REQUEST: Invalid competitor URL "${rawInput}".`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!hostname || !hostname.includes('.')) {
    throw new Error(`BAD_REQUEST: "${rawInput}" is not a valid public domain.`);
  }

  return {
    domain: hostname,
    homepageUrl: `${parsed.protocol}//${parsed.hostname}`,
  };
}

export function extractJsonLdSchemaTypes(html: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        const obj = node as Record<string, unknown>;
        if (typeof obj['@type'] === 'string') {
          found.add(obj['@type']);
        } else if (Array.isArray(obj['@type'])) {
          obj['@type'].forEach((t) => {
            if (typeof t === 'string') found.add(t);
          });
        }
        if (obj['@graph']) walk(obj['@graph']);
      };
      walk(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks rather than crashing analysis
    }
  });
  return Array.from(found);
}

export function extractHtmlPageSignals(params: {
  html: string;
  url: string;
  statusCode: number;
  contentType: string;
  responseTimeMs: number;
  collectedAt?: string;
}): Omit<CompetitorPageSnapshot, 'id' | 'tenantId' | 'projectId' | 'competitorId'> {
  const now = params.collectedAt ?? new Date().toISOString();
  const $ = cheerio.load(params.html);

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const metaDescription =
    $('meta[name="description"]').attr('content')?.replace(/\s+/g, ' ').trim() ?? '';
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const canonicalRaw = $('link[rel="canonical"]').attr('href')?.trim() ?? null;
  const hasOpenGraph =
    Boolean($('meta[property="og:title"]').attr('content')) ||
    Boolean($('meta[property="og:description"]').attr('content'));
  const schemaTypes = extractJsonLdSchemaTypes(params.html);

  const headings: string[] = [];
  $('h2, h3')
    .slice(0, 18)
    .each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length >= 4 && text.length <= 120 && !headings.includes(text)) {
        headings.push(text);
      }
    });

  // Compute body word count cleanly after removing non-visible elements
  const $bodyClone = cheerio.load(params.html);
  $bodyClone('script, style, noscript, svg, template').remove();
  const visibleText = ($bodyClone('body').text() || $bodyClone.text())
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).filter(Boolean).length : 0;

  // Extract genuine topic phrases from Title, H1, and H2/H3 headings
  const topicCandidates = [title, h1, ...headings];
  const extractedTopics: string[] = [];
  const seenNorm = new Set<string>();

  for (const raw of topicCandidates) {
    if (!raw) continue;
    // Split multi-part title tags like "Technical SEO Audits | Acme Agency"
    const segments = raw.split(/\s*[|–—•·]\s*|\s+-\s+/);
    for (const seg of segments) {
      const cleaned = seg.replace(/\s+/g, ' ').trim();
      const words = cleaned.split(/\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 7) continue;
      if (STOP_PHRASE_PATTERNS.some((re) => re.test(cleaned))) continue;
      const norm = normalizeKeywordText(cleaned);
      if (!norm || norm.length < 5 || seenNorm.has(norm)) continue;
      seenNorm.add(norm);
      extractedTopics.push(norm);
      if (extractedTopics.length >= 14) break;
    }
    if (extractedTopics.length >= 14) break;
  }

  let hostname = params.url;
  try {
    hostname = new URL(params.url).hostname;
  } catch {
    // keep raw url fallback
  }

  return {
    url: params.url,
    normalizedUrl: params.url.split('#')[0],
    statusCode: params.statusCode,
    contentType: params.contentType,
    responseTimeMs: params.responseTimeMs,
    title,
    metaDescription,
    h1,
    headings,
    wordCount,
    canonicalUrl: canonicalRaw,
    schemaTypes,
    hasOpenGraph,
    extractedTopics,
    provenance: {
      source: `Direct SSRF-Guarded HTML Fetch (${hostname})`,
      collectedAt: now,
      reportingPeriod: 'Live Snapshot',
      measurementStatus: 'measured',
      methodology:
        'Fetched public HTTP HTML via validateOutboundUrl SSRF guard and parsed title, meta, headings, schema JSON-LD, and visible body word count with cheerio.',
      limitations:
        'Reflects static HTTP HTML snapshot; JS-only client-rendered text, paid traffic estimates, and domain backlinks are not inferred.',
    },
    fetchedAt: now,
  };
}

export function discoverInternalLinksFromHtml(
  html: string,
  baseUrl: string,
  maxLinks = 4,
): string[] {
  const $ = cheerio.load(html);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const baseHost = base.hostname.toLowerCase().replace(/^www\./, '');
  const candidates: { url: string; score: number }[] = [];
  const seen = new Set<string>([base.toString().replace(/\/+$/, '')]);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    try {
      const resolved = new URL(href, base);
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      const host = resolved.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== baseHost) return;
      resolved.hash = '';
      resolved.search = '';
      const norm = resolved.toString().replace(/\/+$/, '');
      if (seen.has(norm)) return;
      const pathname = resolved.pathname.toLowerCase();
      if (
        /\.(png|jpg|jpeg|webp|svg|pdf|css|js|xml|zip)$/i.test(pathname) ||
        /\/(login|signin|signup|privacy|terms|cookie|wp-admin|cart|checkout)/i.test(pathname)
      ) {
        return;
      }
      seen.add(norm);
      const depth = pathname.split('/').filter(Boolean).length;
      if (depth === 0 || depth > 3) return;
      const text = $(el).text().trim().toLowerCase();
      let priority = 10 - depth;
      if (
        /(service|solution|audit|seo|pricing|platform|feature|product|guide|blog|resource)/i.test(
          `${pathname} ${text}`,
        )
      ) {
        priority += 10;
      }
      candidates.push({ url: resolved.toString(), score: priority });
    } catch {
      // Ignore malformed links
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxLinks).map((c) => c.url);
}

export function applyCompetitorRecommendation(params: {
  existing: CompetitorProfileRecord | null;
  tenantId: string;
  projectId: string;
  domain: string;
  name: string;
  homepageUrl: string;
  category: CompetitorCategory;
  targetMarkets: string[];
  discoveryOrigin: CompetitorProfileRecord['discoveryOrigin'];
  discoveryEvidence: string;
  notes: string;
  actorName: string;
  actorRole: string;
}): CompetitorProfileRecord {
  const now = new Date().toISOString();
  if (params.existing && params.existing.approvalStatus === 'approved') {
    const entry: CompetitorApprovalHistoryEntry = {
      id: `compah-${crypto.randomUUID().slice(0, 8)}`,
      actorName: params.actorName,
      actorRole: params.actorRole,
      previousStatus: params.existing.approvalStatus,
      newStatus: params.existing.approvalStatus,
      reason: `Strategist annotation preserved owner-approved competitor: ${params.notes || params.discoveryEvidence || 'Updated notes'}`,
      timestamp: now,
    };
    return {
      ...params.existing,
      notes: params.notes || params.existing.notes,
      targetMarkets:
        params.targetMarkets.length > 0
          ? params.targetMarkets
          : params.existing.targetMarkets,
      approvalHistory: [entry, ...params.existing.approvalHistory].slice(0, 25),
      updatedAt: now,
    };
  }

  const prevStatus: CompetitorApprovalStatus | 'none' =
    params.existing?.approvalStatus ?? 'none';
  const entry: CompetitorApprovalHistoryEntry = {
    id: `compah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.actorName,
    actorRole: params.actorRole,
    previousStatus: prevStatus,
    newStatus: 'pending_owner_approval',
    reason:
      params.discoveryEvidence ||
      params.notes ||
      'Recommended competitor domain pending owner approval.',
    timestamp: now,
  };

  return {
    id: params.existing?.id ?? `comp-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    domain: params.domain.toLowerCase(),
    name: params.name.trim() || params.domain,
    homepageUrl: params.homepageUrl,
    category: params.category,
    targetMarkets: params.targetMarkets,
    discoveryOrigin: params.existing?.discoveryOrigin ?? params.discoveryOrigin,
    discoveryEvidence: params.discoveryEvidence || params.existing?.discoveryEvidence || '',
    approvalStatus: 'pending_owner_approval',
    approvedBy: null,
    approvedAt: null,
    recommendedBy: params.actorName,
    notes: params.notes,
    lastAnalyzedAt: params.existing?.lastAnalyzedAt ?? null,
    analyzedPagesCount: params.existing?.analyzedPagesCount ?? 0,
    externalDomainAuthority: params.existing?.externalDomainAuthority ?? null,
    externalMonthlyTraffic: params.existing?.externalMonthlyTraffic ?? null,
    externalBacklinksCount: params.existing?.externalBacklinksCount ?? null,
    provenance: params.existing?.provenance ?? {
      source: 'Strategist Recommendation (Pending Owner Approval)',
      collectedAt: null,
      reportingPeriod: 'Current',
      measurementStatus: 'unavailable',
      methodology: 'Submitted for review; awaiting live HTML snapshot.',
      limitations: 'External traffic, domain rating, and backlinks require paid provider integration.',
    },
    approvalHistory: [entry, ...(params.existing?.approvalHistory ?? [])].slice(0, 25),
    createdAt: params.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function matchKeywordToProjectPage(
  keyword: string,
  crawlPages: ProjectCrawledContentSummary[],
): { page: ProjectCrawledContentSummary; status: 'covered' | 'partial' } | null {
  const kwTokens = tokenizeKeyword(keyword).filter((t) => t.length >= 3);
  if (kwTokens.length === 0 || crawlPages.length === 0) return null;

  let best: { page: ProjectCrawledContentSummary; score: number } | null = null;
  for (const page of crawlPages) {
    if (page.statusCode >= 400) continue;
    const hay = `${page.url} ${page.title ?? ''} ${page.h1 ?? ''} ${page.headings.join(' ')}`.toLowerCase();
    const matched = kwTokens.filter((t) => hay.includes(t)).length;
    const ratio = matched / kwTokens.length;
    if (ratio >= 0.6) {
      if (!best || ratio > best.score) {
        best = { page, score: ratio };
      }
    }
  }

  if (!best) return null;
  return {
    page: best.page,
    status: best.score >= 0.85 ? 'covered' : 'partial',
  };
}

export function computeKeywordOverlap(params: {
  tenantId: string;
  projectId: string;
  competitor: CompetitorProfileRecord;
  competitorPages: CompetitorPageSnapshot[];
  projectKeywords: KeywordIntelligenceRecord[];
  crawlPages: ProjectCrawledContentSummary[];
  defaultCountry?: string;
  serpMatches?: {
    keyword: string;
    competitorUrl: string | null;
    competitorPosition: number | null;
    source: string;
  }[];
}): CompetitorKeywordOverlapRow[] {
  const now = new Date().toISOString();
  const targetCountry = (params.defaultCountry || 'US').toUpperCase();
  const rowsByKey = new Map<string, CompetitorKeywordOverlapRow>();
  const projectKwByNorm = new Map(
    params.projectKeywords.map((k) => [k.normalizedKeyword, k]),
  );

  // 1) Topics extracted directly from competitor's analyzed pages
  for (const page of params.competitorPages) {
    for (const topic of page.extractedTopics) {
      const norm = normalizeKeywordText(topic);
      if (!norm || rowsByKey.has(norm)) continue;

      const projKw = projectKwByNorm.get(norm);
      const projKwUrl = projKw?.mapping?.targetUrl ?? null;
      const projPageMatch = matchKeywordToProjectPage(norm, params.crawlPages);
      const projectCovered =
        Boolean(projKwUrl) || projPageMatch !== null;
      const projectCoverageStatus: CompetitorKeywordOverlapRow['projectCoverageStatus'] =
        projPageMatch?.status ??
        (projKwUrl ? 'covered' : 'missing');

      const intent =
        projKw?.intent ??
        classifyKeywordIntent(norm, { brandDomain: params.competitor.domain }).intent;

      rowsByKey.set(norm, {
        id: `covl-${crypto.createHash('sha1').update(`${params.competitor.id}:${norm}`).digest('hex').slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        competitorId: params.competitor.id,
        competitorDomain: params.competitor.domain,
        keyword: norm,
        intent,
        targetCountry: projKw?.targetCountry || targetCountry,
        projectCoverageStatus,
        projectUrl: projKwUrl ?? projPageMatch?.page.url ?? null,
        competitorCoverageStatus: 'covered_on_page',
        competitorUrl: page.url,
        competitorMatchReason: `Extracted from competitor page headings/title (${page.url})`,
        projectGscImpressions: projKw?.gscImpressions ?? null,
        projectGscClicks: projKw?.gscClicks ?? null,
        projectGscPosition: projKw?.gscAvgPosition ?? null,
        competitorSerpPosition: null,
        externalSearchVolume: projKw?.marketSearchVolume ?? null,
        overlapType: projectCovered ? 'shared' : 'competitor_only_gap',
        provenance: {
          source: `Competitor HTML (${params.competitor.domain}) + Project Crawl/Keywords`,
          collectedAt: page.fetchedAt,
          reportingPeriod: 'Current Snapshot',
          measurementStatus: 'measured',
          methodology:
            'Matched competitor extracted page topics against project crawled pages and Phase 7 keyword inventory.',
          limitations:
            'No external SERP rank tracker position or Keyword Planner volume invented; unmeasured fields remain null/Unavailable.',
        },
        collectedAt: now,
      });
    }
  }

  // 2) Check project tracked keywords against competitor analyzed page text
  for (const kw of params.projectKeywords) {
    const norm = kw.normalizedKeyword;
    const kwTokens = tokenizeKeyword(norm).filter((t) => t.length >= 3);
    if (kwTokens.length === 0) continue;

    const matchedCompPage = params.competitorPages.find((p) => {
      const hay = `${p.title} ${p.h1} ${p.headings.join(' ')} ${p.url}`.toLowerCase();
      const hits = kwTokens.filter((t) => hay.includes(t)).length;
      return hits / kwTokens.length >= 0.7;
    });

    const kwMappedUrl = kw.mapping?.targetUrl ?? null;
    if (matchedCompPage && !rowsByKey.has(norm)) {
      const projPageMatch = matchKeywordToProjectPage(norm, params.crawlPages);
      const covered = Boolean(kwMappedUrl) || projPageMatch !== null;
      rowsByKey.set(norm, {
        id: `covl-${crypto.createHash('sha1').update(`${params.competitor.id}:${norm}`).digest('hex').slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        competitorId: params.competitor.id,
        competitorDomain: params.competitor.domain,
        keyword: norm,
        intent: kw.intent,
        targetCountry: kw.targetCountry,
        projectCoverageStatus:
          projPageMatch?.status ?? (kwMappedUrl ? 'covered' : 'missing'),
        projectUrl: kwMappedUrl ?? projPageMatch?.page.url ?? null,
        competitorCoverageStatus: 'covered_on_page',
        competitorUrl: matchedCompPage.url,
        competitorMatchReason: `Matched Phase 7 project keyword inside ${matchedCompPage.url} content`,
        projectGscImpressions: kw.gscImpressions,
        projectGscClicks: kw.gscClicks,
        projectGscPosition: kw.gscAvgPosition,
        competitorSerpPosition: null,
        externalSearchVolume: kw.marketSearchVolume,
        overlapType: covered ? 'shared' : 'competitor_only_gap',
        provenance: {
          source: `Phase 7 Keyword Lab + ${params.competitor.domain} HTML`,
          collectedAt: matchedCompPage.fetchedAt,
          reportingPeriod: 'Current Snapshot',
          measurementStatus: 'measured',
          methodology:
            'Cross-referenced project keyword inventory tokens against fetched competitor HTML headings and titles.',
          limitations: 'Search volume shown only when sourced from authorized Google Ads data.',
        },
        collectedAt: now,
      });
    } else if (!matchedCompPage && params.competitorPages.length > 0 && kwMappedUrl && !rowsByKey.has(norm)) {
      // Project has mapped keyword coverage while competitor analyzed pages did not cover it
      rowsByKey.set(norm, {
        id: `covl-${crypto.createHash('sha1').update(`${params.competitor.id}:${norm}`).digest('hex').slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        competitorId: params.competitor.id,
        competitorDomain: params.competitor.domain,
        keyword: norm,
        intent: kw.intent,
        targetCountry: kw.targetCountry,
        projectCoverageStatus: 'covered',
        projectUrl: kwMappedUrl,
        competitorCoverageStatus: 'covered_on_page',
        competitorUrl: null,
        competitorMatchReason: 'Not observed on analyzed competitor pages',
        projectGscImpressions: kw.gscImpressions,
        projectGscClicks: kw.gscClicks,
        projectGscPosition: kw.gscAvgPosition,
        competitorSerpPosition: null,
        externalSearchVolume: kw.marketSearchVolume,
        overlapType: 'project_advantage',
        provenance: {
          source: `Phase 7 Keyword Lab vs Analyzed Pages (${params.competitor.domain})`,
          collectedAt: now,
          reportingPeriod: 'Current Snapshot',
          measurementStatus: 'inferred',
          methodology: 'Keyword present in project mapping, absent in fetched competitor sample.',
          limitations: 'Competitor may cover this topic on uncrawled URLs.',
        },
        collectedAt: now,
      });
    }
  }

  // 3) Enrich with genuine external SERP matches if configured
  for (const s of params.serpMatches ?? []) {
    const norm = normalizeKeywordText(s.keyword);
    if (!norm) continue;
    const existing = rowsByKey.get(norm);
    const projPageMatch = matchKeywordToProjectPage(norm, params.crawlPages);
    const projKw = projectKwByNorm.get(norm);

    if (existing) {
      existing.competitorSerpPosition = s.competitorPosition;
      existing.competitorCoverageStatus = 'serp_ranked';
      if (!existing.competitorUrl && s.competitorUrl) {
        existing.competitorUrl = s.competitorUrl;
      }
      existing.competitorMatchReason = `${existing.competitorMatchReason} · Live SERP #${s.competitorPosition ?? '?'} (${s.source})`;
    } else {
      const projKwUrl = projKw?.mapping?.targetUrl ?? null;
      const covered = Boolean(projKwUrl) || projPageMatch !== null;
      rowsByKey.set(norm, {
        id: `covl-${crypto.createHash('sha1').update(`${params.competitor.id}:${norm}`).digest('hex').slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        competitorId: params.competitor.id,
        competitorDomain: params.competitor.domain,
        keyword: norm,
        intent: projKw?.intent ?? classifyKeywordIntent(norm).intent,
        targetCountry: projKw?.targetCountry || targetCountry,
        projectCoverageStatus:
          projPageMatch?.status ?? (projKwUrl ? 'covered' : 'missing'),
        projectUrl: projKwUrl ?? projPageMatch?.page.url ?? null,
        competitorCoverageStatus: 'serp_ranked',
        competitorUrl: s.competitorUrl,
        competitorMatchReason: `Live SERP rank #${s.competitorPosition ?? '?'} via ${s.source}`,
        projectGscImpressions: projKw?.gscImpressions ?? null,
        projectGscClicks: projKw?.gscClicks ?? null,
        projectGscPosition: projKw?.gscAvgPosition ?? null,
        competitorSerpPosition: s.competitorPosition,
        externalSearchVolume: projKw?.marketSearchVolume ?? null,
        overlapType: covered ? 'shared' : 'competitor_only_gap',
        provenance: {
          source: s.source,
          collectedAt: now,
          reportingPeriod: 'Current Live SERP',
          measurementStatus: 'measured',
          methodology: 'Verified localized SERP ranking response.',
          limitations: 'Monthly search volume requires authorized Keyword Planner.',
        },
        collectedAt: now,
      });
    }
  }

  return Array.from(rowsByKey.values()).slice(0, 120);
}

export function identifyContentGaps(params: {
  tenantId: string;
  projectId: string;
  competitor: CompetitorProfileRecord;
  competitorPages: CompetitorPageSnapshot[];
  crawlPages: ProjectCrawledContentSummary[];
  projectKeywords: KeywordIntelligenceRecord[];
  businessProfile: KeywordBusinessProfile;
  geoMarkets: GeoTargetMarket[];
}): ContentGapRecommendation[] {
  const now = new Date().toISOString();
  const gaps: ContentGapRecommendation[] = [];
  const seenKey = new Set<string>();

  const hasCrawlBaseline = params.crawlPages.length > 0;
  const hasKeywordsBaseline = params.projectKeywords.length > 0;
  const approvedMarketNames = params.geoMarkets
    .filter((m) => m.approvalStatus === 'approved')
    .map((m) => (m.city ? `${m.city}, ${m.countryCode}` : m.countryName));
  const defaultMarket =
    approvedMarketNames[0] || params.businessProfile.targetCountry || 'Global';

  const serviceTokens = new Set(
    [
      params.businessProfile.approvedNiche,
      ...params.businessProfile.approvedServices,
    ]
      .flatMap((s) => tokenizeKeyword(s))
      .filter((t) => t.length >= 3),
  );

  for (const compPage of params.competitorPages) {
    if (compPage.statusCode >= 400 || compPage.extractedTopics.length === 0) continue;

    const primaryTopic =
      normalizeKeywordText(compPage.h1 || compPage.title || compPage.extractedTopics[0]) ||
      compPage.extractedTopics[0];
    if (!primaryTopic) continue;

    const projMatch = matchKeywordToProjectPage(primaryTopic, params.crawlPages);
    const matchingProjKw = params.projectKeywords.find(
      (k) =>
        k.normalizedKeyword === primaryTopic ||
        tokenizeKeyword(primaryTopic).every((t) => k.normalizedKeyword.includes(t)),
    );

    const isRelevantToBusiness =
      serviceTokens.size === 0 ||
      tokenizeKeyword(`${primaryTopic} ${compPage.headings.join(' ')}`).some((t) =>
        serviceTokens.has(t),
      );

    let gapType: ContentGapType | null = null;
    let explanation = '';
    let action = '';
    const supportingEvidence: string[] = [
      `Competitor page analyzed: ${compPage.url} (HTTP ${compPage.statusCode}, ${compPage.wordCount} visible words).`,
    ];
    const missingInfo: string[] = [];

    if (!hasCrawlBaseline) {
      missingInfo.push(
        'No completed Technical SEO crawl baseline exists for your project; cannot verify whether an internal URL already covers this topic.',
      );
    }
    if (params.businessProfile.approvalStatus !== 'approved') {
      missingInfo.push(
        'Project Keyword Business Profile is pending owner approval; relevance cannot be confirmed yet.',
      );
    }
    if (!matchingProjKw?.gscImpressions && !matchingProjKw?.marketSearchVolume) {
      missingInfo.push(
        'Search demand / GSC impressions for this exact query are Unavailable without connected GSC or Keyword Planner.',
      );
    }

    if (!projMatch && hasCrawlBaseline) {
      gapType = 'missing_topic_page';
      explanation = `Competitor covers "${primaryTopic}" on ${compPage.url} (${compPage.wordCount} words, ${compPage.headings.length} subheadings), whereas zero indexable pages in your latest project crawl directly match this topic.`;
      action = `Create an authoritative, non-doorway page targeting "${primaryTopic}" aligned with your approved services and target markets.`;
      supportingEvidence.push(
        `Checked ${params.crawlPages.length} crawled project URLs: no matching title/H1/URL found.`,
      );
    } else if (!projMatch && !hasCrawlBaseline) {
      gapType = 'missing_topic_page';
      explanation = `Competitor covers "${primaryTopic}" on ${compPage.url} (${compPage.wordCount} words). Project crawl baseline is not yet available to verify own-site coverage.`;
      action =
        'Run a Technical SEO Audit crawl first to verify internal coverage before creating new content.';
    } else if (
      projMatch &&
      compPage.schemaTypes.length > 0 &&
      projMatch.page.schemaTypes.length === 0
    ) {
      gapType = 'missing_schema';
      explanation = `Both sites address "${primaryTopic}", but competitor implements structured JSON-LD schema (${compPage.schemaTypes.join(', ')}) while your matched page (${projMatch.page.url}) has zero detected JSON-LD schema types.`;
      action = `Add verified ${compPage.schemaTypes.join(', ')} JSON-LD structured data on ${projMatch.page.url}.`;
      supportingEvidence.push(
        `Project URL ${projMatch.page.url} missing structured schema vs competitor (${compPage.schemaTypes.join(', ')}).`,
      );
    } else if (
      projMatch &&
      compPage.headings.length >= 5 &&
      projMatch.page.headings.length <= 1
    ) {
      gapType = 'weak_heading_structure';
      explanation = `Competitor page (${compPage.url}) organizes "${primaryTopic}" across ${compPage.headings.length} structured H2/H3 sections (${compPage.wordCount} words), while ${projMatch.page.url} exposes only ${projMatch.page.headings.length} subheading(s).`;
      action = `Expand topical depth and H2/H3 section coverage on ${projMatch.page.url} using real domain expertise.`;
      supportingEvidence.push(
        `Competitor headings observed: ${compPage.headings.slice(0, 4).join(' · ')}`,
      );
    }

    if (!gapType) continue;

    // Also inspect geographic relevance without encouraging thin doorway pages
    const geoMatched = approvedMarketNames.find((mkt) =>
      compPage.url.toLowerCase().includes(mkt.split(',')[0].trim().toLowerCase()),
    );
    if (geoMatched && gapType === 'missing_topic_page') {
      gapType = 'missing_geo_coverage';
      supportingEvidence.push(`Aligns with owner-approved target market: ${geoMatched}.`);
    }

    if (compPage.schemaTypes.length > 0) {
      supportingEvidence.push(
        `Competitor schema types detected: ${compPage.schemaTypes.join(', ')}.`,
      );
    }
    if (matchingProjKw?.gscImpressions !== null && matchingProjKw?.gscImpressions !== undefined) {
      supportingEvidence.push(
        `GSC observed ${matchingProjKw.gscImpressions.toLocaleString()} impressions at avg pos ${matchingProjKw.gscAvgPosition?.toFixed(1) ?? '—'}.`,
      );
    }

    // Explainable opportunity scoring: STRICTLY null ("Needs Evidence") if no own-site baseline exists!
    let opportunityScore: number | null = null;
    let priorityTier: ContentGapRecommendation['priorityTier'] = 'Needs Evidence';
    let confidence: ContentGapRecommendation['confidence'] = 'Low';

    if (hasCrawlBaseline && (hasKeywordsBaseline || params.businessProfile.approvalStatus === 'approved')) {
      let score = 42;
      if (gapType === 'missing_topic_page' || gapType === 'missing_geo_coverage') score += 20;
      else if (gapType === 'missing_schema') score += 14;
      else score += 12;

      if (isRelevantToBusiness) score += 16;
      if (compPage.wordCount >= 800) score += 8;
      if (compPage.schemaTypes.length > 0) score += 6;
      if ((matchingProjKw?.gscImpressions ?? 0) >= 50) score += 8;

      opportunityScore = Math.min(96, Math.max(25, score));
      priorityTier =
        opportunityScore >= 75 ? 'High' : opportunityScore >= 52 ? 'Medium' : 'Low';
      confidence =
        isRelevantToBusiness && compPage.wordCount >= 400 ? 'High' : 'Medium';
    }

    const dedupKey = `${primaryTopic}:${gapType}`;
    if (seenKey.has(dedupKey)) continue;
    seenKey.add(dedupKey);

    const cleanSlug =
      '/' +
      primaryTopic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

    gaps.push({
      id: `cgap-${crypto.createHash('sha1').update(`${params.competitor.id}:${dedupKey}`).digest('hex').slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      competitorId: params.competitor.id,
      competitorDomain: params.competitor.domain,
      gapType,
      topicTitle: compPage.h1 || compPage.title || primaryTopic,
      targetKeyword: primaryTopic,
      targetMarket: geoMatched || defaultMarket,
      projectUrl: projMatch?.page.url ?? null,
      projectWordCount: null, // crawl_urls doesn't persist rendered word count
      projectTitle: projMatch?.page.title ?? null,
      projectH1: projMatch?.page.h1 ?? null,
      projectSchemaTypes: projMatch?.page.schemaTypes ?? [],
      competitorUrl: compPage.url,
      competitorWordCount: compPage.wordCount,
      competitorTitle: compPage.title || null,
      competitorH1: compPage.h1 || null,
      competitorHeadings: compPage.headings.slice(0, 10),
      competitorSchemaTypes: compPage.schemaTypes,
      opportunityScore,
      priorityTier,
      confidence,
      explanation,
      supportingEvidence,
      missingInfo,
      recommendedAction: action,
      recommendedBrief: {
        targetSlug: projMatch ? new URL(projMatch.page.url).pathname : cleanSlug,
        suggestedTitle: `${compPage.h1 || primaryTopic} — Service & Solution Guide`,
        suggestedH1: compPage.h1 || primaryTopic,
        suggestedSections:
          compPage.headings.length > 0
            ? compPage.headings.slice(0, 6)
            : [
                'Overview & Verified Capabilities',
                'Technical Architecture & Proof',
                'Target Market Eligibility & FAQs',
              ],
        schemaSuggestion:
          compPage.schemaTypes.length > 0
            ? compPage.schemaTypes
            : ['Service', 'FAQPage'],
        geoAlignment: geoMatched || defaultMarket,
      },
      workflowState: 'discovered',
      approvedBy: null,
      approvedAt: null,
      strategistNotes: '',
      linkedTicketId: null,
      linkedKeywordId: matchingProjKw?.id ?? null,
      provenance: {
        source: `Comparative HTML Analysis (${params.competitor.domain} vs Site Crawl)`,
        collectedAt: compPage.fetchedAt,
        reportingPeriod: 'Current Snapshot',
        measurementStatus: hasCrawlBaseline ? 'inferred' : 'unavailable',
        methodology:
          'Rule-based comparison of fetched competitor HTML depth, headings, and schema against project crawled URLs and approved business context.',
        limitations:
          'Project page word count is not stored in crawl_urls; ranking potential excludes unverified third-party traffic projections.',
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  return gaps.slice(0, 40);
}

export function buildCompetitorComparisonRows(params: {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  crawlPages: ProjectCrawledContentSummary[];
  projectKeywords: KeywordIntelligenceRecord[];
  avgMobilePerf: number | null;
  avgDesktopPerf: number | null;
  competitors: CompetitorProfileRecord[];
  competitorPages: CompetitorPageSnapshot[];
  overlaps: CompetitorKeywordOverlapRow[];
  contentGaps: ContentGapRecommendation[];
}): CompetitorComparisonRow[] {
  const projSchemas = Array.from(
    new Set(params.crawlPages.flatMap((p) => p.schemaTypes)),
  ).slice(0, 8);
  const projAvgResp =
    params.crawlPages.length > 0
      ? Math.round(
          params.crawlPages.reduce((s, p) => s + p.responseTimeMs, 0) /
            params.crawlPages.length,
        )
      : null;

  const rows: CompetitorComparisonRow[] = [
    {
      entityType: 'project',
      id: params.projectId,
      name: `${params.projectName} (Your Site)`,
      domain: params.projectWebsite,
      approvalStatus: 'project_baseline',
      analyzedPagesCount: params.crawlPages.length,
      avgWordCount: null, // Not persisted in crawl_urls schema; explicitly marked Unavailable
      avgResponseTimeMs: projAvgResp,
      schemaTypesObserved: projSchemas,
      topicKeywordsCount: params.projectKeywords.length,
      sharedKeywordsCount: params.overlaps.filter((o) => o.overlapType === 'shared').length,
      gapOpportunitiesCount: params.contentGaps.filter((g) => g.workflowState !== 'rejected')
        .length,
      projectAvgPerfMobile: params.avgMobilePerf,
      projectAvgPerfDesktop: params.avgDesktopPerf,
      externalDomainAuthority: null,
      externalMonthlyTraffic: null,
      externalBacklinksCount: null,
      dataAvailabilityNote:
        params.crawlPages.length > 0
          ? 'Site baseline sourced from Phase 3 Crawl, Phase 6 PSI, and Phase 7 Keywords. Word count & third-party DA/Backlinks unavailable without external API.'
          : 'No completed technical crawl found yet.',
    },
  ];

  for (const comp of params.competitors) {
    const pages = params.competitorPages.filter((p) => p.competitorId === comp.id);
    const compOverlaps = params.overlaps.filter((o) => o.competitorId === comp.id);
    const compGaps = params.contentGaps.filter(
      (g) => g.competitorId === comp.id && g.workflowState !== 'rejected',
    );
    const avgWords =
      pages.length > 0
        ? Math.round(pages.reduce((s, p) => s + p.wordCount, 0) / pages.length)
        : null;
    const avgResp =
      pages.length > 0
        ? Math.round(pages.reduce((s, p) => s + p.responseTimeMs, 0) / pages.length)
        : null;
    const schemas = Array.from(new Set(pages.flatMap((p) => p.schemaTypes))).slice(0, 8);
    const topicsCount = Array.from(new Set(pages.flatMap((p) => p.extractedTopics))).length;

    rows.push({
      entityType: 'competitor',
      id: comp.id,
      name: comp.name,
      domain: comp.domain,
      approvalStatus: comp.approvalStatus,
      analyzedPagesCount: pages.length,
      avgWordCount: avgWords,
      avgResponseTimeMs: avgResp,
      schemaTypesObserved: schemas,
      topicKeywordsCount: topicsCount,
      sharedKeywordsCount: compOverlaps.filter((o) => o.overlapType === 'shared').length,
      gapOpportunitiesCount: compGaps.length,
      projectAvgPerfMobile: null,
      projectAvgPerfDesktop: null,
      externalDomainAuthority: comp.externalDomainAuthority,
      externalMonthlyTraffic: comp.externalMonthlyTraffic,
      externalBacklinksCount: comp.externalBacklinksCount,
      dataAvailabilityNote:
        pages.length > 0
          ? 'On-page metrics measured via SSRF-guarded HTTP HTML fetch. External DA, backlinks, and traffic marked Unavailable.'
          : 'Not analyzed yet — trigger live HTML analysis to inspect page depth, headings, and schema.',
    });
  }

  return rows;
}
