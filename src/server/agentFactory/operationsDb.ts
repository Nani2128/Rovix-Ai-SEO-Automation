import crypto from 'node:crypto';
import type { AgentStationId, WorkflowTemplateId } from '../../types/agentFactory';
import type {
  AutomationTriggerType,
  AutonomyMode,
  AutonomyPolicyRecord,
  ErrorClassificationKind,
  OperationsPolicyAuditEntry,
  RecoveryActionType,
  RuntimeWorkerHeartbeatRecord,
  ScheduleCatchUpPolicy,
  ScheduleExecutionWindow,
  ScheduleFrequency,
  ScheduleStatus,
  ScheduleTargetKind,
  SchedulerExecutionLogRecord,
  TriggerEventStatus,
  WorkflowDeadLetterTaskRecord,
  WorkflowRecoveryRecord,
  WorkflowScheduleRecord,
  WorkflowTriggerEventRecord,
  WorkflowTriggerSubscriptionRecord,
  WorkflowWorkerLeaseRecord,
} from '../../types/autonomousOperations';
import { DEFAULT_HIGH_IMPACT_ACTIONS } from '../../lib/autonomousOperationsEngine';
import { getAuditDb } from '../audit/db';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function runTx<T>(fn: (db: ReturnType<typeof getAuditDb>) => T): T {
  const db = getAuditDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn(db);
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapScheduleRow(r: Record<string, unknown>): WorkflowScheduleRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    targetKind: String(r.target_kind ?? 'workflow_template') as ScheduleTargetKind,
    templateId: r.template_id ? (String(r.template_id) as WorkflowTemplateId) : null,
    studioWorkflowId: r.studio_workflow_id ? String(r.studio_workflow_id) : null,
    workflowObjective: String(r.workflow_objective ?? ''),
    frequency: String(r.frequency ?? 'daily') as ScheduleFrequency,
    minuteOfHour: Number(r.minute_of_hour ?? 0),
    hourOfDay:
      r.hour_of_day === null || r.hour_of_day === undefined ? null : Number(r.hour_of_day),
    daysOfWeek: parseJson<number[]>(r.days_of_week_json, []),
    dayOfMonth:
      r.day_of_month === null || r.day_of_month === undefined ? null : Number(r.day_of_month),
    runAtIso: r.run_at_iso ? String(r.run_at_iso) : null,
    timezone: String(r.timezone ?? 'UTC'),
    executionWindow: parseJson<ScheduleExecutionWindow | null>(r.execution_window_json, null),
    catchUpPolicy: String(r.catch_up_policy ?? 'skip') as ScheduleCatchUpPolicy,
    maxCatchUpRuns: Number(r.max_catch_up_runs ?? 3),
    status: String(r.status ?? 'active') as ScheduleStatus,
    nextRunAt: r.next_run_at ? String(r.next_run_at) : null,
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    lastWorkflowId: r.last_workflow_id ? String(r.last_workflow_id) : null,
    lastRunStatus: r.last_run_status ? String(r.last_run_status) : null,
    lastError: r.last_error ? String(r.last_error) : null,
    totalRuns: Number(r.total_runs ?? 0),
    createdBy: String(r.created_by),
    updatedBy: String(r.updated_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTriggerSubscriptionRow(
  r: Record<string, unknown>,
): WorkflowTriggerSubscriptionRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    triggerType: String(r.trigger_type) as AutomationTriggerType,
    targetKind: String(r.target_kind ?? 'workflow_template') as ScheduleTargetKind,
    templateId: r.template_id ? (String(r.template_id) as WorkflowTemplateId) : null,
    studioWorkflowId: r.studio_workflow_id ? String(r.studio_workflow_id) : null,
    workflowObjective: String(r.workflow_objective ?? ''),
    enabled: Number(r.enabled ?? 1) === 1,
    filterConfig: parseJson<Record<string, unknown>>(r.filter_config_json, {}),
    webhookSecretHint: r.webhook_secret_hint ? String(r.webhook_secret_hint) : null,
    rateLimitPerMinute: Number(r.rate_limit_per_minute ?? 30),
    totalTriggered: Number(r.total_triggered ?? 0),
    lastTriggeredAt: r.last_triggered_at ? String(r.last_triggered_at) : null,
    createdBy: String(r.created_by),
    updatedBy: String(r.updated_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTriggerEventRow(r: Record<string, unknown>): WorkflowTriggerEventRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    subscriptionId: r.subscription_id ? String(r.subscription_id) : null,
    triggerType: String(r.trigger_type) as AutomationTriggerType,
    idempotencyKey: String(r.idempotency_key),
    sourceRef: r.source_ref ? String(r.source_ref) : null,
    status: String(r.status) as TriggerEventStatus,
    payloadSummary: String(r.payload_summary ?? ''),
    payloadJson: parseJson<Record<string, unknown>>(r.payload_json, {}),
    launchedWorkflowId: r.launched_workflow_id ? String(r.launched_workflow_id) : null,
    errorMessage: r.error_message ? String(r.error_message) : null,
    createdAt: String(r.created_at),
  };
}

function mapLeaseRow(r: Record<string, unknown>): WorkflowWorkerLeaseRecord {
  return {
    leaseKey: String(r.lease_key),
    leaseKind: String(r.lease_kind) as WorkflowWorkerLeaseRecord['leaseKind'],
    resourceId: String(r.resource_id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workerId: String(r.worker_id),
    acquiredAt: String(r.acquired_at),
    heartbeatAt: String(r.heartbeat_at),
    expiresAt: String(r.expires_at),
    status: String(r.status) as WorkflowWorkerLeaseRecord['status'],
  };
}

function mapRecoveryRow(r: Record<string, unknown>): WorkflowRecoveryRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    taskId: r.task_id ? String(r.task_id) : null,
    actionType: String(r.action_type) as RecoveryActionType,
    previousStatus: String(r.previous_status),
    newStatus: String(r.new_status),
    actor: String(r.actor),
    reason: String(r.reason),
    relatedWorkflowId: r.related_workflow_id ? String(r.related_workflow_id) : null,
    createdAt: String(r.created_at),
  };
}

