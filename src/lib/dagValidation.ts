import type {
  AgentId,
  AgentStationId,
  ApprovalGateType,
  DagValidationResult,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
  StructuredAgentHandoff,
  WorkflowTaskRecord,
  WorkflowTemplateId,
} from '../types/agentFactory';
import { AGENT_STATION_IDS } from './agentFactoryCatalog';

const STATION_SET = new Set<string>(AGENT_STATION_IDS);
const VALID_AGENT_SET = new Set<string>(['orchestrator', ...AGENT_STATION_IDS]);

export interface WorkflowTemplateMeta {
  templateId: WorkflowTemplateId;
  name: string;
  description: string;
  defaultObjective: string;
  estimatedStages: number;
}

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplateMeta[] = [
  {
    templateId: 'seo_content_pipeline',
    name: 'Full Multi-Agent SEO & Content Pipeline',
    description:
      'Runs Research -> parallel Competitor, Keyword & Geo Intel -> Content Strategy (Owner Approval) -> Gemini Content Draft (Owner Approval) -> QA Verification -> Executive Report.',
    defaultObjective:
      'Analyze market evidence, build approved strategy brief, author grounded draft with Gemini, and validate SEO QA.',
    estimatedStages: 6,
  },
  {
    templateId: 'technical_performance_audit',
    name: 'Technical SEO & Performance Diagnostic DAG',
    description:
      'Runs Technical SEO Crawler and PageSpeed Analysis in parallel, followed by QA Reverification and structured Reporting.',
    defaultObjective:
      'Execute technical site audit and Core Web Vitals checks in parallel, verify findings, and compile evidence report.',
    estimatedStages: 3,
  },
  {
    templateId: 'content_brief_to_draft',
    name: 'Brief -> Gemini Content Draft -> QA Pipeline',
    description:
      'Synthesizes existing project evidence into a Content Strategy brief (requires approval), generates a structured SEO draft via Gemini, and validates links/claims via QA.',
    defaultObjective:
      'Create an approved SEO content brief from real evidence, generate an AI draft, and run QA checks.',
    estimatedStages: 5,
  },
  {
    templateId: 'competitor_research_collaboration',
    name: 'Competitor Research Collaboration (Stage 3)',
    description:
      'Competitor Intelligence detects coverage gaps -> collaborates with Keyword & Geographic Intelligence via structured messages & dynamic delegation -> Content Strategy updates recommendation -> QA verifies evidence.',
    defaultObjective:
      'Analyze competitor gaps, validate keyword intent and approved market fit collaboratively, and produce an evidence-verified recommendation.',
    estimatedStages: 5,
  },
  {
    templateId: 'technical_seo_collaboration',
    name: 'Technical SEO & Performance Collaboration (Stage 3)',
    description:
      'Technical SEO shares crawl findings with Performance Analysis & Research to separate speed vs structural issues -> QA validates fixes -> Reporting compiles prioritized remediation.',
    defaultObjective:
      'Cross-verify technical SEO issues with Core Web Vitals telemetry and source evidence before executive remediation reporting.',
    estimatedStages: 4,
  },
  {
    templateId: 'content_production_collaboration',
    name: 'Content Production Collaboration (Stage 3)',
    description:
      'Keyword + Competitor Intelligence feed versioned Shared Context -> Content Strategy Brief [Approval Gate] -> Content Generation [Approval Gate] -> QA Evidence & Conflict Check -> Publishing Readiness [Approval Gate] -> Reporting.',
    defaultObjective:
      'Collaboratively produce an evidence-grounded SEO article with human approval gates at brief, draft, and publishing readiness.',
    estimatedStages: 6,
  },
] as const;

