import crypto from 'node:crypto';
import type { User } from '../../types/auth';
import type {
  CompetitorApprovalHistoryEntry,
  CompetitorApprovalStatus,
  CompetitorCategory,
  CompetitorPageSnapshot,
  CompetitorProfileRecord,
  CompetitorResearchRun,
  CompetitorWorkspaceResponse,
  ContentGapRecommendation,
  ContentGapWorkflowState,
} from '../../types/competitors';
import {
  createCompetitorResearchRun,
  deleteCompetitorRecord,
  getAuditDb,
  getCompetitorByDomain,
  getCompetitorById,
  getContentGapById,
  getKeywordBusinessProfile,
  getProjectById,
  listCompetitorAuditTrail,
  listCompetitorOverlaps,
  listCompetitorPages,
  listCompetitorResearchRuns,
  listCompetitors,
  listContentGaps,
  listGeoTargetMarkets,
  listKeywordIntelligenceRecords,
  listPerformanceAuditRuns,
  listProjectCrawledContentDetailed,
  recordActivityEvent,
  recordAuditTrail,
  updateCompetitorResearchRun,
  updateContentGapDecisionInDb,
  upsertCompetitorOverlap,
  upsertCompetitorPageSnapshot,
  upsertCompetitorRecord,
  upsertContentGap,
} from '../audit/db';
import { publishTenantActivityUpdate } from '../activity/activityBus';
import {
  emitRealAgentEvent,
  publishAutonomousDomainTrigger,
} from '../agentFactory/agentFactoryService';
import { addManualKeywordRecord } from '../keywords/keywordService';
import {
  applyCompetitorRecommendation,
  buildCompetitorComparisonRows,
  canUserApproveCompetitors,
  canUserApproveContentGaps,
  canUserManageCompetitors,
  canUserRecommendContentGaps,
  computeKeywordOverlap,
  identifyContentGaps,
  normalizeCompetitorDomain,
} from './competitorEngine';
import {
  analyzeCompetitorUrlsLive,
  discoverCompetitorsViaSerpApi,
  getCompetitorWorkspaceProviderStatuses,
} from './competitorProviders';

function recomputeOverlapsAndGaps(params: {
  tenantId: string;
  projectId: string;
  competitor: CompetitorProfileRecord;
  serpMatches?: {
    keyword: string;
    competitorUrl: string | null;
    competitorPosition: number | null;
    source: string;
  }[];
}): { overlapsCount: number; gapsCount: number } {
  const competitorPages = listCompetitorPages(
    params.tenantId,
    params.projectId,
    params.competitor.id,
  );
  const crawlPages = listProjectCrawledContentDetailed(
    params.tenantId,
    params.projectId,
    150,
  );
  const projectKeywords = listKeywordIntelligenceRecords(
    params.tenantId,
    params.projectId,
  );
  const businessProfile = getKeywordBusinessProfile(
    params.tenantId,
    params.projectId,
  );
  const geoMarkets = listGeoTargetMarkets(params.tenantId, params.projectId);

  const overlaps = computeKeywordOverlap({
    tenantId: params.tenantId,
    projectId: params.projectId,
    competitor: params.competitor,
    competitorPages,
    projectKeywords,
    crawlPages,
    defaultCountry: businessProfile.targetCountry || 'US',
    serpMatches: params.serpMatches,
  });

  for (const row of overlaps) {
    upsertCompetitorOverlap(row);
  }

  const gaps = identifyContentGaps({
    tenantId: params.tenantId,
    projectId: params.projectId,
    competitor: params.competitor,
    competitorPages,
    crawlPages,
    projectKeywords,
    businessProfile,
    geoMarkets,
  });

  for (const gap of gaps) {
    upsertContentGap(gap);
  }

  return { overlapsCount: overlaps.length, gapsCount: gaps.length };
}