function mapDeadLetterRow(r: Record<string, unknown>): WorkflowDeadLetterTaskRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    workflowName: String(r.workflow_name),
    taskId: String(r.task_id),
    nodeKey: String(r.node_key),
    agentId: String(r.agent_id) as AgentStationId,
    taskTitle: String(r.task_title),
    errorClassification: String(r.error_classification) as ErrorClassificationKind,
    errorCode: String(r.error_code),
    errorMessage: String(r.error_message),
    attemptCount: Number(r.attempt_count ?? 1),
    maxRetries: Number(r.max_retries ?? 2),
    status: String(r.status) as WorkflowDeadLetterTaskRecord['status'],
    replayedWorkflowId: r.replayed_workflow_id ? String(r.replayed_workflow_id) : null,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    createdAt: String(r.created_at),
  };
}

function mapAutonomyPolicyRow(r: Record<string, unknown>): AutonomyPolicyRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    name: String(r.name),
    autonomyMode: String(r.autonomy_mode) as AutonomyMode,
    maxConcurrentWorkflows: Number(r.max_concurrent_workflows ?? 3),
    maxActiveAgentTasks: Number(r.max_active_agent_tasks ?? 6),
    maxWorkflowDurationMs: Number(r.max_workflow_duration_ms ?? 900_000),
    maxTokensPerWorkflow:
      r.max_tokens_per_workflow === null || r.max_tokens_per_workflow === undefined
        ? null
        : Number(r.max_tokens_per_workflow),
    maxSpendMicrosPerRun:
      r.max_spend_micros_per_run === null || r.max_spend_micros_per_run === undefined
        ? null
        : Number(r.max_spend_micros_per_run),
    allowedTemplates: parseJson<WorkflowTemplateId[]>(r.allowed_templates_json, []),
    allowedAgents: parseJson<AgentStationId[]>(r.allowed_agents_json, []),
    requireApprovalForHighImpact: Number(r.require_approval_for_high_impact ?? 1) === 1,
    highImpactActionTypes: parseJson<string[]>(
      r.high_impact_action_types_json,
      [...DEFAULT_HIGH_IMPACT_ACTIONS],
    ),
    allowAutonomousRetries: Number(r.allow_autonomous_retries ?? 1) === 1,
    allowExternalWebhooks: Number(r.allow_external_webhooks ?? 1) === 1,
    enabled: Number(r.enabled ?? 1) === 1,
    updatedBy: String(r.updated_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapSchedulerLogRow(r: Record<string, unknown>): SchedulerExecutionLogRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    scheduleId: String(r.schedule_id),
    scheduleName: String(r.schedule_name),
    workerId: String(r.worker_id),
    scheduledForIso: String(r.scheduled_for_iso),
    executedAtIso: String(r.executed_at_iso),
    outcome: String(r.outcome) as SchedulerExecutionLogRecord['outcome'],
    launchedWorkflowId: r.launched_workflow_id ? String(r.launched_workflow_id) : null,
    message: String(r.message),
  };
}

function mapHeartbeatRow(r: Record<string, unknown>): RuntimeWorkerHeartbeatRecord {
  return {
    workerId: String(r.worker_id),
    status: String(r.status) as RuntimeWorkerHeartbeatRecord['status'],
    startedAt: String(r.started_at),
    lastHeartbeatAt: String(r.last_heartbeat_at),
    activeLeasesCount: Number(r.active_leases_count ?? 0),
    processedTicks: Number(r.processed_ticks ?? 0),
    lastTickDurationMs:
      r.last_tick_duration_ms === null || r.last_tick_duration_ms === undefined
        ? null
        : Number(r.last_tick_duration_ms),
    lastError: r.last_error ? String(r.last_error) : null,
  };
}

// ============================================================================
// SCHEDULES CRUD & ATOMIC DUE-SCHEDULE CLAIMING
// ============================================================================

