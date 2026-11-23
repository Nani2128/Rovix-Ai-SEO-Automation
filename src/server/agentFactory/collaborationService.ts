import crypto from 'node:crypto';
import type {
  AgentDelegationRecord,
  AgentId,
  AgentMessageRecord,
  AgentMessageType,
  AgentOutputRecord,
  AgentStationId,
  CollaborationMonitorPayload,
  ContextApprovalStatus,
  EvidenceTrustBreakdown,
  WorkflowConflictRecord,
  WorkflowContextItemRecord,
  WorkflowContextScope,
  WorkflowTaskRecord,
} from '../../types/agentFactory';
import type { User } from '../../types/auth';
import {
  canAgentWriteContextScope,
  detectWorkflowConflictsFromEvidence,
  isOfficialConflictResolverRole,
  summarizeCollaborationByAgent,
  validateAgentMessageInput,
  validateDelegationRequest,
  validateEvidenceTrustForOutput,
} from '../../lib/collaborationGovernance';
import {
  sanitizeUntrustedTextForPrompt,
  validateWorkflowGraph,
} from '../../lib/dagValidation';
import {
  getKeywordBusinessProfile,
  getProjectById,
  listCrawlRuns,
  listPerformanceAuditRuns,
  recordActivityEvent,
} from '../audit/db';
import { getCompetitorWorkspace } from '../competitors/competitorService';
import { getGeoWorkspace } from '../geo/geoService';
import { getKeywordWorkspace } from '../keywords/keywordService';
import { emitRealAgentEvent } from './agentFactoryService';
import {
  countActiveDelegationsForTenant,
  getDelegationByDelegatedTaskId,
  getLatestWorkflowContextItem,
  getWorkflowConflictById,
  insertAgentDelegation,
  insertAgentMessage,
  insertWorkflowConflict,
  insertWorkflowContextItem,
  listAgentDelegations,
  listAgentMessages,
  listWorkflowConflicts,
  listWorkflowContextItems,
  resolveWorkflowConflictRecord,
  updateAgentDelegation,
  updateAgentMessageStatus,
} from './collaborationDb';
import {
  getWorkflowDetailById,
  insertDynamicDelegatedNodeAndTaskInDb,
  listAgentConfigsInDb,
  listAgentOutputsForProjectInDb,
} from './orchestrationDb';

// ============================================================================
// 1. AGENT-TO-AGENT COMMUNICATION PROTOCOL
// ============================================================================

