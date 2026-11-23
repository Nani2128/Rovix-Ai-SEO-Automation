export type IssueSeverity =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Informational';

export type IssueCategory =
  | 'Indexability'
  | 'Canonical'
  | 'Redirects'
  | 'Broken pages'
  | 'Metadata'
  | 'Headings'
  | 'Schema'
  | 'Hreflang'
  | 'Page structure'
  | 'Internal linking'
  | 'Rendering'
  | 'Performance'
  | 'Usability';

export type IssueLifecycleStatus =
  | 'Open'
  | 'Triaged'
  | 'Awaiting approval'
  | 'In progress'
  | 'Awaiting verification'
  | 'Verified'
  | 'Rejected';

export type DeveloperTaskStatus =
  | 'Proposed'
  | 'Triaged'
  | 'Awaiting approval'
  | 'Approved'
  | 'In progress'
  | 'Blocked'
  | 'Awaiting verification'
  | 'Verified'
  | 'Rejected'
  | 'Archived';

export interface DetectionRuleDefinition {
  ruleId: string;
  ruleName: string;
  category: IssueCategory;
  severity: IssueSeverity;
  description: string;
  evidenceRequirements: string;
  confidence: number;
  recommendedFix: string;
  responsibleRole: 'Developer' | 'SEO Strategist' | 'Editor';
  requiresDualApproval: boolean;
}

export interface TechnicalIssue {
  id: string;
  tenantId: string;
  projectId: string;
  lastCrawlId: string;
  ruleId: string;
  ruleName: string;
  category: IssueCategory;
  severity: IssueSeverity;
  rootCauseKey: string;
  title: string;
  explanation: string;
  impact: string;
  recommendedFix: string;
  responsibleRole: string;
  status: IssueLifecycleStatus;
  confidence: number;
  affectedUrlCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface IssueEvidence {
  id: string;
  tenantId: string;
  issueId: string;
  crawlId: string;
  urlId: string | null;
  url: string;
  evidenceType: string;
  source: 'raw_html' | 'rendered_dom' | 'http_headers' | 'robots_txt' | 'sitemap_xml';
  snippet: string;
  details: Record<string, unknown>;
  evidenceReference: string | null;
  capturedAt: string;
}

export interface DeveloperTicket {
  id: string;
  tenantId: string;
  issueId: string;
  projectId: string;
  title: string;
  description: string;
  responsibleRole: string;
  assignedUser: string | null;
  taskStatus: DeveloperTaskStatus;
  approvalStatus: 'Not Required' | 'Pending' | 'Developer Approved' | 'Dual Approved' | 'Rejected';
  requiresDualApproval: boolean;
  developerApprovedBy: string | null;
  leadApprovedBy: string | null;
  verificationStatus: 'Pending' | 'Verified' | 'Failed';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationRun {
  id: string;
  tenantId: string;
  issueId: string;
  previousCrawlId: string;
  verificationCrawlId: string;
  result: 'Verified' | 'Unresolved' | 'Changed';
  evidence: {
    checkedUrls: number;
    stillFailingUrls: string[];
    resolvedUrls: string[];
    summary: string;
  };
  requestedBy: string;
  verifiedAt: string;
}