export function createWorkflowScheduleInDb(params: {
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  targetKind: ScheduleTargetKind;
  templateId: WorkflowTemplateId | null;
  studioWorkflowId: string | null;
  workflowObjective: string;
  frequency: ScheduleFrequency;
  minuteOfHour: number;
  hourOfDay: number | null;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  runAtIso: string | null;
  timezone: string;
  executionWindow: ScheduleExecutionWindow | null;
  catchUpPolicy: ScheduleCatchUpPolicy;
  maxCatchUpRuns: number;
  status: ScheduleStatus;
  nextRunAt: string | null;
  actorName: string;
}): WorkflowScheduleRecord {
  const db = getAuditDb();
  const id = `sched-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO workflow_schedules (
      id, tenant_id, project_id, name, description, target_kind, template_id, studio_workflow_id,
      workflow_objective, frequency, minute_of_hour, hour_of_day, days_of_week_json, day_of_month,
      run_at_iso, timezone, execution_window_json, catch_up_policy, max_catch_up_runs,
      status, next_run_at, last_run_at, last_workflow_id, last_run_status, last_error,
      total_runs, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.name,
    params.description,
    params.targetKind,
    params.templateId,
    params.studioWorkflowId,
    params.workflowObjective,
    params.frequency,
    params.minuteOfHour,
    params.hourOfDay,
    JSON.stringify(params.daysOfWeek),
    params.dayOfMonth,
    params.runAtIso,
    params.timezone,
    params.executionWindow ? JSON.stringify(params.executionWindow) : null,
    params.catchUpPolicy,
    params.maxCatchUpRuns,
    params.status,
    params.nextRunAt,
    params.actorName,
    params.actorName,
    now,
    now,
  );

  return getWorkflowScheduleByIdInDb(params.tenantId, id)!;
}

export function getWorkflowScheduleByIdInDb(
  tenantId: string,
  scheduleId: string,
): WorkflowScheduleRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM workflow_schedules WHERE tenant_id = ? AND id = ?')
    .get(tenantId, scheduleId) as Record<string, unknown> | undefined;
  return row ? mapScheduleRow(row) : null;
}

export function listWorkflowSchedulesInDb(
  tenantId: string,
  projectId: string,
): WorkflowScheduleRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM workflow_schedules
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, updated_at DESC`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapScheduleRow);
}

export function updateWorkflowScheduleInDb(params: {
  tenantId: string;
  scheduleId: string;
  name?: string;
  description?: string;
  targetKind?: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  workflowObjective?: string;
  frequency?: ScheduleFrequency;
  minuteOfHour?: number;
  hourOfDay?: number | null;
  daysOfWeek?: number[];
  dayOfMonth?: number | null;
  runAtIso?: string | null;
  timezone?: string;
  executionWindow?: ScheduleExecutionWindow | null;
  catchUpPolicy?: ScheduleCatchUpPolicy;
  maxCatchUpRuns?: number;
  status?: ScheduleStatus;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastWorkflowId?: string | null;
  lastRunStatus?: string | null;
  lastError?: string | null;
  incrementTotalRuns?: number;
  updatedBy?: string;
}): WorkflowScheduleRecord | null {
  const existing = getWorkflowScheduleByIdInDb(params.tenantId, params.scheduleId);
  if (!existing) return null;
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE workflow_schedules
     SET name = ?, description = ?, target_kind = ?, template_id = ?, studio_workflow_id = ?,
         workflow_objective = ?, frequency = ?, minute_of_hour = ?, hour_of_day = ?,
         days_of_week_json = ?, day_of_month = ?, run_at_iso = ?, timezone = ?,
         execution_window_json = ?, catch_up_policy = ?, max_catch_up_runs = ?,
         status = ?, next_run_at = ?, last_run_at = ?, last_workflow_id = ?,
         last_run_status = ?, last_error = ?, total_runs = ?, updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.name ?? existing.name,
    params.description ?? existing.description,
    params.targetKind ?? existing.targetKind,
    params.templateId !== undefined ? params.templateId : existing.templateId,
    params.studioWorkflowId !== undefined ? params.studioWorkflowId : existing.studioWorkflowId,
    params.workflowObjective ?? existing.workflowObjective,
    params.frequency ?? existing.frequency,
    params.minuteOfHour ?? existing.minuteOfHour,
    params.hourOfDay !== undefined ? params.hourOfDay : existing.hourOfDay,
    JSON.stringify(params.daysOfWeek ?? existing.daysOfWeek),
    params.dayOfMonth !== undefined ? params.dayOfMonth : existing.dayOfMonth,
    params.runAtIso !== undefined ? params.runAtIso : existing.runAtIso,
    params.timezone ?? existing.timezone,
    (params.executionWindow !== undefined ? params.executionWindow : existing.executionWindow)
      ? JSON.stringify(
          params.executionWindow !== undefined
            ? params.executionWindow
            : existing.executionWindow,
        )
      : null,
    params.catchUpPolicy ?? existing.catchUpPolicy,
    params.maxCatchUpRuns ?? existing.maxCatchUpRuns,
    params.status ?? existing.status,
    params.nextRunAt !== undefined ? params.nextRunAt : existing.nextRunAt,
    params.lastRunAt !== undefined ? params.lastRunAt : existing.lastRunAt,
    params.lastWorkflowId !== undefined ? params.lastWorkflowId : existing.lastWorkflowId,
    params.lastRunStatus !== undefined ? params.lastRunStatus : existing.lastRunStatus,
    params.lastError !== undefined ? params.lastError : existing.lastError,
    existing.totalRuns + (params.incrementTotalRuns ?? 0),
    params.updatedBy ?? existing.updatedBy,
    now,
    params.tenantId,
    params.scheduleId,
  );

  return getWorkflowScheduleByIdInDb(params.tenantId, params.scheduleId);
}

