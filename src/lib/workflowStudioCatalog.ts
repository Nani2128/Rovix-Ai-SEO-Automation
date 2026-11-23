import type {
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioNodeCatalogItem,
  StudioNodeCategory,
  StudioNodeSubtype,
  StudioWorkflowTemplateRecord,
} from '../types/workflowStudio';
import { AGENT_CATALOG } from './agentFactoryCatalog';

const AGENT_CAPABILITIES_META: Record<
  string,
  {
    backingAgentId: StudioNodeCatalogItem['backingAgentId'];
    executionType: StudioNodeCatalogItem['executionType'];
    capabilities: string[];
    inputRequirements: string[];
    outputSchema: string[];
    supportedActions: string[];
    requiresApprovalByDefault?: boolean;
    requiresProviderKey?: 'gemini' | 'pagespeed' | null;
  }
> = {
  orchestrator: {
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['dag_coordination', 'context_seeding', 'handoff_routing'],
    inputRequirements: ['Project workspace baseline'],
    outputSchema: ['projectName', 'approvedServices', 'approvedMarkets', 'knownProjectUrls'],
    supportedActions: ['Seed Shared Workflow Context', 'Coordinate Specialist Handoffs'],
  },
  research_agent: {
    backingAgentId: 'research_agent',
    executionType: 'real_service',
    capabilities: ['project_baseline', 'crawl_url_inventory', 'approved_profile_check'],
    inputRequirements: ['Verified or configured project domain'],
    outputSchema: ['projectWebsite', 'approvedServices', 'approvedMarkets', 'knownProjectUrls', 'evidenceTrust'],
    supportedActions: ['Compile Verified Project Evidence', 'Broadcast Baseline to Downstream Agents'],
  },
  competitor_intelligence_agent: {
    backingAgentId: 'competitor_intelligence_agent',
    executionType: 'real_service',
    capabilities: ['competitor_crawl', 'content_gap_detection', 'schema_heading_benchmark'],
    inputRequirements: ['Project workspace', 'Registered competitors (optional live analysis)'],
    outputSchema: ['competitorsCount', 'contentGapsCount', 'topGaps', 'evidenceTrust'],
    supportedActions: ['Analyze Competitor Pages', 'Detect Content Gaps', 'Delegate Keyword/Geo Verification'],
  },
  keyword_intelligence_agent: {
    backingAgentId: 'keyword_intelligence_agent',
    executionType: 'real_service',
    capabilities: ['keyword_discovery', 'intent_classification', 'opportunity_scoring'],
    inputRequirements: ['Approved business services or seed terms'],
    outputSchema: ['totalKeywords', 'intentBreakdown', 'topKeywords', 'evidenceTrust'],
    supportedActions: ['Cluster Approved Keywords', 'Validate Competitor Keyword Overlap'],
  },
  geographic_intelligence_agent: {
    backingAgentId: 'geographic_intelligence_agent',
    executionType: 'real_service',
    capabilities: ['approved_market_mapping', 'regional_demand', 'location_url_coverage'],
    inputRequirements: ['Approved target markets in project workspace'],
    outputSchema: ['targetMarkets', 'regionalSignals', 'locationUrlMappings', 'evidenceTrust'],
    supportedActions: ['Map Approved Target Markets', 'Verify Regional SEO Fit'],
  },
  technical_seo_agent: {
    backingAgentId: 'technical_seo_agent',
    executionType: 'real_service',
    capabilities: ['site_crawl', 'indexability_rules', 'canonical_schema_audit'],
    inputRequirements: ['Project domain URL'],
    outputSchema: ['crawlId', 'healthScore', 'totalIssues', 'openCriticalIssues', 'evidenceTrust'],
    supportedActions: ['Evaluate Technical Crawl & Indexability', 'Emit Remediation Evidence'],
  },
  performance_analysis_agent: {
    backingAgentId: 'performance_analysis_agent',
    executionType: 'real_service',
    capabilities: ['pagespeed_lighthouse', 'core_web_vitals', 'payload_diagnostics'],
    inputRequirements: ['Project domain URL (PageSpeed API or persisted audit snapshot)'],
    outputSchema: ['mobileScore', 'desktopScore', 'lcpMs', 'cls', 'inpMs', 'evidenceTrust'],
    supportedActions: ['Audit Mobile & Desktop Core Web Vitals', 'Correlate Speed Findings'],
    requiresProviderKey: 'pagespeed',
  },
  content_strategy_agent: {
    backingAgentId: 'content_strategy_agent',
    executionType: 'real_service',
    capabilities: ['content_brief_planning', 'gap_prioritization', 'outline_structuring'],
    inputRequirements: ['Upstream keyword, competitor, or research evidence'],
    outputSchema: ['targetKeyword', 'recommendedTitle', 'recommendedSections', 'targetUrl', 'evidenceTrust'],
    supportedActions: ['Build Evidence-Backed Content Brief', 'Version Brief in Shared Context'],
    requiresApprovalByDefault: true,
  },
  content_generation_agent: {
    backingAgentId: 'content_generation_agent',
    executionType: 'llm_provider',
    capabilities: ['gemini_seo_drafting', 'structured_markdown_generation', 'internal_link_grounding'],
    inputRequirements: ['Approved Content Strategy Brief', 'GEMINI_API_KEY configured'],
    outputSchema: ['title', 'metaDescription', 'wordCount', 'sections', 'internalLinks', 'evidenceTrust'],
    supportedActions: ['Generate Grounded SEO Draft via Gemini'],
    requiresApprovalByDefault: true,
    requiresProviderKey: 'gemini',
  },
  quality_assurance_agent: {
    backingAgentId: 'quality_assurance_agent',
    executionType: 'real_service',
    capabilities: ['claim_evidence_audit', 'internal_link_check', 'conflict_detection', 'technical_reverification'],
    inputRequirements: ['Upstream agent outputs or draft deliverable'],
    outputSchema: ['verdict', 'checks', 'conflictsDetectedCount', 'unsupportedClaimsCount', 'evidenceTrust'],
    supportedActions: ['Validate Claims & Evidence Trust', 'Detect Cross-Agent Conflicts'],
  },
  reporting_agent: {
    backingAgentId: 'reporting_agent',
    executionType: 'real_service',
    capabilities: ['executive_digest', 'provenance_compilation', 'approval_summary'],
    inputRequirements: ['Completed workflow outputs'],
    outputSchema: ['deliverablesCount', 'validatedHandoffsCount', 'collaborationStats', 'qaVerdict', 'evidenceTrust'],
    supportedActions: ['Compile Evidence-Backed Executive Report'],
  },
};

