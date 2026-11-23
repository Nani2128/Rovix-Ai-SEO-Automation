import type { AgentStationId, WorkflowTemplateId } from './agentFactory';

// ============================================================================
// STAGE 6: AUTONOMOUS OPERATIONS, SCHEDULING & SELF-HEALING RUNTIME TYPES
// ============================================================================

export type ScheduleFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'disabled';

export type ScheduleCatchUpPolicy = 'skip' | 'run_once' | 'run_all_capped';

export type ScheduleTargetKind = 'workflow_template' | 'studio_workflow';

export interface ScheduleExecutionWindow {
  /** Start hour in the schedule's IANA timezone (0..23 inclusive). */
  startHour: number;
  /** End hour in the schedule's IANA timezone (0..23 inclusive). */
  endHour: number;
  /** Optional allowed days of week (0=Sun..6=Sat). Empty/undefined means all days. */
  allowedDaysOfWeek?: number[];
}

export interface WorkflowScheduleRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  targetKind: ScheduleTargetKind;
  templateId: WorkflowTemplateId | null;
  studioWorkflowId: string | null;
  workflowObjective: string;
  frequency: ScheduleFrequency;
  /** Minute of hour (0..59) for hourly/daily/weekly/monthly schedules. */
  minuteOfHour: number;
  /** Hour of day (0..23) in schedule timezone for daily/weekly/monthly schedules. */
  hourOfDay: number | null;
  /** Days of week (0=Sun..6=Sat) for weekly schedules. */
  daysOfWeek: number[];
  /** Day of month (1..31) for monthly schedules. */
  dayOfMonth: number | null;
  /** ISO timestamp for 'once' schedules. */
  runAtIso: string | null;
  /** Valid IANA timezone identifier (e.g. 'UTC', 'America/New_York', 'Asia/Tokyo'). */
  timezone: string;
  executionWindow: ScheduleExecutionWindow | null;
  catchUpPolicy: ScheduleCatchUpPolicy;
  maxCatchUpRuns: number;
  status: ScheduleStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastWorkflowId: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  totalRuns: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type AutomationTriggerType =
  | 'schedule'
  | 'crawl_completed'
  | 'technical_issue_detected'
  | 'performance_regression_detected'
  | 'keyword_intelligence_updated'
  | 'competitor_research_completed'
  | 'budget_threshold_reached'
  | 'approval_decided'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'external_webhook';