export function deleteWorkflowScheduleInDb(tenantId: string, scheduleId: string): boolean {
  const db = getAuditDb();
  const res = db
    .prepare('DELETE FROM workflow_schedules WHERE tenant_id = ? AND id = ?')
    .run(tenantId, scheduleId);
  return Number(res.changes ?? 0) > 0;
}

/**
 * Atomically claims due active schedules using SQLite BEGIN IMMEDIATE + worker lease rows.
 * Guarantees two concurrent workers can never execute the same schedule slot twice.
 */
export function claimDueSchedulesInDb(params: {
  workerId: string;
  nowIso: string;
  leaseDurationMs: number;
  limit?: number;
}): WorkflowScheduleRecord[] {
  return runTx((db) => {
    const dueRows = db
      .prepare(
        `SELECT s.* FROM workflow_schedules s
         WHERE s.status = 'active'
           AND s.next_run_at IS NOT NULL
           AND s.next_run_at <= ?
         ORDER BY s.next_run_at ASC
         LIMIT ?`,
      )
      .all(params.nowIso, params.limit ?? 15) as Record<string, unknown>[];

    const claimed: WorkflowScheduleRecord[] = [];
    const expiresAt = new Date(Date.parse(params.nowIso) + params.leaseDurationMs).toISOString();

    for (const row of dueRows) {
      const sched = mapScheduleRow(row);
      const leaseKey = `schedule:${sched.id}`;
      const existingLease = db
        .prepare(
          `SELECT * FROM workflow_worker_leases
           WHERE lease_key = ? AND status = 'active' AND expires_at > ?`,
        )
        .get(leaseKey, params.nowIso) as Record<string, unknown> | undefined;

      if (existingLease && String(existingLease.worker_id) !== params.workerId) {
        continue;
      }

      db.prepare(
        `INSERT INTO workflow_worker_leases (
          lease_key, lease_kind, resource_id, tenant_id, project_id, worker_id,
          acquired_at, heartbeat_at, expires_at, status
        ) VALUES (?, 'schedule', ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(lease_key) DO UPDATE SET
          worker_id = excluded.worker_id,
          acquired_at = excluded.acquired_at,
          heartbeat_at = excluded.heartbeat_at,
          expires_at = excluded.expires_at,
          status = 'active'`,
      ).run(
        leaseKey,
        sched.id,
        sched.tenantId,
        sched.projectId,
        params.workerId,
        params.nowIso,
        params.nowIso,
        expiresAt,
      );

      claimed.push(sched);
    }

    return claimed;
  });
}

// ============================================================================
// WORKER LEASES & HEARTBEATS
// ============================================================================

export function acquireWorkerLeaseInDb(params: {
  leaseKey: string;
  leaseKind: WorkflowWorkerLeaseRecord['leaseKind'];
  resourceId: string;
  tenantId: string;
  projectId: string;
  workerId: string;
  leaseDurationMs: number;
  nowIso?: string;
}): boolean {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(nowIso) + params.leaseDurationMs).toISOString();

  return runTx((db) => {
    const existing = db
      .prepare('SELECT * FROM workflow_worker_leases WHERE lease_key = ?')
      .get(params.leaseKey) as Record<string, unknown> | undefined;

    if (
      existing &&
      String(existing.status) === 'active' &&
      String(existing.expires_at) > nowIso &&
      String(existing.worker_id) !== params.workerId
    ) {
      return false;
    }

    db.prepare(
      `INSERT INTO workflow_worker_leases (
        lease_key, lease_kind, resource_id, tenant_id, project_id, worker_id,
        acquired_at, heartbeat_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT(lease_key) DO UPDATE SET
        worker_id = excluded.worker_id,
        acquired_at = excluded.acquired_at,
        heartbeat_at = excluded.heartbeat_at,
        expires_at = excluded.expires_at,
        status = 'active'`,
    ).run(
      params.leaseKey,
      params.leaseKind,
      params.resourceId,
      params.tenantId,
      params.projectId,
      params.workerId,
      nowIso,
      nowIso,
      expiresAt,
    );

    return true;
  });
}

export function releaseWorkerLeaseInDb(leaseKey: string, workerId?: string): void {
  const db = getAuditDb();
  if (workerId) {
    db.prepare(
      `UPDATE workflow_worker_leases SET status = 'released', heartbeat_at = ?
       WHERE lease_key = ? AND worker_id = ?`,
    ).run(new Date().toISOString(), leaseKey, workerId);
  } else {
    db.prepare(
      `UPDATE workflow_worker_leases SET status = 'released', heartbeat_at = ?
       WHERE lease_key = ?`,
    ).run(new Date().toISOString(), leaseKey);
  }
}

export function releaseAllLeasesForWorkerInDb(workerId: string): number {
  const db = getAuditDb();
  const res = db
    .prepare(
      `UPDATE workflow_worker_leases SET status = 'released', heartbeat_at = ?
       WHERE worker_id = ? AND status = 'active'`,
    )
    .run(new Date().toISOString(), workerId);
  return Number(res.changes ?? 0);
}

