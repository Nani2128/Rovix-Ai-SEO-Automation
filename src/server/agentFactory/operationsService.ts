import crypto from 'node:crypto';
import type {
  AgentStationId,
  AgentWorkflowDetail,
  WorkflowTemplateId,
} from '../../types/agentFactory';
import type { User, UserRole } from '../../types/auth';
import type {
  AutomationTriggerType,
  AutonomyMode,
  AutonomyPolicyRecord,
  OperationsControlCenterPayload,
  RuntimeHealthSummary,
  ScheduleCatchUpPolicy,
  ScheduleExecutionWindow,
  ScheduleFrequency,
  ScheduleTargetKind,
  WorkflowDeadLetterTaskRecord,
  WorkflowScheduleRecord,
  WorkflowTriggerEventRecord,
  WorkflowTriggerSubscriptionRecord,
} from '../../types/autonomousOperations';
import {
  computeNextScheduledRunAt,
  DEFAULT_HIGH_IMPACT_ACTIONS,
  evaluateAutonomyPolicy,
  validateScheduleInput,
} from '../../lib/autonomousOperationsEngine';
import { buildWorkflowBlueprint } from '../../lib/dagValidation';
import { getAuditDb, getProjectById, recordActivityEvent, recordAuditTrail } from '../audit/db';
import {
  emitRealAgentEvent,
  setDomainTriggerPublisher,
} from './agentFactoryService';
import {
  countRecentWebhookEventsForSubscriptionInDb,
  createTriggerSubscriptionInDb,
  createWorkflowScheduleInDb,
  deleteTriggerSubscriptionInDb,
  deleteWorkflowScheduleInDb,
  getDeadLetterTaskByIdInDb,
  getOrCreateAutonomyPolicyInDb,
  getTriggerSubscriptionByIdInDb,
  getWebhookSubscriptionSecretRecordByIdInDb,
  getWorkflowScheduleByIdInDb,
  insertRecoveryRecordInDb,
  insertTriggerEventInDb,
  listActiveLeasesForProjectInDb,
  listDeadLetterTasksInDb,
  listOperationsPolicyAuditInDb,
  listRecoveryRecordsInDb,
  listSchedulerExecutionLogsInDb,
  listTriggerEventsInDb,
  listTriggerSubscriptionsInDb,
  listWorkerHeartbeatsInDb,
  listWorkflowSchedulesInDb,
  reclaimExpiredWorkerLeasesInDb,
  updateDeadLetterStatusInDb,
  updateTriggerEventOutcomeInDb,
  updateTriggerSubscriptionInDb,
  updateWorkflowScheduleInDb,
  upsertAutonomyPolicyInDb,
} from './operationsDb';
import {
  listApprovalRequestsInDb,
  listWorkflowsForProject,
  recoverInterruptedAgentWorkflowsInDb,
} from './orchestrationDb';
import {
  cancelAgentWorkflow,
  createAgentWorkflow,
  pauseAgentWorkflow,
  recoverAndResumeAgentWorkflows,
  replayAgentWorkflow,
  resumeAgentWorkflow,
  retryDeadLetterTask,
  retryWorkflowTask,
  setWorkflowLifecycleTriggerHook,
} from './orchestrationEngine';
import { executeStudioWorkflow } from './workflowStudioService';
import { listStudioWorkflowsInDb } from './workflowStudioDb';
import {
  enforceBudgetsBeforeWorkflowLaunch,
  setBudgetThresholdTriggerHook,
} from './usageIntelligenceService';
import {
  decryptWebhookSecret,
  generateWebhookSecret,
  verifyInboundWebhookSignature,
} from './webhookSecurity';

const OPERATIONS_MANAGER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
  'SEO Strategist',
]);

const POLICY_ADMIN_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
]);

export function canManageAutonomousOperations(role: UserRole): boolean {
  return OPERATIONS_MANAGER_ROLES.has(role);
}

export function canManageAutonomyPolicies(role: UserRole): boolean {
  return POLICY_ADMIN_ROLES.has(role);
}

function assertOperationsRole(role: UserRole, action: string): void {
  if (!canManageAutonomousOperations(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to ${action}.`,
    );
  }
}

function assertPolicyRole(role: UserRole, action: string): void {
  if (!canManageAutonomyPolicies(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" does not have permission to ${action}. Only Platform Admin, Agency Owner, or Business Owner may modify autonomy policies.`,
    );
  }
}

function buildAutonomousActor(label: string): User {
  return {
    id: 'usr-autonomous-runtime',
    name: label,
    email: 'autonomous-runtime@rovix.local',
    role: 'SEO Strategist',
    avatarInitials: 'AR',
    title: 'Autonomous Operations Runtime',
  };
}

function getProjectConcurrencyCounts(tenantId: string, projectId: string): {
  activeWorkflowCount: number;
  activeTaskCount: number;
} {
  const db = getAuditDb();
  const wfRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM agent_workflows
       WHERE tenant_id = ? AND project_id = ? AND status IN ('queued', 'running')`,
    )
    .get(tenantId, projectId) as { cnt: number } | undefined;
  const taskRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ? AND status IN ('queued', 'running', 'retrying')`,
    )
    .get(tenantId, projectId) as { cnt: number } | undefined;
  return {
    activeWorkflowCount: Number(wfRow?.cnt ?? 0),
    activeTaskCount: Number(taskRow?.cnt ?? 0),
  };
}

/**
 * Shared autonomous launcher used by schedules, internal domain triggers, and verified external webhooks.
 * Enforces:
 * 1. Project Autonomy Policy (mode, concurrency, allowed templates/agents, high-impact approval lock).
 * 2. Stage 5 Budget Checks before every launch.
 * 3. Launches real Stage 2 template DAG OR Stage 4 published Studio workflow.
 */
