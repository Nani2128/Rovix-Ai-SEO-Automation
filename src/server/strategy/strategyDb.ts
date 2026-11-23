import { getAuditDb } from '../audit/db';
import type { AgentStationId } from '../../types/agentFactory';
import type { KeywordIntent } from '../../types/dashboard';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  InternalLinkCategory,
  InternalLinkRecommendationRecord,
  RoadmapImplementationStatus,
  RoadmapPriority,
  RoadmapPriorityScoreBreakdown,
  SeoRoadmapItemRecord,
  SeoStrategyObjectiveRecord,
  SeoStrategyVersionRecord,
  SiteArchitecturePageRecord,
  StrategyApprovalRecord,
  StrategyApprovalStatus,
  StrategyConfidence,
  StrategyEntityKind,
  StrategyEvidenceReadiness,
  StrategyEvidenceRef,
  StrategyStructuredPayload,
  TopicalClusterRecord,
  TopicalCoverageClassification,
} from '../../types/strategy';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapStrategyVersionRow(
  row: Record<string, unknown>,
): SeoStrategyVersionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    versionNumber: Number(row.version_number ?? 1),
    title: String(row.title),
    summary: String(row.summary),
    targetAudience: String(row.target_audience ?? ''),
    evidenceReadiness: parseJson<StrategyEvidenceReadiness>(
      row.evidence_readiness_json,
      {
        hasBusinessProfile: false,
        businessProfileApproved: false,
        crawledUrlsCount: 0,
        latestCrawlAt: null,
        technicalIssuesCount: 0,
        keywordsCount: 0,
        keywordClustersCount: 0,
        approvedLocationsCount: 0,
        competitorsCount: 0,
        contentGapsCount: 0,
        performanceMeasurementsCount: 0,
        missingDataItems: [],
        overallReadiness: 'Needs Research',
      },
    ),
    missingEvidence: parseJson<string[]>(row.missing_evidence_json, []),
    payload: parseJson<StrategyStructuredPayload>(row.strategy_payload_json, {
      targetAudienceSummary: '',
      searchIntentBreakdown: {
        Informational: 0,
        Commercial: 0,
        Transactional: 0,
        Navigational: 0,
        Local: 0,
      },
      primaryKeywordGroups: [],
      recommendedStructureSummary: '',
      recommendedLandingPages: [],
      recommendedServicePages: [],
      recommendedLocationPages: [],
      blogContentCategories: [],
      technicalAndContentPriorities: [],
      missingEvidenceNotes: [],
    }),
    sourceWorkflowId: row.source_workflow_id
      ? String(row.source_workflow_id)
      : null,
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapObjectiveRow(
  row: Record<string, unknown>,
): SeoStrategyObjectiveRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    title: String(row.title),
    rationale: String(row.rationale),
    category: String(row.category) as SeoStrategyObjectiveRecord['category'],
    source: String(row.source),
    confidence: String(row.confidence) as StrategyConfidence,
    needsResearch: Number(row.needs_research ?? 0) === 1,
    evidence: parseJson<StrategyEvidenceRef[]>(row.evidence_json, []),
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapArchitecturePageRow(
  row: Record<string, unknown>,
): SiteArchitecturePageRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    parentPageId: row.parent_page_id ? String(row.parent_page_id) : null,
    sortOrder: Number(row.sort_order ?? 0),
    title: String(row.title),
    slug: String(row.slug),
    proposedUrl: String(row.proposed_url),
    existingUrl: row.existing_url ? String(row.existing_url) : null,
    pageType: String(row.page_type ?? 'resource') as ArchitecturePageType,
    primaryKeyword: row.primary_keyword ? String(row.primary_keyword) : null,
    secondaryKeywords: parseJson<string[]>(row.secondary_keywords_json, []),
    relatedKeywords: parseJson<string[]>(row.related_keywords_json, []),
    searchIntent: String(row.search_intent ?? 'Informational') as KeywordIntent,
    clusterId: row.cluster_id ? String(row.cluster_id) : null,
    clusterName: row.cluster_name ? String(row.cluster_name) : null,
    targetGeography: row.target_geography ? String(row.target_geography) : null,
    pageStatus: String(row.page_status ?? 'proposed') as ArchitecturePageStatus,
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    mappingApprovalStatus: String(
      row.mapping_approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    confidence: String(row.confidence ?? 'Medium') as StrategyConfidence,
    rationale: String(row.rationale ?? ''),
    evidence: parseJson<StrategyEvidenceRef[]>(row.evidence_json, []),
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    notes: String(row.notes ?? ''),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapInternalLinkRow(
  row: Record<string, unknown>,
): InternalLinkRecommendationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    sourcePageId: row.source_page_id ? String(row.source_page_id) : null,
    sourceUrl: String(row.source_url),
    sourceTitle: String(row.source_title),
    targetPageId: row.target_page_id ? String(row.target_page_id) : null,
    targetUrl: String(row.target_url),
    targetTitle: String(row.target_title),
    suggestedAnchorText: String(row.suggested_anchor_text),
    linkCategory: String(row.link_category) as InternalLinkCategory,
    existsInCrawl: Number(row.exists_in_crawl ?? 0) === 1,
    currentInboundCount:
      row.current_inbound_count !== null &&
      row.current_inbound_count !== undefined
        ? Number(row.current_inbound_count)
        : null,
    reason: String(row.reason),
    confidence: String(row.confidence ?? 'Medium') as StrategyConfidence,
    evidence: parseJson<StrategyEvidenceRef[]>(row.evidence_json, []),
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTopicalClusterRow(
  row: Record<string, unknown>,
): TopicalClusterRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    pillarTopic: String(row.pillar_topic),
    supportingSubtopics: parseJson<string[]>(row.supporting_subtopics_json, []),
    coverageClassification: String(
      row.coverage_classification,
    ) as TopicalCoverageClassification,
    verifiedPageUrls: parseJson<string[]>(row.verified_page_urls_json, []),
    missingOpportunities: parseJson<string[]>(
      row.missing_opportunities_json,
      [],
    ),
    competitorGapIds: parseJson<string[]>(row.competitor_gap_ids_json, []),
    keywordClusterId: row.keyword_cluster_id
      ? String(row.keyword_cluster_id)
      : null,
    linkedPageIds: parseJson<string[]>(row.linked_page_ids_json, []),
    priorityScore:
      row.priority_score !== null && row.priority_score !== undefined
        ? Number(row.priority_score)
        : null,
    confidence: String(row.confidence ?? 'Medium') as StrategyConfidence,
    evidenceSummary: String(row.evidence_summary ?? ''),
    evidence: parseJson<StrategyEvidenceRef[]>(row.evidence_json, []),
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRoadmapItemRow(row: Record<string, unknown>): SeoRoadmapItemRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category) as SeoRoadmapItemRecord['category'],
    relatedPageId: row.related_page_id ? String(row.related_page_id) : null,
    relatedUrl: row.related_url ? String(row.related_url) : null,
    relatedKeyword: row.related_keyword ? String(row.related_keyword) : null,
    businessImpactRationale: String(row.business_impact_rationale),
    evidence: parseJson<StrategyEvidenceRef[]>(row.evidence_json, []),
    priority: String(row.priority) as RoadmapPriority,
    priorityScore:
      row.priority_score !== null && row.priority_score !== undefined
        ? Number(row.priority_score)
        : null,
    scoreBreakdown: parseJson<RoadmapPriorityScoreBreakdown>(
      row.score_breakdown_json,
      {
        businessRelevance: 0,
        searchIntent: 0,
        technicalFeasibility: 0,
        keywordEvidence: 0,
        competitorGapEvidence: 0,
        geographicRelevance: 0,
        dependencyReadiness: 0,
        totalScore: 0,
        explanation: [],
      },
    ),
    dependencies: parseJson<string[]>(row.dependencies_json, []),
    estimatedEffort: String(row.estimated_effort),
    responsibleRole: String(row.responsible_role),
    recommendedAgentId: row.recommended_agent_id
      ? (String(row.recommended_agent_id) as AgentStationId)
      : null,
    approvalStatus: String(
      row.approval_status ?? 'pending_review',
    ) as StrategyApprovalStatus,
    implementationStatus: String(
      row.implementation_status ?? 'not_started',
    ) as RoadmapImplementationStatus,
    linkedTicketId: row.linked_ticket_id ? String(row.linked_ticket_id) : null,
    linkedWorkflowId: row.linked_workflow_id
      ? String(row.linked_workflow_id)
      : null,
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapApprovalRow(row: Record<string, unknown>): StrategyApprovalRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    strategyVersionId: String(row.strategy_version_id),
    entityKind: String(row.entity_kind) as StrategyEntityKind,
    entityId: String(row.entity_id),
    entityLabel: String(row.entity_label),
    previousStatus: String(row.previous_status),
    newStatus: String(row.new_status) as StrategyApprovalStatus,
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    actorRole: String(row.actor_role),
    comment: String(row.comment ?? ''),
    timestamp: String(row.timestamp),
  };
}

