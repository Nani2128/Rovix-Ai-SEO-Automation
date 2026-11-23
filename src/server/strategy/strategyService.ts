import crypto from 'node:crypto';
import type {
  AgentWorkflowDetail,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
} from '../../types/agentFactory';
import type { User, UserRole } from '../../types/auth';
import type { KeywordIntent } from '../../types/dashboard';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  InternalLinkRecommendationRecord,
  SeoRoadmapItemRecord,
  SeoStrategyObjectiveRecord,
  SeoStrategyVersionRecord,
  SiteArchitecturePageRecord,
  StrategyApprovalRecord,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
  TopicalClusterRecord,
} from '../../types/strategy';
import type { DeveloperTicket } from '../../types/technicalIssue';
import {
  analyzeKeywordPageMappings,
  assessStrategyEvidenceReadiness,
  formatLocationLabel,
  generateEvidenceDrivenStrategy,
  normalizePagePath,
  normalizeWebsiteOrigin,
  type StrategyEngineInput,
  wouldCreateArchitectureCycle,
} from '../../lib/strategyEngine';
import { publishTenantActivityUpdate } from '../activity/activityBus';
import {
  getAuditDb,
  getKeywordBusinessProfile,
  getProjectById,
  listCompetitors,
  listContentGaps,
  listCrawlRuns,
  listGeoTargetMarkets,
  listGeoUrlMappings,
  listKeywordClusters,
  listKeywordIntelligenceRecords,
  listKeywordUrlMappings,
  listPerformanceMeasurements,
  listProjectIssues,
  queryCrawlUrls,
  recordActivityEvent,
  recordAuditTrail,
} from '../audit/db';
import { listWorkflowsForProject } from '../agentFactory/orchestrationDb';
import { createAgentWorkflow } from '../agentFactory/orchestrationEngine';
import {
  getArchitecturePageByIdInDb,
  getNextStrategyVersionNumberInDb,
  getRoadmapItemByIdInDb,
  getStrategyVersionByIdInDb,
  insertArchitecturePageInDb,
  insertInternalLinksInDb,
  insertRoadmapItemsInDb,
  insertStrategyApprovalRecordInDb,
  insertStrategyObjectivesInDb,
  insertStrategyVersionInDb,
  insertTopicalClustersInDb,
  listArchitecturePagesInDb,
  listInternalLinksInDb,
  listRoadmapItemsInDb,
  listStrategyApprovalRecordsInDb,
  listStrategyObjectivesInDb,
  listStrategyVersionsInDb,
  listTopicalClustersInDb,
  updateArchitecturePageInDb,
  updateEntityApprovalStatusInDb,
  updateRoadmapItemLinkageInDb,
} from './strategyDb';

const STRATEGY_EDITOR_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
  'Editor',
]);

const STRATEGY_APPROVER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
  'Project Manager',
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
  'SEO Strategist',
  'Project Manager',
  'Business Owner',
  'Editor',
  'Developer',
]);

const VALID_PAGE_TYPES = new Set<ArchitecturePageType>([
  'homepage',
  'service',
  'product',
  'category',
  'location',
  'blog',
  'resource',
  'case_study',
  'about',
  'contact',
]);

const VALID_INTENTS = new Set<KeywordIntent>([
  'Informational',
  'Commercial',
  'Transactional',
  'Navigational',
]);

const VALID_PAGE_STATUSES = new Set<ArchitecturePageStatus>([
  'existing',
  'optimize',
  'proposed',
  'archived',
]);

const VALID_APPROVAL_STATUSES = new Set<StrategyApprovalStatus>([
  'pending_review',
  'approved',
  'rejected',
  'archived',
]);

const VALID_ENTITY_KINDS = new Set<StrategyEntityKind>([
  'strategy_version',
  'objective',
  'architecture_page',
  'keyword_mapping',
  'internal_link',
  'topical_cluster',
  'roadmap_item',
]);

function assertEditorRole(role: UserRole): void {
  if (!STRATEGY_EDITOR_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to create or modify SEO strategies or site architecture.`,
    );
  }
}

function assertApproverRole(role: UserRole): void {
  if (!STRATEGY_APPROVER_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to approve or reject SEO strategy recommendations.`,
    );
  }
}

function assertTaskCreatorRole(role: UserRole): void {
  if (!TASK_CREATOR_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" is not authorized to create execution tasks from roadmap recommendations.`,
    );
  }
}

function assertWorkflowLauncherRole(role: UserRole): void {
  if (!WORKFLOW_LAUNCHER_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" is not authorized to launch Agent Factory strategy workflows.`,
    );
  }
}

