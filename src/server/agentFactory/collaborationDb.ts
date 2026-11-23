import crypto from 'node:crypto';
import type {
  AgentDelegationRecord,
  AgentDelegationStatus,
  AgentId,
  AgentMessageRecord,
  AgentMessageStatus,
  AgentMessageType,
  AgentStationId,
  ContextApprovalStatus,
  WorkflowConflictRecord,
  WorkflowConflictStatus,
  WorkflowConflictType,
  WorkflowContextItemRecord,
  WorkflowContextScope,
} from '../../types/agentFactory';
import { getAuditDb } from '../audit/db';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapMessageRow(row: Record<string, unknown>): AgentMessageRecord {
  return {
    messageId: String(row.message_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    executionId: String(row.execution_id),
    sourceAgentId: String(row.source_agent_id) as AgentId,
    destinationAgentId: String(row.destination_agent_id) as AgentId,
    messageType: String(row.message_type) as AgentMessageType,
    payload: safeJsonParse<Record<string, unknown>>(row.payload_json, {}),
    evidenceReferences: safeJsonParse<string[]>(row.evidence_references_json, []),
    correlationId: String(row.correlation_id),
    replyToMessageId: row.reply_to_message_id ? String(row.reply_to_message_id) : null,
    timestamp: String(row.timestamp),
    status: String(row.status) as AgentMessageStatus,
    errorSummary: row.error_summary ? String(row.error_summary) : null,
  };
}

function mapContextRow(row: Record<string, unknown>): WorkflowContextItemRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    contextScope: String(row.context_scope) as WorkflowContextScope,
    contextKey: String(row.context_key),
    version: Number(row.version ?? 1),
    source: String(row.source),
    sourceAgentId: row.source_agent_id ? (String(row.source_agent_id) as AgentId) : null,
    approvalStatus: String(row.approval_status) as ContextApprovalStatus,
    isApprovedLock: Boolean(row.is_approved_lock),
    supersedesId: row.supersedes_id ? String(row.supersedes_id) : null,
    conflictFlag: Boolean(row.conflict_flag),
    payload: safeJsonParse<Record<string, unknown>>(row.payload_json, {}),
    evidenceReferences: safeJsonParse<string[]>(row.evidence_references_json, []),
    createdAt: String(row.created_at),
  };
}

function mapDelegationRow(row: Record<string, unknown>): AgentDelegationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    parentTaskId: String(row.parent_task_id),
    delegatedTaskId: row.delegated_task_id ? String(row.delegated_task_id) : null,
    sourceAgentId: String(row.source_agent_id) as AgentId,
    targetAgentId: String(row.target_agent_id) as AgentStationId,
    messageId: row.message_id ? String(row.message_id) : null,
    responseMessageId: row.response_message_id ? String(row.response_message_id) : null,
    delegationDepth: Number(row.delegation_depth ?? 1),
    status: String(row.status) as AgentDelegationStatus,
    reason: String(row.reason),
    requestedObjective: String(row.requested_objective ?? ''),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapConflictRow(row: Record<string, unknown>): WorkflowConflictRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    conflictType: String(row.conflict_type) as WorkflowConflictType,
    severity: String(row.severity) as 'high' | 'medium' | 'low',
    title: String(row.title),
    summary: String(row.summary),
    agentAId: String(row.agent_a_id) as AgentId,
    agentBId: String(row.agent_b_id) as AgentId,
    outputARef: String(row.output_a_ref),
    outputBRef: String(row.output_b_ref),
    outputASnapshot: safeJsonParse<Record<string, unknown>>(row.output_a_snapshot_json, {}),
    outputBSnapshot: safeJsonParse<Record<string, unknown>>(row.output_b_snapshot_json, {}),
    affectedNodeKeys: safeJsonParse<string[]>(row.affected_node_keys_json, []),
    verificationMessageId: row.verification_message_id
      ? String(row.verification_message_id)
      : null,
    requiresHumanReview: Boolean(row.requires_human_review),
    status: String(row.status) as WorkflowConflictStatus,
    selectedResolution: row.selected_resolution
      ? (String(row.selected_resolution) as 'keep_a' | 'keep_b' | 'custom')
      : null,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    resolvedByName: row.resolved_by_name ? String(row.resolved_by_name) : null,
    resolvedByRole: row.resolved_by_role ? String(row.resolved_by_role) : null,
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