export function listStrategyVersionsInDb(
  tenantId: string,
  projectId: string,
): SeoStrategyVersionRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM seo_strategy_versions
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY version_number DESC LIMIT 30`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapStrategyVersionRow);
}

export function getStrategyVersionByIdInDb(
  tenantId: string,
  projectId: string,
  versionId: string,
): SeoStrategyVersionRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM seo_strategy_versions
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, versionId) as Record<string, unknown> | undefined;
  return row ? mapStrategyVersionRow(row) : null;
}

export function getNextStrategyVersionNumberInDb(
  tenantId: string,
  projectId: string,
): number {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT MAX(version_number) AS max_ver
       FROM seo_strategy_versions
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .get(tenantId, projectId) as { max_ver: number | null } | undefined;
  return Number(row?.max_ver ?? 0) + 1;
}

export function insertStrategyVersionInDb(
  record: SeoStrategyVersionRecord,
): SeoStrategyVersionRecord {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO seo_strategy_versions (
      id, tenant_id, project_id, version_number, title, summary, target_audience,
      evidence_readiness_json, missing_evidence_json, strategy_payload_json,
      source_workflow_id, is_ai_generated, approval_status, approved_by, approved_at,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.tenantId,
    record.projectId,
    record.versionNumber,
    record.title,
    record.summary,
    record.targetAudience,
    JSON.stringify(record.evidenceReadiness),
    JSON.stringify(record.missingEvidence),
    JSON.stringify(record.payload),
    record.sourceWorkflowId,
    record.isAiGenerated ? 1 : 0,
    record.approvalStatus,
    record.approvedBy,
    record.approvedAt,
    record.createdBy,
    record.createdAt,
    record.updatedAt,
  );
  return record;
}

export function insertStrategyObjectivesInDb(
  records: SeoStrategyObjectiveRecord[],
): void {
  const db = getAuditDb();
  const stmt = db.prepare(
    `INSERT INTO seo_strategy_objectives (
      id, tenant_id, project_id, strategy_version_id, title, rationale, category,
      source, confidence, needs_research, evidence_json, approval_status,
      approved_by, approved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of records) {
    stmt.run(
      r.id,
      r.tenantId,
      r.projectId,
      r.strategyVersionId,
      r.title,
      r.rationale,
      r.category,
      r.source,
      r.confidence,
      r.needsResearch ? 1 : 0,
      JSON.stringify(r.evidence),
      r.approvalStatus,
      r.approvedBy,
      r.approvedAt,
      r.createdAt,
      r.updatedAt,
    );
  }
}

