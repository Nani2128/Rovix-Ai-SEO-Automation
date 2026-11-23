import crypto from 'node:crypto';
import type { User, UserRole } from '../../types/auth';
import type {
  FieldCruxMetrics,
  PerformanceAuditRun,
  PerformanceDashboardOverview,
  PerformanceFinding,
  PerformanceRunStrategyMode,
  PerformanceStrategy,
  PerformanceTrendPoint,
  PerformanceUrlMeasurement,
} from '../../types/performance';
import type {
  DeveloperTicket,
  IssueEvidence,
  IssueLifecycleStatus,
  TechnicalIssue,
  VerificationRun,
} from '../../types/technicalIssue';
import { getPageSpeedApiKey } from '../env';
import { createDeveloperTicket } from '../audit/crawlerEngine';
import {
  countActivePerformanceAudits,
  createPerformanceAuditRun,
  getAuditDb,
  getPerformanceAuditRunById,
  getPerformanceFindingById,
  getProjectById,
  linkPerformanceFindingToIssue,
  listCrawlRuns,
  listIssueEvidence,
  listPerformanceAuditRuns,
  listPerformanceFindings,
  listPerformanceMeasurements,
  listProjectIssues,
  listTicketsForIssue,
  listTicketsForProject,
  listVerificationRuns,
  mapIssueRow,
  queryCrawlUrls,
  recordActivityEvent,
  recordAuditTrail,
  saveObjectSnapshot,
  savePerformanceFindings,
  savePerformanceMeasurement,
  updatePerformanceAuditRun,
} from '../audit/db';
import { validateOutboundUrl } from '../audit/security';
import { fetchFullPageSpeedAudit, type PsiFetcher } from '../integrations/psiClient';
import {
  computeUsabilityScore,
  detectPerformanceFindings,
} from './diagnosticsEngine';
import {
  emitRealAgentEvent,
  publishAutonomousDomainTrigger,
} from '../agentFactory/agentFactoryService';

export const MAX_URLS_PER_AUDIT = 10;
export const MAX_CONCURRENT_PERF_AUDITS_PER_TENANT = 2;
const BOUNDED_WORKER_CONCURRENCY = 2;

const PERF_OPERATOR_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Developer',
  'Business Owner',
];

const PERF_REVERIFY_ROLES: readonly UserRole[] = [
  ...PERF_OPERATOR_ROLES,
  'QA',
];

const cancelledPerfAudits = new Set<string>();
const activePerfAuditPromises = new Map<string, Promise<PerformanceAuditRun>>();

function assertOperatorRole(role: UserRole): void {
  if (!PERF_OPERATOR_ROLES.includes(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" cannot launch or manage performance audits.`,
    );
  }
}

function emptyCruxSummary(): FieldCruxMetrics {
  const empty = {
    percentileP75: null,
    category: 'UNAVAILABLE' as const,
    goodPct: null,
    needsImprovementPct: null,
    poorPct: null,
  };
  return {
    available: false,
    scope: 'unavailable',
    source: 'Chrome UX Report (CrUX)',
    reportingPeriod: 'Rolling 28-day real-user collection',
    collectedAt: null,
    measurementStatus: 'unavailable',
    lcp: empty,
    inp: empty,
    cls: empty,
    fcp: empty,
    ttfb: empty,
    note: 'Run a live PageSpeed performance audit to inspect CrUX 28-day real-user field telemetry (if available for this origin).',
  };
}

function averageOrNull(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
}

function averageFloatOrNull(nums: (number | null)[], digits = 3): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (valid.length === 0) return null;
  return Number(
    (valid.reduce((s, n) => s + n, 0) / valid.length).toFixed(digits),
  );
}

export function resolveCandidateTargetUrls(
  tenantId: string,
  projectId: string,
  requestedUrls?: string[],
): string[] {
  const project = getProjectById(tenantId, projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found in active workspace.');
  }

  const rawList = (requestedUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);

  if (rawList.length > 0) {
    return Array.from(new Set(rawList));
  }

  // Fallback to latest crawl's indexable URLs (up to 3), or project root domain
  const crawls = listCrawlRuns(tenantId, projectId);
  const completed = crawls.find((c) => c.status === 'Succeeded' || c.status === 'Partial');
  if (completed) {
    const urlPage = queryCrawlUrls({
      tenantId,
      crawlId: completed.id,
      filter: 'indexable',
      page: 1,
      pageSize: 3,
      sortBy: 'depth',
      sortDir: 'asc',
    });
    const urls = urlPage.items.map((u) => u.finalUrl || u.normalizedUrl);
    if (urls.length > 0) return Array.from(new Set(urls));
  }

  return [`https://${project.website}/`];
}

