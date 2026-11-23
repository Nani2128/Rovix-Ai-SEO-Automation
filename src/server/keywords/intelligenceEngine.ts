import type { UserRole } from '../../types/auth';
import type {
  CannibalizationAlert,
  CrawledPageOption,
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
  OpportunityScoreBreakdown,
} from '../../types/keywords';
import { ROLE_APPROVER_LIST } from '../devData';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'your',
  'our',
  'my',
]);

export function normalizeKeywordText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function tokenizeKeyword(raw: string): string[] {
  return normalizeKeywordText(raw)
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .split(/[\s-]+/)
    .map((t) => stemToken(t))
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function stemToken(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing')) return token.slice(0, -3);
  if (token.endsWith('ers')) return token.slice(0, -3);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function classifyKeywordIntent(
  keyword: string,
  opts?: { brandDomain?: string; targetCity?: string },
): {
  intent: KeywordIntent;
  intentInferred: boolean;
  confidence: number;
  reason: string;
} {
  const k = normalizeKeywordText(keyword);

  // Navigational signals
  const domainBrand = opts?.brandDomain
    ?.toLowerCase()
    .replace(/^www\./, '')
    .split('.')[0];
  if (
    /\b(login|sign in|dashboard|portal|pricing page|contact us|support portal)\b/.test(k) ||
    (domainBrand && domainBrand.length >= 3 && k.includes(domainBrand))
  ) {
    return {
      intent: 'Navigational',
      intentInferred: true,
      confidence: 0.86,
      reason: 'Inferred from brand or portal/account navigation modifiers.',
    };
  }

  // Local signals
  const city = opts?.targetCity?.trim().toLowerCase();
  if (
    /\b(near me|nearby|local|city|downtown|brooklyn|manhattan|london|toronto|austin|chicago|agency in|consultant in|service in)\b/.test(
      k,
    ) ||
    (city && city.length >= 3 && k.includes(city))
  ) {
    return {
      intent: 'Local',
      intentInferred: true,
      confidence: 0.88,
      reason: 'Inferred from geographic location or proximity modifiers.',
    };
  }

  // Direct purchase / hiring / pricing action signals
  if (
    /\b(buy|order|book|hire|quote|pricing|cost|price|demo|trial|signup|subscribe|packages|audit service)\b/.test(
      k,
    )
  ) {
    return {
      intent: 'Transactional',
      intentInferred: true,
      confidence: 0.85,
      reason: 'Inferred from direct purchase, pricing, hiring, or demo conversion modifiers.',
    };
  }

  // Commercial investigation & comparison signals
  if (
    /\b(best|top|vs|versus|compare|comparison|review|reviews|alternative|alternatives|enterprise|roi|for business|for agencies|for saas|recommended)\b/.test(
      k,
    )
  ) {
    return {
      intent: 'Commercial',
      intentInferred: true,
      confidence: 0.8,
      reason: 'Inferred from vendor evaluation, comparison, or solution research modifiers.',
    };
  }

  // Service / vendor intent nouns
  if (
    /\b(agency|company|services|consultant|software|platform|tool)\b/.test(k)
  ) {
    return {
      intent: 'Transactional',
      intentInferred: true,
      confidence: 0.78,
      reason: 'Inferred from service provider or solution product modifiers.',
    };
  }

  // Informational default
  return {
    intent: 'Informational',
    intentInferred: true,
    confidence: 0.72,
    reason:
      'Inferred informational intent (educational, explanatory, or exploratory query structure).',
  };
}

export function evaluateBusinessRelevance(params: {
  keyword: string;
  profile: KeywordBusinessProfile;
  seedTerms: string[];
  gscImpressions?: number | null;
  mappedUrl?: string | null;
}): {
  score: number;
  passed: boolean;
  reason: string;
} {
  const kwTokens = new Set(tokenizeKeyword(params.keyword));
  if (kwTokens.size === 0) {
    return { score: 0, passed: false, reason: 'Empty or non-lexical keyword.' };
  }

  const contextStrings = [
    params.profile.approvedNiche,
    ...params.profile.approvedServices,
    params.profile.targetAudience,
    ...params.seedTerms,
  ]
    .join(' ')
    .trim();

  const contextTokens = new Set(tokenizeKeyword(contextStrings));

  let overlapCount = 0;
  for (const t of kwTokens) {
    if (contextTokens.has(t)) overlapCount += 1;
  }

  // Substring match check on core approved niche/services or seeds
  const normKw = normalizeKeywordText(params.keyword);
  const directPhraseMatch = [
    ...params.profile.approvedServices,
    ...params.seedTerms,
  ].some((s) => {
    const ns = normalizeKeywordText(s);
    return ns.length >= 3 && (normKw.includes(ns) || ns.includes(normKw));
  });

  if (directPhraseMatch) {
    return {
      score: 94,
      passed: true,
      reason: 'Directly matches approved business services or active research seed.',
    };
  }

  const overlapRatio =
    kwTokens.size > 0 ? overlapCount / Math.min(kwTokens.size, 3) : 0;

  if (overlapCount >= 2 || overlapRatio >= 0.5) {
    return {
      score: Math.min(92, Math.round(62 + overlapRatio * 28)),
      passed: true,
      reason: `Strong lexical alignment (${overlapCount} shared domain/service tokens).`,
    };
  }

  if (overlapCount === 1) {
    return {
      score: 56,
      passed: true,
      reason: 'Partial alignment with approved business niche or seed topics.',
    };
  }

  // Observed in project's own GSC or mapped to a crawled URL implies some site relevance
  if ((params.gscImpressions ?? 0) > 0 || params.mappedUrl) {
    return {
      score: 48,
      passed: true,
      reason:
        'Observed in site Search Console queries or crawled page content; verify service alignment.',
    };
  }

  return {
    score: 12,
    passed: false,
    reason:
      'Failed mandatory business relevance gate: no overlap with approved niche, services, or seed topics.',
  };
}

export function scoreKeywordOpportunity(params: {
  keyword: string;
  intent: KeywordIntent;
  profile: KeywordBusinessProfile;
  seedTerms: string[];
  sourcesCount: number;
  isAiSuggestion: boolean;
  marketSearchVolume: number | null;
  competitionLevel: 'low' | 'medium' | 'high' | 'unavailable';
  relativeTrendIndex: number | null;
  trendDirection: 'rising' | 'stable' | 'declining' | 'unavailable';
  gscClicks: number | null;
  gscImpressions: number | null;
  gscAvgPosition: number | null;
  targetCountry: string;
  targetCity: string;
  mappedPageIndexable: boolean | null;
  mappedStatusCode: number | null;
  mappedExistingUrl: string | null;
}): OpportunityScoreBreakdown {
  const weights = {
    businessRelevance: 0.28,
    searchIntent: 0.16,
    evidenceQuality: 0.18,
    marketRelevance: 0.12,
    pageSuitability: 0.12,
    competitionEvidence: 0.06,
    conversionPotential: 0.08,
  };

  const relevance = evaluateBusinessRelevance({
    keyword: params.keyword,
    profile: params.profile,
    seedTerms: params.seedTerms,
    gscImpressions: params.gscImpressions,
    mappedUrl: params.mappedExistingUrl,
  });

  const intentWeights: Record<KeywordIntent, number> = {
    Transactional: 92,
    Commercial: 86,
    Local: 88,
    Informational: 66,
    Navigational: 52,
  };
  const searchIntent = intentWeights[params.intent] ?? 65;

  // Evidence quality rewards genuine observed/external corroboration, never rewards AI-only guesses highly
  let evidenceQuality = 20;
  if (params.gscImpressions !== null && params.gscImpressions > 0) evidenceQuality += 32;
  if (params.marketSearchVolume !== null && params.marketSearchVolume > 0) evidenceQuality += 24;
  if (params.relativeTrendIndex !== null) evidenceQuality += 14;
  if (params.sourcesCount >= 2) evidenceQuality += 15;
  if (params.isAiSuggestion && params.sourcesCount === 1) evidenceQuality = Math.min(evidenceQuality, 32);
  evidenceQuality = Math.min(100, evidenceQuality);

  // Market relevance uses country/city match & relative trend momentum honestly
  let marketRelevance =
    params.targetCountry &&
    params.profile.targetCountry &&
    params.targetCountry.toUpperCase() === params.profile.targetCountry.toUpperCase()
      ? 68
      : 45;
  if (params.trendDirection === 'rising') marketRelevance += 22;
  else if (params.trendDirection === 'stable') marketRelevance += 10;
  if (
    params.targetCity &&
    normalizeKeywordText(params.keyword).includes(params.targetCity.toLowerCase())
  ) {
    marketRelevance += 12;
  }
  marketRelevance = Math.min(100, marketRelevance);

  // Page suitability checks real crawled URL suitability & GSC ranking opportunity (positions 5-25 = quick win!)
  let pageSuitability = 38;
  if (params.mappedExistingUrl) {
    if (params.mappedStatusCode === 200 && params.mappedPageIndexable !== false) {
      pageSuitability = 76;
    } else if (params.mappedPageIndexable === false || (params.mappedStatusCode ?? 200) >= 400) {
      pageSuitability = 32;
    } else {
      pageSuitability = 58;
    }
  } else {
    pageSuitability = 52; // New dedicated page candidate
  }
  if (params.gscAvgPosition !== null) {
    if (params.gscAvgPosition >= 4 && params.gscAvgPosition <= 20) {
      pageSuitability = Math.min(100, pageSuitability + 20);
    } else if (params.gscAvgPosition > 20 && params.gscAvgPosition <= 45) {
      pageSuitability = Math.min(100, pageSuitability + 10);
    }
  }

  // Competition evidence: strictly 0 when unavailable (honest scoring, never invented!)
  let competitionEvidence = 0;
  if (params.competitionLevel === 'low') competitionEvidence = 90;
  else if (params.competitionLevel === 'medium') competitionEvidence = 62;
  else if (params.competitionLevel === 'high') competitionEvidence = 34;

  // Conversion potential
  const conversionMap: Record<KeywordIntent, number> = {
    Transactional: 94,
    Local: 88,
    Commercial: 80,
    Informational: 46,
    Navigational: 55,
  };
  let conversionPotential = conversionMap[params.intent] ?? 50;
  if ((params.gscClicks ?? 0) > 10) conversionPotential = Math.min(100, conversionPotential + 6);

  const weighted =
    relevance.score * weights.businessRelevance +
    searchIntent * weights.searchIntent +
    evidenceQuality * weights.evidenceQuality +
    marketRelevance * weights.marketRelevance +
    pageSuitability * weights.pageSuitability +
    competitionEvidence * weights.competitionEvidence +
    conversionPotential * weights.conversionPotential;

  const totalScore = relevance.passed
    ? Math.max(1, Math.min(100, Math.round(weighted)))
    : Math.min(34, Math.round(weighted));

  const reasons: string[] = [relevance.reason];
  if (params.gscImpressions !== null) {
    reasons.push(
      `GSC observed ${params.gscImpressions.toLocaleString()} impressions & ${params.gscClicks ?? 0} clicks (avg pos ${params.gscAvgPosition?.toFixed(1) ?? 'N/A'}).`,
    );
  }
  if (params.marketSearchVolume !== null) {
    reasons.push(
      `Keyword Planner market volume: ${params.marketSearchVolume.toLocaleString()}/mo.`,
    );
  } else {
    reasons.push(
      'External monthly search volume unavailable (Keyword Planner API not connected).',
    );
  }
  if (params.relativeTrendIndex !== null) {
    reasons.push(
      `Google Trends relative interest index: ${params.relativeTrendIndex}/100 (${params.trendDirection}).`,
    );
  }
  if (params.competitionLevel === 'unavailable') {
    reasons.push('Competition difficulty scored 0/100 due to unavailable competition data.');
  }

  return {
    businessRelevance: relevance.score,
    searchIntent,
    evidenceQuality,
    marketRelevance,
    pageSuitability,
    competitionEvidence,
    conversionPotential,
    totalScore,
    relevanceGatePassed: relevance.passed,
    weights,
    reasons,
  };
}

export function suggestBestLandingPage(
  keyword: string,
  crawledPages: (CrawledPageOption & { headings?: string[] })[],
): {
  matchedPage: CrawledPageOption | null;
  confidence: number;
  recommendedSlug: string;
} {
  const kwTokens = new Set(tokenizeKeyword(keyword));
  const slugBase = normalizeKeywordText(keyword)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const recommendedSlug = `/${slugBase || 'topic'}`;

  let best: { page: CrawledPageOption; score: number } | null = null;
  for (const page of crawledPages) {
    if (page.statusCode >= 400) continue;
    let pathname = '/';
    try {
      pathname = new URL(page.url).pathname;
    } catch {
      pathname = page.url;
    }
    const pageText = [
      pathname.replace(/[-_/]/g, ' '),
      page.title ?? '',
      page.h1 ?? '',
      ...(page.headings ?? []).slice(0, 4),
    ].join(' ');

    const pageTokens = new Set(tokenizeKeyword(pageText));
    if (pageTokens.size === 0 || kwTokens.size === 0) continue;

    let overlap = 0;
    for (const t of kwTokens) {
      if (pageTokens.has(t)) overlap += 1;
    }
    if (overlap === 0) continue;

    const score = overlap / Math.max(kwTokens.size, 2);
    if (!best || score > best.score) {
      best = { page, score };
    }
  }

  if (best && best.score >= 0.45) {
    return {
      matchedPage: best.page,
      confidence: Math.min(0.95, Math.round(best.score * 100) / 100),
      recommendedSlug,
    };
  }

  return {
    matchedPage: null,
    confidence: 0,
    recommendedSlug,
  };
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function clusterKeywords(params: {
  tenantId: string;
  projectId: string;
  keywords: KeywordIntelligenceRecord[];
  existingApprovedClusters: KeywordCluster[];
  crawledPages: CrawledPageOption[];
}): {
  clusters: KeywordCluster[];
  assignments: Map<string, { clusterId: string; clusterName: string }>;
} {
  const now = new Date().toISOString();
  const assignments = new Map<string, { clusterId: string; clusterName: string }>();

  // Preserve keywords already assigned to approved/rejected manual clusters
  const lockedKeywordIds = new Set<string>();
  const keptClusters: KeywordCluster[] = params.existingApprovedClusters.map((c) => {
    for (const kid of c.keywordIds) {
      lockedKeywordIds.add(kid);
      assignments.set(kid, { clusterId: c.id, clusterName: c.clusterName });
    }
    return c;
  });

  const eligible = params.keywords.filter(
    (k) =>
      !lockedKeywordIds.has(k.id) &&
      k.workflowState !== 'rejected' &&
      k.scoreBreakdown.relevanceGatePassed,
  );

  // Build candidate clusters only when semantic cohesion meets strict threshold (>= 0.34).
  // Unrelated keywords remain ungrouped cleanly rather than being forced into noisy clusters.
  const tokenMap = new Map<string, Set<string>>(
    eligible.map((k) => [k.id, new Set(tokenizeKeyword(k.keyword))]),
  );

  const used = new Set<string>();
  const generatedClusters: KeywordCluster[] = [];

  const sorted = [...eligible].sort((a, b) => b.opportunityScore - a.opportunityScore);

  for (const anchor of sorted) {
    if (used.has(anchor.id)) continue;
    const anchorTokens = tokenMap.get(anchor.id)!;
    const anchorUrl = anchor.mapping?.targetUrl ?? anchor.gscObservedUrl ?? null;

    const group: KeywordIntelligenceRecord[] = [anchor];
    used.add(anchor.id);

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (
        candidate.targetCountry !== anchor.targetCountry ||
        candidate.targetLanguage !== anchor.targetLanguage
      ) {
        continue;
      }

      const candTokens = tokenMap.get(candidate.id)!;
      const lexicalSim = jaccardSimilarity(anchorTokens, candTokens);
      const candUrl = candidate.mapping?.targetUrl ?? candidate.gscObservedUrl ?? null;
      const sameUrlBonus = anchorUrl && candUrl && anchorUrl === candUrl ? 0.25 : 0;
      const sameIntentBonus = candidate.intent === anchor.intent ? 0.12 : 0;

      const combinedScore = lexicalSim + sameUrlBonus + sameIntentBonus;
      // Must share meaningful lexical similarity (at least 0.24 lexical or same mapped URL + shared token)
      if (lexicalSim >= 0.28 && combinedScore >= 0.4) {
        group.push(candidate);
        used.add(candidate.id);
      }
    }

    // Require at least 2 closely related keywords to form a semantic cluster;
    // singletons stay cleanly unclustered instead of inflating cluster counts.
    if (group.length < 2) {
      used.delete(anchor.id);
      continue;
    }

    const clusterId = `kwc-${anchor.normalizedKeyword.replace(/[^a-z0-9]+/g, '-').slice(0, 18)}-${Math.random().toString(36).slice(2, 6)}`;
    const built = buildClusterObject({
      clusterId,
      tenantId: params.tenantId,
      projectId: params.projectId,
      members: group,
      crawledPages: params.crawledPages,
      approvalState: 'pending_review',
      now,
    });

    generatedClusters.push(built);
    for (const m of group) {
      assignments.set(m.id, { clusterId: built.id, clusterName: built.clusterName });
    }
  }

  return {
    clusters: [...keptClusters, ...generatedClusters],
    assignments,
  };
}

export function buildClusterObject(params: {
  clusterId: string;
  tenantId: string;
  projectId: string;
  members: KeywordIntelligenceRecord[];
  crawledPages: CrawledPageOption[];
  approvalState: KeywordCluster['approvalState'];
  customName?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string;
  now?: string;
}): KeywordCluster {
  const now = params.now ?? new Date().toISOString();
  const sorted = [...params.members].sort(
    (a, b) => b.opportunityScore - a.opportunityScore,
  );
  const primary = sorted[0];

  const intentDist: Record<KeywordIntent, number> = {
    Informational: 0,
    Navigational: 0,
    Commercial: 0,
    Transactional: 0,
    Local: 0,
  };
  for (const m of sorted) {
    intentDist[m.intent] = (intentDist[m.intent] ?? 0) + 1;
  }

  const dominantIntent = (Object.entries(intentDist).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? primary.intent) as KeywordIntent;

  // Pairwise average Jaccard cohesion
  let pairSum = 0;
  let pairCount = 0;
  const sets = sorted.map((m) => new Set(tokenizeKeyword(m.keyword)));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      pairSum += jaccardSimilarity(sets[i], sets[j]);
      pairCount += 1;
    }
  }
  const cohesionScore =
    pairCount > 0 ? Math.round((pairSum / pairCount) * 100) / 100 : 1;

  const existingMappedUrl =
    sorted.find((m) => m.mapping?.mappingStatus === 'mapped_existing')?.mapping
      ?.targetUrl ??
    sorted.find((m) => m.gscObservedUrl)?.gscObservedUrl ??
    suggestBestLandingPage(primary.keyword, params.crawledPages).matchedPage?.url ??
    null;

  const recommendedPageType =
    dominantIntent === 'Transactional' || dominantIntent === 'Local'
      ? 'Dedicated Conversion / Service Page'
      : dominantIntent === 'Commercial'
        ? 'Comparison / Solution Hub'
        : 'Authoritative Guide / Topic Pillar';

  const contentGaps: string[] = [];
  if (!existingMappedUrl) {
    contentGaps.push(
      `No crawled landing page currently targets "${primary.keyword}". Create a ${recommendedPageType.toLowerCase()}.`,
    );
  }
  const unmappedSecondary = sorted.filter(
    (m) => m.id !== primary.id && m.mapping?.mappingStatus !== 'mapped_existing',
  );
  if (unmappedSecondary.length > 0) {
    contentGaps.push(
      `Include dedicated H2/FAQ sections for ${unmappedSecondary
        .slice(0, 3)
        .map((u) => `"${u.keyword}"`)
        .join(', ')}.`,
    );
  }
  if (sorted.every((m) => m.marketSearchVolume === null)) {
    contentGaps.push(
      'External monthly search volume unavailable; validate with Keyword Planner or GSC impressions before prioritizing build.',
    );
  }

  const clusterTitle =
    params.customName?.trim() ||
    primary.keyword.replace(/\b\w/g, (ch) => ch.toUpperCase());

  const evidenceSources = new Set(sorted.flatMap((m) => m.sources));

  return {
    id: params.clusterId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    clusterName: clusterTitle,
    coreTopic: primary.seedTopic ?? primary.keyword,
    primaryKeywordId: primary.id,
    primaryKeyword: primary.keyword,
    keywordIds: sorted.map((m) => m.id),
    keywordsCount: sorted.length,
    intentDistribution: intentDist,
    dominantIntent,
    suggestedLandingUrl: existingMappedUrl,
    recommendedPageType,
    contentGaps,
    cohesionScore,
    confidence: Math.min(0.95, Math.round((0.45 + cohesionScore * 0.5) * 100) / 100),
    evidenceSummary: `Grouped ${sorted.length} semantically aligned keywords (${Math.round(cohesionScore * 100)}% lexical cohesion) across ${Array.from(evidenceSources).join(', ') || 'research'}.`,
    approvalState: params.approvalState,
    approvedBy: params.approvedBy ?? null,
    approvedAt: params.approvedAt ?? null,
    mergedIntoClusterId: null,
    notes: params.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

export function detectKeywordCannibalization(params: {
  keywords: KeywordIntelligenceRecord[];
  crawledPages: CrawledPageOption[];
}): {
  alerts: CannibalizationAlert[];
  keywordRisks: Map<
    string,
    {
      risk: 'none' | 'low' | 'medium' | 'high';
      competingUrls: string[];
      competingKeywordIds: string[];
      recommendation: string | null;
    }
  >;
} {
  const alerts: CannibalizationAlert[] = [];
  const keywordRisks = new Map<
    string,
    {
      risk: 'none' | 'low' | 'medium' | 'high';
      competingUrls: string[];
      competingKeywordIds: string[];
      recommendation: string | null;
    }
  >();

  // 1. Check multiple crawled pages matching the same non-rejected keyword strongly
  for (const kw of params.keywords) {
    if (kw.workflowState === 'rejected') continue;
    const kwTokens = new Set(tokenizeKeyword(kw.keyword));
    if (kwTokens.size < 2) continue;

    const matchingPages: string[] = [];
    for (const page of params.crawledPages) {
      if (page.statusCode >= 400 || page.indexability === 'Non-Indexable') continue;
      let pathname = '/';
      try {
        pathname = new URL(page.url).pathname;
      } catch {
        pathname = page.url;
      }
      const pageTokens = new Set(
        tokenizeKeyword(`${pathname.replace(/[-_/]/g, ' ')} ${page.title ?? ''} ${page.h1 ?? ''}`),
      );
      let hits = 0;
      for (const t of kwTokens) {
        if (pageTokens.has(t)) hits += 1;
      }
      if (hits >= Math.min(kwTokens.size, 2) && hits / kwTokens.size >= 0.65) {
        matchingPages.push(page.url);
      }
    }

    if (matchingPages.length >= 2) {
      const rec = `Consolidate or canonicalize competing pages (${matchingPages.slice(0, 3).join(', ')}) or differentiate H1/title intent for "${kw.keyword}".`;
      alerts.push({
        id: `cann-pages-${kw.id}`,
        severity: 'high',
        kind: 'multiple_pages_ranking',
        title: `Multiple crawled pages compete for "${kw.keyword}"`,
        summary: `${matchingPages.length} indexable URLs strongly match "${kw.keyword}", risking split ranking signals.`,
        keywordIds: [kw.id],
        keywords: [kw.keyword],
        competingUrls: matchingPages.slice(0, 4),
        recommendation: rec,
      });
      keywordRisks.set(kw.id, {
        risk: 'high',
        competingUrls: matchingPages.slice(0, 4),
        competingKeywordIds: [],
        recommendation: rec,
      });
    }
  }

  // 2. Check separate unclustered (or cross-cluster) high-priority keywords targeting the exact same URL
  const byTargetUrl = new Map<string, KeywordIntelligenceRecord[]>();
  for (const kw of params.keywords) {
    if (kw.workflowState === 'rejected') continue;
    const url = kw.mapping?.targetUrl ?? kw.gscObservedUrl;
    if (!url) continue;
    const arr = byTargetUrl.get(url) ?? [];
    arr.push(kw);
    byTargetUrl.set(url, arr);
  }

  for (const [url, kws] of byTargetUrl.entries()) {
    if (kws.length < 2) continue;
    // Check if there are distinct intents or distinct clusters mapped onto the same URL
    const distinctClusters = new Set(kws.map((k) => k.clusterId ?? k.id));
    const distinctIntents = new Set(kws.map((k) => k.intent));
    if (distinctClusters.size >= 2 && (distinctIntents.size >= 2 || kws.length >= 3)) {
      const rec = `URL "${url}" is targeted by ${distinctClusters.size} distinct topics (${kws
        .slice(0, 3)
        .map((k) => `"${k.keyword}"`)
        .join(', ')}). Keep one primary topic on this page and spin out secondary intents to dedicated pages.`;
      const ids = kws.map((k) => k.id);
      alerts.push({
        id: `cann-url-${Buffer.from(url).toString('base64url').slice(0, 10)}`,
        severity: distinctIntents.has('Transactional') && distinctIntents.has('Informational') ? 'high' : 'medium',
        kind: 'competing_keywords_same_url',
        title: `${kws.length} distinct keyword targets assigned to ${url}`,
        summary: `Distinct intents (${Array.from(distinctIntents).join(', ')}) share one landing page, diluting topical focus.`,
        keywordIds: ids,
        keywords: kws.map((k) => k.keyword),
        competingUrls: [url],
        recommendation: rec,
      });

      for (const kw of kws) {
        const existing = keywordRisks.get(kw.id);
        if (!existing) {
          keywordRisks.set(kw.id, {
            risk: 'medium',
            competingUrls: [url],
            competingKeywordIds: ids.filter((id) => id !== kw.id),
            recommendation: rec,
          });
        }
      }
    }
  }

  return { alerts, keywordRisks };
}

const VALID_TRANSITIONS: Record<KeywordWorkflowState, readonly KeywordWorkflowState[]> = {
  discovered: ['enriched', 'needs-data', 'recommended', 'rejected', 'approved'],
  enriched: ['needs-data', 'recommended', 'rejected', 'approved'],
  'needs-data': ['enriched', 'recommended', 'rejected', 'approved'],
  recommended: ['approved', 'rejected', 'needs-data', 'enriched'],
  rejected: ['recommended', 'needs-data', 'enriched'],
  approved: ['assigned', 'rejected', 'recommended'],
  assigned: ['implemented', 'approved', 'rejected'],
  implemented: ['measured', 'assigned'],
  measured: ['implemented', 'assigned'],
};

export function isValidKeywordStateTransition(
  from: KeywordWorkflowState,
  to: KeywordWorkflowState,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canUserApproveKeywords(role: UserRole): boolean {
  return ROLE_APPROVER_LIST.includes(role);
}

export function requiresOwnerApprovedProfile(targetState: KeywordWorkflowState): boolean {
  return (
    targetState === 'approved' ||
    targetState === 'assigned' ||
    targetState === 'implemented' ||
    targetState === 'measured'
  );
}