export function sendAgentMessage(params: {
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
  taskId?: string;
}): AgentMessageRecord {
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Workflow not found in this project workspace.');
  }

  const validation = validateAgentMessageInput({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    executionId: params.executionId,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.destinationAgentId,
    messageType: params.messageType,
    payload: params.payload,
    evidenceReferences: params.evidenceReferences,
    correlationId: params.correlationId,
  });

  if (!validation.valid) {
    const errText = validation.errors.join(' ');
    const rejected = insertAgentMessage({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      executionId: params.executionId,
      sourceAgentId: params.sourceAgentId,
      destinationAgentId: params.destinationAgentId,
      messageType: params.messageType,
      payload: validation.sanitizedPayload,
      evidenceReferences: validation.sanitizedEvidenceReferences,
      correlationId: params.correlationId,
      replyToMessageId: params.replyToMessageId ?? null,
      status: 'rejected',
      errorSummary: errText,
    });
    emitRealAgentEvent({
      eventType: 'agent.message.failed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      taskId: params.taskId ?? params.executionId,
      agentId: params.sourceAgentId,
      sourceAgentId: params.sourceAgentId,
      destinationAgentId: params.destinationAgentId,
      status: 'failed',
      taskTitle: `Message rejected (${params.messageType})`,
      summary: `${params.sourceAgentId} -> ${params.destinationAgentId}: ${errText}`,
      errorSummary: errText,
      correlationId: rejected.correlationId,
      evidenceUrl: '/agent-factory',
    });
    throw new Error(`BAD_REQUEST: ${errText}`);
  }

  // Check whether destination specialist station is disabled in project configuration
  const configs = listAgentConfigsInDb(params.tenantId, params.projectId);
  const dstConfig = configs.find((c) => c.agentId === params.destinationAgentId);
  if (dstConfig && !dstConfig.enabled) {
    const errText = `Destination agent "${params.destinationAgentId}" is disabled in project Agent Factory settings.`;
    const failedMsg = insertAgentMessage({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      executionId: params.executionId,
      sourceAgentId: params.sourceAgentId,
      destinationAgentId: params.destinationAgentId,
      messageType: params.messageType,
      payload: validation.sanitizedPayload,
      evidenceReferences: validation.sanitizedEvidenceReferences,
      correlationId: params.correlationId,
      replyToMessageId: params.replyToMessageId ?? null,
      status: 'failed',
      errorSummary: errText,
    });
    emitRealAgentEvent({
      eventType: 'agent.message.failed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      taskId: params.taskId ?? params.executionId,
      agentId: params.destinationAgentId,
      sourceAgentId: params.sourceAgentId,
      destinationAgentId: params.destinationAgentId,
      status: 'failed',
      taskTitle: `Delivery failed (${params.messageType})`,
      summary: errText,
      errorSummary: errText,
      correlationId: failedMsg.correlationId,
      evidenceUrl: '/agent-factory',
    });
    return failedMsg;
  }

  const record = insertAgentMessage({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    executionId: params.executionId,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.destinationAgentId,
    messageType: params.messageType,
    payload: validation.sanitizedPayload,
    evidenceReferences: validation.sanitizedEvidenceReferences,
    correlationId: params.correlationId,
    replyToMessageId: params.replyToMessageId ?? null,
    status: 'sent',
  });

  const shortNote =
    typeof validation.sanitizedPayload.summary === 'string' &&
    validation.sanitizedPayload.summary.trim()
      ? validation.sanitizedPayload.summary.trim()
      : `${params.messageType.replace(/_/g, ' ')} (${validation.sanitizedEvidenceReferences.length} evidence ref(s))`;

  emitRealAgentEvent({
    eventType: 'agent.message.sent',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: params.taskId ?? params.executionId,
    agentId: params.sourceAgentId,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.destinationAgentId,
    status: 'communicating',
    taskTitle: `${params.messageType.replace(/_/g, ' ')}`,
    summary: `${params.sourceAgentId} -> ${params.destinationAgentId}: ${shortNote}`,
    correlationId: record.correlationId,
    evidenceUrl: '/agent-factory',
  });

  updateAgentMessageStatus(params.tenantId, record.messageId, 'delivered');
  record.status = 'delivered';

  emitRealAgentEvent({
    eventType: 'agent.message.delivered',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: params.taskId ?? params.executionId,
    agentId: params.destinationAgentId,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.destinationAgentId,
    status: 'communicating',
    taskTitle: `Received ${params.messageType.replace(/_/g, ' ')}`,
    summary: `${params.destinationAgentId} received ${params.messageType.replace(/_/g, ' ')} from ${params.sourceAgentId}`,
    correlationId: record.correlationId,
    evidenceUrl: '/agent-factory',
  });

  return record;
}

// ============================================================================
// 2. SHARED WORKFLOW CONTEXT & PROVENANCE VERSIONING
// ============================================================================

