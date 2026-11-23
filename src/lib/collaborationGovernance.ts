import type {
  AgentDelegationRecord,
  AgentId,
  AgentMessageRecord,
  AgentMessageType,
  AgentOutputRecord,
  AgentStationId,
  EvidenceTrustBreakdown,
  EvidenceTrustEntry,
  WorkflowConflictType,
  WorkflowContextItemRecord,
  WorkflowContextScope,
} from '../types/agentFactory';
import { AGENT_STATION_IDS } from './agentFactoryCatalog';
import { sanitizeUntrustedTextForPrompt } from './dagValidation';

export const MAX_MESSAGE_PAYLOAD_BYTES = 24_576;
export const MAX_DELEGATION_DEPTH = 2;
export const MAX_TASKS_PER_WORKFLOW = 18;
export const MAX_ACTIVE_DELEGATIONS_PER_TENANT = 24;

const VALID_AGENTS = new Set<string>(['orchestrator', ...AGENT_STATION_IDS]);
const VALID_STATIONS = new Set<string>(AGENT_STATION_IDS);

export const VALID_MESSAGE_TYPES: readonly AgentMessageType[] = [
  'research_request',
  'verification_request',
  'evidence_share',
  'clarification_question',
  'findings_response',
  'delegation_request',
  'conflict_report',
  'rejection_notice',
] as const;

const MESSAGE_TYPE_SET = new Set<string>(VALID_MESSAGE_TYPES);

/**
 * Explicit agent-to-agent delegation capability matrix.
 * Agents can ONLY delegate to authorized specialist peers (no self-escalation or
 * unrestricted arbitrary delegation loops).
 */
export const AGENT_DELEGATION_MATRIX: Record<AgentId, readonly AgentStationId[]> = {
  orchestrator: AGENT_STATION_IDS,
  research_agent: [
    'keyword_intelligence_agent',
    'competitor_intelligence_agent',
    'geographic_intelligence_agent',
    'technical_seo_agent',
  ],
  competitor_intelligence_agent: [
    'keyword_intelligence_agent',
    'geographic_intelligence_agent',
    'research_agent',
  ],
  keyword_intelligence_agent: [
    'competitor_intelligence_agent',
    'geographic_intelligence_agent',
    'research_agent',
  ],
  geographic_intelligence_agent: [
    'keyword_intelligence_agent',
    'research_agent',
  ],
  technical_seo_agent: [
    'performance_analysis_agent',
    'research_agent',
  ],
  performance_analysis_agent: [
    'technical_seo_agent',
    'research_agent',
  ],
  content_strategy_agent: [
    'keyword_intelligence_agent',
    'competitor_intelligence_agent',
    'geographic_intelligence_agent',
    'research_agent',
  ],
  content_generation_agent: [
    'research_agent',
    'keyword_intelligence_agent',
  ],
  quality_assurance_agent: [
    'research_agent',
    'technical_seo_agent',
    'performance_analysis_agent',
    'keyword_intelligence_agent',
    'competitor_intelligence_agent',
    'geographic_intelligence_agent',
  ],
  reporting_agent: [],
};

/**
 * Explicit agent write permissions per shared workflow context scope.
 * Approved baseline scopes (`approved_business_profile`, `target_markets`, `approved_keywords`)
 * are write-locked for normal agents; attempting to overwrite an approved locked item creates
 * a versioned proposal + conflict record rather than mutating the approved record.
 */
export const CONTEXT_WRITE_PERMISSIONS: Record<WorkflowContextScope, readonly AgentId[]> = {
  approved_business_profile: ['orchestrator', 'research_agent'],
  target_markets: ['orchestrator', 'geographic_intelligence_agent', 'research_agent'],
  approved_keywords: ['orchestrator', 'keyword_intelligence_agent'],
  competitor_evidence: ['orchestrator', 'competitor_intelligence_agent', 'research_agent'],
  technical_audit: ['orchestrator', 'technical_seo_agent'],
  performance_findings: ['orchestrator', 'performance_analysis_agent'],
  content_brief: ['orchestrator', 'content_strategy_agent'],
  approved_agent_output: [
    'orchestrator',
    'research_agent',
    'competitor_intelligence_agent',
    'keyword_intelligence_agent',
    'geographic_intelligence_agent',
    'technical_seo_agent',
    'performance_analysis_agent',
    'content_strategy_agent',
    'content_generation_agent',
    'quality_assurance_agent',
    'reporting_agent',
  ],
};

