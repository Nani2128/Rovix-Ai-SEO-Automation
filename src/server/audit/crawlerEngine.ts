import crypto from 'node:crypto';
import type { User, UserRole } from '../../types/auth';
import type {
  AuditOverviewResponse,
  CrawlComparisonResponse,
} from '../../types/audit';
import type {
  CrawlConfigurationData,
  CrawlEventRecord,
  CrawlJobState,
  CrawlRun,
  CrawlRunSummary,
  CrawlURLRecord,
  ProjectDomainVerification,
  RobotsAnalysisResult,
  SitemapAnalysisSummary,
  SitemapEntry,
  VerificationMethod,
} from '../../types/crawl';
import type {
  DeveloperTaskStatus,
  DeveloperTicket,
  IssueEvidence,
  IssueLifecycleStatus,
  TechnicalIssue,
  VerificationRun,
} from '../../types/technicalIssue';
import { isSandboxCrawlAllowed } from '../env';
import {
  ensureSandboxTestProject,
  getAuditDb,
  getProjectById,
  getProjectVerification,
  getSavedCrawlConfig,
  listAuditTrailForEntity,
  listCrawlEvents,
  listCrawlIssues,
  listCrawlRuns,
  listIssueEvidence,
  listProjectIssues,
  listTicketsForIssue,
  listTicketsForProject,
  listVerificationRuns,
  mapCrawlUrlRow,
  mapTicketRow,
  readObjectSnapshot,
  recordActivityEvent,
  recordAuditTrail,
  saveCrawlConfig,
  saveObjectSnapshot,
  upsertProjectVerification,
} from './db';
import { publishTenantActivityUpdate } from '../activity/activityBus';
import {
  emitRealAgentEvent,
  publishAutonomousDomainTrigger,
} from '../agentFactory/agentFactoryService';
import { findHeadlessBrowserPath, renderUrlInIsolatedBrowser } from './jsRenderer';
import { evaluateRobotsForUrl, parseRobotsTxt } from './robotsParser';
import { serveSandboxUrl } from './sandboxFixture';
import {
  isDomainWithinScope,
  matchesUrlPatterns,
  normalizeCanonicalDomain,
  normalizeCrawlUrl,
  SANDBOX_HOST,
  SecurityBlockedError,
  validateOutboundUrl,
} from './security';
import { parseSitemapXml } from './sitemapParser';
import {
  DETECTION_RULES,
  evaluateCrawlRules,
  extractHtmlSignals,
  groupIssuesByCategory,
  groupIssuesBySeverity,
} from './seoRulesEngine';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 5;
const REQUEST_TIMEOUT_MS = 8000;
const ALLOWED_MIME_PREFIXES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'text/plain',
];

const DEVELOPER_APPROVER_ROLES: readonly UserRole[] = ['Developer', 'Platform Admin'];
const LEAD_APPROVER_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'Project Manager',
  'SEO Strategist',
];
const TICKET_CREATOR_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Developer',
  'QA',
];
const CRAWL_OPERATOR_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Developer',
];

type SseListener = (event: CrawlEventRecord) => void;
const crawlSubscribers = new Map<string, Set<SseListener>>();
const cancelledCrawls = new Set<string>();
const activeCrawlPromises = new Map<string, Promise<void>>();

export function subscribeToCrawlEvents(
  crawlId: string,
  listener: SseListener,
): () => void {
  let set = crawlSubscribers.get(crawlId);
  if (!set) {
    set = new Set();
    crawlSubscribers.set(crawlId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      crawlSubscribers.delete(crawlId);
    }
  };
}

function emitCrawlEvent(
  tenantId: string,
  crawlId: string,
  eventType: CrawlEventRecord['eventType'],
  payload: Record<string, unknown>,
): CrawlEventRecord {
  const db = getAuditDb();
  const event: CrawlEventRecord = {
    id: `evt-${crypto.randomUUID().slice(0, 12)}`,
    tenantId,
    crawlId,
    eventType,
    payload,
    timestamp: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO crawl_events (id, tenant_id, crawl_id, event_type, event_payload_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    tenantId,
    crawlId,
    eventType,
    JSON.stringify(payload),
    event.timestamp,
  );

  const listeners = crawlSubscribers.get(crawlId);
  if (listeners) {
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        // Ignore broken SSE listener
      }
    }
  }

  return event;
}

function emptySummary(): CrawlRunSummary {
  return {
    statusDistribution: {},
    indexableCount: 0,
    nonIndexableCount: 0,
    redirectCount: 0,
    brokenCount: 0,
    issuesTotal: 0,
    issuesCritical: 0,
    issuesHigh: 0,
    issuesMedium: 0,
    issuesLow: 0,
    issuesInfo: 0,
    sitemapUrlCount: 0,
    sitemapOnlyCount: 0,
    jsRenderedCount: 0,
    jsRenderFailureCount: 0,
    healthScore: 0,
  };
}

function getProjectMeta(tenantId: string, projectId: string) {
  const existing = getProjectById(tenantId, projectId);
  if (existing) return existing;
  if (projectId === 'proj-rovix-main' && isSandboxCrawlAllowed()) {
    return ensureSandboxTestProject(tenantId, projectId);
  }
  return null;
}

export function getActiveCrawlCount(): number {
  const db = getAuditDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM crawl_runs WHERE status IN ('Queued', 'Running', 'Retrying')",
    )
    .get() as { cnt: number };
  return Number(row.cnt ?? 0);
}

export function isCrawlerRoleAllowed(role: UserRole): boolean {
  return CRAWL_OPERATOR_ROLES.includes(role);
}

export function isTicketCreatorAllowed(role: UserRole): boolean {
  return TICKET_CREATOR_ROLES.includes(role);
}

export function isDeveloperApprover(role: UserRole): boolean {
  return DEVELOPER_APPROVER_ROLES.includes(role);
}

export function isLeadApprover(role: UserRole): boolean {
  return LEAD_APPROVER_ROLES.includes(role);
}

export function recoverInterruptedCrawls(): void {
  const db = getAuditDb();
  const staleRows = db
    .prepare(
      "SELECT id, tenant_id, status FROM crawl_runs WHERE status IN ('Queued', 'Running', 'Retrying')",
    )
    .all() as { id: string; tenant_id: string; status: string }[];

  const now = new Date().toISOString();
  for (const row of staleRows) {
    db.prepare(
      "UPDATE crawl_runs SET status = 'Partial', completed_at = ? WHERE id = ?",
    ).run(now, row.id);
    emitCrawlEvent(row.tenant_id, row.id, 'crawl_completed', {
      status: 'Partial',
      reason: 'Server restarted while crawl was active; marked Partial for integrity.',
    });
  }
}

interface HttpHopOutcome {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  redirectChain: { url: string; statusCode: number; location: string | null }[];
  loopDetected: boolean;
  responseTimeMs: number;
  transportError?: string;
}

async function fetchUrlWithSafeguards(
  targetUrl: string,
  options: { allowSandboxHost: boolean },
): Promise<HttpHopOutcome> {
  const startMs = Date.now();
  const visitedInChain = new Set<string>();
  const redirectChain: { url: string; statusCode: number; location: string | null }[] = [];
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const validated = await validateOutboundUrl(currentUrl, {
      allowSandboxHost: options.allowSandboxHost,
    });
    const canonicalHop = validated.url.toString();

    if (visitedInChain.has(canonicalHop)) {
      return {
        requestedUrl: targetUrl,
        finalUrl: canonicalHop,
        statusCode: redirectChain[redirectChain.length - 1]?.statusCode ?? 302,
        headers: {},
        body: '',
        redirectChain,
        loopDetected: true,
        responseTimeMs: Date.now() - startMs,
      };
    }
    visitedInChain.add(canonicalHop);

    let statusCode = 0;
    const headers: Record<string, string> = {};
    let body = '';

    if (validated.isSandboxFixture) {
      const sb = serveSandboxUrl(canonicalHop);
      statusCode = sb.statusCode;
      for (const [k, v] of Object.entries(sb.headers)) {
        headers[k.toLowerCase()] = v;
      }
      body = sb.body;
    } else {
      const res = await fetch(canonicalHop, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'user-agent': 'RovixBot/1.0 (+https://rovixai.com/crawler)',
          accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      statusCode = res.status;
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });

      const contentType = headers['content-type'] ?? '';
      if (statusCode >= 200 && statusCode < 300) {
        const mimeAllowed =
          !contentType ||
          ALLOWED_MIME_PREFIXES.some((prefix) => contentType.toLowerCase().includes(prefix));
        if (!mimeAllowed) {
          throw new SecurityBlockedError(
            'UNSUPPORTED_MIME',
            `Skipped non-text MIME type "${contentType}"`,
          );
        }

        const contentLength = Number(headers['content-length'] ?? '0');
        if (contentLength > MAX_RESPONSE_BYTES) {
          throw new SecurityBlockedError(
            'RESPONSE_TOO_LARGE',
            `Response exceeds ${MAX_RESPONSE_BYTES} byte limit`,
          );
        }

        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_RESPONSE_BYTES) {
          throw new SecurityBlockedError(
            'RESPONSE_TOO_LARGE',
            `Response body exceeds ${MAX_RESPONSE_BYTES} byte limit`,
          );
        }
        body = Buffer.from(buf).toString('utf8');
      }
    }

    if (statusCode >= 300 && statusCode < 400 && headers['location']) {
      const nextUrl = new URL(headers['location'], canonicalHop).toString();
      redirectChain.push({
        url: canonicalHop,
        statusCode,
        location: nextUrl,
      });
      if (visitedInChain.has(nextUrl)) {
        return {
          requestedUrl: targetUrl,
          finalUrl: nextUrl,
          statusCode,
          headers,
          body: '',
          redirectChain,
          loopDetected: true,
          responseTimeMs: Date.now() - startMs,
        };
      }
      currentUrl = nextUrl;
      continue;
    }

    return {
      requestedUrl: targetUrl,
      finalUrl: canonicalHop,
      statusCode,
      headers,
      body,
      redirectChain,
      loopDetected: false,
      responseTimeMs: Date.now() - startMs,
    };
  }

  return {
    requestedUrl: targetUrl,
    finalUrl: currentUrl,
    statusCode: 310,
    headers: {},
    body: '',
    redirectChain,
    loopDetected: true,
    responseTimeMs: Date.now() - startMs,
  };
}

