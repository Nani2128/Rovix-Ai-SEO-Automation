import type { AgentWorkflowDetail } from '../../types/agentFactory';
import type { User, UserRole } from '../../types/auth';
import type {
  StudioNodeExecutionDetail,
  StudioProviderAvailabilityMap,
  StudioValidationReport,
  StudioWorkflowDetailResponse,
  StudioWorkflowGraph,
  StudioWorkflowListResponse,
  StudioWorkflowRecord,
  StudioWorkflowTemplateRecord,
  StudioWorkflowVersionRecord,
} from '../../types/workflowStudio';
import {
  BUILTIN_STUDIO_TEMPLATES,
  getStudioNodeCatalogItem,
} from '../../lib/workflowStudioCatalog';
import {
  compileStudioGraphToDag,
  validateStudioWorkflowGraph,
} from '../../lib/workflowStudioEngine';
import { getProjectById, recordActivityEvent } from '../audit/db';
import { buildAgentFactorySnapshot } from './agentFactoryService';
import { getWorkflowDetailById } from './orchestrationDb';
import {
  cancelAgentWorkflow,
  createAgentWorkflow,
} from './orchestrationEngine';
import {
  createImmutableExecutionSnapshotInDb,
  createStudioWorkflowInDb,
  getStudioVersionByIdInDb,
  getStudioWorkflowByIdInDb,
  insertStudioTemplateInDb,
  linkStudioWorkflowExecutionInDb,
  listCustomStudioTemplatesInDb,
  listStudioWorkflowExecutionsInDb,
  listStudioWorkflowVersionsInDb,
  listStudioWorkflowsInDb,
  persistStudioValidationReportInDb,
  publishStudioWorkflowVersionInDb,
  updateStudioWorkflowDraftInDb,
} from './workflowStudioDb';

const STUDIO_EDITOR_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Business Owner',
  'Editor',
  'Developer',
]);

const STUDIO_PUBLISHER_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
]);

const STUDIO_ARCHIVE_ROLES = new Set<UserRole>([
  'Platform Admin',
  'Agency Owner',
]);

function assertEditorRole(role: UserRole): void {
  if (!STUDIO_EDITOR_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" has read-only access in Workflow Studio and cannot edit or execute workflows.`,
    );
  }
}

function assertPublisherRole(role: UserRole): void {
  if (!STUDIO_PUBLISHER_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" cannot publish Workflow Studio definitions. Only Platform Admin, Agency Owner, SEO Strategist, or Project Manager may publish.`,
    );
  }
}

function assertArchiveRole(role: UserRole): void {
  if (!STUDIO_ARCHIVE_ROLES.has(role)) {
    throw new Error(
      `FORBIDDEN: Role "${role}" cannot archive Workflow Studio definitions. Only Platform Admin or Agency Owner may archive.`,
    );
  }
}

function getProviderAvailabilityMap(
  tenantId: string,
  projectId: string,
): StudioProviderAvailabilityMap {
  try {
    const snap = buildAgentFactorySnapshot({ tenantId, projectId });
    const map: StudioProviderAvailabilityMap = {};
    for (const node of snap.nodes) {
      map[node.agentId] = {
        status: node.availabilityStatus,
        summary: node.providerSummary,
      };
    }
    return map;
  } catch {
    return {};
  }
}

function inferRequiredProvidersFromGraph(graph: StudioWorkflowGraph): string[] {
  const providers = new Set<string>();
  for (const n of graph.nodes ?? []) {
    const meta = getStudioNodeCatalogItem(n.subtype);
    if (!meta) continue;
    if (meta.requiresProviderKey === 'gemini') providers.add('Gemini Content Provider');
    if (meta.requiresProviderKey === 'pagespeed') providers.add('PageSpeed Insights');
    if (n.subtype === 'technical_seo_agent') providers.add('Technical SEO Crawler');
    if (n.subtype === 'competitor_intelligence_agent') providers.add('Competitor Analyzer');
    if (n.subtype === 'keyword_intelligence_agent') providers.add('Keyword Lab');
    if (n.subtype === 'geographic_intelligence_agent') providers.add('Geo Intelligence');
  }
  return Array.from(providers);
}