function collectProjectStrategyEvidence(
  tenantId: string,
  projectId: string,
): StrategyEngineInput {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found in this tenant workspace.');
  }

  const businessProfile = getKeywordBusinessProfile(tenantId, projectId);
  const crawlRuns = listCrawlRuns(tenantId, projectId);
  const latestCompletedCrawl =
    crawlRuns.find(
      (r) =>
        r.status === 'Succeeded' ||
        r.status === 'Partial',
    ) ?? null;

  const crawledUrls = latestCompletedCrawl
    ? queryCrawlUrls({
        tenantId,
        crawlId: latestCompletedCrawl.id,
        page: 1,
        pageSize: 200,
      }).items
    : [];

  const technicalIssues = listProjectIssues(tenantId, projectId);
  const keywords = listKeywordIntelligenceRecords(tenantId, projectId);
  const clusters = listKeywordClusters(tenantId, projectId);
  const keywordMappings = listKeywordUrlMappings(tenantId, projectId);
  const geoMarkets = listGeoTargetMarkets(tenantId, projectId);
  const geoMappings = listGeoUrlMappings(tenantId, projectId);
  const competitors = listCompetitors(tenantId, projectId);
  const contentGaps = listContentGaps(tenantId, projectId);
  const performanceMeasurements = listPerformanceMeasurements(tenantId, {
    projectId,
    limit: 50,
  });

  return {
    project,
    businessProfile,
    crawledUrls,
    latestCrawlAt:
      latestCompletedCrawl?.completedAt ?? latestCompletedCrawl?.startedAt ?? null,
    technicalIssues,
    keywords,
    clusters,
    keywordMappings,
    geoMarkets,
    geoMappings,
    competitors,
    contentGaps,
    performanceMeasurements,
  };
}

export function getStrategyWorkspace(params: {
  tenantId: string;
  projectId: string;
  user: User;
  versionId?: string | null;
}): StrategyWorkspacePayload {
  const evidenceInput = collectProjectStrategyEvidence(
    params.tenantId,
    params.projectId,
  );
  const evidenceReadiness = assessStrategyEvidenceReadiness(evidenceInput);
  const versions = listStrategyVersionsInDb(params.tenantId, params.projectId);

  const activeVersion =
    (params.versionId
      ? versions.find((v) => v.id === params.versionId)
      : null) ??
    versions[0] ??
    null;

  const objectives = activeVersion
    ? listStrategyObjectivesInDb(
        params.tenantId,
        params.projectId,
        activeVersion.id,
      )
    : [];
  const pages = activeVersion
    ? listArchitecturePagesInDb(
        params.tenantId,
        params.projectId,
        activeVersion.id,
      )
    : [];
  const internalLinks = activeVersion
    ? listInternalLinksInDb(
        params.tenantId,
        params.projectId,
        activeVersion.id,
      )
    : [];
  const topicalClusters = activeVersion
    ? listTopicalClustersInDb(
        params.tenantId,
        params.projectId,
        activeVersion.id,
      )
    : [];
  const roadmapItems = activeVersion
    ? listRoadmapItemsInDb(
        params.tenantId,
        params.projectId,
        activeVersion.id,
      )
    : [];

  const { diagnostics: mappingDiagnostics, unmappedKeywords } =
    analyzeKeywordPageMappings({
      pages,
      keywords: evidenceInput.keywords,
      clusters: evidenceInput.clusters,
    });

  const approvals = listStrategyApprovalRecordsInDb(
    params.tenantId,
    params.projectId,
    80,
  );

  const availableKeywords = evidenceInput.keywords
    .filter((k) => k.workflowState !== 'rejected')
    .map((k) => ({
      id: k.id,
      keyword: k.keyword,
      intent: k.intent,
      clusterId: k.clusterId,
      clusterName: k.clusterName,
      targetGeography:
        [k.targetCity, k.targetCountry].filter(Boolean).join(', ') || 'Global',
      marketSearchVolume: k.marketSearchVolume,
      volumeStatus: k.volumeStatus,
      gscClicks: k.gscClicks,
      gscImpressions: k.gscImpressions,
      gscAvgPosition: k.gscAvgPosition,
      isAiSuggestion: k.isAiSuggestion,
    }));

  const approvedLocations = evidenceInput.geoMarkets
    .filter((m) => m.approvalStatus === 'approved')
    .map((m) => ({
      id: m.id,
      label: formatLocationLabel(m),
      granularity: m.granularity,
      countryCode: m.countryCode,
    }));

  const recentStrategyWorkflows = listWorkflowsForProject(
    params.tenantId,
    params.projectId,
    25,
  )
    .filter(
      (w) =>
        w.name.toLowerCase().includes('strategy') ||
        w.name.toLowerCase().includes('architecture') ||
        w.objective.toLowerCase().includes('strategy'),
    )
    .slice(0, 8)
    .map((w) => ({
      workflowId: w.id,
      name: w.name,
      status: w.status,
      currentStage: w.currentStage,
      createdAt: w.createdAt,
      completedAt: w.completedAt,
    }));

  return {
    projectId: evidenceInput.project.id,
    projectName: evidenceInput.project.name,
    projectWebsite: evidenceInput.project.website,
    canEditStrategy: STRATEGY_EDITOR_ROLES.has(params.user.role),
    canApproveStrategy: STRATEGY_APPROVER_ROLES.has(params.user.role),
    canCreateTasks: TASK_CREATOR_ROLES.has(params.user.role),
    canLaunchWorkflows: WORKFLOW_LAUNCHER_ROLES.has(params.user.role),
    evidenceReadiness,
    versions,
    activeVersion,
    objectives,
    pages,
    mappingDiagnostics,
    unmappedKeywords,
    internalLinks,
    topicalClusters,
    roadmapItems,
    approvals,
    availableKeywords,
    approvedLocations,
    recentStrategyWorkflows,
  };
}

