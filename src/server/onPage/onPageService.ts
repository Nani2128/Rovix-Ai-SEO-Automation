import crypto from 'node:crypto';
import type {
  AgentWorkflowDetail,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
} from '../../types/agentFactory';
import type { User, UserRole } from '../../types/auth';
import type {
  CmsConnectionRecord,
  CmsPlatform,
  OnPageAnalysisRunRecord,
  OnPageApprovalRecord,
  OnPageApprovalStatus,
  OnPageDraftContentPayload,
  OnPageIssueRecord,
  OnPageOptimizationDraftRecord,
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
  OnPageValidationRecord,
  OnPageWorkspacePayload,
} from '../../types/onPage';
import type { DeveloperTicket } from '../../types/technicalIssue';
import {
  analyzeCrawledPagesForOnPage,
  normalizeUrlPath,
  serializeOnPageReportToCsv,
  verifyDraftAgainstFreshCrawl,
} from '../../lib/onPageEngine';
import { publishTenantActivityUpdate } from '../activity/activityBus';
import {
  getAuditDb,
  getProjectById,
  listContentGaps,
  listCrawlRuns,
  listGeoTargetMarkets,
  listKeywordClusters,
  listKeywordIntelligenceRecords,
  listKeywordUrlMappings,
  listProjectIssues,
  queryCrawlUrls,
  readObjectSnapshot,
  recordActivityEvent,
  recordAuditTrail,
} from '../audit/db';
import { isGeminiProviderConfigured } from '../agentFactory/contentGenerationAdapter';
import { listWorkflowsForProject } from '../agentFactory/orchestrationDb';
import { createAgentWorkflow } from '../agentFactory/orchestrationEngine';
import { enforceBudgetsBeforeWorkflowLaunch } from '../agentFactory/usageIntelligenceService';
import {
  listArchitecturePagesInDb,
  listInternalLinksInDb,
  listStrategyVersionsInDb,
} from '../strategy/strategyDb';
import {
  buildManualCmsHandoffExport,
  CMS_PLATFORM_DESCRIPTORS,
  prepareEncryptedCmsConfiguration,
} from './cmsAdapters';
import { generateOnPageAiRecommendationsWithGemini } from './onPageAiAdapter';
import {
  deleteCmsConnectionInDb,
  getLatestOnPageRunInDb,
  getOnPageIssueByIdInDb,
  getOptimizationDraftByIdInDb,
  getPageAnalysisByIdInDb,
  getRecommendationByIdInDb,
  insertOnPageApprovalInDb,
  insertOnPageRunInDb,
  insertOnPageValidationInDb,
  insertOptimizationDraftInDb,
  insertRecommendationInDb,
  listCmsConnectionsInDb,
  listOnPageApprovalsInDb,
  listOnPageIssuesInDb,
  listOnPageValidationsInDb,
  listOptimizationDraftsInDb,
  listPageAnalysesInDb,
  listRecommendationsInDb,
  updateOnPageIssueStateInDb,
  updateOptimizationDraftStateInDb,
  updatePageLifecycleInDb,
  updateRecommendationApprovalInDb,
  upsertCmsConnectionInDb,
  upsertDeduplicatedIssueInDb,
  upsertDeterministicRecommendationInDb,
  upsertPageAnalysisInDb,
} from './onPageDb';

const ONPAGE_EDITOR_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
  'Editor',
]);

const ONPAGE_APPROVER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
]);

const ONPAGE_BULK_APPROVER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
]);

const CMS_MANAGER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'Developer',
]);

const TASK_CREATOR_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Developer',
  'Project Manager',
]);

const WORKFLOW_LAUNCHER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
  'Editor',
  'Developer',
]);

export function canEditOnPage(role: UserRole): boolean {
  return ONPAGE_EDITOR_ROLES.has(role);
}

export function canApproveOnPage(role: UserRole): boolean {
  return ONPAGE_APPROVER_ROLES.has(role);
}

export function canBulkApproveOnPage(role: UserRole): boolean {
  return ONPAGE_BULK_APPROVER_ROLES.has(role);
}

export function canManageCmsIntegrations(role: UserRole): boolean {
  return CMS_MANAGER_ROLES.has(role);
}

function assertRole(allowed: boolean, message: string): void {
  if (!allowed) {
    throw new Error(`FORBIDDEN: ${message}`);
  }
}

function requireProjectForTenant(tenantId: string, projectId: string) {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found for this tenant.');
  }
  return project;
}

function getLatestCompletedCrawl(tenantId: string, projectId: string) {
  const runs = listCrawlRuns(tenantId, projectId);
  return (
    runs.find((r) => r.crawlType === 'full' && r.status === 'Succeeded' && r.processedCount > 0) ??
    runs.find((r) => r.crawlType === 'full' && r.status === 'Partial' && r.processedCount > 0) ??
    runs.find((r) => r.status === 'Succeeded' && r.processedCount > 0) ??
    runs.find((r) => r.status === 'Partial' && r.processedCount > 0) ??
    runs.find((r) => r.status === 'Succeeded') ??
    runs[0] ??
    null
  );
}

function loadAllCrawlUrlsForRun(tenantId: string, crawlId: string) {
  const allUrls = [];
  let page = 1;
  const pageSize = 200;
  while (page <= 10) {
    const res = queryCrawlUrls({ tenantId, crawlId, page, pageSize });
    allUrls.push(...res.items);
    if (allUrls.length >= res.total || res.items.length < pageSize) break;
    page += 1;
  }
  return allUrls;
}

