import { apiFetch } from './apiClient';
import type {
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordIntelligenceRecord,
  KeywordIntent,
  KeywordResearchRun,
  KeywordUrlMappingRecord,
  KeywordWorkflowState,
  KeywordWorkspaceResponse,
} from '../types/keywords';

export const keywordService = {
  getWorkspace(projectId: string): Promise<KeywordWorkspaceResponse> {
    return apiFetch<KeywordWorkspaceResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/keywords/workspace`,
    );
  },

  saveBusinessProfile(
    projectId: string,
    payload: {
      approvedNiche: string;
      approvedServices: string[];
      targetAudience: string;
      targetCountry: string;
      targetCity: string;
      targetLanguage: string;
      competitorUrls: string[];
      approveProfile: boolean;
    },
  ): Promise<{ businessProfile: KeywordBusinessProfile }> {
    return apiFetch<{ businessProfile: KeywordBusinessProfile }>(
      `/api/projects/${encodeURIComponent(projectId)}/keywords/business-profile`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },

  runDiscovery(
    projectId: string,
    payload: {
      seedTerms: string[];
      targetCountry?: string;
      targetCity?: string;
      targetLanguage?: string;
      intentFocus?: KeywordIntent | 'all';
      competitorUrls?: string[];
      includeAutocomplete?: boolean;
      includeTrends?: boolean;
      includeAiExpansion?: boolean;
    },
  ): Promise<{
    run: KeywordResearchRun;
    discoveredCount: number;
    clustersCount: number;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/keywords/discover`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  addManualKeyword(
    projectId: string,
    payload: {
      keyword: string;
      intent?: KeywordIntent;
      targetCountry?: string;
      targetCity?: string;
      targetLanguage?: string;
      targetUrl?: string;
      notes?: string;
    },
  ): Promise<{ keyword: KeywordIntelligenceRecord }> {
    return apiFetch<{ keyword: KeywordIntelligenceRecord }>(
      `/api/projects/${encodeURIComponent(projectId)}/keywords/manual`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  transitionWorkflow(
    keywordId: string,
    payload: {
      nextState: KeywordWorkflowState;
      assignedTo?: string | null;
      notes?: string;
    },
  ): Promise<{ keyword: KeywordIntelligenceRecord }> {
    return apiFetch<{ keyword: KeywordIntelligenceRecord }>(
      `/api/keywords/${encodeURIComponent(keywordId)}/workflow`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateKeywordDetails(
    keywordId: string,
    payload: {
      intent?: KeywordIntent;
      targetUrl?: string | null;
      mappingStatus?: KeywordUrlMappingRecord['mappingStatus'];
      recommendedSlug?: string | null;
      notes?: string;
    },
  ): Promise<{ keyword: KeywordIntelligenceRecord }> {
    return apiFetch<{ keyword: KeywordIntelligenceRecord }>(
      `/api/keywords/${encodeURIComponent(keywordId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  updateCluster(
    clusterId: string,
    payload: {
      clusterName?: string;
      suggestedLandingUrl?: string | null;
      approvalState?: KeywordCluster['approvalState'];
      notes?: string;
    },
  ): Promise<{ cluster: KeywordCluster }> {
    return apiFetch<{ cluster: KeywordCluster }>(
      `/api/keyword-clusters/${encodeURIComponent(clusterId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  mergeClusters(
    projectId: string,
    payload: {
      clusterIds: string[];
      mergedName?: string;
    },
  ): Promise<{ cluster: KeywordCluster }> {
    return apiFetch<{ cluster: KeywordCluster }>(
      `/api/projects/${encodeURIComponent(projectId)}/keyword-clusters/merge`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getExportUrl(projectId: string, format: 'json' | 'csv'): string {
    return `/api/projects/${encodeURIComponent(projectId)}/keywords/export?format=${format}`;
  },
};
