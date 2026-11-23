import type {
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
} from '../types/agentFactory';
import type {
  RestrictedConditionField,
  RestrictedConditionOperator,
  RestrictedConditionRule,
  StudioBranchHandle,
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioEdgeType,
  StudioProviderAvailabilityMap,
  StudioValidationIssue,
  StudioValidationReport,
  StudioWorkflowGraph,
} from '../types/workflowStudio';
import {
  validateWorkflowDag,
  validateWorkflowGraphDetailed,
} from './dagValidation';
import { getStudioNodeCatalogItem } from './workflowStudioCatalog';

export const MAX_STUDIO_NODES = 30;
export const MAX_STUDIO_EDGES = 60;
export const MAX_STUDIO_GRAPH_BYTES = 64_000;

export const ALLOWED_CONDITION_FIELDS: readonly RestrictedConditionField[] = [
  'evidenceCount',
  'keywordCount',
  'competitorCount',
  'contentGapCount',
  'healthScore',
  'mobileScore',
  'desktopScore',
  'openCriticalIssues',
  'openConflictsCount',
  'hasApprovedProfile',
  'hasApprovedMarkets',
  'upstreamSucceeded',
  'approvalStatus',
  'qaVerdict',
  'wordCount',
] as const;

export const ALLOWED_CONDITION_OPERATORS: readonly RestrictedConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
  'is_true',
  'is_false',
] as const;

const ALLOWED_FIELD_SET = new Set<string>(ALLOWED_CONDITION_FIELDS);
const ALLOWED_OP_SET = new Set<string>(ALLOWED_CONDITION_OPERATORS);

/**
 * Validates whether a visual connection between source and target nodes is permitted.
 */
export function isValidStudioConnection(params: {
  sourceNode: StudioCanvasNode | undefined;
  targetNode: StudioCanvasNode | undefined;
  sourceHandle?: StudioBranchHandle | string | null;
  existingEdges: StudioCanvasEdge[];
}): { valid: boolean; reason?: string; edgeType: StudioEdgeType; normalizedHandle: StudioBranchHandle } {
  const { sourceNode, targetNode, existingEdges } = params;
  if (!sourceNode || !targetNode) {
    return {
      valid: false,
      reason: 'Connection references a missing source or target node.',
      edgeType: 'dependency',
      normalizedHandle: 'default',
    };
  }
  if (sourceNode.id === targetNode.id) {
    return {
      valid: false,
      reason: 'A node cannot connect to itself.',
      edgeType: 'dependency',
      normalizedHandle: 'default',
    };
  }

  const targetMeta = getStudioNodeCatalogItem(targetNode.subtype);
  const sourceMeta = getStudioNodeCatalogItem(sourceNode.subtype);
  if (!sourceMeta || !targetMeta) {
    return {
      valid: false,
      reason: 'Unknown node type in connection.',
      edgeType: 'dependency',
      normalizedHandle: 'default',
    };
  }

  if (!targetMeta.acceptsIncomingConnections || targetNode.category === 'trigger') {
    return {
      valid: false,
      reason: `Trigger node "${targetNode.label}" cannot accept incoming connections.`,
      edgeType: 'dependency',
      normalizedHandle: 'default',
    };
  }

  const requestedHandle = (params.sourceHandle ?? sourceMeta.sourceHandles[0]?.id ?? 'default') as StudioBranchHandle;
  const matchedHandle =
    sourceMeta.sourceHandles.find((h) => h.id === requestedHandle) ??
    sourceMeta.sourceHandles[0];

  if (!matchedHandle) {
    return {
      valid: false,
      reason: `Node "${sourceNode.label}" does not expose an output connection handle.`,
      edgeType: 'dependency',
      normalizedHandle: 'default',
    };
  }

  const duplicate = existingEdges.some(
    (e) =>
      e.source === sourceNode.id &&
      e.target === targetNode.id &&
      e.sourceHandle === matchedHandle.id,
  );
  if (duplicate) {
    return {
      valid: false,
      reason: 'Duplicate connection between these nodes.',
      edgeType: matchedHandle.edgeType,
      normalizedHandle: matchedHandle.id,
    };
  }

  // Prevent immediate cycle on connection attempt
  const testEdges: StudioCanvasEdge[] = [
    ...existingEdges,
    {
      id: '__probe__',
      source: sourceNode.id,
      target: targetNode.id,
      edgeType: matchedHandle.edgeType,
      sourceHandle: matchedHandle.id,
    },
  ];
  const nodeIds = new Set<string>([sourceNode.id, targetNode.id]);
  for (const e of testEdges) {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  }
  const graphCheck = validateWorkflowGraphDetailed(
    Array.from(nodeIds).map((id) => ({
      id,
      prerequisites: testEdges.filter((e) => e.target === id).map((e) => e.source),
    })),
  );
  if (graphCheck.cyclePath.length > 0) {
    return {
      valid: false,
      reason: `Connection would create a circular dependency (${graphCheck.cyclePath.join(' -> ')}).`,
      edgeType: matchedHandle.edgeType,
      normalizedHandle: matchedHandle.id,
    };
  }

  return {
    valid: true,
    edgeType: matchedHandle.edgeType,
    normalizedHandle: matchedHandle.id,
  };
}