export function listStrategyObjectivesInDb(
  tenantId: string,
  projectId: string,
  strategyVersionId: string,
): SeoStrategyObjectiveRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM seo_strategy_objectives
       WHERE tenant_id = ? AND project_id = ? AND strategy_version_id = ?
       ORDER BY created_at ASC`,
    )
    .all(tenantId, projectId, strategyVersionId) as Record<string, unknown>[];
  return rows.map(mapObjectiveRow);
}

export function insertArchitecturePageInDb(
  record: SiteArchitecturePageRecord,
): SiteArchitecturePageRecord {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO site_architecture_pages (
      id, tenant_id, project_id, strategy_version_id, parent_page_id, sort_order,
      title, slug, proposed_url, existing_url, page_type, primary_keyword,
      secondary_keywords_json, related_keywords_json, search_intent, cluster_id,
      cluster_name, target_geography, page_status, approval_status,
      mapping_approval_status, confidence, rationale, evidence_json,
      is_ai_generated, notes, archived_at, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.tenantId,
    record.projectId,
    record.strategyVersionId,
    record.parentPageId,
    record.sortOrder,
    record.title,
    record.slug,
    record.proposedUrl,
    record.existingUrl,
    record.pageType,
    record.primaryKeyword,
    JSON.stringify(record.secondaryKeywords),
    JSON.stringify(record.relatedKeywords),
    record.searchIntent,
    record.clusterId,
    record.clusterName,
    record.targetGeography,
    record.pageStatus,
    record.approvalStatus,
    record.mappingApprovalStatus,
    record.confidence,
    record.rationale,
    JSON.stringify(record.evidence),
    record.isAiGenerated ? 1 : 0,
    record.notes,
    record.archivedAt,
    record.createdBy,
    record.updatedBy,
    record.createdAt,
    record.updatedAt,
  );
  return record;
}

export function listArchitecturePagesInDb(
  tenantId: string,
  projectId: string,
  strategyVersionId: string,
): SiteArchitecturePageRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM site_architecture_pages
       WHERE tenant_id = ? AND project_id = ? AND strategy_version_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(tenantId, projectId, strategyVersionId) as Record<string, unknown>[];
  return rows.map(mapArchitecturePageRow);
}

export function getArchitecturePageByIdInDb(
  tenantId: string,
  projectId: string,
  pageId: string,
): SiteArchitecturePageRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM site_architecture_pages
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, pageId) as Record<string, unknown> | undefined;
  return row ? mapArchitecturePageRow(row) : null;
}

export function updateArchitecturePageInDb(
  record: SiteArchitecturePageRecord,
): SiteArchitecturePageRecord {
  const db = getAuditDb();
  db.prepare(
    `UPDATE site_architecture_pages
     SET parent_page_id = ?, sort_order = ?, title = ?, slug = ?, proposed_url = ?,
         existing_url = ?, page_type = ?, primary_keyword = ?,
         secondary_keywords_json = ?, related_keywords_json = ?, search_intent = ?,
         cluster_id = ?, cluster_name = ?, target_geography = ?, page_status = ?,
         approval_status = ?, mapping_approval_status = ?, confidence = ?,
         rationale = ?, notes = ?, archived_at = ?, updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    record.parentPageId,
    record.sortOrder,
    record.title,
    record.slug,
    record.proposedUrl,
    record.existingUrl,
    record.pageType,
    record.primaryKeyword,
    JSON.stringify(record.secondaryKeywords),
    JSON.stringify(record.relatedKeywords),
    record.searchIntent,
    record.clusterId,
    record.clusterName,
    record.targetGeography,
    record.pageStatus,
    record.approvalStatus,
    record.mappingApprovalStatus,
    record.confidence,
    record.rationale,
    record.notes,
    record.archivedAt,
    record.updatedBy,
    record.updatedAt,
    record.tenantId,
    record.projectId,
    record.id,
  );
  return record;
}

