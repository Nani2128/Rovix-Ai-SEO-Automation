import type {
  PerformanceAuditRun,
  PerformanceDashboardOverview,
  PerformanceRunStrategyMode,
  PerformanceUrlMeasurement,
} from '../types/performance';
import type {
  DeveloperTicket,
  TechnicalIssue,
  VerificationRun,
} from '../types/technicalIssue';
import { apiFetch } from './apiClient';

export const performanceService = {
  fetchOverview(
    projectId: string,
    runId?: string,
  ): Promise<PerformanceDashboardOverview> {
    const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    return apiFetch<PerformanceDashboardOverview>(
      `/api/projects/${encodeURIComponent(projectId)}/performance/overview${q}`,
    );
  },

  startAudit(
    projectId: string,
    payload: {
      targetUrls?: string[];
      strategyMode: PerformanceRunStrategyMode;
      sourceCrawlId?: string | null;
      awaitCompletion?: boolean;
    },
  ): Promise<{ auditRun: PerformanceAuditRun }> {
    return apiFetch<{ auditRun: PerformanceAuditRun }>(
      `/api/projects/${encodeURIComponent(projectId)}/performance/audits`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getAuditStatus(auditId: string): Promise<{ auditRun: PerformanceAuditRun }> {
    return apiFetch<{ auditRun: PerformanceAuditRun }>(
      `/api/performance/audits/${encodeURIComponent(auditId)}`,
    );
  },

  cancelAudit(auditId: string): Promise<{ auditRun: PerformanceAuditRun }> {
    return apiFetch<{ auditRun: PerformanceAuditRun }>(
      `/api/performance/audits/${encodeURIComponent(auditId)}/cancel`,
      { method: 'POST' },
    );
  },

  getMeasurementRawSnapshot(measurementId: string): Promise<{
    measurement: PerformanceUrlMeasurement;
    rawSnapshot: Record<string, unknown> | null;
  }> {
    return apiFetch<{
      measurement: PerformanceUrlMeasurement;
      rawSnapshot: Record<string, unknown> | null;
    }>(
      `/api/performance/measurements/${encodeURIComponent(measurementId)}/raw`,
    );
  },

  bridgeFindingToIssue(
    findingId: string,
    payload: { createTicket?: boolean; assignedUser?: string | null },
  ): Promise<{
    issue: TechnicalIssue;
    ticket: DeveloperTicket | null;
    deduplicated: boolean;
  }> {
    return apiFetch<{
      issue: TechnicalIssue;
      ticket: DeveloperTicket | null;
      deduplicated: boolean;
    }>(`/api/performance/findings/${encodeURIComponent(findingId)}/issue`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  reverifyIssue(issueId: string): Promise<{
    verificationRun: VerificationRun;
    issue: TechnicalIssue;
    auditRun: PerformanceAuditRun;
  }> {
    return apiFetch<{
      verificationRun: VerificationRun;
      issue: TechnicalIssue;
      auditRun: PerformanceAuditRun;
    }>(`/api/performance/issues/${encodeURIComponent(issueId)}/reverify`, {
      method: 'POST',
    });
  },
};
