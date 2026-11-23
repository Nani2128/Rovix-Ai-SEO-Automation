import crypto from 'node:crypto';
import type {
  CmsConnectionRecord,
  CmsConnectionStatus,
  CmsPlatform,
  OnPageAnalysisRunRecord,
  OnPageApprovalRecord,
  OnPageApprovalStatus,
  OnPageDraftContentPayload,
  OnPageEvidenceRef,
  OnPageHtmlExtract,
  OnPageIssueCategory,
  OnPageIssueRecord,
  OnPageIssueSeverity,
  OnPageKeywordContext,
  OnPageLifecycleStatus,
  OnPageOptimizationDraftRecord,
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
  OnPageRecommendationTarget,
  OnPageScoreBreakdown,
  OnPageValidationRecord,
  ValidationFieldDiff,
} from '../../types/onPage';
import type { KeywordIntent } from '../../types/dashboard';
import type { StrategyConfidence } from '../../types/strategy';
import { getAuditDb } from '../audit/db';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapRunRow(row: Record<string, unknown>): OnPageAnalysisRunRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    crawlId: row.crawl_id ? String(row.crawl_id) : null,
    strategyVersionId: row.strategy_version_id ? String(row.strategy_version_id) : null,
    status: row.status as OnPageAnalysisRunRecord['status'],
    pagesAnalyzedCount: Number(row.pages_analyzed_count ?? 0),
    issuesDetectedCount: Number(row.issues_detected_count ?? 0),
    unavailableEvidencePagesCount: Number(row.unavailable_evidence_pages_count ?? 0),
    triggeredBy: String(row.triggered_by),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summaryNote: String(row.summary_note ?? ''),
  };
}

function mapPageRow(row: Record<string, unknown>): OnPagePageAnalysisRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    analysisRunId: String(row.analysis_run_id),
    crawlId: String(row.crawl_id),
    crawlUrlId: String(row.crawl_url_id),
    url: String(row.url),
    slug: String(row.slug),
    pageType: String(row.page_type),
    statusCode: Number(row.status_code ?? 200),
    indexability:
      row.indexability === 'Non-Indexable' ? 'Non-Indexable' : 'Indexable',
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    canonicalStatus: String(row.canonical_status ?? 'missing'),
    title: row.title !== null && row.title !== undefined ? String(row.title) : null,
    metaDescription:
      row.meta_description !== null && row.meta_description !== undefined
        ? String(row.meta_description)
        : null,
    h1: row.h1 !== null && row.h1 !== undefined ? String(row.h1) : null,
    htmlExtract: parseJson<OnPageHtmlExtract>(row.html_extract_json, {
      htmlAvailable: false,
      renderingSource: 'metadata_only',
      wordCount: null,
      bodyTextExcerpt: '',
      headings: [],
      h1List: [],
      images: [],
      imagesTotal: 0,
      imagesMissingAlt: 0,
      imagesEmptyAlt: 0,
      imagesMissingDimensions: 0,
      jsonLdBlocks: [],
      detectedSchemaTypes: [],
      invalidSchemaCount: 0,
      internalAnchors: [],
      weakAnchorCount: 0,
    }),
    keywordContext: parseJson<OnPageKeywordContext>(row.keyword_context_json, {
      existingPrimaryKeyword: null,
      secondaryKeywords: [],
      searchIntent: null,
      targetGeography: null,
      recommendedPrimaryKeyword: null,
      recommendedKeywordReason: null,
      mappingStatus: 'unmapped',
      cannibalizationWarnings: [],
      relatedClusterOpportunities: [],
      optimizeExistingInsteadOfDuplicate: false,
    }),
    suggestedSchemaTypes: parseJson<string[]>(row.suggested_schema_json, []),
    suggestedSubtopics: parseJson<string[]>(row.suggested_subtopics_json, []),
    scoreBreakdown: parseJson<OnPageScoreBreakdown>(row.score_breakdown_json, {
      overallScore: null,
      scoreStatus: 'insufficient_evidence',
      scoredCategoriesCount: 0,
      unavailableCategoriesCount: 10,
      caveat: 'Insufficient evidence.',
      categories: [],
    }),
    overallScore:
      row.overall_score !== null && row.overall_score !== undefined
        ? Number(row.overall_score)
        : null,
    scoreStatus:
      row.score_status === 'scored' ? 'scored' : 'insufficient_evidence',
    issueCount: Number(row.issue_count ?? 0),
    criticalHighIssueCount: Number(row.critical_high_issue_count ?? 0),
    lifecycleStatus: String(row.lifecycle_status) as OnPageLifecycleStatus,
    analyzedAt: String(row.analyzed_at),
    updatedAt: String(row.updated_at),
  };
}

