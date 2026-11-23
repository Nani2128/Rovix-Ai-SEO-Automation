export type AgentStationId =
  | 'research_agent'
  | 'competitor_intelligence_agent'
  | 'keyword_intelligence_agent'
  | 'geographic_intelligence_agent'
  | 'technical_seo_agent'
  | 'performance_analysis_agent'
  | 'content_strategy_agent'
  | 'content_generation_agent'
  | 'quality_assurance_agent'
  | 'reporting_agent';

export type AgentId = 'orchestrator' | AgentStationId;

export type AgentExecutionState =
  | 'idle'
  | 'scheduled'
  | 'waiting_for_trigger'
  | 'queued'
  | 'running'
  | 'communicating'
  | 'waiting_for_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'recovered'
  | 'cancelled'
  | 'unavailable';

export type AgentFactoryEventType =
  | 'agent.queued'
  | 'agent.started'
  | 'agent.progress'
  | 'agent.communication'
  | 'handoff.recorded'
  | 'task.waiting_approval'
  | 'approval.decided'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.retrying'
  | 'agent.cancelled'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.cancelled'
  | 'workflow.paused'
  | 'workflow.resumed'
  | 'workflow.recovered'
  | 'schedule.triggered'
  | 'trigger.fired'
  | 'task.dead_lettered'
  | 'agent.message.sent'
  | 'agent.message.delivered'
  | 'agent.message.failed'
  | 'agent.delegation.created'
  | 'agent.delegation.completed'
  | 'context.versioned'
  | 'conflict.detected'
  | 'conflict.resolved';

export type AgentAvailabilityStatus = 'connected' | 'partial' | 'unavailable';

export interface AgentCatalogDefinition {
  agentId: AgentId;
  name: string;
  shortName: string;
  role: string;
  description: string;
  isOrchestrator: boolean;
  accentHex: string;
  propKind:
    | 'core'
    | 'radar'
    | 'compare'
    | 'tags'
    | 'globe'
    | 'server'
    | 'gauge'
    | 'docs'
    | 'quill'
    | 'shield'
    | 'chart';
  connectedAgentIds: AgentId[];
}

export interface AgentFactoryEvent {
  id: string;
  eventType: AgentFactoryEventType;
  tenantId: string;
  projectId: string | null;
  workflowId: string;
  taskId: string;
  agentId: AgentId;
  sourceAgentId: AgentId | null;
  destinationAgentId: AgentId | null;
  status: AgentExecutionState;
  taskTitle: string;
  summary: string;
  /** Null unless the real backend job reports exact numeric progress. */
  progressPct: number | null;
  errorSummary: string | null;
  evidenceUrl: string | null;
  timestamp: string;
  correlationId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
}

export interface AgentCurrentTask {
  taskId: string;
  workflowId: string;
  title: string;
  startedAt: string;
  progressPct: number | null;
  evidenceUrl: string | null;
}

export interface AgentLastExecution {
  status: AgentExecutionState;
  summary: string;
  timestamp: string;
  errorSummary: string | null;
  evidenceUrl: string | null;
}

export interface AgentPerformanceMetrics {
  queueDepth: number;
  runningCount: number;
  waitingApprovalCount: number;
  completedCount: number;
  failedCount: number;
  retryCount: number;
  avgDurationMs: number | null;
  lastDurationMs: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  tokenUsageAvailable: boolean;
  lastProvider: string | null;
  lastModel: string | null;
  /** Stage 5 measured usage & cost summary (strictly from persisted usage events). */
  usageTelemetry?: import('./usageIntelligence').AgentStationUsageSummary;
}

export interface AgentStationNodeSnapshot {
  agentId: AgentId;
  name: string;
  shortName: string;
  role: string;
  description: string;
  isOrchestrator: boolean;
  accentHex: string;
  propKind: AgentCatalogDefinition['propKind'];
  state: AgentExecutionState;
  availabilityStatus: AgentAvailabilityStatus;
  providerSummary: string;
  connectedAgentIds: AgentId[];
  currentTask: AgentCurrentTask | null;
  lastExecution: AgentLastExecution | null;
  recentEvents: AgentFactoryEvent[];
  metrics: AgentPerformanceMetrics;
}

