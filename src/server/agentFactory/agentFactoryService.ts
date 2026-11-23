import crypto from 'node:crypto';
import type {
  AgentAvailabilityStatus,
  AgentCurrentTask,
  AgentExecutionState,
  AgentFactoryEvent,
  AgentFactoryEventType,
  AgentFactorySnapshot,
  AgentFactoryWorkflowSummary,
  AgentId,
  AgentLastExecution,
  AgentStationNodeSnapshot,
  WorkflowTaskRecord,
} from '../../types/agentFactory';
import { AGENT_CATALOG } from '../../lib/agentFactoryCatalog';
import {
  COMMUNICATION_LINK_TTL_MS,
  recomputeSnapshotCounts,
} from '../../lib/agentFactoryState';
import {
  listRecentAgentFactoryEvents,
  publishAgentFactoryEvent,
} from '../activity/activityBus';
import {
  getAuditDb,
  getOAuthIntegrationRow,
  getProjectById,
  listContentGaps,
  listCompetitorResearchRuns,
  listCrawlRuns,
  listGeoResearchRuns,
  listKeywordResearchRuns,
  listPerformanceAuditRuns,
} from '../audit/db';
import { getPageSpeedApiKey } from '../env';
import { isGeminiProviderConfigured } from './contentGenerationAdapter';
import {
  getPerAgentMetricsMapInDb,
  listApprovalRequestsInDb,
  listRecentPersistedAgentEvents,
  listWorkflowsForProject,
  persistAgentExecutionEventInDb,
} from './orchestrationDb';
import { getPerAgentStationUsageSummaryMap } from './usageIntelligenceService';
import {
  getOrCreateAutonomyPolicyInDb,
  listDeadLetterTasksInDb,
  listRecoveryRecordsInDb,
  listTriggerSubscriptionsInDb,
  listWorkerHeartbeatsInDb,
  listWorkflowSchedulesInDb,
} from './operationsDb';
import type { AutomationTriggerType } from '../../types/autonomousOperations';

export interface DomainTriggerPublishParams {
  tenantId: string;
  projectId: string;
  triggerType: Exclude<AutomationTriggerType, 'schedule' | 'external_webhook'>;
  idempotencyKey: string;
  sourceRef?: string | null;
  payloadSummary: string;
  payload?: Record<string, unknown>;
}

let domainTriggerPublisher:
  | ((params: DomainTriggerPublishParams) => unknown)
  | null = null;

export function setDomainTriggerPublisher(
  fn: ((params: DomainTriggerPublishParams) => unknown) | null,
): void {
  domainTriggerPublisher = fn;
}

export function publishAutonomousDomainTrigger(
  params: DomainTriggerPublishParams,
): void {
  if (!domainTriggerPublisher) return;
  try {
    domainTriggerPublisher(params);
  } catch {
    // Domain trigger dispatch must never break primary SEO service execution
  }
}

export function emitRealAgentEvent(params: {
  id?: string;
  eventType: AgentFactoryEventType;
  tenantId: string;
  projectId: string | null;
  workflowId: string;
  taskId: string;
  agentId: AgentId;
  sourceAgentId?: AgentId | null;
  destinationAgentId?: AgentId | null;
  status: AgentExecutionState;
  taskTitle: string;
  summary: string;
  progressPct?: number | null;
  errorSummary?: string | null;
  evidenceUrl?: string | null;
  timestamp?: string;
  correlationId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
}): AgentFactoryEvent {
  const event: AgentFactoryEvent = {
    id: params.id ?? `afe-${crypto.randomUUID().slice(0, 12)}`,
    eventType: params.eventType,
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: params.taskId,
    agentId: params.agentId,
    sourceAgentId: params.sourceAgentId ?? null,
    destinationAgentId: params.destinationAgentId ?? null,
    status: params.status,
    taskTitle: params.taskTitle,
    summary: params.summary,
    progressPct:
      typeof params.progressPct === 'number' && Number.isFinite(params.progressPct)
        ? Math.max(0, Math.min(100, Math.round(params.progressPct)))
        : null,
    errorSummary: params.errorSummary ?? null,
    evidenceUrl: params.evidenceUrl ?? null,
    timestamp: params.timestamp ?? new Date().toISOString(),
    correlationId: params.correlationId ?? null,
    provider: params.provider ?? null,
    model: params.model ?? null,
    inputTokens: params.inputTokens ?? null,
    outputTokens: params.outputTokens ?? null,
    durationMs: params.durationMs ?? null,
  };

  const published = publishAgentFactoryEvent(event);
  if (published && event.projectId) {
    try {
      persistAgentExecutionEventInDb(event);
    } catch {
      // Never break live event emission if persistence encounters a transient lock
    }
  }
  return event;
}

