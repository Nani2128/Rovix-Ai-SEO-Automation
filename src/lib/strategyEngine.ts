import type { AgentStationId } from '../types/agentFactory';
import type { CompetitorProfileRecord, ContentGapRecommendation } from '../types/competitors';
import type { CrawlURLRecord } from '../types/crawl';
import type { KeywordIntent, Project } from '../types/dashboard';
import type { GeoTargetMarket, GeoUrlMappingRecord } from '../types/geographic';
import type {
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordIntelligenceRecord,
  KeywordUrlMappingRecord,
} from '../types/keywords';
import type { PerformanceUrlMeasurement } from '../types/performance';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  InternalLinkCategory,
  KeywordMappingDiagnosticAlert,
  RoadmapPriority,
  RoadmapPriorityScoreBreakdown,
  SiteArchitecturePageRecord,
  SiteArchitectureTreeNode,
  StrategyConfidence,
  StrategyEvidenceReadiness,
  StrategyEvidenceRef,
  StrategySectionRecommendation,
  StrategyStructuredPayload,
  TopicalCoverageClassification,
} from '../types/strategy';
import type { TechnicalIssue } from '../types/technicalIssue';

export interface StrategyEngineInput {
  project: Project;
  businessProfile: KeywordBusinessProfile | null;
  crawledUrls: CrawlURLRecord[];
  latestCrawlAt: string | null;
  technicalIssues: TechnicalIssue[];
  keywords: KeywordIntelligenceRecord[];
  clusters: KeywordCluster[];
  keywordMappings: KeywordUrlMappingRecord[];
  geoMarkets: GeoTargetMarket[];
  geoMappings: GeoUrlMappingRecord[];
  competitors: CompetitorProfileRecord[];
  contentGaps: ContentGapRecommendation[];
  performanceMeasurements: PerformanceUrlMeasurement[];
}

export interface GeneratedObjectiveDraft {
  title: string;
  rationale: string;
  category:
    | 'technical'
    | 'architecture'
    | 'keywords'
    | 'geographic'
    | 'content'
    | 'authority';
  source: string;
  confidence: StrategyConfidence;
  needsResearch: boolean;
  evidence: StrategyEvidenceRef[];
}

export interface GeneratedArchitecturePageDraft {
  tempKey: string;
  parentTempKey: string | null;
  sortOrder: number;
  title: string;
  slug: string;
  proposedUrl: string;
  existingUrl: string | null;
  pageType: ArchitecturePageType;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  relatedKeywords: string[];
  searchIntent: KeywordIntent;
  clusterId: string | null;
  clusterName: string | null;
  targetGeography: string | null;
  pageStatus: ArchitecturePageStatus;
  confidence: StrategyConfidence;
  rationale: string;
  evidence: StrategyEvidenceRef[];
  isAiGenerated: boolean;
}

export interface GeneratedInternalLinkDraft {
  sourceTempKey: string | null;
  sourceUrl: string;
  sourceTitle: string;
  targetTempKey: string | null;
  targetUrl: string;
  targetTitle: string;
  suggestedAnchorText: string;
  linkCategory: InternalLinkCategory;
  existsInCrawl: boolean;
  currentInboundCount: number | null;
  reason: string;
  confidence: StrategyConfidence;
  evidence: StrategyEvidenceRef[];
}

export interface GeneratedTopicalClusterDraft {
  pillarTopic: string;
  supportingSubtopics: string[];
  coverageClassification: TopicalCoverageClassification;
  verifiedPageUrls: string[];
  missingOpportunities: string[];
  competitorGapIds: string[];
  keywordClusterId: string | null;
  linkedPageTempKeys: string[];
  priorityScore: number | null;
  confidence: StrategyConfidence;
  evidenceSummary: string;
  evidence: StrategyEvidenceRef[];
  isAiGenerated: boolean;
}

export interface GeneratedRoadmapItemDraft {
  title: string;
  description: string;
  category:
    | 'technical_foundation'
    | 'site_architecture'
    | 'keyword_optimization'
    | 'internal_linking'
    | 'topical_content'
    | 'local_geo_landing';
  relatedPageTempKey: string | null;
  relatedUrl: string | null;
  relatedKeyword: string | null;
  businessImpactRationale: string;
  evidence: StrategyEvidenceRef[];
  priority: RoadmapPriority;
  priorityScore: number | null;
  scoreBreakdown: RoadmapPriorityScoreBreakdown;
  dependencies: string[];
  estimatedEffort: string;
  responsibleRole: string;
  recommendedAgentId: AgentStationId | null;
  isAiGenerated: boolean;
}

export interface StrategyGenerationBundle {
  title: string;
  summary: string;
  targetAudience: string;
  evidenceReadiness: StrategyEvidenceReadiness;
  missingEvidence: string[];
  payload: StrategyStructuredPayload;
  objectives: GeneratedObjectiveDraft[];
  pages: GeneratedArchitecturePageDraft[];
  internalLinks: GeneratedInternalLinkDraft[];
  topicalClusters: GeneratedTopicalClusterDraft[];
  roadmapItems: GeneratedRoadmapItemDraft[];
}

export function slugifySegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || 'page';
}

export function normalizeWebsiteOrigin(website: string): string {
  const trimmed = website.trim();
  if (!trimmed) return 'https://example.com';
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'https://example.com';
  }
}

export function normalizePagePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '/') return '/';
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      const p = parsed.pathname.replace(/\/+$/, '') || '/';
      return p.startsWith('/') ? p : `/${p}`;
    }
  } catch {
    // fallback below
  }
  const clean = trimmed
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return clean ? `/${clean}` : '/';
}

export function inferPageTypeFromUrl(
  urlOrPath: string,
  title?: string | null,
  h1?: string | null,
): ArchitecturePageType {
  const path = normalizePagePath(urlOrPath).toLowerCase();
  const combined = `${path} ${(title ?? '').toLowerCase()} ${(h1 ?? '').toLowerCase()}`;
  if (path === '/' || path === '/index.html') return 'homepage';
  if (/\/(contact|get-in-touch|book|demo|quote)/.test(path)) return 'contact';
  if (/\/(about|company|team|careers|story)/.test(path)) return 'about';
  if (/\/(case-stud|customers|results|portfolio)/.test(path)) return 'case_study';
  if (/\/(blog|news|articles|insights|journal)/.test(path)) return 'blog';
  if (/\/(resources|guides|docs|documentation|whitepaper|tools|faq|help)/.test(path))
    return 'resource';
  if (/\/(locations|cities|areas|local|regions|offices)/.test(path)) return 'location';
  if (/\/(products|shop|store|pricing|plans|platform)/.test(path)) return 'product';
  if (/\/(services|solutions|capabilities|consulting|audit)/.test(path))
    return 'service';
  if (/\/(category|categories|topics|collections)/.test(path)) return 'category';
  if (/service|solution|agency|audit/.test(combined)) return 'service';
  if (/product|software|platform/.test(combined)) return 'product';
  if (/guide|how to|checklist|tutorial/.test(combined)) return 'blog';
  return 'resource';
}

export function formatLocationLabel(market: GeoTargetMarket): string {
  if (market.granularity === 'city' && market.city) {
    return [market.city, market.stateRegion, market.countryName]
      .filter(Boolean)
      .join(', ');
  }
  if (market.granularity === 'state_region' && market.stateRegion) {
    return [market.stateRegion, market.countryName].filter(Boolean).join(', ');
  }
  return market.countryName || market.countryCode;
}

export function assessStrategyEvidenceReadiness(
  input: StrategyEngineInput,
): StrategyEvidenceReadiness {
  const approvedLocations = input.geoMarkets.filter(
    (m) => m.approvalStatus === 'approved',
  );
  const missingDataItems: string[] = [];

  if (!input.businessProfile) {
    missingDataItems.push(
      'Approved business profile (niche, core services, target audience) not configured in Keyword Lab.',
    );
  } else if (input.businessProfile.approvalStatus !== 'approved') {
    missingDataItems.push(
      'Business profile exists but awaits owner approval before locking final positioning.',
    );
  }
  if (input.crawledUrls.length === 0) {
    missingDataItems.push(
      'No completed technical site crawl found — existing URL inventory and internal link graph require a baseline crawl.',
    );
  }
  if (input.keywords.length === 0) {
    missingDataItems.push(
      'No keyword intelligence records discovered — keyword targeting and search intent distribution need research.',
    );
  }
  if (approvedLocations.length === 0) {
    missingDataItems.push(
      'No owner-approved target geographic locations found — location landing pages are withheld until locations are approved.',
    );
  }
  if (input.competitors.length === 0 || input.contentGaps.length === 0) {
    missingDataItems.push(
      'Competitor research and content gap records are unavailable — competitor-backed topical opportunities need research.',
    );
  }
  if (input.performanceMeasurements.length === 0) {
    missingDataItems.push(
      'Core Web Vitals / PageSpeed performance measurements are not yet recorded for project URLs.',
    );
  }

  const evidenceSignals = [
    Boolean(input.businessProfile),
    input.crawledUrls.length > 0,
    input.keywords.length > 0,
    approvedLocations.length > 0,
    input.contentGaps.length > 0,
  ].filter(Boolean).length;

  const overallReadiness: StrategyEvidenceReadiness['overallReadiness'] =
    evidenceSignals >= 4
      ? 'Ready'
      : evidenceSignals >= 2
        ? 'Partial Evidence'
        : 'Needs Research';

  return {
    hasBusinessProfile: Boolean(input.businessProfile),
    businessProfileApproved:
      input.businessProfile?.approvalStatus === 'approved',
    crawledUrlsCount: input.crawledUrls.length,
    latestCrawlAt: input.latestCrawlAt,
    technicalIssuesCount: input.technicalIssues.length,
    keywordsCount: input.keywords.length,
    keywordClustersCount: input.clusters.length,
    approvedLocationsCount: approvedLocations.length,
    competitorsCount: input.competitors.length,
    contentGapsCount: input.contentGaps.length,
    performanceMeasurementsCount: input.performanceMeasurements.length,
    missingDataItems,
    overallReadiness,
  };
}

