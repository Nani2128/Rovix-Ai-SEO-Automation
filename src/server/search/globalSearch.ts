import type {
  GlobalSearchCrawlHit,
  GlobalSearchIssueHit,
  GlobalSearchResponse,
  GlobalSearchTaskHit,
} from '../../types/dashboard';
import { getAuditDb } from '../audit/db';

export function searchTenantEntities(params: {
  tenantId: string;
  projectId?: string;
  query: string;
  limit?: number;
}): GlobalSearchResponse {
  const db = getAuditDb();
  const rawQuery = params.query.trim();
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 25);
  const projectFilter = params.projectId?.trim() || null;

  const issueRows = (() => {
    if (!rawQuery) {
      return (projectFilter
        ? db
            .prepare(
              `SELECT ti.*, p.name AS project_name, p.website AS project_website
               FROM technical_issues ti
               LEFT JOIN projects p ON p.id = ti.project_id AND p.tenant_id = ti.tenant_id
               WHERE ti.tenant_id = ? AND ti.project_id = ? AND ti.status NOT IN ('Verified', 'Rejected')
               ORDER BY CASE ti.severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END, ti.affected_url_count DESC, ti.last_seen_at DESC
               LIMIT ?`,
            )
            .all(params.tenantId, projectFilter, limit)
        : db
            .prepare(
              `SELECT ti.*, p.name AS project_name, p.website AS project_website
               FROM technical_issues ti
               LEFT JOIN projects p ON p.id = ti.project_id AND p.tenant_id = ti.tenant_id
               WHERE ti.tenant_id = ? AND ti.status NOT IN ('Verified', 'Rejected')
               ORDER BY CASE ti.severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END, ti.affected_url_count DESC, ti.last_seen_at DESC
               LIMIT ?`,
            )
            .all(params.tenantId, limit)) as Record<string, unknown>[];
    }

    const pattern = `%${rawQuery.toLowerCase()}%`;
    return (db
      .prepare(
        `SELECT ti.*, p.name AS project_name, p.website AS project_website
         FROM technical_issues ti
         LEFT JOIN projects p ON p.id = ti.project_id AND p.tenant_id = ti.tenant_id
         WHERE ti.tenant_id = ?
           AND (
             LOWER(ti.title) LIKE ?
             OR LOWER(ti.rule_id) LIKE ?
             OR LOWER(ti.rule_name) LIKE ?
             OR LOWER(ti.category) LIKE ?
             OR LOWER(ti.severity) LIKE ?
             OR LOWER(ti.explanation) LIKE ?
             OR LOWER(COALESCE(p.name, '')) LIKE ?
             OR LOWER(COALESCE(p.website, '')) LIKE ?
           )
         ORDER BY CASE WHEN ti.project_id = COALESCE(?, '') THEN 0 ELSE 1 END,
                  CASE ti.severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END,
                  ti.last_seen_at DESC
         LIMIT ?`,
      )
      .all(
        params.tenantId,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        projectFilter ?? '',
        limit,
      )) as Record<string, unknown>[];
  })();

  const issues: GlobalSearchIssueHit[] = issueRows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: String(r.project_name ?? 'Project'),
    projectWebsite: String(r.project_website ?? ''),
    ruleId: String(r.rule_id),
    ruleName: String(r.rule_name),
    title: String(r.title),
    category: String(r.category),
    severity: r.severity as GlobalSearchIssueHit['severity'],
    status: String(r.status),
    affectedUrlCount: Number(r.affected_url_count ?? 1),
    lastCrawlId: String(r.last_crawl_id),
    updatedAt: String(r.last_seen_at ?? r.first_seen_at),
  }));

  const crawlRows = (() => {
    if (!rawQuery) {
      return (db
        .prepare(
          `SELECT cr.*, p.name AS project_name, p.website AS project_website
           FROM crawl_runs cr
           LEFT JOIN projects p ON p.id = cr.project_id AND p.tenant_id = cr.tenant_id
           WHERE cr.tenant_id = ?
           ORDER BY cr.started_at DESC
           LIMIT 5`,
        )
        .all(params.tenantId)) as Record<string, unknown>[];
    }
    const pattern = `%${rawQuery.toLowerCase()}%`;
    return (db
      .prepare(
        `SELECT cr.*, p.name AS project_name, p.website AS project_website
         FROM crawl_runs cr
         LEFT JOIN projects p ON p.id = cr.project_id AND p.tenant_id = cr.tenant_id
         WHERE cr.tenant_id = ?
           AND (
             LOWER(cr.id) LIKE ?
             OR LOWER(cr.status) LIKE ?
             OR LOWER(cr.crawl_type) LIKE ?
             OR LOWER(COALESCE(p.name, '')) LIKE ?
             OR LOWER(COALESCE(p.website, '')) LIKE ?
           )
         ORDER BY cr.started_at DESC
         LIMIT 6`,
      )
      .all(
        params.tenantId,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
      )) as Record<string, unknown>[];
  })();

  const crawls: GlobalSearchCrawlHit[] = crawlRows.map((r) => {
    let healthScore = 0;
    try {
      const sum = JSON.parse(String(r.summary_json ?? '{}')) as { healthScore?: number };
      healthScore = Number(sum.healthScore ?? 0);
    } catch {
      healthScore = 0;
    }
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: String(r.project_name ?? 'Project'),
      projectWebsite: String(r.project_website ?? ''),
      crawlType: String(r.crawl_type ?? 'full'),
      status: String(r.status),
      processedCount: Number(r.processed_count ?? 0),
      discoveredCount: Number(r.discovered_count ?? 0),
      errorCount: Number(r.error_count ?? 0),
      healthScore,
      startedAt: String(r.started_at),
    };
  });

  const taskRows = (() => {
    if (!rawQuery) {
      return (db
        .prepare(
          `SELECT dt.*, p.name AS project_name
           FROM developer_tickets dt
           LEFT JOIN projects p ON p.id = dt.project_id AND p.tenant_id = dt.tenant_id
           WHERE dt.tenant_id = ? AND dt.task_status NOT IN ('Verified', 'Closed')
           ORDER BY dt.updated_at DESC
           LIMIT 5`,
        )
        .all(params.tenantId)) as Record<string, unknown>[];
    }
    const pattern = `%${rawQuery.toLowerCase()}%`;
    return (db
      .prepare(
        `SELECT dt.*, p.name AS project_name
         FROM developer_tickets dt
         LEFT JOIN projects p ON p.id = dt.project_id AND p.tenant_id = dt.tenant_id
         WHERE dt.tenant_id = ?
           AND (
             LOWER(dt.title) LIKE ?
             OR LOWER(dt.description) LIKE ?
             OR LOWER(dt.task_status) LIKE ?
             OR LOWER(dt.responsible_role) LIKE ?
           )
         ORDER BY dt.updated_at DESC
         LIMIT 6`,
      )
      .all(params.tenantId, pattern, pattern, pattern, pattern)) as Record<string, unknown>[];
  })();

  const tasks: GlobalSearchTaskHit[] = taskRows.map((r) => ({
    id: String(r.id),
    issueId: String(r.issue_id),
    projectId: String(r.project_id),
    projectName: String(r.project_name ?? 'Project'),
    title: String(r.title),
    taskStatus: String(r.task_status),
    verificationStatus: String(r.verification_status),
    responsibleRole: String(r.responsible_role),
    updatedAt: String(r.updated_at),
  }));

  return {
    query: rawQuery,
    issues,
    crawls,
    tasks,
  };
}
