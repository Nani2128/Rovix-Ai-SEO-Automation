export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

export type DataLoadStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error'
  | 'stale'
  | 'unavailable';

export type AutomationJobState =
  | 'Queued'
  | 'Running'
  | 'Retrying'
  | 'Succeeded'
  | 'Partial'
  | 'Failed'
  | 'Cancelled';

export type KeywordIntent =
  | 'Commercial'
  | 'Informational'
  | 'Transactional'
  | 'Local'
  | 'Navigational';

export type OpportunityTier = 'High' | 'Medium' | 'Low';

export type ApprovalStatus = 'Approved' | 'Pending' | 'Revision Requested';

export interface Project {
  id: string;
  name: string;
  website: string;
  targetMarkets: string[];
  owner: string;
  currentMilestone: string;
  verifiedTaskWeight: number;
  approvedScopedTaskWeight: number;
  criticalIssues: number;
  overdueApprovals: number;
  blockers: string[];
  nextAction: string;
  lastSuccessfulRun: string | null;
  status: 'Active' | 'Blocked' | 'Needs Attention';
  createdAt?: string;
}

export interface TrafficMetric {
  date: string;
  sessions: number | null;
  clicks: number | null;
  impressions: number | null;
  previousSessions?: number | null;
  previousClicks?: number | null;
  previousImpressions?: number | null;
}

export type MeasurementStatus = 'measured' | 'estimated' | 'unavailable';

export interface MetricProvenance {
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: MeasurementStatus;
}

export interface KpiMetricItem {
  id: 'traffic' | 'keywords' | 'health' | 'conversions';
  label: string;
  value: number | null;
  available: boolean;
  emptyReason?: string;
  unitSuffix?: string;
  comparisonLabel: string;
  trendDirection: 'up' | 'down' | 'flat';
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: MeasurementStatus;
  tooltipDetail: string;
  route: string;
  sparkline: number[];
}

export interface SeoHealthCategory {
  id: 'technical' | 'on-page' | 'content' | 'performance' | 'indexability';
  label: string;
  score: number;
  weight: number;
  issueCount: number;
  evidenceSummary: string;
  rulesApplied: string;
}

export interface KeywordOpportunity {
  id: string;
  keyword: string;
  intent: KeywordIntent;
  targetMarket: string;
  searchVolume: number | null;
  targetUrl: string;
  opportunity: OpportunityTier;
  approvalStatus: ApprovalStatus;
  difficulty: number | null;
  currentPosition: number | null;
  clicks?: number | null;
  impressions?: number | null;
  sourceProvider?: 'gsc' | 'manual';
  rationale: string;
}

export interface AutomationJobExecution {
  runId: string;
  startedAt: string;
  endedAt: string;
  outcome: AutomationJobState;
  summary: string;
}

export interface AutomationJob {
  id: string;
  name: string;
  category:
    | 'Technical Site Audit'
    | 'Keyword Discovery'
    | 'Data Sync Job'
    | 'Domain Verification'
    | 'Recurring Monitoring';
  state: AutomationJobState;
  progressPct: number | null;
  progressLabel: string;
  startedAt: string;
  lastUpdated: string;
  nextScheduledRun: string;
  detail: string;
  history: AutomationJobExecution[];
}

export type ActivityCategory =
  | 'crawl_completion'
  | 'error_report'
  | 'pending_task'
  | 'system';

export interface ActivityEvent {
  id: string;
  type:
    | 'crawl'
    | 'issue'
    | 'keyword_approval'
    | 'content_review'
    | 'publishing'
    | 'verification'
    | 'integration_failure'
    | 'sync';
  category?: ActivityCategory;
  actor: string;
  action: string;
  detail?: string;
  projectId?: string;
  timestamp: string;
  status: 'Succeeded' | 'Warning' | 'Failed' | 'Pending';
  evidenceUrl?: string;
}

export interface RecentActivityFeedResponse {
  events: ActivityEvent[];
  counts: {
    all: number;
    crawl_completion: number;
    error_report: number;
    pending_task: number;
  };
  generatedAt: string;
}

export interface GlobalSearchIssueHit {
  id: string;
  projectId: string;
  projectName: string;
  projectWebsite: string;
  ruleId: string;
  ruleName: string;
  title: string;
  category: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | 'Info';
  status: string;
  affectedUrlCount: number;
  lastCrawlId: string;
  updatedAt: string;
}

export interface GlobalSearchCrawlHit {
  id: string;
  projectId: string;
  projectName: string;
  projectWebsite: string;
  crawlType: string;
  status: string;
  processedCount: number;
  discoveredCount: number;
  errorCount: number;
  healthScore: number;
  startedAt: string;
}

export interface GlobalSearchTaskHit {
  id: string;
  issueId: string;
  projectId: string;
  projectName: string;
  title: string;
  taskStatus: string;
  verificationStatus: string;
  responsibleRole: string;
  updatedAt: string;
}

export interface GlobalSearchResponse {
  query: string;
  issues: GlobalSearchIssueHit[];
  crawls: GlobalSearchCrawlHit[];
  tasks: GlobalSearchTaskHit[];
}

export interface IntegrationStatus {
  id: string;
  name: string;
  provider: 'GSC' | 'GA4' | 'Site Crawler' | 'PSI' | 'CRM';
  connected: boolean;
  lastSyncedAt: string | null;
  stale: boolean;
  statusLabel: string;
  propertyName?: string | null;
}

export interface SEOOverview {
  project: Project | null;
  dateRange: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  reportingPeriodLabel: string;
  lastUpdated: string;
  isStale: boolean;
  isDevSampleData: boolean;
  hasAnyCrawl: boolean;
  hasGscData: boolean;
  hasGa4Data: boolean;
  dataSourceNotice: string;
  kpis: KpiMetricItem[];
  trafficSeries: TrafficMetric[];
  trafficProvenance: MetricProvenance;
  healthBreakdown: SeoHealthCategory[];
  healthProvenance: MetricProvenance;
  computedHealthScore: number | null;
  keywords: KeywordOpportunity[];
  automations: AutomationJob[];
  recentActivity: ActivityEvent[];
  integrations: IntegrationStatus[];
}
