import { apiFetch } from './apiClient';
import type {
  CompetitorCategory,
  CompetitorProfileRecord,
  CompetitorResearchRun,
  CompetitorWorkspaceResponse,
  ContentGapRecommendation,
} from '../types/competitors';

export const competitorService = {
  getWorkspace(projectId: string): Promise<CompetitorWorkspaceResponse> {
    return apiFetch<CompetitorWorkspaceResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/competitors/workspace`,
    );
  },

  upsertCompetitor(
    projectId: string,
    payload: {
      domainOrUrl: string;
      name?: string;
      category?: CompetitorCategory;
      targetMarkets?: string[];
      discoveryOrigin?: CompetitorProfileRecord['discoveryOrigin'];
      discoveryEvidence?: string;
      notes?: string;
      approve?: boolean;
    },
  ): Promise<{ competitor: CompetitorProfileRecord }> {
    return apiFetch<{ competitor: CompetitorProfileRecord }>(
      `/api/projects/${encodeURIComponent(projectId)}/competitors`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  decideCompetitor(
    competitorId: string,
    payload: {
      action: 'approve' | 'reject' | 'archive';
      reason?: string;
    },
  ): Promise<{ competitor: CompetitorProfileRecord }> {
    return apiFetch<{ competitor: CompetitorProfileRecord }>(
      `/api/competitors/${encodeURIComponent(competitorId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  deleteCompetitor(competitorId: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(
      `/api/competitors/${encodeURIComponent(competitorId)}`,
      { method: 'DELETE' },
    );
  },

  analyzeCompetitor(
    competitorId: string,
    payload?: {
      urlsToAnalyze?: string[];
      discoverInternalPages?: boolean;
    },
  ): Promise<{
    run: CompetitorResearchRun;
    competitor: CompetitorProfileRecord;
    pagesAnalyzed: number;
    overlapsFound: number;
    gapsIdentified: number;
  }> {
    return apiFetch(
      `/api/competitors/${encodeURIComponent(competitorId)}/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    );
  },

  discoverCompetitors(
    projectId: string,
    payload?: {
      queries?: string[];
      countryCode?: string;
    },
  ): Promise<{
    run: CompetitorResearchRun;
    importedFromProfile: CompetitorProfileRecord[];
    discoveredFromSerp: CompetitorProfileRecord[];
    serpStatusDetail: string;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/competitors/discover`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    );
  },

  decideContentGap(
    gapId: string,
    payload: {
      action: 'recommend' | 'approve' | 'reject' | 'send_to_keywords' | 'create_task';
      notes?: string;
    },
  ): Promise<{ gap: ContentGapRecommendation }> {
    return apiFetch<{ gap: ContentGapRecommendation }>(
      `/api/content-gaps/${encodeURIComponent(gapId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getExportUrl(projectId: string, format: 'json' | 'csv'): string {
    return `/api/projects/${encodeURIComponent(projectId)}/competitors/export?format=${format}`;
  },
};