function mapIssueRow(row: Record<string, unknown>): OnPageIssueRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    analysisRunId: String(row.analysis_run_id),
    pageAnalysisId: String(row.page_analysis_id),
    pageUrl: String(row.page_url),
    issueKey: String(row.issue_key),
    category: String(row.category) as OnPageIssueCategory,
    severity: String(row.severity) as OnPageIssueSeverity,
    title: String(row.title),
    description: String(row.description),
    recommendedAction: String(row.recommended_action),
    evidence: parseJson<OnPageEvidenceRef[]>(row.evidence_json, []),
    approvalStatus: String(row.approval_status) as OnPageApprovalStatus,
    lifecycleStatus: String(row.lifecycle_status) as OnPageLifecycleStatus,
    linkedRoadmapItemId: row.linked_roadmap_item_id
      ? String(row.linked_roadmap_item_id)
      : null,
    linkedTicketId: row.linked_ticket_id ? String(row.linked_ticket_id) : null,
    firstDetectedAt: String(row.first_detected_at),
    lastDetectedAt: String(row.last_detected_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRecommendationRow(
  row: Record<string, unknown>,
): OnPageRecommendationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    pageAnalysisId: String(row.page_analysis_id),
    pageUrl: String(row.page_url),
    targetField: String(row.target_field) as OnPageRecommendationTarget,
    currentValue: String(row.current_value),
    suggestedValue: String(row.suggested_value),
    reason: String(row.reason),
    relatedKeyword: row.related_keyword ? String(row.related_keyword) : null,
    searchIntent: row.search_intent ? (String(row.search_intent) as KeywordIntent) : null,
    evidence: parseJson<OnPageEvidenceRef[]>(row.evidence_json, []),
    confidence: String(row.confidence) as StrategyConfidence,
    isAiGenerated: Number(row.is_ai_generated ?? 0) === 1,
    aiModel: row.ai_model ? String(row.ai_model) : null,
    providerUsageEventId: row.provider_usage_event_id
      ? String(row.provider_usage_event_id)
      : null,
    approvalStatus: String(row.approval_status) as OnPageApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDraftRow(row: Record<string, unknown>): OnPageOptimizationDraftRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    pageAnalysisId: String(row.page_analysis_id),
    pageUrl: String(row.page_url),
    versionNumber: Number(row.version_number ?? 1),
    originalSnapshot: parseJson<OnPageOptimizationDraftRecord['originalSnapshot']>(
      row.original_snapshot_json,
      {
        title: null,
        metaDescription: null,
        h1: null,
        headings: [],
        primaryKeyword: null,
        detectedSchemaTypes: [],
        missingAltCount: 0,
        bodyTextExcerpt: '',
      },
    ),
    proposed: parseJson<OnPageDraftContentPayload>(row.proposed_payload_json, {
      proposedTitle: '',
      proposedMetaDescription: '',
      proposedH1: '',
      proposedHeadings: [],
      proposedPrimaryKeyword: null,
      proposedSecondaryKeywords: [],
      proposedImageAlts: [],
      proposedSchemaJsonLd: '',
      proposedSchemaTypes: [],
      proposedContentNotes: '',
      proposedInternalLinks: [],
    }),
    changeSummary: String(row.change_summary ?? ''),
    approvalStatus: String(row.approval_status) as OnPageApprovalStatus,
    lifecycleStatus: String(row.lifecycle_status) as OnPageLifecycleStatus,
    appliedExternallyAt: row.applied_externally_at
      ? String(row.applied_externally_at)
      : null,
    appliedExternallyBy: row.applied_externally_by
      ? String(row.applied_externally_by)
      : null,
    appliedExternallyChannel: row.applied_externally_channel
      ? String(row.applied_externally_channel)
      : null,
    appliedExternalNote: row.applied_external_note
      ? String(row.applied_external_note)
      : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    verifiedCrawlId: row.verified_crawl_id ? String(row.verified_crawl_id) : null,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapApprovalRow(row: Record<string, unknown>): OnPageApprovalRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    entityKind: String(row.entity_kind) as OnPageApprovalRecord['entityKind'],
    entityId: String(row.entity_id),
    pageUrl: String(row.page_url),
    entityLabel: String(row.entity_label),
    previousStatus: String(row.previous_status),
    newStatus: String(row.new_status) as OnPageApprovalStatus,
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    actorRole: String(row.actor_role),
    comment: String(row.comment ?? ''),
    timestamp: String(row.timestamp),
  };
}

