import crypto from 'node:crypto';
import type {
  AgentConfigRecord,
  AgentExecutionTelemetryRecord,
  AgentId,
  AgentOrchestrationOverview,
  AgentOutputRecord,
  AgentStationId,
  AgentWorkflowDetail,
  ApprovalDecisionStatus,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
  WorkflowApprovalRequest,
  WorkflowContextItemRecord,
  WorkflowContextScope,
  WorkflowTaskRecord,
  WorkflowTemplateId,
} from '../../types/agentFactory';
import type {
  RestrictedConditionField,
  RestrictedConditionRule,
  StudioBranchHandle,
  StudioEdgeType,
  StudioFieldMappingEntry,
  StudioNodeCategory,
  StudioNodeSubtype,
} from '../../types/workflowStudio';
import type { User, UserRole } from '../../types/auth';
import {
  buildWorkflowBlueprint,
  computeExponentialBackoffMs,
  getApprovalGateLabel,
  getDownstreamNodeKeys,
  getReadyQueuedTasks,
  isOfficialApprovalGate,
  sanitizeUntrustedTextForPrompt,
  validateStructuredHandoff,
  validateWorkflowDag,
  validateWorkflowGraph,
} from '../../lib/dagValidation';
import {
  classifyExecutionError,
  computeBackoffWithJitterMs,
} from '../../lib/autonomousOperationsEngine';
import {
  getDeadLetterTaskByIdInDb,
  getOrCreateAutonomyPolicyInDb,
  insertRecoveryRecordInDb,
  updateDeadLetterStatusInDb,
  upsertDeadLetterTaskInDb,
} from './operationsDb';
import { evaluateRestrictedCondition } from '../../lib/workflowStudioEngine';
import {
  buildEvidenceTrustBreakdown,
  validateEvidenceTrustForOutput,
} from '../../lib/collaborationGovernance';
import {
  completeDelegationForTask,
  requestIntelligentDelegation,
  runConflictDetectionForWorkflow,
  seedSharedWorkflowContext,
  sendAgentMessage,
  writeWorkflowContextItem,
} from './collaborationService';
import {
  listAgentDelegations,
  listAgentMessages,
  listWorkflowConflicts,
  listWorkflowContextItems,
} from './collaborationDb';
import {
  getAuditDb,
  getKeywordBusinessProfile,
  getProjectById,
  getProjectVerification,
  listCompetitors,
  listContentGaps,
  listCrawlIssues,
  listCrawlRuns,
  listPerformanceAuditRuns,
  recordActivityEvent,
} from '../audit/db';
import { startCrawlJob } from '../audit/crawlerEngine';
import { startPerformanceAudit } from '../performance/performanceEngine';
import {
  getKeywordWorkspace,
  runKeywordDiscoveryWorkflow,
} from '../keywords/keywordService';
import { getGeoWorkspace, runGeoDiscoveryWorkflow } from '../geo/geoService';
import {
  getCompetitorWorkspace,
  runCompetitorAnalysisWorkflow,
} from '../competitors/competitorService';
import { emitRealAgentEvent } from './agentFactoryService';
import {
  type ContentGenerationInput,
  type GeneratedSeoDraft,
  type LlmGenerationResult,
  generateSeoDraftWithProvider,
  isGeminiProviderConfigured,
  resolveSafeGeminiModel,
  runQaDraftValidation,
} from './contentGenerationAdapter';
import {
  completeAgentExecutionInDb,
  createApprovalRequestInDb,
  createWorkflowWithDagInDb,
  getApprovalRequestByIdInDb,
  getProjectExecutionTelemetrySummaryInDb,
  getTaskByIdInDb,
  getWorkflowDetailById,
  insertAgentExecutionInDb,
  insertAgentHandoffInDb,
  insertAgentOutputInDb,
  listAgentConfigsInDb,
  listApprovalRequestsInDb,
  listRunnableWorkflowsGlobal,
  listWorkflowsForProject,
  recoverInterruptedAgentWorkflowsInDb,
  updateApprovalRequestInDb,
  updateTaskRecordInDb,
  updateWorkflowStatusInDb,
  upsertAgentConfigInDb,
} from './orchestrationDb';
import { isProviderQuotaError } from '../../lib/usageCostEngine';
import type {
  UsageMeasurementStatus,
  UsageSource,
} from '../../types/usageIntelligence';
import {
  enforceBudgetsBeforeWorkflowLaunch,
  reconcileAndPersistWorkflowUsage,
  recordAgentExecutionUsage,
} from './usageIntelligenceService';

const MAX_ACTIVE_WORKFLOWS_PER_TENANT = 4;
const MAX_CONCURRENT_WORKERS = 4;

const WORKFLOW_OPERATOR_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Business Owner',
  'Editor',
  'Developer',
]);

const OFFICIAL_APPROVER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
]);

const CONFIG_MANAGER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
]);

export type LlmGeneratorOverride = (
  input: ContentGenerationInput,
  abortSignal?: AbortSignal,
) => Promise<LlmGenerationResult>;

export interface OrchestrationTestHooks {
  llmGenerator?: LlmGeneratorOverride;
  retryDelayOverrideMs?: number;
}

let activeTestHooks: OrchestrationTestHooks | null = null;
export function setOrchestrationTestHooksForTests(
  hooks: OrchestrationTestHooks | null,
): void {
  activeTestHooks = hooks;
}

const activeWorkerTaskIds = new Set<string>();
const workflowAbortControllers = new Map<string, AbortController>();
const workflowRetryTimers = new Map<string, Set<NodeJS.Timeout>>();
const workflowPendingWaiters = new Map<string, Set<() => void>>();
const workflowExecutorUsers = new Map<string, User>();

function assertOperatorRole(role: UserRole): void {
  if (!WORKFLOW_OPERATOR_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to manage or execute Agent Factory workflows.`,
    );
  }
}

// ============================================================================
// READ-ONLY PROVENANCE-TRACKED SHARED WORKFLOW CONTEXT SERVICE
// ============================================================================

export interface SharedWorkflowContextProvenance {
  tenantId: string;
  projectId: string;
  workflowId: string;
  scope: WorkflowContextScope | 'project_snapshot';
  source: string;
  approvalStatus: 'approved' | 'verified_evidence' | 'draft' | 'unverified';
  version: number;
  retrievedAt: string;
  evidenceReferences: readonly string[];
}

export interface SharedWorkflowContextEntry<T> {
  readonly data: Readonly<T>;
  readonly provenance: Readonly<SharedWorkflowContextProvenance>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object' && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Provides safe, strictly read-only access to approved project data (business profile,
 * target markets, approved keywords, competitor evidence, crawl/performance snapshots,
 * and versioned workflow context items) to specialist agents during execution, with
 * immutable provenance tracking and zero silent mutation.
 */
export class SharedWorkflowContext {
  readonly tenantId: string;
  readonly projectId: string;
  readonly workflowId: string;
  private readonly accessLog: SharedWorkflowContextProvenance[] = [];

  constructor(params: { tenantId: string; projectId: string; workflowId: string }) {
    this.tenantId = params.tenantId;
    this.projectId = params.projectId;
    this.workflowId = params.workflowId;
  }

  private recordProvenance(
    prov: Omit<SharedWorkflowContextProvenance, 'tenantId' | 'projectId' | 'workflowId' | 'retrievedAt'>,
  ): Readonly<SharedWorkflowContextProvenance> {
    const entry: SharedWorkflowContextProvenance = deepFreeze({
      tenantId: this.tenantId,
      projectId: this.projectId,
      workflowId: this.workflowId,
      scope: prov.scope,
      source: prov.source,
      approvalStatus: prov.approvalStatus,
      version: prov.version,
      retrievedAt: new Date().toISOString(),
      evidenceReferences: [...prov.evidenceReferences],
    });
    this.accessLog.push(entry);
    return entry;
  }

  private getLatestVersionedItem(scope: WorkflowContextScope): WorkflowContextItemRecord | null {
    const items = listWorkflowContextItems({
      tenantId: this.tenantId,
      projectId: this.projectId,
      workflowId: this.workflowId,
      contextScope: scope,
      limit: 10,
    });
    return items[0] ?? null;
  }

  getApprovedBusinessProfile(): SharedWorkflowContextEntry<{
    projectName: string;
    projectWebsite: string;
    domainVerified: boolean;
    approvedServices: readonly string[];
    businessSummary: string;
    isApproved: boolean;
  }> {
    const project = getProjectById(this.tenantId, this.projectId);
    if (!project) {
      throw new Error('NOT_FOUND: Project not found in SharedWorkflowContext.');
    }
    const profile = getKeywordBusinessProfile(this.tenantId, this.projectId);
    const verification = getProjectVerification(this.tenantId, this.projectId, project.website);
    const latestCtx = this.getLatestVersionedItem('approved_business_profile');
    const isApproved = profile.approvedServices.length > 0;
    const refs = [`https://${project.website}/`];

    const data = deepFreeze({
      projectName: project.name,
      projectWebsite: project.website,
      domainVerified: verification.verified,
      approvedServices: [...profile.approvedServices],
      businessSummary: profile.approvedNiche ?? '',
      isApproved,
    });

    const provenance = this.recordProvenance({
      scope: 'approved_business_profile',
      source: latestCtx?.source ?? 'keyword_business_profile',
      approvalStatus: isApproved ? 'approved' : 'unverified',
      version: latestCtx?.version ?? 1,
      evidenceReferences: latestCtx?.evidenceReferences.length ? latestCtx.evidenceReferences : refs,
    });

    return deepFreeze({ data, provenance });
  }

  getApprovedTargetMarkets(): SharedWorkflowContextEntry<{
    markets: ReadonlyArray<{
      countryCode: string;
      countryName: string;
      languageCode: string;
      priority: string;
    }>;
    marketCodes: readonly string[];
    hasApprovedMarkets: boolean;
  }> {
    const project = getProjectById(this.tenantId, this.projectId);
    if (!project) {
      throw new Error('NOT_FOUND: Project not found in SharedWorkflowContext.');
    }
    const geoWs = getGeoWorkspace(this.tenantId, this.projectId);
    const latestCtx = this.getLatestVersionedItem('target_markets');
    const markets = geoWs.targetMarkets.map((m) => ({
      countryCode: m.countryCode,
      countryName: m.countryName,
      languageCode: m.language,
      priority: m.priority,
    }));
    const marketCodes =
      markets.length > 0 ? markets.map((m) => m.countryCode) : [...project.targetMarkets];

    const data = deepFreeze({
      markets,
      marketCodes,
      hasApprovedMarkets: marketCodes.length > 0,
    });

    const provenance = this.recordProvenance({
      scope: 'target_markets',
      source: latestCtx?.source ?? 'geo_target_markets',
      approvalStatus: marketCodes.length > 0 ? 'approved' : 'unverified',
      version: latestCtx?.version ?? 1,
      evidenceReferences: [`https://${project.website}/`],
    });

    return deepFreeze({ data, provenance });
  }

  getApprovedKeywords(): SharedWorkflowContextEntry<{
    keywords: ReadonlyArray<{
      id: string;
      keyword: string;
      intent: string;
      workflowState: string;
      opportunityScore: number;
      targetUrl: string | null;
    }>;
    approvedCount: number;
    totalCount: number;
  }> {
    const kwWs = getKeywordWorkspace(this.tenantId, this.projectId);
    const latestCtx = this.getLatestVersionedItem('approved_keywords');
    const nonRejected = kwWs.keywords.filter((k) => k.workflowState !== 'rejected');
    const approved = nonRejected.filter((k) => k.workflowState === 'approved');
    const list = (approved.length > 0 ? approved : nonRejected).slice(0, 50).map((k) => ({
      id: k.id,
      keyword: k.keyword,
      intent: k.intent,
      workflowState: k.workflowState,
      opportunityScore: k.opportunityScore,
      targetUrl: k.mapping?.targetUrl ?? null,
    }));

    const refs = list
      .map((k) => k.targetUrl)
      .filter((u): u is string => Boolean(u))
      .slice(0, 12);

    const data = deepFreeze({
      keywords: list,
      approvedCount: approved.length,
      totalCount: nonRejected.length,
    });

    const provenance = this.recordProvenance({
      scope: 'approved_keywords',
      source: latestCtx?.source ?? 'keyword_intelligence_workspace',
      approvalStatus: approved.length > 0 ? 'approved' : 'verified_evidence',
      version: latestCtx?.version ?? 1,
      evidenceReferences: refs,
    });

    return deepFreeze({ data, provenance });
  }

  getCompetitorEvidence(): SharedWorkflowContextEntry<{
    competitorsCount: number;
    contentGapsCount: number;
    competitorDomains: readonly string[];
  }> {
    const competitors = listCompetitors(this.tenantId, this.projectId);
    const gaps = listContentGaps(this.tenantId, this.projectId);
    const latestCtx = this.getLatestVersionedItem('competitor_evidence');
    const domains = competitors.map((c) => c.domain);

    const data = deepFreeze({
      competitorsCount: competitors.length,
      contentGapsCount: gaps.length,
      competitorDomains: domains,
    });

    const provenance = this.recordProvenance({
      scope: 'competitor_evidence',
      source: latestCtx?.source ?? 'competitor_intelligence_db',
      approvalStatus: competitors.length > 0 ? 'verified_evidence' : 'unverified',
      version: latestCtx?.version ?? 1,
      evidenceReferences: domains.slice(0, 8).map((d) => `https://${d}/`),
    });

    return deepFreeze({ data, provenance });
  }

  getTechnicalAuditSnapshot(): SharedWorkflowContextEntry<{
    hasCompletedCrawl: boolean;
    latestCrawlId: string | null;
    healthScore: number | null;
    openCriticalIssues: number;
    totalIssues: number;
  }> {
    const crawls = listCrawlRuns(this.tenantId, this.projectId).filter(
      (c) => c.status === 'Succeeded' || c.status === 'Partial',
    );
    const latest = crawls[0] ?? null;
    const issues = latest ? listCrawlIssues(this.tenantId, latest.id) : [];
    const openCritical = issues.filter(
      (i) =>
        (i.severity === 'Critical' || i.severity === 'High') &&
        i.status !== 'Verified' &&
        i.status !== 'Rejected',
    );

    const data = deepFreeze({
      hasCompletedCrawl: Boolean(latest),
      latestCrawlId: latest?.id ?? null,
      healthScore: latest ? latest.summary.healthScore : null,
      openCriticalIssues: openCritical.length,
      totalIssues: issues.length,
    });

    const provenance = this.recordProvenance({
      scope: 'technical_audit',
      source: latest ? `crawl:${latest.id}` : 'technical_seo_crawler',
      approvalStatus: latest ? 'verified_evidence' : 'unverified',
      version: 1,
      evidenceReferences: latest ? [`crawl:${latest.id}`] : [],
    });

    return deepFreeze({ data, provenance });
  }

  getPerformanceSnapshot(): SharedWorkflowContextEntry<{
    hasPerformanceRun: boolean;
    latestRunId: string | null;
    mobileScore: number | null;
    desktopScore: number | null;
  }> {
    const runs = listPerformanceAuditRuns(this.tenantId, this.projectId).filter(
      (r) => r.status === 'Succeeded',
    );
    const latest = runs[0] ?? null;
    const data = deepFreeze({
      hasPerformanceRun: Boolean(latest),
      latestRunId: latest?.id ?? null,
      mobileScore: latest?.avgMobileScore ?? null,
      desktopScore: latest?.avgDesktopScore ?? null,
    });

    const provenance = this.recordProvenance({
      scope: 'performance_findings',
      source: latest ? `pagespeed:${latest.id}` : 'pagespeed_insights',
      approvalStatus: latest ? 'verified_evidence' : 'unverified',
      version: 1,
      evidenceReferences: latest ? latest.targetUrls.slice(0, 4) : [],
    });

    return deepFreeze({ data, provenance });
  }

  getContextHistory(scope?: WorkflowContextScope): readonly WorkflowContextItemRecord[] {
    const items = listWorkflowContextItems({
      tenantId: this.tenantId,
      projectId: this.projectId,
      workflowId: this.workflowId,
      contextScope: scope,
      limit: 50,
    });
    return deepFreeze(structuredClone(items));
  }

  getProvenanceSummary(): readonly SharedWorkflowContextProvenance[] {
    return deepFreeze([...this.accessLog]);
  }
}

export function createSharedWorkflowContext(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
}): SharedWorkflowContext {
  return new SharedWorkflowContext(params);
}

function assertOfficialApproverRole(role: UserRole): void {
  if (!OFFICIAL_APPROVER_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" cannot grant official approval decisions. Only Business Owner, Agency Owner, or Platform Admin may approve, reject, or request revisions on gated deliverables.`,
    );
  }
}

function getAbortControllerForWorkflow(workflowId: string): AbortController {
  let controller = workflowAbortControllers.get(workflowId);
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    workflowAbortControllers.set(workflowId, controller);
  }
  return controller;
}

function clearWorkflowTimers(workflowId: string): void {
  const timers = workflowRetryTimers.get(workflowId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }
}

function notifyWorkflowWaiters(workflowId: string): void {
  const waiters = workflowPendingWaiters.get(workflowId);
  if (!waiters) return;
  for (const resolve of waiters) {
    resolve();
  }
}

/**
 * Waits in unit/integration tests until a running workflow reaches waiting_for_approval,
 * completed, failed, or cancelled (or times out).
 */
export async function waitForWorkflowToSettle(
  tenantId: string,
  workflowId: string,
  timeoutMs = 15_000,
): Promise<AgentWorkflowDetail> {
  const isSettled = (detail: AgentWorkflowDetail | null): boolean => {
    if (!detail) return true;
    const st = detail.workflow.status;
    if (st === 'completed' || st === 'failed' || st === 'cancelled') return true;
    if (st === 'waiting_for_approval') {
      const anyRunning = detail.tasks.some(
        (t) => t.status === 'running' || t.status === 'retrying',
      );
      return !anyRunning;
    }
    return false;
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cur = getWorkflowDetailById(tenantId, workflowId);
    if (isSettled(cur)) {
      if (!cur) throw new Error('NOT_FOUND: Workflow disappeared.');
      return cur;
    }
    await new Promise<void>((resolve) => {
      let set = workflowPendingWaiters.get(workflowId);
      if (!set) {
        set = new Set();
        workflowPendingWaiters.set(workflowId, set);
      }
      const timer = setTimeout(() => {
        set?.delete(onWake);
        resolve();
      }, 150);
      const onWake = () => {
        clearTimeout(timer);
        set?.delete(onWake);
        resolve();
      };
      set.add(onWake);
    });
  }
  const latest = getWorkflowDetailById(tenantId, workflowId);
  if (!latest) throw new Error('NOT_FOUND: Workflow not found.');
  return latest;
}

