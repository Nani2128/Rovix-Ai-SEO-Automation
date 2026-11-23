import type { KeywordIntent } from '../types/dashboard';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  SeoRoadmapItemRecord,
  SeoStrategyVersionRecord,
  SiteArchitecturePageRecord,
  StrategyApprovalRecord,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../types/strategy';

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

export interface CreateArchitecturePagePayload {
  strategyVersionId: string;
  parentPageId: string | null;
  title: string;
  slug: string;
  pageType: ArchitecturePageType;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  relatedKeywords?: string[];
  searchIntent?: KeywordIntent;
  clusterId?: string | null;
  clusterName?: string | null;
  targetGeography?: string | null;
  existingUrl?: string | null;
  pageStatus?: ArchitecturePageStatus;
  rationale?: string;
  notes?: string;
}

export interface UpdateArchitecturePagePayload {
  title?: string;
  slug?: string;
  pageType?: ArchitecturePageType;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  relatedKeywords?: string[];
  searchIntent?: KeywordIntent;
  clusterId?: string | null;
  clusterName?: string | null;
  targetGeography?: string | null;
  existingUrl?: string | null;
  pageStatus?: ArchitecturePageStatus;
  rationale?: string;
  notes?: string;
}

export const strategyService = {
  async getWorkspace(
    projectId: string,
    versionId?: string | null,
  ): Promise<StrategyWorkspacePayload> {
    const query = versionId
      ? `?versionId=${encodeURIComponent(versionId)}`
      : '';
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy${query}`,
      { credentials: 'include' },
    );
    return parseJsonOrThrow<StrategyWorkspacePayload>(res);
  },

  async generateStrategy(
    projectId: string,
    payload?: { title?: string; sourceWorkflowId?: string | null },
  ): Promise<{
    version: SeoStrategyVersionRecord;
    workspace: StrategyWorkspacePayload;
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/generate`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      },
    );
    return parseJsonOrThrow<{
      version: SeoStrategyVersionRecord;
      workspace: StrategyWorkspacePayload;
    }>(res);
  },

  async createPage(
    projectId: string,
    payload: CreateArchitecturePagePayload,
  ): Promise<{ page: SiteArchitecturePageRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/pages`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ page: SiteArchitecturePageRecord }>(res);
  },

  async updatePage(
    projectId: string,
    pageId: string,
    payload: UpdateArchitecturePagePayload,
  ): Promise<{ page: SiteArchitecturePageRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/pages/${encodeURIComponent(pageId)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ page: SiteArchitecturePageRecord }>(res);
  },

  async movePage(
    projectId: string,
    pageId: string,
    payload: { newParentPageId: string | null; newSortOrder?: number },
  ): Promise<{ page: SiteArchitecturePageRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/pages/${encodeURIComponent(pageId)}/move`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ page: SiteArchitecturePageRecord }>(res);
  },

  async archivePage(
    projectId: string,
    pageId: string,
    reason?: string,
  ): Promise<{ page: SiteArchitecturePageRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/pages/${encodeURIComponent(pageId)}/archive`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
    );
    return parseJsonOrThrow<{ page: SiteArchitecturePageRecord }>(res);
  },

  async decideApproval(
    projectId: string,
    payload: {
      entityKind: StrategyEntityKind;
      entityId: string;
      decision: StrategyApprovalStatus;
      comment?: string;
    },
  ): Promise<{ approval: StrategyApprovalRecord }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/approvals`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{ approval: StrategyApprovalRecord }>(res);
  },

  async createTaskFromRoadmapItem(
    projectId: string,
    itemId: string,
    assignedUser?: string | null,
  ): Promise<{
    ticket: { id: string; title: string; status: string };
    roadmapItem: SeoRoadmapItemRecord;
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/roadmap/${encodeURIComponent(itemId)}/create-task`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUser: assignedUser ?? null }),
      },
    );
    return parseJsonOrThrow<{
      ticket: { id: string; title: string; status: string };
      roadmapItem: SeoRoadmapItemRecord;
    }>(res);
  },

  async launchWorkflow(
    projectId: string,
    payload: {
      roadmapItemId?: string | null;
      strategyVersionId?: string | null;
      objective?: string;
    },
  ): Promise<{
    workflow: { id: string; name: string; status: string };
    roadmapItem: SeoRoadmapItemRecord | null;
  }> {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/strategy/workflows/launch`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow<{
      workflow: { id: string; name: string; status: string };
      roadmapItem: SeoRoadmapItemRecord | null;
    }>(res);
  },
};