async function fetchWithRetry(
  url: string,
  opts: {
    allowSandboxHost: boolean;
    onRetry?: (attempt: number, reason: string, waitMs: number) => void;
  },
): Promise<HttpHopOutcome> {
  const maxAttempts = 3;
  let lastOutcome: HttpHopOutcome | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const outcome = await fetchUrlWithSafeguards(url, {
        allowSandboxHost: opts.allowSandboxHost,
      });
      if (outcome.statusCode === 429 || outcome.statusCode >= 500) {
        lastOutcome = outcome;
        if (attempt < maxAttempts) {
          const retryAfterRaw = Number(outcome.headers['retry-after'] ?? '0');
          const backoffMs =
            Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
              ? Math.min(retryAfterRaw * 1000, 3000)
              : opts.allowSandboxHost && url.includes(SANDBOX_HOST)
                ? 40 * attempt
                : 350 * attempt;
          opts.onRetry?.(attempt, `HTTP ${outcome.statusCode}`, backoffMs);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
      return outcome;
    } catch (err) {
      if (err instanceof SecurityBlockedError) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        const waitMs = 250 * attempt;
        opts.onRetry?.(
          attempt,
          err instanceof Error ? err.message : 'Network error',
          waitMs,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  if (lastOutcome) return lastOutcome;
  throw lastError instanceof Error ? lastError : new Error('Failed to fetch URL after retries');
}

function updateCrawlRunProgress(
  crawlId: string,
  updates: {
    status?: CrawlJobState;
    discoveredCount?: number;
    processedCount?: number;
    errorCount?: number;
    completedAt?: string | null;
    summary?: CrawlRunSummary;
    robotsSnapshotRef?: string | null;
    sitemapSummary?: SitemapAnalysisSummary | null;
  },
): void {
  const db = getAuditDb();
  const clauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    clauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.discoveredCount !== undefined) {
    clauses.push('discovered_count = ?');
    values.push(updates.discoveredCount);
  }
  if (updates.processedCount !== undefined) {
    clauses.push('processed_count = ?');
    values.push(updates.processedCount);
  }
  if (updates.errorCount !== undefined) {
    clauses.push('error_count = ?');
    values.push(updates.errorCount);
  }
  if (updates.completedAt !== undefined) {
    clauses.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  if (updates.summary !== undefined) {
    clauses.push('summary_json = ?');
    values.push(JSON.stringify(updates.summary));
  }
  if (updates.robotsSnapshotRef !== undefined) {
    clauses.push('robots_snapshot_ref = ?');
    values.push(updates.robotsSnapshotRef);
  }
  if (updates.sitemapSummary !== undefined) {
    clauses.push('sitemap_summary_json = ?');
    values.push(updates.sitemapSummary ? JSON.stringify(updates.sitemapSummary) : null);
  }

  if (clauses.length === 0) return;
  values.push(crawlId);
  db.prepare(`UPDATE crawl_runs SET ${clauses.join(', ')} WHERE id = ?`).run(...values);
}

export async function verifyProjectDomain(params: {
  tenantId: string;
  projectId: string;
  canonicalDomainInput: string;
  verificationMethod: VerificationMethod;
  crawlPolicyApproved: boolean;
  user: User;
}): Promise<ProjectDomainVerification> {
  if (!isCrawlerRoleAllowed(params.user.role)) {
    throw new Error('FORBIDDEN: Your role does not have permission to verify project domains.');
  }
  const project = getProjectMeta(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const canonicalDomain = normalizeCanonicalDomain(params.canonicalDomainInput);
  const existing = getProjectVerification(params.tenantId, params.projectId, project.website);

  const isSandbox = canonicalDomain === SANDBOX_HOST && isSandboxCrawlAllowed();
  if (!isSandbox) {
    await validateOutboundUrl(`https://${canonicalDomain}/`, { allowSandboxHost: false });
  }

  const updated = upsertProjectVerification({
    tenantId: params.tenantId,
    projectId: params.projectId,
    canonicalDomain,
    verificationMethod: params.verificationMethod,
    verified: true,
    crawlPolicyApproved: params.crawlPolicyApproved,
    actorName: params.user.name,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'project_verification',
    entityId: params.projectId,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.verified ? 'Verified' : 'Unverified',
    newState: updated.verified && updated.crawlPolicyApproved ? 'Verified & Policy Approved' : 'Verified',
    reason: `Domain ownership verified for ${canonicalDomain} via ${params.verificationMethod}`,
  });

  return updated;
}

export function getCrawlConfigResponse(tenantId: string, projectId: string) {
  const project = getProjectMeta(tenantId, projectId);
  if (!project) return null;
  const verification = getProjectVerification(tenantId, projectId, project.website);
  const saved = getSavedCrawlConfig(tenantId, projectId, verification.canonicalDomain);
  const runs = listCrawlRuns(tenantId, projectId);
  const previousCrawl = runs[0] ?? null;

  return {
    verification,
    configuration: saved,
    previousCrawl,
    estimatedScope: {
      estimatedMaxUrls: saved.maxPages,
      note:
        verification.canonicalDomain === SANDBOX_HOST && isSandboxCrawlAllowed()
          ? 'Controlled Rovix Sandbox fixture resolves locally with deterministic SEO conditions (~14 pages).'
          : `Bound by Max Pages (${saved.maxPages}), Max Depth (${saved.maxDepth}), and domain scope (${saved.scopeMode}).`,
    },
    policySummary: [
      `Target canonical domain: ${verification.canonicalDomain}`,
      `SSRF & private IP / metadata filtering enforced on every request and redirect hop.`,
      `Respects robots.txt: ${saved.respectRobotsTxt ? 'Yes' : 'Disabled by operator'}`,
      `Concurrency capped at ${saved.maxConcurrency} workers with ${saved.requestDelayMs}ms delay.`,
    ],
    rendererAvailable: findHeadlessBrowserPath() !== null,
  };
}

export function updateProjectCrawlConfig(params: {
  tenantId: string;
  projectId: string;
  config: Partial<CrawlConfigurationData>;
  user: User;
}): CrawlConfigurationData {
  if (!isCrawlerRoleAllowed(params.user.role)) {
    throw new Error('FORBIDDEN: Your role does not have permission to edit crawl configuration.');
  }
  const project = getProjectMeta(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }
  const verification = getProjectVerification(params.tenantId, params.projectId, project.website);
  const current = getSavedCrawlConfig(params.tenantId, params.projectId, verification.canonicalDomain);

  const next: CrawlConfigurationData = {
    ...current,
    ...params.config,
    projectId: params.projectId,
    maxPages: Math.max(1, Math.min(500, Number(params.config.maxPages ?? current.maxPages))),
    maxDepth: Math.max(0, Math.min(10, Number(params.config.maxDepth ?? current.maxDepth))),
    maxConcurrency: Math.max(1, Math.min(6, Number(params.config.maxConcurrency ?? current.maxConcurrency))),
    requestDelayMs: Math.max(0, Math.min(5000, Number(params.config.requestDelayMs ?? current.requestDelayMs))),
    includePatterns: Array.isArray(params.config.includePatterns)
      ? params.config.includePatterns
      : current.includePatterns,
    excludePatterns: Array.isArray(params.config.excludePatterns)
      ? params.config.excludePatterns
      : current.excludePatterns,
    queryAllowlist: Array.isArray(params.config.queryAllowlist)
      ? params.config.queryAllowlist
      : current.queryAllowlist,
  };

  return saveCrawlConfig(params.tenantId, params.projectId, next, params.user.name);
}

function upsertCrawlIssuesAndEvidence(params: {
  tenantId: string;
  projectId: string;
  crawlId: string;
  evaluation: ReturnType<typeof evaluateCrawlRules>;
  isReverification?: boolean;
}) {
  const { tenantId, projectId, crawlId, evaluation } = params;
  const db = getAuditDb();
  const now = new Date().toISOString();

  for (const grp of evaluation.findingsByRootCause.values()) {
    const existing = db
      .prepare(
        'SELECT id, status, first_seen_at FROM technical_issues WHERE tenant_id = ? AND project_id = ? AND root_cause_key = ?',
      )
      .get(tenantId, projectId, grp.rootCauseKey) as
      | { id: string; status: IssueLifecycleStatus; first_seen_at: string }
      | undefined;

    const affectedUrls = new Set(grp.evidenceItems.map((e) => e.url));
    const issueId = existing?.id ?? `iss-${crypto.randomUUID().slice(0, 10)}`;

    let nextStatus: IssueLifecycleStatus = existing?.status ?? 'Open';
    if (existing && existing.status === 'Verified') {
      // Regression detected in a subsequent crawl -> reopen
      nextStatus = 'Open';
    }

    if (existing) {
      db.prepare(`
        UPDATE technical_issues
        SET last_crawl_id = ?,
            severity = ?,
            title = ?,
            explanation = ?,
            impact = ?,
            recommended_fix = ?,
            responsible_role = ?,
            status = ?,
            confidence = ?,
            affected_url_count = ?,
            last_seen_at = ?,
            resolved_at = CASE WHEN ? = 'Open' THEN NULL ELSE resolved_at END
        WHERE id = ?
      `).run(
        crawlId,
        grp.rule.severity,
        grp.title,
        grp.rule.description,
        `${grp.rule.severity} impact on search indexability or technical SEO compliance (${affectedUrls.size} URL(s) affected).`,
        grp.rule.recommendedFix,
        grp.rule.responsibleRole,
        nextStatus,
        grp.rule.confidence,
        affectedUrls.size,
        now,
        nextStatus,
        issueId,
      );
    } else {
      db.prepare(`
        INSERT INTO technical_issues (
          id, tenant_id, project_id, last_crawl_id, rule_id, rule_name,
          category, severity, root_cause_key, title, explanation, impact,
          recommended_fix, responsible_role, status, confidence,
          affected_url_count, first_seen_at, last_seen_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        issueId,
        tenantId,
        projectId,
        crawlId,
        grp.rule.ruleId,
        grp.rule.ruleName,
        grp.rule.category,
        grp.rule.severity,
        grp.rootCauseKey,
        grp.title,
        grp.rule.description,
        `${grp.rule.severity} impact on search indexability or technical SEO compliance (${affectedUrls.size} URL(s) affected).`,
        grp.rule.recommendedFix,
        grp.rule.responsibleRole,
        'Open',
        grp.rule.confidence,
        affectedUrls.size,
        now,
        now,
      );
    }

    const evStmt = db.prepare(`
      INSERT INTO issue_evidence (
        id, tenant_id, issue_id, crawl_id, url_id, url,
        evidence_type, source, snippet, details_json, evidence_reference, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ev of grp.evidenceItems) {
      evStmt.run(
        `ev-${crypto.randomUUID().slice(0, 10)}`,
        tenantId,
        issueId,
        crawlId,
        ev.urlId,
        ev.url,
        ev.evidenceType,
        ev.source,
        ev.snippet,
        JSON.stringify(ev.details),
        ev.urlId ? `crawl://${crawlId}/url/${ev.urlId}` : `crawl://${crawlId}`,
        now,
      );
    }

    emitCrawlEvent(tenantId, crawlId, 'issue_detected', {
      issueId,
      ruleId: grp.rule.ruleId,
      severity: grp.rule.severity,
      title: grp.title,
      affectedUrlCount: affectedUrls.size,
    });
  }

  const urlCountStmt = db.prepare('UPDATE crawl_urls SET issue_count = ? WHERE id = ?');
  for (const [urlId, count] of evaluation.urlIssueCountMap.entries()) {
    urlCountStmt.run(count, urlId);
  }
}

async function executeCrawlPipeline(params: {
  crawlId: string;
  tenantId: string;
  projectId: string;
  config: CrawlConfigurationData;
  canonicalDomain: string;
  seedUrls?: string[];
}): Promise<void> {
  const { crawlId, tenantId, projectId, config, canonicalDomain } = params;
  const db = getAuditDb();
  const isSandboxProject = canonicalDomain === SANDBOX_HOST && isSandboxCrawlAllowed();
  const leadAgentId = params.seedUrls ? 'quality_assurance_agent' : 'technical_seo_agent';
  const taskTitle = params.seedUrls
    ? `QA Fix Reverification (${config.startingUrl})`
    : `Site Crawl (${config.startingUrl})`;

  try {
    updateCrawlRunProgress(crawlId, { status: 'Running' });
    emitCrawlEvent(tenantId, crawlId, 'crawl_started', {
      crawlId,
      startingUrl: config.startingUrl,
      maxPages: config.maxPages,
      maxDepth: config.maxDepth,
    });
    emitRealAgentEvent({
      eventType: 'workflow.started',
      tenantId,
      projectId,
      workflowId: crawlId,
      taskId: crawlId,
      agentId: 'orchestrator',
      status: 'running',
      taskTitle,
      summary: `Workflow ${crawlId} started for ${config.startingUrl}.`,
      evidenceUrl: `/audit/live/${crawlId}`,
    });
    emitRealAgentEvent({
      eventType: 'agent.communication',
      tenantId,
      projectId,
      workflowId: crawlId,
      taskId: crawlId,
      agentId: leadAgentId,
      sourceAgentId: 'orchestrator',
      destinationAgentId: leadAgentId,
      status: 'communicating',
      taskTitle,
      summary: `Dispatched ${taskTitle} from Orchestrator.`,
      evidenceUrl: `/audit/live/${crawlId}`,
    });
    emitRealAgentEvent({
      eventType: 'agent.started',
      tenantId,
      projectId,
      workflowId: crawlId,
      taskId: crawlId,
      agentId: leadAgentId,
      status: 'running',
      taskTitle,
      summary: `Executing ${taskTitle}.`,
      progressPct: 0,
      evidenceUrl: `/audit/live/${crawlId}`,
    });

    const originUrl = new URL(config.startingUrl).origin;

    // 1. Fetch & parse robots.txt
    let robotsAnalysis: RobotsAnalysisResult | null = null;
    try {
      const robotsUrl = `${originUrl}/robots.txt`;
      const robotsRes = await fetchWithRetry(robotsUrl, {
        allowSandboxHost: isSandboxProject,
      });
      robotsAnalysis = parseRobotsTxt(robotsRes.body, robotsUrl, robotsRes.statusCode);
      const robotsRef = saveObjectSnapshot(
        tenantId,
        `${crawlId}-robots`,
        robotsRes.body || `[HTTP ${robotsRes.statusCode}]`,
      );
      updateCrawlRunProgress(crawlId, { robotsSnapshotRef: robotsRef });
      emitCrawlEvent(tenantId, crawlId, 'robots_parsed', {
        accessible: robotsAnalysis.accessible,
        statusCode: robotsAnalysis.statusCode,
        sitemapsCount: robotsAnalysis.sitemaps.length,
        rulesCount: robotsAnalysis.groups.length,
      });
    } catch (err) {
      emitCrawlEvent(tenantId, crawlId, 'url_error', {
        url: `${originUrl}/robots.txt`,
        reason: err instanceof Error ? err.message : 'robots.txt fetch failed',
      });
    }

    // 2. Discover & parse XML sitemaps (supports sitemapindex recursion up to 10 sitemaps)
    const sitemapSet = new Set<string>();
    const sitemapEntries: SitemapEntry[] = [];
    const malformedSitemaps: { url: string; reason: string }[] = [];
    const discoveredSitemaps: string[] = [];

    if (config.discoverSitemaps) {
      const sitemapQueue = Array.from(
        new Set([...(robotsAnalysis?.sitemaps ?? []), `${originUrl}/sitemap.xml`]),
      );
      const visitedSitemaps = new Set<string>();

      while (sitemapQueue.length > 0 && visitedSitemaps.size < 10) {
        if (cancelledCrawls.has(crawlId)) break;
        const smUrl = sitemapQueue.shift()!;
        if (visitedSitemaps.has(smUrl)) continue;
        visitedSitemaps.add(smUrl);
        discoveredSitemaps.push(smUrl);

        try {
          const smRes = await fetchWithRetry(smUrl, {
            allowSandboxHost: isSandboxProject,
          });
          if (smRes.statusCode >= 200 && smRes.statusCode < 300) {
            const parsedSm = parseSitemapXml(smRes.body, smUrl);
            if (parsedSm.kind === 'sitemapindex') {
              for (const child of parsedSm.childSitemaps) {
                if (!visitedSitemaps.has(child)) sitemapQueue.push(child);
              }
            } else if (parsedSm.kind === 'urlset') {
              for (const entry of parsedSm.entries) {
                const norm = normalizeCrawlUrl(entry.loc, undefined, {
                  queryParamPolicy: config.queryParamPolicy,
                  queryAllowlist: config.queryAllowlist,
                });
                if (norm) {
                  sitemapSet.add(norm);
                  sitemapEntries.push({ ...entry, loc: norm });
                }
              }
            } else {
              malformedSitemaps.push({
                url: smUrl,
                reason: parsedSm.error ?? 'Malformed sitemap XML',
              });
            }
          } else if (smRes.statusCode !== 404) {
            malformedSitemaps.push({
              url: smUrl,
              reason: `HTTP ${smRes.statusCode}`,
            });
          }
        } catch (err) {
          malformedSitemaps.push({
            url: smUrl,
            reason: err instanceof Error ? err.message : 'Sitemap fetch error',
          });
        }
      }

      emitCrawlEvent(tenantId, crawlId, 'sitemap_parsed', {
        sitemapsChecked: visitedSitemaps.size,
        entriesCount: sitemapEntries.length,
        malformedCount: malformedSitemaps.length,
      });
    }

    // 3. Frontier queue setup
    interface FrontierItem {
      url: string;
      depth: number;
      parentUrl: string | null;
      discoverySource: CrawlURLRecord['discoverySource'];
    }

    const queue: FrontierItem[] = [];
    const seenFrontier = new Set<string>();
    const robotsBlockedDiscovered: { url: string; matchedRule: string }[] = [];
    const loopDetectedUrls: { url: string; chain: string[] }[] = [];
    const canonicalLinkCountsByUrl = new Map<string, number>();
    const crawledRecords: CrawlURLRecord[] = [];
    let transportErrors = 0;
    let seedFailed = false;

    const enqueueUrl = (
      rawUrl: string,
      depth: number,
      parentUrl: string | null,
      discoverySource: CrawlURLRecord['discoverySource'],
    ) => {
      if (depth > config.maxDepth) return;
      const norm = normalizeCrawlUrl(rawUrl, undefined, {
        queryParamPolicy: config.queryParamPolicy,
        queryAllowlist: config.queryAllowlist,
      });
      if (!norm) return;
      if (seenFrontier.has(norm)) return;

      let parsedNorm: URL;
      try {
        parsedNorm = new URL(norm);
      } catch {
        return;
      }

      if (!isDomainWithinScope(parsedNorm.hostname, canonicalDomain, config.scopeMode)) {
        return;
      }
      if (!matchesUrlPatterns(norm, config.includePatterns, config.excludePatterns)) {
        return;
      }

      if (config.respectRobotsTxt && robotsAnalysis?.accessible) {
        const evalRes = evaluateRobotsForUrl(
          `${parsedNorm.pathname}${parsedNorm.search}`,
          robotsAnalysis.groups,
        );
        if (!evalRes.allowed) {
          seenFrontier.add(norm);
          robotsBlockedDiscovered.push({
            url: norm,
            matchedRule: evalRes.matchedRule ?? 'Disallow',
          });
          return;
        }
      }

      seenFrontier.add(norm);
      queue.push({ url: norm, depth, parentUrl, discoverySource });
      emitCrawlEvent(tenantId, crawlId, 'url_discovered', {
        url: norm,
        depth,
        discoverySource,
        parentUrl,
      });
    };

    const initialSeeds = params.seedUrls && params.seedUrls.length > 0
      ? params.seedUrls
      : [config.startingUrl];

    for (const s of initialSeeds) {
      enqueueUrl(s, 0, null, 'seed');
    }
    if (!params.seedUrls) {
      for (const smUrl of sitemapSet) {
        enqueueUrl(smUrl, 1, null, 'sitemap');
      }
    }

    updateCrawlRunProgress(crawlId, { discoveredCount: seenFrontier.size });

    let processedCount = 0;
    let cursor = 0;

    const processOne = async (item: FrontierItem, isSeed: boolean) => {
      if (cancelledCrawls.has(crawlId)) return;

      if (config.requestDelayMs > 0 && processedCount > 0) {
        await new Promise((r) => setTimeout(r, config.requestDelayMs));
      }

      try {
        const outcome = await fetchWithRetry(item.url, {
          allowSandboxHost: isSandboxProject,
          onRetry: (attempt, reason, waitMs) => {
            updateCrawlRunProgress(crawlId, { status: 'Retrying' });
            emitCrawlEvent(tenantId, crawlId, 'url_retry', {
              url: item.url,
              attempt,
              reason,
              waitMs,
            });
            emitRealAgentEvent({
              eventType: 'agent.retrying',
              tenantId,
              projectId,
              workflowId: crawlId,
              taskId: crawlId,
              agentId: leadAgentId,
              status: 'retrying',
              taskTitle,
              summary: `Retrying ${item.url} (attempt ${attempt}): ${reason}`,
              evidenceUrl: `/audit/live/${crawlId}`,
            });
          },
        });
        updateCrawlRunProgress(crawlId, { status: 'Running' });

        if (outcome.loopDetected) {
          loopDetectedUrls.push({
            url: item.url,
            chain: [...outcome.redirectChain.map((h) => h.url), outcome.finalUrl],
          });
        }

        const contentType = outcome.headers['content-type'] ?? 'text/html';
        const xRobotsTag = outcome.headers['x-robots-tag'] ?? null;
        const isHtml = contentType.toLowerCase().includes('text/html') || contentType.toLowerCase().includes('xhtml');

        let signals = isHtml && outcome.body
          ? extractHtmlSignals(outcome.body, outcome.finalUrl, canonicalDomain)
          : {
              title: null,
              metaDescription: null,
              h1: null,
              headings: [],
              canonicalLinks: [],
              robotsDirectives: [],
              schemaTypes: [],
              schemaErrors: [],
              hreflangTags: [],
              internalLinks: [],
              externalLinks: [],
              missingAltCount: 0,
              hasViewport: true,
              htmlLang: null,
            };

        let renderingSource: CrawlURLRecord['renderingSource'] = 'raw_html';
        let renderedDiff: CrawlURLRecord['renderedDiff'] = null;
        let renderedDomObjectRef: string | null = null;

        const shouldRenderJs =
          config.enableJsRendering &&
          isHtml &&
          outcome.statusCode === 200 &&
          (outcome.body.includes('<script') || outcome.body.includes('id="root"') || outcome.body.includes('id="mount"'));

        if (shouldRenderJs) {
          const jsOut = await renderUrlInIsolatedBrowser({
            url: outcome.finalUrl,
            rawHtml: outcome.body,
            rawSignals: signals,
            rootDomain: canonicalDomain,
          });
          renderedDiff = jsOut.diff;
          if (jsOut.diff.status === 'ok' && jsOut.renderedSignals && jsOut.renderedHtml) {
            renderingSource = 'rendered_dom';
            renderedDomObjectRef = saveObjectSnapshot(
              tenantId,
              `${crawlId}-${crypto.randomUUID().slice(0, 8)}-dom`,
              jsOut.renderedHtml.slice(0, 120_000),
            );
            signals = jsOut.renderedSignals;
          }
        }

        const rawHtmlObjectRef = outcome.body
          ? saveObjectSnapshot(
              tenantId,
              `${crawlId}-${crypto.randomUUID().slice(0, 8)}-raw`,
              outcome.body.slice(0, 120_000),
            )
          : null;

        const urlId = `url-${crypto.randomUUID().slice(0, 10)}`;
        canonicalLinkCountsByUrl.set(item.url, signals.canonicalLinks.length);

        let canonicalUrl: string | null = signals.canonicalLinks[0] ?? null;
        let canonicalStatus: CrawlURLRecord['canonicalStatus'] = 'missing';
        if (signals.canonicalLinks.length > 1) {
          const uniqueCanonicals = new Set(signals.canonicalLinks);
          canonicalStatus = uniqueCanonicals.size > 1 ? 'conflict' : 'multiple';
        } else if (canonicalUrl) {
          const normFinal =
            normalizeCrawlUrl(outcome.finalUrl, undefined, {
              queryParamPolicy: config.queryParamPolicy,
              queryAllowlist: config.queryAllowlist,
            }) ?? outcome.finalUrl;
          canonicalStatus = canonicalUrl === normFinal ? 'self_referencing' : 'points_other';
        }

        const hasNoindex =
          signals.robotsDirectives.includes('noindex') ||
          (xRobotsTag ?? '').toLowerCase().includes('noindex');
        let indexability: CrawlURLRecord['indexability'] = 'Indexable';
        let indexabilityReason = 'HTTP 200 OK & indexable';

        if (outcome.statusCode >= 300 && outcome.statusCode < 400) {
          indexability = 'Non-Indexable';
          indexabilityReason = `HTTP ${outcome.statusCode} redirect`;
        } else if (outcome.statusCode >= 400 || outcome.statusCode === 0) {
          indexability = 'Non-Indexable';
          indexabilityReason = `HTTP ${outcome.statusCode || 'Error'} status`;
        } else if (hasNoindex) {
          indexability = 'Non-Indexable';
          indexabilityReason = (xRobotsTag ?? '').toLowerCase().includes('noindex')
            ? `X-Robots-Tag: ${xRobotsTag}`
            : `Meta robots: ${signals.robotsDirectives.join(', ')}`;
        } else if (canonicalStatus === 'points_other' && canonicalUrl) {
          indexability = 'Non-Indexable';
          indexabilityReason = `Canonicalized to ${canonicalUrl}`;
        }

        const record: CrawlURLRecord = {
          id: urlId,
          tenantId,
          crawlId,
          normalizedUrl: item.url,
          requestedUrl: outcome.requestedUrl,
          finalUrl: outcome.finalUrl,
          parentUrl: item.parentUrl,
          discoverySource: item.discoverySource,
          redirectChain: outcome.redirectChain,
          statusCode: outcome.statusCode,
          contentType,
          responseTimeMs: outcome.responseTimeMs,
          depth: item.depth,
          indexability,
          indexabilityReason,
          canonicalUrl,
          canonicalStatus,
          title: signals.title,
          metaDescription: signals.metaDescription,
          h1: signals.h1,
          headings: signals.headings,
          robotsDirectives: signals.robotsDirectives,
          xRobotsTag,
          schemaTypes: signals.schemaTypes,
          schemaErrors: signals.schemaErrors,
          hreflangTags: signals.hreflangTags,
          internalLinks: signals.internalLinks,
          externalLinks: signals.externalLinks,
          missingAltCount: signals.missingAltCount,
          hasViewport: signals.hasViewport,
          htmlLang: signals.htmlLang,
          inSitemap: sitemapSet.has(item.url),
          issueCount: 0,
          renderingSource,
          renderedDiff,
          rawHtmlObjectRef,
          renderedDomObjectRef,
          fetchedAt: new Date().toISOString(),
        };

        db.prepare(`
          INSERT OR REPLACE INTO crawl_urls (
            id, tenant_id, crawl_id, normalized_url, requested_url, final_url, parent_url,
            discovery_source, redirect_chain_json, status_code, content_type, response_time_ms,
            depth, indexability, indexability_reason, canonical_url, canonical_status,
            title, meta_description, h1, headings_json, robots_directives_json, x_robots_tag,
            schema_types_json, schema_errors_json, hreflang_json, internal_links_json,
            external_links_json, missing_alt_count, has_viewport, html_lang, in_sitemap,
            issue_count, rendering_source, rendered_diff_json, raw_html_object_ref,
            rendered_dom_object_ref, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id,
          tenantId,
          crawlId,
          record.normalizedUrl,
          record.requestedUrl,
          record.finalUrl,
          record.parentUrl,
          record.discoverySource,
          JSON.stringify(record.redirectChain),
          record.statusCode,
          record.contentType,
          record.responseTimeMs,
          record.depth,
          record.indexability,
          record.indexabilityReason,
          record.canonicalUrl,
          record.canonicalStatus,
          record.title,
          record.metaDescription,
          record.h1,
          JSON.stringify(record.headings),
          JSON.stringify(record.robotsDirectives),
          record.xRobotsTag,
          JSON.stringify(record.schemaTypes),
          JSON.stringify(record.schemaErrors),
          JSON.stringify(record.hreflangTags),
          JSON.stringify(record.internalLinks),
          JSON.stringify(record.externalLinks),
          record.missingAltCount,
          record.hasViewport ? 1 : 0,
          record.htmlLang,
          record.inSitemap ? 1 : 0,
          0,
          record.renderingSource,
          record.renderedDiff ? JSON.stringify(record.renderedDiff) : null,
          record.rawHtmlObjectRef,
          record.renderedDomObjectRef,
          record.fetchedAt,
        );

        crawledRecords.push(record);
        if (outcome.statusCode >= 500 || outcome.statusCode === 0) {
          transportErrors++;
        }

        // Enqueue newly discovered internal links (marking js_dom if discovered solely after JS rendering)
        const jsAddedSet = new Set(renderedDiff?.addedLinks ?? []);
        if (!params.seedUrls) {
          for (const childUrl of signals.internalLinks) {
            if (seenFrontier.size >= config.maxPages * 2) break;
            enqueueUrl(
              childUrl,
              item.depth + 1,
              record.normalizedUrl,
              jsAddedSet.has(childUrl) ? 'js_dom' : 'internal_link',
            );
          }
          for (const alt of signals.hreflangTags) {
            enqueueUrl(alt.href, item.depth + 1, record.normalizedUrl, 'internal_link');
          }
        }

        processedCount++;
        updateCrawlRunProgress(crawlId, {
          discoveredCount: seenFrontier.size,
          processedCount,
          errorCount: transportErrors,
        });

        emitCrawlEvent(tenantId, crawlId, 'url_crawled', {
          urlId: record.id,
          url: record.normalizedUrl,
          parentUrl: record.parentUrl,
          statusCode: record.statusCode,
          indexability: record.indexability,
          responseTimeMs: record.responseTimeMs,
          renderingSource: record.renderingSource,
          processedCount,
          discoveredCount: seenFrontier.size,
        });
        const totalFrontier = Math.max(processedCount, seenFrontier.size);
        if (
          processedCount === 1 ||
          processedCount % 3 === 0 ||
          processedCount === totalFrontier
        ) {
          emitRealAgentEvent({
            eventType: 'agent.progress',
            tenantId,
            projectId,
            workflowId: crawlId,
            taskId: crawlId,
            agentId: leadAgentId,
            status: 'running',
            taskTitle,
            summary: `Processed ${processedCount}/${totalFrontier} URLs (${record.statusCode} ${record.normalizedUrl}).`,
            progressPct:
              totalFrontier > 0
                ? Math.min(99, Math.round((processedCount / totalFrontier) * 100))
                : null,
            evidenceUrl: `/audit/live/${crawlId}`,
          });
        }
      } catch (err) {
        transportErrors++;
        if (isSeed) seedFailed = true;
        processedCount++;
        updateCrawlRunProgress(crawlId, {
          discoveredCount: seenFrontier.size,
          processedCount,
          errorCount: transportErrors,
        });
        emitCrawlEvent(tenantId, crawlId, 'url_error', {
          url: item.url,
          reason: err instanceof Error ? err.message : 'Request failed',
          errorCount: transportErrors,
        });
      }
    };

    // Process frontier with bounded concurrency
    while (
      cursor < queue.length &&
      processedCount < config.maxPages &&
      !cancelledCrawls.has(crawlId)
    ) {
      const batch: FrontierItem[] = [];
      while (
        batch.length < config.maxConcurrency &&
        cursor < queue.length &&
        processedCount + batch.length < config.maxPages
      ) {
        batch.push(queue[cursor++]);
      }
      if (batch.length === 0) break;
      await Promise.all(
        batch.map((itm) => processOne(itm, itm.depth === 0 && itm.discoverySource === 'seed')),
      );
    }

    const wasCancelled = cancelledCrawls.has(crawlId);
    cancelledCrawls.delete(crawlId);

    // Finalize sitemap summary
    const crawledNormSet = new Set(crawledRecords.map((r) => r.normalizedUrl));
    const sitemapOnlyUrls = Array.from(sitemapSet).filter((u) => {
      const rec = crawledRecords.find((r) => r.normalizedUrl === u);
      return !rec || rec.discoverySource === 'sitemap';
    });
    const noindexInSitemapUrls = crawledRecords
      .filter(
        (r) =>
          r.inSitemap &&
          (r.robotsDirectives.includes('noindex') ||
            (r.xRobotsTag ?? '').toLowerCase().includes('noindex')),
      )
      .map((r) => r.normalizedUrl);

    const sitemapSummary: SitemapAnalysisSummary = {
      discoveredSitemapUrls: discoveredSitemaps,
      parsedCount: discoveredSitemaps.length - malformedSitemaps.length,
      malformedSitemaps,
      totalEntries: sitemapSet.size,
      sitemapOnlyUrls,
      noindexInSitemapUrls,
    };

    // Run deterministic SEO rules engine on real crawled records
    const evaluation = evaluateCrawlRules({
      urls: crawledRecords,
      robots: robotsAnalysis,
      sitemapSummary,
      robotsBlockedDiscovered,
      loopDetectedUrls,
      canonicalLinkCountsByUrl,
    });

    upsertCrawlIssuesAndEvidence({
      tenantId,
      projectId,
      crawlId,
      evaluation,
      isReverification: Boolean(params.seedUrls),
    });

    let finalState: CrawlJobState = 'Succeeded';
    if (wasCancelled) {
      finalState = 'Cancelled';
    } else if (seedFailed || (crawledRecords.length === 0 && transportErrors > 0)) {
      finalState = 'Failed';
    } else if (transportErrors > 0 || crawledNormSet.size === 0) {
      finalState = 'Partial';
    }

    const completedAt = new Date().toISOString();
    updateCrawlRunProgress(crawlId, {
      status: finalState,
      completedAt,
      discoveredCount: seenFrontier.size,
      processedCount,
      errorCount: transportErrors,
      summary: evaluation.summary,
      sitemapSummary,
    });

    emitCrawlEvent(
      tenantId,
      crawlId,
      wasCancelled ? 'crawl_cancelled' : 'crawl_completed',
      {
        status: finalState,
        processedCount,
        discoveredCount: seenFrontier.size,
        errorCount: transportErrors,
        issuesTotal: evaluation.summary.issuesTotal,
        healthScore: evaluation.summary.healthScore,
      },
    );
    publishTenantActivityUpdate({
      tenantId,
      projectId,
      reason: wasCancelled ? 'crawl_cancelled' : 'crawl_completed',
    });
    if (!wasCancelled) {
      publishAutonomousDomainTrigger({
        tenantId,
        projectId,
        triggerType: 'crawl_completed',
        idempotencyKey: `crawl_completed:${crawlId}`,
        sourceRef: crawlId,
        payloadSummary: `Crawl ${crawlId} finished (${finalState}): ${processedCount} URLs, ${evaluation.summary.issuesTotal} issues.`,
        payload: {
          crawlId,
          status: finalState,
          processedCount,
          issuesTotal: evaluation.summary.issuesTotal,
          healthScore: evaluation.summary.healthScore,
        },
      });
      if (evaluation.summary.issuesTotal > 0) {
        publishAutonomousDomainTrigger({
          tenantId,
          projectId,
          triggerType: 'technical_issue_detected',
          idempotencyKey: `technical_issue_detected:${crawlId}`,
          sourceRef: crawlId,
          payloadSummary: `${evaluation.summary.issuesTotal} technical SEO issue(s) detected in crawl ${crawlId}.`,
          payload: {
            crawlId,
            issuesTotal: evaluation.summary.issuesTotal,
            issuesCritical: evaluation.summary.issuesCritical,
            issuesHigh: evaluation.summary.issuesHigh,
          },
        });
      }
    }
    const endEvidenceUrl =
      finalState === 'Succeeded' || finalState === 'Partial'
        ? `/audit/urls/${crawlId}`
        : `/audit/live/${crawlId}`;
    if (wasCancelled) {
      emitRealAgentEvent({
        eventType: 'agent.cancelled',
        tenantId,
        projectId,
        workflowId: crawlId,
        taskId: crawlId,
        agentId: leadAgentId,
        status: 'cancelled',
        taskTitle,
        summary: `Cancelled crawl ${crawlId} after ${processedCount} URL(s).`,
        evidenceUrl: endEvidenceUrl,
      });
    } else if (finalState === 'Failed') {
      const errSummary = `Crawl ${crawlId} failed after ${processedCount} URLs (${transportErrors} error(s)).`;
      emitRealAgentEvent({
        eventType: 'agent.failed',
        tenantId,
        projectId,
        workflowId: crawlId,
        taskId: crawlId,
        agentId: leadAgentId,
        status: 'failed',
        taskTitle,
        summary: errSummary,
        errorSummary: errSummary,
        evidenceUrl: endEvidenceUrl,
      });
      emitRealAgentEvent({
        eventType: 'workflow.failed',
        tenantId,
        projectId,
        workflowId: crawlId,
        taskId: crawlId,
        agentId: 'orchestrator',
        status: 'failed',
        taskTitle,
        summary: errSummary,
        errorSummary: errSummary,
        evidenceUrl: endEvidenceUrl,
      });
    } else {
      emitRealAgentEvent({
        eventType: 'agent.completed',
        tenantId,
        projectId,
        workflowId: crawlId,
        taskId: crawlId,
        agentId: leadAgentId,
        status: 'completed',
        taskTitle,
        summary: `${finalState}: ${processedCount} URL(s), ${evaluation.summary.issuesTotal} issue(s), Health ${evaluation.summary.healthScore}/100.`,
        progressPct: 100,
        evidenceUrl: endEvidenceUrl,
      });
      emitRealAgentEvent({
        eventType: 'workflow.completed',
        tenantId,
        projectId,
        workflowId: crawlId,
        taskId: crawlId,
        agentId: 'orchestrator',
        status: 'completed',
        taskTitle,
        summary: `Completed ${taskTitle} with Health ${evaluation.summary.healthScore}/100.`,
        progressPct: 100,
        evidenceUrl: endEvidenceUrl,
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unexpected crawler error';
    updateCrawlRunProgress(crawlId, {
      status: 'Failed',
      completedAt: new Date().toISOString(),
    });
    emitCrawlEvent(tenantId, crawlId, 'crawl_completed', {
      status: 'Failed',
      error: errMsg,
    });
    publishTenantActivityUpdate({
      tenantId,
      projectId,
      reason: 'crawl_failed',
    });
    emitRealAgentEvent({
      eventType: 'agent.failed',
      tenantId,
      projectId,
      workflowId: crawlId,
      taskId: crawlId,
      agentId: leadAgentId,
      status: 'failed',
      taskTitle,
      summary: `Crawl ${crawlId} aborted: ${errMsg}`,
      errorSummary: errMsg,
      evidenceUrl: `/audit/live/${crawlId}`,
    });
    emitRealAgentEvent({
      eventType: 'workflow.failed',
      tenantId,
      projectId,
      workflowId: crawlId,
      taskId: crawlId,
      agentId: 'orchestrator',
      status: 'failed',
      taskTitle,
      summary: `Workflow ${crawlId} failed: ${errMsg}`,
      errorSummary: errMsg,
      evidenceUrl: `/audit/live/${crawlId}`,
    });
  } finally {
    activeCrawlPromises.delete(crawlId);
  }
}

export async function startCrawlJob(params: {
  tenantId: string;
  user: User;
  projectId: string;
  configOverrides?: Partial<CrawlConfigurationData>;
  crawlType?: 'full' | 'reverification';
  seedUrls?: string[];
  awaitCompletion?: boolean;
}): Promise<CrawlRun> {
  const isReverif = params.crawlType === 'reverification';
  if (!isCrawlerRoleAllowed(params.user.role) && !(isReverif && params.user.role === 'QA')) {
    throw new Error('FORBIDDEN: Your role does not have permission to start crawls.');
  }

  const project = getProjectMeta(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const verification = getProjectVerification(params.tenantId, params.projectId, project.website);
  if (!verification.verified || !verification.crawlPolicyApproved) {
    throw new Error(
      'PRECONDITION_FAILED: Domain ownership and crawl policy must be verified before starting a crawl.',
    );
  }

  const db = getAuditDb();
  const activeExisting = db
    .prepare(
      "SELECT id FROM crawl_runs WHERE tenant_id = ? AND project_id = ? AND status IN ('Queued', 'Running', 'Retrying')",
    )
    .get(params.tenantId, params.projectId) as { id: string } | undefined;

  if (activeExisting && params.crawlType !== 'reverification') {
    throw new Error(
      `CONFLICT: Crawl "${activeExisting.id}" is already active for this project.`,
    );
  }

  const saved = getSavedCrawlConfig(params.tenantId, params.projectId, verification.canonicalDomain);
  const config: CrawlConfigurationData = {
    ...saved,
    ...params.configOverrides,
    projectId: params.projectId,
  };

  // Validate starting URL (blocks SSRF, private IPs, metadata, embedded creds, non-HTTP)
  const validatedSeed = await validateOutboundUrl(config.startingUrl, {
    allowSandboxHost: verification.canonicalDomain === SANDBOX_HOST && isSandboxCrawlAllowed(),
  });

  if (!isDomainWithinScope(validatedSeed.url.hostname, verification.canonicalDomain, config.scopeMode)) {
    throw new SecurityBlockedError(
      'SCOPE_VIOLATION',
      `Seed URL host "${validatedSeed.url.hostname}" is outside verified project domain "${verification.canonicalDomain}".`,
    );
  }

  const crawlId = `crw-${crypto.randomUUID().slice(0, 10)}`;
  const startedAt = new Date().toISOString();
  const initialSummary = emptySummary();

  db.prepare(`
    INSERT INTO crawl_runs (
      id, tenant_id, project_id, status, crawl_type, configuration_json,
      started_at, completed_at, discovered_count, processed_count, error_count,
      summary_json, robots_snapshot_ref, sitemap_summary_json, triggered_by
    ) VALUES (?, ?, ?, 'Queued', ?, ?, ?, NULL, 0, 0, 0, ?, NULL, NULL, ?)
  `).run(
    crawlId,
    params.tenantId,
    params.projectId,
    params.crawlType ?? 'full',
    JSON.stringify(config),
    startedAt,
    JSON.stringify(initialSummary),
    params.user.name,
  );

  emitCrawlEvent(params.tenantId, crawlId, 'crawl_queued', {
    crawlId,
    projectId: params.projectId,
    startingUrl: config.startingUrl,
    triggeredBy: params.user.name,
  });
  emitRealAgentEvent({
    eventType: 'agent.queued',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: crawlId,
    taskId: crawlId,
    agentId: isReverif ? 'quality_assurance_agent' : 'technical_seo_agent',
    status: 'queued',
    taskTitle: isReverif
      ? `QA Fix Reverification (${config.startingUrl})`
      : `Site Crawl (${config.startingUrl})`,
    summary: `Queued ${params.crawlType ?? 'full'} crawl by ${params.user.name}.`,
    evidenceUrl: `/audit/live/${crawlId}`,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'crawl_run',
    entityId: crawlId,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: 'Queued',
    reason: `Started ${params.crawlType ?? 'full'} crawl for ${verification.canonicalDomain}`,
  });

  const jobPromise = executeCrawlPipeline({
    crawlId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    config,
    canonicalDomain: verification.canonicalDomain,
    seedUrls: params.seedUrls,
  });
  activeCrawlPromises.set(crawlId, jobPromise);

  if (params.awaitCompletion) {
    await jobPromise;
  }

  const created = db
    .prepare('SELECT * FROM crawl_runs WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, crawlId) as Record<string, unknown>;

  return {
    id: String(created.id),
    tenantId: String(created.tenant_id),
    projectId: String(created.project_id),
    status: created.status as CrawlJobState,
    crawlType: created.crawl_type as 'full' | 'reverification',
    configuration: JSON.parse(String(created.configuration_json)),
    startedAt: String(created.started_at),
    completedAt: created.completed_at ? String(created.completed_at) : null,
    discoveredCount: Number(created.discovered_count),
    processedCount: Number(created.processed_count),
    errorCount: Number(created.error_count),
    summary: JSON.parse(String(created.summary_json)),
    robotsSnapshotRef: created.robots_snapshot_ref ? String(created.robots_snapshot_ref) : null,
    sitemapSummary: created.sitemap_summary_json ? JSON.parse(String(created.sitemap_summary_json)) : null,
    triggeredBy: String(created.triggered_by),
  };
}

export function cancelCrawlJob(tenantId: string, crawlId: string, user: User): CrawlRun {
  if (!isCrawlerRoleAllowed(user.role)) {
    throw new Error('FORBIDDEN: Your role does not have permission to cancel crawls.');
  }
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM crawl_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, crawlId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error('NOT_FOUND: Crawl run not found.');
  }

  cancelledCrawls.add(crawlId);
  const currentStatus = String(row.status);
  if (currentStatus === 'Queued') {
    updateCrawlRunProgress(crawlId, {
      status: 'Cancelled',
      completedAt: new Date().toISOString(),
    });
  }

  recordAuditTrail({
    tenantId,
    entityType: 'crawl_run',
    entityId: crawlId,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    previousState: currentStatus,
    newState: 'Cancelled',
    reason: 'Operator requested crawl cancellation',
  });

  publishTenantActivityUpdate({
    tenantId,
    projectId: String(row.project_id),
    reason: 'crawl_cancelled',
  });

  const updated = db
    .prepare('SELECT * FROM crawl_runs WHERE tenant_id = ? AND id = ?')
    .get(tenantId, crawlId) as Record<string, unknown>;
  return {
    id: String(updated.id),
    tenantId: String(updated.tenant_id),
    projectId: String(updated.project_id),
    status: updated.status as CrawlJobState,
    crawlType: updated.crawl_type as 'full' | 'reverification',
    configuration: JSON.parse(String(updated.configuration_json)),
    startedAt: String(updated.started_at),
    completedAt: updated.completed_at ? String(updated.completed_at) : null,
    discoveredCount: Number(updated.discovered_count),
    processedCount: Number(updated.processed_count),
    errorCount: Number(updated.error_count),
    summary: JSON.parse(String(updated.summary_json)),
    robotsSnapshotRef: updated.robots_snapshot_ref ? String(updated.robots_snapshot_ref) : null,
    sitemapSummary: updated.sitemap_summary_json ? JSON.parse(String(updated.sitemap_summary_json)) : null,
    triggeredBy: String(updated.triggered_by),
  };
}

export function createDeveloperTicket(params: {
  tenantId: string;
  issueId: string;
  title?: string;
  description?: string;
  assignedUser?: string | null;
  user: User;
}): DeveloperTicket {
  if (!isTicketCreatorAllowed(params.user.role)) {
    throw new Error('FORBIDDEN: Your role cannot create developer tickets.');
  }
  const db = getAuditDb();
  const issueRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.issueId) as Record<string, unknown> | undefined;

  if (!issueRow) {
    throw new Error('NOT_FOUND: Technical issue not found.');
  }

  const ruleId = String(issueRow.rule_id);
  const rule = DETECTION_RULES[ruleId];
  const requiresDualApproval = rule?.requiresDualApproval ?? true;
  const now = new Date().toISOString();
  const ticketId = `tkt-${crypto.randomUUID().slice(0, 8)}`;

  const ticket: DeveloperTicket = {
    id: ticketId,
    tenantId: params.tenantId,
    issueId: params.issueId,
    projectId: String(issueRow.project_id),
    title: params.title?.trim() || `Fix: ${String(issueRow.title)}`,
    description:
      params.description?.trim() ||
      `${String(issueRow.explanation)}\n\nRecommended Action: ${String(issueRow.recommended_fix)}`,
    responsibleRole: String(issueRow.responsible_role),
    assignedUser: params.assignedUser ?? null,
    taskStatus: requiresDualApproval ? 'Awaiting approval' : 'Triaged',
    approvalStatus: requiresDualApproval ? 'Pending' : 'Not Required',
    requiresDualApproval,
    developerApprovedBy: null,
    leadApprovedBy: null,
    verificationStatus: 'Pending',
    createdBy: params.user.name,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO developer_tickets (
      id, tenant_id, issue_id, project_id, title, description, responsible_role,
      assigned_user, task_status, approval_status, requires_dual_approval,
      developer_approved_by, lead_approved_by, verification_status,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'Pending', ?, ?, ?)
  `).run(
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
    ticket.requiresDualApproval ? 1 : 0,
    ticket.createdBy,
    ticket.createdAt,
    ticket.updatedAt,
  );

  // Move issue lifecycle forward to Triaged / Awaiting approval when a ticket is raised
  const prevIssueStatus = String(issueRow.status);
  if (prevIssueStatus === 'Open') {
    const nextIssueStatus: IssueLifecycleStatus = requiresDualApproval
      ? 'Awaiting approval'
      : 'Triaged';
    db.prepare('UPDATE technical_issues SET status = ? WHERE id = ?').run(
      nextIssueStatus,
      params.issueId,
    );
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'developer_ticket',
    entityId: ticket.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'None',
    newState: ticket.taskStatus,
    reason: `Created ticket for ${ruleId} (${requiresDualApproval ? 'Dual approval required' : 'Standard workflow'})`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: ticket.projectId,
    reason: 'ticket_created',
  });

  return ticket;
}

export function updateDeveloperTicket(params: {
  tenantId: string;
  ticketId: string;
  action?: 'developer_approve' | 'lead_approve' | 'reject' | 'update_status';
  taskStatus?: DeveloperTaskStatus;
  assignedUser?: string | null;
  reason?: string;
  user: User;
}): DeveloperTicket {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM developer_tickets WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.ticketId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error('NOT_FOUND: Developer ticket not found.');
  }

  const current = mapTicketRow(row);
  const now = new Date().toISOString();

  if (params.taskStatus === 'Verified') {
    throw new Error(
      'BAD_REQUEST: Tickets cannot be manually marked Verified. Run evidence-based reverification after applying the fix.',
    );
  }

  let nextTaskStatus = current.taskStatus;
  let nextApprovalStatus = current.approvalStatus;
  let devApprover = current.developerApprovedBy;
  let leadApprover = current.leadApprovedBy;
  let assignedUser =
    params.assignedUser !== undefined ? params.assignedUser : current.assignedUser;

  if (params.action === 'developer_approve') {
    if (!isDeveloperApprover(params.user.role)) {
      throw new Error(
        `FORBIDDEN: Role "${params.user.role}" cannot perform developer-only approval. Requires Developer or Platform Admin.`,
      );
    }
    devApprover = `${params.user.name} (${params.user.role})`;
    nextApprovalStatus = leadApprover ? 'Dual Approved' : 'Developer Approved';
    if (!current.requiresDualApproval || leadApprover) {
      nextTaskStatus = 'Approved';
    }
  } else if (params.action === 'lead_approve') {
    if (!isLeadApprover(params.user.role)) {
      throw new Error(
        `FORBIDDEN: Role "${params.user.role}" cannot perform lead approval.`,
      );
    }
    leadApprover = `${params.user.name} (${params.user.role})`;
    if (devApprover) {
      nextApprovalStatus = 'Dual Approved';
      nextTaskStatus = 'Approved';
    } else {
      nextApprovalStatus = current.approvalStatus;
    }
  } else if (params.action === 'reject') {
    if (!isDeveloperApprover(params.user.role) && !isLeadApprover(params.user.role)) {
      throw new Error(`FORBIDDEN: Role "${params.user.role}" cannot reject tickets.`);
    }
    nextTaskStatus = 'Rejected';
    nextApprovalStatus = 'Rejected';
  } else if (params.taskStatus) {
    const allowedTransitions: DeveloperTaskStatus[] = [
      'Proposed',
      'Triaged',
      'Awaiting approval',
      'Approved',
      'In progress',
      'Blocked',
      'Awaiting verification',
      'Archived',
    ];
    if (!allowedTransitions.includes(params.taskStatus)) {
      throw new Error(`BAD_REQUEST: Invalid ticket transition "${params.taskStatus}".`);
    }
    if (
      current.requiresDualApproval &&
      (params.taskStatus === 'In progress' || params.taskStatus === 'Awaiting verification') &&
      current.approvalStatus !== 'Dual Approved' &&
      !isDeveloperApprover(params.user.role) &&
      !isLeadApprover(params.user.role)
    ) {
      throw new Error(
        `FORBIDDEN: Role "${params.user.role}" cannot advance sensitive tickets.`,
      );
    }
    if (
      params.taskStatus === 'Approved' &&
      current.requiresDualApproval &&
      nextApprovalStatus !== 'Dual Approved'
    ) {
      throw new Error(
        'BAD_REQUEST: Sensitive SEO fixes require both Developer and Project/SEO Lead approval before moving to Approved.',
      );
    }
    nextTaskStatus = params.taskStatus;
  }

  db.prepare(`
    UPDATE developer_tickets
    SET assigned_user = ?,
        task_status = ?,
        approval_status = ?,
        developer_approved_by = ?,
        lead_approved_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    assignedUser,
    nextTaskStatus,
    nextApprovalStatus,
    devApprover,
    leadApprover,
    now,
    current.id,
  );

  // Sync issue lifecycle without ever marking Verified prematurely!
  if (nextTaskStatus === 'In progress') {
    db.prepare("UPDATE technical_issues SET status = 'In progress' WHERE id = ? AND status != 'Verified'").run(
      current.issueId,
    );
  } else if (nextTaskStatus === 'Awaiting verification') {
    db.prepare("UPDATE technical_issues SET status = 'Awaiting verification' WHERE id = ? AND status != 'Verified'").run(
      current.issueId,
    );
  } else if (nextTaskStatus === 'Rejected') {
    db.prepare("UPDATE technical_issues SET status = 'Rejected' WHERE id = ?").run(
      current.issueId,
    );
  }

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'developer_ticket',
    entityId: current.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: `${current.taskStatus} (${current.approvalStatus})`,
    newState: `${nextTaskStatus} (${nextApprovalStatus})`,
    reason: params.reason || params.action || `Updated task status to ${nextTaskStatus}`,
  });

  publishTenantActivityUpdate({
    tenantId: params.tenantId,
    projectId: current.projectId,
    reason: 'ticket_updated',
  });

  const updated = db
    .prepare('SELECT * FROM developer_tickets WHERE id = ?')
    .get(current.id) as Record<string, unknown>;
  return mapTicketRow(updated);
}

export async function runIssueReverification(params: {
  tenantId: string;
  issueId: string;
  user: User;
}): Promise<{
  verificationRun: VerificationRun;
  issue: TechnicalIssue;
  crawlRun: CrawlRun;
}> {
  if (!isCrawlerRoleAllowed(params.user.role) && params.user.role !== 'QA') {
    throw new Error('FORBIDDEN: Your role cannot trigger issue reverification.');
  }

  const db = getAuditDb();
  const issueRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.issueId) as Record<string, unknown> | undefined;

  if (!issueRow) {
    throw new Error('NOT_FOUND: Technical issue not found.');
  }

  const projectId = String(issueRow.project_id);
  const previousCrawlId = String(issueRow.last_crawl_id);
  const rootCauseKey = String(issueRow.root_cause_key);

  const prevEvidence = listIssueEvidence(params.tenantId, params.issueId, previousCrawlId);
  const allEvidence = prevEvidence.length > 0 ? prevEvidence : listIssueEvidence(params.tenantId, params.issueId);
  const targetUrls = Array.from(new Set(allEvidence.map((e) => e.url)));

  if (targetUrls.length === 0) {
    throw new Error('BAD_REQUEST: Issue has no recorded URLs to reverify.');
  }

  // Also include peer URLs if duplicate title or hreflang return checks are involved
  const extraUrls = new Set<string>(targetUrls);
  for (const ev of allEvidence) {
    const peers = ev.details?.peerUrls;
    if (Array.isArray(peers)) {
      peers.forEach((p) => {
        if (typeof p === 'string') extraUrls.add(p);
      });
    }
    const hreflangs = ev.details?.hreflangTags;
    if (Array.isArray(hreflangs)) {
      hreflangs.forEach((h) => {
        if (h && typeof h === 'object' && typeof (h as { href?: unknown }).href === 'string') {
          extraUrls.add((h as { href: string }).href);
        }
      });
    }
  }

  const verifCrawl = await startCrawlJob({
    tenantId: params.tenantId,
    user: params.user,
    projectId,
    crawlType: 'reverification',
    seedUrls: Array.from(extraUrls),
    configOverrides: {
      maxPages: Math.max(10, extraUrls.size + 5),
      maxDepth: 1,
    },
    awaitCompletion: true,
  });

  // Check if the exact rootCauseKey still produced evidence in the reverification crawl
  const remainingEvidence = db
    .prepare(
      `SELECT url FROM issue_evidence WHERE tenant_id = ? AND issue_id = ? AND crawl_id = ?`,
    )
    .all(params.tenantId, params.issueId, verifCrawl.id) as { url: string }[];

  const stillFailingUrls = Array.from(new Set(remainingEvidence.map((r) => r.url)));
  const resolvedUrls = targetUrls.filter((u) => !stillFailingUrls.includes(u));
  const verifiedNow =
    verifCrawl.status === 'Succeeded' && stillFailingUrls.length === 0;

  const result: VerificationRun['result'] = verifiedNow
    ? 'Verified'
    : resolvedUrls.length > 0
      ? 'Changed'
      : 'Unresolved';

  const now = new Date().toISOString();
  const verifId = `vr-${crypto.randomUUID().slice(0, 10)}`;
  const summaryText = verifiedNow
    ? `Re-crawled ${targetUrls.length} URL(s) in ${verifCrawl.id}; condition "${rootCauseKey}" is completely resolved.`
    : `Re-crawled ${targetUrls.length} URL(s) in ${verifCrawl.id}; ${stillFailingUrls.length} URL(s) still fail "${rootCauseKey}".`;

  const evidencePayload: VerificationRun['evidence'] = {
    checkedUrls: targetUrls.length,
    stillFailingUrls,
    resolvedUrls,
    summary: summaryText,
  };

  db.prepare(`
    INSERT INTO verification_runs (
      id, tenant_id, issue_id, previous_crawl_id, verification_crawl_id,
      result, evidence_json, requested_by, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    verifId,
    params.tenantId,
    params.issueId,
    previousCrawlId,
    verifCrawl.id,
    result,
    JSON.stringify(evidencePayload),
    params.user.name,
    now,
  );

  const prevStatus = String(issueRow.status);
  if (verifiedNow) {
    db.prepare(
      "UPDATE technical_issues SET status = 'Verified', resolved_at = ?, last_seen_at = ? WHERE id = ?",
    ).run(now, now, params.issueId);
    db.prepare(
      "UPDATE developer_tickets SET task_status = 'Verified', verification_status = 'Verified', updated_at = ? WHERE tenant_id = ? AND issue_id = ? AND task_status != 'Rejected' AND task_status != 'Archived'",
    ).run(now, params.tenantId, params.issueId);
  } else {
    db.prepare(
      "UPDATE developer_tickets SET verification_status = 'Failed', updated_at = ? WHERE tenant_id = ? AND issue_id = ? AND task_status != 'Rejected' AND task_status != 'Archived'",
    ).run(now, params.tenantId, params.issueId);
  }

  emitCrawlEvent(params.tenantId, verifCrawl.id, 'reverification_completed', {
    issueId: params.issueId,
    verificationRunId: verifId,
    result,
    checkedUrls: targetUrls.length,
    stillFailingCount: stillFailingUrls.length,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'technical_issue',
    entityId: params.issueId,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: prevStatus,
    newState: verifiedNow ? 'Verified' : prevStatus,
    reason: summaryText,
    evidenceReference: `crawl://${verifCrawl.id}`,
  });

  const updatedIssueRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.issueId) as Record<string, unknown>;

  const updatedIssue: TechnicalIssue = {
    id: String(updatedIssueRow.id),
    tenantId: String(updatedIssueRow.tenant_id),
    projectId: String(updatedIssueRow.project_id),
    lastCrawlId: String(updatedIssueRow.last_crawl_id),
    ruleId: String(updatedIssueRow.rule_id),
    ruleName: String(updatedIssueRow.rule_name),
    category: updatedIssueRow.category as TechnicalIssue['category'],
    severity: updatedIssueRow.severity as TechnicalIssue['severity'],
    rootCauseKey: String(updatedIssueRow.root_cause_key),
    title: String(updatedIssueRow.title),
    explanation: String(updatedIssueRow.explanation),
    impact: String(updatedIssueRow.impact),
    recommendedFix: String(updatedIssueRow.recommended_fix),
    responsibleRole: String(updatedIssueRow.responsible_role),
    status: updatedIssueRow.status as IssueLifecycleStatus,
    confidence: Number(updatedIssueRow.confidence),
    affectedUrlCount: Number(updatedIssueRow.affected_url_count),
    firstSeenAt: String(updatedIssueRow.first_seen_at),
    lastSeenAt: String(updatedIssueRow.last_seen_at),
    resolvedAt: updatedIssueRow.resolved_at ? String(updatedIssueRow.resolved_at) : null,
  };

  return {
    verificationRun: {
      id: verifId,
      tenantId: params.tenantId,
      issueId: params.issueId,
      previousCrawlId,
      verificationCrawlId: verifCrawl.id,
      result,
      evidence: evidencePayload,
      requestedBy: params.user.name,
      verifiedAt: now,
    },
    issue: updatedIssue,
    crawlRun: verifCrawl,
  };
}

export function buildAuditOverview(
  tenantId: string,
  projectId: string,
): AuditOverviewResponse | null {
  const project = getProjectMeta(tenantId, projectId);
  if (!project) return null;

  const verification = getProjectVerification(tenantId, projectId, project.website);
  const runs = listCrawlRuns(tenantId, projectId);
  const fullRuns = runs.filter((r) => r.crawlType === 'full');
  const completedFull = fullRuns.filter((r) => r.status === 'Succeeded');
  const latestCrawl = fullRuns[0] ?? runs[0] ?? null;
  const previousCompletedCrawl = completedFull.length > 1 ? completedFull[1] : null;

  const projectIssues = listProjectIssues(tenantId, projectId);
  const openIssues = projectIssues.filter((i) => i.status !== 'Verified' && i.status !== 'Rejected');
  const topCriticalIssues = openIssues.slice(0, 6);
  const recentlyVerifiedFixes = listVerificationRuns(tenantId, { projectId }).slice(0, 5);
  const developerTickets = listTicketsForProject(tenantId, projectId);

  const discoverySeries = [...runs]
    .filter((r) => r.crawlType === 'full')
    .slice(0, 6)
    .reverse()
    .map((r) => ({
      label: new Date(r.startedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      discovered: r.discoveredCount,
      processed: r.processedCount,
      issues: r.summary.issuesTotal,
    }));

  return {
    projectId: project.id,
    projectName: project.name,
    website: verification.canonicalDomain,
    verification,
    latestCrawl,
    previousCompletedCrawl,
    recentCrawls: runs.slice(0, 12),
    topCriticalIssues,
    recentlyVerifiedFixes,
    developerTickets,
    categoryBreakdown: groupIssuesByCategory(openIssues),
    severityBreakdown: groupIssuesBySeverity(openIssues),
    discoverySeries,
    rendererAvailable: findHeadlessBrowserPath() !== null,
  };
}

export function buildCrawlComparison(
  tenantId: string,
  projectId: string,
  requestedCurrentId?: string,
  requestedPreviousId?: string,
): CrawlComparisonResponse {
  const allRuns = listCrawlRuns(tenantId, projectId).filter((r) => r.crawlType === 'full');
  const completedRuns = allRuns.filter((r) => r.status === 'Succeeded');
  const incompleteExcludedCount = allRuns.length - completedRuns.length;

  const currentCrawl = requestedCurrentId
    ? completedRuns.find((r) => r.id === requestedCurrentId) ?? null
    : completedRuns[0] ?? null;
  const previousCrawl = requestedPreviousId
    ? completedRuns.find((r) => r.id === requestedPreviousId) ?? null
    : completedRuns[1] ?? null;

  if (!currentCrawl || !previousCrawl) {
    return {
      projectId,
      previousCrawl,
      currentCrawl,
      incompleteExcludedCount,
      newIssues: [],
      resolvedIssues: [],
      unchangedIssues: [],
      changedUrls: [],
    };
  }

  const prevIssues = listCrawlIssues(tenantId, previousCrawl.id);
  const currIssues = listCrawlIssues(tenantId, currentCrawl.id);
  const prevKeys = new Set(prevIssues.map((i) => i.rootCauseKey));
  const currKeys = new Set(currIssues.map((i) => i.rootCauseKey));

  const newIssues = currIssues.filter((i) => !prevKeys.has(i.rootCauseKey));
  const resolvedIssues = prevIssues.filter((i) => !currKeys.has(i.rootCauseKey));
  const unchangedIssues = currIssues.filter((i) => prevKeys.has(i.rootCauseKey));

  const db = getAuditDb();
  const prevUrlRows = db
    .prepare('SELECT * FROM crawl_urls WHERE tenant_id = ? AND crawl_id = ?')
    .all(tenantId, previousCrawl.id) as Record<string, unknown>[];
  const currUrlRows = db
    .prepare('SELECT * FROM crawl_urls WHERE tenant_id = ? AND crawl_id = ?')
    .all(tenantId, currentCrawl.id) as Record<string, unknown>[];

  const prevUrls = new Map(prevUrlRows.map((r) => {
    const u = mapCrawlUrlRow(r);
    return [u.normalizedUrl, u];
  }));
  const currUrls = new Map(currUrlRows.map((r) => {
    const u = mapCrawlUrlRow(r);
    return [u.normalizedUrl, u];
  }));

  const allUrlKeys = new Set([...prevUrls.keys(), ...currUrls.keys()]);
  const changedUrls: CrawlComparisonResponse['changedUrls'] = [];
  for (const url of allUrlKeys) {
    const p = prevUrls.get(url);
    const c = currUrls.get(url);
    if (
      !p ||
      !c ||
      p.statusCode !== c.statusCode ||
      p.indexability !== c.indexability
    ) {
      changedUrls.push({
        url,
        previousStatus: p?.statusCode ?? null,
        currentStatus: c?.statusCode ?? null,
        previousIndexability: p?.indexability ?? null,
        currentIndexability: c?.indexability ?? null,
      });
    }
  }

  return {
    projectId,
    previousCrawl,
    currentCrawl,
    incompleteExcludedCount,
    newIssues,
    resolvedIssues,
    unchangedIssues,
    changedUrls: changedUrls.slice(0, 60),
  };
}

export function getUrlSnapshotContent(
  tenantId: string,
  crawlId: string,
  urlId: string,
): { url: CrawlURLRecord; rawHtml: string | null; renderedDom: string | null } | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM crawl_urls WHERE tenant_id = ? AND crawl_id = ? AND id = ?')
    .get(tenantId, crawlId, urlId) as Record<string, unknown> | undefined;

  if (!row) return null;
  const record = mapCrawlUrlRow(row);
  return {
    url: record,
    rawHtml: readObjectSnapshot(tenantId, record.rawHtmlObjectRef),
    renderedDom: readObjectSnapshot(tenantId, record.renderedDomObjectRef),
  };
}

export function getIssueDetailsBundle(tenantId: string, issueId: string) {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(tenantId, issueId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const issue: TechnicalIssue = {
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
    status: row.status as IssueLifecycleStatus,
    confidence: Number(row.confidence),
    affectedUrlCount: Number(row.affected_url_count),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };

  const evidence: IssueEvidence[] = listIssueEvidence(tenantId, issueId);
  const tickets: DeveloperTicket[] = listTicketsForIssue(tenantId, issueId);
  const verificationRuns: VerificationRun[] = listVerificationRuns(tenantId, { issueId });
  const ticketIds = tickets.map((t) => t.id);
  const auditEntries = [
    ...listAuditTrailForEntity(tenantId, issueId),
    ...ticketIds.flatMap((tid) => listAuditTrailForEntity(tenantId, tid)),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const rule = DETECTION_RULES[issue.ruleId] ?? null;

  return {
    issue,
    rule,
    evidence,
    tickets,
    verificationRuns,
    auditTrail: auditEntries,
  };
}

export { listCrawlEvents };