export function getAgentOrchestrationOverview(
  tenantId: string,
  projectId: string,
): AgentOrchestrationOverview {
  const project = getProjectById(tenantId, projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const workflows = listWorkflowsForProject(tenantId, projectId, 20);
  const pendingApprovals = listApprovalRequestsInDb(tenantId, projectId, 'pending');
  const configs = listAgentConfigsInDb(tenantId, projectId);
  const telemetry = getProjectExecutionTelemetrySummaryInDb(tenantId, projectId);

  return {
    workflows,
    pendingApprovals,
    configs,
    telemetrySummary: {
      ...telemetry,
      billingCostSummary:
        telemetry.measuredTotalTokens !== null
          ? 'Exact USD billing cost is unavailable from Gemini usageMetadata alone (provider billing API not configured).'
          : 'No metered LLM tokens recorded yet for this project.',
      activeWorkers: activeWorkerTaskIds.size,
      maxConcurrentWorkers: MAX_CONCURRENT_WORKERS,
    },
  };
}

export function getAgentWorkflowDetailScoped(
  tenantId: string,
  projectId: string,
  workflowId: string,
): AgentWorkflowDetail {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail || detail.workflow.projectId !== projectId) {
    throw new Error('NOT_FOUND: Workflow not found in this project workspace.');
  }
  return detail;
}

export function validateWorkflowDagRequest(params: {
  templateId?: WorkflowTemplateId;
  nodes?: DagWorkflowNodeInput[];
  edges?: DagWorkflowEdgeInput[];
  options?: {
    requireStrategyApproval?: boolean;
    requireDraftApproval?: boolean;
    requirePublishApproval?: boolean;
    includeGeo?: boolean;
    includeCompetitor?: boolean;
  };
}) {
  if (params.nodes && params.edges) {
    return validateWorkflowDag(params.nodes, params.edges);
  }
  const tpl = buildWorkflowBlueprint(
    params.templateId ?? 'seo_content_pipeline',
    params.options,
  );
  return validateWorkflowDag(tpl.nodes, tpl.edges);
}

export function createAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  templateId: WorkflowTemplateId;
  name?: string;
  objective?: string;
  nodes?: DagWorkflowNodeInput[];
  edges?: DagWorkflowEdgeInput[];
  config?: Record<string, unknown>;
  blueprintOptions?: {
    requireStrategyApproval?: boolean;
    requireDraftApproval?: boolean;
    requirePublishApproval?: boolean;
    includeGeo?: boolean;
    includeCompetitor?: boolean;
  };
  autoStart?: boolean;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);

  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const existingWorkflows = listWorkflowsForProject(params.tenantId, params.projectId, 40);
  const activeCount = existingWorkflows.filter(
    (w) =>
      w.status === 'running' ||
      w.status === 'queued' ||
      w.status === 'waiting_for_approval',
  ).length;
  if (activeCount >= MAX_ACTIVE_WORKFLOWS_PER_TENANT) {
    throw new Error(
      `CONFLICT: Workspace already has ${activeCount} active workflows (limit ${MAX_ACTIVE_WORKFLOWS_PER_TENANT}). Wait for completion or cancel an active workflow.`,
    );
  }

  const blueprint =
    params.nodes && params.edges
      ? {
          name: params.name?.trim() || 'Custom Multi-Agent Workflow',
          nodes: params.nodes,
          edges: params.edges,
        }
      : buildWorkflowBlueprint(params.templateId, params.blueprintOptions);

  const dagCheck = validateWorkflowDag(blueprint.nodes, blueprint.edges);
  const graphNodesCheck = validateWorkflowGraph(
    blueprint.nodes.map((n) => ({
      id: n.nodeKey,
      prerequisites: blueprint.edges
        .filter((e) => e.toNodeKey === n.nodeKey)
        .map((e) => e.fromNodeKey),
    })),
  );
  if (!dagCheck.valid || !graphNodesCheck) {
    throw new Error(
      `BAD_REQUEST: ${
        dagCheck.errors.length > 0
          ? dagCheck.errors.join(' ')
          : 'Workflow graph failed reachability or acyclicity validation.'
      }`,
    );
  }

  // Inherit configured maxRetries & timeoutMs from project agent configurations unless overridden
  const configs = listAgentConfigsInDb(params.tenantId, params.projectId);
  const configByAgent = new Map(configs.map((c) => [c.agentId, c]));
  const normalizedNodes = blueprint.nodes.map((node) => {
    const cfg = configByAgent.get(node.agentId);
    return {
      ...node,
      maxRetries: node.maxRetries ?? cfg?.maxRetries ?? 2,
      timeoutMs: node.timeoutMs ?? cfg?.timeoutMs ?? 60_000,
    };
  });

  const wfId = `awf-${crypto.randomUUID().slice(0, 10)}`;
  const shouldStart = params.autoStart !== false;

  // Stage 5: Enforce configured workspace/project/agent budgets before launching workflow
  if (shouldStart) {
    const budgetCheck = enforceBudgetsBeforeWorkflowLaunch({
      tenantId: params.tenantId,
      projectId: params.projectId,
      targetAgentIds: normalizedNodes.map((n) => n.agentId),
      workflowId: wfId,
      budgetApprovalBypassedBy: params.config?.budgetOverrideApproved
        ? params.user
        : null,
    });
    if (!budgetCheck.allowed) {
      if (budgetCheck.requiresApproval) {
        throw new Error(
          `BUDGET_APPROVAL_REQUIRED: ${budgetCheck.blockingReason ?? 'Workspace spending limit requires administrator approval before starting this workflow.'}`,
        );
      }
      throw new Error(
        `BUDGET_EXCEEDED: ${budgetCheck.blockingReason ?? 'Workspace spending or token budget limit has been reached.'}`,
      );
    }
  }

  const detail = createWorkflowWithDagInDb({
    id: wfId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    templateId: params.templateId,
    name: params.name?.trim() || blueprint.name,
    objective:
      params.objective?.trim() ||
      `Execute ${blueprint.name} using verified evidence from ${project.website}`,
    createdBy: params.user.name,
    status: shouldStart ? 'running' : 'queued',
    nodes: normalizedNodes,
    edges: blueprint.edges,
    config: params.config ?? {},
  });

  workflowExecutorUsers.set(wfId, params.user);

  // Stage 3: Seed versioned Shared Workflow Context with approved project baselines
  try {
    seedSharedWorkflowContext({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: wfId,
    });
  } catch {
    // Do not block workflow creation if optional context snapshot encounters transient issue
  }

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Created Agent Factory workflow "${detail.workflow.name}" (${detail.tasks.length} tasks)`,
    status: 'Pending',
    evidenceUrl: '/agent-factory',
  });

  if (shouldStart) {
    emitRealAgentEvent({
      eventType: 'workflow.started',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: wfId,
      taskId: wfId,
      agentId: 'orchestrator',
      status: 'running',
      taskTitle: detail.workflow.name,
      summary: `Started workflow DAG (${detail.tasks.length} nodes across ${dagCheck.layers.length} execution stage(s))`,
      evidenceUrl: '/agent-factory',
    });

    queueMicrotask(() => {
      scheduleWorkflowExecution(params.tenantId, wfId);
    });
  }

  return detail;
}

export function startAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const detail = getAgentWorkflowDetailScoped(
    params.tenantId,
    params.projectId,
    params.workflowId,
  );
  if (
    detail.workflow.status === 'completed' ||
    detail.workflow.status === 'cancelled'
  ) {
    throw new Error(
      `BAD_REQUEST: Workflow in "${detail.workflow.status}" state cannot be started.`,
    );
  }

  workflowExecutorUsers.set(detail.workflow.id, params.user);
  const now = new Date().toISOString();
  updateWorkflowStatusInDb({
    tenantId: params.tenantId,
    workflowId: detail.workflow.id,
    status: 'running',
    currentStage: 'Dispatching ready tasks',
    blockingReason: null,
    startedAt: detail.workflow.startedAt ?? now,
    completedAt: null,
    cancelledAt: null,
  });

  emitRealAgentEvent({
    eventType: 'workflow.started',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    taskId: detail.workflow.id,
    agentId: 'orchestrator',
    status: 'running',
    taskTitle: detail.workflow.name,
    summary: `Orchestrator started workflow execution`,
    evidenceUrl: '/agent-factory',
  });

  queueMicrotask(() => {
    scheduleWorkflowExecution(params.tenantId, detail.workflow.id);
  });

  return getWorkflowDetailById(params.tenantId, detail.workflow.id)!;
}

export function cancelAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
  reason?: string;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const detail = getAgentWorkflowDetailScoped(
    params.tenantId,
    params.projectId,
    params.workflowId,
  );

  const controller = workflowAbortControllers.get(detail.workflow.id);
  if (controller) {
    controller.abort();
    workflowAbortControllers.delete(detail.workflow.id);
  }
  clearWorkflowTimers(detail.workflow.id);

  const now = new Date().toISOString();
  const reasonText =
    params.reason?.trim() || `Cancelled by ${params.user.name} (${params.user.role})`;

  for (const task of detail.tasks) {
    if (
      task.status === 'queued' ||
      task.status === 'retrying' ||
      task.status === 'running' ||
      task.status === 'waiting_for_approval' ||
      task.status === 'blocked'
    ) {
      updateTaskRecordInDb({
        tenantId: params.tenantId,
        taskId: task.id,
        status: 'cancelled',
        blockingReason: reasonText,
        completedAt: now,
      });
      emitRealAgentEvent({
        eventType: 'agent.cancelled',
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: detail.workflow.id,
        taskId: task.id,
        agentId: task.agentId,
        status: 'cancelled',
        taskTitle: task.title,
        summary: reasonText,
        evidenceUrl: '/agent-factory',
      });
    }
  }

  for (const appr of detail.approvals) {
    if (appr.status === 'pending') {
      updateApprovalRequestInDb({
        tenantId: params.tenantId,
        approvalId: appr.id,
        status: 'rejected',
        approverId: params.user.id,
        approverName: params.user.name,
        approverRole: params.user.role,
        comments: reasonText,
        auditHistory: [
          ...appr.auditHistory,
          {
            action: 'rejected',
            actorId: params.user.id,
            actorName: params.user.name,
            actorRole: params.user.role,
            comments: `Auto-closed because workflow was cancelled: ${reasonText}`,
            timestamp: now,
          },
        ],
        decidedAt: now,
      });
    }
  }

  updateWorkflowStatusInDb({
    tenantId: params.tenantId,
    workflowId: detail.workflow.id,
    status: 'cancelled',
    currentStage: 'Cancelled',
    blockingReason: reasonText,
    cancelledAt: now,
  });

  emitRealAgentEvent({
    eventType: 'workflow.cancelled',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    taskId: detail.workflow.id,
    agentId: 'orchestrator',
    status: 'cancelled',
    taskTitle: detail.workflow.name,
    summary: reasonText,
    evidenceUrl: '/agent-factory',
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Cancelled workflow "${detail.workflow.name}": ${reasonText}`,
    status: 'Warning',
    evidenceUrl: '/agent-factory',
  });

  notifyWorkflowWaiters(detail.workflow.id);
  return getWorkflowDetailById(params.tenantId, detail.workflow.id)!;
}

export function retryWorkflowTask(params: {
  tenantId: string;
  projectId: string;
  taskId: string;
  user: User;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const task = getTaskByIdInDb(params.tenantId, params.taskId);
  if (!task || task.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Task not found in this project workspace.');
  }
  if (task.status !== 'failed' && task.status !== 'blocked') {
    throw new Error(
      `BAD_REQUEST: Only failed or blocked tasks can be retried (current status: ${task.status}).`,
    );
  }

  const detail = getWorkflowDetailById(params.tenantId, task.workflowId);
  if (!detail) throw new Error('NOT_FOUND: Workflow not found.');
  if (detail.workflow.status === 'cancelled') {
    throw new Error('BAD_REQUEST: Cannot retry task on a cancelled workflow.');
  }

  workflowExecutorUsers.set(detail.workflow.id, params.user);

  // Reset failed task + any downstream tasks that were blocked solely because of upstream failure
  updateTaskRecordInDb({
    tenantId: params.tenantId,
    taskId: task.id,
    status: 'queued',
    nextRetryAt: null,
    blockingReason: `Manual retry queued by ${params.user.name}`,
    errorSummary: null,
    completedAt: null,
  });

  const downstreamKeys = getDownstreamNodeKeys(task.nodeKey, detail.edges);
  for (const dt of detail.tasks) {
    if (downstreamKeys.includes(dt.nodeKey) && dt.status === 'blocked') {
      updateTaskRecordInDb({
        tenantId: params.tenantId,
        taskId: dt.id,
        status: 'queued',
        blockingReason: null,
        errorSummary: null,
        completedAt: null,
      });
    }
  }

  updateWorkflowStatusInDb({
    tenantId: params.tenantId,
    workflowId: detail.workflow.id,
    status: 'running',
    currentStage: `Retrying ${task.title}`,
    blockingReason: null,
    completedAt: null,
  });

  emitRealAgentEvent({
    eventType: 'agent.queued',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    taskId: task.id,
    agentId: task.agentId,
    status: 'queued',
    taskTitle: task.title,
    summary: `Manual retry requested by ${params.user.name}`,
    evidenceUrl: '/agent-factory',
  });

  queueMicrotask(() => {
    scheduleWorkflowExecution(params.tenantId, detail.workflow.id);
  });

  return getWorkflowDetailById(params.tenantId, detail.workflow.id)!;
}

// ============================================================================
// STAGE 6: LIFECYCLE HOOKS, PAUSE / RESUME / TRACEABLE REPLAY / DEAD-LETTER RETRY
// ============================================================================

export type WorkflowLifecycleTriggerHook = (event: {
  tenantId: string;
  projectId: string;
  triggerType: 'workflow_completed' | 'workflow_failed' | 'approval_decided';
  sourceRef: string;
  idempotencyKey: string;
  payloadSummary: string;
  payload: Record<string, unknown>;
}) => void;

let workflowLifecycleTriggerHook: WorkflowLifecycleTriggerHook | null = null;

export function setWorkflowLifecycleTriggerHook(
  hook: WorkflowLifecycleTriggerHook | null,
): void {
  workflowLifecycleTriggerHook = hook;
}

function fireLifecycleTriggerHook(event: {
  tenantId: string;
  projectId: string;
  triggerType: 'workflow_completed' | 'workflow_failed' | 'approval_decided';
  sourceRef: string;
  idempotencyKey: string;
  payloadSummary: string;
  payload: Record<string, unknown>;
}): void {
  if (!workflowLifecycleTriggerHook) return;
  try {
    workflowLifecycleTriggerHook(event);
  } catch {
    // Never break core workflow execution if trigger dispatch fails
  }
}

export function pauseAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
  reason?: string;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Workflow not found in this project.');
  }
  if (
    detail.workflow.status !== 'running' &&
    detail.workflow.status !== 'queued' &&
    detail.workflow.status !== 'waiting_for_approval'
  ) {
    throw new Error(
      `BAD_REQUEST: Only running, queued, or waiting_for_approval workflows can be paused (current: ${detail.workflow.status}).`,
    );
  }

  const prevStatus = detail.workflow.status;
  const reasonText = (params.reason?.trim() || `Paused by ${params.user.name}`).slice(0, 260);
  clearWorkflowTimers(detail.workflow.id);

  updateWorkflowStatusInDb({
    tenantId: params.tenantId,
    workflowId: detail.workflow.id,
    status: 'paused',
    currentStage: 'Paused',
    blockingReason: reasonText,
  });

  insertRecoveryRecordInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    actionType: 'workflow_paused',
    previousStatus: prevStatus,
    newStatus: 'paused',
    actor: `${params.user.name} (${params.user.role})`,
    reason: reasonText,
  });

  emitRealAgentEvent({
    eventType: 'workflow.paused',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    taskId: detail.workflow.id,
    agentId: 'orchestrator',
    status: 'paused',
    taskTitle: detail.workflow.name,
    summary: reasonText,
    evidenceUrl: '/agent-factory/operations',
  });

  notifyWorkflowWaiters(detail.workflow.id);
  return getWorkflowDetailById(params.tenantId, detail.workflow.id)!;
}

export function resumeAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
  reason?: string;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Workflow not found in this project.');
  }
  if (detail.workflow.status !== 'paused') {
    throw new Error(
      `BAD_REQUEST: Only paused workflows can be resumed (current: ${detail.workflow.status}).`,
    );
  }

  // Enforce Stage 5 budgets before resuming execution
  const targetAgentIds = Array.from(new Set(detail.tasks.map((t) => t.agentId)));
  const budgetCheck = enforceBudgetsBeforeWorkflowLaunch({
    tenantId: params.tenantId,
    projectId: params.projectId,
    targetAgentIds,
    workflowId: detail.workflow.id,
    budgetApprovalBypassedBy: params.user,
  });
  if (!budgetCheck.allowed) {
    throw new Error(`BUDGET_EXCEEDED: ${budgetCheck.blockingReason ?? 'Project budget limit reached.'}`);
  }

  const reasonText = (params.reason?.trim() || `Resumed by ${params.user.name}`).slice(0, 260);
  workflowExecutorUsers.set(detail.workflow.id, params.user);

  updateWorkflowStatusInDb({
    tenantId: params.tenantId,
    workflowId: detail.workflow.id,
    status: 'running',
    currentStage: 'Resuming execution',
    blockingReason: null,
  });

  insertRecoveryRecordInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    actionType: 'workflow_resumed',
    previousStatus: 'paused',
    newStatus: 'running',
    actor: `${params.user.name} (${params.user.role})`,
    reason: reasonText,
  });

  emitRealAgentEvent({
    eventType: 'workflow.resumed',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: detail.workflow.id,
    taskId: detail.workflow.id,
    agentId: 'orchestrator',
    status: 'running',
    taskTitle: detail.workflow.name,
    summary: reasonText,
    evidenceUrl: '/agent-factory/operations',
  });

  queueMicrotask(() => {
    scheduleWorkflowExecution(params.tenantId, detail.workflow.id);
  });

  return getWorkflowDetailById(params.tenantId, detail.workflow.id)!;
}

export function replayAgentWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
  reason?: string;
  autoStart?: boolean;
}): AgentWorkflowDetail {
  assertOperatorRole(params.user.role);
  const original = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!original || original.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Original workflow not found in this project.');
  }

  const replayedName = original.workflow.name.includes('(Replay)')
    ? original.workflow.name
    : `${original.workflow.name} (Replay)`;
  const reasonText =
    params.reason?.trim() || `Traceable replay of workflow ${original.workflow.id} by ${params.user.name}`;

  const created = createAgentWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    templateId: original.workflow.templateId,
    name: replayedName,
    objective: original.workflow.objective,
    user: params.user,
    autoStart: params.autoStart ?? true,
    nodes: original.nodes,
    edges: original.edges,
    config: {
      ...original.workflow.config,
      replayedFromWorkflowId: original.workflow.id,
      replayReason: reasonText,
      replayedBy: params.user.name,
      replayedAt: new Date().toISOString(),
    },
  });

  insertRecoveryRecordInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: original.workflow.id,
    actionType: 'workflow_replayed',
    previousStatus: original.workflow.status,
    newStatus: created.workflow.status,
    actor: `${params.user.name} (${params.user.role})`,
    reason: reasonText,
    relatedWorkflowId: created.workflow.id,
  });

  return created;
}

