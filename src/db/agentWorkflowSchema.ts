import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Drizzle ORM SQLite schema for the Rovix AI Multi-Agent Workflow & Collaboration Engine
 * (Stages 2 & 3). Column names match the production SQLite migrations
 * (`007_stage2_multi_agent_orchestration` and `008_stage3_agent_collaboration`)
 * in `src/server/audit/db.ts`.
 */

export const workflows = sqliteTable(
  'agent_workflows',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    templateId: text('template_id').notNull(),
    name: text('name').notNull(),
    objective: text('objective').notNull().default(''),
    status: text('status').notNull().default('queued'),
    currentStage: text('current_stage').notNull().default('Initializing'),
    blockingReason: text('blocking_reason'),
    createdBy: text('created_by').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    cancelledAt: text('cancelled_at'),
    configJson: text('config_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_agent_wf_tenant_proj').on(table.tenantId, table.projectId, table.updatedAt),
    index('idx_agent_wf_status').on(table.status, table.updatedAt),
  ],
);

export const workflowNodes = sqliteTable(
  'agent_workflow_nodes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    nodeKey: text('node_key').notNull(),
    agentId: text('agent_id').notNull(),
    title: text('title').notNull(),
    conditionJson: text('condition_json').notNull().default('{}'),
    approvalGateType: text('approval_gate_type'),
    approvalRequired: integer('approval_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    maxRetries: integer('max_retries').notNull().default(2),
    timeoutMs: integer('timeout_ms').notNull().default(60_000),
    configJson: text('config_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_agent_wf_nodes_wf_key').on(table.workflowId, table.nodeKey),
    index('idx_agent_wf_nodes_wf').on(table.tenantId, table.workflowId),
  ],
);

export const workflowEdges = sqliteTable(
  'agent_workflow_edges',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    fromNodeKey: text('from_node_key').notNull(),
    toNodeKey: text('to_node_key').notNull(),
  },
  (table) => [
    uniqueIndex('uq_agent_wf_edges_pair').on(
      table.workflowId,
      table.fromNodeKey,
      table.toNodeKey,
    ),
    index('idx_agent_wf_edges_wf').on(table.tenantId, table.workflowId),
  ],
);

export const tasks = sqliteTable(
  'agent_tasks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    nodeKey: text('node_key').notNull(),
    agentId: text('agent_id').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(2),
    nextRetryAt: text('next_retry_at'),
    blockingReason: text('blocking_reason'),
    errorSummary: text('error_summary'),
    approvalRequired: integer('approval_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    approvalGateType: text('approval_gate_type'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    outputId: text('output_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_agent_tasks_wf_node').on(table.workflowId, table.nodeKey),
    index('idx_agent_tasks_wf').on(table.tenantId, table.projectId, table.workflowId, table.status),
    index('idx_agent_tasks_agent').on(table.tenantId, table.projectId, table.agentId, table.updatedAt),
  ],
);

export const agentExecutions = sqliteTable(
  'agent_executions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    attemptNumber: integer('attempt_number').notNull().default(1),
    provider: text('provider').notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    durationMs: integer('duration_ms'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    index('idx_agent_exec_wf').on(table.tenantId, table.projectId, table.workflowId, table.startedAt),
    index('idx_agent_exec_agent').on(table.tenantId, table.projectId, table.agentId, table.startedAt),
  ],
);

export const agentOutputs = sqliteTable(
  'agent_outputs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    schemaVersion: text('schema_version').notNull().default('1.0'),
    summary: text('summary').notNull(),
    payloadJson: text('payload_json').notNull(),
    evidenceRefsJson: text('evidence_refs_json').notNull().default('[]'),
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_agent_outputs_wf').on(table.tenantId, table.projectId, table.workflowId, table.createdAt),
  ],
);

export const handoffs = sqliteTable(
  'agent_handoffs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    executionId: text('execution_id')
      .notNull()
      .references(() => agentExecutions.id, { onDelete: 'cascade' }),
    sourceAgentId: text('source_agent_id').notNull(),
    destinationAgentId: text('destination_agent_id').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    inputRef: text('input_ref').notNull(),
    outputRef: text('output_ref').notNull(),
    evidenceRefsJson: text('evidence_refs_json').notNull().default('[]'),
    status: text('status').notNull().default('validated'),
    validationSummary: text('validation_summary').notNull().default(''),
    correlationId: text('correlation_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_agent_handoffs_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.createdAt,
    ),
  ],
);