export function insertInternalLinksInDb(
  records: InternalLinkRecommendationRecord[],
): void {
  const db = getAuditDb();
  const stmt = db.prepare(
    `INSERT INTO internal_link_recommendations (
      id, tenant_id, project_id, strategy_version_id, source_page_id, source_url,
      source_title, target_page_id, target_url, target_title, suggested_anchor_text,
      link_category, exists_in_crawl, current_inbound_count, reason, confidence,
      evidence_json, approval_status, approved_by, approved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of records) {
    stmt.run(
      r.id,
      r.tenantId,
      r.projectId,
      r.strategyVersionId,
      r.sourcePageId,
      r.sourceUrl,
      r.sourceTitle,
      r.targetPageId,
      r.targetUrl,
      r.targetTitle,
      r.suggestedAnchorText,
      r.linkCategory,
      r.existsInCrawl ? 1 : 0,
      r.currentInboundCount,
      r.reason,
      r.confidence,
      JSON.stringify(r.evidence),
      r.approvalStatus,
      r.approvedBy,
      r.approvedAt,
      r.createdAt,
      r.updatedAt,
    );
  }
}

export function listInternalLinksInDb(
  tenantId: string,
  projectId: string,
  strategyVersionId: string,
): InternalLinkRecommendationRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM internal_link_recommendations
       WHERE tenant_id = ? AND project_id = ? AND strategy_version_id = ?
       ORDER BY created_at ASC`,
    )
    .all(tenantId, projectId, strategyVersionId) as Record<string, unknown>[];
  return rows.map(mapInternalLinkRow);
}

