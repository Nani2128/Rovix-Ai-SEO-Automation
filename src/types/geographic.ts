import type { ApprovalStatus, KeywordIntent, MeasurementStatus } from './dashboard';
import type { KeywordIntelligenceRecord } from './keywords';

export type GeoGranularity = 'country' | 'state_region' | 'city';

export type GeoMarketPriority = 'primary' | 'secondary' | 'recommended';

export type GeoMarketApprovalStatus =
  | 'pending_owner_approval'
  | 'strategist_recommended'
  | 'approved'
  | 'rejected';

export type GeoMeasurementStatus =
  | MeasurementStatus
  | 'relative_interest'
  | 'inferred';

export type GeoProviderId =
  | 'gsc_country'
  | 'google_trends_geo'
  | 'google_business_profile'
  | 'geo_rank_tracker'
  | 'keyword_engine'
  | 'crawl_inventory'
  | 'autocomplete_geo';

export type GeoProviderState =
  | 'connected'
  | 'available'
  | 'credentials_required'
  | 'not_connected'
  | 'rate_limited'
  | 'blocked'
  | 'error'
  | 'unavailable';

export interface GeoProviderStatus {
  provider: GeoProviderId;
  label: string;
  state: GeoProviderState;
  configured: boolean;
  granularitySupported: GeoGranularity[];
  metricNature:
    | 'observed_site_traffic'
    | 'relative_interest_0_100'
    | 'gbp_local_pack'
    | 'localized_rank_serp'
    | 'onsite_url_inventory'
    | 'keyword_evidence'
    | 'localized_suggestions';
  lastCheckedAt: string | null;
  detail: string;
  itemsReturned: number;
}

export interface GeoDataProvenance {
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: GeoMeasurementStatus;
  granularity: GeoGranularity;
  methodology: string;
  limitations: string;
}

export interface GeoApprovalHistoryEntry {
  id: string;
  actorName: string;
  actorRole: string;
  previousStatus: GeoMarketApprovalStatus | 'none';
  newStatus: GeoMarketApprovalStatus;
  reason: string;
  timestamp: string;
}