export function isOfficialConflictResolverRole(role: string | null | undefined): boolean {
  return (
    role === 'Platform Admin' ||
    role === 'Agency Owner' ||
    role === 'Business Owner'
  );
}

export function canAgentCommunicate(
  sourceAgentId: AgentId,
  destinationAgentId: AgentId,
): { allowed: boolean; reason?: string } {
  if (!VALID_AGENTS.has(sourceAgentId)) {
    return { allowed: false, reason: `Unknown source agent "${sourceAgentId}".` };
  }
  if (!VALID_AGENTS.has(destinationAgentId)) {
    return { allowed: false, reason: `Unknown destination agent "${destinationAgentId}".` };
  }
  if (sourceAgentId === destinationAgentId) {
    return { allowed: false, reason: 'Agent cannot send a peer message to itself.' };
  }
  return { allowed: true };
}

export function canAgentDelegateTo(
  sourceAgentId: AgentId,
  targetAgentId: AgentStationId,
): { allowed: boolean; reason?: string } {
  if (!VALID_AGENTS.has(sourceAgentId)) {
    return { allowed: false, reason: `Unknown delegating agent "${sourceAgentId}".` };
  }
  if (!VALID_STATIONS.has(targetAgentId)) {
    return { allowed: false, reason: `Invalid delegation target "${targetAgentId}".` };
  }
  if (sourceAgentId === targetAgentId) {
    return { allowed: false, reason: 'Self-delegation is prohibited.' };
  }
  const permitted = AGENT_DELEGATION_MATRIX[sourceAgentId] ?? [];
  if (!permitted.includes(targetAgentId)) {
    return {
      allowed: false,
      reason: `Agent "${sourceAgentId}" is not authorized by capability policy to delegate tasks to "${targetAgentId}".`,
    };
  }
  return { allowed: true };
}

export function canAgentWriteContextScope(
  agentId: AgentId,
  scope: WorkflowContextScope,
): { allowed: boolean; reason?: string } {
  const allowedAgents = CONTEXT_WRITE_PERMISSIONS[scope] ?? [];
  if (!allowedAgents.includes(agentId)) {
    return {
      allowed: false,
      reason: `Agent "${agentId}" is not authorized to write to shared context scope "${scope}".`,
    };
  }
  return { allowed: true };
}

export function sanitizeMessagePayloadValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return sanitizeUntrustedTextForPrompt(value, 640);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => sanitizeMessagePayloadValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    for (const [k, v] of entries) {
      const safeKey = String(k).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 80);
      if (!safeKey || safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') {
        continue;
      }
      out[safeKey] = sanitizeMessagePayloadValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 120);
}

export interface AgentMessageValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedPayload: Record<string, unknown>;
  sanitizedEvidenceReferences: string[];
  payloadBytes: number;
}

export function validateAgentMessageInput(input: {
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
}): AgentMessageValidationResult {
  const errors: string[] = [];

  if (!input.tenantId?.trim()) errors.push('tenantId is required.');
  if (!input.projectId?.trim()) errors.push('projectId is required.');
  if (!input.workflowId?.trim()) errors.push('workflowId is required.');
  if (!input.executionId?.trim()) errors.push('executionId is required.');

  const commCheck = canAgentCommunicate(input.sourceAgentId, input.destinationAgentId);
  if (!commCheck.allowed && commCheck.reason) {
    errors.push(commCheck.reason);
  }

  if (!MESSAGE_TYPE_SET.has(input.messageType)) {
    errors.push(`Unsupported messageType "${String(input.messageType)}".`);
  }

  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    errors.push('Message payload must be a JSON object.');
  }

  if (!Array.isArray(input.evidenceReferences)) {
    errors.push('evidenceReferences must be an array.');
  }

  const sanitizedPayload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (sanitizeMessagePayloadValue(input.payload, 0) as Record<string, unknown>)
      : {};

  const serialized = JSON.stringify(sanitizedPayload);
  const payloadBytes = new TextEncoder().encode(serialized).length;
  if (payloadBytes > MAX_MESSAGE_PAYLOAD_BYTES) {
    errors.push(
      `Message payload size (${payloadBytes} bytes) exceeds maximum limit (${MAX_MESSAGE_PAYLOAD_BYTES} bytes).`,
    );
  }

  const sanitizedEvidenceReferences = Array.isArray(input.evidenceReferences)
    ? Array.from(
        new Set(
          input.evidenceReferences
            .map((ref) => sanitizeUntrustedTextForPrompt(String(ref ?? ''), 240))
            .filter(Boolean),
        ),
      ).slice(0, 40)
    : [];

  return {
    valid: errors.length === 0,
    errors,
    sanitizedPayload,
    sanitizedEvidenceReferences,
    payloadBytes,
  };
}

