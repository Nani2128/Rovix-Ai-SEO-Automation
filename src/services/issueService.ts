import type { AuditTrailEntry } from '../types/audit';
import type { CrawlRun } from '../types/crawl';
import type {
  DetectionRuleDefinition,
  DeveloperTaskStatus,
  DeveloperTicket,
  IssueEvidence,
  TechnicalIssue,
  VerificationRun,
} from '../types/technicalIssue';
import { apiFetch } from './apiClient';

export interface IssueDetailsBundle {
  issue: TechnicalIssue;
  rule: DetectionRuleDefinition | null;
  evidence: IssueEvidence[];
  tickets: DeveloperTicket[];
  verificationRuns: VerificationRun[];
  auditTrail: AuditTrailEntry[];
}

export const issueService = {
  fetchProjectIssues(projectId: string): Promise<{ issues: TechnicalIssue[] }> {
    return apiFetch<{ issues: TechnicalIssue[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/issues`,
      { method: 'GET' },
    );
  },

  fetchCrawlIssues(crawlId: string): Promise<{ issues: TechnicalIssue[] }> {
    return apiFetch<{ issues: TechnicalIssue[] }>(
      `/api/crawls/${encodeURIComponent(crawlId)}/issues`,
      { method: 'GET' },
    );
  },

  fetchIssueDetails(issueId: string): Promise<IssueDetailsBundle> {
    return apiFetch<IssueDetailsBundle>(
      `/api/issues/${encodeURIComponent(issueId)}`,
      { method: 'GET' },
    );
  },

  createTicket(
    issueId: string,
    payload: { title?: string; description?: string; assignedUser?: string | null },
  ): Promise<{ ticket: DeveloperTicket }> {
    return apiFetch<{ ticket: DeveloperTicket }>(
      `/api/issues/${encodeURIComponent(issueId)}/tickets`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateTicket(
    ticketId: string,
    payload: {
      action?: 'developer_approve' | 'lead_approve' | 'reject' | 'update_status';
      taskStatus?: DeveloperTaskStatus;
      assignedUser?: string | null;
      reason?: string;
    },
  ): Promise<{ ticket: DeveloperTicket }> {
    return apiFetch<{ ticket: DeveloperTicket }>(
      `/api/tickets/${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  reverifyIssue(issueId: string): Promise<{
    verificationRun: VerificationRun;
    issue: TechnicalIssue;
    crawlRun: CrawlRun;
  }> {
    return apiFetch<{
      verificationRun: VerificationRun;
      issue: TechnicalIssue;
      crawlRun: CrawlRun;
    }>(`/api/issues/${encodeURIComponent(issueId)}/reverify`, {
      method: 'POST',
    });
  },
};