function loadHtmlSnapshotForUrl(
  tenantId: string,
  crawlUrl: { renderedDomObjectRef?: string | null; rawHtmlObjectRef?: string | null },
): string | null {
  if (crawlUrl.renderedDomObjectRef) {
    const dom = readObjectSnapshot(tenantId, crawlUrl.renderedDomObjectRef);
    if (dom && dom.trim()) return dom;
  }
  if (crawlUrl.rawHtmlObjectRef) {
    const raw = readObjectSnapshot(tenantId, crawlUrl.rawHtmlObjectRef);
    if (raw && raw.trim()) return raw;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Workspace Payload
// ---------------------------------------------------------------------------

export function getOnPageWorkspace(
  tenantId: string,
  projectId: string,
  user: User,
): OnPageWorkspacePayload {
  const project = requireProjectForTenant(tenantId, projectId);
  const latestCrawl = getLatestCompletedCrawl(tenantId, projectId);
  const latestRun = getLatestOnPageRunInDb(tenantId, projectId);
  const pages = listPageAnalysesInDb(tenantId, projectId);
  const issues = listOnPageIssuesInDb(tenantId, projectId);
  const recommendations = listRecommendationsInDb(tenantId, projectId);
  const drafts = listOptimizationDraftsInDb(tenantId, projectId);
  const approvals = listOnPageApprovalsInDb(tenantId, projectId, 120);
  const validations = listOnPageValidationsInDb(tenantId, projectId, 120);
  const cmsConnections = listCmsConnectionsInDb(tenantId, projectId);

  // Reuse Module 7 internal link recommendations from latest strategy version
  const strategyVersions = listStrategyVersionsInDb(tenantId, projectId);
  const latestStrategy = strategyVersions[0] ?? null;
  const module7InternalLinks = latestStrategy
    ? listInternalLinksInDb(tenantId, projectId, latestStrategy.id).map((l) => ({
        id: l.id,
        sourceUrl: l.sourceUrl,
        sourceTitle: l.sourceTitle,
        targetUrl: l.targetUrl,
        targetTitle: l.targetTitle,
        suggestedAnchorText: l.suggestedAnchorText,
        linkCategory: l.linkCategory,
        existsInCrawl: l.existsInCrawl,
        currentInboundCount: l.currentInboundCount,
        reason: l.reason,
        approvalStatus: l.approvalStatus,
      }))
    : [];

  const workflows = listWorkflowsForProject(tenantId, projectId, 40)
    .filter(
      (w) =>
        w.config?.module === 'module_8_onpage_seo' ||
        w.name.toLowerCase().includes('on-page'),
    )
    .slice(0, 12)
    .map((w) => ({
      workflowId: w.id,
      name: w.name,
      status: w.status,
      currentStage: w.currentStage,
      createdAt: w.createdAt,
      completedAt: w.completedAt,
    }));

  const scoredPages = pages.filter(
    (p) => p.scoreStatus === 'scored' && p.overallScore !== null,
  );
  const averageScore =
    scoredPages.length > 0
      ? Math.round(
          scoredPages.reduce((sum, p) => sum + (p.overallScore ?? 0), 0) /
            scoredPages.length,
        )
      : null;

  const pagesAwaitingApprovalSet = new Set<string>();
  for (const r of recommendations) {
    if (r.approvalStatus === 'pending_review') pagesAwaitingApprovalSet.add(r.pageUrl);
  }
  for (const d of drafts) {
    if (d.approvalStatus === 'pending_review') pagesAwaitingApprovalSet.add(d.pageUrl);
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectWebsite: project.website,
    canEditOnPage: canEditOnPage(user.role),
    canApproveOnPage: canApproveOnPage(user.role),
    canBulkApprove: canBulkApproveOnPage(user.role),
    canManageCms: canManageCmsIntegrations(user.role),
    canCreateTasks: TASK_CREATOR_ROLES.has(user.role),
    canLaunchWorkflows: WORKFLOW_LAUNCHER_ROLES.has(user.role),
    geminiConfigured: isGeminiProviderConfigured(),
    latestCrawlId: latestCrawl?.id ?? null,
    latestCrawlAt: latestCrawl?.completedAt ?? latestCrawl?.startedAt ?? null,
    latestRun,
    overview: {
      crawledPagesAnalyzed: pages.length,
      pagesWithIssues: pages.filter((p) => p.issueCount > 0).length,
      totalOpenIssues: issues.filter(
        (i) => i.lifecycleStatus !== 'verified' && i.approvalStatus !== 'rejected',
      ).length,
      pagesAwaitingApproval: pagesAwaitingApprovalSet.size,
      draftRecommendationsCount: recommendations.filter(
        (r) => r.approvalStatus === 'pending_review',
      ).length,
      approvedDraftsCount: drafts.filter((d) => d.approvalStatus === 'approved').length,
      verifiedImprovementsCount: drafts.filter(
        (d) => d.lifecycleStatus === 'verified',
      ).length,
      unavailableEvidenceCount: pages.filter(
        (p) => p.scoreStatus === 'insufficient_evidence',
      ).length,
      averageScore,
      scoredPagesCount: scoredPages.length,
    },
    pages,
    issues,
    recommendations,
    drafts,
    approvals,
    validations,
    module7InternalLinks,
    cmsConnections,
    cmsPlatforms: CMS_PLATFORM_DESCRIPTORS,
    recentOnPageWorkflows: workflows,
    recommendedAgents: [
      'technical_seo_agent',
      'keyword_intelligence_agent',
      'content_strategy_agent',
      'content_generation_agent',
      'quality_assurance_agent',
      'reporting_agent',
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Run Deterministic Crawl-Backed On-Page Analysis
// ---------------------------------------------------------------------------

export function runOnPageAnalysis(params: {
  tenantId: string;
  projectId: string;
  user: User;
  crawlId?: string | null;
}): {
  run: OnPageAnalysisRunRecord;
  pages: OnPagePageAnalysisRecord[];
  issues: OnPageIssueRecord[];
  recommendations: OnPageRecommendationRecord[];
} {
  assertRole(
    canEditOnPage(params.user.role),
    `Role "${params.user.role}" does not have permission to run On-Page SEO analysis.`,
  );
  const project = requireProjectForTenant(params.tenantId, params.projectId);

  const runs = listCrawlRuns(params.tenantId, params.projectId);
  const selectedCrawl = params.crawlId
    ? runs.find((r) => r.id === params.crawlId) ?? null
    : getLatestCompletedCrawl(params.tenantId, params.projectId);

  if (!selectedCrawl) {
    throw new Error(
      'PREREQUISITE_MISSING: No website crawl exists for this project yet. Run an authorized crawl in Crawl Engine (Module 3) before running On-Page SEO analysis.',
    );
  }

  const crawledUrls = loadAllCrawlUrlsForRun(params.tenantId, selectedCrawl.id);
  if (crawledUrls.length === 0) {
    throw new Error(
      `PREREQUISITE_MISSING: Crawl ${selectedCrawl.id} contains 0 crawled URLs. Complete a crawl with discoverable pages first.`,
    );
  }

  const htmlByUrlId: Record<string, string | null> = {};
  for (const u of crawledUrls) {
    htmlByUrlId[u.id] = loadHtmlSnapshotForUrl(params.tenantId, u);
  }

  const technicalIssues = listProjectIssues(params.tenantId, params.projectId);
  const keywords = listKeywordIntelligenceRecords(params.tenantId, params.projectId);
  const clusters = listKeywordClusters(params.tenantId, params.projectId);
  const keywordMappings = listKeywordUrlMappings(params.tenantId, params.projectId);
  const approvedMarkets = listGeoTargetMarkets(params.tenantId, params.projectId);
  const contentGaps = listContentGaps(params.tenantId, params.projectId);

  const strategyVersions = listStrategyVersionsInDb(
    params.tenantId,
    params.projectId,
  );
  const latestStrategy = strategyVersions[0] ?? null;
  const architecturePages = latestStrategy
    ? listArchitecturePagesInDb(params.tenantId, params.projectId, latestStrategy.id)
    : [];
  const internalLinkRecs = latestStrategy
    ? listInternalLinksInDb(params.tenantId, params.projectId, latestStrategy.id)
    : [];

  const evaluations = analyzeCrawledPagesForOnPage({
    projectName: project.name,
    projectWebsite: project.website,
    crawledUrls,
    htmlByUrlId,
    technicalIssues,
    keywords,
    clusters,
    keywordMappings,
    approvedMarkets,
    contentGaps,
    architecturePages,
    internalLinkRecs,
  });

  const now = new Date().toISOString();
  const runId = `onpage_run_${crypto.randomUUID().slice(0, 12)}`;

  let totalIssuesCount = 0;
  let unavailablePagesCount = 0;
  const persistedPages: OnPagePageAnalysisRecord[] = [];
  const persistedIssues: OnPageIssueRecord[] = [];
  const persistedRecs: OnPageRecommendationRecord[] = [];

  for (const crawlUrl of crawledUrls) {
    const evalRes = evaluations.get(crawlUrl.id);
    if (!evalRes) continue;

    if (evalRes.scoreBreakdown.scoreStatus === 'insufficient_evidence') {
      unavailablePagesCount += 1;
    }

    const criticalHighCount = evalRes.issues.filter(
      (i) => i.severity === 'Critical' || i.severity === 'High',
    ).length;

    const pageRecord = upsertPageAnalysisInDb({
      tenantId: params.tenantId,
      projectId: params.projectId,
      analysisRunId: runId,
      crawlId: selectedCrawl.id,
      crawlUrlId: crawlUrl.id,
      url: crawlUrl.normalizedUrl,
      slug: normalizeUrlPath(crawlUrl.normalizedUrl),
      pageType: evalRes.pageType,
      statusCode: crawlUrl.statusCode,
      indexability: crawlUrl.indexability,
      canonicalUrl: crawlUrl.canonicalUrl,
      canonicalStatus: crawlUrl.canonicalStatus,
      title: crawlUrl.title,
      metaDescription: crawlUrl.metaDescription,
      h1: evalRes.htmlExtract.h1List[0] ?? crawlUrl.h1 ?? null,
      htmlExtract: evalRes.htmlExtract,
      keywordContext: evalRes.keywordContext,
      suggestedSchemaTypes: evalRes.suggestedSchemaTypes,
      suggestedSubtopics: evalRes.suggestedSubtopics,
      scoreBreakdown: evalRes.scoreBreakdown,
      overallScore: evalRes.scoreBreakdown.overallScore,
      scoreStatus: evalRes.scoreBreakdown.scoreStatus,
      issueCount: evalRes.issues.length,
      criticalHighIssueCount: criticalHighCount,
      lifecycleStatus:
        evalRes.recommendations.length > 0
          ? 'recommendation_generated'
          : 'detected',
      analyzedAt: now,
      updatedAt: now,
    });
    persistedPages.push(pageRecord);

    for (const iss of evalRes.issues) {
      totalIssuesCount += 1;
      const issueRow = upsertDeduplicatedIssueInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        analysisRunId: runId,
        pageAnalysisId: pageRecord.id,
        pageUrl: pageRecord.url,
        issueKey: iss.issueKey,
        category: iss.category,
        severity: iss.severity,
        title: iss.title,
        description: iss.description,
        recommendedAction: iss.recommendedAction,
        evidence: iss.evidence,
        now,
      });
      persistedIssues.push(issueRow);
    }

    for (const rec of evalRes.recommendations) {
      const recRow = upsertDeterministicRecommendationInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        pageAnalysisId: pageRecord.id,
        pageUrl: pageRecord.url,
        targetField: rec.targetField,
        currentValue: rec.currentValue,
        suggestedValue: rec.suggestedValue,
        reason: rec.reason,
        relatedKeyword: rec.relatedKeyword,
        searchIntent: rec.searchIntent,
        evidence: rec.evidence,
        confidence: rec.confidence,
        isAiGenerated: false,
        aiModel: null,
        providerUsageEventId: null,
        approvalStatus: 'pending_review',
        approvedBy: null,
        approvedAt: null,
        createdBy: params.user.name,
        createdAt: now,
        updatedAt: now,
      });
      persistedRecs.push(recRow);
    }
  }

  const runRecord = insertOnPageRunInDb({
    id: runId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    crawlId: selectedCrawl.id,
    strategyVersionId: latestStrategy?.id ?? null,
    status: 'completed',
    pagesAnalyzedCount: persistedPages.length,
    issuesDetectedCount: totalIssuesCount,
    unavailableEvidencePagesCount: unavailablePagesCount,
    triggeredBy: params.user.name,
    startedAt: now,
    completedAt: now,
    summaryNote: `Analyzed ${persistedPages.length} crawled page(s) from crawl ${selectedCrawl.id} with ${totalIssuesCount} deduplicated issue finding(s).`,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_analysis_run',
    entityId: runRecord.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: 'completed',
    reason: runRecord.summaryNote,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Completed On-Page SEO analysis across ${persistedPages.length} crawled pages (${totalIssuesCount} findings)`,
    status: 'Succeeded',
    evidenceUrl: `/on-page`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_analysis_completed',
  });

  return {
    run: runRecord,
    pages: persistedPages,
    issues: persistedIssues,
    recommendations: persistedRecs,
  };
}

// ---------------------------------------------------------------------------
// 3. AI-Powered Recommendations (Single & Bulk, Stage 5 Budget Enforced)
// ---------------------------------------------------------------------------

export async function generateAiRecommendationsForPages(params: {
  tenantId: string;
  projectId: string;
  pageAnalysisIds: string[];
  user: User;
  confirmedBulk?: boolean;
  preferredModel?: string | null;
}): Promise<{
  recommendations: OnPageRecommendationRecord[];
  processedPageIds: string[];
}> {
  assertRole(
    canEditOnPage(params.user.role),
    `Role "${params.user.role}" does not have permission to generate AI On-Page recommendations.`,
  );
  const project = requireProjectForTenant(params.tenantId, params.projectId);

  const uniqueIds = [...new Set(params.pageAnalysisIds.map((s) => s.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error('VALIDATION_ERROR: Select at least one analyzed page.');
  }
  if (uniqueIds.length > 1 && !params.confirmedBulk) {
    throw new Error(
      'CONFIRMATION_REQUIRED: Bulk AI recommendation generation requires explicit user confirmation (confirmedBulk: true).',
    );
  }
  if (uniqueIds.length > 15) {
    throw new Error(
      'VALIDATION_ERROR: Bulk AI recommendation runs are capped at 15 pages per batch to protect AI API budgets.',
    );
  }

  // Enforce Stage 5 token/cost budgets BEFORE calling Gemini
  const budgetGate = enforceBudgetsBeforeWorkflowLaunch({
    tenantId: params.tenantId,
    projectId: params.projectId,
    targetAgentIds: ['content_strategy_agent'],
    budgetApprovalBypassedBy: params.user,
  });
  if (!budgetGate.allowed) {
    throw new Error(
      `BUDGET_BLOCKED: ${budgetGate.blockingReason || 'Configured Agent Factory budget policy blocks AI generation.'}`,
    );
  }

  const allIssues = listOnPageIssuesInDb(params.tenantId, params.projectId);
  const createdRecs: OnPageRecommendationRecord[] = [];
  const processedPageIds: string[] = [];

  for (const pageId of uniqueIds) {
    const page = getPageAnalysisByIdInDb(params.tenantId, params.projectId, pageId);
    if (!page) {
      throw new Error(`NOT_FOUND: Analyzed page "${pageId}" not found.`);
    }
    const pageIssueTitles = allIssues
      .filter((i) => i.pageAnalysisId === page.id)
      .map((i) => `${i.severity}: ${i.title}`);

    const aiRes = await generateOnPageAiRecommendationsWithGemini({
      tenantId: params.tenantId,
      projectId: params.projectId,
      projectName: project.name,
      projectWebsite: project.website,
      page,
      openIssueTitles: pageIssueTitles,
      preferredModel: params.preferredModel,
    });

    const now = new Date().toISOString();
    for (const item of aiRes.items) {
      const inserted = insertRecommendationInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        pageAnalysisId: page.id,
        pageUrl: page.url,
        targetField: item.targetField,
        currentValue: item.currentValue,
        suggestedValue: item.suggestedValue,
        reason: item.reason,
        relatedKeyword: item.relatedKeyword,
        searchIntent: item.searchIntent,
        evidence: aiRes.evidence,
        confidence: item.confidence,
        isAiGenerated: true,
        aiModel: aiRes.model,
        providerUsageEventId: aiRes.providerUsageEventId,
        approvalStatus: 'pending_review',
        approvedBy: null,
        approvedAt: null,
        createdBy: params.user.name,
        createdAt: now,
        updatedAt: now,
      });
      createdRecs.push(inserted);
    }

    updatePageLifecycleInDb({
      tenantId: params.tenantId,
      projectId: params.projectId,
      pageAnalysisId: page.id,
      lifecycleStatus: 'awaiting_approval',
      updatedAt: now,
    });
    processedPageIds.push(page.id);
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_ai_recommendation',
    entityId: processedPageIds.join(','),
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'detected',
    newState: 'awaiting_approval',
    reason: `Generated ${createdRecs.length} AI recommendation(s) across ${processedPageIds.length} page(s).`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_ai_recommendations_generated',
  });

  return { recommendations: createdRecs, processedPageIds };
}

// ---------------------------------------------------------------------------
// 4. Versioned Content Optimization Drafts
// ---------------------------------------------------------------------------

export function saveOptimizationDraft(params: {
  tenantId: string;
  projectId: string;
  pageAnalysisId: string;
  proposed: OnPageDraftContentPayload;
  changeSummary: string;
  user: User;
}): OnPageOptimizationDraftRecord {
  assertRole(
    canEditOnPage(params.user.role),
    `Role "${params.user.role}" does not have permission to create or edit optimization drafts.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const page = getPageAnalysisByIdInDb(
    params.tenantId,
    params.projectId,
    params.pageAnalysisId,
  );
  if (!page) {
    throw new Error('NOT_FOUND: Analyzed page not found.');
  }

  // Validate JSON-LD if supplied
  const trimmedSchema = (params.proposed.proposedSchemaJsonLd ?? '').trim();
  if (trimmedSchema) {
    try {
      JSON.parse(trimmedSchema);
    } catch {
      throw new Error(
        'VALIDATION_ERROR: Proposed JSON-LD schema must be valid JSON.',
      );
    }
  }

  const now = new Date().toISOString();
  const draft = insertOptimizationDraftInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    pageAnalysisId: page.id,
    pageUrl: page.url,
    originalSnapshot: {
      title: page.title,
      metaDescription: page.metaDescription,
      h1: page.h1,
      headings: page.htmlExtract.headings,
      primaryKeyword: page.keywordContext.existingPrimaryKeyword,
      detectedSchemaTypes: page.htmlExtract.detectedSchemaTypes,
      missingAltCount: page.htmlExtract.imagesMissingAlt,
      bodyTextExcerpt: page.htmlExtract.bodyTextExcerpt,
    },
    proposed: {
      proposedTitle: (params.proposed.proposedTitle ?? '').trim(),
      proposedMetaDescription: (params.proposed.proposedMetaDescription ?? '').trim(),
      proposedH1: (params.proposed.proposedH1 ?? '').trim(),
      proposedHeadings: Array.isArray(params.proposed.proposedHeadings)
        ? params.proposed.proposedHeadings
        : [],
      proposedPrimaryKeyword: params.proposed.proposedPrimaryKeyword?.trim() || null,
      proposedSecondaryKeywords: Array.isArray(params.proposed.proposedSecondaryKeywords)
        ? params.proposed.proposedSecondaryKeywords
        : [],
      proposedImageAlts: Array.isArray(params.proposed.proposedImageAlts)
        ? params.proposed.proposedImageAlts
        : [],
      proposedSchemaJsonLd: trimmedSchema,
      proposedSchemaTypes: Array.isArray(params.proposed.proposedSchemaTypes)
        ? params.proposed.proposedSchemaTypes
        : [],
      proposedContentNotes: (params.proposed.proposedContentNotes ?? '').trim(),
      proposedInternalLinks: Array.isArray(params.proposed.proposedInternalLinks)
        ? params.proposed.proposedInternalLinks
        : [],
    },
    changeSummary:
      params.changeSummary.trim() ||
      `Saved optimization draft for ${page.slug}`,
    approvalStatus: 'pending_review',
    lifecycleStatus: 'draft_ready',
    appliedExternallyAt: null,
    appliedExternallyBy: null,
    appliedExternallyChannel: null,
    appliedExternalNote: null,
    verifiedAt: null,
    verifiedCrawlId: null,
    createdBy: params.user.name,
    updatedBy: params.user.name,
    createdAt: now,
    updatedAt: now,
  });

  updatePageLifecycleInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    pageAnalysisId: page.id,
    lifecycleStatus: 'draft_ready',
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_optimization_draft',
    entityId: draft.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: page.lifecycleStatus,
    newState: 'draft_ready',
    reason: `Saved optimization draft v${draft.versionNumber} for ${page.url}: ${draft.changeSummary}`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_draft_saved',
  });

  return draft;
}

