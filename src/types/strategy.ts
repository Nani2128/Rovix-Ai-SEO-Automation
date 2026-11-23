import type { AgentStationId } from './agentFactory';
import type { KeywordIntent } from './dashboard';

export type StrategyConfidence = 'High' | 'Medium' | 'Low' | 'Needs Research';

export type StrategyApprovalStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export type ArchitecturePageType =
  | 'homepage'
  | 'service'
  | 'product'
  | 'category'
  | 'location'
  | 'blog'
  | 'resource'
  | 'case_study'
  | 'about'
  | 'contact';

export type ArchitecturePageStatus =
  | 'existing'
  | 'optimize'
  | 'proposed'
  | 'archived';

export type InternalLinkCategory =
  | 'orphan_rescue'
  | 'authority_hub'
  | 'parent_child'
  | 'topical_crosslink'
  | 'weak_link_fix';

export type TopicalCoverageClassification =
  | 'verified_existing'
  | 'recommended_opportunity'
  | 'ai_suggestion'
  | 'unavailable_evidence';

export type RoadmapPriority =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Needs Research';

export type RoadmapImplementationStatus =
  | 'not_started'
  | 'queued_task'
  | 'agent_workflow_launched'
  | 'in_progress'
  | 'blocked';

export type StrategyEntityKind =
  | 'strategy_version'
  | 'objective'
  | 'architecture_page'
  | 'keyword_mapping'
  | 'internal_link'
  | 'topical_cluster'
  | 'roadmap_item';

export interface StrategyEvidenceRef {
  source:
    | 'project_profile'
    | 'site_crawl'
    | 'technical_issues'
    | 'keyword_intelligence'
    | 'keyword_clusters'
    | 'geographic_markets'
    | 'competitor_gaps'
    | 'performance_vitals'
    | 'ai_synthesis';
  label: string;
  referenceId?: string | null;
  url?: string | null;
  observedDetail: string;
}

export interface StrategyEvidenceReadiness {
  hasBusinessProfile: boolean;
  businessProfileApproved: boolean;
  crawledUrlsCount: number;
  latestCrawlAt: string | null;
  technicalIssuesCount: number;
  keywordsCount: number;
  keywordClustersCount: number;
  approvedLocationsCount: number;
  competitorsCount: number;
  contentGapsCount: number;
  performanceMeasurementsCount: number;
  missingDataItems: string[];
  overallReadiness: 'Ready' | 'Partial Evidence' | 'Needs Research';
}

export interface StrategySectionRecommendation {
  id: string;
  title: string;
  summary: string;
  source: string;
  confidence: StrategyConfidence;
  needsResearch: boolean;
  isAiGenerated: boolean;
  evidence: StrategyEvidenceRef[];
}

export interface StrategyStructuredPayload {
  targetAudienceSummary: string;
  searchIntentBreakdown: Record<KeywordIntent, number>;
  primaryKeywordGroups: {
    groupName: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
    intent: KeywordIntent;
    confidence: StrategyConfidence;
    evidence: StrategyEvidenceRef[];
  }[];
  recommendedStructureSummary: string;
  recommendedLandingPages: StrategySectionRecommendation[];
  recommendedServicePages: StrategySectionRecommendation[];
  recommendedLocationPages: StrategySectionRecommendation[];
  blogContentCategories: StrategySectionRecommendation[];
  technicalAndContentPriorities: StrategySectionRecommendation[];
  missingEvidenceNotes: string[];
}