export const STUDIO_AGENT_NODES: StudioNodeCatalogItem[] = AGENT_CATALOG.map((agent) => {
  const meta = AGENT_CAPABILITIES_META[agent.agentId] ?? AGENT_CAPABILITIES_META.research_agent;
  return {
    subtype: agent.agentId,
    category: 'agent' as const,
    label: agent.name,
    shortLabel: agent.shortName,
    description:
      agent.agentId === 'content_generation_agent'
        ? 'Generates grounded SEO article drafts from approved briefs via the configured Gemini provider.'
        : agent.description,
    accentHex: agent.accentHex,
    backingAgentId: meta.backingAgentId,
    executionType: meta.executionType,
    capabilities: meta.capabilities,
    inputRequirements: meta.inputRequirements,
    outputSchema: meta.outputSchema,
    supportedActions: meta.supportedActions,
    requiresApprovalByDefault: meta.requiresApprovalByDefault,
    requiresProviderKey: meta.requiresProviderKey ?? null,
    defaultConfig: {
      instructions: '',
      maxRetries: 2,
      timeoutMs: agent.agentId === 'technical_seo_agent' || agent.agentId === 'performance_analysis_agent' ? 90_000 : 60_000,
      approvalRequired: Boolean(meta.requiresApprovalByDefault),
      approvalGateType:
        agent.agentId === 'content_strategy_agent'
          ? 'content_brief'
          : agent.agentId === 'content_generation_agent'
            ? 'generated_content'
            : null,
      outputSchemaPreview: meta.outputSchema,
      enableIntelligentDelegation:
        agent.agentId === 'competitor_intelligence_agent' ||
        agent.agentId === 'technical_seo_agent',
    },
    sourceHandles: [
      { id: 'default', label: 'Next', edgeType: 'dependency' },
      { id: 'error', label: 'On Error', edgeType: 'error' },
    ],
    acceptsIncomingConnections: true,
  };
});