// ---------------------------------------------------------------------------
// 5. Approvals (Single & Bulk, RBAC + Immutable Audit Trail)
// ---------------------------------------------------------------------------

export function decideOnPageApproval(params: {
  tenantId: string;
  projectId: string;
  items: { entityKind: 'recommendation' | 'draft' | 'issue'; entityId: string }[];
  decision: 'approved' | 'rejected';
  comment?: string;
  user: User;
}): { approvals: OnPageApprovalRecord[]; updatedCount: number } {
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error('VALIDATION_ERROR: At least one item must be specified.');
  }
  if (params.decision !== 'approved' && params.decision !== 'rejected') {
    throw new Error('VALIDATION_ERROR: Decision must be "approved" or "rejected".');
  }

  if (params.items.length > 1) {
    assertRole(
      canBulkApproveOnPage(params.user.role),
      `Role "${params.user.role}" is not authorized for bulk approvals.`,
    );
  } else {
    assertRole(
      canApproveOnPage(params.user.role),
      `Role "${params.user.role}" does not have permission to approve or reject On-Page optimizations.`,
    );
  }
  requireProjectForTenant(params.tenantId, params.projectId);

  const now = new Date().toISOString();
  const comment = (params.comment ?? '').trim();
  const approvals: OnPageApprovalRecord[] = [];

  for (const item of params.items) {
    if (item.entityKind === 'recommendation') {
      const rec = getRecommendationByIdInDb(
        params.tenantId,
        params.projectId,
        item.entityId,
      );
      if (!rec) {
        throw new Error(`NOT_FOUND: Recommendation "${item.entityId}" not found.`);
      }
      const prevStatus = rec.approvalStatus;
      updateRecommendationApprovalInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        recommendationId: rec.id,
        approvalStatus: params.decision as OnPageApprovalStatus,
        approvedBy: params.decision === 'approved' ? params.user.name : null,
        approvedAt: params.decision === 'approved' ? now : null,
        updatedAt: now,
      });
      if (params.decision === 'approved') {
        updatePageLifecycleInDb({
          tenantId: params.tenantId,
          projectId: params.projectId,
          pageAnalysisId: rec.pageAnalysisId,
          lifecycleStatus: 'approved',
          updatedAt: now,
        });
      }
      approvals.push(
        insertOnPageApprovalInDb({
          tenantId: params.tenantId,
          projectId: params.projectId,
          entityKind: 'recommendation',
          entityId: rec.id,
          pageUrl: rec.pageUrl,
          entityLabel: `${rec.targetField} recommendation (${rec.isAiGenerated ? 'AI' : 'Deterministic'})`,
          previousStatus: prevStatus,
          newStatus: params.decision,
          actorId: params.user.id,
          actorName: params.user.name,
          actorRole: params.user.role,
          comment,
          timestamp: now,
        }),
      );
    } else if (item.entityKind === 'draft') {
      const draft = getOptimizationDraftByIdInDb(
        params.tenantId,
        params.projectId,
        item.entityId,
      );
      if (!draft) {
        throw new Error(`NOT_FOUND: Optimization draft "${item.entityId}" not found.`);
      }
      const prevStatus = draft.approvalStatus;
      const nextLifecycle =
        params.decision === 'approved' ? 'approved' : 'rejected';
      updateOptimizationDraftStateInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        draftId: draft.id,
        approvalStatus: params.decision,
        lifecycleStatus: nextLifecycle,
        updatedBy: params.user.name,
        updatedAt: now,
      });
      updatePageLifecycleInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        pageAnalysisId: draft.pageAnalysisId,
        lifecycleStatus: nextLifecycle,
        updatedAt: now,
      });
      approvals.push(
        insertOnPageApprovalInDb({
          tenantId: params.tenantId,
          projectId: params.projectId,
          entityKind: 'draft',
          entityId: draft.id,
          pageUrl: draft.pageUrl,
          entityLabel: `Optimization Draft v${draft.versionNumber}`,
          previousStatus: prevStatus,
          newStatus: params.decision,
          actorId: params.user.id,
          actorName: params.user.name,
          actorRole: params.user.role,
          comment,
          timestamp: now,
        }),
      );
    } else if (item.entityKind === 'issue') {
      const issue = getOnPageIssueByIdInDb(
        params.tenantId,
        params.projectId,
        item.entityId,
      );
      if (!issue) {
        throw new Error(`NOT_FOUND: Issue "${item.entityId}" not found.`);
      }
      const prevStatus = issue.approvalStatus;
      updateOnPageIssueStateInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        issueId: issue.id,
        approvalStatus: params.decision,
        lifecycleStatus: params.decision === 'approved' ? 'approved' : 'rejected',
        updatedAt: now,
      });
      approvals.push(
        insertOnPageApprovalInDb({
          tenantId: params.tenantId,
          projectId: params.projectId,
          entityKind: 'issue',
          entityId: issue.id,
          pageUrl: issue.pageUrl,
          entityLabel: issue.title,
          previousStatus: prevStatus,
          newStatus: params.decision,
          actorId: params.user.id,
          actorName: params.user.name,
          actorRole: params.user.role,
          comment,
          timestamp: now,
        }),
      );
    } else {
      throw new Error(`VALIDATION_ERROR: Unsupported approval entityKind.`);
    }
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_approval',
    entityId: approvals.map((a) => a.entityId).join(','),
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'pending_review',
    newState: params.decision,
    reason:
      comment ||
      `${params.decision === 'approved' ? 'Approved' : 'Rejected'} ${approvals.length} On-Page optimization item(s).`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_approval_recorded',
  });

  return { approvals, updatedCount: approvals.length };
}