export function getCompetitorWorkspace(
  tenantId: string,
  projectId: string,
): CompetitorWorkspaceResponse {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const competitors = listCompetitors(tenantId, projectId);
  const pages = listCompetitorPages(tenantId, projectId);
  const overlaps = listCompetitorOverlaps(tenantId, projectId);
  const contentGaps = listContentGaps(tenantId, projectId);
  const researchRuns = listCompetitorResearchRuns(tenantId, projectId);
  const crawlPages = listProjectCrawledContentDetailed(tenantId, projectId, 150);
  const keywords = listKeywordIntelligenceRecords(tenantId, projectId);
  const kwProfile = getKeywordBusinessProfile(tenantId, projectId);
  const geoMarkets = listGeoTargetMarkets(tenantId, projectId);
  const approvedGeoNames = geoMarkets
    .filter((m) => m.approvalStatus === 'approved')
    .map((m) => (m.city ? `${m.city}, ${m.countryCode}` : m.countryName));

  const perfRuns = listPerformanceAuditRuns(tenantId, projectId).filter(
    (r) => r.status === 'Succeeded' || r.status === 'Partial',
  );
  const latestPerf = perfRuns[0] ?? null;

  const comparisonRows = buildCompetitorComparisonRows({
    projectId,
    projectName: project.name,
    projectWebsite: project.website,
    crawlPages,
    projectKeywords: keywords,
    avgMobilePerf: latestPerf?.avgMobileScore ?? null,
    avgDesktopPerf: latestPerf?.avgDesktopScore ?? null,
    competitors,
    competitorPages: pages,
    overlaps,
    contentGaps,
  });

  const providerStatuses = getCompetitorWorkspaceProviderStatuses(tenantId, projectId);
  const entityIds = [
    ...competitors.map((c) => c.id),
    ...contentGaps.map((g) => g.id),
  ];
  const auditTrail = listCompetitorAuditTrail(tenantId, entityIds, 45);

  return {
    projectId,
    projectName: project.name,
    projectWebsite: project.website,
    providerStatuses,
    projectBaseline: {
      crawledUrlsCount: crawlPages.length,
      crawlPages: crawlPages.slice(0, 60),
      keywordsCount: keywords.length,
      approvedGeoMarkets: approvedGeoNames,
      avgMobilePerformance: latestPerf?.avgMobileScore ?? null,
      avgDesktopPerformance: latestPerf?.avgDesktopScore ?? null,
      hasCompletedCrawl: crawlPages.length > 0,
      hasApprovedProfile: kwProfile.approvalStatus === 'approved',
    },
    competitors,
    pages,
    overlaps,
    contentGaps,
    comparisonRows,
    researchRuns,
    auditTrail,
    summary: {
      approvedCompetitors: competitors.filter((c) => c.approvalStatus === 'approved').length,
      pendingApprovalCompetitors: competitors.filter(
        (c) => c.approvalStatus === 'pending_owner_approval',
      ).length,
      analyzedPages: pages.length,
      sharedKeywords: overlaps.filter((o) => o.overlapType === 'shared').length,
      competitorGapKeywords: overlaps.filter(
        (o) => o.overlapType === 'competitor_only_gap',
      ).length,
      openContentGaps: contentGaps.filter((g) => g.workflowState !== 'rejected').length,
      approvedContentGaps: contentGaps.filter(
        (g) => g.workflowState === 'owner_approved' || g.workflowState === 'queued_for_content',
      ).length,
    },
  };
}

