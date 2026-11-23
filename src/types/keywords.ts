import type { KeywordIntent } from './dashboard';

export type { KeywordIntent };

export type KeywordWorkflowState =
  | 'discovered'
  | 'enriched'
  | 'needs-data'
  | 'recommended'
  | 'rejected'
  | 'approved'
  | 'assigned'
  | 'implemented'
  | 'measured';

export type KeywordSourceType =
  | 'gsc_query'
  | 'crawl_content'
  | 'search_autocomplete'
  | 'google_trends'
  | 'keyword_planner'
  | 'competitor_page'
  | 'ai_expansion'
  | 'manual';

export type KeywordProviderId =
  | 'gsc'
  | 'crawl'
  | 'autocomplete'
  | 'google_trends'
  | 'google_ads_planner'
  | 'competitor_fetch'
  | 'gemini_ai';

export type ProviderAvailabilityState =
  | 'available'
  | 'connected'
  | 'credentials_required'
  | 'not_connected'
  | 'rate_limited'
  | 'blocked'
  | 'error'
  | 'unavailable';

export interface ProviderAvailabilityStatus {
  provider: KeywordProviderId;
  label: string;
  state: ProviderAvailabilityState;
  configured: boolean;
  lastCheckedAt: string | null;
  detail: string;
  itemsReturned: number;
}

export interface KeywordBusinessProfile {
  id: string;
  tenantId: string;
  projectId: string;
  approvedNiche: string;
  approvedServices: string[];
  targetAudience: string;
  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  competitorUrls: string[];
  approvalStatus: 'pending_owner_approval' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface OpportunityScoreBreakdown {
  businessRelevance: number;
  searchIntent: number;
  evidenceQuality: number;
  marketRelevance: number;
  pageSuitability: number;
  competitionEvidence: number;
  conversionPotential: number;
  totalScore: number;
  relevanceGatePassed: boolean;
  weights: {
    businessRelevance: number;
    searchIntent: number;
    evidenceQuality: number;
    marketRelevance: number;
    pageSuitability: number;
    competitionEvidence: number;
    conversionPotential: number;
  };
  reasons: string[];
}

export interface KeywordEvidenceItem {
  id: string;
  tenantId: string;
  projectId: string;
  keywordId: string;
  sourceProvider: KeywordProviderId | 'manual';
  sourceType: KeywordSourceType;
  measurementKind:
    | 'observed_site_traffic'
    | 'market_search_volume'
    | 'relative_trend_index'
    | 'search_suggestion'
    | 'onsite_page_extraction'
    | 'competitor_page_topic'
    | 'ai_semantic_expansion'
    | 'strategist_input';
  sourceUrl: string | null;
  summary: string;
  rawMetricValue: string | null;
  geographyScope: string;
  collectedAt: string;
}

export type KeywordMappingStatus =
  | 'mapped_existing'
  | 'recommend_new_page'
  | 'unmapped';

export interface KeywordUrlMappingRecord {
  id: string;
  tenantId: string;
  projectId: string;
  keywordId: string;
  keyword: string;
  targetUrl: string | null;
  mappingStatus: KeywordMappingStatus;
  recommendedSlug: string | null;
  pageTitle: string | null;
  pageH1: string | null;
  pageStatusCode: number | null;
  pageIndexable: boolean | null;
  matchConfidence: number;
  cannibalizationRisk: 'none' | 'low' | 'medium' | 'high';
  competingUrls: string[];
  competingKeywordIds: string[];
  resolutionRecommendation: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface KeywordIntelligenceRecord {
  id: string;
  tenantId: string;
  projectId: string;
  researchRunId: string | null;
  keyword: string;
  normalizedKeyword: string;
  seedTopic: string | null;
  primarySource: KeywordSourceType;
  sources: KeywordSourceType[];
  isAiSuggestion: boolean;

  intent: KeywordIntent;
  intentInferred: boolean;
  intentVerifiedBy: string | null;
  intentConfidence: number;
  intentReason: string;

  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  metricGeographyScope: 'country' | 'city' | 'site_observed' | 'global_unverified';

  // Strict data separation: never mix GSC site data, Trends 0-100, and market volume
  marketSearchVolume: number | null;
  volumeStatus: 'measured' | 'unavailable';
  volumeSource: 'google_ads_keyword_planner' | 'unavailable';
  competitionLevel: 'low' | 'medium' | 'high' | 'unavailable';
  cpcEstimate: number | null;

  relativeTrendIndex: number | null;
  trendDirection: 'rising' | 'stable' | 'declining' | 'unavailable';

  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscAvgPosition: number | null;
  gscObservedUrl: string | null;

  clusterId: string | null;
  clusterName: string | null;
  workflowState: KeywordWorkflowState;
  assignedTo: string | null;
  strategistNotes: string;

  scoreBreakdown: OpportunityScoreBreakdown;
  opportunityScore: number;

  mapping: KeywordUrlMappingRecord | null;
  evidence: KeywordEvidenceItem[];

  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordCluster {
  id: string;
  tenantId: string;
  projectId: string;
  clusterName: string;
  coreTopic: string;
  primaryKeywordId: string | null;
  primaryKeyword: string;
  keywordIds: string[];
  keywordsCount: number;
  intentDistribution: Record<KeywordIntent, number>;
  dominantIntent: KeywordIntent;
  suggestedLandingUrl: string | null;
  recommendedPageType: string;
  contentGaps: string[];
  cohesionScore: number;
  confidence: number;
  evidenceSummary: string;
  approvalState: 'pending_review' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  mergedIntoClusterId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordResearchRun {
  id: string;
  tenantId: string;
  projectId: string;
  seedTerms: string[];
  targetCountry: string;
  targetCity: string;
  targetLanguage: string;
  intentFocus: KeywordIntent | 'all';
  competitorUrls: string[];
  status: 'Running' | 'Completed' | 'Completed with Warnings' | 'Failed';
  totalDiscovered: number;
  totalClustersCreated: number;
  providerStatuses: ProviderAvailabilityStatus[];
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface CannibalizationAlert {
  id: string;
  severity: 'high' | 'medium' | 'low';
  kind: 'multiple_pages_ranking' | 'overlapping_mapped_targets' | 'competing_keywords_same_url';
  title: string;
  summary: string;
  keywordIds: string[];
  keywords: string[];
  competingUrls: string[];
  recommendation: string;
}

export interface CrawledPageOption {
  url: string;
  title: string | null;
  h1: string | null;
  statusCode: number;
  indexability: string;
}

export interface KeywordWorkspaceResponse {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  businessProfile: KeywordBusinessProfile;
  summary: {
    totalKeywords: number;
    recommendedCount: number;
    approvedCount: number;
    assignedOrImplementedCount: number;
    needsDataCount: number;
    rejectedCount: number;
    clusterCount: number;
    cannibalizationAlertsCount: number;
    mappedToExistingCount: number;
    newPageRecommendedCount: number;
    avgOpportunityScore: number | null;
  };
  providerStatuses: ProviderAvailabilityStatus[];
  researchRuns: KeywordResearchRun[];
  keywords: KeywordIntelligenceRecord[];
  clusters: KeywordCluster[];
  cannibalizationAlerts: CannibalizationAlert[];
  crawledUrls: CrawledPageOption[];
  recentAuditTrail: {
    id: string;
    entityType: string;
    entityId: string;
    actorName: string;
    actorRole: string;
    previousState: string;
    newState: string;
    reason: string;
    timestamp: string;
  }[];
}