// ---------------------------------------------------------------------------
// 6. Lifecycle: Mark Applied Externally & Fresh Crawl Verification
// ---------------------------------------------------------------------------

export function markDraftAppliedExternally(params: {
  tenantId: string;
  projectId: string;
  draftId: string;
  channel: string;
  note?: string;
  user: User;
}): OnPageOptimizationDraftRecord {
  assertRole(
    canEditOnPage(params.user.role),
    `Role "${params.user.role}" cannot mark drafts as applied externally.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const draft = getOptimizationDraftByIdInDb(
    params.tenantId,
    params.projectId,
    params.draftId,
  );
  if (!draft) {
    throw new Error('NOT_FOUND: Optimization draft not found.');
  }
  if (draft.approvalStatus !== 'approved') {
    throw new Error(
      'APPROVAL_REQUIRED: Optimization draft must be explicitly approved before marking it as applied externally.',
    );
  }

  const now = new Date().toISOString();
  const channel = params.channel.trim() || 'manual_cms_update';
  const note = (params.note ?? '').trim();

  const updated = updateOptimizationDraftStateInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    draftId: draft.id,
    lifecycleStatus: 'applied_externally',
    appliedExternallyAt: now,
    appliedExternallyBy: params.user.name,
    appliedExternallyChannel: channel,
    appliedExternalNote: note || null,
    updatedBy: params.user.name,
    updatedAt: now,
  })!;

  updatePageLifecycleInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    pageAnalysisId: draft.pageAnalysisId,
    lifecycleStatus: 'applied_externally',
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_optimization_draft',
    entityId: draft.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: draft.lifecycleStatus,
    newState: 'applied_externally',
    reason: `Confirmed external application via ${channel}${note ? ` — ${note}` : ''}. Pending fresh crawl verification.`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_draft_applied_externally',
  });

  return updated;
}

export function validateDraftAgainstLatestCrawl(params: {
  tenantId: string;
  projectId: string;
  draftId: string;
  crawlId?: string | null;
  user: User;
}): {
  validation: OnPageValidationRecord;
  draft: OnPageOptimizationDraftRecord;
} {
  assertRole(
    canEditOnPage(params.user.role),
    `Role "${params.user.role}" cannot run crawl verification.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const draft = getOptimizationDraftByIdInDb(
    params.tenantId,
    params.projectId,
    params.draftId,
  );
  if (!draft) {
    throw new Error('NOT_FOUND: Optimization draft not found.');
  }

  const runs = listCrawlRuns(params.tenantId, params.projectId);
  const targetPath = normalizeUrlPath(draft.pageUrl);

  let targetCrawl = params.crawlId
    ? runs.find((r) => r.id === params.crawlId) ?? null
    : null;
  let freshCrawlUrl: ReturnType<typeof loadAllCrawlUrlsForRun>[number] | null = null;

  if (targetCrawl) {
    const crawledUrls = loadAllCrawlUrlsForRun(params.tenantId, targetCrawl.id);
    freshCrawlUrl =
      crawledUrls.find(
        (u) =>
          u.normalizedUrl.toLowerCase() === draft.pageUrl.toLowerCase() ||
          normalizeUrlPath(u.normalizedUrl) === targetPath,
      ) ?? null;
  } else {
    // Check newest completed/partial crawls (including targeted single-URL reverification crawls)
    // to find the freshest observation of this exact URL.
    const candidateRuns = runs.filter(
      (r) => r.status === 'Succeeded' || r.status === 'Partial',
    );
    for (const run of candidateRuns.slice(0, 8)) {
      const crawledUrls = loadAllCrawlUrlsForRun(params.tenantId, run.id);
      const match =
        crawledUrls.find(
          (u) =>
            u.normalizedUrl.toLowerCase() === draft.pageUrl.toLowerCase() ||
            normalizeUrlPath(u.normalizedUrl) === targetPath,
        ) ?? null;
      if (match) {
        targetCrawl = run;
        freshCrawlUrl = match;
        break;
      }
    }
    if (!targetCrawl) {
      targetCrawl = getLatestCompletedCrawl(params.tenantId, params.projectId);
    }
  }

  if (!targetCrawl) {
    throw new Error(
      'PREREQUISITE_MISSING: No crawl available to verify this optimization draft.',
    );
  }

  const freshHtmlSnapshot = freshCrawlUrl
    ? loadHtmlSnapshotForUrl(params.tenantId, freshCrawlUrl)
    : null;

  const verification = verifyDraftAgainstFreshCrawl({
    draft,
    freshCrawlUrl,
    freshHtmlSnapshot,
  });

  const now = new Date().toISOString();
  const validation = insertOnPageValidationInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    draftId: draft.id,
    pageUrl: draft.pageUrl,
    crawlId: targetCrawl.id,
    verificationStatus: verification.verificationStatus,
    matchedChecksCount: verification.matchedChecksCount,
    totalChecksCount: verification.totalChecksCount,
    diffs: verification.diffs,
    summary: verification.summary,
    validatedBy: params.user.name,
    validatedAt: now,
  });

  // Strictly mark `verified` ONLY when fresh crawl confirms all proposed fields match
  const nextLifecycle =
    verification.verificationStatus === 'verified'
      ? 'verified'
      : 'recrawled';

  const updatedDraft = updateOptimizationDraftStateInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    draftId: draft.id,
    lifecycleStatus: nextLifecycle,
    verifiedAt: verification.verificationStatus === 'verified' ? now : draft.verifiedAt,
    verifiedCrawlId:
      verification.verificationStatus === 'verified'
        ? targetCrawl.id
        : draft.verifiedCrawlId,
    updatedBy: params.user.name,
    updatedAt: now,
  })!;

  updatePageLifecycleInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    pageAnalysisId: draft.pageAnalysisId,
    lifecycleStatus: nextLifecycle,
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_validation',
    entityId: validation.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: draft.lifecycleStatus,
    newState: nextLifecycle,
    reason: verification.summary,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_draft_verified',
  });

  return { validation, draft: updatedDraft };
}