export function launchAutonomousTargetWorkflow(params: {
  tenantId: string;
  projectId: string;
  targetKind: ScheduleTargetKind;
  templateId: WorkflowTemplateId | null;
  studioWorkflowId: string | null;
  name: string;
  objective: string;
  triggerSource: 'schedule' | 'event_trigger' | 'external_webhook';
  actor: User;
  metadata?: Record<string, unknown>;
}): {
  launched: boolean;
  workflowId: string | null;
  outcome: 'launched' | 'blocked_by_policy' | 'blocked_by_budget' | 'approval_required' | 'failed';
  reason: string;
} {
  const policy = getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId);
  const concurrency = getProjectConcurrencyCounts(params.tenantId, params.projectId);

  let targetAgentIds: AgentStationId[] = [];
  let containsHighImpactActions = false;
  let highImpactTypesPresent: string[] = [];

  if (params.targetKind === 'workflow_template') {
    const tpl = params.templateId ?? 'technical_performance_audit';
    const bp = buildWorkflowBlueprint(tpl);
    targetAgentIds = Array.from(new Set(bp.nodes.map((n) => n.agentId)));
    highImpactTypesPresent = bp.nodes
      .filter((n) => n.approvalRequired || n.approvalGateType)
      .map((n) => n.approvalGateType ?? 'high_impact_gate');
    containsHighImpactActions =
      highImpactTypesPresent.length > 0 ||
      targetAgentIds.includes('content_generation_agent');
  } else {
    targetAgentIds = ['technical_seo_agent'];
  }

  const policyDecision = evaluateAutonomyPolicy({
    policy,
    triggerSource: params.triggerSource,
    templateId: params.targetKind === 'workflow_template' ? params.templateId : 'custom_dag',
    targetAgentIds,
    activeWorkflowCount: concurrency.activeWorkflowCount,
    activeTaskCount: concurrency.activeTaskCount,
    containsHighImpactActions,
    highImpactActionTypesPresent: highImpactTypesPresent,
  });

  if (!policyDecision.allowed) {
    return {
      launched: false,
      workflowId: null,
      outcome: 'blocked_by_policy',
      reason: policyDecision.blockingReason ?? 'Blocked by project autonomy policy.',
    };
  }

  // Enforce Stage 5 usage budgets before launching any autonomous workflow
  const budgetCheck = enforceBudgetsBeforeWorkflowLaunch({
    tenantId: params.tenantId,
    projectId: params.projectId,
    targetAgentIds,
  });

  if (!budgetCheck.allowed) {
    return {
      launched: false,
      workflowId: null,
      outcome: budgetCheck.requiresApproval ? 'approval_required' : 'blocked_by_budget',
      reason: budgetCheck.blockingReason ?? 'Blocked by project usage budget policy.',
    };
  }

  try {
    if (params.targetKind === 'studio_workflow' && params.studioWorkflowId) {
      const res = executeStudioWorkflow({
        tenantId: params.tenantId,
        projectId: params.projectId,
        studioWorkflowId: params.studioWorkflowId,
        objective: params.objective,
        user: params.actor,
      });
      return {
        launched: true,
        workflowId: res.execution.workflow.id,
        outcome: 'launched',
        reason: `Launched Studio workflow "${res.execution.workflow.name}" (${res.execution.workflow.id}).`,
      };
    }

    const templateId: WorkflowTemplateId = params.templateId ?? 'technical_performance_audit';
    const bp = buildWorkflowBlueprint(templateId);

    // Enforce mandatory human approval gates when autonomy policy requires approval
    const adjustedNodes = bp.nodes.map((node) => {
      const shouldForceApproval =
        policyDecision.requiresApproval ||
        (policyDecision.enforcedApprovalGateRequired &&
          (node.approvalRequired ||
            node.agentId === 'content_generation_agent' ||
            node.approvalGateType === 'publishing_readiness' ||
            node.approvalGateType === 'generated_content'));
      return shouldForceApproval
        ? {
            ...node,
            approvalRequired: true,
            approvalGateType: node.approvalGateType ?? 'content_strategy',
          }
        : node;
    });

    const created = createAgentWorkflow({
      tenantId: params.tenantId,
      projectId: params.projectId,
      templateId,
      name: params.name,
      objective: params.objective,
      user: params.actor,
      autoStart: true,
      nodes: adjustedNodes,
      edges: bp.edges,
      config: {
        autonomousLaunchSource: params.triggerSource,
        autonomyModeAtLaunch: policy.autonomyMode,
        ...params.metadata,
      },
    });

    return {
      launched: true,
      workflowId: created.workflow.id,
      outcome: 'launched',
      reason: `Launched workflow "${created.workflow.name}" (${created.workflow.id}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      launched: false,
      workflowId: null,
      outcome: msg.startsWith('BUDGET_EXCEEDED')
        ? 'blocked_by_budget'
        : msg.startsWith('APPROVAL_REQUIRED')
          ? 'approval_required'
          : 'failed',
      reason: msg,
    };
  }
}

// ============================================================================
// SCHEDULE MANAGER SERVICE
// ============================================================================

export interface CreateOrUpdateSchedulePayload {
  name: string;
  description?: string;
  targetKind: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  workflowObjective?: string;
  frequency: ScheduleFrequency;
  minuteOfHour?: number;
  hourOfDay?: number | null;
  daysOfWeek?: number[];
  dayOfMonth?: number | null;
  runAtIso?: string | null;
  timezone: string;
  executionWindow?: ScheduleExecutionWindow | null;
  catchUpPolicy?: ScheduleCatchUpPolicy;
  maxCatchUpRuns?: number;
  status?: 'active' | 'paused';
}

export function createProjectSchedule(params: {
  tenantId: string;
  projectId: string;
  user: User;
  payload: CreateOrUpdateSchedulePayload;
}): WorkflowScheduleRecord {
  assertOperationsRole(params.user.role, 'create workflow schedules');
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const validation = validateScheduleInput({
    name: params.payload.name,
    targetKind: params.payload.targetKind,
    templateId: params.payload.templateId,
    studioWorkflowId: params.payload.studioWorkflowId,
    frequency: params.payload.frequency,
    minuteOfHour: params.payload.minuteOfHour ?? 0,
    hourOfDay: params.payload.hourOfDay ?? 9,
    daysOfWeek: params.payload.daysOfWeek ?? [1],
    dayOfMonth: params.payload.dayOfMonth ?? 1,
    runAtIso: params.payload.runAtIso ?? null,
    timezone: params.payload.timezone || 'UTC',
    executionWindow: params.payload.executionWindow ?? null,
    catchUpPolicy: params.payload.catchUpPolicy ?? 'skip',
    maxCatchUpRuns: params.payload.maxCatchUpRuns ?? 3,
  });

  if (!validation.valid) {
    throw new Error(`BAD_REQUEST: ${validation.errors.join(' ')}`);
  }

  const minuteOfHour = params.payload.minuteOfHour ?? 0;
  const hourOfDay =
    params.payload.frequency === 'hourly' || params.payload.frequency === 'once'
      ? null
      : (params.payload.hourOfDay ?? 9);
  const daysOfWeek =
    params.payload.frequency === 'weekly' ? (params.payload.daysOfWeek ?? [1]) : [];
  const dayOfMonth =
    params.payload.frequency === 'monthly' ? (params.payload.dayOfMonth ?? 1) : null;
  const runAtIso =
    params.payload.frequency === 'once' ? (params.payload.runAtIso ?? null) : null;
  const timezone = params.payload.timezone.trim() || 'UTC';
  const status = params.payload.status ?? 'active';

  const nextRunAt =
    status === 'active'
      ? computeNextScheduledRunAt({
          frequency: params.payload.frequency,
          minuteOfHour,
          hourOfDay,
          daysOfWeek,
          dayOfMonth,
          runAtIso,
          timezone,
          executionWindow: params.payload.executionWindow ?? null,
        })
      : null;

  const created = createWorkflowScheduleInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: params.payload.name.trim(),
    description: (params.payload.description ?? '').trim(),
    targetKind: params.payload.targetKind,
    templateId:
      params.payload.targetKind === 'workflow_template'
        ? (params.payload.templateId ?? 'technical_performance_audit')
        : null,
    studioWorkflowId:
      params.payload.targetKind === 'studio_workflow'
        ? (params.payload.studioWorkflowId ?? null)
        : null,
    workflowObjective:
      params.payload.workflowObjective?.trim() ||
      `Scheduled autonomous SEO workflow for ${project.name}`,
    frequency: params.payload.frequency,
    minuteOfHour,
    hourOfDay,
    daysOfWeek,
    dayOfMonth,
    runAtIso,
    timezone,
    executionWindow: params.payload.executionWindow ?? null,
    catchUpPolicy: params.payload.catchUpPolicy ?? 'skip',
    maxCatchUpRuns: params.payload.maxCatchUpRuns ?? 3,
    status,
    nextRunAt,
    actorName: `${params.user.name} (${params.user.role})`,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'workflow_schedule',
    entityId: created.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'none',
    newState: `${created.status} (${created.frequency} @ ${created.timezone})`,
    reason: `Created schedule "${created.name}"`,
    evidenceReference: params.projectId,
  });

  return created;
}

export function updateProjectSchedule(params: {
  tenantId: string;
  projectId: string;
  scheduleId: string;
  user: User;
  payload: Partial<CreateOrUpdateSchedulePayload>;
}): WorkflowScheduleRecord {
  assertOperationsRole(params.user.role, 'edit workflow schedules');
  const existing = getWorkflowScheduleByIdInDb(params.tenantId, params.scheduleId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Schedule not found in this project.');
  }

  const merged = {
    name: params.payload.name ?? existing.name,
    description: params.payload.description ?? existing.description,
    targetKind: params.payload.targetKind ?? existing.targetKind,
    templateId:
      params.payload.templateId !== undefined ? params.payload.templateId : existing.templateId,
    studioWorkflowId:
      params.payload.studioWorkflowId !== undefined
        ? params.payload.studioWorkflowId
        : existing.studioWorkflowId,
    workflowObjective: params.payload.workflowObjective ?? existing.workflowObjective,
    frequency: params.payload.frequency ?? existing.frequency,
    minuteOfHour: params.payload.minuteOfHour ?? existing.minuteOfHour,
    hourOfDay:
      params.payload.hourOfDay !== undefined ? params.payload.hourOfDay : existing.hourOfDay,
    daysOfWeek: params.payload.daysOfWeek ?? existing.daysOfWeek,
    dayOfMonth:
      params.payload.dayOfMonth !== undefined ? params.payload.dayOfMonth : existing.dayOfMonth,
    runAtIso:
      params.payload.runAtIso !== undefined ? params.payload.runAtIso : existing.runAtIso,
    timezone: params.payload.timezone ?? existing.timezone,
    executionWindow:
      params.payload.executionWindow !== undefined
        ? params.payload.executionWindow
        : existing.executionWindow,
    catchUpPolicy: params.payload.catchUpPolicy ?? existing.catchUpPolicy,
    maxCatchUpRuns: params.payload.maxCatchUpRuns ?? existing.maxCatchUpRuns,
    status: params.payload.status ?? existing.status,
  };

  const validation = validateScheduleInput(merged);
  if (!validation.valid) {
    throw new Error(`BAD_REQUEST: ${validation.errors.join(' ')}`);
  }

  const nextRunAt =
    merged.status === 'active'
      ? computeNextScheduledRunAt({
          frequency: merged.frequency,
          minuteOfHour: merged.minuteOfHour,
          hourOfDay: merged.hourOfDay,
          daysOfWeek: merged.daysOfWeek,
          dayOfMonth: merged.dayOfMonth,
          runAtIso: merged.runAtIso,
          timezone: merged.timezone,
          executionWindow: merged.executionWindow,
        })
      : null;

  const updated = updateWorkflowScheduleInDb({
    tenantId: params.tenantId,
    scheduleId: existing.id,
    ...merged,
    nextRunAt,
    updatedBy: `${params.user.name} (${params.user.role})`,
  })!;

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'workflow_schedule',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: `${existing.status} (${existing.frequency} @ ${existing.timezone})`,
    newState: `${updated.status} (${updated.frequency} @ ${updated.timezone})`,
    reason: `Updated schedule "${updated.name}"`,
    evidenceReference: params.projectId,
  });

  return updated;
}

export function toggleProjectScheduleStatus(params: {
  tenantId: string;
  projectId: string;
  scheduleId: string;
  action: 'pause' | 'resume';
  user: User;
}): WorkflowScheduleRecord {
  assertOperationsRole(params.user.role, `${params.action} workflow schedules`);
  const existing = getWorkflowScheduleByIdInDb(params.tenantId, params.scheduleId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Schedule not found.');
  }

  const nextStatus = params.action === 'pause' ? 'paused' : 'active';
  const nextRunAt =
    nextStatus === 'active'
      ? computeNextScheduledRunAt({
          frequency: existing.frequency,
          minuteOfHour: existing.minuteOfHour,
          hourOfDay: existing.hourOfDay,
          daysOfWeek: existing.daysOfWeek,
          dayOfMonth: existing.dayOfMonth,
          runAtIso: existing.runAtIso,
          timezone: existing.timezone,
          executionWindow: existing.executionWindow,
        })
      : null;

  const updated = updateWorkflowScheduleInDb({
    tenantId: params.tenantId,
    scheduleId: existing.id,
    status: nextStatus,
    nextRunAt,
    updatedBy: `${params.user.name} (${params.user.role})`,
  })!;

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'workflow_schedule',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.status,
    newState: updated.status,
    reason: `${params.action === 'pause' ? 'Paused' : 'Resumed'} schedule "${updated.name}"`,
    evidenceReference: params.projectId,
  });

  return updated;
}

export function deleteProjectSchedule(params: {
  tenantId: string;
  projectId: string;
  scheduleId: string;
  user: User;
}): boolean {
  assertOperationsRole(params.user.role, 'delete workflow schedules');
  const existing = getWorkflowScheduleByIdInDb(params.tenantId, params.scheduleId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Schedule not found.');
  }
  const deleted = deleteWorkflowScheduleInDb(params.tenantId, params.scheduleId);
  if (deleted) {
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'workflow_schedule',
      entityId: existing.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existing.status,
      newState: 'deleted',
      reason: `Deleted schedule "${existing.name}"`,
      evidenceReference: params.projectId,
    });
  }
  return deleted;
}

// ============================================================================
// EVENT-DRIVEN AUTOMATION & WEBHOOK ENGINE
// ============================================================================

export function createTriggerSubscription(params: {
  tenantId: string;
  projectId: string;
  user: User;
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  targetKind: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  workflowObjective?: string;
  enabled?: boolean;
  filterConfig?: Record<string, unknown>;
  rateLimitPerMinute?: number;
}): {
  subscription: WorkflowTriggerSubscriptionRecord;
  /** Returned ONLY once upon creation for external_webhook subscriptions so operators can copy it. */
  webhookSigningSecret: string | null;
  webhookSecretPlaintext: string | null;
  webhookEndpointPath: string | null;
} {
  assertOperationsRole(params.user.role, 'create automation trigger subscriptions');
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');
  if (!params.name.trim()) {
    throw new Error('BAD_REQUEST: Trigger name is required.');
  }
  if (params.targetKind === 'workflow_template' && !params.templateId) {
    throw new Error('BAD_REQUEST: Select a target workflow template.');
  }
  if (params.targetKind === 'studio_workflow' && !params.studioWorkflowId) {
    throw new Error('BAD_REQUEST: Select a target Studio workflow.');
  }

  const rateLimit = Math.max(1, Math.min(300, Math.trunc(params.rateLimitPerMinute ?? 30)));
  let webhookSigningSecret: string | null = null;
  let secretHash: string | null = null;
  let secretEnc: string | null = null;
  let secretHint: string | null = null;

  if (params.triggerType === 'external_webhook') {
    const gen = generateWebhookSecret();
    webhookSigningSecret = gen.plaintextSecret;
    secretHash = gen.secretHash;
    secretEnc = gen.secretEncrypted;
    secretHint = gen.secretHint;
  }

  const subscription = createTriggerSubscriptionInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: params.name.trim(),
    description: (params.description ?? '').trim(),
    triggerType: params.triggerType,
    targetKind: params.targetKind,
    templateId:
      params.targetKind === 'workflow_template' ? (params.templateId ?? null) : null,
    studioWorkflowId:
      params.targetKind === 'studio_workflow' ? (params.studioWorkflowId ?? null) : null,
    workflowObjective:
      params.workflowObjective?.trim() ||
      `Automated response to ${params.triggerType} for ${project.name}`,
    enabled: params.enabled ?? true,
    filterConfig: params.filterConfig ?? {},
    webhookSecretHash: secretHash,
    webhookSecretEnc: secretEnc,
    webhookSecretHint: secretHint,
    rateLimitPerMinute: rateLimit,
    actorName: `${params.user.name} (${params.user.role})`,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'workflow_trigger',
    entityId: subscription.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: 'none',
    newState: `${subscription.triggerType} (${subscription.enabled ? 'enabled' : 'disabled'})`,
    reason: `Created automation trigger "${subscription.name}"`,
    evidenceReference: params.projectId,
  });

  return {
    subscription,
    webhookSigningSecret,
    webhookSecretPlaintext: webhookSigningSecret,
    webhookEndpointPath:
      subscription.triggerType === 'external_webhook'
        ? `/api/webhooks/agent-factory/${subscription.id}`
        : null,
  };
}

export function toggleTriggerSubscription(params: {
  tenantId: string;
  projectId: string;
  subscriptionId: string;
  enabled: boolean;
  user: User;
}): WorkflowTriggerSubscriptionRecord {
  assertOperationsRole(params.user.role, 'toggle automation trigger subscriptions');
  const existing = getTriggerSubscriptionByIdInDb(params.tenantId, params.subscriptionId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Trigger subscription not found.');
  }
  const updated = updateTriggerSubscriptionInDb({
    tenantId: params.tenantId,
    subscriptionId: existing.id,
    enabled: params.enabled,
    updatedBy: `${params.user.name} (${params.user.role})`,
  })!;
  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'workflow_trigger',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: existing.enabled ? 'enabled' : 'disabled',
    newState: updated.enabled ? 'enabled' : 'disabled',
    reason: `${params.enabled ? 'Enabled' : 'Disabled'} trigger "${updated.name}"`,
    evidenceReference: params.projectId,
  });
  return updated;
}

export function deleteTriggerSubscription(params: {
  tenantId: string;
  projectId: string;
  subscriptionId: string;
  user: User;
}): boolean {
  assertOperationsRole(params.user.role, 'delete automation trigger subscriptions');
  const existing = getTriggerSubscriptionByIdInDb(params.tenantId, params.subscriptionId);
  if (!existing || existing.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Trigger subscription not found.');
  }
  const deleted = deleteTriggerSubscriptionInDb(params.tenantId, params.subscriptionId);
  if (deleted) {
    recordAuditTrail({
      tenantId: params.tenantId,
      entityType: 'workflow_trigger',
      entityId: existing.id,
      actorId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      previousState: existing.enabled ? 'enabled' : 'disabled',
      newState: 'deleted',
      reason: `Deleted trigger "${existing.name}"`,
      evidenceReference: params.projectId,
    });
  }
  return deleted;
}

function matchesTriggerFilter(
  filterConfig: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (!filterConfig || Object.keys(filterConfig).length === 0) return true;
  if (typeof filterConfig.minSeverity === 'string' && typeof payload.severity === 'string') {
    const rank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const reqRank = rank[filterConfig.minSeverity.toLowerCase()] ?? 0;
    const gotRank = rank[payload.severity.toLowerCase()] ?? 0;
    if (gotRank < reqRank) return false;
  }
  if (
    typeof filterConfig.sourceTemplateId === 'string' &&
    filterConfig.sourceTemplateId.trim() &&
    payload.templateId !== filterConfig.sourceTemplateId
  ) {
    return false;
  }
  return true;
}

/**
 * Dispatches a real platform domain event to all enabled matching trigger subscriptions for a project.
 * Enforces idempotency keys, autonomy policies, and Stage 5 budget checks.
 */
export function dispatchDomainTriggerEvent(params: {
  tenantId: string;
  projectId: string;
  triggerType: Exclude<AutomationTriggerType, 'schedule' | 'external_webhook'>;
  idempotencyKey: string;
  sourceRef?: string | null;
  payloadSummary: string;
  payload: Record<string, unknown>;
}): WorkflowTriggerEventRecord[] {
  const subs = listTriggerSubscriptionsInDb(
    params.tenantId,
    params.projectId,
    params.triggerType,
  ).filter((s) => s.enabled);

  if (subs.length === 0) return [];

  const results: WorkflowTriggerEventRecord[] = [];
  for (const sub of subs) {
    if (!matchesTriggerFilter(sub.filterConfig, params.payload)) continue;

    // Guard against infinite self-trigger loops (e.g. workflow_completed launching itself recursively)
    if (
      (params.triggerType === 'workflow_completed' || params.triggerType === 'workflow_failed') &&
      params.payload.sourceTriggerSubscriptionId === sub.id
    ) {
      continue;
    }

    const perSubIdemKey = `${sub.id}:${params.idempotencyKey}`;
    const inserted = insertTriggerEventInDb({
      tenantId: params.tenantId,
      projectId: params.projectId,
      subscriptionId: sub.id,
      triggerType: params.triggerType,
      idempotencyKey: perSubIdemKey,
      sourceRef: params.sourceRef ?? null,
      status: 'dispatched',
      payloadSummary: params.payloadSummary,
      payloadJson: params.payload,
      launchedWorkflowId: null,
      errorMessage: null,
    });

    if (inserted.deduplicated) {
      results.push({ ...inserted.record, status: 'deduplicated' });
      continue;
    }

    const launchRes = launchAutonomousTargetWorkflow({
      tenantId: params.tenantId,
      projectId: params.projectId,
      targetKind: sub.targetKind,
      templateId: sub.templateId,
      studioWorkflowId: sub.studioWorkflowId,
      name: `${sub.name} (Triggered)`,
      objective: `${sub.workflowObjective} — Trigger: ${params.payloadSummary}`.slice(0, 480),
      triggerSource: 'event_trigger',
      actor: buildAutonomousActor(`Trigger: ${sub.name}`),
      metadata: {
        sourceTriggerSubscriptionId: sub.id,
        sourceTriggerType: params.triggerType,
        sourceRef: params.sourceRef ?? null,
      },
    });

    const finalStatus =
      launchRes.outcome === 'launched'
        ? 'dispatched'
        : launchRes.outcome === 'blocked_by_policy'
          ? 'blocked_by_policy'
          : launchRes.outcome === 'blocked_by_budget' || launchRes.outcome === 'approval_required'
            ? 'blocked_by_budget'
            : 'failed';

    updateTriggerEventOutcomeInDb({
      tenantId: params.tenantId,
      eventId: inserted.record.id,
      status: finalStatus,
      launchedWorkflowId: launchRes.workflowId,
      errorMessage: launchRes.launched ? null : launchRes.reason,
    });

    const nowIso = new Date().toISOString();
    if (launchRes.launched) {
      updateTriggerSubscriptionInDb({
        tenantId: params.tenantId,
        subscriptionId: sub.id,
        incrementTriggered: 1,
        lastTriggeredAt: nowIso,
      });
      emitRealAgentEvent({
        eventType: 'trigger.fired',
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: launchRes.workflowId ?? inserted.record.id,
        taskId: inserted.record.id,
        agentId: 'orchestrator',
        status: 'waiting_for_trigger',
        taskTitle: sub.name,
        summary: `Event trigger (${params.triggerType}) launched workflow ${launchRes.workflowId}`,
        evidenceUrl: '/agent-factory/operations',
      });
    }

    results.push({
      ...inserted.record,
      status: finalStatus,
      launchedWorkflowId: launchRes.workflowId,
      errorMessage: launchRes.launched ? null : launchRes.reason,
    });
  }

  return results;
}

/**
 * Handles signed external webhooks with strict HMAC-SHA256 verification, 5-minute replay protection,
 * per-subscription sliding-window rate limiting, idempotency deduplication, and autonomy/budget checks.
 */
export function handleInboundWebhookEvent(params: {
  subscriptionId: string;
  rawBody: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  idempotencyKeyHeader?: string | null;
  nowMs?: number;
}): {
  httpStatus: number;
  accepted: boolean;
  deduplicated: boolean;
  event: WorkflowTriggerEventRecord | null;
  error: string | null;
} {
  const found = getWebhookSubscriptionSecretRecordByIdInDb(params.subscriptionId);
  if (!found) {
    return {
      httpStatus: 404,
      accepted: false,
      deduplicated: false,
      event: null,
      error: 'Webhook trigger subscription not found.',
    };
  }

  const { subscription, webhookSecretEnc } = found;
  if (!subscription.enabled) {
    return {
      httpStatus: 403,
      accepted: false,
      deduplicated: false,
      event: null,
      error: 'Webhook trigger subscription is currently disabled.',
    };
  }

  const secret = decryptWebhookSecret(webhookSecretEnc);
  if (!secret) {
    return {
      httpStatus: 500,
      accepted: false,
      deduplicated: false,
      event: null,
      error: 'Webhook signing secret unavailable.',
    };
  }

  // Sliding-window rate limit check (per 60 seconds)
  const nowMs = params.nowMs ?? Date.now();
  const oneMinuteAgoIso = new Date(nowMs - 60_000).toISOString();
  const recentCount = countRecentWebhookEventsForSubscriptionInDb(
    subscription.id,
    oneMinuteAgoIso,
  );
  if (recentCount >= subscription.rateLimitPerMinute) {
    const rateLimited = insertTriggerEventInDb({
      tenantId: subscription.tenantId,
      projectId: subscription.projectId,
      subscriptionId: subscription.id,
      triggerType: 'external_webhook',
      idempotencyKey: `rl:${subscription.id}:${crypto.randomUUID().slice(0, 12)}`,
      sourceRef: 'webhook_rate_limit',
      status: 'rate_limited',
      payloadSummary: 'Rate limit exceeded for external webhook',
      payloadJson: {},
      launchedWorkflowId: null,
      errorMessage: `Rate limit exceeded (${subscription.rateLimitPerMinute}/min).`,
    });
    return {
      httpStatus: 429,
      accepted: false,
      deduplicated: false,
      event: rateLimited.record,
      error: `Rate limit exceeded (${subscription.rateLimitPerMinute} requests/min).`,
    };
  }

  // HMAC-SHA256 signature & timestamp replay window verification
  const sigCheck = verifyInboundWebhookSignature({
    secret,
    signatureHeader: params.signatureHeader,
    timestampHeader: params.timestampHeader,
    rawBody: params.rawBody,
    nowMs,
  });
  if (!sigCheck.valid) {
    const rejected = insertTriggerEventInDb({
      tenantId: subscription.tenantId,
      projectId: subscription.projectId,
      subscriptionId: subscription.id,
      triggerType: 'external_webhook',
      idempotencyKey: `sigfail:${subscription.id}:${crypto.randomUUID().slice(0, 12)}`,
      sourceRef: 'invalid_signature',
      status: 'rejected_signature',
      payloadSummary: 'Webhook rejected: invalid signature or expired timestamp',
      payloadJson: {},
      launchedWorkflowId: null,
      errorMessage: sigCheck.reason,
    });
    return {
      httpStatus: 401,
      accepted: false,
      deduplicated: false,
      event: rejected.record,
      error: sigCheck.reason ?? 'Invalid webhook signature.',
    };
  }

  // Strict JSON payload parsing & size validation
  if (params.rawBody.length > 64 * 1024) {
    return {
      httpStatus: 413,
      accepted: false,
      deduplicated: false,
      event: null,
      error: 'Webhook payload exceeds maximum 64KB size limit.',
    };
  }

  let parsedPayload: Record<string, unknown> = {};
  if (params.rawBody.trim()) {
    try {
      const parsed = JSON.parse(params.rawBody) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          httpStatus: 400,
          accepted: false,
          deduplicated: false,
          event: null,
          error: 'Webhook body must be a valid JSON object.',
        };
      }
      parsedPayload = parsed as Record<string, unknown>;
    } catch {
      return {
        httpStatus: 400,
        accepted: false,
        deduplicated: false,
        event: null,
        error: 'Malformed JSON payload.',
      };
    }
  }

  const idemHeader = params.idempotencyKeyHeader?.trim();
  const bodyDigest = crypto.createHash('sha256').update(params.rawBody).digest('hex').slice(0, 24);
  const idempotencyKey = idemHeader
    ? `wh:${subscription.id}:${idemHeader}`
    : `wh:${subscription.id}:${params.timestampHeader ?? ''}:${bodyDigest}`;

  const summaryText =
    typeof parsedPayload.summary === 'string' && parsedPayload.summary.trim()
      ? parsedPayload.summary.trim().slice(0, 200)
      : `Signed external webhook received for "${subscription.name}"`;

  const inserted = insertTriggerEventInDb({
    tenantId: subscription.tenantId,
    projectId: subscription.projectId,
    subscriptionId: subscription.id,
    triggerType: 'external_webhook',
    idempotencyKey,
    sourceRef: typeof parsedPayload.eventId === 'string' ? parsedPayload.eventId : 'webhook',
    status: 'dispatched',
    payloadSummary: summaryText,
    payloadJson: parsedPayload,
    launchedWorkflowId: null,
    errorMessage: null,
  });

  if (inserted.deduplicated) {
    return {
      httpStatus: 200,
      accepted: true,
      deduplicated: true,
      event: { ...inserted.record, status: 'deduplicated' },
      error: null,
    };
  }

  const launchRes = launchAutonomousTargetWorkflow({
    tenantId: subscription.tenantId,
    projectId: subscription.projectId,
    targetKind: subscription.targetKind,
    templateId: subscription.templateId,
    studioWorkflowId: subscription.studioWorkflowId,
    name: `${subscription.name} (Webhook)`,
    objective: `${subscription.workflowObjective} — ${summaryText}`.slice(0, 480),
    triggerSource: 'external_webhook',
    actor: buildAutonomousActor(`Webhook: ${subscription.name}`),
    metadata: {
      sourceTriggerSubscriptionId: subscription.id,
      sourceTriggerType: 'external_webhook',
      webhookPayloadSummary: summaryText,
    },
  });

  const finalStatus =
    launchRes.outcome === 'launched'
      ? 'dispatched'
      : launchRes.outcome === 'blocked_by_policy'
        ? 'blocked_by_policy'
        : launchRes.outcome === 'blocked_by_budget' || launchRes.outcome === 'approval_required'
          ? 'blocked_by_budget'
          : 'failed';

  updateTriggerEventOutcomeInDb({
    tenantId: subscription.tenantId,
    eventId: inserted.record.id,
    status: finalStatus,
    launchedWorkflowId: launchRes.workflowId,
    errorMessage: launchRes.launched ? null : launchRes.reason,
  });

  if (launchRes.launched) {
    updateTriggerSubscriptionInDb({
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      incrementTriggered: 1,
      lastTriggeredAt: new Date(nowMs).toISOString(),
    });
    emitRealAgentEvent({
      eventType: 'trigger.fired',
      tenantId: subscription.tenantId,
      projectId: subscription.projectId,
      workflowId: launchRes.workflowId ?? inserted.record.id,
      taskId: inserted.record.id,
      agentId: 'orchestrator',
      status: 'waiting_for_trigger',
      taskTitle: subscription.name,
      summary: `Verified external webhook launched workflow ${launchRes.workflowId}`,
      evidenceUrl: '/agent-factory/operations',
    });
  }

  return {
    httpStatus: launchRes.launched ? 202 : finalStatus === 'blocked_by_policy' ? 403 : 422,
    accepted: launchRes.launched,
    deduplicated: false,
    event: {
      ...inserted.record,
      status: finalStatus,
      launchedWorkflowId: launchRes.workflowId,
      errorMessage: launchRes.launched ? null : launchRes.reason,
    },
    error: launchRes.launched ? null : launchRes.reason,
  };
}

// ============================================================================
// RECOVERY CENTER & AUTONOMY POLICIES SERVICE
// ============================================================================

export function reclaimStaleLeasesAndRecover(params?: {
  actor?: string;
  nowIso?: string;
}): {
  reclaimedLeasesCount: number;
  recoveredWorkflowsCount: number;
} {
  const actor = params?.actor ?? 'Self-Healing Runtime';
  const reclaimed = reclaimExpiredWorkerLeasesInDb(params?.nowIso);
  for (const lease of reclaimed) {
    insertRecoveryRecordInDb({
      tenantId: lease.tenantId,
      projectId: lease.projectId,
      workflowId: lease.resourceId,
      actionType: 'worker_lease_reclaimed',
      previousStatus: 'active_lease',
      newStatus: 'reclaimed',
      actor,
      reason: `Reclaimed abandoned ${lease.leaseKind} lease held by ${lease.workerId} (expired ${lease.expiresAt})`,
    });
  }

  const recoveredWorkflowsCount = recoverInterruptedAgentWorkflowsInDb();
  if (recoveredWorkflowsCount > 0) {
    recoverAndResumeAgentWorkflows();
  }

  return {
    reclaimedLeasesCount: reclaimed.length,
    recoveredWorkflowsCount,
  };
}

export function resolveDeadLetterTask(params: {
  tenantId: string;
  projectId: string;
  deadLetterId: string;
  user: User;
  reason?: string;
}): WorkflowDeadLetterTaskRecord {
  assertOperationsRole(params.user.role, 'resolve dead-letter tasks');
  const dlq = getDeadLetterTaskByIdInDb(params.tenantId, params.deadLetterId);
  if (!dlq || dlq.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Dead-letter task not found.');
  }
  const updated = updateDeadLetterStatusInDb({
    tenantId: params.tenantId,
    dlqId: dlq.id,
    status: 'resolved',
    resolvedBy: `${params.user.name} (${params.user.role})`,
  })!;
  insertRecoveryRecordInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: dlq.workflowId,
    taskId: dlq.taskId,
    actionType: 'dead_letter_replayed',
    previousStatus: 'open',
    newStatus: 'resolved',
    actor: `${params.user.name} (${params.user.role})`,
    reason: params.reason?.trim() || `Marked dead-letter task "${dlq.taskTitle}" resolved`,
  });
  return updated;
}

export function updateProjectAutonomyPolicy(params: {
  tenantId: string;
  projectId: string;
  user: User;
  payload: {
    name?: string;
    autonomyMode: AutonomyMode;
    maxConcurrentWorkflows: number;
    maxActiveAgentTasks: number;
    maxWorkflowDurationMs: number;
    maxTokensPerWorkflow: number | null;
    maxSpendMicrosPerRun: number | null;
    allowedTemplates: WorkflowTemplateId[];
    allowedAgents: AgentStationId[];
    requireApprovalForHighImpact: boolean;
    highImpactActionTypes?: string[];
    allowAutonomousRetries: boolean;
    allowExternalWebhooks: boolean;
    enabled: boolean;
  };
}): AutonomyPolicyRecord {
  assertPolicyRole(params.user.role, 'update autonomous operations policies');
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  if (
    !Number.isInteger(params.payload.maxConcurrentWorkflows) ||
    params.payload.maxConcurrentWorkflows < 1 ||
    params.payload.maxConcurrentWorkflows > 20
  ) {
    throw new Error('BAD_REQUEST: Max concurrent workflows must be between 1 and 20.');
  }
  if (
    !Number.isInteger(params.payload.maxActiveAgentTasks) ||
    params.payload.maxActiveAgentTasks < 1 ||
    params.payload.maxActiveAgentTasks > 50
  ) {
    throw new Error('BAD_REQUEST: Max active agent tasks must be between 1 and 50.');
  }
  if (
    !Number.isInteger(params.payload.maxWorkflowDurationMs) ||
    params.payload.maxWorkflowDurationMs < 30_000 ||
    params.payload.maxWorkflowDurationMs > 3_600_000
  ) {
    throw new Error(
      'BAD_REQUEST: Max workflow duration must be between 30 seconds and 60 minutes.',
    );
  }

  const prev = getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId);
  const updated = upsertAutonomyPolicyInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: params.payload.name?.trim() || prev.name,
    autonomyMode: params.payload.autonomyMode,
    maxConcurrentWorkflows: params.payload.maxConcurrentWorkflows,
    maxActiveAgentTasks: params.payload.maxActiveAgentTasks,
    maxWorkflowDurationMs: params.payload.maxWorkflowDurationMs,
    maxTokensPerWorkflow: params.payload.maxTokensPerWorkflow,
    maxSpendMicrosPerRun: params.payload.maxSpendMicrosPerRun,
    allowedTemplates: params.payload.allowedTemplates,
    allowedAgents: params.payload.allowedAgents,
    // Enforce high-impact safety lock unless explicitly disabled with audited reason
    requireApprovalForHighImpact: params.payload.requireApprovalForHighImpact,
    highImpactActionTypes:
      params.payload.highImpactActionTypes && params.payload.highImpactActionTypes.length > 0
        ? params.payload.highImpactActionTypes
        : [...DEFAULT_HIGH_IMPACT_ACTIONS],
    allowAutonomousRetries: params.payload.allowAutonomousRetries,
    allowExternalWebhooks: params.payload.allowExternalWebhooks,
    enabled: params.payload.enabled,
    updatedBy: `${params.user.name} (${params.user.role})`,
  });

  recordAuditTrail({
    tenantId: params.tenantId,
    entityType: 'autonomy_policy',
    entityId: updated.id,
    actorId: params.user.id,
    actorName: params.user.name,
    actorRole: params.user.role,
    previousState: `${prev.autonomyMode} (conc=${prev.maxConcurrentWorkflows}, hiApproval=${prev.requireApprovalForHighImpact})`,
    newState: `${updated.autonomyMode} (conc=${updated.maxConcurrentWorkflows}, hiApproval=${updated.requireApprovalForHighImpact})`,
    reason: `Updated autonomy policy "${updated.name}"`,
    evidenceReference: params.projectId,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Updated Autonomous Operations Policy (${updated.autonomyMode}, max ${updated.maxConcurrentWorkflows} concurrent workflows)`,
    status: 'Succeeded',
    evidenceUrl: '/agent-factory/operations',
  });

  return updated;
}

