import type { CrawlConfigurationData, CrawlRun, ProjectDomainVerification } from './crawl';
import type { DeveloperTicket, IssueCategory, IssueSeverity, TechnicalIssue, VerificationRun } from './technicalIssue';

export interface AuditOverviewResponse {
  projectId: string;
  projectName: string;
  website: string;
  verification: ProjectDomainVerification;
  latestCrawl: CrawlRun | null;
  previousCompletedCrawl: CrawlRun | null;
  recentCrawls: CrawlRun[];
  topCriticalIssues: TechnicalIssue[];
  recentlyVerifiedFixes: VerificationRun[];
  developerTickets: DeveloperTicket[];
  categoryBreakdown: { category: IssueCategory; count: number }[];
  severityBreakdown: { severity: IssueSeverity; count: number }[];
  discoverySeries: { label: string; discovered: number; processed: number; issues: number }[];
  rendererAvailable: boolean;
}

export interface CrawlConfigResponse {
  verification: ProjectDomainVerification;
  configuration: CrawlConfigurationData;
  previousCrawl: CrawlRun | null;
  estimatedScope: {
    estimatedMaxUrls: number;
    note: string;
  };
  policySummary: string[];
  rendererAvailable: boolean;
}

export interface CrawlComparisonResponse {
  projectId: string;
  previousCrawl: CrawlRun | null;
  currentCrawl: CrawlRun | null;
  incompleteExcludedCount: number;
  newIssues: TechnicalIssue[];
  resolvedIssues: TechnicalIssue[];
  unchangedIssues: TechnicalIssue[];
  changedUrls: {
    url: string;
    previousStatus: number | null;
    currentStatus: number | null;
    previousIndexability: string | null;
    currentIndexability: string | null;
  }[];
}

export interface AuditTrailEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRole: string;
  previousState: string;
  newState: string;
  reason: string;
  evidenceReference: string | null;
  timestamp: string;
}