// ---------------------------------------------------------------------------
// 7. Create Execution Ticket from On-Page Issue
// ---------------------------------------------------------------------------

export function createTaskFromOnPageIssue(params: {
  tenantId: string;
  projectId: string;
  issueId: string;
  user: User;
  assigneeName?: string;
}): { ticket: DeveloperTicket; issue: OnPageIssueRecord } {
  assertRole(
    TASK_CREATOR_ROLES.has(params.user.role),
    `Role "${params.user.role}" cannot create implementation tasks.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const issue = getOnPageIssueByIdInDb(
    params.tenantId,
    params.projectId,
    params.issueId,
  );
  if (!issue) {
    throw new Error('NOT_FOUND: On-Page issue not found.');
  }

  const db = getAuditDb();
  const now = new Date().toISOString();
  const ticketId = `TKT-OP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  const ticket: DeveloperTicket = {
    id: ticketId,
    tenantId: params.tenantId,
    issueId: `onpage:${issue.id}`,
    projectId: params.projectId,
    title: `[On-Page SEO] ${issue.title} — ${normalizeUrlPath(issue.pageUrl)}`,
    description: `${issue.description}\n\nSeverity: ${issue.severity}\nRecommended Action: ${issue.recommendedAction}\nPage URL: ${issue.pageUrl}\n\nNote: Governance requires human review before any live website publishing.`,
    responsibleRole:
      issue.category === 'structured_data' ||
      issue.category === 'technical' ||
      issue.category === 'url_structure'
        ? 'Developer'
        : 'SEO Strategist',
    assignedUser: params.assigneeName?.trim() || null,
    taskStatus: 'Triaged',
    approvalStatus:
      issue.approvalStatus === 'approved' ? 'Dual Approved' : 'Pending',
    requiresDualApproval: true,
    developerApprovedBy: null,
    leadApprovedBy:
      issue.approvalStatus === 'approved' ? params.user.name : null,
    verificationStatus: 'Pending',
    createdBy: params.user.name,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO developer_tickets (
      id, tenant_id, issue_id, project_id, title, description, responsible_role,
      assigned_user, task_status, approval_status, requires_dual_approval,
      developer_approved_by, lead_approved_by, verification_status,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'Pending', ?, ?, ?)`,
  ).run(
    ticket.id,
    ticket.tenantId,
    ticket.issueId,
    ticket.projectId,
    ticket.title,
    ticket.description,
    ticket.responsibleRole,
    ticket.assignedUser,
    ticket.taskStatus,
    ticket.approvalStatus,
    1,
    ticket.leadApprovedBy,
    ticket.createdBy,
    ticket.createdAt,
    ticket.updatedAt,
  );

  const updatedIssue = updateOnPageIssueStateInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    issueId: issue.id,
    linkedTicketId: ticket.id,
    updatedAt: now,
  })!;

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_issue_ticket',
    entityId: ticket.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'unassigned',
    newState: 'Open',
    reason: `Created task ${ticket.id} for On-Page issue "${issue.title}" on ${issue.pageUrl}.`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'onpage_task_created',
  });

  return { ticket, issue: updatedIssue };
}

// ---------------------------------------------------------------------------
// 8. Agent Factory DAG Workflow Launch (Reuses Stages 2–6)
// ---------------------------------------------------------------------------

export function launchOnPageAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  pageAnalysisId?: string | null;
  objective?: string;
  user: User;
}): AgentWorkflowDetail {
  assertRole(
    WORKFLOW_LAUNCHER_ROLES.has(params.user.role),
    `Role "${params.user.role}" cannot launch Agent Factory On-Page workflows.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const page = params.pageAnalysisId
    ? getPageAnalysisByIdInDb(
        params.tenantId,
        params.projectId,
        params.pageAnalysisId,
      )
    : null;

  const nodes: DagWorkflowNodeInput[] = [
    {
      nodeKey: 'onpage_technical_audit',
      agentId: 'technical_seo_agent',
      title: 'Page Crawl Signals, Schema & Technical Diagnostics',
      maxRetries: 2,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'onpage_keyword_alignment',
      agentId: 'keyword_intelligence_agent',
      title: 'Target Keyword Mapping, Intent & Cannibalization Check',
      maxRetries: 2,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'onpage_content_blueprint',
      agentId: 'content_strategy_agent',
      title: 'Metadata, Heading Hierarchy & Internal Link Optimization Plan',
      approvalRequired: true,
      approvalGateType: 'content_strategy',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'onpage_draft_generation',
      agentId: 'content_generation_agent',
      title: 'Evidence-Grounded Copy & Metadata Draft Synthesis',
      maxRetries: 1,
      timeoutMs: 60_000,
    },
    {
      nodeKey: 'onpage_qa_evidence_check',
      agentId: 'quality_assurance_agent',
      title: 'QA Evidence Trust & Claim Validation',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'onpage_optimization_report',
      agentId: 'reporting_agent',
      title: 'On-Page Optimization Summary & Approval Package',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
  ];

  const edges: DagWorkflowEdgeInput[] = [
    { fromNodeKey: 'onpage_technical_audit', toNodeKey: 'onpage_content_blueprint' },
    { fromNodeKey: 'onpage_keyword_alignment', toNodeKey: 'onpage_content_blueprint' },
    { fromNodeKey: 'onpage_content_blueprint', toNodeKey: 'onpage_draft_generation' },
    { fromNodeKey: 'onpage_draft_generation', toNodeKey: 'onpage_qa_evidence_check' },
    { fromNodeKey: 'onpage_qa_evidence_check', toNodeKey: 'onpage_optimization_report' },
  ];

  const workflow = createAgentWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    user: params.user,
    templateId: 'seo_content_pipeline',
    name: page
      ? `On-Page Optimization: ${page.slug}`
      : 'On-Page SEO Page Intelligence & Optimization DAG',
    objective:
      params.objective?.trim() ||
      (page
        ? `Audit crawled signals, keyword alignment, metadata, schema, and internal links for ${page.url} and produce an approval-gated optimization draft.`
        : 'Coordinate specialist agents to analyze crawled pages, detect on-page issues, and produce approval-gated metadata and content drafts.'),
    nodes,
    edges,
    config: {
      module: 'module_8_onpage_seo',
      pageAnalysisId: page?.id ?? null,
      pageUrl: page?.url ?? null,
    },
    autoStart: true,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'onpage_agent_workflow',
    entityId: workflow.workflow.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: workflow.workflow.status,
    reason: `Launched Agent Factory On-Page SEO workflow ${workflow.workflow.id}${page ? ` for ${page.url}` : ''}.`,
  });

  return workflow;
}

// ---------------------------------------------------------------------------
// 9. CMS Adapter Configuration & Manual Handoff Exports
// ---------------------------------------------------------------------------

export async function configureCmsConnection(params: {
  tenantId: string;
  projectId: string;
  platform: CmsPlatform;
  siteUrl: string;
  displayName?: string;
  credentials: Record<string, string>;
  user: User;
}): Promise<CmsConnectionRecord> {
  assertRole(
    canManageCmsIntegrations(params.user.role),
    `Role "${params.user.role}" does not have permission to configure CMS integrations.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);

  const prepared = await prepareEncryptedCmsConfiguration({
    platform: params.platform,
    siteUrl: params.siteUrl,
    displayName: params.displayName,
    credentials: params.credentials,
  });

  const now = new Date().toISOString();
  const record = upsertCmsConnectionInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    platform: prepared.platform,
    displayName: prepared.displayName,
    siteUrl: prepared.normalizedSiteUrl,
    status: prepared.status, // Always 'configured_unverified' until verified handshake
    encryptedCredentialsJson: prepared.encryptedCredentialsJson,
    lastTestedAt: null,
    lastError: null,
    createdBy: params.user.name,
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'cms_connection',
    entityId: record.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'not_configured',
    newState: record.status,
    reason: `Saved AES-256-GCM encrypted ${record.platform} CMS configuration for ${record.siteUrl} (auto-publish disabled).`,
  });

  return record;
}

export function removeCmsConnection(params: {
  tenantId: string;
  projectId: string;
  platform: CmsPlatform;
  user: User;
}): { deleted: boolean } {
  assertRole(
    canManageCmsIntegrations(params.user.role),
    `Role "${params.user.role}" does not have permission to remove CMS integrations.`,
  );
  requireProjectForTenant(params.tenantId, params.projectId);
  const deleted = deleteCmsConnectionInDb(
    params.tenantId,
    params.projectId,
    params.platform,
  );
  if (deleted) {
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'cms_connection',
      entityId: `${params.projectId}:${params.platform}`,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: 'configured',
      newState: 'not_configured',
      reason: `Removed ${params.platform} CMS integration credentials.`,
    });
  }
  return { deleted };
}

export function exportDraftHandoff(params: {
  tenantId: string;
  projectId: string;
  draftId: string;
  platform: CmsPlatform | 'manual';
  format: 'json' | 'markdown';
}) {
  requireProjectForTenant(params.tenantId, params.projectId);
  const draft = getOptimizationDraftByIdInDb(
    params.tenantId,
    params.projectId,
    params.draftId,
  );
  if (!draft) {
    throw new Error('NOT_FOUND: Optimization draft not found.');
  }
  const connections = listCmsConnectionsInDb(params.tenantId, params.projectId);
  const connection =
    params.platform === 'manual'
      ? null
      : connections.find((c) => c.platform === params.platform) ?? null;
  return buildManualCmsHandoffExport({
    draft,
    platform: params.platform,
    format: params.format,
    connection,
  });
}

// ---------------------------------------------------------------------------
// 10. Bulk Export (CSV / JSON)
// ---------------------------------------------------------------------------

export function exportOnPageReport(params: {
  tenantId: string;
  projectId: string;
  format: 'csv' | 'json';
  pageIds?: string[];
}): { filename: string; contentType: string; content: string } {
  const project = requireProjectForTenant(params.tenantId, params.projectId);
  const allPages = listPageAnalysesInDb(params.tenantId, params.projectId);
  const filterSet =
    params.pageIds && params.pageIds.length > 0 ? new Set(params.pageIds) : null;
  const pages = filterSet ? allPages.filter((p) => filterSet.has(p.id)) : allPages;
  const issues = listOnPageIssuesInDb(params.tenantId, params.projectId).filter(
    (i) => !filterSet || filterSet.has(i.pageAnalysisId),
  );
  const recommendations = listRecommendationsInDb(
    params.tenantId,
    params.projectId,
  ).filter((r) => !filterSet || filterSet.has(r.pageAnalysisId));

  const safeProj = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';

  if (params.format === 'json') {
    return {
      filename: `rovix-onpage-report-${safeProj}.json`,
      contentType: 'application/json; charset=utf-8',
      content: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          projectId: project.id,
          projectName: project.name,
          projectWebsite: project.website,
          pagesCount: pages.length,
          issuesCount: issues.length,
          recommendationsCount: recommendations.length,
          pages,
          issues,
          recommendations,
        },
        null,
        2,
      ),
    };
  }

  return {
    filename: `rovix-onpage-report-${safeProj}.csv`,
    contentType: 'text/csv; charset=utf-8',
    content: serializeOnPageReportToCsv(pages),
  };
}