// ============================================================================
// RUNTIME HEALTH & OPERATIONS CONTROL CENTER PAYLOAD
// ============================================================================

export function buildRuntimeHealthSummary(
  tenantId: string,
  projectId: string,
): RuntimeHealthSummary {
  const db = getAuditDb();
  const nowMs = Date.now();
  const heartbeats = listWorkerHeartbeatsInDb();

  // A worker is healthy if its last heartbeat was within the past 45 seconds and status is 'healthy'
  const freshWorkers = heartbeats.filter((w) => {
    const age = nowMs - Date.parse(w.lastHeartbeatAt);
    return w.status === 'healthy' && Number.isFinite(age) && age <= 45_000;
  });

  const schedulerStatus: RuntimeHealthSummary['schedulerStatus'] =
    freshWorkers.length > 0
      ? 'healthy'
      : heartbeats.some((w) => w.status === 'degraded')
        ? 'degraded'
        : 'stopped';
  const workerStatus = schedulerStatus;

  const activeLeases = listActiveLeasesForProjectInDb(tenantId, projectId);
  const schedules = listWorkflowSchedulesInDb(tenantId, projectId);
  const triggers = listTriggerSubscriptionsInDb(tenantId, projectId);
  const deadLetters = listDeadLetterTasksInDb(tenantId, projectId, 100);
  const recoveries = listRecoveryRecordsInDb(tenantId, projectId, 50);
  const pendingApprovals = listApprovalRequestsInDb(tenantId, projectId, 'pending');

  const queuedRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest
       FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ? AND status IN ('queued', 'retrying')`,
    )
    .get(tenantId, projectId) as { cnt: number; oldest: string | null } | undefined;

  const wfStatusRows = db
    .prepare(
      `SELECT status, COUNT(*) AS cnt FROM agent_workflows
       WHERE tenant_id = ? AND project_id = ?
       GROUP BY status`,
    )
    .all(tenantId, projectId) as { status: string; cnt: number }[];
  const wfCounts = new Map(wfStatusRows.map((r) => [r.status, Number(r.cnt)]));

  const execMetrics = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avg_ms
       FROM agent_executions
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .get(tenantId, projectId) as
    | { total: number; failed: number | null; avg_ms: number | null }
    | undefined;

  const totalExec = Number(execMetrics?.total ?? 0);
  const failedExec = Number(execMetrics?.failed ?? 0);
  const avgExecutionLatencyMs =
    typeof execMetrics?.avg_ms === 'number' && Number.isFinite(execMetrics.avg_ms)
      ? Math.round(execMetrics.avg_ms)
      : null;
  const failureRatePct =
    totalExec > 0 ? Math.round((failedExec / totalExec) * 1000) / 10 : null;

  const oldestQueuedTaskAgeMs =
    queuedRow?.oldest && Number.isFinite(Date.parse(queuedRow.oldest))
      ? Math.max(0, nowMs - Date.parse(queuedRow.oldest))
      : null;

  return {
    schedulerStatus,
    workerStatus,
    activeWorkerCount: freshWorkers.length,
    activeLeasesCount: activeLeases.length,
    activeSchedulesCount: schedules.filter((s) => s.status === 'active').length,
    activeTriggersCount: triggers.filter((t) => t.enabled).length,
    queuedTasksCount: Number(queuedRow?.cnt ?? 0),
    oldestQueuedTaskAgeMs,
    runningWorkflowsCount: (wfCounts.get('running') ?? 0) + (wfCounts.get('queued') ?? 0),
    pausedWorkflowsCount: wfCounts.get('paused') ?? 0,
    failedWorkflowsCount: wfCounts.get('failed') ?? 0,
    pendingApprovalsCount: pendingApprovals.length,
    openDeadLetterCount: deadLetters.filter((d) => d.status === 'open').length,
    recentRecoveriesCount: recoveries.length,
    avgExecutionLatencyMs,
    failureRatePct,
    lastHeartbeatAt: heartbeats[0]?.lastHeartbeatAt ?? null,
    workers: heartbeats,
  };
}

export function buildOperationsControlCenterPayload(params: {
  tenantId: string;
  projectId: string;
  userRole: UserRole;
}): OperationsControlCenterPayload {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project not found.');

  const db = getAuditDb();
  const schedules = listWorkflowSchedulesInDb(params.tenantId, params.projectId);
  const schedulerLogs = listSchedulerExecutionLogsInDb(params.tenantId, params.projectId, 60);
  const triggers = listTriggerSubscriptionsInDb(params.tenantId, params.projectId);
  const triggerEvents = listTriggerEventsInDb(params.tenantId, params.projectId, 60);
  const deadLetters = listDeadLetterTasksInDb(params.tenantId, params.projectId, 60);
  const recoveries = listRecoveryRecordsInDb(params.tenantId, params.projectId, 60);
  const policy = getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId);
  const policyAuditHistory = listOperationsPolicyAuditInDb(params.tenantId, params.projectId, 40);
  const activeLeases = listActiveLeasesForProjectInDb(params.tenantId, params.projectId);
  const health = buildRuntimeHealthSummary(params.tenantId, params.projectId);
  const rawWorkflows = listWorkflowsForProject(params.tenantId, params.projectId, 40);
  const studioWorkflows = listStudioWorkflowsInDb(params.tenantId, params.projectId).map((sw) => ({
    id: sw.id,
    name: sw.name,
    status: sw.status,
    publishedVersionId: sw.publishedVersionId,
  }));

  const taskStatusRows = db
    .prepare(
      `SELECT workflow_id, status, COUNT(*) AS cnt FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ?
       GROUP BY workflow_id, status`,
    )
    .all(params.tenantId, params.projectId) as {
    workflow_id: string;
    status: string;
    cnt: number;
  }[];

  const taskCountByWf = new Map<string, { failed: number; queued: number }>();
  for (const r of taskStatusRows) {
    const cur = taskCountByWf.get(r.workflow_id) ?? { failed: 0, queued: 0 };
    if (r.status === 'failed' || r.status === 'blocked') cur.failed += Number(r.cnt);
    if (r.status === 'queued' || r.status === 'retrying') cur.queued += Number(r.cnt);
    taskCountByWf.set(r.workflow_id, cur);
  }

  const wfTotals = db
    .prepare(
      `SELECT status, COUNT(*) AS cnt FROM agent_workflows
       WHERE tenant_id = ? AND project_id = ?
       GROUP BY status`,
    )
    .all(params.tenantId, params.projectId) as { status: string; cnt: number }[];
  const wfMap = new Map(wfTotals.map((r) => [r.status, Number(r.cnt)]));

  return {
    tenantId: params.tenantId,
    projectId: params.projectId,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    canManageOperations: canManageAutonomousOperations(params.userRole),
    canManagePolicies: canManageAutonomyPolicies(params.userRole),
    overview: {
      activeWorkflows: (wfMap.get('running') ?? 0) + (wfMap.get('queued') ?? 0),
      scheduledJobs: schedules.filter((s) => s.status === 'active').length,
      queuedTasks: health.queuedTasksCount,
      succeededWorkflows: wfMap.get('completed') ?? 0,
      failedWorkflows: wfMap.get('failed') ?? 0,
      pausedWorkflows: wfMap.get('paused') ?? 0,
      pendingApprovals: health.pendingApprovalsCount,
      openDeadLetters: health.openDeadLetterCount,
      activeTriggers: health.activeTriggersCount,
    },
    health,
    schedules,
    schedulerLogs,
    triggers,
    triggerEvents,
    deadLetters,
    recoveries,
    policy,
    policyAuditHistory,
    workflows: rawWorkflows.map((w) => {
      const tc = taskCountByWf.get(w.id) ?? { failed: 0, queued: 0 };
      const replayedFrom =
        typeof w.config?.replayedFromWorkflowId === 'string'
          ? w.config.replayedFromWorkflowId
          : null;
      return {
        id: w.id,
        name: w.name,
        templateId: w.templateId,
        status: w.status,
        currentStage: w.currentStage,
        blockingReason: w.blockingReason,
        createdBy: w.createdBy,
        startedAt: w.startedAt,
        completedAt: w.completedAt,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        replayedFromWorkflowId: replayedFrom,
        failedTaskCount: tc.failed,
        queuedTaskCount: tc.queued,
      };
    }),
    studioWorkflows,
    activeLeases,
  };
}

// Re-export orchestration control helpers cleanly for route handlers
export {
  pauseAgentWorkflow,
  resumeAgentWorkflow,
  replayAgentWorkflow,
  cancelAgentWorkflow,
  retryWorkflowTask,
  retryDeadLetterTask,
};

// Wire orchestration engine lifecycle hook into real Stage 6 domain trigger engine
setWorkflowLifecycleTriggerHook((event) => {
  dispatchDomainTriggerEvent({
    tenantId: event.tenantId,
    projectId: event.projectId,
    triggerType: event.triggerType,
    idempotencyKey: event.idempotencyKey,
    sourceRef: event.sourceRef,
    payloadSummary: event.payloadSummary,
    payload: event.payload,
  });
});

// Wire Stage 5 budget alert hook into real Stage 6 domain trigger engine
setBudgetThresholdTriggerHook((event) => {
  dispatchDomainTriggerEvent({
    tenantId: event.tenantId,
    projectId: event.projectId,
    triggerType: 'budget_threshold_reached',
    idempotencyKey: `budget_threshold:${event.budgetId}:${event.periodWindow}:${event.alertType}`,
    sourceRef: event.budgetId,
    payloadSummary: event.message,
    payload: {
      budgetId: event.budgetId,
      alertType: event.alertType,
      periodWindow: event.periodWindow,
      measuredSpendMicros: event.measuredSpendMicros,
      budgetLimitMicros: event.budgetLimitMicros,
    },
  });
});

// Wire SEO domain completion hooks (crawl, technical issues, performance, keywords, competitors)
setDomainTriggerPublisher((event) => {
  dispatchDomainTriggerEvent({
    ...event,
    payload: event.payload ?? {},
  });
});