export function insertTopicalClustersInDb(
  records: TopicalClusterRecord[],
): void {
  const db = getAuditDb();
  const stmt = db.prepare(
    `INSERT INTO topical_clusters (
      id, tenant_id, project_id, strategy_version_id, pillar_topic,
      supporting_subtopics_json, coverage_classification, verified_page_urls_json,
      missing_opportunities_json, competitor_gap_ids_json, keyword_cluster_id,
      linked_page_ids_json, priority_score, confidence, evidence_summary,
      evidence_json, is_ai_generated, approval_status, approved_by, approved_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of records) {
    stmt.run(
      r.id,
      r.tenantId,
      r.projectId,
      r.strategyVersionId,
      r.pillarTopic,
      JSON.stringify(r.supportingSubtopics),
      r.coverageClassification,
      JSON.stringify(r.verifiedPageUrls),
      JSON.stringify(r.missingOpportunities),
      JSON.stringify(r.competitorGapIds),
      r.keywordClusterId,
      JSON.stringify(r.linkedPageIds),
      r.priorityScore,
      r.confidence,
      r.evidenceSummary,
      JSON.stringify(r.evidence),
      r.isAiGenerated ? 1 : 0,
      r.approvalStatus,
      r.approvedBy,
      r.approvedAt,
      r.createdAt,
      r.updatedAt,
    );
  }
}

export function listTopicalClustersInDb(
  tenantId: string,
  projectId: string,
  strategyVersionId: string,
): TopicalClusterRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM topical_clusters
       WHERE tenant_id = ? AND project_id = ? AND strategy_version_id = ?
       ORDER BY COALESCE(priority_score, -1) DESC, created_at ASC`,
    )
    .all(tenantId, projectId, strategyVersionId) as Record<string, unknown>[];
  return rows.map(mapTopicalClusterRow);
}

export function insertRoadmapItemsInDb(records: SeoRoadmapItemRecord[]): void {
  const db = getAuditDb();
  const stmt = db.prepare(
    `INSERT INTO seo_roadmap_items (
      id, tenant_id, project_id, strategy_version_id, title, description, category,
      related_page_id, related_url, related_keyword, business_impact_rationale,
      evidence_json, priority, priority_score, score_breakdown_json,
      dependencies_json, estimated_effort, responsible_role, recommended_agent_id,
      approval_status, implementation_status, linked_ticket_id, linked_workflow_id,
      is_ai_generated, approved_by, approved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of records) {
    stmt.run(
      r.id,
      r.tenantId,
      r.projectId,
      r.strategyVersionId,
      r.title,
      r.description,
      r.category,
      r.relatedPageId,
      r.relatedUrl,
      r.relatedKeyword,
      r.businessImpactRationale,
      JSON.stringify(r.evidence),
      r.priority,
      r.priorityScore,
      JSON.stringify(r.scoreBreakdown),
      JSON.stringify(r.dependencies),
      r.estimatedEffort,
      r.responsibleRole,
      r.recommendedAgentId,
      r.approvalStatus,
      r.implementationStatus,
      r.linkedTicketId,
      r.linkedWorkflowId,
      r.isAiGenerated ? 1 : 0,
      r.approvedBy,
      r.approvedAt,
      r.createdAt,
      r.updatedAt,
    );
  }
}

export function listRoadmapItemsInDb(
  tenantId: string,
  projectId: string,
  strategyVersionId: string,
): SeoRoadmapItemRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM seo_roadmap_items
       WHERE tenant_id = ? AND project_id = ? AND strategy_version_id = ?
       ORDER BY COALESCE(priority_score, -1) DESC, created_at ASC`,
    )
    .all(tenantId, projectId, strategyVersionId) as Record<string, unknown>[];
  return rows.map(mapRoadmapItemRow);
}