export const approvalStates = sqliteTable(
  'agent_approval_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    gateType: text('gate_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    status: text('status').notNull().default('pending'),
    requestedBy: text('requested_by').notNull(),
    approverId: text('approver_id'),
    approverName: text('approver_name'),
    approverRole: text('approver_role'),
    comments: text('comments').notNull().default(''),
    versionRef: text('version_ref').notNull(),
    outputId: text('output_id').references(() => agentOutputs.id, { onDelete: 'set null' }),
    auditHistoryJson: text('audit_history_json').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (table) => [
    index('idx_agent_approvals_proj').on(
      table.tenantId,
      table.projectId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const agentExecutionEvents = sqliteTable(
  'agent_execution_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    agentId: text('agent_id').notNull(),
    eventType: text('event_type').notNull(),
    status: text('status').notNull(),
    summary: text('summary').notNull(),
    errorSummary: text('error_summary'),
    progressPct: integer('progress_pct'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    timestamp: text('timestamp').notNull(),
  },
  (table) => [
    index('idx_agent_events_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.timestamp,
    ),
  ],
);

export const agentConfigurations = sqliteTable(
  'agent_configurations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    agentId: text('agent_id').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    maxRetries: integer('max_retries').notNull().default(2),
    timeoutMs: integer('timeout_ms').notNull().default(60_000),
    preferredModel: text('preferred_model').notNull().default('gemini-4-hydrogen'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_agent_cfg_proj_agent').on(table.tenantId, table.projectId, table.agentId),
  ],
);

// ============================================================================
// STAGE 3: ADVANCED MULTI-AGENT COLLABORATION & COMMUNICATION TABLES
// ============================================================================

export const agentMessages = sqliteTable(
  'agent_messages',
  {
    messageId: text('message_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    executionId: text('execution_id').notNull(),
    sourceAgentId: text('source_agent_id').notNull(),
    destinationAgentId: text('destination_agent_id').notNull(),
    messageType: text('message_type').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'),
    evidenceReferencesJson: text('evidence_references_json').notNull().default('[]'),
    correlationId: text('correlation_id').notNull(),
    replyToMessageId: text('reply_to_message_id'),
    status: text('status').notNull().default('sent'),
    errorSummary: text('error_summary'),
    timestamp: text('timestamp').notNull(),
  },
  (table) => [
    index('idx_agent_messages_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.timestamp,
    ),
    index('idx_agent_messages_corr').on(table.tenantId, table.correlationId),
  ],
);

export const workflowContextItems = sqliteTable(
  'workflow_context_items',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    contextScope: text('context_scope').notNull(),
    contextKey: text('context_key').notNull(),
    version: integer('version').notNull().default(1),
    source: text('source').notNull(),
    sourceAgentId: text('source_agent_id'),
    approvalStatus: text('approval_status').notNull().default('unverified'),
    isApprovedLock: integer('is_approved_lock', { mode: 'boolean' })
      .notNull()
      .default(false),
    supersedesId: text('supersedes_id'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' })
      .notNull()
      .default(false),
    payloadJson: text('payload_json').notNull().default('{}'),
    evidenceReferencesJson: text('evidence_references_json').notNull().default('[]'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uq_wf_ctx_key_version').on(
      table.workflowId,
      table.contextScope,
      table.contextKey,
      table.version,
    ),
    index('idx_wf_ctx_proj_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.contextScope,
    ),
  ],
);

export const agentDelegations = sqliteTable(
  'agent_delegations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    parentTaskId: text('parent_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    delegatedTaskId: text('delegated_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    sourceAgentId: text('source_agent_id').notNull(),
    targetAgentId: text('target_agent_id').notNull(),
    messageId: text('message_id').references(() => agentMessages.messageId, {
      onDelete: 'set null',
    }),
    responseMessageId: text('response_message_id').references(() => agentMessages.messageId, {
      onDelete: 'set null',
    }),
    delegationDepth: integer('delegation_depth').notNull().default(1),
    status: text('status').notNull().default('requested'),
    reason: text('reason').notNull(),
    requestedObjective: text('requested_objective').notNull().default(''),
    errorSummary: text('error_summary'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    index('idx_agent_delegations_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.createdAt,
    ),
  ],
);

export const workflowConflicts = sqliteTable(
  'workflow_conflicts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    conflictType: text('conflict_type').notNull(),
    severity: text('severity').notNull().default('medium'),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    agentAId: text('agent_a_id').notNull(),
    agentBId: text('agent_b_id').notNull(),
    outputARef: text('output_a_ref').notNull(),
    outputBRef: text('output_b_ref').notNull(),
    outputASnapshotJson: text('output_a_snapshot_json').notNull().default('{}'),
    outputBSnapshotJson: text('output_b_snapshot_json').notNull().default('{}'),
    affectedNodeKeysJson: text('affected_node_keys_json').notNull().default('[]'),
    verificationMessageId: text('verification_message_id').references(
      () => agentMessages.messageId,
      { onDelete: 'set null' },
    ),
    requiresHumanReview: integer('requires_human_review', { mode: 'boolean' })
      .notNull()
      .default(true),
    status: text('status').notNull().default('open'),
    selectedResolution: text('selected_resolution'),
    resolutionNote: text('resolution_note'),
    resolvedBy: text('resolved_by'),
    resolvedByName: text('resolved_by_name'),
    resolvedByRole: text('resolved_by_role'),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
  },
  (table) => [
    index('idx_wf_conflicts_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.status,
    ),
  ],
);

// ============================================================================
// DRIZZLE RELATIONS (DAG + EXECUTION + HANDOFF + APPROVAL + COLLABORATION)
// ============================================================================

export const workflowsRelations = relations(workflows, ({ many }) => ({
  nodes: many(workflowNodes),
  edges: many(workflowEdges),
  tasks: many(tasks),
  executions: many(agentExecutions),
  outputs: many(agentOutputs),
  handoffs: many(handoffs),
  approvalStates: many(approvalStates),
  events: many(agentExecutionEvents),
  messages: many(agentMessages),
  contextItems: many(workflowContextItems),
  delegations: many(agentDelegations),
  conflicts: many(workflowConflicts),
}));

export const workflowNodesRelations = relations(workflowNodes, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowNodes.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowEdgesRelations = relations(workflowEdges, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowEdges.workflowId],
    references: [workflows.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [tasks.workflowId],
    references: [workflows.id],
  }),
  executions: many(agentExecutions),
  outputs: many(agentOutputs),
  handoffs: many(handoffs),
  approvalStates: many(approvalStates),
}));

export const agentExecutionsRelations = relations(agentExecutions, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [agentExecutions.workflowId],
    references: [workflows.id],
  }),
  task: one(tasks, {
    fields: [agentExecutions.taskId],
    references: [tasks.id],
  }),
  handoffs: many(handoffs),
}));