export async function startPerformanceAudit(params: {
  tenantId: string;
  user: User;
  projectId: string;
  targetUrls?: string[];
  sourceCrawlId?: string | null;
  strategyMode?: PerformanceRunStrategyMode;
  awaitCompletion?: boolean;
  fetcher?: PsiFetcher;
}): Promise<PerformanceAuditRun> {
  assertOperatorRole(params.user.role);

  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const candidateUrls = resolveCandidateTargetUrls(
    params.tenantId,
    params.projectId,
    params.targetUrls,
  );

  if (candidateUrls.length === 0) {
    throw new Error('BAD_REQUEST: Provide at least one target URL to analyze.');
  }
  if (candidateUrls.length > MAX_URLS_PER_AUDIT) {
    throw new Error(
      `BAD_REQUEST: A single performance audit is capped at ${MAX_URLS_PER_AUDIT} URLs to protect PageSpeed Insights API quotas.`,
    );
  }

  // Validate every URL strictly for SSRF before persisting or queuing checks
  const validatedUrls: string[] = [];
  for (const rawUrl of candidateUrls) {
    const withScheme = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    const validated = await validateOutboundUrl(withScheme, {
      allowSandboxHost: false,
    });
    validatedUrls.push(validated.url.toString());
  }

  const activeCount = countActivePerformanceAudits(params.tenantId);
  if (activeCount >= MAX_CONCURRENT_PERF_AUDITS_PER_TENANT) {
    throw new Error(
      `CONFLICT: Workspace already has ${activeCount} running performance audits (limit ${MAX_CONCURRENT_PERF_AUDITS_PER_TENANT}). Wait for completion or cancel an active audit.`,
    );
  }

  const strategyMode: PerformanceRunStrategyMode =
    params.strategyMode === 'mobile' ||
    params.strategyMode === 'desktop' ||
    params.strategyMode === 'both'
      ? params.strategyMode
      : 'both';

  const strategies: PerformanceStrategy[] =
    strategyMode === 'both' ? ['mobile', 'desktop'] : [strategyMode];

  const auditId = `perf-${crypto.randomUUID().slice(0, 10)}`;
  const totalChecks = validatedUrls.length * strategies.length;

  const initialRun = createPerformanceAuditRun({
    id: auditId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    sourceCrawlId: params.sourceCrawlId ?? null,
    strategyMode,
    provider: 'Google PageSpeed Insights v5 (Lighthouse + CrUX)',
    targetUrls: validatedUrls,
    totalChecks,
    triggeredBy: params.user.name,
  });

  const jobPromise = executePerformanceAuditRun({
    auditId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    targetUrls: validatedUrls,
    strategies,
    actorName: params.user.name,
    projectWebsite: project.website,
    fetcher: params.fetcher,
  });

  activePerfAuditPromises.set(auditId, jobPromise);
  void jobPromise.finally(() => {
    activePerfAuditPromises.delete(auditId);
    cancelledPerfAudits.delete(auditId);
  });

  if (params.awaitCompletion) {
    return await jobPromise;
  }
  return initialRun;
}