export function seedSharedWorkflowContext(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
}): WorkflowContextItemRecord[] {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) return [];

  const created: WorkflowContextItemRecord[] = [];
  const profile = getKeywordBusinessProfile(params.tenantId, params.projectId);
  const geoWs = getGeoWorkspace(params.tenantId, params.projectId);
  const kwWs = getKeywordWorkspace(params.tenantId, params.projectId);
  const compWs = getCompetitorWorkspace(params.tenantId, params.projectId);
  const latestCrawl = listCrawlRuns(params.tenantId, params.projectId).find(
    (c) => c.status === 'Succeeded' || c.status === 'Partial',
  );
  const latestPerf = listPerformanceAuditRuns(params.tenantId, params.projectId, 5).find(
    (p) => p.status === 'Succeeded' || p.status === 'Partial',
  );

  // 1. Approved Business Profile (approved lock)
  created.push(
    insertWorkflowContextItem({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      contextScope: 'approved_business_profile',
      contextKey: 'business_profile',
      source: 'project_business_profile',
      sourceAgentId: 'orchestrator',
      approvalStatus: profile.approvedServices.length > 0 ? 'approved' : 'unverified',
      isApprovedLock: profile.approvedServices.length > 0,
      payload: {
        projectName: project.name,
        website: project.website,
        approvedServices: profile.approvedServices,
        primaryIndustry: profile.approvedNiche || null,
      },
      evidenceReferences: [`https://${project.website}/`],
    }),
  );

  // 2. Approved Target Markets (approved lock)
  const approvedMarkets = geoWs.targetMarkets.filter(
    (m) => m.approvalStatus === 'approved',
  );
  const effectiveMarkets =
    approvedMarkets.length > 0
      ? approvedMarkets.map((m) => ({
          id: m.id,
          name:
            [m.city, m.stateRegion, m.countryCode].filter(Boolean).join(', ') ||
            m.countryCode,
          countryCode: m.countryCode,
          approvalStatus: m.approvalStatus,
        }))
      : project.targetMarkets.map((code) => ({
          id: `proj-mkt-${code}`,
          name: code,
          countryCode: code,
          approvalStatus: 'approved',
        }));

  created.push(
    insertWorkflowContextItem({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      contextScope: 'target_markets',
      contextKey: 'approved_target_markets',
      source: 'geographic_intelligence_workspace',
      sourceAgentId: 'orchestrator',
      approvalStatus: effectiveMarkets.length > 0 ? 'approved' : 'unverified',
      isApprovedLock: effectiveMarkets.length > 0,
      payload: {
        markets: effectiveMarkets,
        count: effectiveMarkets.length,
      },
      evidenceReferences: [`https://${project.website}/`],
    }),
  );

  // 3. Approved Keywords snapshot
  const approvedKeywords = kwWs.keywords.filter(
    (k) =>
      k.workflowState === 'approved' ||
      k.workflowState === 'assigned' ||
      k.workflowState === 'implemented',
  );
  created.push(
    insertWorkflowContextItem({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      contextScope: 'approved_keywords',
      contextKey: 'approved_keyword_set',
      source: 'keyword_intelligence_workspace',
      sourceAgentId: 'orchestrator',
      approvalStatus: approvedKeywords.length > 0 ? 'approved' : 'draft',
      isApprovedLock: approvedKeywords.length > 0,
      payload: {
        approvedCount: approvedKeywords.length,
        totalTracked: kwWs.keywords.length,
        keywords: (approvedKeywords.length > 0 ? approvedKeywords : kwWs.keywords)
          .slice(0, 15)
          .map((k) => ({
            keyword: k.keyword,
            intent: k.intent,
            workflowState: k.workflowState,
            targetUrl: k.mapping?.targetUrl ?? null,
          })),
      },
      evidenceReferences: kwWs.keywords
        .map((k) => k.mapping?.targetUrl ?? k.gscObservedUrl ?? '')
        .filter(Boolean)
        .slice(0, 10),
    }),
  );

  // 4. Competitor Evidence snapshot (if present)
  if (compWs.competitors.length > 0 || compWs.contentGaps.length > 0) {
    created.push(
      insertWorkflowContextItem({
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: params.workflowId,
        contextScope: 'competitor_evidence',
        contextKey: 'competitor_baseline',
        source: 'competitor_intelligence_workspace',
        sourceAgentId: 'orchestrator',
        approvalStatus: 'verified_evidence',
        isApprovedLock: false,
        payload: {
          competitorsCount: compWs.competitors.length,
          contentGapsCount: compWs.contentGaps.length,
          topGaps: compWs.contentGaps.slice(0, 8).map((g) => ({
            targetKeyword: g.targetKeyword,
            competitorDomain: g.competitorDomain,
            opportunityScore: g.opportunityScore,
          })),
        },
        evidenceReferences: compWs.competitors.map((c) => `https://${c.domain}`).slice(0, 8),
      }),
    );
  }

  // 5. Latest Technical Audit snapshot
  if (latestCrawl) {
    created.push(
      insertWorkflowContextItem({
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: params.workflowId,
        contextScope: 'technical_audit',
        contextKey: `crawl_${latestCrawl.id}`,
        source: `technical_crawl:${latestCrawl.id}`,
        sourceAgentId: 'orchestrator',
        approvalStatus: 'verified_evidence',
        isApprovedLock: false,
        payload: {
          crawlId: latestCrawl.id,
          healthScore: latestCrawl.summary.healthScore,
          processedUrls: latestCrawl.processedCount,
        },
        evidenceReferences: [`https://${project.website}/`],
      }),
    );
  }

  // 6. Latest Performance Audit snapshot
  if (latestPerf) {
    created.push(
      insertWorkflowContextItem({
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: params.workflowId,
        contextScope: 'performance_findings',
        contextKey: `perf_${latestPerf.id}`,
        source: `performance_audit:${latestPerf.id}`,
        sourceAgentId: 'orchestrator',
        approvalStatus: 'verified_evidence',
        isApprovedLock: false,
        payload: {
          auditId: latestPerf.id,
          avgMobileScore: latestPerf.avgMobileScore,
          avgDesktopScore: latestPerf.avgDesktopScore,
        },
        evidenceReferences: latestPerf.targetUrls.slice(0, 6),
      }),
    );
  }

  return created;
}

/**
 * Versioned shared context writer. Enforces scope authorization and prevents silent
 * overwriting of approved locked context: if an approved baseline already exists,
 * preserves the approved version, creates a new `proposed` version flagged with
 * `conflictFlag = true`, and records a persisted `WorkflowConflictRecord`.
 */