export const agentOutputsRelations = relations(agentOutputs, ({ one }) => ({
  workflow: one(workflows, {
    fields: [agentOutputs.workflowId],
    references: [workflows.id],
  }),
  task: one(tasks, {
    fields: [agentOutputs.taskId],
    references: [tasks.id],
  }),
}));

export const handoffsRelations = relations(handoffs, ({ one }) => ({
  workflow: one(workflows, {
    fields: [handoffs.workflowId],
    references: [workflows.id],
  }),
  execution: one(agentExecutions, {
    fields: [handoffs.executionId],
    references: [agentExecutions.id],
  }),
  task: one(tasks, {
    fields: [handoffs.taskId],
    references: [tasks.id],
  }),
}));

export const approvalStatesRelations = relations(approvalStates, ({ one }) => ({
  workflow: one(workflows, {
    fields: [approvalStates.workflowId],
    references: [workflows.id],
  }),
  task: one(tasks, {
    fields: [approvalStates.taskId],
    references: [tasks.id],
  }),
  output: one(agentOutputs, {
    fields: [approvalStates.outputId],
    references: [agentOutputs.id],
  }),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  workflow: one(workflows, {
    fields: [agentMessages.workflowId],
    references: [workflows.id],
  }),
}));

export const workflowContextItemsRelations = relations(workflowContextItems, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowContextItems.workflowId],
    references: [workflows.id],
  }),
}));

export const agentDelegationsRelations = relations(agentDelegations, ({ one }) => ({
  workflow: one(workflows, {
    fields: [agentDelegations.workflowId],
    references: [workflows.id],
  }),
  parentTask: one(tasks, {
    fields: [agentDelegations.parentTaskId],
    references: [tasks.id],
    relationName: 'delegationParentTask',
  }),
  delegatedTask: one(tasks, {
    fields: [agentDelegations.delegatedTaskId],
    references: [tasks.id],
    relationName: 'delegationChildTask',
  }),
  requestMessage: one(agentMessages, {
    fields: [agentDelegations.messageId],
    references: [agentMessages.messageId],
    relationName: 'delegationRequestMessage',
  }),
  responseMessage: one(agentMessages, {
    fields: [agentDelegations.responseMessageId],
    references: [agentMessages.messageId],
    relationName: 'delegationResponseMessage',
  }),
}));

export const workflowConflictsRelations = relations(workflowConflicts, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowConflicts.workflowId],
    references: [workflows.id],
  }),
  verificationMessage: one(agentMessages, {
    fields: [workflowConflicts.verificationMessageId],
    references: [agentMessages.messageId],
  }),
}));

// ============================================================================
// STAGE 4: VISUAL WORKFLOW BUILDER & AUTOMATION STUDIO TABLES
// ============================================================================

export const studioWorkflows = sqliteTable(
  'studio_workflows',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'),
    activeVersionNumber: integer('active_version_number').notNull().default(1),
    publishedVersionId: text('published_version_id'),
    draftGraphJson: text('draft_graph_json').notNull().default('{"nodes":[],"edges":[]}'),
    lastValidationJson: text('last_validation_json'),
    lastExecutionWorkflowId: text('last_execution_workflow_id'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_studio_wf_proj').on(table.tenantId, table.projectId, table.updatedAt),
  ],
);