export interface GeoTargetMarket {
  id: string;
  tenantId: string;
  projectId: string;
  granularity: GeoGranularity;
  countryCode: string;
  countryName: string;
  isoNumeric: string;
  stateRegion: string;
  stateFips: string | null;
  city: string;
  language: string;
  serviceAreas: string[];
  priority: GeoMarketPriority;
  approvalStatus: GeoMarketApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  recommendedBy: string | null;
  recommendedReason: string;
  latitude: number | null;
  longitude: number | null;
  approvalHistory: GeoApprovalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface GeoMeasurementRecord {
  id: string;
  tenantId: string;
  projectId: string;
  marketId: string | null;
  granularity: GeoGranularity;
  locationKey: string;
  locationLabel: string;
  countryCode: string;
  countryName: string;
  isoNumeric: string;
  stateRegion: string;
  city: string;
  latitude: number | null;
  longitude: number | null;

  // Strictly separated provider metric domains (never blended)
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscAvgPosition: number | null;
  gscGranularityNote: string;

  relativeTrendIndex: number | null;
  trendDirection: 'rising' | 'stable' | 'declining' | 'unavailable';
  trendsNote: string;

  gbpLocationsCount: number | null;
  gbpVisibilityNote: string;

  trackedRankPosition: number | null;
  trackedRankProvider: string | null;
  rankTrackingNote: string;

  provenance: GeoDataProvenance;
  collectedAt: string;
}

export type GeoMappingStatus =
  | 'mapped_existing'
  | 'recommend_new_page'
  | 'duplicate_overlap'
  | 'unmapped';

export interface GeoUrlMappingRecord {
  id: string;
  tenantId: string;
  projectId: string;
  marketId: string;
  locationLabel: string;
  granularity: GeoGranularity;
  countryCode: string;
  stateRegion: string;
  city: string;
  targetUrl: string | null;
  mappingStatus: GeoMappingStatus;
  recommendedSlug: string | null;
  pageTitle: string | null;
  pageH1: string | null;
  pageStatusCode: number | null;
  pageIndexable: boolean | null;
  duplicateRisk: 'none' | 'medium' | 'high';
  competingUrls: string[];
  doorwayRiskWarning: string | null;
  resolutionRecommendation: string | null;
  approvalState: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface GeoOpportunityRecommendation {
  id: string;
  marketId: string;
  locationLabel: string;
  granularity: GeoGranularity;
  countryCode: string;
  stateRegion: string;
  city: string;
  priorityTier: 'High' | 'Medium' | 'Low' | 'Needs Evidence';
  score: number | null;
  confidence: 'High' | 'Medium' | 'Low';
  headline: string;
  explanation: string;
  supportingEvidence: string[];
  sourceSummary: string;
  coverageDescription: string;
  missingInfo: string[];
  recommendedNextAction: string;
  blockedByMissingData: boolean;
}

export interface GeoMarketComparisonRow {
  marketId: string;
  locationLabel: string;
  granularity: GeoGranularity;
  countryCode: string;
  stateRegion: string;
  city: string;
  priority: GeoMarketPriority;
  approvalStatus: GeoMarketApprovalStatus;
  gscDimension: {
    status: GeoMeasurementStatus;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    avgPosition: number | null;
    scopeNote: string;
  };
  trendsDimension: {
    status: GeoMeasurementStatus;
    relativeIndex: number | null;
    direction: 'rising' | 'stable' | 'declining' | 'unavailable';
    scopeNote: string;
  };
  rankTrackerDimension: {
    status: GeoMeasurementStatus;
    avgRank: number | null;
    scopeNote: string;
  };
  gbpDimension: {
    status: GeoMeasurementStatus;
    profilesMatched: number | null;
    scopeNote: string;
  };
  urlCoverage: {
    mappedCount: number;
    missingPageCount: number;
    overlapWarningCount: number;
  };
  geoKeywordCount: number;
}

export interface GeoResearchRun {
  id: string;
  tenantId: string;
  projectId: string;
  targetCountry: string;
  targetStateRegion: string;
  targetCity: string;
  targetLanguage: string;
  seedTerms: string[];
  intentFocus: KeywordIntent | 'all';
  status: 'Running' | 'Completed' | 'Completed with Warnings' | 'Failed';
  keywordsDiscovered: number;
  measurementsCollected: number;
  opportunitiesGenerated: number;
  providerStatuses: GeoProviderStatus[];
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface GeoMapRegionFeature {
  isoNumeric: string;
  countryCode: string;
  countryName: string;
  isConfiguredTarget: boolean;
  targetPriority: GeoMarketPriority | null;
  approvalStatus: GeoMarketApprovalStatus | null;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscAvgPosition: number | null;
  relativeTrendIndex: number | null;
  geoKeywordCount: number;
  mappedUrlsCount: number;
  missingPageGapsCount: number;
  hasMeasuredGscData: boolean;
  hasRelativeTrendData: boolean;
  dataAvailabilityLabel: string;
}

export interface GeoWorkspaceResponse {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  summary: {
    approvedMarketsCount: number;
    recommendedMarketsCount: number;
    pendingApprovalCount: number;
    countriesWithGscData: number;
    totalGeoKeywords: number;
    mappedLocationsCount: number;
    missingLandingPagesCount: number;
    duplicateOverlapWarningsCount: number;
    opportunitiesCount: number;
  };
  granularityDisclosure: string;
  providerStatuses: GeoProviderStatus[];
  targetMarkets: GeoTargetMarket[];
  measurements: GeoMeasurementRecord[];
  mapCountries: GeoMapRegionFeature[];
  geoKeywords: KeywordIntelligenceRecord[];
  urlMappings: GeoUrlMappingRecord[];
  opportunities: GeoOpportunityRecommendation[];
  comparisonRows: GeoMarketComparisonRow[];
  researchRuns: GeoResearchRun[];
  crawledUrls: {
    url: string;
    title: string | null;
    h1: string | null;
    statusCode: number;
    indexability: string;
  }[];
  approvalAuditTrail: {
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