/**
 * Pure, safe evaluator for Stage 4 restricted condition rules.
 * Strictly prohibits arbitrary JS expressions / eval / Function constructors.
 */
export function evaluateRestrictedCondition(
  rule: RestrictedConditionRule | undefined | null,
  metricsContext: Partial<Record<RestrictedConditionField, unknown>>,
): {
  matched: boolean;
  selectedBranch: 'true' | 'false';
  field: RestrictedConditionField;
  operator: RestrictedConditionOperator;
  observedValue: unknown;
  expectedValue: unknown;
  explanation: string;
} {
  if (!rule || !ALLOWED_FIELD_SET.has(rule.field) || !ALLOWED_OP_SET.has(rule.operator)) {
    return {
      matched: false,
      selectedBranch: 'false',
      field: (rule?.field as RestrictedConditionField) ?? 'evidenceCount',
      operator: (rule?.operator as RestrictedConditionOperator) ?? 'exists',
      observedValue: null,
      expectedValue: rule?.value ?? null,
      explanation: 'Condition rule is missing or uses a disallowed field/operator; defaulted to false.',
    };
  }

  const observed = metricsContext[rule.field];
  const expected = rule.value;
  let matched = false;

  switch (rule.operator) {
    case 'exists':
      matched = observed !== null && observed !== undefined && observed !== '';
      break;
    case 'is_true':
      matched = observed === true || observed === 'true' || observed === 1;
      break;
    case 'is_false':
      matched = observed === false || observed === 'false' || observed === 0 || observed == null;
      break;
    case 'eq':
      matched =
        typeof observed === 'number' && typeof expected === 'number'
          ? observed === expected
          : String(observed ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
      break;
    case 'neq':
      matched =
        typeof observed === 'number' && typeof expected === 'number'
          ? observed !== expected
          : String(observed ?? '').toLowerCase() !== String(expected ?? '').toLowerCase();
      break;
    case 'gt':
      matched =
        typeof observed === 'number' &&
        Number.isFinite(observed) &&
        Number.isFinite(Number(expected)) &&
        observed > Number(expected);
      break;
    case 'gte':
      matched =
        typeof observed === 'number' &&
        Number.isFinite(observed) &&
        Number.isFinite(Number(expected)) &&
        observed >= Number(expected);
      break;
    case 'lt':
      matched =
        typeof observed === 'number' &&
        Number.isFinite(observed) &&
        Number.isFinite(Number(expected)) &&
        observed < Number(expected);
      break;
    case 'lte':
      matched =
        typeof observed === 'number' &&
        Number.isFinite(observed) &&
        Number.isFinite(Number(expected)) &&
        observed <= Number(expected);
      break;
    case 'contains':
      matched =
        typeof observed === 'string' &&
        typeof expected === 'string' &&
        observed.toLowerCase().includes(expected.toLowerCase());
      break;
  }

  return {
    matched,
    selectedBranch: matched ? 'true' : 'false',
    field: rule.field,
    operator: rule.operator,
    observedValue: observed ?? null,
    expectedValue: expected ?? null,
    explanation: `${rule.field} (${String(observed ?? 'unavailable')}) ${rule.operator} ${String(expected ?? '')} => ${matched ? 'TRUE' : 'FALSE'}`,
  };
}

export interface StudioValidationOptions {
  projectId?: string;
  providerAvailability?: StudioProviderAvailabilityMap;
  enforceProviderAvailabilityAsError?: boolean;
}

/**
 * Comprehensive frontend + server-side validation for Visual Workflow Studio graphs.
 * Extends Stage 2/3 DAG validation (`validateWorkflowDag` & `validateWorkflowGraphDetailed`).
 */
export function validateStudioWorkflowGraph(
  graph: StudioWorkflowGraph,
  options: StudioValidationOptions = {},
): StudioValidationReport {
  const issues: StudioValidationIssue[] = [];
  const validatedAt = new Date().toISOString();

  const pushIssue = (issue: Omit<StudioValidationIssue, 'id'>) => {
    issues.push({
      ...issue,
      id: `val-${issues.length + 1}-${issue.code.toLowerCase()}`,
    });
  };

  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  // 1. Resource / input size bounds
  const serializedSize = JSON.stringify(graph ?? {}).length;
  if (serializedSize > MAX_STUDIO_GRAPH_BYTES) {
    pushIssue({
      code: 'INPUT_SIZE_EXCEEDED',
      severity: 'error',
      message: `Workflow payload exceeds maximum allowed size (${serializedSize} > ${MAX_STUDIO_GRAPH_BYTES} bytes).`,
      remediation: 'Trim large instruction blocks or split into smaller modular workflows.',
    });
  }

  if (nodes.length === 0) {
    pushIssue({
      code: 'EMPTY_GRAPH',
      severity: 'error',
      message: 'Workflow canvas has no nodes. Add a trigger or specialist agent node to begin.',
      remediation: 'Drag a node from the left library or load a built-in template.',
    });
    return {
      valid: false,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      issues,
      topologicalOrder: [],
      layers: [],
      cyclePath: [],
      validatedAt,
    };
  }

  if (nodes.length > MAX_STUDIO_NODES) {
    pushIssue({
      code: 'NODE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Workflow contains ${nodes.length} nodes, exceeding the maximum limit of ${MAX_STUDIO_NODES}.`,
      remediation: `Reduce workflow size to ${MAX_STUDIO_NODES} nodes or fewer.`,
    });
  }

  if (edges.length > MAX_STUDIO_EDGES) {
    pushIssue({
      code: 'EDGE_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Workflow contains ${edges.length} connections, exceeding the maximum limit of ${MAX_STUDIO_EDGES}.`,
      remediation: `Reduce connection count to ${MAX_STUDIO_EDGES} or fewer.`,
    });
  }

  const nodeById = new Map<string, StudioCanvasNode>();
  for (const node of nodes) {
    const id = String(node.id ?? '').trim();
    if (!id) {
      pushIssue({
        code: 'MISSING_NODE',
        severity: 'error',
        message: 'A node on the canvas is missing its identifier.',
      });
      continue;
    }
    if (nodeById.has(id)) {
      pushIssue({
        code: 'MISSING_NODE',
        severity: 'error',
        nodeId: id,
        message: `Duplicate node identifier "${id}" found in workflow.`,
      });
      continue;
    }
    nodeById.set(id, node);

    const catalogItem = getStudioNodeCatalogItem(node.subtype);
    if (!catalogItem) {
      pushIssue({
        code: 'INVALID_AGENT_ID',
        severity: 'error',
        nodeId: id,
        message: `Node "${node.label || id}" uses unknown type "${node.subtype}".`,
        remediation: 'Remove this node and replace it with a supported node from the library.',
      });
      continue;
    }

    if (catalogItem.category !== node.category) {
      pushIssue({
        code: 'UNSUPPORTED_CAPABILITY',
        severity: 'error',
        nodeId: id,
        message: `Node "${node.label}" category "${node.category}" does not match supported catalog category "${catalogItem.category}".`,
      });
    }

    if (!node.label || !node.label.trim()) {
      pushIssue({
        code: 'MISSING_REQUIRED_INPUT',
        severity: 'error',
        nodeId: id,
        message: `Node "${id}" requires a descriptive label.`,
      });
    }

    // Cross-project isolation check
    if (
      options.projectId &&
      node.config?.targetProjectRef &&
      node.config.targetProjectRef.trim() !== '' &&
      node.config.targetProjectRef.trim() !== options.projectId
    ) {
      pushIssue({
        code: 'CROSS_PROJECT_REFERENCE',
        severity: 'error',
        nodeId: id,
        message: `Node "${node.label}" references another project ("${node.config.targetProjectRef}"), violating tenant/project isolation.`,
        remediation: 'Clear cross-project reference so execution stays scoped to the active project.',
      });
    }

    // Condition node validation
    if (node.category === 'condition') {
      const rule = node.config?.conditionRule;
      if (!rule || !ALLOWED_FIELD_SET.has(rule.field) || !ALLOWED_OP_SET.has(rule.operator)) {
        pushIssue({
          code: 'MISSING_REQUIRED_INPUT',
          severity: 'error',
          nodeId: id,
          message: `Condition node "${node.label}" requires a valid restricted field and operator.`,
          remediation: 'Select a supported metric field and comparison operator in the inspector.',
        });
      }
      if (rule?.sourceNodeId && !nodeById.has(rule.sourceNodeId) && !nodes.some((n) => n.id === rule.sourceNodeId)) {
        pushIssue({
          code: 'INVALID_OUTPUT_REFERENCE',
          severity: 'error',
          nodeId: id,
          message: `Condition node "${node.label}" references missing source node "${rule.sourceNodeId}".`,
          remediation: 'Pick an existing upstream node or choose "Any upstream output".',
        });
      }
    }

    // Data mapping validation
    if (node.subtype === 'structured_data_mapping') {
      const mappings = node.config?.fieldMappings ?? [];
      if (mappings.length === 0) {
        pushIssue({
          code: 'MISSING_REQUIRED_INPUT',
          severity: 'error',
          nodeId: id,
          message: `Data mapping node "${node.label}" must define at least one field mapping.`,
          remediation: 'Add a sourcePath -> targetField mapping in the node inspector.',
        });
      }
    }

    // Governance / approval config validation
    if (node.subtype === 'human_approval' || node.subtype === 'business_owner_review') {
      if (!node.config?.approvalGateType) {
        pushIssue({
          code: 'MISSING_APPROVAL_CONFIG',
          severity: 'error',
          nodeId: id,
          message: `Approval gate "${node.label}" must specify an approvalGateType.`,
          remediation: 'Select a gate type (Content Brief, Content Strategy, Generated Content, or Publishing Readiness).',
        });
      }
      if (node.config?.approvalRequired === false) {
        pushIssue({
          code: 'MANDATORY_APPROVAL_BYPASS',
          severity: 'error',
          nodeId: id,
          message: `Approval gate "${node.label}" cannot disable human approval enforcement.`,
          remediation: 'Keep approvalRequired enabled on governance approval gates.',
        });
      }
    }

    // Scheduled trigger honesty warning
    if (node.subtype === 'scheduled_trigger') {
      pushIssue({
        code: 'SCHEDULE_NOT_ARMED',
        severity: 'warning',
        nodeId: id,
        message: `Scheduled Trigger "${node.label}" records cadence metadata (${node.config?.scheduleCronHint || 'unspecified'}); automated background cron is not enabled in this runtime so execution runs on demand.`,
      });
    }

    // Provider availability check (real provider telemetry only)
    if (options.providerAvailability && node.category === 'agent') {
      const prov = options.providerAvailability[node.subtype];
      if (prov && prov.status === 'unavailable') {
        const isBlocking =
          Boolean(options.enforceProviderAvailabilityAsError) &&
          !node.config?.skipIfUnavailable;
        pushIssue({
          code: 'PROVIDER_UNAVAILABLE',
          severity: isBlocking ? 'error' : 'warning',
          nodeId: id,
          message: `${node.label}: ${prov.summary}`,
          remediation:
            'Configure the required provider credentials or enable "Skip if unavailable" on optional nodes.',
        });
      }
    }
  }

  // 2. Validate edges and handles
  const incomingByNode = new Map<string, StudioCanvasEdge[]>();
  const outgoingByNode = new Map<string, StudioCanvasEdge[]>();
  for (const id of nodeById.keys()) {
    incomingByNode.set(id, []);
    outgoingByNode.set(id, []);
  }

  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) {
      pushIssue({
        code: 'MISSING_NODE',
        severity: 'error',
        edgeId: edge.id,
        message: `Connection "${edge.id}" references a missing node (${edge.source} -> ${edge.target}).`,
      });
      continue;
    }
    if (edge.source === edge.target) {
      pushIssue({
        code: 'CIRCULAR_DEPENDENCY',
        severity: 'error',
        nodeId: src.id,
        edgeId: edge.id,
        message: `Node "${src.label}" cannot connect to itself.`,
      });
      continue;
    }
    if (tgt.category === 'trigger') {
      pushIssue({
        code: 'INVALID_CONNECTION',
        severity: 'error',
        nodeId: tgt.id,
        edgeId: edge.id,
        message: `Trigger node "${tgt.label}" cannot have incoming dependencies.`,
      });
    }

    const srcMeta = getStudioNodeCatalogItem(src.subtype);
    if (
      srcMeta &&
      !srcMeta.sourceHandles.some((h) => h.id === edge.sourceHandle)
    ) {
      pushIssue({
        code: 'INVALID_CONNECTION',
        severity: 'error',
        nodeId: src.id,
        edgeId: edge.id,
        message: `Connection from "${src.label}" uses unsupported handle "${edge.sourceHandle}".`,
      });
    }

    incomingByNode.get(tgt.id)!.push(edge);
    outgoingByNode.get(src.id)!.push(edge);
  }

  // 3. Check condition branch completeness & non-trigger inputs
  for (const node of nodes) {
    if (!nodeById.has(node.id)) continue;
    const outgoing = outgoingByNode.get(node.id) ?? [];
    const incoming = incomingByNode.get(node.id) ?? [];

    if (node.category === 'condition') {
      const hasTrue = outgoing.some((e) => e.sourceHandle === 'true');
      const hasFalse = outgoing.some((e) => e.sourceHandle === 'false');
      if (!hasTrue && !hasFalse) {
        pushIssue({
          code: 'MISSING_CONDITION_BRANCH',
          severity: 'error',
          nodeId: node.id,
          message: `Condition node "${node.label}" has no True or False outgoing branches.`,
          remediation: 'Connect at least one True or False branch from this condition node.',
        });
      } else if (!hasTrue || !hasFalse) {
        pushIssue({
          code: 'MISSING_CONDITION_BRANCH',
          severity: 'warning',
          nodeId: node.id,
          message: `Condition node "${node.label}" only defines the "${hasTrue ? 'True' : 'False'}" branch; unmatched runs will end cleanly on the unconnected path.`,
        });
      }

      if (incoming.length === 0) {
        pushIssue({
          code: 'MISSING_REQUIRED_INPUT',
          severity: 'error',
          nodeId: node.id,
          message: `Condition node "${node.label}" requires an upstream node to evaluate.`,
        });
      }
    }

    if (node.subtype === 'merge_results' && incoming.length < 2) {
      pushIssue({
        code: 'MISSING_REQUIRED_INPUT',
        severity: 'warning',
        nodeId: node.id,
        message: `Merge Results node "${node.label}" currently has ${incoming.length} upstream connection (recommended 2+).`,
      });
    }

    // Mandatory approval gate preservation:
    // Content Generation MUST either have approvalRequired=true on itself OR be preceded/followed by an approval gate.
    if (node.subtype === 'content_generation_agent') {
      const ancestorIds = collectAncestors(node.id, incomingByNode);
      const descendantIds = collectDescendants(node.id, outgoingByNode);
      const hasGovernanceGate =
        Boolean(node.config?.approvalRequired) ||
        Array.from(ancestorIds).some((aid) => {
          const an = nodeById.get(aid);
          return (
            an &&
            (an.subtype === 'human_approval' ||
              an.subtype === 'business_owner_review' ||
              Boolean(an.config?.approvalRequired))
          );
        }) ||
        Array.from(descendantIds).some((did) => {
          const dn = nodeById.get(did);
          return (
            dn &&
            (dn.subtype === 'human_approval' ||
              dn.subtype === 'business_owner_review' ||
              Boolean(dn.config?.approvalRequired))
          );
        });

      if (!hasGovernanceGate) {
        pushIssue({
          code: 'MANDATORY_APPROVAL_BYPASS',
          severity: 'error',
          nodeId: node.id,
          message: `Content Generation node "${node.label}" cannot bypass mandatory human approval governance.`,
          remediation:
            'Add a Human Approval / Business Owner Review gate in the pipeline or enable Approval Required on this node.',
        });
      }
    }
  }

  // 4. Reuse Stage 2/3 DAG & Graph Reachability / Cycle validators
  const compiled = compileStudioGraphToDag(graph);
  const dagRes = validateWorkflowDag(compiled.nodes, compiled.edges);
  const graphRes = validateWorkflowGraphDetailed(
    nodes.map((n) => ({
      id: n.id,
      prerequisites: edges.filter((e) => e.target === n.id).map((e) => e.source),
    })),
  );

  if (dagRes.cyclePath.length > 0 || graphRes.cyclePath.length > 0) {
    const cycle = dagRes.cyclePath.length > 0 ? dagRes.cyclePath : graphRes.cyclePath;
    pushIssue({
      code: 'CIRCULAR_DEPENDENCY',
      severity: 'error',
      nodeId: cycle[0] ?? null,
      message: `Circular dependency detected: ${cycle.join(' -> ')}.`,
      remediation: 'Remove the backward edge creating the loop.',
    });
  }

  // Check disconnected islands when triggers exist
  const triggerIds = nodes.filter((n) => n.category === 'trigger').map((n) => n.id);
  if (triggerIds.length > 0) {
    const reachableFromTriggers = new Set<string>(triggerIds);
    const q = [...triggerIds];
    while (q.length > 0) {
      const cur = q.shift()!;
      for (const e of outgoingByNode.get(cur) ?? []) {
        if (!reachableFromTriggers.has(e.target)) {
          reachableFromTriggers.add(e.target);
          q.push(e.target);
        }
      }
    }
    for (const node of nodes) {
      if (!reachableFromTriggers.has(node.id)) {
        pushIssue({
          code: 'UNREACHABLE_NODE',
          severity: 'error',
          nodeId: node.id,
          message: `Node "${node.label}" is not reachable from any Trigger node.`,
          remediation: 'Connect this node downstream of a trigger or remove it from the canvas.',
        });
      }
    }
  } else if (nodes.length > 1) {
    // Warn if disconnected components exist without a trigger
    for (const node of nodes) {
      const deg =
        (incomingByNode.get(node.id)?.length ?? 0) +
        (outgoingByNode.get(node.id)?.length ?? 0);
      if (deg === 0) {
        pushIssue({
          code: 'UNREACHABLE_NODE',
          severity: 'warning',
          nodeId: node.id,
          message: `Node "${node.label}" has no incoming or outgoing connections and will run independently.`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    topologicalOrder: dagRes.topologicalOrder,
    layers: dagRes.layers,
    cyclePath: dagRes.cyclePath.length > 0 ? dagRes.cyclePath : graphRes.cyclePath,
    validatedAt,
  };
}

function collectAncestors(
  startId: string,
  incomingByNode: Map<string, StudioCanvasEdge[]>,
): Set<string> {
  const visited = new Set<string>();
  const q = [...(incomingByNode.get(startId) ?? []).map((e) => e.source)];
  while (q.length > 0) {
    const cur = q.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of incomingByNode.get(cur) ?? []) {
      if (!visited.has(e.source)) q.push(e.source);
    }
  }
  return visited;
}

function collectDescendants(
  startId: string,
  outgoingByNode: Map<string, StudioCanvasEdge[]>,
): Set<string> {
  const visited = new Set<string>();
  const q = [...(outgoingByNode.get(startId) ?? []).map((e) => e.target)];
  while (q.length > 0) {
    const cur = q.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of outgoingByNode.get(cur) ?? []) {
      if (!visited.has(e.target)) q.push(e.target);
    }
  }
  return visited;
}

/**
 * Compiles a visual Stage 4 StudioWorkflowGraph into the Stage 2/3 persistent DAG
 * schema (`DagWorkflowNodeInput[]` & `DagWorkflowEdgeInput[]`) so it runs through
 * the single existing `orchestrationEngine.ts` task queue.
 */
export function compileStudioGraphToDag(graph: StudioWorkflowGraph): {
  nodes: DagWorkflowNodeInput[];
  edges: DagWorkflowEdgeInput[];
  edgeMeta: Record<
    string,
    {
      id: string;
      source: string;
      target: string;
      edgeType: StudioEdgeType;
      sourceHandle: StudioBranchHandle;
      label?: string;
    }
  >;
} {
  const edgeMeta: Record<
    string,
    {
      id: string;
      source: string;
      target: string;
      edgeType: StudioEdgeType;
      sourceHandle: StudioBranchHandle;
      label?: string;
    }
  > = {};

  const edges: DagWorkflowEdgeInput[] = [];
  const seenPairs = new Set<string>();
  for (const e of graph.edges ?? []) {
    const pairKey = `${e.source}=>${e.target}`;
    edgeMeta[pairKey] = {
      id: e.id,
      source: e.source,
      target: e.target,
      edgeType: e.edgeType,
      sourceHandle: e.sourceHandle,
      label: e.label,
    };
    if (!seenPairs.has(pairKey)) {
      seenPairs.add(pairKey);
      edges.push({ fromNodeKey: e.source, toNodeKey: e.target });
    }
  }

  const nodes: DagWorkflowNodeInput[] = (graph.nodes ?? []).map((n) => {
    const catalog = getStudioNodeCatalogItem(n.subtype);
    const backingAgentId = catalog?.backingAgentId ?? 'research_agent';
    const isApprovalGateNode =
      n.subtype === 'human_approval' || n.subtype === 'business_owner_review';

    const approvalRequired = isApprovalGateNode
      ? true
      : Boolean(n.config?.approvalRequired);
    const approvalGateType = approvalRequired
      ? n.config?.approvalGateType ??
        (n.subtype === 'business_owner_review'
          ? 'publishing_readiness'
          : n.subtype === 'content_generation_agent'
            ? 'generated_content'
            : 'content_brief')
      : null;

    return {
      nodeKey: n.id,
      agentId: backingAgentId,
      title: n.label || catalog?.label || n.id,
      approvalRequired,
      approvalGateType,
      maxRetries: n.config?.maxRetries ?? (n.category === 'agent' ? 2 : 0),
      timeoutMs: n.config?.timeoutMs ?? 60_000,
      condition: {
        skipIfUnavailable: Boolean(n.config?.skipIfUnavailable),
      },
      config: {
        ...(n.config ?? {}),
        studioNode: {
          category: n.category,
          subtype: n.subtype,
          label: n.label,
        },
        enableIntelligentDelegation: Boolean(n.config?.enableIntelligentDelegation),
      },
    };
  });

  return { nodes, edges, edgeMeta };
}

/**
 * Deterministic layered left-to-right auto-layout with generous non-overlapping spacing.
 */
export function autoLayoutStudioGraph(
  graph: StudioWorkflowGraph,
): StudioWorkflowGraph {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  if (nodes.length === 0) return graph;

  const compiled = compileStudioGraphToDag(graph);
  const dag = validateWorkflowDag(compiled.nodes, compiled.edges);
  const layers =
    dag.layers.length > 0
      ? dag.layers
      : [nodes.map((n) => n.id)];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const positioned = new Map<string, { x: number; y: number }>();

  const colSpacing = 285;
  const rowSpacing = 155;
  const maxLayerSize = Math.max(...layers.map((l) => l.length), 1);
  const totalHeight = (maxLayerSize - 1) * rowSpacing;

  layers.forEach((layer, colIdx) => {
    const layerHeight = (layer.length - 1) * rowSpacing;
    const startY = 48 + Math.max(0, Math.round((totalHeight - layerHeight) / 2));
    layer.forEach((nodeId, rowIdx) => {
      positioned.set(nodeId, {
        x: 40 + colIdx * colSpacing,
        y: startY + rowIdx * rowSpacing,
      });
    });
  });

  let fallbackIdx = 0;
  const nextNodes = nodes.map((n) => {
    const pos = positioned.get(n.id);
    if (pos) return { ...n, position: pos };
    const fp = { x: 40 + (layers.length + fallbackIdx) * colSpacing, y: 48 };
    fallbackIdx += 1;
    return { ...n, position: fp };
  });

  // Preserve original node ordering
  const ordered = nextNodes.filter((n) => nodeMap.has(n.id));
  return { nodes: ordered, edges: [...edges] };
}

export interface StudioHistoryStack {
  past: StudioWorkflowGraph[];
  present: StudioWorkflowGraph;
  future: StudioWorkflowGraph[];
}

const MAX_HISTORY_DEPTH = 40;

export function createStudioHistory(initial: StudioWorkflowGraph): StudioHistoryStack {
  return {
    past: [],
    present: structuredClone(initial),
    future: [],
  };
}

export function pushStudioHistory(
  stack: StudioHistoryStack,
  next: StudioWorkflowGraph,
): StudioHistoryStack {
  const past = [...stack.past, structuredClone(stack.present)].slice(-MAX_HISTORY_DEPTH);
  return {
    past,
    present: structuredClone(next),
    future: [],
  };
}

export function undoStudioHistory(stack: StudioHistoryStack): StudioHistoryStack {
  if (stack.past.length === 0) return stack;
  const previous = stack.past[stack.past.length - 1];
  return {
    past: stack.past.slice(0, -1),
    present: structuredClone(previous),
    future: [structuredClone(stack.present), ...stack.future].slice(0, MAX_HISTORY_DEPTH),
  };
}

export function redoStudioHistory(stack: StudioHistoryStack): StudioHistoryStack {
  if (stack.future.length === 0) return stack;
  const next = stack.future[0];
  return {
    past: [...stack.past, structuredClone(stack.present)].slice(-MAX_HISTORY_DEPTH),
    present: structuredClone(next),
    future: stack.future.slice(1),
  };
}