export function retryDeadLetterTask(params: {
  tenantId: string;
  projectId: string;
  deadLetterId: string;
  mode: 'retry_task' | 'replay_workflow';
  user: User;
  reason?: string;
}): {
  workflow: AgentWorkflowDetail;
  deadLetterStatus: 'replayed';
} {
  assertOperatorRole(params.user.role);
  const dlq = getDeadLetterTaskByIdInDb(params.tenantId, params.deadLetterId);
  if (!dlq || dlq.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Dead-letter task not found in this project.');
  }

  let resultWorkflow: AgentWorkflowDetail;
  if (params.mode === 'replay_workflow') {
    resultWorkflow = replayAgentWorkflow({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: dlq.workflowId,
      user: params.user,
      reason: params.reason ?? `Replayed workflow from dead-letter task ${dlq.taskTitle}`,
      autoStart: true,
    });
  } else {
    resultWorkflow = retryWorkflowTask({
      tenantId: params.tenantId,
      projectId: params.projectId,
      taskId: dlq.taskId,
      user: params.user,
    });
  }

  updateDeadLetterStatusInDb({
    tenantId: params.tenantId,
    dlqId: dlq.id,
    status: 'replayed',
    replayedWorkflowId: resultWorkflow.workflow.id,
    resolvedBy: `${params.user.name} (${params.user.role})`,
  });

  insertRecoveryRecordInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: dlq.workflowId,
    taskId: dlq.taskId,
    actionType: 'dead_letter_replayed',
    previousStatus: 'failed',
    newStatus: resultWorkflow.workflow.status,
    actor: `${params.user.name} (${params.user.role})`,
    reason: params.reason ?? `Dead-letter ${params.mode} initiated by ${params.user.name}`,
    relatedWorkflowId: resultWorkflow.workflow.id,
  });

  return { workflow: resultWorkflow, deadLetterStatus: 'replayed' };
}

export function decideWorkflowApproval(params: {
  tenantId: string;
  projectId: string;
  approvalId: string;
  decision: Exclude<ApprovalDecisionStatus, 'pending'>;
  comments?: string;
  user: User;
}): {
  approval: WorkflowApprovalRequest;
  workflow: AgentWorkflowDetail;
} {
  const existing = getApprovalRequestByIdInDb(params.tenantId, params.approvalId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Approval request not found.');
  }

  if (isOfficialApprovalGate(existing.gateType)) {
    assertOfficialApproverRole(params.user.role);
  } else {
    assertOperatorRole(params.user.role);
  }

  if (existing.status !== 'pending') {
    throw new Error(
      `BAD_REQUEST: Approval request "${existing.id}" has already been decided (${existing.status}).`,
    );
  }

  const now = new Date().toISOString();
  const commentText = (params.comments ?? '').trim();
  if (
    (params.decision === 'rejected' || params.decision === 'revision_requested') &&
    !commentText
  ) {
    throw new Error(
      'BAD_REQUEST: Provide review comments explaining why this deliverable requires revision or is rejected.',
    );
  }

  const updatedApproval = updateApprovalRequestInDb({
    tenantId: params.tenantId,
    approvalId: existing.id,
    status: params.decision,
    approverId: params.user.id,
    approverName: params.user.name,
    approverRole: params.user.role,
    comments: commentText,
    auditHistory: [
      ...existing.auditHistory,
      {
        action: params.decision,
        actorId: params.user.id,
        actorName: params.user.name,
        actorRole: params.user.role,
        comments: commentText || `Marked ${params.decision}`,
        timestamp: now,
      },
    ],
    decidedAt: now,
  })!;

  const detail = getWorkflowDetailById(params.tenantId, existing.workflowId);
  const task = getTaskByIdInDb(params.tenantId, existing.taskId);
  if (!detail || !task) {
    throw new Error('NOT_FOUND: Associated workflow task not found.');
  }

  workflowExecutorUsers.set(detail.workflow.id, params.user);

  if (params.decision === 'approved') {
    updateTaskRecordInDb({
      tenantId: params.tenantId,
      taskId: task.id,
      status: 'completed',
      blockingReason: null,
      completedAt: now,
    });

    emitRealAgentEvent({
      eventType: 'approval.decided',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: detail.workflow.id,
      taskId: task.id,
      agentId: task.agentId,
      status: 'completed',
      taskTitle: task.title,
      summary: `${getApprovalGateLabel(existing.gateType)} approved by ${params.user.name} (${params.user.role})`,
      evidenceUrl: '/agent-factory',
    });

    emitRealAgentEvent({
      eventType: 'agent.completed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: detail.workflow.id,
      taskId: task.id,
      agentId: task.agentId,
      status: 'completed',
      taskTitle: task.title,
      summary: `Gate passed — unlocking downstream tasks`,
      evidenceUrl: '/agent-factory',
    });

    updateWorkflowStatusInDb({
      tenantId: params.tenantId,
      workflowId: detail.workflow.id,
      status: 'running',
      currentStage: 'Resuming after approval',
      blockingReason: null,
    });

    recordActivityEvent({
      tenantId: params.tenantId,
      projectId: params.projectId,
      type: 'content_review',
      actor: params.user.name,
      action: `Approved "${existing.title}" (${getApprovalGateLabel(existing.gateType)})`,
      status: 'Succeeded',
      evidenceUrl: '/agent-factory',
    });

    queueMicrotask(() => {
      scheduleWorkflowExecution(params.tenantId, detail.workflow.id);
    });
  } else if (params.decision === 'revision_requested') {
    updateTaskRecordInDb({
      tenantId: params.tenantId,
      taskId: task.id,
      status: 'queued',
      blockingReason: `Revision requested by ${params.user.name}: ${commentText}`,
      errorSummary: null,
      completedAt: null,
    });

    emitRealAgentEvent({
      eventType: 'approval.decided',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: detail.workflow.id,
      taskId: task.id,
      agentId: task.agentId,
      status: 'queued',
      taskTitle: task.title,
      summary: `Revision requested by ${params.user.name}: ${commentText}`,
      evidenceUrl: '/agent-factory',
    });

    updateWorkflowStatusInDb({
      tenantId: params.tenantId,
      workflowId: detail.workflow.id,
      status: 'running',
      currentStage: `Re-running ${task.title} with revision notes`,
      blockingReason: null,
    });

    queueMicrotask(() => {
      scheduleWorkflowExecution(params.tenantId, detail.workflow.id);
    });
  } else {
    // Rejected
    const errText = `Rejected at ${getApprovalGateLabel(existing.gateType)} by ${params.user.name}: ${commentText}`;
    updateTaskRecordInDb({
      tenantId: params.tenantId,
      taskId: task.id,
      status: 'failed',
      blockingReason: errText,
      errorSummary: errText,
      completedAt: now,
    });

    const downstreamKeys = getDownstreamNodeKeys(task.nodeKey, detail.edges);
    for (const dt of detail.tasks) {
      if (downstreamKeys.includes(dt.nodeKey) && dt.status === 'queued') {
        updateTaskRecordInDb({
          tenantId: params.tenantId,
          taskId: dt.id,
          status: 'blocked',
          blockingReason: `Blocked because upstream gate "${task.title}" was rejected.`,
          completedAt: now,
        });
      }
    }

    emitRealAgentEvent({
      eventType: 'approval.decided',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: detail.workflow.id,
      taskId: task.id,
      agentId: task.agentId,
      status: 'failed',
      taskTitle: task.title,
      summary: errText,
      errorSummary: errText,
      evidenceUrl: '/agent-factory',
    });

    finalizeWorkflowStateIfFinished(params.tenantId, detail.workflow.id);
  }

  fireLifecycleTriggerHook({
    tenantId: params.tenantId,
    projectId: params.projectId,
    triggerType: 'approval_decided',
    sourceRef: updatedApproval.id,
    idempotencyKey: `approval_decided:${updatedApproval.id}:${params.decision}`,
    payloadSummary: `${updatedApproval.title} marked ${params.decision} by ${params.user.name}`,
    payload: {
      approvalId: updatedApproval.id,
      workflowId: detail.workflow.id,
      taskId: task.id,
      gateType: updatedApproval.gateType,
      decision: params.decision,
      actor: params.user.name,
    },
  });

  return {
    approval: updatedApproval,
    workflow: getWorkflowDetailById(params.tenantId, detail.workflow.id)!,
  };
}