export function writeWorkflowContextItem(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  contextScope: WorkflowContextScope;
  contextKey: string;
  source: string;
  sourceAgentId: AgentId;
  approvalStatus?: ContextApprovalStatus;
  payload: Record<string, unknown>;
  evidenceReferences: string[];
}): {
  item: WorkflowContextItemRecord;
  conflictCreated: WorkflowConflictRecord | null;
} {
  const perm = canAgentWriteContextScope(params.sourceAgentId, params.contextScope);
  if (!perm.allowed) {
    throw new Error(`FORBIDDEN: ${perm.reason}`);
  }

  const latest = getLatestWorkflowContextItem(
    params.tenantId,
    params.projectId,
    params.workflowId,
    params.contextScope,
    params.contextKey,
  );

  // Check if an approved locked version already exists for this scope+key
  const allForScope = listWorkflowContextItems({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    contextScope: params.contextScope,
    limit: 50,
  });
  const approvedBaseline = allForScope.find(
    (c) =>
      c.contextKey === params.contextKey &&
      c.isApprovedLock &&
      c.approvalStatus === 'approved',
  );

  let approvalStatus: ContextApprovalStatus = params.approvalStatus ?? 'draft';
  let isApprovedLock = false;
  let conflictFlag = false;
  let conflictCreated: WorkflowConflictRecord | null = null;

  if (approvedBaseline && params.sourceAgentId !== 'orchestrator') {
    // Refuse silent overwrite of approved baseline! Create proposed version & flag conflict.
    approvalStatus = 'proposed';
    isApprovedLock = false;
    conflictFlag = true;
  }

  const item = insertWorkflowContextItem({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    contextScope: params.contextScope,
    contextKey: params.contextKey,
    source: params.source,
    sourceAgentId: params.sourceAgentId,
    approvalStatus,
    isApprovedLock,
    supersedesId: latest?.id ?? null,
    conflictFlag,
    payload: params.payload,
    evidenceReferences: params.evidenceReferences,
  });

  emitRealAgentEvent({
    eventType: 'context.versioned',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: item.id,
    agentId: params.sourceAgentId,
    status: 'completed',
    taskTitle: `Context ${params.contextScope} v${item.version}`,
    summary: conflictFlag
      ? `Proposed v${item.version} for approved "${params.contextKey}" (baseline protected; conflict escalated)`
      : `Stored ${params.contextScope} "${params.contextKey}" v${item.version}`,
    evidenceUrl: '/agent-factory',
  });

  if (conflictFlag && approvedBaseline) {
    conflictCreated = insertWorkflowConflict({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      conflictType: 'approved_context_protection',
      severity: 'high',
      title: `Approved ${params.contextScope.replace(/_/g, ' ')} overwrite blocked`,
      summary: `${params.sourceAgentId} proposed a modification (v${item.version}) to approved "${params.contextKey}". Approved baseline v${approvedBaseline.version} remains locked pending human review.`,
      agentAId: approvedBaseline.sourceAgentId ?? 'orchestrator',
      agentBId: params.sourceAgentId,
      outputARef: `context:${approvedBaseline.id}`,
      outputBRef: `context:${item.id}`,
      outputASnapshot: approvedBaseline.payload,
      outputBSnapshot: item.payload,
      affectedNodeKeys: [params.contextKey],
      requiresHumanReview: true,
    });

    emitRealAgentEvent({
      eventType: 'conflict.detected',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      taskId: conflictCreated.id,
      agentId: params.sourceAgentId,
      sourceAgentId: params.sourceAgentId,
      destinationAgentId: 'orchestrator',
      status: 'waiting_for_approval',
      taskTitle: conflictCreated.title,
      summary: conflictCreated.summary,
      evidenceUrl: '/agent-factory',
    });
  }

  return { item, conflictCreated };
}

// ============================================================================
// 3. INTELLIGENT DELEGATION (GOVERNED DYNAMIC DAG EXTENSION)
// ============================================================================