export function upsertCompetitorWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  domainOrUrl: string;
  name?: string;
  category?: CompetitorCategory;
  targetMarkets?: string[];
  discoveryOrigin?: CompetitorProfileRecord['discoveryOrigin'];
  discoveryEvidence?: string;
  notes?: string;
  approve?: boolean;
}): CompetitorProfileRecord {
  if (!canUserManageCompetitors(params.user.role)) {
    throw new Error('FORBIDDEN: Your role cannot add or recommend competitors.');
  }
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const normalized = normalizeCompetitorDomain(params.domainOrUrl);
  const ownClean = project.website.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (normalized.domain === ownClean) {
    throw new Error('BAD_REQUEST: Cannot add your own project domain as a competitor.');
  }

  const existing = getCompetitorByDomain(
    params.tenantId,
    params.projectId,
    normalized.domain,
  );
  const category: CompetitorCategory = params.category ?? existing?.category ?? 'direct';
  const targetMarkets =
    params.targetMarkets && params.targetMarkets.length > 0
      ? params.targetMarkets.map((s) => s.trim()).filter(Boolean)
      : existing?.targetMarkets ?? [];
  const name = params.name?.trim() || existing?.name || normalized.domain;

  if (!params.approve) {
    const rec = applyCompetitorRecommendation({
      existing,
      tenantId: params.tenantId,
      projectId: params.projectId,
      domain: normalized.domain,
      name,
      homepageUrl: normalized.homepageUrl,
      category,
      targetMarkets,
      discoveryOrigin: params.discoveryOrigin ?? 'manual',
      discoveryEvidence: params.discoveryEvidence?.trim() || '',
      notes: params.notes?.trim() || '',
      actorName: params.user.name,
      actorRole: params.user.role,
    });
    const saved = upsertCompetitorRecord(rec);
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'competitor',
      entityId: saved.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existing?.approvalStatus ?? 'none',
      newState: saved.approvalStatus,
      reason:
        params.discoveryEvidence ||
        params.notes ||
        `Recommended competitor ${saved.domain}`,
    });
    return saved;
  }

  if (!canUserApproveCompetitors(params.user.role)) {
    throw new Error(
      'FORBIDDEN: Only Business Owners, Agency Owners, or Platform Admins can approve official competitors.',
    );
  }

  const now = new Date().toISOString();
  const prevStatus: CompetitorApprovalStatus | 'none' =
    existing?.approvalStatus ?? 'none';
  const historyEntry: CompetitorApprovalHistoryEntry = {
    id: `compah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousStatus: prevStatus,
    newStatus: 'approved',
    reason:
      params.discoveryEvidence?.trim() ||
      params.notes?.trim() ||
      `Approved ${category} competitor (${normalized.domain})`,
    timestamp: now,
  };

  const saved = upsertCompetitorRecord({
    id: existing?.id ?? `comp-${crypto.randomUUID().slice(0, 10)}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    domain: normalized.domain,
    name,
    homepageUrl: normalized.homepageUrl,
    category,
    targetMarkets,
    discoveryOrigin: existing?.discoveryOrigin ?? params.discoveryOrigin ?? 'manual',
    discoveryEvidence:
      params.discoveryEvidence?.trim() || existing?.discoveryEvidence || '',
    approvalStatus: 'approved',
    approvedBy: params.user.name,
    approvedAt: now,
    recommendedBy: existing?.recommendedBy ?? null,
    notes: params.notes?.trim() || existing?.notes || '',
    lastAnalyzedAt: existing?.lastAnalyzedAt ?? null,
    analyzedPagesCount: existing?.analyzedPagesCount ?? 0,
    externalDomainAuthority: existing?.externalDomainAuthority ?? null,
    externalMonthlyTraffic: existing?.externalMonthlyTraffic ?? null,
    externalBacklinksCount: existing?.externalBacklinksCount ?? null,
    provenance: existing?.provenance ?? {
      source: 'Owner Approved Competitor Target (Awaiting HTML Analysis)',
      collectedAt: null,
      reportingPeriod: 'Current',
      measurementStatus: 'unavailable',
      methodology: 'Approved by workspace owner; run live HTML analysis to inspect pages.',
      limitations: 'External domain authority, backlinks, and traffic marked Unavailable.',
    },
    approvalHistory: [historyEntry, ...(existing?.approvalHistory ?? [])].slice(0, 25),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'competitor',
    entityId: saved.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: prevStatus,
    newState: 'approved',
    reason: historyEntry.reason,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Approved competitor ${saved.domain}`,
    status: 'Succeeded',
    evidenceUrl: '/competitors',
  });
  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: 'competitor_approved',
  });

  return saved;
}

export function decideCompetitorApprovalWorkflow(params: {
  tenantId: string;
  competitorId: string;
  user: User;
  action: 'approve' | 'reject' | 'archive';
  reason?: string;
}): CompetitorProfileRecord {
  if (!canUserApproveCompetitors(params.user.role)) {
    throw new Error(
      'FORBIDDEN: Only Business Owners, Agency Owners, or Platform Admins can approve or reject competitors.',
    );
  }
  const existing = getCompetitorById(params.tenantId, params.competitorId);
  if (!existing) {
    throw new Error('NOT_FOUND: Competitor not found.');
  }

  const now = new Date().toISOString();
  const nextStatus: CompetitorApprovalStatus =
    params.action === 'approve'
      ? 'approved'
      : params.action === 'reject'
        ? 'rejected'
        : 'archived';

  const historyEntry: CompetitorApprovalHistoryEntry = {
    id: `compah-${crypto.randomUUID().slice(0, 8)}`,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousStatus: existing.approvalStatus,
    newStatus: nextStatus,
    reason:
      params.reason?.trim() ||
      `Competitor marked ${nextStatus} by ${params.user.name}`,
    timestamp: now,
  };

  const saved = upsertCompetitorRecord({
    ...existing,
    approvalStatus: nextStatus,
    approvedBy: params.action === 'approve' ? params.user.name : existing.approvedBy,
    approvedAt: params.action === 'approve' ? now : existing.approvedAt,
    approvalHistory: [historyEntry, ...existing.approvalHistory].slice(0, 25),
    updatedAt: now,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'competitor',
    entityId: saved.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.approvalStatus,
    newState: nextStatus,
    reason: historyEntry.reason,
  });

  return saved;
}

export function deleteCompetitorWorkflow(params: {
  tenantId: string;
  competitorId: string;
  user: User;
}): void {
  if (!canUserApproveCompetitors(params.user.role)) {
    throw new Error('FORBIDDEN: Only owners/admins can delete competitor records.');
  }
  const existing = getCompetitorById(params.tenantId, params.competitorId);
  if (!existing) {
    throw new Error('NOT_FOUND: Competitor not found.');
  }
  deleteCompetitorRecord(params.tenantId, params.competitorId);
  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'competitor',
    entityId: existing.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.approvalStatus,
    newState: 'deleted',
    reason: `Removed competitor ${existing.domain}`,
  });
}

export async function runCompetitorAnalysisWorkflow(params: {
  tenantId: string;
  competitorId: string;
  user: User;
  urlsToAnalyze?: string[];
  discoverInternalPages?: boolean;
}): Promise<{
  run: CompetitorResearchRun;
  competitor: CompetitorProfileRecord;
  pagesAnalyzed: number;
  overlapsFound: number;
  gapsIdentified: number;
}> {
  if (!canUserManageCompetitors(params.user.role)) {
    throw new Error('FORBIDDEN: Your role cannot run competitor analysis.');
  }
  const comp = getCompetitorById(params.tenantId, params.competitorId);
  if (!comp) {
    throw new Error('NOT_FOUND: Competitor not found.');
  }

  const startedAt = new Date().toISOString();
  const runId = `crun-${crypto.randomUUID().slice(0, 10)}`;
  createCompetitorResearchRun({
    id: runId,
    tenantId: params.tenantId,
    projectId: comp.projectId,
    competitorId: comp.id,
    competitorDomain: comp.domain,
    runKind: 'page_analysis',
    urlsScanned: 0,
    topicsExtracted: 0,
    overlapsFound: 0,
    gapsIdentified: 0,
    status: 'Running',
    providerStatuses: [],
    errorSummary: null,
    triggeredBy: params.user.name,
    startedAt,
    completedAt: null,
  });

  const compTaskTitle = `Competitor Analysis (${comp.domain})`;
  emitRealAgentEvent({
    eventType: 'agent.started',
    tenantId: params.tenantId,
    projectId: comp.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'competitor_intelligence_agent',
    status: 'running',
    taskTitle: compTaskTitle,
    summary: `Inspecting live pages on ${comp.domain}.`,
    evidenceUrl: '/competitors',
  });
  emitRealAgentEvent({
    eventType: 'agent.communication',
    tenantId: params.tenantId,
    projectId: comp.projectId,
    workflowId: runId,
    taskId: runId,
    agentId: 'competitor_intelligence_agent',
    sourceAgentId: 'orchestrator',
    destinationAgentId: 'competitor_intelligence_agent',
    status: 'communicating',
    taskTitle: compTaskTitle,
    summary: `Routed competitor page benchmark for ${comp.domain}.`,
    evidenceUrl: '/competitors',
  });

  const fetchRes = await analyzeCompetitorUrlsLive({
    tenantId: params.tenantId,
    projectId: comp.projectId,
    competitorId: comp.id,
    homepageUrl: comp.homepageUrl,
    extraUrls: params.urlsToAnalyze,
    discoverInternalPages: params.discoverInternalPages !== false,
    maxPages: 5,
  });

  for (const page of fetchRes.pages) {
    upsertCompetitorPageSnapshot(page);
  }

  const allPages = listCompetitorPages(params.tenantId, comp.projectId, comp.id);
  const topicsExtracted = Array.from(
    new Set(allPages.flatMap((p) => p.extractedTopics)),
  ).length;

  const { overlapsCount, gapsCount } = recomputeOverlapsAndGaps({
    tenantId: params.tenantId,
    projectId: comp.projectId,
    competitor: comp,
    serpMatches: [],
  });

  const completedAt = new Date().toISOString();
  const updatedComp = upsertCompetitorRecord({
    ...comp,
    lastAnalyzedAt: completedAt,
    analyzedPagesCount: allPages.length,
    provenance:
      fetchRes.pages.length > 0
        ? {
            source: `Live SSRF-Guarded HTML Crawl (${comp.domain})`,
            collectedAt: completedAt,
            reportingPeriod: 'Live Snapshot',
            measurementStatus: 'measured',
            methodology:
              'Direct HTTP HTML extraction of title, headings, word count, and JSON-LD schema.',
            limitations:
              'External DA, backlinks, and traffic require dedicated paid connector credentials.',
          }
        : comp.provenance,
    updatedAt: completedAt,
  });

  const status: CompetitorResearchRun['status'] =
    fetchRes.pages.length === 0
      ? 'Failed'
      : fetchRes.errors.length > 0
        ? 'Completed with Warnings'
        : 'Completed';

  const updatedRun =
    updateCompetitorResearchRun(params.tenantId, runId, {
      urlsScanned: fetchRes.pages.length,
      topicsExtracted,
      overlapsFound: overlapsCount,
      gapsIdentified: gapsCount,
      status,
      providerStatuses: [fetchRes.status],
      errorSummary: fetchRes.errors.length > 0 ? fetchRes.errors.join('; ') : null,
      completedAt,
    }) ??
    listCompetitorResearchRuns(params.tenantId, comp.projectId, 1)[0];

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: comp.projectId,
    type: 'crawl',
    actor: params.user.name,
    action: `Analyzed ${fetchRes.pages.length} page(s) on ${comp.domain} (${gapsCount} gap signals)`,
    status: status === 'Failed' ? 'Failed' : 'Succeeded',
    evidenceUrl: '/competitors',
  });
  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: comp.projectId,
    reason: 'competitor_analysis_completed',
  });

  if (status === 'Failed') {
    const errSummary = fetchRes.errors.join('; ') || `No pages fetched from ${comp.domain}.`;
    emitRealAgentEvent({
      eventType: 'agent.failed',
      tenantId: params.tenantId,
      projectId: comp.projectId,
      workflowId: runId,
      taskId: runId,
      agentId: 'competitor_intelligence_agent',
      status: 'failed',
      taskTitle: compTaskTitle,
      summary: `Competitor analysis failed for ${comp.domain}.`,
      errorSummary: errSummary,
      evidenceUrl: '/competitors',
    });
  } else {
    emitRealAgentEvent({
      eventType: 'agent.completed',
      tenantId: params.tenantId,
      projectId: comp.projectId,
      workflowId: runId,
      taskId: runId,
      agentId: 'competitor_intelligence_agent',
      status: 'completed',
      taskTitle: compTaskTitle,
      summary: `Analyzed ${fetchRes.pages.length} page(s) on ${comp.domain} (${gapsCount} gap(s)).`,
      evidenceUrl: '/competitors',
    });
    if (gapsCount > 0) {
      emitRealAgentEvent({
        eventType: 'agent.communication',
        tenantId: params.tenantId,
        projectId: comp.projectId,
        workflowId: runId,
        taskId: runId,
        agentId: 'content_strategy_agent',
        sourceAgentId: 'competitor_intelligence_agent',
        destinationAgentId: 'content_strategy_agent',
        status: 'communicating',
        taskTitle: compTaskTitle,
        summary: `Shared ${gapsCount} content gap signal(s) from ${comp.domain} to Strategy.`,
        evidenceUrl: '/competitors',
      });
    }
    publishAutonomousDomainTrigger({
      tenantId: params.tenantId,
      projectId: comp.projectId,
      triggerType: 'competitor_research_completed',
      idempotencyKey: `competitor_research:${runId}`,
      sourceRef: runId,
      payloadSummary: `Competitor analysis completed for ${comp.domain}: ${fetchRes.pages.length} page(s), ${gapsCount} gap(s).`,
      payload: {
        runId,
        competitorId: comp.id,
        domain: comp.domain,
        pagesAnalyzed: fetchRes.pages.length,
        overlapsFound: overlapsCount,
        gapsIdentified: gapsCount,
      },
    });
  }

  return {
    run: updatedRun,
    competitor: updatedComp,
    pagesAnalyzed: fetchRes.pages.length,
    overlapsFound: overlapsCount,
    gapsIdentified: gapsCount,
  };
}

export async function discoverCompetitorsWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  queries?: string[];
  countryCode?: string;
}): Promise<{
  run: CompetitorResearchRun;
  importedFromProfile: CompetitorProfileRecord[];
  discoveredFromSerp: CompetitorProfileRecord[];
  serpStatusDetail: string;
}> {
  if (!canUserManageCompetitors(params.user.role)) {
    throw new Error('FORBIDDEN: Your role cannot trigger competitor discovery.');
  }
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const profile = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const projectKeywords = listKeywordIntelligenceRecords(params.tenantId, params.projectId);
  const queries =
    params.queries && params.queries.length > 0
      ? params.queries
      : [
          ...profile.approvedServices,
          ...projectKeywords.slice(0, 3).map((k) => k.keyword),
        ].slice(0, 3);

  const startedAt = new Date().toISOString();
  const runId = `crun-${crypto.randomUUID().slice(0, 10)}`;

  // 1) Import genuine competitor URLs previously saved in Phase 7 Keyword Business Profile
  const importedFromProfile: CompetitorProfileRecord[] = [];
  for (const rawUrl of profile.competitorUrls) {
    try {
      const norm = normalizeCompetitorDomain(rawUrl);
      const ownClean = project.website.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (norm.domain === ownClean) continue;
      const existing = getCompetitorByDomain(params.tenantId, params.projectId, norm.domain);
      if (existing) continue;
      const saved = upsertCompetitorWorkflow({
        tenantId: params.tenantId,
        projectId: params.projectId,
        user: params.user,
        domainOrUrl: norm.homepageUrl,
        discoveryOrigin: 'keyword_profile',
        discoveryEvidence: `Imported from Phase 7 Keyword Business Profile (${rawUrl}).`,
        approve: false,
      });
      importedFromProfile.push(saved);
    } catch {
      // Ignore invalid URLs
    }
  }

  // 2) Live SERP discovery if external SERP API key is configured (never simulated)
  const serpRes = await discoverCompetitorsViaSerpApi({
    queries,
    excludeDomain: project.website,
    countryCode: params.countryCode || profile.targetCountry || 'US',
  });

  const discoveredFromSerp: CompetitorProfileRecord[] = [];
  for (const cand of serpRes.candidates.slice(0, 6)) {
    const existing = getCompetitorByDomain(params.tenantId, params.projectId, cand.domain);
    const saved = upsertCompetitorWorkflow({
      tenantId: params.tenantId,
      projectId: params.projectId,
      user: params.user,
      domainOrUrl: cand.homepageUrl,
      discoveryOrigin: 'serp_provider',
      discoveryEvidence: `Ranked #${cand.position} for "${cand.matchedQuery}" via ${cand.source} (${cand.sampleUrl}).`,
      approve: false,
    });
    discoveredFromSerp.push(saved);

    if (!existing) {
      recomputeOverlapsAndGaps({
        tenantId: params.tenantId,
        projectId: params.projectId,
        competitor: saved,
        serpMatches: [
          {
            keyword: cand.matchedQuery,
            competitorUrl: cand.sampleUrl,
            competitorPosition: cand.position,
            source: cand.source,
          },
        ],
      });
    }
  }

  const completedAt = new Date().toISOString();
  const run = createCompetitorResearchRun({
    id: runId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    competitorId: null,
    competitorDomain: 'workspace_discovery',
    runKind: 'serp_discovery',
    urlsScanned: discoveredFromSerp.length + importedFromProfile.length,
    topicsExtracted: 0,
    overlapsFound: discoveredFromSerp.length,
    gapsIdentified: 0,
    status:
      serpRes.status.state === 'credentials_required' && importedFromProfile.length === 0
        ? 'Completed with Warnings'
        : 'Completed',
    providerStatuses: [serpRes.status],
    errorSummary:
      serpRes.status.state === 'credentials_required'
        ? serpRes.status.detail
        : null,
    triggeredBy: params.user.name,
    startedAt,
    completedAt,
  });

  return {
    run,
    importedFromProfile,
    discoveredFromSerp,
    serpStatusDetail: serpRes.status.detail,
  };
}