export function generateStrategyVersion(params: {
  tenantId: string;
  projectId: string;
  user: User;
  title?: string;
  sourceWorkflowId?: string | null;
}): {
  version: SeoStrategyVersionRecord;
  workspace: StrategyWorkspacePayload;
} {
  assertEditorRole(params.user.role);

  const evidenceInput = collectProjectStrategyEvidence(
    params.tenantId,
    params.projectId,
  );
  const generated = generateEvidenceDrivenStrategy(evidenceInput);
  const now = new Date().toISOString();
  const versionNumber = getNextStrategyVersionNumberInDb(
    params.tenantId,
    params.projectId,
  );
  const versionId = `strv-${crypto.randomUUID().slice(0, 8)}`;

  const versionRecord: SeoStrategyVersionRecord = {
    id: versionId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    versionNumber,
    title: params.title?.trim() || `${generated.title} (v${versionNumber})`,
    summary: generated.summary,
    targetAudience: generated.targetAudience,
    evidenceReadiness: generated.evidenceReadiness,
    missingEvidence: generated.missingEvidence,
    payload: generated.payload,
    sourceWorkflowId: params.sourceWorkflowId ?? null,
    isAiGenerated: false,
    approvalStatus: 'pending_review',
    approvedBy: null,
    approvedAt: null,
    createdBy: params.user.name,
    createdAt: now,
    updatedAt: now,
  };

  insertStrategyVersionInDb(versionRecord);

  // Persist Objectives
  const objectiveRecords: SeoStrategyObjectiveRecord[] =
    generated.objectives.map((obj) => ({
      id: `strobj-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      strategyVersionId: versionId,
      title: obj.title,
      rationale: obj.rationale,
      category: obj.category,
      source: obj.source,
      confidence: obj.confidence,
      needsResearch: obj.needsResearch,
      evidence: obj.evidence,
      approvalStatus: 'pending_review',
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
  insertStrategyObjectivesInDb(objectiveRecords);

  // Persist Site Architecture Pages with stable real IDs mapped from tempKeys
  const tempKeyToRealId = new Map<string, string>();
  for (const draft of generated.pages) {
    tempKeyToRealId.set(
      draft.tempKey,
      `archp-${crypto.randomUUID().slice(0, 8)}`,
    );
  }
  for (const draft of generated.pages) {
    const id = tempKeyToRealId.get(draft.tempKey)!;
    const parentPageId = draft.parentTempKey
      ? (tempKeyToRealId.get(draft.parentTempKey) ?? null)
      : null;
    const pageRecord: SiteArchitecturePageRecord = {
      id,
      tenantId: params.tenantId,
      projectId: params.projectId,
      strategyVersionId: versionId,
      parentPageId,
      sortOrder: draft.sortOrder,
      title: draft.title,
      slug: draft.slug,
      proposedUrl: draft.proposedUrl,
      existingUrl: draft.existingUrl,
      pageType: draft.pageType,
      primaryKeyword: draft.primaryKeyword,
      secondaryKeywords: draft.secondaryKeywords,
      relatedKeywords: draft.relatedKeywords,
      searchIntent: draft.searchIntent,
      clusterId: draft.clusterId,
      clusterName: draft.clusterName,
      targetGeography: draft.targetGeography,
      pageStatus: draft.pageStatus,
      approvalStatus: 'pending_review',
      mappingApprovalStatus: 'pending_review',
      confidence: draft.confidence,
      rationale: draft.rationale,
      evidence: draft.evidence,
      isAiGenerated: draft.isAiGenerated,
      notes: '',
      archivedAt: null,
      createdBy: params.user.name,
      updatedBy: params.user.name,
      createdAt: now,
      updatedAt: now,
    };
    insertArchitecturePageInDb(pageRecord);
  }

  // Persist Internal Link Recommendations
  const linkRecords: InternalLinkRecommendationRecord[] =
    generated.internalLinks.map((lnk) => ({
      id: `ilnk-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      strategyVersionId: versionId,
      sourcePageId: lnk.sourceTempKey
        ? (tempKeyToRealId.get(lnk.sourceTempKey) ?? null)
        : null,
      sourceUrl: lnk.sourceUrl,
      sourceTitle: lnk.sourceTitle,
      targetPageId: lnk.targetTempKey
        ? (tempKeyToRealId.get(lnk.targetTempKey) ?? null)
        : null,
      targetUrl: lnk.targetUrl,
      targetTitle: lnk.targetTitle,
      suggestedAnchorText: lnk.suggestedAnchorText,
      linkCategory: lnk.linkCategory,
      existsInCrawl: lnk.existsInCrawl,
      currentInboundCount: lnk.currentInboundCount,
      reason: lnk.reason,
      confidence: lnk.confidence,
      evidence: lnk.evidence,
      approvalStatus: 'pending_review',
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
  insertInternalLinksInDb(linkRecords);

  // Persist Topical Clusters
  const topicalRecords: TopicalClusterRecord[] = generated.topicalClusters.map(
    (tc) => ({
      id: `topc-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      strategyVersionId: versionId,
      pillarTopic: tc.pillarTopic,
      supportingSubtopics: tc.supportingSubtopics,
      coverageClassification: tc.coverageClassification,
      verifiedPageUrls: tc.verifiedPageUrls,
      missingOpportunities: tc.missingOpportunities,
      competitorGapIds: tc.competitorGapIds,
      keywordClusterId: tc.keywordClusterId,
      linkedPageIds: tc.linkedPageTempKeys
        .map((k) => tempKeyToRealId.get(k))
        .filter((id): id is string => Boolean(id)),
      priorityScore: tc.priorityScore,
      confidence: tc.confidence,
      evidenceSummary: tc.evidenceSummary,
      evidence: tc.evidence,
      isAiGenerated: tc.isAiGenerated,
      approvalStatus: 'pending_review',
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  insertTopicalClustersInDb(topicalRecords);

  // Persist Roadmap Items
  const roadmapRecords: SeoRoadmapItemRecord[] = generated.roadmapItems.map(
    (rm) => ({
      id: `rmap-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: params.tenantId,
      projectId: params.projectId,
      strategyVersionId: versionId,
      title: rm.title,
      description: rm.description,
      category: rm.category,
      relatedPageId: rm.relatedPageTempKey
        ? (tempKeyToRealId.get(rm.relatedPageTempKey) ?? null)
        : null,
      relatedUrl: rm.relatedUrl,
      relatedKeyword: rm.relatedKeyword,
      businessImpactRationale: rm.businessImpactRationale,
      evidence: rm.evidence,
      priority: rm.priority,
      priorityScore: rm.priorityScore,
      scoreBreakdown: rm.scoreBreakdown,
      dependencies: rm.dependencies,
      estimatedEffort: rm.estimatedEffort,
      responsibleRole: rm.responsibleRole,
      recommendedAgentId: rm.recommendedAgentId,
      approvalStatus: 'pending_review',
      implementationStatus: 'not_started',
      linkedTicketId: null,
      linkedWorkflowId: null,
      isAiGenerated: rm.isAiGenerated,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  insertRoadmapItemsInDb(roadmapRecords);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'seo_strategy_version',
    entityId: versionId,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: `v${versionNumber} (pending_review)`,
    reason: `Generated evidence-driven SEO Strategy v${versionNumber} (${generated.pages.length} architecture pages, ${linkRecords.length} internal links, ${roadmapRecords.length} roadmap items).`,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Generated SEO Strategy v${versionNumber} (${generated.pages.length} architecture pages, ${topicalRecords.length} topical clusters, ${roadmapRecords.length} roadmap items — ${generated.evidenceReadiness.overallReadiness})`,
    status: 'Succeeded',
    evidenceUrl: '/strategy',
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'strategy_generated',
  });

  return {
    version: versionRecord,
    workspace: getStrategyWorkspace({
      tenantId: params.tenantId,
      projectId: params.projectId,
      user: params.user,
      versionId,
    }),
  };
}

export function createArchitecturePage(params: {
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  user: User;
  parentPageId?: string | null;
  title: string;
  slug: string;
  pageType: ArchitecturePageType;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  relatedKeywords?: string[];
  searchIntent?: KeywordIntent;
  clusterId?: string | null;
  clusterName?: string | null;
  targetGeography?: string | null;
  existingUrl?: string | null;
  pageStatus?: ArchitecturePageStatus;
  rationale?: string;
  notes?: string;
}): SiteArchitecturePageRecord {
  assertEditorRole(params.user.role);
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const version = getStrategyVersionByIdInDb(
    params.tenantId,
    params.projectId,
    params.strategyVersionId,
  );
  if (!version) {
    throw new Error('NOT_FOUND: Strategy version not found.');
  }

  const title = params.title.trim();
  if (!title) throw new Error('VALIDATION: Page title is required.');

  const pageType = VALID_PAGE_TYPES.has(params.pageType)
    ? params.pageType
    : 'resource';
  const searchIntent =
    params.searchIntent && VALID_INTENTS.has(params.searchIntent)
      ? params.searchIntent
      : 'Informational';
  const pageStatus =
    params.pageStatus && VALID_PAGE_STATUSES.has(params.pageStatus)
      ? params.pageStatus
      : 'proposed';

  if (params.parentPageId) {
    const parent = getArchitecturePageByIdInDb(
      params.tenantId,
      params.projectId,
      params.parentPageId,
    );
    if (!parent || parent.strategyVersionId !== params.strategyVersionId) {
      throw new Error('VALIDATION: Parent page does not exist in this strategy version.');
    }
  }

  const origin = normalizeWebsiteOrigin(project.website);
  const normSlug = normalizePagePath(params.slug || `/${title}`);
  const existingPages = listArchitecturePagesInDb(
    params.tenantId,
    params.projectId,
    params.strategyVersionId,
  );
  const now = new Date().toISOString();

  const record: SiteArchitecturePageRecord = {
    id: `archp-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    strategyVersionId: params.strategyVersionId,
    parentPageId: params.parentPageId ?? null,
    sortOrder: existingPages.length,
    title,
    slug: normSlug,
    proposedUrl: `${origin}${normSlug === '/' ? '/' : normSlug}`,
    existingUrl: params.existingUrl?.trim() || null,
    pageType,
    primaryKeyword: params.primaryKeyword?.trim() || null,
    secondaryKeywords: (params.secondaryKeywords ?? [])
      .map((s) => s.trim())
      .filter(Boolean),
    relatedKeywords: (params.relatedKeywords ?? [])
      .map((s) => s.trim())
      .filter(Boolean),
    searchIntent,
    clusterId: params.clusterId ?? null,
    clusterName: params.clusterName ?? null,
    targetGeography: params.targetGeography?.trim() || null,
    pageStatus,
    approvalStatus: 'pending_review',
    mappingApprovalStatus: 'pending_review',
    confidence: 'Medium',
    rationale:
      params.rationale?.trim() ||
      `Added manually by ${params.user.name} in Website Architecture Builder (draft — does not publish to live website).`,
    evidence: [
      {
        source: 'project_profile',
        label: 'Strategist Architecture Proposal',
        observedDetail: `Created by ${params.user.name} (${params.user.role}).`,
      },
    ],
    isAiGenerated: false,
    notes: params.notes?.trim() || '',
    archivedAt: null,
    createdBy: params.user.name,
    updatedBy: params.user.name,
    createdAt: now,
    updatedAt: now,
  };

  insertArchitecturePageInDb(record);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'site_architecture_page',
    entityId: record.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: `${record.slug} (${record.pageStatus})`,
    reason: `Created architecture page "${record.title}" (${record.pageType}).`,
  });

  return record;
}

export function updateArchitecturePage(params: {
  tenantId: string;
  projectId: string;
  pageId: string;
  user: User;
  patch: {
    title?: string;
    slug?: string;
    pageType?: ArchitecturePageType;
    primaryKeyword?: string | null;
    secondaryKeywords?: string[];
    relatedKeywords?: string[];
    searchIntent?: KeywordIntent;
    clusterId?: string | null;
    clusterName?: string | null;
    targetGeography?: string | null;
    existingUrl?: string | null;
    pageStatus?: ArchitecturePageStatus;
    rationale?: string;
    notes?: string;
  };
}): SiteArchitecturePageRecord {
  assertEditorRole(params.user.role);
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const existing = getArchitecturePageByIdInDb(
    params.tenantId,
    params.projectId,
    params.pageId,
  );
  if (!existing) throw new Error('NOT_FOUND: Architecture page not found.');

  const origin = normalizeWebsiteOrigin(project.website);
  const nextSlug =
    params.patch.slug !== undefined
      ? normalizePagePath(params.patch.slug)
      : existing.slug;
  const nextTitle =
    params.patch.title !== undefined
      ? params.patch.title.trim()
      : existing.title;
  if (!nextTitle) throw new Error('VALIDATION: Page title cannot be empty.');

  const keywordChanged =
    (params.patch.primaryKeyword !== undefined &&
      params.patch.primaryKeyword !== existing.primaryKeyword) ||
    params.patch.secondaryKeywords !== undefined ||
    params.patch.searchIntent !== undefined;

  const updated: SiteArchitecturePageRecord = {
    ...existing,
    title: nextTitle,
    slug: nextSlug,
    proposedUrl: `${origin}${nextSlug === '/' ? '/' : nextSlug}`,
    existingUrl:
      params.patch.existingUrl !== undefined
        ? params.patch.existingUrl?.trim() || null
        : existing.existingUrl,
    pageType:
      params.patch.pageType && VALID_PAGE_TYPES.has(params.patch.pageType)
        ? params.patch.pageType
        : existing.pageType,
    primaryKeyword:
      params.patch.primaryKeyword !== undefined
        ? params.patch.primaryKeyword?.trim() || null
        : existing.primaryKeyword,
    secondaryKeywords:
      params.patch.secondaryKeywords !== undefined
        ? params.patch.secondaryKeywords.map((s) => s.trim()).filter(Boolean)
        : existing.secondaryKeywords,
    relatedKeywords:
      params.patch.relatedKeywords !== undefined
        ? params.patch.relatedKeywords.map((s) => s.trim()).filter(Boolean)
        : existing.relatedKeywords,
    searchIntent:
      params.patch.searchIntent && VALID_INTENTS.has(params.patch.searchIntent)
        ? params.patch.searchIntent
        : existing.searchIntent,
    clusterId:
      params.patch.clusterId !== undefined
        ? params.patch.clusterId
        : existing.clusterId,
    clusterName:
      params.patch.clusterName !== undefined
        ? params.patch.clusterName
        : existing.clusterName,
    targetGeography:
      params.patch.targetGeography !== undefined
        ? params.patch.targetGeography?.trim() || null
        : existing.targetGeography,
    pageStatus:
      params.patch.pageStatus && VALID_PAGE_STATUSES.has(params.patch.pageStatus)
        ? params.patch.pageStatus
        : existing.pageStatus,
    mappingApprovalStatus: keywordChanged
      ? 'pending_review'
      : existing.mappingApprovalStatus,
    rationale:
      params.patch.rationale !== undefined
        ? params.patch.rationale.trim()
        : existing.rationale,
    notes:
      params.patch.notes !== undefined
        ? params.patch.notes.trim()
        : existing.notes,
    updatedBy: params.user.name,
    updatedAt: new Date().toISOString(),
  };

  updateArchitecturePageInDb(updated);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'site_architecture_page',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: `${existing.slug} | kw:${existing.primaryKeyword ?? 'none'}`,
    newState: `${updated.slug} | kw:${updated.primaryKeyword ?? 'none'}`,
    reason: `Updated architecture page "${updated.title}".`,
  });

  return updated;
}

export function moveArchitecturePage(params: {
  tenantId: string;
  projectId: string;
  pageId: string;
  newParentPageId: string | null;
  newSortOrder?: number;
  user: User;
}): SiteArchitecturePageRecord {
  assertEditorRole(params.user.role);
  const existing = getArchitecturePageByIdInDb(
    params.tenantId,
    params.projectId,
    params.pageId,
  );
  if (!existing) throw new Error('NOT_FOUND: Architecture page not found.');

  const allPages = listArchitecturePagesInDb(
    params.tenantId,
    params.projectId,
    existing.strategyVersionId,
  );

  if (params.newParentPageId) {
    const targetParent = allPages.find((p) => p.id === params.newParentPageId);
    if (!targetParent) {
      throw new Error('VALIDATION: Target parent page not found in this version.');
    }
  }

  if (
    wouldCreateArchitectureCycle(allPages, params.pageId, params.newParentPageId)
  ) {
    throw new Error(
      'VALIDATION: Cannot move a page inside itself or one of its own descendants.',
    );
  }

  const now = new Date().toISOString();
  const nextOrder =
    typeof params.newSortOrder === 'number' && Number.isFinite(params.newSortOrder)
      ? Math.max(0, Math.round(params.newSortOrder))
      : existing.sortOrder;

  const updated: SiteArchitecturePageRecord = {
    ...existing,
    parentPageId: params.newParentPageId,
    sortOrder: nextOrder,
    updatedBy: params.user.name,
    updatedAt: now,
  };
  updateArchitecturePageInDb(updated);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'site_architecture_page',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: `parent:${existing.parentPageId ?? 'root'} order:${existing.sortOrder}`,
    newState: `parent:${updated.parentPageId ?? 'root'} order:${updated.sortOrder}`,
    reason: `Reorganized page "${updated.title}" in visual sitemap hierarchy.`,
  });

  return updated;
}

