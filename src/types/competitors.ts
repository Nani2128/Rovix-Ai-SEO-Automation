import type { KeywordIntent } from './dashboard';

export type CompetitorMeasurementStatus =
  | 'measured'
  | 'inferred'
  | 'estimated'
  | 'unavailable';

export type CompetitorCategory =
  | 'direct'
  | 'indirect'
  | 'serp_peer'
  | 'local';

export type CompetitorApprovalStatus =
  | 'pending_owner_approval'
  | 'approved'
  | 'rejected'
  | 'archived';

export type CompetitorDiscoveryOrigin =
  | 'manual'
  | 'keyword_profile'
  | 'serp_provider'
  | 'crawl_reference';

export interface CompetitorDataProvenance {
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: CompetitorMeasurementStatus;
  methodology: string;
  limitations: string;
}

export interface CompetitorApprovalHistoryEntry {
  id: string;
  actorName: string;
  actorRole: string;
  previousStatus: CompetitorApprovalStatus | 'none';
  newStatus: CompetitorApprovalStatus;
  reason: string;
  timestamp: string;
}

export type CompetitorProviderId =
  | 'competitor_html_analyzer'
  | 'site_crawl_baseline'
  | 'keyword_intelligence'
  | 'geographic_markets'
  | 'performance_telemetry'
  | 'serp_rank_api'
  | 'domain_authority_backlinks';

export type CompetitorProviderState =
  | 'available'
  | 'connected'
  | 'credentials_required'
  | 'blocked'
  | 'error'
  | 'unavailable';

export interface CompetitorProviderStatus {
  provider: CompetitorProviderId;
  label: string;
  state: CompetitorProviderState;
  configured: boolean;
  lastCheckedAt: string | null;
  detail: string;
  itemsReturned: number;
}

