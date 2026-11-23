import type {
  AnalyticsWorkspaceData,
  GooglePropertyOption,
  IntegrationProviderId,
  IntegrationsOverviewResponse,
  OAuthIntegrationRecord,
  OperationalHealthResponse,
  PageSpeedCheckResult,
  SyncJobRecord,
} from '../types/integrations';
import type { DeveloperTicket } from '../types/technicalIssue';
import { apiFetch, getAuthHeaders } from './apiClient';

export const integrationsService = {
  fetchOverview(projectId: string): Promise<IntegrationsOverviewResponse> {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return apiFetch<IntegrationsOverviewResponse>(
      `/api/integrations/overview${q}`,
      { method: 'GET' },
    );
  },

  getOAuthUrl(
    provider: 'gsc' | 'ga4',
    projectId: string,
  ): Promise<{ url: string; callbackUrl: string; scopes: string[] }> {
    return apiFetch<{ url: string; callbackUrl: string; scopes: string[] }>(
      `/api/integrations/${encodeURIComponent(provider)}/oauth/url`,
      {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      },
    );
  },

  listProperties(
    provider: 'gsc' | 'ga4',
    projectId: string,
  ): Promise<{ properties: GooglePropertyOption[] }> {
    return apiFetch<{ properties: GooglePropertyOption[] }>(
      `/api/integrations/${encodeURIComponent(provider)}/properties?projectId=${encodeURIComponent(projectId)}`,
      { method: 'GET' },
    );
  },

  selectProperty(
    provider: 'gsc' | 'ga4',
    payload: { projectId: string; propertyId: string; propertyName: string },
  ): Promise<{ integration: OAuthIntegrationRecord }> {
    return apiFetch<{ integration: OAuthIntegrationRecord }>(
      `/api/integrations/${encodeURIComponent(provider)}/property`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  syncProvider(
    provider: 'gsc' | 'ga4',
    payload: { projectId: string; days?: number; awaitCompletion?: boolean },
  ): Promise<{ syncJob: SyncJobRecord }> {
    return apiFetch<{ syncJob: SyncJobRecord }>(
      `/api/integrations/${encodeURIComponent(provider)}/sync`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  disconnectProvider(
    provider: IntegrationProviderId,
    projectId: string,
  ): Promise<{ ok: boolean; removed: boolean }> {
    return apiFetch<{ ok: boolean; removed: boolean }>(
      `/api/integrations/${encodeURIComponent(provider)}?projectId=${encodeURIComponent(projectId)}`,
      { method: 'DELETE' },
    );
  },

  runPageSpeedCheck(payload: {
    url: string;
    strategy: 'mobile' | 'desktop';
  }): Promise<{ result: PageSpeedCheckResult }> {
    return apiFetch<{ result: PageSpeedCheckResult }>(
      '/api/integrations/pagespeed/check',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  fetchAnalytics(projectId: string): Promise<AnalyticsWorkspaceData> {
    return apiFetch<AnalyticsWorkspaceData>(
      `/api/projects/${encodeURIComponent(projectId)}/analytics`,
      { method: 'GET' },
    );
  },

  fetchOperationalHealth(): Promise<OperationalHealthResponse> {
    return apiFetch<OperationalHealthResponse>('/api/monitoring/health', {
      method: 'GET',
    });
  },

  createBackupSnapshot(): Promise<{
    ok: boolean;
    backup: { backupPath: string; sizeBytes: number; createdAt: string };
  }> {
    return apiFetch('/api/monitoring/backup', { method: 'POST' });
  },

  fetchProjectTickets(projectId: string): Promise<{ tickets: DeveloperTicket[] }> {
    return apiFetch<{ tickets: DeveloperTicket[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/tickets`,
      { method: 'GET' },
    );
  },

  async downloadProjectReport(
    projectId: string,
    format: 'json' | 'csv',
  ): Promise<void> {
    const queryFormat = format === 'json' ? 'download' : 'csv';
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/report?format=${queryFormat}`,
      { credentials: 'include', headers: getAuthHeaders() },
    );
    if (!res.ok) {
      throw new Error('Unable to generate project report.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rovix-report-${projectId}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  fetchProjectReportJson(projectId: string): Promise<{
    generatedAt: string;
    project: { id: string; name: string; website: string };
    latestCrawl: {
      id: string;
      status: string;
      processedCount: number;
      errorCount: number;
      completedAt: string | null;
      seoHealthScore: number | null;
    } | null;
    summary: {
      totalIssues: number;
      openIssues: number;
      verifiedFixedIssues: number;
      totalKeywords: number;
      approvedKeywords: number;
      openTickets: number;
    };
    gscConnected: boolean;
    ga4Connected: boolean;
  }> {
    return apiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/report?format=json`,
      { method: 'GET' },
    );
  },
};