async function executePerformanceAuditRun(params: {
  auditId: string;
  tenantId: string;
  projectId: string;
  targetUrls: string[];
  strategies: PerformanceStrategy[];
  actorName: string;
  projectWebsite: string;
  fetcher?: PsiFetcher;
}): Promise<PerformanceAuditRun> {
  const { auditId, tenantId, projectId, targetUrls, strategies } = params;
  updatePerformanceAuditRun(tenantId, auditId, { status: 'Running' });
  const taskTitle = `PageSpeed Audit (${targetUrls.length} URL${targetUrls.length === 1 ? '' : 's'})`;
  emitRealAgentEvent({
    eventType: 'workflow.started',
    tenantId,
    projectId,
    workflowId: auditId,
    taskId: auditId,
    agentId: 'orchestrator',
    status: 'running',
    taskTitle,
    summary: `Started performance audit ${auditId} on ${params.projectWebsite}.`,
    evidenceUrl: '/performance',
  });
  emitRealAgentEvent({
    eventType: 'agent.communication',
    tenantId,
    projectId,
    workflowId: auditId,
    taskId: auditId,
    agentId: 'performance_analysis_agent',
    sourceAgentId: 'orchestrator',
    destinationAgentId: 'performance_analysis_agent',
    status: 'communicating',
    taskTitle,
    summary: `Routed ${targetUrls.length} URL(s) to Performance Analysis Agent.`,
    evidenceUrl: '/performance',
  });
  emitRealAgentEvent({
    eventType: 'agent.started',
    tenantId,
    projectId,
    workflowId: auditId,
    taskId: auditId,
    agentId: 'performance_analysis_agent',
    status: 'running',
    taskTitle,
    summary: `Measuring ${strategies.join(' + ')} Core Web Vitals.`,
    progressPct: 0,
    evidenceUrl: '/performance',
  });

  const tasks: { url: string; strategy: PerformanceStrategy }[] = [];
  for (const url of targetUrls) {
    for (const strategy of strategies) {
      tasks.push({ url, strategy });
    }
  }

  let completedChecks = 0;
  let failedChecks = 0;
  const errors: string[] = [];
  const allMeasurements: PerformanceUrlMeasurement[] = [];

  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      if (cancelledPerfAudits.has(auditId)) return;
      const task = tasks[cursor++];
      if (!task) return;

      const measurementId = `pm-${crypto.randomUUID().slice(0, 10)}`;
      try {
        const { parsed, sanitizedSnapshotJson } = await fetchFullPageSpeedAudit({
          url: task.url,
          strategy: task.strategy,
          fetcher: params.fetcher,
        });

        const rawObjectRef = saveObjectSnapshot(
          tenantId,
          `${auditId}-${measurementId}`,
          sanitizedSnapshotJson,
        );

        const measurement: PerformanceUrlMeasurement = {
          id: measurementId,
          tenantId,
          projectId,
          auditRunId: auditId,
          url: parsed.url,
          strategy: task.strategy,
          status: 'Succeeded',
          errorMessage: null,
          rawObjectRef,
          provenance: {
            source: 'Google PageSpeed Insights v5 (Lighthouse Lab)',
            collectedAt: parsed.collectedAt,
            reportingPeriod: 'Single synthetic Lighthouse Lab capture',
            measurementStatus: 'measured',
          },
          lab: parsed.lab,
          field: parsed.field,
          resources: parsed.resources,
          usability: parsed.usability,
          diagnostics: parsed.diagnostics,
          collectedAt: parsed.collectedAt,
        };

        savePerformanceMeasurement(measurement);
        allMeasurements.push(measurement);

        const findings = detectPerformanceFindings({
          parsed,
          tenantId,
          projectId,
          auditRunId: auditId,
          measurementId,
        });
        savePerformanceFindings(findings);
      } catch (err) {
        failedChecks++;
        const msg = err instanceof Error ? err.message : 'PageSpeed audit failed';
        errors.push(`${task.strategy} ${task.url}: ${msg}`);

        const emptyMetrics = emptyCruxSummary();
        const failedMeasurement: PerformanceUrlMeasurement = {
          id: measurementId,
          tenantId,
          projectId,
          auditRunId: auditId,
          url: task.url,
          strategy: task.strategy,
          status: 'Failed',
          errorMessage: msg,
          rawObjectRef: null,
          provenance: {
            source: 'Google PageSpeed Insights v5',
            collectedAt: null,
            reportingPeriod: 'Audit check failed',
            measurementStatus: 'unavailable',
          },
          lab: {
            performanceScore: null,
            accessibilityScore: null,
            bestPracticesScore: null,
            seoScore: null,
            fcpMs: null,
            lcpMs: null,
            speedIndexMs: null,
            tbtMs: null,
            clsScore: null,
            ttfbMs: null,
          },
          field: emptyMetrics,
          resources: {
            totalByteWeight: null,
            totalRequests: null,
            scriptBytes: null,
            stylesheetBytes: null,
            imageBytes: null,
            fontBytes: null,
            thirdPartyBytes: null,
            thirdPartyBlockingMs: null,
            domNodesCount: null,
            largestResources: [],
          },
          usability: {
            viewportConfigured: null,
            legibleFontSizes: null,
            tapTargetsAdequate: null,
            colorContrastOk: null,
            notes: [msg],
          },
          diagnostics: [],
          collectedAt: new Date().toISOString(),
        };
        savePerformanceMeasurement(failedMeasurement);
        allMeasurements.push(failedMeasurement);
      } finally {
        completedChecks++;
        updatePerformanceAuditRun(tenantId, auditId, {
          completedChecks,
          failedChecks,
        });
        emitRealAgentEvent({
          eventType: 'agent.progress',
          tenantId,
          projectId,
          workflowId: auditId,
          taskId: auditId,
          agentId: 'performance_analysis_agent',
          status: 'running',
          taskTitle,
          summary: `Completed ${completedChecks}/${tasks.length} PageSpeed check(s) (${task.strategy} ${task.url}).`,
          progressPct:
            tasks.length > 0
              ? Math.min(99, Math.round((completedChecks / tasks.length) * 100))
              : null,
          evidenceUrl: '/performance',
        });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(BOUNDED_WORKER_CONCURRENCY, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);

  const succeeded = allMeasurements.filter((m) => m.status === 'Succeeded');
  const mobileScores = succeeded
    .filter((m) => m.strategy === 'mobile')
    .map((m) => m.lab.performanceScore);
  const desktopScores = succeeded
    .filter((m) => m.strategy === 'desktop')
    .map((m) => m.lab.performanceScore);

  const avgMobileScore = averageOrNull(mobileScores);
  const avgDesktopScore = averageOrNull(desktopScores);

  const wasCancelled = cancelledPerfAudits.has(auditId);
  const finalStatus: PerformanceAuditRun['status'] = wasCancelled
    ? 'Cancelled'
    : succeeded.length === 0
      ? 'Failed'
      : failedChecks > 0
        ? 'Partial'
        : 'Succeeded';

  const completedAt = new Date().toISOString();
  const updated = updatePerformanceAuditRun(tenantId, auditId, {
    status: finalStatus,
    completedChecks,
    failedChecks,
    errorSummary: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
    avgMobileScore,
    avgDesktopScore,
    completedAt,
  })!;

  recordActivityEvent({
    tenantId,
    projectId,
    type: finalStatus === 'Failed' ? 'integration_failure' : 'crawl',
    actor: params.actorName,
    action: `Performance audit ${auditId} (${params.projectWebsite}): ${finalStatus}${
      avgMobileScore !== null ? ` · Mobile ${avgMobileScore}/100` : ''
    }${avgDesktopScore !== null ? ` · Desktop ${avgDesktopScore}/100` : ''}`,
    status:
      finalStatus === 'Succeeded'
        ? 'Succeeded'
        : finalStatus === 'Failed'
          ? 'Failed'
          : 'Warning',
    evidenceUrl: '/performance',
  });

  if (finalStatus === 'Cancelled') {
    emitRealAgentEvent({
      eventType: 'agent.cancelled',
      tenantId,
      projectId,
      workflowId: auditId,
      taskId: auditId,
      agentId: 'performance_analysis_agent',
      status: 'cancelled',
      taskTitle,
      summary: `Performance audit ${auditId} cancelled.`,
      evidenceUrl: '/performance',
    });
  } else if (finalStatus === 'Failed') {
    const errSummary = errors.slice(0, 2).join(' | ') || 'All PageSpeed checks failed.';
    emitRealAgentEvent({
      eventType: 'agent.failed',
      tenantId,
      projectId,
      workflowId: auditId,
      taskId: auditId,
      agentId: 'performance_analysis_agent',
      status: 'failed',
      taskTitle,
      summary: `Performance audit ${auditId} failed: ${errSummary}`,
      errorSummary: errSummary,
      evidenceUrl: '/performance',
    });
    emitRealAgentEvent({
      eventType: 'workflow.failed',
      tenantId,
      projectId,
      workflowId: auditId,
      taskId: auditId,
      agentId: 'orchestrator',
      status: 'failed',
      taskTitle,
      summary: `Performance workflow ${auditId} failed.`,
      errorSummary: errSummary,
      evidenceUrl: '/performance',
    });
  } else {
    emitRealAgentEvent({
      eventType: 'agent.completed',
      tenantId,
      projectId,
      workflowId: auditId,
      taskId: auditId,
      agentId: 'performance_analysis_agent',
      status: 'completed',
      taskTitle,
      summary: `Performance ${finalStatus}: Mobile ${avgMobileScore ?? 'N/A'} · Desktop ${avgDesktopScore ?? 'N/A'}.`,
      progressPct: 100,
      evidenceUrl: '/performance',
    });
    emitRealAgentEvent({
      eventType: 'workflow.completed',
      tenantId,
      projectId,
      workflowId: auditId,
      taskId: auditId,
      agentId: 'orchestrator',
      status: 'completed',
      taskTitle,
      summary: `Completed performance audit ${auditId}.`,
      progressPct: 100,
      evidenceUrl: '/performance',
    });
    const hasRegressionSignal =
      (avgMobileScore !== null && avgMobileScore < 75) ||
      (avgDesktopScore !== null && avgDesktopScore < 80);
    if (hasRegressionSignal) {
      publishAutonomousDomainTrigger({
        tenantId,
        projectId,
        triggerType: 'performance_regression_detected',
        idempotencyKey: `perf_regression:${auditId}`,
        sourceRef: auditId,
        payloadSummary: `Performance regression signal on audit ${auditId}: Mobile ${avgMobileScore ?? 'N/A'}, Desktop ${avgDesktopScore ?? 'N/A'}.`,
        payload: {
          auditId,
          avgMobileScore,
          avgDesktopScore,
          finalStatus,
        },
      });
    }
  }

  return updated;
}

export function cancelPerformanceAudit(
  tenantId: string,
  auditId: string,
  user: User,
): PerformanceAuditRun {
  assertOperatorRole(user.role);
  const run = getPerformanceAuditRunById(tenantId, auditId);
  if (!run) {
    throw new Error('NOT_FOUND: Performance audit run not found.');
  }
  if (run.status === 'Queued' || run.status === 'Running') {
    cancelledPerfAudits.add(auditId);
    return updatePerformanceAuditRun(tenantId, auditId, {
      status: 'Cancelled',
      completedAt: new Date().toISOString(),
    })!;
  }
  return run;
}

function summarizeStrategyMetrics(
  measurements: PerformanceUrlMeasurement[],
  strategy: PerformanceStrategy,
  collectedAt: string | null,
) {
  const rows = measurements.filter(
    (m) => m.strategy === strategy && m.status === 'Succeeded',
  );
  const measured = rows.length > 0;
  return {
    score: averageOrNull(rows.map((r) => r.lab.performanceScore)),
    lcpMs: averageOrNull(rows.map((r) => r.lab.lcpMs)),
    fcpMs: averageOrNull(rows.map((r) => r.lab.fcpMs)),
    tbtMs: averageOrNull(rows.map((r) => r.lab.tbtMs)),
    clsScore: averageFloatOrNull(rows.map((r) => r.lab.clsScore), 3),
    ttfbMs: averageOrNull(rows.map((r) => r.lab.ttfbMs)),
    speedIndexMs: averageOrNull(rows.map((r) => r.lab.speedIndexMs)),
    usabilityScore: averageOrNull(rows.map((r) => computeUsabilityScore(r.usability))),
    measuredUrls: rows.length,
    provenance: {
      source: 'Google PageSpeed Insights v5 (Lighthouse Lab)',
      collectedAt: measured ? collectedAt : null,
      reportingPeriod: measured
        ? `${rows.length} URL(s) analyzed (${strategy})`
        : `No ${strategy} Lighthouse run completed`,
      measurementStatus: (measured ? 'measured' : 'unavailable') as
        | 'measured'
        | 'unavailable',
    },
  };
}

export function buildPerformanceOverview(
  tenantId: string,
  projectId: string,
  selectedRunId?: string,
): PerformanceDashboardOverview | null {
  const project = getProjectById(tenantId, projectId);
  if (!project) return null;

  const runs = listPerformanceAuditRuns(tenantId, projectId, 25);
  const completedRuns = runs.filter(
    (r) => r.status === 'Succeeded' || r.status === 'Partial',
  );

  const latestRun =
    (selectedRunId ? runs.find((r) => r.id === selectedRunId) : null) ??
    completedRuns[0] ??
    runs[0] ??
    null;

  const latestCompletedIdx = latestRun
    ? completedRuns.findIndex((r) => r.id === latestRun.id)
    : -1;
  const previousRun =
    latestCompletedIdx >= 0 && completedRuns.length > latestCompletedIdx + 1
      ? completedRuns[latestCompletedIdx + 1]
      : null;

  const measurements = latestRun
    ? listPerformanceMeasurements(tenantId, { auditRunId: latestRun.id })
    : [];
  const findings = latestRun
    ? listPerformanceFindings(tenantId, { auditRunId: latestRun.id })
    : [];

  const collectedAt = latestRun?.completedAt ?? latestRun?.startedAt ?? null;
  const mobileSummary = summarizeStrategyMetrics(measurements, 'mobile', collectedAt);
  const desktopSummary = summarizeStrategyMetrics(measurements, 'desktop', collectedAt);

  // Pick strongest CrUX field summary (prefer URL-level mobile/desktop, then origin fallback)
  const succeededMeasurements = measurements.filter((m) => m.status === 'Succeeded');
  const urlCrux = succeededMeasurements.find(
    (m) => m.field.available && m.field.scope === 'url',
  );
  const originCrux = succeededMeasurements.find(
    (m) => m.field.available && m.field.scope === 'origin',
  );
  const fieldSummary: FieldCruxMetrics =
    urlCrux?.field ??
    originCrux?.field ??
    succeededMeasurements[0]?.field ??
    emptyCruxSummary();

  // Historical trend across runs (chronological order)
  const trendHistory: PerformanceTrendPoint[] = [...completedRuns]
    .slice(0, 12)
    .reverse()
    .map((run) => {
      const runMeas = listPerformanceMeasurements(tenantId, {
        auditRunId: run.id,
      }).filter((m) => m.status === 'Succeeded');
      const mob = runMeas.filter((m) => m.strategy === 'mobile');
      const desk = runMeas.filter((m) => m.strategy === 'desktop');
      const stamp = run.completedAt ?? run.startedAt;
      return {
        runId: run.id,
        label: new Date(stamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        collectedAt: stamp,
        mobileScore: run.avgMobileScore,
        desktopScore: run.avgDesktopScore,
        mobileLcpMs: averageOrNull(mob.map((m) => m.lab.lcpMs)),
        desktopLcpMs: averageOrNull(desk.map((m) => m.lab.lcpMs)),
        mobileCls: averageFloatOrNull(mob.map((m) => m.lab.clsScore), 3),
        desktopCls: averageFloatOrNull(desk.map((m) => m.lab.clsScore), 3),
      };
    });

  const allIssues = listProjectIssues(tenantId, projectId);
  const linkedIssues = allIssues.filter(
    (i) => i.ruleId.startsWith('PERF-') || i.category === 'Performance' || i.category === 'Usability',
  );
  const linkedIssueIds = new Set(linkedIssues.map((i) => i.id));
  const linkedTickets = listTicketsForProject(tenantId, projectId).filter((t) =>
    linkedIssueIds.has(t.issueId),
  );
  const verificationRuns = listVerificationRuns(tenantId, { projectId }).filter((vr) =>
    linkedIssueIds.has(vr.issueId),
  );

  return {
    projectId: project.id,
    projectName: project.name,
    website: project.website,
    pageSpeedKeyConfigured: getPageSpeedApiKey() !== null,
    maxUrlsPerAudit: MAX_URLS_PER_AUDIT,
    latestRun,
    previousRun,
    runs,
    measurements,
    findings,
    mobileSummary,
    desktopSummary,
    fieldSummary,
    trendHistory,
    linkedIssues,
    linkedTickets,
    verificationRuns,
  };
}

export function bridgeFindingToTechnicalIssue(params: {
  tenantId: string;
  findingId: string;
  user: User;
  createTicket?: boolean;
  assignedUser?: string | null;
}): {
  issue: TechnicalIssue;
  ticket: DeveloperTicket | null;
  deduplicated: boolean;
} {
  assertOperatorRole(params.user.role);

  const finding = getPerformanceFindingById(params.tenantId, params.findingId);
  if (!finding) {
    throw new Error('NOT_FOUND: Performance finding not found.');
  }

  const db = getAuditDb();
  const rootCauseKey = `PERF::${finding.ruleId}::${finding.strategy}`;
  const now = new Date().toISOString();

  const existingRow = db
    .prepare(
      'SELECT * FROM technical_issues WHERE tenant_id = ? AND project_id = ? AND root_cause_key = ?',
    )
    .get(params.tenantId, finding.projectId, rootCauseKey) as
    | Record<string, unknown>
    | undefined;

  let issueId: string;
  let deduplicated = false;

  if (existingRow) {
    deduplicated = true;
    issueId = String(existingRow.id);
    const prevStatus = String(existingRow.status);
    const reopenedStatus: IssueLifecycleStatus =
      prevStatus === 'Verified' || prevStatus === 'Rejected' ? 'Open' : (prevStatus as IssueLifecycleStatus);

    db.prepare(`
      UPDATE technical_issues
      SET last_crawl_id = ?,
          title = ?,
          explanation = ?,
          recommended_fix = ?,
          status = ?,
          last_seen_at = ?,
          resolved_at = CASE WHEN ? = 'Open' THEN NULL ELSE resolved_at END
      WHERE tenant_id = ? AND id = ?
    `).run(
      finding.auditRunId,
      finding.title,
      finding.explanation,
      finding.recommendedSolution,
      reopenedStatus,
      now,
      reopenedStatus,
      params.tenantId,
      issueId,
    );
  } else {
    issueId = `iss-${crypto.randomUUID().slice(0, 10)}`;
    const issueCategory: TechnicalIssue['category'] =
      finding.category === 'Mobile Usability' ? 'Usability' : 'Performance';

    db.prepare(`
      INSERT INTO technical_issues (
        id, tenant_id, project_id, last_crawl_id, rule_id, rule_name, category,
        severity, root_cause_key, title, explanation, impact, recommended_fix,
        responsible_role, status, confidence, affected_url_count,
        first_seen_at, last_seen_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 0.94, 1, ?, ?, NULL)
    `).run(
      issueId,
      params.tenantId,
      finding.projectId,
      finding.auditRunId,
      finding.ruleId,
      finding.category,
      issueCategory,
      finding.severity,
      rootCauseKey,
      finding.title,
      finding.explanation,
      finding.rootCause,
      finding.recommendedSolution,
      'Developer',
      now,
      now,
    );

    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'technical_issue',
      entityId: issueId,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: 'None',
      newState: 'Open',
      reason: `Created performance issue from Lighthouse ${finding.strategy} audit (${finding.auditRunId})`,
      evidenceReference: `perf://${finding.auditRunId}`,
    });
  }

  // Record URL evidence idempotently for this (issueId, auditRunId, url)
  const existingEv = db
    .prepare(
      'SELECT id FROM issue_evidence WHERE tenant_id = ? AND issue_id = ? AND crawl_id = ? AND url = ?',
    )
    .get(params.tenantId, issueId, finding.auditRunId, finding.url) as
    | { id: string }
    | undefined;

  if (!existingEv) {
    db.prepare(`
      INSERT INTO issue_evidence (
        id, tenant_id, issue_id, crawl_id, url_id, url, evidence_type,
        source, snippet, details_json, evidence_reference, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pagespeed_api', ?, ?, ?, ?)
    `).run(
      `ev-${crypto.randomUUID().slice(0, 10)}`,
      params.tenantId,
      issueId,
      finding.auditRunId,
      finding.measurementId,
      finding.url,
      finding.evidence.metricLabel,
      `${finding.evidence.metricLabel}: ${finding.evidence.measuredValue} (threshold ${finding.evidence.thresholdLabel})`,
      JSON.stringify({
        strategy: finding.strategy,
        ruleId: finding.ruleId,
        auditId: finding.evidence.auditId,
        measuredValue: finding.evidence.measuredValue,
        thresholdLabel: finding.evidence.thresholdLabel,
        estimatedEffort: finding.estimatedEffort,
        sampleUrls: finding.evidence.sampleUrls,
      }),
      `perf://${finding.auditRunId}`,
      now,
    );
  }

  // Recompute distinct affected URL count across latest evidence
  const countRow = db
    .prepare(
      'SELECT COUNT(DISTINCT url) AS cnt FROM issue_evidence WHERE tenant_id = ? AND issue_id = ? AND crawl_id = ?',
    )
    .get(params.tenantId, issueId, finding.auditRunId) as { cnt: number };
  db.prepare(
    'UPDATE technical_issues SET affected_url_count = ? WHERE tenant_id = ? AND id = ?',
  ).run(Math.max(1, Number(countRow.cnt ?? 1)), params.tenantId, issueId);

  linkPerformanceFindingToIssue(params.tenantId, finding.id, issueId);

  let ticket: DeveloperTicket | null = null;
  if (params.createTicket) {
    const existingTickets = listTicketsForIssue(params.tenantId, issueId).filter(
      (t) => t.taskStatus !== 'Rejected' && t.taskStatus !== 'Archived',
    );
    ticket =
      existingTickets[0] ??
      createDeveloperTicket({
        tenantId: params.tenantId,
        issueId,
        title: `Fix: ${finding.title}`,
        description: `${finding.explanation}\n\nRoot Cause: ${finding.rootCause}\n\nMeasured Evidence (${finding.strategy}): ${finding.evidence.measuredValue} vs ${finding.evidence.thresholdLabel}\n\nRecommended Action: ${finding.recommendedSolution}\nEffort: ${finding.estimatedEffort}`,
        assignedUser: params.assignedUser ?? null,
        user: params.user,
      });
  }

  const issueRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, issueId) as Record<string, unknown>;

  return {
    issue: mapIssueRow(issueRow),
    ticket,
    deduplicated,
  };
}

