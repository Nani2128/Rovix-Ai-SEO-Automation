import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle ORM SQLite schema for SEO Module 7: Strategy & Website Architecture Engine.
 * Mirrors migration `012_module7_seo_strategy_architecture` in `src/server/audit/db.ts`.
 */

export const seoStrategyVersions = sqliteTable(
  'seo_strategy_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    targetAudience: text('target_audience').notNull().default(''),
    evidenceReadinessJson: text('evidence_readiness_json').notNull().default('{}'),
    missingEvidenceJson: text('missing_evidence_json').notNull().default('[]'),
    strategyPayloadJson: text('strategy_payload_json').notNull().default('{}'),
    sourceWorkflowId: text('source_workflow_id'),
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_strategy_version_proj_num').on(
      table.tenantId,
      table.projectId,
      table.versionNumber,
    ),
    index('idx_strategy_versions_proj').on(
      table.tenantId,
      table.projectId,
      table.versionNumber,
    ),
  ],
);

export const seoStrategyObjectives = sqliteTable(
  'seo_strategy_objectives',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    category: text('category').notNull(),
    source: text('source').notNull(),
    confidence: text('confidence').notNull(),
    needsResearch: integer('needs_research', { mode: 'boolean' })
      .notNull()
      .default(false),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_strategy_obj_ver').on(
      table.tenantId,
      table.projectId,
      table.strategyVersionId,
    ),
  ],
);

export const siteArchitecturePages = sqliteTable(
  'site_architecture_pages',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    parentPageId: text('parent_page_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    proposedUrl: text('proposed_url').notNull(),
    existingUrl: text('existing_url'),
    pageType: text('page_type').notNull().default('resource'),
    primaryKeyword: text('primary_keyword'),
    secondaryKeywordsJson: text('secondary_keywords_json').notNull().default('[]'),
    relatedKeywordsJson: text('related_keywords_json').notNull().default('[]'),
    searchIntent: text('search_intent').notNull().default('Informational'),
    clusterId: text('cluster_id'),
    clusterName: text('cluster_name'),
    targetGeography: text('target_geography'),
    pageStatus: text('page_status').notNull().default('proposed'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    mappingApprovalStatus: text('mapping_approval_status')
      .notNull()
      .default('pending_review'),
    confidence: text('confidence').notNull().default('Medium'),
    rationale: text('rationale').notNull().default(''),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    notes: text('notes').notNull().default(''),
    archivedAt: text('archived_at'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_arch_pages_ver').on(
      table.tenantId,
      table.projectId,
      table.strategyVersionId,
      table.sortOrder,
    ),
  ],
);

export const internalLinkRecommendations = sqliteTable(
  'internal_link_recommendations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    sourcePageId: text('source_page_id'),
    sourceUrl: text('source_url').notNull(),
    sourceTitle: text('source_title').notNull(),
    targetPageId: text('target_page_id'),
    targetUrl: text('target_url').notNull(),
    targetTitle: text('target_title').notNull(),
    suggestedAnchorText: text('suggested_anchor_text').notNull(),
    linkCategory: text('link_category').notNull(),
    existsInCrawl: integer('exists_in_crawl', { mode: 'boolean' })
      .notNull()
      .default(false),
    currentInboundCount: integer('current_inbound_count'),
    reason: text('reason').notNull(),
    confidence: text('confidence').notNull().default('Medium'),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_internal_links_ver').on(
      table.tenantId,
      table.projectId,
      table.strategyVersionId,
    ),
  ],
);

export const topicalClusters = sqliteTable(
  'topical_clusters',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    pillarTopic: text('pillar_topic').notNull(),
    supportingSubtopicsJson: text('supporting_subtopics_json').notNull().default('[]'),
    coverageClassification: text('coverage_classification').notNull(),
    verifiedPageUrlsJson: text('verified_page_urls_json').notNull().default('[]'),
    missingOpportunitiesJson: text('missing_opportunities_json').notNull().default('[]'),
    competitorGapIdsJson: text('competitor_gap_ids_json').notNull().default('[]'),
    keywordClusterId: text('keyword_cluster_id'),
    linkedPageIdsJson: text('linked_page_ids_json').notNull().default('[]'),
    priorityScore: integer('priority_score'),
    confidence: text('confidence').notNull().default('Medium'),
    evidenceSummary: text('evidence_summary').notNull().default(''),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_topical_clusters_ver').on(
      table.tenantId,
      table.projectId,
      table.strategyVersionId,
    ),
  ],
);

export const seoRoadmapItems = sqliteTable(
  'seo_roadmap_items',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    relatedPageId: text('related_page_id'),
    relatedUrl: text('related_url'),
    relatedKeyword: text('related_keyword'),
    businessImpactRationale: text('business_impact_rationale').notNull(),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    priority: text('priority').notNull(),
    priorityScore: integer('priority_score'),
    scoreBreakdownJson: text('score_breakdown_json').notNull().default('{}'),
    dependenciesJson: text('dependencies_json').notNull().default('[]'),
    estimatedEffort: text('estimated_effort').notNull(),
    responsibleRole: text('responsible_role').notNull(),
    recommendedAgentId: text('recommended_agent_id'),
    approvalStatus: text('approval_status').notNull().default('pending_review'),
    implementationStatus: text('implementation_status')
      .notNull()
      .default('not_started'),
    linkedTicketId: text('linked_ticket_id'),
    linkedWorkflowId: text('linked_workflow_id'),
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_roadmap_items_ver').on(
      table.tenantId,
      table.projectId,
      table.strategyVersionId,
    ),
  ],
);

export const strategyApprovalRecords = sqliteTable(
  'strategy_approval_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    strategyVersionId: text('strategy_version_id')
      .notNull()
      .references(() => seoStrategyVersions.id, { onDelete: 'cascade' }),
    entityKind: text('entity_kind').notNull(),
    entityId: text('entity_id').notNull(),
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
    index('idx_strategy_approvals_proj').on(
      table.tenantId,
      table.projectId,
      table.timestamp,
    ),
  ],
);
