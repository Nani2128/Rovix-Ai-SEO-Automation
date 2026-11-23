import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDataRoot, getDbFilePath } from '../env';
import type { AuditTrailEntry } from '../../types/audit';
import type { Tenant, User, UserRole } from '../../types/auth';
import type {
  CrawlConfigurationData,
  CrawlEventRecord,
  CrawlJobState,
  CrawlRun,
  CrawlRunSummary,
  CrawlURLRecord,
  ProjectDomainVerification,
  SitemapAnalysisSummary,
} from '../../types/crawl';
import type {
  ActivityEvent,
  ApprovalStatus,
  KeywordIntent,
  KeywordOpportunity,
  OpportunityTier,
  Project,
} from '../../types/dashboard';
import { publishTenantActivityUpdate } from '../activity/activityBus';
import type {
  IntegrationConnectionStatus,
  IntegrationProviderId,
  OAuthIntegrationRecord,
  SyncJobRecord,
} from '../../types/integrations';
import type {
  DeveloperTicket,
  IssueEvidence,
  TechnicalIssue,
  VerificationRun,
} from '../../types/technicalIssue';
import type {
  PerformanceAuditRun,
  PerformanceAuditStatus,
  PerformanceFinding,
  PerformanceRunStrategyMode,
  PerformanceStrategy,
  PerformanceUrlMeasurement,
} from '../../types/performance';
import type {
  CannibalizationAlert,
  CrawledPageOption,
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordEvidenceItem,
  KeywordIntelligenceRecord,
  KeywordMappingStatus,
  KeywordResearchRun,
  KeywordSourceType,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
  OpportunityScoreBreakdown,
  ProviderAvailabilityStatus,
} from '../../types/keywords';
import type {
  GeoApprovalHistoryEntry,
  GeoDataProvenance,
  GeoGranularity,
  GeoMappingStatus,
  GeoMarketApprovalStatus,
  GeoMarketPriority,
  GeoMeasurementRecord,
  GeoProviderStatus,
  GeoResearchRun,
  GeoTargetMarket,
  GeoUrlMappingRecord,
} from '../../types/geographic';
import type {
  CompetitorApprovalHistoryEntry,
  CompetitorApprovalStatus,
  CompetitorAuditTrailItem,
  CompetitorCategory,
  CompetitorDataProvenance,
  CompetitorDiscoveryOrigin,
  CompetitorKeywordOverlapRow,
  CompetitorPageSnapshot,
  CompetitorProfileRecord,
  CompetitorProviderStatus,
  CompetitorResearchRun,
  ContentGapBriefPlan,
  ContentGapRecommendation,
  ContentGapType,
  ContentGapWorkflowState,
  KeywordOverlapType,
  ProjectCrawledContentSummary,
} from '../../types/competitors';
import { SANDBOX_HOST } from './security';

let dbInstance: DatabaseSync | null = null;

function getObjectsDir(): string {
  return path.join(getDataRoot(), 'objects');
}

function ensureStorageDirs(): void {
  fs.mkdirSync(getDataRoot(), { recursive: true });
  fs.mkdirSync(getObjectsDir(), { recursive: true });
}

export function getOrCreateSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  ensureStorageDirs();
  const secretPath = path.join(getDataRoot(), 'session.secret');
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export function saveObjectSnapshot(
  tenantId: string,
  key: string,
  content: string,
): string {
  ensureStorageDirs();
  const objectsDir = getObjectsDir();
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tenantDir = path.join(objectsDir, safeTenant);
  fs.mkdirSync(tenantDir, { recursive: true });
  const filePath = path.join(tenantDir, `${safeKey}.txt`);
  fs.writeFileSync(filePath, content, 'utf8');
  return `obj://${safeTenant}/${safeKey}.txt`;
}

export function readObjectSnapshot(
  tenantId: string,
  objectRef: string | null,
): string | null {
  if (!objectRef || !objectRef.startsWith('obj://')) return null;
  const rel = objectRef.slice(6);
  const objectsDir = getObjectsDir();
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!rel.startsWith(`${safeTenant}/`)) return null;
  const target = path.resolve(objectsDir, rel);
  if (!target.startsWith(path.resolve(objectsDir, safeTenant))) return null;
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf8');
}