export interface WorkflowTriggerSubscriptionRecord {
  id: string;
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
  /** Optional filter rules (e.g. minSeverity, minRegressionDelta, sourceWorkflowId). */
  filterConfig: Record<string, unknown>;
  /** Last 4 characters of webhook secret for display only; full secret is hashed/stored separately. */
  webhookSecretHint: string | null;
  rateLimitPerMinute: number;
  totalTriggered: number;
  lastTriggeredAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TriggerEventStatus =
  | 'dispatched'
  | 'deduplicated'
  | 'blocked_by_policy'
  | 'blocked_by_budget'
  | 'rejected_signature'
  | 'rate_limited'
  | 'failed';

export interface WorkflowTriggerEventRecord {
  id: string;
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
  createdAt: string;
}

export interface WorkflowWorkerLeaseRecord {
  leaseKey: string;
  leaseKind: 'workflow' | 'schedule' | 'task';
  resourceId: string;
  tenantId: string;
  projectId: string;
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: 'active' | 'released' | 'reclaimed';
}

export type RecoveryActionType =
  | 'worker_lease_reclaimed'
  | 'interrupted_workflow_resumed'
  | 'auto_retry_scheduled'
  | 'manual_task_retry'
  | 'workflow_replayed'
  | 'dead_letter_recorded'
  | 'dead_letter_replayed'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'workflow_cancelled'
  | 'workflow_timeout_enforced';

export interface WorkflowRecoveryRecord {
  id: string;
  tenantId: string;
  projectId: string;
  workflowId: string;
  taskId: string | null;
  actionType: RecoveryActionType;
  previousStatus: string;
  newStatus: string;
  actor: string;
  reason: string;
  relatedWorkflowId: string | null;
  createdAt: string;
}

export type ErrorClassificationKind = 'retryable' | 'non_retryable';

export interface WorkflowDeadLetterTaskRecord {
  id: string;
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
  status: 'open' | 'replayed' | 'resolved';
  replayedWorkflowId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type AutonomyMode = 'automatic_low_risk' | 'approval_required' | 'restricted';

export interface AutonomyPolicyRecord {
  id: string;
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
  /** Always true in governance defaults: publishing, destructive ops, external outreach require human approval. */
  requireApprovalForHighImpact: boolean;
  /** High-impact gate types enforced unconditionally when requireApprovalForHighImpact is enabled. */
  highImpactActionTypes: string[];
  allowAutonomousRetries: boolean;
  allowExternalWebhooks: boolean;
  enabled: boolean;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerExecutionLogRecord {
  id: string;
  tenantId: string;
  projectId: string;
  scheduleId: string;
  scheduleName: string;
  workerId: string;
  scheduledForIso: string;
  executedAtIso: string;
  outcome:
    | 'launched'
    | 'skipped_window'
    | 'skipped_catchup'
    | 'blocked_by_policy'
    | 'blocked_by_budget'
    | 'approval_required'
    | 'failed';
  launchedWorkflowId: string | null;
  message: string;
}

export interface RuntimeWorkerHeartbeatRecord {
  workerId: string;
  status: 'healthy' | 'degraded' | 'stopped';
  startedAt: string;
  lastHeartbeatAt: string;
  activeLeasesCount: number;
  processedTicks: number;
  lastTickDurationMs: number | null;
  lastError: string | null;
}

export interface RuntimeHealthSummary {
  schedulerStatus: 'healthy' | 'degraded' | 'stopped';
  workerStatus: 'healthy' | 'degraded' | 'stopped';
  activeWorkerCount: number;
  activeLeasesCount: number;
  activeSchedulesCount: number;
  activeTriggersCount: number;
  queuedTasksCount: number;
  oldestQueuedTaskAgeMs: number | null;
  runningWorkflowsCount: number;
  pausedWorkflowsCount: number;
  failedWorkflowsCount: number;
  pendingApprovalsCount: number;
  openDeadLetterCount: number;
  recentRecoveriesCount: number;
  avgExecutionLatencyMs: number | null;
  failureRatePct: number | null;
  lastHeartbeatAt: string | null;
  workers: RuntimeWorkerHeartbeatRecord[];
}

export interface OperationsPolicyAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRole: string;
  previousState: string;
  newState: string;
  reason: string;
  timestamp: string;
}

export interface OperationsControlCenterPayload {
  tenantId: string;
  projectId: string;
  projectName: string;
  generatedAt: string;
  canManageOperations: boolean;
  canManagePolicies: boolean;
  overview: {
    activeWorkflows: number;
    scheduledJobs: number;
    queuedTasks: number;
    succeededWorkflows: number;
    failedWorkflows: number;
    pausedWorkflows: number;
    pendingApprovals: number;
    openDeadLetters: number;
    activeTriggers: number;
  };
  health: RuntimeHealthSummary;
  schedules: WorkflowScheduleRecord[];
  schedulerLogs: SchedulerExecutionLogRecord[];
  triggers: WorkflowTriggerSubscriptionRecord[];
  triggerEvents: WorkflowTriggerEventRecord[];
  deadLetters: WorkflowDeadLetterTaskRecord[];
  recoveries: WorkflowRecoveryRecord[];
  policy: AutonomyPolicyRecord;
  policyAuditHistory: OperationsPolicyAuditEntry[];
  workflows: {
    id: string;
    name: string;
    templateId: WorkflowTemplateId;
    status: string;
    currentStage: string;
    blockingReason: string | null;
    createdBy: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    replayedFromWorkflowId: string | null;
    failedTaskCount: number;
    queuedTaskCount: number;
  }[];
  studioWorkflows: {
    id: string;
    name: string;
    status: string;
    publishedVersionId: string | null;
  }[];
  activeLeases: WorkflowWorkerLeaseRecord[];
}