function mapValidationRow(row: Record<string, unknown>): OnPageValidationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    draftId: String(row.draft_id),
    pageUrl: String(row.page_url),
    crawlId: String(row.crawl_id),
    verificationStatus: String(
      row.verification_status,
    ) as OnPageValidationRecord['verificationStatus'],
    matchedChecksCount: Number(row.matched_checks_count ?? 0),
    totalChecksCount: Number(row.total_checks_count ?? 0),
    diffs: parseJson<ValidationFieldDiff[]>(row.diffs_json, []),
    summary: String(row.summary),
    validatedBy: String(row.validated_by),
    validatedAt: String(row.validated_at),
  };
}

function mapCmsConnectionRow(row: Record<string, unknown>): CmsConnectionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    platform: String(row.platform) as CmsPlatform,
    displayName: String(row.display_name),
    siteUrl: String(row.site_url),
    status: String(row.status) as CmsConnectionStatus,
    hasEncryptedCredentials: Boolean(row.encrypted_credentials_json),
    autoPublishPermitted: false,
    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdBy: String(row.created_by),
    updatedAt: String(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Analysis Runs
// ---------------------------------------------------------------------------

export function insertOnPageRunInDb(
  run: Omit<OnPageAnalysisRunRecord, 'id'> & { id?: string },
): OnPageAnalysisRunRecord {
  const db = getAuditDb();
  const id = run.id ?? `onpage_run_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_analysis_runs (
      id, tenant_id, project_id, crawl_id, strategy_version_id, status,
      pages_analyzed_count, issues_detected_count, unavailable_evidence_pages_count,
      triggered_by, started_at, completed_at, summary_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    run.tenantId,
    run.projectId,
    run.crawlId,
    run.strategyVersionId,
    run.status,
    run.pagesAnalyzedCount,
    run.issuesDetectedCount,
    run.unavailableEvidencePagesCount,
    run.triggeredBy,
    run.startedAt,
    run.completedAt,
    run.summaryNote,
  );
  return { ...run, id };
}

export function getLatestOnPageRunInDb(
  tenantId: string,
  projectId: string,
): OnPageAnalysisRunRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM onpage_analysis_runs
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(tenantId, projectId) as Record<string, unknown> | undefined;
  return row ? mapRunRow(row) : null;
}

// ---------------------------------------------------------------------------
// Page Analyses (Idempotent upsert per tenant + project + url)
// ---------------------------------------------------------------------------

export function upsertPageAnalysisInDb(
  record: Omit<OnPagePageAnalysisRecord, 'id'> & { id?: string },
): OnPagePageAnalysisRecord {
  const db = getAuditDb();
  const existing = db
    .prepare(
      `SELECT id, lifecycle_status FROM onpage_page_analyses
       WHERE tenant_id = ? AND project_id = ? AND url = ?`,
    )
    .get(record.tenantId, record.projectId, record.url) as
    | { id: string; lifecycle_status: string }
    | undefined;

  if (existing) {
    // Preserve advanced editorial lifecycle states across re-analysis runs
    const preservedLifecycle =
      existing.lifecycle_status === 'verified' ||
      existing.lifecycle_status === 'applied_externally' ||
      existing.lifecycle_status === 'approved' ||
      existing.lifecycle_status === 'draft_ready'
        ? (existing.lifecycle_status as OnPageLifecycleStatus)
        : record.lifecycleStatus;

    db.prepare(
      `UPDATE onpage_page_analyses
       SET analysis_run_id = ?, crawl_id = ?, crawl_url_id = ?, slug = ?,
           page_type = ?, status_code = ?, indexability = ?, canonical_url = ?,
           canonical_status = ?, title = ?, meta_description = ?, h1 = ?,
           html_extract_json = ?, keyword_context_json = ?, suggested_schema_json = ?,
           suggested_subtopics_json = ?, score_breakdown_json = ?, overall_score = ?,
           score_status = ?, issue_count = ?, critical_high_issue_count = ?,
           lifecycle_status = ?, analyzed_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    ).run(
      record.analysisRunId,
      record.crawlId,
      record.crawlUrlId,
      record.slug,
      record.pageType,
      record.statusCode,
      record.indexability,
      record.canonicalUrl,
      record.canonicalStatus,
      record.title,
      record.metaDescription,
      record.h1,
      JSON.stringify(record.htmlExtract),
      JSON.stringify(record.keywordContext),
      JSON.stringify(record.suggestedSchemaTypes),
      JSON.stringify(record.suggestedSubtopics),
      JSON.stringify(record.scoreBreakdown),
      record.overallScore,
      record.scoreStatus,
      record.issueCount,
      record.criticalHighIssueCount,
      preservedLifecycle,
      record.analyzedAt,
      record.updatedAt,
      existing.id,
      record.tenantId,
    );
    return { ...record, id: existing.id, lifecycleStatus: preservedLifecycle };
  }

  const id = record.id ?? `onpage_pg_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_page_analyses (
      id, tenant_id, project_id, analysis_run_id, crawl_id, crawl_url_id,
      url, slug, page_type, status_code, indexability, canonical_url,
      canonical_status, title, meta_description, h1, html_extract_json,
      keyword_context_json, suggested_schema_json, suggested_subtopics_json,
      score_breakdown_json, overall_score, score_status, issue_count,
      critical_high_issue_count, lifecycle_status, analyzed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    record.tenantId,
    record.projectId,
    record.analysisRunId,
    record.crawlId,
    record.crawlUrlId,
    record.url,
    record.slug,
    record.pageType,
    record.statusCode,
    record.indexability,
    record.canonicalUrl,
    record.canonicalStatus,
    record.title,
    record.metaDescription,
    record.h1,
    JSON.stringify(record.htmlExtract),
    JSON.stringify(record.keywordContext),
    JSON.stringify(record.suggestedSchemaTypes),
    JSON.stringify(record.suggestedSubtopics),
    JSON.stringify(record.scoreBreakdown),
    record.overallScore,
    record.scoreStatus,
    record.issueCount,
    record.criticalHighIssueCount,
    record.lifecycleStatus,
    record.analyzedAt,
    record.updatedAt,
  );
  return { ...record, id };
}

export function listPageAnalysesInDb(
  tenantId: string,
  projectId: string,
): OnPagePageAnalysisRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_page_analyses
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY critical_high_issue_count DESC, COALESCE(overall_score, 999) ASC, url ASC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapPageRow);
}

export function getPageAnalysisByIdInDb(
  tenantId: string,
  projectId: string,
  pageAnalysisId: string,
): OnPagePageAnalysisRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM onpage_page_analyses
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, pageAnalysisId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapPageRow(row) : null;
}

export function updatePageLifecycleInDb(params: {
  tenantId: string;
  projectId: string;
  pageAnalysisId: string;
  lifecycleStatus: OnPageLifecycleStatus;
  updatedAt: string;
}): void {
  const db = getAuditDb();
  db.prepare(
    `UPDATE onpage_page_analyses
     SET lifecycle_status = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    params.lifecycleStatus,
    params.updatedAt,
    params.tenantId,
    params.projectId,
    params.pageAnalysisId,
  );
}

