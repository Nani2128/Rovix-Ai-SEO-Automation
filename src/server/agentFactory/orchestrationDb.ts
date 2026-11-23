import crypto from 'node:crypto';
import type {
  AgentConfigRecord,
  AgentExecutionTelemetryRecord,
  AgentFactoryEvent,
  AgentFactoryEventType,
  AgentId,
  AgentOutputRecord,
  AgentPerformanceMetrics,
  AgentStationId,
  AgentWorkflowDetail,
  AgentWorkflowRecord,
  ApprovalAuditHistoryEntry,
  ApprovalDecisionStatus,
  ApprovalGateType,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
  StructuredAgentHandoff,
  WorkflowApprovalRequest,
  WorkflowRunStatus,
  WorkflowTaskRecord,
  WorkflowTaskStatus,
  WorkflowTemplateId,
} from '../../types/agentFactory';
import { getAuditDb } from '../audit/db';
import { AGENT_STATION_IDS } from '../../lib/agentFactoryCatalog';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapWorkflowRow(r: Record<string, unknown>): AgentWorkflowRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    templateId: String(r.template_id) as WorkflowTemplateId,
    name: String(r.name),
    objective: String(r.objective ?? ''),
    status: String(r.status) as WorkflowRunStatus,
    currentStage: String(r.current_stage ?? 'Queued'),
    blockingReason: r.blocking_reason ? String(r.blocking_reason) : null,
    createdBy: String(r.created_by),
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
    config: parseJson<Record<string, unknown>>(r.config_json, {}),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTaskRow(r: Record<string, unknown>): WorkflowTaskRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    nodeKey: String(r.node_key),
    agentId: String(r.agent_id) as AgentStationId,
    title: String(r.title),
    status: String(r.status) as WorkflowTaskStatus,
    attemptCount: Number(r.attempt_count ?? 0),
    maxRetries: Number(r.max_retries ?? 2),
    nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
    blockingReason: r.blocking_reason ? String(r.blocking_reason) : null,
    errorSummary: r.error_summary ? String(r.error_summary) : null,
    approvalRequired: Number(r.approval_required ?? 0) === 1,
    approvalGateType: r.approval_gate_type
      ? (String(r.approval_gate_type) as ApprovalGateType)
      : null,
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
    durationMs:
      r.duration_ms === null || r.duration_ms === undefined
        ? null
        : Number(r.duration_ms),
    outputId: r.output_id ? String(r.output_id) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapHandoffRow(r: Record<string, unknown>): StructuredAgentHandoff {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    executionId: String(r.execution_id),
    sourceAgentId: String(r.source_agent_id) as AgentId,
    destinationAgentId: String(r.destination_agent_id) as AgentId,
    taskId: String(r.task_id),
    inputRef: String(r.input_ref),
    outputRef: String(r.output_ref),
    evidenceRefs: parseJson<string[]>(r.evidence_refs_json, []),
    status: String(r.status) as StructuredAgentHandoff['status'],
    validationSummary: String(r.validation_summary ?? ''),
    correlationId: String(r.correlation_id),
    createdAt: String(r.created_at),
  };
}

function mapOutputRow(r: Record<string, unknown>): AgentOutputRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    taskId: String(r.task_id),
    agentId: String(r.agent_id) as AgentId,
    schemaVersion: String(r.schema_version ?? '1.0'),
    summary: String(r.summary ?? ''),
    payload: parseJson<Record<string, unknown>>(r.payload_json, {}),
    evidenceRefs: parseJson<string[]>(r.evidence_refs_json, []),
    isAiGenerated: Number(r.is_ai_generated ?? 0) === 1,
    createdAt: String(r.created_at),
  };
}

function mapExecutionRow(r: Record<string, unknown>): AgentExecutionTelemetryRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    taskId: String(r.task_id),
    agentId: String(r.agent_id) as AgentId,
    attemptNumber: Number(r.attempt_number ?? 1),
    provider: String(r.provider),
    model: r.model ? String(r.model) : null,
    inputTokens:
      r.input_tokens === null || r.input_tokens === undefined
        ? null
        : Number(r.input_tokens),
    outputTokens:
      r.output_tokens === null || r.output_tokens === undefined
        ? null
        : Number(r.output_tokens),
    totalTokens:
      r.total_tokens === null || r.total_tokens === undefined
        ? null
        : Number(r.total_tokens),
    durationMs:
      r.duration_ms === null || r.duration_ms === undefined
        ? null
        : Number(r.duration_ms),
    status: String(r.status) as AgentExecutionTelemetryRecord['status'],
    errorMessage: r.error_message ? String(r.error_message) : null,
    startedAt: String(r.started_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

function mapApprovalRow(r: Record<string, unknown>): WorkflowApprovalRequest {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    workflowId: String(r.workflow_id),
    taskId: String(r.task_id),
    gateType: String(r.gate_type) as ApprovalGateType,
    title: String(r.title),
    summary: String(r.summary),
    status: String(r.status) as ApprovalDecisionStatus,
    requestedBy: String(r.requested_by),
    approverId: r.approver_id ? String(r.approver_id) : null,
    approverName: r.approver_name ? String(r.approver_name) : null,
    approverRole: r.approver_role ? String(r.approver_role) : null,
    comments: String(r.comments ?? ''),
    versionRef: String(r.version_ref),
    outputId: r.output_id ? String(r.output_id) : null,
    auditHistory: parseJson<ApprovalAuditHistoryEntry[]>(r.audit_history_json, []),
    createdAt: String(r.created_at),
    decidedAt: r.decided_at ? String(r.decided_at) : null,
  };
}

