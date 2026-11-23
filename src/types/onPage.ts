import type { AgentStationId } from './agentFactory';
import type { KeywordIntent } from './dashboard';
import type { StrategyConfidence } from './strategy';

export type OnPageLifecycleStatus =
  | 'detected'
  | 'recommendation_generated'
  | 'awaiting_approval'
  | 'approved'
  | 'draft_ready'
  | 'applied_externally'
  | 'recrawled'
  | 'verified'
  | 'rejected';

export type OnPageApprovalStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export type OnPageIssueSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type OnPageIssueCategory =
  | 'title'
  | 'meta_description'
  | 'headings'
  | 'url_structure'
  | 'content'
  | 'images'
  | 'structured_data'
  | 'internal_linking'
  | 'keyword_alignment'
  | 'technical';

export type OnPageRecommendationTarget =
  | 'title'
  | 'meta_description'
  | 'h1'
  | 'headings'
  | 'content_structure'
  | 'keyword_placement'
  | 'supporting_subtopics'
  | 'image_alt'
  | 'schema'
  | 'internal_link';

export type CmsPlatform = 'wordpress' | 'webflow' | 'shopify';

export type CmsConnectionStatus =
  | 'not_configured'
  | 'configured_unverified'
  | 'connected'
  | 'error';

export interface OnPageEvidenceRef {
  source:
    | 'crawl_record'
    | 'html_snapshot'
    | 'keyword_intelligence'
    | 'keyword_cluster'
    | 'strategy_architecture'
    | 'internal_links'
    | 'competitor_gap'
    | 'technical_issue'
    | 'fresh_crawl_verification'
    | 'ai_recommendation';
  label: string;
  referenceId?: string | null;
  url?: string | null;
  observedDetail: string;
}

export interface ExtractedImageSignal {
  src: string;
  alt: string | null;
  hasAltAttribute: boolean;
  isEmptyAlt: boolean;
  width: string | null;
  height: string | null;
  loading: string | null;
  surroundingContext: string;
  suggestedAlt: string | null;
}

export interface ExtractedSchemaBlock {
  rawType: string[];
  validJson: boolean;
  parseError: string | null;
  missingRecommendedProps: string[];
  snippet: string;
}

export interface ExtractedInternalAnchor {
  href: string;
  anchorText: string;
  isWeakAnchor: boolean;
}

export interface OnPageHtmlExtract {
  htmlAvailable: boolean;
  renderingSource: 'raw_html' | 'rendered_dom' | 'metadata_only';
  wordCount: number | null;
  bodyTextExcerpt: string;
  headings: { tag: string; text: string }[];
  h1List: string[];
  images: ExtractedImageSignal[];
  imagesTotal: number;
  imagesMissingAlt: number;
  imagesEmptyAlt: number;
  imagesMissingDimensions: number;
  jsonLdBlocks: ExtractedSchemaBlock[];
  detectedSchemaTypes: string[];
  invalidSchemaCount: number;
  internalAnchors: ExtractedInternalAnchor[];
  weakAnchorCount: number;
}

export interface OnPageCategoryScore {
  category:
    | 'title'
    | 'metaDescription'
    | 'headings'
    | 'contentRelevance'
    | 'keywordAlignment'
    | 'urlStructure'
    | 'images'
    | 'structuredData'
    | 'internalLinking'
    | 'technicalSignals';
  label: string;
  status: 'scored' | 'unavailable_evidence';
  score: number | null;
  maxScore: number;
  summary: string;
  problems: string[];
  recommendations: string[];
  evidence: OnPageEvidenceRef[];
}

export interface OnPageScoreBreakdown {
  overallScore: number | null;
  scoreStatus: 'scored' | 'insufficient_evidence';
  scoredCategoriesCount: number;
  unavailableCategoriesCount: number;
  caveat: string;
  categories: OnPageCategoryScore[];
}

