import { apiFetch } from './apiClient';
import type {
  AgentConfigRecord,
  AgentDelegationRecord,
  AgentFactoryEvent,
  AgentFactorySnapshot,
  AgentId,
  AgentMessageRecord,
  AgentMessageType,
  AgentOrchestrationOverview,
  AgentStationId,
  AgentWorkflowDetail,
  ApprovalDecisionStatus,
  CollaborationMonitorPayload,
  DagValidationResult,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
  WorkflowApprovalRequest,
  WorkflowConflictRecord,
  WorkflowTemplateId,
} from '../types/agentFactory';

export type AgentFactoryConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected';

export interface AgentFactoryStreamCallbacks {
  onStatusChange: (status: AgentFactoryConnectionStatus) => void;
  onSnapshot: (snapshot: AgentFactorySnapshot) => void;
  onEvent: (event: AgentFactoryEvent) => void;
}

export interface ValidateWorkflowDagPayload {
  templateId?: WorkflowTemplateId;
  nodes?: DagWorkflowNodeInput[];
  edges?: DagWorkflowEdgeInput[];
  blueprintOptions?: {
    requireStrategyApproval?: boolean;
    requireDraftApproval?: boolean;
  };
}

export interface CreateWorkflowPayload extends ValidateWorkflowDagPayload {
  templateId: WorkflowTemplateId;
  name?: string;
  objective?: string;
  config?: Record<string, unknown>;
  autoStart?: boolean;
}