// ---------------------------------------------------------------------------
// Deduplicated On-Page Issues
// ---------------------------------------------------------------------------

export function upsertDeduplicatedIssueInDb(params: {
  tenantId: string;
  projectId: string;
  analysisRunId: string;
  pageAnalysisId: string;
  pageUrl: string;
  issueKey: string;
  category: OnPageIssueCategory;
  severity: OnPageIssueSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  evidence: OnPageEvidenceRef[];
  now: string;
}): OnPageIssueRecord {
  const db = getAuditDb();
  const existing = db
    .prepare(
      `SELECT * FROM onpage_issues
       WHERE tenant_id = ? AND project_id = ? AND page_url = ? AND issue_key = ?`,
    )
    .get(params.tenantId, params.projectId, params.pageUrl, params.issueKey) as
    | Record<string, unknown>
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE onpage_issues
       SET analysis_run_id = ?, page_analysis_id = ?, category = ?, severity = ?,
           title = ?, description = ?, recommended_action = ?, evidence_json = ?,
           last_detected_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    ).run(
      params.analysisRunId,
      params.pageAnalysisId,
      params.category,
      params.severity,
      params.title,
      params.description,
      params.recommendedAction,
      JSON.stringify(params.evidence),
      params.now,
      params.now,
      String(existing.id),
      params.tenantId,
    );
    const updated = db
      .prepare('SELECT * FROM onpage_issues WHERE id = ? AND tenant_id = ?')
      .get(String(existing.id), params.tenantId) as Record<string, unknown>;
    return mapIssueRow(updated);
  }

  const id = `onpage_iss_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_issues (
      id, tenant_id, project_id, analysis_run_id, page_analysis_id, page_url,
      issue_key, category, severity, title, description, recommended_action,
      evidence_json, approval_status, lifecycle_status, linked_roadmap_item_id,
      linked_ticket_id, first_detected_at, last_detected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', 'detected', NULL, NULL, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.analysisRunId,
    params.pageAnalysisId,
    params.pageUrl,
    params.issueKey,
    params.category,
    params.severity,
    params.title,
    params.description,
    params.recommendedAction,
    JSON.stringify(params.evidence),
    params.now,
    params.now,
    params.now,
  );
  const inserted = db
    .prepare('SELECT * FROM onpage_issues WHERE id = ? AND tenant_id = ?')
    .get(id, params.tenantId) as Record<string, unknown>;
  return mapIssueRow(inserted);
}

export function listOnPageIssuesInDb(
  tenantId: string,
  projectId: string,
): OnPageIssueRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_issues
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY
         CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END ASC,
         last_detected_at DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapIssueRow);
}

export function getOnPageIssueByIdInDb(
  tenantId: string,
  projectId: string,
  issueId: string,
): OnPageIssueRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM onpage_issues
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, issueId) as Record<string, unknown> | undefined;
  return row ? mapIssueRow(row) : null;
}

export function updateOnPageIssueStateInDb(params: {
  tenantId: string;
  projectId: string;
  issueId: string;
  approvalStatus?: OnPageApprovalStatus;
  lifecycleStatus?: OnPageLifecycleStatus;
  linkedTicketId?: string | null;
  linkedRoadmapItemId?: string | null;
  updatedAt: string;
}): OnPageIssueRecord | null {
  const db = getAuditDb();
  const existing = getOnPageIssueByIdInDb(
    params.tenantId,
    params.projectId,
    params.issueId,
  );
  if (!existing) return null;

  db.prepare(
    `UPDATE onpage_issues
     SET approval_status = ?, lifecycle_status = ?, linked_ticket_id = ?,
         linked_roadmap_item_id = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ? AND project_id = ?`,
  ).run(
    params.approvalStatus ?? existing.approvalStatus,
    params.lifecycleStatus ?? existing.lifecycleStatus,
    params.linkedTicketId !== undefined ? params.linkedTicketId : existing.linkedTicketId,
    params.linkedRoadmapItemId !== undefined
      ? params.linkedRoadmapItemId
      : existing.linkedRoadmapItemId,
    params.updatedAt,
    params.issueId,
    params.tenantId,
    params.projectId,
  );
  return getOnPageIssueByIdInDb(params.tenantId, params.projectId, params.issueId);
}

// ---------------------------------------------------------------------------
// Recommendations (Deterministic + AI-generated)
// ---------------------------------------------------------------------------

export function upsertDeterministicRecommendationInDb(
  rec: Omit<OnPageRecommendationRecord, 'id'> & { id?: string },
): OnPageRecommendationRecord {
  const db = getAuditDb();
  const existing = db
    .prepare(
      `SELECT * FROM onpage_recommendations
       WHERE tenant_id = ? AND project_id = ? AND page_url = ?
         AND target_field = ? AND is_ai_generated = 0
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(rec.tenantId, rec.projectId, rec.pageUrl, rec.targetField) as
    | Record<string, unknown>
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE onpage_recommendations
       SET page_analysis_id = ?, current_value = ?, suggested_value = ?,
           reason = ?, related_keyword = ?, search_intent = ?, evidence_json = ?,
           confidence = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    ).run(
      rec.pageAnalysisId,
      rec.currentValue,
      rec.suggestedValue,
      rec.reason,
      rec.relatedKeyword,
      rec.searchIntent,
      JSON.stringify(rec.evidence),
      rec.confidence,
      rec.updatedAt,
      String(existing.id),
      rec.tenantId,
    );
    const updated = db
      .prepare('SELECT * FROM onpage_recommendations WHERE id = ? AND tenant_id = ?')
      .get(String(existing.id), rec.tenantId) as Record<string, unknown>;
    return mapRecommendationRow(updated);
  }

  return insertRecommendationInDb(rec);
}