export interface DelegationLimitValidation {
  allowed: boolean;
  reason?: string;
  nextDepth: number;
}

export function validateDelegationRequest(params: {
  sourceAgentId: AgentId;
  targetAgentId: AgentStationId;
  parentTaskId: string;
  currentWorkflowTaskCount: number;
  existingWorkflowDelegations: AgentDelegationRecord[];
  activeTenantDelegationCount: number;
  maxDepth?: number;
  maxWorkflowTasks?: number;
  maxTenantDelegations?: number;
}): DelegationLimitValidation {
  const maxDepth = params.maxDepth ?? MAX_DELEGATION_DEPTH;
  const maxWorkflowTasks = params.maxWorkflowTasks ?? MAX_TASKS_PER_WORKFLOW;
  const maxTenantDelegations =
    params.maxTenantDelegations ?? MAX_ACTIVE_DELEGATIONS_PER_TENANT;

  const capCheck = canAgentDelegateTo(params.sourceAgentId, params.targetAgentId);
  if (!capCheck.allowed) {
    return { allowed: false, reason: capCheck.reason, nextDepth: 1 };
  }

  // Compute current delegation depth by walking parentTaskId ancestry
  const byDelegatedTaskId = new Map<string, AgentDelegationRecord>();
  for (const d of params.existingWorkflowDelegations) {
    if (d.delegatedTaskId) byDelegatedTaskId.set(d.delegatedTaskId, d);
  }

  let parentDepth = 0;
  const ancestorAgents = new Set<string>([params.sourceAgentId]);
  let cursorTaskId: string | null = params.parentTaskId;
  let guard = 0;
  while (cursorTaskId && guard < 10) {
    guard += 1;
    const parentDel = byDelegatedTaskId.get(cursorTaskId);
    if (!parentDel) break;
    parentDepth = Math.max(parentDepth, parentDel.delegationDepth);
    ancestorAgents.add(parentDel.sourceAgentId);
    ancestorAgents.add(parentDel.targetAgentId);
    cursorTaskId = parentDel.parentTaskId;
  }

  const nextDepth = parentDepth + 1;
  if (nextDepth > maxDepth) {
    return {
      allowed: false,
      reason: `Delegation depth ${nextDepth} exceeds maximum allowed depth (${maxDepth}).`,
      nextDepth,
    };
  }

  if (ancestorAgents.has(params.targetAgentId)) {
    return {
      allowed: false,
      reason: `Recursive delegation loop blocked: "${params.targetAgentId}" is already in the delegation ancestry chain.`,
      nextDepth,
    };
  }

  // Duplicate active delegation check for same parent -> target
  const duplicate = params.existingWorkflowDelegations.find(
    (d) =>
      d.parentTaskId === params.parentTaskId &&
      d.targetAgentId === params.targetAgentId &&
      d.status !== 'rejected' &&
      d.status !== 'failed',
  );
  if (duplicate) {
    return {
      allowed: false,
      reason: `Duplicate delegation from task "${params.parentTaskId}" to "${params.targetAgentId}" already exists.`,
      nextDepth,
    };
  }

  if (params.currentWorkflowTaskCount + 1 > maxWorkflowTasks) {
    return {
      allowed: false,
      reason: `Workflow task limit (${maxWorkflowTasks}) reached; additional delegation rejected.`,
      nextDepth,
    };
  }

  if (params.activeTenantDelegationCount >= maxTenantDelegations) {
    return {
      allowed: false,
      reason: `Tenant active delegation quota (${maxTenantDelegations}) exceeded.`,
      nextDepth,
    };
  }

  return { allowed: true, nextDepth };
}