export const STUDIO_TRIGGER_NODES: StudioNodeCatalogItem[] = [
  {
    subtype: 'manual_trigger',
    category: 'trigger',
    label: 'Manual Trigger',
    shortLabel: 'Manual Start',
    description: 'Starts workflow execution immediately when an authorized operator clicks Execute.',
    accentHex: '#0EA5E9',
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['manual_workflow_start', 'context_snapshot'],
    inputRequirements: ['Authenticated project operator'],
    outputSchema: ['triggeredBy', 'projectWebsite', 'startedAt'],
    supportedActions: ['Initialize Workflow Context & Start Downstream Nodes'],
    defaultConfig: {
      triggerEventSource: 'approved_profile_ready',
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [{ id: 'default', label: 'Start', edgeType: 'dependency' }],
    acceptsIncomingConnections: false,
  },
  {
    subtype: 'existing_event_trigger',
    category: 'trigger',
    label: 'Workspace Event Trigger',
    shortLabel: 'Event Trigger',
    description: 'Verifies a persisted crawl, PageSpeed audit, or keyword discovery run exists before routing.',
    accentHex: '#0284C7',
    backingAgentId: 'research_agent',
    executionType: 'real_service',
    capabilities: ['event_precondition_check', 'latest_run_binding'],
    inputRequirements: ['Persisted project crawl, performance, or keyword dataset'],
    outputSchema: ['eventSource', 'eventVerified', 'latestRunId', 'evidenceRefs'],
    supportedActions: ['Bind Latest Persisted Event Evidence'],
    defaultConfig: {
      triggerEventSource: 'crawl_completed',
      maxRetries: 0,
      timeoutMs: 20_000,
    },
    sourceHandles: [{ id: 'default', label: 'On Event', edgeType: 'dependency' }],
    acceptsIncomingConnections: false,
  },
  {
    subtype: 'approved_project_event',
    category: 'trigger',
    label: 'Approved Project Gate',
    shortLabel: 'Approved Baseline',
    description: 'Checks approved business profile and target markets from SharedWorkflowContext before starting.',
    accentHex: '#14B8A6',
    backingAgentId: 'research_agent',
    executionType: 'real_service',
    capabilities: ['approved_profile_guard', 'approved_markets_guard'],
    inputRequirements: ['Project workspace with approved services or target markets'],
    outputSchema: ['hasApprovedProfile', 'hasApprovedMarkets', 'approvedServices', 'approvedMarkets'],
    supportedActions: ['Verify Approved Project Baselines'],
    defaultConfig: {
      requireApprovedProfile: true,
      requireApprovedMarkets: false,
      maxRetries: 0,
      timeoutMs: 20_000,
    },
    sourceHandles: [{ id: 'default', label: 'Verified', edgeType: 'dependency' }],
    acceptsIncomingConnections: false,
  },
  {
    subtype: 'scheduled_trigger',
    category: 'trigger',
    label: 'Scheduled Trigger (Manual Arm)',
    shortLabel: 'Schedule',
    description: 'Stores a recurring cadence policy alongside the workflow; executes immediately when triggered manually (external cron daemon not enabled in container).',
    accentHex: '#6366F1',
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['cadence_metadata', 'manual_run_compatibility'],
    inputRequirements: ['Schedule cadence label (e.g., Weekly Monday 09:00 UTC)'],
    outputSchema: ['scheduleCronHint', 'scheduleArmed', 'executionMode'],
    supportedActions: ['Record Schedule Policy & Start Run'],
    defaultConfig: {
      scheduleCronHint: 'Weekly · Monday 09:00 UTC',
      scheduleArmed: false,
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [{ id: 'default', label: 'Trigger', edgeType: 'dependency' }],
    acceptsIncomingConnections: false,
  },
];

export const STUDIO_CONDITION_NODES: StudioNodeCatalogItem[] = [
  {
    subtype: 'if_else',
    category: 'condition',
    label: 'IF / ELSE Branch',
    shortLabel: 'IF / ELSE',
    description: 'Evaluates a validated restricted rule against upstream metrics and routes strictly along the matching True or False path.',
    accentHex: '#F59E0B',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'deterministic_control',
    capabilities: ['restricted_condition_eval', 'branch_pruning'],
    inputRequirements: ['At least one upstream node', 'Restricted condition rule'],
    outputSchema: ['matched', 'selectedBranch', 'evaluatedField', 'observedValue'],
    supportedActions: ['Evaluate Safe Rule & Prune Untaken Branch'],
    defaultConfig: {
      conditionRule: {
        field: 'evidenceCount',
        operator: 'gte',
        value: 1,
      },
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [
      { id: 'true', label: 'True', edgeType: 'conditional' },
      { id: 'false', label: 'False', edgeType: 'conditional' },
    ],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'evidence_available',
    category: 'condition',
    label: 'Evidence Available',
    shortLabel: 'Evidence Gate',
    description: 'Checks whether upstream outputs produced verified evidence references before allowing downstream synthesis.',
    accentHex: '#D97706',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'deterministic_control',
    capabilities: ['evidence_presence_check', 'branch_pruning'],
    inputRequirements: ['Upstream node emitting evidenceRefs'],
    outputSchema: ['matched', 'selectedBranch', 'evidenceCount'],
    supportedActions: ['Route on Verified Evidence Count'],
    defaultConfig: {
      conditionRule: {
        field: 'evidenceCount',
        operator: 'gte',
        value: 1,
      },
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [
      { id: 'true', label: 'Has Evidence', edgeType: 'conditional' },
      { id: 'false', label: 'Missing', edgeType: 'conditional' },
    ],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'score_threshold',
    category: 'condition',
    label: 'Score Threshold',
    shortLabel: 'Threshold',
    description: 'Branches based on real technical health score, mobile/desktop PageSpeed score, or critical issue count.',
    accentHex: '#EA580C',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'deterministic_control',
    capabilities: ['numeric_threshold_check', 'branch_pruning'],
    inputRequirements: ['Upstream Technical SEO or Performance node'],
    outputSchema: ['matched', 'selectedBranch', 'observedValue', 'threshold'],
    supportedActions: ['Compare Measured Score Against Threshold'],
    defaultConfig: {
      conditionRule: {
        field: 'healthScore',
        operator: 'lt',
        value: 80,
      },
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [
      { id: 'true', label: 'Meets Rule', edgeType: 'conditional' },
      { id: 'false', label: 'Otherwise', edgeType: 'conditional' },
    ],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'task_status_check',
    category: 'condition',
    label: 'Task Success / Failure',
    shortLabel: 'Status Check',
    description: 'Inspects whether upstream prerequisite tasks succeeded cleanly and routes remediation when needed.',
    accentHex: '#CA8A04',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'deterministic_control',
    capabilities: ['upstream_status_check', 'branch_pruning'],
    inputRequirements: ['Upstream execution node'],
    outputSchema: ['matched', 'selectedBranch', 'upstreamSucceeded'],
    supportedActions: ['Route on Upstream Execution Outcome'],
    defaultConfig: {
      conditionRule: {
        field: 'upstreamSucceeded',
        operator: 'is_true',
        value: true,
      },
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [
      { id: 'true', label: 'Success', edgeType: 'conditional' },
      { id: 'false', label: 'Failure', edgeType: 'conditional' },
    ],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'approval_decision',
    category: 'condition',
    label: 'Approval Decision Branch',
    shortLabel: 'Approval Split',
    description: 'Routes based on persisted approval decision status recorded on the upstream approval gate.',
    accentHex: '#B45309',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'deterministic_control',
    capabilities: ['approval_status_routing', 'branch_pruning'],
    inputRequirements: ['Upstream Governance Approval node'],
    outputSchema: ['matched', 'selectedBranch', 'approvalStatus'],
    supportedActions: ['Branch on Human Approval Decision'],
    defaultConfig: {
      conditionRule: {
        field: 'approvalStatus',
        operator: 'eq',
        value: 'approved',
      },
      maxRetries: 0,
      timeoutMs: 15_000,
    },
    sourceHandles: [
      { id: 'true', label: 'Approved', edgeType: 'conditional' },
      { id: 'false', label: 'Not Approved', edgeType: 'conditional' },
    ],
    acceptsIncomingConnections: true,
  },
];

export const STUDIO_DATA_NODES: StudioNodeCatalogItem[] = [
  {
    subtype: 'structured_data_mapping',
    category: 'data',
    label: 'Structured Data Mapping',
    shortLabel: 'Data Map',
    description: 'Maps structured upstream output fields into clean named keys for downstream specialist nodes.',
    accentHex: '#8B5CF6',
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['field_mapping', 'schema_projection'],
    inputRequirements: ['Upstream node output payload'],
    outputSchema: ['mappedFields', 'sourceOutputIds', 'evidenceRefs'],
    supportedActions: ['Project & Rename Upstream Payload Fields'],
    defaultConfig: {
      fieldMappings: [
        { sourcePath: 'projectWebsite', targetField: 'domain' },
        { sourcePath: 'approvedServices', targetField: 'services' },
      ],
      maxRetries: 0,
      timeoutMs: 20_000,
    },
    sourceHandles: [{ id: 'default', label: 'Mapped', edgeType: 'dependency' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'output_transformation',
    category: 'data',
    label: 'Output Transformation',
    shortLabel: 'Transform',
    description: 'Deterministically normalizes upstream findings (priority issues, keyword sets, or evidence lists).',
    accentHex: '#7C3AED',
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['deterministic_transform', 'deduplication'],
    inputRequirements: ['Upstream node output payload'],
    outputSchema: ['transformMode', 'transformedItems', 'itemCount', 'evidenceRefs'],
    supportedActions: ['Normalize & Deduplicate Structured Outputs'],
    defaultConfig: {
      transformMode: 'consolidate_evidence',
      maxRetries: 0,
      timeoutMs: 20_000,
    },
    sourceHandles: [{ id: 'default', label: 'Transformed', edgeType: 'dependency' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'merge_results',
    category: 'data',
    label: 'Merge Results',
    shortLabel: 'Merge',
    description: 'Combines parallel upstream specialist outputs and deduplicates evidence references into a single handoff.',
    accentHex: '#6D28D9',
    backingAgentId: 'research_agent',
    executionType: 'deterministic_control',
    capabilities: ['parallel_join', 'evidence_deduplication'],
    inputRequirements: ['Two or more parallel upstream nodes'],
    outputSchema: ['mergedSources', 'combinedSummary', 'evidenceRefs', 'mergedMetrics'],
    supportedActions: ['Join Parallel Specialist Outputs'],
    defaultConfig: {
      mergeStrategy: 'union_evidence',
      maxRetries: 0,
      timeoutMs: 20_000,
    },
    sourceHandles: [{ id: 'default', label: 'Merged', edgeType: 'dependency' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'evidence_validation',
    category: 'data',
    label: 'Evidence Validation',
    shortLabel: 'Verify Evidence',
    description: 'Audits upstream outputs using Stage 3 Evidence Trust rules to separate verified facts from unsupported claims.',
    accentHex: '#5B21B6',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'real_service',
    capabilities: ['evidence_trust_audit', 'unsupported_claim_detection'],
    inputRequirements: ['Upstream agent outputs'],
    outputSchema: ['evidenceCount', 'unsupportedClaimsCount', 'validated', 'evidenceTrust'],
    supportedActions: ['Enforce Evidence Trust Threshold'],
    defaultConfig: {
      requireMinEvidenceRefs: 1,
      maxRetries: 0,
      timeoutMs: 25_000,
    },
    sourceHandles: [
      { id: 'default', label: 'Verified', edgeType: 'dependency' },
      { id: 'error', label: 'On Fail', edgeType: 'error' },
    ],
    acceptsIncomingConnections: true,
  },
];

export const STUDIO_GOVERNANCE_NODES: StudioNodeCatalogItem[] = [
  {
    subtype: 'human_approval',
    category: 'governance',
    label: 'Human Approval Gate',
    shortLabel: 'Approval Gate',
    description: 'Pauses workflow execution in waiting_for_approval until an authorized approver grants sign-off.',
    accentHex: '#10B981',
    backingAgentId: 'content_strategy_agent',
    executionType: 'governance_gate',
    capabilities: ['persistent_approval_gate', 'audit_trail'],
    inputRequirements: ['Upstream deliverable to review'],
    outputSchema: ['approvalId', 'gateType', 'decisionStatus', 'approverName'],
    supportedActions: ['Pause & Create Official Approval Request'],
    requiresApprovalByDefault: true,
    defaultConfig: {
      approvalRequired: true,
      approvalGateType: 'content_brief',
      approverRole: 'Agency Owner',
      approvalPrompt: 'Review upstream evidence and approve before continuing.',
      maxRetries: 0,
      timeoutMs: 30_000,
    },
    sourceHandles: [{ id: 'approved', label: 'Approved', edgeType: 'approval' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'business_owner_review',
    category: 'governance',
    label: 'Business Owner Review',
    shortLabel: 'Owner Sign-Off',
    description: 'Enforces Business Owner / Agency Owner publishing-readiness review with full approval audit history.',
    accentHex: '#059669',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'governance_gate',
    capabilities: ['owner_signoff_gate', 'publishing_readiness'],
    inputRequirements: ['QA-verified draft or strategy deliverable'],
    outputSchema: ['approvalId', 'gateType', 'decisionStatus', 'approverRole'],
    supportedActions: ['Require Business Owner Final Sign-Off'],
    requiresApprovalByDefault: true,
    defaultConfig: {
      approvalRequired: true,
      approvalGateType: 'publishing_readiness',
      approverRole: 'Business Owner',
      approvalPrompt: 'Confirm brand accuracy, claims, and publishing readiness.',
      maxRetries: 0,
      timeoutMs: 30_000,
    },
    sourceHandles: [{ id: 'approved', label: 'Signed Off', edgeType: 'approval' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'conflict_resolution',
    category: 'governance',
    label: 'Conflict Resolution Gate',
    shortLabel: 'Conflict Check',
    description: 'Runs Stage 3 cross-agent conflict detection and flags contradictions for human review if discovered.',
    accentHex: '#047857',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'real_service',
    capabilities: ['conflict_detection', 'human_escalation'],
    inputRequirements: ['Two or more specialist outputs'],
    outputSchema: ['openConflictsCount', 'conflictIds', 'requiresHumanReview'],
    supportedActions: ['Detect & Record Cross-Agent Contradictions'],
    defaultConfig: {
      blockOnOpenConflicts: false,
      maxRetries: 0,
      timeoutMs: 30_000,
    },
    sourceHandles: [{ id: 'default', label: 'Resolved', edgeType: 'dependency' }],
    acceptsIncomingConnections: true,
  },
  {
    subtype: 'qa_verification',
    category: 'governance',
    label: 'QA Verification Gate',
    shortLabel: 'QA Gate',
    description: 'Runs deterministic QA checks over technical findings, internal links, and claim provenance.',
    accentHex: '#34D399',
    backingAgentId: 'quality_assurance_agent',
    executionType: 'real_service',
    capabilities: ['qa_validation', 'claim_provenance_check'],
    inputRequirements: ['Upstream deliverables'],
    outputSchema: ['verdict', 'openCriticalIssues', 'unsupportedClaimsCount', 'evidenceTrust'],
    supportedActions: ['Execute Automated QA Verification'],
    defaultConfig: {
      approvalRequired: false,
      approvalGateType: null,
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    sourceHandles: [
      { id: 'default', label: 'Verified', edgeType: 'dependency' },
      { id: 'error', label: 'On Fail', edgeType: 'error' },
    ],
    acceptsIncomingConnections: true,
  },
];

export const STUDIO_NODE_CATALOG: readonly StudioNodeCatalogItem[] = [
  ...STUDIO_AGENT_NODES,
  ...STUDIO_TRIGGER_NODES,
  ...STUDIO_CONDITION_NODES,
  ...STUDIO_DATA_NODES,
  ...STUDIO_GOVERNANCE_NODES,
] as const;

export const STUDIO_NODE_CATALOG_MAP: Record<StudioNodeSubtype, StudioNodeCatalogItem> =
  Object.fromEntries(
    STUDIO_NODE_CATALOG.map((item) => [item.subtype, item]),
  ) as Record<StudioNodeSubtype, StudioNodeCatalogItem>;

export function getStudioNodeCatalogItem(
  subtype: string,
): StudioNodeCatalogItem | null {
  return (STUDIO_NODE_CATALOG_MAP as Record<string, StudioNodeCatalogItem | undefined>)[subtype] ?? null;
}

export function getStudioNodesByCategory(
  category: StudioNodeCategory,
): StudioNodeCatalogItem[] {
  return STUDIO_NODE_CATALOG.filter((n) => n.category === category);
}

export function createStudioNodeFromCatalog(
  subtype: StudioNodeSubtype,
  position: { x: number; y: number },
  customId?: string,
): StudioCanvasNode {
  const item = STUDIO_NODE_CATALOG_MAP[subtype];
  const id =
    customId ??
    `node_${subtype.replace(/[^a-z0-9]/gi, '_').slice(0, 18)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    category: item.category,
    subtype: item.subtype,
    label: item.label,
    position,
    config: structuredClone(item.defaultConfig),
  };
}

// ============================================================================
// 5 REUSABLE BUILT-IN STAGE 4 WORKFLOW TEMPLATES (REAL BACKEND CAPABILITIES)
// ============================================================================

function edge(
  id: string,
  source: string,
  target: string,
  edgeType: StudioCanvasEdge['edgeType'] = 'dependency',
  sourceHandle: StudioCanvasEdge['sourceHandle'] = 'default',
  label?: string,
): StudioCanvasEdge {
  return { id, source, target, edgeType, sourceHandle, label };
}

export const BUILTIN_STUDIO_TEMPLATES: readonly StudioWorkflowTemplateRecord[] = [
  {
    id: 'tpl_complete_seo_audit',
    tenantId: null,
    projectId: null,
    name: 'Complete SEO Audit',
    category: 'Technical & Vitals',
    description:
      'Runs Technical SEO crawl diagnostics and PageSpeed Core Web Vitals analysis, verifies findings with QA, and compiles an evidence-backed Executive Report.',
    isBuiltIn: true,
    requiredProviders: ['Technical SEO Crawler', 'PageSpeed Insights'],
    createdBy: 'Rovix System',
    createdAt: '2026-01-01T00:00:00.000Z',
    graph: {
      nodes: [
        createStudioNodeFromCatalog('manual_trigger', { x: 40, y: 170 }, 'trigger_start'),
        {
          ...createStudioNodeFromCatalog('technical_seo_agent', { x: 300, y: 80 }, 'tech_seo'),
          label: 'Technical SEO Crawl & Audit',
        },
        {
          ...createStudioNodeFromCatalog('performance_analysis_agent', { x: 300, y: 260 }, 'perf_vitals'),
          label: 'Core Web Vitals & Speed',
        },
        {
          ...createStudioNodeFromCatalog('merge_results', { x: 580, y: 170 }, 'merge_diagnostics'),
          label: 'Merge Technical & Speed',
        },
        {
          ...createStudioNodeFromCatalog('quality_assurance_agent', { x: 840, y: 170 }, 'qa_verify'),
          label: 'QA Verification',
        },
        {
          ...createStudioNodeFromCatalog('reporting_agent', { x: 1100, y: 170 }, 'exec_report'),
          label: 'Executive Audit Report',
        },
      ],
      edges: [
        edge('e_t_tech', 'trigger_start', 'tech_seo'),
        edge('e_t_perf', 'trigger_start', 'perf_vitals'),
        edge('e_tech_m', 'tech_seo', 'merge_diagnostics'),
        edge('e_perf_m', 'perf_vitals', 'merge_diagnostics'),
        edge('e_m_qa', 'merge_diagnostics', 'qa_verify'),
        edge('e_qa_rep', 'qa_verify', 'exec_report'),
      ],
    },
  },
  {
    id: 'tpl_competitor_intelligence',
    tenantId: null,
    projectId: null,
    name: 'Competitor Intelligence',
    category: 'Competitive Research',
    description:
      'Benchmarks registered competitors, validates keyword overlap and approved geographic relevance in parallel, builds a prioritized Content Strategy, and audits evidence via QA.',
    isBuiltIn: true,
    requiredProviders: ['Competitor Analyzer', 'Keyword Lab', 'Geo Intelligence'],
    createdBy: 'Rovix System',
    createdAt: '2026-01-01T00:00:00.000Z',
    graph: {
      nodes: [
        createStudioNodeFromCatalog('manual_trigger', { x: 40, y: 170 }, 'trigger_comp'),
        {
          ...createStudioNodeFromCatalog('competitor_intelligence_agent', { x: 290, y: 170 }, 'comp_research'),
          label: 'Competitor Research',
        },
        {
          ...createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 560, y: 80 }, 'kw_analysis'),
          label: 'Keyword Analysis',
        },
        {
          ...createStudioNodeFromCatalog('geographic_intelligence_agent', { x: 560, y: 260 }, 'geo_analysis'),
          label: 'Geographic Analysis',
        },
        {
          ...createStudioNodeFromCatalog('content_strategy_agent', { x: 840, y: 170 }, 'content_strat'),
          label: 'Content Strategy',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.content_strategy_agent.defaultConfig,
            approvalRequired: false,
            approvalGateType: null,
          },
        },
        {
          ...createStudioNodeFromCatalog('quality_assurance_agent', { x: 1110, y: 170 }, 'qa_audit'),
          label: 'QA Evidence Audit',
        },
      ],
      edges: [
        edge('e_c_1', 'trigger_comp', 'comp_research'),
        edge('e_c_2', 'comp_research', 'kw_analysis'),
        edge('e_c_3', 'comp_research', 'geo_analysis'),
        edge('e_c_4', 'kw_analysis', 'content_strat'),
        edge('e_c_5', 'geo_analysis', 'content_strat'),
        edge('e_c_6', 'content_strat', 'qa_audit'),
      ],
    },
  },
  {
    id: 'tpl_seo_content_production',
    tenantId: null,
    projectId: null,
    name: 'SEO Content Production',
    category: 'Editorial & Approvals',
    description:
      'End-to-end governed editorial workflow: Keyword Research + Competitor Analysis -> Content Brief -> Mandatory Human Approval -> Gemini Content Generation -> QA -> Business Owner Final Approval.',
    isBuiltIn: true,
    requiredProviders: ['Keyword Lab', 'Competitor Analyzer', 'Gemini Content Provider'],
    createdBy: 'Rovix System',
    createdAt: '2026-01-01T00:00:00.000Z',
    graph: {
      nodes: [
        createStudioNodeFromCatalog('approved_project_event', { x: 30, y: 170 }, 'approved_start'),
        {
          ...createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 280, y: 80 }, 'kw_research'),
          label: 'Keyword Research',
        },
        {
          ...createStudioNodeFromCatalog('competitor_intelligence_agent', { x: 280, y: 260 }, 'comp_analysis'),
          label: 'Competitor Analysis',
        },
        {
          ...createStudioNodeFromCatalog('content_strategy_agent', { x: 550, y: 170 }, 'content_brief'),
          label: 'Content Brief',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.content_strategy_agent.defaultConfig,
            approvalRequired: false,
            approvalGateType: null,
          },
        },
        {
          ...createStudioNodeFromCatalog('human_approval', { x: 800, y: 170 }, 'brief_approval'),
          label: 'Brief Approval Gate',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.human_approval.defaultConfig,
            approvalRequired: true,
            approvalGateType: 'content_brief',
            approverRole: 'Agency Owner',
          },
        },
        {
          ...createStudioNodeFromCatalog('content_generation_agent', { x: 1050, y: 170 }, 'content_gen'),
          label: 'Content Generation',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.content_generation_agent.defaultConfig,
            approvalRequired: false,
            approvalGateType: null,
          },
        },
        {
          ...createStudioNodeFromCatalog('quality_assurance_agent', { x: 1310, y: 170 }, 'qa_claims'),
          label: 'QA Verification',
        },
        {
          ...createStudioNodeFromCatalog('business_owner_review', { x: 1560, y: 170 }, 'final_approval'),
          label: 'Final Owner Approval',
        },
      ],
      edges: [
        edge('e_p_1', 'approved_start', 'kw_research'),
        edge('e_p_2', 'approved_start', 'comp_analysis'),
        edge('e_p_3', 'kw_research', 'content_brief'),
        edge('e_p_4', 'comp_analysis', 'content_brief'),
        edge('e_p_5', 'content_brief', 'brief_approval'),
        edge('e_p_6', 'brief_approval', 'content_gen', 'approval', 'approved', 'Approved'),
        edge('e_p_7', 'content_gen', 'qa_claims'),
        edge('e_p_8', 'qa_claims', 'final_approval'),
      ],
    },
  },
  {
    id: 'tpl_geographic_seo_research',
    tenantId: null,
    projectId: null,
    name: 'Geographic SEO Research',
    category: 'Regional & Local Markets',
    description:
      'Verifies Approved Markets, maps regional demand via Geographic Intelligence, pairs with Keyword Analysis and Content Strategy, and compiles a regional SEO report.',
    isBuiltIn: true,
    requiredProviders: ['Geo Intelligence', 'Keyword Lab'],
    createdBy: 'Rovix System',
    createdAt: '2026-01-01T00:00:00.000Z',
    graph: {
      nodes: [
        {
          ...createStudioNodeFromCatalog('approved_project_event', { x: 40, y: 170 }, 'approved_markets'),
          label: 'Approved Markets Gate',
          config: {
            requireApprovedProfile: false,
            requireApprovedMarkets: true,
            maxRetries: 0,
            timeoutMs: 20_000,
          },
        },
        {
          ...createStudioNodeFromCatalog('geographic_intelligence_agent', { x: 310, y: 170 }, 'geo_intel'),
          label: 'Geographic Intelligence',
        },
        {
          ...createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 580, y: 170 }, 'kw_geo'),
          label: 'Keyword Analysis',
        },
        {
          ...createStudioNodeFromCatalog('content_strategy_agent', { x: 850, y: 170 }, 'geo_strategy'),
          label: 'Regional Content Strategy',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.content_strategy_agent.defaultConfig,
            approvalRequired: false,
            approvalGateType: null,
          },
        },
        {
          ...createStudioNodeFromCatalog('reporting_agent', { x: 1120, y: 170 }, 'geo_report'),
          label: 'Geographic SEO Report',
        },
      ],
      edges: [
        edge('e_g_1', 'approved_markets', 'geo_intel'),
        edge('e_g_2', 'geo_intel', 'kw_geo'),
        edge('e_g_3', 'kw_geo', 'geo_strategy'),
        edge('e_g_4', 'geo_strategy', 'geo_report'),
      ],
    },
  },
  {
    id: 'tpl_seo_opportunity_analysis',
    tenantId: null,
    projectId: null,
    name: 'SEO Opportunity Analysis',
    category: 'Multi-Signal Synthesis',
    description:
      'Executes Technical Audit, Performance, Keywords, and Competitors in parallel -> merges evidence -> builds unified Content Strategy -> QA Conflict Check -> Executive Opportunity Report.',
    isBuiltIn: true,
    requiredProviders: ['Technical SEO Crawler', 'PageSpeed Insights', 'Keyword Lab', 'Competitor Analyzer'],
    createdBy: 'Rovix System',
    createdAt: '2026-01-01T00:00:00.000Z',
    graph: {
      nodes: [
        createStudioNodeFromCatalog('manual_trigger', { x: 30, y: 240 }, 'trigger_opp'),
        {
          ...createStudioNodeFromCatalog('technical_seo_agent', { x: 290, y: 30 }, 'opp_tech'),
          label: 'Technical Audit',
        },
        {
          ...createStudioNodeFromCatalog('performance_analysis_agent', { x: 290, y: 170 }, 'opp_perf'),
          label: 'Performance',
        },
        {
          ...createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 290, y: 310 }, 'opp_kw'),
          label: 'Keywords',
        },
        {
          ...createStudioNodeFromCatalog('competitor_intelligence_agent', { x: 290, y: 450 }, 'opp_comp'),
          label: 'Competitors',
        },
        {
          ...createStudioNodeFromCatalog('merge_results', { x: 580, y: 240 }, 'opp_merge'),
          label: 'Merge All Evidence',
        },
        {
          ...createStudioNodeFromCatalog('content_strategy_agent', { x: 840, y: 240 }, 'opp_strategy'),
          label: 'Opportunity Strategy',
          config: {
            ...STUDIO_NODE_CATALOG_MAP.content_strategy_agent.defaultConfig,
            approvalRequired: false,
            approvalGateType: null,
          },
        },
        {
          ...createStudioNodeFromCatalog('quality_assurance_agent', { x: 1100, y: 240 }, 'opp_qa'),
          label: 'QA & Conflict Audit',
        },
        {
          ...createStudioNodeFromCatalog('reporting_agent', { x: 1360, y: 240 }, 'opp_report'),
          label: 'Opportunity Report',
        },
      ],
      edges: [
        edge('e_o_1', 'trigger_opp', 'opp_tech'),
        edge('e_o_2', 'trigger_opp', 'opp_perf'),
        edge('e_o_3', 'trigger_opp', 'opp_kw'),
        edge('e_o_4', 'trigger_opp', 'opp_comp'),
        edge('e_o_5', 'opp_tech', 'opp_merge'),
        edge('e_o_6', 'opp_perf', 'opp_merge'),
        edge('e_o_7', 'opp_kw', 'opp_merge'),
        edge('e_o_8', 'opp_comp', 'opp_merge'),
        edge('e_o_9', 'opp_merge', 'opp_strategy'),
        edge('e_o_10', 'opp_strategy', 'opp_qa'),
        edge('e_o_11', 'opp_qa', 'opp_report'),
      ],
    },
  },
];