export interface CompetitorProfileRecord {
  id: string;
  tenantId: string;
  projectId: string;
  domain: string;
  name: string;
  homepageUrl: string;
  category: CompetitorCategory;
  targetMarkets: string[];
  discoveryOrigin: CompetitorDiscoveryOrigin;
  discoveryEvidence: string;
  approvalStatus: CompetitorApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  recommendedBy: string | null;
  notes: string;
  lastAnalyzedAt: string | null;
  analyzedPagesCount: number;
  externalDomainAuthority: number | null;
  externalMonthlyTraffic: number | null;
  externalBacklinksCount: number | null;
  provenance: CompetitorDataProvenance;
  approvalHistory: CompetitorApprovalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorPageSnapshot {
  id: string;
  tenantId: string;
  projectId: string;
  competitorId: string;
  url: string;
  normalizedUrl: string;
  statusCode: number;
  contentType: string;
  responseTimeMs: number;
  title: string;
  metaDescription: string;
  h1: string;
  headings: string[];
  wordCount: number;
  canonicalUrl: string | null;
  schemaTypes: string[];
  hasOpenGraph: boolean;
  extractedTopics: string[];
  provenance: CompetitorDataProvenance;
  fetchedAt: string;
}

export type KeywordOverlapType =
  | 'shared'
  | 'competitor_only_gap'
  | 'project_advantage';

export interface CompetitorKeywordOverlapRow {
  id: string;
  tenantId: string;
  projectId: string;
  competitorId: string;
  competitorDomain: string;
  keyword: string;
  intent: KeywordIntent;
  targetCountry: string;
  projectCoverageStatus: 'covered' | 'partial' | 'missing';
  projectUrl: string | null;
  competitorCoverageStatus: 'covered_on_page' | 'serp_ranked';
  competitorUrl: string | null;
  competitorMatchReason: string;
  projectGscImpressions: number | null;
  projectGscClicks: number | null;
  projectGscPosition: number | null;
  competitorSerpPosition: number | null;
  externalSearchVolume: number | null;
  overlapType: KeywordOverlapType;
  provenance: CompetitorDataProvenance;
  collectedAt: string;
}

export type ContentGapType =
  | 'missing_topic_page'
  | 'shallow_depth'
  | 'missing_schema'
  | 'missing_geo_coverage'
  | 'weak_heading_structure';

export type ContentGapWorkflowState =
  | 'discovered'
  | 'strategist_recommended'
  | 'owner_approved'
  | 'rejected'
  | 'queued_for_content';

export interface ContentGapBriefPlan {
  targetSlug: string;
  suggestedTitle: string;
  suggestedH1: string;
  suggestedSections: string[];
  schemaSuggestion: string[];
  geoAlignment: string;
}

export interface ContentGapRecommendation {
  id: string;
  tenantId: string;
  projectId: string;
  competitorId: string;
  competitorDomain: string;
  gapType: ContentGapType;
  topicTitle: string;
  targetKeyword: string;
  targetMarket: string;
  projectUrl: string | null;
  projectWordCount: number | null;
  projectTitle: string | null;
  projectH1: string | null;
  projectSchemaTypes: string[];
  competitorUrl: string;
  competitorWordCount: number | null;
  competitorTitle: string | null;
  competitorH1: string | null;
  competitorHeadings: string[];
  competitorSchemaTypes: string[];
  opportunityScore: number | null;
  priorityTier: 'High' | 'Medium' | 'Low' | 'Needs Evidence';
  confidence: 'High' | 'Medium' | 'Low';
  explanation: string;
  supportingEvidence: string[];
  missingInfo: string[];
  recommendedAction: string;
  recommendedBrief: ContentGapBriefPlan;
  workflowState: ContentGapWorkflowState;
  approvedBy: string | null;
  approvedAt: string | null;
  strategistNotes: string;
  linkedTicketId: string | null;
  linkedKeywordId: string | null;
  provenance: CompetitorDataProvenance;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorResearchRun {
  id: string;
  tenantId: string;
  projectId: string;
  competitorId: string | null;
  competitorDomain: string;
  runKind: 'page_analysis' | 'serp_discovery';
  urlsScanned: number;
  topicsExtracted: number;
  overlapsFound: number;
  gapsIdentified: number;
  status: 'Running' | 'Completed' | 'Completed with Warnings' | 'Failed';
  providerStatuses: CompetitorProviderStatus[];
  errorSummary: string | null;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface CompetitorComparisonRow {
  entityType: 'project' | 'competitor';
  id: string;
  name: string;
  domain: string;
  approvalStatus: string;
  analyzedPagesCount: number;
  avgWordCount: number | null;
  avgResponseTimeMs: number | null;
  schemaTypesObserved: string[];
  topicKeywordsCount: number;
  sharedKeywordsCount: number;
  gapOpportunitiesCount: number;
  projectAvgPerfMobile: number | null;
  projectAvgPerfDesktop: number | null;
  externalDomainAuthority: number | null;
  externalMonthlyTraffic: number | null;
  externalBacklinksCount: number | null;
  dataAvailabilityNote: string;
}

export interface CompetitorAuditTrailItem {
  id: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRole: string;
  previousState: string;
  newState: string;
  reason: string;
  timestamp: string;
}

export interface ProjectCrawledContentSummary {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: string[];
  schemaTypes: string[];
  statusCode: number;
  responseTimeMs: number;
  indexability: string;
}

export interface CompetitorWorkspaceResponse {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  providerStatuses: CompetitorProviderStatus[];
  projectBaseline: {
    crawledUrlsCount: number;
    crawlPages: ProjectCrawledContentSummary[];
    keywordsCount: number;
    approvedGeoMarkets: string[];
    avgMobilePerformance: number | null;
    avgDesktopPerformance: number | null;
    hasCompletedCrawl: boolean;
    hasApprovedProfile: boolean;
  };
  competitors: CompetitorProfileRecord[];
  pages: CompetitorPageSnapshot[];
  overlaps: CompetitorKeywordOverlapRow[];
  contentGaps: ContentGapRecommendation[];
  comparisonRows: CompetitorComparisonRow[];
  researchRuns: CompetitorResearchRun[];
  auditTrail: CompetitorAuditTrailItem[];
  summary: {
    approvedCompetitors: number;
    pendingApprovalCompetitors: number;
    analyzedPages: number;
    sharedKeywords: number;
    competitorGapKeywords: number;
    openContentGaps: number;
    approvedContentGaps: number;
  };
}