/**
 * Builds a clean, auditable EvidenceTrustBreakdown ensuring Verified Facts,
 * Measured Metrics, Inferred Findings, AI-Generated Suggestions, and Unavailable
 * Information are explicitly separated and never mixed.
 */
export function buildEvidenceTrustBreakdown(input: {
  verifiedFacts?: EvidenceTrustEntry[];
  measuredMetrics?: EvidenceTrustEntry[];
  inferredFindings?: EvidenceTrustEntry[];
  aiGeneratedSuggestions?: EvidenceTrustEntry[];
  unavailableInformation?: string[];
  evidenceReferences?: string[];
  qaValidationStatus?: EvidenceTrustBreakdown['qaValidationStatus'];
  qaUnsupportedClaims?: string[];
}): EvidenceTrustBreakdown {
  const cleanEntries = (entries?: EvidenceTrustEntry[]): EvidenceTrustEntry[] =>
    (entries ?? [])
      .filter((e) => e && typeof e.statement === 'string' && e.statement.trim().length > 0)
      .slice(0, 25)
      .map((e) => ({
        statement: sanitizeUntrustedTextForPrompt(e.statement, 360),
        source: sanitizeUntrustedTextForPrompt(e.source || 'project_record', 120),
        ...(e.evidenceRef ? { evidenceRef: sanitizeUntrustedTextForPrompt(e.evidenceRef, 200) } : {}),
      }));

  const refs = Array.from(
    new Set(
      (input.evidenceReferences ?? [])
        .map((r) => sanitizeUntrustedTextForPrompt(String(r ?? ''), 200))
        .filter(Boolean),
    ),
  ).slice(0, 40);

  return {
    verifiedFacts: cleanEntries(input.verifiedFacts),
    measuredMetrics: cleanEntries(input.measuredMetrics),
    inferredFindings: cleanEntries(input.inferredFindings),
    aiGeneratedSuggestions: cleanEntries(input.aiGeneratedSuggestions),
    unavailableInformation: Array.from(
      new Set(
        (input.unavailableInformation ?? [])
          .map((item) => sanitizeUntrustedTextForPrompt(item, 280))
          .filter(Boolean),
      ),
    ).slice(0, 20),
    evidenceReferences: refs,
    qaValidationStatus: input.qaValidationStatus ?? 'pending',
    qaUnsupportedClaims: (input.qaUnsupportedClaims ?? []).slice(0, 20),
  };
}

/**
 * QA Evidence Validator: checks an agent output's EvidenceTrustBreakdown so that
 * any "verified fact" or "measured metric" has a backing evidenceRef/source and
 * flags unbacked numeric claims or missing citations.
 */