export function getAuditDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  ensureStorageDirs();
  const db = new DatabaseSync(getDbFilePath());
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function resetDbConnectionForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
  }
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied001 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('001_phase3_audit_schema') as { version: string } | undefined;

  if (!applied001) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_verifications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        canonical_domain TEXT NOT NULL,
        verification_method TEXT NOT NULL,
        verification_token TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        crawl_policy_approved INTEGER NOT NULL DEFAULT 0,
        verified_by TEXT,
        verified_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_proj_verif_tenant ON project_verifications(tenant_id, project_id);

      CREATE TABLE IF NOT EXISTS crawl_configurations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        config_json TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS crawl_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        crawl_type TEXT NOT NULL DEFAULT 'full',
        configuration_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        discovered_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT NOT NULL,
        robots_snapshot_ref TEXT,
        sitemap_summary_json TEXT,
        triggered_by TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_runs_tenant_proj ON crawl_runs(tenant_id, project_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_runs_status ON crawl_runs(status);

      CREATE TABLE IF NOT EXISTS crawl_urls (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        crawl_id TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        requested_url TEXT NOT NULL,
        final_url TEXT NOT NULL,
        parent_url TEXT,
        discovery_source TEXT NOT NULL,
        redirect_chain_json TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        response_time_ms INTEGER NOT NULL,
        depth INTEGER NOT NULL,
        indexability TEXT NOT NULL,
        indexability_reason TEXT NOT NULL,
        canonical_url TEXT,
        canonical_status TEXT NOT NULL,
        title TEXT,
        meta_description TEXT,
        h1 TEXT,
        headings_json TEXT NOT NULL,
        robots_directives_json TEXT NOT NULL,
        x_robots_tag TEXT,
        schema_types_json TEXT NOT NULL,
        schema_errors_json TEXT NOT NULL,
        hreflang_json TEXT NOT NULL,
        internal_links_json TEXT NOT NULL,
        external_links_json TEXT NOT NULL,
        missing_alt_count INTEGER NOT NULL DEFAULT 0,
        has_viewport INTEGER NOT NULL DEFAULT 1,
        html_lang TEXT,
        in_sitemap INTEGER NOT NULL DEFAULT 0,
        issue_count INTEGER NOT NULL DEFAULT 0,
        rendering_source TEXT NOT NULL DEFAULT 'raw_html',
        rendered_diff_json TEXT,
        raw_html_object_ref TEXT,
        rendered_dom_object_ref TEXT,
        fetched_at TEXT NOT NULL,
        UNIQUE(crawl_id, normalized_url)
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_urls_crawl ON crawl_urls(tenant_id, crawl_id, status_code);
      CREATE INDEX IF NOT EXISTS idx_crawl_urls_norm ON crawl_urls(crawl_id, normalized_url);

      CREATE TABLE IF NOT EXISTS crawl_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        crawl_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_payload_json TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_events_crawl ON crawl_events(tenant_id, crawl_id, timestamp);

      CREATE TABLE IF NOT EXISTS technical_issues (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        last_crawl_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        root_cause_key TEXT NOT NULL,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL,
        impact TEXT NOT NULL,
        recommended_fix TEXT NOT NULL,
        responsible_role TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence REAL NOT NULL,
        affected_url_count INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT,
        UNIQUE(tenant_id, project_id, root_cause_key)
      );
      CREATE INDEX IF NOT EXISTS idx_issues_tenant_proj ON technical_issues(tenant_id, project_id, severity, status);

      CREATE TABLE IF NOT EXISTS issue_evidence (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        crawl_id TEXT NOT NULL,
        url_id TEXT,
        url TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        source TEXT NOT NULL,
        snippet TEXT NOT NULL,
        details_json TEXT NOT NULL,
        evidence_reference TEXT,
        captured_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_issue ON issue_evidence(tenant_id, issue_id, crawl_id);

      CREATE TABLE IF NOT EXISTS developer_tickets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        responsible_role TEXT NOT NULL,
        assigned_user TEXT,
        task_status TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        requires_dual_approval INTEGER NOT NULL DEFAULT 0,
        developer_approved_by TEXT,
        lead_approved_by TEXT,
        verification_status TEXT NOT NULL DEFAULT 'Pending',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_issue ON developer_tickets(tenant_id, issue_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_proj ON developer_tickets(tenant_id, project_id);

      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        previous_crawl_id TEXT NOT NULL,
        verification_crawl_id TEXT NOT NULL,
        result TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verif_issue ON verification_runs(tenant_id, issue_id, verified_at DESC);

      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        previous_state TEXT NOT NULL,
        new_state TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence_reference TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant ON audit_trail(tenant_id, entity_id, timestamp DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '001_phase3_audit_schema',
      new Date().toISOString(),
    );
  }

  const applied002 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('002_phase5_real_data_and_integrations') as { version: string } | undefined;

  if (!applied002) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'Growth',
        primary_domain TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        avatar_initials TEXT NOT NULL,
        title TEXT NOT NULL,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        website TEXT NOT NULL,
        target_markets_json TEXT NOT NULL DEFAULT '[]',
        owner TEXT NOT NULL,
        current_milestone TEXT NOT NULL DEFAULT 'Initial Domain Setup',
        next_action TEXT NOT NULL DEFAULT 'Verify domain ownership and run baseline crawl',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id, deleted_at, updated_at DESC);

      CREATE TABLE IF NOT EXISTS oauth_integrations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        account_email TEXT,
        property_id TEXT,
        property_name TEXT,
        scopes_json TEXT NOT NULL DEFAULT '[]',
        encrypted_tokens_json TEXT,
        status TEXT NOT NULL DEFAULT 'Not Connected',
        last_error TEXT,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_tenant_proj ON oauth_integrations(tenant_id, project_id);

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        dedupe_key TEXT NOT NULL,
        records_synced INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant ON sync_jobs(tenant_id, project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status, dedupe_key);

      CREATE TABLE IF NOT EXISTS gsc_daily_metrics (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        metric_date TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        impressions INTEGER NOT NULL DEFAULT 0,
        ctr REAL NOT NULL DEFAULT 0,
        avg_position REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, project_id, metric_date)
      );

      CREATE TABLE IF NOT EXISTS gsc_query_metrics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        query TEXT NOT NULL,
        page TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        impressions INTEGER NOT NULL DEFAULT 0,
        ctr REAL NOT NULL DEFAULT 0,
        avg_position REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, query, page)
      );
      CREATE INDEX IF NOT EXISTS idx_gsc_queries_proj ON gsc_query_metrics(tenant_id, project_id, clicks DESC);

      CREATE TABLE IF NOT EXISTS ga4_daily_metrics (
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        metric_date TEXT NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 0,
        active_users INTEGER NOT NULL DEFAULT 0,
        key_events INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, project_id, metric_date)
      );

      CREATE TABLE IF NOT EXISTS ga4_landing_metrics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        landing_page TEXT NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 0,
        active_users INTEGER NOT NULL DEFAULT 0,
        key_events INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, landing_page)
      );

      CREATE TABLE IF NOT EXISTS keyword_opportunities (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        intent TEXT NOT NULL DEFAULT 'Informational',
        target_market TEXT NOT NULL DEFAULT 'Global',
        search_volume INTEGER,
        target_url TEXT NOT NULL,
        opportunity TEXT NOT NULL DEFAULT 'Medium',
        approval_status TEXT NOT NULL DEFAULT 'Pending',
        difficulty INTEGER,
        current_position REAL,
        clicks INTEGER,
        impressions INTEGER,
        source_provider TEXT NOT NULL DEFAULT 'manual',
        rationale TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, keyword)
      );
      CREATE INDEX IF NOT EXISTS idx_kw_tenant_proj ON keyword_opportunities(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS system_activity_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence_url TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_tenant ON system_activity_events(tenant_id, created_at DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '002_phase5_real_data_and_integrations',
      new Date().toISOString(),
    );
  }

  const applied003 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('003_phase6_performance_intelligence') as { version: string } | undefined;

  if (!applied003) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS performance_audit_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        source_crawl_id TEXT,
        strategy_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        target_urls_json TEXT NOT NULL,
        total_checks INTEGER NOT NULL DEFAULT 0,
        completed_checks INTEGER NOT NULL DEFAULT 0,
        failed_checks INTEGER NOT NULL DEFAULT 0,
        error_summary TEXT,
        avg_mobile_score REAL,
        avg_desktop_score REAL,
        triggered_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_perf_runs_tenant_proj
        ON performance_audit_runs(tenant_id, project_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS performance_measurements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        audit_run_id TEXT NOT NULL,
        url TEXT NOT NULL,
        strategy TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        raw_object_ref TEXT,
        provenance_json TEXT NOT NULL,
        lab_json TEXT NOT NULL,
        field_json TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        usability_json TEXT NOT NULL,
        diagnostics_json TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        UNIQUE(audit_run_id, url, strategy)
      );
      CREATE INDEX IF NOT EXISTS idx_perf_meas_tenant_run
        ON performance_measurements(tenant_id, audit_run_id, strategy);
      CREATE INDEX IF NOT EXISTS idx_perf_meas_tenant_proj
        ON performance_measurements(tenant_id, project_id, collected_at DESC);

      CREATE TABLE IF NOT EXISTS performance_findings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        audit_run_id TEXT NOT NULL,
        measurement_id TEXT NOT NULL,
        url TEXT NOT NULL,
        strategy TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        category TEXT NOT NULL,
        finding_kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        root_cause TEXT NOT NULL,
        explanation TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        recommended_solution TEXT NOT NULL,
        estimated_effort TEXT NOT NULL,
        affected_bytes INTEGER,
        affected_ms INTEGER,
        linked_issue_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_perf_findings_tenant_proj
        ON performance_findings(tenant_id, project_id, audit_run_id);
      CREATE INDEX IF NOT EXISTS idx_perf_findings_rule
        ON performance_findings(tenant_id, project_id, rule_id, strategy);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '003_phase6_performance_intelligence',
      new Date().toISOString(),
    );
  }

  const applied004 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('004_phase7_keyword_intelligence') as { version: string } | undefined;

  if (!applied004) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_keyword_profiles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        approved_niche TEXT NOT NULL DEFAULT '',
        approved_services_json TEXT NOT NULL DEFAULT '[]',
        target_audience TEXT NOT NULL DEFAULT '',
        target_country TEXT NOT NULL DEFAULT 'US',
        target_city TEXT NOT NULL DEFAULT '',
        target_language TEXT NOT NULL DEFAULT 'en',
        competitor_urls_json TEXT NOT NULL DEFAULT '[]',
        approval_status TEXT NOT NULL DEFAULT 'pending_owner_approval',
        approved_by TEXT,
        approved_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_kw_prof_tenant
        ON project_keyword_profiles(tenant_id, project_id);

      CREATE TABLE IF NOT EXISTS keyword_research_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        seed_terms_json TEXT NOT NULL,
        target_country TEXT NOT NULL,
        target_city TEXT NOT NULL DEFAULT '',
        target_language TEXT NOT NULL DEFAULT 'en',
        intent_focus TEXT NOT NULL DEFAULT 'all',
        competitor_urls_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        total_discovered INTEGER NOT NULL DEFAULT 0,
        total_clusters_created INTEGER NOT NULL DEFAULT 0,
        provider_statuses_json TEXT NOT NULL DEFAULT '[]',
        triggered_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_kw_runs_tenant_proj
        ON keyword_research_runs(tenant_id, project_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS keyword_clusters (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        cluster_name TEXT NOT NULL,
        core_topic TEXT NOT NULL,
        primary_keyword_id TEXT,
        primary_keyword TEXT NOT NULL,
        keyword_ids_json TEXT NOT NULL DEFAULT '[]',
        intent_distribution_json TEXT NOT NULL DEFAULT '{}',
        dominant_intent TEXT NOT NULL DEFAULT 'Informational',
        suggested_landing_url TEXT,
        recommended_page_type TEXT NOT NULL DEFAULT 'Service / Topic Page',
        content_gaps_json TEXT NOT NULL DEFAULT '[]',
        cohesion_score REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        evidence_summary TEXT NOT NULL DEFAULT '',
        approval_state TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        merged_into_cluster_id TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kw_clusters_tenant_proj
        ON keyword_clusters(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS keyword_intelligence_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        research_run_id TEXT,
        keyword TEXT NOT NULL,
        normalized_keyword TEXT NOT NULL,
        seed_topic TEXT,
        primary_source TEXT NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]',
        is_ai_suggestion INTEGER NOT NULL DEFAULT 0,
        intent TEXT NOT NULL DEFAULT 'Informational',
        intent_inferred INTEGER NOT NULL DEFAULT 1,
        intent_verified_by TEXT,
        intent_confidence REAL NOT NULL DEFAULT 0.65,
        intent_reason TEXT NOT NULL DEFAULT '',
        target_country TEXT NOT NULL DEFAULT 'US',
        target_city TEXT NOT NULL DEFAULT '',
        target_language TEXT NOT NULL DEFAULT 'en',
        metric_geography_scope TEXT NOT NULL DEFAULT 'global_unverified',
        market_search_volume INTEGER,
        volume_status TEXT NOT NULL DEFAULT 'unavailable',
        volume_source TEXT NOT NULL DEFAULT 'unavailable',
        competition_level TEXT NOT NULL DEFAULT 'unavailable',
        cpc_estimate REAL,
        relative_trend_index INTEGER,
        trend_direction TEXT NOT NULL DEFAULT 'unavailable',
        gsc_clicks INTEGER,
        gsc_impressions INTEGER,
        gsc_ctr REAL,
        gsc_avg_position REAL,
        gsc_observed_url TEXT,
        cluster_id TEXT,
        cluster_name TEXT,
        workflow_state TEXT NOT NULL DEFAULT 'discovered',
        assigned_to TEXT,
        strategist_notes TEXT NOT NULL DEFAULT '',
        score_breakdown_json TEXT NOT NULL,
        opportunity_score INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, normalized_keyword, target_country, target_language)
      );
      CREATE INDEX IF NOT EXISTS idx_kw_intel_tenant_proj
        ON keyword_intelligence_records(tenant_id, project_id, opportunity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_kw_intel_cluster
        ON keyword_intelligence_records(tenant_id, cluster_id);

      CREATE TABLE IF NOT EXISTS keyword_evidence_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        keyword_id TEXT NOT NULL,
        source_provider TEXT NOT NULL,
        source_type TEXT NOT NULL,
        measurement_kind TEXT NOT NULL,
        source_url TEXT,
        summary TEXT NOT NULL,
        raw_metric_value TEXT,
        geography_scope TEXT NOT NULL DEFAULT 'global',
        collected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kw_evidence_kw
        ON keyword_evidence_items(tenant_id, keyword_id, collected_at DESC);

      CREATE TABLE IF NOT EXISTS keyword_url_mappings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        keyword_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        target_url TEXT,
        mapping_status TEXT NOT NULL DEFAULT 'unmapped',
        recommended_slug TEXT,
        page_title TEXT,
        page_h1 TEXT,
        page_status_code INTEGER,
        page_indexable INTEGER,
        match_confidence REAL NOT NULL DEFAULT 0,
        cannibalization_risk TEXT NOT NULL DEFAULT 'none',
        competing_urls_json TEXT NOT NULL DEFAULT '[]',
        competing_keyword_ids_json TEXT NOT NULL DEFAULT '[]',
        resolution_recommendation TEXT,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, keyword_id)
      );
      CREATE INDEX IF NOT EXISTS idx_kw_map_tenant_proj
        ON keyword_url_mappings(tenant_id, project_id, target_url);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '004_phase7_keyword_intelligence',
      new Date().toISOString(),
    );
  }

  const applied005 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('005_phase8_geographic_intelligence') as { version: string } | undefined;

  if (!applied005) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS geo_target_markets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        granularity TEXT NOT NULL DEFAULT 'country',
        country_code TEXT NOT NULL,
        country_name TEXT NOT NULL,
        iso_numeric TEXT NOT NULL DEFAULT '',
        state_region TEXT NOT NULL DEFAULT '',
        state_fips TEXT,
        city TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT 'en',
        service_areas_json TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL DEFAULT 'secondary',
        approval_status TEXT NOT NULL DEFAULT 'pending_owner_approval',
        approved_by TEXT,
        approved_at TEXT,
        recommended_by TEXT,
        recommended_reason TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        approval_history_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, country_code, state_region, city, language)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_markets_tenant_proj
        ON geo_target_markets(tenant_id, project_id, priority, updated_at DESC);

      CREATE TABLE IF NOT EXISTS geo_measurements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        market_id TEXT,
        granularity TEXT NOT NULL,
        location_key TEXT NOT NULL,
        location_label TEXT NOT NULL,
        country_code TEXT NOT NULL,
        country_name TEXT NOT NULL,
        iso_numeric TEXT NOT NULL DEFAULT '',
        state_region TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        gsc_clicks INTEGER,
        gsc_impressions INTEGER,
        gsc_ctr REAL,
        gsc_avg_position REAL,
        gsc_granularity_note TEXT NOT NULL DEFAULT '',
        relative_trend_index INTEGER,
        trend_direction TEXT NOT NULL DEFAULT 'unavailable',
        trends_note TEXT NOT NULL DEFAULT '',
        gbp_locations_count INTEGER,
        gbp_visibility_note TEXT NOT NULL DEFAULT '',
        tracked_rank_position REAL,
        tracked_rank_provider TEXT,
        rank_tracking_note TEXT NOT NULL DEFAULT '',
        provenance_json TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, granularity, location_key)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_meas_tenant_proj
        ON geo_measurements(tenant_id, project_id, granularity, collected_at DESC);

      CREATE TABLE IF NOT EXISTS geo_url_mappings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        location_label TEXT NOT NULL,
        granularity TEXT NOT NULL,
        country_code TEXT NOT NULL,
        state_region TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        target_url TEXT,
        mapping_status TEXT NOT NULL DEFAULT 'unmapped',
        recommended_slug TEXT,
        page_title TEXT,
        page_h1 TEXT,
        page_status_code INTEGER,
        page_indexable INTEGER,
        duplicate_risk TEXT NOT NULL DEFAULT 'none',
        competing_urls_json TEXT NOT NULL DEFAULT '[]',
        doorway_risk_warning TEXT,
        resolution_recommendation TEXT,
        approval_state TEXT NOT NULL DEFAULT 'Pending',
        approved_by TEXT,
        approved_at TEXT,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, market_id)
      );
      CREATE INDEX IF NOT EXISTS idx_geo_map_tenant_proj
        ON geo_url_mappings(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS geo_research_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        target_country TEXT NOT NULL,
        target_state_region TEXT NOT NULL DEFAULT '',
        target_city TEXT NOT NULL DEFAULT '',
        target_language TEXT NOT NULL DEFAULT 'en',
        seed_terms_json TEXT NOT NULL DEFAULT '[]',
        intent_focus TEXT NOT NULL DEFAULT 'all',
        status TEXT NOT NULL,
        keywords_discovered INTEGER NOT NULL DEFAULT 0,
        measurements_collected INTEGER NOT NULL DEFAULT 0,
        opportunities_generated INTEGER NOT NULL DEFAULT 0,
        provider_statuses_json TEXT NOT NULL DEFAULT '[]',
        triggered_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_geo_runs_tenant_proj
        ON geo_research_runs(tenant_id, project_id, started_at DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '005_phase8_geographic_intelligence',
      new Date().toISOString(),
    );
  }

  const applied006 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('006_phase9_competitor_intelligence') as { version: string } | undefined;

  if (!applied006) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS competitors (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        homepage_url TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'direct',
        target_markets_json TEXT NOT NULL DEFAULT '[]',
        discovery_origin TEXT NOT NULL DEFAULT 'manual',
        discovery_evidence TEXT NOT NULL DEFAULT '',
        approval_status TEXT NOT NULL DEFAULT 'pending_owner_approval',
        approved_by TEXT,
        approved_at TEXT,
        recommended_by TEXT,
        notes TEXT NOT NULL DEFAULT '',
        last_analyzed_at TEXT,
        analyzed_pages_count INTEGER NOT NULL DEFAULT 0,
        external_domain_authority REAL,
        external_monthly_traffic INTEGER,
        external_backlinks_count INTEGER,
        provenance_json TEXT NOT NULL,
        approval_history_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, domain)
      );
      CREATE INDEX IF NOT EXISTS idx_competitors_tenant_proj
        ON competitors(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS competitor_pages (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        competitor_id TEXT NOT NULL,
        url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        response_time_ms INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        meta_description TEXT NOT NULL DEFAULT '',
        h1 TEXT NOT NULL DEFAULT '',
        headings_json TEXT NOT NULL DEFAULT '[]',
        word_count INTEGER NOT NULL DEFAULT 0,
        canonical_url TEXT,
        schema_types_json TEXT NOT NULL DEFAULT '[]',
        has_open_graph INTEGER NOT NULL DEFAULT 0,
        extracted_topics_json TEXT NOT NULL DEFAULT '[]',
        provenance_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, competitor_id, normalized_url)
      );
      CREATE INDEX IF NOT EXISTS idx_comp_pages_comp
        ON competitor_pages(tenant_id, project_id, competitor_id, fetched_at DESC);

      CREATE TABLE IF NOT EXISTS competitor_keyword_overlaps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        competitor_id TEXT NOT NULL,
        competitor_domain TEXT NOT NULL,
        keyword TEXT NOT NULL,
        intent TEXT NOT NULL DEFAULT 'Informational',
        target_country TEXT NOT NULL DEFAULT 'US',
        project_coverage_status TEXT NOT NULL DEFAULT 'missing',
        project_url TEXT,
        competitor_coverage_status TEXT NOT NULL DEFAULT 'covered_on_page',
        competitor_url TEXT,
        competitor_match_reason TEXT NOT NULL DEFAULT '',
        project_gsc_impressions INTEGER,
        project_gsc_clicks INTEGER,
        project_gsc_position REAL,
        competitor_serp_position REAL,
        external_search_volume INTEGER,
        overlap_type TEXT NOT NULL DEFAULT 'competitor_only_gap',
        provenance_json TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, competitor_id, keyword)
      );
      CREATE INDEX IF NOT EXISTS idx_comp_overlaps_proj
        ON competitor_keyword_overlaps(tenant_id, project_id, competitor_id);

      CREATE TABLE IF NOT EXISTS content_gaps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        competitor_id TEXT NOT NULL,
        competitor_domain TEXT NOT NULL,
        gap_type TEXT NOT NULL,
        topic_title TEXT NOT NULL,
        target_keyword TEXT NOT NULL,
        target_market TEXT NOT NULL DEFAULT 'Global',
        project_url TEXT,
        project_word_count INTEGER,
        project_title TEXT,
        project_h1 TEXT,
        project_schema_types_json TEXT NOT NULL DEFAULT '[]',
        competitor_url TEXT NOT NULL,
        competitor_word_count INTEGER,
        competitor_title TEXT,
        competitor_h1 TEXT,
        competitor_headings_json TEXT NOT NULL DEFAULT '[]',
        competitor_schema_types_json TEXT NOT NULL DEFAULT '[]',
        opportunity_score INTEGER,
        priority_tier TEXT NOT NULL DEFAULT 'Needs Evidence',
        confidence TEXT NOT NULL DEFAULT 'Low',
        explanation TEXT NOT NULL,
        supporting_evidence_json TEXT NOT NULL DEFAULT '[]',
        missing_info_json TEXT NOT NULL DEFAULT '[]',
        recommended_action TEXT NOT NULL,
        recommended_brief_json TEXT NOT NULL,
        workflow_state TEXT NOT NULL DEFAULT 'discovered',
        approved_by TEXT,
        approved_at TEXT,
        strategist_notes TEXT NOT NULL DEFAULT '',
        linked_ticket_id TEXT,
        linked_keyword_id TEXT,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, competitor_id, target_keyword, gap_type)
      );
      CREATE INDEX IF NOT EXISTS idx_content_gaps_proj
        ON content_gaps(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS competitor_research_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        competitor_id TEXT,
        competitor_domain TEXT NOT NULL,
        run_kind TEXT NOT NULL DEFAULT 'page_analysis',
        urls_scanned INTEGER NOT NULL DEFAULT 0,
        topics_extracted INTEGER NOT NULL DEFAULT 0,
        overlaps_found INTEGER NOT NULL DEFAULT 0,
        gaps_identified INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        provider_statuses_json TEXT NOT NULL DEFAULT '[]',
        error_summary TEXT,
        triggered_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_comp_runs_proj
        ON competitor_research_runs(tenant_id, project_id, started_at DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '006_phase9_competitor_intelligence',
      new Date().toISOString(),
    );
  }

  const applied007 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('007_stage2_multi_agent_orchestration') as { version: string } | undefined;

  if (!applied007) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        objective TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'queued',
        current_stage TEXT NOT NULL DEFAULT 'Initializing',
        blocking_reason TEXT,
        created_by TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_wf_tenant_proj
        ON agent_workflows(tenant_id, project_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_wf_status
        ON agent_workflows(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_workflow_nodes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        condition_json TEXT NOT NULL DEFAULT '{}',
        approval_gate_type TEXT,
        approval_required INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        timeout_ms INTEGER NOT NULL DEFAULT 60000,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(workflow_id, node_key)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_wf_nodes_wf
        ON agent_workflow_nodes(tenant_id, workflow_id);

      CREATE TABLE IF NOT EXISTS agent_workflow_edges (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        from_node_key TEXT NOT NULL,
        to_node_key TEXT NOT NULL,
        UNIQUE(workflow_id, from_node_key, to_node_key)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_wf_edges_wf
        ON agent_workflow_edges(tenant_id, workflow_id);

      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        next_retry_at TEXT,
        blocking_reason TEXT,
        error_summary TEXT,
        approval_required INTEGER NOT NULL DEFAULT 0,
        approval_gate_type TEXT,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        output_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workflow_id, node_key)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_wf
        ON agent_tasks(tenant_id, project_id, workflow_id, status);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent
        ON agent_tasks(tenant_id, project_id, agent_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        provider TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_exec_wf
        ON agent_executions(tenant_id, project_id, workflow_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_exec_agent
        ON agent_executions(tenant_id, project_id, agent_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS agent_outputs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        schema_version TEXT NOT NULL DEFAULT '1.0',
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_outputs_wf
        ON agent_outputs(tenant_id, project_id, workflow_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS agent_handoffs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        destination_agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        input_ref TEXT NOT NULL,
        output_ref TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'validated',
        validation_summary TEXT NOT NULL DEFAULT '',
        correlation_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_handoffs_wf
        ON agent_handoffs(tenant_id, project_id, workflow_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS agent_approval_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        gate_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by TEXT NOT NULL,
        approver_id TEXT,
        approver_name TEXT,
        approver_role TEXT,
        comments TEXT NOT NULL DEFAULT '',
        version_ref TEXT NOT NULL,
        output_id TEXT,
        audit_history_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_approvals_proj
        ON agent_approval_requests(tenant_id, project_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS agent_execution_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        error_summary TEXT,
        progress_pct INTEGER,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_events_wf
        ON agent_execution_events(tenant_id, project_id, workflow_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS agent_configurations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        max_retries INTEGER NOT NULL DEFAULT 2,
        timeout_ms INTEGER NOT NULL DEFAULT 60000,
        preferred_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, agent_id)
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '007_stage2_multi_agent_orchestration',
      new Date().toISOString(),
    );
  }

  const applied008 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('008_stage3_agent_collaboration') as { version: string } | undefined;

  if (!applied008) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        message_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        destination_agent_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        evidence_references_json TEXT NOT NULL DEFAULT '[]',
        correlation_id TEXT NOT NULL,
        reply_to_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        error_summary TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_messages_wf
        ON agent_messages(tenant_id, project_id, workflow_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_corr
        ON agent_messages(tenant_id, correlation_id);

      CREATE TABLE IF NOT EXISTS workflow_context_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        context_scope TEXT NOT NULL,
        context_key TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL,
        source_agent_id TEXT,
        approval_status TEXT NOT NULL DEFAULT 'unverified',
        is_approved_lock INTEGER NOT NULL DEFAULT 0,
        supersedes_id TEXT,
        conflict_flag INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        evidence_references_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        UNIQUE(workflow_id, context_scope, context_key, version)
      );
      CREATE INDEX IF NOT EXISTS idx_wf_ctx_proj_wf
        ON workflow_context_items(tenant_id, project_id, workflow_id, context_scope);

      CREATE TABLE IF NOT EXISTS agent_delegations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        parent_task_id TEXT NOT NULL,
        delegated_task_id TEXT,
        source_agent_id TEXT NOT NULL,
        target_agent_id TEXT NOT NULL,
        message_id TEXT,
        response_message_id TEXT,
        delegation_depth INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'requested',
        reason TEXT NOT NULL,
        requested_objective TEXT NOT NULL DEFAULT '',
        error_summary TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_delegations_wf
        ON agent_delegations(tenant_id, project_id, workflow_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workflow_conflicts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        conflict_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        agent_a_id TEXT NOT NULL,
        agent_b_id TEXT NOT NULL,
        output_a_ref TEXT NOT NULL,
        output_b_ref TEXT NOT NULL,
        output_a_snapshot_json TEXT NOT NULL DEFAULT '{}',
        output_b_snapshot_json TEXT NOT NULL DEFAULT '{}',
        affected_node_keys_json TEXT NOT NULL DEFAULT '[]',
        verification_message_id TEXT,
        requires_human_review INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'open',
        selected_resolution TEXT,
        resolution_note TEXT,
        resolved_by TEXT,
        resolved_by_name TEXT,
        resolved_by_role TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_wf_conflicts_wf
        ON workflow_conflicts(tenant_id, project_id, workflow_id, status);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '008_stage3_agent_collaboration',
      new Date().toISOString(),
    );
  }

  const applied009 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('009_stage4_visual_workflow_studio') as { version: string } | undefined;

  if (!applied009) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS studio_workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        active_version_number INTEGER NOT NULL DEFAULT 1,
        published_version_id TEXT,
        draft_graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
        last_validation_json TEXT,
        last_execution_workflow_id TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_studio_wf_proj
        ON studio_workflows(tenant_id, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS studio_workflow_versions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        studio_workflow_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'snapshot',
        change_summary TEXT NOT NULL DEFAULT '',
        graph_json TEXT NOT NULL,
        validation_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(studio_workflow_id, version_number)
      );
      CREATE INDEX IF NOT EXISTS idx_studio_wf_versions_wf
        ON studio_workflow_versions(tenant_id, project_id, studio_workflow_id, version_number DESC);

      CREATE TABLE IF NOT EXISTS studio_workflow_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Custom',
        description TEXT NOT NULL DEFAULT '',
        graph_json TEXT NOT NULL,
        required_providers_json TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_studio_tpl_tenant
        ON studio_workflow_templates(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS studio_validation_reports (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        studio_workflow_id TEXT NOT NULL,
        valid INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        report_json TEXT NOT NULL,
        validated_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_studio_val_wf
        ON studio_validation_reports(tenant_id, studio_workflow_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS studio_workflow_executions (
        workflow_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        studio_workflow_id TEXT NOT NULL,
        studio_version_id TEXT NOT NULL,
        studio_version_number INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_studio_exec_wf
        ON studio_workflow_executions(tenant_id, project_id, studio_workflow_id, created_at DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '009_stage4_visual_workflow_studio',
      new Date().toISOString(),
    );
  }

  const applied010 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('010_stage5_usage_cost_intelligence') as { version: string } | undefined;

  if (!applied010) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS provider_usage_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT,
        execution_id TEXT,
        task_id TEXT,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        request_timestamp TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cached_input_tokens INTEGER,
        total_tokens INTEGER,
        provider_request_id TEXT,
        usage_source TEXT NOT NULL DEFAULT 'unavailable',
        measurement_status TEXT NOT NULL DEFAULT 'unavailable',
        latency_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'succeeded',
        error_type TEXT,
        is_quota_error INTEGER NOT NULL DEFAULT 0,
        is_retry INTEGER NOT NULL DEFAULT 0,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        raw_usage_metadata_json TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_proj_ts
        ON provider_usage_events(tenant_id, project_id, request_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_events_workflow
        ON provider_usage_events(tenant_id, project_id, workflow_id);
      CREATE INDEX IF NOT EXISTS idx_usage_events_agent
        ON provider_usage_events(tenant_id, project_id, agent_id, request_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_events_provider
        ON provider_usage_events(tenant_id, project_id, provider, model);

      CREATE TABLE IF NOT EXISTS provider_pricing_versions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_price_per_1m_micros INTEGER,
        output_price_per_1m_micros INTEGER,
        cached_input_price_per_1m_micros INTEGER,
        currency TEXT NOT NULL DEFAULT 'USD',
        effective_date TEXT NOT NULL,
        source_of_pricing TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'unconfigured',
        pricing_version TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        configured_by TEXT,
        audit_note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_lookup
        ON provider_pricing_versions(provider, model, is_active, effective_date DESC);
      CREATE INDEX IF NOT EXISTS idx_pricing_tenant
        ON provider_pricing_versions(tenant_id, provider, model, is_active);

      CREATE TABLE IF NOT EXISTS usage_cost_calculations (
        id TEXT PRIMARY KEY,
        usage_event_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT,
        agent_id TEXT NOT NULL,
        pricing_version_id TEXT,
        pricing_version_label TEXT,
        pricing_source_label TEXT,
        cost_basis TEXT NOT NULL DEFAULT 'unavailable',
        currency TEXT NOT NULL DEFAULT 'USD',
        input_cost_micros INTEGER,
        output_cost_micros INTEGER,
        cached_input_cost_micros INTEGER,
        total_cost_micros INTEGER,
        unavailable_reason TEXT,
        calculated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_costs_tenant_proj
        ON usage_cost_calculations(tenant_id, project_id, calculated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_costs_workflow
        ON usage_cost_calculations(tenant_id, project_id, workflow_id);
      CREATE INDEX IF NOT EXISTS idx_usage_costs_agent
        ON usage_cost_calculations(tenant_id, project_id, agent_id);

      CREATE TABLE IF NOT EXISTS usage_budget_configs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT,
        scope_type TEXT NOT NULL DEFAULT 'project',
        scope_target_id TEXT,
        agent_id TEXT,
        name TEXT NOT NULL,
        period_type TEXT NOT NULL DEFAULT 'monthly',
        budget_limit_micros INTEGER,
        max_execution_cost_micros INTEGER,
        max_tokens_per_run INTEGER,
        warning_threshold_pct INTEGER NOT NULL DEFAULT 80,
        enforcement_policy TEXT NOT NULL DEFAULT 'warn_only',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_budgets_tenant_proj
        ON usage_budget_configs(tenant_id, project_id, enabled);

      CREATE TABLE IF NOT EXISTS usage_budget_alerts (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT,
        workflow_id TEXT,
        agent_id TEXT,
        alert_type TEXT NOT NULL,
        period_window TEXT NOT NULL,
        measured_spend_micros INTEGER NOT NULL DEFAULT 0,
        budget_limit_micros INTEGER,
        measured_tokens INTEGER,
        token_limit INTEGER,
        message TEXT NOT NULL,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_alerts_tenant_proj
        ON usage_budget_alerts(tenant_id, project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS usage_reconciliation_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        underlying_event_count INTEGER NOT NULL DEFAULT 0,
        measured_event_count INTEGER NOT NULL DEFAULT 0,
        unavailable_cost_event_count INTEGER NOT NULL DEFAULT 0,
        sum_event_cost_micros INTEGER NOT NULL DEFAULT 0,
        aggregated_workflow_cost_micros INTEGER NOT NULL DEFAULT 0,
        is_reconciled INTEGER NOT NULL DEFAULT 1,
        discrepancy_micros INTEGER NOT NULL DEFAULT 0,
        unavailable_components_json TEXT NOT NULL DEFAULT '[]',
        reconciled_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_reconcile_wf
        ON usage_reconciliation_records(tenant_id, project_id, workflow_id, reconciled_at DESC);
    `);

    const seedNow = new Date().toISOString();
    const insertPricing = db.prepare(`
      INSERT OR IGNORE INTO provider_pricing_versions (
        id, tenant_id, provider, model,
        input_price_per_1m_micros, output_price_per_1m_micros, cached_input_price_per_1m_micros,
        currency, effective_date, source_of_pricing, source_type, pricing_version,
        is_active, configured_by, audit_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Seed published GA Gemini pricing + honest unconfigured records for preview aliases & internal services
    insertPricing.run(
      'prc-gemini-2.5-flash-v1',
      null,
      'google_gemini',
      'gemini-2.5-flash',
      300_000,
      2_500_000,
      75_000,
      'USD',
      '2025-06-17',
      'Google Gemini API Published Pricing (ai.google.dev/gemini-api/docs/pricing)',
      'official_provider_pricing',
      'v1.0-official',
      1,
      'system',
      'Standard text input/output and context caching rates per 1M tokens.',
      seedNow,
    );
    insertPricing.run(
      'prc-gemini-2.5-pro-v1',
      null,
      'google_gemini',
      'gemini-2.5-pro',
      1_250_000,
      10_000_000,
      312_500,
      'USD',
      '2025-06-17',
      'Google Gemini API Published Pricing (ai.google.dev/gemini-api/docs/pricing)',
      'official_provider_pricing',
      'v1.0-official',
      1,
      'system',
      'Standard <=200k context tier text input/output and caching rates per 1M tokens.',
      seedNow,
    );
    insertPricing.run(
      'prc-gemini-4-hydrogen-unconfigured',
      null,
      'google_gemini',
      'gemini-4-hydrogen',
      null,
      null,
      null,
      'USD',
      seedNow.slice(0, 10),
      'Unconfigured — configure verified workspace billing rate to compute USD cost',
      'unconfigured',
      'unconfigured',
      1,
      'system',
      'Default content generation model; pricing rate must be explicitly configured by workspace admin.',
      seedNow,
    );
    insertPricing.run(
      'prc-gemini-3.1-flash-lite-unconfigured',
      null,
      'google_gemini',
      'gemini-3.1-flash-lite',
      null,
      null,
      null,
      'USD',
      seedNow.slice(0, 10),
      'Unconfigured — configure verified workspace billing rate to compute USD cost',
      'unconfigured',
      'unconfigured',
      1,
      'system',
      'Fast flash-lite alias; pricing rate must be explicitly configured by workspace admin.',
      seedNow,
    );
    insertPricing.run(
      'prc-internal-rovix-service-v1',
      null,
      'rovix_backend_service',
      '*',
      0,
      0,
      0,
      'USD',
      seedNow.slice(0, 10),
      'Internal Rovix SEO Engine (Non-LLM, No External Token Billing)',
      'internal_non_billed',
      'internal-v1',
      1,
      'system',
      'Crawler, Keyword, Geo, Competitor, and QA rule adapters run internally without per-token billing.',
      seedNow,
    );
    insertPricing.run(
      'prc-internal-workflow-studio-v1',
      null,
      'rovix_workflow_studio',
      '*',
      0,
      0,
      0,
      'USD',
      seedNow.slice(0, 10),
      'Internal Rovix Workflow Studio Node Runner (Non-LLM)',
      'internal_non_billed',
      'internal-v1',
      1,
      'system',
      'Triggers, condition evaluators, data transforms, and approval gates execute internally.',
      seedNow,
    );

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '010_stage5_usage_cost_intelligence',
      new Date().toISOString(),
    );
  }

  const applied011 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('011_stage6_autonomous_operations') as { version: string } | undefined;

  if (!applied011) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_schedules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        target_kind TEXT NOT NULL DEFAULT 'workflow_template',
        template_id TEXT,
        studio_workflow_id TEXT,
        workflow_objective TEXT NOT NULL DEFAULT '',
        frequency TEXT NOT NULL DEFAULT 'daily',
        minute_of_hour INTEGER NOT NULL DEFAULT 0,
        hour_of_day INTEGER,
        days_of_week_json TEXT NOT NULL DEFAULT '[]',
        day_of_month INTEGER,
        run_at_iso TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        execution_window_json TEXT,
        catch_up_policy TEXT NOT NULL DEFAULT 'skip',
        max_catch_up_runs INTEGER NOT NULL DEFAULT 3,
        status TEXT NOT NULL DEFAULT 'active',
        next_run_at TEXT,
        last_run_at TEXT,
        last_workflow_id TEXT,
        last_run_status TEXT,
        last_error TEXT,
        total_runs INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wf_schedules_proj
        ON workflow_schedules(tenant_id, project_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wf_schedules_due
        ON workflow_schedules(status, next_run_at);

      CREATE TABLE IF NOT EXISTS workflow_trigger_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        trigger_type TEXT NOT NULL,
        target_kind TEXT NOT NULL DEFAULT 'workflow_template',
        template_id TEXT,
        studio_workflow_id TEXT,
        workflow_objective TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        filter_config_json TEXT NOT NULL DEFAULT '{}',
        webhook_secret_hash TEXT,
        webhook_secret_enc TEXT,
        webhook_secret_hint TEXT,
        rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
        total_triggered INTEGER NOT NULL DEFAULT 0,
        last_triggered_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wf_triggers_proj
        ON workflow_trigger_subscriptions(tenant_id, project_id, trigger_type, enabled);

      CREATE TABLE IF NOT EXISTS workflow_trigger_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        subscription_id TEXT,
        trigger_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        source_ref TEXT,
        status TEXT NOT NULL,
        payload_summary TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        launched_workflow_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_wf_trigger_events_proj
        ON workflow_trigger_events(tenant_id, project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workflow_worker_leases (
        lease_key TEXT PRIMARY KEY,
        lease_kind TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS idx_wf_leases_expiry
        ON workflow_worker_leases(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_wf_leases_proj
        ON workflow_worker_leases(tenant_id, project_id, status);

      CREATE TABLE IF NOT EXISTS workflow_recovery_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        task_id TEXT,
        action_type TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        related_workflow_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wf_recovery_proj
        ON workflow_recovery_records(tenant_id, project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workflow_dead_letter_tasks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        task_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        task_title TEXT NOT NULL,
        error_classification TEXT NOT NULL DEFAULT 'retryable',
        error_code TEXT NOT NULL DEFAULT 'EXECUTION_ERROR',
        error_message TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        max_retries INTEGER NOT NULL DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'open',
        replayed_workflow_id TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wf_dlq_proj
        ON workflow_dead_letter_tasks(tenant_id, project_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS autonomy_policies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        autonomy_mode TEXT NOT NULL DEFAULT 'automatic_low_risk',
        max_concurrent_workflows INTEGER NOT NULL DEFAULT 3,
        max_active_agent_tasks INTEGER NOT NULL DEFAULT 6,
        max_workflow_duration_ms INTEGER NOT NULL DEFAULT 900000,
        max_tokens_per_workflow INTEGER,
        max_spend_micros_per_run INTEGER,
        allowed_templates_json TEXT NOT NULL DEFAULT '[]',
        allowed_agents_json TEXT NOT NULL DEFAULT '[]',
        require_approval_for_high_impact INTEGER NOT NULL DEFAULT 1,
        high_impact_action_types_json TEXT NOT NULL DEFAULT '["content_publishing","destructive_changes","external_outreach","publishing_readiness","generated_content"]',
        allow_autonomous_retries INTEGER NOT NULL DEFAULT 1,
        allow_external_webhooks INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS scheduler_execution_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        schedule_id TEXT NOT NULL,
        schedule_name TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        scheduled_for_iso TEXT NOT NULL,
        executed_at_iso TEXT NOT NULL,
        outcome TEXT NOT NULL,
        launched_workflow_id TEXT,
        message TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sched_logs_proj
        ON scheduler_execution_logs(tenant_id, project_id, executed_at_iso DESC);
      CREATE INDEX IF NOT EXISTS idx_sched_logs_sched
        ON scheduler_execution_logs(schedule_id, executed_at_iso DESC);

      CREATE TABLE IF NOT EXISTS runtime_worker_heartbeats (
        worker_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'healthy',
        started_at TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL,
        active_leases_count INTEGER NOT NULL DEFAULT 0,
        processed_ticks INTEGER NOT NULL DEFAULT 0,
        last_tick_duration_ms INTEGER,
        last_error TEXT
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '011_stage6_autonomous_operations',
      new Date().toISOString(),
    );
  }

  const applied012 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('012_module7_seo_strategy_architecture') as { version: string } | undefined;

  if (!applied012) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS seo_strategy_versions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        target_audience TEXT NOT NULL DEFAULT '',
        evidence_readiness_json TEXT NOT NULL DEFAULT '{}',
        missing_evidence_json TEXT NOT NULL DEFAULT '[]',
        strategy_payload_json TEXT NOT NULL DEFAULT '{}',
        source_workflow_id TEXT,
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, version_number)
      );
      CREATE INDEX IF NOT EXISTS idx_strategy_versions_proj
        ON seo_strategy_versions(tenant_id, project_id, version_number DESC);

      CREATE TABLE IF NOT EXISTS seo_strategy_objectives (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        title TEXT NOT NULL,
        rationale TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        needs_research INTEGER NOT NULL DEFAULT 0,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_strategy_obj_ver
        ON seo_strategy_objectives(tenant_id, project_id, strategy_version_id);

      CREATE TABLE IF NOT EXISTS site_architecture_pages (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        parent_page_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        proposed_url TEXT NOT NULL,
        existing_url TEXT,
        page_type TEXT NOT NULL DEFAULT 'resource',
        primary_keyword TEXT,
        secondary_keywords_json TEXT NOT NULL DEFAULT '[]',
        related_keywords_json TEXT NOT NULL DEFAULT '[]',
        search_intent TEXT NOT NULL DEFAULT 'Informational',
        cluster_id TEXT,
        cluster_name TEXT,
        target_geography TEXT,
        page_status TEXT NOT NULL DEFAULT 'proposed',
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        mapping_approval_status TEXT NOT NULL DEFAULT 'pending_review',
        confidence TEXT NOT NULL DEFAULT 'Medium',
        rationale TEXT NOT NULL DEFAULT '',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        archived_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_arch_pages_ver
        ON site_architecture_pages(tenant_id, project_id, strategy_version_id, sort_order ASC);

      CREATE TABLE IF NOT EXISTS internal_link_recommendations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        source_page_id TEXT,
        source_url TEXT NOT NULL,
        source_title TEXT NOT NULL,
        target_page_id TEXT,
        target_url TEXT NOT NULL,
        target_title TEXT NOT NULL,
        suggested_anchor_text TEXT NOT NULL,
        link_category TEXT NOT NULL,
        exists_in_crawl INTEGER NOT NULL DEFAULT 0,
        current_inbound_count INTEGER,
        reason TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'Medium',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_internal_links_ver
        ON internal_link_recommendations(tenant_id, project_id, strategy_version_id);

      CREATE TABLE IF NOT EXISTS topical_clusters (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        pillar_topic TEXT NOT NULL,
        supporting_subtopics_json TEXT NOT NULL DEFAULT '[]',
        coverage_classification TEXT NOT NULL,
        verified_page_urls_json TEXT NOT NULL DEFAULT '[]',
        missing_opportunities_json TEXT NOT NULL DEFAULT '[]',
        competitor_gap_ids_json TEXT NOT NULL DEFAULT '[]',
        keyword_cluster_id TEXT,
        linked_page_ids_json TEXT NOT NULL DEFAULT '[]',
        priority_score INTEGER,
        confidence TEXT NOT NULL DEFAULT 'Medium',
        evidence_summary TEXT NOT NULL DEFAULT '',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_topical_clusters_ver
        ON topical_clusters(tenant_id, project_id, strategy_version_id);

      CREATE TABLE IF NOT EXISTS seo_roadmap_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        related_page_id TEXT,
        related_url TEXT,
        related_keyword TEXT,
        business_impact_rationale TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL,
        priority_score INTEGER,
        score_breakdown_json TEXT NOT NULL DEFAULT '{}',
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        estimated_effort TEXT NOT NULL,
        responsible_role TEXT NOT NULL,
        recommended_agent_id TEXT,
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        implementation_status TEXT NOT NULL DEFAULT 'not_started',
        linked_ticket_id TEXT,
        linked_workflow_id TEXT,
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_roadmap_items_ver
        ON seo_roadmap_items(tenant_id, project_id, strategy_version_id);

      CREATE TABLE IF NOT EXISTS strategy_approval_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        strategy_version_id TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_label TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        FOREIGN KEY (strategy_version_id) REFERENCES seo_strategy_versions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_strategy_approvals_proj
        ON strategy_approval_records(tenant_id, project_id, timestamp DESC);
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '012_module7_seo_strategy_architecture',
      new Date().toISOString(),
    );
  }

  const applied013 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('013_module8_onpage_seo_optimization') as { version: string } | undefined;

  if (!applied013) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS onpage_analysis_runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        crawl_id TEXT,
        strategy_version_id TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        pages_analyzed_count INTEGER NOT NULL DEFAULT 0,
        issues_detected_count INTEGER NOT NULL DEFAULT 0,
        unavailable_evidence_pages_count INTEGER NOT NULL DEFAULT 0,
        triggered_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_note TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_runs_proj
        ON onpage_analysis_runs(tenant_id, project_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS onpage_page_analyses (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        analysis_run_id TEXT NOT NULL,
        crawl_id TEXT NOT NULL,
        crawl_url_id TEXT NOT NULL,
        url TEXT NOT NULL,
        slug TEXT NOT NULL,
        page_type TEXT NOT NULL DEFAULT 'resource',
        status_code INTEGER NOT NULL DEFAULT 200,
        indexability TEXT NOT NULL DEFAULT 'Indexable',
        canonical_url TEXT,
        canonical_status TEXT NOT NULL DEFAULT 'missing',
        title TEXT,
        meta_description TEXT,
        h1 TEXT,
        html_extract_json TEXT NOT NULL,
        keyword_context_json TEXT NOT NULL,
        suggested_schema_json TEXT NOT NULL DEFAULT '[]',
        suggested_subtopics_json TEXT NOT NULL DEFAULT '[]',
        score_breakdown_json TEXT NOT NULL,
        overall_score INTEGER,
        score_status TEXT NOT NULL DEFAULT 'insufficient_evidence',
        issue_count INTEGER NOT NULL DEFAULT 0,
        critical_high_issue_count INTEGER NOT NULL DEFAULT 0,
        lifecycle_status TEXT NOT NULL DEFAULT 'detected',
        analyzed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, url)
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_pages_run
        ON onpage_page_analyses(tenant_id, project_id, analysis_run_id);

      CREATE TABLE IF NOT EXISTS onpage_issues (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        analysis_run_id TEXT NOT NULL,
        page_analysis_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        issue_key TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        lifecycle_status TEXT NOT NULL DEFAULT 'detected',
        linked_roadmap_item_id TEXT,
        linked_ticket_id TEXT,
        first_detected_at TEXT NOT NULL,
        last_detected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, page_url, issue_key)
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_issues_proj
        ON onpage_issues(tenant_id, project_id);

      CREATE TABLE IF NOT EXISTS onpage_recommendations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        page_analysis_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        target_field TEXT NOT NULL,
        current_value TEXT NOT NULL,
        suggested_value TEXT NOT NULL,
        reason TEXT NOT NULL,
        related_keyword TEXT,
        search_intent TEXT,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        confidence TEXT NOT NULL DEFAULT 'Medium',
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        ai_model TEXT,
        provider_usage_event_id TEXT,
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        approved_by TEXT,
        approved_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_recs_proj
        ON onpage_recommendations(tenant_id, project_id, page_analysis_id);

      CREATE TABLE IF NOT EXISTS onpage_optimization_drafts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        page_analysis_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 1,
        original_snapshot_json TEXT NOT NULL,
        proposed_payload_json TEXT NOT NULL,
        change_summary TEXT NOT NULL DEFAULT '',
        approval_status TEXT NOT NULL DEFAULT 'pending_review',
        lifecycle_status TEXT NOT NULL DEFAULT 'draft_ready',
        applied_externally_at TEXT,
        applied_externally_by TEXT,
        applied_externally_channel TEXT,
        applied_external_note TEXT,
        verified_at TEXT,
        verified_crawl_id TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_drafts_proj
        ON onpage_optimization_drafts(tenant_id, project_id, page_url, version_number DESC);

      CREATE TABLE IF NOT EXISTS onpage_approval_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        entity_label TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_approvals_proj
        ON onpage_approval_records(tenant_id, project_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS onpage_validation_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        crawl_id TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        matched_checks_count INTEGER NOT NULL DEFAULT 0,
        total_checks_count INTEGER NOT NULL DEFAULT 0,
        diffs_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL,
        validated_by TEXT NOT NULL,
        validated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_onpage_validations_proj
        ON onpage_validation_records(tenant_id, project_id, validated_at DESC);

      CREATE TABLE IF NOT EXISTS cms_connection_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        display_name TEXT NOT NULL,
        site_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_configured',
        encrypted_credentials_json TEXT,
        last_tested_at TEXT,
        last_error TEXT,
        created_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, project_id, platform)
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '013_module8_onpage_seo_optimization',
      new Date().toISOString(),
    );
  }
}

export function getLatestSchemaVersion(): string {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1')
    .get() as { version: string } | undefined;
  return row?.version ?? 'unknown';
}

export function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPasswordAgainstHash(
  password: string,
  salt: string,
  expectedHex: string,
): boolean {
  const actual = Buffer.from(hashPasswordWithSalt(password, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function ensureTenantRecord(tenant: Tenant): Tenant {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM tenants WHERE id = ?')
    .get(tenant.id) as Record<string, unknown> | undefined;
  if (existing) {
    return {
      id: String(existing.id),
      name: String(existing.name),
      plan: existing.plan as Tenant['plan'],
      primaryDomain: String(existing.primary_domain),
    };
  }
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO tenants (id, name, plan, primary_domain, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(tenant.id, tenant.name, tenant.plan, tenant.primaryDomain, now);
  return tenant;
}

export interface StoredUserRecord {
  user: User;
  tenant: Tenant;
  salt: string;
  passwordHash: string;
}

export function createTenantAndUser(params: {
  organizationName: string;
  primaryDomain?: string;
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}): StoredUserRecord {
  const db = getAuditDb();
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get(normalizedEmail) as { id: string } | undefined;
  if (existing) {
    throw new Error('CONFLICT: An account with this email address already exists.');
  }

  const now = new Date().toISOString();
  const tenantId = `ten-${crypto.randomUUID().slice(0, 10)}`;
  const userId = `usr-${crypto.randomUUID().slice(0, 10)}`;
  const role: UserRole = params.role ?? 'Agency Owner';
  const cleanName = params.name.trim();
  const initials =
    cleanName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join('') || 'U';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPasswordWithSalt(params.password, salt);

  const tenant: Tenant = {
    id: tenantId,
    name: params.organizationName.trim(),
    plan: 'Growth',
    primaryDomain: params.primaryDomain?.trim().toLowerCase() ?? '',
  };

  const user: User = {
    id: userId,
    name: cleanName,
    email: normalizedEmail,
    role,
    avatarInitials: initials,
    title: role,
  };

  db.prepare(
    'INSERT INTO tenants (id, name, plan, primary_domain, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(tenant.id, tenant.name, tenant.plan, tenant.primaryDomain, now);

  db.prepare(
    `INSERT INTO users (id, tenant_id, name, email, role, avatar_initials, title, salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    tenant.id,
    user.name,
    user.email,
    user.role,
    user.avatarInitials,
    user.title,
    salt,
    passwordHash,
    now,
  );

  return { user, tenant, salt, passwordHash };
}

export function findStoredUserByEmail(email: string): StoredUserRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.primary_domain AS tenant_domain
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(u.email) = ?`,
    )
    .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    user: {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      role: row.role as UserRole,
      avatarInitials: String(row.avatar_initials),
      title: String(row.title),
    },
    tenant: {
      id: String(row.tenant_id),
      name: String(row.tenant_name),
      plan: row.tenant_plan as Tenant['plan'],
      primaryDomain: String(row.tenant_domain),
    },
    salt: String(row.salt),
    passwordHash: String(row.password_hash),
  };
}

export function createProjectRecord(params: {
  id?: string;
  tenantId: string;
  name: string;
  website: string;
  owner: string;
  targetMarkets?: string[];
  currentMilestone?: string;
  nextAction?: string;
}): Project {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = params.id ?? `proj-${crypto.randomUUID().slice(0, 10)}`;
  const cleanDomain = params.website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  const duplicate = db
    .prepare(
      'SELECT id FROM projects WHERE tenant_id = ? AND LOWER(website) = ? AND deleted_at IS NULL',
    )
    .get(params.tenantId, cleanDomain) as { id: string } | undefined;
  if (duplicate) {
    throw new Error(`CONFLICT: A project for "${cleanDomain}" already exists in this workspace.`);
  }

  const markets = params.targetMarkets?.length ? params.targetMarkets : ['Global'];
  const milestone = params.currentMilestone ?? 'Baseline Technical & Search Setup';
  const nextAction =
    params.nextAction ?? 'Verify domain ownership and launch first technical crawl';

  db.prepare(
    `INSERT INTO projects (
       id, tenant_id, name, website, target_markets_json, owner,
       current_milestone, next_action, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    params.tenantId,
    params.name.trim(),
    cleanDomain,
    JSON.stringify(markets),
    params.owner,
    milestone,
    nextAction,
    now,
    now,
  );

  getProjectVerification(params.tenantId, id, cleanDomain);

  return getProjectById(params.tenantId, id)!;
}

function hydrateProjectSummary(db: DatabaseSync, row: Record<string, unknown>): Project {
  const tenantId = String(row.tenant_id);
  const projectId = String(row.id);

  const ticketStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_tickets,
         SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) AS verified_tickets,
         SUM(CASE WHEN approval_status = 'Pending' AND task_status != 'Rejected' THEN 1 ELSE 0 END) AS pending_approvals
       FROM developer_tickets
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .get(tenantId, projectId) as Record<string, unknown>;

  const issueStats = db
    .prepare(
      `SELECT COUNT(*) AS critical_count
       FROM technical_issues
       WHERE tenant_id = ? AND project_id = ?
         AND severity IN ('Critical', 'High')
         AND status NOT IN ('Verified', 'Rejected')`,
    )
    .get(tenantId, projectId) as Record<string, unknown>;

  const latestCompleted = db
    .prepare(
      `SELECT completed_at, started_at, status
       FROM crawl_runs
       WHERE tenant_id = ? AND project_id = ? AND status IN ('Succeeded', 'Partial')
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(tenantId, projectId) as Record<string, unknown> | undefined;

  const verifRow = db
    .prepare(
      'SELECT verified, crawl_policy_approved FROM project_verifications WHERE tenant_id = ? AND project_id = ?',
    )
    .get(tenantId, projectId) as { verified: number; crawl_policy_approved: number } | undefined;

  const totalTickets = Number(ticketStats.total_tickets ?? 0);
  const verifiedTickets = Number(ticketStats.verified_tickets ?? 0);
  const overdueApprovals = Number(ticketStats.pending_approvals ?? 0);
  const criticalIssues = Number(issueStats.critical_count ?? 0);

  const blockers: string[] = [];
  if (!verifRow || !verifRow.verified) {
    blockers.push('Domain ownership not verified for automated crawling');
  }

  let status: Project['status'] = 'Active';
  if (blockers.length > 0 && !latestCompleted) {
    status = 'Needs Attention';
  } else if (criticalIssues > 0) {
    status = 'Needs Attention';
  }

  let markets: string[] = [];
  try {
    markets = JSON.parse(String(row.target_markets_json)) as string[];
  } catch {
    markets = ['Global'];
  }

  return {
    id: projectId,
    name: String(row.name),
    website: String(row.website),
    targetMarkets: markets,
    owner: String(row.owner),
    currentMilestone: String(row.current_milestone),
    verifiedTaskWeight: verifiedTickets,
    approvedScopedTaskWeight: totalTickets,
    criticalIssues,
    overdueApprovals,
    blockers,
    nextAction: String(row.next_action),
    lastSuccessfulRun: latestCompleted
      ? String(latestCompleted.completed_at ?? latestCompleted.started_at)
      : null,
    status,
    createdAt: String(row.created_at),
  };
}

export function listProjectsByTenant(tenantId: string): Project[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
    )
    .all(tenantId) as Record<string, unknown>[];
  return rows.map((r) => hydrateProjectSummary(db, r));
}

export function getProjectById(tenantId: string, projectId: string): Project | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM projects WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .get(tenantId, projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return hydrateProjectSummary(db, row);
}

export function softDeleteProject(tenantId: string, projectId: string): boolean {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      'UPDATE projects SET deleted_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .run(now, now, tenantId, projectId);
  return Number(result.changes ?? 0) > 0;
}

export function ensureSandboxTestProject(tenantId: string, projectId = 'proj-rovix-main'): Project {
  const existing = getProjectById(tenantId, projectId);
  if (existing) return existing;

  ensureTenantRecord({
    id: tenantId,
    name: 'Rovix Test Workspace',
    plan: 'Growth',
    primaryDomain: SANDBOX_HOST,
  });

  const proj = createProjectRecord({
    id: projectId,
    tenantId,
    name: 'Rovix Internal Sandbox Target',
    website: SANDBOX_HOST,
    owner: 'System Test Harness',
    targetMarkets: ['Sandbox'],
    currentMilestone: 'Automated Crawler Verification',
    nextAction: 'Run sandbox crawl test',
  });

  upsertProjectVerification({
    tenantId,
    projectId,
    canonicalDomain: SANDBOX_HOST,
    verificationMethod: 'DNS_TXT',
    verified: true,
    crawlPolicyApproved: true,
    actorName: 'System Test Harness',
  });

  return proj;
}

export function recordActivityEvent(params: {
  tenantId: string;
  projectId?: string | null;
  type: ActivityEvent['type'];
  actor: string;
  action: string;
  status: ActivityEvent['status'];
  evidenceUrl?: string;
}): ActivityEvent {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `act-${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO system_activity_events (
       id, tenant_id, project_id, event_type, actor, action, status, evidence_url, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId ?? null,
    params.type,
    params.actor,
    params.action,
    params.status,
    params.evidenceUrl ?? null,
    now,
  );

  const event: ActivityEvent = {
    id,
    type: params.type,
    actor: params.actor,
    action: params.action,
    timestamp: now,
    status: params.status,
    evidenceUrl: params.evidenceUrl,
  };

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: params.projectId,
    reason: params.type,
  });

  return event;
}

export function listActivityEvents(
  tenantId: string,
  projectId?: string,
  limit = 20,
): ActivityEvent[] {
  const db = getAuditDb();
  const rows = projectId
    ? (db
        .prepare(
          `SELECT * FROM system_activity_events
           WHERE tenant_id = ? AND (project_id = ? OR project_id IS NULL)
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(tenantId, projectId, limit) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM system_activity_events
           WHERE tenant_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(tenantId, limit) as Record<string, unknown>[]);

  return rows.map((r) => ({
    id: String(r.id),
    type: r.event_type as ActivityEvent['type'],
    actor: String(r.actor),
    action: String(r.action),
    timestamp: String(r.created_at),
    status: r.status as ActivityEvent['status'],
    evidenceUrl: r.evidence_url ? String(r.evidence_url) : undefined,
  }));
}

/* ---------------- OAuth Integrations & Sync Jobs ---------------- */

function mapOAuthRow(row: Record<string, unknown>): OAuthIntegrationRecord {
  let scopes: string[] = [];
  try {
    scopes = JSON.parse(String(row.scopes_json)) as string[];
  } catch {
    scopes = [];
  }
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    provider: row.provider as IntegrationProviderId,
    accountEmail: row.account_email ? String(row.account_email) : null,
    propertyId: row.property_id ? String(row.property_id) : null,
    propertyName: row.property_name ? String(row.property_name) : null,
    scopes,
    status: row.status as IntegrationConnectionStatus,
    lastError: row.last_error ? String(row.last_error) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listOAuthIntegrations(
  tenantId: string,
  projectId: string,
): OAuthIntegrationRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM oauth_integrations WHERE tenant_id = ? AND project_id = ? ORDER BY provider ASC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapOAuthRow);
}

export function getOAuthIntegrationRow(
  tenantId: string,
  projectId: string,
  provider: IntegrationProviderId,
): (OAuthIntegrationRecord & { encryptedTokensJson: string | null }) | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM oauth_integrations WHERE tenant_id = ? AND project_id = ? AND provider = ?',
    )
    .get(tenantId, projectId, provider) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...mapOAuthRow(row),
    encryptedTokensJson: row.encrypted_tokens_json
      ? String(row.encrypted_tokens_json)
      : null,
  };
}

export function upsertOAuthIntegration(params: {
  tenantId: string;
  projectId: string;
  provider: IntegrationProviderId;
  accountEmail?: string | null;
  propertyId?: string | null;
  propertyName?: string | null;
  scopes?: string[];
  encryptedTokensJson?: string | null;
  status: IntegrationConnectionStatus;
  lastError?: string | null;
  lastSyncedAt?: string | null;
}): OAuthIntegrationRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const existing = getOAuthIntegrationRow(
    params.tenantId,
    params.projectId,
    params.provider,
  );

  const id = existing?.id ?? `int-${crypto.randomUUID().slice(0, 10)}`;
  const accountEmail =
    params.accountEmail !== undefined ? params.accountEmail : existing?.accountEmail ?? null;
  const propertyId =
    params.propertyId !== undefined ? params.propertyId : existing?.propertyId ?? null;
  const propertyName =
    params.propertyName !== undefined ? params.propertyName : existing?.propertyName ?? null;
  const scopes = params.scopes ?? existing?.scopes ?? [];
  const encryptedTokensJson =
    params.encryptedTokensJson !== undefined
      ? params.encryptedTokensJson
      : existing?.encryptedTokensJson ?? null;
  const lastError =
    params.lastError !== undefined ? params.lastError : existing?.lastError ?? null;
  const lastSyncedAt =
    params.lastSyncedAt !== undefined ? params.lastSyncedAt : existing?.lastSyncedAt ?? null;

  db.prepare(
    `INSERT INTO oauth_integrations (
       id, tenant_id, project_id, provider, account_email, property_id, property_name,
       scopes_json, encrypted_tokens_json, status, last_error, last_synced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, project_id, provider) DO UPDATE SET
       account_email = excluded.account_email,
       property_id = excluded.property_id,
       property_name = excluded.property_name,
       scopes_json = excluded.scopes_json,
       encrypted_tokens_json = excluded.encrypted_tokens_json,
       status = excluded.status,
       last_error = excluded.last_error,
       last_synced_at = excluded.last_synced_at,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.provider,
    accountEmail,
    propertyId,
    propertyName,
    JSON.stringify(scopes),
    encryptedTokensJson,
    params.status,
    lastError,
    lastSyncedAt,
    existing?.createdAt ?? now,
    now,
  );

  return getOAuthIntegrationRow(params.tenantId, params.projectId, params.provider)!;
}

export function deleteOAuthIntegration(
  tenantId: string,
  projectId: string,
  provider: IntegrationProviderId,
): boolean {
  const db = getAuditDb();
  const res = db
    .prepare(
      'DELETE FROM oauth_integrations WHERE tenant_id = ? AND project_id = ? AND provider = ?',
    )
    .run(tenantId, projectId, provider);
  return Number(res.changes ?? 0) > 0;
}

function mapSyncJobRow(row: Record<string, unknown>): SyncJobRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    provider: row.provider as IntegrationProviderId,
    jobType: row.job_type as SyncJobRecord['jobType'],
    status: row.status as SyncJobRecord['status'],
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    recordsSynced: Number(row.records_synced),
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
  };
}

export function getActiveSyncJobByDedupeKey(dedupeKey: string): SyncJobRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      "SELECT * FROM sync_jobs WHERE dedupe_key = ? AND status IN ('Queued', 'Running', 'Retrying') LIMIT 1",
    )
    .get(dedupeKey) as Record<string, unknown> | undefined;
  return row ? mapSyncJobRow(row) : null;
}

export function createSyncJob(params: {
  tenantId: string;
  projectId: string;
  provider: IntegrationProviderId;
  jobType: SyncJobRecord['jobType'];
  dedupeKey: string;
  maxAttempts?: number;
}): SyncJobRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `sync-${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO sync_jobs (
       id, tenant_id, project_id, provider, job_type, status,
       attempt_count, max_attempts, dedupe_key, records_synced,
       error_message, started_at, completed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, 'Queued', 0, ?, ?, 0, NULL, NULL, NULL, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.provider,
    params.jobType,
    params.maxAttempts ?? 3,
    params.dedupeKey,
    now,
  );
  const row = db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  return mapSyncJobRow(row);
}

export function updateSyncJob(
  jobId: string,
  patch: Partial<{
    status: SyncJobRecord['status'];
    attemptCount: number;
    recordsSynced: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>,
): SyncJobRecord | null {
  const db = getAuditDb();
  const existing = db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(jobId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE sync_jobs
     SET status = ?, attempt_count = ?, records_synced = ?,
         error_message = ?, started_at = ?, completed_at = ?
     WHERE id = ?`,
  ).run(
    patch.status ?? String(existing.status),
    patch.attemptCount ?? Number(existing.attempt_count),
    patch.recordsSynced ?? Number(existing.records_synced),
    patch.errorMessage !== undefined
      ? patch.errorMessage
      : existing.error_message
        ? String(existing.error_message)
        : null,
    patch.startedAt !== undefined
      ? patch.startedAt
      : existing.started_at
        ? String(existing.started_at)
        : null,
    patch.completedAt !== undefined
      ? patch.completedAt
      : existing.completed_at
        ? String(existing.completed_at)
        : null,
    jobId,
  );
  const row = db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(jobId) as Record<
    string,
    unknown
  >;
  return mapSyncJobRow(row);
}

export function listSyncJobs(
  tenantId: string,
  projectId?: string,
  limit = 20,
): SyncJobRecord[] {
  const db = getAuditDb();
  const rows = projectId
    ? (db
        .prepare(
          'SELECT * FROM sync_jobs WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?',
        )
        .all(tenantId, projectId, limit) as Record<string, unknown>[])
    : (db
        .prepare(
          'SELECT * FROM sync_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
        )
        .all(tenantId, limit) as Record<string, unknown>[]);
  return rows.map(mapSyncJobRow);
}

export function recoverInterruptedSyncJobs(): number {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE sync_jobs
       SET status = 'Failed',
           error_message = 'Sync interrupted by server restart. Trigger a manual retry from Integrations.',
           completed_at = ?
       WHERE status IN ('Queued', 'Running', 'Retrying')`,
    )
    .run(now);
  return Number(res.changes ?? 0);
}

/* ---------------- GSC & GA4 & Keyword Storage ---------------- */

export function replaceGscMetrics(params: {
  tenantId: string;
  projectId: string;
  daily: {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  }[];
  queries: {
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  }[];
}): void {
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.prepare(
    'DELETE FROM gsc_daily_metrics WHERE tenant_id = ? AND project_id = ?',
  ).run(params.tenantId, params.projectId);
  db.prepare(
    'DELETE FROM gsc_query_metrics WHERE tenant_id = ? AND project_id = ?',
  ).run(params.tenantId, params.projectId);

  const insertDay = db.prepare(
    `INSERT INTO gsc_daily_metrics (tenant_id, project_id, metric_date, clicks, impressions, ctr, avg_position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of params.daily) {
    insertDay.run(
      params.tenantId,
      params.projectId,
      d.date,
      d.clicks,
      d.impressions,
      d.ctr,
      d.avgPosition,
      now,
    );
  }

  const insertQ = db.prepare(
    `INSERT INTO gsc_query_metrics (id, tenant_id, project_id, query, page, clicks, impressions, ctr, avg_position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, project_id, query, page) DO UPDATE SET
       clicks = excluded.clicks,
       impressions = excluded.impressions,
       ctr = excluded.ctr,
       avg_position = excluded.avg_position,
       updated_at = excluded.updated_at`,
  );
  for (const q of params.queries) {
    insertQ.run(
      `gscq-${crypto.randomUUID().slice(0, 10)}`,
      params.tenantId,
      params.projectId,
      q.query,
      q.page,
      q.clicks,
      q.impressions,
      q.ctr,
      q.avgPosition,
      now,
    );

    const opportunity: OpportunityTier =
      q.avgPosition <= 15 && q.impressions >= 50
        ? 'High'
        : q.avgPosition <= 30
          ? 'Medium'
          : 'Low';

    db.prepare(
      `INSERT INTO keyword_opportunities (
         id, tenant_id, project_id, keyword, intent, target_market,
         search_volume, target_url, opportunity, approval_status, difficulty,
         current_position, clicks, impressions, source_provider, rationale, updated_at
       ) VALUES (?, ?, ?, ?, 'Informational', 'Google Search Console', NULL, ?, ?, 'Pending', NULL, ?, ?, ?, 'gsc', ?, ?)
       ON CONFLICT(tenant_id, project_id, keyword) DO UPDATE SET
         target_url = excluded.target_url,
         current_position = excluded.current_position,
         clicks = excluded.clicks,
         impressions = excluded.impressions,
         opportunity = excluded.opportunity,
         rationale = excluded.rationale,
         updated_at = excluded.updated_at`,
    ).run(
      `kw-${crypto.randomUUID().slice(0, 10)}`,
      params.tenantId,
      params.projectId,
      q.query,
      q.page,
      opportunity,
      Math.round(q.avgPosition * 10) / 10,
      q.clicks,
      q.impressions,
      `Synced from Google Search Console (${q.clicks} clicks, ${q.impressions} impressions, avg pos ${q.avgPosition.toFixed(1)}). Search volume requires Keyword Planner API.`,
      now,
    );
  }
}

export function getGscDailyMetrics(
  tenantId: string,
  projectId: string,
  days = 90,
) {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT metric_date, clicks, impressions, ctr, avg_position
       FROM gsc_daily_metrics
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY metric_date DESC LIMIT ?`,
    )
    .all(tenantId, projectId, days) as Record<string, unknown>[];

  return rows.reverse().map((r) => ({
    date: String(r.metric_date),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
    ctr: Number(r.ctr),
    avgPosition: Number(r.avg_position),
  }));
}

export function getGscTopQueries(
  tenantId: string,
  projectId: string,
  limit = 25,
) {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT query, page, clicks, impressions, ctr, avg_position
       FROM gsc_query_metrics
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY clicks DESC, impressions DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    query: String(r.query),
    page: String(r.page),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
    ctr: Number(r.ctr),
    avgPosition: Number(r.avg_position),
  }));
}

export function replaceGa4Metrics(params: {
  tenantId: string;
  projectId: string;
  daily: {
    date: string;
    sessions: number;
    activeUsers: number;
    keyEvents: number;
  }[];
  landingPages: {
    landingPage: string;
    sessions: number;
    activeUsers: number;
    keyEvents: number;
  }[];
}): void {
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.prepare(
    'DELETE FROM ga4_daily_metrics WHERE tenant_id = ? AND project_id = ?',
  ).run(params.tenantId, params.projectId);
  db.prepare(
    'DELETE FROM ga4_landing_metrics WHERE tenant_id = ? AND project_id = ?',
  ).run(params.tenantId, params.projectId);

  const insDay = db.prepare(
    `INSERT INTO ga4_daily_metrics (tenant_id, project_id, metric_date, sessions, active_users, key_events, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of params.daily) {
    insDay.run(
      params.tenantId,
      params.projectId,
      d.date,
      d.sessions,
      d.activeUsers,
      d.keyEvents,
      now,
    );
  }

  const insPage = db.prepare(
    `INSERT INTO ga4_landing_metrics (id, tenant_id, project_id, landing_page, sessions, active_users, key_events, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, project_id, landing_page) DO UPDATE SET
       sessions = excluded.sessions,
       active_users = excluded.active_users,
       key_events = excluded.key_events,
       updated_at = excluded.updated_at`,
  );
  for (const lp of params.landingPages) {
    insPage.run(
      `ga4lp-${crypto.randomUUID().slice(0, 10)}`,
      params.tenantId,
      params.projectId,
      lp.landingPage,
      lp.sessions,
      lp.activeUsers,
      lp.keyEvents,
      now,
    );
  }
}

export function getGa4DailyMetrics(
  tenantId: string,
  projectId: string,
  days = 90,
) {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT metric_date, sessions, active_users, key_events
       FROM ga4_daily_metrics
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY metric_date DESC LIMIT ?`,
    )
    .all(tenantId, projectId, days) as Record<string, unknown>[];

  return rows.reverse().map((r) => ({
    date: String(r.metric_date),
    sessions: Number(r.sessions),
    activeUsers: Number(r.active_users),
    keyEvents: Number(r.key_events),
  }));
}

export function getGa4TopLandingPages(
  tenantId: string,
  projectId: string,
  limit = 20,
) {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT landing_page, sessions, active_users, key_events
       FROM ga4_landing_metrics
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY sessions DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    landingPage: String(r.landing_page),
    sessions: Number(r.sessions),
    activeUsers: Number(r.active_users),
    keyEvents: Number(r.key_events),
  }));
}

function mapKeywordRow(row: Record<string, unknown>): KeywordOpportunity {
  return {
    id: String(row.id),
    keyword: String(row.keyword),
    intent: row.intent as KeywordIntent,
    targetMarket: String(row.target_market),
    searchVolume:
      row.search_volume !== null && row.search_volume !== undefined
        ? Number(row.search_volume)
        : null,
    targetUrl: String(row.target_url),
    opportunity: row.opportunity as OpportunityTier,
    approvalStatus: row.approval_status as ApprovalStatus,
    difficulty:
      row.difficulty !== null && row.difficulty !== undefined
        ? Number(row.difficulty)
        : null,
    currentPosition:
      row.current_position !== null && row.current_position !== undefined
        ? Number(row.current_position)
        : null,
    clicks:
      row.clicks !== null && row.clicks !== undefined ? Number(row.clicks) : null,
    impressions:
      row.impressions !== null && row.impressions !== undefined
        ? Number(row.impressions)
        : null,
    sourceProvider: (row.source_provider as 'gsc' | 'manual') ?? 'manual',
    rationale: String(row.rationale),
  };
}

export function listProjectKeywords(
  tenantId: string,
  projectId: string,
): KeywordOpportunity[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM keyword_opportunities
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY COALESCE(clicks, 0) DESC, updated_at DESC LIMIT 100`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapKeywordRow);
}

export function createManualKeyword(params: {
  tenantId: string;
  projectId: string;
  keyword: string;
  intent: KeywordIntent;
  targetMarket: string;
  targetUrl: string;
  opportunity: OpportunityTier;
  rationale: string;
}): KeywordOpportunity {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `kw-${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO keyword_opportunities (
       id, tenant_id, project_id, keyword, intent, target_market,
       search_volume, target_url, opportunity, approval_status, difficulty,
       current_position, clicks, impressions, source_provider, rationale, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'Pending', NULL, NULL, NULL, NULL, 'manual', ?, ?)
     ON CONFLICT(tenant_id, project_id, keyword) DO UPDATE SET
       intent = excluded.intent,
       target_market = excluded.target_market,
       target_url = excluded.target_url,
       opportunity = excluded.opportunity,
       rationale = excluded.rationale,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.keyword.trim(),
    params.intent,
    params.targetMarket.trim() || 'Global',
    params.targetUrl.trim() || '/',
    params.opportunity,
    params.rationale.trim() || 'Added manually to workspace target tracker.',
    now,
  );

  const row = db
    .prepare(
      'SELECT * FROM keyword_opportunities WHERE tenant_id = ? AND project_id = ? AND keyword = ?',
    )
    .get(params.tenantId, params.projectId, params.keyword.trim()) as Record<
    string,
    unknown
  >;
  return mapKeywordRow(row);
}

export function updateKeywordApprovalInDb(
  tenantId: string,
  keywordId: string,
  status: ApprovalStatus,
): KeywordOpportunity | null {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM keyword_opportunities WHERE tenant_id = ? AND id = ?')
    .get(tenantId, keywordId) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE keyword_opportunities SET approval_status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
  ).run(status, now, tenantId, keywordId);

  const updated = db
    .prepare('SELECT * FROM keyword_opportunities WHERE tenant_id = ? AND id = ?')
    .get(tenantId, keywordId) as Record<string, unknown>;
  return mapKeywordRow(updated);
}

/* ---------------- Operational Health & Backup ---------------- */

export function getDatabaseHealthSnapshot() {
  const db = getAuditDb();
  const integrityRows = db.prepare('PRAGMA integrity_check;').all() as {
    integrity_check: string;
  }[];
  const integrityDetail = integrityRows
    .map((r) => r.integrity_check)
    .join('; ');
  const integrityOk = integrityDetail.toLowerCase() === 'ok';

  const dbPath = getDbFilePath();
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(dbPath).size;
  } catch {
    sizeBytes = 0;
  }

  const countTable = (table: string): number => {
    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as {
      cnt: number;
    };
    return Number(row.cnt ?? 0);
  };

  return {
    engine: 'SQLite WAL (node:sqlite)',
    path: dbPath,
    integrityOk,
    integrityDetail,
    sizeBytes,
    schemaVersion: getLatestSchemaVersion(),
    tableCounts: {
      tenants: countTable('tenants'),
      users: countTable('users'),
      projects: countTable('projects'),
      crawlRuns: countTable('crawl_runs'),
      technicalIssues: countTable('technical_issues'),
      oauthIntegrations: countTable('oauth_integrations'),
      syncJobs: countTable('sync_jobs'),
    },
  };
}

export function createSqliteSnapshotBackup(): {
  filePath: string;
  sizeBytes: number;
  createdAt: string;
} {
  const db = getAuditDb();
  const backupDir = path.join(getDataRoot(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(backupDir, `rovix-backup-${stamp}.db`);
  const safeSqlPath = destPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safeSqlPath}';`);
  const sizeBytes = fs.statSync(destPath).size;
  return {
    filePath: destPath,
    sizeBytes,
    createdAt: new Date().toISOString(),
  };
}

/* ---------------- Phase 3 Audit CRUD Preserved ---------------- */

export function getProjectVerification(
  tenantId: string,
  projectId: string,
  fallbackDomain: string,
): ProjectDomainVerification {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM project_verifications WHERE tenant_id = ? AND project_id = ?')
    .get(tenantId, projectId) as Record<string, unknown> | undefined;

  if (!row) {
    const now = new Date().toISOString();
    const record: ProjectDomainVerification = {
      id: `verif-${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      projectId,
      canonicalDomain: fallbackDomain,
      verificationMethod: 'DNS_TXT',
      verificationToken: `rovix-site-verification=${crypto.randomBytes(6).toString('hex')}`,
      verified: false,
      crawlPolicyApproved: false,
      verifiedBy: null,
      verifiedAt: null,
      updatedAt: now,
    };
    db.prepare(`
      INSERT INTO project_verifications (
        id, tenant_id, project_id, canonical_domain, verification_method,
        verification_token, verified, crawl_policy_approved, verified_by,
        verified_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?)
    `).run(
      record.id,
      tenantId,
      projectId,
      record.canonicalDomain,
      record.verificationMethod,
      record.verificationToken,
      now,
    );
    return record;
  }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    canonicalDomain: String(row.canonical_domain),
    verificationMethod: row.verification_method as ProjectDomainVerification['verificationMethod'],
    verificationToken: String(row.verification_token),
    verified: Boolean(row.verified),
    crawlPolicyApproved: Boolean(row.crawl_policy_approved),
    verifiedBy: row.verified_by ? String(row.verified_by) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    updatedAt: String(row.updated_at),
  };
}

export function upsertProjectVerification(params: {
  tenantId: string;
  projectId: string;
  canonicalDomain: string;
  verificationMethod: ProjectDomainVerification['verificationMethod'];
  verified: boolean;
  crawlPolicyApproved: boolean;
  actorName: string;
}): ProjectDomainVerification {
  const db = getAuditDb();
  const existing = getProjectVerification(params.tenantId, params.projectId, params.canonicalDomain);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE project_verifications
    SET canonical_domain = ?,
        verification_method = ?,
        verified = ?,
        crawl_policy_approved = ?,
        verified_by = ?,
        verified_at = ?,
        updated_at = ?
    WHERE tenant_id = ? AND project_id = ?
  `).run(
    params.canonicalDomain,
    params.verificationMethod,
    params.verified ? 1 : 0,
    params.crawlPolicyApproved ? 1 : 0,
    params.verified ? params.actorName : null,
    params.verified ? now : null,
    now,
    params.tenantId,
    params.projectId,
  );
  return {
    ...existing,
    canonicalDomain: params.canonicalDomain,
    verificationMethod: params.verificationMethod,
    verified: params.verified,
    crawlPolicyApproved: params.crawlPolicyApproved,
    verifiedBy: params.verified ? params.actorName : null,
    verifiedAt: params.verified ? now : null,
    updatedAt: now,
  };
}

export function getDefaultCrawlConfig(
  projectId: string,
  domain: string,
): CrawlConfigurationData {
  return {
    projectId,
    startingUrl: `https://${domain}/`,
    maxPages: 50,
    maxDepth: 4,
    maxConcurrency: 3,
    requestDelayMs: domain === SANDBOX_HOST ? 25 : 250,
    includePatterns: [],
    excludePatterns: ['/wp-admin', '/logout'],
    queryParamPolicy: 'ignore_all',
    queryAllowlist: [],
    discoverSitemaps: true,
    enableJsRendering: true,
    scopeMode: 'internal_only',
    respectRobotsTxt: true,
  };
}

export function getSavedCrawlConfig(
  tenantId: string,
  projectId: string,
  domain: string,
): CrawlConfigurationData {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT config_json FROM crawl_configurations WHERE tenant_id = ? AND project_id = ?')
    .get(tenantId, projectId) as { config_json: string } | undefined;
  if (!row) return getDefaultCrawlConfig(projectId, domain);
  try {
    return JSON.parse(row.config_json) as CrawlConfigurationData;
  } catch {
    return getDefaultCrawlConfig(projectId, domain);
  }
}

export function saveCrawlConfig(
  tenantId: string,
  projectId: string,
  config: CrawlConfigurationData,
  actorName: string,
): CrawlConfigurationData {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO crawl_configurations (id, tenant_id, project_id, config_json, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id) DO UPDATE SET
      config_json = excluded.config_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    `cfg-${projectId}`,
    tenantId,
    projectId,
    JSON.stringify(config),
    actorName,
    now,
  );
  return config;
}

export function recordAuditTrail(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  previousState: string;
  newState: string;
  reason: string;
  evidenceReference?: string | null;
}): AuditTrailEntry {
  const db = getAuditDb();
  const entry: AuditTrailEntry = {
    id: `aud-${crypto.randomUUID().slice(0, 10)}`,
    entityType: params.entityType,
    entityId: params.entityId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    previousState: params.previousState,
    newState: params.newState,
    reason: params.reason,
    evidenceReference: params.evidenceReference ?? null,
    timestamp: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO audit_trail (
      id, tenant_id, entity_type, entity_id, actor_id, actor_name,
      actor_role, previous_state, new_state, reason, evidence_reference, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    params.tenantId,
    entry.entityType,
    entry.entityId,
    params.actorId,
    entry.actorName,
    entry.actorRole,
    entry.previousState,
    entry.newState,
    entry.reason,
    entry.evidenceReference,
    entry.timestamp,
  );
  return entry;
}

export function mapCrawlRunRow(row: Record<string, unknown>): CrawlRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    status: row.status as CrawlJobState,
    crawlType: (row.crawl_type as 'full' | 'reverification') ?? 'full',
    configuration: JSON.parse(String(row.configuration_json)) as CrawlConfigurationData,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    discoveredCount: Number(row.discovered_count),
    processedCount: Number(row.processed_count),
    errorCount: Number(row.error_count),
    summary: JSON.parse(String(row.summary_json)) as CrawlRunSummary,
    robotsSnapshotRef: row.robots_snapshot_ref ? String(row.robots_snapshot_ref) : null,
    sitemapSummary: row.sitemap_summary_json
      ? (JSON.parse(String(row.sitemap_summary_json)) as SitemapAnalysisSummary)
      : null,
    triggeredBy: String(row.triggered_by),
  };
}

export function listCrawlRuns(tenantId: string, projectId?: string): CrawlRun[] {
  const db = getAuditDb();
  const rows = projectId
    ? (db
        .prepare(
          'SELECT * FROM crawl_runs WHERE tenant_id = ? AND project_id = ? ORDER BY started_at DESC LIMIT 50',
        )
        .all(tenantId, projectId) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM crawl_runs WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 50')
        .all(tenantId) as Record<string, unknown>[]);
  return rows.map(mapCrawlRunRow);
}

export function getCrawlRunById(tenantId: string, crawlId: string): CrawlRun | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM crawl_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, crawlId) as Record<string, unknown> | undefined;
  return row ? mapCrawlRunRow(row) : null;
}

export function mapCrawlUrlRow(row: Record<string, unknown>): CrawlURLRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    crawlId: String(row.crawl_id),
    normalizedUrl: String(row.normalized_url),
    requestedUrl: String(row.requested_url),
    finalUrl: String(row.final_url),
    parentUrl: row.parent_url ? String(row.parent_url) : null,
    discoverySource: row.discovery_source as CrawlURLRecord['discoverySource'],
    redirectChain: JSON.parse(String(row.redirect_chain_json)),
    statusCode: Number(row.status_code),
    contentType: String(row.content_type),
    responseTimeMs: Number(row.response_time_ms),
    depth: Number(row.depth),
    indexability: row.indexability as CrawlURLRecord['indexability'],
    indexabilityReason: String(row.indexability_reason),
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    canonicalStatus: row.canonical_status as CrawlURLRecord['canonicalStatus'],
    title: row.title ? String(row.title) : null,
    metaDescription: row.meta_description ? String(row.meta_description) : null,
    h1: row.h1 ? String(row.h1) : null,
    headings: JSON.parse(String(row.headings_json)),
    robotsDirectives: JSON.parse(String(row.robots_directives_json)),
    xRobotsTag: row.x_robots_tag ? String(row.x_robots_tag) : null,
    schemaTypes: JSON.parse(String(row.schema_types_json)),
    schemaErrors: JSON.parse(String(row.schema_errors_json)),
    hreflangTags: JSON.parse(String(row.hreflang_json)),
    internalLinks: JSON.parse(String(row.internal_links_json)),
    externalLinks: JSON.parse(String(row.external_links_json)),
    missingAltCount: Number(row.missing_alt_count),
    hasViewport: Boolean(row.has_viewport),
    htmlLang: row.html_lang ? String(row.html_lang) : null,
    inSitemap: Boolean(row.in_sitemap),
    issueCount: Number(row.issue_count),
    renderingSource: row.rendering_source as CrawlURLRecord['renderingSource'],
    renderedDiff: row.rendered_diff_json ? JSON.parse(String(row.rendered_diff_json)) : null,
    rawHtmlObjectRef: row.raw_html_object_ref ? String(row.raw_html_object_ref) : null,
    renderedDomObjectRef: row.rendered_dom_object_ref ? String(row.rendered_dom_object_ref) : null,
    fetchedAt: String(row.fetched_at),
  };
}

export function queryCrawlUrls(params: {
  tenantId: string;
  crawlId: string;
  search?: string;
  filter?: string;
  sortBy?: 'normalized_url' | 'status_code' | 'depth' | 'issue_count' | 'fetched_at';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): { items: CrawlURLRecord[]; total: number; page: number; pageSize: number } {
  const db = getAuditDb();
  const where: string[] = ['tenant_id = ?', 'crawl_id = ?'];
  const args: (string | number)[] = [params.tenantId, params.crawlId];

  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    where.push('(LOWER(normalized_url) LIKE ? OR LOWER(COALESCE(title, \'\')) LIKE ? OR LOWER(COALESCE(h1, \'\')) LIKE ?)');
    args.push(q, q, q);
  }

  switch (params.filter) {
    case 'indexable':
      where.push("indexability = 'Indexable'");
      break;
    case 'non_indexable':
      where.push("indexability = 'Non-Indexable'");
      break;
    case 'errors':
      where.push('(status_code >= 400 OR status_code = 0)');
      break;
    case 'redirects':
      where.push('(status_code >= 300 AND status_code < 400)');
      break;
    case 'canonical_issues':
      where.push("canonical_status != 'self_referencing'");
      break;
    case 'missing_metadata':
      where.push("(title IS NULL OR title = '' OR meta_description IS NULL OR meta_description = '')");
      break;
    case 'schema_issues':
      where.push("schema_errors_json != '[]'");
      break;
  }

  const allowedSort: Record<string, string> = {
    normalized_url: 'normalized_url',
    status_code: 'status_code',
    depth: 'depth',
    issue_count: 'issue_count',
    fetched_at: 'fetched_at',
  };
  const sortCol = allowedSort[params.sortBy ?? 'depth'] ?? 'depth';
  const sortDir = params.sortDir === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const whereSql = where.join(' AND ');
  const countRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM crawl_urls WHERE ${whereSql}`)
    .get(...args) as { cnt: number };

  const rows = db
    .prepare(
      `SELECT * FROM crawl_urls WHERE ${whereSql} ORDER BY ${sortCol} ${sortDir}, normalized_url ASC LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, offset) as Record<string, unknown>[];

  return {
    items: rows.map(mapCrawlUrlRow),
    total: Number(countRow.cnt),
    page,
    pageSize,
  };
}

export function listCrawlEvents(tenantId: string, crawlId: string): CrawlEventRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM crawl_events WHERE tenant_id = ? AND crawl_id = ? ORDER BY timestamp ASC LIMIT 500',
    )
    .all(tenantId, crawlId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    crawlId: String(r.crawl_id),
    eventType: r.event_type as CrawlEventRecord['eventType'],
    payload: JSON.parse(String(r.event_payload_json)) as Record<string, unknown>,
    timestamp: String(r.timestamp),
  }));
}

