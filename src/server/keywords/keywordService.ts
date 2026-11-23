import crypto from 'node:crypto';
import type { User } from '../../types/auth';
import type {
  CrawledPageOption,
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordEvidenceItem,
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordResearchRun,
  KeywordSourceType,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
  KeywordWorkspaceResponse,
  ProviderAvailabilityStatus,
} from '../../types/keywords';
import {
  createKeywordResearchRun,
  deleteUnapprovedAutoClusters,
  getAuditDb,
  getKeywordBusinessProfile,
  getKeywordClusterById,
  getKeywordIntelligenceRecordById,
  getProjectById,
  listKeywordAuditTrail,
  listKeywordClusters,
  listKeywordIntelligenceRecords,
  listKeywordResearchRuns,
  listLatestCrawledPagesForProject,
  recordActivityEvent,
  recordAuditTrail,
  replaceKeywordEvidenceItems,
  updateKeywordResearchRun,
  upsertKeywordBusinessProfile,
  upsertKeywordCluster,
  upsertKeywordIntelligenceRecord,
  upsertKeywordUrlMapping,
} from '../audit/db';
import { ROLE_APPROVER_LIST } from '../devData';
import {
  buildClusterObject,
  canUserApproveKeywords,
  classifyKeywordIntent,
  clusterKeywords,
  detectKeywordCannibalization,
  isValidKeywordStateTransition,
  normalizeKeywordText,
  requiresOwnerApprovedProfile,
  scoreKeywordOpportunity,
  suggestBestLandingPage,
} from './intelligenceEngine';
import {
  fetchCompetitorPageTopics,
  fetchCrawlContentKeywordCandidates,
  fetchGeminiKeywordExpansions,
  fetchGoogleAdsKeywordPlannerStatus,
  fetchGoogleTrendsInterest,
  fetchGscKeywordSignals,
  fetchSearchSuggestions,
  type ProviderKeywordCandidate,
} from './providers';
import {
  emitRealAgentEvent,
  publishAutonomousDomainTrigger,
} from '../agentFactory/agentFactoryService';

function getBaselineProviderStatuses(
  tenantId: string,
  projectId: string,
): ProviderAvailabilityStatus[] {
  const gscRes = fetchGscKeywordSignals(tenantId, projectId);
  const crawlPages = listLatestCrawledPagesForProject(tenantId, projectId, 10);
  const hasToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const now = new Date().toISOString();

  return [
    gscRes.status,
    {
      provider: 'crawl',
      label: 'Site Crawl Topic Extractor',
      state: crawlPages.length > 0 ? 'available' : 'unavailable',
      configured: crawlPages.length > 0,
      lastCheckedAt: now,
      detail:
        crawlPages.length > 0
          ? 'Completed technical crawl available for on-site topic extraction and URL mapping.'
          : 'No completed site crawl yet. Run a Technical SEO Audit crawl first to map URLs.',
      itemsReturned: crawlPages.length,
    },
    {
      provider: 'autocomplete',
      label: 'Search Autocomplete Suggestions',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail: 'Ready to query live Google Autocomplete suggestions on demand.',
      itemsReturned: 0,
    },
    {
      provider: 'google_trends',
      label: 'Google Trends (Relative 0-100)',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail:
        'Live relative interest (0–100 index) checked per discovery run; marks Unavailable if rate-limited.',
      itemsReturned: 0,
    },
    {
      provider: 'google_ads_planner',
      label: 'Google Ads Keyword Planner',
      state: 'credentials_required',
      configured: hasToken,
      lastCheckedAt: now,
      detail: hasToken
        ? 'Google Ads developer token present; requires active Ads customer authorization for market volumes.'
        : 'Missing GOOGLE_ADS_DEVELOPER_TOKEN. Monthly market search volumes are honestly reported as "Unavailable".',
      itemsReturned: 0,
    },
    {
      provider: 'competitor_fetch',
      label: 'Competitor Page Analyzer',
      state: 'available',
      configured: true,
      lastCheckedAt: now,
      detail: 'SSRF-guarded live HTML heading analyzer for approved competitor URLs.',
      itemsReturned: 0,
    },
    {
      provider: 'gemini_ai',
      label: 'AI Semantic Expansion (Optional)',
      state: hasGemini ? 'available' : 'credentials_required',
      configured: hasGemini,
      lastCheckedAt: now,
      detail: hasGemini
        ? 'Gemini API configured; AI suggestions are strictly tagged as unverified ideas.'
        : 'GEMINI_API_KEY not configured; keyword discovery relies strictly on live search & site data.',
      itemsReturned: 0,
    },
  ];
}

