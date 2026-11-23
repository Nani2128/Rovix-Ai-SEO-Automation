import type {
  AgentAvailabilityStatus,
  AgentExecutionTelemetryRecord,
  AgentFactoryEvent,
  AgentId,
  AgentOutputRecord,
  AgentStationId,
  AgentWorkflowDetail,
  ApprovalGateType,
  StructuredAgentHandoff,
  WorkflowRunStatus,
  WorkflowTaskStatus,
} from './agentFactory';

export type StudioNodeCategory =
  | 'agent'
  | 'trigger'
  | 'condition'
  | 'data'
  | 'governance';

export type StudioTriggerSubtype =
  | 'manual_trigger'
  | 'existing_event_trigger'
  | 'approved_project_event'
  | 'scheduled_trigger';

export type StudioConditionSubtype =
  | 'if_else'
  | 'evidence_available'
  | 'score_threshold'
  | 'task_status_check'
  | 'approval_decision';

export type StudioDataSubtype =
  | 'structured_data_mapping'
  | 'output_transformation'
  | 'merge_results'
  | 'evidence_validation';

export type StudioGovernanceSubtype =
  | 'human_approval'
  | 'business_owner_review'
  | 'conflict_resolution'
  | 'qa_verification';

export type StudioNodeSubtype =
  | AgentId
  | StudioTriggerSubtype
  | StudioConditionSubtype
  | StudioDataSubtype
  | StudioGovernanceSubtype;

export type StudioEdgeType =
  | 'dependency'
  | 'conditional'
  | 'approval'
  | 'error';

export type StudioBranchHandle =
  | 'default'
  | 'true'
  | 'false'
  | 'approved'
  | 'rejected'
  | 'error';

export type RestrictedConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'exists'
  | 'is_true'
  | 'is_false';

export type RestrictedConditionField =
  | 'evidenceCount'
  | 'keywordCount'
  | 'competitorCount'
  | 'contentGapCount'
  | 'healthScore'
  | 'mobileScore'
  | 'desktopScore'
  | 'openCriticalIssues'
  | 'openConflictsCount'
  | 'hasApprovedProfile'
  | 'hasApprovedMarkets'
  | 'upstreamSucceeded'
  | 'approvalStatus'
  | 'qaVerdict'
  | 'wordCount';

/**
 * Validated, strictly restricted condition expression model.
 * Never allows arbitrary code or JS eval.
 */
export interface RestrictedConditionRule {
  field: RestrictedConditionField;
  operator: RestrictedConditionOperator;
  value: string | number | boolean | null;
  sourceNodeId?: string | null;
}

export interface StudioFieldMappingEntry {
  sourcePath: string;
  targetField: string;
  fallbackValue?: string;
}

export interface StudioNodeConfig {
  instructions?: string;
  inputParameters?: Record<string, string | number | boolean>;
  outputSchemaPreview?: string[];
  requiredInputFields?: string[];
  /** Trigger node settings */
  triggerEventSource?: 'crawl_completed' | 'performance_completed' | 'keyword_discovery' | 'approved_profile_ready';
  requireApprovedProfile?: boolean;
  requireApprovedMarkets?: boolean;
  scheduleCronHint?: string;
  scheduleArmed?: boolean;
  /** Condition node settings */
  conditionRule?: RestrictedConditionRule;
  /** Data transformation settings */
  fieldMappings?: StudioFieldMappingEntry[];
  transformMode?: 'normalize_brief' | 'extract_priority_issues' | 'consolidate_evidence' | 'deduplicate_keywords';
  mergeStrategy?: 'union_evidence' | 'intersect_keywords' | 'combine_payloads';
  requireMinEvidenceRefs?: number;
  /** Governance & approval settings */
  approvalRequired?: boolean;
  approvalGateType?: ApprovalGateType | null;
  approverRole?: 'Business Owner' | 'Agency Owner' | 'Platform Admin';
  approvalPrompt?: string;
  blockOnOpenConflicts?: boolean;
  /** Execution reliability controls */
  maxRetries?: number;
  timeoutMs?: number;
  skipIfUnavailable?: boolean;
  enableIntelligentDelegation?: boolean;
  targetProjectRef?: string | null;
}

export interface StudioNodeCatalogItem {
  subtype: StudioNodeSubtype;
  category: StudioNodeCategory;
  label: string;
  shortLabel: string;
  description: string;
  accentHex: string;
  backingAgentId: AgentStationId;
  executionType: 'real_service' | 'llm_provider' | 'deterministic_control' | 'governance_gate';
  capabilities: string[];
  inputRequirements: string[];
  outputSchema: string[];
  supportedActions: string[];
  defaultConfig: StudioNodeConfig;
  requiresApprovalByDefault?: boolean;
  sourceHandles: Array<{
    id: StudioBranchHandle;
    label: string;
    edgeType: StudioEdgeType;
  }>;
  acceptsIncomingConnections: boolean;
  requiresProviderKey?: 'gemini' | 'pagespeed' | null;
}