export function mapIssueRow(row: Record<string, unknown>): TechnicalIssue {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    lastCrawlId: String(row.last_crawl_id),
    ruleId: String(row.rule_id),
    ruleName: String(row.rule_name),
    category: row.category as TechnicalIssue['category'],
    severity: row.severity as TechnicalIssue['severity'],
    rootCauseKey: String(row.root_cause_key),
    title: String(row.title),
    explanation: String(row.explanation),
    impact: String(row.impact),
    recommendedFix: String(row.recommended_fix),
    responsibleRole: String(row.responsible_role),
    status: row.status as TechnicalIssue['status'],
    confidence: Number(row.confidence),
    affectedUrlCount: Number(row.affected_url_count),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

export function listProjectIssues(tenantId: string, projectId: string): TechnicalIssue[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM technical_issues WHERE tenant_id = ? AND project_id = ?
       ORDER BY CASE severity
         WHEN 'Critical' THEN 1
         WHEN 'High' THEN 2
         WHEN 'Medium' THEN 3
         WHEN 'Low' THEN 4
         ELSE 5 END, last_seen_at DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapIssueRow);
}

export function listCrawlIssues(tenantId: string, crawlId: string): TechnicalIssue[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT ti.* FROM technical_issues ti
       INNER JOIN issue_evidence ie ON ie.issue_id = ti.id AND ie.tenant_id = ti.tenant_id
       WHERE ti.tenant_id = ? AND ie.crawl_id = ?
       ORDER BY CASE ti.severity
         WHEN 'Critical' THEN 1
         WHEN 'High' THEN 2
         WHEN 'Medium' THEN 3
         WHEN 'Low' THEN 4
         ELSE 5 END, ti.affected_url_count DESC`,
    )
    .all(tenantId, crawlId) as Record<string, unknown>[];
  return rows.map(mapIssueRow);
}

export function getIssueById(tenantId: string, issueId: string): TechnicalIssue | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(tenantId, issueId) as Record<string, unknown> | undefined;
  return row ? mapIssueRow(row) : null;
}

export function listIssueEvidence(
  tenantId: string,
  issueId: string,
  crawlId?: string,
): IssueEvidence[] {
  const db = getAuditDb();
  const rows = crawlId
    ? (db
        .prepare(
          'SELECT * FROM issue_evidence WHERE tenant_id = ? AND issue_id = ? AND crawl_id = ? ORDER BY captured_at DESC',
        )
        .all(tenantId, issueId, crawlId) as Record<string, unknown>[])
    : (db
        .prepare(
          'SELECT * FROM issue_evidence WHERE tenant_id = ? AND issue_id = ? ORDER BY captured_at DESC LIMIT 100',
        )
        .all(tenantId, issueId) as Record<string, unknown>[]);

  return rows.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    issueId: String(r.issue_id),
    crawlId: String(r.crawl_id),
    urlId: r.url_id ? String(r.url_id) : null,
    url: String(r.url),
    evidenceType: String(r.evidence_type),
    source: r.source as IssueEvidence['source'],
    snippet: String(r.snippet),
    details: JSON.parse(String(r.details_json)) as Record<string, unknown>,
    evidenceReference: r.evidence_reference ? String(r.evidence_reference) : null,
    capturedAt: String(r.captured_at),
  }));
}

export function mapTicketRow(row: Record<string, unknown>): DeveloperTicket {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    issueId: String(row.issue_id),
    projectId: String(row.project_id),
    title: String(row.title),
    description: String(row.description),
    responsibleRole: String(row.responsible_role),
    assignedUser: row.assigned_user ? String(row.assigned_user) : null,
    taskStatus: row.task_status as DeveloperTicket['taskStatus'],
    approvalStatus: row.approval_status as DeveloperTicket['approvalStatus'],
    requiresDualApproval: Boolean(row.requires_dual_approval),
    developerApprovedBy: row.developer_approved_by ? String(row.developer_approved_by) : null,
    leadApprovedBy: row.lead_approved_by ? String(row.lead_approved_by) : null,
    verificationStatus: row.verification_status as DeveloperTicket['verificationStatus'],
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listTicketsForIssue(tenantId: string, issueId: string): DeveloperTicket[] {
  const db = getAuditDb();
  const rows = db
    .prepare('SELECT * FROM developer_tickets WHERE tenant_id = ? AND issue_id = ? ORDER BY created_at DESC')
    .all(tenantId, issueId) as Record<string, unknown>[];
  return rows.map(mapTicketRow);
}

export function listTicketsForProject(tenantId: string, projectId: string): DeveloperTicket[] {
  const db = getAuditDb();
  const rows = db
    .prepare('SELECT * FROM developer_tickets WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 50')
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapTicketRow);
}

export function listVerificationRuns(
  tenantId: string,
  opts: { issueId?: string; projectId?: string },
): VerificationRun[] {
  const db = getAuditDb();
  let rows: Record<string, unknown>[];
  if (opts.issueId) {
    rows = db
      .prepare('SELECT * FROM verification_runs WHERE tenant_id = ? AND issue_id = ? ORDER BY verified_at DESC')
      .all(tenantId, opts.issueId) as Record<string, unknown>[];
  } else if (opts.projectId) {
    rows = db
      .prepare(
        `SELECT vr.* FROM verification_runs vr
         INNER JOIN technical_issues ti ON ti.id = vr.issue_id AND ti.tenant_id = vr.tenant_id
         WHERE vr.tenant_id = ? AND ti.project_id = ?
         ORDER BY vr.verified_at DESC LIMIT 25`,
      )
      .all(tenantId, opts.projectId) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare('SELECT * FROM verification_runs WHERE tenant_id = ? ORDER BY verified_at DESC LIMIT 25')
      .all(tenantId) as Record<string, unknown>[];
  }

  return rows.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    issueId: String(r.issue_id),
    previousCrawlId: String(r.previous_crawl_id),
    verificationCrawlId: String(r.verification_crawl_id),
    result: r.result as VerificationRun['result'],
    evidence: JSON.parse(String(r.evidence_json)) as VerificationRun['evidence'],
    requestedBy: String(r.requested_by),
    verifiedAt: String(r.verified_at),
  }));
}

export function listAuditTrailForEntity(tenantId: string, entityId: string): AuditTrailEntry[] {
  const db = getAuditDb();
  const rows = db
    .prepare('SELECT * FROM audit_trail WHERE tenant_id = ? AND entity_id = ? ORDER BY timestamp DESC LIMIT 50')
    .all(tenantId, entityId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actorName: String(r.actor_name),
    actorRole: String(r.actor_role),
    previousState: String(r.previous_state),
    newState: String(r.new_state),
    reason: String(r.reason),
    evidenceReference: r.evidence_reference ? String(r.evidence_reference) : null,
    timestamp: String(r.timestamp),
  }));
}

/* ---------------- Phase 6: Performance & Usability Persistence ---------------- */

function mapPerformanceRunRow(row: Record<string, unknown>): PerformanceAuditRun {
  let targetUrls: string[] = [];
  try {
    targetUrls = JSON.parse(String(row.target_urls_json)) as string[];
  } catch {
    targetUrls = [];
  }
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    sourceCrawlId: row.source_crawl_id ? String(row.source_crawl_id) : null,
    strategyMode: row.strategy_mode as PerformanceRunStrategyMode,
    status: row.status as PerformanceAuditStatus,
    provider: String(row.provider),
    targetUrls,
    totalChecks: Number(row.total_checks),
    completedChecks: Number(row.completed_checks),
    failedChecks: Number(row.failed_checks),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
    avgMobileScore:
      row.avg_mobile_score !== null && row.avg_mobile_score !== undefined
        ? Number(row.avg_mobile_score)
        : null,
    avgDesktopScore:
      row.avg_desktop_score !== null && row.avg_desktop_score !== undefined
        ? Number(row.avg_desktop_score)
        : null,
    triggeredBy: String(row.triggered_by),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapPerformanceMeasurementRow(
  row: Record<string, unknown>,
): PerformanceUrlMeasurement {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    auditRunId: String(row.audit_run_id),
    url: String(row.url),
    strategy: row.strategy as PerformanceStrategy,
    status: row.status as 'Succeeded' | 'Failed',
    errorMessage: row.error_message ? String(row.error_message) : null,
    rawObjectRef: row.raw_object_ref ? String(row.raw_object_ref) : null,
    provenance: JSON.parse(String(row.provenance_json)),
    lab: JSON.parse(String(row.lab_json)),
    field: JSON.parse(String(row.field_json)),
    resources: JSON.parse(String(row.resources_json)),
    usability: JSON.parse(String(row.usability_json)),
    diagnostics: JSON.parse(String(row.diagnostics_json)),
    collectedAt: String(row.collected_at),
  };
}

function mapPerformanceFindingRow(
  row: Record<string, unknown>,
): PerformanceFinding {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    auditRunId: String(row.audit_run_id),
    measurementId: String(row.measurement_id),
    url: String(row.url),
    strategy: row.strategy as PerformanceStrategy,
    ruleId: String(row.rule_id),
    category: row.category as PerformanceFinding['category'],
    findingKind: row.finding_kind as PerformanceFinding['findingKind'],
    severity: row.severity as PerformanceFinding['severity'],
    title: String(row.title),
    rootCause: String(row.root_cause),
    explanation: String(row.explanation),
    evidence: JSON.parse(String(row.evidence_json)),
    recommendedSolution: String(row.recommended_solution),
    estimatedEffort: row.estimated_effort as PerformanceFinding['estimatedEffort'],
    affectedBytes:
      row.affected_bytes !== null && row.affected_bytes !== undefined
        ? Number(row.affected_bytes)
        : null,
    affectedMs:
      row.affected_ms !== null && row.affected_ms !== undefined
        ? Number(row.affected_ms)
        : null,
    linkedIssueId: row.linked_issue_id ? String(row.linked_issue_id) : null,
    createdAt: String(row.created_at),
  };
}

export function createPerformanceAuditRun(params: {
  id: string;
  tenantId: string;
  projectId: string;
  sourceCrawlId?: string | null;
  strategyMode: PerformanceRunStrategyMode;
  provider: string;
  targetUrls: string[];
  totalChecks: number;
  triggeredBy: string;
}): PerformanceAuditRun {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO performance_audit_runs (
      id, tenant_id, project_id, source_crawl_id, strategy_mode, status, provider,
      target_urls_json, total_checks, completed_checks, failed_checks, error_summary,
      avg_mobile_score, avg_desktop_score, triggered_by, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, 'Queued', ?, ?, ?, 0, 0, NULL, NULL, NULL, ?, ?, NULL)
  `).run(
    params.id,
    params.tenantId,
    params.projectId,
    params.sourceCrawlId ?? null,
    params.strategyMode,
    params.provider,
    JSON.stringify(params.targetUrls),
    params.totalChecks,
    params.triggeredBy,
    now,
  );
  return getPerformanceAuditRunById(params.tenantId, params.id)!;
}