export function requestIntelligentDelegation(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  parentTaskId: string;
  sourceAgentId: AgentId;
  targetAgentId: AgentStationId;
  reason: string;
  requestedObjective: string;
  evidenceReferences?: string[];
  downstreamNodeKeys?: string[];
  executionId?: string;
  onScheduleWorkflow?: (tenantId: string, workflowId: string) => void;
}): {
  delegation: AgentDelegationRecord;
  message: AgentMessageRecord | null;
  delegatedTask: WorkflowTaskRecord | null;
} {
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) {
    throw new Error('NOT_FOUND: Workflow not found in this project workspace.');
  }

  const parentTask = detail.tasks.find((t) => t.id === params.parentTaskId);
  if (!parentTask) {
    throw new Error('NOT_FOUND: Parent task not found in workflow.');
  }

  const existingDelegations = listAgentDelegations({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
  });
  const activeTenantCount = countActiveDelegationsForTenant(params.tenantId);

  const guard = validateDelegationRequest({
    sourceAgentId: params.sourceAgentId,
    targetAgentId: params.targetAgentId,
    parentTaskId: params.parentTaskId,
    currentWorkflowTaskCount: detail.tasks.length,
    existingWorkflowDelegations: existingDelegations,
    activeTenantDelegationCount: activeTenantCount,
  });

  if (!guard.allowed) {
    const rejected = insertAgentDelegation({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      parentTaskId: params.parentTaskId,
      sourceAgentId: params.sourceAgentId,
      targetAgentId: params.targetAgentId,
      delegationDepth: guard.nextDepth,
      status: 'rejected',
      reason: sanitizeUntrustedTextForPrompt(params.reason, 280),
      requestedObjective: sanitizeUntrustedTextForPrompt(params.requestedObjective, 320),
      errorSummary: guard.reason ?? 'Delegation rejected by governance policy.',
    });
    throw new Error(`BAD_REQUEST: ${rejected.errorSummary}`);
  }

  // Check if target station is enabled
  const configs = listAgentConfigsInDb(params.tenantId, params.projectId);
  const targetCfg = configs.find((c) => c.agentId === params.targetAgentId);
  if (targetCfg && !targetCfg.enabled) {
    const errText = `Cannot delegate to "${params.targetAgentId}" because that agent station is disabled.`;
    insertAgentDelegation({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      parentTaskId: params.parentTaskId,
      sourceAgentId: params.sourceAgentId,
      targetAgentId: params.targetAgentId,
      delegationDepth: guard.nextDepth,
      status: 'rejected',
      reason: sanitizeUntrustedTextForPrompt(params.reason, 280),
      requestedObjective: sanitizeUntrustedTextForPrompt(params.requestedObjective, 320),
      errorSummary: errText,
    });
    throw new Error(`BAD_REQUEST: ${errText}`);
  }

  const nodeKey = `del_${params.targetAgentId.replace(/_agent$/, '')}_${crypto.randomUUID().slice(0, 6)}`;
  const validDownstream = (params.downstreamNodeKeys ?? []).filter((k) => {
    const t = detail.tasks.find((task) => task.nodeKey === k);
    return t && (t.status === 'queued' || t.status === 'retrying');
  });

  // Pre-validate resulting DAG with validateWorkflowGraph before mutating DB!
  const candidateNodes = [
    ...detail.nodes.map((n) => ({
      id: n.nodeKey,
      prerequisites: detail.edges
        .filter((e) => e.toNodeKey === n.nodeKey)
        .map((e) => e.fromNodeKey)
        .concat(validDownstream.includes(n.nodeKey) ? [nodeKey] : []),
    })),
    {
      id: nodeKey,
      prerequisites: [parentTask.nodeKey],
    },
  ];

  if (!validateWorkflowGraph(candidateNodes)) {
    throw new Error(
      'BAD_REQUEST: Delegated subtask would violate DAG acyclicity or reachability constraints.',
    );
  }

  const msg = sendAgentMessage({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    executionId: params.executionId ?? parentTask.id,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.targetAgentId,
    messageType: 'delegation_request',
    payload: {
      summary: sanitizeUntrustedTextForPrompt(params.reason, 260),
      requestedObjective: sanitizeUntrustedTextForPrompt(params.requestedObjective, 320),
      delegationDepth: guard.nextDepth,
      parentNodeKey: parentTask.nodeKey,
    },
    evidenceReferences: params.evidenceReferences ?? [],
    taskId: parentTask.id,
  });

  const delegatedTask = insertDynamicDelegatedNodeAndTaskInDb({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    nodeKey,
    agentId: params.targetAgentId,
    title: `Delegated: ${sanitizeUntrustedTextForPrompt(params.requestedObjective, 96)}`,
    parentNodeKey: parentTask.nodeKey,
    downstreamNodeKeys: validDownstream,
    maxRetries: 1,
    timeoutMs: 60_000,
    config: {
      delegatedBy: params.sourceAgentId,
      delegationReason: sanitizeUntrustedTextForPrompt(params.reason, 240),
      delegationDepth: guard.nextDepth,
      requestMessageId: msg.messageId,
      correlationId: msg.correlationId,
    },
  });

  const delegation = insertAgentDelegation({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    parentTaskId: params.parentTaskId,
    delegatedTaskId: delegatedTask.id,
    sourceAgentId: params.sourceAgentId,
    targetAgentId: params.targetAgentId,
    messageId: msg.messageId,
    delegationDepth: guard.nextDepth,
    status: 'scheduled',
    reason: sanitizeUntrustedTextForPrompt(params.reason, 280),
    requestedObjective: sanitizeUntrustedTextForPrompt(params.requestedObjective, 320),
  });

  emitRealAgentEvent({
    eventType: 'agent.delegation.created',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: delegatedTask.id,
    agentId: params.targetAgentId,
    sourceAgentId: params.sourceAgentId,
    destinationAgentId: params.targetAgentId,
    status: 'queued',
    taskTitle: delegatedTask.title,
    summary: `${params.sourceAgentId} delegated task (depth ${guard.nextDepth}) to ${params.targetAgentId}: ${params.reason}`,
    correlationId: msg.correlationId,
    evidenceUrl: '/agent-factory',
  });

  if (params.onScheduleWorkflow) {
    params.onScheduleWorkflow(params.tenantId, params.workflowId);
  }

  return { delegation, message: msg, delegatedTask };
}