export const studioWorkflowVersions = sqliteTable(
  'studio_workflow_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    studioWorkflowId: text('studio_workflow_id')
      .notNull()
      .references(() => studioWorkflows.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull().default('snapshot'),
    changeSummary: text('change_summary').notNull().default(''),
    graphJson: text('graph_json').notNull(),
    validationJson: text('validation_json').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_studio_wf_ver_num').on(table.studioWorkflowId, table.versionNumber),
    index('idx_studio_wf_versions_wf').on(
      table.tenantId,
      table.projectId,
      table.studioWorkflowId,
      table.versionNumber,
    ),
  ],
);

export const studioWorkflowTemplates = sqliteTable(
  'studio_workflow_templates',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id'),
    name: text('name').notNull(),
    category: text('category').notNull().default('Custom'),
    description: text('description').notNull().default(''),
    graphJson: text('graph_json').notNull(),
    requiredProvidersJson: text('required_providers_json').notNull().default('[]'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_studio_tpl_tenant').on(table.tenantId, table.createdAt)],
);

export const studioValidationReports = sqliteTable(
  'studio_validation_reports',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    studioWorkflowId: text('studio_workflow_id')
      .notNull()
      .references(() => studioWorkflows.id, { onDelete: 'cascade' }),
    valid: integer('valid', { mode: 'boolean' }).notNull().default(false),
    errorCount: integer('error_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    reportJson: text('report_json').notNull(),
    validatedBy: text('validated_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_studio_val_wf').on(table.tenantId, table.studioWorkflowId, table.createdAt),
  ],
);

export const studioWorkflowExecutions = sqliteTable(
  'studio_workflow_executions',
  {
    workflowId: text('workflow_id')
      .primaryKey()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    studioWorkflowId: text('studio_workflow_id')
      .notNull()
      .references(() => studioWorkflows.id, { onDelete: 'cascade' }),
    studioVersionId: text('studio_version_id')
      .notNull()
      .references(() => studioWorkflowVersions.id, { onDelete: 'cascade' }),
    studioVersionNumber: integer('studio_version_number').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_studio_exec_wf').on(
      table.tenantId,
      table.projectId,
      table.studioWorkflowId,
      table.createdAt,
    ),
  ],
);

export const studioWorkflowsRelations = relations(studioWorkflows, ({ many }) => ({
  versions: many(studioWorkflowVersions),
  validations: many(studioValidationReports),
  executions: many(studioWorkflowExecutions),
}));

export const studioWorkflowVersionsRelations = relations(studioWorkflowVersions, ({ one }) => ({
  studioWorkflow: one(studioWorkflows, {
    fields: [studioWorkflowVersions.studioWorkflowId],
    references: [studioWorkflows.id],
  }),
}));

export const studioValidationReportsRelations = relations(studioValidationReports, ({ one }) => ({
  studioWorkflow: one(studioWorkflows, {
    fields: [studioValidationReports.studioWorkflowId],
    references: [studioWorkflows.id],
  }),
}));

export const studioWorkflowExecutionsRelations = relations(studioWorkflowExecutions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [studioWorkflowExecutions.workflowId],
    references: [workflows.id],
  }),
  studioWorkflow: one(studioWorkflows, {
    fields: [studioWorkflowExecutions.studioWorkflowId],
    references: [studioWorkflows.id],
  }),
  studioVersion: one(studioWorkflowVersions, {
    fields: [studioWorkflowExecutions.studioVersionId],
    references: [studioWorkflowVersions.id],
  }),
}));

// ============================================================================
// STAGE 5: TOKEN CONSUMPTION, API COST & PERFORMANCE INTELLIGENCE TABLES
// ============================================================================

export const providerUsageEvents = sqliteTable(
  'provider_usage_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id'),
    executionId: text('execution_id'),
    taskId: text('task_id'),
    agentId: text('agent_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    requestTimestamp: text('request_timestamp').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    totalTokens: integer('total_tokens'),
    providerRequestId: text('provider_request_id'),
    usageSource: text('usage_source').notNull().default('unavailable'),
    measurementStatus: text('measurement_status').notNull().default('unavailable'),
    latencyMs: integer('latency_ms'),
    status: text('status').notNull().default('succeeded'),
    errorType: text('error_type'),
    isQuotaError: integer('is_quota_error', { mode: 'boolean' }).notNull().default(false),
    isRetry: integer('is_retry', { mode: 'boolean' }).notNull().default(false),
    attemptNumber: integer('attempt_number').notNull().default(1),
    rawUsageMetadataJson: text('raw_usage_metadata_json'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_usage_events_tenant_proj_ts').on(
      table.tenantId,
      table.projectId,
      table.requestTimestamp,
    ),
    index('idx_usage_events_workflow').on(table.tenantId, table.projectId, table.workflowId),
    index('idx_usage_events_agent').on(
      table.tenantId,
      table.projectId,
      table.agentId,
      table.requestTimestamp,
    ),
  ],
);