// ============================================================================
// AGENT MESSAGES CRUD
// ============================================================================

export function insertAgentMessage(input: {
  messageId?: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  executionId: string;
  sourceAgentId: AgentId;
  destinationAgentId: AgentId;
  messageType: AgentMessageType;
  payload: Record<string, unknown>;
  evidenceReferences: string[];
  correlationId?: string;
  replyToMessageId?: string | null;
  status?: AgentMessageStatus;
  errorSummary?: string | null;
  timestamp?: string;
}): AgentMessageRecord {
  const db = getAuditDb();
  const messageId = input.messageId ?? `msg-${crypto.randomUUID().slice(0, 12)}`;
  const correlationId = input.correlationId ?? `corr-${crypto.randomUUID().slice(0, 12)}`;
  const timestamp = input.timestamp ?? new Date().toISOString();
  const status: AgentMessageStatus = input.status ?? 'sent';

  db.prepare(`
    INSERT INTO agent_messages (
      message_id, tenant_id, project_id, workflow_id, execution_id,
      source_agent_id, destination_agent_id, message_type,
      payload_json, evidence_references_json, correlation_id,
      reply_to_message_id, status, error_summary, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    input.tenantId,
    input.projectId,
    input.workflowId,
    input.executionId,
    input.sourceAgentId,
    input.destinationAgentId,
    input.messageType,
    JSON.stringify(input.payload ?? {}),
    JSON.stringify(input.evidenceReferences ?? []),
    correlationId,
    input.replyToMessageId ?? null,
    status,
    input.errorSummary ?? null,
    timestamp,
  );

  return {
    messageId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    workflowId: input.workflowId,
    executionId: input.executionId,
    sourceAgentId: input.sourceAgentId,
    destinationAgentId: input.destinationAgentId,
    messageType: input.messageType,
    payload: input.payload ?? {},
    evidenceReferences: input.evidenceReferences ?? [],
    correlationId,
    replyToMessageId: input.replyToMessageId ?? null,
    timestamp,
    status,
    errorSummary: input.errorSummary ?? null,
  };
}

export function updateAgentMessageStatus(
  tenantId: string,
  messageId: string,
  status: AgentMessageStatus,
  errorSummary?: string | null,
): void {
  const db = getAuditDb();
  db.prepare(`
    UPDATE agent_messages
    SET status = ?, error_summary = COALESCE(?, error_summary)
    WHERE tenant_id = ? AND message_id = ?
  `).run(status, errorSummary ?? null, tenantId, messageId);
}

export function listAgentMessages(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  agentId?: string | null;
  messageType?: string | null;
  status?: string | null;
  search?: string | null;
  limit?: number;
}): AgentMessageRecord[] {
  const db = getAuditDb();
  const clauses = ['tenant_id = ?', 'project_id = ?'];
  const values: Array<string | number> = [params.tenantId, params.projectId];

  if (params.workflowId) {
    clauses.push('workflow_id = ?');
    values.push(params.workflowId);
  }
  if (params.agentId) {
    clauses.push('(source_agent_id = ? OR destination_agent_id = ?)');
    values.push(params.agentId, params.agentId);
  }
  if (params.messageType) {
    clauses.push('message_type = ?');
    values.push(params.messageType);
  }
  if (params.status) {
    clauses.push('status = ?');
    values.push(params.status);
  }
  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim()}%`;
    clauses.push(
      '(payload_json LIKE ? OR message_type LIKE ? OR source_agent_id LIKE ? OR destination_agent_id LIKE ? OR correlation_id LIKE ?)',
    );
    values.push(q, q, q, q, q);
  }

  values.push(Math.max(1, Math.min(200, params.limit ?? 100)));

  const rows = db
    .prepare(
      `SELECT * FROM agent_messages
       WHERE ${clauses.join(' AND ')}
       ORDER BY timestamp DESC, rowid DESC
       LIMIT ?`,
    )
    .all(...values) as Record<string, unknown>[];

  return rows.map(mapMessageRow);
}

// ============================================================================
// SHARED WORKFLOW CONTEXT CRUD (VERSIONED + APPROVED-LOCK PROTECTED)
// ============================================================================