export function insertRecommendationInDb(
  rec: Omit<OnPageRecommendationRecord, 'id'> & { id?: string },
): OnPageRecommendationRecord {
  const db = getAuditDb();
  const id = rec.id ?? `onpage_rec_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_recommendations (
      id, tenant_id, project_id, page_analysis_id, page_url, target_field,
      current_value, suggested_value, reason, related_keyword, search_intent,
      evidence_json, confidence, is_ai_generated, ai_model, provider_usage_event_id,
      approval_status, approved_by, approved_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    rec.tenantId,
    rec.projectId,
    rec.pageAnalysisId,
    rec.pageUrl,
    rec.targetField,
    rec.currentValue,
    rec.suggestedValue,
    rec.reason,
    rec.relatedKeyword,
    rec.searchIntent,
    JSON.stringify(rec.evidence),
    rec.confidence,
    rec.isAiGenerated ? 1 : 0,
    rec.aiModel,
    rec.providerUsageEventId,
    rec.approvalStatus,
    rec.approvedBy,
    rec.approvedAt,
    rec.createdBy,
    rec.createdAt,
    rec.updatedAt,
  );
  return { ...rec, id };
}

export function listRecommendationsInDb(
  tenantId: string,
  projectId: string,
): OnPageRecommendationRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_recommendations
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY is_ai_generated DESC, updated_at DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapRecommendationRow);
}

export function getRecommendationByIdInDb(
  tenantId: string,
  projectId: string,
  recommendationId: string,
): OnPageRecommendationRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM onpage_recommendations
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, recommendationId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRecommendationRow(row) : null;
}

export function updateRecommendationApprovalInDb(params: {
  tenantId: string;
  projectId: string;
  recommendationId: string;
  approvalStatus: OnPageApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
}): OnPageRecommendationRecord | null {
  const db = getAuditDb();
  db.prepare(
    `UPDATE onpage_recommendations
     SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    params.approvalStatus,
    params.approvedBy,
    params.approvedAt,
    params.updatedAt,
    params.tenantId,
    params.projectId,
    params.recommendationId,
  );
  return getRecommendationByIdInDb(
    params.tenantId,
    params.projectId,
    params.recommendationId,
  );
}

