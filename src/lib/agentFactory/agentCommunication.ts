import type {
  AgentId,
  AgentMessageRecord,
  AgentMessageStatus,
  AgentMessageType,
  AgentStationId,
} from '../../types/agentFactory';

export type {
  AgentId,
  AgentMessageRecord,
  AgentMessageStatus,
  AgentMessageType,
  AgentStationId,
};

/**
 * Canonical list of structured Agent-to-Agent message types supported by
 * the Rovix AI Multi-Agent Collaboration & Communication Engine (Stages 3–4).
 */
export const AGENT_MESSAGE_TYPES: readonly AgentMessageType[] = [
  'research_request',
  'verification_request',
  'evidence_share',
  'clarification_question',
  'findings_response',
  'delegation_request',
  'conflict_report',
  'rejection_notice',
] as const;

/**
 * Delivery and lifecycle states persisted in `agent_messages.status`.
 */
export const AGENT_MESSAGE_STATUSES: readonly AgentMessageStatus[] = [
  'sent',
  'delivered',
  'acknowledged',
  'failed',
  'rejected',
] as const;

/**
 * Structured evidence reference linked to an inter-agent message.
 * Keeps external URLs and internal artifact IDs traceable for QA validation.
 */
export interface AgentMessageEvidenceReference {
  ref: string;
  kind: 'url' | 'output_id' | 'crawl_id' | 'context_item' | 'approval_id' | 'other';
  verified?: boolean;
  source?: string;
}

/**
 * Correlation metadata linking multi-hop requests, delegations, and replies
 * across a single workflow execution chain.
 */
export interface AgentMessageCorrelation {
  correlationId: string;
  replyToMessageId: string | null;
  workflowId: string;
  executionId: string;
  taskId?: string | null;
}

/**
 * Typed payload contracts per AgentMessageType so senders and receivers can
 * exchange strongly typed, schema-aligned structured bodies without raw prose.
 */
export interface AgentMessageTypedPayloadMap {
  research_request: {
    topic: string;
    objective: string;
    targetMarkets?: string[];
    priority?: 'low' | 'medium' | 'high';
    summary?: string;
  };
  verification_request: {
    claim: string;
    targetUrl?: string;
    expectedMetric?: string;
    summary?: string;
  };
  evidence_share: {
    summary: string;
    artifactType?: string;
    metrics?: Record<string, number | string | boolean | null>;
    knownUrlsCount?: number;
    approvedMarkets?: string[];
  };
  clarification_question: {
    question: string;
    fieldRef?: string;
    blocking?: boolean;
    summary?: string;
  };
  findings_response: {
    summary: string;
    verified?: boolean;
    findingsCount?: number;
    data?: Record<string, unknown>;
  };
  delegation_request: {
    targetAgentId: AgentStationId;
    reason: string;
    requestedObjective: string;
    delegationDepth?: number;
    summary?: string;
  };
  conflict_report: {
    conflictType: string;
    summary: string;
    agentAId?: AgentId;
    agentBId?: AgentId;
    outputARef?: string;
    outputBRef?: string;
  };
  rejection_notice: {
    reason: string;
    rejectedField?: string;
    unsupportedClaims?: string[];
    summary?: string;
  };
}

/**
 * Complete typed Agent-to-Agent message envelope aligned with `agent_messages`
 * in `src/db/agentWorkflowSchema.ts` and `AgentMessageRecord` in `src/types/agentFactory.ts`.
 */
export interface AgentMessageEnvelope<
  TType extends AgentMessageType = AgentMessageType,
> extends Omit<AgentMessageRecord, 'messageType' | 'payload'> {
  messageType: TType;
  payload: Partial<AgentMessageTypedPayloadMap[TType]> & Record<string, unknown>;
}

/**
 * Input contract for dispatching a new structured Agent-to-Agent message.
 */
export interface CreateAgentMessageInput<
  TType extends AgentMessageType = AgentMessageType,
> {
  tenantId: string;
  projectId: string;
  workflowId: string;
  executionId: string;
  sourceAgentId: AgentId;
  destinationAgentId: AgentId;
  messageType: TType;
  payload: Partial<AgentMessageTypedPayloadMap[TType]> & Record<string, unknown>;
  evidenceReferences?: string[];
  correlationId?: string;
  replyToMessageId?: string | null;
  taskId?: string | null;
}

/**
 * Delivery receipt returned after persistence and status transition tracking.
 */
export interface AgentMessageDeliveryReceipt {
  messageId: string;
  correlationId: string;
  status: AgentMessageStatus;
  deliveredAt: string;
  errorSummary: string | null;
}

/**
 * Query filter contract for inspecting persisted agent communications.
 */
export interface AgentCommunicationQueryFilter {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  sourceAgentId?: AgentId | null;
  destinationAgentId?: AgentId | null;
  messageType?: AgentMessageType | null;
  status?: AgentMessageStatus | null;
  correlationId?: string | null;
  limit?: number;
}

/**
 * Thread grouping messages that share the same correlationId.
 */
export interface AgentCommunicationThread {
  correlationId: string;
  workflowId: string;
  rootMessageId: string;
  participants: AgentId[];
  messageCount: number;
  latestStatus: AgentMessageStatus;
  latestTimestamp: string;
  messages: AgentMessageRecord[];
}

export function isTerminalMessageStatus(status: AgentMessageStatus): boolean {
  return status === 'acknowledged' || status === 'failed' || status === 'rejected';
}

export function isValidAgentMessageType(value: string): value is AgentMessageType {
  return (AGENT_MESSAGE_TYPES as readonly string[]).includes(value);
}

export function isValidAgentMessageStatus(value: string): value is AgentMessageStatus {
  return (AGENT_MESSAGE_STATUSES as readonly string[]).includes(value);
}

export function createCorrelationId(prefix = 'corr'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'corr';
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${cleanPrefix}-${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `${cleanPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function classifyEvidenceReference(ref: string): AgentMessageEvidenceReference {
  const trimmed = String(ref ?? '').trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { ref: trimmed, kind: 'url' };
  }
  if (trimmed.startsWith('aout-')) {
    return { ref: trimmed, kind: 'output_id' };
  }
  if (trimmed.startsWith('crawl-')) {
    return { ref: trimmed, kind: 'crawl_id' };
  }
  if (trimmed.startsWith('wctx-')) {
    return { ref: trimmed, kind: 'context_item' };
  }
  if (trimmed.startsWith('aappr-')) {
    return { ref: trimmed, kind: 'approval_id' };
  }
  return { ref: trimmed, kind: 'other' };
}

export function groupMessagesIntoThreads(
  messages: AgentMessageRecord[],
): AgentCommunicationThread[] {
  const byCorr = new Map<string, AgentMessageRecord[]>();
  for (const msg of messages) {
    const key = msg.correlationId || msg.messageId;
    const list = byCorr.get(key) ?? [];
    list.push(msg);
    byCorr.set(key, list);
  }

  const threads: AgentCommunicationThread[] = [];
  for (const [correlationId, list] of byCorr.entries()) {
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const participants = Array.from(
      new Set(sorted.flatMap((m) => [m.sourceAgentId, m.destinationAgentId])),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    threads.push({
      correlationId,
      workflowId: first.workflowId,
      rootMessageId: first.messageId,
      participants,
      messageCount: sorted.length,
      latestStatus: last.status,
      latestTimestamp: last.timestamp,
      messages: sorted,
    });
  }

  return threads.sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
}