export function updateAgentStationConfig(params: {
  tenantId: string;
  projectId: string;
  agentId: AgentStationId;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  preferredModel: string;
  user: User;
}): AgentConfigRecord {
  if (!CONFIG_MANAGER_ROLES.has(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot modify agent runtime configurations.`,
    );
  }
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  return upsertAgentConfigInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    enabled: params.enabled,
    maxRetries: params.maxRetries,
    timeoutMs: params.timeoutMs,
    preferredModel: resolveSafeGeminiModel(params.preferredModel),
    updatedBy: params.user.name,
  });
}

export function recoverAndResumeAgentWorkflows(): number {
  const recoveredCount = recoverInterruptedAgentWorkflowsInDb();
  const runnable = listRunnableWorkflowsGlobal(10);
  for (const wf of runnable) {
    queueMicrotask(() => {
      scheduleWorkflowExecution(wf.tenantId, wf.id);
    });
  }
  return recoveredCount;
}

// ============================================================================
// DAG SCHEDULER & REAL SPECIALIST ADAPTERS
// ============================================================================

function getSystemUserFallback(workflow: AgentWorkflowDetail['workflow']): User {
  const cached = workflowExecutorUsers.get(workflow.id);
  if (cached) return cached;
  return {
    id: 'usr-system-orchestrator',
    name: workflow.createdBy || 'AI Orchestrator',
    email: 'orchestrator@rovix.local',
    role: 'Agency Owner',
    avatarInitials: 'AO',
    title: 'Workflow Orchestrator',
  };
}

function getStudioEdgeMetaMap(
  workflow: AgentWorkflowDetail['workflow'],
): Record<
  string,
  {
    id?: string;
    source: string;
    target: string;
    edgeType: StudioEdgeType;
    sourceHandle: StudioBranchHandle;
  }
> {
  const raw = workflow.config?.studioEdgeMeta;
  if (raw && typeof raw === 'object') {
    return raw as Record<
      string,
      {
        id?: string;
        source: string;
        target: string;
        edgeType: StudioEdgeType;
        sourceHandle: StudioBranchHandle;
      }
    >;
  }
  return {};
}

function getReadyTasksWithStudioEdgeSemantics(
  detail: AgentWorkflowDetail,
  nowMs: number = Date.now(),
): WorkflowTaskRecord[] {
  const edgeMeta = getStudioEdgeMetaMap(detail.workflow);
  if (Object.keys(edgeMeta).length === 0) {
    return getReadyQueuedTasks(detail.tasks, detail.edges, nowMs);
  }

  const byKey = new Map(detail.tasks.map((t) => [t.nodeKey, t]));
  const incomingByKey = new Map<string, DagWorkflowEdgeInput[]>();
  for (const t of detail.tasks) incomingByKey.set(t.nodeKey, []);
  for (const e of detail.edges) {
    incomingByKey.get(e.toNodeKey)?.push(e);
  }

  return detail.tasks.filter((task) => {
    if (task.status !== 'queued' && task.status !== 'retrying') return false;
    if (task.status === 'retrying' && task.nextRetryAt) {
      const retryTs = Date.parse(task.nextRetryAt);
      if (Number.isFinite(retryTs) && retryTs > nowMs) return false;
    }
    const incoming = incomingByKey.get(task.nodeKey) ?? [];
    if (incoming.length === 0) return true;

    const normalEdges = incoming.filter((e) => {
      const m = edgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`];
      return !m || m.edgeType !== 'error';
    });
    const errorEdges = incoming.filter((e) => {
      const m = edgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`];
      return m?.edgeType === 'error';
    });

    if (normalEdges.length === 0 && errorEdges.length > 0) {
      // Error-handler task runs only if at least one upstream error-edge source failed
      return errorEdges.some((e) => byKey.get(e.fromNodeKey)?.status === 'failed');
    }

    // For normal / conditional / approval edges: all non-skipped predecessors must be completed,
    // and at least one predecessor must be completed (join nodes survive pruned sibling branches).
    let completedCount = 0;
    for (const e of normalEdges) {
      const parent = byKey.get(e.fromNodeKey);
      if (!parent) return false;
      if (parent.status === 'completed') {
        completedCount += 1;
      } else if (
        parent.status === 'cancelled' &&
        (parent.blockingReason?.startsWith('Skipped:') ?? false)
      ) {
        // Pruned sibling branch — allow join if another branch completed
        continue;
      } else {
        return false;
      }
    }
    return completedCount > 0;
  });
}

function finalizeWorkflowStateIfFinished(tenantId: string, workflowId: string): void {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail) return;
  const { workflow, tasks } = detail;
  if (workflow.status === 'cancelled') {
    notifyWorkflowWaiters(workflowId);
    return;
  }

  const inFlight = tasks.filter(
    (t) => t.status === 'running' || t.status === 'retrying',
  );
  const readyNow = getReadyTasksWithStudioEdgeSemantics(detail);
  const waitingApproval = tasks.filter((t) => t.status === 'waiting_for_approval');
  const failed = tasks.filter((t) => t.status === 'failed');

  if (inFlight.length > 0 || readyNow.length > 0) {
    return;
  }

  if (waitingApproval.length > 0) {
    const gateNames = waitingApproval
      .map((t) =>
        t.approvalGateType ? getApprovalGateLabel(t.approvalGateType) : t.title,
      )
      .join(', ');
    updateWorkflowStatusInDb({
      tenantId,
      workflowId,
      status: 'waiting_for_approval',
      currentStage: `Awaiting approval: ${gateNames}`,
      blockingReason: `Waiting on human review for ${gateNames}`,
    });
    notifyWorkflowWaiters(workflowId);
    return;
  }

  const now = new Date().toISOString();
  if (failed.length > 0) {
    const errMsg = failed
      .map((f) => `${f.title}: ${f.errorSummary ?? 'failed'}`)
      .slice(0, 2)
      .join(' | ');
    updateWorkflowStatusInDb({
      tenantId,
      workflowId,
      status: 'failed',
      currentStage: 'Failed',
      blockingReason: errMsg,
      completedAt: now,
    });
    emitRealAgentEvent({
      eventType: 'workflow.failed',
      tenantId,
      projectId: workflow.projectId,
      workflowId,
      taskId: workflowId,
      agentId: 'orchestrator',
      status: 'failed',
      taskTitle: workflow.name,
      summary: `Workflow failed (${failed.length} failed node(s))`,
      errorSummary: errMsg,
      evidenceUrl: '/agent-factory',
    });
    notifyWorkflowWaiters(workflowId);
    try {
      reconcileAndPersistWorkflowUsage(tenantId, workflow.projectId, workflowId);
    } catch {
      // Non-fatal
    }
    fireLifecycleTriggerHook({
      tenantId,
      projectId: workflow.projectId,
      triggerType: 'workflow_failed',
      sourceRef: workflowId,
      idempotencyKey: `workflow_failed:${workflowId}:${now.slice(0, 19)}`,
      payloadSummary: `Workflow "${workflow.name}" failed (${failed.length} failed node(s)): ${errMsg}`,
      payload: {
        workflowId,
        workflowName: workflow.name,
        templateId: workflow.templateId,
        failedCount: failed.length,
        errorSummary: errMsg,
      },
    });
    return;
  }

  updateWorkflowStatusInDb({
    tenantId,
    workflowId,
    status: 'completed',
    currentStage: 'Completed',
    blockingReason: null,
    completedAt: now,
  });

  emitRealAgentEvent({
    eventType: 'workflow.completed',
    tenantId,
    projectId: workflow.projectId,
    workflowId,
    taskId: workflowId,
    agentId: 'orchestrator',
    status: 'completed',
    taskTitle: workflow.name,
    summary: `All ${tasks.length} workflow stages completed successfully`,
    progressPct: 100,
    evidenceUrl: '/agent-factory',
  });

  recordActivityEvent({
    tenantId,
    projectId: workflow.projectId,
    type: 'content_review',
    actor: 'AI Orchestrator',
    action: `Completed multi-agent workflow "${workflow.name}" (${tasks.length} tasks)`,
    status: 'Succeeded',
    evidenceUrl: '/agent-factory',
  });

  try {
    reconcileAndPersistWorkflowUsage(tenantId, workflow.projectId, workflowId);
  } catch {
    // Non-fatal
  }

  fireLifecycleTriggerHook({
    tenantId,
    projectId: workflow.projectId,
    triggerType: 'workflow_completed',
    sourceRef: workflowId,
    idempotencyKey: `workflow_completed:${workflowId}:${now.slice(0, 19)}`,
    payloadSummary: `Workflow "${workflow.name}" completed (${tasks.length} tasks)`,
    payload: {
      workflowId,
      workflowName: workflow.name,
      templateId: workflow.templateId,
      taskCount: tasks.length,
    },
  });

  workflowAbortControllers.delete(workflowId);
  clearWorkflowTimers(workflowId);
  notifyWorkflowWaiters(workflowId);
}

export function scheduleWorkflowExecution(tenantId: string, workflowId: string): void {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail) return;
  if (
    detail.workflow.status === 'cancelled' ||
    detail.workflow.status === 'completed' ||
    detail.workflow.status === 'paused'
  ) {
    notifyWorkflowWaiters(workflowId);
    return;
  }

  // Stage 6: Enforce workflow-level timeout from project autonomy policy
  if (detail.workflow.startedAt) {
    try {
      const policy = getOrCreateAutonomyPolicyInDb(tenantId, detail.workflow.projectId);
      const elapsedMs = Date.now() - Date.parse(detail.workflow.startedAt);
      if (
        policy.enabled &&
        policy.maxWorkflowDurationMs > 0 &&
        Number.isFinite(elapsedMs) &&
        elapsedMs > policy.maxWorkflowDurationMs
      ) {
        const now = new Date().toISOString();
        const reason = `WORKFLOW_TIMEOUT: Exceeded max workflow duration (${Math.round(policy.maxWorkflowDurationMs / 1000)}s).`;
        const abortCtrl = workflowAbortControllers.get(workflowId);
        if (abortCtrl && !abortCtrl.signal.aborted) abortCtrl.abort();
        clearWorkflowTimers(workflowId);
        for (const t of detail.tasks) {
          if (t.status === 'queued' || t.status === 'running' || t.status === 'retrying') {
            updateTaskRecordInDb({
              tenantId,
              taskId: t.id,
              status: 'failed',
              blockingReason: reason,
              errorSummary: reason,
              completedAt: now,
            });
          }
        }
        updateWorkflowStatusInDb({
          tenantId,
          workflowId,
          status: 'failed',
          currentStage: 'Timed Out',
          blockingReason: reason,
          completedAt: now,
        });
        insertRecoveryRecordInDb({
          tenantId,
          projectId: detail.workflow.projectId,
          workflowId,
          actionType: 'workflow_timeout_enforced',
          previousStatus: detail.workflow.status,
          newStatus: 'failed',
          actor: 'Autonomous Operations Runtime',
          reason,
        });
        notifyWorkflowWaiters(workflowId);
        return;
      }
    } catch {
      // Non-fatal
    }
  }

  const readyTasks = getReadyTasksWithStudioEdgeSemantics(detail);
  const nowMs = Date.now();

  // Schedule any retrying tasks whose nextRetryAt is still in the future
  for (const t of detail.tasks) {
    if (t.status === 'retrying' && t.nextRetryAt) {
      const waitMs = Math.max(0, Date.parse(t.nextRetryAt) - nowMs);
      if (waitMs > 0) {
        let timerSet = workflowRetryTimers.get(workflowId);
        if (!timerSet) {
          timerSet = new Set();
          workflowRetryTimers.set(workflowId, timerSet);
        }
        const timer = setTimeout(() => {
          timerSet?.delete(timer);
          scheduleWorkflowExecution(tenantId, workflowId);
        }, Math.min(waitMs + 15, 35_000));
        timerSet.add(timer);
      }
    }
  }

  if (readyTasks.length === 0) {
    finalizeWorkflowStateIfFinished(tenantId, workflowId);
    return;
  }

  const slotsAvailable = Math.max(0, MAX_CONCURRENT_WORKERS - activeWorkerTaskIds.size);
  if (slotsAvailable === 0) {
    const timer = setTimeout(() => scheduleWorkflowExecution(tenantId, workflowId), 200);
    let timerSet = workflowRetryTimers.get(workflowId);
    if (!timerSet) {
      timerSet = new Set();
      workflowRetryTimers.set(workflowId, timerSet);
    }
    timerSet.add(timer);
    return;
  }

  const toLaunch = readyTasks.slice(0, slotsAvailable);
  updateWorkflowStatusInDb({
    tenantId,
    workflowId,
    status: 'running',
    currentStage: toLaunch.map((t) => t.title).slice(0, 2).join(' & '),
    blockingReason: null,
  });

  for (const task of toLaunch) {
    if (activeWorkerTaskIds.has(task.id)) continue;
    activeWorkerTaskIds.add(task.id);
    void runSingleDagTask(tenantId, workflowId, task.id).finally(() => {
      activeWorkerTaskIds.delete(task.id);
      scheduleWorkflowExecution(tenantId, workflowId);
    });
  }
}

async function runSingleDagTask(
  tenantId: string,
  workflowId: string,
  taskId: string,
): Promise<void> {
  const detail = getWorkflowDetailById(tenantId, workflowId);
  if (!detail || detail.workflow.status === 'cancelled') return;

  const task = detail.tasks.find((t) => t.id === taskId);
  const nodeDef = detail.nodes.find((n) => n.nodeKey === task?.nodeKey);
  if (!task || !nodeDef) return;
  if (task.status === 'cancelled' || task.status === 'completed') return;

  const abortController = getAbortControllerForWorkflow(workflowId);
  if (abortController.signal.aborted) return;

  const configs = listAgentConfigsInDb(tenantId, detail.workflow.projectId);
  const agentConfig = configs.find((c) => c.agentId === task.agentId);

  // Check if station is explicitly disabled in project agent configuration
  if (agentConfig && !agentConfig.enabled) {
    if (nodeDef.condition?.skipIfUnavailable) {
      const now = new Date().toISOString();
      updateTaskRecordInDb({
        tenantId,
        taskId: task.id,
        status: 'completed',
        blockingReason: 'Skipped gracefully (agent disabled in project settings)',
        completedAt: now,
        durationMs: 0,
      });
      emitRealAgentEvent({
        eventType: 'agent.completed',
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        agentId: task.agentId,
        status: 'completed',
        taskTitle: task.title,
        summary: 'Skipped cleanly (agent disabled & skipIfUnavailable enabled)',
        durationMs: 0,
        evidenceUrl: '/agent-factory',
      });
      return;
    }

    const msg = `Station "${task.agentId}" is disabled in Agent Factory Configuration.`;
    updateTaskRecordInDb({
      tenantId,
      taskId: task.id,
      status: 'failed',
      errorSummary: msg,
      completedAt: new Date().toISOString(),
    });
    emitRealAgentEvent({
      eventType: 'agent.failed',
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      taskId: task.id,
      agentId: task.agentId,
      status: 'failed',
      taskTitle: task.title,
      summary: msg,
      errorSummary: msg,
      evidenceUrl: '/agent-factory',
    });
    return;
  }

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const attemptNumber = task.attemptCount + 1;
  const executionId = `aexec-${crypto.randomUUID().slice(0, 12)}`;
  const modelToUse =
    task.agentId === 'content_generation_agent'
      ? resolveSafeGeminiModel(agentConfig?.preferredModel)
      : null;
  const providerName =
    task.agentId === 'content_generation_agent'
      ? 'google_gemini'
      : 'rovix_backend_service';

  updateTaskRecordInDb({
    tenantId,
    taskId: task.id,
    status: 'running',
    attemptCount: attemptNumber,
    nextRetryAt: null,
    errorSummary: null,
    startedAt: startedAtIso,
  });

  insertAgentExecutionInDb({
    id: executionId,
    tenantId,
    projectId: detail.workflow.projectId,
    workflowId,
    taskId: task.id,
    agentId: task.agentId,
    attemptNumber,
    provider: providerName,
    model: modelToUse,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    durationMs: null,
    status: 'running',
    errorMessage: null,
    startedAt: startedAtIso,
    completedAt: null,
  });

  // Emit real orchestrator -> agent activation communication link
  const corrId = `corr-${crypto.randomUUID().slice(0, 10)}`;
  emitRealAgentEvent({
    eventType: 'agent.communication',
    tenantId,
    projectId: detail.workflow.projectId,
    workflowId,
    taskId: task.id,
    agentId: task.agentId,
    sourceAgentId: 'orchestrator',
    destinationAgentId: task.agentId,
    status: 'communicating',
    taskTitle: task.title,
    summary: `Dispatching ${task.title} (attempt ${attemptNumber}/${task.maxRetries + 1})`,
    correlationId: corrId,
    evidenceUrl: '/agent-factory',
  });

  emitRealAgentEvent({
    eventType: 'agent.started',
    tenantId,
    projectId: detail.workflow.projectId,
    workflowId,
    taskId: task.id,
    agentId: task.agentId,
    status: 'running',
    taskTitle: task.title,
    summary: `Executing ${task.title}`,
    correlationId: corrId,
    provider: providerName,
    model: modelToUse,
    evidenceUrl: '/agent-factory',
  });

  // Collect upstream predecessor outputs + validate incoming handoffs
  const incomingEdges = detail.edges.filter((e) => e.toNodeKey === task.nodeKey);
  const upstreamOutputs: AgentOutputRecord[] = [];
  for (const edge of incomingEdges) {
    const parentTask = detail.tasks.find((t) => t.nodeKey === edge.fromNodeKey);
    if (!parentTask || !parentTask.outputId) continue;
    const outRec = detail.outputs.find((o) => o.id === parentTask.outputId);
    if (outRec) {
      upstreamOutputs.push(outRec);
      const handoffCheck = validateStructuredHandoff({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        executionId,
        sourceAgentId: parentTask.agentId,
        destinationAgentId: task.agentId,
        taskId: task.id,
        inputRef: outRec.id,
        outputRef: `pending:${task.id}`,
        evidenceRefs: outRec.evidenceRefs,
        status: 'validated',
        validationSummary: `Structured output ${outRec.id} verified and handed off to ${task.agentId}`,
        correlationId: corrId,
      });
      if (handoffCheck.valid && handoffCheck.normalized) {
        insertAgentHandoffInDb(handoffCheck.normalized);
        emitRealAgentEvent({
          eventType: 'handoff.recorded',
          tenantId,
          projectId: detail.workflow.projectId,
          workflowId,
          taskId: task.id,
          agentId: task.agentId,
          sourceAgentId: parentTask.agentId,
          destinationAgentId: task.agentId,
          status: 'communicating',
          taskTitle: task.title,
          summary: `Handoff validated: ${parentTask.agentId} -> ${task.agentId} (${outRec.evidenceRefs.length} evidence ref(s))`,
          correlationId: corrId,
          evidenceUrl: '/agent-factory',
        });
      }
    }
  }

  const timeoutMs = Math.max(5_000, nodeDef.timeoutMs ?? agentConfig?.timeoutMs ?? 60_000);
  let timeoutHandle: NodeJS.Timeout | null = null;
  let timedOut = false;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new Error(`TIMEOUT: Task "${task.title}" exceeded ${timeoutMs}ms execution limit.`));
      }, timeoutMs);
    });

    const result = await Promise.race([
      executeSpecialistAdapter({
        tenantId,
        projectId: detail.workflow.projectId,
        workflow: detail.workflow,
        workflowDetail: detail,
        executionId,
        task,
        nodeDef,
        upstreamOutputs,
        preferredModel: modelToUse ?? undefined,
        user: getSystemUserFallback(detail.workflow),
        abortSignal: abortController.signal,
      }),
      timeoutPromise,
    ]);

    if (timeoutHandle) clearTimeout(timeoutHandle);

    // Confirm workflow wasn't cancelled while executing
    const latestWf = getWorkflowDetailById(tenantId, workflowId);
    if (!latestWf || latestWf.workflow.status === 'cancelled' || abortController.signal.aborted) {
      completeAgentExecutionInDb({
        id: executionId,
        tenantId,
        status: 'cancelled',
        durationMs: Date.now() - startedAtMs,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    const durationMs = Math.max(1, Date.now() - startedAtMs);
    const completedIso = new Date().toISOString();
    const outputId = `aout-${crypto.randomUUID().slice(0, 12)}`;

    insertAgentOutputInDb({
      id: outputId,
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      taskId: task.id,
      agentId: task.agentId,
      schemaVersion: '1.0',
      summary: result.summary,
      payload: result.payload,
      evidenceRefs: result.evidenceRefs,
      isAiGenerated: result.isAiGenerated,
      createdAt: completedIso,
    });

    // Record return handoff from specialist -> orchestrator
    const returnHandoff = validateStructuredHandoff({
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      executionId,
      sourceAgentId: task.agentId,
      destinationAgentId: 'orchestrator',
      taskId: task.id,
      inputRef: upstreamOutputs.map((u) => u.id).join(',') || 'project-context',
      outputRef: outputId,
      evidenceRefs: result.evidenceRefs,
      status: 'validated',
      validationSummary: result.summary,
      correlationId: corrId,
    });
    if (returnHandoff.valid && returnHandoff.normalized) {
      insertAgentHandoffInDb(returnHandoff.normalized);
    }

    completeAgentExecutionInDb({
      id: executionId,
      tenantId,
      status: 'completed',
      model: result.model ?? modelToUse,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      totalTokens: result.totalTokens ?? null,
      durationMs,
      completedAt: completedIso,
    });

    // Stage 5: Persist idempotent usage & cost record for this execution attempt
    try {
      const effectiveProvider = result.provider ?? providerName;
      const isInternal =
        effectiveProvider === 'rovix_backend_service' ||
        effectiveProvider === 'rovix_workflow_studio';
      const usageSource: UsageSource =
        result.usageSource ??
        (isInternal
          ? 'internal_service'
          : result.inputTokens !== null && result.inputTokens !== undefined
            ? 'provider_response'
            : 'unavailable');
      const measurementStatus: UsageMeasurementStatus =
        result.measurementStatus ??
        (isInternal
          ? 'unavailable'
          : result.inputTokens !== null &&
              result.inputTokens !== undefined &&
              result.outputTokens !== null &&
              result.outputTokens !== undefined
            ? 'measured'
            : result.totalTokens !== null && result.totalTokens !== undefined
              ? 'partial'
              : 'unavailable');
      recordAgentExecutionUsage({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        executionId,
        taskId: task.id,
        agentId: task.agentId,
        provider: effectiveProvider,
        model: result.model ?? modelToUse,
        requestTimestamp: startedAtIso,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        cachedInputTokens: result.cachedInputTokens ?? null,
        totalTokens: result.totalTokens ?? null,
        providerRequestId: result.providerRequestId ?? null,
        usageSource,
        measurementStatus,
        latencyMs: result.latencyMs ?? durationMs,
        status: 'succeeded',
        errorType: null,
        isQuotaError: false,
        isRetry: attemptNumber > 1,
        attemptNumber,
        rawUsageMetadata: result.rawUsageMetadata ?? null,
        idempotencyKey: `exec:${executionId}:attempt:${attemptNumber}`,
      });
    } catch {
      // Usage ledger write failure must not abort completed agent deliverable
    }

    if (task.approvalRequired) {
      const gateType = task.approvalGateType ?? 'content_brief';
      const approvalId = `aappr-${crypto.randomUUID().slice(0, 10)}`;

      updateTaskRecordInDb({
        tenantId,
        taskId: task.id,
        status: 'waiting_for_approval',
        blockingReason: `Waiting on ${getApprovalGateLabel(gateType)}`,
        errorSummary: null,
        durationMs,
        outputId,
      });

      createApprovalRequestInDb({
        id: approvalId,
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        gateType,
        title: `${task.title} — ${getApprovalGateLabel(gateType)}`,
        summary: result.summary,
        status: 'pending',
        requestedBy: detail.workflow.createdBy,
        approverId: null,
        approverName: null,
        approverRole: null,
        comments: '',
        versionRef: outputId,
        outputId,
        auditHistory: [
          {
            action: 'requested',
            actorId: task.agentId,
            actorName: task.agentId,
            actorRole: 'AI Agent',
            comments: result.summary,
            timestamp: completedIso,
          },
        ],
        createdAt: completedIso,
        decidedAt: null,
      });

      emitRealAgentEvent({
        eventType: 'task.waiting_approval',
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        agentId: task.agentId,
        status: 'waiting_for_approval',
        taskTitle: task.title,
        summary: `Awaiting ${getApprovalGateLabel(gateType)}: ${result.summary}`,
        provider: result.provider ?? providerName,
        model: result.model ?? modelToUse,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        durationMs,
        evidenceUrl: '/agent-factory',
      });
    } else {
      updateTaskRecordInDb({
        tenantId,
        taskId: task.id,
        status: 'completed',
        blockingReason: null,
        errorSummary: null,
        completedAt: completedIso,
        durationMs,
        outputId,
      });

      emitRealAgentEvent({
        eventType: 'agent.completed',
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        agentId: task.agentId,
        sourceAgentId: task.agentId,
        destinationAgentId: 'orchestrator',
        status: 'completed',
        taskTitle: task.title,
        summary: result.summary,
        progressPct: 100,
        provider: result.provider ?? providerName,
        model: result.model ?? modelToUse,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        durationMs,
        evidenceUrl: '/agent-factory',
      });

      // Stage 3: If this task was dynamically delegated by another agent, return findings response
      completeDelegationForTask({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        task,
        executionId,
        succeeded: true,
        summary: result.summary,
        evidenceReferences: result.evidenceRefs,
        outputId,
      });

      // Stage 4: Skip any error-only downstream targets whose source completed without error
      const studioEdgeMeta = getStudioEdgeMetaMap(detail.workflow);
      const outgoingErrorEdges = detail.edges.filter(
        (e) =>
          e.fromNodeKey === task.nodeKey &&
          studioEdgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`]?.edgeType === 'error',
      );
      if (outgoingErrorEdges.length > 0) {
        const refreshed = getWorkflowDetailById(tenantId, workflowId);
        if (refreshed) {
          for (const errEdge of outgoingErrorEdges) {
            const targetTask = refreshed.tasks.find((t) => t.nodeKey === errEdge.toNodeKey);
            if (!targetTask || targetTask.status !== 'queued') continue;
            const targetIncoming = refreshed.edges.filter((e) => e.toNodeKey === targetTask.nodeKey);
            const allErrorOnly = targetIncoming.every(
              (e) => studioEdgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`]?.edgeType === 'error',
            );
            const allErrorSourcesCompleted = targetIncoming.every((e) => {
              const srcTask = refreshed.tasks.find((t) => t.nodeKey === e.fromNodeKey);
              return srcTask?.status === 'completed';
            });
            if (allErrorOnly && allErrorSourcesCompleted) {
              updateTaskRecordInDb({
                tenantId,
                taskId: targetTask.id,
                status: 'cancelled',
                blockingReason: `Skipped: error path from "${task.title}" was not triggered.`,
                completedAt: completedIso,
                durationMs: 0,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const errMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Math.max(1, Date.now() - startedAtMs);
    const completedIso = new Date().toISOString();

    if (abortController.signal.aborted || errMsg.startsWith('CANCELLED:')) {
      completeAgentExecutionInDb({
        id: executionId,
        tenantId,
        status: 'cancelled',
        durationMs,
        errorMessage: errMsg,
        completedAt: completedIso,
      });
      try {
        const providerStr: string = providerName;
        const isInternal =
          providerStr === 'rovix_backend_service' ||
          providerStr === 'rovix_workflow_studio';
        recordAgentExecutionUsage({
          tenantId,
          projectId: detail.workflow.projectId,
          workflowId,
          executionId,
          taskId: task.id,
          agentId: task.agentId,
          provider: providerName,
          model: modelToUse,
          requestTimestamp: startedAtIso,
          usageSource: isInternal ? 'internal_service' : 'unavailable',
          measurementStatus: 'unavailable',
          latencyMs: durationMs,
          status: 'cancelled',
          errorType: 'CANCELLED',
          isQuotaError: false,
          isRetry: attemptNumber > 1,
          attemptNumber,
          idempotencyKey: `exec:${executionId}:attempt:${attemptNumber}`,
        });
      } catch {
        // Non-fatal
      }
      return;
    }

    completeAgentExecutionInDb({
      id: executionId,
      tenantId,
      status: 'failed',
      durationMs,
      errorMessage: errMsg,
      completedAt: completedIso,
    });

    try {
      const providerStr: string = providerName;
      const isInternal =
        providerStr === 'rovix_backend_service' ||
        providerStr === 'rovix_workflow_studio';
      const errCode = errMsg.includes(':') ? errMsg.split(':')[0].trim() : 'EXECUTION_ERROR';
      recordAgentExecutionUsage({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        executionId,
        taskId: task.id,
        agentId: task.agentId,
        provider: providerName,
        model: modelToUse,
        requestTimestamp: startedAtIso,
        usageSource: isInternal ? 'internal_service' : 'unavailable',
        measurementStatus: 'unavailable',
        latencyMs: durationMs,
        status: timedOut ? 'timeout' : 'failed',
        errorType: errCode.slice(0, 64),
        isQuotaError: isProviderQuotaError(errMsg),
        isRetry: attemptNumber > 1,
        attemptNumber,
        idempotencyKey: `exec:${executionId}:attempt:${attemptNumber}`,
      });
    } catch {
      // Non-fatal
    }

    const errorClass = classifyExecutionError(errMsg);
    const isNonRetryable = errorClass.classification === 'non_retryable';

    // Handle optional skip condition on unavailable dependency
    if (
      nodeDef.condition?.skipIfUnavailable &&
      errMsg.startsWith('PROVIDER_UNAVAILABLE:')
    ) {
      updateTaskRecordInDb({
        tenantId,
        taskId: task.id,
        status: 'completed',
        blockingReason: `Skipped gracefully (${errMsg})`,
        completedAt: completedIso,
        durationMs,
      });
      emitRealAgentEvent({
        eventType: 'agent.completed',
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        agentId: task.agentId,
        status: 'completed',
        taskTitle: task.title,
        summary: `Skipped cleanly: ${errMsg}`,
        durationMs,
        evidenceUrl: '/agent-factory',
      });
      return;
    }

    // Check autonomy policy retry permission & Stage 5 budget check before auto-retrying
    let retriesPermittedByPolicy = true;
    try {
      const policy = getOrCreateAutonomyPolicyInDb(tenantId, detail.workflow.projectId);
      if (policy.enabled && !policy.allowAutonomousRetries) {
        retriesPermittedByPolicy = false;
      }
      if (retriesPermittedByPolicy) {
        const retryBudget = enforceBudgetsBeforeWorkflowLaunch({
          tenantId,
          projectId: detail.workflow.projectId,
          targetAgentIds: [task.agentId],
          workflowId,
        });
        if (!retryBudget.allowed) {
          retriesPermittedByPolicy = false;
        }
      }
    } catch {
      // Non-fatal
    }

    const retriesAllowed = isNonRetryable || !retriesPermittedByPolicy ? 0 : task.maxRetries;
    if (!timedOut && attemptNumber <= retriesAllowed) {
      const backoffMs =
        activeTestHooks?.retryDelayOverrideMs ??
        computeBackoffWithJitterMs(attemptNumber, {
          baseDelayMs: computeExponentialBackoffMs(1),
        });
      const nextRetryIso = new Date(Date.now() + backoffMs).toISOString();

      updateTaskRecordInDb({
        tenantId,
        taskId: task.id,
        status: 'retrying',
        nextRetryAt: nextRetryIso,
        blockingReason: `Retry scheduled in ${backoffMs}ms (${errorClass.errorCode})`,
        errorSummary: errMsg,
      });

      try {
        insertRecoveryRecordInDb({
          tenantId,
          projectId: detail.workflow.projectId,
          workflowId,
          taskId: task.id,
          actionType: 'auto_retry_scheduled',
          previousStatus: 'running',
          newStatus: 'retrying',
          actor: 'Self-Healing Runtime',
          reason: `Attempt ${attemptNumber}/${retriesAllowed + 1} failed (${errorClass.classification}:${errorClass.errorCode}); backoff ${backoffMs}ms`,
        });
      } catch {
        // Non-fatal
      }

      emitRealAgentEvent({
        eventType: 'agent.retrying',
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        agentId: task.agentId,
        status: 'retrying',
        taskTitle: task.title,
        summary: `Attempt ${attemptNumber} failed; retrying in ${backoffMs}ms`,
        errorSummary: errMsg,
        durationMs,
        evidenceUrl: '/agent-factory',
      });
      return;
    }

    // Retries exhausted, timed out, policy-disallowed, or non-retryable error -> Dead-letter queue
    updateTaskRecordInDb({
      tenantId,
      taskId: task.id,
      status: 'failed',
      blockingReason: errMsg,
      errorSummary: errMsg,
      completedAt: completedIso,
      durationMs,
    });

    try {
      upsertDeadLetterTaskInDb({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        workflowName: detail.workflow.name,
        taskId: task.id,
        nodeKey: task.nodeKey,
        agentId: task.agentId,
        taskTitle: task.title,
        errorClassification: errorClass.classification,
        errorCode: timedOut ? 'TASK_TIMEOUT' : errorClass.errorCode,
        errorMessage: errMsg,
        attemptCount: attemptNumber,
        maxRetries: task.maxRetries,
      });
      insertRecoveryRecordInDb({
        tenantId,
        projectId: detail.workflow.projectId,
        workflowId,
        taskId: task.id,
        actionType: 'dead_letter_recorded',
        previousStatus: 'running',
        newStatus: 'failed',
        actor: 'Self-Healing Runtime',
        reason: `Moved "${task.title}" to dead-letter queue (${errorClass.classification}: ${timedOut ? 'TASK_TIMEOUT' : errorClass.errorCode})`,
      });
    } catch {
      // Non-fatal
    }

    // Block downstream dependent nodes cleanly (except explicit Stage 4 error-handler paths)
    const studioEdgeMeta = getStudioEdgeMetaMap(detail.workflow);
    const directErrorTargets = new Set(
      detail.edges
        .filter(
          (e) =>
            e.fromNodeKey === task.nodeKey &&
            studioEdgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`]?.edgeType === 'error',
        )
        .map((e) => e.toNodeKey),
    );
    const errorSubgraph = new Set<string>(directErrorTargets);
    for (const errTarget of directErrorTargets) {
      for (const ds of getDownstreamNodeKeys(errTarget, detail.edges)) {
        errorSubgraph.add(ds);
      }
    }
    const downstreamKeys = getDownstreamNodeKeys(task.nodeKey, detail.edges);
    for (const dt of detail.tasks) {
      if (
        downstreamKeys.includes(dt.nodeKey) &&
        !errorSubgraph.has(dt.nodeKey) &&
        dt.status === 'queued'
      ) {
        updateTaskRecordInDb({
          tenantId,
          taskId: dt.id,
          status: 'blocked',
          blockingReason: `Blocked because prerequisite "${task.title}" failed.`,
          completedAt: completedIso,
        });
      }
    }

    emitRealAgentEvent({
      eventType: 'task.dead_lettered',
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      taskId: task.id,
      agentId: task.agentId,
      status: 'failed',
      taskTitle: task.title,
      summary: `${task.title} moved to dead-letter queue (${errorClass.classification})`,
      errorSummary: errMsg,
      durationMs,
      evidenceUrl: '/agent-factory/operations',
    });

    emitRealAgentEvent({
      eventType: 'agent.failed',
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      taskId: task.id,
      agentId: task.agentId,
      status: 'failed',
      taskTitle: task.title,
      summary: `${task.title} failed`,
      errorSummary: errMsg,
      durationMs,
      evidenceUrl: '/agent-factory',
    });

    // Stage 3: Notify originating agent if this failed task was dynamically delegated
    completeDelegationForTask({
      tenantId,
      projectId: detail.workflow.projectId,
      workflowId,
      task,
      executionId,
      succeeded: false,
      summary: errMsg,
      evidenceReferences: [],
      outputId: null,
    });
  }
}