export function listWorkflowContextItems(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  contextScope?: WorkflowContextScope | null;
  limit?: number;
}): WorkflowContextItemRecord[] {
  const db = getAuditDb();
  const clauses = ['tenant_id = ?', 'project_id = ?'];
  const values: Array<string | number> = [params.tenantId, params.projectId];

  if (params.workflowId) {
    clauses.push('workflow_id = ?');
    values.push(params.workflowId);
  }
  if (params.contextScope) {
    clauses.push('context_scope = ?');
    values.push(params.contextScope);
  }

  values.push(Math.max(1, Math.min(200, params.limit ?? 120)));

  const rows = db
    .prepare(
      `SELECT * FROM workflow_context_items
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, version DESC, rowid DESC
       LIMIT ?`,
    )
    .all(...values) as Record<string, unknown>[];

  return rows.map(mapContextRow);
}

export function getLatestWorkflowContextItem(
  tenantId: string,
  projectId: string,
  workflowId: string,
  contextScope: WorkflowContextScope,
  contextKey: string,
): WorkflowContextItemRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM workflow_context_items
       WHERE tenant_id = ? AND project_id = ? AND workflow_id = ?
         AND context_scope = ? AND context_key = ?
       ORDER BY version DESC
       LIMIT 1`,
    )
    .get(tenantId, projectId, workflowId, contextScope, contextKey) as
    | Record<string, unknown>
    | undefined;
  return row ? mapContextRow(row) : null;
}

export function insertWorkflowContextItem(input: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  contextScope: WorkflowContextScope;
  contextKey: string;
  source: string;
  sourceAgentId: AgentId | null;
  approvalStatus: ContextApprovalStatus;
  isApprovedLock: boolean;
  supersedesId?: string | null;
  conflictFlag?: boolean;
  payload: Record<string, unknown>;
  evidenceReferences: string[];
}): WorkflowContextItemRecord {
  const db = getAuditDb();
  const latest = getLatestWorkflowContextItem(
    input.tenantId,
    input.projectId,
    input.workflowId,
    input.contextScope,
    input.contextKey,
  );
  const nextVersion = latest ? latest.version + 1 : 1;
  const id = `ctx-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO workflow_context_items (
      id, tenant_id, project_id, workflow_id, context_scope, context_key,
      version, source, source_agent_id, approval_status, is_approved_lock,
      supersedes_id, conflict_flag, payload_json, evidence_references_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.tenantId,
    input.projectId,
    input.workflowId,
    input.contextScope,
    input.contextKey,
    nextVersion,
    input.source,
    input.sourceAgentId,
    input.approvalStatus,
    input.isApprovedLock ? 1 : 0,
    input.supersedesId ?? latest?.id ?? null,
    input.conflictFlag ? 1 : 0,
    JSON.stringify(input.payload ?? {}),
    JSON.stringify(input.evidenceReferences ?? []),
    createdAt,
  );

  return {
    id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    workflowId: input.workflowId,
    contextScope: input.contextScope,
    contextKey: input.contextKey,
    version: nextVersion,
    source: input.source,
    sourceAgentId: input.sourceAgentId,
    approvalStatus: input.approvalStatus,
    isApprovedLock: input.isApprovedLock,
    supersedesId: input.supersedesId ?? latest?.id ?? null,
    conflictFlag: Boolean(input.conflictFlag),
    payload: input.payload ?? {},
    evidenceReferences: input.evidenceReferences ?? [],
    createdAt,
  };
}

// ============================================================================
// AGENT DELEGATIONS CRUD
// ============================================================================

export function insertAgentDelegation(input: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  parentTaskId: string;
  delegatedTaskId?: string | null;
  sourceAgentId: AgentId;
  targetAgentId: AgentStationId;
  messageId?: string | null;
  delegationDepth: number;
  status?: AgentDelegationStatus;
  reason: string;
  requestedObjective: string;
  errorSummary?: string | null;
}): AgentDelegationRecord {
  const db = getAuditDb();
  const id = `del-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();
  const status: AgentDelegationStatus = input.status ?? 'requested';

  db.prepare(`
    INSERT INTO agent_delegations (
      id, tenant_id, project_id, workflow_id, parent_task_id, delegated_task_id,
      source_agent_id, target_agent_id, message_id, response_message_id,
      delegation_depth, status, reason, requested_objective, error_summary,
      created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    input.tenantId,
    input.projectId,
    input.workflowId,
    input.parentTaskId,
    input.delegatedTaskId ?? null,
    input.sourceAgentId,
    input.targetAgentId,
    input.messageId ?? null,
    input.delegationDepth,
    status,
    input.reason,
    input.requestedObjective,
    input.errorSummary ?? null,
    createdAt,
  );

  return {
    id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    workflowId: input.workflowId,
    parentTaskId: input.parentTaskId,
    delegatedTaskId: input.delegatedTaskId ?? null,
    sourceAgentId: input.sourceAgentId,
    targetAgentId: input.targetAgentId,
    messageId: input.messageId ?? null,
    responseMessageId: null,
    delegationDepth: input.delegationDepth,
    status,
    reason: input.reason,
    requestedObjective: input.requestedObjective,
    errorSummary: input.errorSummary ?? null,
    createdAt,
    completedAt: null,
  };
}