export function updatePerformanceAuditRun(
  tenantId: string,
  auditId: string,
  patch: Partial<{
    status: PerformanceAuditStatus;
    completedChecks: number;
    failedChecks: number;
    errorSummary: string | null;
    avgMobileScore: number | null;
    avgDesktopScore: number | null;
    completedAt: string | null;
  }>,
): PerformanceAuditRun | null {
  const db = getAuditDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (patch.status !== undefined) {
    fields.push('status = ?');
    args.push(patch.status);
  }
  if (patch.completedChecks !== undefined) {
    fields.push('completed_checks = ?');
    args.push(patch.completedChecks);
  }
  if (patch.failedChecks !== undefined) {
    fields.push('failed_checks = ?');
    args.push(patch.failedChecks);
  }
  if (patch.errorSummary !== undefined) {
    fields.push('error_summary = ?');
    args.push(patch.errorSummary);
  }
  if (patch.avgMobileScore !== undefined) {
    fields.push('avg_mobile_score = ?');
    args.push(patch.avgMobileScore);
  }
  if (patch.avgDesktopScore !== undefined) {
    fields.push('avg_desktop_score = ?');
    args.push(patch.avgDesktopScore);
  }
  if (patch.completedAt !== undefined) {
    fields.push('completed_at = ?');
    args.push(patch.completedAt);
  }

  if (fields.length > 0) {
    db.prepare(
      `UPDATE performance_audit_runs SET ${fields.join(', ')} WHERE tenant_id = ? AND id = ?`,
    ).run(...args, tenantId, auditId);
  }
  return getPerformanceAuditRunById(tenantId, auditId);
}