interface AdapterOutputResult {
  summary: string;
  payload: Record<string, unknown>;
  evidenceRefs: string[];
  isAiGenerated: boolean;
  provider?: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
  providerRequestId?: string | null;
  latencyMs?: number | null;
  usageSource?: UsageSource;
  measurementStatus?: UsageMeasurementStatus;
  rawUsageMetadata?: Record<string, unknown> | null;
}

async function executeSpecialistAdapter(params: {
  tenantId: string;
  projectId: string;
  workflow: AgentWorkflowDetail['workflow'];
  workflowDetail: AgentWorkflowDetail;
  executionId: string;
  task: WorkflowTaskRecord;
  nodeDef: DagWorkflowNodeInput;
  upstreamOutputs: AgentOutputRecord[];
  preferredModel?: string;
  user: User;
  abortSignal: AbortSignal;
}): Promise<AdapterOutputResult> {
  const {
    tenantId,
    projectId,
    workflow,
    workflowDetail,
    executionId,
    task,
    nodeDef,
    upstreamOutputs,
    user,
    abortSignal,
  } = params;

  const project = getProjectById(tenantId, projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const db = getAuditDb();
  const profile = getKeywordBusinessProfile(tenantId, projectId);
  const verification = getProjectVerification(tenantId, projectId, project.website);
  const completedCrawls = listCrawlRuns(tenantId, projectId).filter(
    (c) => c.status === 'Succeeded' || c.status === 'Partial',
  );
  const latestCrawl = completedCrawls[0] ?? null;

  const getKnownProjectUrls = (): string[] => {
    if (!latestCrawl) return [`https://${project.website}/`];
    const rows = db
      .prepare(
        `SELECT final_url FROM crawl_urls
         WHERE tenant_id = ? AND crawl_id = ? AND status_code >= 200 AND status_code < 400
         ORDER BY depth ASC LIMIT 20`,
      )
      .all(tenantId, latestCrawl.id) as { final_url: string }[];
    const urls = rows.map((r) => String(r.final_url)).filter(Boolean);
    return urls.length > 0 ? urls : [`https://${project.website}/`];
  };

  const sharedContext = createSharedWorkflowContext({
    tenantId,
    projectId,
    workflowId: workflow.id,
  });

  // Stage 4: Execute Visual Workflow Studio control nodes (trigger, condition, data, governance)
  const studioNodeMeta = nodeDef.config?.studioNode as
    | { category?: StudioNodeCategory; subtype?: StudioNodeSubtype; label?: string }
    | undefined;
  if (
    studioNodeMeta?.category &&
    studioNodeMeta.category !== 'agent' &&
    studioNodeMeta.subtype !== 'qa_verification'
  ) {
    return executeStudioControlNode({
      tenantId,
      projectId,
      workflow,
      workflowDetail,
      task,
      nodeDef,
      upstreamOutputs,
      sharedContext,
      category: studioNodeMeta.category,
      subtype: studioNodeMeta.subtype as StudioNodeSubtype,
    });
  }

  switch (task.agentId) {
    case 'research_agent': {
      const kwWs = getKeywordWorkspace(tenantId, projectId);
      const geoWs = getGeoWorkspace(tenantId, projectId);
      const compWs = getCompetitorWorkspace(tenantId, projectId);
      const knownUrls = getKnownProjectUrls();
      const targetMarketCodes =
        geoWs.targetMarkets.map((m) => m.countryCode) || project.targetMarkets;

      const evidenceRefs = knownUrls.slice(0, 8);
      const evidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Domain ${project.website} verification status: ${verification.verified ? 'Verified' : 'Unverified'}.`,
            source: 'project_verification_registry',
            evidenceRef: `https://${project.website}/`,
          },
          ...(profile.approvedServices.length > 0
            ? [
                {
                  statement: `Approved business services: ${profile.approvedServices.slice(0, 6).join(', ')}.`,
                  source: 'approved_business_profile',
                  evidenceRef: `https://${project.website}/`,
                },
              ]
            : []),
        ],
        measuredMetrics: [
          {
            statement: `${kwWs.keywords.length} tracked keyword(s), ${compWs.competitors.length} registered competitor(s), ${knownUrls.length} crawled HTTP 2xx/3xx URL(s).`,
            source: 'project_sqlite_store',
            evidenceRef: evidenceRefs[0],
          },
        ],
        unavailableInformation: [
          ...(latestCrawl ? [] : ['No completed Technical SEO crawl exists yet for URL inventory.']),
          ...(profile.approvedServices.length > 0
            ? []
            : ['Approved business services have not been configured in Keyword Intelligence.']),
        ],
        evidenceReferences: evidenceRefs,
      });

      // Stage 3: Share verified business & URL evidence with downstream specialist agents
      const downstreamPeers = workflowDetail.edges
        .filter((e) => e.fromNodeKey === task.nodeKey)
        .map((e) => workflowDetail.tasks.find((t) => t.nodeKey === e.toNodeKey)?.agentId)
        .filter((a): a is AgentStationId => Boolean(a && a !== 'research_agent'));
      for (const peer of Array.from(new Set(downstreamPeers)).slice(0, 3)) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'research_agent',
            destinationAgentId: peer,
            messageType: 'evidence_share',
            payload: {
              summary: `Shared verified baseline: ${knownUrls.length} crawled URL(s), ${profile.approvedServices.length} approved service(s).`,
              approvedMarkets:
                targetMarketCodes.length > 0 ? targetMarketCodes : project.targetMarkets,
              knownUrlsCount: knownUrls.length,
            },
            evidenceReferences: evidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal if peer station is disabled
        }
      }

      return {
        summary: `Compiled project context: ${kwWs.keywords.length} keyword(s), ${compWs.competitors.length} competitor(s), ${knownUrls.length} crawled URL(s).`,
        payload: {
          projectName: project.name,
          projectWebsite: project.website,
          domainVerified: verification.verified,
          businessContextApproved: profile.approvedServices.length > 0,
          approvedServices: profile.approvedServices,
          approvedMarkets:
            targetMarketCodes.length > 0 ? targetMarketCodes : project.targetMarkets,
          existingKeywordsCount: kwWs.keywords.length,
          competitorsCount: compWs.competitors.length,
          contentGapsCount: compWs.contentGaps.length,
          knownProjectUrls: knownUrls,
          availableSources: [
            latestCrawl ? `Crawl ${latestCrawl.id}` : null,
            kwWs.keywords.length > 0 ? 'Keyword Workspace' : null,
            geoWs.targetMarkets.length > 0 ? 'Approved Geo Markets' : null,
            compWs.competitors.length > 0 ? 'Competitor Registry' : null,
          ].filter(Boolean),
          evidenceTrust,
        },
        evidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'keyword_intelligence_agent': {
      const configSeedTerms = Array.isArray(workflow.config.seedTerms)
        ? workflow.config.seedTerms.map(String).filter(Boolean)
        : [];
      let kwWs = getKeywordWorkspace(tenantId, projectId);

      if (
        (kwWs.keywords.length === 0 || Boolean(workflow.config.runLiveKeywordDiscovery)) &&
        (configSeedTerms.length > 0 || profile.approvedServices.length > 0)
      ) {
        const seeds =
          configSeedTerms.length > 0
            ? configSeedTerms
            : profile.approvedServices.slice(0, 4);
        await runKeywordDiscoveryWorkflow({
          tenantId,
          projectId,
          user,
          seedTerms: seeds,
          includeAutocomplete: true,
          includeTrends: false,
          includeAiExpansion: false,
        });
        kwWs = getKeywordWorkspace(tenantId, projectId);
      }

      const approvedOrPending = kwWs.keywords.filter(
        (k) => k.workflowState !== 'rejected',
      );
      const byIntent: Record<string, number> = {};
      for (const kw of approvedOrPending) {
        byIntent[kw.intent] = (byIntent[kw.intent] ?? 0) + 1;
      }

      const topKeywords = approvedOrPending.slice(0, 12).map((k) => ({
        keyword: k.keyword,
        intent: k.intent,
        opportunityScore: k.opportunityScore,
        workflowState: k.workflowState,
        targetUrl: k.mapping?.targetUrl ?? null,
        clicks: k.gscClicks,
        impressions: k.gscImpressions,
        searchVolume: k.marketSearchVolume,
      }));

      const kwEvidenceRefs = approvedOrPending
        .map((k) => k.mapping?.targetUrl ?? k.gscObservedUrl ?? '')
        .filter(Boolean)
        .slice(0, 10);
      const effectiveKwRefs =
        kwEvidenceRefs.length > 0 ? kwEvidenceRefs : [`https://${project.website}/`];

      const kwEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Loaded ${approvedOrPending.length} non-rejected keyword record(s) from Keyword Intelligence.`,
            source: 'keyword_intelligence_workspace',
            evidenceRef: effectiveKwRefs[0],
          },
        ],
        measuredMetrics: approvedOrPending
          .filter((k) => k.gscClicks !== null || k.gscImpressions !== null)
          .slice(0, 4)
          .map((k) => ({
            statement: `"${k.keyword}": ${k.gscClicks ?? 0} GSC clicks, ${k.gscImpressions ?? 0} impressions.`,
            source: 'google_search_console',
            evidenceRef: k.gscObservedUrl ?? effectiveKwRefs[0],
          })),
        inferredFindings: topKeywords.slice(0, 4).map((k) => ({
          statement: `Classified "${k.keyword}" as ${k.intent} intent (opportunity score ${k.opportunityScore}).`,
          source: 'keyword_intent_classifier',
          evidenceRef: k.targetUrl ?? effectiveKwRefs[0],
        })),
        unavailableInformation: [
          ...(approvedOrPending.some((k) => k.marketSearchVolume !== null)
            ? []
            : ['Third-party monthly search volume data is unavailable (Google Ads API not connected).']),
        ],
        evidenceReferences: effectiveKwRefs,
      });

      // Stage 3: Respond to Competitor Agent if competitor discovery requested keyword validation
      const compUpstream = upstreamOutputs.find(
        (o) => o.agentId === 'competitor_intelligence_agent',
      );
      if (compUpstream) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'keyword_intelligence_agent',
            destinationAgentId: 'competitor_intelligence_agent',
            messageType: 'findings_response',
            payload: {
              summary: `Validated ${approvedOrPending.length} project keyword(s) across ${Object.keys(byIntent).length} intent tier(s) against competitor gap findings.`,
              totalKeywords: approvedOrPending.length,
              intentBreakdown: byIntent,
            },
            evidenceReferences: effectiveKwRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      // Share keyword evidence with Content Strategy if downstream
      if (workflowDetail.tasks.some((t) => t.agentId === 'content_strategy_agent')) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'keyword_intelligence_agent',
            destinationAgentId: 'content_strategy_agent',
            messageType: 'evidence_share',
            payload: {
              summary: `Shared ${topKeywords.length} prioritized keyword(s) and intent distribution.`,
              topKeyword: topKeywords[0]?.keyword ?? null,
              intentBreakdown: byIntent,
            },
            evidenceReferences: effectiveKwRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      return {
        summary: `Analyzed ${approvedOrPending.length} keyword(s) across ${kwWs.clusters.length} cluster(s) and ${Object.keys(byIntent).length} intent tier(s).`,
        payload: {
          totalKeywords: approvedOrPending.length,
          keywordCount: approvedOrPending.length,
          clustersCount: kwWs.clusters.length,
          intentBreakdown: byIntent,
          topKeywords,
          evidenceTrust: kwEvidenceTrust,
        },
        evidenceRefs: effectiveKwRefs,
        isAiGenerated: false,
      };
    }

    case 'competitor_intelligence_agent': {
      let compWs = getCompetitorWorkspace(tenantId, projectId);
      const approvedComps = listCompetitors(tenantId, projectId).filter(
        (c) => c.approvalStatus === 'approved',
      );

      if (
        approvedComps.length > 0 &&
        (Boolean(workflow.config.runLiveCompetitorScan) ||
          compWs.competitors.every((c) => c.analyzedPagesCount === 0))
      ) {
        const firstComp = approvedComps[0];
        try {
          await runCompetitorAnalysisWorkflow({
            tenantId,
            competitorId: firstComp.id,
            user,
            discoverInternalPages: true,
          });
          compWs = getCompetitorWorkspace(tenantId, projectId);
        } catch (compErr) {
          if (compWs.contentGaps.length === 0) {
            throw compErr;
          }
        }
      }

      const topGaps = compWs.contentGaps.slice(0, 10).map((g) => ({
        id: g.id,
        targetKeyword: g.targetKeyword,
        opportunityScore: g.opportunityScore,
        workflowState: g.workflowState,
        gapType: g.gapType,
        competitorDomain: g.competitorDomain,
        rationale: g.explanation || g.recommendedAction,
      }));

      const compEvidenceRefs =
        compWs.competitors.length > 0
          ? compWs.competitors.map((c) => `https://${c.domain}`).slice(0, 8)
          : [`https://${project.website}/`];

      const compEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: compWs.competitors.slice(0, 5).map((c) => ({
          statement: `Tracked competitor ${c.domain} (${c.approvalStatus}, ${c.analyzedPagesCount} analyzed page(s)).`,
          source: 'competitor_registry',
          evidenceRef: `https://${c.domain}`,
        })),
        measuredMetrics: [
          {
            statement: `${compWs.overlaps.length} keyword overlap(s) and ${compWs.contentGaps.length} identified content gap(s).`,
            source: 'competitor_overlap_engine',
            evidenceRef: compEvidenceRefs[0],
          },
        ],
        inferredFindings: topGaps.slice(0, 4).map((g) => ({
          statement: `Gap "${g.targetKeyword}" vs ${g.competitorDomain} (opportunity score ${g.opportunityScore}).`,
          source: 'content_gap_scoring',
          evidenceRef: `https://${g.competitorDomain}`,
        })),
        unavailableInformation: [
          ...(compWs.competitors.length > 0
            ? []
            : ['No approved competitors registered yet for comparative page crawling.']),
        ],
        evidenceReferences: compEvidenceRefs,
      });

      // Stage 3: Write versioned competitor evidence to Shared Workflow Context
      try {
        writeWorkflowContextItem({
          tenantId,
          projectId,
          workflowId: workflow.id,
          contextScope: 'competitor_evidence',
          contextKey: `competitor_findings_${task.nodeKey}`,
          source: 'competitor_intelligence_agent',
          sourceAgentId: 'competitor_intelligence_agent',
          approvalStatus: 'verified_evidence',
          payload: {
            competitorsCount: compWs.competitors.length,
            overlapsCount: compWs.overlaps.length,
            contentGapsCount: compWs.contentGaps.length,
            topGapKeywords: topGaps.slice(0, 5).map((g) => g.targetKeyword),
          },
          evidenceReferences: compEvidenceRefs,
        });
      } catch {
        // Non-fatal
      }

      // Stage 3: Collaborate with Keyword & Geographic Intelligence via structured messages
      // and governed intelligent delegation when enabled on the node.
      const hasKeywordTask = workflowDetail.tasks.some(
        (t) => t.agentId === 'keyword_intelligence_agent',
      );
      const hasGeoTask = workflowDetail.tasks.some(
        (t) => t.agentId === 'geographic_intelligence_agent',
      );
      const strategyNodeKey = workflowDetail.tasks.find(
        (t) => t.agentId === 'content_strategy_agent' && t.status === 'queued',
      )?.nodeKey;

      const allowDelegation = Boolean(nodeDef.config?.enableIntelligentDelegation);
      const delegatedTaskIds: string[] = [];

      if (hasKeywordTask) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'competitor_intelligence_agent',
            destinationAgentId: 'keyword_intelligence_agent',
            messageType: 'research_request',
            payload: {
              summary: `Validate search intent and overlap for ${topGaps.length} discovered competitor gap topic(s).`,
              gapKeywords: topGaps.slice(0, 5).map((g) => g.targetKeyword),
            },
            evidenceReferences: compEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      } else if (allowDelegation) {
        try {
          const del = requestIntelligentDelegation({
            tenantId,
            projectId,
            workflowId: workflow.id,
            parentTaskId: task.id,
            sourceAgentId: 'competitor_intelligence_agent',
            targetAgentId: 'keyword_intelligence_agent',
            reason: 'Competitor gap discovery requires keyword intent validation before strategy.',
            requestedObjective: `Validate keyword intent for ${topGaps[0]?.targetKeyword ?? project.name}`,
            evidenceReferences: compEvidenceRefs,
            downstreamNodeKeys: strategyNodeKey ? [strategyNodeKey] : [],
            executionId,
          });
          if (del.delegatedTask) delegatedTaskIds.push(del.delegatedTask.id);
        } catch {
          // Governed rejection is expected if limits reached
        }
      }

      if (hasGeoTask) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'competitor_intelligence_agent',
            destinationAgentId: 'geographic_intelligence_agent',
            messageType: 'verification_request',
            payload: {
              summary: `Verify approved geographic market relevance for competitor findings (${compWs.competitors.length} competitor(s)).`,
              topGapKeyword: topGaps[0]?.targetKeyword ?? null,
            },
            evidenceReferences: compEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      } else if (allowDelegation && !hasGeoTask) {
        try {
          const del = requestIntelligentDelegation({
            tenantId,
            projectId,
            workflowId: workflow.id,
            parentTaskId: task.id,
            sourceAgentId: 'competitor_intelligence_agent',
            targetAgentId: 'geographic_intelligence_agent',
            reason: 'Verify competitor gap alignment against approved project target markets.',
            requestedObjective: `Check regional market fit for ${topGaps[0]?.targetKeyword ?? project.name}`,
            evidenceReferences: compEvidenceRefs,
            downstreamNodeKeys: strategyNodeKey ? [strategyNodeKey] : [],
            executionId,
          });
          if (del.delegatedTask) delegatedTaskIds.push(del.delegatedTask.id);
        } catch {
          // Governed rejection
        }
      }

      // If both keyword & geo already exist in DAG (e.g., competitor_research_collaboration),
      // delegate a governed verification subtask to research_agent when gaps exist and not yet delegated
      if (
        allowDelegation &&
        delegatedTaskIds.length === 0 &&
        workflow.templateId === 'competitor_research_collaboration'
      ) {
        try {
          const del = requestIntelligentDelegation({
            tenantId,
            projectId,
            workflowId: workflow.id,
            parentTaskId: task.id,
            sourceAgentId: 'competitor_intelligence_agent',
            targetAgentId: 'research_agent',
            reason:
              topGaps.length > 0
                ? `Cross-check competitor gap "${topGaps[0].targetKeyword}" against approved business services and crawled URLs.`
                : 'Cross-check competitor registry coverage against approved project services.',
            requestedObjective: 'Verify competitor gap alignment with approved business capabilities',
            evidenceReferences: compEvidenceRefs,
            downstreamNodeKeys: strategyNodeKey ? [strategyNodeKey] : [],
            executionId,
          });
          if (del.delegatedTask) delegatedTaskIds.push(del.delegatedTask.id);
        } catch {
          // Governed rejection
        }
      }

      return {
        summary: `Evaluated ${compWs.competitors.length} competitor(s), ${compWs.overlaps.length} overlap(s), and ${compWs.contentGaps.length} content gap(s).`,
        payload: {
          competitorsCount: compWs.competitors.length,
          overlapsCount: compWs.overlaps.length,
          contentGapsCount: compWs.contentGaps.length,
          gapCount: compWs.contentGaps.length,
          topContentGaps: topGaps,
          delegatedTaskIds,
          evidenceTrust: compEvidenceTrust,
        },
        evidenceRefs: compEvidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'geographic_intelligence_agent': {
      let geoWs = getGeoWorkspace(tenantId, projectId);
      const activeMarket =
        geoWs.targetMarkets.find((m) => m.approvalStatus === 'approved') ??
        geoWs.targetMarkets[0];

      if (
        activeMarket &&
        Boolean(workflow.config.runLiveGeoDiscovery) &&
        profile.approvedServices.length > 0
      ) {
        await runGeoDiscoveryWorkflow({
          tenantId,
          projectId,
          user,
          countryCode: activeMarket.countryCode,
          stateRegion: activeMarket.stateRegion || undefined,
          city: activeMarket.city || undefined,
          seedTerms: profile.approvedServices.slice(0, 3),
          includeAutocomplete: true,
          includeTrends: false,
          includeAiExpansion: false,
        });
        geoWs = getGeoWorkspace(tenantId, projectId);
      }

      const approvedMarkets = geoWs.targetMarkets.map(
        (m) =>
          [m.city, m.stateRegion, m.countryCode].filter(Boolean).join(', ') ||
          m.countryCode,
      );

      const effectiveGeoMarkets =
        approvedMarkets.length > 0 ? approvedMarkets : project.targetMarkets;
      const geoEvidenceRefs = [`https://${project.website}/`];
      const geoEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Approved project target markets: ${effectiveGeoMarkets.join(', ') || 'None configured'}.`,
            source: 'geographic_intelligence_workspace',
            evidenceRef: geoEvidenceRefs[0],
          },
        ],
        measuredMetrics: [
          {
            statement: `${geoWs.measurements.length} geographic measurement(s) and ${geoWs.opportunities.length} regional opportunity record(s).`,
            source: 'geo_intelligence_store',
            evidenceRef: geoEvidenceRefs[0],
          },
        ],
        unavailableInformation: [
          ...(geoWs.measurements.length > 0
            ? []
            : ['Country-level GSC click/impression telemetry requires connected Google Search Console OAuth.']),
        ],
        evidenceReferences: geoEvidenceRefs,
      });

      if (upstreamOutputs.some((o) => o.agentId === 'competitor_intelligence_agent')) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'geographic_intelligence_agent',
            destinationAgentId: 'competitor_intelligence_agent',
            messageType: 'findings_response',
            payload: {
              summary: `Confirmed ${effectiveGeoMarkets.length} approved target market(s) for competitor gap scoping.`,
              approvedMarkets: effectiveGeoMarkets,
            },
            evidenceReferences: geoEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      return {
        summary: `Evaluated ${geoWs.targetMarkets.length} approved target market(s) and ${geoWs.measurements.length} geographic measurement(s).`,
        payload: {
          approvedMarkets: effectiveGeoMarkets,
          measurementsCount: geoWs.measurements.length,
          opportunitiesCount: geoWs.opportunities.length,
          topGeoOpportunities: geoWs.opportunities.slice(0, 8),
          topCountries: geoWs.mapCountries.slice(0, 8),
          evidenceTrust: geoEvidenceTrust,
        },
        evidenceRefs: geoEvidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'technical_seo_agent': {
      let targetCrawl = latestCrawl;
      if (
        (!targetCrawl || Boolean(workflow.config.runFreshCrawl)) &&
        verification.verified &&
        verification.crawlPolicyApproved
      ) {
        targetCrawl = await startCrawlJob({
          tenantId,
          user,
          projectId,
          configOverrides: { maxPages: 15, maxDepth: 2 },
          awaitCompletion: true,
        });
      }

      if (!targetCrawl) {
        if (params.nodeDef.condition?.skipIfUnavailable) {
          throw new Error(
            'PROVIDER_UNAVAILABLE: No completed technical crawl exists and domain verification/crawl policy is incomplete.',
          );
        }
        throw new Error(
          'PREREQUISITE_FAILED: Verify domain ownership & approve crawl policy or run a Technical Audit first.',
        );
      }

      const issues = listCrawlIssues(tenantId, targetCrawl.id);
      const urls = getKnownProjectUrls();
      const techEvidenceRefs = urls.slice(0, 10);
      const techEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Completed crawl ${targetCrawl.id} inspected ${targetCrawl.processedCount} URL(s) on ${project.website}.`,
            source: `technical_crawl:${targetCrawl.id}`,
            evidenceRef: techEvidenceRefs[0],
          },
        ],
        measuredMetrics: [
          {
            statement: `Technical health score: ${targetCrawl.summary.healthScore}/100 with ${issues.length} detected technical issue(s).`,
            source: `technical_crawl:${targetCrawl.id}`,
            evidenceRef: techEvidenceRefs[0],
          },
        ],
        evidenceReferences: techEvidenceRefs,
      });

      // Stage 3: Write versioned technical audit context & collaborate with Performance / Research
      try {
        writeWorkflowContextItem({
          tenantId,
          projectId,
          workflowId: workflow.id,
          contextScope: 'technical_audit',
          contextKey: `tech_findings_${targetCrawl.id}`,
          source: `technical_crawl:${targetCrawl.id}`,
          sourceAgentId: 'technical_seo_agent',
          approvalStatus: 'verified_evidence',
          payload: {
            crawlId: targetCrawl.id,
            healthScore: targetCrawl.summary.healthScore,
            issuesCount: issues.length,
            criticalCount: issues.filter((i) => i.severity === 'Critical').length,
          },
          evidenceReferences: techEvidenceRefs,
        });
      } catch {
        // Non-fatal
      }

      const hasPerfTask = workflowDetail.tasks.some(
        (t) => t.agentId === 'performance_analysis_agent',
      );
      if (hasPerfTask) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'technical_seo_agent',
            destinationAgentId: 'performance_analysis_agent',
            messageType: 'verification_request',
            payload: {
              summary: `Cross-check ${issues.length} technical issue(s) against Core Web Vitals on ${urls.length} crawled URL(s).`,
              crawlId: targetCrawl.id,
              healthScore: targetCrawl.summary.healthScore,
            },
            evidenceReferences: techEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      } else if (Boolean(nodeDef.config?.enableIntelligentDelegation)) {
        const qaNodeKey = workflowDetail.tasks.find(
          (t) => t.agentId === 'quality_assurance_agent' && t.status === 'queued',
        )?.nodeKey;
        try {
          requestIntelligentDelegation({
            tenantId,
            projectId,
            workflowId: workflow.id,
            parentTaskId: task.id,
            sourceAgentId: 'technical_seo_agent',
            targetAgentId: 'performance_analysis_agent',
            reason: 'Correlate crawl findings with PageSpeed Core Web Vitals telemetry.',
            requestedObjective: `Audit Core Web Vitals for ${urls[0] ?? project.website}`,
            evidenceReferences: techEvidenceRefs,
            downstreamNodeKeys: qaNodeKey ? [qaNodeKey] : [],
            executionId,
          });
        } catch {
          // Governed rejection
        }
      }

      if (workflowDetail.tasks.some((t) => t.agentId === 'research_agent')) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'technical_seo_agent',
            destinationAgentId: 'research_agent',
            messageType: 'evidence_share',
            payload: {
              summary: `Shared ${issues.length} crawl issue(s) to confirm page business priority.`,
              crawlId: targetCrawl.id,
            },
            evidenceReferences: techEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      return {
        summary: `Crawl ${targetCrawl.id}: Health ${targetCrawl.summary.healthScore}/100, ${targetCrawl.processedCount} URL(s) processed, ${issues.length} technical issue(s).`,
        payload: {
          crawlId: targetCrawl.id,
          healthScore: targetCrawl.summary.healthScore,
          processedUrls: targetCrawl.processedCount,
          issuesCount: issues.length,
          topIssues: issues.slice(0, 10).map((i) => ({
            id: i.id,
            title: i.title,
            severity: i.severity,
            category: i.category,
            affectedUrlsCount: i.affectedUrlCount,
            sampleUrl: urls[0] ?? null,
          })),
          crawledUrls: urls,
          evidenceTrust: techEvidenceTrust,
        },
        evidenceRefs: techEvidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'performance_analysis_agent': {
      let runs = listPerformanceAuditRuns(tenantId, projectId, 5);
      let latestPerf = runs.find(
        (r) => r.status === 'Succeeded' || r.status === 'Partial',
      );

      if (!latestPerf || Boolean(workflow.config.runFreshPerfAudit)) {
        const urls = getKnownProjectUrls().slice(0, 2);
        try {
          latestPerf = await startPerformanceAudit({
            tenantId,
            user,
            projectId,
            targetUrls: urls,
            sourceCrawlId: latestCrawl?.id ?? null,
            strategyMode: 'both',
            awaitCompletion: true,
          });
        } catch (perfErr) {
          runs = listPerformanceAuditRuns(tenantId, projectId, 5);
          latestPerf = runs[0];
          if (!latestPerf) {
            throw new Error(
              `PROVIDER_UNAVAILABLE: PageSpeed audit unavailable (${perfErr instanceof Error ? perfErr.message : String(perfErr)})`,
            );
          }
        }
      }

      const perfEvidenceRefs =
        latestPerf.targetUrls.length > 0
          ? latestPerf.targetUrls.slice(0, 6)
          : [`https://${project.website}/`];

      const perfEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Performance audit ${latestPerf.id} completed with status "${latestPerf.status}".`,
            source: `performance_audit:${latestPerf.id}`,
            evidenceRef: perfEvidenceRefs[0],
          },
        ],
        measuredMetrics: [
          {
            statement: `Average Mobile score: ${latestPerf.avgMobileScore ?? 'N/A'}, Average Desktop score: ${latestPerf.avgDesktopScore ?? 'N/A'}.`,
            source: 'google_pagespeed_insights',
            evidenceRef: perfEvidenceRefs[0],
          },
        ],
        unavailableInformation: [
          ...(latestPerf.avgMobileScore === null
            ? ['Mobile PageSpeed score was unavailable in this audit run.']
            : []),
          ...(latestPerf.avgDesktopScore === null
            ? ['Desktop PageSpeed score was unavailable in this audit run.']
            : []),
        ],
        evidenceReferences: perfEvidenceRefs,
      });

      if (upstreamOutputs.some((o) => o.agentId === 'technical_seo_agent')) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'performance_analysis_agent',
            destinationAgentId: 'technical_seo_agent',
            messageType: 'findings_response',
            payload: {
              summary: `CWV telemetry correlated: Mobile ${latestPerf.avgMobileScore ?? 'N/A'} / Desktop ${latestPerf.avgDesktopScore ?? 'N/A'}.`,
              auditId: latestPerf.id,
              avgMobileScore: latestPerf.avgMobileScore,
              avgDesktopScore: latestPerf.avgDesktopScore,
            },
            evidenceReferences: perfEvidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      return {
        summary: `Performance Audit ${latestPerf.id}: Status ${latestPerf.status} · Mobile ${latestPerf.avgMobileScore ?? 'N/A'} · Desktop ${latestPerf.avgDesktopScore ?? 'N/A'}.`,
        payload: {
          auditId: latestPerf.id,
          status: latestPerf.status,
          avgMobileScore: latestPerf.avgMobileScore,
          avgDesktopScore: latestPerf.avgDesktopScore,
          targetUrls: latestPerf.targetUrls,
          errorSummary: latestPerf.errorSummary,
          evidenceTrust: perfEvidenceTrust,
        },
        evidenceRefs: perfEvidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'content_strategy_agent': {
      const kwOut = upstreamOutputs.find(
        (o) => o.agentId === 'keyword_intelligence_agent',
      );
      const compOut = upstreamOutputs.find(
        (o) => o.agentId === 'competitor_intelligence_agent',
      );
      const geoOut = upstreamOutputs.find(
        (o) => o.agentId === 'geographic_intelligence_agent',
      );
      const researchOut = upstreamOutputs.find(
        (o) => o.agentId === 'research_agent',
      );

      const kwList =
        (kwOut?.payload.topKeywords as { keyword?: string; intent?: string; targetUrl?: string | null }[] | undefined) ??
        getKeywordWorkspace(tenantId, projectId).keywords.map((k) => ({
          keyword: k.keyword,
          intent: k.intent,
          targetUrl: k.mapping?.targetUrl ?? null,
        }));
      const gapList =
        (compOut?.payload.topContentGaps as { targetKeyword?: string; rationale?: string }[] | undefined) ??
        listContentGaps(tenantId, projectId).map((g) => ({
          targetKeyword: g.targetKeyword,
          rationale: g.explanation || g.recommendedAction,
        }));

      const configuredKeyword =
        typeof workflow.config.targetKeyword === 'string'
          ? workflow.config.targetKeyword.trim()
          : '';
      const primaryGap = gapList[0];
      const primaryKw = kwList[0];
      const targetKeyword =
        configuredKeyword ||
        primaryGap?.targetKeyword ||
        primaryKw?.keyword ||
        profile.approvedServices[0] ||
        project.name;

      const intent = primaryKw?.intent || 'Commercial';

      const knownUrls =
        (researchOut?.payload.knownProjectUrls as string[] | undefined) ??
        getKnownProjectUrls();
      const targetUrl =
        (primaryKw?.targetUrl ? String(primaryKw.targetUrl) : knownUrls[0]) ||
        `https://${project.website}/`;

      const approvedMarkets =
        (geoOut?.payload.approvedMarkets as string[] | undefined) ??
        project.targetMarkets;

      const revisionFeedback = task.blockingReason?.startsWith('Revision requested')
        ? task.blockingReason
        : null;

      const recommendedSections = [
        `Executive Overview: ${targetKeyword}`,
        'Verified Business Capabilities & Architecture',
        'Technical Implementation & Market Requirements',
        'Common Questions & Evidence Summary',
      ];

      const briefSummary = [
        `Target page brief for "${targetKeyword}" (${intent} intent) targeting ${approvedMarkets.join(', ') || 'Global'}.`,
        primaryGap?.rationale ? `Competitor gap insight: ${primaryGap.rationale}` : '',
        revisionFeedback ? `Reviewer feedback incorporated: ${revisionFeedback}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const supportingEvidence = [
        ...knownUrls.slice(0, 4).map((url) => ({
          sourceUrl: url,
          factSummary: `Verified crawlable URL on ${project.website}`,
        })),
        ...gapList.slice(0, 2).map((g) => ({
          sourceUrl: `https://${project.website}/competitors`,
          factSummary: g.rationale || `Content gap identified for ${g.targetKeyword}`,
        })),
      ];

      const evidenceRefs = Array.from(
        new Set([...knownUrls.slice(0, 6), ...upstreamOutputs.flatMap((o) => o.evidenceRefs)]),
      ).slice(0, 12);

      const strategyEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Target page brief anchored to ${targetUrl} for approved markets: ${approvedMarkets.join(', ') || 'Global'}.`,
            source: 'shared_workflow_context',
            evidenceRef: targetUrl,
          },
        ],
        inferredFindings: [
          {
            statement: `Selected primary keyword "${targetKeyword}" (${intent} intent) based on upstream keyword and competitor gap evidence.`,
            source: 'content_strategy_planner',
            evidenceRef: evidenceRefs[0] ?? targetUrl,
          },
        ],
        aiGeneratedSuggestions: [],
        evidenceReferences: evidenceRefs,
      });

      // Stage 3: Persist versioned content brief in Shared Workflow Context & notify downstream agent
      try {
        writeWorkflowContextItem({
          tenantId,
          projectId,
          workflowId: workflow.id,
          contextScope: 'content_brief',
          contextKey: `brief_${targetKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'primary'}`,
          source: 'content_strategy_agent',
          sourceAgentId: 'content_strategy_agent',
          approvalStatus: task.approvalRequired ? 'draft' : 'proposed',
          payload: {
            targetKeyword,
            intent,
            targetUrl,
            approvedMarkets: approvedMarkets.length > 0 ? approvedMarkets : ['Global'],
            recommendedSections,
          },
          evidenceReferences: evidenceRefs,
        });
      } catch {
        // Non-fatal
      }

      const nextContentPeer: AgentStationId | null = workflowDetail.tasks.some(
        (t) => t.agentId === 'content_generation_agent',
      )
        ? 'content_generation_agent'
        : workflowDetail.tasks.some((t) => t.agentId === 'quality_assurance_agent')
          ? 'quality_assurance_agent'
          : null;
      if (nextContentPeer) {
        try {
          sendAgentMessage({
            tenantId,
            projectId,
            workflowId: workflow.id,
            executionId,
            sourceAgentId: 'content_strategy_agent',
            destinationAgentId: nextContentPeer,
            messageType: 'evidence_share',
            payload: {
              summary: `Published versioned Content Brief for "${targetKeyword}" (${recommendedSections.length} sections).`,
              targetKeyword,
              intent,
              targetUrl,
            },
            evidenceReferences: evidenceRefs,
            taskId: task.id,
          });
        } catch {
          // Non-fatal
        }
      }

      return {
        summary: `Prepared structured Content Strategy brief targeting "${targetKeyword}" (${recommendedSections.length} sections, ${evidenceRefs.length} evidence ref(s)).`,
        payload: {
          primaryKeyword: targetKeyword,
          targetKeyword,
          intent,
          targetUrl,
          approvedMarkets:
            approvedMarkets.length > 0 ? approvedMarkets : ['Global'],
          businessContextApproved:
            profile.approvedServices.length > 0 || upstreamOutputs.length > 0,
          recommendedH1: `${targetKeyword} — ${project.name} Guide`,
          recommendedSections,
          briefSummary,
          internalProjectUrls: knownUrls,
          supportingEvidence,
          revisionFeedbackApplied: revisionFeedback,
          evidenceTrust: strategyEvidenceTrust,
        },
        evidenceRefs,
        isAiGenerated: false,
      };
    }

    case 'content_generation_agent': {
      const strategyOut = upstreamOutputs.find(
        (o) => o.agentId === 'content_strategy_agent',
      );
      const researchOut = upstreamOutputs.find(
        (o) => o.agentId === 'research_agent',
      );
      const geoOut = upstreamOutputs.find(
        (o) => o.agentId === 'geographic_intelligence_agent',
      );

      const knownUrls =
        (strategyOut?.payload.internalProjectUrls as string[] | undefined) ??
        (researchOut?.payload.knownProjectUrls as string[] | undefined) ??
        getKnownProjectUrls();

      const targetKeyword =
        String(
          strategyOut?.payload.targetKeyword ??
            workflow.config.targetKeyword ??
            '',
        ).trim();

      const approvedMarkets =
        (strategyOut?.payload.approvedMarkets as string[] | undefined) ??
        (geoOut?.payload.approvedMarkets as string[] | undefined) ??
        project.targetMarkets;

      const supportingEvidence =
        (strategyOut?.payload.supportingEvidence as
          | { sourceUrl: string; factSummary: string }[]
          | undefined) ??
        knownUrls.slice(0, 4).map((url) => ({
          sourceUrl: url,
          factSummary: `Verified project URL on ${project.website}`,
        }));

      const revisionFeedback = task.blockingReason?.startsWith('Revision requested')
        ? sanitizeUntrustedTextForPrompt(task.blockingReason, 220)
        : '';

      const baseBriefSummary = String(
        strategyOut?.payload.briefSummary ?? workflow.objective ?? '',
      ).trim();

      const genInput: ContentGenerationInput = {
        projectWebsite: project.website,
        businessName: project.name,
        businessContextApproved:
          Boolean(strategyOut?.payload.businessContextApproved) ||
          profile.approvedServices.length > 0,
        approvedMarkets:
          approvedMarkets.length > 0 ? approvedMarkets : ['Global'],
        targetKeyword,
        intent: String(strategyOut?.payload.intent ?? 'Informational'),
        briefSummary: revisionFeedback
          ? `${baseBriefSummary} Revision note: ${revisionFeedback}`
          : baseBriefSummary,
        recommendedH1: String(
          strategyOut?.payload.recommendedH1 ?? targetKeyword,
        ),
        recommendedSections:
          (strategyOut?.payload.recommendedSections as string[] | undefined) ?? [
            'Overview',
            'Implementation',
            'FAQ',
          ],
        internalProjectUrls: knownUrls,
        supportingEvidence,
        preferredModel: params.preferredModel,
      };

      const generator =
        activeTestHooks?.llmGenerator ?? generateSeoDraftWithProvider;
      const llmRes = await generator(genInput, abortSignal);

      const draftEvidenceRefs = Array.from(
        new Set([
          ...llmRes.draft.supportingEvidenceReferences,
          ...llmRes.draft.internalLinkingSuggestions.map((l) => l.targetUrl),
        ]),
      ).slice(0, 12);

      const draftEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: knownUrls.slice(0, 3).map((u) => ({
          statement: `Internal link target verified in project crawl inventory: ${u}`,
          source: 'project_crawl_inventory',
          evidenceRef: u,
        })),
        aiGeneratedSuggestions: [
          {
            statement: `AI-generated SEO draft "${llmRes.draft.seoTitle}" authored by ${llmRes.model} (requires human approval before publishing).`,
            source: `llm:${llmRes.model}`,
            evidenceRef: draftEvidenceRefs[0],
          },
        ],
        evidenceReferences: draftEvidenceRefs,
      });

      return {
        summary: `Generated AI SEO draft "${llmRes.draft.seoTitle}" via ${llmRes.model}${
          llmRes.totalTokens !== null ? ` (${llmRes.totalTokens} tokens)` : ''
        }`,
        payload: {
          ...llmRes.draft,
          provider: llmRes.provider,
          model: llmRes.model,
          inputTokens: llmRes.inputTokens,
          outputTokens: llmRes.outputTokens,
          totalTokens: llmRes.totalTokens,
          evidenceTrust: draftEvidenceTrust,
        },
        evidenceRefs: draftEvidenceRefs,
        isAiGenerated: true,
        provider: llmRes.provider,
        model: llmRes.model,
        inputTokens: llmRes.inputTokens,
        outputTokens: llmRes.outputTokens,
        cachedInputTokens: llmRes.cachedInputTokens ?? null,
        totalTokens: llmRes.totalTokens,
        providerRequestId: llmRes.providerRequestId ?? null,
        latencyMs: llmRes.latencyMs ?? null,
        usageSource: llmRes.usageSource,
        measurementStatus: llmRes.measurementStatus,
        rawUsageMetadata: llmRes.rawUsageMetadata ?? null,
      };
    }

    case 'quality_assurance_agent': {
      const draftOut = upstreamOutputs.find(
        (o) => o.agentId === 'content_generation_agent',
      );
      const strategyOut = upstreamOutputs.find(
        (o) => o.agentId === 'content_strategy_agent',
      );
      const knownUrls = getKnownProjectUrls();

      // Stage 3: Validate upstream evidence trust & run cross-agent conflict detection
      const detectedConflicts = runConflictDetectionForWorkflow({
        tenantId,
        projectId,
        workflowId: workflow.id,
        executionId,
      });

      const currentWfForQa = getWorkflowDetailById(tenantId, workflow.id);
      const upstreamAuditResults = (currentWfForQa?.outputs ?? upstreamOutputs).map((out) => ({
        outputId: out.id,
        agentId: out.agentId,
        ...validateEvidenceTrustForOutput(out),
      }));
      const unsupportedClaims = upstreamAuditResults.flatMap((r) =>
        r.unsupportedClaims.map((claim) => `${r.agentId}: ${claim}`),
      );

      if (unsupportedClaims.length > 0) {
        const offending = upstreamAuditResults.find((r) => r.unsupportedClaims.length > 0);
        if (offending && offending.agentId !== 'quality_assurance_agent') {
          try {
            sendAgentMessage({
              tenantId,
              projectId,
              workflowId: workflow.id,
              executionId,
              sourceAgentId: 'quality_assurance_agent',
              destinationAgentId: offending.agentId,
              messageType: 'rejection_notice',
              payload: {
                summary: `Flagged ${unsupportedClaims.length} unsupported claim(s) during QA evidence audit.`,
                unsupportedClaims: unsupportedClaims.slice(0, 6),
              },
              evidenceReferences: knownUrls.slice(0, 4),
              taskId: task.id,
            });
          } catch {
            // Non-fatal
          }
        }
      }

      const qaEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `QA audited ${upstreamAuditResults.length} upstream agent output(s) and detected ${detectedConflicts.length} workflow conflict(s).`,
            source: 'quality_assurance_agent',
            evidenceRef: knownUrls[0],
          },
        ],
        unavailableInformation: [],
        evidenceReferences: knownUrls.slice(0, 8),
        qaValidationStatus:
          unsupportedClaims.length > 0 || detectedConflicts.length > 0
            ? 'warnings'
            : 'validated',
        qaUnsupportedClaims: unsupportedClaims,
      });

      if (draftOut) {
        const draftPayload = draftOut.payload as unknown as GeneratedSeoDraft;
        const expectedKeyword = String(
          strategyOut?.payload.targetKeyword ?? draftPayload.targetKeyword ?? '',
        );
        const requiredSections =
          (strategyOut?.payload.recommendedSections as string[] | undefined) ?? [];
        const evidenceTexts = upstreamOutputs.map((o) =>
          `${o.summary} ${JSON.stringify(o.payload)}`,
        );

        const qaReport = runQaDraftValidation({
          draft: draftPayload,
          expectedKeyword,
          requiredSections,
          knownProjectUrls: knownUrls,
          evidenceTexts,
        });

        if (qaReport.verdict === 'fail') {
          throw new Error(
            `QA validation failed: ${qaReport.checks
              .filter((c) => c.status === 'fail')
              .map((c) => c.detail)
              .join(' | ')}`,
          );
        }

        return {
          summary: `${qaReport.summary}${detectedConflicts.length > 0 ? ` · ${detectedConflicts.length} conflict(s) flagged for review` : ''}`,
          payload: {
            mode: 'draft_qa',
            ...qaReport,
            conflictsDetectedCount: detectedConflicts.length,
            unsupportedClaimsCount: unsupportedClaims.length,
            evidenceTrust: qaEvidenceTrust,
          },
          evidenceRefs: qaReport.verifiedInternalLinks,
          isAiGenerated: false,
        };
      }

      // Technical / Collaborative QA verification mode
      const openCritical = latestCrawl
        ? listCrawlIssues(tenantId, latestCrawl.id).filter(
            (i) =>
              (i.severity === 'Critical' || i.severity === 'High') &&
              i.status !== 'Verified' &&
              i.status !== 'Rejected',
          )
        : [];
      const verdict =
        openCritical.length === 0 && detectedConflicts.length === 0 && unsupportedClaims.length === 0
          ? 'pass'
          : 'warning';
      return {
        summary:
          verdict === 'pass'
            ? `QA PASS: Verified ${upstreamAuditResults.length} output(s), 0 conflicts, 0 Critical/High blockers.`
            : `QA WARNING: ${openCritical.length} Critical/High issue(s), ${detectedConflicts.length} conflict(s), ${unsupportedClaims.length} unsupported claim(s).`,
        payload: {
          mode: 'technical_qa',
          verdict,
          openCriticalOrHighCount: openCritical.length,
          openIssueIds: openCritical.slice(0, 10).map((i) => i.id),
          conflictsDetectedCount: detectedConflicts.length,
          unsupportedClaimsCount: unsupportedClaims.length,
          evidenceTrust: qaEvidenceTrust,
        },
        evidenceRefs: knownUrls.slice(0, 8),
        isAiGenerated: false,
      };
    }

    case 'reporting_agent':
    default: {
      const currentDetail = getWorkflowDetailById(tenantId, workflow.id);
      const allOutputs = currentDetail?.outputs ?? upstreamOutputs;
      const allHandoffs = currentDetail?.handoffs ?? [];
      const allApprovals = currentDetail?.approvals ?? [];
      const wfMessages = listAgentMessages({
        tenantId,
        projectId,
        workflowId: workflow.id,
        limit: 200,
      });
      const wfDelegations = listAgentDelegations({
        tenantId,
        projectId,
        workflowId: workflow.id,
        limit: 100,
      });
      const wfConflicts = listWorkflowConflicts({
        tenantId,
        projectId,
        workflowId: workflow.id,
        limit: 100,
      });
      const wfContextVersions = listWorkflowContextItems({
        tenantId,
        projectId,
        workflowId: workflow.id,
        limit: 100,
      });

      const qaOutput = allOutputs.find(
        (o) => o.agentId === 'quality_assurance_agent',
      );
      const qaVerdict = qaOutput?.payload.verdict
        ? String(qaOutput.payload.verdict)
        : 'not_run';

      const unavailableIntegrations: string[] = [];
      if (!isGeminiProviderConfigured()) {
        unavailableIntegrations.push('GEMINI_API_KEY (Content Generation)');
      }

      const allEvidenceRefs = Array.from(
        new Set(allOutputs.flatMap((o) => o.evidenceRefs)),
      ).slice(0, 20);

      const totalTokens = (currentDetail?.executions ?? []).reduce(
        (acc, ex) => acc + (ex.totalTokens ?? 0),
        0,
      );

      const reportEvidenceTrust = buildEvidenceTrustBreakdown({
        verifiedFacts: [
          {
            statement: `Aggregated ${allOutputs.length} output(s), ${wfMessages.length} agent message(s), ${wfDelegations.length} delegated task(s), and ${wfContextVersions.length} context version(s).`,
            source: 'reporting_agent',
            evidenceRef: allEvidenceRefs[0] ?? `https://${project.website}/`,
          },
        ],
        measuredMetrics: [
          {
            statement: `${allHandoffs.length} validated handoff(s), ${wfConflicts.length} workflow conflict(s) detected, QA verdict "${qaVerdict}".`,
            source: 'agent_orchestration_db',
            evidenceRef: allEvidenceRefs[0] ?? `https://${project.website}/`,
          },
        ],
        unavailableInformation: unavailableIntegrations,
        evidenceReferences: allEvidenceRefs,
      });

      return {
        summary: `Executive digest compiled: ${allOutputs.length} output(s), ${wfMessages.length} peer message(s), ${wfDelegations.length} delegation(s), QA "${qaVerdict}".`,
        payload: {
          workflowName: workflow.name,
          projectWebsite: project.website,
          deliverablesCount: allOutputs.length,
          validatedHandoffsCount: allHandoffs.length,
          collaborationStats: {
            messagesCount: wfMessages.length,
            delegationsCount: wfDelegations.length,
            contextVersionsCount: wfContextVersions.length,
            openConflictsCount: wfConflicts.filter(
              (c) => c.status === 'open' || c.status === 'verifying',
            ).length,
            resolvedConflictsCount: wfConflicts.filter(
              (c) => c.status === 'resolved' || c.status === 'dismissed',
            ).length,
          },
          approvalsRecorded: allApprovals.map((a) => ({
            title: a.title,
            status: a.status,
            approverName: a.approverName,
            decidedAt: a.decidedAt,
          })),
          qaVerdict,
          measuredTotalTokens: totalTokens > 0 ? totalTokens : null,
          unavailableIntegrations,
          deliverableSummaries: allOutputs.map((o) => ({
            agentId: o.agentId,
            summary: o.summary,
            isAiGenerated: o.isAiGenerated,
          })),
          evidenceTrust: reportEvidenceTrust,
        },
        evidenceRefs: allEvidenceRefs,
        isAiGenerated: false,
      };
    }
  }
}

