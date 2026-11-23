import type {
  ApprovalStatus,
  DateRangePreset,
  GlobalSearchResponse,
  KeywordIntent,
  KeywordOpportunity,
  OpportunityTier,
  Project,
  RecentActivityFeedResponse,
  SEOOverview,
} from '../types/dashboard';
import { apiFetch } from './apiClient';

export const dashboardService = {
  fetchOverview(params: {
    projectId: string;
    range: DateRangePreset;
    customStart?: string;
    customEnd?: string;
    signal?: AbortSignal;
  }): Promise<SEOOverview> {
    const query = new URLSearchParams({
      projectId: params.projectId,
      range: params.range,
    });
    if (params.customStart) query.set('start', params.customStart);
    if (params.customEnd) query.set('end', params.customEnd);

    return apiFetch<SEOOverview>(
      `/api/dashboard/overview?${query.toString()}`,
      {
        method: 'GET',
        signal: params.signal,
      },
    );
  },

  fetchProjects(signal?: AbortSignal): Promise<{
    projects: Project[];
    isDevSampleData: boolean;
    sandboxFixturesEnabled?: boolean;
  }> {
    return apiFetch<{
      projects: Project[];
      isDevSampleData: boolean;
      sandboxFixturesEnabled?: boolean;
    }>('/api/projects', {
      method: 'GET',
      signal,
    });
  },

  createProject(payload: {
    name: string;
    website: string;
    targetMarkets: string[];
  }): Promise<{ project: Project }> {
    return apiFetch<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteProject(projectId: string): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: 'DELETE' },
    );
  },

  registerSandboxProject(): Promise<{ project: Project }> {
    return apiFetch<{ project: Project }>('/api/projects/sandbox', {
      method: 'POST',
    });
  },

  fetchKeywords(projectId: string): Promise<{ keywords: KeywordOpportunity[] }> {
    return apiFetch<{ keywords: KeywordOpportunity[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/keywords`,
      { method: 'GET' },
    );
  },

  createKeyword(
    projectId: string,
    payload: {
      keyword: string;
      intent: KeywordIntent;
      targetMarket: string;
      targetUrl: string;
      opportunity: OpportunityTier;
      rationale: string;
    },
  ): Promise<{ keyword: KeywordOpportunity }> {
    return apiFetch<{ keyword: KeywordOpportunity }>(
      `/api/projects/${encodeURIComponent(projectId)}/keywords`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateKeywordApproval(
    keywordId: string,
    status: ApprovalStatus,
  ): Promise<{ ok: boolean; keyword: KeywordOpportunity }> {
    return apiFetch<{ ok: boolean; keyword: KeywordOpportunity }>(
      `/api/keywords/${encodeURIComponent(keywordId)}/approval`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
    );
  },

  fetchRecentActivity(params?: {
    projectId?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<RecentActivityFeedResponse> {
    const query = new URLSearchParams();
    if (params?.projectId) query.set('projectId', params.projectId);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiFetch<RecentActivityFeedResponse>(
      `/api/activity/recent${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
        signal: params?.signal,
      },
    );
  },

  globalSearch(params: {
    query: string;
    projectId?: string;
    signal?: AbortSignal;
  }): Promise<GlobalSearchResponse> {
    const query = new URLSearchParams();
    if (params.query.trim()) query.set('q', params.query.trim());
    if (params.projectId) query.set('projectId', params.projectId);
    const qs = query.toString();
    return apiFetch<GlobalSearchResponse>(
      `/api/search/global${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
        signal: params.signal,
      },
    );
  },
};