export function reclaimExpiredWorkerLeasesInDb(
  nowIso: string = new Date().toISOString(),
): WorkflowWorkerLeaseRecord[] {
  return runTx((db) => {
    const expiredRows = db
      .prepare(
        `SELECT * FROM workflow_worker_leases
         WHERE status = 'active' AND expires_at <= ?`,
      )
      .all(nowIso) as Record<string, unknown>[];

    if (expiredRows.length === 0) return [];

    db.prepare(
      `UPDATE workflow_worker_leases
       SET status = 'reclaimed', heartbeat_at = ?
       WHERE status = 'active' AND expires_at <= ?`,
    ).run(nowIso, nowIso);

    return expiredRows.map(mapLeaseRow);
  });
}

export function listActiveLeasesForProjectInDb(
  tenantId: string,
  projectId: string,
): WorkflowWorkerLeaseRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM workflow_worker_leases
       WHERE tenant_id = ? AND project_id = ? AND status = 'active'
       ORDER BY acquired_at DESC LIMIT 50`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  return rows.map(mapLeaseRow);
}

export function upsertWorkerHeartbeatInDb(params: {
  workerId: string;
  status: RuntimeWorkerHeartbeatRecord['status'];
  startedAt: string;
  lastHeartbeatAt: string;
  processedTicks: number;
  lastTickDurationMs: number | null;
  lastError: string | null;
}): void {
  const db = getAuditDb();
  const leaseCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM workflow_worker_leases
       WHERE worker_id = ? AND status = 'active'`,
    )
    .get(params.workerId) as { cnt: number } | undefined;

  db.prepare(
    `INSERT INTO runtime_worker_heartbeats (
      worker_id, status, started_at, last_heartbeat_at,
      active_leases_count, processed_ticks, last_tick_duration_ms, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(worker_id) DO UPDATE SET
      status = excluded.status,
      last_heartbeat_at = excluded.last_heartbeat_at,
      active_leases_count = excluded.active_leases_count,
      processed_ticks = excluded.processed_ticks,
      last_tick_duration_ms = excluded.last_tick_duration_ms,
      last_error = excluded.last_error`,
  ).run(
    params.workerId,
    params.status,
    params.startedAt,
    params.lastHeartbeatAt,
    Number(leaseCountRow?.cnt ?? 0),
    params.processedTicks,
    params.lastTickDurationMs,
    params.lastError,
  );
}

export function listWorkerHeartbeatsInDb(): RuntimeWorkerHeartbeatRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare('SELECT * FROM runtime_worker_heartbeats ORDER BY last_heartbeat_at DESC LIMIT 20')
    .all() as Record<string, unknown>[];
  return rows.map(mapHeartbeatRow);
}

// ============================================================================
// SCHEDULER EXECUTION LOGS
// ============================================================================

export function insertSchedulerExecutionLogInDb(params: {
  tenantId: string;
  projectId: string;
  scheduleId: string;
  scheduleName: string;
  workerId: string;
  scheduledForIso: string;
  outcome: SchedulerExecutionLogRecord['outcome'];
  launchedWorkflowId: string | null;
  message: string;
}): SchedulerExecutionLogRecord {
  const db = getAuditDb();
  const id = `slog-${crypto.randomUUID().slice(0, 12)}`;
  const executedAtIso = new Date().toISOString();

  db.prepare(
    `INSERT INTO scheduler_execution_logs (
      id, tenant_id, project_id, schedule_id, schedule_name, worker_id,
      scheduled_for_iso, executed_at_iso, outcome, launched_workflow_id, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.scheduleId,
    params.scheduleName,
    params.workerId,
    params.scheduledForIso,
    executedAtIso,
    params.outcome,
    params.launchedWorkflowId,
    params.message,
  );

  return {
    id,
    ...params,
    executedAtIso,
  };
}

export function listSchedulerExecutionLogsInDb(
  tenantId: string,
  projectId: string,
  limit = 60,
): SchedulerExecutionLogRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM scheduler_execution_logs
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY executed_at_iso DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapSchedulerLogRow);
}

// ============================================================================
// TRIGGER SUBSCRIPTIONS & IDEMPOTENT TRIGGER EVENTS
// ============================================================================

export function createTriggerSubscriptionInDb(params: {
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  targetKind: ScheduleTargetKind;
  templateId: WorkflowTemplateId | null;
  studioWorkflowId: string | null;
  workflowObjective: string;
  enabled: boolean;
  filterConfig: Record<string, unknown>;
  webhookSecretHash: string | null;
  webhookSecretEnc: string | null;
  webhookSecretHint: string | null;
  rateLimitPerMinute: number;
  actorName: string;
}): WorkflowTriggerSubscriptionRecord {
  const db = getAuditDb();
  const id = `trig-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO workflow_trigger_subscriptions (
      id, tenant_id, project_id, name, description, trigger_type, target_kind,
      template_id, studio_workflow_id, workflow_objective, enabled, filter_config_json,
      webhook_secret_hash, webhook_secret_enc, webhook_secret_hint, rate_limit_per_minute,
      total_triggered, last_triggered_at, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.name,
    params.description,
    params.triggerType,
    params.targetKind,
    params.templateId,
    params.studioWorkflowId,
    params.workflowObjective,
    params.enabled ? 1 : 0,
    JSON.stringify(params.filterConfig),
    params.webhookSecretHash,
    params.webhookSecretEnc,
    params.webhookSecretHint,
    params.rateLimitPerMinute,
    params.actorName,
    params.actorName,
    now,
    now,
  );

  return getTriggerSubscriptionByIdInDb(params.tenantId, id)!;
}

export function getTriggerSubscriptionByIdInDb(
  tenantId: string,
  subscriptionId: string,
): WorkflowTriggerSubscriptionRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM workflow_trigger_subscriptions WHERE tenant_id = ? AND id = ?')
    .get(tenantId, subscriptionId) as Record<string, unknown> | undefined;
  return row ? mapTriggerSubscriptionRow(row) : null;
}

