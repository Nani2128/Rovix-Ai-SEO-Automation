import { apiFetch } from './apiClient';
import type {
  GeoMarketPriority,
  GeoProviderStatus,
  GeoResearchRun,
  GeoTargetMarket,
  GeoUrlMappingRecord,
  GeoWorkspaceResponse,
} from '../types/geographic';
import type { KeywordIntent } from '../types/keywords';

export const geoService = {
  getWorkspace(projectId: string): Promise<GeoWorkspaceResponse> {
    return apiFetch<GeoWorkspaceResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/geographic/workspace`,
    );
  },

  upsertTargetMarket(
    projectId: string,
    payload: {
      marketId?: string;
      countryCode: string;
      stateRegion?: string;
      city?: string;
      language?: string;
      serviceAreas?: string[];
      priority?: GeoMarketPriority;
      approve?: boolean;
      reason?: string;
    },
  ): Promise<{ market: GeoTargetMarket }> {
    return apiFetch<{ market: GeoTargetMarket }>(
      `/api/projects/${encodeURIComponent(projectId)}/geographic/markets`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  decideTargetMarket(
    marketId: string,
    payload: {
      action: 'approve' | 'reject';
      priority?: GeoMarketPriority;
      reason?: string;
    },
  ): Promise<{ market: GeoTargetMarket }> {
    return apiFetch<{ market: GeoTargetMarket }>(
      `/api/geographic/markets/${encodeURIComponent(marketId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  deleteTargetMarket(marketId: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(
      `/api/geographic/markets/${encodeURIComponent(marketId)}`,
      { method: 'DELETE' },
    );
  },

  syncGscCountries(
    projectId: string,
    days = 30,
  ): Promise<{ status: GeoProviderStatus; syncedCountries: number }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/geographic/sync-gsc`,
      {
        method: 'POST',
        body: JSON.stringify({ days }),
      },
    );
  },

  runDiscovery(
    projectId: string,
    payload: {
      countryCode: string;
      stateRegion?: string;
      city?: string;
      language?: string;
      seedTerms?: string[];
      intentFocus?: KeywordIntent | 'all';
      includeAutocomplete?: boolean;
      includeTrends?: boolean;
      includeAiExpansion?: boolean;
    },
  ): Promise<{
    run: GeoResearchRun;
    keywordsDiscovered: number;
    measurementsCollected: number;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/geographic/discover`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateUrlMapping(
    mappingId: string,
    payload: {
      targetUrl?: string | null;
      recommendedSlug?: string | null;
      approveNewPage?: boolean;
    },
  ): Promise<{ mapping: GeoUrlMappingRecord }> {
    return apiFetch<{ mapping: GeoUrlMappingRecord }>(
      `/api/geographic/mappings/${encodeURIComponent(mappingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  getExportUrl(projectId: string, format: 'json' | 'csv'): string {
    return `/api/projects/${encodeURIComponent(projectId)}/geographic/export?format=${format}`;
  },
};