export const providerPricingVersions = sqliteTable(
  'provider_pricing_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputPricePer1mMicros: integer('input_price_per_1m_micros'),
    outputPricePer1mMicros: integer('output_price_per_1m_micros'),
    cachedInputPricePer1mMicros: integer('cached_input_price_per_1m_micros'),
    currency: text('currency').notNull().default('USD'),
    effectiveDate: text('effective_date').notNull(),
    sourceOfPricing: text('source_of_pricing').notNull(),
    sourceType: text('source_type').notNull().default('unconfigured'),
    pricingVersion: text('pricing_version').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    configuredBy: text('configured_by'),
    auditNote: text('audit_note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_pricing_lookup').on(
      table.provider,
      table.model,
      table.isActive,
      table.effectiveDate,
    ),
  ],
);

export const usageCostCalculations = sqliteTable(
  'usage_cost_calculations',
  {
    id: text('id').primaryKey(),
    usageEventId: text('usage_event_id')
      .notNull()
      .references(() => providerUsageEvents.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id'),
    agentId: text('agent_id').notNull(),
    pricingVersionId: text('pricing_version_id').references(
      () => providerPricingVersions.id,
      { onDelete: 'set null' },
    ),
    pricingVersionLabel: text('pricing_version_label'),
    pricingSourceLabel: text('pricing_source_label'),
    costBasis: text('cost_basis').notNull().default('unavailable'),
    currency: text('currency').notNull().default('USD'),
    inputCostMicros: integer('input_cost_micros'),
    outputCostMicros: integer('output_cost_micros'),
    cachedInputCostMicros: integer('cached_input_cost_micros'),
    totalCostMicros: integer('total_cost_micros'),
    unavailableReason: text('unavailable_reason'),
    calculatedAt: text('calculated_at').notNull(),
  },
  (table) => [
    index('idx_usage_costs_tenant_proj').on(
      table.tenantId,
      table.projectId,
      table.calculatedAt,
    ),
    index('idx_usage_costs_workflow').on(table.tenantId, table.projectId, table.workflowId),
  ],
);

export const usageBudgetConfigs = sqliteTable(
  'usage_budget_configs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id'),
    scopeType: text('scope_type').notNull().default('project'),
    scopeTargetId: text('scope_target_id'),
    agentId: text('agent_id'),
    name: text('name').notNull(),
    periodType: text('period_type').notNull().default('monthly'),
    budgetLimitMicros: integer('budget_limit_micros'),
    maxExecutionCostMicros: integer('max_execution_cost_micros'),
    maxTokensPerRun: integer('max_tokens_per_run'),
    warningThresholdPct: integer('warning_threshold_pct').notNull().default(80),
    enforcementPolicy: text('enforcement_policy').notNull().default('warn_only'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_usage_budgets_tenant_proj').on(table.tenantId, table.projectId, table.enabled),
  ],
);

export const usageBudgetAlerts = sqliteTable(
  'usage_budget_alerts',
  {
    id: text('id').primaryKey(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => usageBudgetConfigs.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id'),
    workflowId: text('workflow_id'),
    agentId: text('agent_id'),
    alertType: text('alert_type').notNull(),
    periodWindow: text('period_window').notNull(),
    measuredSpendMicros: integer('measured_spend_micros').notNull().default(0),
    budgetLimitMicros: integer('budget_limit_micros'),
    measuredTokens: integer('measured_tokens'),
    tokenLimit: integer('token_limit'),
    message: text('message').notNull(),
    acknowledgedBy: text('acknowledged_by'),
    acknowledgedAt: text('acknowledged_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_usage_alerts_tenant_proj').on(table.tenantId, table.projectId, table.createdAt),
  ],
);

export const usageReconciliationRecords = sqliteTable(
  'usage_reconciliation_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    underlyingEventCount: integer('underlying_event_count').notNull().default(0),
    measuredEventCount: integer('measured_event_count').notNull().default(0),
    unavailableCostEventCount: integer('unavailable_cost_event_count').notNull().default(0),
    sumEventCostMicros: integer('sum_event_cost_micros').notNull().default(0),
    aggregatedWorkflowCostMicros: integer('aggregated_workflow_cost_micros')
      .notNull()
      .default(0),
    isReconciled: integer('is_reconciled', { mode: 'boolean' }).notNull().default(true),
    discrepancyMicros: integer('discrepancy_micros').notNull().default(0),
    unavailableComponentsJson: text('unavailable_components_json').notNull().default('[]'),
    reconciledAt: text('reconciled_at').notNull(),
  },
  (table) => [
    index('idx_usage_reconcile_wf').on(
      table.tenantId,
      table.projectId,
      table.workflowId,
      table.reconciledAt,
    ),
  ],
);