export interface OnPageKeywordContext {
  existingPrimaryKeyword: string | null;
  secondaryKeywords: string[];
  searchIntent: KeywordIntent | null;
  targetGeography: string | null;
  recommendedPrimaryKeyword: string | null;
  recommendedKeywordReason: string | null;
  mappingStatus:
    | 'mapped_approved'
    | 'mapped_pending'
    | 'unmapped'
    | 'conflict_detected';
  cannibalizationWarnings: string[];
  relatedClusterOpportunities: string[];
  optimizeExistingInsteadOfDuplicate: boolean;
}

export interface OnPageAnalysisRunRecord {
  id: string;
  tenantId: string;
  projectId: string;
  crawlId: string | null;
  strategyVersionId: string | null;
  status: 'running' | 'completed' | 'failed';
  pagesAnalyzedCount: number;
  issuesDetectedCount: number;
  unavailableEvidencePagesCount: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  summaryNote: string;
}

export interface OnPagePageAnalysisRecord {
  id: string;
  tenantId: string;
  projectId: string;
  analysisRunId: string;
  crawlId: string;
  crawlUrlId: string;
  url: string;
  slug: string;
  pageType: string;
  statusCode: number;
  indexability: 'Indexable' | 'Non-Indexable';
  canonicalUrl: string | null;
  canonicalStatus: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  htmlExtract: OnPageHtmlExtract;
  keywordContext: OnPageKeywordContext;
  suggestedSchemaTypes: string[];
  suggestedSubtopics: string[];
  scoreBreakdown: OnPageScoreBreakdown;
  overallScore: number | null;
  scoreStatus: 'scored' | 'insufficient_evidence';
  issueCount: number;
  criticalHighIssueCount: number;
  lifecycleStatus: OnPageLifecycleStatus;
  analyzedAt: string;
  updatedAt: string;
}

export interface OnPageIssueRecord {
  id: string;
  tenantId: string;
  projectId: string;
  analysisRunId: string;
  pageAnalysisId: string;
  pageUrl: string;
  issueKey: string;
  category: OnPageIssueCategory;
  severity: OnPageIssueSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  evidence: OnPageEvidenceRef[];
  approvalStatus: OnPageApprovalStatus;
  lifecycleStatus: OnPageLifecycleStatus;
  linkedRoadmapItemId: string | null;
  linkedTicketId: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  updatedAt: string;
}

export interface OnPageRecommendationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  pageAnalysisId: string;
  pageUrl: string;
  targetField: OnPageRecommendationTarget;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  relatedKeyword: string | null;
  searchIntent: KeywordIntent | null;
  evidence: OnPageEvidenceRef[];
  confidence: StrategyConfidence;
  isAiGenerated: boolean;
  aiModel: string | null;
  providerUsageEventId: string | null;
  approvalStatus: OnPageApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnPageDraftContentPayload {
  proposedTitle: string;
  proposedMetaDescription: string;
  proposedH1: string;
  proposedHeadings: { tag: string; text: string }[];
  proposedPrimaryKeyword: string | null;
  proposedSecondaryKeywords: string[];
  proposedImageAlts: { src: string; currentAlt: string | null; proposedAlt: string }[];
  proposedSchemaJsonLd: string;
  proposedSchemaTypes: string[];
  proposedContentNotes: string;
  proposedInternalLinks: {
    targetUrl: string;
    anchorText: string;
    rationale: string;
  }[];
}