export function decideContentGapWorkflow(params: {
  tenantId: string;
  gapId: string;
  user: User;
  action: 'recommend' | 'approve' | 'reject' | 'send_to_keywords' | 'create_task';
  notes?: string;
}): ContentGapRecommendation {
  const gap = getContentGapById(params.tenantId, params.gapId);
  if (!gap) {
    throw new Error('NOT_FOUND: Content gap recommendation not found.');
  }

  const now = new Date().toISOString();
  let nextState: ContentGapWorkflowState = gap.workflowState;
  let approvedBy = gap.approvedBy;
  let approvedAt = gap.approvedAt;
  let linkedKeywordId = gap.linkedKeywordId;
  let linkedTicketId = gap.linkedTicketId;

  if (params.action === 'recommend') {
    if (!canUserRecommendContentGaps(params.user.role)) {
      throw new Error('FORBIDDEN: Your role cannot recommend content gaps.');
    }
    if (gap.workflowState === 'owner_approved' || gap.workflowState === 'queued_for_content') {
      throw new Error('CONFLICT: Cannot overwrite an owner-approved content gap.');
    }
    nextState = 'strategist_recommended';
  } else if (params.action === 'approve' || params.action === 'reject') {
    if (!canUserApproveContentGaps(params.user.role)) {
      throw new Error(
        'FORBIDDEN: Only Business Owners, Agency Owners, or Platform Admins can approve or reject content plans.',
      );
    }
    nextState = params.action === 'approve' ? 'owner_approved' : 'rejected';
    approvedBy = params.action === 'approve' ? params.user.name : gap.approvedBy;
    approvedAt = params.action === 'approve' ? now : gap.approvedAt;
  } else if (params.action === 'send_to_keywords') {
    if (!canUserRecommendContentGaps(params.user.role)) {
      throw new Error('FORBIDDEN: Your role cannot send gaps to Keyword Lab.');
    }
    const kwRecord = addManualKeywordRecord({
      tenantId: params.tenantId,
      projectId: gap.projectId,
      user: params.user,
      keyword: gap.targetKeyword,
      targetUrl: gap.projectUrl ?? gap.recommendedBrief.targetSlug,
      notes: `Promoted from Competitor Content Gap vs ${gap.competitorDomain}: ${gap.explanation}`,
    });
    linkedKeywordId = kwRecord.id;
  } else if (params.action === 'create_task') {
    if (!canUserRecommendContentGaps(params.user.role)) {
      throw new Error('FORBIDDEN: Your role cannot queue content production tasks.');
    }
    if (gap.workflowState !== 'owner_approved' && !canUserApproveContentGaps(params.user.role)) {
      throw new Error(
        'PRECONDITION_REQUIRED: Content gap must be owner-approved before queueing execution task.',
      );
    }
    const db = getAuditDb();
    const ticketId = gap.linkedTicketId ?? `tkt-${crypto.randomUUID().slice(0, 8)}`;
    if (!gap.linkedTicketId) {
      db.prepare(`
        INSERT INTO developer_tickets (
          id, tenant_id, issue_id, project_id, title, description,
          responsible_role, assigned_user, task_status, approval_status,
          requires_dual_approval, developer_approved_by, lead_approved_by,
          verification_status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'SEO Strategist', NULL, 'Triaged', 'Approved', 0, NULL, ?, 'Pending', ?, ?, ?)
      `).run(
        ticketId,
        params.tenantId,
        gap.id,
        gap.projectId,
        `Content Gap: ${gap.recommendedBrief.suggestedH1} (vs ${gap.competitorDomain})`,
        `${gap.explanation}\n\nTarget Keyword: ${gap.targetKeyword}\nRecommended URL/Slug: ${gap.recommendedBrief.targetSlug}\nSuggested Sections:\n- ${gap.recommendedBrief.suggestedSections.join('\n- ')}\n\nRecommended Schema: ${gap.recommendedBrief.schemaSuggestion.join(', ')}`,
        params.user.name,
        params.user.name,
        now,
        now,
      );
      linkedTicketId = ticketId;
      recordActivityEvent({
        tenantId: params.tenantId,
        projectId: gap.projectId,
        type: 'content_review',
        actor: params.user.name,
        action: `Queued content gap task "${gap.targetKeyword}" (${ticketId})`,
        status: 'Pending',
        evidenceUrl: '/tasks',
      });
      publishTenantActivityUpdate({
        tenantId: params.tenantId,
        projectId: gap.projectId,
        reason: 'content_gap_task_created',
      });
    }
    nextState = 'queued_for_content';
    if (!approvedBy && canUserApproveContentGaps(params.user.role)) {
      approvedBy = params.user.name;
      approvedAt = now;
    }
  }

  const updated =
    updateContentGapDecisionInDb(params.tenantId, params.gapId, {
      workflowState: nextState,
      approvedBy,
      approvedAt,
      strategistNotes: params.notes?.trim() || gap.strategistNotes,
      linkedTicketId,
      linkedKeywordId,
      updatedAt: now,
    }) ?? gap;

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'content_gap',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: gap.workflowState,
    newState: updated.workflowState,
    reason:
      params.notes?.trim() || `Content gap ${params.action} (${gap.targetKeyword})`,
  });

  return updated;
}

export function exportCompetitorReportBundle(tenantId: string, projectId: string) {
  const ws = getCompetitorWorkspace(tenantId, projectId);
  return {
    exportedAt: new Date().toISOString(),
    projectId: ws.projectId,
    projectName: ws.projectName,
    projectWebsite: ws.projectWebsite,
    provenanceDisclosure:
      'All analyzed page counts, word counts, headings, and schema types are extracted via SSRF-guarded live HTML snapshots. Unconfigured third-party metrics (Domain Authority, Backlinks, Estimated Traffic, Keyword Planner Search Volume, and External SERP Positions) are explicitly marked Unavailable and never simulated.',
    summary: ws.summary,
    comparisonRows: ws.comparisonRows,
    competitors: ws.competitors,
    overlaps: ws.overlaps,
    contentGaps: ws.contentGaps,
  };
}