function mapCrawlStatusToAgentState(status: string): AgentExecutionState {
  switch (status) {
    case 'Queued':
      return 'queued';
    case 'Running':
      return 'running';
    case 'Retrying':
      return 'retrying';
    case 'Failed':
      return 'failed';
    case 'Cancelled':
      return 'cancelled';
    case 'Succeeded':
    case 'Partial':
      return 'completed';
    default:
      return 'idle';
  }
}

function mapPerfStatusToAgentState(status: string): AgentExecutionState {
  switch (status) {
    case 'Queued':
      return 'queued';
    case 'Running':
      return 'running';
    case 'Failed':
      return 'failed';
    case 'Cancelled':
      return 'cancelled';
    case 'Succeeded':
    case 'Partial':
      return 'completed';
    default:
      return 'idle';
  }
}

function mapStage2TaskStatus(status: WorkflowTaskRecord['status']): AgentExecutionState {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'waiting_for_approval':
      return 'waiting_for_approval';
    case 'retrying':
      return 'retrying';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

export function buildAgentFactorySnapshot(params: {
  tenantId: string;
  projectId: string;
  nowMs?: number;
}): AgentFactorySnapshot {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const nowMs = params.nowMs ?? Date.now();
  const db = getAuditDb();
  const allCrawls = listCrawlRuns(params.tenantId, params.projectId);
  const fullCrawls = allCrawls.filter((c) => c.crawlType === 'full');
  const qaCrawls = allCrawls.filter((c) => c.crawlType === 'reverification');
  const perfRuns = listPerformanceAuditRuns(params.tenantId, params.projectId, 10);
  const kwRuns = listKeywordResearchRuns(params.tenantId, params.projectId, 10);
  const geoRuns = listGeoResearchRuns(params.tenantId, params.projectId, 10);
  const compRuns = listCompetitorResearchRuns(params.tenantId, params.projectId, 10);
  const contentGaps = listContentGaps(params.tenantId, params.projectId);
  const gscConn = getOAuthIntegrationRow(
    params.tenantId,
    params.projectId,
    'gsc',
  );
  const hasPsiKey = getPageSpeedApiKey() !== null;
  const geminiConfigured = isGeminiProviderConfigured();

  // Stage 2 persisted orchestration telemetry & workflows
  const stage2Workflows = listWorkflowsForProject(params.tenantId, params.projectId, 12);
  const pendingApprovals = listApprovalRequestsInDb(
    params.tenantId,
    params.projectId,
    'pending',
  );
  const metricsByAgent = getPerAgentMetricsMapInDb(params.tenantId, params.projectId);
  const usageTelemetryByAgent = getPerAgentStationUsageSummaryMap(
    params.tenantId,
    params.projectId,
  );

  const stage2TaskRows = db
    .prepare(
      `SELECT * FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY updated_at DESC LIMIT 60`,
    )
    .all(params.tenantId, params.projectId) as Record<string, unknown>[];

  const latestStage2TaskByAgent = new Map<AgentId, Record<string, unknown>>();
  for (const row of stage2TaskRows) {
    const aid = String(row.agent_id) as AgentId;
    const existing = latestStage2TaskByAgent.get(aid);
    if (!existing) {
      latestStage2TaskByAgent.set(aid, row);
      continue;
    }
    const curPriority =
      row.status === 'running'
        ? 4
        : row.status === 'waiting_for_approval'
          ? 3
          : row.status === 'retrying'
            ? 2
            : row.status === 'queued'
              ? 1
              : 0;
    const prevPriority =
      existing.status === 'running'
        ? 4
        : existing.status === 'waiting_for_approval'
          ? 3
          : existing.status === 'retrying'
            ? 2
            : existing.status === 'queued'
              ? 1
              : 0;
    if (curPriority > prevPriority) {
      latestStage2TaskByAgent.set(aid, row);
    }
  }

  // Merge in-memory live events + persisted events cleanly (deduped)
  const memEvents = listRecentAgentFactoryEvents(
    params.tenantId,
    params.projectId,
    60,
  );
  const persistedEvents = listRecentPersistedAgentEvents(
    params.tenantId,
    params.projectId,
    60,
  );
  const seenEventIds = new Set<string>();
  const recentEvents: AgentFactoryEvent[] = [];
  for (const ev of [...memEvents, ...persistedEvents]) {
    if (seenEventIds.has(ev.id)) continue;
    seenEventIds.add(ev.id);
    recentEvents.push(ev);
  }
  recentEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (recentEvents.length > 60) recentEvents.length = 60;

  const verifRows = db
    .prepare(
      `SELECT vr.* FROM verification_runs vr
       INNER JOIN technical_issues ti ON ti.id = vr.issue_id AND ti.tenant_id = vr.tenant_id
       WHERE vr.tenant_id = ? AND ti.project_id = ?
       ORDER BY vr.verified_at DESC LIMIT 5`,
    )
    .all(params.tenantId, params.projectId) as Record<string, unknown>[];

  const workflows: AgentFactoryWorkflowSummary[] = [];

  for (const wf of stage2Workflows) {
    const pendingCount = pendingApprovals.filter((a) => a.workflowId === wf.id).length;
    workflows.push({
      workflowId: wf.id,
      title: wf.name,
      templateId: wf.templateId,
      status:
        wf.status === 'draft'
          ? 'queued'
          : wf.status,
      leadAgentId: 'orchestrator',
      currentStage: wf.currentStage,
      blockingReason: wf.blockingReason,
      pendingApprovalCount: pendingCount,
      startedAt: wf.startedAt ?? wf.createdAt,
      completedAt: wf.completedAt ?? wf.cancelledAt,
      evidenceUrl: '/agent-factory',
      errorSummary: wf.status === 'failed' ? wf.blockingReason : null,
    });
  }

  for (const c of allCrawls.slice(0, 4)) {
    const st = mapCrawlStatusToAgentState(c.status);
    workflows.push({
      workflowId: c.id,
      title:
        c.crawlType === 'reverification'
          ? `QA Fix Reverification (${c.processedCount}/${Math.max(c.processedCount, c.discoveredCount)} URLs)`
          : `Technical Crawl (${c.configuration.startingUrl})`,
      status:
        st === 'running' || st === 'retrying'
          ? 'running'
          : st === 'queued'
            ? 'queued'
            : st === 'failed'
              ? 'failed'
              : st === 'cancelled'
                ? 'cancelled'
                : 'completed',
      leadAgentId:
        c.crawlType === 'reverification'
          ? 'quality_assurance_agent'
          : 'technical_seo_agent',
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      evidenceUrl:
        st === 'running' || st === 'queued'
          ? `/audit/live/${c.id}`
          : `/audit/urls/${c.id}`,
      errorSummary:
        c.status === 'Failed'
          ? `Crawl failed after ${c.processedCount} URLs (${c.errorCount} error(s))`
          : null,
    });
  }

  for (const p of perfRuns.slice(0, 3)) {
    const st = mapPerfStatusToAgentState(p.status);
    workflows.push({
      workflowId: p.id,
      title: `PageSpeed Audit (${p.strategyMode}, ${p.targetUrls.length} URLs)`,
      status:
        st === 'running'
          ? 'running'
          : st === 'queued'
            ? 'queued'
            : st === 'failed'
              ? 'failed'
              : st === 'cancelled'
                ? 'cancelled'
                : 'completed',
      leadAgentId: 'performance_analysis_agent',
      startedAt: p.startedAt,
      completedAt: p.completedAt,
      evidenceUrl: '/performance',
      errorSummary: p.errorSummary,
    });
  }

  for (const k of kwRuns.slice(0, 3)) {
    workflows.push({
      workflowId: k.id,
      title: `Keyword Research (${k.seedTerms.slice(0, 2).join(', ') || k.targetCountry})`,
      status:
        k.status === 'Running'
          ? 'running'
          : k.status === 'Failed'
            ? 'failed'
            : 'completed',
      leadAgentId: 'keyword_intelligence_agent',
      startedAt: k.startedAt,
      completedAt: k.completedAt,
      evidenceUrl: '/keywords',
      errorSummary: null,
    });
  }

  for (const g of geoRuns.slice(0, 2)) {
    workflows.push({
      workflowId: g.id,
      title: `Geo Discovery (${g.targetCity || g.targetStateRegion || g.targetCountry})`,
      status:
        g.status === 'Running'
          ? 'running'
          : g.status === 'Failed'
            ? 'failed'
            : 'completed',
      leadAgentId: 'geographic_intelligence_agent',
      startedAt: g.startedAt,
      completedAt: g.completedAt,
      evidenceUrl: '/geographic-intelligence',
      errorSummary: null,
    });
  }

  for (const cp of compRuns.slice(0, 2)) {
    workflows.push({
      workflowId: cp.id,
      title: `Competitor Analysis (${cp.competitorDomain})`,
      status:
        cp.status === 'Running'
          ? 'running'
          : cp.status === 'Failed'
            ? 'failed'
            : 'completed',
      leadAgentId: 'competitor_intelligence_agent',
      startedAt: cp.startedAt,
      completedAt: cp.completedAt,
      evidenceUrl: '/competitors',
      errorSummary: cp.errorSummary,
    });
  }

  workflows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  // Derive active communication links from non-expired recent communication/message/delegation events
  const activeLinks = recentEvents
    .filter((ev) => {
      const isLinkType =
        ev.eventType === 'agent.communication' ||
        ev.eventType === 'handoff.recorded' ||
        ev.eventType === 'agent.message.sent' ||
        ev.eventType === 'agent.message.delivered' ||
        ev.eventType === 'agent.message.failed' ||
        ev.eventType === 'agent.delegation.created' ||
        ev.eventType === 'agent.delegation.completed' ||
        ev.eventType === 'conflict.detected';
      if (!isLinkType || !ev.sourceAgentId || !ev.destinationAgentId) {
        return false;
      }
      const ts = Date.parse(ev.timestamp);
      return Number.isFinite(ts) && ts + COMMUNICATION_LINK_TTL_MS > nowMs;
    })
    .slice(0, 16)
    .map((ev) => ({
      id: `link-${ev.id}`,
      sourceAgentId: ev.sourceAgentId!,
      destinationAgentId: ev.destinationAgentId!,
      workflowId: ev.workflowId,
      label: ev.summary,
      timestamp: ev.timestamp,
      expiresAtMs: Date.parse(ev.timestamp) + COMMUNICATION_LINK_TTL_MS,
      correlationId: ev.correlationId ?? null,
      status:
        ev.eventType === 'agent.message.failed'
          ? ('failed' as const)
          : ev.eventType === 'conflict.detected'
            ? ('conflict' as const)
            : ev.eventType === 'agent.message.delivered' ||
                ev.eventType === 'agent.delegation.completed'
              ? ('delivered' as const)
              : ('active' as const),
      isPeerToPeer:
        ev.sourceAgentId !== 'orchestrator' && ev.destinationAgentId !== 'orchestrator',
    }));

  const applyStage2TaskOverride = (
    agentId: AgentId,
    base: {
      state: AgentExecutionState;
      availabilityStatus: AgentAvailabilityStatus;
      providerSummary: string;
      currentTask: AgentCurrentTask | null;
      lastExecution: AgentLastExecution | null;
    },
  ) => {
    const s2 = latestStage2TaskByAgent.get(agentId);
    if (!s2) return base;
    const rawStatus = String(s2.status) as WorkflowTaskRecord['status'];
    const mappedState = mapStage2TaskStatus(rawStatus);
    const isActiveS2 =
      rawStatus === 'running' ||
      rawStatus === 'retrying' ||
      rawStatus === 'waiting_for_approval' ||
      (rawStatus === 'queued' &&
        stage2Workflows.some(
          (w) =>
            w.id === String(s2.workflow_id) &&
            (w.status === 'running' || w.status === 'waiting_for_approval'),
        ));

    // Only override base live module activity if Stage 2 task is actively executing/waiting or base is idle/unavailable/completed
    if (isActiveS2 || base.state === 'idle' || base.state === 'unavailable') {
      const currentTask: AgentCurrentTask | null = isActiveS2
        ? {
            taskId: String(s2.id),
            workflowId: String(s2.workflow_id),
            title: String(s2.title),
            startedAt: s2.started_at ? String(s2.started_at) : String(s2.created_at),
            progressPct: null,
            evidenceUrl: '/agent-factory',
          }
        : base.currentTask;

      const lastExecution: AgentLastExecution | null =
        !isActiveS2 && (rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'cancelled')
          ? {
              status: mappedState,
              summary:
                rawStatus === 'failed'
                  ? `Stage 2 task failed: ${String(s2.title)}`
                  : `Stage 2 task ${rawStatus}: ${String(s2.title)}`,
              timestamp: String(s2.completed_at ?? s2.updated_at),
              errorSummary: s2.error_summary ? String(s2.error_summary) : null,
              evidenceUrl: '/agent-factory',
            }
          : base.lastExecution;

      return {
        ...base,
        state:
          base.availabilityStatus === 'unavailable' && !isActiveS2 && rawStatus === 'queued'
            ? 'unavailable'
            : isActiveS2 || base.state === 'idle'
              ? mappedState
              : base.state,
        currentTask,
        lastExecution,
      };
    }
    return base;
  };

  const deriveStationState = (
    agentId: AgentId,
  ): {
    state: AgentExecutionState;
    availabilityStatus: AgentAvailabilityStatus;
    providerSummary: string;
    currentTask: AgentCurrentTask | null;
    lastExecution: AgentLastExecution | null;
  } => {
    switch (agentId) {
      case 'technical_seo_agent': {
        const latest = fullCrawls[0] ?? null;
        if (!latest) {
          return applyStage2TaskOverride(agentId, {
            state: 'idle',
            availabilityStatus: 'connected',
            providerSummary: 'SSRF-Guarded Crawler Engine & SEO Ruleset connected',
            currentTask: null,
            lastExecution: null,
          });
        }
        const st = mapCrawlStatusToAgentState(latest.status);
        const isActive = st === 'queued' || st === 'running' || st === 'retrying';
        const pct =
          isActive && latest.discoveredCount > 0
            ? Math.min(
                99,
                Math.round((latest.processedCount / latest.discoveredCount) * 100),
              )
            : null;
        return applyStage2TaskOverride(agentId, {
          state: st,
          availabilityStatus: 'connected',
          providerSummary: 'SSRF-Guarded Crawler Engine & SEO Ruleset connected',
          currentTask: isActive
            ? {
                taskId: latest.id,
                workflowId: latest.id,
                title: `Crawling ${latest.configuration.startingUrl} (${latest.processedCount}/${latest.discoveredCount} URLs)`,
                startedAt: latest.startedAt,
                progressPct: pct,
                evidenceUrl: `/audit/live/${latest.id}`,
              }
            : null,
          lastExecution: {
            status: st,
            summary: `${latest.status}: ${latest.processedCount} URL(s) · Health ${latest.summary.healthScore}/100`,
            timestamp: latest.completedAt ?? latest.startedAt,
            errorSummary:
              latest.status === 'Failed'
                ? `Crawl ${latest.id} failed (${latest.errorCount} HTTP/transport errors)`
                : null,
            evidenceUrl:
              st === 'running' || st === 'queued'
                ? `/audit/live/${latest.id}`
                : `/audit/urls/${latest.id}`,
          },
        });
      }

      case 'performance_analysis_agent': {
        const latest = perfRuns[0] ?? null;
        const providerSummary = hasPsiKey
          ? 'Google PageSpeed Insights v5 API Key configured'
          : 'Google PageSpeed Insights v5 public quota mode (optional API key unconfigured)';
        if (!latest) {
          return applyStage2TaskOverride(agentId, {
            state: 'idle',
            availabilityStatus: hasPsiKey ? 'connected' : 'partial',
            providerSummary,
            currentTask: null,
            lastExecution: null,
          });
        }
        const st = mapPerfStatusToAgentState(latest.status);
        const isActive = st === 'queued' || st === 'running';
        const pct =
          isActive && latest.totalChecks > 0
            ? Math.min(
                99,
                Math.round((latest.completedChecks / latest.totalChecks) * 100),
              )
            : null;
        return applyStage2TaskOverride(agentId, {
          state: st,
          availabilityStatus: hasPsiKey ? 'connected' : 'partial',
          providerSummary,
          currentTask: isActive
            ? {
                taskId: latest.id,
                workflowId: latest.id,
                title: `Auditing ${latest.targetUrls.length} URL(s) (${latest.completedChecks}/${latest.totalChecks} checks)`,
                startedAt: latest.startedAt,
                progressPct: pct,
                evidenceUrl: '/performance',
              }
            : null,
          lastExecution: {
            status: st,
            summary: `${latest.status} · Mobile ${latest.avgMobileScore ?? 'N/A'} · Desktop ${latest.avgDesktopScore ?? 'N/A'}`,
            timestamp: latest.completedAt ?? latest.startedAt,
            errorSummary: latest.errorSummary,
            evidenceUrl: '/performance',
          },
        });
      }

      case 'keyword_intelligence_agent': {
        const latest = kwRuns[0] ?? null;
        const gscOk = gscConn?.status === 'Connected';
        const providerSummary = gscOk
          ? 'GSC OAuth + Autocomplete + Google Trends connected'
          : 'Autocomplete & Crawl Topic Extractor connected (GSC OAuth optional)';
        if (!latest) {
          return applyStage2TaskOverride(agentId, {
            state: 'idle',
            availabilityStatus: gscOk ? 'connected' : 'partial',
            providerSummary,
            currentTask: null,
            lastExecution: null,
          });
        }
        const st: AgentExecutionState =
          latest.status === 'Running'
            ? 'running'
            : latest.status === 'Failed'
              ? 'failed'
              : 'completed';
        return applyStage2TaskOverride(agentId, {
          state: st,
          availabilityStatus: gscOk ? 'connected' : 'partial',
          providerSummary,
          currentTask:
            st === 'running'
              ? {
                  taskId: latest.id,
                  workflowId: latest.id,
                  title: `Discovering keywords (${latest.seedTerms.slice(0, 2).join(', ')})`,
                  startedAt: latest.startedAt,
                  progressPct: null,
                  evidenceUrl: '/keywords',
                }
              : null,
          lastExecution: {
            status: st,
            summary: `${latest.status}: ${latest.totalDiscovered} keywords · ${latest.totalClustersCreated} clusters`,
            timestamp: latest.completedAt ?? latest.startedAt,
            errorSummary:
              latest.status === 'Failed' ? 'Keyword research run failed.' : null,
            evidenceUrl: '/keywords',
          },
        });
      }

      case 'geographic_intelligence_agent': {
        const latest = geoRuns[0] ?? null;
        const gscOk = gscConn?.status === 'Connected';
        const providerSummary = gscOk
          ? 'GSC Country Analytics OAuth + Regional Trends connected'
          : 'Location Catalog & Google Trends connected (GSC OAuth not connected)';
        if (!latest) {
          return applyStage2TaskOverride(agentId, {
            state: 'idle',
            availabilityStatus: gscOk ? 'connected' : 'partial',
            providerSummary,
            currentTask: null,
            lastExecution: null,
          });
        }
        const st: AgentExecutionState =
          latest.status === 'Running'
            ? 'running'
            : latest.status === 'Failed'
              ? 'failed'
              : 'completed';
        return applyStage2TaskOverride(agentId, {
          state: st,
          availabilityStatus: gscOk ? 'connected' : 'partial',
          providerSummary,
          currentTask:
            st === 'running'
              ? {
                  taskId: latest.id,
                  workflowId: latest.id,
                  title: `Geo mapping ${latest.targetCity || latest.targetStateRegion || latest.targetCountry}`,
                  startedAt: latest.startedAt,
                  progressPct: null,
                  evidenceUrl: '/geographic-intelligence',
                }
              : null,
          lastExecution: {
            status: st,
            summary: `${latest.status}: ${latest.keywordsDiscovered} geo keywords · ${latest.measurementsCollected} signals`,
            timestamp: latest.completedAt ?? latest.startedAt,
            errorSummary:
              latest.status === 'Failed' ? 'Geographic discovery failed.' : null,
            evidenceUrl: '/geographic-intelligence',
          },
        });
      }

      case 'competitor_intelligence_agent': {
        const latest = compRuns[0] ?? null;
        const hasSerpKey = Boolean(
          process.env.SERPER_API_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim(),
        );
        const providerSummary = hasSerpKey
          ? 'Live HTML Analyzer + SERP Provider configured'
          : 'Live SSRF-Guarded HTML Analyzer connected (SERP discovery API key optional)';
        if (!latest) {
          return applyStage2TaskOverride(agentId, {
            state: 'idle',
            availabilityStatus: hasSerpKey ? 'connected' : 'partial',
            providerSummary,
            currentTask: null,
            lastExecution: null,
          });
        }
        const st: AgentExecutionState =
          latest.status === 'Running'
            ? 'running'
            : latest.status === 'Failed'
              ? 'failed'
              : 'completed';
        return applyStage2TaskOverride(agentId, {
          state: st,
          availabilityStatus: hasSerpKey ? 'connected' : 'partial',
          providerSummary,
          currentTask:
            st === 'running'
              ? {
                  taskId: latest.id,
                  workflowId: latest.id,
                  title: `Analyzing ${latest.competitorDomain}`,
                  startedAt: latest.startedAt,
                  progressPct: null,
                  evidenceUrl: '/competitors',
                }
              : null,
          lastExecution: {
            status: st,
            summary: `${latest.status} (${latest.competitorDomain}): ${latest.urlsScanned} pages · ${latest.gapsIdentified} gaps`,
            timestamp: latest.completedAt ?? latest.startedAt,
            errorSummary: latest.errorSummary,
            evidenceUrl: '/competitors',
          },
        });
      }

      case 'quality_assurance_agent': {
        const activeQa = qaCrawls.find(
          (c) => c.status === 'Running' || c.status === 'Queued' || c.status === 'Retrying',
        );
        const latestVr = verifRows[0] ?? null;
        if (activeQa) {
          const st = mapCrawlStatusToAgentState(activeQa.status);
          return applyStage2TaskOverride(agentId, {
            state: st,
            availabilityStatus: 'connected',
            providerSummary: 'Draft Claim/Link Validator & Fix Reverification connected',
            currentTask: {
              taskId: activeQa.id,
              workflowId: activeQa.id,
              title: `Reverifying fixed URLs (${activeQa.processedCount}/${Math.max(activeQa.processedCount, activeQa.discoveredCount)})`,
              startedAt: activeQa.startedAt,
              progressPct:
                activeQa.discoveredCount > 0
                  ? Math.min(
                      99,
                      Math.round((activeQa.processedCount / activeQa.discoveredCount) * 100),
                    )
                  : null,
              evidenceUrl: '/audit/reverify',
            },
            lastExecution: null,
          });
        }
        if (latestVr) {
          const vrResult = String(latestVr.result);
          const evSummary = (() => {
            try {
              const parsed = JSON.parse(String(latestVr.evidence_json ?? '{}')) as {
                summary?: string;
              };
              return parsed.summary ?? `Verification result: ${vrResult}`;
            } catch {
              return `Verification result: ${vrResult}`;
            }
          })();
          return applyStage2TaskOverride(agentId, {
            state: vrResult === 'Verified' ? 'completed' : 'idle',
            availabilityStatus: 'connected',
            providerSummary: 'Draft Claim/Link Validator & Fix Reverification connected',
            currentTask: null,
            lastExecution: {
              status: vrResult === 'Verified' ? 'completed' : 'idle',
              summary: evSummary,
              timestamp: String(latestVr.verified_at),
              errorSummary: null,
              evidenceUrl: '/audit/reverify',
            },
          });
        }
        return applyStage2TaskOverride(agentId, {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary: 'Draft Claim/Link Validator & Fix Reverification connected',
          currentTask: null,
          lastExecution: null,
        });
      }

      case 'research_agent': {
        const runningDiscovery =
          kwRuns.find((r) => r.status === 'Running') ??
          compRuns.find((r) => r.status === 'Running' && r.runKind === 'serp_discovery');
        if (runningDiscovery) {
          return applyStage2TaskOverride(agentId, {
            state: 'running',
            availabilityStatus: 'connected',
            providerSummary: 'Stage 2 Business Context & Multi-Source Research Adapter connected',
            currentTask: {
              taskId: runningDiscovery.id,
              workflowId: runningDiscovery.id,
              title: 'Running search discovery pipeline',
              startedAt: runningDiscovery.startedAt,
              progressPct: null,
              evidenceUrl: '/keywords',
            },
            lastExecution: null,
          });
        }
        return applyStage2TaskOverride(agentId, {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary: 'Stage 2 Business Context & Multi-Source Research Adapter connected',
          currentTask: null,
          lastExecution: null,
        });
      }

      case 'content_strategy_agent': {
        const approvedOrQueued = contentGaps.filter(
          (g) =>
            g.workflowState === 'owner_approved' ||
            g.workflowState === 'queued_for_content' ||
            g.workflowState === 'strategist_recommended',
        );
        const latestGap = approvedOrQueued[0] ?? null;
        return applyStage2TaskOverride(agentId, {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary: 'Stage 2 Unified Content Strategy & Brief Synthesizer connected',
          currentTask: null,
          lastExecution: latestGap
            ? {
                status: 'completed',
                summary: `${approvedOrQueued.length} brief(s) curated (latest: "${latestGap.targetKeyword}")`,
                timestamp: latestGap.updatedAt,
                errorSummary: null,
                evidenceUrl: '/competitors',
              }
            : null,
        });
      }

      case 'content_generation_agent': {
        if (!geminiConfigured) {
          return applyStage2TaskOverride(agentId, {
            state: 'unavailable',
            availabilityStatus: 'unavailable',
            providerSummary:
              'Unavailable — GEMINI_API_KEY is not configured on the server',
            currentTask: null,
            lastExecution: null,
          });
        }
        return applyStage2TaskOverride(agentId, {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary:
            'Google Gemini Server Provider connected (gemini-4-hydrogen, human-approval gated)',
          currentTask: null,
          lastExecution: null,
        });
      }

      case 'reporting_agent':
        return applyStage2TaskOverride(agentId, {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary:
            'Stage 2 Structured Workflow Digest & Evidence Aggregator connected',
          currentTask: null,
          lastExecution: null,
        });

      case 'orchestrator':
      default:
        return {
          state: 'idle',
          availabilityStatus: 'connected',
          providerSummary:
            'Stage 2 DAG Workflow Scheduler, Hand-off Validator & SSE ActivityBus connected',
          currentTask: null,
          lastExecution: null,
        };
    }
  };

  const defaultMetrics = {
    queueDepth: 0,
    runningCount: 0,
    waitingApprovalCount: 0,
    completedCount: 0,
    failedCount: 0,
    retryCount: 0,
    avgDurationMs: null,
    lastDurationMs: null,
    totalInputTokens: null,
    totalOutputTokens: null,
    tokenUsageAvailable: false,
    lastProvider: null,
    lastModel: null,
  };

  const stationNodes: AgentStationNodeSnapshot[] = AGENT_CATALOG.map((def) => {
    const derived = deriveStationState(def.agentId);
    const agentEvents = recentEvents
      .filter(
        (ev) =>
          ev.agentId === def.agentId ||
          ev.sourceAgentId === def.agentId ||
          ev.destinationAgentId === def.agentId,
      )
      .slice(0, 15);

    const isCommunicating = activeLinks.some(
      (l) => l.sourceAgentId === def.agentId || l.destinationAgentId === def.agentId,
    );

    const finalState: AgentExecutionState =
      isCommunicating && derived.state !== 'unavailable'
        ? 'communicating'
        : derived.state;

    return {
      agentId: def.agentId,
      name: def.name,
      shortName: def.shortName,
      role: def.role,
      description: def.description,
      isOrchestrator: def.isOrchestrator,
      accentHex: def.accentHex,
      propKind: def.propKind,
      state: finalState,
      availabilityStatus: derived.availabilityStatus,
      providerSummary: derived.providerSummary,
      connectedAgentIds: [...def.connectedAgentIds],
      currentTask: derived.currentTask,
      lastExecution: derived.lastExecution,
      recentEvents: agentEvents,
      metrics: {
        ...(metricsByAgent.get(def.agentId) ?? { ...defaultMetrics }),
        usageTelemetry: usageTelemetryByAgent.get(def.agentId),
      },
    };
  });

  // Compute orchestrator rollup state honestly
  const specialistNodes = stationNodes.filter((n) => !n.isOrchestrator);
  const anyRunningOrQueued = specialistNodes.some(
    (n) =>
      n.state === 'running' ||
      n.state === 'queued' ||
      n.state === 'retrying' ||
      n.state === 'communicating',
  );
  const anyWaitingApproval = specialistNodes.some(
    (n) => n.state === 'waiting_for_approval',
  );
  const anyFailed = specialistNodes.some((n) => n.state === 'failed');
  const activeWf = workflows.find(
    (w) =>
      w.status === 'running' ||
      w.status === 'queued' ||
      w.status === 'waiting_for_approval',
  );
  const latestWf = workflows[0] ?? null;

  const finalNodes: AgentStationNodeSnapshot[] = stationNodes.map((n) => {
    if (!n.isOrchestrator) return n;
    const orchState: AgentExecutionState =
      activeLinks.length > 0
        ? 'communicating'
        : anyRunningOrQueued
          ? 'running'
          : anyWaitingApproval
            ? 'waiting_for_approval'
            : anyFailed
              ? 'failed'
              : latestWf?.status === 'completed'
                ? 'completed'
                : 'idle';
    const lastStatus: AgentExecutionState =
      latestWf?.status === 'failed'
        ? 'failed'
        : latestWf?.status === 'cancelled'
          ? 'cancelled'
          : latestWf?.status === 'waiting_for_approval'
            ? 'waiting_for_approval'
            : latestWf?.status === 'completed'
              ? 'completed'
              : 'running';
    return {
      ...n,
      state: orchState,
      currentTask: activeWf
        ? {
            taskId: activeWf.workflowId,
            workflowId: activeWf.workflowId,
            title: activeWf.title,
            startedAt: activeWf.startedAt,
            progressPct: null,
            evidenceUrl: activeWf.evidenceUrl,
          }
        : null,
      lastExecution: latestWf
        ? {
            status: lastStatus,
            summary: latestWf.title,
            timestamp: latestWf.completedAt ?? latestWf.startedAt,
            errorSummary: latestWf.errorSummary,
            evidenceUrl: latestWf.evidenceUrl,
          }
        : null,
    };
  });

  const { counts, systemHealth } = recomputeSnapshotCounts(finalNodes, workflows);

  let runtimeSummary: AgentFactorySnapshot['runtimeSummary'];
  try {
    const heartbeats = listWorkerHeartbeatsInDb();
    const freshWorkers = heartbeats.filter((w) => {
      const age = nowMs - Date.parse(w.lastHeartbeatAt);
      return w.status === 'healthy' && Number.isFinite(age) && age <= 45_000;
    });
    const schedulerStatus: 'healthy' | 'degraded' | 'stopped' =
      freshWorkers.length > 0
        ? 'healthy'
        : heartbeats.some((w) => w.status === 'degraded')
          ? 'degraded'
          : 'stopped';
    const schedules = listWorkflowSchedulesInDb(params.tenantId, params.projectId);
    const activeSchedules = schedules.filter((s) => s.status === 'active');
    const triggers = listTriggerSubscriptionsInDb(params.tenantId, params.projectId).filter(
      (t) => t.enabled,
    );
    const openDeadLetters = listDeadLetterTasksInDb(params.tenantId, params.projectId, 50).filter(
      (d) => d.status === 'open',
    );
    const recoveries = listRecoveryRecordsInDb(params.tenantId, params.projectId, 25);
    const policy = getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId);
    const nextRunSorted = activeSchedules
      .map((s) => s.nextRunAt)
      .filter((x): x is string => Boolean(x))
      .sort();

    runtimeSummary = {
      schedulerStatus,
      workerStatus: schedulerStatus,
      activeSchedules: activeSchedules.length,
      activeTriggers: triggers.length,
      pausedWorkflows: stage2Workflows.filter((w) => w.status === 'paused').length,
      openDeadLetters: openDeadLetters.length,
      recentRecoveries: recoveries.length,
      autonomyMode: policy.autonomyMode,
      nextScheduledRunAt: nextRunSorted[0] ?? null,
    };
  } catch {
    // Non-fatal
  }

  return {
    tenantId: params.tenantId,
    projectId: project.id,
    projectName: project.name,
    projectWebsite: project.website,
    generatedAt: new Date(nowMs).toISOString(),
    systemHealth,
    counts,
    nodes: finalNodes,
    workflows: workflows.slice(0, 15),
    recentEvents,
    activeLinks,
    runtimeSummary,
  };
}