export function getWebhookSubscriptionSecretRecordByIdInDb(subscriptionId: string): {
  subscription: WorkflowTriggerSubscriptionRecord;
  webhookSecretHash: string | null;
  webhookSecretEnc: string | null;
} | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM workflow_trigger_subscriptions
       WHERE id = ? AND trigger_type = 'external_webhook'`,
    )
    .get(subscriptionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    subscription: mapTriggerSubscriptionRow(row),
    webhookSecretHash: row.webhook_secret_hash ? String(row.webhook_secret_hash) : null,
    webhookSecretEnc: row.webhook_secret_enc ? String(row.webhook_secret_enc) : null,
  };
}

export function listTriggerSubscriptionsInDb(
  tenantId: string,
  projectId: string,
  triggerType?: AutomationTriggerType,
): WorkflowTriggerSubscriptionRecord[] {
  const db = getAuditDb();
  const rows = triggerType
    ? (db
        .prepare(
          `SELECT * FROM workflow_trigger_subscriptions
           WHERE tenant_id = ? AND project_id = ? AND trigger_type = ?
           ORDER BY updated_at DESC`,
        )
        .all(tenantId, projectId, triggerType) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM workflow_trigger_subscriptions
           WHERE tenant_id = ? AND project_id = ?
           ORDER BY updated_at DESC`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapTriggerSubscriptionRow);
}

export function updateTriggerSubscriptionInDb(params: {
  tenantId: string;
  subscriptionId: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  workflowObjective?: string;
  filterConfig?: Record<string, unknown>;
  rateLimitPerMinute?: number;
  incrementTriggered?: number;
  lastTriggeredAt?: string | null;
  updatedBy?: string;
}): WorkflowTriggerSubscriptionRecord | null {
  const existing = getTriggerSubscriptionByIdInDb(params.tenantId, params.subscriptionId);
  if (!existing) return null;
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE workflow_trigger_subscriptions
     SET name = ?, description = ?, enabled = ?, workflow_objective = ?,
         filter_config_json = ?, rate_limit_per_minute = ?, total_triggered = ?,
         last_triggered_at = ?, updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.name ?? existing.name,
    params.description ?? existing.description,
    (params.enabled ?? existing.enabled) ? 1 : 0,
    params.workflowObjective ?? existing.workflowObjective,
    JSON.stringify(params.filterConfig ?? existing.filterConfig),
    params.rateLimitPerMinute ?? existing.rateLimitPerMinute,
    existing.totalTriggered + (params.incrementTriggered ?? 0),
    params.lastTriggeredAt !== undefined ? params.lastTriggeredAt : existing.lastTriggeredAt,
    params.updatedBy ?? existing.updatedBy,
    now,
    params.tenantId,
    params.subscriptionId,
  );

  return getTriggerSubscriptionByIdInDb(params.tenantId, params.subscriptionId);
}

export function deleteTriggerSubscriptionInDb(
  tenantId: string,
  subscriptionId: string,
): boolean {
  const db = getAuditDb();
  const res = db
    .prepare('DELETE FROM workflow_trigger_subscriptions WHERE tenant_id = ? AND id = ?')
    .run(tenantId, subscriptionId);
  return Number(res.changes ?? 0) > 0;
}

export function findTriggerEventByIdempotencyKeyInDb(
  tenantId: string,
  idempotencyKey: string,
): WorkflowTriggerEventRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM workflow_trigger_events
       WHERE tenant_id = ? AND idempotency_key = ?`,
    )
    .get(tenantId, idempotencyKey) as Record<string, unknown> | undefined;
  return row ? mapTriggerEventRow(row) : null;
}

export function insertTriggerEventInDb(params: {
  tenantId: string;
  projectId: string;
  subscriptionId: string | null;
  triggerType: AutomationTriggerType;
  idempotencyKey: string;
  sourceRef: string | null;
  status: TriggerEventStatus;
  payloadSummary: string;
  payloadJson: Record<string, unknown>;
  launchedWorkflowId: string | null;
  errorMessage: string | null;
}): { record: WorkflowTriggerEventRecord; deduplicated: boolean } {
  return runTx((db) => {
    const existing = db
      .prepare(
        `SELECT * FROM workflow_trigger_events
         WHERE tenant_id = ? AND idempotency_key = ?`,
      )
      .get(params.tenantId, params.idempotencyKey) as Record<string, unknown> | undefined;

    if (existing) {
      return { record: mapTriggerEventRow(existing), deduplicated: true };
    }

    const id = `tev-${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workflow_trigger_events (
        id, tenant_id, project_id, subscription_id, trigger_type, idempotency_key,
        source_ref, status, payload_summary, payload_json, launched_workflow_id,
        error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.tenantId,
      params.projectId,
      params.subscriptionId,
      params.triggerType,
      params.idempotencyKey,
      params.sourceRef,
      params.status,
      params.payloadSummary,
      JSON.stringify(params.payloadJson),
      params.launchedWorkflowId,
      params.errorMessage,
      now,
    );

    const created = db
      .prepare('SELECT * FROM workflow_trigger_events WHERE id = ?')
      .get(id) as Record<string, unknown>;
    return { record: mapTriggerEventRow(created), deduplicated: false };
  });
}