// ---------------------------------------------------------------------------
// Versioned Optimization Drafts
// ---------------------------------------------------------------------------

export function insertOptimizationDraftInDb(
  draft: Omit<OnPageOptimizationDraftRecord, 'id' | 'versionNumber'> & {
    id?: string;
    versionNumber?: number;
  },
): OnPageOptimizationDraftRecord {
  const db = getAuditDb();
  const maxRow = db
    .prepare(
      `SELECT MAX(version_number) AS max_ver FROM onpage_optimization_drafts
       WHERE tenant_id = ? AND project_id = ? AND page_url = ?`,
    )
    .get(draft.tenantId, draft.projectId, draft.pageUrl) as
    | { max_ver: number | null }
    | undefined;
  const versionNumber = draft.versionNumber ?? Number(maxRow?.max_ver ?? 0) + 1;
  const id = draft.id ?? `onpage_draft_${crypto.randomUUID().slice(0, 12)}`;

  db.prepare(
    `INSERT INTO onpage_optimization_drafts (
      id, tenant_id, project_id, page_analysis_id, page_url, version_number,
      original_snapshot_json, proposed_payload_json, change_summary,
      approval_status, lifecycle_status, applied_externally_at,
      applied_externally_by, applied_externally_channel, applied_external_note,
      verified_at, verified_crawl_id, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    draft.tenantId,
    draft.projectId,
    draft.pageAnalysisId,
    draft.pageUrl,
    versionNumber,
    JSON.stringify(draft.originalSnapshot),
    JSON.stringify(draft.proposed),
    draft.changeSummary,
    draft.approvalStatus,
    draft.lifecycleStatus,
    draft.appliedExternallyAt,
    draft.appliedExternallyBy,
    draft.appliedExternallyChannel,
    draft.appliedExternalNote,
    draft.verifiedAt,
    draft.verifiedCrawlId,
    draft.createdBy,
    draft.updatedBy,
    draft.createdAt,
    draft.updatedAt,
  );
  return { ...draft, id, versionNumber };
}

export function listOptimizationDraftsInDb(
  tenantId: string,
  projectId: string,
): OnPageOptimizationDraftRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_optimization_drafts
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY updated_at DESC, version_number DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapDraftRow);
}

export function getOptimizationDraftByIdInDb(
  tenantId: string,
  projectId: string,
  draftId: string,
): OnPageOptimizationDraftRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM onpage_optimization_drafts
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, draftId) as Record<string, unknown> | undefined;
  return row ? mapDraftRow(row) : null;
}

export function updateOptimizationDraftStateInDb(params: {
  tenantId: string;
  projectId: string;
  draftId: string;
  approvalStatus?: OnPageApprovalStatus;
  lifecycleStatus?: OnPageLifecycleStatus;
  appliedExternallyAt?: string | null;
  appliedExternallyBy?: string | null;
  appliedExternallyChannel?: string | null;
  appliedExternalNote?: string | null;
  verifiedAt?: string | null;
  verifiedCrawlId?: string | null;
  updatedBy: string;
  updatedAt: string;
}): OnPageOptimizationDraftRecord | null {
  const db = getAuditDb();
  const existing = getOptimizationDraftByIdInDb(
    params.tenantId,
    params.projectId,
    params.draftId,
  );
  if (!existing) return null;

  db.prepare(
    `UPDATE onpage_optimization_drafts
     SET approval_status = ?, lifecycle_status = ?,
         applied_externally_at = ?, applied_externally_by = ?,
         applied_externally_channel = ?, applied_external_note = ?,
         verified_at = ?, verified_crawl_id = ?,
         updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    params.approvalStatus ?? existing.approvalStatus,
    params.lifecycleStatus ?? existing.lifecycleStatus,
    params.appliedExternallyAt !== undefined
      ? params.appliedExternallyAt
      : existing.appliedExternallyAt,
    params.appliedExternallyBy !== undefined
      ? params.appliedExternallyBy
      : existing.appliedExternallyBy,
    params.appliedExternallyChannel !== undefined
      ? params.appliedExternallyChannel
      : existing.appliedExternallyChannel,
    params.appliedExternalNote !== undefined
      ? params.appliedExternalNote
      : existing.appliedExternalNote,
    params.verifiedAt !== undefined ? params.verifiedAt : existing.verifiedAt,
    params.verifiedCrawlId !== undefined
      ? params.verifiedCrawlId
      : existing.verifiedCrawlId,
    params.updatedBy,
    params.updatedAt,
    params.tenantId,
    params.projectId,
    params.draftId,
  );
  return getOptimizationDraftByIdInDb(
    params.tenantId,
    params.projectId,
    params.draftId,
  );
}

