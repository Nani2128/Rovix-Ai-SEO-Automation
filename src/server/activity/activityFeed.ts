import type {
  ActivityCategory,
  ActivityEvent,
  RecentActivityFeedResponse,
} from '../../types/dashboard';
import { getAuditDb, listActivityEvents } from '../audit/db';

function classifySystemEvent(ev: ActivityEvent): ActivityCategory {
  if (ev.status === 'Failed' || ev.type === 'issue' || ev.type === 'integration_failure') {
    return 'error_report';
  }
  if (ev.status === 'Pending') {
    return 'pending_task';
  }
  if (ev.type === 'crawl' || ev.type === 'verification') {
    return 'crawl_completion';
  }
  return 'system';
}

export function buildUnifiedRecentActivityFeed(params: {
  tenantId: string;
  projectId?: string;
  limit?: number;
}): RecentActivityFeedResponse {
  const db = getAuditDb();
  const maxItems = Math.min(Math.max(params.limit ?? 30, 5), 60);
  const projectFilter = params.projectId?.trim() || null;

  const combined: ActivityEvent[] = [];

  // 1. Latest Crawl Runs (completions, active runs, and failed crawls)
  const crawlRows = (projectFilter
    ? db
        .prepare(
          `SELECT cr.*, p.name AS project_name, p.website AS project_website
           FROM crawl_runs cr
           LEFT JOIN projects p ON p.id = cr.project_id AND p.tenant_id = cr.tenant_id
           WHERE cr.tenant_id = ? AND cr.project_id = ?
           ORDER BY COALESCE(cr.completed_at, cr.started_at) DESC
           LIMIT 12`,
        )
        .all(params.tenantId, projectFilter)
    : db
        .prepare(
          `SELECT cr.*, p.name AS project_name, p.website AS project_website
           FROM crawl_runs cr
           LEFT JOIN projects p ON p.id = cr.project_id AND p.tenant_id = cr.tenant_id
           WHERE cr.tenant_id = ?
           ORDER BY COALESCE(cr.completed_at, cr.started_at) DESC
           LIMIT 12`,
        )
        .all(params.tenantId)) as Record<string, unknown>[];

  for (const r of crawlRows) {
    const statusRaw = String(r.status);
    const crawlId = String(r.id);
    const projectName = String(r.project_name ?? r.project_website ?? r.project_id);
    const processed = Number(r.processed_count ?? 0);
    const discovered = Number(r.discovered_count ?? 0);
    const errorCount = Number(r.error_count ?? 0);
    let healthScore = 0;
    try {
      const sum = JSON.parse(String(r.summary_json ?? '{}')) as { healthScore?: number };
      healthScore = Number(sum.healthScore ?? 0);
    } catch {
      healthScore = 0;
    }

    const mappedStatus: ActivityEvent['status'] =
      statusRaw === 'Failed'
        ? 'Failed'
        : statusRaw === 'Partial' || errorCount > 0
          ? 'Warning'
          : statusRaw === 'Running' || statusRaw === 'Queued'
            ? 'Pending'
            : 'Succeeded';

    const category: ActivityCategory =
      statusRaw === 'Failed'
        ? 'error_report'
        : statusRaw === 'Running' || statusRaw === 'Queued'
          ? 'pending_task'
          : 'crawl_completion';

    const verb =
      statusRaw === 'Failed'
        ? 'Failed crawl'
        : statusRaw === 'Running' || statusRaw === 'Queued'
          ? 'Running crawl'
          : statusRaw === 'Partial'
            ? 'Completed partial crawl'
            : 'Completed crawl';

    combined.push({
      id: `feed-crawl-${crawlId}`,
      type: 'crawl',
      category,
      actor: String(r.triggered_by ?? 'Crawler Engine'),
      action: `${verb} on ${projectName} (${processed}/${Math.max(processed, discovered)} URLs · Health ${healthScore}/100)`,
      detail:
        errorCount > 0
          ? `${errorCount} transport/HTTP error(s) encountered during crawl ${crawlId}.`
          : `Crawl ${crawlId} (${String(r.crawl_type ?? 'full')}) finished cleanly.`,
      projectId: String(r.project_id),
      timestamp: String(r.completed_at ?? r.started_at),
      status: mappedStatus,
      evidenceUrl:
        statusRaw === 'Succeeded' || statusRaw === 'Partial'
          ? `/audit/urls/${crawlId}`
          : `/audit/live/${crawlId}`,
    });
  }

  // 2. Latest Error Reports (open/active technical & performance issues)
  const issueRows = (projectFilter
    ? db
        .prepare(
          `SELECT ti.*, p.name AS project_name
           FROM technical_issues ti
           LEFT JOIN projects p ON p.id = ti.project_id AND p.tenant_id = ti.tenant_id
           WHERE ti.tenant_id = ? AND ti.project_id = ? AND ti.status NOT IN ('Verified', 'Rejected')
           ORDER BY ti.last_seen_at DESC
           LIMIT 12`,
        )
        .all(params.tenantId, projectFilter)
    : db
        .prepare(
          `SELECT ti.*, p.name AS project_name
           FROM technical_issues ti
           LEFT JOIN projects p ON p.id = ti.project_id AND p.tenant_id = ti.tenant_id
           WHERE ti.tenant_id = ? AND ti.status NOT IN ('Verified', 'Rejected')
           ORDER BY ti.last_seen_at DESC
           LIMIT 12`,
        )
        .all(params.tenantId)) as Record<string, unknown>[];

  for (const r of issueRows) {
    const severity = String(r.severity ?? 'Medium');
    const issueId = String(r.id);
    const affected = Number(r.affected_url_count ?? 1);
    const projName = String(r.project_name ?? r.project_id);
    const mappedStatus: ActivityEvent['status'] =
      severity === 'Critical' || severity === 'High' ? 'Failed' : 'Warning';

    combined.push({
      id: `feed-issue-${issueId}`,
      type: 'issue',
      category: 'error_report',
      actor: `${severity} Issue · ${projName}`,
      action: `[${String(r.rule_id)}] ${String(r.title)} (${affected} URL${affected === 1 ? '' : 's'})`,
      detail: `${String(r.category)} · Status: ${String(r.status)}`,
      projectId: String(r.project_id),
      timestamp: String(r.last_seen_at ?? r.first_seen_at),
      status: mappedStatus,
      evidenceUrl: `/audit/issues/${issueId}`,
    });
  }

  // 3. Pending Tasks (open/triaged/in-progress/ready-for-QA developer & content tasks)
  const ticketRows = (projectFilter
    ? db
        .prepare(
          `SELECT dt.*, p.name AS project_name
           FROM developer_tickets dt
           LEFT JOIN projects p ON p.id = dt.project_id AND p.tenant_id = dt.tenant_id
           WHERE dt.tenant_id = ? AND dt.project_id = ?
             AND dt.task_status NOT IN ('Verified', 'Closed')
           ORDER BY dt.updated_at DESC
           LIMIT 12`,
        )
        .all(params.tenantId, projectFilter)
    : db
        .prepare(
          `SELECT dt.*, p.name AS project_name
           FROM developer_tickets dt
           LEFT JOIN projects p ON p.id = dt.project_id AND p.tenant_id = dt.tenant_id
           WHERE dt.tenant_id = ?
             AND dt.task_status NOT IN ('Verified', 'Closed')
           ORDER BY dt.updated_at DESC
           LIMIT 12`,
        )
        .all(params.tenantId)) as Record<string, unknown>[];

  for (const r of ticketRows) {
    const ticketId = String(r.id);
    const taskStatus = String(r.task_status);
    const projName = String(r.project_name ?? r.project_id);
    combined.push({
      id: `feed-task-${ticketId}`,
      type: 'publishing',
      category: 'pending_task',
      actor: `${String(r.responsible_role)} · ${projName}`,
      action: `Pending Task (${taskStatus}): ${String(r.title)}`,
      detail: r.assigned_user
        ? `Assigned to ${String(r.assigned_user)} · Verification ${String(r.verification_status)}`
        : `Unassigned · Approval ${String(r.approval_status)}`,
      projectId: String(r.project_id),
      timestamp: String(r.updated_at ?? r.created_at),
      status: 'Pending',
      evidenceUrl: '/tasks',
    });
  }

  // 4. Persisted system_activity_events (deduplicating redundant "Started crawl" lines if crawl run row exists)
  const crawlIdsInFeed = new Set(crawlRows.map((c) => String(c.id)));
  const sysEvents = listActivityEvents(params.tenantId, projectFilter ?? undefined, 20);
  for (const ev of sysEvents) {
    // Avoid showing duplicate raw "Started crawl crw-..." alongside the rich crawl completion row for same id
    if (
      ev.type === 'crawl' &&
      Array.from(crawlIdsInFeed).some((cid) => ev.action.includes(cid))
    ) {
      continue;
    }
    combined.push({
      ...ev,
      category: ev.category ?? classifySystemEvent(ev),
    });
  }

  // Sort strictly descending by ISO timestamp
  combined.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const trimmed = combined.slice(0, maxItems);
  const counts = {
    all: trimmed.length,
    crawl_completion: trimmed.filter((e) => e.category === 'crawl_completion').length,
    error_report: trimmed.filter((e) => e.category === 'error_report').length,
    pending_task: trimmed.filter((e) => e.category === 'pending_task').length,
  };

  return {
    events: trimmed,
    counts,
    generatedAt: new Date().toISOString(),
  };
}
