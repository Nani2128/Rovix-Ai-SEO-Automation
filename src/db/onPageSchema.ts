import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const onpageAnalysisRuns = sqliteTable(
  'onpage_analysis_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    crawlId: text('crawl_id'),
    strategyVersionId: text('strategy_version_id'),
    status: text('status').notNull().default('completed'),
    pagesAnalyzedCount: integer('pages_analyzed_count').notNull().default(0),
    issuesDetectedCount: integer('issues_detected_count').notNull().default(0),
    unavailableEvidencePagesCount: integer('unavailable_evidence_pages_count')
      .notNull()
      .default(0),
    triggeredBy: text('triggered_by').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    summaryNote: text('summary_note').notNull().default(''),
  },
  (table) => [
    index('idx_onpage_runs_proj').on(
      table.tenantId,
      table.projectId,
      table.startedAt,
    ),
  ],
);

export const onpagePageAnalyses = sqliteTable(
  'onpage_page_analyses',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    analysisRunId: text('analysis_run_id').notNull(),
    crawlId: text('crawl_id').notNull(),
    crawlUrlId: text('crawl_url_id').notNull(),
    url: text('url').notNull(),
    slug: text('slug').notNull(),
    pageType: text('page_type').notNull().default('resource'),
    statusCode: integer('status_code').notNull().default(200),
    indexability: text('indexability').notNull().default('Indexable'),
    canonicalUrl: text('canonical_url'),
    canonicalStatus: text('canonical_status').notNull().default('missing'),
    title: text('title'),
    metaDescription: text('meta_description'),
    h1: text('h1'),
    htmlExtractJson: text('html_extract_json').notNull(),
    keywordContextJson: text('keyword_context_json').notNull(),
    suggestedSchemaJson: text('suggested_schema_json').notNull().default('[]'),
    suggestedSubtopicsJson: text('suggested_subtopics_json').notNull().default('[]'),
    scoreBreakdownJson: text('score_breakdown_json').notNull(),
    overallScore: integer('overall_score'),
    scoreStatus: text('score_status').notNull().default('insufficient_evidence'),
    issueCount: integer('issue_count').notNull().default(0),
    criticalHighIssueCount: integer('critical_high_issue_count').notNull().default(0),
    lifecycleStatus: text('lifecycle_status').notNull().default('detected'),
    analyzedAt: text('analyzed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_onpage_page_proj_url').on(
      table.tenantId,
      table.projectId,
      table.url,
    ),
    index('idx_onpage_pages_run').on(
      table.tenantId,
      table.projectId,
      table.analysisRunId,
    ),
  ],
);

export const onpageIssues = sqliteTable(
  'onpage_issues',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    analysisRunId: text('analysis_run_id').notNull(),
    pageAnalysisId: text('page_analysis_id').notNull(),
    pageUrl: text('page_url').notNull(),
    issueKey: text('issue_key').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    lifecycleStatus: text('lifecycle_status').notNull().default('detected'),
    linkedRoadmapItemId: text('linked_roadmap_item_id'),
    linkedTicketId: text('linked_ticket_id'),
    firstDetectedAt: text('first_detected_at').notNull(),
    lastDetectedAt: text('last_detected_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_onpage_issue_dedup').on(
      table.tenantId,
      table.projectId,
      table.pageUrl,
      table.issueKey,
    ),
    index('idx_onpage_issues_proj').on(table.tenantId, table.projectId),
  ],
);

export const onpageRecommendations = sqliteTable(
  'onpage_recommendations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    pageAnalysisId: text('page_analysis_id').notNull(),
    pageUrl: text('page_url').notNull(),
    targetField: text('target_field').notNull(),
    currentValue: text('current_value').notNull(),
    suggestedValue: text('suggested_value').notNull(),
    reason: text('reason').notNull(),
    relatedKeyword: text('related_keyword'),
    searchIntent: text('search_intent'),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    confidence: text('confidence').notNull().default('Medium'),
    isAiGenerated: integer('is_ai_generated').notNull().default(0),
    aiModel: text('ai_model'),
    providerUsageEventId: text('provider_usage_event_id'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_onpage_recs_proj').on(
      table.tenantId,
      table.projectId,
      table.pageAnalysisId,
    ),
  ],
);

export const onpageOptimizationDrafts = sqliteTable(
  'onpage_optimization_drafts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    pageAnalysisId: text('page_analysis_id').notNull(),
    pageUrl: text('page_url').notNull(),
    versionNumber: integer('version_number').notNull().default(1),
    originalSnapshotJson: text('original_snapshot_json').notNull(),
    proposedPayloadJson: text('proposed_payload_json').notNull(),
    changeSummary: text('change_summary').notNull().default(''),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    lifecycleStatus: text('lifecycle_status').notNull().default('draft_ready'),
    appliedExternallyAt: text('applied_externally_at'),
    appliedExternallyBy: text('applied_externally_by'),
    appliedExternallyChannel: text('applied_externally_channel'),
    appliedExternalNote: text('applied_external_note'),
    verifiedAt: text('verified_at'),
    verifiedCrawlId: text('verified_crawl_id'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_onpage_drafts_proj').on(
      table.tenantId,
      table.projectId,
      table.pageUrl,
      table.versionNumber,
    ),
  ],
);

export const onpageApprovalRecords = sqliteTable(
  'onpage_approval_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    entityKind: text('entity_kind').notNull(),
    entityId: text('entity_id').notNull(),
    pageUrl: text('page_url').notNull(),
    entityLabel: text('entity_label').notNull(),
    previousStatus: text('previous_status').notNull(),
    newStatus: text('new_status').notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    comment: text('comment').notNull().default(''),
    timestamp: text('timestamp').notNull(),
  },
  (table) => [
    index('idx_onpage_approvals_proj').on(
      table.tenantId,
      table.projectId,
      table.timestamp,
    ),
  ],
);

export const onpageValidationRecords = sqliteTable(
  'onpage_validation_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    draftId: text('draft_id').notNull(),
    pageUrl: text('page_url').notNull(),
    crawlId: text('crawl_id').notNull(),
    verificationStatus: text('verification_status').notNull(),
    matchedChecksCount: integer('matched_checks_count').notNull().default(0),
    totalChecksCount: integer('total_checks_count').notNull().default(0),
    diffsJson: text('diffs_json').notNull().default('[]'),
    summary: text('summary').notNull(),
    validatedBy: text('validated_by').notNull(),
    validatedAt: text('validated_at').notNull(),
  },
  (table) => [
    index('idx_onpage_validations_proj').on(
      table.tenantId,
      table.projectId,
      table.validatedAt,
    ),
  ],
);

export const cmsConnectionRecords = sqliteTable(
  'cms_connection_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    platform: text('platform').notNull(),
    displayName: text('display_name').notNull(),
    siteUrl: text('site_url').notNull(),
    status: text('status').notNull().default('not_configured'),
    encryptedCredentialsJson: text('encrypted_credentials_json'),
    lastTestedAt: text('last_tested_at'),
    lastError: text('last_error'),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_cms_conn_proj_platform').on(
      table.tenantId,
      table.projectId,
      table.platform,
    ),
  ],
);