export function updateTriggerEventOutcomeInDb(params: {
  tenantId: string;
  eventId: string;
  status: TriggerEventStatus;
  launchedWorkflowId?: string | null;
  errorMessage?: string | null;
}): void {
  const db = getAuditDb();
  db.prepare(
    `UPDATE workflow_trigger_events
     SET status = ?, launched_workflow_id = ?, error_message = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.launchedWorkflowId ?? null,
    params.errorMessage ?? null,
    params.tenantId,
    params.eventId,
  );
}

export function listTriggerEventsInDb(
  tenantId: string,
  projectId: string,
  limit = 60,
): WorkflowTriggerEventRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM workflow_trigger_events
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapTriggerEventRow);
}

export function countRecentWebhookEventsForSubscriptionInDb(
  subscriptionId: string,
  sinceIso: string,
): number {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM workflow_trigger_events
       WHERE subscription_id = ? AND created_at >= ?`,
    )
    .get(subscriptionId, sinceIso) as { cnt: number } | undefined;
  return Number(row?.cnt ?? 0);
}

// ============================================================================
// RECOVERY RECORDS & DEAD-LETTER QUEUE
// ============================================================================

export function insertRecoveryRecordInDb(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  taskId?: string | null;
  actionType: RecoveryActionType;
  previousStatus: string;
  newStatus: string;
  actor: string;
  reason: string;
  relatedWorkflowId?: string | null;
}): WorkflowRecoveryRecord {
  const db = getAuditDb();
  const id = `rec-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO workflow_recovery_records (
      id, tenant_id, project_id, workflow_id, task_id, action_type,
      previous_status, new_status, actor, reason, related_workflow_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.workflowId,
    params.taskId ?? null,
    params.actionType,
    params.previousStatus,
    params.newStatus,
    params.actor,
    params.reason,
    params.relatedWorkflowId ?? null,
    createdAt,
  );

  return {
    id,
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: params.taskId ?? null,
    actionType: params.actionType,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    actor: params.actor,
    reason: params.reason,
    relatedWorkflowId: params.relatedWorkflowId ?? null,
    createdAt,
  };
}

export function listRecoveryRecordsInDb(
  tenantId: string,
  projectId: string,
  limit = 60,
): WorkflowRecoveryRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM workflow_recovery_records
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapRecoveryRow);
}

export function upsertDeadLetterTaskInDb(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  taskId: string;
  nodeKey: string;
  agentId: AgentStationId;
  taskTitle: string;
  errorClassification: ErrorClassificationKind;
  errorCode: string;
  errorMessage: string;
  attemptCount: number;
  maxRetries: number;
}): WorkflowDeadLetterTaskRecord {
  const db = getAuditDb();
  const existing = db
    .prepare(
      `SELECT * FROM workflow_dead_letter_tasks
       WHERE tenant_id = ? AND task_id = ? AND status = 'open'`,
    )
    .get(params.tenantId, params.taskId) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare(
      `UPDATE workflow_dead_letter_tasks
       SET error_classification = ?, error_code = ?, error_message = ?, attempt_count = ?
       WHERE id = ?`,
    ).run(
      params.errorClassification,
      params.errorCode,
      params.errorMessage,
      params.attemptCount,
      String(existing.id),
    );
    const updated = db
      .prepare('SELECT * FROM workflow_dead_letter_tasks WHERE id = ?')
      .get(String(existing.id)) as Record<string, unknown>;
    return mapDeadLetterRow(updated);
  }

  const id = `dlq-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO workflow_dead_letter_tasks (
      id, tenant_id, project_id, workflow_id, workflow_name, task_id, node_key, agent_id,
      task_title, error_classification, error_code, error_message, attempt_count, max_retries,
      status, replayed_workflow_id, resolved_by, resolved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.workflowId,
    params.workflowName,
    params.taskId,
    params.nodeKey,
    params.agentId,
    params.taskTitle,
    params.errorClassification,
    params.errorCode,
    params.errorMessage,
    params.attemptCount,
    params.maxRetries,
    now,
  );

  const row = db
    .prepare('SELECT * FROM workflow_dead_letter_tasks WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapDeadLetterRow(row);
}

export function getDeadLetterTaskByIdInDb(
  tenantId: string,
  dlqId: string,
): WorkflowDeadLetterTaskRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM workflow_dead_letter_tasks WHERE tenant_id = ? AND id = ?')
    .get(tenantId, dlqId) as Record<string, unknown> | undefined;
  return row ? mapDeadLetterRow(row) : null;
}