// ============================================================================
// STAGE 4: VISUAL WORKFLOW STUDIO CONTROL NODE EXECUTOR
// ============================================================================

function pruneUntakenConditionBranches(params: {
  tenantId: string;
  workflowId: string;
  conditionNodeKey: string;
  selectedBranch: 'true' | 'false';
}): string[] {
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail) return [];

  const edgeMeta = getStudioEdgeMetaMap(detail.workflow);
  const outgoing = detail.edges.filter((e) => e.fromNodeKey === params.conditionNodeKey);
  const untakenEdges = outgoing.filter((e) => {
    const meta = edgeMeta[`${e.fromNodeKey}=>${e.toNodeKey}`];
    if (!meta) return false;
    if (meta.sourceHandle === 'true' || meta.sourceHandle === 'false') {
      return meta.sourceHandle !== params.selectedBranch;
    }
    return false;
  });

  if (untakenEdges.length === 0) return [];

  const takenRoots = outgoing
    .filter((e) => !untakenEdges.includes(e))
    .map((e) => e.toNodeKey);
  const takenReachable = new Set<string>(takenRoots);
  for (const r of takenRoots) {
    for (const ds of getDownstreamNodeKeys(r, detail.edges)) {
      takenReachable.add(ds);
    }
  }

  const skippedKeys: string[] = [];
  const now = new Date().toISOString();

  for (const ue of untakenEdges) {
    const candidates = [ue.toNodeKey, ...getDownstreamNodeKeys(ue.toNodeKey, detail.edges)];
    for (const key of candidates) {
      if (takenReachable.has(key)) continue; // Preserve shared join nodes reached by active branch
      const t = detail.tasks.find((row) => row.nodeKey === key);
      if (!t || t.status !== 'queued') continue;
      // Ensure no other active non-skipped incoming branch feeds this node
      const incoming = detail.edges.filter((e) => e.toNodeKey === key);
      const hasOtherActiveParent = incoming.some((e) => {
        if (e.fromNodeKey === params.conditionNodeKey) return false;
        if (candidates.includes(e.fromNodeKey)) return false;
        const parentTask = detail.tasks.find((row) => row.nodeKey === e.fromNodeKey);
        return parentTask && parentTask.status !== 'cancelled' && parentTask.status !== 'blocked';
      });
      if (hasOtherActiveParent) continue;

      updateTaskRecordInDb({
        tenantId: params.tenantId,
        taskId: t.id,
        status: 'cancelled',
        blockingReason: `Skipped: condition "${params.conditionNodeKey}" routed to "${params.selectedBranch}" branch.`,
        completedAt: now,
        durationMs: 0,
      });
      skippedKeys.push(key);
    }
  }

  return skippedKeys;
}