export const usageCostCalculationsRelations = relations(
  usageCostCalculations,
  ({ one }) => ({
    usageEvent: one(providerUsageEvents, {
      fields: [usageCostCalculations.usageEventId],
      references: [providerUsageEvents.id],
    }),
    pricingVersion: one(providerPricingVersions, {
      fields: [usageCostCalculations.pricingVersionId],
      references: [providerPricingVersions.id],
    }),
  }),
);

export const usageBudgetAlertsRelations = relations(usageBudgetAlerts, ({ one }) => ({
  budget: one(usageBudgetConfigs, {
    fields: [usageBudgetAlerts.budgetId],
    references: [usageBudgetConfigs.id],
  }),
}));

// ============================================================================
// STAGE 6: AUTONOMOUS OPERATIONS, SCHEDULING & SELF-HEALING RUNTIME TABLES
// ============================================================================

export const workflowSchedules = sqliteTable(
  'workflow_schedules',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    targetKind: text('target_kind').notNull().default('workflow_template'),
    templateId: text('template_id'),
    studioWorkflowId: text('studio_workflow_id'),
    workflowObjective: text('workflow_objective').notNull().default(''),
    frequency: text('frequency').notNull().default('daily'),
    minuteOfHour: integer('minute_of_hour').notNull().default(0),
    hourOfDay: integer('hour_of_day'),
    daysOfWeekJson: text('days_of_week_json').notNull().default('[]'),
    dayOfMonth: integer('day_of_month'),
    runAtIso: text('run_at_iso'),
    timezone: text('timezone').notNull().default('UTC'),
    executionWindowJson: text('execution_window_json'),
    catchUpPolicy: text('catch_up_policy').notNull().default('skip'),
    maxCatchUpRuns: integer('max_catch_up_runs').notNull().default(3),
    status: text('status').notNull().default('active'),
    nextRunAt: text('next_run_at'),
    lastRunAt: text('last_run_at'),
    lastWorkflowId: text('last_workflow_id'),
    lastRunStatus: text('last_run_status'),
    lastError: text('last_error'),
    totalRuns: integer('total_runs').notNull().default(0),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_wf_schedules_proj').on(table.tenantId, table.projectId, table.updatedAt),
    index('idx_wf_schedules_due').on(table.status, table.nextRunAt),
  ],
);

export const workflowTriggerSubscriptions = sqliteTable(
  'workflow_trigger_subscriptions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    triggerType: text('trigger_type').notNull(),
    targetKind: text('target_kind').notNull().default('workflow_template'),
    templateId: text('template_id'),
    studioWorkflowId: text('studio_workflow_id'),
    workflowObjective: text('workflow_objective').notNull().default(''),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    filterConfigJson: text('filter_config_json').notNull().default('{}'),
    webhookSecretHash: text('webhook_secret_hash'),
    webhookSecretEnc: text('webhook_secret_enc'),
    webhookSecretHint: text('webhook_secret_hint'),
    rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(30),
    totalTriggered: integer('total_triggered').notNull().default(0),
    lastTriggeredAt: text('last_triggered_at'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_wf_triggers_proj').on(
      table.tenantId,
      table.projectId,
      table.triggerType,
      table.enabled,
    ),
  ],
);