function syncKeywordOpportunitySummary(
  tenantId: string,
  projectId: string,
  record: KeywordIntelligenceRecord,
): void {
  const db = getAuditDb();
  const tier =
    record.opportunityScore >= 72
      ? 'High'
      : record.opportunityScore >= 45
        ? 'Medium'
        : 'Low';
  const legacyApproval =
    record.workflowState === 'approved' ||
    record.workflowState === 'assigned' ||
    record.workflowState === 'implemented' ||
    record.workflowState === 'measured'
      ? 'Approved'
      : record.workflowState === 'rejected'
        ? 'Revision Requested'
        : 'Pending';

  const existing = db
    .prepare(
      'SELECT id FROM keyword_opportunities WHERE tenant_id = ? AND project_id = ? AND LOWER(keyword) = LOWER(?)',
    )
    .get(tenantId, projectId, record.keyword) as { id: string } | undefined;

  const targetUrl = record.mapping?.targetUrl || record.gscObservedUrl || '/';
  const rationale =
    record.scoreBreakdown.reasons[0] ||
    `Phase 7 score ${record.opportunityScore}/100 (${record.workflowState}).`;

  if (existing) {
    db.prepare(`
      UPDATE keyword_opportunities
      SET intent = ?, target_market = ?, search_volume = ?, target_url = ?,
          opportunity = ?, approval_status = ?, current_position = ?,
          clicks = ?, impressions = ?, source_provider = ?, rationale = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      record.intent,
      `${record.targetCountry}${record.targetCity ? ` · ${record.targetCity}` : ''}`,
      record.marketSearchVolume,
      targetUrl,
      tier,
      legacyApproval,
      record.gscAvgPosition,
      record.gscClicks,
      record.gscImpressions,
      record.primarySource,
      rationale,
      record.updatedAt,
      existing.id,
      tenantId,
    );
  } else {
    db.prepare(`
      INSERT INTO keyword_opportunities (
        id, tenant_id, project_id, keyword, intent, target_market, search_volume,
        target_url, opportunity, approval_status, difficulty, current_position,
        clicks, impressions, source_provider, rationale, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      `kwopp-${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      projectId,
      record.keyword,
      record.intent,
      `${record.targetCountry}${record.targetCity ? ` · ${record.targetCity}` : ''}`,
      record.marketSearchVolume,
      targetUrl,
      tier,
      legacyApproval,
      record.gscAvgPosition,
      record.gscClicks,
      record.gscImpressions,
      record.primarySource,
      rationale,
      record.updatedAt,
    );
  }
}

function recomputeMappingsAndCannibalization(params: {
  tenantId: string;
  projectId: string;
  actorName: string;
}): {
  keywords: KeywordIntelligenceRecord[];
  alerts: ReturnType<typeof detectKeywordCannibalization>['alerts'];
} {
  const keywords = listKeywordIntelligenceRecords(params.tenantId, params.projectId);
  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    params.projectId,
    150,
  );
  const pageByUrl = new Map(crawledPages.map((p) => [p.url, p]));
  const now = new Date().toISOString();

  // Ensure every keyword has an initial honest URL mapping record
  const enriched = keywords.map((kw) => {
    let mapping = kw.mapping;
    if (!mapping) {
      const suggestion = suggestBestLandingPage(kw.keyword, crawledPages);
      const chosenUrl = kw.gscObservedUrl || suggestion.matchedPage?.url || null;
      const pageMeta = chosenUrl ? pageByUrl.get(chosenUrl) : undefined;
      mapping = {
        id: `kwm-${crypto.randomUUID().slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        keywordId: kw.id,
        keyword: kw.keyword,
        targetUrl: chosenUrl,
        mappingStatus: chosenUrl ? 'mapped_existing' : 'recommend_new_page',
        recommendedSlug: chosenUrl ? null : suggestion.recommendedSlug,
        pageTitle: pageMeta?.title ?? null,
        pageH1: pageMeta?.h1 ?? null,
        pageStatusCode: pageMeta?.statusCode ?? null,
        pageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
        matchConfidence: chosenUrl ? Math.max(suggestion.confidence, kw.gscObservedUrl ? 0.85 : 0.5) : 0,
        cannibalizationRisk: 'none',
        competingUrls: [],
        competingKeywordIds: [],
        resolutionRecommendation: chosenUrl
          ? null
          : `Create a dedicated page at ${suggestion.recommendedSlug} for "${kw.keyword}".`,
        updatedBy: params.actorName,
        updatedAt: now,
      };
      upsertKeywordUrlMapping(mapping);
    }
    return { ...kw, mapping };
  });

  const { alerts, keywordRisks } = detectKeywordCannibalization({
    keywords: enriched,
    crawledPages,
  });

  const updatedKeywords = enriched.map((kw) => {
    const risk = keywordRisks.get(kw.id);
    const nextMapping: KeywordUrlMappingRecord = {
      ...kw.mapping!,
      cannibalizationRisk: risk?.risk ?? 'none',
      competingUrls: risk?.competingUrls ?? [],
      competingKeywordIds: risk?.competingKeywordIds ?? [],
      resolutionRecommendation:
        risk?.recommendation ??
        (kw.mapping!.mappingStatus === 'recommend_new_page'
          ? `Create dedicated page at ${kw.mapping!.recommendedSlug ?? '/topic'}.`
          : null),
      updatedAt: now,
    };
    upsertKeywordUrlMapping(nextMapping);
    return { ...kw, mapping: nextMapping };
  });

  return { keywords: updatedKeywords, alerts };
}

export function getKeywordWorkspace(
  tenantId: string,
  projectId: string,
): KeywordWorkspaceResponse {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const businessProfile = getKeywordBusinessProfile(tenantId, projectId);
  const researchRuns = listKeywordResearchRuns(tenantId, projectId, 20);
  const clusters = listKeywordClusters(tenantId, projectId);
  const crawledPages = listLatestCrawledPagesForProject(tenantId, projectId, 150);
  const { keywords, alerts } = recomputeMappingsAndCannibalization({
    tenantId,
    projectId,
    actorName: 'System',
  });

  const latestRun = researchRuns[0];
  const providerStatuses =
    latestRun && latestRun.providerStatuses.length > 0
      ? latestRun.providerStatuses
      : getBaselineProviderStatuses(tenantId, projectId);

  const entityIds = [
    businessProfile.id,
    ...keywords.slice(0, 60).map((k) => k.id),
    ...clusters.slice(0, 30).map((c) => c.id),
  ];
  const recentAuditTrail = listKeywordAuditTrail(tenantId, entityIds, 40);

  const scoredValues = keywords
    .map((k) => k.opportunityScore)
    .filter((s) => s > 0);
  const avgOpportunityScore =
    scoredValues.length > 0
      ? Math.round(scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length)
      : null;

  return {
    projectId: project.id,
    projectName: project.name,
    projectWebsite: project.website,
    businessProfile,
    summary: {
      totalKeywords: keywords.length,
      recommendedCount: keywords.filter((k) => k.workflowState === 'recommended').length,
      approvedCount: keywords.filter((k) => k.workflowState === 'approved').length,
      assignedOrImplementedCount: keywords.filter(
        (k) =>
          k.workflowState === 'assigned' ||
          k.workflowState === 'implemented' ||
          k.workflowState === 'measured',
      ).length,
      needsDataCount: keywords.filter((k) => k.workflowState === 'needs-data').length,
      rejectedCount: keywords.filter((k) => k.workflowState === 'rejected').length,
      clusterCount: clusters.length,
      cannibalizationAlertsCount: alerts.length,
      mappedToExistingCount: keywords.filter(
        (k) => k.mapping?.mappingStatus === 'mapped_existing',
      ).length,
      newPageRecommendedCount: keywords.filter(
        (k) => k.mapping?.mappingStatus === 'recommend_new_page',
      ).length,
      avgOpportunityScore,
    },
    providerStatuses,
    researchRuns,
    keywords,
    clusters,
    cannibalizationAlerts: alerts,
    crawledUrls: crawledPages.map(({ headings: _h, ...rest }) => rest),
    recentAuditTrail,
  };
}