export function listStudioWorkflowsAndTemplates(params: {
  tenantId: string;
  projectId: string;
  includeArchived?: boolean;
}): StudioWorkflowListResponse {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project workspace not found.');
  }
  const workflows = listStudioWorkflowsInDb(
    params.tenantId,
    params.projectId,
    Boolean(params.includeArchived),
  );
  const customTemplates = listCustomStudioTemplatesInDb(
    params.tenantId,
    params.projectId,
  );
  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );

  return {
    workflows,
    templates: [...BUILTIN_STUDIO_TEMPLATES, ...customTemplates],
    providerAvailability,
  };
}

export function createStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  user: User;
  name: string;
  description?: string;
  graph?: StudioWorkflowGraph;
  templateId?: string | null;
}): {
  workflow: StudioWorkflowRecord;
  version: StudioWorkflowVersionRecord;
  validation: StudioValidationReport;
} {
  assertEditorRole(params.user.role);
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project workspace not found.');

  let graph: StudioWorkflowGraph = params.graph ?? { nodes: [], edges: [] };
  let resolvedName = params.name.trim();
  let resolvedDesc = (params.description ?? '').trim();

  if (params.templateId) {
    const customTemplates = listCustomStudioTemplatesInDb(
      params.tenantId,
      params.projectId,
    );
    const tpl = [...BUILTIN_STUDIO_TEMPLATES, ...customTemplates].find(
      (t) => t.id === params.templateId,
    );
    if (!tpl) {
      throw new Error(`NOT_FOUND: Template "${params.templateId}" not found.`);
    }
    graph = structuredClone(tpl.graph);
    if (!resolvedName) resolvedName = tpl.name;
    if (!resolvedDesc) resolvedDesc = tpl.description;
  }

  if (!resolvedName) {
    resolvedName = 'Untitled SEO Workflow';
  }
  if (resolvedName.length > 120) {
    throw new Error('BAD_REQUEST: Workflow name must be 120 characters or fewer.');
  }

  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );
  const validation = validateStudioWorkflowGraph(graph, {
    projectId: params.projectId,
    providerAvailability,
  });

  const { workflow, initialVersion } = createStudioWorkflowInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: resolvedName,
    description: resolvedDesc,
    graph,
    validation,
    createdBy: params.user.name,
  });

  persistStudioValidationReportInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: workflow.id,
    report: validation,
    validatedBy: params.user.name,
  });

  return { workflow, version: initialVersion, validation };
}

export function getStudioWorkflowDetail(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
}): StudioWorkflowDetailResponse {
  const workflow = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!workflow) {
    throw new Error('NOT_FOUND: Studio workflow not found in this project.');
  }
  const versions = listStudioWorkflowVersionsInDb(
    params.tenantId,
    params.projectId,
    workflow.id,
  );
  const recentExecutions = listStudioWorkflowExecutionsInDb(
    params.tenantId,
    params.projectId,
    workflow.id,
  );
  const latestExecId =
    workflow.lastExecutionWorkflowId ?? recentExecutions[0]?.workflowId ?? null;
  const activeExecution = latestExecId
    ? getWorkflowDetailById(params.tenantId, latestExecId)
    : null;
  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );

  return {
    workflow,
    versions,
    recentExecutions,
    activeExecution,
    providerAvailability,
  };
}