export function getPerformanceAuditRunById(
  tenantId: string,
  auditId: string,
): PerformanceAuditRun | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM performance_audit_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, auditId) as Record<string, unknown> | undefined;
  return row ? mapPerformanceRunRow(row) : null;
}

export function listPerformanceAuditRuns(
  tenantId: string,
  projectId: string,
  limit = 25,
): PerformanceAuditRun[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM performance_audit_runs WHERE tenant_id = ? AND project_id = ? ORDER BY started_at DESC LIMIT ?',
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapPerformanceRunRow);
}

export function countActivePerformanceAudits(tenantId: string): number {
  const db = getAuditDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM performance_audit_runs WHERE tenant_id = ? AND status IN ('Queued', 'Running')",
    )
    .get(tenantId) as { cnt: number };
  return Number(row.cnt ?? 0);
}

export function savePerformanceMeasurement(
  m: PerformanceUrlMeasurement,
): PerformanceUrlMeasurement {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO performance_measurements (
      id, tenant_id, project_id, audit_run_id, url, strategy, status,
      error_message, raw_object_ref, provenance_json, lab_json, field_json,
      resources_json, usability_json, diagnostics_json, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(audit_run_id, url, strategy) DO UPDATE SET
      status = excluded.status,
      error_message = excluded.error_message,
      raw_object_ref = excluded.raw_object_ref,
      provenance_json = excluded.provenance_json,
      lab_json = excluded.lab_json,
      field_json = excluded.field_json,
      resources_json = excluded.resources_json,
      usability_json = excluded.usability_json,
      diagnostics_json = excluded.diagnostics_json,
      collected_at = excluded.collected_at
  `).run(
    m.id,
    m.tenantId,
    m.projectId,
    m.auditRunId,
    m.url,
    m.strategy,
    m.status,
    m.errorMessage,
    m.rawObjectRef,
    JSON.stringify(m.provenance),
    JSON.stringify(m.lab),
    JSON.stringify(m.field),
    JSON.stringify(m.resources),
    JSON.stringify(m.usability),
    JSON.stringify(m.diagnostics),
    m.collectedAt,
  );
  return m;
}

export function getPerformanceMeasurementById(
  tenantId: string,
  measurementId: string,
): PerformanceUrlMeasurement | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM performance_measurements WHERE tenant_id = ? AND id = ?')
    .get(tenantId, measurementId) as Record<string, unknown> | undefined;
  return row ? mapPerformanceMeasurementRow(row) : null;
}

export function listPerformanceMeasurements(
  tenantId: string,
  opts: { auditRunId?: string; projectId?: string; limit?: number },
): PerformanceUrlMeasurement[] {
  const db = getAuditDb();
  const limit = opts.limit ?? 100;
  let rows: Record<string, unknown>[];
  if (opts.auditRunId) {
    rows = db
      .prepare(
        'SELECT * FROM performance_measurements WHERE tenant_id = ? AND audit_run_id = ? ORDER BY url ASC, strategy ASC LIMIT ?',
      )
      .all(tenantId, opts.auditRunId, limit) as Record<string, unknown>[];
  } else if (opts.projectId) {
    rows = db
      .prepare(
        'SELECT * FROM performance_measurements WHERE tenant_id = ? AND project_id = ? ORDER BY collected_at DESC LIMIT ?',
      )
      .all(tenantId, opts.projectId, limit) as Record<string, unknown>[];
  } else {
    rows = [];
  }
  return rows.map(mapPerformanceMeasurementRow);
}

export function savePerformanceFindings(findings: PerformanceFinding[]): void {
  if (findings.length === 0) return;
  const db = getAuditDb();
  const stmt = db.prepare(`
    INSERT INTO performance_findings (
      id, tenant_id, project_id, audit_run_id, measurement_id, url, strategy,
      rule_id, category, finding_kind, severity, title, root_cause, explanation,
      evidence_json, recommended_solution, estimated_effort, affected_bytes,
      affected_ms, linked_issue_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of findings) {
    stmt.run(
      f.id,
      f.tenantId,
      f.projectId,
      f.auditRunId,
      f.measurementId,
      f.url,
      f.strategy,
      f.ruleId,
      f.category,
      f.findingKind,
      f.severity,
      f.title,
      f.rootCause,
      f.explanation,
      JSON.stringify(f.evidence),
      f.recommendedSolution,
      f.estimatedEffort,
      f.affectedBytes,
      f.affectedMs,
      f.linkedIssueId,
      f.createdAt,
    );
  }
}

export function listPerformanceFindings(
  tenantId: string,
  opts: { auditRunId?: string; projectId?: string; limit?: number },
): PerformanceFinding[] {
  const db = getAuditDb();
  const limit = opts.limit ?? 120;
  let rows: Record<string, unknown>[];
  if (opts.auditRunId) {
    rows = db
      .prepare(
        `SELECT * FROM performance_findings
         WHERE tenant_id = ? AND audit_run_id = ?
         ORDER BY CASE severity
           WHEN 'Critical' THEN 1
           WHEN 'High' THEN 2
           WHEN 'Medium' THEN 3
           ELSE 4 END, created_at DESC LIMIT ?`,
      )
      .all(tenantId, opts.auditRunId, limit) as Record<string, unknown>[];
  } else if (opts.projectId) {
    rows = db
      .prepare(
        `SELECT * FROM performance_findings
         WHERE tenant_id = ? AND project_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(tenantId, opts.projectId, limit) as Record<string, unknown>[];
  } else {
    rows = [];
  }
  return rows.map(mapPerformanceFindingRow);
}

export function getPerformanceFindingById(
  tenantId: string,
  findingId: string,
): PerformanceFinding | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM performance_findings WHERE tenant_id = ? AND id = ?')
    .get(tenantId, findingId) as Record<string, unknown> | undefined;
  return row ? mapPerformanceFindingRow(row) : null;
}

export function linkPerformanceFindingToIssue(
  tenantId: string,
  findingId: string,
  issueId: string,
): void {
  const db = getAuditDb();
  db.prepare(
    'UPDATE performance_findings SET linked_issue_id = ? WHERE tenant_id = ? AND id = ?',
  ).run(issueId, tenantId, findingId);
}

/* ---------------- Phase 7: Keyword & Demand Intelligence Persistence ---------------- */

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getKeywordBusinessProfile(
  tenantId: string,
  projectId: string,
): KeywordBusinessProfile {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM project_keyword_profiles WHERE tenant_id = ? AND project_id = ?',
    )
    .get(tenantId, projectId) as Record<string, unknown> | undefined;

  if (!row) {
    const project = getProjectById(tenantId, projectId);
    const now = new Date().toISOString();
    const firstMarket = project?.targetMarkets?.[0] ?? 'US';
    const profile: KeywordBusinessProfile = {
      id: `kwprof-${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      projectId,
      approvedNiche: '',
      approvedServices: [],
      targetAudience: '',
      targetCountry: firstMarket.length <= 3 ? firstMarket.toUpperCase() : 'US',
      targetCity: '',
      targetLanguage: 'en',
      competitorUrls: [],
      approvalStatus: 'pending_owner_approval',
      approvedBy: null,
      approvedAt: null,
      updatedAt: now,
    };
    db.prepare(`
      INSERT INTO project_keyword_profiles (
        id, tenant_id, project_id, approved_niche, approved_services_json,
        target_audience, target_country, target_city, target_language,
        competitor_urls_json, approval_status, approved_by, approved_at, updated_at
      ) VALUES (?, ?, ?, '', '[]', '', ?, '', 'en', '[]', 'pending_owner_approval', NULL, NULL, ?)
    `).run(profile.id, tenantId, projectId, profile.targetCountry, now);
    return profile;
  }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    approvedNiche: String(row.approved_niche ?? ''),
    approvedServices: parseJsonSafe<string[]>(row.approved_services_json, []),
    targetAudience: String(row.target_audience ?? ''),
    targetCountry: String(row.target_country ?? 'US'),
    targetCity: String(row.target_city ?? ''),
    targetLanguage: String(row.target_language ?? 'en'),
    competitorUrls: parseJsonSafe<string[]>(row.competitor_urls_json, []),
    approvalStatus:
      row.approval_status === 'approved' ? 'approved' : 'pending_owner_approval',
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    updatedAt: String(row.updated_at),
  };
}

export function upsertKeywordBusinessProfile(params: {
  tenantId: string;
  projectId: string;
  approvedNiche: string;
  approvedServices: string[];
  targetAudience: string;
  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  competitorUrls: string[];
  approvalStatus: 'pending_owner_approval' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
}): KeywordBusinessProfile {
  const db = getAuditDb();
  const existing = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE project_keyword_profiles
    SET approved_niche = ?,
        approved_services_json = ?,
        target_audience = ?,
        target_country = ?,
        target_city = ?,
        target_language = ?,
        competitor_urls_json = ?,
        approval_status = ?,
        approved_by = ?,
        approved_at = ?,
        updated_at = ?
    WHERE tenant_id = ? AND project_id = ?
  `).run(
    params.approvedNiche,
    JSON.stringify(params.approvedServices),
    params.targetAudience,
    params.targetCountry,
    params.targetCity,
    params.targetLanguage,
    JSON.stringify(params.competitorUrls),
    params.approvalStatus,
    params.approvedBy,
    params.approvedAt,
    now,
    params.tenantId,
    params.projectId,
  );

  return {
    ...existing,
    ...params,
    updatedAt: now,
  };
}

function mapKeywordResearchRunRow(row: Record<string, unknown>): KeywordResearchRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    seedTerms: parseJsonSafe<string[]>(row.seed_terms_json, []),
    targetCountry: String(row.target_country),
    targetCity: String(row.target_city ?? ''),
    targetLanguage: String(row.target_language ?? 'en'),
    intentFocus: (row.intent_focus ? String(row.intent_focus) : 'all') as KeywordResearchRun['intentFocus'],
    competitorUrls: parseJsonSafe<string[]>(row.competitor_urls_json, []),
    status: row.status as KeywordResearchRun['status'],
    totalDiscovered: Number(row.total_discovered ?? 0),
    totalClustersCreated: Number(row.total_clusters_created ?? 0),
    providerStatuses: parseJsonSafe<ProviderAvailabilityStatus[]>(
      row.provider_statuses_json,
      [],
    ),
    triggeredBy: String(row.triggered_by),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export function createKeywordResearchRun(run: KeywordResearchRun): KeywordResearchRun {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO keyword_research_runs (
      id, tenant_id, project_id, seed_terms_json, target_country, target_city,
      target_language, intent_focus, competitor_urls_json, status, total_discovered,
      total_clusters_created, provider_statuses_json, triggered_by, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.tenantId,
    run.projectId,
    JSON.stringify(run.seedTerms),
    run.targetCountry,
    run.targetCity,
    run.targetLanguage,
    run.intentFocus,
    JSON.stringify(run.competitorUrls),
    run.status,
    run.totalDiscovered,
    run.totalClustersCreated,
    JSON.stringify(run.providerStatuses),
    run.triggeredBy,
    run.startedAt,
    run.completedAt,
  );
  return run;
}

export function updateKeywordResearchRun(
  tenantId: string,
  runId: string,
  patch: Partial<{
    status: KeywordResearchRun['status'];
    totalDiscovered: number;
    totalClustersCreated: number;
    providerStatuses: ProviderAvailabilityStatus[];
    completedAt: string | null;
  }>,
): KeywordResearchRun | null {
  const db = getAuditDb();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    fields.push('status = ?');
    args.push(patch.status);
  }
  if (patch.totalDiscovered !== undefined) {
    fields.push('total_discovered = ?');
    args.push(patch.totalDiscovered);
  }
  if (patch.totalClustersCreated !== undefined) {
    fields.push('total_clusters_created = ?');
    args.push(patch.totalClustersCreated);
  }
  if (patch.providerStatuses !== undefined) {
    fields.push('provider_statuses_json = ?');
    args.push(JSON.stringify(patch.providerStatuses));
  }
  if (patch.completedAt !== undefined) {
    fields.push('completed_at = ?');
    args.push(patch.completedAt);
  }
  if (fields.length > 0) {
    db.prepare(
      `UPDATE keyword_research_runs SET ${fields.join(', ')} WHERE tenant_id = ? AND id = ?`,
    ).run(...args, tenantId, runId);
  }
  const row = db
    .prepare('SELECT * FROM keyword_research_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, runId) as Record<string, unknown> | undefined;
  return row ? mapKeywordResearchRunRow(row) : null;
}

export function listKeywordResearchRuns(
  tenantId: string,
  projectId: string,
  limit = 20,
): KeywordResearchRun[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM keyword_research_runs WHERE tenant_id = ? AND project_id = ? ORDER BY started_at DESC LIMIT ?',
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapKeywordResearchRunRow);
}

function mapKeywordMappingRow(row: Record<string, unknown>): KeywordUrlMappingRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    keywordId: String(row.keyword_id),
    keyword: String(row.keyword),
    targetUrl: row.target_url ? String(row.target_url) : null,
    mappingStatus: row.mapping_status as KeywordMappingStatus,
    recommendedSlug: row.recommended_slug ? String(row.recommended_slug) : null,
    pageTitle: row.page_title ? String(row.page_title) : null,
    pageH1: row.page_h1 ? String(row.page_h1) : null,
    pageStatusCode:
      row.page_status_code !== null && row.page_status_code !== undefined
        ? Number(row.page_status_code)
        : null,
    pageIndexable:
      row.page_indexable !== null && row.page_indexable !== undefined
        ? Boolean(row.page_indexable)
        : null,
    matchConfidence: Number(row.match_confidence ?? 0),
    cannibalizationRisk: (row.cannibalization_risk ?? 'none') as KeywordUrlMappingRecord['cannibalizationRisk'],
    competingUrls: parseJsonSafe<string[]>(row.competing_urls_json, []),
    competingKeywordIds: parseJsonSafe<string[]>(row.competing_keyword_ids_json, []),
    resolutionRecommendation: row.resolution_recommendation
      ? String(row.resolution_recommendation)
      : null,
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
  };
}

export function upsertKeywordUrlMapping(
  mapping: KeywordUrlMappingRecord,
): KeywordUrlMappingRecord {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO keyword_url_mappings (
      id, tenant_id, project_id, keyword_id, keyword, target_url, mapping_status,
      recommended_slug, page_title, page_h1, page_status_code, page_indexable,
      match_confidence, cannibalization_risk, competing_urls_json,
      competing_keyword_ids_json, resolution_recommendation, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, keyword_id) DO UPDATE SET
      keyword = excluded.keyword,
      target_url = excluded.target_url,
      mapping_status = excluded.mapping_status,
      recommended_slug = excluded.recommended_slug,
      page_title = excluded.page_title,
      page_h1 = excluded.page_h1,
      page_status_code = excluded.page_status_code,
      page_indexable = excluded.page_indexable,
      match_confidence = excluded.match_confidence,
      cannibalization_risk = excluded.cannibalization_risk,
      competing_urls_json = excluded.competing_urls_json,
      competing_keyword_ids_json = excluded.competing_keyword_ids_json,
      resolution_recommendation = excluded.resolution_recommendation,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    mapping.id,
    mapping.tenantId,
    mapping.projectId,
    mapping.keywordId,
    mapping.keyword,
    mapping.targetUrl,
    mapping.mappingStatus,
    mapping.recommendedSlug,
    mapping.pageTitle,
    mapping.pageH1,
    mapping.pageStatusCode,
    mapping.pageIndexable === null ? null : mapping.pageIndexable ? 1 : 0,
    mapping.matchConfidence,
    mapping.cannibalizationRisk,
    JSON.stringify(mapping.competingUrls),
    JSON.stringify(mapping.competingKeywordIds),
    mapping.resolutionRecommendation,
    mapping.updatedBy,
    mapping.updatedAt,
  );
  return mapping;
}

export function listKeywordUrlMappings(
  tenantId: string,
  projectId: string,
): KeywordUrlMappingRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM keyword_url_mappings WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapKeywordMappingRow);
}

function mapKeywordEvidenceRow(row: Record<string, unknown>): KeywordEvidenceItem {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    keywordId: String(row.keyword_id),
    sourceProvider: row.source_provider as KeywordEvidenceItem['sourceProvider'],
    sourceType: row.source_type as KeywordSourceType,
    measurementKind: row.measurement_kind as KeywordEvidenceItem['measurementKind'],
    sourceUrl: row.source_url ? String(row.source_url) : null,
    summary: String(row.summary),
    rawMetricValue: row.raw_metric_value ? String(row.raw_metric_value) : null,
    geographyScope: String(row.geography_scope ?? 'global'),
    collectedAt: String(row.collected_at),
  };
}

export function replaceKeywordEvidenceItems(
  tenantId: string,
  keywordId: string,
  items: KeywordEvidenceItem[],
): void {
  const db = getAuditDb();
  db.prepare(
    'DELETE FROM keyword_evidence_items WHERE tenant_id = ? AND keyword_id = ?',
  ).run(tenantId, keywordId);

  const stmt = db.prepare(`
    INSERT INTO keyword_evidence_items (
      id, tenant_id, project_id, keyword_id, source_provider, source_type,
      measurement_kind, source_url, summary, raw_metric_value, geography_scope, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ev of items) {
    stmt.run(
      ev.id,
      ev.tenantId,
      ev.projectId,
      ev.keywordId,
      ev.sourceProvider,
      ev.sourceType,
      ev.measurementKind,
      ev.sourceUrl,
      ev.summary,
      ev.rawMetricValue,
      ev.geographyScope,
      ev.collectedAt,
    );
  }
}

export function listKeywordEvidenceForProject(
  tenantId: string,
  projectId: string,
): KeywordEvidenceItem[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM keyword_evidence_items WHERE tenant_id = ? AND project_id = ? ORDER BY collected_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapKeywordEvidenceRow);
}