export interface OnPageOptimizationDraftRecord {
  id: string;
  tenantId: string;
  projectId: string;
  pageAnalysisId: string;
  pageUrl: string;
  versionNumber: number;
  originalSnapshot: {
    title: string | null;
    metaDescription: string | null;
    h1: string | null;
    headings: { tag: string; text: string }[];
    primaryKeyword: string | null;
    detectedSchemaTypes: string[];
    missingAltCount: number;
    bodyTextExcerpt: string;
  };
  proposed: OnPageDraftContentPayload;
  changeSummary: string;
  approvalStatus: OnPageApprovalStatus;
  lifecycleStatus: OnPageLifecycleStatus;
  appliedExternallyAt: string | null;
  appliedExternallyBy: string | null;
  appliedExternallyChannel: string | null;
  appliedExternalNote: string | null;
  verifiedAt: string | null;
  verifiedCrawlId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnPageApprovalRecord {
  id: string;
  tenantId: string;
  projectId: string;
  entityKind: 'recommendation' | 'draft' | 'issue';
  entityId: string;
  pageUrl: string;
  entityLabel: string;
  previousStatus: string;
  newStatus: OnPageApprovalStatus;
  actorId: string;
  actorName: string;
  actorRole: string;
  comment: string;
  timestamp: string;
}

export interface ValidationFieldDiff {
  field: 'title' | 'meta_description' | 'h1' | 'schema' | 'image_alt';
  expected: string;
  observedInCrawl: string;
  matched: boolean;
  detail: string;
}

export interface OnPageValidationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  draftId: string;
  pageUrl: string;
  crawlId: string;
  verificationStatus: 'verified' | 'partially_verified' | 'not_reflected' | 'crawl_missing';
  matchedChecksCount: number;
  totalChecksCount: number;
  diffs: ValidationFieldDiff[];
  summary: string;
  validatedBy: string;
  validatedAt: string;
}

export interface CmsConnectionRecord {
  id: string;
  tenantId: string;
  projectId: string;
  platform: CmsPlatform;
  displayName: string;
  siteUrl: string;
  status: CmsConnectionStatus;
  hasEncryptedCredentials: boolean;
  autoPublishPermitted: false;
  lastTestedAt: string | null;
  lastError: string | null;
  createdBy: string;
  updatedAt: string;
}

export interface CmsPlatformDescriptor {
  platform: CmsPlatform;
  label: string;
  capabilities: string[];
  credentialFields: { key: string; label: string; secret: boolean }[];
  manualExportFormats: ('json' | 'csv' | 'markdown')[];
  publishRequiresApproval: true;
}

export interface OnPageWorkspaceOverviewMetrics {
  crawledPagesAnalyzed: number;
  pagesWithIssues: number;
  totalOpenIssues: number;
  pagesAwaitingApproval: number;
  draftRecommendationsCount: number;
  approvedDraftsCount: number;
  verifiedImprovementsCount: number;
  unavailableEvidenceCount: number;
  averageScore: number | null;
  scoredPagesCount: number;
}

export interface OnPageWorkspacePayload {
  projectId: string;
  projectName: string;
  projectWebsite: string;
  canEditOnPage: boolean;
  canApproveOnPage: boolean;
  canBulkApprove: boolean;
  canManageCms: boolean;
  canCreateTasks: boolean;
  canLaunchWorkflows: boolean;
  geminiConfigured: boolean;
  latestCrawlId: string | null;
  latestCrawlAt: string | null;
  latestRun: OnPageAnalysisRunRecord | null;
  overview: OnPageWorkspaceOverviewMetrics;
  pages: OnPagePageAnalysisRecord[];
  issues: OnPageIssueRecord[];
  recommendations: OnPageRecommendationRecord[];
  drafts: OnPageOptimizationDraftRecord[];
  approvals: OnPageApprovalRecord[];
  validations: OnPageValidationRecord[];
  module7InternalLinks: {
    id: string;
    sourceUrl: string;
    sourceTitle: string;
    targetUrl: string;
    targetTitle: string;
    suggestedAnchorText: string;
    linkCategory: string;
    existsInCrawl: boolean;
    currentInboundCount: number | null;
    reason: string;
    approvalStatus: string;
  }[];
  cmsConnections: CmsConnectionRecord[];
  cmsPlatforms: CmsPlatformDescriptor[];
  recentOnPageWorkflows: {
    workflowId: string;
    name: string;
    status: string;
    currentStage: string;
    createdAt: string;
    completedAt: string | null;
  }[];
  recommendedAgents: AgentStationId[];
}