function extractConditionMetrics(params: {
  upstreamOutputs: AgentOutputRecord[];
  workflowDetail: AgentWorkflowDetail;
  sharedContext: SharedWorkflowContext;
  sourceNodeId?: string | null;
}): Partial<Record<RestrictedConditionField, unknown>> {
  const { workflowDetail, sharedContext, sourceNodeId } = params;
  const scopedOutputs = sourceNodeId
    ? params.upstreamOutputs.filter((o) => {
        const t = workflowDetail.tasks.find((row) => row.id === o.taskId);
        return t?.nodeKey === sourceNodeId;
      })
    : params.upstreamOutputs;

  const effectiveOutputs = scopedOutputs.length > 0 ? scopedOutputs : params.upstreamOutputs;
  const allEvidenceRefs = Array.from(
    new Set(effectiveOutputs.flatMap((o) => o.evidenceRefs)),
  );

  const profileSnap = sharedContext.getApprovedBusinessProfile();
  const marketSnap = sharedContext.getApprovedTargetMarkets();
  const kwSnap = sharedContext.getApprovedKeywords();
  const compSnap = sharedContext.getCompetitorEvidence();
  const techSnap = sharedContext.getTechnicalAuditSnapshot();
  const perfSnap = sharedContext.getPerformanceSnapshot();

  let healthScore: number | null = techSnap.data.healthScore;
  let mobileScore: number | null = perfSnap.data.mobileScore;
  let desktopScore: number | null = perfSnap.data.desktopScore;
  let openCriticalIssues: number = techSnap.data.openCriticalIssues;
  let openConflictsCount = 0;
  let qaVerdict: string | null = null;
  let wordCount: number | null = null;

  for (const out of effectiveOutputs) {
    const p = out.payload ?? {};
    if (typeof p.healthScore === 'number') healthScore = p.healthScore;
    if (typeof p.mobileScore === 'number') mobileScore = p.mobileScore;
    if (typeof p.desktopScore === 'number') desktopScore = p.desktopScore;
    if (typeof p.openCriticalOrHighCount === 'number') {
      openCriticalIssues = p.openCriticalOrHighCount;
    } else if (typeof p.openCriticalIssues === 'number') {
      openCriticalIssues = p.openCriticalIssues;
    }
    if (typeof p.conflictsDetectedCount === 'number') {
      openConflictsCount = Math.max(openConflictsCount, p.conflictsDetectedCount);
    } else if (typeof p.openConflictsCount === 'number') {
      openConflictsCount = Math.max(openConflictsCount, p.openConflictsCount);
    }
    if (typeof p.verdict === 'string') qaVerdict = p.verdict;
    if (typeof p.wordCount === 'number') wordCount = p.wordCount;
  }

  const latestApproval = workflowDetail.approvals[0] ?? null;
  const upstreamSucceeded = effectiveOutputs.length > 0;

  return {
    evidenceCount: allEvidenceRefs.length,
    keywordCount: kwSnap.data.totalCount,
    competitorCount: compSnap.data.competitorsCount,
    contentGapCount: compSnap.data.contentGapsCount,
    healthScore,
    mobileScore,
    desktopScore,
    openCriticalIssues,
    openConflictsCount,
    hasApprovedProfile: profileSnap.data.isApproved,
    hasApprovedMarkets: marketSnap.data.hasApprovedMarkets,
    upstreamSucceeded,
    approvalStatus: latestApproval?.status ?? 'none',
    qaVerdict: qaVerdict ?? 'not_run',
    wordCount,
  };
}