export function updateStudioWorkflowDraft(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  user: User;
  name?: string;
  description?: string;
  graph?: StudioWorkflowGraph;
  createSnapshot?: boolean;
  changeSummary?: string;
}): {
  workflow: StudioWorkflowRecord;
  createdVersion: StudioWorkflowVersionRecord | null;
  validation: StudioValidationReport;
} {
  assertEditorRole(params.user.role);
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) {
    throw new Error('NOT_FOUND: Studio workflow not found.');
  }
  if (existing.status === 'archived') {
    throw new Error(
      'BAD_REQUEST: Archived workflows cannot be edited. Duplicate it to create an active draft.',
    );
  }

  const nextGraph = params.graph ?? existing.draftGraph;
  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );
  const validation = validateStudioWorkflowGraph(nextGraph, {
    projectId: params.projectId,
    providerAvailability,
  });

  const { workflow, createdVersion } = updateStudioWorkflowDraftInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: existing.id,
    name: params.name !== undefined ? params.name.trim() || existing.name : undefined,
    description: params.description !== undefined ? params.description.trim() : undefined,
    graph: nextGraph,
    validation,
    status: existing.status === 'published' ? 'published' : 'saved',
    updatedBy: params.user.name,
    createSnapshot: Boolean(params.createSnapshot),
    changeSummary: params.changeSummary,
  });

  persistStudioValidationReportInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: existing.id,
    report: validation,
    validatedBy: params.user.name,
  });

  return { workflow, createdVersion, validation };
}

export function validateStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId?: string | null;
  graph: StudioWorkflowGraph;
  user: User;
}): StudioValidationReport {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project workspace not found.');

  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );
  const report = validateStudioWorkflowGraph(params.graph, {
    projectId: params.projectId,
    providerAvailability,
  });

  if (params.studioWorkflowId) {
    const existing = getStudioWorkflowByIdInDb(
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    );
    if (existing) {
      persistStudioValidationReportInDb({
        tenantId: params.tenantId,
        projectId: params.projectId,
        studioWorkflowId: existing.id,
        report,
        validatedBy: params.user.name,
      });
    }
  }

  return report;
}