export const workflowTriggerEvents = sqliteTable(
  'workflow_trigger_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    subscriptionId: text('subscription_id'),
    triggerType: text('trigger_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceRef: text('source_ref'),
    status: text('status').notNull(),
    payloadSummary: text('payload_summary').notNull().default(''),
    payloadJson: text('payload_json').notNull().default('{}'),
    launchedWorkflowId: text('launched_workflow_id'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_wf_trigger_events_idem').on(table.tenantId, table.idempotencyKey),
    index('idx_wf_trigger_events_proj').on(table.tenantId, table.projectId, table.createdAt),
  ],
);

export const workflowWorkerLeases = sqliteTable(
  'workflow_worker_leases',
  {
    leaseKey: text('lease_key').primaryKey(),
    leaseKind: text('lease_kind').notNull(),
    resourceId: text('resource_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workerId: text('worker_id').notNull(),
    acquiredAt: text('acquired_at').notNull(),
    heartbeatAt: text('heartbeat_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    status: text('status').notNull().default('active'),
  },
  (table) => [
    index('idx_wf_leases_expiry').on(table.status, table.expiresAt),
    index('idx_wf_leases_proj').on(table.tenantId, table.projectId, table.status),
  ],
);

export const workflowRecoveryRecords = sqliteTable(
  'workflow_recovery_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    taskId: text('task_id'),
    actionType: text('action_type').notNull(),
    previousStatus: text('previous_status').notNull(),
    newStatus: text('new_status').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    relatedWorkflowId: text('related_workflow_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_wf_recovery_proj').on(table.tenantId, table.projectId, table.createdAt),
  ],
);

export const workflowDeadLetterTasks = sqliteTable(
  'workflow_dead_letter_tasks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    workflowName: text('workflow_name').notNull(),
    taskId: text('task_id').notNull(),
    nodeKey: text('node_key').notNull(),
    agentId: text('agent_id').notNull(),
    taskTitle: text('task_title').notNull(),
    errorClassification: text('error_classification').notNull().default('retryable'),
    errorCode: text('error_code').notNull().default('EXECUTION_ERROR'),
    errorMessage: text('error_message').notNull(),
    attemptCount: integer('attempt_count').notNull().default(1),
    maxRetries: integer('max_retries').notNull().default(2),
    status: text('status').notNull().default('open'),
    replayedWorkflowId: text('replayed_workflow_id'),
    resolvedBy: text('resolved_by'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_wf_dlq_proj').on(table.tenantId, table.projectId, table.status, table.createdAt),
  ],
);

export const autonomyPolicies = sqliteTable(
  'autonomy_policies',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    autonomyMode: text('autonomy_mode').notNull().default('automatic_low_risk'),
    maxConcurrentWorkflows: integer('max_concurrent_workflows').notNull().default(3),
    maxActiveAgentTasks: integer('max_active_agent_tasks').notNull().default(6),
    maxWorkflowDurationMs: integer('max_workflow_duration_ms').notNull().default(900_000),
    maxTokensPerWorkflow: integer('max_tokens_per_workflow'),
    maxSpendMicrosPerRun: integer('max_spend_micros_per_run'),
    allowedTemplatesJson: text('allowed_templates_json').notNull().default('[]'),
    allowedAgentsJson: text('allowed_agents_json').notNull().default('[]'),
    requireApprovalForHighImpact: integer('require_approval_for_high_impact', {
      mode: 'boolean',
    })
      .notNull()
      .default(true),
    highImpactActionTypesJson: text('high_impact_action_types_json')
      .notNull()
      .default(
        '["content_publishing","destructive_changes","external_outreach","publishing_readiness","generated_content"]',
      ),
    allowAutonomousRetries: integer('allow_autonomous_retries', { mode: 'boolean' })
      .notNull()
      .default(true),
    allowExternalWebhooks: integer('allow_external_webhooks', { mode: 'boolean' })
      .notNull()
      .default(true),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('uq_autonomy_policy_proj').on(table.tenantId, table.projectId)],
);

export const schedulerExecutionLogs = sqliteTable(
  'scheduler_execution_logs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    scheduleName: text('schedule_name').notNull(),
    workerId: text('worker_id').notNull(),
    scheduledForIso: text('scheduled_for_iso').notNull(),
    executedAtIso: text('executed_at_iso').notNull(),
    outcome: text('outcome').notNull(),
    launchedWorkflowId: text('launched_workflow_id'),
    message: text('message').notNull(),
  },
  (table) => [
    index('idx_sched_logs_proj').on(table.tenantId, table.projectId, table.executedAtIso),
    index('idx_sched_logs_sched').on(table.scheduleId, table.executedAtIso),
  ],
);

export const runtimeWorkerHeartbeats = sqliteTable('runtime_worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  status: text('status').notNull().default('healthy'),
  startedAt: text('started_at').notNull(),
  lastHeartbeatAt: text('last_heartbeat_at').notNull(),
  activeLeasesCount: integer('active_leases_count').notNull().default(0),
  processedTicks: integer('processed_ticks').notNull().default(0),
  lastTickDurationMs: integer('last_tick_duration_ms'),
  lastError: text('last_error'),
});

// Exported canonical Drizzle entity names & inferred TypeScript models
export const Workflow = workflows;
export const WorkflowNode = workflowNodes;
export const WorkflowEdge = workflowEdges;
export const Task = tasks;
export const AgentExecution = agentExecutions;
export const AgentOutput = agentOutputs;
export const Handoff = handoffs;
export const ApprovalState = approvalStates;
export const AgentMessage = agentMessages;
export const WorkflowContextItem = workflowContextItems;
export const AgentDelegation = agentDelegations;
export const WorkflowConflict = workflowConflicts;
export const StudioWorkflow = studioWorkflows;
export const StudioWorkflowVersion = studioWorkflowVersions;
export const StudioWorkflowTemplate = studioWorkflowTemplates;
export const StudioValidationReportModel = studioValidationReports;
export const StudioWorkflowExecutionLink = studioWorkflowExecutions;
export const ProviderUsageEvent = providerUsageEvents;
export const ProviderPricingVersion = providerPricingVersions;
export const UsageCostCalculation = usageCostCalculations;
export const UsageBudgetConfig = usageBudgetConfigs;
export const UsageBudgetAlert = usageBudgetAlerts;
export const UsageReconciliation = usageReconciliationRecords;
export const WorkflowSchedule = workflowSchedules;
export const WorkflowTriggerSubscription = workflowTriggerSubscriptions;
export const WorkflowTriggerEvent = workflowTriggerEvents;
export const WorkflowWorkerLease = workflowWorkerLeases;
export const WorkflowRecovery = workflowRecoveryRecords;
export const WorkflowDeadLetterTask = workflowDeadLetterTasks;
export const AutonomyPolicy = autonomyPolicies;
export const SchedulerExecutionLog = schedulerExecutionLogs;
export const RuntimeWorkerHeartbeat = runtimeWorkerHeartbeats;