export function createWorkflowWithDagInDb(params: {
  id: string;
  tenantId: string;
  projectId: string;
  templateId: WorkflowTemplateId;
  name: string;
  objective: string;
  createdBy: string;
  status: WorkflowRunStatus;
  nodes: DagWorkflowNodeInput[];
  edges: DagWorkflowEdgeInput[];
  config?: Record<string, unknown>;
}): AgentWorkflowDetail {
  const db = getAuditDb();
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO agent_workflows (
        id, tenant_id, project_id, template_id, name, objective, status,
        current_stage, blocking_reason, created_by, started_at, completed_at,
        cancelled_at, config_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?)`,
    ).run(
      params.id,
      params.tenantId,
      params.projectId,
      params.templateId,
      params.name,
      params.objective,
      params.status,
      params.status === 'running' ? 'Scheduling root tasks' : 'Queued',
      params.createdBy,
      params.status === 'running' ? now : null,
      JSON.stringify(params.config ?? {}),
      now,
      now,
    );

    const insertNode = db.prepare(
      `INSERT INTO agent_workflow_nodes (
        id, tenant_id, project_id, workflow_id, node_key, agent_id, title,
        condition_json, approval_gate_type, approval_required, max_retries,
        timeout_ms, config_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertTask = db.prepare(
      `INSERT INTO agent_tasks (
        id, tenant_id, project_id, workflow_id, node_key, agent_id, title,
        status, attempt_count, max_retries, next_retry_at, blocking_reason,
        error_summary, approval_required, approval_gate_type, started_at,
        completed_at, duration_ms, output_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    );

    for (const node of params.nodes) {
      const nodeId = `wfnode-${crypto.randomUUID().slice(0, 12)}`;
      const taskId = `task-${crypto.randomUUID().slice(0, 12)}`;
      const maxRetries = Math.max(0, Math.min(5, Number(node.maxRetries ?? 2)));
      const timeoutMs = Math.max(5_000, Math.min(300_000, Number(node.timeoutMs ?? 60_000)));
      const approvalReq = node.approvalRequired ? 1 : 0;
      const gateType = node.approvalGateType ?? null;

      insertNode.run(
        nodeId,
        params.tenantId,
        params.projectId,
        params.id,
        node.nodeKey,
        node.agentId,
        node.title,
        JSON.stringify(node.condition ?? {}),
        gateType,
        approvalReq,
        maxRetries,
        timeoutMs,
        JSON.stringify(node.config ?? {}),
        now,
      );

      insertTask.run(
        taskId,
        params.tenantId,
        params.projectId,
        params.id,
        node.nodeKey,
        node.agentId,
        node.title,
        maxRetries,
        approvalReq,
        gateType,
        now,
        now,
      );
    }

    const insertEdge = db.prepare(
      `INSERT INTO agent_workflow_edges (
        id, tenant_id, project_id, workflow_id, from_node_key, to_node_key
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const edge of params.edges) {
      insertEdge.run(
        `edge-${crypto.randomUUID().slice(0, 12)}`,
        params.tenantId,
        params.projectId,
        params.id,
        edge.fromNodeKey,
        edge.toNodeKey,
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }

  return getWorkflowDetailById(params.tenantId, params.id)!;
}

export function listWorkflowsForProject(
  tenantId: string,
  projectId: string,
  limit = 20,
): AgentWorkflowRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM agent_workflows
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];
  return rows.map(mapWorkflowRow);
}

export function listRunnableWorkflowsGlobal(limit = 10): AgentWorkflowRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM agent_workflows
       WHERE status IN ('queued', 'running')
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapWorkflowRow);
}