export function getRoadmapItemByIdInDb(
  tenantId: string,
  projectId: string,
  roadmapItemId: string,
): SeoRoadmapItemRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM seo_roadmap_items
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, roadmapItemId) as Record<string, unknown> | undefined;
  return row ? mapRoadmapItemRow(row) : null;
}

export function updateRoadmapItemLinkageInDb(params: {
  tenantId: string;
  projectId: string;
  roadmapItemId: string;
  implementationStatus: RoadmapImplementationStatus;
  linkedTicketId?: string | null;
  linkedWorkflowId?: string | null;
  updatedAt: string;
}): SeoRoadmapItemRecord | null {
  const db = getAuditDb();
  const existing = getRoadmapItemByIdInDb(
    params.tenantId,
    params.projectId,
    params.roadmapItemId,
  );
  if (!existing) return null;
  const nextTicket =
    params.linkedTicketId !== undefined
      ? params.linkedTicketId
      : existing.linkedTicketId;
  const nextWorkflow =
    params.linkedWorkflowId !== undefined
      ? params.linkedWorkflowId
      : existing.linkedWorkflowId;
  db.prepare(
    `UPDATE seo_roadmap_items
     SET implementation_status = ?, linked_ticket_id = ?, linked_workflow_id = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    params.implementationStatus,
    nextTicket,
    nextWorkflow,
    params.updatedAt,
    params.tenantId,
    params.projectId,
    params.roadmapItemId,
  );
  return getRoadmapItemByIdInDb(
    params.tenantId,
    params.projectId,
    params.roadmapItemId,
  );
}

export function insertStrategyApprovalRecordInDb(
  record: StrategyApprovalRecord,
): StrategyApprovalRecord {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO strategy_approval_records (
      id, tenant_id, project_id, strategy_version_id, entity_kind, entity_id,
      entity_label, previous_status, new_status, actor_id, actor_name,
      actor_role, comment, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.tenantId,
    record.projectId,
    record.strategyVersionId,
    record.entityKind,
    record.entityId,
    record.entityLabel,
    record.previousStatus,
    record.newStatus,
    record.actorId,
    record.actorName,
    record.actorRole,
    record.comment,
    record.timestamp,
  );
  return record;
}

export function listStrategyApprovalRecordsInDb(
  tenantId: string,
  projectId: string,
  limit = 100,
): StrategyApprovalRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM strategy_approval_records
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapApprovalRow);
}

export function updateEntityApprovalStatusInDb(params: {
  tenantId: string;
  projectId: string;
  entityKind: StrategyEntityKind;
  entityId: string;
  newStatus: StrategyApprovalStatus;
  actorName: string;
  now: string;
}): {
  strategyVersionId: string;
  entityLabel: string;
  previousStatus: string;
} | null {
  const db = getAuditDb();

  if (params.entityKind === 'strategy_version') {
    const row = db
      .prepare(
        `SELECT id, title, version_number, approval_status
         FROM seo_strategy_versions
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE seo_strategy_versions
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      params.newStatus,
      params.newStatus === 'approved' ? params.actorName : null,
      params.newStatus === 'approved' ? params.now : null,
      params.now,
      params.tenantId,
      params.projectId,
      params.entityId,
    );
    return {
      strategyVersionId: String(row.id),
      entityLabel: `v${row.version_number}: ${row.title}`,
      previousStatus: String(row.approval_status),
    };
  }

  if (params.entityKind === 'objective') {
    const row = db
      .prepare(
        `SELECT strategy_version_id, title, approval_status
         FROM seo_strategy_objectives
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE seo_strategy_objectives
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      params.newStatus,
      params.newStatus === 'approved' ? params.actorName : null,
      params.newStatus === 'approved' ? params.now : null,
      params.now,
      params.tenantId,
      params.projectId,
      params.entityId,
    );
    return {
      strategyVersionId: String(row.strategy_version_id),
      entityLabel: String(row.title),
      previousStatus: String(row.approval_status),
    };
  }

  if (
    params.entityKind === 'architecture_page' ||
    params.entityKind === 'keyword_mapping'
  ) {
    const row = db
      .prepare(
        `SELECT strategy_version_id, title, slug, approval_status, mapping_approval_status
         FROM site_architecture_pages
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    const isMapping = params.entityKind === 'keyword_mapping';
    if (isMapping) {
      db.prepare(
        `UPDATE site_architecture_pages
         SET mapping_approval_status = ?, updated_by = ?, updated_at = ?
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      ).run(
        params.newStatus,
        params.actorName,
        params.now,
        params.tenantId,
        params.projectId,
        params.entityId,
      );
    } else {
      db.prepare(
        `UPDATE site_architecture_pages
         SET approval_status = ?, updated_by = ?, updated_at = ?
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      ).run(
        params.newStatus,
        params.actorName,
        params.now,
        params.tenantId,
        params.projectId,
        params.entityId,
      );
    }
    return {
      strategyVersionId: String(row.strategy_version_id),
      entityLabel: `${row.title} (${row.slug})`,
      previousStatus: String(
        isMapping ? row.mapping_approval_status : row.approval_status,
      ),
    };
  }

  if (params.entityKind === 'internal_link') {
    const row = db
      .prepare(
        `SELECT strategy_version_id, source_url, target_url, approval_status
         FROM internal_link_recommendations
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE internal_link_recommendations
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      params.newStatus,
      params.newStatus === 'approved' ? params.actorName : null,
      params.newStatus === 'approved' ? params.now : null,
      params.now,
      params.tenantId,
      params.projectId,
      params.entityId,
    );
    return {
      strategyVersionId: String(row.strategy_version_id),
      entityLabel: `${row.source_url} -> ${row.target_url}`,
      previousStatus: String(row.approval_status),
    };
  }

  if (params.entityKind === 'topical_cluster') {
    const row = db
      .prepare(
        `SELECT strategy_version_id, pillar_topic, approval_status
         FROM topical_clusters
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE topical_clusters
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      params.newStatus,
      params.newStatus === 'approved' ? params.actorName : null,
      params.newStatus === 'approved' ? params.now : null,
      params.now,
      params.tenantId,
      params.projectId,
      params.entityId,
    );
    return {
      strategyVersionId: String(row.strategy_version_id),
      entityLabel: String(row.pillar_topic),
      previousStatus: String(row.approval_status),
    };
  }

  if (params.entityKind === 'roadmap_item') {
    const row = db
      .prepare(
        `SELECT strategy_version_id, title, approval_status
         FROM seo_roadmap_items
         WHERE tenant_id = ? AND project_id = ? AND id = ?`,
      )
      .get(params.tenantId, params.projectId, params.entityId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE seo_roadmap_items
       SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      params.newStatus,
      params.newStatus === 'approved' ? params.actorName : null,
      params.newStatus === 'approved' ? params.now : null,
      params.now,
      params.tenantId,
      params.projectId,
      params.entityId,
    );
    return {
      strategyVersionId: String(row.strategy_version_id),
      entityLabel: String(row.title),
      previousStatus: String(row.approval_status),
    };
  }

  return null;
}