export function updateBusinessProfileWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  approvedNiche: string;
  approvedServices: string[];
  targetAudience: string;
  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  competitorUrls: string[];
  approveProfile: boolean;
}): KeywordBusinessProfile {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  if (params.approveProfile && !ROLE_APPROVER_LIST.includes(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot approve business keyword context.`,
    );
  }

  const cleanNiche = params.approvedNiche.trim();
  const cleanServices = params.approvedServices.map((s) => s.trim()).filter(Boolean);

  if (params.approveProfile && (!cleanNiche || cleanServices.length === 0)) {
    throw new Error(
      'BAD_REQUEST: Provide both an approved niche and at least one core service before approving business context.',
    );
  }

  const prev = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const now = new Date().toISOString();
  const nextStatus = params.approveProfile ? 'approved' : 'pending_owner_approval';

  const saved = upsertKeywordBusinessProfile({
    tenantId: params.tenantId,
    projectId: params.projectId,
    approvedNiche: cleanNiche,
    approvedServices: cleanServices,
    targetAudience: params.targetAudience.trim(),
    targetCountry: (params.targetCountry || 'US').trim().toUpperCase().slice(0, 6),
    targetCity: params.targetCity.trim(),
    targetLanguage: (params.targetLanguage || 'en').trim().toLowerCase().slice(0, 8),
    competitorUrls: params.competitorUrls.map((u) => u.trim()).filter(Boolean).slice(0, 5),
    approvalStatus: nextStatus,
    approvedBy: params.approveProfile ? params.user.name : null,
    approvedAt: params.approveProfile ? now : null,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'keyword_profile',
    entityId: saved.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: prev.approvalStatus,
    newState: saved.approvalStatus,
    reason: params.approveProfile
      ? `Approved business context (${cleanNiche}; ${cleanServices.length} services)`
      : 'Updated business keyword context draft',
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'keyword_approval',
    actor: params.user.name,
    action: params.approveProfile
      ? `Approved keyword business profile (${cleanNiche})`
      : 'Updated keyword business profile draft',
    status: params.approveProfile ? 'Succeeded' : 'Pending',
    evidenceUrl: '/keywords',
  });

  return saved;
}

export async function runKeywordDiscoveryWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  seedTerms: string[];
  targetCountry?: string;
  targetCity?: string;
  targetLanguage?: string;
  intentFocus?: KeywordIntent | 'all';
  competitorUrls?: string[];
  includeAutocomplete?: boolean;
  includeTrends?: boolean;
  includeAiExpansion?: boolean;
}): Promise<{
  run: KeywordResearchRun;
  discoveredCount: number;
  clustersCount: number;
}> {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const profile = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const seedTerms = params.seedTerms.map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const effectiveSeeds =
    seedTerms.length > 0
      ? seedTerms
      : profile.approvedServices.length > 0
        ? profile.approvedServices.slice(0, 5)
        : [project.name];

  const targetCountry = (params.targetCountry || profile.targetCountry || 'US')
    .trim()
    .toUpperCase()
    .slice(0, 6);
  const targetCity = (params.targetCity ?? profile.targetCity ?? '').trim();
  const targetLanguage = (params.targetLanguage || profile.targetLanguage || 'en')
    .trim()
    .toLowerCase()
    .slice(0, 8);
  const intentFocus = params.intentFocus ?? 'all';
  const competitorUrls = (
    params.competitorUrls && params.competitorUrls.length > 0
      ? params.competitorUrls
      : profile.competitorUrls
  )
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 3);

  const runId = `kwrun-${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();

  const initialRun = createKeywordResearchRun({
    id: runId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    seedTerms: effectiveSeeds,
    targetCountry,
    targetCity,
    targetLanguage,
    intentFocus,
    competitorUrls,
    status: 'Running',
    totalDiscovered: 0,
    totalClustersCreated: 0,
    providerStatuses: [],
    triggeredBy: params.user.name,
    startedAt: now,
    completedAt: null,
  });

  const kwTaskTitle = `Keyword Discovery (${effectiveSeeds.slice(0, 2).join(', ')})`;
  emitRealAgentEvent({
    eventType: 'agent.started',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'keyword_intelligence_agent',
    status: 'running',
    taskTitle: kwTaskTitle,
    summary: `Collecting search signals for ${effectiveSeeds.length} seed(s) in ${targetCountry}.`,
    evidenceUrl: '/keywords',
  });
  emitRealAgentEvent({
    eventType: 'agent.communication',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'keyword_intelligence_agent',
    sourceAgentId: 'research_agent',
    destinationAgentId: 'keyword_intelligence_agent',
    status: 'communicating',
    taskTitle: kwTaskTitle,
    summary: `Handing discovery seeds (${effectiveSeeds.slice(0, 2).join(', ')}) to Keyword Agent.`,
    evidenceUrl: '/keywords',
  });

  // Execute independent discovery adapters concurrently
  const gscBatch = fetchGscKeywordSignals(params.tenantId, params.projectId);
  const crawlBatch = fetchCrawlContentKeywordCandidates(params.tenantId, params.projectId);

  const [autoBatch, plannerStatus, competitorBatch, aiBatch] = await Promise.all([
    params.includeAutocomplete !== false
      ? fetchSearchSuggestions({
          seeds: effectiveSeeds,
          countryCode: targetCountry,
          languageCode: targetLanguage,
        })
      : Promise.resolve({
          status: {
            provider: 'autocomplete' as const,
            label: 'Search Autocomplete Suggestions',
            state: 'unavailable' as const,
            configured: true,
            lastCheckedAt: now,
            detail: 'Skipped by user request.',
            itemsReturned: 0,
          },
          candidates: [] as ProviderKeywordCandidate[],
        }),
    fetchGoogleAdsKeywordPlannerStatus(),
    competitorUrls.length > 0
      ? fetchCompetitorPageTopics({ competitorUrls })
      : Promise.resolve({
          status: {
            provider: 'competitor_fetch' as const,
            label: 'Competitor Page Analyzer',
            state: 'unavailable' as const,
            configured: true,
            lastCheckedAt: now,
            detail: 'No competitor URLs supplied in this run.',
            itemsReturned: 0,
          },
          candidates: [] as ProviderKeywordCandidate[],
        }),
    params.includeAiExpansion
      ? fetchGeminiKeywordExpansions({
          niche: profile.approvedNiche,
          services: profile.approvedServices,
          seeds: effectiveSeeds,
          targetCountry,
          targetCity,
          targetLanguage,
          intentFocus,
        })
      : Promise.resolve({
          status: {
            provider: 'gemini_ai' as const,
            label: 'AI Semantic Expansion (Optional)',
            state: 'unavailable' as const,
            configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
            lastCheckedAt: now,
            detail: 'AI expansion disabled for this discovery run.',
            itemsReturned: 0,
          },
          candidates: [] as ProviderKeywordCandidate[],
        }),
  ]);

  // Seed terms entered directly by the strategist are also tracked candidates if not found elsewhere
  const seedCandidates: ProviderKeywordCandidate[] = effectiveSeeds.map((seed) => ({
    keyword: seed,
    sourceProvider: 'autocomplete',
    sourceType: 'manual',
    measurementKind: 'search_suggestion',
    sourceUrl: null,
    summary: `Research seed term configured for ${targetCountry}${targetCity ? ` (${targetCity})` : ''}.`,
    rawMetricValue: 'Seed Input',
    geographyScope: targetCity ? `city:${targetCity}` : `country:${targetCountry}`,
    isAiSuggestion: false,
  }));

  const allCandidates = [
    ...gscBatch.candidates,
    ...crawlBatch.candidates,
    ...autoBatch.candidates,
    ...competitorBatch.candidates,
    ...aiBatch.candidates,
    ...seedCandidates,
  ];

  // Aggregate unique normalized keywords preserving multiple source evidence
  const grouped = new Map<string, ProviderKeywordCandidate[]>();
  for (const cand of allCandidates) {
    const norm = normalizeKeywordText(cand.keyword);
    if (!norm) continue;
    const arr = grouped.get(norm) ?? [];
    arr.push(cand);
    grouped.set(norm, arr);
  }

  // Optional Google Trends relative interest check for top terms
  const topTermsForTrends = Array.from(grouped.keys()).slice(0, 5);
  const trendsResult =
    params.includeTrends !== false
      ? await fetchGoogleTrendsInterest({
          terms: topTermsForTrends,
          countryCode: targetCountry,
        })
      : {
          status: {
            provider: 'google_trends' as const,
            label: 'Google Trends (Relative 0-100)',
            state: 'unavailable' as const,
            configured: true,
            lastCheckedAt: now,
            detail: 'Google Trends enrichment skipped by user.',
            itemsReturned: 0,
          },
          signals: new Map(),
        };

  const existingRecords = listKeywordIntelligenceRecords(
    params.tenantId,
    params.projectId,
  );
  const existingByNorm = new Map<string, KeywordIntelligenceRecord>(
    existingRecords.map((r) => [
      `${r.normalizedKeyword}::${r.targetCountry}::${r.targetLanguage}`,
      r,
    ]),
  );

  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    params.projectId,
    150,
  );
  const pageByUrl = new Map(crawledPages.map((p) => [p.url, p]));

  let processedCount = 0;

  for (const [norm, cands] of grouped.entries()) {
    const existing = existingByNorm.get(`${norm}::${targetCountry}::${targetLanguage}`);
    const keywordId = existing?.id ?? `kwi-${crypto.randomUUID().slice(0, 10)}`;
    const displayKw = existing?.keyword ?? cands[0].keyword;

    const sourceSet = new Set<KeywordSourceType>(existing?.sources ?? []);
    for (const c of cands) sourceSet.add(c.sourceType);
    const sources = Array.from(sourceSet);
    const nonAiSource = sources.find((s) => s !== 'ai_expansion');
    const isAiSuggestion = !nonAiSource && sources.includes('ai_expansion');

    const gscCand = cands.find((c) => c.sourceType === 'gsc_query');
    const gscClicks = gscCand?.gscClicks ?? existing?.gscClicks ?? null;
    const gscImpressions = gscCand?.gscImpressions ?? existing?.gscImpressions ?? null;
    const gscCtr = gscCand?.gscCtr ?? existing?.gscCtr ?? null;
    const gscAvgPosition = gscCand?.gscAvgPosition ?? existing?.gscAvgPosition ?? null;
    const gscObservedUrl = gscCand?.gscObservedUrl ?? existing?.gscObservedUrl ?? null;

    const trendSig = trendsResult.signals.get(norm);
    const relativeTrendIndex =
      trendSig?.relativeTrendIndex ?? existing?.relativeTrendIndex ?? null;
    const trendDirection =
      trendSig?.trendDirection ?? existing?.trendDirection ?? 'unavailable';

    const intentInfo = existing?.intentVerifiedBy
      ? {
          intent: existing.intent,
          intentInferred: false,
          confidence: 1,
          reason: `Verified by ${existing.intentVerifiedBy}`,
        }
      : classifyKeywordIntent(displayKw, {
          brandDomain: project.website,
          targetCity,
        });

    if (intentFocus !== 'all' && intentInfo.intent !== intentFocus && cands.every((c) => c.sourceType !== 'manual' && c.sourceType !== 'gsc_query')) {
      // Keep direct seed/GSC signals, skip off-focus suggestions only if they are pure autocomplete/AI extras
      continue;
    }

    const pageMatch = suggestBestLandingPage(displayKw, crawledPages);
    const chosenUrl = existing?.mapping?.targetUrl ?? gscObservedUrl ?? pageMatch.matchedPage?.url ?? null;
    const pageMeta = chosenUrl ? pageByUrl.get(chosenUrl) : undefined;

    const scoreBreakdown = scoreKeywordOpportunity({
      keyword: displayKw,
      intent: intentInfo.intent,
      profile,
      seedTerms: effectiveSeeds,
      sourcesCount: sources.length,
      isAiSuggestion,
      marketSearchVolume: existing?.marketSearchVolume ?? null,
      competitionLevel: existing?.competitionLevel ?? 'unavailable',
      relativeTrendIndex,
      trendDirection,
      gscClicks,
      gscImpressions,
      gscAvgPosition,
      targetCountry,
      targetCity,
      mappedPageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
      mappedStatusCode: pageMeta?.statusCode ?? null,
      mappedExistingUrl: chosenUrl,
    });

    // Workflow state machine progression on discovery/enrichment
    let nextState: KeywordWorkflowState = existing?.workflowState ?? 'discovered';
    if (!existing || existing.workflowState === 'discovered' || existing.workflowState === 'enriched' || existing.workflowState === 'needs-data') {
      if (!scoreBreakdown.relevanceGatePassed) {
        nextState = 'rejected';
      } else if (
        scoreBreakdown.totalScore >= 52 &&
        (gscImpressions !== null || relativeTrendIndex !== null || sources.length >= 2)
      ) {
        nextState = 'recommended';
      } else if (
        isAiSuggestion ||
        (gscImpressions === null && relativeTrendIndex === null)
      ) {
        nextState = 'needs-data';
      } else {
        nextState = 'enriched';
      }
    }

    const metricGeographyScope: KeywordIntelligenceRecord['metricGeographyScope'] =
      targetCity
        ? gscImpressions !== null
          ? 'site_observed'
          : 'country' // Never mislabel country/global trend data as city-level measurement
        : gscImpressions !== null
          ? 'site_observed'
          : 'country';

    const record: KeywordIntelligenceRecord = {
      id: keywordId,
      tenantId: params.tenantId,
      projectId: params.projectId,
      researchRunId: runId,
      keyword: displayKw,
      normalizedKeyword: norm,
      seedTopic: effectiveSeeds[0] ?? null,
      primarySource: nonAiSource ?? sources[0],
      sources,
      isAiSuggestion,
      intent: intentInfo.intent,
      intentInferred: intentInfo.intentInferred,
      intentVerifiedBy: existing?.intentVerifiedBy ?? null,
      intentConfidence: intentInfo.confidence,
      intentReason: intentInfo.reason,
      targetCountry,
      targetCity,
      targetLanguage,
      metricGeographyScope,
      marketSearchVolume: existing?.marketSearchVolume ?? null,
      volumeStatus: existing?.marketSearchVolume !== null && existing?.marketSearchVolume !== undefined ? 'measured' : 'unavailable',
      volumeSource: existing?.volumeSource ?? 'unavailable',
      competitionLevel: existing?.competitionLevel ?? 'unavailable',
      cpcEstimate: existing?.cpcEstimate ?? null,
      relativeTrendIndex,
      trendDirection,
      gscClicks,
      gscImpressions,
      gscCtr,
      gscAvgPosition,
      gscObservedUrl,
      clusterId: existing?.clusterId ?? null,
      clusterName: existing?.clusterName ?? null,
      workflowState: nextState,
      assignedTo: existing?.assignedTo ?? null,
      strategistNotes: existing?.strategistNotes ?? '',
      scoreBreakdown,
      opportunityScore: scoreBreakdown.totalScore,
      mapping: existing?.mapping ?? null,
      evidence: [],
      approvedBy: existing?.approvedBy ?? null,
      approvedAt: existing?.approvedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    upsertKeywordIntelligenceRecord(record);

    const evidenceItems: KeywordEvidenceItem[] = cands.map((c) => ({
      id: `kwev-${crypto.randomUUID().slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      keywordId,
      sourceProvider: c.sourceProvider,
      sourceType: c.sourceType,
      measurementKind: c.measurementKind,
      sourceUrl: c.sourceUrl,
      summary: c.summary,
      rawMetricValue: c.rawMetricValue,
      geographyScope: c.geographyScope,
      collectedAt: now,
    }));

    if (trendSig) {
      evidenceItems.push({
        id: `kwev-${crypto.randomUUID().slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        keywordId,
        sourceProvider: 'google_trends',
        sourceType: 'google_trends',
        measurementKind: 'relative_trend_index',
        sourceUrl: null,
        summary: `Google Trends relative interest ${trendSig.relativeTrendIndex}/100 (${trendSig.trendDirection}) in ${targetCountry} (not absolute search volume).`,
        rawMetricValue: `${trendSig.relativeTrendIndex}/100`,
        geographyScope: trendSig.geographyScope,
        collectedAt: now,
      });
    }

    replaceKeywordEvidenceItems(params.tenantId, keywordId, evidenceItems);

    if (!existing?.mapping) {
      upsertKeywordUrlMapping({
        id: `kwm-${crypto.randomUUID().slice(0, 10)}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        keywordId,
        keyword: displayKw,
        targetUrl: chosenUrl,
        mappingStatus: chosenUrl ? 'mapped_existing' : 'recommend_new_page',
        recommendedSlug: chosenUrl ? null : pageMatch.recommendedSlug,
        pageTitle: pageMeta?.title ?? null,
        pageH1: pageMeta?.h1 ?? null,
        pageStatusCode: pageMeta?.statusCode ?? null,
        pageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
        matchConfidence: chosenUrl
          ? Math.max(pageMatch.confidence, gscObservedUrl ? 0.85 : 0.5)
          : 0,
        cannibalizationRisk: 'none',
        competingUrls: [],
        competingKeywordIds: [],
        resolutionRecommendation: chosenUrl
          ? null
          : `Create dedicated page at ${pageMatch.recommendedSlug}.`,
        updatedBy: params.user.name,
        updatedAt: now,
      });
    }

    syncKeywordOpportunitySummary(params.tenantId, params.projectId, {
      ...record,
      mapping: existing?.mapping ?? {
        id: '',
        tenantId: params.tenantId,
        projectId: params.projectId,
        keywordId,
        keyword: displayKw,
        targetUrl: chosenUrl,
        mappingStatus: chosenUrl ? 'mapped_existing' : 'recommend_new_page',
        recommendedSlug: chosenUrl ? null : pageMatch.recommendedSlug,
        pageTitle: null,
        pageH1: null,
        pageStatusCode: null,
        pageIndexable: null,
        matchConfidence: 0,
        cannibalizationRisk: 'none',
        competingUrls: [],
        competingKeywordIds: [],
        resolutionRecommendation: null,
        updatedBy: params.user.name,
        updatedAt: now,
      },
    });

    processedCount += 1;
  }

  // Re-run semantic clustering while preserving approved/rejected manual clusters
  const allProjectKeywords = listKeywordIntelligenceRecords(
    params.tenantId,
    params.projectId,
  );
  const existingApprovedClusters = listKeywordClusters(
    params.tenantId,
    params.projectId,
  ).filter((c) => c.approvalState !== 'pending_review');

  deleteUnapprovedAutoClusters(params.tenantId, params.projectId);

  const clustered = clusterKeywords({
    tenantId: params.tenantId,
    projectId: params.projectId,
    keywords: allProjectKeywords,
    existingApprovedClusters,
    crawledPages,
  });

  for (const cluster of clustered.clusters) {
    upsertKeywordCluster(cluster);
  }
  for (const kw of allProjectKeywords) {
    const assignment = clustered.assignments.get(kw.id);
    if (
      assignment?.clusterId !== kw.clusterId ||
      assignment?.clusterName !== kw.clusterName
    ) {
      upsertKeywordIntelligenceRecord({
        ...kw,
        clusterId: assignment?.clusterId ?? null,
        clusterName: assignment?.clusterName ?? null,
        updatedAt: now,
      });
    }
  }

  recomputeMappingsAndCannibalization({
    tenantId: params.tenantId,
    projectId: params.projectId,
    actorName: params.user.name,
  });

  const providerStatuses: ProviderAvailabilityStatus[] = [
    gscBatch.status,
    crawlBatch.status,
    autoBatch.status,
    trendsResult.status,
    plannerStatus,
    competitorBatch.status,
    aiBatch.status,
  ];

  const hasWarnings = providerStatuses.some(
    (s) => s.state === 'error' || s.state === 'rate_limited' || s.state === 'blocked',
  );

  const completedRun = updateKeywordResearchRun(params.tenantId, initialRun.id, {
    status: hasWarnings ? 'Completed with Warnings' : 'Completed',
    totalDiscovered: processedCount,
    totalClustersCreated: clustered.clusters.length,
    providerStatuses,
    completedAt: new Date().toISOString(),
  })!;

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'sync',
    actor: params.user.name,
    action: `Ran keyword intelligence discovery (${processedCount} terms, ${clustered.clusters.length} clusters) for ${targetCountry}`,
    status: 'Succeeded',
    evidenceUrl: '/keywords',
  });

  emitRealAgentEvent({
    eventType: 'agent.completed',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: initialRun.id,
    taskId: initialRun.id,
    agentId: 'keyword_intelligence_agent',
    status: 'completed',
    taskTitle: kwTaskTitle,
    summary: `Discovered ${processedCount} keyword(s) across ${clustered.clusters.length} cluster(s).`,
    evidenceUrl: '/keywords',
  });

  publishAutonomousDomainTrigger({
    tenantId: params.tenantId,
    projectId: params.projectId,
    triggerType: 'keyword_intelligence_updated',
    idempotencyKey: `keyword_intel:${initialRun.id}`,
    sourceRef: initialRun.id,
    payloadSummary: `Keyword discovery updated with ${processedCount} terms across ${clustered.clusters.length} clusters (${targetCountry}).`,
    payload: {
      runId: initialRun.id,
      discoveredCount: processedCount,
      clustersCount: clustered.clusters.length,
      targetCountry,
    },
  });

  return {
    run: completedRun,
    discoveredCount: processedCount,
    clustersCount: clustered.clusters.length,
  };
}

export function addManualKeywordRecord(params: {
  tenantId: string;
  projectId: string;
  user: User;
  keyword: string;
  intent?: KeywordIntent;
  targetCountry?: string;
  targetCity?: string;
  targetLanguage?: string;
  targetUrl?: string;
  notes?: string;
}): KeywordIntelligenceRecord {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const cleanKw = params.keyword.trim();
  if (cleanKw.length < 2) {
    throw new Error('BAD_REQUEST: Keyword phrase must be at least 2 characters.');
  }

  const profile = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const targetCountry = (params.targetCountry || profile.targetCountry || 'US')
    .trim()
    .toUpperCase()
    .slice(0, 6);
  const targetCity = (params.targetCity ?? profile.targetCity ?? '').trim();
  const targetLanguage = (params.targetLanguage || profile.targetLanguage || 'en')
    .trim()
    .toLowerCase()
    .slice(0, 8);
  const norm = normalizeKeywordText(cleanKw);
  const now = new Date().toISOString();

  const existing = listKeywordIntelligenceRecords(params.tenantId, params.projectId).find(
    (r) =>
      r.normalizedKeyword === norm &&
      r.targetCountry === targetCountry &&
      r.targetLanguage === targetLanguage,
  );
  const keywordId = existing?.id ?? `kwi-${crypto.randomUUID().slice(0, 10)}`;

  const intentInfo = params.intent
    ? {
        intent: params.intent,
        intentInferred: false,
        confidence: 1,
        reason: `Explicitly set by ${params.user.name}`,
      }
    : classifyKeywordIntent(cleanKw, {
        brandDomain: project.website,
        targetCity,
      });

  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    params.projectId,
    150,
  );
  const chosenUrl =
    params.targetUrl?.trim() ||
    suggestBestLandingPage(cleanKw, crawledPages).matchedPage?.url ||
    null;
  const pageMeta = chosenUrl
    ? crawledPages.find((p) => p.url === chosenUrl)
    : undefined;

  const scoreBreakdown = scoreKeywordOpportunity({
    keyword: cleanKw,
    intent: intentInfo.intent,
    profile,
    seedTerms: profile.approvedServices,
    sourcesCount: 1,
    isAiSuggestion: false,
    marketSearchVolume: existing?.marketSearchVolume ?? null,
    competitionLevel: existing?.competitionLevel ?? 'unavailable',
    relativeTrendIndex: existing?.relativeTrendIndex ?? null,
    trendDirection: existing?.trendDirection ?? 'unavailable',
    gscClicks: existing?.gscClicks ?? null,
    gscImpressions: existing?.gscImpressions ?? null,
    gscAvgPosition: existing?.gscAvgPosition ?? null,
    targetCountry,
    targetCity,
    mappedPageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
    mappedStatusCode: pageMeta?.statusCode ?? null,
    mappedExistingUrl: chosenUrl,
  });

  const record: KeywordIntelligenceRecord = {
    id: keywordId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    researchRunId: existing?.researchRunId ?? null,
    keyword: cleanKw,
    normalizedKeyword: norm,
    seedTopic: existing?.seedTopic ?? cleanKw,
    primarySource: 'manual',
    sources: Array.from(new Set([...(existing?.sources ?? []), 'manual'])),
    isAiSuggestion: false,
    intent: intentInfo.intent,
    intentInferred: intentInfo.intentInferred,
    intentVerifiedBy: params.intent ? params.user.name : existing?.intentVerifiedBy ?? null,
    intentConfidence: intentInfo.confidence,
    intentReason: intentInfo.reason,
    targetCountry,
    targetCity,
    targetLanguage,
    metricGeographyScope: 'global_unverified',
    marketSearchVolume: existing?.marketSearchVolume ?? null,
    volumeStatus: existing?.volumeStatus ?? 'unavailable',
    volumeSource: existing?.volumeSource ?? 'unavailable',
    competitionLevel: existing?.competitionLevel ?? 'unavailable',
    cpcEstimate: existing?.cpcEstimate ?? null,
    relativeTrendIndex: existing?.relativeTrendIndex ?? null,
    trendDirection: existing?.trendDirection ?? 'unavailable',
    gscClicks: existing?.gscClicks ?? null,
    gscImpressions: existing?.gscImpressions ?? null,
    gscCtr: existing?.gscCtr ?? null,
    gscAvgPosition: existing?.gscAvgPosition ?? null,
    gscObservedUrl: existing?.gscObservedUrl ?? null,
    clusterId: existing?.clusterId ?? null,
    clusterName: existing?.clusterName ?? null,
    workflowState: existing?.workflowState ?? (scoreBreakdown.relevanceGatePassed ? 'needs-data' : 'rejected'),
    assignedTo: existing?.assignedTo ?? null,
    strategistNotes: params.notes?.trim() ?? existing?.strategistNotes ?? '',
    scoreBreakdown,
    opportunityScore: scoreBreakdown.totalScore,
    mapping: null,
    evidence: [],
    approvedBy: existing?.approvedBy ?? null,
    approvedAt: existing?.approvedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  upsertKeywordIntelligenceRecord(record);

  replaceKeywordEvidenceItems(params.tenantId, keywordId, [
    {
      id: `kwev-${crypto.randomUUID().slice(0, 10)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      keywordId,
      sourceProvider: 'manual',
      sourceType: 'manual',
      measurementKind: 'strategist_input',
      sourceUrl: chosenUrl,
      summary: `Manually added by ${params.user.name}. Volume marked Unavailable until external metrics are fetched.`,
      rawMetricValue: 'Manual Target',
      geographyScope: targetCity ? `city:${targetCity}` : `country:${targetCountry}`,
      collectedAt: now,
    },
    ...(existing?.evidence ?? []),
  ]);

  const slug = `/${norm.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}`;
  const mapping: KeywordUrlMappingRecord = {
    id: existing?.mapping?.id ?? `kwm-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    keywordId,
    keyword: cleanKw,
    targetUrl: chosenUrl,
    mappingStatus: chosenUrl ? 'mapped_existing' : 'recommend_new_page',
    recommendedSlug: chosenUrl ? null : slug,
    pageTitle: pageMeta?.title ?? null,
    pageH1: pageMeta?.h1 ?? null,
    pageStatusCode: pageMeta?.statusCode ?? null,
    pageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
    matchConfidence: chosenUrl ? 0.9 : 0,
    cannibalizationRisk: 'none',
    competingUrls: [],
    competingKeywordIds: [],
    resolutionRecommendation: chosenUrl ? null : `Create dedicated page at ${slug}.`,
    updatedBy: params.user.name,
    updatedAt: now,
  };
  upsertKeywordUrlMapping(mapping);
  syncKeywordOpportunitySummary(params.tenantId, params.projectId, {
    ...record,
    mapping,
  });

  recomputeMappingsAndCannibalization({
    tenantId: params.tenantId,
    projectId: params.projectId,
    actorName: params.user.name,
  });

  return getKeywordIntelligenceRecordById(params.tenantId, keywordId)!;
}

export function transitionKeywordWorkflowState(params: {
  tenantId: string;
  keywordId: string;
  user: User;
  nextState: KeywordWorkflowState;
  assignedTo?: string | null;
  notes?: string;
}): KeywordIntelligenceRecord {
  const existing = getKeywordIntelligenceRecordById(params.tenantId, params.keywordId);
  if (!existing) throw new Error('NOT_FOUND: Keyword intelligence record not found.');

  if (!canUserApproveKeywords(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot approve or modify keyword workflow states.`,
    );
  }

  if (!isValidKeywordStateTransition(existing.workflowState, params.nextState)) {
    throw new Error(
      `BAD_REQUEST: Invalid keyword workflow transition from "${existing.workflowState}" to "${params.nextState}".`,
    );
  }

  const profile = getKeywordBusinessProfile(params.tenantId, existing.projectId);
  if (
    requiresOwnerApprovedProfile(params.nextState) &&
    profile.approvalStatus !== 'approved'
  ) {
    throw new Error(
      'PRECONDITION_FAILED: Business niche and core services must be approved by an owner before approving or assigning keywords.',
    );
  }

  if (params.nextState === 'assigned' && !(params.assignedTo?.trim() || existing.assignedTo)) {
    throw new Error(
      'BAD_REQUEST: Specify an assignee (strategist or writer) when assigning a keyword.',
    );
  }

  const now = new Date().toISOString();
  const updated: KeywordIntelligenceRecord = {
    ...existing,
    workflowState: params.nextState,
    assignedTo:
      params.assignedTo !== undefined
        ? params.assignedTo?.trim() || null
        : existing.assignedTo,
    strategistNotes:
      params.notes !== undefined ? params.notes.trim() : existing.strategistNotes,
    approvedBy:
      params.nextState === 'approved' ? params.user.name : existing.approvedBy,
    approvedAt: params.nextState === 'approved' ? now : existing.approvedAt,
    updatedAt: now,
  };

  upsertKeywordIntelligenceRecord(updated);
  syncKeywordOpportunitySummary(params.tenantId, existing.projectId, updated);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'keyword',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.workflowState,
    newState: updated.workflowState,
    reason:
      params.notes?.trim() ||
      `Transitioned "${updated.keyword}" from ${existing.workflowState} to ${updated.workflowState}`,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: existing.projectId,
    type: 'keyword_approval',
    actor: params.user.name,
    action: `Set "${updated.keyword}" workflow state to ${updated.workflowState}`,
    status: updated.workflowState === 'approved' || updated.workflowState === 'measured' ? 'Succeeded' : 'Pending',
    evidenceUrl: '/keywords',
  });

  return getKeywordIntelligenceRecordById(params.tenantId, existing.id)!;
}

export function updateKeywordIntentOrMapping(params: {
  tenantId: string;
  keywordId: string;
  user: User;
  intent?: KeywordIntent;
  targetUrl?: string | null;
  mappingStatus?: KeywordUrlMappingRecord['mappingStatus'];
  recommendedSlug?: string | null;
  notes?: string;
}): KeywordIntelligenceRecord {
  const existing = getKeywordIntelligenceRecordById(params.tenantId, params.keywordId);
  if (!existing) throw new Error('NOT_FOUND: Keyword intelligence record not found.');

  if (!canUserApproveKeywords(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot modify keyword intent or URL mappings.`,
    );
  }

  const now = new Date().toISOString();
  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    existing.projectId,
    150,
  );
  const pageByUrl = new Map(crawledPages.map((p) => [p.url, p]));
  const profile = getKeywordBusinessProfile(params.tenantId, existing.projectId);

  const nextIntent = params.intent ?? existing.intent;
  const nextUrl =
    params.targetUrl !== undefined
      ? params.targetUrl?.trim() || null
      : existing.mapping?.targetUrl ?? null;
  const nextMappingStatus =
    params.mappingStatus ??
    (nextUrl ? 'mapped_existing' : existing.mapping?.mappingStatus ?? 'recommend_new_page');
  const pageMeta = nextUrl ? pageByUrl.get(nextUrl) : undefined;

  const nextScore = scoreKeywordOpportunity({
    keyword: existing.keyword,
    intent: nextIntent,
    profile,
    seedTerms: existing.seedTopic ? [existing.seedTopic] : profile.approvedServices,
    sourcesCount: existing.sources.length,
    isAiSuggestion: existing.isAiSuggestion,
    marketSearchVolume: existing.marketSearchVolume,
    competitionLevel: existing.competitionLevel,
    relativeTrendIndex: existing.relativeTrendIndex,
    trendDirection: existing.trendDirection,
    gscClicks: existing.gscClicks,
    gscImpressions: existing.gscImpressions,
    gscAvgPosition: existing.gscAvgPosition,
    targetCountry: existing.targetCountry,
    targetCity: existing.targetCity,
    mappedPageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
    mappedStatusCode: pageMeta?.statusCode ?? null,
    mappedExistingUrl: nextUrl,
  });

  const updatedRecord: KeywordIntelligenceRecord = {
    ...existing,
    intent: nextIntent,
    intentInferred: params.intent ? false : existing.intentInferred,
    intentVerifiedBy: params.intent ? params.user.name : existing.intentVerifiedBy,
    intentReason: params.intent
      ? `Verified by ${params.user.name}`
      : existing.intentReason,
    strategistNotes:
      params.notes !== undefined ? params.notes.trim() : existing.strategistNotes,
    scoreBreakdown: nextScore,
    opportunityScore: nextScore.totalScore,
    updatedAt: now,
  };

  upsertKeywordIntelligenceRecord(updatedRecord);

  const nextMapping: KeywordUrlMappingRecord = {
    id: existing.mapping?.id ?? `kwm-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: existing.projectId,
    keywordId: existing.id,
    keyword: existing.keyword,
    targetUrl: nextMappingStatus === 'recommend_new_page' ? null : nextUrl,
    mappingStatus: nextMappingStatus,
    recommendedSlug:
      nextMappingStatus === 'recommend_new_page'
        ? params.recommendedSlug?.trim() ||
          existing.mapping?.recommendedSlug ||
          `/${existing.normalizedKeyword.replace(/\s+/g, '-')}`
        : null,
    pageTitle: pageMeta?.title ?? null,
    pageH1: pageMeta?.h1 ?? null,
    pageStatusCode: pageMeta?.statusCode ?? null,
    pageIndexable: pageMeta ? pageMeta.indexability === 'Indexable' : null,
    matchConfidence: nextUrl ? 0.95 : 0,
    cannibalizationRisk: existing.mapping?.cannibalizationRisk ?? 'none',
    competingUrls: existing.mapping?.competingUrls ?? [],
    competingKeywordIds: existing.mapping?.competingKeywordIds ?? [],
    resolutionRecommendation: existing.mapping?.resolutionRecommendation ?? null,
    updatedBy: params.user.name,
    updatedAt: now,
  };

  upsertKeywordUrlMapping(nextMapping);

  if (params.intent && params.intent !== existing.intent) {
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'keyword',
      entityId: existing.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existing.intent,
      newState: nextIntent,
      reason: 'Strategist verified/updated search intent',
    });
  }
  if (params.targetUrl !== undefined || params.mappingStatus !== undefined) {
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'keyword_mapping',
      entityId: existing.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existing.mapping?.targetUrl ?? existing.mapping?.mappingStatus ?? 'unmapped',
      newState: nextMapping.targetUrl ?? nextMapping.mappingStatus,
      reason: 'Updated keyword target URL mapping',
    });
  }

  recomputeMappingsAndCannibalization({
    tenantId: params.tenantId,
    projectId: existing.projectId,
    actorName: params.user.name,
  });

  return getKeywordIntelligenceRecordById(params.tenantId, existing.id)!;
}