export function getWorkflowDetailById(
  tenantId: string,
  workflowId: string,
): AgentWorkflowDetail | null {
  const db = getAuditDb();
  const wfRow = db
    .prepare(
      'SELECT * FROM agent_workflows WHERE tenant_id = ? AND id = ?',
    )
    .get(tenantId, workflowId) as Record<string, unknown> | undefined;
  if (!wfRow) return null;

  const nodeRows = db
    .prepare(
      'SELECT * FROM agent_workflow_nodes WHERE tenant_id = ? AND workflow_id = ? ORDER BY rowid ASC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const edgeRows = db
    .prepare(
      'SELECT * FROM agent_workflow_edges WHERE tenant_id = ? AND workflow_id = ? ORDER BY rowid ASC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const taskRows = db
    .prepare(
      'SELECT * FROM agent_tasks WHERE tenant_id = ? AND workflow_id = ? ORDER BY rowid ASC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const handoffRows = db
    .prepare(
      'SELECT * FROM agent_handoffs WHERE tenant_id = ? AND workflow_id = ? ORDER BY created_at ASC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const outputRows = db
    .prepare(
      'SELECT * FROM agent_outputs WHERE tenant_id = ? AND workflow_id = ? ORDER BY created_at DESC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const approvalRows = db
    .prepare(
      'SELECT * FROM agent_approval_requests WHERE tenant_id = ? AND workflow_id = ? ORDER BY created_at DESC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const execRows = db
    .prepare(
      'SELECT * FROM agent_executions WHERE tenant_id = ? AND workflow_id = ? ORDER BY started_at DESC',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];
  const eventRows = db
    .prepare(
      'SELECT * FROM agent_execution_events WHERE tenant_id = ? AND workflow_id = ? ORDER BY timestamp DESC LIMIT 100',
    )
    .all(tenantId, workflowId) as Record<string, unknown>[];

  return {
    workflow: mapWorkflowRow(wfRow),
    nodes: nodeRows.map((r) => ({
      nodeKey: String(r.node_key),
      agentId: String(r.agent_id) as AgentStationId,
      title: String(r.title),
      approvalRequired: Number(r.approval_required ?? 0) === 1,
      approvalGateType: r.approval_gate_type
        ? (String(r.approval_gate_type) as ApprovalGateType)
        : null,
      maxRetries: Number(r.max_retries ?? 2),
      timeoutMs: Number(r.timeout_ms ?? 60_000),
      condition: parseJson(r.condition_json, null),
      config: parseJson(r.config_json, {}),
    })),
    edges: edgeRows.map((r) => ({
      fromNodeKey: String(r.from_node_key),
      toNodeKey: String(r.to_node_key),
    })),
    tasks: taskRows.map(mapTaskRow),
    handoffs: handoffRows.map(mapHandoffRow),
    outputs: outputRows.map(mapOutputRow),
    approvals: approvalRows.map(mapApprovalRow),
    executions: execRows.map(mapExecutionRow),
    events: eventRows.map((r) => {
      const meta = parseJson<Record<string, unknown>>(r.metadata_json, {});
      return {
        id: String(r.id),
        eventType: String(r.event_type) as AgentFactoryEventType,
        tenantId: String(r.tenant_id),
        projectId: r.project_id ? String(r.project_id) : null,
        workflowId: String(r.workflow_id),
        taskId: String(r.task_id),
        agentId: String(r.agent_id) as AgentId,
        sourceAgentId: meta.sourceAgentId ? (String(meta.sourceAgentId) as AgentId) : null,
        destinationAgentId: meta.destinationAgentId
          ? (String(meta.destinationAgentId) as AgentId)
          : null,
        status: String(r.status) as AgentFactoryEvent['status'],
        taskTitle: String(meta.taskTitle ?? r.agent_id),
        summary: String(r.summary),
        progressPct:
          r.progress_pct === null || r.progress_pct === undefined
            ? null
            : Number(r.progress_pct),
        errorSummary: r.error_summary ? String(r.error_summary) : null,
        evidenceUrl: meta.evidenceUrl ? String(meta.evidenceUrl) : null,
        timestamp: String(r.timestamp),
        provider: meta.provider ? String(meta.provider) : null,
        model: meta.model ? String(meta.model) : null,
        inputTokens: typeof meta.inputTokens === 'number' ? meta.inputTokens : null,
        outputTokens: typeof meta.outputTokens === 'number' ? meta.outputTokens : null,
        durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : null,
      };
    }),
  };
}

export function updateWorkflowStatusInDb(params: {
  tenantId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  currentStage?: string;
  blockingReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
}): void {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM agent_workflows WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.workflowId) as Record<string, unknown> | undefined;
  if (!existing) return;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE agent_workflows
     SET status = ?,
         current_stage = ?,
         blocking_reason = ?,
         started_at = COALESCE(?, started_at),
         completed_at = ?,
         cancelled_at = ?,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.currentStage ?? String(existing.current_stage),
    params.blockingReason !== undefined
      ? params.blockingReason
      : existing.blocking_reason
        ? String(existing.blocking_reason)
        : null,
    params.startedAt ?? null,
    params.completedAt !== undefined
      ? params.completedAt
      : existing.completed_at
        ? String(existing.completed_at)
        : null,
    params.cancelledAt !== undefined
      ? params.cancelledAt
      : existing.cancelled_at
        ? String(existing.cancelled_at)
        : null,
    now,
    params.tenantId,
    params.workflowId,
  );
}

export function updateTaskRecordInDb(params: {
  tenantId: string;
  taskId: string;
  status: WorkflowTaskStatus;
  attemptCount?: number;
  nextRetryAt?: string | null;
  blockingReason?: string | null;
  errorSummary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  outputId?: string | null;
}): WorkflowTaskRecord | null {
  const db = getAuditDb();
  const existing = db
    .prepare('SELECT * FROM agent_tasks WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.taskId) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE agent_tasks
     SET status = ?,
         attempt_count = ?,
         next_retry_at = ?,
         blocking_reason = ?,
         error_summary = ?,
         started_at = ?,
         completed_at = ?,
         duration_ms = ?,
         output_id = ?,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.attemptCount ?? Number(existing.attempt_count ?? 0),
    params.nextRetryAt !== undefined
      ? params.nextRetryAt
      : existing.next_retry_at
        ? String(existing.next_retry_at)
        : null,
    params.blockingReason !== undefined
      ? params.blockingReason
      : existing.blocking_reason
        ? String(existing.blocking_reason)
        : null,
    params.errorSummary !== undefined
      ? params.errorSummary
      : existing.error_summary
        ? String(existing.error_summary)
        : null,
    params.startedAt !== undefined
      ? params.startedAt
      : existing.started_at
        ? String(existing.started_at)
        : null,
    params.completedAt !== undefined
      ? params.completedAt
      : existing.completed_at
        ? String(existing.completed_at)
        : null,
    params.durationMs !== undefined
      ? params.durationMs
      : existing.duration_ms !== null && existing.duration_ms !== undefined
        ? Number(existing.duration_ms)
        : null,
    params.outputId !== undefined
      ? params.outputId
      : existing.output_id
        ? String(existing.output_id)
        : null,
    now,
    params.tenantId,
    params.taskId,
  );

  const row = db
    .prepare('SELECT * FROM agent_tasks WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, params.taskId) as Record<string, unknown> | undefined;
  return row ? mapTaskRow(row) : null;
}

export function getTaskByIdInDb(
  tenantId: string,
  taskId: string,
): WorkflowTaskRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare('SELECT * FROM agent_tasks WHERE tenant_id = ? AND id = ?')
    .get(tenantId, taskId) as Record<string, unknown> | undefined;
  return row ? mapTaskRow(row) : null;
}

export function insertAgentExecutionInDb(
  rec: AgentExecutionTelemetryRecord,
): void {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO agent_executions (
      id, tenant_id, project_id, workflow_id, task_id, agent_id, attempt_number,
      provider, model, input_tokens, output_tokens, total_tokens, duration_ms,
      status, error_message, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    rec.id,
    rec.tenantId,
    rec.projectId,
    rec.workflowId,
    rec.taskId,
    rec.agentId,
    rec.attemptNumber,
    rec.provider,
    rec.model,
    rec.inputTokens,
    rec.outputTokens,
    rec.totalTokens,
    rec.durationMs,
    rec.status,
    rec.errorMessage,
    rec.startedAt,
    rec.completedAt,
  );
}

export function completeAgentExecutionInDb(params: {
  id: string;
  tenantId: string;
  status: AgentExecutionTelemetryRecord['status'];
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  durationMs: number;
  errorMessage?: string | null;
  completedAt: string;
}): void {
  const db = getAuditDb();
  db.prepare(
    `UPDATE agent_executions
     SET status = ?,
         model = COALESCE(?, model),
         input_tokens = COALESCE(?, input_tokens),
         output_tokens = COALESCE(?, output_tokens),
         total_tokens = COALESCE(?, total_tokens),
         duration_ms = ?,
         error_message = ?,
         completed_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.model ?? null,
    params.inputTokens ?? null,
    params.outputTokens ?? null,
    params.totalTokens ?? null,
    params.durationMs,
    params.errorMessage ?? null,
    params.completedAt,
    params.tenantId,
    params.id,
  );
}

export function insertAgentOutputInDb(rec: AgentOutputRecord): void {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO agent_outputs (
      id, tenant_id, project_id, workflow_id, task_id, agent_id,
      schema_version, summary, payload_json, evidence_refs_json,
      is_ai_generated, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    rec.id,
    rec.tenantId,
    rec.projectId,
    rec.workflowId,
    rec.taskId,
    rec.agentId,
    rec.schemaVersion,
    rec.summary,
    JSON.stringify(rec.payload),
    JSON.stringify(rec.evidenceRefs),
    rec.isAiGenerated ? 1 : 0,
    rec.createdAt,
  );
}

export function insertAgentHandoffInDb(h: StructuredAgentHandoff): void {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO agent_handoffs (
      id, tenant_id, project_id, workflow_id, execution_id, source_agent_id,
      destination_agent_id, task_id, input_ref, output_ref, evidence_refs_json,
      status, validation_summary, correlation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    h.id,
    h.tenantId,
    h.projectId,
    h.workflowId,
    h.executionId,
    h.sourceAgentId,
    h.destinationAgentId,
    h.taskId,
    h.inputRef,
    h.outputRef,
    JSON.stringify(h.evidenceRefs),
    h.status,
    h.validationSummary,
    h.correlationId,
    h.createdAt,
  );
}

export function persistAgentExecutionEventInDb(event: AgentFactoryEvent): void {
  if (!event.projectId) return;
  const db = getAuditDb();
  db.prepare(
    `INSERT OR IGNORE INTO agent_execution_events (
      id, tenant_id, project_id, workflow_id, task_id, agent_id,
      event_type, status, summary, error_summary, progress_pct,
      metadata_json, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.tenantId,
    event.projectId,
    event.workflowId,
    event.taskId,
    event.agentId,
    event.eventType,
    event.status,
    event.summary,
    event.errorSummary,
    event.progressPct,
    JSON.stringify({
      taskTitle: event.taskTitle,
      sourceAgentId: event.sourceAgentId,
      destinationAgentId: event.destinationAgentId,
      evidenceUrl: event.evidenceUrl,
      provider: event.provider ?? null,
      model: event.model ?? null,
      inputTokens: event.inputTokens ?? null,
      outputTokens: event.outputTokens ?? null,
      durationMs: event.durationMs ?? null,
    }),
    event.timestamp,
  );
}

export function listRecentPersistedAgentEvents(
  tenantId: string,
  projectId: string,
  limit = 60,
): AgentFactoryEvent[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM agent_execution_events
       WHERE tenant_id = ? AND project_id = ?
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(tenantId, projectId, limit) as Record<string, unknown>[];

  return rows.map((r) => {
    const meta = parseJson<Record<string, unknown>>(r.metadata_json, {});
    return {
      id: String(r.id),
      eventType: String(r.event_type) as AgentFactoryEventType,
      tenantId: String(r.tenant_id),
      projectId: r.project_id ? String(r.project_id) : null,
      workflowId: String(r.workflow_id),
      taskId: String(r.task_id),
      agentId: String(r.agent_id) as AgentId,
      sourceAgentId: meta.sourceAgentId ? (String(meta.sourceAgentId) as AgentId) : null,
      destinationAgentId: meta.destinationAgentId
        ? (String(meta.destinationAgentId) as AgentId)
        : null,
      status: String(r.status) as AgentFactoryEvent['status'],
      taskTitle: String(meta.taskTitle ?? r.agent_id),
      summary: String(r.summary),
      progressPct:
        r.progress_pct === null || r.progress_pct === undefined
          ? null
          : Number(r.progress_pct),
      errorSummary: r.error_summary ? String(r.error_summary) : null,
      evidenceUrl: meta.evidenceUrl ? String(meta.evidenceUrl) : null,
      timestamp: String(r.timestamp),
      provider: meta.provider ? String(meta.provider) : null,
      model: meta.model ? String(meta.model) : null,
      inputTokens: typeof meta.inputTokens === 'number' ? meta.inputTokens : null,
      outputTokens: typeof meta.outputTokens === 'number' ? meta.outputTokens : null,
      durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : null,
    };
  });
}

export function createApprovalRequestInDb(
  req: WorkflowApprovalRequest,
): void {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO agent_approval_requests (
      id, tenant_id, project_id, workflow_id, task_id, gate_type,
      title, summary, status, requested_by, approver_id, approver_name,
      approver_role, comments, version_ref, output_id, audit_history_json,
      created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    req.id,
    req.tenantId,
    req.projectId,
    req.workflowId,
    req.taskId,
    req.gateType,
    req.title,
    req.summary,
    req.status,
    req.requestedBy,
    req.approverId,
    req.approverName,
    req.approverRole,
    req.comments,
    req.versionRef,
    req.outputId,
    JSON.stringify(req.auditHistory),
    req.createdAt,
    req.decidedAt,
  );
}

export function listApprovalRequestsInDb(
  tenantId: string,
  projectId: string,
  status?: ApprovalDecisionStatus,
): WorkflowApprovalRequest[] {
  const db = getAuditDb();
  const rows = status
    ? (db
        .prepare(
          `SELECT * FROM agent_approval_requests
           WHERE tenant_id = ? AND project_id = ? AND status = ?
           ORDER BY created_at DESC LIMIT 60`,
        )
        .all(tenantId, projectId, status) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM agent_approval_requests
           WHERE tenant_id = ? AND project_id = ?
           ORDER BY created_at DESC LIMIT 60`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapApprovalRow);
}

export function getApprovalRequestByIdInDb(
  tenantId: string,
  approvalId: string,
): WorkflowApprovalRequest | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      'SELECT * FROM agent_approval_requests WHERE tenant_id = ? AND id = ?',
    )
    .get(tenantId, approvalId) as Record<string, unknown> | undefined;
  return row ? mapApprovalRow(row) : null;
}

export function updateApprovalRequestInDb(params: {
  tenantId: string;
  approvalId: string;
  status: ApprovalDecisionStatus;
  approverId: string;
  approverName: string;
  approverRole: string;
  comments: string;
  auditHistory: ApprovalAuditHistoryEntry[];
  decidedAt: string;
}): WorkflowApprovalRequest | null {
  const db = getAuditDb();
  db.prepare(
    `UPDATE agent_approval_requests
     SET status = ?,
         approver_id = ?,
         approver_name = ?,
         approver_role = ?,
         comments = ?,
         audit_history_json = ?,
         decided_at = ?
     WHERE tenant_id = ? AND id = ?`,
  ).run(
    params.status,
    params.approverId,
    params.approverName,
    params.approverRole,
    params.comments,
    JSON.stringify(params.auditHistory),
    params.decidedAt,
    params.tenantId,
    params.approvalId,
  );
  return getApprovalRequestByIdInDb(params.tenantId, params.approvalId);
}

export function listAgentConfigsInDb(
  tenantId: string,
  projectId: string,
): AgentConfigRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      'SELECT * FROM agent_configurations WHERE tenant_id = ? AND project_id = ?',
    )
    .all(tenantId, projectId) as Record<string, unknown>[];
  const byId = new Map<AgentStationId, AgentConfigRecord>();
  for (const r of rows) {
    const aid = String(r.agent_id) as AgentStationId;
    byId.set(aid, {
      id: String(r.id),
      tenantId: String(r.tenant_id),
      projectId: String(r.project_id),
      agentId: aid,
      enabled: Number(r.enabled ?? 1) === 1,
      maxRetries: Number(r.max_retries ?? 2),
      timeoutMs: Number(r.timeout_ms ?? 60_000),
      preferredModel: String(r.preferred_model ?? 'gemini-4-hydrogen'),
      updatedBy: String(r.updated_by),
      updatedAt: String(r.updated_at),
    });
  }

  return AGENT_STATION_IDS.map(
    (aid) =>
      byId.get(aid) ?? {
        id: `cfg-default-${aid}`,
        tenantId,
        projectId,
        agentId: aid,
        enabled: true,
        maxRetries: 2,
        timeoutMs: 60_000,
        preferredModel: 'gemini-4-hydrogen',
        updatedBy: 'System Default',
        updatedAt: '',
      },
  );
}

export function upsertAgentConfigInDb(params: {
  tenantId: string;
  projectId: string;
  agentId: AgentStationId;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  preferredModel: string;
  updatedBy: string;
}): AgentConfigRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `acfg-${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO agent_configurations (
      id, tenant_id, project_id, agent_id, enabled, max_retries,
      timeout_ms, preferred_model, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, project_id, agent_id)
    DO UPDATE SET
      enabled = excluded.enabled,
      max_retries = excluded.max_retries,
      timeout_ms = excluded.timeout_ms,
      preferred_model = excluded.preferred_model,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.agentId,
    params.enabled ? 1 : 0,
    Math.max(0, Math.min(5, params.maxRetries)),
    Math.max(5_000, Math.min(300_000, params.timeoutMs)),
    params.preferredModel.trim() || 'gemini-4-hydrogen',
    params.updatedBy,
    now,
  );
  return (
    listAgentConfigsInDb(params.tenantId, params.projectId).find(
      (c) => c.agentId === params.agentId,
    ) ?? {
      id,
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
      enabled: params.enabled,
      maxRetries: params.maxRetries,
      timeoutMs: params.timeoutMs,
      preferredModel: params.preferredModel,
      updatedBy: params.updatedBy,
      updatedAt: now,
    }
  );
}

export function getPerAgentMetricsMapInDb(
  tenantId: string,
  projectId: string,
): Map<AgentId, AgentPerformanceMetrics> {
  const db = getAuditDb();
  const taskStats = db
    .prepare(
      `SELECT agent_id,
              SUM(CASE WHEN status IN ('queued', 'retrying') THEN 1 ELSE 0 END) AS queue_depth,
              SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
              SUM(CASE WHEN status = 'waiting_for_approval' THEN 1 ELSE 0 END) AS waiting_count,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
              SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS retry_count
       FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ?
       GROUP BY agent_id`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];

  const execStats = db
    .prepare(
      `SELECT agent_id,
              AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avg_dur,
              MAX(started_at) AS latest_start,
              SUM(CASE WHEN input_tokens IS NOT NULL THEN input_tokens ELSE 0 END) AS sum_in,
              SUM(CASE WHEN output_tokens IS NOT NULL THEN output_tokens ELSE 0 END) AS sum_out,
              SUM(CASE WHEN input_tokens IS NOT NULL OR output_tokens IS NOT NULL THEN 1 ELSE 0 END) AS token_rows
       FROM agent_executions
       WHERE tenant_id = ? AND project_id = ?
       GROUP BY agent_id`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];

  const latestExecs = db
    .prepare(
      `SELECT ae.agent_id, ae.duration_ms, ae.provider, ae.model
       FROM agent_executions ae
       INNER JOIN (
         SELECT agent_id, MAX(started_at) AS max_start
         FROM agent_executions
         WHERE tenant_id = ? AND project_id = ?
         GROUP BY agent_id
       ) latest ON latest.agent_id = ae.agent_id AND latest.max_start = ae.started_at
       WHERE ae.tenant_id = ? AND ae.project_id = ?`,
    )
    .all(tenantId, projectId, tenantId, projectId) as Record<string, unknown>[];

  const taskByAgent = new Map(taskStats.map((r) => [String(r.agent_id), r]));
  const execByAgent = new Map(execStats.map((r) => [String(r.agent_id), r]));
  const lastExecByAgent = new Map(latestExecs.map((r) => [String(r.agent_id), r]));

  const out = new Map<AgentId, AgentPerformanceMetrics>();
  const allIds: AgentId[] = ['orchestrator', ...AGENT_STATION_IDS];

  for (const agentId of allIds) {
    const t = taskByAgent.get(agentId);
    const e = execByAgent.get(agentId);
    const l = lastExecByAgent.get(agentId);
    const hasTokens = Number(e?.token_rows ?? 0) > 0;
    out.set(agentId, {
      queueDepth: Number(t?.queue_depth ?? 0),
      runningCount: Number(t?.running_count ?? 0),
      waitingApprovalCount: Number(t?.waiting_count ?? 0),
      completedCount: Number(t?.completed_count ?? 0),
      failedCount: Number(t?.failed_count ?? 0),
      retryCount: Number(t?.retry_count ?? 0),
      avgDurationMs:
        e?.avg_dur !== null && e?.avg_dur !== undefined
          ? Math.round(Number(e.avg_dur))
          : null,
      lastDurationMs:
        l?.duration_ms !== null && l?.duration_ms !== undefined
          ? Number(l.duration_ms)
          : null,
      totalInputTokens: hasTokens ? Number(e?.sum_in ?? 0) : null,
      totalOutputTokens: hasTokens ? Number(e?.sum_out ?? 0) : null,
      tokenUsageAvailable: hasTokens,
      lastProvider: l?.provider ? String(l.provider) : null,
      lastModel: l?.model ? String(l.model) : null,
    });
  }

  return out;
}

export function getProjectExecutionTelemetrySummaryInDb(
  tenantId: string,
  projectId: string,
) {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total_exec,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_exec,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_exec,
              AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avg_dur,
              SUM(CASE WHEN input_tokens IS NOT NULL THEN input_tokens ELSE 0 END) AS sum_in,
              SUM(CASE WHEN output_tokens IS NOT NULL THEN output_tokens ELSE 0 END) AS sum_out,
              SUM(CASE WHEN total_tokens IS NOT NULL THEN total_tokens ELSE 0 END) AS sum_total,
              SUM(CASE WHEN input_tokens IS NOT NULL OR output_tokens IS NOT NULL THEN 1 ELSE 0 END) AS token_rows
       FROM agent_executions
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .get(tenantId, projectId) as Record<string, unknown>;

  const retryRow = db
    .prepare(
      `SELECT SUM(CASE WHEN attempt_count > 1 THEN attempt_count - 1 ELSE 0 END) AS total_retries
       FROM agent_tasks WHERE tenant_id = ? AND project_id = ?`,
    )
    .get(tenantId, projectId) as Record<string, unknown>;

  const hasTokens = Number(row?.token_rows ?? 0) > 0;
  return {
    totalExecutions: Number(row?.total_exec ?? 0),
    completedExecutions: Number(row?.completed_exec ?? 0),
    failedExecutions: Number(row?.failed_exec ?? 0),
    totalRetries: Number(retryRow?.total_retries ?? 0),
    measuredInputTokens: hasTokens ? Number(row?.sum_in ?? 0) : null,
    measuredOutputTokens: hasTokens ? Number(row?.sum_out ?? 0) : null,
    measuredTotalTokens: hasTokens ? Number(row?.sum_total ?? 0) : null,
    avgExecutionDurationMs:
      row?.avg_dur !== null && row?.avg_dur !== undefined
        ? Math.round(Number(row.avg_dur))
        : null,
  };
}

/**
 * Restores interrupted in-flight tasks/workflows cleanly on server boot so persistent SQLite
 * queue state never silently vanishes or gets falsely marked Completed after process restarts.
 */
export function recoverInterruptedAgentWorkflowsInDb(): number {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const interruptedTasks = db
    .prepare(
      "SELECT id, workflow_id, tenant_id, attempt_count, max_retries FROM agent_tasks WHERE status = 'running'",
    )
    .all() as Record<string, unknown>[];

  if (interruptedTasks.length === 0) return 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of interruptedTasks) {
      const attempt = Number(t.attempt_count ?? 1);
      const maxRetries = Number(t.max_retries ?? 2);
      if (attempt < maxRetries) {
        db.prepare(
          `UPDATE agent_tasks
           SET status = 'queued',
               blocking_reason = 'Re-queued automatically after server restart recovery',
               started_at = NULL,
               updated_at = ?
           WHERE id = ?`,
        ).run(now, String(t.id));
      } else {
        db.prepare(
          `UPDATE agent_tasks
           SET status = 'failed',
               error_summary = 'Interrupted by server restart after exhausting retries',
               completed_at = ?,
               updated_at = ?
           WHERE id = ?`,
        ).run(now, now, String(t.id));
      }
    }

    db.prepare(
      `UPDATE agent_executions
       SET status = 'failed',
           error_message = 'Execution interrupted by server restart',
           completed_at = ?
       WHERE status = 'running'`,
    ).run(now);

    db.prepare(
      `UPDATE agent_workflows
       SET current_stage = 'Recovering interrupted tasks',
           updated_at = ?
       WHERE status = 'running'`,
    ).run(now);

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  return interruptedTasks.length;
}

export function insertDynamicDelegatedNodeAndTaskInDb(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  nodeKey: string;
  agentId: AgentStationId;
  title: string;
  parentNodeKey: string;
  downstreamNodeKeys?: string[];
  maxRetries?: number;
  timeoutMs?: number;
  config?: Record<string, unknown>;
}): WorkflowTaskRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const nodeId = `wfnode-${crypto.randomUUID().slice(0, 12)}`;
  const taskId = `task-${crypto.randomUUID().slice(0, 12)}`;
  const maxRetries = Math.max(0, Math.min(3, Number(params.maxRetries ?? 1)));
  const timeoutMs = Math.max(5_000, Math.min(180_000, Number(params.timeoutMs ?? 60_000)));

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO agent_workflow_nodes (
        id, tenant_id, project_id, workflow_id, node_key, agent_id, title,
        condition_json, approval_gate_type, approval_required, max_retries,
        timeout_ms, config_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', NULL, 0, ?, ?, ?, ?)`,
    ).run(
      nodeId,
      params.tenantId,
      params.projectId,
      params.workflowId,
      params.nodeKey,
      params.agentId,
      params.title,
      maxRetries,
      timeoutMs,
      JSON.stringify(params.config ?? {}),
      now,
    );

    db.prepare(
      `INSERT INTO agent_tasks (
        id, tenant_id, project_id, workflow_id, node_key, agent_id, title,
        status, attempt_count, max_retries, next_retry_at, blocking_reason,
        error_summary, approval_required, approval_gate_type, started_at,
        completed_at, duration_ms, output_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(
      taskId,
      params.tenantId,
      params.projectId,
      params.workflowId,
      params.nodeKey,
      params.agentId,
      params.title,
      maxRetries,
      now,
      now,
    );

    const insertEdge = db.prepare(
      `INSERT OR IGNORE INTO agent_workflow_edges (
        id, tenant_id, project_id, workflow_id, from_node_key, to_node_key
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    insertEdge.run(
      `edge-${crypto.randomUUID().slice(0, 12)}`,
      params.tenantId,
      params.projectId,
      params.workflowId,
      params.parentNodeKey,
      params.nodeKey,
    );

    for (const downstreamKey of params.downstreamNodeKeys ?? []) {
      if (downstreamKey && downstreamKey !== params.nodeKey && downstreamKey !== params.parentNodeKey) {
        insertEdge.run(
          `edge-${crypto.randomUUID().slice(0, 12)}`,
          params.tenantId,
          params.projectId,
          params.workflowId,
          params.nodeKey,
          downstreamKey,
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }

  const row = db
    .prepare('SELECT * FROM agent_tasks WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, taskId) as Record<string, unknown>;
  return mapTaskRow(row);
}

export function listAgentOutputsForProjectInDb(
  tenantId: string,
  projectId: string,
  workflowId?: string | null,
  limit = 100,
): AgentOutputRecord[] {
  const db = getAuditDb();
  const rows = workflowId
    ? (db
        .prepare(
          `SELECT * FROM agent_outputs
           WHERE tenant_id = ? AND project_id = ? AND workflow_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(tenantId, projectId, workflowId, limit) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM agent_outputs
           WHERE tenant_id = ? AND project_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(tenantId, projectId, limit) as Record<string, unknown>[]);
  return rows.map(mapOutputRow);
}