export interface AgentFactoryWorkflowSummary {
  workflowId: string;
  title: string;
  templateId?: WorkflowTemplateId;
  status:
    | 'running'
    | 'queued'
    | 'waiting_for_approval'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';
  leadAgentId: AgentId;
  currentStage?: string;
  blockingReason?: string | null;
  pendingApprovalCount?: number;
  startedAt: string;
  completedAt: string | null;
  evidenceUrl: string | null;
  errorSummary: string | null;
}

export interface AgentActiveCommunicationLink {
  id: string;
  sourceAgentId: AgentId;
  destinationAgentId: AgentId;
  workflowId: string;
  label: string;
  timestamp: string;
  expiresAtMs: number;
  messageType?: AgentMessageType | 'handoff' | 'orchestrator_dispatch';
  correlationId?: string | null;
  status?: 'active' | 'delivered' | 'failed' | 'conflict';
  isPeerToPeer?: boolean;
}

export interface AgentFactorySnapshot {
  tenantId: string;
  projectId: string;
  projectName: string;
  projectWebsite: string;
  generatedAt: string;
  systemHealth: 'healthy' | 'degraded' | 'attention_required';
  counts: {
    activeAgents: number;
    runningWorkflows: number;
    queuedTasks: number;
    failedExecutions: number;
    waitingApprovalTasks: number;
    connectedAgents: number;
    unavailableAgents: number;
  };
  nodes: AgentStationNodeSnapshot[];
  workflows: AgentFactoryWorkflowSummary[];
  recentEvents: AgentFactoryEvent[];
  activeLinks: AgentActiveCommunicationLink[];
  /** Stage 6 autonomous runtime summary attached from real scheduler & recovery state. */
  runtimeSummary?: {
    schedulerStatus: 'healthy' | 'degraded' | 'stopped';
    workerStatus: 'healthy' | 'degraded' | 'stopped';
    activeSchedules: number;
    activeTriggers: number;
    pausedWorkflows: number;
    openDeadLetters: number;
    recentRecoveries: number;
    autonomyMode: 'automatic_low_risk' | 'approval_required' | 'restricted';
    nextScheduledRunAt: string | null;
  };
}

// ============================================================================
// STAGE 2: MULTI-AGENT EXECUTION ENGINE & ORCHESTRATION TYPES
// ============================================================================

export type WorkflowTemplateId =
  | 'seo_content_pipeline'
  | 'technical_performance_audit'
  | 'content_brief_to_draft'
  | 'competitor_research_collaboration'
  | 'technical_seo_collaboration'
  | 'content_production_collaboration'
  | 'custom_dag';

export type WorkflowRunStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'blocked';

export type ApprovalGateType =
  | 'content_strategy'
  | 'content_brief'
  | 'generated_content'
  | 'publishing_readiness';

export type ApprovalDecisionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revision_requested';

export interface DagNodeCondition {
  onlyIfUpstreamHasItems?: boolean;
  skipIfUnavailable?: boolean;
}

export interface DagWorkflowNodeInput {
  nodeKey: string;
  agentId: AgentStationId;
  title: string;
  approvalRequired?: boolean;
  approvalGateType?: ApprovalGateType | null;
  maxRetries?: number;
  timeoutMs?: number;
  condition?: DagNodeCondition | null;
  config?: Record<string, unknown>;
}

export interface DagWorkflowEdgeInput {
  fromNodeKey: string;
  toNodeKey: string;
}

export interface DagValidationResult {
  valid: boolean;
  errors: string[];
  cyclePath: string[];
  topologicalOrder: string[];
  layers: string[][];
}