export async function reverifyPerformanceIssue(params: {
  tenantId: string;
  issueId: string;
  user: User;
  fetcher?: PsiFetcher;
}): Promise<{
  verificationRun: VerificationRun;
  issue: TechnicalIssue;
  auditRun: PerformanceAuditRun;
}> {
  if (!PERF_REVERIFY_ROLES.includes(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot trigger performance reverification.`,
    );
  }

  const db = getAuditDb();
  const issueRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.issueId) as Record<string, unknown> | undefined;

  if (!issueRow) {
    throw new Error('NOT_FOUND: Technical issue not found.');
  }

  const projectId = String(issueRow.project_id);
  const previousRunId = String(issueRow.last_crawl_id);
  const ruleId = String(issueRow.rule_id);
  const rootCauseKey = String(issueRow.root_cause_key);
  const keyParts = rootCauseKey.split('::');
  const strategy: PerformanceStrategy =
    keyParts[2] === 'desktop' ? 'desktop' : 'mobile';

  const prevEvidence = listIssueEvidence(
    params.tenantId,
    params.issueId,
    previousRunId,
  );
  const allEvidence =
    prevEvidence.length > 0
      ? prevEvidence
      : listIssueEvidence(params.tenantId, params.issueId);
  const targetUrls = Array.from(new Set(allEvidence.map((e) => e.url))).slice(
    0,
    MAX_URLS_PER_AUDIT,
  );

  if (targetUrls.length === 0) {
    throw new Error('BAD_REQUEST: Issue has no recorded URLs to reverify.');
  }

  const freshAudit = await startPerformanceAudit({
    tenantId: params.tenantId,
    user: params.user,
    projectId,
    targetUrls,
    strategyMode: strategy,
    awaitCompletion: true,
    fetcher: params.fetcher,
  });

  const freshFindings = listPerformanceFindings(params.tenantId, {
    auditRunId: freshAudit.id,
  });

  const stillFailingUrls = Array.from(
    new Set(
      freshFindings
        .filter((f) => f.ruleId === ruleId && f.strategy === strategy)
        .map((f) => f.url),
    ),
  );
  const resolvedUrls =
    freshAudit.status === 'Succeeded'
      ? targetUrls.filter((u) => !stillFailingUrls.includes(u))
      : [];

  const verifiedNow =
    freshAudit.status === 'Succeeded' && stillFailingUrls.length === 0;

  const result: VerificationRun['result'] = verifiedNow
    ? 'Verified'
    : resolvedUrls.length > 0
      ? 'Changed'
      : 'Unresolved';

  const now = new Date().toISOString();
  const verifId = `vr-${crypto.randomUUID().slice(0, 10)}`;
  const summaryText = verifiedNow
    ? `Re-audited ${targetUrls.length} URL(s) on ${strategy} via PageSpeed (${freshAudit.id}); "${ruleId}" no longer triggers.`
    : freshAudit.status !== 'Succeeded'
      ? `Reverification performance audit ${freshAudit.id} ended as ${freshAudit.status}: ${freshAudit.errorSummary ?? 'Unable to confirm fix.'}`
      : `Re-audited ${targetUrls.length} URL(s) on ${strategy} (${freshAudit.id}); ${stillFailingUrls.length} URL(s) still fail "${ruleId}".`;

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
    previousRunId,
    freshAudit.id,
    result,
    JSON.stringify(evidencePayload),
    params.user.name,
    now,
  );

  const prevStatus = String(issueRow.status);
  if (verifiedNow) {
    db.prepare(
      "UPDATE technical_issues SET status = 'Verified', resolved_at = ?, last_seen_at = ? WHERE tenant_id = ? AND id = ?",
    ).run(now, now, params.tenantId, params.issueId);
    db.prepare(
      "UPDATE developer_tickets SET task_status = 'Verified', verification_status = 'Verified', updated_at = ? WHERE tenant_id = ? AND issue_id = ? AND task_status != 'Rejected' AND task_status != 'Archived'",
    ).run(now, params.tenantId, params.issueId);
  } else {
    db.prepare(
      "UPDATE developer_tickets SET verification_status = 'Failed', updated_at = ? WHERE tenant_id = ? AND issue_id = ? AND task_status != 'Rejected' AND task_status != 'Archived'",
    ).run(now, params.tenantId, params.issueId);
  }

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
    evidenceReference: `perf://${freshAudit.id}`,
  });

  const updatedRow = db
    .prepare('SELECT * FROM technical_issues WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.issueId) as Record<string, unknown>;

  return {
    verificationRun: {
      id: verifId,
      tenantId: params.tenantId,
      issueId: params.issueId,
      previousCrawlId: previousRunId,
      verificationCrawlId: freshAudit.id,
      result,
      evidence: evidencePayload,
      requestedBy: params.user.name,
      verifiedAt: now,
    },
    issue: mapIssueRow(updatedRow),
    auditRun: freshAudit,
  };
}