export function buildWorkflowBlueprint(
  templateId: WorkflowTemplateId,
  options?: {
    requireStrategyApproval?: boolean;
    requireDraftApproval?: boolean;
    requirePublishApproval?: boolean;
    includeGeo?: boolean;
    includeCompetitor?: boolean;
  },
): {
  name: string;
  nodes: DagWorkflowNodeInput[];
  edges: DagWorkflowEdgeInput[];
} {
  const requireStrategyApproval = options?.requireStrategyApproval ?? true;
  const requireDraftApproval = options?.requireDraftApproval ?? true;
  const requirePublishApproval = options?.requirePublishApproval ?? false;
  const includeGeo = options?.includeGeo ?? true;
  const includeCompetitor = options?.includeCompetitor ?? true;

  if (templateId === 'technical_performance_audit') {
    const nodes: DagWorkflowNodeInput[] = [
      {
        nodeKey: 'tech_crawl',
        agentId: 'technical_seo_agent',
        title: 'Technical SEO Site Crawl & Indexability',
        maxRetries: 2,
        timeoutMs: 90_000,
      },
      {
        nodeKey: 'perf_audit',
        agentId: 'performance_analysis_agent',
        title: 'Core Web Vitals & PageSpeed Audit',
        maxRetries: 2,
        timeoutMs: 90_000,
      },
      {
        nodeKey: 'qa_verify',
        agentId: 'quality_assurance_agent',
        title: 'Technical & Vitals QA Verification',
        maxRetries: 1,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'final_report',
        agentId: 'reporting_agent',
        title: 'Diagnostic Executive Report',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
    ];
    const edges: DagWorkflowEdgeInput[] = [
      { fromNodeKey: 'tech_crawl', toNodeKey: 'qa_verify' },
      { fromNodeKey: 'perf_audit', toNodeKey: 'qa_verify' },
      { fromNodeKey: 'qa_verify', toNodeKey: 'final_report' },
    ];
    return {
      name: 'Technical SEO & Performance Diagnostic DAG',
      nodes,
      edges,
    };
  }

  if (templateId === 'content_brief_to_draft') {
    const nodes: DagWorkflowNodeInput[] = [
      {
        nodeKey: 'research',
        agentId: 'research_agent',
        title: 'Business Context & Evidence Gathering',
        maxRetries: 2,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'strategy',
        agentId: 'content_strategy_agent',
        title: 'Structured Content Brief Planning',
        approvalRequired: requireStrategyApproval,
        approvalGateType: requireStrategyApproval ? 'content_brief' : null,
        maxRetries: 1,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'content_draft',
        agentId: 'content_generation_agent',
        title: 'SEO Draft Generation (Gemini)',
        approvalRequired: requireDraftApproval,
        approvalGateType: requireDraftApproval ? 'generated_content' : null,
        maxRetries: 2,
        timeoutMs: 90_000,
      },
      {
        nodeKey: 'qa_check',
        agentId: 'quality_assurance_agent',
        title: 'Draft Structure, Claims & Link QA',
        approvalRequired: requirePublishApproval,
        approvalGateType: requirePublishApproval ? 'publishing_readiness' : null,
        maxRetries: 1,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'report',
        agentId: 'reporting_agent',
        title: 'Deliverable Summary Report',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
    ];
    const edges: DagWorkflowEdgeInput[] = [
      { fromNodeKey: 'research', toNodeKey: 'strategy' },
      { fromNodeKey: 'strategy', toNodeKey: 'content_draft' },
      { fromNodeKey: 'content_draft', toNodeKey: 'qa_check' },
      { fromNodeKey: 'qa_check', toNodeKey: 'report' },
    ];
    return {
      name: 'Brief -> Gemini Content Draft -> QA Pipeline',
      nodes,
      edges,
    };
  }

  if (templateId === 'competitor_research_collaboration') {
    const nodes: DagWorkflowNodeInput[] = [
      {
        nodeKey: 'research_seed',
        agentId: 'research_agent',
        title: 'Seed Approved Business Context & Evidence',
        maxRetries: 2,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'competitor_gap_discovery',
        agentId: 'competitor_intelligence_agent',
        title: 'Competitor Coverage & Gap Discovery (Delegates Verification)',
        maxRetries: 2,
        timeoutMs: 75_000,
        config: { enableIntelligentDelegation: true },
      },
      {
        nodeKey: 'keyword_validation',
        agentId: 'keyword_intelligence_agent',
        title: 'Collaborative Keyword Intent & Overlap Validation',
        maxRetries: 2,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'geo_relevance_check',
        agentId: 'geographic_intelligence_agent',
        title: 'Approved Target Market Relevance Verification',
        maxRetries: 2,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'strategy_recommendation',
        agentId: 'content_strategy_agent',
        title: 'Evidence-Backed Content Strategy Recommendation',
        approvalRequired: requireStrategyApproval,
        approvalGateType: requireStrategyApproval ? 'content_strategy' : null,
        maxRetries: 1,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'qa_evidence_audit',
        agentId: 'quality_assurance_agent',
        title: 'QA Evidence Trust & Conflict Detection',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'collab_report',
        agentId: 'reporting_agent',
        title: 'Collaborative Competitor Intelligence Report',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
    ];
    const edges: DagWorkflowEdgeInput[] = [
      { fromNodeKey: 'research_seed', toNodeKey: 'competitor_gap_discovery' },
      { fromNodeKey: 'competitor_gap_discovery', toNodeKey: 'keyword_validation' },
      { fromNodeKey: 'competitor_gap_discovery', toNodeKey: 'geo_relevance_check' },
      { fromNodeKey: 'keyword_validation', toNodeKey: 'strategy_recommendation' },
      { fromNodeKey: 'geo_relevance_check', toNodeKey: 'strategy_recommendation' },
      { fromNodeKey: 'strategy_recommendation', toNodeKey: 'qa_evidence_audit' },
      { fromNodeKey: 'qa_evidence_audit', toNodeKey: 'collab_report' },
    ];
    return {
      name: 'Competitor Research Collaboration (Stage 3)',
      nodes,
      edges,
    };
  }

  if (templateId === 'technical_seo_collaboration') {
    const nodes: DagWorkflowNodeInput[] = [
      {
        nodeKey: 'tech_crawl_findings',
        agentId: 'technical_seo_agent',
        title: 'Technical SEO Crawl & Issue Discovery',
        maxRetries: 2,
        timeoutMs: 90_000,
        config: { enableIntelligentDelegation: true },
      },
      {
        nodeKey: 'perf_cwv_check',
        agentId: 'performance_analysis_agent',
        title: 'PageSpeed & Core Web Vitals Correlation',
        maxRetries: 2,
        timeoutMs: 90_000,
      },
      {
        nodeKey: 'research_page_context',
        agentId: 'research_agent',
        title: 'Affected Page Structure & Business Priority Verification',
        maxRetries: 2,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'qa_fix_validation',
        agentId: 'quality_assurance_agent',
        title: 'QA Cross-Agent Fix & Conflict Verification',
        maxRetries: 1,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'tech_remediation_report',
        agentId: 'reporting_agent',
        title: 'Prioritized Technical & Performance Remediation Report',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
    ];
    const edges: DagWorkflowEdgeInput[] = [
      { fromNodeKey: 'tech_crawl_findings', toNodeKey: 'perf_cwv_check' },
      { fromNodeKey: 'tech_crawl_findings', toNodeKey: 'research_page_context' },
      { fromNodeKey: 'perf_cwv_check', toNodeKey: 'qa_fix_validation' },
      { fromNodeKey: 'research_page_context', toNodeKey: 'qa_fix_validation' },
      { fromNodeKey: 'qa_fix_validation', toNodeKey: 'tech_remediation_report' },
    ];
    return {
      name: 'Technical SEO & Performance Collaboration (Stage 3)',
      nodes,
      edges,
    };
  }

  if (templateId === 'content_production_collaboration') {
    const nodes: DagWorkflowNodeInput[] = [
      {
        nodeKey: 'keyword_foundation',
        agentId: 'keyword_intelligence_agent',
        title: 'Approved Keyword & Intent Evidence',
        maxRetries: 2,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'competitor_evidence',
        agentId: 'competitor_intelligence_agent',
        title: 'Competitor Coverage & Differentiation Evidence',
        maxRetries: 2,
        timeoutMs: 75_000,
        config: { enableIntelligentDelegation: true },
      },
      {
        nodeKey: 'content_brief_plan',
        agentId: 'content_strategy_agent',
        title: 'Structured SEO Content Brief (Versioned Context)',
        approvalRequired: requireStrategyApproval,
        approvalGateType: requireStrategyApproval ? 'content_brief' : null,
        maxRetries: 1,
        timeoutMs: 45_000,
      },
      {
        nodeKey: 'draft_authoring',
        agentId: 'content_generation_agent',
        title: 'Evidence-Grounded Content Draft Generation',
        approvalRequired: requireDraftApproval,
        approvalGateType: requireDraftApproval ? 'generated_content' : null,
        maxRetries: 2,
        timeoutMs: 90_000,
      },
      {
        nodeKey: 'qa_claims_and_links',
        agentId: 'quality_assurance_agent',
        title: 'QA Claim Evidence, Conflict & Publishing Readiness Audit',
        approvalRequired: options?.requirePublishApproval ?? true,
        approvalGateType:
          (options?.requirePublishApproval ?? true) ? 'publishing_readiness' : null,
        maxRetries: 1,
        timeoutMs: 60_000,
      },
      {
        nodeKey: 'production_report',
        agentId: 'reporting_agent',
        title: 'Content Production & Evidence Provenance Report',
        maxRetries: 1,
        timeoutMs: 45_000,
      },
    ];
    const edges: DagWorkflowEdgeInput[] = [
      { fromNodeKey: 'keyword_foundation', toNodeKey: 'content_brief_plan' },
      { fromNodeKey: 'competitor_evidence', toNodeKey: 'content_brief_plan' },
      { fromNodeKey: 'content_brief_plan', toNodeKey: 'draft_authoring' },
      { fromNodeKey: 'draft_authoring', toNodeKey: 'qa_claims_and_links' },
      { fromNodeKey: 'qa_claims_and_links', toNodeKey: 'production_report' },
    ];
    return {
      name: 'Content Production Collaboration (Stage 3)',
      nodes,
      edges,
    };
  }

  // Default: seo_content_pipeline
  const nodes: DagWorkflowNodeInput[] = [
    {
      nodeKey: 'research',
      agentId: 'research_agent',
      title: 'Business Context & Source Evidence Discovery',
      maxRetries: 2,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'keyword_intel',
      agentId: 'keyword_intelligence_agent',
      title: 'Keyword Intent & Cluster Analysis',
      maxRetries: 2,
      timeoutMs: 60_000,
    },
  ];
  const edges: DagWorkflowEdgeInput[] = [
    { fromNodeKey: 'research', toNodeKey: 'keyword_intel' },
    { fromNodeKey: 'keyword_intel', toNodeKey: 'content_strategy' },
  ];

  if (includeCompetitor) {
    nodes.push({
      nodeKey: 'competitor_intel',
      agentId: 'competitor_intelligence_agent',
      title: 'Competitor Coverage & Content Gap Analysis',
      maxRetries: 2,
      timeoutMs: 75_000,
    });
    edges.push(
      { fromNodeKey: 'research', toNodeKey: 'competitor_intel' },
      { fromNodeKey: 'competitor_intel', toNodeKey: 'content_strategy' },
    );
  }

  if (includeGeo) {
    nodes.push({
      nodeKey: 'geo_intel',
      agentId: 'geographic_intelligence_agent',
      title: 'Approved Market & Regional Signals',
      maxRetries: 2,
      timeoutMs: 60_000,
    });
    edges.push(
      { fromNodeKey: 'research', toNodeKey: 'geo_intel' },
      { fromNodeKey: 'geo_intel', toNodeKey: 'content_strategy' },
    );
  }

  nodes.push(
    {
      nodeKey: 'content_strategy',
      agentId: 'content_strategy_agent',
      title: 'Unified Content Strategy & Target Page Briefs',
      approvalRequired: requireStrategyApproval,
      approvalGateType: requireStrategyApproval ? 'content_strategy' : null,
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'content_generation',
      agentId: 'content_generation_agent',
      title: 'AI Draft Generation from Approved Brief',
      approvalRequired: requireDraftApproval,
      approvalGateType: requireDraftApproval ? 'generated_content' : null,
      maxRetries: 2,
      timeoutMs: 90_000,
    },
    {
      nodeKey: 'qa_validation',
      agentId: 'quality_assurance_agent',
      title: 'Quality Assurance & Internal Link Verification',
      approvalRequired: requirePublishApproval,
      approvalGateType: requirePublishApproval ? 'publishing_readiness' : null,
      maxRetries: 1,
      timeoutMs: 45_000,
    },
    {
      nodeKey: 'reporting',
      agentId: 'reporting_agent',
      title: 'Workflow Evidence & Execution Report',
      maxRetries: 1,
      timeoutMs: 45_000,
    },
  );

  edges.push(
    { fromNodeKey: 'content_strategy', toNodeKey: 'content_generation' },
    { fromNodeKey: 'content_generation', toNodeKey: 'qa_validation' },
    { fromNodeKey: 'qa_validation', toNodeKey: 'reporting' },
  );

  return {
    name: 'Full Multi-Agent SEO & Content Pipeline',
    nodes,
    edges,
  };
}

export function validateWorkflowDag(
  nodes: DagWorkflowNodeInput[],
  edges: DagWorkflowEdgeInput[],
): DagValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return {
      valid: false,
      errors: ['Workflow DAG must contain at least one execution node.'],
      cyclePath: [],
      topologicalOrder: [],
      layers: [],
    };
  }

  const nodeMap = new Map<string, DagWorkflowNodeInput>();
  for (const node of nodes) {
    const key = typeof node.nodeKey === 'string' ? node.nodeKey.trim() : '';
    if (!key) {
      errors.push('Every DAG node must have a non-empty nodeKey.');
      continue;
    }
    if (nodeMap.has(key)) {
      errors.push(`Duplicate DAG nodeKey "${key}" detected.`);
      continue;
    }
    if (!STATION_SET.has(node.agentId)) {
      errors.push(`Invalid or unknown specialist agentId "${node.agentId}" on node "${key}".`);
      continue;
    }
    if (!node.title || !node.title.trim()) {
      errors.push(`Node "${key}" must specify a non-empty title.`);
    }
    nodeMap.set(key, node);
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const key of nodeMap.keys()) {
    adj.set(key, []);
    inDegree.set(key, 0);
  }

  const seenEdges = new Set<string>();
  for (const edge of edges) {
    const from = edge.fromNodeKey?.trim();
    const to = edge.toNodeKey?.trim();
    if (!from || !to) {
      errors.push('DAG edges must include both fromNodeKey and toNodeKey.');
      continue;
    }
    if (from === to) {
      errors.push(`Self-dependency loop on node "${from}" is not permitted.`);
      continue;
    }
    if (!nodeMap.has(from) || !nodeMap.has(to)) {
      errors.push(`Edge "${from} -> ${to}" references an unknown DAG node.`);
      continue;
    }
    const edgeKey = `${from}=>${to}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    adj.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      cyclePath: [],
      topologicalOrder: [],
      layers: [],
    };
  }

  // Kahn's topological sort in parallel execution layers
  const topologicalOrder: string[] = [];
  const layers: string[][] = [];
  const remainingDegree = new Map(inDegree);
  let frontier = Array.from(remainingDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([key]) => key);

  while (frontier.length > 0) {
    layers.push([...frontier]);
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      topologicalOrder.push(current);
      for (const nxt of adj.get(current) ?? []) {
        const updated = (remainingDegree.get(nxt) ?? 0) - 1;
        remainingDegree.set(nxt, updated);
        if (updated === 0) {
          nextFrontier.push(nxt);
        }
      }
    }
    frontier = nextFrontier;
  }

  if (topologicalOrder.length !== nodeMap.size) {
    // Extract exact cycle nodes for actionable diagnostics
    const unvisited = Array.from(nodeMap.keys()).filter(
      (k) => !topologicalOrder.includes(k),
    );
    const cyclePath = findCyclePath(unvisited, adj);
    return {
      valid: false,
      errors: [
        cyclePath.length > 0
          ? `Circular dependency detected in workflow DAG: ${cyclePath.join(' -> ')}`
          : 'Circular dependency detected in workflow DAG.',
      ],
      cyclePath,
      topologicalOrder: [],
      layers: [],
    };
  }

  return {
    valid: true,
    errors: [],
    cyclePath: [],
    topologicalOrder,
    layers,
  };
}

/**
 * Node representation accepted by `validateWorkflowGraph(workflowNodes)` so callers
 * can validate DAGs expressed directly with node prerequisite lists before scheduling.
 */
export interface WorkflowGraphNode {
  id?: string;
  nodeKey?: string;
  agentId?: AgentStationId | string;
  title?: string;
  prerequisites?: string[];
  dependsOn?: string[];
}

export type Node = WorkflowGraphNode;

export interface WorkflowGraphDetailedValidation {
  valid: boolean;
  errors: string[];
  rootNodeIds: string[];
  unreachableNodeIds: string[];
  missingPrerequisites: Array<{ nodeId: string; missingPrerequisiteId: string }>;
  cyclePath: string[];
  topologicalOrder: string[];
}

/**
 * Detailed validator backing `validateWorkflowGraph(workflowNodes)`.
 * Verifies:
 * 1. Non-empty graph with unique node identifiers.
 * 2. Every declared prerequisite exists in `workflowNodes`.
 * 3. Zero self-dependencies or circular dependencies.
 * 4. At least one root entry task (inDegree === 0) and every task is reachable
 *    from the root entry set so no orphaned cycles or unschedulable nodes exist.
 */
export function validateWorkflowGraphDetailed(
  workflowNodes: WorkflowGraphNode[],
): WorkflowGraphDetailedValidation {
  const errors: string[] = [];
  const missingPrerequisites: Array<{ nodeId: string; missingPrerequisiteId: string }> = [];

  if (!Array.isArray(workflowNodes) || workflowNodes.length === 0) {
    return {
      valid: false,
      errors: ['Workflow graph must contain at least one task node.'],
      rootNodeIds: [],
      unreachableNodeIds: [],
      missingPrerequisites: [],
      cyclePath: [],
      topologicalOrder: [],
    };
  }

  const nodeIds = new Set<string>();
  const prereqsByNode = new Map<string, string[]>();

  for (const rawNode of workflowNodes) {
    const id = String(rawNode?.id ?? rawNode?.nodeKey ?? '').trim();
    if (!id) {
      errors.push('Every workflow node must define a non-empty id or nodeKey.');
      continue;
    }
    if (nodeIds.has(id)) {
      errors.push(`Duplicate workflow node identifier "${id}" detected.`);
      continue;
    }
    nodeIds.add(id);
    const deps = Array.isArray(rawNode.prerequisites)
      ? rawNode.prerequisites
      : Array.isArray(rawNode.dependsOn)
        ? rawNode.dependsOn
        : [];
    prereqsByNode.set(
      id,
      Array.from(new Set(deps.map((d) => String(d ?? '').trim()).filter(Boolean))),
    );
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const [nodeId, deps] of prereqsByNode.entries()) {
    for (const depId of deps) {
      if (depId === nodeId) {
        errors.push(`Self-dependency detected on workflow node "${nodeId}".`);
        continue;
      }
      if (!nodeIds.has(depId)) {
        missingPrerequisites.push({ nodeId, missingPrerequisiteId: depId });
        errors.push(
          `Workflow node "${nodeId}" depends on missing prerequisite "${depId}".`,
        );
        continue;
      }
      adj.get(depId)!.push(nodeId);
      inDegree.set(nodeId, (inDegree.get(nodeId) ?? 0) + 1);
    }
  }

  const rootNodeIds = Array.from(inDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);

  if (rootNodeIds.length === 0 && nodeIds.size > 0) {
    errors.push(
      'Workflow graph has no root task (every node has unmet prerequisites), indicating a cycle.',
    );
  }

  // BFS reachability from root nodes
  const reachable = new Set<string>(rootNodeIds);
  const bfsQueue = [...rootNodeIds];
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!reachable.has(nxt)) {
        reachable.add(nxt);
        bfsQueue.push(nxt);
      }
    }
  }

  const unreachableNodeIds = Array.from(nodeIds).filter((id) => !reachable.has(id));
  if (unreachableNodeIds.length > 0) {
    errors.push(
      `Unreachable workflow task(s) detected: ${unreachableNodeIds.join(', ')}.`,
    );
  }

  // Kahn's algorithm for full cycle detection & topological ordering
  const remaining = new Map(inDegree);
  const topo: string[] = [];
  const queue = [...rootNodeIds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    topo.push(cur);
    for (const nxt of adj.get(cur) ?? []) {
      const nextDeg = (remaining.get(nxt) ?? 0) - 1;
      remaining.set(nxt, nextDeg);
      if (nextDeg === 0) {
        queue.push(nxt);
      }
    }
  }

  let cyclePath: string[] = [];
  if (topo.length !== nodeIds.size) {
    const unvisited = Array.from(nodeIds).filter((id) => !topo.includes(id));
    cyclePath = findCyclePath(unvisited, adj);
    errors.push(
      cyclePath.length > 0
        ? `Circular dependency detected: ${cyclePath.join(' -> ')}`
        : 'Circular dependency detected in workflow graph.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    rootNodeIds,
    unreachableNodeIds,
    missingPrerequisites,
    cyclePath,
    topologicalOrder: errors.length === 0 ? topo : [],
  };
}

/**
 * Service-layer validator ensuring all tasks are reachable, there are no circular
 * dependencies, and all prerequisites exist before any task is scheduled for execution.
 */
export function validateWorkflowGraph(workflowNodes: WorkflowGraphNode[]): boolean {
  return validateWorkflowGraphDetailed(workflowNodes).valid;
}

function findCyclePath(
  candidates: string[],
  adj: Map<string, string[]>,
): string[] {
  const candidateSet = new Set(candidates);
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (node: string): string[] | null => {
    visited.add(node);
    onStack.add(node);
    stack.push(node);

    for (const next of adj.get(node) ?? []) {
      if (!candidateSet.has(next)) continue;
      if (onStack.has(next)) {
        const startIdx = stack.indexOf(next);
        return [...stack.slice(startIdx), next];
      }
      if (!visited.has(next)) {
        const res = dfs(next);
        if (res) return res;
      }
    }

    stack.pop();
    onStack.delete(node);
    return null;
  };

  for (const start of candidates) {
    if (!visited.has(start)) {
      const cycle = dfs(start);
      if (cycle) return cycle;
    }
  }
  return [];
}

/**
 * Given current task rows and DAG edges, returns tasks currently in `queued` status
 * whose every prerequisite node has reached `completed`.
 */
export function getReadyQueuedTasks(
  tasks: WorkflowTaskRecord[],
  edges: DagWorkflowEdgeInput[],
  nowMs: number = Date.now(),
): WorkflowTaskRecord[] {
  const byKey = new Map(tasks.map((t) => [t.nodeKey, t]));
  const prereqs = new Map<string, string[]>();
  for (const t of tasks) prereqs.set(t.nodeKey, []);
  for (const e of edges) {
    const list = prereqs.get(e.toNodeKey);
    if (list) list.push(e.fromNodeKey);
  }

  return tasks.filter((task) => {
    if (task.status !== 'queued' && task.status !== 'retrying') {
      return false;
    }
    if (task.status === 'retrying' && task.nextRetryAt) {
      const retryTs = Date.parse(task.nextRetryAt);
      if (Number.isFinite(retryTs) && retryTs > nowMs) {
        return false;
      }
    }
    const deps = prereqs.get(task.nodeKey) ?? [];
    return deps.every((depKey) => byKey.get(depKey)?.status === 'completed');
  });
}

export function getDownstreamNodeKeys(
  startNodeKey: string,
  edges: DagWorkflowEdgeInput[],
): string[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromNodeKey) ?? [];
    list.push(e.toNodeKey);
    adj.set(e.fromNodeKey, list);
  }
  const visited = new Set<string>();
  const queue = [...(adj.get(startNodeKey) ?? [])];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const nxt of adj.get(cur) ?? []) {
      if (!visited.has(nxt)) queue.push(nxt);
    }
  }
  return Array.from(visited);
}

export function computeExponentialBackoffMs(attemptNumber: number): number {
  const clamped = Math.max(1, Math.min(6, attemptNumber));
  return Math.min(30_000, 1_500 * Math.pow(2, clamped - 1));
}

export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
  normalized: StructuredAgentHandoff | null;
}

/**
 * Validates structured agent-to-agent handoff payloads before persistence or downstream consumption.
 * Also sanitizes summary strings so untrusted external page content cannot inject control directives.
 */
export function validateStructuredHandoff(input: {
  id?: string;
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
  status?: StructuredAgentHandoff['status'];
  validationSummary?: string;
  correlationId?: string;
  createdAt?: string;
}): HandoffValidationResult {
  const errors: string[] = [];

  if (!input.tenantId?.trim()) errors.push('tenantId is required');
  if (!input.projectId?.trim()) errors.push('projectId is required');
  if (!input.workflowId?.trim()) errors.push('workflowId is required');
  if (!input.executionId?.trim()) errors.push('executionId is required');
  if (!input.taskId?.trim()) errors.push('taskId is required');
  if (!VALID_AGENT_SET.has(input.sourceAgentId)) {
    errors.push(`Invalid sourceAgentId "${input.sourceAgentId}"`);
  }
  if (!VALID_AGENT_SET.has(input.destinationAgentId)) {
    errors.push(`Invalid destinationAgentId "${input.destinationAgentId}"`);
  }
  if (!input.inputRef?.trim()) errors.push('inputRef is required');
  if (!input.outputRef?.trim()) errors.push('outputRef is required');
  if (!Array.isArray(input.evidenceRefs)) {
    errors.push('evidenceRefs must be an array');
  }

  if (errors.length > 0) {
    return { valid: false, errors, normalized: null };
  }

  const sanitizedEvidenceRefs = input.evidenceRefs
    .map((ref) => String(ref ?? '').replace(/[\r\n\u0000-\u001F]/g, '').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 40);

  const rawSummary = (input.validationSummary ?? 'Validated structured output reference')
    .replace(/[\r\n\u0000-\u001F]/g, ' ')
    .trim()
    .slice(0, 280);

  return {
    valid: true,
    errors: [],
    normalized: {
      id: input.id ?? `hoff-${globalThis.crypto.randomUUID().slice(0, 12)}`,
      tenantId: input.tenantId.trim(),
      projectId: input.projectId.trim(),
      workflowId: input.workflowId.trim(),
      executionId: input.executionId.trim(),
      sourceAgentId: input.sourceAgentId,
      destinationAgentId: input.destinationAgentId,
      taskId: input.taskId.trim(),
      inputRef: input.inputRef.trim().slice(0, 200),
      outputRef: input.outputRef.trim().slice(0, 200),
      evidenceRefs: sanitizedEvidenceRefs,
      status: input.status ?? 'validated',
      validationSummary: rawSummary,
      correlationId: input.correlationId?.trim() || `corr-${globalThis.crypto.randomUUID().slice(0, 12)}`,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

export function sanitizeUntrustedTextForPrompt(
  raw: string | null | undefined,
  maxLength = 320,
): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\b(ignore\s+(all\s+)?previous\s+instructions|system\s*:|assistant\s*:)/gi, '[redacted-directive]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isOfficialApprovalGate(gateType: ApprovalGateType | null | undefined): boolean {
  return (
    gateType === 'content_strategy' ||
    gateType === 'content_brief' ||
    gateType === 'generated_content' ||
    gateType === 'publishing_readiness'
  );
}

export function getApprovalGateLabel(gateType: ApprovalGateType): string {
  switch (gateType) {
    case 'content_strategy':
      return 'Content Strategy Approval';
    case 'content_brief':
      return 'Content Brief Approval';
    case 'generated_content':
      return 'AI Draft Content Review';
    case 'publishing_readiness':
      return 'Publishing Readiness Sign-off';
  }
}

export function normalizeSpecialistAgentId(id: string): AgentStationId | null {
  return STATION_SET.has(id) ? (id as AgentStationId) : null;
}