// ---------------------------------------------------------------------------
// Approval Records & Validation Records
// ---------------------------------------------------------------------------

export function insertOnPageApprovalInDb(
  record: Omit<OnPageApprovalRecord, 'id'> & { id?: string },
): OnPageApprovalRecord {
  const db = getAuditDb();
  const id = record.id ?? `onpage_apr_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_approval_records (
      id, tenant_id, project_id, entity_kind, entity_id, page_url, entity_label,
      previous_status, new_status, actor_id, actor_name, actor_role, comment, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    record.tenantId,
    record.projectId,
    record.entityKind,
    record.entityId,
    record.pageUrl,
    record.entityLabel,
    record.previousStatus,
    record.newStatus,
    record.actorId,
    record.actorName,
    record.actorRole,
    record.comment,
    record.timestamp,
  );
  return { ...record, id };
}

export function listOnPageApprovalsInDb(
  tenantId: string,
  projectId: string,
  limit = 100,
): OnPageApprovalRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_approval_records
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapApprovalRow);
}

export function insertOnPageValidationInDb(
  record: Omit<OnPageValidationRecord, 'id'> & { id?: string },
): OnPageValidationRecord {
  const db = getAuditDb();
  const id = record.id ?? `onpage_val_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO onpage_validation_records (
      id, tenant_id, project_id, draft_id, page_url, crawl_id,
      verification_status, matched_checks_count, total_checks_count,
      diffs_json, summary, validated_by, validated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    record.tenantId,
    record.projectId,
    record.draftId,
    record.pageUrl,
    record.crawlId,
    record.verificationStatus,
    record.matchedChecksCount,
    record.totalChecksCount,
    JSON.stringify(record.diffs),
    record.summary,
    record.validatedBy,
    record.validatedAt,
  );
  return { ...record, id };
}