export interface StructuredAgentHandoff {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  executionId: string;
  sourceAgentId: AgentId;
  destinationAgentId: AgentId;
  taskId: string;
  inputRef: string;
  outputRef: string;
  evidenceRefs: string[];
  status: 'delivered' | 'validated' | 'rejected';
  validationSummary: string;
  correlationId: string;
  createdAt: string;
}

export interface AgentOutputRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  taskId: string;
  agentId: AgentId;
  schemaVersion: string;
  summary: string;
  payload: Record<string, unknown>;
  evidenceRefs: string[];
  isAiGenerated: boolean;
  createdAt: string;
}

export interface AgentExecutionTelemetryRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  taskId: string;
  agentId: AgentId;
  attemptNumber: number;
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface WorkflowTaskRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  nodeKey: string;
  agentId: AgentStationId;
  title: string;
  status: WorkflowTaskStatus;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  blockingReason: string | null;
  errorSummary: string | null;
  approvalRequired: boolean;
  approvalGateType: ApprovalGateType | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  outputId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalAuditHistoryEntry {
  action: ApprovalDecisionStatus | 'requested';
  actorId: string;
  actorName: string;
  actorRole: string;
  comments: string;
  timestamp: string;
}

export interface WorkflowApprovalRequest {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  taskId: string;
  gateType: ApprovalGateType;
  title: string;
  summary: string;
  status: ApprovalDecisionStatus;
  requestedBy: string;
  approverId: string | null;
  approverName: string | null;
  approverRole: string | null;
  comments: string;
  versionRef: string;
  outputId: string | null;
  auditHistory: ApprovalAuditHistoryEntry[];
  createdAt: string;
  decidedAt: string | null;
}