export function publishStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  user: User;
  graph?: StudioWorkflowGraph;
  changeSummary?: string;
}): {
  workflow: StudioWorkflowRecord;
  version: StudioWorkflowVersionRecord;
  validation: StudioValidationReport;
} {
  assertPublisherRole(params.user.role);
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) throw new Error('NOT_FOUND: Studio workflow not found.');
  if (existing.status === 'archived') {
    throw new Error('BAD_REQUEST: Archived workflow cannot be published.');
  }

  const graphToPublish = params.graph ?? existing.draftGraph;
  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );
  const validation = validateStudioWorkflowGraph(graphToPublish, {
    projectId: params.projectId,
    providerAvailability,
  });

  if (!validation.valid) {
    throw new Error(
      `BAD_REQUEST: Cannot publish workflow with ${validation.errorCount} blocking validation error(s): ${validation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .slice(0, 3)
        .join(' | ')}`,
    );
  }

  const res = publishStudioWorkflowVersionInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: existing.id,
    graph: graphToPublish,
    validation,
    changeSummary: params.changeSummary ?? `Published by ${params.user.name}`,
    publishedBy: params.user.name,
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Published Workflow Studio "${res.workflow.name}" v${res.version.versionNumber}`,
    status: 'Succeeded',
    evidenceUrl: '/agent-factory/workflows',
  });

  return { ...res, validation };
}

export function archiveStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  user: User;
}): StudioWorkflowRecord {
  assertArchiveRole(params.user.role);
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) throw new Error('NOT_FOUND: Studio workflow not found.');

  const { workflow } = updateStudioWorkflowDraftInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: existing.id,
    status: 'archived',
    updatedBy: params.user.name,
  });
  return workflow;
}

export function duplicateStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  user: User;
  newName?: string;
}): {
  workflow: StudioWorkflowRecord;
  version: StudioWorkflowVersionRecord;
  validation: StudioValidationReport;
} {
  assertEditorRole(params.user.role);
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) throw new Error('NOT_FOUND: Studio workflow not found.');

  return createStudioWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    user: params.user,
    name: params.newName?.trim() || `${existing.name} (Copy)`,
    description: existing.description,
    graph: structuredClone(existing.draftGraph),
  });
}

export function restoreStudioWorkflowVersion(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  versionId: string;
  user: User;
}): {
  workflow: StudioWorkflowRecord;
  createdVersion: StudioWorkflowVersionRecord | null;
  validation: StudioValidationReport;
} {
  assertEditorRole(params.user.role);
  const version = getStudioVersionByIdInDb(
    params.tenantId,
    params.projectId,
    params.versionId,
  );
  if (!version || version.studioWorkflowId !== params.studioWorkflowId) {
    throw new Error('NOT_FOUND: Studio workflow version not found.');
  }

  return updateStudioWorkflowDraft({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: params.studioWorkflowId,
    user: params.user,
    graph: structuredClone(version.graph),
    createSnapshot: true,
    changeSummary: `Restored from version v${version.versionNumber}`,
  });
}

export function saveStudioTemplate(params: {
  tenantId: string;
  projectId: string;
  user: User;
  name: string;
  category?: string;
  description?: string;
  graph: StudioWorkflowGraph;
}): StudioWorkflowTemplateRecord {
  assertEditorRole(params.user.role);
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) throw new Error('NOT_FOUND: Project workspace not found.');

  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('BAD_REQUEST: Template name is required.');
  }

  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );
  const validation = validateStudioWorkflowGraph(params.graph, {
    projectId: params.projectId,
    providerAvailability,
  });
  if (!validation.valid) {
    throw new Error(
      `BAD_REQUEST: Cannot save invalid workflow as template (${validation.errorCount} blocking error(s)).`,
    );
  }

  return insertStudioTemplateInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    name: trimmedName.slice(0, 120),
    category: params.category?.trim().slice(0, 48) || 'Custom',
    description: params.description?.trim().slice(0, 320) || '',
    graph: params.graph,
    requiredProviders: inferRequiredProvidersFromGraph(params.graph),
    createdBy: params.user.name,
  });
}

/**
 * Executes a visual workflow through the EXISTING Stage 2/3 orchestration engine.
 * Always creates an immutable StudioWorkflowVersion snapshot first and links the
 * persistent `agent_workflows` execution to that snapshot so future draft edits
 * NEVER mutate running executions.
 */
export function executeStudioWorkflow(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  user: User;
  graphOverride?: StudioWorkflowGraph;
  objective?: string;
}): {
  version: StudioWorkflowVersionRecord;
  execution: AgentWorkflowDetail;
  validation: StudioValidationReport;
} {
  assertEditorRole(params.user.role);
  const studioWf = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!studioWf) {
    throw new Error('NOT_FOUND: Studio workflow not found in this project.');
  }
  if (studioWf.status === 'archived') {
    throw new Error('BAD_REQUEST: Archived workflows cannot be executed.');
  }

  const graphToRun = params.graphOverride ?? studioWf.draftGraph;
  const providerAvailability = getProviderAvailabilityMap(
    params.tenantId,
    params.projectId,
  );

  // Server-side validation (never trust client validation alone)
  const validation = validateStudioWorkflowGraph(graphToRun, {
    projectId: params.projectId,
    providerAvailability,
    enforceProviderAvailabilityAsError: true,
  });

  persistStudioValidationReportInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: studioWf.id,
    report: validation,
    validatedBy: params.user.name,
  });

  if (!validation.valid) {
    throw new Error(
      `BAD_REQUEST: Execution blocked by ${validation.errorCount} validation error(s): ${validation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .slice(0, 3)
        .join(' | ')}`,
    );
  }

  // Create immutable snapshot version for this execution
  const immutableVersion = createImmutableExecutionSnapshotInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: studioWf.id,
    graph: graphToRun,
    validation,
    createdBy: params.user.name,
  });

  // Compile immutable version graph into existing Stage 2/3 DAG schema
  const compiled = compileStudioGraphToDag(immutableVersion.graph);

  const execution = createAgentWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    user: params.user,
    templateId: 'custom_dag',
    name: `${studioWf.name} (v${immutableVersion.versionNumber})`,
    objective:
      params.objective?.trim() ||
      studioWf.description ||
      `Visual Workflow Studio execution of "${studioWf.name}" snapshot v${immutableVersion.versionNumber}`,
    nodes: compiled.nodes,
    edges: compiled.edges,
    config: {
      studioWorkflowId: studioWf.id,
      studioVersionId: immutableVersion.id,
      studioVersionNumber: immutableVersion.versionNumber,
      studioEdgeMeta: compiled.edgeMeta,
    },
    autoStart: true,
  });

  linkStudioWorkflowExecutionInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    studioWorkflowId: studioWf.id,
    studioVersionId: immutableVersion.id,
    studioVersionNumber: immutableVersion.versionNumber,
    workflowId: execution.workflow.id,
  });

  return {
    version: immutableVersion,
    execution,
    validation,
  };
}

export function cancelStudioWorkflowExecution(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  user: User;
  reason?: string;
}): AgentWorkflowDetail {
  assertEditorRole(params.user.role);
  return cancelAgentWorkflow({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    user: params.user,
    reason: params.reason ?? `Cancelled from Workflow Studio by ${params.user.name}`,
  });
}

export function getStudioExecutionNodeDetail(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  nodeId: string;
}): StudioNodeExecutionDetail {
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Workflow execution not found in this project.');
  }

  const task = detail.tasks.find((t) => t.nodeKey === params.nodeId);
  const nodeDef = detail.nodes.find((n) => n.nodeKey === params.nodeId);
  if (!task || !nodeDef) {
    throw new Error(`NOT_FOUND: Node "${params.nodeId}" not found in execution "${params.workflowId}".`);
  }

  const studioMeta = (nodeDef.config?.studioNode ?? {}) as {
    category?: StudioNodeExecutionDetail['category'];
    subtype?: StudioNodeExecutionDetail['subtype'];
    label?: string;
  };

  const incomingEdges = detail.edges.filter((e) => e.toNodeKey === task.nodeKey);
  const inputs = incomingEdges
    .map((edge) => {
      const parentTask = detail.tasks.find((t) => t.nodeKey === edge.fromNodeKey);
      if (!parentTask?.outputId) return null;
      const out = detail.outputs.find((o) => o.id === parentTask.outputId);
      if (!out) return null;
      return {
        fromNodeId: parentTask.nodeKey,
        outputId: out.id,
        summary: out.summary,
        evidenceRefs: out.evidenceRefs,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const output = task.outputId
    ? detail.outputs.find((o) => o.id === task.outputId) ?? null
    : null;
  const executions = detail.executions.filter((e) => e.taskId === task.id);
  const handoffs = detail.handoffs.filter((h) => h.taskId === task.id);
  const events = detail.events.filter((ev) => ev.taskId === task.id);

  const isSkipped =
    task.status === 'cancelled' &&
    Boolean(task.blockingReason?.startsWith('Skipped:'));
  const selectedBranch =
    output?.payload.selectedBranch === 'true' || output?.payload.selectedBranch === 'false'
      ? (output.payload.selectedBranch as 'true' | 'false')
      : null;

  return {
    nodeId: task.nodeKey,
    label: studioMeta.label ?? task.title,
    category: studioMeta.category ?? 'agent',
    subtype: studioMeta.subtype ?? task.agentId,
    taskStatus: isSkipped ? 'skipped' : task.status,
    attemptCount: task.attemptCount,
    durationMs: task.durationMs,
    blockingReason: task.blockingReason,
    errorSummary: task.errorSummary,
    inputs,
    output,
    executions,
    handoffs,
    events,
    selectedBranch,
  };
}