export const agentFactoryService = {
  getSnapshot(projectId: string): Promise<AgentFactorySnapshot> {
    return apiFetch<AgentFactorySnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/snapshot`,
    );
  },

  getOrchestrationOverview(
    projectId: string,
  ): Promise<AgentOrchestrationOverview> {
    return apiFetch<AgentOrchestrationOverview>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/overview`,
    );
  },

  validateWorkflowDag(
    projectId: string,
    payload: ValidateWorkflowDagPayload,
  ): Promise<DagValidationResult> {
    return apiFetch<DagValidationResult>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/validate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  createWorkflow(
    projectId: string,
    payload: CreateWorkflowPayload,
  ): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getWorkflowDetail(
    projectId: string,
    workflowId: string,
  ): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}`,
    );
  },

  startWorkflow(
    projectId: string,
    workflowId: string,
  ): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/start`,
      { method: 'POST' },
    );
  },

  cancelWorkflow(
    projectId: string,
    workflowId: string,
    reason?: string,
  ): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
  },

  retryTask(projectId: string, taskId: string): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/tasks/${encodeURIComponent(taskId)}/retry`,
      { method: 'POST' },
    );
  },

  decideApproval(
    projectId: string,
    approvalId: string,
    payload: {
      decision: Exclude<ApprovalDecisionStatus, 'pending'>;
      comments?: string;
    },
  ): Promise<{ approval: WorkflowApprovalRequest; workflow: AgentWorkflowDetail }> {
    return apiFetch<{
      approval: WorkflowApprovalRequest;
      workflow: AgentWorkflowDetail;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/approvals/${encodeURIComponent(approvalId)}/decide`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateAgentConfig(
    projectId: string,
    agentId: AgentStationId,
    payload: {
      enabled?: boolean;
      maxRetries?: number;
      timeoutMs?: number;
      preferredModel?: string;
    },
  ): Promise<AgentConfigRecord> {
    return apiFetch<AgentConfigRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/configs/${encodeURIComponent(agentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  getCollaborationMonitor(
    projectId: string,
    query?: {
      workflowId?: string;
      agentId?: string;
      messageType?: string;
      status?: string;
      search?: string;
    },
  ): Promise<CollaborationMonitorPayload> {
    const params = new URLSearchParams();
    if (query?.workflowId) params.set('workflowId', query.workflowId);
    if (query?.agentId) params.set('agentId', query.agentId);
    if (query?.messageType) params.set('messageType', query.messageType);
    if (query?.status) params.set('status', query.status);
    if (query?.search) params.set('search', query.search);
    const qs = params.toString();
    return apiFetch<CollaborationMonitorPayload>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/collaboration${qs ? `?${qs}` : ''}`,
    );
  },

  sendCollaborationMessage(
    projectId: string,
    workflowId: string,
    payload: {
      sourceAgentId: AgentId;
      destinationAgentId: AgentId;
      messageType: AgentMessageType;
      payload: Record<string, unknown>;
      evidenceReferences?: string[];
      correlationId?: string;
      replyToMessageId?: string | null;
      executionId?: string;
    },
  ): Promise<AgentMessageRecord> {
    return apiFetch<AgentMessageRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  requestDelegation(
    projectId: string,
    workflowId: string,
    payload: {
      parentTaskId: string;
      sourceAgentId: AgentId;
      targetAgentId: AgentStationId;
      reason: string;
      requestedObjective: string;
      evidenceReferences?: string[];
      payload?: Record<string, unknown>;
    },
  ): Promise<{ delegation: AgentDelegationRecord; message: AgentMessageRecord }> {
    return apiFetch<{
      delegation: AgentDelegationRecord;
      message: AgentMessageRecord;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/delegate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  resolveConflict(
    projectId: string,
    conflictId: string,
    payload: {
      selectedResolution: 'keep_a' | 'keep_b' | 'custom';
      resolutionNote: string;
      dismiss?: boolean;
    },
  ): Promise<WorkflowConflictRecord> {
    return apiFetch<WorkflowConflictRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  validateWorkflowGraph(
    projectId: string,
    workflowId: string,
    nodes?: Array<{
      id: string;
      prerequisites?: string[];
      dependencies?: string[];
      dependsOn?: string[];
    }>,
  ): Promise<{
    valid: boolean;
    errors: string[];
    unreachableNodeIds: string[];
    missingPrerequisites: Array<{ nodeId: string; missingPrerequisiteId: string }>;
    cyclePath: string[];
    topologicalOrder: string[];
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/validate-graph`,
      {
        method: 'POST',
        body: JSON.stringify(nodes ? { nodes } : {}),
      },
    );
  },

  subscribeToStream(
    projectId: string,
    callbacks: AgentFactoryStreamCallbacks,
  ): () => void {
    if (
      typeof window === 'undefined' ||
      typeof EventSource === 'undefined'
    ) {
      callbacks.onStatusChange('disconnected');
      return () => {};
    }

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let staleTimer: number | null = null;
    let attempt = 0;
    let lastEventId = '';
    let lastActivityAt = Date.now();

    const clearTimers = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (staleTimer !== null) {
        window.clearInterval(staleTimer);
        staleTimer = null;
      }
    };

    const closeSource = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      clearTimers();
      closeSource();
      callbacks.onStatusChange('disconnected');
      const backoffMs = Math.min(15_000, 1_500 * Math.pow(1.6, attempt));
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        if (!closed) connect();
      }, backoffMs);
    };

    const connect = () => {
      if (closed) return;
      clearTimers();
      closeSource();
      callbacks.onStatusChange('connecting');

      const qs = lastEventId
        ? `?lastEventId=${encodeURIComponent(lastEventId)}`
        : '';
      const url = `/api/projects/${encodeURIComponent(projectId)}/agent-factory/stream${qs}`;
      const es = new EventSource(url, { withCredentials: true });
      source = es;
      lastActivityAt = Date.now();

      es.onopen = () => {
        if (closed) return;
        attempt = 0;
        lastActivityAt = Date.now();
        callbacks.onStatusChange('connected');
      };

      const onSnapshotFrame = (msg: MessageEvent<string>) => {
        if (closed) return;
        lastActivityAt = Date.now();
        try {
          const parsed = JSON.parse(msg.data) as AgentFactorySnapshot;
          if (parsed && Array.isArray(parsed.nodes)) {
            callbacks.onSnapshot(parsed);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      const onAgentEventFrame = (msg: MessageEvent<string>) => {
        if (closed) return;
        lastActivityAt = Date.now();
        if (msg.lastEventId) {
          lastEventId = msg.lastEventId;
        }
        try {
          const parsed = JSON.parse(msg.data) as AgentFactoryEvent;
          if (parsed && parsed.id) {
            lastEventId = parsed.id;
            callbacks.onEvent(parsed);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      es.addEventListener('agent_snapshot', onSnapshotFrame as EventListener);
      es.addEventListener('agent_event', onAgentEventFrame as EventListener);
      es.onerror = () => {
        if (closed) return;
        // Handle closed or repeated error transitions gracefully
        if (es.readyState === EventSource.CLOSED) {
          scheduleReconnect();
        } else {
          callbacks.onStatusChange('connecting');
        }
      };

      // Stale connection monitor (reconnects if server is silent beyond 45s)
      staleTimer = window.setInterval(() => {
        if (closed) return;
        if (Date.now() - lastActivityAt > 45_000) {
          scheduleReconnect();
        }
      }, 15_000);
    };

    connect();

    return () => {
      closed = true;
      clearTimers();
      closeSource();
      callbacks.onStatusChange('disconnected');
    };
  },
};
