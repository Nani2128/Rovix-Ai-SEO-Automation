import type { AuditOverviewResponse, CrawlComparisonResponse } from '../types/audit';
import { apiFetch } from './apiClient';

export interface SandboxFixesState {
  fixNoindexPage: boolean;
  fixCanonicalConflict: boolean;
  fixBrokenLink: boolean;
  fixMissingMetaDescription: boolean;
  fixInvalidSchema: boolean;
  fixRedirectChain: boolean;
  simulatePartial500: boolean;
}

export const auditService = {
  fetchAuditOverview(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<AuditOverviewResponse> {
    return apiFetch<AuditOverviewResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/audit-overview`,
      { method: 'GET', signal },
    );
  },

  fetchCrawlComparison(
    projectId: string,
    currentCrawlId?: string,
    previousCrawlId?: string,
  ): Promise<CrawlComparisonResponse> {
    const q = new URLSearchParams();
    if (currentCrawlId) q.set('currentCrawlId', currentCrawlId);
    if (previousCrawlId) q.set('previousCrawlId', previousCrawlId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<CrawlComparisonResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/crawl-comparison${qs}`,
      { method: 'GET' },
    );
  },

  fetchSandboxFixes(): Promise<{ fixes: SandboxFixesState }> {
    return apiFetch<{ fixes: SandboxFixesState }>('/api/sandbox/fixes', {
      method: 'GET',
    });
  },

  updateSandboxFixes(
    payload: Partial<SandboxFixesState> & { reset?: boolean },
  ): Promise<{ fixes: SandboxFixesState }> {
    return apiFetch<{ fixes: SandboxFixesState }>('/api/sandbox/fixes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