export interface SeoStrategyVersionRecord {
  id: string;
  tenantId: string;
  projectId: string;
  versionNumber: number;
  title: string;
  summary: string;
  targetAudience: string;
  evidenceReadiness: StrategyEvidenceReadiness;
  missingEvidence: string[];
  payload: StrategyStructuredPayload;
  sourceWorkflowId: string | null;
  isAiGenerated: boolean;
  approvalStatus: StrategyApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeoStrategyObjectiveRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  title: string;
  rationale: string;
  category: 'technical' | 'architecture' | 'keywords' | 'geographic' | 'content' | 'authority';
  source: string;
  confidence: StrategyConfidence;
  needsResearch: boolean;
  evidence: StrategyEvidenceRef[];
  approvalStatus: StrategyApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteArchitecturePageRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  parentPageId: string | null;
  sortOrder: number;
  title: string;
  slug: string;
  proposedUrl: string;
  existingUrl: string | null;
  pageType: ArchitecturePageType;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  relatedKeywords: string[];
  searchIntent: KeywordIntent;
  clusterId: string | null;
  clusterName: string | null;
  targetGeography: string | null;
  pageStatus: ArchitecturePageStatus;
  approvalStatus: StrategyApprovalStatus;
  mappingApprovalStatus: StrategyApprovalStatus;
  confidence: StrategyConfidence;
  rationale: string;
  evidence: StrategyEvidenceRef[];
  isAiGenerated: boolean;
  notes: string;
  archivedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteArchitectureTreeNode extends SiteArchitecturePageRecord {
  depth: number;
  children: SiteArchitectureTreeNode[];
  inboundLinkRecCount: number;
  outboundLinkRecCount: number;
}

export interface KeywordMappingDiagnosticAlert {
  id: string;
  kind:
    | 'cannibalization_same_primary_keyword'
    | 'keyword_overlap_warning'
    | 'conflicting_search_intent'
    | 'unmapped_keyword'
    | 'under_covered_cluster'
    | 'optimize_existing_page';
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  keyword: string | null;
  affectedPageIds: string[];
  affectedUrls: string[];
  recommendedResolution: string;
  evidence: StrategyEvidenceRef[];
}

export interface InternalLinkRecommendationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  sourcePageId: string | null;
  sourceUrl: string;
  sourceTitle: string;
  targetPageId: string | null;
  targetUrl: string;
  targetTitle: string;
  suggestedAnchorText: string;
  linkCategory: InternalLinkCategory;
  existsInCrawl: boolean;
  currentInboundCount: number | null;
  reason: string;
  confidence: StrategyConfidence;
  evidence: StrategyEvidenceRef[];
  approvalStatus: StrategyApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TopicalClusterRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  pillarTopic: string;
  supportingSubtopics: string[];
  coverageClassification: TopicalCoverageClassification;
  verifiedPageUrls: string[];
  missingOpportunities: string[];
  competitorGapIds: string[];
  keywordClusterId: string | null;
  linkedPageIds: string[];
  priorityScore: number | null;
  confidence: StrategyConfidence;
  evidenceSummary: string;
  evidence: StrategyEvidenceRef[];
  isAiGenerated: boolean;
  approvalStatus: StrategyApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapPriorityScoreBreakdown {
  businessRelevance: number;
  searchIntent: number;
  technicalFeasibility: number;
  keywordEvidence: number;
  competitorGapEvidence: number;
  geographicRelevance: number;
  dependencyReadiness: number;
  totalScore: number;
  explanation: string[];
}

export interface SeoRoadmapItemRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  title: string;
  description: string;
  category:
    | 'technical_foundation'
    | 'site_architecture'
    | 'keyword_optimization'
    | 'internal_linking'
    | 'topical_content'
    | 'local_geo_landing';
  relatedPageId: string | null;
  relatedUrl: string | null;
  relatedKeyword: string | null;
  businessImpactRationale: string;
  evidence: StrategyEvidenceRef[];
  priority: RoadmapPriority;
  priorityScore: number | null;
  scoreBreakdown: RoadmapPriorityScoreBreakdown;
  dependencies: string[];
  /** Explicitly labeled estimate (e.g., "Estimate: Medium (4-8 hrs)"). */
  estimatedEffort: string;
  responsibleRole: string;
  recommendedAgentId: AgentStationId | null;
  approvalStatus: StrategyApprovalStatus;
  implementationStatus: RoadmapImplementationStatus;
  linkedTicketId: string | null;
  linkedWorkflowId: string | null;
  isAiGenerated: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyApprovalRecord {
  id: string;
  tenantId: string;
  projectId: string;
  strategyVersionId: string;
  entityKind: StrategyEntityKind;
  entityId: string;
  entityLabel: string;
  previousStatus: string;
  newStatus: StrategyApprovalStatus;
  actorId: string;
  actorName: string;
  actorRole: string;
  comment: string;
  timestamp: string;
}

export interface StrategyWorkspacePayload {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  canEditStrategy: boolean;
  canApproveStrategy: boolean;
  canCreateTasks: boolean;
  canLaunchWorkflows: boolean;
  evidenceReadiness: StrategyEvidenceReadiness;
  versions: SeoStrategyVersionRecord[];
  activeVersion: SeoStrategyVersionRecord | null;
  objectives: SeoStrategyObjectiveRecord[];
  pages: SiteArchitecturePageRecord[];
  mappingDiagnostics: KeywordMappingDiagnosticAlert[];
  unmappedKeywords: {
    keywordId: string;
    keyword: string;
    intent: KeywordIntent;
    clusterName: string | null;
    targetGeography: string;
    marketSearchVolume: number | null;
    volumeStatus: 'measured' | 'unavailable';
    gscImpressions: number | null;
    isAiSuggestion: boolean;
  }[];
  internalLinks: InternalLinkRecommendationRecord[];
  topicalClusters: TopicalClusterRecord[];
  roadmapItems: SeoRoadmapItemRecord[];
  approvals: StrategyApprovalRecord[];
  availableKeywords: {
    id: string;
    keyword: string;
    intent: KeywordIntent;
    clusterId: string | null;
    clusterName: string | null;
    targetGeography: string;
    marketSearchVolume: number | null;
    volumeStatus: 'measured' | 'unavailable';
    gscClicks: number | null;
    gscImpressions: number | null;
    gscAvgPosition: number | null;
    isAiSuggestion: boolean;
  }[];
  approvedLocations: {
    id: string;
    label: string;
    granularity: string;
    countryCode: string;
  }[];
  recentStrategyWorkflows: {
    workflowId: string;
    name: string;
    status: string;
    currentStage: string;
    createdAt: string;
    completedAt: string | null;
  }[];
}