export interface AgentWorkflowRecord {
  id: string;
  tenantId: string;
  projectId: string;
  templateId: WorkflowTemplateId;
  name: string;
  objective: string;
  status: WorkflowRunStatus;
  currentStage: string;
  blockingReason: string | null;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfigRecord {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: AgentStationId;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  preferredModel: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AgentWorkflowDetail {
  workflow: AgentWorkflowRecord;
  nodes: DagWorkflowNodeInput[];
  edges: DagWorkflowEdgeInput[];
  tasks: WorkflowTaskRecord[];
  handoffs: StructuredAgentHandoff[];
  outputs: AgentOutputRecord[];
  approvals: WorkflowApprovalRequest[];
  executions: AgentExecutionTelemetryRecord[];
  events: AgentFactoryEvent[];
}

export interface AgentOrchestrationOverview {
  workflows: AgentWorkflowRecord[];
  pendingApprovals: WorkflowApprovalRequest[];
  configs: AgentConfigRecord[];
  telemetrySummary: {
    totalExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    totalRetries: number;
    measuredInputTokens: number | null;
    measuredOutputTokens: number | null;
    measuredTotalTokens: number | null;
    avgExecutionDurationMs: number | null;
    billingCostSummary: string;
    activeWorkers: number;
    maxConcurrentWorkers: number;
  };
}

// ============================================================================
// STAGE 3: ADVANCED MULTI-AGENT COLLABORATION & COMMUNICATION TYPES
// ============================================================================

export type AgentMessageType =
  | 'research_request'
  | 'verification_request'
  | 'evidence_share'
  | 'clarification_question'
  | 'findings_response'
  | 'delegation_request'
  | 'conflict_report'
  | 'rejection_notice';

export type AgentMessageStatus =
  | 'sent'
  | 'delivered'
  | 'acknowledged'
  | 'failed'
  | 'rejected';

export interface AgentMessageRecord {
  messageId: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  executionId: string;
  sourceAgentId: AgentId;
  destinationAgentId: AgentId;
  messageType: AgentMessageType;
  payload: Record<string, unknown>;
  evidenceReferences: string[];
  correlationId: string;
  replyToMessageId: string | null;
  timestamp: string;
  status: AgentMessageStatus;
  errorSummary: string | null;
}

export type WorkflowContextScope =
  | 'approved_business_profile'
  | 'target_markets'
  | 'approved_keywords'
  | 'competitor_evidence'
  | 'technical_audit'
  | 'performance_findings'
  | 'content_brief'
  | 'approved_agent_output';

export type ContextApprovalStatus =
  | 'approved'
  | 'draft'
  | 'proposed'
  | 'verified_evidence'
  | 'unverified'
  | 'superseded';

export interface WorkflowContextItemRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  contextScope: WorkflowContextScope;
  contextKey: string;
  version: number;
  source: string;
  sourceAgentId: AgentId | null;
  approvalStatus: ContextApprovalStatus;
  isApprovedLock: boolean;
  supersedesId: string | null;
  conflictFlag: boolean;
  payload: Record<string, unknown>;
  evidenceReferences: string[];
  createdAt: string;
}

export interface EvidenceTrustEntry {
  statement: string;
  source: string;
  evidenceRef?: string;
}

export interface EvidenceTrustBreakdown {
  verifiedFacts: EvidenceTrustEntry[];
  measuredMetrics: EvidenceTrustEntry[];
  inferredFindings: EvidenceTrustEntry[];
  aiGeneratedSuggestions: EvidenceTrustEntry[];
  unavailableInformation: string[];
  evidenceReferences: string[];
  qaValidationStatus?: 'validated' | 'warnings' | 'rejected' | 'pending';
  qaUnsupportedClaims?: string[];
}

export type AgentDelegationStatus =
  | 'requested'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface AgentDelegationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  parentTaskId: string;
  delegatedTaskId: string | null;
  sourceAgentId: AgentId;
  targetAgentId: AgentStationId;
  messageId: string | null;
  responseMessageId: string | null;
  delegationDepth: number;
  status: AgentDelegationStatus;
  reason: string;
  requestedObjective: string;
  errorSummary: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type WorkflowConflictType =
  | 'keyword_intent'
  | 'geographic_targeting'
  | 'url_recommendation'
  | 'competitor_finding'
  | 'unsupported_claim'
  | 'agent_output_contradiction'
  | 'approved_context_protection';

export type WorkflowConflictStatus =
  | 'open'
  | 'verifying'
  | 'resolved'
  | 'dismissed';

export interface WorkflowConflictRecord {
  id: string;
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
  verificationMessageId: string | null;
  requiresHumanReview: boolean;
  status: WorkflowConflictStatus;
  selectedResolution: 'keep_a' | 'keep_b' | 'custom' | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedByRole: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgentCollaborationMetrics {
  agentId: AgentId;
  messagesSent: number;
  messagesReceived: number;
  delegatedTasksCreated: number;
  delegatedTasksReceived: number;
  failedCommunications: number;
  pendingResponses: number;
  activeCollaborationPeerIds: AgentId[];
  currentCollaborationSummary: string | null;
}

export interface CollaborationMonitorPayload {
  projectId: string;
  workflowId: string | null;
  generatedAt: string;
  summary: {
    activeCollaborations: number;
    totalMessages: number;
    failedMessages: number;
    pendingRequests: number;
    delegatedTasks: number;
    openConflicts: number;
    resolvedConflicts: number;
    contextVersions: number;
    verifiedEvidenceRefs: number;
    unsupportedClaimsCount: number;
  };
  messages: AgentMessageRecord[];
  delegations: AgentDelegationRecord[];
  conflicts: WorkflowConflictRecord[];
  contextItems: WorkflowContextItemRecord[];
  evidenceSummary: {
    outputsAudited: number;
    verifiedFactsCount: number;
    measuredMetricsCount: number;
    inferredFindingsCount: number;
    aiSuggestionsCount: number;
    unavailableItemsCount: number;
    unsupportedClaims: Array<{
      workflowId: string;
      agentId: AgentId;
      claim: string;
      outputId: string;
    }>;
  };
  byAgent: Record<string, AgentCollaborationMetrics>;
}