function mapKeywordIntelligenceRow(
  row: Record<string, unknown>,
  mappingMap: Map<string, KeywordUrlMappingRecord>,
  evidenceMap: Map<string, KeywordEvidenceItem[]>,
): KeywordIntelligenceRecord {
  const id = String(row.id);
  const breakdown = parseJsonSafe<OpportunityScoreBreakdown>(
    row.score_breakdown_json,
    {
      businessRelevance: 0,
      searchIntent: 0,
      evidenceQuality: 0,
      marketRelevance: 0,
      pageSuitability: 0,
      competitionEvidence: 0,
      conversionPotential: 0,
      totalScore: 0,
      relevanceGatePassed: false,
      weights: {
        businessRelevance: 0.28,
        searchIntent: 0.16,
        evidenceQuality: 0.18,
        marketRelevance: 0.12,
        pageSuitability: 0.12,
        competitionEvidence: 0.06,
        conversionPotential: 0.08,
      },
      reasons: [],
    },
  );
  return {
    id,
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    researchRunId: row.research_run_id ? String(row.research_run_id) : null,
    keyword: String(row.keyword),
    normalizedKeyword: String(row.normalized_keyword),
    seedTopic: row.seed_topic ? String(row.seed_topic) : null,
    primarySource: row.primary_source as KeywordSourceType,
    sources: parseJsonSafe<KeywordSourceType[]>(row.sources_json, []),
    isAiSuggestion: Boolean(row.is_ai_suggestion),
    intent: row.intent as KeywordIntent,
    intentInferred: Boolean(row.intent_inferred),
    intentVerifiedBy: row.intent_verified_by ? String(row.intent_verified_by) : null,
    intentConfidence: Number(row.intent_confidence ?? 0.65),
    intentReason: String(row.intent_reason ?? ''),
    targetCountry: String(row.target_country ?? 'US'),
    targetCity: String(row.target_city ?? ''),
    targetLanguage: String(row.target_language ?? 'en'),
    metricGeographyScope: (row.metric_geography_scope ??
      'global_unverified') as KeywordIntelligenceRecord['metricGeographyScope'],
    marketSearchVolume:
      row.market_search_volume !== null && row.market_search_volume !== undefined
        ? Number(row.market_search_volume)
        : null,
    volumeStatus: row.volume_status === 'measured' ? 'measured' : 'unavailable',
    volumeSource:
      row.volume_source === 'google_ads_keyword_planner'
        ? 'google_ads_keyword_planner'
        : 'unavailable',
    competitionLevel: (row.competition_level ??
      'unavailable') as KeywordIntelligenceRecord['competitionLevel'],
    cpcEstimate:
      row.cpc_estimate !== null && row.cpc_estimate !== undefined
        ? Number(row.cpc_estimate)
        : null,
    relativeTrendIndex:
      row.relative_trend_index !== null && row.relative_trend_index !== undefined
        ? Number(row.relative_trend_index)
        : null,
    trendDirection: (row.trend_direction ??
      'unavailable') as KeywordIntelligenceRecord['trendDirection'],
    gscClicks:
      row.gsc_clicks !== null && row.gsc_clicks !== undefined
        ? Number(row.gsc_clicks)
        : null,
    gscImpressions:
      row.gsc_impressions !== null && row.gsc_impressions !== undefined
        ? Number(row.gsc_impressions)
        : null,
    gscCtr:
      row.gsc_ctr !== null && row.gsc_ctr !== undefined
        ? Number(row.gsc_ctr)
        : null,
    gscAvgPosition:
      row.gsc_avg_position !== null && row.gsc_avg_position !== undefined
        ? Number(row.gsc_avg_position)
        : null,
    gscObservedUrl: row.gsc_observed_url ? String(row.gsc_observed_url) : null,
    clusterId: row.cluster_id ? String(row.cluster_id) : null,
    clusterName: row.cluster_name ? String(row.cluster_name) : null,
    workflowState: row.workflow_state as KeywordWorkflowState,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    strategistNotes: String(row.strategist_notes ?? ''),
    scoreBreakdown: breakdown,
    opportunityScore: Number(row.opportunity_score ?? 0),
    mapping: mappingMap.get(id) ?? null,
    evidence: evidenceMap.get(id) ?? [],
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function upsertKeywordIntelligenceRecord(
  record: KeywordIntelligenceRecord,
): KeywordIntelligenceRecord {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO keyword_intelligence_records (
      id, tenant_id, project_id, research_run_id, keyword, normalized_keyword,
      seed_topic, primary_source, sources_json, is_ai_suggestion, intent,
      intent_inferred, intent_verified_by, intent_confidence, intent_reason,
      target_country, target_city, target_language, metric_geography_scope,
      market_search_volume, volume_status, volume_source, competition_level,
      cpc_estimate, relative_trend_index, trend_direction, gsc_clicks,
      gsc_impressions, gsc_ctr, gsc_avg_position, gsc_observed_url, cluster_id,
      cluster_name, workflow_state, assigned_to, strategist_notes,
      score_breakdown_json, opportunity_score, approved_by, approved_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(tenant_id, project_id, normalized_keyword, target_country, target_language)
    DO UPDATE SET
      research_run_id = COALESCE(excluded.research_run_id, keyword_intelligence_records.research_run_id),
      keyword = excluded.keyword,
      seed_topic = COALESCE(excluded.seed_topic, keyword_intelligence_records.seed_topic),
      primary_source = excluded.primary_source,
      sources_json = excluded.sources_json,
      is_ai_suggestion = excluded.is_ai_suggestion,
      intent = excluded.intent,
      intent_inferred = excluded.intent_inferred,
      intent_verified_by = excluded.intent_verified_by,
      intent_confidence = excluded.intent_confidence,
      intent_reason = excluded.intent_reason,
      target_city = excluded.target_city,
      metric_geography_scope = excluded.metric_geography_scope,
      market_search_volume = excluded.market_search_volume,
      volume_status = excluded.volume_status,
      volume_source = excluded.volume_source,
      competition_level = excluded.competition_level,
      cpc_estimate = excluded.cpc_estimate,
      relative_trend_index = excluded.relative_trend_index,
      trend_direction = excluded.trend_direction,
      gsc_clicks = excluded.gsc_clicks,
      gsc_impressions = excluded.gsc_impressions,
      gsc_ctr = excluded.gsc_ctr,
      gsc_avg_position = excluded.gsc_avg_position,
      gsc_observed_url = excluded.gsc_observed_url,
      cluster_id = excluded.cluster_id,
      cluster_name = excluded.cluster_name,
      workflow_state = excluded.workflow_state,
      assigned_to = excluded.assigned_to,
      strategist_notes = excluded.strategist_notes,
      score_breakdown_json = excluded.score_breakdown_json,
      opportunity_score = excluded.opportunity_score,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_at = excluded.updated_at
  `).run(
    record.id,
    record.tenantId,
    record.projectId,
    record.researchRunId,
    record.keyword,
    record.normalizedKeyword,
    record.seedTopic,
    record.primarySource,
    JSON.stringify(record.sources),
    record.isAiSuggestion ? 1 : 0,
    record.intent,
    record.intentInferred ? 1 : 0,
    record.intentVerifiedBy,
    record.intentConfidence,
    record.intentReason,
    record.targetCountry,
    record.targetCity,
    record.targetLanguage,
    record.metricGeographyScope,
    record.marketSearchVolume,
    record.volumeStatus,
    record.volumeSource,
    record.competitionLevel,
    record.cpcEstimate,
    record.relativeTrendIndex,
    record.trendDirection,
    record.gscClicks,
    record.gscImpressions,
    record.gscCtr,
    record.gscAvgPosition,
    record.gscObservedUrl,
    record.clusterId,
    record.clusterName,
    record.workflowState,
    record.assignedTo,
    record.strategistNotes,
    JSON.stringify(record.scoreBreakdown),
    record.opportunityScore,
    record.approvedBy,
    record.approvedAt,
    record.createdAt,
    record.updatedAt,
  );
  return record;
}

export function listKeywordIntelligenceRecords(
  tenantId: string,
  projectId: string,
): KeywordIntelligenceRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM keyword_intelligence_records WHERE tenant_id = ? AND project_id = ? ORDER BY opportunity_score DESC, updated_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];

  const mappings = listKeywordUrlMappings(tenantId, projectId);
  const mappingMap = new Map<string, KeywordUrlMappingRecord>(
    mappings.map((m) => [m.keywordId, m]),
  );

  const evidenceList = listKeywordEvidenceForProject(tenantId, projectId);
  const evidenceMap = new Map<string, KeywordEvidenceItem[]>();
  for (const ev of evidenceList) {
    const arr = evidenceMap.get(ev.keywordId) ?? [];
    arr.push(ev);
    evidenceMap.set(ev.keywordId, arr);
  }

  return rows.map((r) => mapKeywordIntelligenceRow(r, mappingMap, evidenceMap));
}

export function getKeywordIntelligenceRecordById(
  tenantId: string,
  keywordId: string,
): KeywordIntelligenceRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM keyword_intelligence_records WHERE tenant_id = ? AND id = ?',
    )
    .get(tenantId, keywordId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const projectId = String(row.project_id);
  const mappingRow = db
    .prepare(
      'SELECT * FROM keyword_url_mappings WHERE tenant_id = ? AND project_id = ? AND keyword_id = ?',
    )
    .get(tenantId, projectId, keywordId) as Record<string, unknown> | undefined;
  const mappingMap = new Map<string, KeywordUrlMappingRecord>();
  if (mappingRow) {
    mappingMap.set(keywordId, mapKeywordMappingRow(mappingRow));
  }

  const evidenceRows = db
    .prepare(
      'SELECT * FROM keyword_evidence_items WHERE tenant_id = ? AND keyword_id = ? ORDER BY collected_at DESC',
    )
    .all(tenantId, keywordId) as Record<string, unknown>[];
  const evidenceMap = new Map<string, KeywordEvidenceItem[]>([
    [keywordId, evidenceRows.map(mapKeywordEvidenceRow)],
  ]);

  return mapKeywordIntelligenceRow(row, mappingMap, evidenceMap);
}

function mapKeywordClusterRow(row: Record<string, unknown>): KeywordCluster {
  const keywordIds = parseJsonSafe<string[]>(row.keyword_ids_json, []);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    clusterName: String(row.cluster_name),
    coreTopic: String(row.core_topic),
    primaryKeywordId: row.primary_keyword_id ? String(row.primary_keyword_id) : null,
    primaryKeyword: String(row.primary_keyword),
    keywordIds,
    keywordsCount: keywordIds.length,
    intentDistribution: parseJsonSafe<Record<KeywordIntent, number>>(
      row.intent_distribution_json,
      {
        Informational: 0,
        Navigational: 0,
        Commercial: 0,
        Transactional: 0,
        Local: 0,
      },
    ),
    dominantIntent: row.dominant_intent as KeywordIntent,
    suggestedLandingUrl: row.suggested_landing_url
      ? String(row.suggested_landing_url)
      : null,
    recommendedPageType: String(row.recommended_page_type ?? 'Service / Topic Page'),
    contentGaps: parseJsonSafe<string[]>(row.content_gaps_json, []),
    cohesionScore: Number(row.cohesion_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    evidenceSummary: String(row.evidence_summary ?? ''),
    approvalState: (row.approval_state ??
      'pending_review') as KeywordCluster['approvalState'],
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    mergedIntoClusterId: row.merged_into_cluster_id
      ? String(row.merged_into_cluster_id)
      : null,
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function upsertKeywordCluster(cluster: KeywordCluster): KeywordCluster {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO keyword_clusters (
      id, tenant_id, project_id, cluster_name, core_topic, primary_keyword_id,
      primary_keyword, keyword_ids_json, intent_distribution_json, dominant_intent,
      suggested_landing_url, recommended_page_type, content_gaps_json,
      cohesion_score, confidence, evidence_summary, approval_state, approved_by,
      approved_at, merged_into_cluster_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cluster_name = excluded.cluster_name,
      core_topic = excluded.core_topic,
      primary_keyword_id = excluded.primary_keyword_id,
      primary_keyword = excluded.primary_keyword,
      keyword_ids_json = excluded.keyword_ids_json,
      intent_distribution_json = excluded.intent_distribution_json,
      dominant_intent = excluded.dominant_intent,
      suggested_landing_url = excluded.suggested_landing_url,
      recommended_page_type = excluded.recommended_page_type,
      content_gaps_json = excluded.content_gaps_json,
      cohesion_score = excluded.cohesion_score,
      confidence = excluded.confidence,
      evidence_summary = excluded.evidence_summary,
      approval_state = excluded.approval_state,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      merged_into_cluster_id = excluded.merged_into_cluster_id,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    cluster.id,
    cluster.tenantId,
    cluster.projectId,
    cluster.clusterName,
    cluster.coreTopic,
    cluster.primaryKeywordId,
    cluster.primaryKeyword,
    JSON.stringify(cluster.keywordIds),
    JSON.stringify(cluster.intentDistribution),
    cluster.dominantIntent,
    cluster.suggestedLandingUrl,
    cluster.recommendedPageType,
    JSON.stringify(cluster.contentGaps),
    cluster.cohesionScore,
    cluster.confidence,
    cluster.evidenceSummary,
    cluster.approvalState,
    cluster.approvedBy,
    cluster.approvedAt,
    cluster.mergedIntoClusterId,
    cluster.notes,
    cluster.createdAt,
    cluster.updatedAt,
  );
  return cluster;
}

export function listKeywordClusters(
  tenantId: string,
  projectId: string,
): KeywordCluster[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM keyword_clusters WHERE tenant_id = ? AND project_id = ? AND merged_into_cluster_id IS NULL ORDER BY updated_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapKeywordClusterRow);
}

export function getKeywordClusterById(
  tenantId: string,
  clusterId: string,
): KeywordCluster | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM keyword_clusters WHERE tenant_id = ? AND id = ?')
    .get(tenantId, clusterId) as Record<string, unknown> | undefined;
  return row ? mapKeywordClusterRow(row) : null;
}

export function deleteUnapprovedAutoClusters(
  tenantId: string,
  projectId: string,
): void {
  const db = getAuditDb();
  db.prepare(
    "DELETE FROM keyword_clusters WHERE tenant_id = ? AND project_id = ? AND approval_state = 'pending_review'",
  ).run(tenantId, projectId);
}

export function listLatestCrawledPagesForProject(
  tenantId: string,
  projectId: string,
  limit = 150,
): (CrawledPageOption & { headings: string[] })[] {
  const db = getAuditDb();
  const latest = db
    .prepare(
      "SELECT id FROM crawl_runs WHERE tenant_id = ? AND project_id = ? AND status IN ('Succeeded', 'Partial', 'Completed', 'Completed with Warnings') ORDER BY started_at DESC LIMIT 1",
    )
    .get(tenantId, projectId) as { id: string } | undefined;
  if (!latest) return [];

  const rows = db
    .prepare(
      'SELECT normalized_url, title, h1, headings_json, status_code, indexability FROM crawl_urls WHERE tenant_id = ? AND crawl_id = ? ORDER BY depth ASC, normalized_url ASC LIMIT ?',
    )
    .all(tenantId, latest.id, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    url: String(r.normalized_url),
    title: r.title ? String(r.title) : null,
    h1: r.h1 ? String(r.h1) : null,
    headings: parseJsonSafe<string[]>(r.headings_json, []),
    statusCode: Number(r.status_code ?? 0),
    indexability: String(r.indexability ?? 'Unknown'),
  }));
}

export function listKeywordAuditTrail(
  tenantId: string,
  entityIds: string[],
  limit = 40,
) {
  const db = getAuditDb();
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM audit_trail
       WHERE tenant_id = ? AND entity_type IN ('keyword', 'keyword_cluster', 'keyword_profile', 'keyword_mapping')
         AND entity_id IN (${placeholders})
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, ...entityIds, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actorName: String(r.actor_name),
    actorRole: String(r.actor_role),
    previousState: String(r.previous_state),
    newState: String(r.new_state),
    reason: String(r.reason),
    timestamp: String(r.timestamp),
  }));
}

export type { CannibalizationAlert };

// ===========================================================================
// Phase 8: Geographic Search Intelligence Persistence Helpers
// ===========================================================================

function mapGeoTargetMarketRow(row: Record<string, unknown>): GeoTargetMarket {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    granularity: (row.granularity ?? 'country') as GeoGranularity,
    countryCode: String(row.country_code),
    countryName: String(row.country_name),
    isoNumeric: String(row.iso_numeric ?? ''),
    stateRegion: String(row.state_region ?? ''),
    stateFips: row.state_fips ? String(row.state_fips) : null,
    city: String(row.city ?? ''),
    language: String(row.language ?? 'en'),
    serviceAreas: parseJsonSafe<string[]>(row.service_areas_json, []),
    priority: (row.priority ?? 'secondary') as GeoMarketPriority,
    approvalStatus: (row.approval_status ??
      'pending_owner_approval') as GeoMarketApprovalStatus,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    recommendedBy: row.recommended_by ? String(row.recommended_by) : null,
    recommendedReason: String(row.recommended_reason ?? ''),
    latitude:
      row.latitude !== null && row.latitude !== undefined
        ? Number(row.latitude)
        : null,
    longitude:
      row.longitude !== null && row.longitude !== undefined
        ? Number(row.longitude)
        : null,
    approvalHistory: parseJsonSafe<GeoApprovalHistoryEntry[]>(
      row.approval_history_json,
      [],
    ),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listGeoTargetMarkets(
  tenantId: string,
  projectId: string,
): GeoTargetMarket[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM geo_target_markets
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY CASE priority WHEN 'primary' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END ASC, updated_at DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapGeoTargetMarketRow);
}

export function getGeoTargetMarketById(
  tenantId: string,
  marketId: string,
): GeoTargetMarket | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM geo_target_markets WHERE tenant_id = ? AND id = ?')
    .get(tenantId, marketId) as Record<string, unknown> | undefined;
  return row ? mapGeoTargetMarketRow(row) : null;
}

export function upsertGeoTargetMarket(market: GeoTargetMarket): GeoTargetMarket {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO geo_target_markets (
      id, tenant_id, project_id, granularity, country_code, country_name,
      iso_numeric, state_region, state_fips, city, language, service_areas_json,
      priority, approval_status, approved_by, approved_at, recommended_by,
      recommended_reason, latitude, longitude, approval_history_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, country_code, state_region, city, language)
    DO UPDATE SET
      granularity = excluded.granularity,
      country_name = excluded.country_name,
      iso_numeric = excluded.iso_numeric,
      state_fips = excluded.state_fips,
      service_areas_json = excluded.service_areas_json,
      priority = excluded.priority,
      approval_status = excluded.approval_status,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      recommended_by = excluded.recommended_by,
      recommended_reason = excluded.recommended_reason,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      approval_history_json = excluded.approval_history_json,
      updated_at = excluded.updated_at
  `).run(
    market.id,
    market.tenantId,
    market.projectId,
    market.granularity,
    market.countryCode,
    market.countryName,
    market.isoNumeric,
    market.stateRegion,
    market.stateFips,
    market.city,
    market.language,
    JSON.stringify(market.serviceAreas),
    market.priority,
    market.approvalStatus,
    market.approvedBy,
    market.approvedAt,
    market.recommendedBy,
    market.recommendedReason,
    market.latitude,
    market.longitude,
    JSON.stringify(market.approvalHistory),
    market.createdAt,
    market.updatedAt,
  );
  return market;
}

export function deleteGeoTargetMarket(tenantId: string, marketId: string): boolean {
  const db = getAuditDb();
  const result = db
    .prepare('DELETE FROM geo_target_markets WHERE tenant_id = ? AND id = ?')
    .run(tenantId, marketId);
  db.prepare('DELETE FROM geo_url_mappings WHERE tenant_id = ? AND market_id = ?').run(
    tenantId,
    marketId,
  );
  return Number(result.changes ?? 0) > 0;
}

function mapGeoMeasurementRow(row: Record<string, unknown>): GeoMeasurementRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    marketId: row.market_id ? String(row.market_id) : null,
    granularity: row.granularity as GeoGranularity,
    locationKey: String(row.location_key),
    locationLabel: String(row.location_label),
    countryCode: String(row.country_code),
    countryName: String(row.country_name),
    isoNumeric: String(row.iso_numeric ?? ''),
    stateRegion: String(row.state_region ?? ''),
    city: String(row.city ?? ''),
    latitude:
      row.latitude !== null && row.latitude !== undefined
        ? Number(row.latitude)
        : null,
    longitude:
      row.longitude !== null && row.longitude !== undefined
        ? Number(row.longitude)
        : null,
    gscClicks:
      row.gsc_clicks !== null && row.gsc_clicks !== undefined
        ? Number(row.gsc_clicks)
        : null,
    gscImpressions:
      row.gsc_impressions !== null && row.gsc_impressions !== undefined
        ? Number(row.gsc_impressions)
        : null,
    gscCtr:
      row.gsc_ctr !== null && row.gsc_ctr !== undefined
        ? Number(row.gsc_ctr)
        : null,
    gscAvgPosition:
      row.gsc_avg_position !== null && row.gsc_avg_position !== undefined
        ? Number(row.gsc_avg_position)
        : null,
    gscGranularityNote: String(row.gsc_granularity_note ?? ''),
    relativeTrendIndex:
      row.relative_trend_index !== null && row.relative_trend_index !== undefined
        ? Number(row.relative_trend_index)
        : null,
    trendDirection: (row.trend_direction ??
      'unavailable') as GeoMeasurementRecord['trendDirection'],
    trendsNote: String(row.trends_note ?? ''),
    gbpLocationsCount:
      row.gbp_locations_count !== null && row.gbp_locations_count !== undefined
        ? Number(row.gbp_locations_count)
        : null,
    gbpVisibilityNote: String(row.gbp_visibility_note ?? ''),
    trackedRankPosition:
      row.tracked_rank_position !== null && row.tracked_rank_position !== undefined
        ? Number(row.tracked_rank_position)
        : null,
    trackedRankProvider: row.tracked_rank_provider
      ? String(row.tracked_rank_provider)
      : null,
    rankTrackingNote: String(row.rank_tracking_note ?? ''),
    provenance: parseJsonSafe<GeoDataProvenance>(row.provenance_json, {
      source: 'Unknown',
      collectedAt: null,
      reportingPeriod: 'Not collected',
      measurementStatus: 'unavailable',
      granularity: 'country',
      methodology: '',
      limitations: '',
    }),
    collectedAt: String(row.collected_at),
  };
}

