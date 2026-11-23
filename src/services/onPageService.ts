import type { AgentWorkflowDetail } from '../types/agentFactory';
import type {
  CmsConnectionRecord,
  CmsPlatform,
  OnPageAnalysisRunRecord,
  OnPageApprovalRecord,
  OnPageDraftContentPayload,
  OnPageIssueRecord,
  OnPageOptimizationDraftRecord,
  OnPagePageAnalysisRecord,
  OnPageRecommendationRecord,
  OnPageValidationRecord,
  OnPageWorkspacePayload,
} from '../types/onPage';
import type { DeveloperTicket } from '../types/technicalIssue';

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

export const onPageService = {
  async getWorkspace(projectId: string): Promise<OnPageWorkspacePayload> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<OnPageWorkspacePayload>(res);
  },

  async runAnalysis(
    projectId: string,
    payload?: { crawlId?: string | null },
  ): Promise<{
    run: OnPageAnalysisRunRecord;
    pages: OnPagePageAnalysisRecord[];
    issues: OnPageIssueRecord[];
    recommendations: OnPageRecommendationRecord[];
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/analyze`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      },
    );
    return parseJsonOrThrow(res);
  },

  async generateAiRecommendations(
    projectId: string,
    payload: {
      pageAnalysisIds: string[];
      confirmedBulk?: boolean;
      preferredModel?: string | null;
    },
  ): Promise<{
    recommendations: OnPageRecommendationRecord[];
    processedPageIds: string[];
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/recommendations/ai`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  async saveDraft(
    projectId: string,
    payload: {
      pageAnalysisId: string;
      proposed: OnPageDraftContentPayload;
      changeSummary: string;
    },
  ): Promise<{ draft: OnPageOptimizationDraftRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/drafts`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  async decideApproval(
    projectId: string,
    payload: {
      items: {
        entityKind: 'recommendation' | 'draft' | 'issue';
        entityId: string;
      }[];
      decision: 'approved' | 'rejected';
      comment?: string;
    },
  ): Promise<{ approvals: OnPageApprovalRecord[]; updatedCount: number }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/approvals`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  async markAppliedExternally(
    projectId: string,
    draftId: string,
    payload: { channel: string; note?: string },
  ): Promise<{ draft: OnPageOptimizationDraftRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/drafts/${encodeURIComponent(draftId)}/applied-externally`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  async verifyDraftAgainstCrawl(
    projectId: string,
    draftId: string,
    payload?: { crawlId?: string | null },
  ): Promise<{
    validation: OnPageValidationRecord;
    draft: OnPageOptimizationDraftRecord;
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/drafts/${encodeURIComponent(draftId)}/verify`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      },
    );
    return parseJsonOrThrow(res);
  },

  async createTaskFromIssue(
    projectId: string,
    issueId: string,
    assigneeName?: string,
  ): Promise<{ ticket: DeveloperTicket; issue: OnPageIssueRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/issues/${encodeURIComponent(issueId)}/create-task`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeName }),
      },
    );
    return parseJsonOrThrow(res);
  },

  async launchWorkflow(
    projectId: string,
    payload?: { pageAnalysisId?: string | null; objective?: string },
  ): Promise<{ workflow: AgentWorkflowDetail }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/workflows/launch`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      },
    );
    return parseJsonOrThrow(res);
  },

  async configureCms(
    projectId: string,
    platform: CmsPlatform,
    payload: {
      siteUrl: string;
      displayName?: string;
      credentials: Record<string, string>;
    },
  ): Promise<{ connection: CmsConnectionRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/cms/${encodeURIComponent(platform)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  async removeCms(
    projectId: string,
    platform: CmsPlatform,
  ): Promise<{ deleted: boolean }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/on-page/cms/${encodeURIComponent(platform)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    return parseJsonOrThrow(res);
  },

  getExportUrl(
    projectId: string,
    format: 'csv' | 'json',
    pageIds?: string[],
  ): string {
    const params = new URLSearchParams({ format });
    if (pageIds && pageIds.length > 0) {
      params.set('pageIds', pageIds.join(','));
    }
    return `/api/projects/${encodeURIComponent(projectId)}/on-page/export?${params.toString()}`;
  },

  getDraftHandoffUrl(
    projectId: string,
    draftId: string,
    format: 'json' | 'markdown',
    platform: CmsPlatform | 'manual' = 'manual',
  ): string {
    const params = new URLSearchParams({ format, platform });
    return `/api/projects/${encodeURIComponent(projectId)}/on-page/drafts/${encodeURIComponent(draftId)}/handoff?${params.toString()}`;
  },
};