async function executeStudioControlNode(params: {
  tenantId: string;
  projectId: string;
  workflow: AgentWorkflowDetail['workflow'];
  workflowDetail: AgentWorkflowDetail;
  task: WorkflowTaskRecord;
  nodeDef: DagWorkflowNodeInput;
  upstreamOutputs: AgentOutputRecord[];
  sharedContext: SharedWorkflowContext;
  category: StudioNodeCategory;
  subtype: StudioNodeSubtype;
}): Promise<AdapterOutputResult> {
  const {
    tenantId,
    projectId,
    workflow,
    workflowDetail,
    task,
    nodeDef,
    upstreamOutputs,
    sharedContext,
    category,
    subtype,
  } = params;
  const cfg = (nodeDef.config ?? {}) as Record<string, unknown>;
  const profile = sharedContext.getApprovedBusinessProfile();
  const markets = sharedContext.getApprovedTargetMarkets();
  const fallbackRef = `https://${profile.data.projectWebsite}/`;

  if (category === 'trigger') {
    if (subtype === 'approved_project_event') {
      const requireProfile = Boolean(cfg.requireApprovedProfile);
      const requireMarkets = Boolean(cfg.requireApprovedMarkets);
      if (requireProfile && !profile.data.isApproved) {
        throw new Error(
          'PREREQUISITE_FAILED: Approved Project Gate requires configured approved business services in Keyword Intelligence.',
        );
      }
      if (requireMarkets && !markets.data.hasApprovedMarkets) {
        throw new Error(
          'PREREQUISITE_FAILED: Approved Project Gate requires at least one approved target market.',
        );
      }
      return {
        summary: `Approved project baselines verified (${profile.data.approvedServices.length} service(s), ${markets.data.marketCodes.length} target market(s)).`,
        payload: {
          triggerType: subtype,
          hasApprovedProfile: profile.data.isApproved,
          hasApprovedMarkets: markets.data.hasApprovedMarkets,
          approvedServices: profile.data.approvedServices,
          approvedMarkets: markets.data.marketCodes,
          provenance: sharedContext.getProvenanceSummary(),
        },
        evidenceRefs: [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    if (subtype === 'existing_event_trigger') {
      const sourceKind = String(cfg.triggerEventSource ?? 'crawl_completed');
      const techSnap = sharedContext.getTechnicalAuditSnapshot();
      const perfSnap = sharedContext.getPerformanceSnapshot();
      const kwSnap = sharedContext.getApprovedKeywords();
      const latestId =
        sourceKind === 'performance_completed'
          ? perfSnap.data.latestRunId
          : sourceKind === 'keyword_discovery'
            ? kwSnap.data.keywords[0]?.id ?? null
            : techSnap.data.latestCrawlId;

      return {
        summary: latestId
          ? `Bound persisted ${sourceKind} event (${latestId}) for ${profile.data.projectWebsite}.`
          : `Workspace event trigger "${sourceKind}" started with current project baseline (${profile.data.projectWebsite}).`,
        payload: {
          triggerType: subtype,
          eventSource: sourceKind,
          eventVerified: Boolean(latestId),
          latestRunId: latestId,
          projectWebsite: profile.data.projectWebsite,
        },
        evidenceRefs: latestId ? [`${sourceKind}:${latestId}`, fallbackRef] : [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    if (subtype === 'scheduled_trigger') {
      const hint = String(cfg.scheduleCronHint ?? 'On-demand schedule policy');
      return {
        summary: `Triggered workflow manually under schedule policy "${hint}".`,
        payload: {
          triggerType: subtype,
          scheduleCronHint: hint,
          scheduleArmed: Boolean(cfg.scheduleArmed),
          executionMode: 'manual_trigger_execution',
          projectWebsite: profile.data.projectWebsite,
        },
        evidenceRefs: [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    return {
      summary: `Manual trigger started workflow "${workflow.name}" on ${profile.data.projectWebsite}.`,
      payload: {
        triggerType: 'manual_trigger',
        triggeredBy: workflow.createdBy,
        projectWebsite: profile.data.projectWebsite,
        startedAt: new Date().toISOString(),
        provenance: sharedContext.getProvenanceSummary(),
      },
      evidenceRefs: [fallbackRef],
      isAiGenerated: false,
      provider: 'rovix_workflow_studio',
    };
  }

  if (category === 'condition') {
    const rule = cfg.conditionRule as RestrictedConditionRule | undefined;
    const metrics = extractConditionMetrics({
      upstreamOutputs,
      workflowDetail,
      sharedContext,
      sourceNodeId: rule?.sourceNodeId ?? null,
    });
    const evalResult = evaluateRestrictedCondition(rule, metrics);
    const skippedNodeKeys = pruneUntakenConditionBranches({
      tenantId,
      workflowId: workflow.id,
      conditionNodeKey: task.nodeKey,
      selectedBranch: evalResult.selectedBranch,
    });

    const upstreamRefs = Array.from(
      new Set(upstreamOutputs.flatMap((o) => o.evidenceRefs)),
    ).slice(0, 12);

    return {
      summary: `Condition evaluated ${evalResult.selectedBranch.toUpperCase()}: ${evalResult.explanation}${skippedNodeKeys.length > 0 ? ` (${skippedNodeKeys.length} untaken node(s) skipped)` : ''}`,
      payload: {
        conditionSubtype: subtype,
        matched: evalResult.matched,
        selectedBranch: evalResult.selectedBranch,
        evaluatedField: evalResult.field,
        operator: evalResult.operator,
        observedValue: evalResult.observedValue,
        expectedValue: evalResult.expectedValue,
        explanation: evalResult.explanation,
        skippedNodeKeys,
      },
      evidenceRefs: upstreamRefs.length > 0 ? upstreamRefs : [fallbackRef],
      isAiGenerated: false,
      provider: 'rovix_workflow_studio',
    };
  }

  if (category === 'data') {
    const combinedEvidenceRefs = Array.from(
      new Set(upstreamOutputs.flatMap((o) => o.evidenceRefs)),
    ).slice(0, 24);

    if (subtype === 'structured_data_mapping') {
      const mappings = Array.isArray(cfg.fieldMappings)
        ? (cfg.fieldMappings as StudioFieldMappingEntry[])
        : [];
      const mergedUpstreamPayload: Record<string, unknown> = {};
      for (const out of upstreamOutputs) {
        Object.assign(mergedUpstreamPayload, out.payload);
      }
      const mappedFields: Record<string, unknown> = {};
      for (const m of mappings) {
        if (!m?.targetField?.trim()) continue;
        const val = mergedUpstreamPayload[m.sourcePath];
        mappedFields[m.targetField.trim()] =
          val !== undefined ? val : m.fallbackValue ?? null;
      }
      return {
        summary: `Mapped ${Object.keys(mappedFields).length} structured field(s) from ${upstreamOutputs.length} upstream output(s).`,
        payload: {
          dataSubtype: subtype,
          mappedFields,
          sourceOutputIds: upstreamOutputs.map((o) => o.id),
        },
        evidenceRefs: combinedEvidenceRefs.length > 0 ? combinedEvidenceRefs : [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    if (subtype === 'output_transformation') {
      const mode = String(cfg.transformMode ?? 'consolidate_evidence');
      const items = upstreamOutputs.map((o) => ({
        agentId: o.agentId,
        outputId: o.id,
        summary: o.summary,
        evidenceCount: o.evidenceRefs.length,
      }));
      return {
        summary: `Transformed ${upstreamOutputs.length} upstream output(s) using "${mode}" (${combinedEvidenceRefs.length} evidence ref(s)).`,
        payload: {
          dataSubtype: subtype,
          transformMode: mode,
          transformedItems: items,
          itemCount: items.length,
          consolidatedEvidenceRefs: combinedEvidenceRefs,
        },
        evidenceRefs: combinedEvidenceRefs.length > 0 ? combinedEvidenceRefs : [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    if (subtype === 'evidence_validation') {
      const minRefs = Math.max(0, Number(cfg.requireMinEvidenceRefs ?? 1));
      const unsupportedClaims: string[] = [];
      for (const out of upstreamOutputs) {
        const audit = validateEvidenceTrustForOutput(out);
        unsupportedClaims.push(...audit.unsupportedClaims);
      }
      if (combinedEvidenceRefs.length < minRefs) {
        throw new Error(
          `PREREQUISITE_FAILED: Evidence Validation required at least ${minRefs} evidence reference(s), found ${combinedEvidenceRefs.length}.`,
        );
      }
      return {
        summary: `Evidence validated: ${combinedEvidenceRefs.length} verified ref(s), ${unsupportedClaims.length} unsupported claim warning(s).`,
        payload: {
          dataSubtype: subtype,
          validated: true,
          evidenceCount: combinedEvidenceRefs.length,
          requireMinEvidenceRefs: minRefs,
          unsupportedClaimsCount: unsupportedClaims.length,
          unsupportedClaims: unsupportedClaims.slice(0, 10),
        },
        evidenceRefs: combinedEvidenceRefs.length > 0 ? combinedEvidenceRefs : [fallbackRef],
        isAiGenerated: false,
        provider: 'rovix_workflow_studio',
      };
    }

    // merge_results
    const strategy = String(cfg.mergeStrategy ?? 'union_evidence');
    const mergedMetrics: Record<string, unknown> = {};
    for (const out of upstreamOutputs) {
      for (const [k, v] of Object.entries(out.payload)) {
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          mergedMetrics[k] = v;
        }
      }
    }
    return {
      summary: `Merged ${upstreamOutputs.length} parallel branch output(s) (${combinedEvidenceRefs.length} unique evidence ref(s)).`,
      payload: {
        dataSubtype: 'merge_results',
        mergeStrategy: strategy,
        mergedSources: upstreamOutputs.map((o) => ({
          outputId: o.id,
          agentId: o.agentId,
          summary: o.summary,
        })),
        combinedSummary: upstreamOutputs.map((o) => o.summary).join(' | '),
        mergedMetrics,
      },
      evidenceRefs: combinedEvidenceRefs.length > 0 ? combinedEvidenceRefs : [fallbackRef],
      isAiGenerated: false,
      provider: 'rovix_workflow_studio',
    };
  }

  // Governance nodes
  if (subtype === 'conflict_resolution') {
    const conflicts = runConflictDetectionForWorkflow({
      tenantId,
      projectId,
      workflowId: workflow.id,
      executionId: task.id,
    });
    const openConflicts = conflicts.filter((c) => c.status === 'open' || c.status === 'verifying');
    if (Boolean(cfg.blockOnOpenConflicts) && openConflicts.length > 0) {
      throw new Error(
        `PREREQUISITE_FAILED: Conflict Resolution Gate detected ${openConflicts.length} unresolved conflict(s) requiring human review.`,
      );
    }
    const refs = Array.from(new Set(upstreamOutputs.flatMap((o) => o.evidenceRefs))).slice(0, 12);
    return {
      summary:
        openConflicts.length > 0
          ? `Conflict Resolution Gate flagged ${openConflicts.length} conflict(s) for review.`
          : `Conflict Resolution Gate passed with 0 open cross-agent contradictions.`,
      payload: {
        governanceSubtype: subtype,
        openConflictsCount: openConflicts.length,
        conflictIds: openConflicts.map((c) => c.id),
        requiresHumanReview: openConflicts.length > 0,
      },
      evidenceRefs: refs.length > 0 ? refs : [fallbackRef],
      isAiGenerated: false,
      provider: 'rovix_workflow_studio',
    };
  }

  // human_approval | business_owner_review — prepares dossier and pauses at existing approval gate
  const reviewPrompt = String(
    cfg.approvalPrompt ?? 'Review upstream evidence and approve to proceed.',
  );
  const refs = Array.from(new Set(upstreamOutputs.flatMap((o) => o.evidenceRefs))).slice(0, 16);
  return {
    summary: `${task.title}: ${reviewPrompt} (${upstreamOutputs.length} upstream deliverable(s) attached).`,
    payload: {
      governanceSubtype: subtype,
      gateType: task.approvalGateType ?? 'content_brief',
      approverRole: String(cfg.approverRole ?? 'Agency Owner'),
      approvalPrompt: reviewPrompt,
      deliverablesUnderReview: upstreamOutputs.map((o) => ({
        outputId: o.id,
        agentId: o.agentId,
        summary: o.summary,
        isAiGenerated: o.isAiGenerated,
      })),
    },
    evidenceRefs: refs.length > 0 ? refs : [fallbackRef],
    isAiGenerated: false,
    provider: 'rovix_workflow_studio',
  };
}