export function listGeoMeasurements(
  tenantId: string,
  projectId: string,
): GeoMeasurementRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM geo_measurements WHERE tenant_id = ? AND project_id = ? ORDER BY COALESCE(gsc_impressions, -1) DESC, collected_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapGeoMeasurementRow);
}

export function upsertGeoMeasurement(
  rec: GeoMeasurementRecord,
): GeoMeasurementRecord {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO geo_measurements (
      id, tenant_id, project_id, market_id, granularity, location_key, location_label,
      country_code, country_name, iso_numeric, state_region, city, latitude, longitude,
      gsc_clicks, gsc_impressions, gsc_ctr, gsc_avg_position, gsc_granularity_note,
      relative_trend_index, trend_direction, trends_note,
      gbp_locations_count, gbp_visibility_note,
      tracked_rank_position, tracked_rank_provider, rank_tracking_note,
      provenance_json, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, granularity, location_key)
    DO UPDATE SET
      market_id = COALESCE(excluded.market_id, geo_measurements.market_id),
      location_label = excluded.location_label,
      country_name = excluded.country_name,
      iso_numeric = excluded.iso_numeric,
      latitude = COALESCE(excluded.latitude, geo_measurements.latitude),
      longitude = COALESCE(excluded.longitude, geo_measurements.longitude),
      gsc_clicks = COALESCE(excluded.gsc_clicks, geo_measurements.gsc_clicks),
      gsc_impressions = COALESCE(excluded.gsc_impressions, geo_measurements.gsc_impressions),
      gsc_ctr = COALESCE(excluded.gsc_ctr, geo_measurements.gsc_ctr),
      gsc_avg_position = COALESCE(excluded.gsc_avg_position, geo_measurements.gsc_avg_position),
      gsc_granularity_note = excluded.gsc_granularity_note,
      relative_trend_index = COALESCE(excluded.relative_trend_index, geo_measurements.relative_trend_index),
      trend_direction = CASE
        WHEN excluded.trend_direction != 'unavailable' THEN excluded.trend_direction
        ELSE geo_measurements.trend_direction
      END,
      trends_note = excluded.trends_note,
      gbp_locations_count = COALESCE(excluded.gbp_locations_count, geo_measurements.gbp_locations_count),
      gbp_visibility_note = excluded.gbp_visibility_note,
      tracked_rank_position = COALESCE(excluded.tracked_rank_position, geo_measurements.tracked_rank_position),
      tracked_rank_provider = COALESCE(excluded.tracked_rank_provider, geo_measurements.tracked_rank_provider),
      rank_tracking_note = excluded.rank_tracking_note,
      provenance_json = excluded.provenance_json,
      collected_at = excluded.collected_at
  `).run(
    rec.id,
    rec.tenantId,
    rec.projectId,
    rec.marketId,
    rec.granularity,
    rec.locationKey,
    rec.locationLabel,
    rec.countryCode,
    rec.countryName,
    rec.isoNumeric,
    rec.stateRegion,
    rec.city,
    rec.latitude,
    rec.longitude,
    rec.gscClicks,
    rec.gscImpressions,
    rec.gscCtr,
    rec.gscAvgPosition,
    rec.gscGranularityNote,
    rec.relativeTrendIndex,
    rec.trendDirection,
    rec.trendsNote,
    rec.gbpLocationsCount,
    rec.gbpVisibilityNote,
    rec.trackedRankPosition,
    rec.trackedRankProvider,
    rec.rankTrackingNote,
    JSON.stringify(rec.provenance),
    rec.collectedAt,
  );
  return rec;
}

function mapGeoUrlMappingRow(row: Record<string, unknown>): GeoUrlMappingRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    marketId: String(row.market_id),
    locationLabel: String(row.location_label),
    granularity: row.granularity as GeoGranularity,
    countryCode: String(row.country_code),
    stateRegion: String(row.state_region ?? ''),
    city: String(row.city ?? ''),
    targetUrl: row.target_url ? String(row.target_url) : null,
    mappingStatus: (row.mapping_status ?? 'unmapped') as GeoMappingStatus,
    recommendedSlug: row.recommended_slug ? String(row.recommended_slug) : null,
    pageTitle: row.page_title ? String(row.page_title) : null,
    pageH1: row.page_h1 ? String(row.page_h1) : null,
    pageStatusCode:
      row.page_status_code !== null && row.page_status_code !== undefined
        ? Number(row.page_status_code)
        : null,
    pageIndexable:
      row.page_indexable !== null && row.page_indexable !== undefined
        ? Boolean(row.page_indexable)
        : null,
    duplicateRisk: (row.duplicate_risk ??
      'none') as GeoUrlMappingRecord['duplicateRisk'],
    competingUrls: parseJsonSafe<string[]>(row.competing_urls_json, []),
    doorwayRiskWarning: row.doorway_risk_warning
      ? String(row.doorway_risk_warning)
      : null,
    resolutionRecommendation: row.resolution_recommendation
      ? String(row.resolution_recommendation)
      : null,
    approvalState: (row.approval_state ??
      'Pending') as GeoUrlMappingRecord['approvalState'],
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
  };
}

export function listGeoUrlMappings(
  tenantId: string,
  projectId: string,
): GeoUrlMappingRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM geo_url_mappings WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapGeoUrlMappingRow);
}

export function getGeoUrlMappingById(
  tenantId: string,
  mappingId: string,
): GeoUrlMappingRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM geo_url_mappings WHERE tenant_id = ? AND id = ?')
    .get(tenantId, mappingId) as Record<string, unknown> | undefined;
  return row ? mapGeoUrlMappingRow(row) : null;
}

export function upsertGeoUrlMapping(
  mapping: GeoUrlMappingRecord,
): GeoUrlMappingRecord {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO geo_url_mappings (
      id, tenant_id, project_id, market_id, location_label, granularity,
      country_code, state_region, city, target_url, mapping_status,
      recommended_slug, page_title, page_h1, page_status_code, page_indexable,
      duplicate_risk, competing_urls_json, doorway_risk_warning,
      resolution_recommendation, approval_state, approved_by, approved_at,
      updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, market_id)
    DO UPDATE SET
      location_label = excluded.location_label,
      granularity = excluded.granularity,
      country_code = excluded.country_code,
      state_region = excluded.state_region,
      city = excluded.city,
      target_url = excluded.target_url,
      mapping_status = excluded.mapping_status,
      recommended_slug = excluded.recommended_slug,
      page_title = excluded.page_title,
      page_h1 = excluded.page_h1,
      page_status_code = excluded.page_status_code,
      page_indexable = excluded.page_indexable,
      duplicate_risk = excluded.duplicate_risk,
      competing_urls_json = excluded.competing_urls_json,
      doorway_risk_warning = excluded.doorway_risk_warning,
      resolution_recommendation = excluded.resolution_recommendation,
      approval_state = excluded.approval_state,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    mapping.id,
    mapping.tenantId,
    mapping.projectId,
    mapping.marketId,
    mapping.locationLabel,
    mapping.granularity,
    mapping.countryCode,
    mapping.stateRegion,
    mapping.city,
    mapping.targetUrl,
    mapping.mappingStatus,
    mapping.recommendedSlug,
    mapping.pageTitle,
    mapping.pageH1,
    mapping.pageStatusCode,
    mapping.pageIndexable === null ? null : mapping.pageIndexable ? 1 : 0,
    mapping.duplicateRisk,
    JSON.stringify(mapping.competingUrls),
    mapping.doorwayRiskWarning,
    mapping.resolutionRecommendation,
    mapping.approvalState,
    mapping.approvedBy,
    mapping.approvedAt,
    mapping.updatedBy,
    mapping.updatedAt,
  );
  return mapping;
}

function mapGeoResearchRunRow(row: Record<string, unknown>): GeoResearchRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    targetCountry: String(row.target_country),
    targetStateRegion: String(row.target_state_region ?? ''),
    targetCity: String(row.target_city ?? ''),
    targetLanguage: String(row.target_language ?? 'en'),
    seedTerms: parseJsonSafe<string[]>(row.seed_terms_json, []),
    intentFocus: (row.intent_focus ?? 'all') as GeoResearchRun['intentFocus'],
    status: row.status as GeoResearchRun['status'],
    keywordsDiscovered: Number(row.keywords_discovered ?? 0),
    measurementsCollected: Number(row.measurements_collected ?? 0),
    opportunitiesGenerated: Number(row.opportunities_generated ?? 0),
    providerStatuses: parseJsonSafe<GeoProviderStatus[]>(
      row.provider_statuses_json,
      [],
    ),
    triggeredBy: String(row.triggered_by),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export function createGeoResearchRun(run: GeoResearchRun): GeoResearchRun {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO geo_research_runs (
      id, tenant_id, project_id, target_country, target_state_region, target_city,
      target_language, seed_terms_json, intent_focus, status,
      keywords_discovered, measurements_collected, opportunities_generated,
      provider_statuses_json, triggered_by, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.tenantId,
    run.projectId,
    run.targetCountry,
    run.targetStateRegion,
    run.targetCity,
    run.targetLanguage,
    JSON.stringify(run.seedTerms),
    run.intentFocus,
    run.status,
    run.keywordsDiscovered,
    run.measurementsCollected,
    run.opportunitiesGenerated,
    JSON.stringify(run.providerStatuses),
    run.triggeredBy,
    run.startedAt,
    run.completedAt,
  );
  return run;
}

export function updateGeoResearchRun(
  tenantId: string,
  runId: string,
  patch: Partial<
    Pick<
      GeoResearchRun,
      | 'status'
      | 'keywordsDiscovered'
      | 'measurementsCollected'
      | 'opportunitiesGenerated'
      | 'providerStatuses'
      | 'completedAt'
    >
  >,
): GeoResearchRun | null {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM geo_research_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, runId) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const current = mapGeoResearchRunRow(existing);
  const next: GeoResearchRun = {
    ...current,
    ...patch,
  };

  db.prepare(`
    UPDATE geo_research_runs
    SET status = ?, keywords_discovered = ?, measurements_collected = ?,
        opportunities_generated = ?, provider_statuses_json = ?, completed_at = ?
    WHERE tenant_id = ? AND id = ?
  `).run(
    next.status,
    next.keywordsDiscovered,
    next.measurementsCollected,
    next.opportunitiesGenerated,
    JSON.stringify(next.providerStatuses),
    next.completedAt,
    tenantId,
    runId,
  );

  return next;
}

export function listGeoResearchRuns(
  tenantId: string,
  projectId: string,
  limit = 25,
): GeoResearchRun[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM geo_research_runs WHERE tenant_id = ? AND project_id = ? ORDER BY started_at DESC LIMIT ?',
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapGeoResearchRunRow);
}

export function listGeoAuditTrail(
  tenantId: string,
  entityIds: string[],
  limit = 40,
) {
  const db = getAuditDb();
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM audit_trail
       WHERE tenant_id = ? AND entity_type IN ('geo_market', 'geo_mapping')
         AND entity_id IN (${placeholders})
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, ...entityIds, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actorName: String(r.actor_name),
    actorRole: String(r.actor_role),
    previousState: String(r.previous_state),
    newState: String(r.new_state),
    reason: String(r.reason),
    timestamp: String(r.timestamp),
  }));
}

/* ---------------- Phase 9: Competitor & Content Gap Persistence ---------------- */

const DEFAULT_UNAVAILABLE_COMP_PROVENANCE: CompetitorDataProvenance = {
  source: 'No external crawl executed yet',
  collectedAt: null,
  reportingPeriod: 'Current',
  measurementStatus: 'unavailable',
  methodology: 'Awaiting SSRF-guarded live competitor HTML fetch',
  limitations: 'External domain authority, backlinks, and search volume unavailable without dedicated API keys.',
};

function mapCompetitorRow(row: Record<string, unknown>): CompetitorProfileRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    domain: String(row.domain),
    name: String(row.name),
    homepageUrl: String(row.homepage_url),
    category: (row.category as CompetitorCategory) ?? 'direct',
    targetMarkets: parseJsonSafe<string[]>(row.target_markets_json, []),
    discoveryOrigin: (row.discovery_origin as CompetitorDiscoveryOrigin) ?? 'manual',
    discoveryEvidence: String(row.discovery_evidence ?? ''),
    approvalStatus: (row.approval_status as CompetitorApprovalStatus) ?? 'pending_owner_approval',
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    recommendedBy: row.recommended_by ? String(row.recommended_by) : null,
    notes: String(row.notes ?? ''),
    lastAnalyzedAt: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
    analyzedPagesCount: Number(row.analyzed_pages_count ?? 0),
    externalDomainAuthority:
      row.external_domain_authority !== null && row.external_domain_authority !== undefined
        ? Number(row.external_domain_authority)
        : null,
    externalMonthlyTraffic:
      row.external_monthly_traffic !== null && row.external_monthly_traffic !== undefined
        ? Number(row.external_monthly_traffic)
        : null,
    externalBacklinksCount:
      row.external_backlinks_count !== null && row.external_backlinks_count !== undefined
        ? Number(row.external_backlinks_count)
        : null,
    provenance: parseJsonSafe<CompetitorDataProvenance>(
      row.provenance_json,
      DEFAULT_UNAVAILABLE_COMP_PROVENANCE,
    ),
    approvalHistory: parseJsonSafe<CompetitorApprovalHistoryEntry[]>(
      row.approval_history_json,
      [],
    ),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCompetitorPageRow(row: Record<string, unknown>): CompetitorPageSnapshot {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    competitorId: String(row.competitor_id),
    url: String(row.url),
    normalizedUrl: String(row.normalized_url),
    statusCode: Number(row.status_code ?? 0),
    contentType: String(row.content_type ?? ''),
    responseTimeMs: Number(row.response_time_ms ?? 0),
    title: String(row.title ?? ''),
    metaDescription: String(row.meta_description ?? ''),
    h1: String(row.h1 ?? ''),
    headings: parseJsonSafe<string[]>(row.headings_json, []),
    wordCount: Number(row.word_count ?? 0),
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    schemaTypes: parseJsonSafe<string[]>(row.schema_types_json, []),
    hasOpenGraph: Number(row.has_open_graph ?? 0) === 1,
    extractedTopics: parseJsonSafe<string[]>(row.extracted_topics_json, []),
    provenance: parseJsonSafe<CompetitorDataProvenance>(
      row.provenance_json,
      DEFAULT_UNAVAILABLE_COMP_PROVENANCE,
    ),
    fetchedAt: String(row.fetched_at),
  };
}

function mapCompetitorOverlapRow(row: Record<string, unknown>): CompetitorKeywordOverlapRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    competitorId: String(row.competitor_id),
    competitorDomain: String(row.competitor_domain),
    keyword: String(row.keyword),
    intent: (row.intent as KeywordIntent) ?? 'Informational',
    targetCountry: String(row.target_country ?? 'US'),
    projectCoverageStatus:
      (row.project_coverage_status as CompetitorKeywordOverlapRow['projectCoverageStatus']) ??
      'missing',
    projectUrl: row.project_url ? String(row.project_url) : null,
    competitorCoverageStatus:
      (row.competitor_coverage_status as CompetitorKeywordOverlapRow['competitorCoverageStatus']) ??
      'covered_on_page',
    competitorUrl: row.competitor_url ? String(row.competitor_url) : null,
    competitorMatchReason: String(row.competitor_match_reason ?? ''),
    projectGscImpressions:
      row.project_gsc_impressions !== null && row.project_gsc_impressions !== undefined
        ? Number(row.project_gsc_impressions)
        : null,
    projectGscClicks:
      row.project_gsc_clicks !== null && row.project_gsc_clicks !== undefined
        ? Number(row.project_gsc_clicks)
        : null,
    projectGscPosition:
      row.project_gsc_position !== null && row.project_gsc_position !== undefined
        ? Number(row.project_gsc_position)
        : null,
    competitorSerpPosition:
      row.competitor_serp_position !== null && row.competitor_serp_position !== undefined
        ? Number(row.competitor_serp_position)
        : null,
    externalSearchVolume:
      row.external_search_volume !== null && row.external_search_volume !== undefined
        ? Number(row.external_search_volume)
        : null,
    overlapType: (row.overlap_type as KeywordOverlapType) ?? 'competitor_only_gap',
    provenance: parseJsonSafe<CompetitorDataProvenance>(
      row.provenance_json,
      DEFAULT_UNAVAILABLE_COMP_PROVENANCE,
    ),
    collectedAt: String(row.collected_at),
  };
}

function mapContentGapRow(row: Record<string, unknown>): ContentGapRecommendation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    competitorId: String(row.competitor_id),
    competitorDomain: String(row.competitor_domain),
    gapType: (row.gap_type as ContentGapType) ?? 'missing_topic_page',
    topicTitle: String(row.topic_title),
    targetKeyword: String(row.target_keyword),
    targetMarket: String(row.target_market ?? 'Global'),
    projectUrl: row.project_url ? String(row.project_url) : null,
    projectWordCount:
      row.project_word_count !== null && row.project_word_count !== undefined
        ? Number(row.project_word_count)
        : null,
    projectTitle: row.project_title ? String(row.project_title) : null,
    projectH1: row.project_h1 ? String(row.project_h1) : null,
    projectSchemaTypes: parseJsonSafe<string[]>(row.project_schema_types_json, []),
    competitorUrl: String(row.competitor_url),
    competitorWordCount:
      row.competitor_word_count !== null && row.competitor_word_count !== undefined
        ? Number(row.competitor_word_count)
        : null,
    competitorTitle: row.competitor_title ? String(row.competitor_title) : null,
    competitorH1: row.competitor_h1 ? String(row.competitor_h1) : null,
    competitorHeadings: parseJsonSafe<string[]>(row.competitor_headings_json, []),
    competitorSchemaTypes: parseJsonSafe<string[]>(row.competitor_schema_types_json, []),
    opportunityScore:
      row.opportunity_score !== null && row.opportunity_score !== undefined
        ? Number(row.opportunity_score)
        : null,
    priorityTier: (row.priority_tier as ContentGapRecommendation['priorityTier']) ?? 'Needs Evidence',
    confidence: (row.confidence as ContentGapRecommendation['confidence']) ?? 'Low',
    explanation: String(row.explanation),
    supportingEvidence: parseJsonSafe<string[]>(row.supporting_evidence_json, []),
    missingInfo: parseJsonSafe<string[]>(row.missing_info_json, []),
    recommendedAction: String(row.recommended_action),
    recommendedBrief: parseJsonSafe<ContentGapBriefPlan>(row.recommended_brief_json, {
      targetSlug: '/',
      suggestedTitle: String(row.topic_title),
      suggestedH1: String(row.topic_title),
      suggestedSections: [],
      schemaSuggestion: [],
      geoAlignment: String(row.target_market ?? 'Global'),
    }),
    workflowState: (row.workflow_state as ContentGapWorkflowState) ?? 'discovered',
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    strategistNotes: String(row.strategist_notes ?? ''),
    linkedTicketId: row.linked_ticket_id ? String(row.linked_ticket_id) : null,
    linkedKeywordId: row.linked_keyword_id ? String(row.linked_keyword_id) : null,
    provenance: parseJsonSafe<CompetitorDataProvenance>(
      row.provenance_json,
      DEFAULT_UNAVAILABLE_COMP_PROVENANCE,
    ),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCompetitorRunRow(row: Record<string, unknown>): CompetitorResearchRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    competitorId: row.competitor_id ? String(row.competitor_id) : null,
    competitorDomain: String(row.competitor_domain),
    runKind: (row.run_kind as CompetitorResearchRun['runKind']) ?? 'page_analysis',
    urlsScanned: Number(row.urls_scanned ?? 0),
    topicsExtracted: Number(row.topics_extracted ?? 0),
    overlapsFound: Number(row.overlaps_found ?? 0),
    gapsIdentified: Number(row.gaps_identified ?? 0),
    status: (row.status as CompetitorResearchRun['status']) ?? 'Running',
    providerStatuses: parseJsonSafe<CompetitorProviderStatus[]>(
      row.provider_statuses_json,
      [],
    ),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
    triggeredBy: String(row.triggered_by),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export function listCompetitors(
  tenantId: string,
  projectId: string,
): CompetitorProfileRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM competitors WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapCompetitorRow);
}

export function getCompetitorById(
  tenantId: string,
  competitorId: string,
): CompetitorProfileRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM competitors WHERE tenant_id = ? AND id = ?')
    .get(tenantId, competitorId) as Record<string, unknown> | undefined;
  return row ? mapCompetitorRow(row) : null;
}

export function getCompetitorByDomain(
  tenantId: string,
  projectId: string,
  domain: string,
): CompetitorProfileRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM competitors WHERE tenant_id = ? AND project_id = ? AND LOWER(domain) = LOWER(?)',
    )
    .get(tenantId, projectId, domain) as Record<string, unknown> | undefined;
  return row ? mapCompetitorRow(row) : null;
}

export function upsertCompetitorRecord(
  comp: CompetitorProfileRecord,
): CompetitorProfileRecord {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO competitors (
      id, tenant_id, project_id, domain, name, homepage_url, category,
      target_markets_json, discovery_origin, discovery_evidence, approval_status,
      approved_by, approved_at, recommended_by, notes, last_analyzed_at,
      analyzed_pages_count, external_domain_authority, external_monthly_traffic,
      external_backlinks_count, provenance_json, approval_history_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, domain) DO UPDATE SET
      name = excluded.name,
      homepage_url = excluded.homepage_url,
      category = excluded.category,
      target_markets_json = excluded.target_markets_json,
      discovery_origin = excluded.discovery_origin,
      discovery_evidence = excluded.discovery_evidence,
      approval_status = excluded.approval_status,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      recommended_by = excluded.recommended_by,
      notes = excluded.notes,
      last_analyzed_at = excluded.last_analyzed_at,
      analyzed_pages_count = excluded.analyzed_pages_count,
      external_domain_authority = excluded.external_domain_authority,
      external_monthly_traffic = excluded.external_monthly_traffic,
      external_backlinks_count = excluded.external_backlinks_count,
      provenance_json = excluded.provenance_json,
      approval_history_json = excluded.approval_history_json,
      updated_at = excluded.updated_at
  `).run(
    comp.id,
    comp.tenantId,
    comp.projectId,
    comp.domain.toLowerCase(),
    comp.name,
    comp.homepageUrl,
    comp.category,
    JSON.stringify(comp.targetMarkets),
    comp.discoveryOrigin,
    comp.discoveryEvidence,
    comp.approvalStatus,
    comp.approvedBy,
    comp.approvedAt,
    comp.recommendedBy,
    comp.notes,
    comp.lastAnalyzedAt,
    comp.analyzedPagesCount,
    comp.externalDomainAuthority,
    comp.externalMonthlyTraffic,
    comp.externalBacklinksCount,
    JSON.stringify(comp.provenance),
    JSON.stringify(comp.approvalHistory),
    comp.createdAt,
    comp.updatedAt,
  );
  return getCompetitorByDomain(comp.tenantId, comp.projectId, comp.domain) ?? comp;
}