export function validateEvidenceTrustForOutput(output: AgentOutputRecord): {
  status: 'validated' | 'warnings' | 'rejected';
  unsupportedClaims: string[];
  verifiedRefCount: number;
} {
  const payload = output.payload ?? {};
  const trust = payload.evidenceTrust as EvidenceTrustBreakdown | undefined;
  const unsupportedClaims: string[] = [];

  if (!trust || typeof trust !== 'object') {
    if (output.isAiGenerated && output.evidenceRefs.length === 0) {
      unsupportedClaims.push(
        `AI output "${output.id}" by ${output.agentId} lacks evidenceTrust classification and source references.`,
      );
      return { status: 'rejected', unsupportedClaims, verifiedRefCount: 0 };
    }
    return {
      status: output.evidenceRefs.length > 0 ? 'validated' : 'warnings',
      unsupportedClaims,
      verifiedRefCount: output.evidenceRefs.length,
    };
  }

  for (const fact of trust.verifiedFacts ?? []) {
    if (!fact.source?.trim() || (!fact.evidenceRef && output.evidenceRefs.length === 0)) {
      unsupportedClaims.push(
        `Verified fact missing evidence reference: "${fact.statement.slice(0, 120)}"`,
      );
    }
  }

  for (const metric of trust.measuredMetrics ?? []) {
    if (!metric.source?.trim()) {
      unsupportedClaims.push(
        `Measured metric missing telemetry source: "${metric.statement.slice(0, 120)}"`,
      );
    }
  }

  // Flag fabricated-looking percentage/volume promises inside AI prose without evidence refs
  if (output.isAiGenerated) {
    const draftBody = String(payload.bodyMarkdown ?? payload.draft ?? '');
    if (
      /\b(guaranteed\s+#1|100%\s+traffic\s+increase|guaranteed\s+rankings)\b/i.test(draftBody)
    ) {
      unsupportedClaims.push(
        'Generated content contains unsubstantiated ranking/traffic guarantee language.',
      );
    }
  }

  const verifiedRefCount = Array.from(
    new Set([...(output.evidenceRefs ?? []), ...(trust.evidenceReferences ?? [])]),
  ).length;

  const status: 'validated' | 'warnings' | 'rejected' =
    unsupportedClaims.length >= 2
      ? 'rejected'
      : unsupportedClaims.length === 1
        ? 'warnings'
        : 'validated';

  return { status, unsupportedClaims, verifiedRefCount };
}

export interface DetectedConflictCandidate {
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
  requiresHumanReview: boolean;
  recommendedVerifierAgentId: AgentStationId | null;
}

/**
 * Pure conflict detection engine across workflow outputs and versioned shared context.
 * Detects:
 * 1. Conflicting keyword intent classifications across agents.
 * 2. Conflicting geographic targeting (recommended market absent from approved target markets).
 * 3. Conflicting URL recommendations for the same target keyword.
 * 4. Contradictory competitor findings (e.g., high opportunity vs zero gap / blocked coverage).
 * 5. Unsupported claims flagged by QA evidence validation.
 * 6. Approved context modification conflicts (`conflictFlag === true` in versioned context).
 */
export function detectWorkflowConflictsFromEvidence(params: {
  outputs: AgentOutputRecord[];
  contextItems: WorkflowContextItemRecord[];
  nodeKeyByTaskId: Map<string, string>;
}): DetectedConflictCandidate[] {
  const conflicts: DetectedConflictCandidate[] = [];
  const dedup = new Set<string>();

  const pushUnique = (dedupKey: string, candidate: DetectedConflictCandidate) => {
    if (dedup.has(dedupKey)) return;
    dedup.add(dedupKey);
    conflicts.push(candidate);
  };

  // 1. Check approved context protection conflicts (context items flagged with conflictFlag)
  const approvedByKey = new Map<string, WorkflowContextItemRecord>();
  for (const item of params.contextItems) {
    const key = `${item.contextScope}:${item.contextKey}`;
    if (item.isApprovedLock && item.approvalStatus === 'approved') {
      approvedByKey.set(key, item);
    }
  }
  for (const item of params.contextItems) {
    if (!item.conflictFlag) continue;
    const key = `${item.contextScope}:${item.contextKey}`;
    const baseline = approvedByKey.get(key);
    pushUnique(`ctx:${item.id}`, {
      conflictType: 'approved_context_protection',
      severity: 'high',
      title: `Proposed change conflicts with approved ${item.contextScope.replace(/_/g, ' ')}`,
      summary: `Agent ${item.sourceAgentId ?? 'unknown'} proposed v${item.version} for "${item.contextKey}", which differs from approved baseline v${baseline?.version ?? 1}. Original approved context preserved.`,
      agentAId: baseline?.sourceAgentId ?? 'orchestrator',
      agentBId: item.sourceAgentId ?? 'research_agent',
      outputARef: baseline ? `context:${baseline.id}` : `context:${item.contextKey}:approved`,
      outputBRef: `context:${item.id}`,
      outputASnapshot: baseline?.payload ?? {},
      outputBSnapshot: item.payload ?? {},
      affectedNodeKeys: ['content_strategy', 'strategy_recommendation', 'content_brief_plan'],
      requiresHumanReview: true,
      recommendedVerifierAgentId: 'research_agent',
    });
  }

  // Gather structured keyword intents, URL mappings, and geo targets across outputs
  const intentByKeyword = new Map<
    string,
    Array<{ intent: string; output: AgentOutputRecord; nodeKey: string }>
  >();
  const urlByKeyword = new Map<
    string,
    Array<{ targetUrl: string; output: AgentOutputRecord; nodeKey: string }>
  >();

  const approvedMarketsCtx = params.contextItems.find(
    (c) => c.contextScope === 'target_markets' && c.approvalStatus === 'approved',
  );
  const approvedMarketNames = new Set<string>(
    Array.isArray(approvedMarketsCtx?.payload?.markets)
      ? (approvedMarketsCtx.payload.markets as Array<Record<string, unknown>>)
          .map((m) => String(m.name ?? m.locationName ?? m.country ?? '').trim().toLowerCase())
          .filter(Boolean)
      : [],
  );

  for (const out of params.outputs) {
    const nodeKey = params.nodeKeyByTaskId.get(out.taskId) ?? out.agentId;
    const payload = out.payload ?? {};

    // Extract keyword intent signals
    const kwList = [
      ...(Array.isArray(payload.keywords) ? payload.keywords : []),
      ...(Array.isArray(payload.topKeywords) ? payload.topKeywords : []),
      ...(Array.isArray(payload.recommendations) ? payload.recommendations : []),
    ] as Array<Record<string, unknown>>;

    for (const item of kwList) {
      const kw = String(item?.keyword ?? item?.primaryKeyword ?? item?.topic ?? '')
        .trim()
        .toLowerCase();
      if (!kw) continue;

      const intent = String(item?.intent ?? item?.searchIntent ?? '').trim().toLowerCase();
      if (intent) {
        const list = intentByKeyword.get(kw) ?? [];
        list.push({ intent, output: out, nodeKey });
        intentByKeyword.set(kw, list);
      }

      const targetUrl = String(item?.targetUrl ?? item?.recommendedUrl ?? item?.url ?? '')
        .trim()
        .toLowerCase();
      if (targetUrl) {
        const list = urlByKeyword.get(kw) ?? [];
        list.push({ targetUrl, output: out, nodeKey });
        urlByKeyword.set(kw, list);
      }
    }

    // Strategy brief explicit target keyword / url / market
    if (typeof payload.primaryKeyword === 'string' && payload.primaryKeyword.trim()) {
      const kw = payload.primaryKeyword.trim().toLowerCase();
      if (typeof payload.intent === 'string' && payload.intent.trim()) {
        const list = intentByKeyword.get(kw) ?? [];
        list.push({ intent: payload.intent.trim().toLowerCase(), output: out, nodeKey });
        intentByKeyword.set(kw, list);
      }
      if (typeof payload.targetUrl === 'string' && payload.targetUrl.trim()) {
        const list = urlByKeyword.get(kw) ?? [];
        list.push({ targetUrl: payload.targetUrl.trim().toLowerCase(), output: out, nodeKey });
        urlByKeyword.set(kw, list);
      }
    }

    // 2. Geographic targeting conflict: proposed target market not in approved target markets
    const proposedMarkets = Array.isArray(payload.proposedTargetMarkets)
      ? (payload.proposedTargetMarkets as string[])
      : typeof payload.targetMarket === 'string' && payload.targetMarket.trim()
        ? [payload.targetMarket.trim()]
        : [];
    if (approvedMarketNames.size > 0 && proposedMarkets.length > 0) {
      for (const proposed of proposedMarkets) {
        const norm = proposed.trim().toLowerCase();
        if (
          norm &&
          norm !== 'global' &&
          !Array.from(approvedMarketNames).some(
            (approved) => approved.includes(norm) || norm.includes(approved),
          )
        ) {
          pushUnique(`geo:${out.id}:${norm}`, {
            conflictType: 'geographic_targeting',
            severity: 'high',
            title: `Unapproved geographic target "${proposed}"`,
            summary: `${out.agentId} targeted "${proposed}", which is outside the project's approved target markets (${Array.from(approvedMarketNames).slice(0, 4).join(', ')}).`,
            agentAId: approvedMarketsCtx?.sourceAgentId ?? 'geographic_intelligence_agent',
            agentBId: out.agentId,
            outputARef: approvedMarketsCtx ? `context:${approvedMarketsCtx.id}` : 'approved_markets',
            outputBRef: `output:${out.id}`,
            outputASnapshot: { approvedMarkets: Array.from(approvedMarketNames) },
            outputBSnapshot: { proposedMarket: proposed, summary: out.summary },
            affectedNodeKeys: [nodeKey],
            requiresHumanReview: true,
            recommendedVerifierAgentId: 'geographic_intelligence_agent',
          });
        }
      }
    }

    // 5. Unsupported claims check via QA evidence validator
    const validation = validateEvidenceTrustForOutput(out);
    if (validation.unsupportedClaims.length > 0) {
      pushUnique(`unsupported:${out.id}`, {
        conflictType: 'unsupported_claim',
        severity: validation.status === 'rejected' ? 'high' : 'medium',
        title: `Unsupported claim detected in ${out.agentId} output`,
        summary: validation.unsupportedClaims.join(' | '),
        agentAId: out.agentId,
        agentBId: 'quality_assurance_agent',
        outputARef: `output:${out.id}`,
        outputBRef: `qa_evidence_audit:${out.taskId}`,
        outputASnapshot: { summary: out.summary, evidenceRefs: out.evidenceRefs },
        outputBSnapshot: { unsupportedClaims: validation.unsupportedClaims },
        affectedNodeKeys: [nodeKey],
        requiresHumanReview: validation.status === 'rejected',
        recommendedVerifierAgentId: 'research_agent',
      });
    }
  }

  // 1b. Keyword intent conflicts across two distinct agents
  for (const [kw, entries] of intentByKeyword.entries()) {
    const first = entries[0];
    const disagree = entries.find(
      (e) => e.output.agentId !== first.output.agentId && e.intent !== first.intent,
    );
    if (disagree) {
      pushUnique(`intent:${kw}`, {
        conflictType: 'keyword_intent',
        severity: 'medium',
        title: `Conflicting search intent for "${kw}"`,
        summary: `${first.output.agentId} classified "${kw}" as "${first.intent}", whereas ${disagree.output.agentId} classified it as "${disagree.intent}".`,
        agentAId: first.output.agentId,
        agentBId: disagree.output.agentId,
        outputARef: `output:${first.output.id}`,
        outputBRef: `output:${disagree.output.id}`,
        outputASnapshot: { keyword: kw, intent: first.intent, summary: first.output.summary },
        outputBSnapshot: { keyword: kw, intent: disagree.intent, summary: disagree.output.summary },
        affectedNodeKeys: Array.from(new Set([first.nodeKey, disagree.nodeKey])),
        requiresHumanReview: true,
        recommendedVerifierAgentId: 'keyword_intelligence_agent',
      });
    }
  }

  // 3. Different URL recommendations for the same target keyword
  for (const [kw, entries] of urlByKeyword.entries()) {
    const first = entries[0];
    const disagree = entries.find(
      (e) => e.output.agentId !== first.output.agentId && e.targetUrl !== first.targetUrl,
    );
    if (disagree) {
      pushUnique(`url:${kw}`, {
        conflictType: 'url_recommendation',
        severity: 'high',
        title: `Conflicting target URL recommendation for "${kw}"`,
        summary: `${first.output.agentId} mapped "${kw}" to ${first.targetUrl}, while ${disagree.output.agentId} recommended ${disagree.targetUrl}.`,
        agentAId: first.output.agentId,
        agentBId: disagree.output.agentId,
        outputARef: `output:${first.output.id}`,
        outputBRef: `output:${disagree.output.id}`,
        outputASnapshot: { keyword: kw, targetUrl: first.targetUrl },
        outputBSnapshot: { keyword: kw, targetUrl: disagree.targetUrl },
        affectedNodeKeys: Array.from(new Set([first.nodeKey, disagree.nodeKey])),
        requiresHumanReview: true,
        recommendedVerifierAgentId: 'technical_seo_agent',
      });
    }
  }

  // 4. Contradictory competitor vs keyword findings (competitor claims gaps exist while keyword intelligence found zero aligned keywords)
  const compOut = params.outputs.find((o) => o.agentId === 'competitor_intelligence_agent');
  const kwOut = params.outputs.find((o) => o.agentId === 'keyword_intelligence_agent');
  if (compOut && kwOut) {
    const compGaps = Number(compOut.payload?.gapCount ?? 0);
    const kwCount = Number(kwOut.payload?.keywordCount ?? kwOut.payload?.totalKeywords ?? -1);
    if (compGaps > 0 && kwCount === 0) {
      pushUnique(`comp_kw_mismatch:${compOut.id}:${kwOut.id}`, {
        conflictType: 'competitor_finding',
        severity: 'medium',
        title: 'Competitor gap topics have no matching approved project keywords',
        summary: `Competitor Intelligence identified ${compGaps} content gap(s), but Keyword Intelligence found 0 tracked/approved keywords in this project to validate search demand.`,
        agentAId: compOut.agentId,
        agentBId: kwOut.agentId,
        outputARef: `output:${compOut.id}`,
        outputBRef: `output:${kwOut.id}`,
        outputASnapshot: { gapCount: compGaps, summary: compOut.summary },
        outputBSnapshot: { keywordCount: kwCount, summary: kwOut.summary },
        affectedNodeKeys: [
          params.nodeKeyByTaskId.get(compOut.taskId) ?? 'competitor_intel',
          params.nodeKeyByTaskId.get(kwOut.taskId) ?? 'keyword_intel',
        ],
        requiresHumanReview: true,
        recommendedVerifierAgentId: 'keyword_intelligence_agent',
      });
    }
  }

  return conflicts;
}

/**
 * Computes per-agent real collaboration statistics from persisted messages and delegations.
 */
export function summarizeCollaborationByAgent(
  messages: AgentMessageRecord[],
  delegations: AgentDelegationRecord[],
) {
  const byAgent: Record<
    string,
    {
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
  > = {};

  const ensure = (agentId: AgentId) => {
    if (!byAgent[agentId]) {
      byAgent[agentId] = {
        agentId,
        messagesSent: 0,
        messagesReceived: 0,
        delegatedTasksCreated: 0,
        delegatedTasksReceived: 0,
        failedCommunications: 0,
        pendingResponses: 0,
        activeCollaborationPeerIds: [],
        currentCollaborationSummary: null,
      };
    }
    return byAgent[agentId];
  };

  for (const id of ['orchestrator', ...AGENT_STATION_IDS] as AgentId[]) {
    ensure(id);
  }

  const repliedIds = new Set<string>(
    messages.map((m) => m.replyToMessageId).filter((v): v is string => Boolean(v)),
  );
  const requestTypes = new Set<AgentMessageType>([
    'research_request',
    'verification_request',
    'clarification_question',
    'delegation_request',
  ]);

  const peerSets = new Map<AgentId, Set<AgentId>>();
  const addPeer = (a: AgentId, b: AgentId) => {
    const s = peerSets.get(a) ?? new Set<AgentId>();
    s.add(b);
    peerSets.set(a, s);
  };

  for (const msg of messages) {
    const src = ensure(msg.sourceAgentId);
    const dst = ensure(msg.destinationAgentId);
    src.messagesSent += 1;
    dst.messagesReceived += 1;
    addPeer(msg.sourceAgentId, msg.destinationAgentId);
    addPeer(msg.destinationAgentId, msg.sourceAgentId);

    if (msg.status === 'failed' || msg.status === 'rejected') {
      src.failedCommunications += 1;
    }
    if (
      requestTypes.has(msg.messageType) &&
      msg.status !== 'failed' &&
      msg.status !== 'rejected' &&
      !repliedIds.has(msg.messageId)
    ) {
      src.pendingResponses += 1;
    }
    if (!src.currentCollaborationSummary) {
      src.currentCollaborationSummary = `${msg.messageType.replace(/_/g, ' ')} -> ${msg.destinationAgentId}`;
    }
    if (!dst.currentCollaborationSummary) {
      dst.currentCollaborationSummary = `Received ${msg.messageType.replace(/_/g, ' ')} from ${msg.sourceAgentId}`;
    }
  }

  for (const del of delegations) {
    const src = ensure(del.sourceAgentId);
    const dst = ensure(del.targetAgentId);
    src.delegatedTasksCreated += 1;
    dst.delegatedTasksReceived += 1;
    addPeer(del.sourceAgentId, del.targetAgentId);
    addPeer(del.targetAgentId, del.sourceAgentId);
  }

  for (const [agentId, peers] of peerSets.entries()) {
    ensure(agentId).activeCollaborationPeerIds = Array.from(peers);
  }

  return byAgent;
}