/**
 * Called automatically when a delegated task finishes or fails, updating the
 * delegation record and sending a correlated `findings_response` or `rejection_notice`
 * back to the originating agent.
 */
export function completeDelegationForTask(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  task: WorkflowTaskRecord;
  executionId: string;
  succeeded: boolean;
  summary: string;
  evidenceReferences: string[];
  outputId?: string | null;
}): void {
  const del = getDelegationByDelegatedTaskId(params.tenantId, params.task.id);
  if (!del) return;

  const now = new Date().toISOString();
  let responseMessageId: string | null = null;
  try {
    const reply = sendAgentMessage({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      executionId: params.executionId,
      sourceAgentId: del.targetAgentId,
      destinationAgentId: del.sourceAgentId,
      messageType: params.succeeded ? 'findings_response' : 'rejection_notice',
      payload: {
        summary: params.summary,
        delegationId: del.id,
        outputId: params.outputId ?? null,
        succeeded: params.succeeded,
      },
      evidenceReferences: params.evidenceReferences,
      replyToMessageId: del.messageId,
      taskId: params.task.id,
    });
    responseMessageId = reply.messageId;
  } catch {
    // Do not break task finalization if reply delivery fails
  }

  updateAgentDelegation(params.tenantId, del.id, {
    status: params.succeeded ? 'completed' : 'failed',
    responseMessageId,
    errorSummary: params.succeeded ? null : params.summary,
    completedAt: now,
  });

  emitRealAgentEvent({
    eventType: 'agent.delegation.completed',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    taskId: params.task.id,
    agentId: del.targetAgentId,
    sourceAgentId: del.targetAgentId,
    destinationAgentId: del.sourceAgentId,
    status: params.succeeded ? 'completed' : 'failed',
    taskTitle: params.task.title,
    summary: params.succeeded
      ? `Delegated findings returned to ${del.sourceAgentId}: ${params.summary}`
      : `Delegated task failed for ${del.sourceAgentId}: ${params.summary}`,
    evidenceUrl: '/agent-factory',
  });
}

// ============================================================================
// 4. CONFLICT DETECTION & HUMAN-IN-THE-LOOP RESOLUTION
// ============================================================================

export function runConflictDetectionForWorkflow(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  executionId?: string;
}): WorkflowConflictRecord[] {
  const detail = getWorkflowDetailById(params.tenantId, params.workflowId);
  if (!detail || detail.workflow.projectId !== params.projectId) return [];

  const contextItems = listWorkflowContextItems({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId,
    limit: 120,
  });

  const nodeKeyByTaskId = new Map<string, string>(
    detail.tasks.map((t) => [t.id, t.nodeKey]),
  );

  const candidates = detectWorkflowConflictsFromEvidence({
    outputs: detail.outputs,
    contextItems,
    nodeKeyByTaskId,
  });

  const persisted: WorkflowConflictRecord[] = [];
  for (const c of candidates) {
    let verificationMessageId: string | null = null;
    if (c.recommendedVerifierAgentId && c.recommendedVerifierAgentId !== 'quality_assurance_agent') {
      try {
        const verifyMsg = sendAgentMessage({
          tenantId: params.tenantId,
          projectId: params.projectId,
          workflowId: params.workflowId,
          executionId: params.executionId ?? params.workflowId,
          sourceAgentId: 'quality_assurance_agent',
          destinationAgentId: c.recommendedVerifierAgentId,
          messageType: 'verification_request',
          payload: {
            summary: `Verify conflict: ${c.title}`,
            conflictType: c.conflictType,
            outputARef: c.outputARef,
            outputBRef: c.outputBRef,
          },
          evidenceReferences: [c.outputARef, c.outputBRef],
        });
        verificationMessageId = verifyMsg.messageId;
      } catch {
        // Ignore if verifier agent is disabled
      }
    }

    const record = insertWorkflowConflict({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      conflictType: c.conflictType,
      severity: c.severity,
      title: c.title,
      summary: c.summary,
      agentAId: c.agentAId,
      agentBId: c.agentBId,
      outputARef: c.outputARef,
      outputBRef: c.outputBRef,
      outputASnapshot: c.outputASnapshot,
      outputBSnapshot: c.outputBSnapshot,
      affectedNodeKeys: c.affectedNodeKeys,
      verificationMessageId,
      requiresHumanReview: c.requiresHumanReview,
      status: verificationMessageId ? 'verifying' : 'open',
    });

    try {
      sendAgentMessage({
        tenantId: params.tenantId,
        projectId: params.projectId,
        workflowId: params.workflowId,
        executionId: params.executionId ?? params.workflowId,
        sourceAgentId: 'quality_assurance_agent',
        destinationAgentId: 'orchestrator',
        messageType: 'conflict_report',
        payload: {
          summary: `${c.title} (${c.severity} severity)`,
          conflictId: record.id,
          conflictType: c.conflictType,
          requiresHumanReview: c.requiresHumanReview,
        },
        evidenceReferences: [c.outputARef, c.outputBRef],
      });
    } catch {
      // Non-fatal
    }

    emitRealAgentEvent({
      eventType: 'conflict.detected',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      taskId: record.id,
      agentId: 'quality_assurance_agent',
      sourceAgentId: c.agentAId,
      destinationAgentId: c.agentBId,
      status: 'waiting_for_approval',
      taskTitle: record.title,
      summary: record.summary,
      evidenceUrl: '/agent-factory',
    });

    persisted.push(record);
  }

  return persisted;
}