export function calculateExplainableRoadmapPriority(factors: {
  businessRelevance: number; // 0-20
  searchIntent: number; // 0-15
  technicalFeasibility: number; // 0-15
  keywordEvidence: number; // 0-15
  competitorGapEvidence: number; // 0-15
  geographicRelevance: number; // 0-10
  dependencyReadiness: number; // 0-10
  hasSufficientEvidence: boolean;
  explanation: string[];
}): { priority: RoadmapPriority; score: number | null; breakdown: RoadmapPriorityScoreBreakdown } {
  const clamp = (v: number, max: number) =>
    Math.max(0, Math.min(max, Math.round(v)));
  const b = {
    businessRelevance: clamp(factors.businessRelevance, 20),
    searchIntent: clamp(factors.searchIntent, 15),
    technicalFeasibility: clamp(factors.technicalFeasibility, 15),
    keywordEvidence: clamp(factors.keywordEvidence, 15),
    competitorGapEvidence: clamp(factors.competitorGapEvidence, 15),
    geographicRelevance: clamp(factors.geographicRelevance, 10),
    dependencyReadiness: clamp(factors.dependencyReadiness, 10),
  };
  const totalScore =
    b.businessRelevance +
    b.searchIntent +
    b.technicalFeasibility +
    b.keywordEvidence +
    b.competitorGapEvidence +
    b.geographicRelevance +
    b.dependencyReadiness;

  const breakdown: RoadmapPriorityScoreBreakdown = {
    ...b,
    totalScore,
    explanation: factors.explanation,
  };

  if (!factors.hasSufficientEvidence) {
    return {
      priority: 'Needs Research',
      score: null,
      breakdown,
    };
  }

  const priority: RoadmapPriority =
    totalScore >= 80
      ? 'Critical'
      : totalScore >= 65
        ? 'High'
        : totalScore >= 45
          ? 'Medium'
          : 'Low';

  return { priority, score: totalScore, breakdown };
}

function intentScore(intent: KeywordIntent): number {
  switch (intent) {
    case 'Transactional':
      return 15;
    case 'Commercial':
      return 13;
    case 'Informational':
      return 9;
    case 'Navigational':
      return 6;
    default:
      return 8;
  }
}