export function listOnPageValidationsInDb(
  tenantId: string,
  projectId: string,
  limit = 100,
): OnPageValidationRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM onpage_validation_records
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY validated_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapValidationRow);
}

// ---------------------------------------------------------------------------
// CMS Connections (Encrypted credentials, never plaintext in API output)
// ---------------------------------------------------------------------------

export function upsertCmsConnectionInDb(params: {
  tenantId: string;
  projectId: string;
  platform: CmsPlatform;
  displayName: string;
  siteUrl: string;
  status: CmsConnectionStatus;
  encryptedCredentialsJson: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  createdBy: string;
  updatedAt: string;
}): CmsConnectionRecord {
  const db = getAuditDb();
  const existing = db
    .prepare(
      `SELECT id FROM cms_connection_records
       WHERE tenant_id = ? AND project_id = ? AND platform = ?`,
    )
    .get(params.tenantId, params.projectId, params.platform) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE cms_connection_records
       SET display_name = ?, site_url = ?, status = ?,
           encrypted_credentials_json = ?, last_tested_at = ?, last_error = ?,
           updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    ).run(
      params.displayName,
      params.siteUrl,
      params.status,
      params.encryptedCredentialsJson,
      params.lastTestedAt,
      params.lastError,
      params.updatedAt,
      existing.id,
      params.tenantId,
    );
    const updated = db
      .prepare('SELECT * FROM cms_connection_records WHERE id = ? AND tenant_id = ?')
      .get(existing.id, params.tenantId) as Record<string, unknown>;
    return mapCmsConnectionRow(updated);
  }

  const id = `cms_conn_${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO cms_connection_records (
      id, tenant_id, project_id, platform, display_name, site_url, status,
      encrypted_credentials_json, last_tested_at, last_error, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.platform,
    params.displayName,
    params.siteUrl,
    params.status,
    params.encryptedCredentialsJson,
    params.lastTestedAt,
    params.lastError,
    params.createdBy,
    params.updatedAt,
  );
  const inserted = db
    .prepare('SELECT * FROM cms_connection_records WHERE id = ? AND tenant_id = ?')
    .get(id, params.tenantId) as Record<string, unknown>;
  return mapCmsConnectionRow(inserted);
}

export function listCmsConnectionsInDb(
  tenantId: string,
  projectId: string,
): CmsConnectionRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM cms_connection_records
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY platform ASC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapCmsConnectionRow);
}

export function deleteCmsConnectionInDb(
  tenantId: string,
  projectId: string,
  platform: CmsPlatform,
): boolean {
  const db = getAuditDb();
  const res = db
    .prepare(
      `DELETE FROM cms_connection_records
       WHERE tenant_id = ? AND project_id = ? AND platform = ?`,
    )
    .run(tenantId, projectId, platform);
  return res.changes > 0;
}