export function archiveArchitecturePage(params: {
  tenantId: string;
  projectId: string;
  pageId: string;
  user: User;
  reason?: string;
}): SiteArchitecturePageRecord {
  assertEditorRole(params.user.role);
  const existing = getArchitecturePageByIdInDb(
    params.tenantId,
    params.projectId,
    params.pageId,
  );
  if (!existing) throw new Error('NOT_FOUND: Architecture page not found.');

  const now = new Date().toISOString();
  const updated: SiteArchitecturePageRecord = {
    ...existing,
    pageStatus: 'archived',
    approvalStatus: 'archived',
    archivedAt: now,
    updatedBy: params.user.name,
    updatedAt: now,
  };
  updateArchitecturePageInDb(updated);

  // Re-parent direct children to this page's parent so no orphan subtree breaks
  const allPages = listArchitecturePagesInDb(
    params.tenantId,
    params.projectId,
    existing.strategyVersionId,
  );
  for (const child of allPages.filter((p) => p.parentPageId === existing.id)) {
    updateArchitecturePageInDb({
      ...child,
      parentPageId: existing.parentPageId,
      updatedBy: params.user.name,
      updatedAt: now,
    });
  }

  insertStrategyApprovalRecordInDb({
    id: `strap-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    strategyVersionId: existing.strategyVersionId,
    entityKind: 'architecture_page',
    entityId: existing.id,
    entityLabel: `${existing.title} (${existing.slug})`,
    previousStatus: existing.approvalStatus,
    newStatus: 'archived',
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    comment:
      params.reason?.trim() ||
      'Archived proposed architecture page (live website untouched).',
    timestamp: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'site_architecture_page',
    entityId: existing.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.pageStatus,
    newState: 'archived',
    reason: params.reason?.trim() || `Archived architecture page "${existing.title}".`,
  });

  return updated;
}

export function decideStrategyApproval(params: {
  tenantId: string;
  projectId: string;
  entityKind: StrategyEntityKind;
  entityId: string;
  decision: StrategyApprovalStatus;
  comment?: string;
  user: User;
}): StrategyApprovalRecord {
  assertApproverRole(params.user.role);

  if (!VALID_ENTITY_KINDS.has(params.entityKind)) {
    throw new Error(`VALIDATION: Invalid entityKind "${params.entityKind}".`);
  }
  if (!VALID_APPROVAL_STATUSES.has(params.decision)) {
    throw new Error(`VALIDATION: Invalid approval decision "${params.decision}".`);
  }

  const now = new Date().toISOString();
  const updated = updateEntityApprovalStatusInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    entityKind: params.entityKind,
    entityId: params.entityId,
    newStatus: params.decision,
    actorName: params.user.name,
    now,
  });
  if (!updated) {
    throw new Error(
      `NOT_FOUND: ${params.entityKind} "${params.entityId}" not found in this project.`,
    );
  }

  const approvalRecord: StrategyApprovalRecord = {
    id: `strap-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    strategyVersionId: updated.strategyVersionId,
    entityKind: params.entityKind,
    entityId: params.entityId,
    entityLabel: updated.entityLabel,
    previousStatus: updated.previousStatus,
    newStatus: params.decision,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    comment: params.comment?.trim() || `${params.decision} by ${params.user.name}`,
    timestamp: now,
  };

  insertStrategyApprovalRecordInDb(approvalRecord);

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: `strategy_${params.entityKind}`,
    entityId: params.entityId,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: updated.previousStatus,
    newState: params.decision,
    reason: approvalRecord.comment,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'strategy_approval_updated',
  });

  return approvalRecord;
}