export function updateAgentDelegation(
  tenantId: string,
  delegationId: string,
  patch: {
    delegatedTaskId?: string | null;
    responseMessageId?: string | null;
    status?: AgentDelegationStatus;
    errorSummary?: string | null;
    completedAt?: string | null;
  },
): void {
  const db = getAuditDb();
  const sets: string[] = [];
  const values: Array<string | null> = [];

  if (patch.delegatedTaskId !== undefined) {
    sets.push('delegated_task_id = ?');
    values.push(patch.delegatedTaskId);
  }
  if (patch.responseMessageId !== undefined) {
    sets.push('response_message_id = ?');
    values.push(patch.responseMessageId);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.errorSummary !== undefined) {
    sets.push('error_summary = ?');
    values.push(patch.errorSummary);
  }
  if (patch.completedAt !== undefined) {
    sets.push('completed_at = ?');
    values.push(patch.completedAt);
  }
  if (sets.length === 0) return;

  values.push(tenantId, delegationId);
  db.prepare(
    `UPDATE agent_delegations SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`,
  ).run(...values);
}

export function listAgentDelegations(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  limit?: number;
}): AgentDelegationRecord[] {
  const db = getAuditDb();
  const clauses = ['tenant_id = ?', 'project_id = ?'];
  const values: Array<string | number> = [params.tenantId, params.projectId];

  if (params.workflowId) {
    clauses.push('workflow_id = ?');
    values.push(params.workflowId);
  }
  values.push(Math.max(1, Math.min(200, params.limit ?? 100)));

  const rows = db
    .prepare(
      `SELECT * FROM agent_delegations
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(...values) as Record<string, unknown>[];

  return rows.map(mapDelegationRow);
}

export function getDelegationByDelegatedTaskId(
  tenantId: string,
  delegatedTaskId: string,
): AgentDelegationRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM agent_delegations
       WHERE tenant_id = ? AND delegated_task_id = ?
       LIMIT 1`,
    )
    .get(tenantId, delegatedTaskId) as Record<string, unknown> | undefined;
  return row ? mapDelegationRow(row) : null;
}

