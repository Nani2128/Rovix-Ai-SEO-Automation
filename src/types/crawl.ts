export type CrawlJobState =
  | 'Queued'
  | 'Running'
  | 'Retrying'
  | 'Succeeded'
  | 'Partial'
  | 'Failed'
  | 'Cancelled';

export type VerificationMethod = 'DNS_TXT' | 'HTML_FILE' | 'GSC_OAUTH';

export type QueryParamPolicy = 'ignore_all' | 'keep_all' | 'allowlist';

export type CrawlScopeMode = 'internal_only' | 'authorized_subdomains';

export interface ProjectDomainVerification {
  id: string;
  tenantId: string;
  projectId: string;
  canonicalDomain: string;
  verificationMethod: VerificationMethod;
  verificationToken: string;
  verified: boolean;
  crawlPolicyApproved: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface CrawlConfigurationData {
  projectId: string;
  startingUrl: string;
  maxPages: number;
  maxDepth: number;
  maxConcurrency: number;
  requestDelayMs: number;
  includePatterns: string[];
  excludePatterns: string[];
  queryParamPolicy: QueryParamPolicy;
  queryAllowlist: string[];
  discoverSitemaps: boolean;
  enableJsRendering: boolean;
  scopeMode: CrawlScopeMode;
  respectRobotsTxt: boolean;
}

export interface CrawlRunSummary {
  statusDistribution: Record<string, number>;
  indexableCount: number;
  nonIndexableCount: number;
  redirectCount: number;
  brokenCount: number;
  issuesTotal: number;
  issuesCritical: number;
  issuesHigh: number;
  issuesMedium: number;
  issuesLow: number;
  issuesInfo: number;
  sitemapUrlCount: number;
  sitemapOnlyCount: number;
  jsRenderedCount: number;
  jsRenderFailureCount: number;
  healthScore: number;
}

export interface CrawlRun {
  id: string;
  tenantId: string;
  projectId: string;
  status: CrawlJobState;
  crawlType: 'full' | 'reverification';
  configuration: CrawlConfigurationData;
  startedAt: string;
  completedAt: string | null;
  discoveredCount: number;
  processedCount: number;
  errorCount: number;
  summary: CrawlRunSummary;
  robotsSnapshotRef: string | null;
  sitemapSummary: SitemapAnalysisSummary | null;
  triggeredBy: string;
}

export interface RobotsRuleGroup {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelaySec: number | null;
}

export interface RobotsAnalysisResult {
  fetchedUrl: string;
  statusCode: number | null;
  accessible: boolean;
  malformed: boolean;
  parseErrors: string[];
  sitemaps: string[];
  groups: RobotsRuleGroup[];
  rawText: string;
  fetchedAt: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  sourceSitemap: string;
}

export interface SitemapAnalysisSummary {
  discoveredSitemapUrls: string[];
  parsedCount: number;
  malformedSitemaps: { url: string; reason: string }[];
  totalEntries: number;
  sitemapOnlyUrls: string[];
  noindexInSitemapUrls: string[];
}

export interface RedirectHop {
  url: string;
  statusCode: number;
  location: string | null;
}

export interface HreflangTag {
  lang: string;
  href: string;
  resolvedStatus?: number | null;
  hasReturnLink?: boolean;
}

export interface RenderedDiffSummary {
  attempted: boolean;
  status: 'ok' | 'unavailable' | 'failed';
  reason?: string;
  rawTitle: string | null;
  renderedTitle: string | null;
  rawCanonical: string | null;
  renderedCanonical: string | null;
  rawH1: string | null;
  renderedH1: string | null;
  rawRobots: string[];
  renderedRobots: string[];
  addedLinksCount: number;
  addedLinks: string[];
}

export interface CrawlURLRecord {
  id: string;
  tenantId: string;
  crawlId: string;
  normalizedUrl: string;
  requestedUrl: string;
  finalUrl: string;
  parentUrl: string | null;
  discoverySource: 'seed' | 'internal_link' | 'sitemap' | 'canonical' | 'js_dom';
  redirectChain: RedirectHop[];
  statusCode: number;
  contentType: string;
  responseTimeMs: number;
  depth: number;
  indexability: 'Indexable' | 'Non-Indexable';
  indexabilityReason: string;
  canonicalUrl: string | null;
  canonicalStatus:
    | 'self_referencing'
    | 'missing'
    | 'multiple'
    | 'points_other'
    | 'points_error'
    | 'chain'
    | 'conflict';
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: { tag: string; text: string }[];
  robotsDirectives: string[];
  xRobotsTag: string | null;
  schemaTypes: string[];
  schemaErrors: string[];
  hreflangTags: HreflangTag[];
  internalLinks: string[];
  externalLinks: string[];
  missingAltCount: number;
  hasViewport: boolean;
  htmlLang: string | null;
  inSitemap: boolean;
  issueCount: number;
  renderingSource: 'raw_html' | 'rendered_dom';
  renderedDiff: RenderedDiffSummary | null;
  rawHtmlObjectRef: string | null;
  renderedDomObjectRef: string | null;
  fetchedAt: string;
}

export interface CrawlEventRecord {
  id: string;
  tenantId: string;
  crawlId: string;
  eventType:
    | 'crawl_queued'
    | 'crawl_started'
    | 'robots_parsed'
    | 'sitemap_parsed'
    | 'url_discovered'
    | 'url_crawled'
    | 'url_retry'
    | 'url_error'
    | 'issue_detected'
    | 'crawl_completed'
    | 'crawl_cancelled'
    | 'reverification_completed';
  payload: Record<string, unknown>;
  timestamp: string;
}