export function createTaskFromRoadmapItem(params: {
  tenantId: string;
  projectId: string;
  roadmapItemId: string;
  assignedUser?: string | null;
  user: User;
}): { ticket: DeveloperTicket; roadmapItem: SeoRoadmapItemRecord } {
  assertTaskCreatorRole(params.user.role);

  const item = getRoadmapItemByIdInDb(
    params.tenantId,
    params.projectId,
    params.roadmapItemId,
  );
  if (!item) {
    throw new Error('NOT_FOUND: Roadmap item not found.');
  }
  if (item.approvalStatus !== 'approved') {
    throw new Error(
      'VALIDATION: Roadmap item must be approved before creating a linked delivery task.',
    );
  }
  if (item.linkedTicketId) {
    throw new Error(
      `CONFLICT: Roadmap item is already linked to task ${item.linkedTicketId}.`,
    );
  }

  const db = getAuditDb();
  const now = new Date().toISOString();
  const ticketId = `tkt-${crypto.randomUUID().slice(0, 8)}`;
  const issueRef = `strategy:${item.id}`;

  const ticket: DeveloperTicket = {
    id: ticketId,
    tenantId: params.tenantId,
    issueId: issueRef,
    projectId: params.projectId,
    title: `[SEO Strategy] ${item.title}`,
    description: `${item.description}\n\nBusiness Impact Rationale: ${item.businessImpactRationale}\nEstimated Effort: ${item.estimatedEffort}\nRelated URL: ${item.relatedUrl ?? 'N/A'}\nRelated Keyword: ${item.relatedKeyword ?? 'N/A'}\n\nNote: Governance requires human review before any live website publishing.`,
    responsibleRole: item.responsibleRole || 'SEO Strategist',
    assignedUser: params.assignedUser?.trim() || null,
    taskStatus: 'Triaged',
    approvalStatus: 'Dual Approved',
    requiresDualApproval: true,
    developerApprovedBy: null,
    leadApprovedBy: item.approvedBy ?? params.user.name,
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

  const updatedItem = updateRoadmapItemLinkageInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    roadmapItemId: item.id,
    implementationStatus: 'queued_task',
    linkedTicketId: ticket.id,
    updatedAt: now,
  })!;

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'developer_ticket',
    entityId: ticket.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'not_started',
    newState: 'queued_task',
    reason: `Created task ${ticket.id} from approved SEO roadmap item "${item.title}".`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'strategy_task_created',
  });

  return { ticket, roadmapItem: updatedItem };
}