export function countActiveDelegationsForTenant(tenantId: string): number {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM agent_delegations
       WHERE tenant_id = ? AND status IN ('requested', 'scheduled', 'running')`,
    )
    .get(tenantId) as { cnt: number } | undefined;
  return Number(row?.cnt ?? 0);
}

// ============================================================================
// WORKFLOW CONFLICTS CRUD
// ============================================================================

export function insertWorkflowConflict(input: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  conflictType: WorkflowConflictType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  agentAId: AgentId;
  agentBId: AgentId;
  outputARef: string;
  outputBRef: string;
  outputASnapshot: Record<string, unknown>;
  outputBSnapshot: Record<string, unknown>;
  affectedNodeKeys: string[];
  verificationMessageId?: string | null;
  requiresHumanReview: boolean;
  status?: WorkflowConflictStatus;
}): WorkflowConflictRecord {
  const db = getAuditDb();
  // Prevent exact duplicate open conflicts for the same workflow + output pair
  const existing = db
    .prepare(
      `SELECT * FROM workflow_conflicts
       WHERE tenant_id = ? AND project_id = ? AND workflow_id = ?
         AND conflict_type = ? AND output_a_ref = ? AND output_b_ref = ?
       LIMIT 1`,
    )
    .get(
      input.tenantId,
      input.projectId,
      input.workflowId,
      input.conflictType,
      input.outputARef,
      input.outputBRef,
    ) as Record<string, unknown> | undefined;
  if (existing) {
    return mapConflictRow(existing);
  }

  const id = `cfl-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();
  const status: WorkflowConflictStatus = input.status ?? 'open';

  db.prepare(`
    INSERT INTO workflow_conflicts (
      id, tenant_id, project_id, workflow_id, conflict_type, severity,
      title, summary, agent_a_id, agent_b_id, output_a_ref, output_b_ref,
      output_a_snapshot_json, output_b_snapshot_json, affected_node_keys_json,
      verification_message_id, requires_human_review, status,
      selected_resolution, resolution_note, resolved_by, resolved_by_name,
      resolved_by_role, created_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL)
  `).run(
    id,
    input.tenantId,
    input.projectId,
    input.workflowId,
    input.conflictType,
    input.severity,
    input.title,
    input.summary,
    input.agentAId,
    input.agentBId,
    input.outputARef,
    input.outputBRef,
    JSON.stringify(input.outputASnapshot ?? {}),
    JSON.stringify(input.outputBSnapshot ?? {}),
    JSON.stringify(input.affectedNodeKeys ?? []),
    input.verificationMessageId ?? null,
    input.requiresHumanReview ? 1 : 0,
    status,
    createdAt,
  );

  return {
    id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    workflowId: input.workflowId,
    conflictType: input.conflictType,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    agentAId: input.agentAId,
    agentBId: input.agentBId,
    outputARef: input.outputARef,
    outputBRef: input.outputBRef,
    outputASnapshot: input.outputASnapshot ?? {},
    outputBSnapshot: input.outputBSnapshot ?? {},
    affectedNodeKeys: input.affectedNodeKeys ?? [],
    verificationMessageId: input.verificationMessageId ?? null,
    requiresHumanReview: input.requiresHumanReview,
    status,
    selectedResolution: null,
    resolutionNote: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedByRole: null,
    createdAt,
    resolvedAt: null,
  };
}

export function getWorkflowConflictById(
  tenantId: string,
  projectId: string,
  conflictId: string,
): WorkflowConflictRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM workflow_conflicts
       WHERE tenant_id = ? AND project_id = ? AND id = ?
       LIMIT 1`,
    )
    .get(tenantId, projectId, conflictId) as Record<string, unknown> | undefined;
  return row ? mapConflictRow(row) : null;
}

export function listWorkflowConflicts(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  status?: WorkflowConflictStatus | null;
  limit?: number;
}): WorkflowConflictRecord[] {
  const db = getAuditDb();
  const clauses = ['tenant_id = ?', 'project_id = ?'];
  const values: Array<string | number> = [params.tenantId, params.projectId];

  if (params.workflowId) {
    clauses.push('workflow_id = ?');
    values.push(params.workflowId);
  }
  if (params.status) {
    clauses.push('status = ?');
    values.push(params.status);
  }

  values.push(Math.max(1, Math.min(200, params.limit ?? 100)));

  const rows = db
    .prepare(
      `SELECT * FROM workflow_conflicts
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(...values) as Record<string, unknown>[];

  return rows.map(mapConflictRow);
}

export function resolveWorkflowConflictRecord(input: {
  tenantId: string;
  projectId: string;
  conflictId: string;
  status: 'resolved' | 'dismissed';
  selectedResolution: 'keep_a' | 'keep_b' | 'custom';
  resolutionNote: string;
  resolvedBy: string;
  resolvedByName: string;
  resolvedByRole: string;
}): WorkflowConflictRecord | null {
  const db = getAuditDb();
  const resolvedAt = new Date().toISOString();
  db.prepare(`
    UPDATE workflow_conflicts
    SET status = ?,
        selected_resolution = ?,
        resolution_note = ?,
        resolved_by = ?,
        resolved_by_name = ?,
        resolved_by_role = ?,
        resolved_at = ?
    WHERE tenant_id = ? AND project_id = ? AND id = ?
  `).run(
    input.status,
    input.selectedResolution,
    input.resolutionNote,
    input.resolvedBy,
    input.resolvedByName,
    input.resolvedByRole,
    resolvedAt,
    input.tenantId,
    input.projectId,
    input.conflictId,
  );
  return getWorkflowConflictById(input.tenantId, input.projectId, input.conflictId);
}
