import type { AgentStationId, WorkflowTemplateId } from '../types/agentFactory';
import type {
  AutomationTriggerType,
  AutonomyMode,
  AutonomyPolicyRecord,
  OperationsControlCenterPayload,
  RuntimeHealthSummary,
  ScheduleCatchUpPolicy,
  ScheduleExecutionWindow,
  ScheduleFrequency,
  ScheduleTargetKind,
  WorkflowDeadLetterTaskRecord,
  WorkflowScheduleRecord,
  WorkflowTriggerEventRecord,
  WorkflowTriggerSubscriptionRecord,
} from '../types/autonomousOperations';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed with HTTP ${res.status}`,
    );
  }
  return payload as T;
}

export interface CreateSchedulePayload {
  name: string;
  description?: string;
  targetKind: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  workflowObjective?: string;
  frequency: ScheduleFrequency;
  minuteOfHour: number;
  hourOfDay?: number | null;
  daysOfWeek?: number[];
  dayOfMonth?: number | null;
  runAtIso?: string | null;
  timezone: string;
  executionWindow?: ScheduleExecutionWindow | null;
  catchUpPolicy: ScheduleCatchUpPolicy;
  maxCatchUpRuns?: number;
  status?: 'active' | 'paused';
}

export interface CreateTriggerPayload {
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  targetKind: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  workflowObjective?: string;
  enabled?: boolean;
  filterConfig?: Record<string, unknown>;
  rateLimitPerMinute?: number;
}

export interface UpdateAutonomyPolicyPayload {
  name?: string;
  autonomyMode: AutonomyMode;
  maxConcurrentWorkflows: number;
  maxActiveAgentTasks: number;
  maxWorkflowDurationMs: number;
  maxTokensPerWorkflow: number | null;
  maxSpendMicrosPerRun: number | null;
  allowedTemplates: WorkflowTemplateId[];
  allowedAgents: AgentStationId[];
  requireApprovalForHighImpact: boolean;
  highImpactActionTypes?: string[];
  allowAutonomousRetries: boolean;
  allowExternalWebhooks: boolean;
  enabled: boolean;
}

export const operationsService = {
  async getControlCenter(
    projectId: string,
  ): Promise<OperationsControlCenterPayload> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<OperationsControlCenterPayload>(res);
  },

  async getRuntimeHealth(projectId: string): Promise<RuntimeHealthSummary> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/health`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<RuntimeHealthSummary>(res);
  },

  async createSchedule(
    projectId: string,
    payload: CreateSchedulePayload,
  ): Promise<{ schedule: WorkflowScheduleRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/schedules`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ schedule: WorkflowScheduleRecord }>(res);
  },

  async updateSchedule(
    projectId: string,
    scheduleId: string,
    payload: Partial<CreateSchedulePayload>,
  ): Promise<{ schedule: WorkflowScheduleRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/schedules/${encodeURIComponent(scheduleId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ schedule: WorkflowScheduleRecord }>(res);
  },

  async toggleSchedule(
    projectId: string,
    scheduleId: string,
    action: 'pause' | 'resume',
  ): Promise<{ schedule: WorkflowScheduleRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/schedules/${encodeURIComponent(scheduleId)}/${action}`,
      { method: 'POST', credentials: 'include' },
    );
    return parseJsonOrThrow<{ schedule: WorkflowScheduleRecord }>(res);
  },

  async deleteSchedule(projectId: string, scheduleId: string): Promise<void> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/schedules/${encodeURIComponent(scheduleId)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    await parseJsonOrThrow<{ ok: boolean }>(res);
  },

  async createTrigger(
    projectId: string,
    payload: CreateTriggerPayload,
  ): Promise<{
    subscription: WorkflowTriggerSubscriptionRecord;
    webhookSecretPlaintext: string | null;
    webhookEndpointPath: string | null;
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/triggers`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{
      subscription: WorkflowTriggerSubscriptionRecord;
      webhookSecretPlaintext: string | null;
      webhookEndpointPath: string | null;
    }>(res);
  },

  async toggleTrigger(
    projectId: string,
    subscriptionId: string,
    enabled: boolean,
  ): Promise<{ subscription: WorkflowTriggerSubscriptionRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/triggers/${encodeURIComponent(subscriptionId)}/toggle`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      },
    );
    return parseJsonOrThrow<{ subscription: WorkflowTriggerSubscriptionRecord }>(res);
  },

  async deleteTrigger(
    projectId: string,
    subscriptionId: string,
  ): Promise<void> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/triggers/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    await parseJsonOrThrow<{ ok: boolean }>(res);
  },

  async dispatchTestTrigger(
    projectId: string,
    payload: {
      triggerType: Exclude<AutomationTriggerType, 'schedule' | 'external_webhook'>;
      payloadSummary?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<{ events: WorkflowTriggerEventRecord[] }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/triggers/dispatch-test`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ events: WorkflowTriggerEventRecord[] }>(res);
  },

  async pauseWorkflow(
    projectId: string,
    workflowId: string,
    reason?: string,
  ): Promise<unknown> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/workflows/${encodeURIComponent(workflowId)}/pause`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
    );
    return parseJsonOrThrow(res);
  },

  async resumeWorkflow(
    projectId: string,
    workflowId: string,
    reason?: string,
  ): Promise<unknown> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/workflows/${encodeURIComponent(workflowId)}/resume`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
    );
    return parseJsonOrThrow(res);
  },

  async replayWorkflow(
    projectId: string,
    workflowId: string,
    reason?: string,
  ): Promise<unknown> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/workflows/${encodeURIComponent(workflowId)}/replay`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, autoStart: true }),
      },
    );
    return parseJsonOrThrow(res);
  },

  async cancelWorkflow(
    projectId: string,
    workflowId: string,
  ): Promise<unknown> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/workflows/${encodeURIComponent(workflowId)}/cancel`,
      {
        method: 'POST',
        credentials: 'include',
      },
    );
    return parseJsonOrThrow(res);
  },

  async replayDeadLetter(
    projectId: string,
    dlqId: string,
    mode: 'retry_task' | 'replay_workflow',
    reason?: string,
  ): Promise<unknown> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/dead-letters/${encodeURIComponent(dlqId)}/replay`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, reason }),
      },
    );
    return parseJsonOrThrow(res);
  },

  async resolveDeadLetter(
    projectId: string,
    dlqId: string,
    reason?: string,
  ): Promise<{ deadLetter: WorkflowDeadLetterTaskRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/dead-letters/${encodeURIComponent(dlqId)}/resolve`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
    );
    return parseJsonOrThrow<{ deadLetter: WorkflowDeadLetterTaskRecord }>(res);
  },

  async updatePolicy(
    projectId: string,
    payload: UpdateAutonomyPolicyPayload,
  ): Promise<{ policy: AutonomyPolicyRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/policy`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ policy: AutonomyPolicyRecord }>(res);
  },

  async runMaintenanceTick(projectId: string): Promise<{
    tickResult: {
      workerId: string;
      claimedSchedules: number;
      launchedWorkflowIds: string[];
      reclaimedLeasesCount: number;
    };
    recovery: {
      reclaimedLeasesCount: number;
      recoveredWorkflowsCount: number;
    };
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/agent-factory/operations/maintenance/tick`,
      { method: 'POST', credentials: 'include' },
    );
    return parseJsonOrThrow(res);
  },
};