export function deleteCompetitorRecord(tenantId: string, competitorId: string): boolean {
  const db = getAuditDb();
  db.prepare('DELETE FROM competitor_pages WHERE tenant_id = ? AND competitor_id = ?').run(
    tenantId,
    competitorId,
  );
  db.prepare(
    'DELETE FROM competitor_keyword_overlaps WHERE tenant_id = ? AND competitor_id = ?',
  ).run(tenantId, competitorId);
  db.prepare('DELETE FROM content_gaps WHERE tenant_id = ? AND competitor_id = ?').run(
    tenantId,
    competitorId,
  );
  const res = db
    .prepare('DELETE FROM competitors WHERE tenant_id = ? AND id = ?')
    .run(tenantId, competitorId);
  return Number(res.changes) > 0;
}

export function listCompetitorPages(
  tenantId: string,
  projectId: string,
  competitorId?: string,
): CompetitorPageSnapshot[] {
  const db = getAuditDb();
  const rows = competitorId
    ? (db
        .prepare(
          'SELECT * FROM competitor_pages WHERE tenant_id = ? AND project_id = ? AND competitor_id = ? ORDER BY fetched_at DESC LIMIT 200',
        )
        .all(tenantId, projectId, competitorId) as Record<string, unknown>[])
    : (db
        .prepare(
          'SELECT * FROM competitor_pages WHERE tenant_id = ? AND project_id = ? ORDER BY fetched_at DESC LIMIT 200',
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapCompetitorPageRow);
}

export function upsertCompetitorPageSnapshot(
  page: CompetitorPageSnapshot,
): CompetitorPageSnapshot {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO competitor_pages (
      id, tenant_id, project_id, competitor_id, url, normalized_url, status_code,
      content_type, response_time_ms, title, meta_description, h1, headings_json,
      word_count, canonical_url, schema_types_json, has_open_graph,
      extracted_topics_json, provenance_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, competitor_id, normalized_url) DO UPDATE SET
      url = excluded.url,
      status_code = excluded.status_code,
      content_type = excluded.content_type,
      response_time_ms = excluded.response_time_ms,
      title = excluded.title,
      meta_description = excluded.meta_description,
      h1 = excluded.h1,
      headings_json = excluded.headings_json,
      word_count = excluded.word_count,
      canonical_url = excluded.canonical_url,
      schema_types_json = excluded.schema_types_json,
      has_open_graph = excluded.has_open_graph,
      extracted_topics_json = excluded.extracted_topics_json,
      provenance_json = excluded.provenance_json,
      fetched_at = excluded.fetched_at
  `).run(
    page.id,
    page.tenantId,
    page.projectId,
    page.competitorId,
    page.url,
    page.normalizedUrl,
    page.statusCode,
    page.contentType,
    page.responseTimeMs,
    page.title,
    page.metaDescription,
    page.h1,
    JSON.stringify(page.headings),
    page.wordCount,
    page.canonicalUrl,
    JSON.stringify(page.schemaTypes),
    page.hasOpenGraph ? 1 : 0,
    JSON.stringify(page.extractedTopics),
    JSON.stringify(page.provenance),
    page.fetchedAt,
  );
  return page;
}

export function listCompetitorOverlaps(
  tenantId: string,
  projectId: string,
  competitorId?: string,
): CompetitorKeywordOverlapRow[] {
  const db = getAuditDb();
  const rows = competitorId
    ? (db
        .prepare(
          'SELECT * FROM competitor_keyword_overlaps WHERE tenant_id = ? AND project_id = ? AND competitor_id = ? ORDER BY collected_at DESC LIMIT 300',
        )
        .all(tenantId, projectId, competitorId) as Record<string, unknown>[])
    : (db
        .prepare(
          'SELECT * FROM competitor_keyword_overlaps WHERE tenant_id = ? AND project_id = ? ORDER BY collected_at DESC LIMIT 300',
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapCompetitorOverlapRow);
}

export function upsertCompetitorOverlap(
  row: CompetitorKeywordOverlapRow,
): CompetitorKeywordOverlapRow {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO competitor_keyword_overlaps (
      id, tenant_id, project_id, competitor_id, competitor_domain, keyword, intent,
      target_country, project_coverage_status, project_url, competitor_coverage_status,
      competitor_url, competitor_match_reason, project_gsc_impressions, project_gsc_clicks,
      project_gsc_position, competitor_serp_position, external_search_volume,
      overlap_type, provenance_json, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, competitor_id, keyword) DO UPDATE SET
      intent = excluded.intent,
      target_country = excluded.target_country,
      project_coverage_status = excluded.project_coverage_status,
      project_url = excluded.project_url,
      competitor_coverage_status = excluded.competitor_coverage_status,
      competitor_url = excluded.competitor_url,
      competitor_match_reason = excluded.competitor_match_reason,
      project_gsc_impressions = excluded.project_gsc_impressions,
      project_gsc_clicks = excluded.project_gsc_clicks,
      project_gsc_position = excluded.project_gsc_position,
      competitor_serp_position = excluded.competitor_serp_position,
      external_search_volume = excluded.external_search_volume,
      overlap_type = excluded.overlap_type,
      provenance_json = excluded.provenance_json,
      collected_at = excluded.collected_at
  `).run(
    row.id,
    row.tenantId,
    row.projectId,
    row.competitorId,
    row.competitorDomain,
    row.keyword,
    row.intent,
    row.targetCountry,
    row.projectCoverageStatus,
    row.projectUrl,
    row.competitorCoverageStatus,
    row.competitorUrl,
    row.competitorMatchReason,
    row.projectGscImpressions,
    row.projectGscClicks,
    row.projectGscPosition,
    row.competitorSerpPosition,
    row.externalSearchVolume,
    row.overlapType,
    JSON.stringify(row.provenance),
    row.collectedAt,
  );
  return row;
}

export function listContentGaps(
  tenantId: string,
  projectId: string,
  competitorId?: string,
): ContentGapRecommendation[] {
  const db = getAuditDb();
  const rows = competitorId
    ? (db
        .prepare(
          'SELECT * FROM content_gaps WHERE tenant_id = ? AND project_id = ? AND competitor_id = ? ORDER BY updated_at DESC LIMIT 250',
        )
        .all(tenantId, projectId, competitorId) as Record<string, unknown>[])
    : (db
        .prepare(
          'SELECT * FROM content_gaps WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 250',
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapContentGapRow);
}

export function getContentGapById(
  tenantId: string,
  gapId: string,
): ContentGapRecommendation | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM content_gaps WHERE tenant_id = ? AND id = ?')
    .get(tenantId, gapId) as Record<string, unknown> | undefined;
  return row ? mapContentGapRow(row) : null;
}

export function upsertContentGap(
  gap: ContentGapRecommendation,
): ContentGapRecommendation {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO content_gaps (
      id, tenant_id, project_id, competitor_id, competitor_domain, gap_type,
      topic_title, target_keyword, target_market, project_url, project_word_count,
      project_title, project_h1, project_schema_types_json, competitor_url,
      competitor_word_count, competitor_title, competitor_h1, competitor_headings_json,
      competitor_schema_types_json, opportunity_score, priority_tier, confidence,
      explanation, supporting_evidence_json, missing_info_json, recommended_action,
      recommended_brief_json, workflow_state, approved_by, approved_at,
      strategist_notes, linked_ticket_id, linked_keyword_id, provenance_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, competitor_id, target_keyword, gap_type) DO UPDATE SET
      topic_title = excluded.topic_title,
      target_market = excluded.target_market,
      project_url = excluded.project_url,
      project_word_count = excluded.project_word_count,
      project_title = excluded.project_title,
      project_h1 = excluded.project_h1,
      project_schema_types_json = excluded.project_schema_types_json,
      competitor_url = excluded.competitor_url,
      competitor_word_count = excluded.competitor_word_count,
      competitor_title = excluded.competitor_title,
      competitor_h1 = excluded.competitor_h1,
      competitor_headings_json = excluded.competitor_headings_json,
      competitor_schema_types_json = excluded.competitor_schema_types_json,
      opportunity_score = excluded.opportunity_score,
      priority_tier = excluded.priority_tier,
      confidence = excluded.confidence,
      explanation = excluded.explanation,
      supporting_evidence_json = excluded.supporting_evidence_json,
      missing_info_json = excluded.missing_info_json,
      recommended_action = excluded.recommended_action,
      recommended_brief_json = excluded.recommended_brief_json,
      workflow_state = CASE
        WHEN content_gaps.workflow_state IN ('owner_approved', 'rejected', 'queued_for_content') THEN content_gaps.workflow_state
        ELSE excluded.workflow_state
      END,
      linked_ticket_id = COALESCE(content_gaps.linked_ticket_id, excluded.linked_ticket_id),
      linked_keyword_id = COALESCE(content_gaps.linked_keyword_id, excluded.linked_keyword_id),
      provenance_json = excluded.provenance_json,
      updated_at = excluded.updated_at
  `).run(
    gap.id,
    gap.tenantId,
    gap.projectId,
    gap.competitorId,
    gap.competitorDomain,
    gap.gapType,
    gap.topicTitle,
    gap.targetKeyword,
    gap.targetMarket,
    gap.projectUrl,
    gap.projectWordCount,
    gap.projectTitle,
    gap.projectH1,
    JSON.stringify(gap.projectSchemaTypes),
    gap.competitorUrl,
    gap.competitorWordCount,
    gap.competitorTitle,
    gap.competitorH1,
    JSON.stringify(gap.competitorHeadings),
    JSON.stringify(gap.competitorSchemaTypes),
    gap.opportunityScore,
    gap.priorityTier,
    gap.confidence,
    gap.explanation,
    JSON.stringify(gap.supportingEvidence),
    JSON.stringify(gap.missingInfo),
    gap.recommendedAction,
    JSON.stringify(gap.recommendedBrief),
    gap.workflowState,
    gap.approvedBy,
    gap.approvedAt,
    gap.strategistNotes,
    gap.linkedTicketId,
    gap.linkedKeywordId,
    JSON.stringify(gap.provenance),
    gap.createdAt,
    gap.updatedAt,
  );

  const reloaded = db
    .prepare(
      'SELECT * FROM content_gaps WHERE tenant_id = ? AND project_id = ? AND competitor_id = ? AND target_keyword = ? AND gap_type = ?',
    )
    .get(
      gap.tenantId,
      gap.projectId,
      gap.competitorId,
      gap.targetKeyword,
      gap.gapType,
    ) as Record<string, unknown> | undefined;
  return reloaded ? mapContentGapRow(reloaded) : gap;
}

export function updateContentGapDecisionInDb(
  tenantId: string,
  gapId: string,
  patch: {
    workflowState: ContentGapWorkflowState;
    approvedBy: string | null;
    approvedAt: string | null;
    strategistNotes: string;
    linkedTicketId: string | null;
    linkedKeywordId: string | null;
    updatedAt: string;
  },
): ContentGapRecommendation | null {
  const db = getAuditDb();
  db.prepare(`
    UPDATE content_gaps
    SET workflow_state = ?, approved_by = ?, approved_at = ?,
        strategist_notes = ?, linked_ticket_id = ?, linked_keyword_id = ?, updated_at = ?
    WHERE tenant_id = ? AND id = ?
  `).run(
    patch.workflowState,
    patch.approvedBy,
    patch.approvedAt,
    patch.strategistNotes,
    patch.linkedTicketId,
    patch.linkedKeywordId,
    patch.updatedAt,
    tenantId,
    gapId,
  );
  return getContentGapById(tenantId, gapId);
}

export function createCompetitorResearchRun(
  run: CompetitorResearchRun,
): CompetitorResearchRun {
  const db = getAuditDb();
  db.prepare(`
    INSERT INTO competitor_research_runs (
      id, tenant_id, project_id, competitor_id, competitor_domain, run_kind,
      urls_scanned, topics_extracted, overlaps_found, gaps_identified, status,
      provider_statuses_json, error_summary, triggered_by, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.tenantId,
    run.projectId,
    run.competitorId,
    run.competitorDomain,
    run.runKind,
    run.urlsScanned,
    run.topicsExtracted,
    run.overlapsFound,
    run.gapsIdentified,
    run.status,
    JSON.stringify(run.providerStatuses),
    run.errorSummary,
    run.triggeredBy,
    run.startedAt,
    run.completedAt,
  );
  return run;
}

export function updateCompetitorResearchRun(
  tenantId: string,
  runId: string,
  patch: Partial<
    Pick<
      CompetitorResearchRun,
      | 'urlsScanned'
      | 'topicsExtracted'
      | 'overlapsFound'
      | 'gapsIdentified'
      | 'status'
      | 'providerStatuses'
      | 'errorSummary'
      | 'completedAt'
    >
  >,
): CompetitorResearchRun | null {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM competitor_research_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, runId) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const current = mapCompetitorRunRow(existing);
  const next: CompetitorResearchRun = { ...current, ...patch };
  db.prepare(`
    UPDATE competitor_research_runs
    SET urls_scanned = ?, topics_extracted = ?, overlaps_found = ?, gaps_identified = ?,
        status = ?, provider_statuses_json = ?, error_summary = ?, completed_at = ?
    WHERE tenant_id = ? AND id = ?
  `).run(
    next.urlsScanned,
    next.topicsExtracted,
    next.overlapsFound,
    next.gapsIdentified,
    next.status,
    JSON.stringify(next.providerStatuses),
    next.errorSummary,
    next.completedAt,
    tenantId,
    runId,
  );
  return next;
}

export function listCompetitorResearchRuns(
  tenantId: string,
  projectId: string,
  limit = 25,
): CompetitorResearchRun[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM competitor_research_runs WHERE tenant_id = ? AND project_id = ? ORDER BY started_at DESC LIMIT ?',
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapCompetitorRunRow);
}

export function listProjectCrawledContentDetailed(
  tenantId: string,
  projectId: string,
  limit = 150,
): ProjectCrawledContentSummary[] {
  const db = getAuditDb();
  const latest = db
    .prepare(
      "SELECT id FROM crawl_runs WHERE tenant_id = ? AND project_id = ? AND status IN ('Succeeded', 'Partial', 'Completed', 'Completed with Warnings') ORDER BY started_at DESC LIMIT 1",
    )
    .get(tenantId, projectId) as { id: string } | undefined;
  if (!latest) return [];

  const rows = db
    .prepare(
      `SELECT normalized_url, title, meta_description, h1, headings_json,
              schema_types_json, status_code, response_time_ms, indexability
       FROM crawl_urls
       WHERE tenant_id = ? AND crawl_id = ?
       ORDER BY depth ASC, normalized_url ASC LIMIT ?`,
    )
    .all(tenantId, latest.id, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    url: String(r.normalized_url),
    title: r.title ? String(r.title) : null,
    metaDescription: r.meta_description ? String(r.meta_description) : null,
    h1: r.h1 ? String(r.h1) : null,
    headings: parseJsonSafe<string[]>(r.headings_json, []),
    schemaTypes: parseJsonSafe<string[]>(r.schema_types_json, []),
    statusCode: Number(r.status_code ?? 0),
    responseTimeMs: Number(r.response_time_ms ?? 0),
    indexability: String(r.indexability ?? 'Unknown'),
  }));
}

export function listCompetitorAuditTrail(
  tenantId: string,
  entityIds: string[],
  limit = 40,
): CompetitorAuditTrailItem[] {
  const db = getAuditDb();
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM audit_trail
       WHERE tenant_id = ? AND entity_type IN ('competitor', 'content_gap')
         AND entity_id IN (${placeholders})
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, ...entityIds, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    actorName: String(r.actor_name),
    actorRole: String(r.actor_role),
    previousState: String(r.previous_state),
    newState: String(r.new_state),
    reason: String(r.reason),
    timestamp: String(r.timestamp),
  }));
}




