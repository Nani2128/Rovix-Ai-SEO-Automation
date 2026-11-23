import type { MeasurementStatus, MetricProvenance } from './dashboard';
import type {
  DeveloperTicket,
  IssueSeverity,
  TechnicalIssue,
  VerificationRun,
} from './technicalIssue';

export type PerformanceStrategy = 'mobile' | 'desktop';
export type PerformanceRunStrategyMode = 'mobile' | 'desktop' | 'both';

export type PerformanceAuditStatus =
  | 'Queued'
  | 'Running'
  | 'Succeeded'
  | 'Partial'
  | 'Failed'
  | 'Cancelled';

export type PerformanceRuleCategory =
  | 'Core Web Vitals'
  | 'JavaScript & Execution'
  | 'CSS & Render Blocking'
  | 'Images & Media'
  | 'Fonts & Web Typography'
  | 'Third-Party Scripts'
  | 'Server Response'
  | 'Resource Efficiency'
  | 'Mobile Usability';

export type EffortEstimate =
  | 'Low (1–2 hours, estimate)'
  | 'Medium (0.5–1 day, estimate)'
  | 'High (1–3 days, estimate)';

export interface LabCoreWebVitals {
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  speedIndexMs: number | null;
  tbtMs: number | null;
  clsScore: number | null;
  ttfbMs: number | null;
}

export interface CruxMetricDistribution {
  percentileP75: number | null;
  category: 'FAST' | 'AVERAGE' | 'SLOW' | 'UNAVAILABLE';
  goodPct: number | null;
  needsImprovementPct: number | null;
  poorPct: number | null;
}

export interface FieldCruxMetrics {
  available: boolean;
  scope: 'url' | 'origin' | 'unavailable';
  source: string;
  reportingPeriod: string;
  collectedAt: string | null;
  measurementStatus: MeasurementStatus;
  lcp: CruxMetricDistribution;
  inp: CruxMetricDistribution;
  cls: CruxMetricDistribution;
  fcp: CruxMetricDistribution;
  ttfb: CruxMetricDistribution;
  note: string;
}

export interface PerformanceResourceItem {
  url: string;
  resourceType: string;
  transferSizeBytes: number;
  wastedBytes: number | null;
  wastedMs: number | null;
}

export interface PerformanceResourceSummary {
  totalByteWeight: number | null;
  totalRequests: number | null;
  scriptBytes: number | null;
  stylesheetBytes: number | null;
  imageBytes: number | null;
  fontBytes: number | null;
  thirdPartyBytes: number | null;
  thirdPartyBlockingMs: number | null;
  domNodesCount: number | null;
  largestResources: PerformanceResourceItem[];
}

export interface PerformanceUsabilityChecks {
  viewportConfigured: boolean | null;
  legibleFontSizes: boolean | null;
  tapTargetsAdequate: boolean | null;
  colorContrastOk: boolean | null;
  notes: string[];
}

export interface PerformanceDiagnosticAudit {
  auditId: string;
  title: string;
  description: string;
  score: number | null;
  displayValue: string | null;
  numericValue: number | null;
  numericUnit: string | null;
  savingsMs: number | null;
  savingsBytes: number | null;
  kind: 'problem' | 'opportunity' | 'passed';
  itemCount: number;
}

export interface PerformanceAuditRun {
  id: string;
  tenantId: string;
  projectId: string;
  sourceCrawlId: string | null;
  strategyMode: PerformanceRunStrategyMode;
  status: PerformanceAuditStatus;
  provider: string;
  targetUrls: string[];
  totalChecks: number;
  completedChecks: number;
  failedChecks: number;
  errorSummary: string | null;
  avgMobileScore: number | null;
  avgDesktopScore: number | null;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface PerformanceUrlMeasurement {
  id: string;
  tenantId: string;
  projectId: string;
  auditRunId: string;
  url: string;
  strategy: PerformanceStrategy;
  status: 'Succeeded' | 'Failed';
  errorMessage: string | null;
  rawObjectRef: string | null;
  provenance: MetricProvenance;
  lab: LabCoreWebVitals;
  field: FieldCruxMetrics;
  resources: PerformanceResourceSummary;
  usability: PerformanceUsabilityChecks;
  diagnostics: PerformanceDiagnosticAudit[];
  collectedAt: string;
}

export interface PerformanceFinding {
  id: string;
  tenantId: string;
  projectId: string;
  auditRunId: string;
  measurementId: string;
  url: string;
  strategy: PerformanceStrategy;
  ruleId: string;
  category: PerformanceRuleCategory;
  findingKind: 'problem' | 'opportunity';
  severity: IssueSeverity;
  title: string;
  rootCause: string;
  explanation: string;
  evidence: {
    auditId: string;
    metricLabel: string;
    measuredValue: string;
    thresholdLabel: string;
    sampleUrls: string[];
  };
  recommendedSolution: string;
  estimatedEffort: EffortEstimate;
  affectedBytes: number | null;
  affectedMs: number | null;
  linkedIssueId: string | null;
  createdAt: string;
}

export interface PerformanceTrendPoint {
  runId: string;
  label: string;
  collectedAt: string;
  mobileScore: number | null;
  desktopScore: number | null;
  mobileLcpMs: number | null;
  desktopLcpMs: number | null;
  mobileCls: number | null;
  desktopCls: number | null;
}

export interface PerformanceDashboardOverview {
  projectId: string;
  projectName: string;
  website: string;
  pageSpeedKeyConfigured: boolean;
  maxUrlsPerAudit: number;
  latestRun: PerformanceAuditRun | null;
  previousRun: PerformanceAuditRun | null;
  runs: PerformanceAuditRun[];
  measurements: PerformanceUrlMeasurement[];
  findings: PerformanceFinding[];
  mobileSummary: {
    score: number | null;
    lcpMs: number | null;
    fcpMs: number | null;
    tbtMs: number | null;
    clsScore: number | null;
    ttfbMs: number | null;
    speedIndexMs: number | null;
    usabilityScore: number | null;
    measuredUrls: number;
    provenance: MetricProvenance;
  };
  desktopSummary: {
    score: number | null;
    lcpMs: number | null;
    fcpMs: number | null;
    tbtMs: number | null;
    clsScore: number | null;
    ttfbMs: number | null;
    speedIndexMs: number | null;
    usabilityScore: number | null;
    measuredUrls: number;
    provenance: MetricProvenance;
  };
  fieldSummary: FieldCruxMetrics;
  trendHistory: PerformanceTrendPoint[];
  linkedIssues: TechnicalIssue[];
  linkedTickets: DeveloperTicket[];
  verificationRuns: VerificationRun[];
}