export interface StudioCanvasNode {
  id: string;
  category: StudioNodeCategory;
  subtype: StudioNodeSubtype;
  label: string;
  position: { x: number; y: number };
  config: StudioNodeConfig;
}

export interface StudioCanvasEdge {
  id: string;
  source: string;
  target: string;
  edgeType: StudioEdgeType;
  sourceHandle: StudioBranchHandle;
  label?: string;
}

export interface StudioWorkflowGraph {
  nodes: StudioCanvasNode[];
  edges: StudioCanvasEdge[];
}

export type StudioValidationSeverity = 'error' | 'warning';

export interface StudioValidationIssue {
  id: string;
  code:
    | 'EMPTY_GRAPH'
    | 'NODE_LIMIT_EXCEEDED'
    | 'EDGE_LIMIT_EXCEEDED'
    | 'INPUT_SIZE_EXCEEDED'
    | 'CIRCULAR_DEPENDENCY'
    | 'MISSING_NODE'
    | 'MISSING_REQUIRED_INPUT'
    | 'INVALID_AGENT_ID'
    | 'UNSUPPORTED_CAPABILITY'
    | 'INVALID_CONNECTION'
    | 'MISSING_CONDITION_BRANCH'
    | 'MISSING_APPROVAL_CONFIG'
    | 'MANDATORY_APPROVAL_BYPASS'
    | 'UNREACHABLE_NODE'
    | 'INVALID_OUTPUT_REFERENCE'
    | 'CROSS_PROJECT_REFERENCE'
    | 'PROVIDER_UNAVAILABLE'
    | 'SCHEDULE_NOT_ARMED';
  severity: StudioValidationSeverity;
  message: string;
  nodeId?: string | null;
  edgeId?: string | null;
  remediation?: string;
}

export interface StudioValidationReport {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: StudioValidationIssue[];
  topologicalOrder: string[];
  layers: string[][];
  cyclePath: string[];
  validatedAt: string;
}

export type StudioWorkflowStatus = 'draft' | 'saved' | 'published' | 'archived';

export interface StudioWorkflowRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  status: StudioWorkflowStatus;
  activeVersionNumber: number;
  publishedVersionId: string | null;
  draftGraph: StudioWorkflowGraph;
  lastValidation: StudioValidationReport | null;
  lastExecutionWorkflowId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioWorkflowVersionRecord {
  id: string;
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  versionNumber: number;
  status: 'snapshot' | 'published';
  changeSummary: string;
  graph: StudioWorkflowGraph;
  validation: StudioValidationReport;
  createdBy: string;
  createdAt: string;
}

export interface StudioWorkflowTemplateRecord {
  id: string;
  tenantId: string | null;
  projectId: string | null;
  name: string;
  category: string;
  description: string;
  isBuiltIn: boolean;
  graph: StudioWorkflowGraph;
  requiredProviders: string[];
  createdBy: string;
  createdAt: string;
}

export type StudioLiveNodeStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_for_approval'
  | 'retrying'
  | 'cancelled'
  | 'skipped'
  | 'blocked';

export interface StudioNodeExecutionDetail {
  nodeId: string;
  label: string;
  category: StudioNodeCategory;
  subtype: StudioNodeSubtype;
  taskStatus: WorkflowTaskStatus | 'skipped';
  attemptCount: number;
  durationMs: number | null;
  blockingReason: string | null;
  errorSummary: string | null;
  inputs: Array<{
    fromNodeId: string;
    outputId: string;
    summary: string;
    evidenceRefs: string[];
  }>;
  output: AgentOutputRecord | null;
  executions: AgentExecutionTelemetryRecord[];
  handoffs: StructuredAgentHandoff[];
  events: AgentFactoryEvent[];
  selectedBranch?: 'true' | 'false' | null;
}

export interface StudioProviderAvailabilityMap {
  [agentId: string]: {
    status: AgentAvailabilityStatus;
    summary: string;
  };
}

export interface StudioWorkflowListResponse {
  workflows: StudioWorkflowRecord[];
  templates: StudioWorkflowTemplateRecord[];
  providerAvailability: StudioProviderAvailabilityMap;
}

export interface StudioWorkflowDetailResponse {
  workflow: StudioWorkflowRecord;
  versions: StudioWorkflowVersionRecord[];
  recentExecutions: Array<{
    workflowId: string;
    studioVersionId: string | null;
    studioVersionNumber: number | null;
    status: WorkflowRunStatus;
    currentStage: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  activeExecution: AgentWorkflowDetail | null;
  providerAvailability: StudioProviderAvailabilityMap;
}