export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;
export type WorkflowNodeRow = typeof workflowNodes.$inferSelect;
export type WorkflowEdgeRow = typeof workflowEdges.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type AgentExecutionRow = typeof agentExecutions.$inferSelect;
export type HandoffRow = typeof handoffs.$inferSelect;
export type ApprovalStateRow = typeof approvalStates.$inferSelect;
export type AgentMessageRow = typeof agentMessages.$inferSelect;
export type WorkflowContextItemRow = typeof workflowContextItems.$inferSelect;
export type AgentDelegationRow = typeof agentDelegations.$inferSelect;
export type WorkflowConflictRow = typeof workflowConflicts.$inferSelect;
export type StudioWorkflowRow = typeof studioWorkflows.$inferSelect;
export type StudioWorkflowVersionRow = typeof studioWorkflowVersions.$inferSelect;
export type StudioWorkflowTemplateRow = typeof studioWorkflowTemplates.$inferSelect;
export type ProviderUsageEventRow = typeof providerUsageEvents.$inferSelect;
export type ProviderPricingVersionRow = typeof providerPricingVersions.$inferSelect;
export type UsageCostCalculationRow = typeof usageCostCalculations.$inferSelect;
export type UsageBudgetConfigRow = typeof usageBudgetConfigs.$inferSelect;
export type UsageBudgetAlertRow = typeof usageBudgetAlerts.$inferSelect;
export type UsageReconciliationRow = typeof usageReconciliationRecords.$inferSelect;
export type WorkflowScheduleRow = typeof workflowSchedules.$inferSelect;
export type WorkflowTriggerSubscriptionRow = typeof workflowTriggerSubscriptions.$inferSelect;
export type WorkflowTriggerEventRow = typeof workflowTriggerEvents.$inferSelect;
export type WorkflowWorkerLeaseRow = typeof workflowWorkerLeases.$inferSelect;
export type WorkflowRecoveryRow = typeof workflowRecoveryRecords.$inferSelect;
export type WorkflowDeadLetterTaskRow = typeof workflowDeadLetterTasks.$inferSelect;
export type AutonomyPolicyRow = typeof autonomyPolicies.$inferSelect;
export type SchedulerExecutionLogRow = typeof schedulerExecutionLogs.$inferSelect;
export type RuntimeWorkerHeartbeatRow = typeof runtimeWorkerHeartbeats.$inferSelect;

export const agentWorkflowSchema = {
  workflows,
  workflowNodes,
  workflowEdges,
  tasks,
  agentExecutions,
  agentOutputs,
  handoffs,
  approvalStates,
  agentExecutionEvents,
  agentConfigurations,
  agentMessages,
  workflowContextItems,
  agentDelegations,
  workflowConflicts,
  studioWorkflows,
  studioWorkflowVersions,
  studioWorkflowTemplates,
  studioValidationReports,
  studioWorkflowExecutions,
  providerUsageEvents,
  providerPricingVersions,
  usageCostCalculations,
  usageBudgetConfigs,
  usageBudgetAlerts,
  usageReconciliationRecords,
  workflowSchedules,
  workflowTriggerSubscriptions,
  workflowTriggerEvents,
  workflowWorkerLeases,
  workflowRecoveryRecords,
  workflowDeadLetterTasks,
  autonomyPolicies,
  schedulerExecutionLogs,
  runtimeWorkerHeartbeats,
  workflowsRelations,
  workflowNodesRelations,
  workflowEdgesRelations,
  tasksRelations,
  agentExecutionsRelations,
  agentOutputsRelations,
  handoffsRelations,
  approvalStatesRelations,
  agentMessagesRelations,
  workflowContextItemsRelations,
  agentDelegationsRelations,
  workflowConflictsRelations,
  studioWorkflowsRelations,
  studioWorkflowVersionsRelations,
  studioValidationReportsRelations,
  studioWorkflowExecutionsRelations,
  usageCostCalculationsRelations,
  usageBudgetAlertsRelations,
};