function tokensFromText(text: string): Set<string> {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'your',
    'our',
    'seo',
    'page',
    'home',
    'www',
    'http',
    'https',
    'com',
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((t) => t.length >= 3 && !stop.has(t)),
  );
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function generateEvidenceDrivenStrategy(
  input: StrategyEngineInput,
): StrategyGenerationBundle {
  const origin = normalizeWebsiteOrigin(input.project.website);
  const readiness = assessStrategyEvidenceReadiness(input);
  const approvedMarkets = input.geoMarkets.filter(
    (m) => m.approvalStatus === 'approved',
  );
  const openCriticalOrHighIssues = input.technicalIssues.filter(
    (i) =>
      (i.severity === 'Critical' || i.severity === 'High') &&
      i.status !== 'Verified',
  );

  // Intent breakdown strictly from real keyword records
  const searchIntentBreakdown: Record<KeywordIntent, number> = {
    Informational: 0,
    Commercial: 0,
    Transactional: 0,
    Navigational: 0,
    Local: 0,
  };
  for (const kw of input.keywords) {
    if (searchIntentBreakdown[kw.intent] !== undefined) {
      searchIntentBreakdown[kw.intent] += 1;
    }
  }

  // Primary keyword groups from real KeywordCluster records (never invented)
  const kwById = new Map(input.keywords.map((k) => [k.id, k]));
  const primaryKeywordGroups = input.clusters
    .filter((c) => c.approvalState !== 'rejected')
    .slice(0, 12)
    .map((cluster) => {
      const secondary = cluster.keywordIds
        .map((id) => kwById.get(id)?.keyword)
        .filter(
          (k): k is string =>
            typeof k === 'string' &&
            k.length > 0 &&
            k.toLowerCase() !== cluster.primaryKeyword.toLowerCase(),
        )
        .slice(0, 6);
      const confidence: StrategyConfidence =
        cluster.approvalState === 'approved'
          ? 'High'
          : cluster.keywordsCount >= 3
            ? 'Medium'
            : 'Low';
      return {
        groupName: cluster.clusterName,
        primaryKeyword: cluster.primaryKeyword,
        secondaryKeywords: secondary,
        intent: cluster.dominantIntent,
        confidence,
        evidence: [
          {
            source: 'keyword_clusters' as const,
            label: `Keyword Cluster: ${cluster.clusterName}`,
            referenceId: cluster.id,
            observedDetail: `${cluster.keywordsCount} clustered keyword(s), dominant intent ${cluster.dominantIntent} (${cluster.evidenceSummary || 'from Module 5 Keyword Lab'}).`,
          },
        ],
      };
    });

  // -------------------------------------------------------------------------
  // 1. WEBSITE ARCHITECTURE PAGES (from actual crawl + approved services/geo/gaps)
  // -------------------------------------------------------------------------
  const pages: GeneratedArchitecturePageDraft[] = [];
  const usedPaths = new Set<string>();
  const urlToTempKey = new Map<string, string>();
  const pathToTempKey = new Map<string, string>();

  const registerPage = (draft: GeneratedArchitecturePageDraft): string => {
    const normPath = normalizePagePath(draft.proposedUrl);
    if (usedPaths.has(normPath)) {
      return pathToTempKey.get(normPath) ?? draft.tempKey;
    }
    usedPaths.add(normPath);
    pathToTempKey.set(normPath, draft.tempKey);
    if (draft.existingUrl) {
      urlToTempKey.set(draft.existingUrl, draft.tempKey);
    }
    urlToTempKey.set(`${origin}${normPath === '/' ? '/' : normPath}`, draft.tempKey);
    pages.push({
      ...draft,
      proposedUrl: `${origin}${normPath === '/' ? '/' : normPath}`,
      slug: normPath,
    });
    return draft.tempKey;
  };

  // Find crawled homepage or create baseline homepage node
  const crawledHome =
    input.crawledUrls.find((u) => normalizePagePath(u.normalizedUrl) === '/') ??
    null;
  const homeKeywords = input.keywordMappings.filter(
    (m) => m.targetUrl && normalizePagePath(m.targetUrl) === '/',
  );
  const homeTempKey = registerPage({
    tempKey: 'page-home',
    parentTempKey: null,
    sortOrder: 0,
    title:
      crawledHome?.title?.trim() ||
      `${input.project.name} — Homepage`,
    slug: '/',
    proposedUrl: `${origin}/`,
    existingUrl: crawledHome?.normalizedUrl ?? null,
    pageType: 'homepage',
    primaryKeyword: homeKeywords[0]?.keyword ?? null,
    secondaryKeywords: homeKeywords.slice(1, 5).map((m) => m.keyword),
    relatedKeywords: [],
    searchIntent: 'Navigational',
    clusterId: null,
    clusterName: null,
    targetGeography:
      approvedMarkets.length > 0
        ? formatLocationLabel(approvedMarkets[0])
        : null,
    pageStatus: crawledHome
      ? crawledHome.issueCount > 0
        ? 'optimize'
        : 'existing'
      : 'proposed',
    confidence: crawledHome ? 'High' : 'Low',
    rationale: crawledHome
      ? `Observed homepage in latest crawl (HTTP ${crawledHome.statusCode}, ${crawledHome.indexability}, ${crawledHome.issueCount} technical issue(s)).`
      : 'Root architecture anchor derived from configured project domain; run a baseline site crawl to inspect live homepage signals.',
    evidence: crawledHome
      ? [
          {
            source: 'site_crawl',
            label: 'Crawled Homepage',
            referenceId: crawledHome.id,
            url: crawledHome.normalizedUrl,
            observedDetail: `HTTP ${crawledHome.statusCode}, title "${crawledHome.title ?? 'Missing'}", H1 "${crawledHome.h1 ?? 'Missing'}".`,
          },
        ]
      : [
          {
            source: 'project_profile',
            label: 'Configured Project Website',
            referenceId: input.project.id,
            url: origin,
            observedDetail: `Project "${input.project.name}" configured with website ${input.project.website}.`,
          },
        ],
    isAiGenerated: false,
  });

  // Map existing crawled URLs into the architecture tree (up to 30 real crawled pages)
  const crawledSorted = [...input.crawledUrls]
    .filter((u) => normalizePagePath(u.normalizedUrl) !== '/')
    .sort((a, b) => a.depth - b.depth || a.normalizedUrl.localeCompare(b.normalizedUrl))
    .slice(0, 30);

  let sortCounter = 1;
  const mappingByNormPath = new Map<string, KeywordUrlMappingRecord[]>();
  for (const m of input.keywordMappings) {
    if (!m.targetUrl) continue;
    const p = normalizePagePath(m.targetUrl);
    const list = mappingByNormPath.get(p) ?? [];
    list.push(m);
    mappingByNormPath.set(p, list);
  }

  for (const urlRec of crawledSorted) {
    const normPath = normalizePagePath(urlRec.normalizedUrl);
    const segments = normPath.split('/').filter(Boolean);
    const parentPath =
      segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '/';
    const parentTempKey = pathToTempKey.get(parentPath) ?? homeTempKey;
    const pageType = inferPageTypeFromUrl(
      urlRec.normalizedUrl,
      urlRec.title,
      urlRec.h1,
    );
    const mappedKws = mappingByNormPath.get(normPath) ?? [];
    const primaryKwRec = mappedKws[0]
      ? input.keywords.find((k) => k.id === mappedKws[0].keywordId)
      : undefined;
    const needsOptimization =
      urlRec.issueCount > 0 ||
      urlRec.indexability === 'Non-Indexable' ||
      !urlRec.title ||
      !urlRec.h1;

    registerPage({
      tempKey: `page-crawl-${sortCounter}`,
      parentTempKey,
      sortOrder: sortCounter,
      title:
        urlRec.title?.trim() ||
        urlRec.h1?.trim() ||
        segments[segments.length - 1]?.replace(/-/g, ' ') ||
        normPath,
      slug: normPath,
      proposedUrl: urlRec.normalizedUrl,
      existingUrl: urlRec.normalizedUrl,
      pageType,
      primaryKeyword: mappedKws[0]?.keyword ?? null,
      secondaryKeywords: mappedKws.slice(1, 5).map((m) => m.keyword),
      relatedKeywords: [],
      searchIntent:
        primaryKwRec?.intent ??
        (pageType === 'service' || pageType === 'product'
          ? 'Commercial'
          : pageType === 'blog' || pageType === 'resource'
            ? 'Informational'
            : 'Navigational'),
      clusterId: primaryKwRec?.clusterId ?? null,
      clusterName: primaryKwRec?.clusterName ?? null,
      targetGeography: primaryKwRec?.targetCity || primaryKwRec?.targetCountry || null,
      pageStatus: needsOptimization ? 'optimize' : 'existing',
      confidence: 'High',
      rationale: needsOptimization
        ? `Existing crawled page requires optimization (${urlRec.issueCount} issue(s), indexability: ${urlRec.indexability}) rather than duplication.`
        : `Verified existing crawled page (HTTP ${urlRec.statusCode}, depth ${urlRec.depth}, ${urlRec.indexability}).`,
      evidence: [
        {
          source: 'site_crawl',
          label: `Crawled URL (${normPath})`,
          referenceId: urlRec.id,
          url: urlRec.normalizedUrl,
          observedDetail: `HTTP ${urlRec.statusCode}, depth ${urlRec.depth}, ${urlRec.internalLinks.length} outbound internal link(s), ${urlRec.issueCount} issue(s).`,
        },
      ],
      isAiGenerated: false,
    });
    sortCounter += 1;
  }

  // Helper to ensure hub parent exists (e.g. /services, /locations, /resources)
  const ensureHub = (
    path: string,
    title: string,
    pageType: ArchitecturePageType,
    intent: KeywordIntent,
    rationale: string,
    evidence: StrategyEvidenceRef[],
  ): string => {
    const existingKey = pathToTempKey.get(path);
    if (existingKey) return existingKey;
    const key = `page-hub-${slugifySegment(path)}`;
    sortCounter += 1;
    return registerPage({
      tempKey: key,
      parentTempKey: homeTempKey,
      sortOrder: sortCounter,
      title,
      slug: path,
      proposedUrl: `${origin}${path}`,
      existingUrl: null,
      pageType,
      primaryKeyword: null,
      secondaryKeywords: [],
      relatedKeywords: [],
      searchIntent: intent,
      clusterId: null,
      clusterName: null,
      targetGeography: null,
      pageStatus: 'proposed',
      confidence: evidence.length > 0 ? 'Medium' : 'Low',
      rationale,
      evidence,
      isAiGenerated: false,
    });
  };

  // Recommended Service Pages strictly from approved Business Profile services
  const recommendedServicePages: StrategySectionRecommendation[] = [];
  const approvedServices = input.businessProfile?.approvedServices ?? [];
  if (approvedServices.length > 0) {
    const servicesHubKey = ensureHub(
      '/services',
      'Services Hub',
      'category',
      'Commercial',
      'Central parent hub organizing core business service offerings.',
      [
        {
          source: 'project_profile',
          label: 'Approved Business Services',
          referenceId: input.businessProfile?.id ?? null,
          observedDetail: `${approvedServices.length} configured service offering(s) in Keyword Business Profile.`,
        },
      ],
    );

    for (const service of approvedServices.slice(0, 8)) {
      const slug = `/services/${slugifySegment(service)}`;
      const matchingKw = input.keywords.find((k) =>
        k.keyword.toLowerCase().includes(service.toLowerCase()),
      );
      const alreadyExists = pathToTempKey.has(slug);
      if (!alreadyExists) {
        sortCounter += 1;
        registerPage({
          tempKey: `page-svc-${sortCounter}`,
          parentTempKey: servicesHubKey,
          sortOrder: sortCounter,
          title: service,
          slug,
          proposedUrl: `${origin}${slug}`,
          existingUrl: null,
          pageType: 'service',
          primaryKeyword: matchingKw?.keyword ?? null,
          secondaryKeywords: [],
          relatedKeywords: [],
          searchIntent: matchingKw?.intent ?? 'Commercial',
          clusterId: matchingKw?.clusterId ?? null,
          clusterName: matchingKw?.clusterName ?? null,
          targetGeography:
            approvedMarkets[0] ? formatLocationLabel(approvedMarkets[0]) : null,
          pageStatus: 'proposed',
          confidence:
            input.businessProfile?.approvalStatus === 'approved'
              ? matchingKw
                ? 'High'
                : 'Medium'
              : 'Low',
          rationale: matchingKw
            ? `Dedicated service page for "${service}" aligned with discovered keyword "${matchingKw.keyword}".`
            : `Dedicated service page for configured offering "${service}" (keyword research recommended to refine targeting).`,
          evidence: [
            {
              source: 'project_profile',
              label: `Service: ${service}`,
              referenceId: input.businessProfile?.id ?? null,
              observedDetail: `Business profile approval status: ${input.businessProfile?.approvalStatus}.`,
            },
            ...(matchingKw
              ? [
                  {
                    source: 'keyword_intelligence' as const,
                    label: `Keyword: ${matchingKw.keyword}`,
                    referenceId: matchingKw.id,
                    observedDetail: `Intent: ${matchingKw.intent}, source: ${matchingKw.primarySource}.`,
                  },
                ]
              : []),
          ],
          isAiGenerated: false,
        });
      }
      recommendedServicePages.push({
        id: `rec-svc-${slugifySegment(service)}`,
        title: `${service} (${slug})`,
        summary: alreadyExists
          ? `Existing service path ${slug} detected; review on-page keyword targeting and internal links.`
          : `Create dedicated service landing page at ${slug} under /services.`,
        source: 'Business Profile & Keyword Intelligence',
        confidence:
          input.businessProfile?.approvalStatus === 'approved' ? 'High' : 'Medium',
        needsResearch: !matchingKw,
        isAiGenerated: false,
        evidence: [
          {
            source: 'project_profile',
            label: `Configured Service: ${service}`,
            referenceId: input.businessProfile?.id ?? null,
            observedDetail: `Listed in project business profile.`,
          },
        ],
      });
    }
  } else {
    recommendedServicePages.push({
      id: 'rec-svc-needs-research',
      title: 'Needs Research — Core Service Pages',
      summary:
        'Configure and approve products/services in the Business Profile before proposing dedicated service architecture pages.',
      source: 'Evidence Readiness Check',
      confidence: 'Needs Research',
      needsResearch: true,
      isAiGenerated: false,
      evidence: [],
    });
  }

  // Recommended Location Pages ONLY for genuinely owner-approved locations
  const recommendedLocationPages: StrategySectionRecommendation[] = [];
  if (approvedMarkets.length > 0) {
    const locHubKey = ensureHub(
      '/locations',
      'Locations Hub',
      'category',
      'Commercial',
      'Parent hub for genuinely served, owner-approved target geographic markets.',
      [
        {
          source: 'geographic_markets',
          label: 'Approved Target Locations',
          observedDetail: `${approvedMarkets.length} owner-approved target location(s) in Geographic Intelligence.`,
        },
      ],
    );

    for (const market of approvedMarkets.slice(0, 10)) {
      const label = formatLocationLabel(market);
      const geoMapping = input.geoMappings.find((m) => m.marketId === market.id);
      const slug =
        geoMapping?.recommendedSlug
          ? normalizePagePath(geoMapping.recommendedSlug)
          : `/locations/${slugifySegment(market.city || market.stateRegion || market.countryName)}`;
      const existingMappedUrl = geoMapping?.targetUrl ?? null;

      if (!existingMappedUrl && !pathToTempKey.has(slug)) {
        sortCounter += 1;
        registerPage({
          tempKey: `page-loc-${sortCounter}`,
          parentTempKey: locHubKey,
          sortOrder: sortCounter,
          title: `${input.project.name} in ${label}`,
          slug,
          proposedUrl: `${origin}${slug}`,
          existingUrl: null,
          pageType: 'location',
          primaryKeyword: null,
          secondaryKeywords: [],
          relatedKeywords: [],
          searchIntent: 'Commercial',
          clusterId: null,
          clusterName: null,
          targetGeography: label,
          pageStatus: 'proposed',
          confidence: 'High',
          rationale: `Location landing page for owner-approved market "${label}" (${market.granularity}, priority: ${market.priority}). Avoid doorway duplication by including genuinely unique regional proof.`,
          evidence: [
            {
              source: 'geographic_markets',
              label: `Approved Location: ${label}`,
              referenceId: market.id,
              observedDetail: `Approved by ${market.approvedBy ?? 'Workspace Owner'} on ${market.approvedAt ?? market.updatedAt}.`,
            },
          ],
          isAiGenerated: false,
        });
      }

      recommendedLocationPages.push({
        id: `rec-loc-${market.id}`,
        title: `${label} (${existingMappedUrl ? normalizePagePath(existingMappedUrl) : slug})`,
        summary: existingMappedUrl
          ? `Mapped to existing URL ${existingMappedUrl}; strengthen local relevance and internal links from /locations.`
          : `Proposed localized landing page at ${slug} strictly backed by owner-approved market "${label}".`,
        source: 'Geographic Search Intelligence (Approved Markets)',
        confidence: 'High',
        needsResearch: false,
        isAiGenerated: false,
        evidence: [
          {
            source: 'geographic_markets',
            label: `Approved Market: ${label}`,
            referenceId: market.id,
            observedDetail: `Granularity: ${market.granularity}, Priority: ${market.priority}.`,
          },
        ],
      });
    }
  } else {
    recommendedLocationPages.push({
      id: 'rec-loc-needs-research',
      title: 'Needs Research — No Approved Target Locations',
      summary:
        'Location landing pages are intentionally withheld. Approve genuinely served geographic markets in Geographic Intelligence first.',
      source: 'Geographic Governance Guardrail',
      confidence: 'Needs Research',
      needsResearch: true,
      isAiGenerated: false,
      evidence: [],
    });
  }

  // Recommended Landing Pages & Blog/Educational Categories from Keyword Clusters & Competitor Gaps
  const recommendedLandingPages: StrategySectionRecommendation[] = [];
  const blogContentCategories: StrategySectionRecommendation[] = [];

  const unmappedClusters = input.clusters.filter(
    (c) => c.approvalState !== 'rejected',
  );
  if (unmappedClusters.length > 0 || input.contentGaps.length > 0) {
    const blogHubKey =
      unmappedClusters.some((c) => c.dominantIntent === 'Informational') ||
      input.contentGaps.length > 0
        ? ensureHub(
            '/blog',
            'Blog & Educational Hub',
            'category',
            'Informational',
            'Topical authority hub organizing educational and informational keyword clusters.',
            [
              {
                source: 'keyword_clusters',
                label: 'Informational Clusters & Gaps',
                observedDetail: `${unmappedClusters.length} keyword cluster(s) and ${input.contentGaps.length} competitor content gap(s) inspected.`,
              },
            ],
          )
        : null;

    for (const cluster of unmappedClusters.slice(0, 10)) {
      const isInfo = cluster.dominantIntent === 'Informational';
      const targetSlug = cluster.suggestedLandingUrl
        ? normalizePagePath(cluster.suggestedLandingUrl)
        : isInfo
          ? `/blog/${slugifySegment(cluster.primaryKeyword || cluster.clusterName)}`
          : `/${slugifySegment(cluster.primaryKeyword || cluster.clusterName)}`;

      const matchedExisting = pathToTempKey.has(targetSlug);
      const secondary = cluster.keywordIds
        .map((id) => kwById.get(id)?.keyword)
        .filter(
          (k): k is string =>
            typeof k === 'string' &&
            k.length > 0 &&
            k.toLowerCase() !== cluster.primaryKeyword.toLowerCase(),
        )
        .slice(0, 6);

      if (!matchedExisting) {
        sortCounter += 1;
        registerPage({
          tempKey: `page-cluster-${sortCounter}`,
          parentTempKey: isInfo && blogHubKey ? blogHubKey : homeTempKey,
          sortOrder: sortCounter,
          title: cluster.clusterName,
          slug: targetSlug,
          proposedUrl: `${origin}${targetSlug}`,
          existingUrl: null,
          pageType: isInfo ? 'blog' : 'service',
          primaryKeyword: cluster.primaryKeyword,
          secondaryKeywords: secondary,
          relatedKeywords: [],
          searchIntent: cluster.dominantIntent,
          clusterId: cluster.id,
          clusterName: cluster.clusterName,
          targetGeography: null,
          pageStatus: 'proposed',
          confidence: cluster.approvalState === 'approved' ? 'High' : 'Medium',
          rationale: `Proposed ${isInfo ? 'educational article' : 'landing page'} to cover keyword cluster "${cluster.clusterName}" (${cluster.keywordsCount} keyword(s), dominant intent: ${cluster.dominantIntent}).`,
          evidence: [
            {
              source: 'keyword_clusters',
              label: `Cluster: ${cluster.clusterName}`,
              referenceId: cluster.id,
              observedDetail: `${cluster.keywordsCount} keyword(s), primary "${cluster.primaryKeyword}".`,
            },
          ],
          isAiGenerated: false,
        });
      }

      const recItem: StrategySectionRecommendation = {
        id: `rec-cl-${cluster.id}`,
        title: `${cluster.clusterName} — "${cluster.primaryKeyword}"`,
        summary: matchedExisting
          ? `Existing page at ${targetSlug} covers this cluster; expand headings and internal links to capture all ${cluster.keywordsCount} keywords.`
          : `Build dedicated ${isInfo ? 'blog/resource' : 'commercial landing'} page at ${targetSlug} targeting "${cluster.primaryKeyword}".`,
        source: 'Module 5 Keyword Clusters',
        confidence: cluster.approvalState === 'approved' ? 'High' : 'Medium',
        needsResearch: false,
        isAiGenerated: false,
        evidence: [
          {
            source: 'keyword_clusters',
            label: cluster.clusterName,
            referenceId: cluster.id,
            observedDetail: `Dominant intent ${cluster.dominantIntent}, ${cluster.keywordsCount} keyword(s).`,
          },
        ],
      };

      if (isInfo) {
        blogContentCategories.push(recItem);
      } else {
        recommendedLandingPages.push(recItem);
      }
    }

    // Add missing_topic_page competitor content gaps as proposed resources/articles
    for (const gap of input.contentGaps
      .filter((g) => g.workflowState !== 'rejected' && g.gapType === 'missing_topic_page')
      .slice(0, 6)) {
      const targetSlug = normalizePagePath(
        gap.recommendedBrief.targetSlug || `/resources/${slugifySegment(gap.targetKeyword)}`,
      );
      if (!pathToTempKey.has(targetSlug)) {
        sortCounter += 1;
        registerPage({
          tempKey: `page-gap-${sortCounter}`,
          parentTempKey: blogHubKey ?? homeTempKey,
          sortOrder: sortCounter,
          title: gap.topicTitle,
          slug: targetSlug,
          proposedUrl: `${origin}${targetSlug}`,
          existingUrl: null,
          pageType: 'resource',
          primaryKeyword: gap.targetKeyword,
          secondaryKeywords: [],
          relatedKeywords: [],
          searchIntent: 'Informational',
          clusterId: null,
          clusterName: null,
          targetGeography: gap.targetMarket !== 'Global' ? gap.targetMarket : null,
          pageStatus: 'proposed',
          confidence: gap.confidence,
          rationale: `Competitor gap observed on ${gap.competitorDomain} (${gap.competitorUrl}): ${gap.explanation}`,
          evidence: [
            {
              source: 'competitor_gaps',
              label: `Competitor Gap: ${gap.competitorDomain}`,
              referenceId: gap.id,
              url: gap.competitorUrl,
              observedDetail: `Gap type: ${gap.gapType}; competitor H1: "${gap.competitorH1 ?? 'N/A'}".`,
            },
          ],
          isAiGenerated: false,
        });
      }
      blogContentCategories.push({
        id: `rec-gap-${gap.id}`,
        title: `${gap.topicTitle} (Competitor Gap: ${gap.competitorDomain})`,
        summary: gap.recommendedAction,
        source: `Competitor Content Gap (${gap.competitorDomain})`,
        confidence: gap.confidence,
        needsResearch: gap.priorityTier === 'Needs Evidence',
        isAiGenerated: false,
        evidence: [
          {
            source: 'competitor_gaps',
            label: gap.competitorDomain,
            referenceId: gap.id,
            url: gap.competitorUrl,
            observedDetail: gap.explanation,
          },
        ],
      });
    }
  }

  if (recommendedLandingPages.length === 0) {
    recommendedLandingPages.push({
      id: 'rec-landing-needs-research',
      title: 'Needs Research — Commercial Landing Pages',
      summary:
        'Run Keyword Discovery & Clustering in Keyword Lab to identify commercial/transactional landing page opportunities.',
      source: 'Evidence Readiness Check',
      confidence: 'Needs Research',
      needsResearch: true,
      isAiGenerated: false,
      evidence: [],
    });
  }
  if (blogContentCategories.length === 0) {
    blogContentCategories.push({
      id: 'rec-blog-needs-research',
      title: 'Needs Research — Blog & Educational Categories',
      summary:
        'Informational keyword clusters or competitor content gaps are needed before recommending editorial categories.',
      source: 'Evidence Readiness Check',
      confidence: 'Needs Research',
      needsResearch: true,
      isAiGenerated: false,
      evidence: [],
    });
  }

  // -------------------------------------------------------------------------
  // 2. INTERNAL LINKING RECOMMENDATIONS (strictly from real crawl links + hierarchy)
  // -------------------------------------------------------------------------
  const internalLinks: GeneratedInternalLinkDraft[] = [];
  const seenLinkPairs = new Set<string>();

  // Build actual crawl inbound link counts and existing edge set
  const crawlEdgeSet = new Set<string>();
  const inboundCounts = new Map<string, number>();
  for (const u of input.crawledUrls) {
    const srcPath = normalizePagePath(u.normalizedUrl);
    if (!inboundCounts.has(srcPath)) inboundCounts.set(srcPath, 0);
    for (const rawTarget of u.internalLinks) {
      const tgtPath = normalizePagePath(rawTarget);
      crawlEdgeSet.add(`${srcPath}=>${tgtPath}`);
      inboundCounts.set(tgtPath, (inboundCounts.get(tgtPath) ?? 0) + 1);
    }
  }

  const pushInternalLink = (draft: GeneratedInternalLinkDraft) => {
    const pairKey = `${normalizePagePath(draft.sourceUrl)}=>${normalizePagePath(draft.targetUrl)}`;
    if (
      normalizePagePath(draft.sourceUrl) === normalizePagePath(draft.targetUrl) ||
      seenLinkPairs.has(pairKey)
    ) {
      return;
    }
    seenLinkPairs.add(pairKey);
    internalLinks.push(draft);
  };

  // A. Orphan pages & under-linked important pages confirmed by actual crawl evidence
  if (input.crawledUrls.length > 0) {
    for (const u of input.crawledUrls) {
      const path = normalizePagePath(u.normalizedUrl);
      if (path === '/') continue;
      const inCount = inboundCounts.get(path) ?? 0;
      const isOrphan = inCount === 0 && u.depth > 0;
      const isUnderLinked = inCount <= 1 && u.indexability === 'Indexable';

      if (isOrphan || isUnderLinked) {
        const targetPage = pages.find((p) => normalizePagePath(p.proposedUrl) === path);
        const parentPage =
          pages.find((p) => p.tempKey === targetPage?.parentTempKey) ?? pages[0];
        const sourcePath = normalizePagePath(parentPage.proposedUrl);
        const existsInCrawl = crawlEdgeSet.has(`${sourcePath}=>${path}`);

        pushInternalLink({
          sourceTempKey: parentPage.tempKey,
          sourceUrl: parentPage.proposedUrl,
          sourceTitle: parentPage.title,
          targetTempKey: targetPage?.tempKey ?? null,
          targetUrl: u.normalizedUrl,
          targetTitle: u.title || u.h1 || path,
          suggestedAnchorText:
            targetPage?.primaryKeyword || u.h1 || u.title || path.replace(/^\//, '').replace(/-/g, ' '),
          linkCategory: isOrphan ? 'orphan_rescue' : 'authority_hub',
          existsInCrawl,
          currentInboundCount: inCount,
          reason: isOrphan
            ? `Crawl confirmed 0 internal inbound links to ${path} (orphan page discovered via ${u.discoverySource}). Link from ${parentPage.slug} to pass crawl discovery and hierarchy.`
            : `Indexable page ${path} has only ${inCount} inbound internal link(s) in the latest crawl. Reinforce from parent hub ${parentPage.slug}.`,
          confidence: 'High',
          evidence: [
            {
              source: 'site_crawl',
              label: `Inbound Link Count: ${inCount}`,
              referenceId: u.id,
              url: u.normalizedUrl,
              observedDetail: `Discovered via ${u.discoverySource} at depth ${u.depth}; ${inCount} inbound link(s) across ${input.crawledUrls.length} crawled URL(s).`,
            },
          ],
        });
      }

      // Weak outbound linking check
      if (u.indexability === 'Indexable' && u.internalLinks.length === 0) {
        const targetPage = pages[0]; // link back to homepage/hub
        const sourcePage = pages.find((p) => normalizePagePath(p.proposedUrl) === path);
        const existsInCrawl = crawlEdgeSet.has(`${path}=>/`);
        pushInternalLink({
          sourceTempKey: sourcePage?.tempKey ?? null,
          sourceUrl: u.normalizedUrl,
          sourceTitle: u.title || path,
          targetTempKey: targetPage.tempKey,
          targetUrl: targetPage.proposedUrl,
          targetTitle: targetPage.title,
          suggestedAnchorText: `${input.project.name} overview`,
          linkCategory: 'weak_link_fix',
          existsInCrawl,
          currentInboundCount: inboundCounts.get('/') ?? 0,
          reason: `Dead-end crawled page (${path}) has 0 outbound internal links, trapping crawl equity. Add contextual navigation back to hub pages.`,
          confidence: 'High',
          evidence: [
            {
              source: 'site_crawl',
              label: '0 Outbound Internal Links',
              referenceId: u.id,
              url: u.normalizedUrl,
              observedDetail: `Crawl parsed 0 internal links on ${path}.`,
            },
          ],
        });
      }
    }
  }

  // B. Parent-to-child architectural links for proposed & existing hierarchy
  for (const page of pages) {
    if (!page.parentTempKey) continue;
    const parent = pages.find((p) => p.tempKey === page.parentTempKey);
    if (!parent) continue;
    const srcPath = normalizePagePath(parent.proposedUrl);
    const tgtPath = normalizePagePath(page.proposedUrl);
    const existsInCrawl =
      input.crawledUrls.length > 0 && crawlEdgeSet.has(`${srcPath}=>${tgtPath}`);
    if (!existsInCrawl && internalLinks.length < 24) {
      pushInternalLink({
        sourceTempKey: parent.tempKey,
        sourceUrl: parent.proposedUrl,
        sourceTitle: parent.title,
        targetTempKey: page.tempKey,
        targetUrl: page.proposedUrl,
        targetTitle: page.title,
        suggestedAnchorText: page.primaryKeyword || page.title,
        linkCategory: 'parent_child',
        existsInCrawl: false,
        currentInboundCount:
          input.crawledUrls.length > 0 ? (inboundCounts.get(tgtPath) ?? 0) : null,
        reason: `Establish parent-to-child architectural link from ${parent.slug} to ${page.slug} (${page.pageType}).`,
        confidence: page.existingUrl ? 'High' : 'Medium',
        evidence: page.evidence.slice(0, 2),
      });
    }
  }

  // C. Topical cross-linking between semantically related pages
  const tokenMap = new Map<string, Set<string>>();
  for (const p of pages) {
    tokenMap.set(
      p.tempKey,
      tokensFromText(
        `${p.title} ${p.primaryKeyword ?? ''} ${p.secondaryKeywords.join(' ')} ${p.clusterName ?? ''}`,
      ),
    );
  }
  for (let i = 0; i < pages.length && internalLinks.length < 30; i += 1) {
    const a = pages[i];
    if (a.pageType === 'homepage') continue;
    for (let j = i + 1; j < pages.length && internalLinks.length < 30; j += 1) {
      const b = pages[j];
      if (b.pageType === 'homepage') continue;
      if (a.parentTempKey === b.tempKey || b.parentTempKey === a.tempKey) continue;
      const overlap = jaccardOverlap(
        tokenMap.get(a.tempKey) ?? new Set(),
        tokenMap.get(b.tempKey) ?? new Set(),
      );
      if (overlap >= 0.25) {
        const srcPath = normalizePagePath(a.proposedUrl);
        const tgtPath = normalizePagePath(b.proposedUrl);
        const existsInCrawl =
          input.crawledUrls.length > 0 && crawlEdgeSet.has(`${srcPath}=>${tgtPath}`);
        if (!existsInCrawl) {
          pushInternalLink({
            sourceTempKey: a.tempKey,
            sourceUrl: a.proposedUrl,
            sourceTitle: a.title,
            targetTempKey: b.tempKey,
            targetUrl: b.proposedUrl,
            targetTitle: b.title,
            suggestedAnchorText: b.primaryKeyword || b.title,
            linkCategory: 'topical_crosslink',
            existsInCrawl: false,
            currentInboundCount:
              input.crawledUrls.length > 0 ? (inboundCounts.get(tgtPath) ?? 0) : null,
            reason: `Related topical coverage (${Math.round(overlap * 100)}% shared terminology) between "${a.title}" and "${b.title}" supports contextual cross-linking.`,
            confidence: 'Medium',
            evidence: [...a.evidence.slice(0, 1), ...b.evidence.slice(0, 1)],
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. TOPICAL AUTHORITY & CONTENT COVERAGE (strictly separated evidence classes)
  // -------------------------------------------------------------------------
  const topicalClusters: GeneratedTopicalClusterDraft[] = [];

  for (const cluster of input.clusters.filter((c) => c.approvalState !== 'rejected')) {
    const clusterKeywords = cluster.keywordIds
      .map((id) => kwById.get(id))
      .filter((k): k is KeywordIntelligenceRecord => Boolean(k));
    const verifiedUrls = Array.from(
      new Set(
        clusterKeywords
          .map((k) => k.mapping?.targetUrl)
          .filter((u): u is string => Boolean(u)),
      ),
    );
    const matchingGaps = input.contentGaps.filter(
      (g) =>
        g.targetKeyword.toLowerCase().includes(cluster.primaryKeyword.toLowerCase()) ||
        cluster.primaryKeyword.toLowerCase().includes(g.targetKeyword.toLowerCase()),
    );
    const linkedPageKeys = pages
      .filter(
        (p) =>
          p.clusterId === cluster.id ||
          (p.existingUrl && verifiedUrls.includes(p.existingUrl)),
      )
      .map((p) => p.tempKey);

    const hasAiOnlyKeywords =
      clusterKeywords.length > 0 &&
      clusterKeywords.every((k) => k.isAiSuggestion);

    const coverageClassification: TopicalCoverageClassification =
      verifiedUrls.length > 0
        ? 'verified_existing'
        : hasAiOnlyKeywords
          ? 'ai_suggestion'
          : 'recommended_opportunity';

    const missingOpps = cluster.contentGaps.length > 0
      ? cluster.contentGaps
      : verifiedUrls.length === 0
        ? [`No crawled page currently targets "${cluster.primaryKeyword}".`]
        : [];

    const score = Math.min(
      100,
      Math.round(
        35 +
          Math.min(25, cluster.keywordsCount * 5) +
          intentScore(cluster.dominantIntent) +
          (matchingGaps.length > 0 ? 15 : 0) +
          (verifiedUrls.length === 0 ? 10 : 0),
      ),
    );

    topicalClusters.push({
      pillarTopic: cluster.clusterName,
      supportingSubtopics: clusterKeywords
        .map((k) => k.keyword)
        .filter((k) => k.toLowerCase() !== cluster.primaryKeyword.toLowerCase())
        .slice(0, 8),
      coverageClassification,
      verifiedPageUrls: verifiedUrls,
      missingOpportunities: missingOpps,
      competitorGapIds: matchingGaps.map((g) => g.id),
      keywordClusterId: cluster.id,
      linkedPageTempKeys: linkedPageKeys,
      priorityScore: score,
      confidence:
        verifiedUrls.length > 0 || cluster.approvalState === 'approved'
          ? 'High'
          : hasAiOnlyKeywords
            ? 'Low'
            : 'Medium',
      evidenceSummary:
        verifiedUrls.length > 0
          ? `Verified across ${verifiedUrls.length} existing crawled URL(s) and ${cluster.keywordsCount} keyword record(s).`
          : hasAiOnlyKeywords
            ? `AI-expanded cluster (${cluster.keywordsCount} AI suggestion(s)) — requires keyword demand validation before publishing.`
            : `${cluster.keywordsCount} discovered keyword(s) with no mapped project page yet (${matchingGaps.length} competitor gap reference(s)).`,
      evidence: [
        {
          source: 'keyword_clusters',
          label: `Cluster: ${cluster.clusterName}`,
          referenceId: cluster.id,
          observedDetail: `${cluster.keywordsCount} keyword(s), dominant intent ${cluster.dominantIntent}.`,
        },
        ...matchingGaps.slice(0, 2).map((g) => ({
          source: 'competitor_gaps' as const,
          label: `Gap vs ${g.competitorDomain}`,
          referenceId: g.id,
          url: g.competitorUrl,
          observedDetail: g.explanation,
        })),
      ],
      isAiGenerated: hasAiOnlyKeywords,
    });
  }

  // Add standalone competitor content gaps not already linked to a keyword cluster
  const coveredGapIds = new Set(
    topicalClusters.flatMap((c) => c.competitorGapIds),
  );
  for (const gap of input.contentGaps
    .filter((g) => g.workflowState !== 'rejected' && !coveredGapIds.has(g.id))
    .slice(0, 8)) {
    const linkedKeys = pages
      .filter(
        (p) =>
          p.primaryKeyword?.toLowerCase() === gap.targetKeyword.toLowerCase() ||
          (gap.projectUrl && p.existingUrl === gap.projectUrl),
      )
      .map((p) => p.tempKey);

    topicalClusters.push({
      pillarTopic: gap.topicTitle,
      supportingSubtopics: gap.competitorHeadings.slice(0, 6),
      coverageClassification: gap.projectUrl
        ? 'verified_existing'
        : 'recommended_opportunity',
      verifiedPageUrls: gap.projectUrl ? [gap.projectUrl] : [],
      missingOpportunities: [gap.recommendedAction],
      competitorGapIds: [gap.id],
      keywordClusterId: null,
      linkedPageTempKeys: linkedKeys,
      priorityScore: gap.opportunityScore,
      confidence: gap.confidence,
      evidenceSummary: `Observed competitor content gap on ${gap.competitorDomain}: ${gap.explanation}`,
      evidence: [
        {
          source: 'competitor_gaps',
          label: `${gap.competitorDomain} (${gap.gapType})`,
          referenceId: gap.id,
          url: gap.competitorUrl,
          observedDetail: gap.explanation,
        },
      ],
      isAiGenerated: false,
    });
  }

  if (topicalClusters.length === 0) {
    topicalClusters.push({
      pillarTopic: 'Needs Research — Topical Authority Baseline',
      supportingSubtopics: [],
      coverageClassification: 'unavailable_evidence',
      verifiedPageUrls: [],
      missingOpportunities: [
        'Run Keyword Discovery & Clustering (Keyword Lab) and Competitor Analysis (Competitors) to build verified topical coverage.',
      ],
      competitorGapIds: [],
      keywordClusterId: null,
      linkedPageTempKeys: [],
      priorityScore: null,
      confidence: 'Needs Research',
      evidenceSummary:
        'Unavailable evidence: no keyword clusters or competitor content gaps exist for this project yet.',
      evidence: [],
      isAiGenerated: false,
    });
  }

  // -------------------------------------------------------------------------
  // 4. STRATEGY OBJECTIVES & TECHNICAL/CONTENT PRIORITIES
  // -------------------------------------------------------------------------
  const objectives: GeneratedObjectiveDraft[] = [];
  const technicalAndContentPriorities: StrategySectionRecommendation[] = [];

  if (openCriticalOrHighIssues.length > 0) {
    const topIssues = openCriticalOrHighIssues.slice(0, 4);
    objectives.push({
      title: `Resolve ${openCriticalOrHighIssues.length} High/Critical Technical SEO Blocker(s)`,
      rationale: `Crawl diagnostics detected ${openCriticalOrHighIssues.length} open high/critical technical issue(s) (e.g., ${topIssues.map((i) => i.title).join('; ')}). Resolving crawlability and indexability blockers protects every downstream architecture investment.`,
      category: 'technical',
      source: 'Technical SEO Audit Engine',
      confidence: 'High',
      needsResearch: false,
      evidence: topIssues.map((i) => ({
        source: 'technical_issues',
        label: `${i.severity}: ${i.title}`,
        referenceId: i.id,
        observedDetail: `${i.affectedUrlCount} affected URL(s), category: ${i.category}.`,
      })),
    });
    for (const iss of topIssues) {
      technicalAndContentPriorities.push({
        id: `prio-tech-${iss.id}`,
        title: `${iss.severity}: ${iss.title}`,
        summary: iss.recommendedFix,
        source: 'Technical Audit & Crawl',
        confidence: 'High',
        needsResearch: false,
        isAiGenerated: false,
        evidence: [
          {
            source: 'technical_issues',
            label: iss.ruleName,
            referenceId: iss.id,
            observedDetail: `${iss.affectedUrlCount} URL(s) affected.`,
          },
        ],
      });
    }
  } else if (input.crawledUrls.length === 0) {
    objectives.push({
      title: 'Needs Research — Establish Baseline Technical Crawl & URL Inventory',
      rationale:
        'No completed crawl exists yet. Run an authorized site crawl before finalizing technical remediation or internal linking changes.',
      category: 'technical',
      source: 'Evidence Readiness Check',
      confidence: 'Needs Research',
      needsResearch: true,
      evidence: [],
    });
  }

  if (input.clusters.length > 0) {
    objectives.push({
      title: `Align Site Architecture to ${input.clusters.length} Discovered Keyword Cluster(s)`,
      rationale: `Map primary and secondary keyword clusters cleanly to one canonical URL per search intent to prevent keyword cannibalization and close unmapped demand gaps.`,
      category: 'keywords',
      source: 'Module 5 Keyword Intelligence',
      confidence: 'High',
      needsResearch: false,
      evidence: input.clusters.slice(0, 3).map((c) => ({
        source: 'keyword_clusters',
        label: c.clusterName,
        referenceId: c.id,
        observedDetail: `${c.keywordsCount} keyword(s), dominant intent ${c.dominantIntent}.`,
      })),
    });
  } else {
    objectives.push({
      title: 'Needs Research — Discover & Cluster Target Keywords',
      rationale:
        'No keyword clusters exist yet. Complete Keyword Lab discovery and intent verification to ground page targeting.',
      category: 'keywords',
      source: 'Evidence Readiness Check',
      confidence: 'Needs Research',
      needsResearch: true,
      evidence: [],
    });
  }

  if (approvedMarkets.length > 0) {
    objectives.push({
      title: `Serve ${approvedMarkets.length} Owner-Approved Target Geographic Market(s)`,
      rationale: `Build or optimize dedicated location architecture strictly for genuinely served, approved locations (${approvedMarkets.map(formatLocationLabel).slice(0, 4).join(', ')}).`,
      category: 'geographic',
      source: 'Geographic Search Intelligence',
      confidence: 'High',
      needsResearch: false,
      evidence: approvedMarkets.slice(0, 3).map((m) => ({
        source: 'geographic_markets',
        label: formatLocationLabel(m),
        referenceId: m.id,
        observedDetail: `Approved ${m.granularity} market (${m.priority} priority).`,
      })),
    });
  }

  if (internalLinks.some((l) => l.linkCategory === 'orphan_rescue')) {
    const orphanCount = internalLinks.filter(
      (l) => l.linkCategory === 'orphan_rescue',
    ).length;
    objectives.push({
      title: `Eliminate ${orphanCount} Crawl-Confirmed Orphan Page(s) via Hub Linking`,
      rationale: `Crawl link graph analysis found ${orphanCount} page(s) with 0 inbound internal links. Connect them to parent category/hub pages with descriptive contextual anchors.`,
      category: 'architecture',
      source: 'Crawl Internal Link Graph',
      confidence: 'High',
      needsResearch: false,
      evidence: internalLinks
        .filter((l) => l.linkCategory === 'orphan_rescue')
        .slice(0, 3)
        .map((l) => ({
          source: 'site_crawl',
          label: `Orphan: ${normalizePagePath(l.targetUrl)}`,
          url: l.targetUrl,
          observedDetail: l.reason,
        })),
    });
  }

  if (input.contentGaps.length > 0) {
    objectives.push({
      title: `Close ${input.contentGaps.length} Evidence-Backed Competitor Content Gap(s)`,
      rationale: `Competitor page analysis identified missing topics, schema gaps, or depth opportunities compared to analyzed peer domains.`,
      category: 'authority',
      source: 'Competitor Intelligence Engine',
      confidence: 'Medium',
      needsResearch: false,
      evidence: input.contentGaps.slice(0, 3).map((g) => ({
        source: 'competitor_gaps',
        label: `${g.topicTitle} (${g.competitorDomain})`,
        referenceId: g.id,
        url: g.competitorUrl,
        observedDetail: g.explanation,
      })),
    });
  }

  if (technicalAndContentPriorities.length === 0) {
    technicalAndContentPriorities.push({
      id: 'prio-baseline-check',
      title:
        input.crawledUrls.length > 0
          ? 'Maintain Indexability & Expand Topical Depth'
          : 'Needs Research — Run Technical Site Crawl',
      summary:
        input.crawledUrls.length > 0
          ? 'No open Critical/High technical issues detected; prioritize architecture optimization, internal linking, and approved content briefs.'
          : 'Run a verified technical site crawl to surface indexability, canonical, and metadata priorities.',
      source:
        input.crawledUrls.length > 0
          ? 'Technical Audit Baseline'
          : 'Evidence Readiness Check',
      confidence: input.crawledUrls.length > 0 ? 'Medium' : 'Needs Research',
      needsResearch: input.crawledUrls.length === 0,
      isAiGenerated: false,
      evidence: [],
    });
  }

  // -------------------------------------------------------------------------
  // 5. ACTIONABLE SEO ROADMAP WITH EXPLAINABLE 7-FACTOR PRIORITY SCORING
  // -------------------------------------------------------------------------
  const roadmapItems: GeneratedRoadmapItemDraft[] = [];

  // A. Top Technical Issues
  for (const issue of openCriticalOrHighIssues.slice(0, 5)) {
    const scored = calculateExplainableRoadmapPriority({
      businessRelevance: 18,
      searchIntent: 10,
      technicalFeasibility: issue.severity === 'Critical' ? 14 : 12,
      keywordEvidence: input.keywords.length > 0 ? 11 : 6,
      competitorGapEvidence: 8,
      geographicRelevance: approvedMarkets.length > 0 ? 6 : 4,
      dependencyReadiness: 10,
      hasSufficientEvidence: true,
      explanation: [
        `Open ${issue.severity} technical issue affecting ${issue.affectedUrlCount} crawled URL(s).`,
        'Technical foundation fix has zero upstream dependencies and unblocks crawling/indexation.',
      ],
    });
    roadmapItems.push({
      title: `Fix Technical Blocker: ${issue.title}`,
      description: `${issue.explanation} Recommended fix: ${issue.recommendedFix}`,
      category: 'technical_foundation',
      relatedPageTempKey: null,
      relatedUrl: null,
      relatedKeyword: null,
      businessImpactRationale:
        'Removes indexation or crawlability friction on live project pages without promising specific ranking gains.',
      evidence: [
        {
          source: 'technical_issues',
          label: `${issue.severity} Issue (${issue.ruleId})`,
          referenceId: issue.id,
          observedDetail: `${issue.affectedUrlCount} affected URL(s).`,
        },
      ],
      priority: scored.priority,
      priorityScore: scored.score,
      scoreBreakdown: scored.breakdown,
      dependencies: [],
      estimatedEffort:
        issue.severity === 'Critical'
          ? 'Estimate: Medium (4-8 hrs)'
          : 'Estimate: Small (2-4 hrs)',
      responsibleRole: issue.responsibleRole || 'Developer',
      recommendedAgentId: 'technical_seo_agent',
      isAiGenerated: false,
    });
  }

  // B. Existing pages needing optimization (prioritized before creating duplicates)
  for (const page of pages
    .filter((p) => p.pageStatus === 'optimize')
    .slice(0, 4)) {
    const scored = calculateExplainableRoadmapPriority({
      businessRelevance: page.pageType === 'homepage' || page.pageType === 'service' ? 18 : 14,
      searchIntent: intentScore(page.searchIntent),
      technicalFeasibility: 13,
      keywordEvidence: page.primaryKeyword ? 13 : 7,
      competitorGapEvidence: 7,
      geographicRelevance: page.targetGeography ? 9 : 4,
      dependencyReadiness: 9,
      hasSufficientEvidence: true,
      explanation: [
        `Existing page ${page.slug} should be improved rather than duplicated.`,
        page.primaryKeyword
          ? `Directly aligned with mapped keyword "${page.primaryKeyword}".`
          : 'Requires on-page title/H1/technical optimization based on crawl findings.',
      ],
    });
    roadmapItems.push({
      title: `Optimize Existing Page: ${page.title} (${page.slug})`,
      description: `${page.rationale} Refine title, H1, structured data, and contextual internal links on the existing URL rather than launching a competing duplicate page.`,
      category: 'keyword_optimization',
      relatedPageTempKey: page.tempKey,
      relatedUrl: page.existingUrl ?? page.proposedUrl,
      relatedKeyword: page.primaryKeyword,
      businessImpactRationale:
        'Strengthens an already-indexed URL with verified crawl history and avoids internal keyword cannibalization.',
      evidence: page.evidence,
      priority: scored.priority,
      priorityScore: scored.score,
      scoreBreakdown: scored.breakdown,
      dependencies:
        openCriticalOrHighIssues.length > 0
          ? ['Resolve blocking Critical/High technical crawl issues']
          : [],
      estimatedEffort: 'Estimate: Small (2-4 hrs)',
      responsibleRole: 'SEO Strategist',
      recommendedAgentId: 'content_strategy_agent',
      isAiGenerated: false,
    });
  }

  // C. High-priority Proposed Architecture Pages (service, location, cluster landing)
  for (const page of pages
    .filter(
      (p) =>
        p.pageStatus === 'proposed' &&
        p.pageType !== 'category' &&
        p.pageType !== 'homepage',
    )
    .slice(0, 6)) {
    const isGeo = page.pageType === 'location';
    const isCommercial =
      page.pageType === 'service' ||
      page.pageType === 'product' ||
      page.searchIntent === 'Commercial' ||
      page.searchIntent === 'Transactional';
    const hasEvidence = page.evidence.length > 0;
    const scored = calculateExplainableRoadmapPriority({
      businessRelevance: isCommercial ? 18 : 13,
      searchIntent: intentScore(page.searchIntent),
      technicalFeasibility: 11,
      keywordEvidence: page.primaryKeyword ? 13 : 5,
      competitorGapEvidence: page.evidence.some((e) => e.source === 'competitor_gaps')
        ? 14
        : 6,
      geographicRelevance: isGeo || page.targetGeography ? 10 : 4,
      dependencyReadiness: 7,
      hasSufficientEvidence: hasEvidence,
      explanation: [
        `Proposed ${page.pageType} page at ${page.slug}.`,
        isGeo
          ? `Targets owner-approved geography: ${page.targetGeography}.`
          : `Aligned with ${page.searchIntent} search intent.`,
      ],
    });
    roadmapItems.push({
      title: `Build Proposed ${page.pageType.replace('_', ' ')} Page: ${page.title}`,
      description: `${page.rationale} Draft approved content brief and page wireframes for ${page.slug} before editorial sign-off.`,
      category: isGeo ? 'local_geo_landing' : 'site_architecture',
      relatedPageTempKey: page.tempKey,
      relatedUrl: page.proposedUrl,
      relatedKeyword: page.primaryKeyword,
      businessImpactRationale:
        'Expands structured topical and service coverage for verified customer search intent once approved by stakeholders.',
      evidence: page.evidence,
      priority: scored.priority,
      priorityScore: scored.score,
      scoreBreakdown: scored.breakdown,
      dependencies: [
        'Owner approval of proposed architecture page & URL structure',
        ...(page.primaryKeyword
          ? [`Keyword mapping confirmation for "${page.primaryKeyword}"`]
          : []),
      ],
      estimatedEffort: 'Estimate: Medium (4-8 hrs)',
      responsibleRole: 'Editor',
      recommendedAgentId: 'content_strategy_agent',
      isAiGenerated: page.isAiGenerated,
    });
  }

  // D. Orphan / High-Priority Internal Linking Task
  const orphanRecs = internalLinks.filter((l) => l.linkCategory === 'orphan_rescue');
  if (orphanRecs.length > 0) {
    const scored = calculateExplainableRoadmapPriority({
      businessRelevance: 15,
      searchIntent: 10,
      technicalFeasibility: 15,
      keywordEvidence: 10,
      competitorGapEvidence: 6,
      geographicRelevance: 5,
      dependencyReadiness: 10,
      hasSufficientEvidence: true,
      explanation: [
        `${orphanRecs.length} crawl-confirmed orphan page(s) currently receive 0 inbound internal links.`,
        'High technical feasibility with immediate structural discoverability improvement.',
      ],
    });
    roadmapItems.push({
      title: `Connect ${orphanRecs.length} Crawl-Confirmed Orphan Page(s) via Internal Links`,
      description: `Add contextual internal links from parent hub pages to ${orphanRecs
        .slice(0, 4)
        .map((r) => normalizePagePath(r.targetUrl))
        .join(', ')} using approved descriptive anchor text.`,
      category: 'internal_linking',
      relatedPageTempKey: orphanRecs[0].targetTempKey,
      relatedUrl: orphanRecs[0].targetUrl,
      relatedKeyword: orphanRecs[0].suggestedAnchorText,
      businessImpactRationale:
        'Ensures important crawled pages are discoverable through internal navigation rather than isolated from site hierarchy.',
      evidence: orphanRecs.slice(0, 3).flatMap((r) => r.evidence),
      priority: scored.priority,
      priorityScore: scored.score,
      scoreBreakdown: scored.breakdown,
      dependencies: ['Approval of internal linking recommendations'],
      estimatedEffort: 'Estimate: Small (1-3 hrs)',
      responsibleRole: 'SEO Strategist',
      recommendedAgentId: 'technical_seo_agent',
      isAiGenerated: false,
    });
  }

  // E. Research prerequisite task if critical evidence is missing
  if (readiness.missingDataItems.length > 0) {
    const scored = calculateExplainableRoadmapPriority({
      businessRelevance: 16,
      searchIntent: 8,
      technicalFeasibility: 14,
      keywordEvidence: 4,
      competitorGapEvidence: 4,
      geographicRelevance: 4,
      dependencyReadiness: 10,
      hasSufficientEvidence: false,
      explanation: readiness.missingDataItems.slice(0, 3),
    });
    roadmapItems.push({
      title: 'Complete Missing SEO Evidence Research Inputs',
      description: `Resolve evidence gaps before locking final strategy: ${readiness.missingDataItems.join(' ')}`,
      category: 'topical_content',
      relatedPageTempKey: null,
      relatedUrl: null,
      relatedKeyword: null,
      businessImpactRationale:
        'Prevents ungrounded page creation by ensuring strategy decisions rest on verified crawl, keyword, market, and competitor data.',
      evidence: [
        {
          source: 'project_profile',
          label: 'Evidence Readiness Audit',
          referenceId: input.project.id,
          observedDetail: `${readiness.missingDataItems.length} missing evidence input(s) identified.`,
        },
      ],
      priority: scored.priority,
      priorityScore: scored.score,
      scoreBreakdown: scored.breakdown,
      dependencies: [],
      estimatedEffort: 'Estimate: Small (1-2 hrs)',
      responsibleRole: 'SEO Strategist',
      recommendedAgentId: 'research_agent',
      isAiGenerated: false,
    });
  }

  // Sort roadmap deterministically by priority score descending (Needs Research last)
  roadmapItems.sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1));

  const targetAudience =
    input.businessProfile?.targetAudience?.trim() ||
    'Needs Research — Define target audience in Keyword Lab Business Profile.';

  const recommendedStructureSummary =
    input.crawledUrls.length > 0
      ? `Architecture combines ${input.crawledUrls.length} crawled URL(s) with ${pages.filter((p) => p.pageStatus === 'proposed').length} proposed page(s) organized under clean hub-and-spoke paths (${approvedMarkets.length} approved location market(s)).`
      : `Draft hub-and-spoke blueprint (${pages.length} node(s)) seeded from configured project metadata. Run a baseline site crawl to reconcile against live URLs.`;

  const summary =
    readiness.overallReadiness === 'Needs Research'
      ? `Initial strategy baseline generated for ${input.project.name} with limited evidence (${readiness.missingDataItems.length} research gap(s) flagged as "Needs Research"). Complete crawl, keyword, and competitor discovery to strengthen confidence.`
      : `Evidence-driven SEO strategy for ${input.project.name} synthesized from ${readiness.crawledUrlsCount} crawled URL(s), ${readiness.keywordsCount} keyword(s), ${readiness.keywordClustersCount} cluster(s), ${readiness.approvedLocationsCount} approved location(s), and ${readiness.contentGapsCount} competitor gap(s).`;

  const payload: StrategyStructuredPayload = {
    targetAudienceSummary: targetAudience,
    searchIntentBreakdown,
    primaryKeywordGroups,
    recommendedStructureSummary,
    recommendedLandingPages,
    recommendedServicePages,
    recommendedLocationPages,
    blogContentCategories,
    technicalAndContentPriorities,
    missingEvidenceNotes: readiness.missingDataItems,
  };

  return {
    title: `${input.project.name} — SEO Strategy & Site Architecture`,
    summary,
    targetAudience,
    evidenceReadiness: readiness,
    missingEvidence: readiness.missingDataItems,
    payload,
    objectives,
    pages,
    internalLinks,
    topicalClusters,
    roadmapItems,
  };
}

// ============================================================================
// SITEMAP TREE & DRAG-AND-DROP CYCLE VALIDATION HELPERS
// ============================================================================

export function wouldCreateArchitectureCycle(
  pages: Pick<SiteArchitecturePageRecord, 'id' | 'parentPageId'>[],
  pageId: string,
  proposedParentId: string | null,
): boolean {
  if (!proposedParentId) return false;
  if (pageId === proposedParentId) return true;
  const parentMap = new Map<string, string | null>(
    pages.map((p) => [p.id, p.parentPageId]),
  );
  let cursor: string | null = proposedParentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === pageId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parentMap.get(cursor) ?? null;
  }
  return false;
}

export function buildArchitectureTree(
  pages: SiteArchitecturePageRecord[],
  internalLinks: { sourcePageId: string | null; targetPageId: string | null }[] = [],
  includeArchived = false,
): SiteArchitectureTreeNode[] {
  const activePages = includeArchived
    ? pages
    : pages.filter((p) => p.pageStatus !== 'archived' && !p.archivedAt);

  const inboundMap = new Map<string, number>();
  const outboundMap = new Map<string, number>();
  for (const link of internalLinks) {
    if (link.targetPageId) {
      inboundMap.set(
        link.targetPageId,
        (inboundMap.get(link.targetPageId) ?? 0) + 1,
      );
    }
    if (link.sourcePageId) {
      outboundMap.set(
        link.sourcePageId,
        (outboundMap.get(link.sourcePageId) ?? 0) + 1,
      );
    }
  }

  const byId = new Map<string, SiteArchitectureTreeNode>();
  for (const p of activePages) {
    byId.set(p.id, {
      ...p,
      depth: 0,
      children: [],
      inboundLinkRecCount: inboundMap.get(p.id) ?? 0,
      outboundLinkRecCount: outboundMap.get(p.id) ?? 0,
    });
  }

  const roots: SiteArchitectureTreeNode[] = [];
  for (const node of byId.values()) {
    if (
      node.parentPageId &&
      node.parentPageId !== node.id &&
      byId.has(node.parentPageId)
    ) {
      byId.get(node.parentPageId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (list: SiteArchitectureTreeNode[], depth: number) => {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
    for (const item of list) {
      item.depth = depth;
      sortRecursive(item.children, depth + 1);
    }
  };
  sortRecursive(roots, 0);
  return roots;
}

// ============================================================================
// KEYWORD-TO-PAGE MAPPING & CANNIBALIZATION DIAGNOSTICS
// ============================================================================

export function analyzeKeywordPageMappings(params: {
  pages: SiteArchitecturePageRecord[];
  keywords: KeywordIntelligenceRecord[];
  clusters: KeywordCluster[];
}): {
  diagnostics: KeywordMappingDiagnosticAlert[];
  unmappedKeywords: {
    keywordId: string;
    keyword: string;
    intent: KeywordIntent;
    clusterName: string | null;
    targetGeography: string;
    marketSearchVolume: number | null;
    volumeStatus: 'measured' | 'unavailable';
    gscImpressions: number | null;
    isAiSuggestion: boolean;
  }[];
} {
  const activePages = params.pages.filter(
    (p) => p.pageStatus !== 'archived' && !p.archivedAt,
  );
  const diagnostics: KeywordMappingDiagnosticAlert[] = [];

  // 1. Pages targeting the exact same primary keyword (Cannibalization)
  const primaryMap = new Map<string, SiteArchitecturePageRecord[]>();
  for (const p of activePages) {
    const kw = p.primaryKeyword?.trim().toLowerCase();
    if (!kw) continue;
    const list = primaryMap.get(kw) ?? [];
    list.push(p);
    primaryMap.set(kw, list);
  }
  for (const [kw, competing] of primaryMap.entries()) {
    if (competing.length > 1) {
      diagnostics.push({
        id: `diag-cannib-${slugifySegment(kw)}`,
        kind: 'cannibalization_same_primary_keyword',
        severity: 'high',
        title: `Primary Keyword Cannibalization: "${competing[0].primaryKeyword}"`,
        detail: `${competing.length} architecture pages target the same primary keyword (${competing.map((p) => p.slug).join(', ')}).`,
        keyword: competing[0].primaryKeyword,
        affectedPageIds: competing.map((p) => p.id),
        affectedUrls: competing.map((p) => p.existingUrl ?? p.proposedUrl),
        recommendedResolution:
          'Designate one canonical primary target page and differentiate or consolidate secondary pages.',
        evidence: competing.map((p) => ({
          source: 'keyword_intelligence',
          label: `Page: ${p.slug}`,
          referenceId: p.id,
          url: p.existingUrl ?? p.proposedUrl,
          observedDetail: `Status: ${p.pageStatus}, Intent: ${p.searchIntent}.`,
        })),
      });
    }
  }

  // 2. Keyword overlap (primary keyword of page A listed in secondary keywords of page B)
  for (const pageA of activePages) {
    const primaryA = pageA.primaryKeyword?.trim().toLowerCase();
    if (!primaryA) continue;
    for (const pageB of activePages) {
      if (pageA.id === pageB.id) continue;
      const overlap = pageB.secondaryKeywords.some(
        (s) => s.trim().toLowerCase() === primaryA,
      );
      if (overlap) {
        diagnostics.push({
          id: `diag-overlap-${pageA.id}-${pageB.id}`,
          kind: 'keyword_overlap_warning',
          severity: 'medium',
          title: `Keyword Overlap Warning: "${pageA.primaryKeyword}"`,
          detail: `"${pageA.primaryKeyword}" is the primary keyword on ${pageA.slug} and also appears as a secondary keyword on ${pageB.slug}.`,
          keyword: pageA.primaryKeyword,
          affectedPageIds: [pageA.id, pageB.id],
          affectedUrls: [pageA.proposedUrl, pageB.proposedUrl],
          recommendedResolution: `Remove "${pageA.primaryKeyword}" from ${pageB.slug} secondary targets and add an internal link pointing to ${pageA.slug}.`,
          evidence: [],
        });
      }
    }
  }

  // 3. Conflicting search intent between page intent and mapped keyword intent
  const kwByLower = new Map<string, KeywordIntelligenceRecord>(
    params.keywords.map((k) => [k.keyword.trim().toLowerCase(), k]),
  );
  for (const page of activePages) {
    const pk = page.primaryKeyword?.trim().toLowerCase();
    if (!pk) continue;
    const kwRec = kwByLower.get(pk);
    if (kwRec && kwRec.intent !== page.searchIntent) {
      diagnostics.push({
        id: `diag-intent-${page.id}`,
        kind: 'conflicting_search_intent',
        severity: 'medium',
        title: `Search Intent Conflict on ${page.slug}`,
        detail: `Page "${page.title}" is configured for ${page.searchIntent} intent, but Keyword Lab classifies "${kwRec.keyword}" as ${kwRec.intent}.`,
        keyword: kwRec.keyword,
        affectedPageIds: [page.id],
        affectedUrls: [page.existingUrl ?? page.proposedUrl],
        recommendedResolution: `Align page type/intent to ${kwRec.intent} or verify keyword intent classification in Keyword Lab.`,
        evidence: [
          {
            source: 'keyword_intelligence',
            label: `Keyword Intent: ${kwRec.intent}`,
            referenceId: kwRec.id,
            observedDetail: kwRec.intentReason,
          },
        ],
      });
    }
  }

  // 4. Existing pages marked optimize (improve instead of duplicating)
  for (const page of activePages.filter((p) => p.pageStatus === 'optimize')) {
    diagnostics.push({
      id: `diag-opt-${page.id}`,
      kind: 'optimize_existing_page',
      severity: 'low',
      title: `Improve Existing Page Instead of Duplicating: ${page.slug}`,
      detail: page.rationale,
      keyword: page.primaryKeyword,
      affectedPageIds: [page.id],
      affectedUrls: [page.existingUrl ?? page.proposedUrl],
      recommendedResolution:
        'Update on-page headings, metadata, and technical signals on the existing URL rather than creating a new competing slug.',
      evidence: page.evidence,
    });
  }

  // 5. Keywords without a suitable architecture page
  const coveredKeywords = new Set<string>();
  for (const p of activePages) {
    if (p.primaryKeyword) coveredKeywords.add(p.primaryKeyword.trim().toLowerCase());
    for (const s of p.secondaryKeywords) coveredKeywords.add(s.trim().toLowerCase());
    for (const r of p.relatedKeywords) coveredKeywords.add(r.trim().toLowerCase());
  }

  const unmappedKeywords = params.keywords
    .filter((k) => k.workflowState !== 'rejected')
    .filter((k) => !coveredKeywords.has(k.keyword.trim().toLowerCase()))
    .map((k) => ({
      keywordId: k.id,
      keyword: k.keyword,
      intent: k.intent,
      clusterName: k.clusterName,
      targetGeography:
        [k.targetCity, k.targetCountry].filter(Boolean).join(', ') || 'Global',
      marketSearchVolume: k.marketSearchVolume,
      volumeStatus: k.volumeStatus,
      gscImpressions: k.gscImpressions,
      isAiSuggestion: k.isAiSuggestion,
    }));

  if (unmappedKeywords.length > 0) {
    diagnostics.push({
      id: 'diag-unmapped-keywords',
      kind: 'unmapped_keyword',
      severity: unmappedKeywords.length >= 5 ? 'medium' : 'low',
      title: `${unmappedKeywords.length} Keyword(s) Without an Assigned Architecture Page`,
      detail: `Discovered keywords such as "${unmappedKeywords
        .slice(0, 3)
        .map((k) => k.keyword)
        .join('", "')}" are not yet assigned to any primary or secondary page target.`,
      keyword: unmappedKeywords[0].keyword,
      affectedPageIds: [],
      affectedUrls: [],
      recommendedResolution:
        'Assign each high-relevance keyword to an existing page or create a proposed landing page in Website Architecture.',
      evidence: [],
    });
  }

  // 6. Important keyword clusters without sufficient page coverage
  const coveredClusterIds = new Set(
    activePages.map((p) => p.clusterId).filter((id): id is string => Boolean(id)),
  );
  for (const cluster of params.clusters.filter(
    (c) => c.approvalState !== 'rejected' && !coveredClusterIds.has(c.id),
  )) {
    const primaryCovered = coveredKeywords.has(
      cluster.primaryKeyword.trim().toLowerCase(),
    );
    if (!primaryCovered) {
      diagnostics.push({
        id: `diag-cluster-${cluster.id}`,
        kind: 'under_covered_cluster',
        severity: cluster.approvalState === 'approved' ? 'high' : 'medium',
        title: `Uncovered Keyword Cluster: ${cluster.clusterName}`,
        detail: `Cluster "${cluster.clusterName}" (${cluster.keywordsCount} keyword(s), intent ${cluster.dominantIntent}) has no assigned architecture page.`,
        keyword: cluster.primaryKeyword,
        affectedPageIds: [],
        affectedUrls: [],
        recommendedResolution: `Create or assign a ${cluster.recommendedPageType || 'landing'} page for "${cluster.primaryKeyword}".`,
        evidence: [
          {
            source: 'keyword_clusters',
            label: cluster.clusterName,
            referenceId: cluster.id,
            observedDetail: cluster.evidenceSummary,
          },
        ],
      });
    }
  }

  return { diagnostics, unmappedKeywords };
}