export function resolveWorkflowConflict(params: {
  tenantId: string;
  projectId: string;
  conflictId: string;
  selectedResolution: 'keep_a' | 'keep_b' | 'custom';
  resolutionNote: string;
  dismiss?: boolean;
  user: User;
}): WorkflowConflictRecord {
  const existing = getWorkflowConflictById(
    params.tenantId,
    params.projectId,
    params.conflictId,
  );
  if (!existing) {
    throw new Error('NOT_FOUND: Workflow conflict not found in this project workspace.');
  }

  if (existing.requiresHumanReview && !isOfficialConflictResolverRole(params.user.role)) {
    throw new Error(
      `FORBIDDEN: Role "${params.user.role}" cannot resolve business-impacting workflow conflicts. Only Business Owner, Agency Owner, or Platform Admin may resolve this conflict.`,
    );
  }

  const note = sanitizeUntrustedTextForPrompt(params.resolutionNote, 480);
  if (!note) {
    throw new Error(
      'BAD_REQUEST: Provide a resolution note explaining the decision before resolving a conflict.',
    );
  }

  const resolved = resolveWorkflowConflictRecord({
    tenantId: params.tenantId,
    projectId: params.projectId,
    conflictId: existing.id,
    status: params.dismiss ? 'dismissed' : 'resolved',
    selectedResolution: params.selectedResolution,
    resolutionNote: note,
    resolvedBy: params.user.id,
    resolvedByName: params.user.name,
    resolvedByRole: params.user.role,
  });

  if (!resolved) {
    throw new Error('NOT_FOUND: Failed to update workflow conflict.');
  }

  // Record a versioned resolution entry in Shared Workflow Context for full auditability
  try {
    insertWorkflowContextItem({
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: existing.workflowId,
      contextScope: 'approved_agent_output',
      contextKey: `conflict_resolution_${existing.id}`,
      source: `human_resolution:${params.user.name}`,
      sourceAgentId: 'orchestrator',
      approvalStatus: 'approved',
      isApprovedLock: true,
      payload: {
        conflictId: existing.id,
        conflictType: existing.conflictType,
        selectedResolution: params.selectedResolution,
        resolutionNote: note,
        resolvedBy: params.user.name,
        resolvedByRole: params.user.role,
      },
      evidenceReferences: [existing.outputARef, existing.outputBRef],
    });
  } catch {
    // Non-fatal
  }

  emitRealAgentEvent({
    eventType: 'conflict.resolved',
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: existing.workflowId,
    taskId: existing.id,
    agentId: 'orchestrator',
    status: 'completed',
    taskTitle: `Resolved: ${existing.title}`,
    summary: `Resolved (${params.selectedResolution}) by ${params.user.name} (${params.user.role}): ${note}`,
    evidenceUrl: '/agent-factory',
  });

  recordActivityEvent({
    tenantId: params.tenantId,
    projectId: params.projectId,
    type: 'content_review',
    actor: params.user.name,
    action: `Resolved agent workflow conflict "${existing.title}" (${params.selectedResolution})`,
    status: 'Succeeded',
    evidenceUrl: '/agent-factory',
  });

  return resolved;
}