export function updateKeywordClusterWorkflow(params: {
  tenantId: string;
  clusterId: string;
  user: User;
  clusterName?: string;
  suggestedLandingUrl?: string | null;
  approvalState?: KeywordCluster['approvalState'];
  notes?: string;
}): KeywordCluster {
  const existing = getKeywordClusterById(params.tenantId, params.clusterId);
  if (!existing) throw new Error('NOT_FOUND: Keyword cluster not found.');

  if (!canUserApproveKeywords(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot edit or approve keyword clusters.`,
    );
  }

  if (params.approvalState === 'approved') {
    const profile = getKeywordBusinessProfile(params.tenantId, existing.projectId);
    if (profile.approvalStatus !== 'approved') {
      throw new Error(
        'PRECONDITION_FAILED: Business niche and services must be owner-approved before approving clusters.',
      );
    }
  }

  const now = new Date().toISOString();
  const next: KeywordCluster = {
    ...existing,
    clusterName: params.clusterName?.trim() || existing.clusterName,
    suggestedLandingUrl:
      params.suggestedLandingUrl !== undefined
        ? params.suggestedLandingUrl?.trim() || null
        : existing.suggestedLandingUrl,
    approvalState: params.approvalState ?? existing.approvalState,
    approvedBy:
      params.approvalState === 'approved' ? params.user.name : existing.approvedBy,
    approvedAt: params.approvalState === 'approved' ? now : existing.approvedAt,
    notes: params.notes !== undefined ? params.notes.trim() : existing.notes,
    updatedAt: now,
  };

  upsertKeywordCluster(next);

  // Sync renamed cluster display onto member keywords
  if (next.clusterName !== existing.clusterName) {
    const all = listKeywordIntelligenceRecords(params.tenantId, existing.projectId);
    for (const kw of all) {
      if (kw.clusterId === existing.id) {
        upsertKeywordIntelligenceRecord({
          ...kw,
          clusterName: next.clusterName,
          updatedAt: now,
        });
      }
    }
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'keyword_cluster',
    entityId: next.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.approvalState,
    newState: next.approvalState,
    reason: `Updated cluster "${next.clusterName}"`,
  });

  return next;
}

export function mergeKeywordClustersWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  clusterIds: string[];
  mergedName?: string;
}): KeywordCluster {
  if (!canUserApproveKeywords(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot merge keyword clusters.`,
    );
  }

  const uniqueIds = Array.from(new Set(params.clusterIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length < 2) {
    throw new Error('BAD_REQUEST: Select at least 2 clusters to merge.');
  }

  const targetClusters = uniqueIds
    .map((id) => getKeywordClusterById(params.tenantId, id))
    .filter((c): c is KeywordCluster => Boolean(c && c.projectId === params.projectId));

  if (targetClusters.length < 2) {
    throw new Error('NOT_FOUND: Could not find two active clusters in this project.');
  }

  const allKeywords = listKeywordIntelligenceRecords(params.tenantId, params.projectId);
  const memberIdSet = new Set(targetClusters.flatMap((c) => c.keywordIds));
  const members = allKeywords.filter((k) => memberIdSet.has(k.id));
  if (members.length === 0) {
    throw new Error('BAD_REQUEST: Selected clusters contain no keywords.');
  }

  const crawledPages = listLatestCrawledPagesForProject(
    params.tenantId,
    params.projectId,
    150,
  );
  const primaryCluster = targetClusters[0];
  const now = new Date().toISOString();

  const merged = buildClusterObject({
    clusterId: primaryCluster.id,
    tenantId: params.tenantId,
    projectId: params.projectId,
    members,
    crawledPages,
    approvalState: primaryCluster.approvalState,
    customName: params.mergedName?.trim() || primaryCluster.clusterName,
    approvedBy: primaryCluster.approvedBy,
    approvedAt: primaryCluster.approvedAt,
    notes: `Merged ${targetClusters.length} clusters by ${params.user.name}`,
    now,
  });

  upsertKeywordCluster(merged);

  for (const secondary of targetClusters.slice(1)) {
    upsertKeywordCluster({
      ...secondary,
      mergedIntoClusterId: merged.id,
      updatedAt: now,
    });
  }

  for (const kw of members) {
    upsertKeywordIntelligenceRecord({
      ...kw,
      clusterId: merged.id,
      clusterName: merged.clusterName,
      updatedAt: now,
    });
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'keyword_cluster',
    entityId: merged.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: targetClusters.map((c) => c.clusterName).join(' + '),
    newState: merged.clusterName,
    reason: `Merged ${targetClusters.length} clusters into "${merged.clusterName}" (${members.length} keywords)`,
  });

  return merged;
}

export function exportKeywordStrategyBundle(
  tenantId: string,
  projectId: string,
) {
  const workspace = getKeywordWorkspace(tenantId, projectId);
  return {
    exportedAt: new Date().toISOString(),
    projectId: workspace.projectId,
    projectName: workspace.projectName,
    projectWebsite: workspace.projectWebsite,
    businessProfile: workspace.businessProfile,
    summary: workspace.summary,
    clusters: workspace.clusters,
    keywords: workspace.keywords,
    cannibalizationAlerts: workspace.cannibalizationAlerts,
  };
}
