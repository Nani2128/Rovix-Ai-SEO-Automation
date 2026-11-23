import { apiFetch } from './apiClient';
import type { AgentWorkflowDetail } from '../types/agentFactory';
import type {
  StudioNodeExecutionDetail,
  StudioValidationReport,
  StudioWorkflowDetailResponse,
  StudioWorkflowGraph,
  StudioWorkflowListResponse,
  StudioWorkflowRecord,
  StudioWorkflowTemplateRecord,
  StudioWorkflowVersionRecord,
} from '../types/workflowStudio';

export const workflowStudioService = {
  listWorkflows(
    projectId: string,
    includeArchived = false,
  ): Promise<StudioWorkflowListResponse> {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return apiFetch<StudioWorkflowListResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows${qs}`,
    );
  },

  createWorkflow(
    projectId: string,
    payload: {
      name: string;
      description?: string;
      graph?: StudioWorkflowGraph;
      templateId?: string | null;
    },
  ): Promise<{
    workflow: StudioWorkflowRecord;
    version: StudioWorkflowVersionRecord;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getWorkflowDetail(
    projectId: string,
    studioWorkflowId: string,
  ): Promise<StudioWorkflowDetailResponse> {
    return apiFetch<StudioWorkflowDetailResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}`,
    );
  },

  saveDraft(
    projectId: string,
    studioWorkflowId: string,
    payload: {
      name?: string;
      description?: string;
      graph: StudioWorkflowGraph;
      createSnapshot?: boolean;
      changeSummary?: string;
    },
  ): Promise<{
    workflow: StudioWorkflowRecord;
    createdVersion: StudioWorkflowVersionRecord | null;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },

  validateGraph(
    projectId: string,
    payload: {
      studioWorkflowId?: string | null;
      graph: StudioWorkflowGraph;
    },
  ): Promise<StudioValidationReport> {
    return apiFetch<StudioValidationReport>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/validate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  publishWorkflow(
    projectId: string,
    studioWorkflowId: string,
    payload: {
      graph?: StudioWorkflowGraph;
      changeSummary?: string;
    },
  ): Promise<{
    workflow: StudioWorkflowRecord;
    version: StudioWorkflowVersionRecord;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}/publish`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  archiveWorkflow(
    projectId: string,
    studioWorkflowId: string,
  ): Promise<StudioWorkflowRecord> {
    return apiFetch<StudioWorkflowRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}/archive`,
      { method: 'POST' },
    );
  },

  duplicateWorkflow(
    projectId: string,
    studioWorkflowId: string,
    name?: string,
  ): Promise<{
    workflow: StudioWorkflowRecord;
    version: StudioWorkflowVersionRecord;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      },
    );
  },

  restoreVersion(
    projectId: string,
    studioWorkflowId: string,
    versionId: string,
  ): Promise<{
    workflow: StudioWorkflowRecord;
    createdVersion: StudioWorkflowVersionRecord | null;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}/versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' },
    );
  },

  executeWorkflow(
    projectId: string,
    studioWorkflowId: string,
    payload: {
      graph?: StudioWorkflowGraph;
      objective?: string;
    },
  ): Promise<{
    version: StudioWorkflowVersionRecord;
    execution: AgentWorkflowDetail;
    validation: StudioValidationReport;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/workflows/${encodeURIComponent(studioWorkflowId)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  cancelExecution(
    projectId: string,
    workflowId: string,
    reason?: string,
  ): Promise<AgentWorkflowDetail> {
    return apiFetch<AgentWorkflowDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/executions/${encodeURIComponent(workflowId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
  },

  getNodeExecutionDetail(
    projectId: string,
    workflowId: string,
    nodeId: string,
  ): Promise<StudioNodeExecutionDetail> {
    return apiFetch<StudioNodeExecutionDetail>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/executions/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(nodeId)}`,
    );
  },

  saveAsTemplate(
    projectId: string,
    payload: {
      name: string;
      category?: string;
      description?: string;
      graph: StudioWorkflowGraph;
    },
  ): Promise<StudioWorkflowTemplateRecord> {
    return apiFetch<StudioWorkflowTemplateRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/workflow-studio/templates`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
};