// ============================================================================
// 5. COLLABORATION MONITOR AGGREGATOR (REAL PERSISTED DATA ONLY)
// ============================================================================

export function buildCollaborationMonitorPayload(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  agentId?: string | null;
  messageType?: string | null;
  status?: string | null;
  search?: string | null;
}): CollaborationMonitorPayload {
  const project = getProjectById(params.tenantId, params.projectId);
  if (!project) {
    throw new Error('NOT_FOUND: Project not found.');
  }

  const allMessages = listAgentMessages({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId ?? null,
    limit: 200,
  });

  const filteredMessages =
    params.agentId || params.messageType || params.status || params.search
      ? listAgentMessages({
          tenantId: params.tenantId,
          projectId: params.projectId,
          workflowId: params.workflowId ?? null,
          agentId: params.agentId ?? null,
          messageType: params.messageType ?? null,
          status: params.status ?? null,
          search: params.search ?? null,
          limit: 150,
        })
      : allMessages;

  const delegations = listAgentDelegations({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId ?? null,
    limit: 120,
  });

  const conflicts = listWorkflowConflicts({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId ?? null,
    limit: 120,
  });

  const contextItems = listWorkflowContextItems({
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId ?? null,
    limit: 120,
  });

  const outputs: AgentOutputRecord[] = listAgentOutputsForProjectInDb(
    params.tenantId,
    params.projectId,
    params.workflowId ?? null,
    120,
  );

  let verifiedFactsCount = 0;
  let measuredMetricsCount = 0;
  let inferredFindingsCount = 0;
  let aiSuggestionsCount = 0;
  let unavailableItemsCount = 0;
  const verifiedRefSet = new Set<string>();
  const unsupportedClaims: CollaborationMonitorPayload['evidenceSummary']['unsupportedClaims'] = [];

  for (const out of outputs) {
    const trust = out.payload?.evidenceTrust as EvidenceTrustBreakdown | undefined;
    if (trust) {
      verifiedFactsCount += trust.verifiedFacts?.length ?? 0;
      measuredMetricsCount += trust.measuredMetrics?.length ?? 0;
      inferredFindingsCount += trust.inferredFindings?.length ?? 0;
      aiSuggestionsCount += trust.aiGeneratedSuggestions?.length ?? 0;
      unavailableItemsCount += trust.unavailableInformation?.length ?? 0;
      for (const r of trust.evidenceReferences ?? []) verifiedRefSet.add(r);
    }
    for (const r of out.evidenceRefs ?? []) verifiedRefSet.add(r);

    const validation = validateEvidenceTrustForOutput(out);
    for (const claim of validation.unsupportedClaims) {
      unsupportedClaims.push({
        workflowId: out.workflowId,
        agentId: out.agentId,
        claim,
        outputId: out.id,
      });
    }
  }

  const byAgent = summarizeCollaborationByAgent(allMessages, delegations);

  const activeWorkflowIds = new Set<string>();
  for (const d of delegations) {
    if (d.status === 'requested' || d.status === 'scheduled' || d.status === 'running') {
      activeWorkflowIds.add(d.workflowId);
    }
  }
  for (const m of allMessages) {
    if (Date.now() - Date.parse(m.timestamp) < 5 * 60_000) {
      activeWorkflowIds.add(m.workflowId);
    }
  }

  const pendingRequests = Object.values(byAgent).reduce(
    (sum, a) => sum + a.pendingResponses,
    0,
  );

  return {
    projectId: params.projectId,
    workflowId: params.workflowId ?? null,
    generatedAt: new Date().toISOString(),
    summary: {
      activeCollaborations: activeWorkflowIds.size,
      totalMessages: allMessages.length,
      failedMessages: allMessages.filter(
        (m) => m.status === 'failed' || m.status === 'rejected',
      ).length,
      pendingRequests,
      delegatedTasks: delegations.length,
      openConflicts: conflicts.filter(
        (c) => c.status === 'open' || c.status === 'verifying',
      ).length,
      resolvedConflicts: conflicts.filter(
        (c) => c.status === 'resolved' || c.status === 'dismissed',
      ).length,
      contextVersions: contextItems.length,
      verifiedEvidenceRefs: verifiedRefSet.size,
      unsupportedClaimsCount: unsupportedClaims.length,
    },
    messages: filteredMessages,
    delegations,
    conflicts,
    contextItems,
    evidenceSummary: {
      outputsAudited: outputs.length,
      verifiedFactsCount,
      measuredMetricsCount,
      inferredFindingsCount,
      aiSuggestionsCount,
      unavailableItemsCount,
      unsupportedClaims: unsupportedClaims.slice(0, 30),
    },
    byAgent,
  };
}