export function launchStrategyAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  roadmapItemId?: string | null;
  strategyVersionId?: string | null;
  objective?: string;
}): {
  workflow: AgentWorkflowDetail;
  roadmapItem: SeoRoadmapItemRecord | null;
} {
  assertWorkflowLauncherRole(params.user.role);

  let linkedItem: SeoRoadmapItemRecord | null = null;
  if (params.roadmapItemId) {
    linkedItem = getRoadmapItemByIdInDb(
      params.tenantId,
      params.projectId,
      params.roadmapItemId,
    );
    if (!linkedItem) {
      throw new Error('NOT_FOUND: Roadmap item not found.');
    }
  }

  // Reuse existing Agent Factory specialist agents (Stages 2-6 orchestration, approvals, usage budgets)
  const nodes: DagWorkflowNodeInput[] = [
    {
      nodeKey: 'strategy_research',
      agentId: 'research_agent',
      title: 'Strategy Evidence & Business Context Audit',
      maxRetries: 2,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'keyword_mapping_check',
      agentId: 'keyword_intelligence_agent',
      title: 'Keyword-to-Page Mapping & Intent Verification',
      maxRetries: 2,
      timeoutMs: 60_000,
    },
    {
      nodeKey: 'competitor_gap_validation',
      agentId: 'competitor_intelligence_agent',
      title: 'Competitor Coverage & Topical Gap Validation',
      maxRetries: 2,
      timeoutMs: 60_000,
    },
    {
      nodeKey: 'internal_linking_tech_check',
      agentId: 'technical_seo_agent',
      title: 'Technical Crawl & Internal Linking Diagnostics',
      maxRetries: 2,
      timeoutMs: 60_000,
    },
    {
      nodeKey: 'architecture_content_strategy',
      agentId: 'content_strategy_agent',
      title: 'Site Architecture & Content Brief Synthesis',
      approvalRequired: true,
      approvalGateType: 'content_strategy',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'strategy_qa_validation',
      agentId: 'quality_assurance_agent',
      title: 'QA Evidence Trust & Claim Validation',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'strategy_executive_report',
      agentId: 'reporting_agent',
      title: 'SEO Strategy & Architecture Execution Summary',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
  ];

  const edges: DagWorkflowEdgeInput[] = [
    { fromNodeKey: 'strategy_research', toNodeKey: 'keyword_mapping_check' },
    { fromNodeKey: 'strategy_research', toNodeKey: 'competitor_gap_validation' },
    { fromNodeKey: 'strategy_research', toNodeKey: 'internal_linking_tech_check' },
    { fromNodeKey: 'keyword_mapping_check', toNodeKey: 'architecture_content_strategy' },
    { fromNodeKey: 'competitor_gap_validation', toNodeKey: 'architecture_content_strategy' },
    { fromNodeKey: 'internal_linking_tech_check', toNodeKey: 'architecture_content_strategy' },
    { fromNodeKey: 'architecture_content_strategy', toNodeKey: 'strategy_qa_validation' },
    { fromNodeKey: 'strategy_qa_validation', toNodeKey: 'strategy_executive_report' },
  ];

  const workflow = createAgentWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    user: params.user,
    templateId: 'seo_content_pipeline',
    name: linkedItem
      ? `Strategy Execution: ${linkedItem.title.slice(0, 64)}`
      : 'SEO Strategy & Site Architecture Intelligence DAG',
    objective:
      params.objective?.trim() ||
      (linkedItem
        ? `Validate evidence and prepare approved strategy deliverables for roadmap item: ${linkedItem.title}`
        : 'Coordinate existing specialist agents to validate keyword mapping, competitor gaps, internal linking, and site architecture recommendations.'),
    nodes,
    edges,
    config: {
      module: 'module_7_strategy_architecture',
      strategyVersionId: params.strategyVersionId ?? linkedItem?.strategyVersionId ?? null,
      roadmapItemId: linkedItem?.id ?? null,
    },
    autoStart: true,
  });

  if (linkedItem) {
    linkedItem = updateRoadmapItemLinkageInDb({
      tenantId: params.tenantId,
      projectId: params.projectId,
      roadmapItemId: linkedItem.id,
      implementationStatus: 'agent_workflow_launched',
      linkedWorkflowId: workflow.workflow.id,
      updatedAt: new Date().toISOString(),
    });
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'strategy_agent_workflow',
    entityId: workflow.workflow.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: workflow.workflow.status,
    reason: linkedItem
      ? `Launched Agent Factory workflow ${workflow.workflow.id} for roadmap item "${linkedItem.title}".`
      : `Launched Agent Factory Strategy & Architecture workflow ${workflow.workflow.id}.`,
  });

  return { workflow, roadmapItem: linkedItem };
}