export function listDeadLetterTasksInDb(
  tenantId: string,
  projectId: string,
  limit = 60,
): WorkflowDeadLetterTaskRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM workflow_dead_letter_tasks
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapDeadLetterRow);
}

export function updateDeadLetterStatusInDb(params: {
  tenantId: string;
  dlqId: string;
  status: WorkflowDeadLetterTaskRecord['status'];
  replayedWorkflowId?: string | null;
  resolvedBy?: string | null;
}): WorkflowDeadLetterTaskRecord | null {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workflow_dead_letter_tasks
     SET status = ?, replayed_workflow_id = COALESCE(?, replayed_workflow_id),
         resolved_by = ?, resolved_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.replayedWorkflowId ?? null,
    params.resolvedBy ?? null,
    now,
    params.tenantId,
    params.dlqId,
  );
  return getDeadLetterTaskByIdInDb(params.tenantId, params.dlqId);
}

// ============================================================================
// AUTONOMY POLICIES & AUDIT TRAIL
// ============================================================================

export function getOrCreateAutonomyPolicyInDb(
  tenantId: string,
  projectId: string,
): AutonomyPolicyRecord {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM autonomy_policies WHERE tenant_id = ? AND project_id = ?')
    .get(tenantId, projectId) as Record<string, unknown> | undefined;
  if (row) return mapAutonomyPolicyRow(row);

  const id = `apol-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO autonomy_policies (
      id, tenant_id, project_id, name, autonomy_mode, max_concurrent_workflows,
      max_active_agent_tasks, max_workflow_duration_ms, max_tokens_per_workflow,
      max_spend_micros_per_run, allowed_templates_json, allowed_agents_json,
      require_approval_for_high_impact, high_impact_action_types_json,
      allow_autonomous_retries, allow_external_webhooks, enabled, updated_by,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'Default Autonomous Operations Policy', 'automatic_low_risk', 3, 6, 900000, NULL, NULL, '[]', '[]', 1, ?, 1, 1, 1, 'system', ?, ?)`,
  ).run(id, tenantId, projectId, JSON.stringify([...DEFAULT_HIGH_IMPACT_ACTIONS]), now, now);

  const fresh = db
    .prepare('SELECT * FROM autonomy_policies WHERE tenant_id = ? AND project_id = ?')
    .get(tenantId, projectId) as Record<string, unknown>;
  return mapAutonomyPolicyRow(fresh);
}

export function upsertAutonomyPolicyInDb(params: {
  tenantId: string;
  projectId: string;
  name: string;
  autonomyMode: AutonomyMode;
  maxConcurrentWorkflows: number;
  maxActiveAgentTasks: number;
  maxWorkflowDurationMs: number;
  maxTokensPerWorkflow: number | null;
  maxSpendMicrosPerRun: number | null;
  allowedTemplates: WorkflowTemplateId[];
  allowedAgents: AgentStationId[];
  requireApprovalForHighImpact: boolean;
  highImpactActionTypes: string[];
  allowAutonomousRetries: boolean;
  allowExternalWebhooks: boolean;
  enabled: boolean;
  updatedBy: string;
}): AutonomyPolicyRecord {
  const existing = getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId);
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE autonomy_policies
     SET name = ?, autonomy_mode = ?, max_concurrent_workflows = ?, max_active_agent_tasks = ?,
         max_workflow_duration_ms = ?, max_tokens_per_workflow = ?, max_spend_micros_per_run = ?,
         allowed_templates_json = ?, allowed_agents_json = ?,
         require_approval_for_high_impact = ?, high_impact_action_types_json = ?,
         allow_autonomous_retries = ?, allow_external_webhooks = ?, enabled = ?,
         updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ?`,
  ).run(
    params.name,
    params.autonomyMode,
    params.maxConcurrentWorkflows,
    params.maxActiveAgentTasks,
    params.maxWorkflowDurationMs,
    params.maxTokensPerWorkflow,
    params.maxSpendMicrosPerRun,
    JSON.stringify(params.allowedTemplates),
    JSON.stringify(params.allowedAgents),
    params.requireApprovalForHighImpact ? 1 : 0,
    JSON.stringify(
      params.highImpactActionTypes.length > 0
        ? params.highImpactActionTypes
        : [...DEFAULT_HIGH_IMPACT_ACTIONS],
    ),
    params.allowAutonomousRetries ? 1 : 0,
    params.allowExternalWebhooks ? 1 : 0,
    params.enabled ? 1 : 0,
    params.updatedBy,
    now,
    params.tenantId,
    params.projectId,
  );

  return getOrCreateAutonomyPolicyInDb(params.tenantId, params.projectId) ?? existing;
}

export function listOperationsPolicyAuditInDb(
  tenantId: string,
  projectId: string,
  limit = 40,
): OperationsPolicyAuditEntry[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT id, entity_type, entity_id, actor_name, actor_role, previous_state, new_state, reason, timestamp
       FROM audit_trail
       WHERE tenant_id = ?
         AND entity_type IN ('autonomy_policy', 'workflow_schedule', 'workflow_trigger', 'workflow_recovery')
         AND (evidence_reference = ? OR entity_id LIKE ?)
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, projectId, `%${projectId}%`, limit) as Record<string, unknown>[];

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
