import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrawlURLRecord } from '../types/crawl';
import type { OnPageOptimizationDraftRecord } from '../types/onPage';
import {
  analyzeCrawledPagesForOnPage,
  computeExplainableOnPageScore,
  extractOnPageSignalsFromHtml,
  serializeOnPageReportToCsv,
  verifyDraftAgainstFreshCrawl,
} from './onPageEngine';

function makeCrawlUrl(overrides: Partial<CrawlURLRecord> = {}): CrawlURLRecord {
  const normalizedUrl =
    overrides.normalizedUrl ?? 'https://example.com/services/enterprise-seo';
  return {
    id: overrides.id ?? 'curl_1',
    crawlId: overrides.crawlId ?? 'crawl_1',
    tenantId: overrides.tenantId ?? 'tenant_a',
    normalizedUrl,
    requestedUrl: overrides.requestedUrl ?? normalizedUrl,
    finalUrl: overrides.finalUrl ?? normalizedUrl,
    parentUrl: overrides.parentUrl ?? null,
    discoverySource: overrides.discoverySource ?? 'seed',
    redirectChain: overrides.redirectChain ?? [],
    statusCode: overrides.statusCode ?? 200,
    contentType: overrides.contentType ?? 'text/html; charset=utf-8',
    responseTimeMs: overrides.responseTimeMs ?? 210,
    depth: overrides.depth ?? 1,
    indexability: overrides.indexability ?? 'Indexable',
    indexabilityReason: overrides.indexabilityReason ?? 'Indexable',
    canonicalUrl:
      overrides.canonicalUrl !== undefined
        ? overrides.canonicalUrl
        : normalizedUrl,
    canonicalStatus: overrides.canonicalStatus ?? 'self_referencing',
    title:
      overrides.title !== undefined
        ? overrides.title
        : 'Enterprise Technical SEO Services | Rovix AI',
    metaDescription:
      overrides.metaDescription !== undefined
        ? overrides.metaDescription
        : 'Evidence-driven technical SEO audits, crawl intelligence, and page optimization workflows built for enterprise marketing teams.',
    h1:
      overrides.h1 !== undefined
        ? overrides.h1
        : 'Enterprise Technical SEO Services',
    headings: overrides.headings ?? [
      { tag: 'h1', text: 'Enterprise Technical SEO Services' },
      { tag: 'h2', text: 'Audit Methodology' },
    ],
    robotsDirectives: overrides.robotsDirectives ?? ['index', 'follow'],
    xRobotsTag: overrides.xRobotsTag ?? null,
    schemaTypes: overrides.schemaTypes ?? ['Service'],
    schemaErrors: overrides.schemaErrors ?? [],
    hreflangTags: overrides.hreflangTags ?? [],
    internalLinks: overrides.internalLinks ?? [
      'https://example.com/',
      'https://example.com/contact',
    ],
    externalLinks: overrides.externalLinks ?? [],
    missingAltCount: overrides.missingAltCount ?? 0,
    hasViewport: overrides.hasViewport ?? true,
    htmlLang: overrides.htmlLang ?? 'en',
    inSitemap: overrides.inSitemap ?? true,
    issueCount: overrides.issueCount ?? 0,
    renderingSource: overrides.renderingSource ?? 'raw_html',
    renderedDiff: overrides.renderedDiff ?? null,
    rawHtmlObjectRef: overrides.rawHtmlObjectRef ?? null,
    renderedDomObjectRef: overrides.renderedDomObjectRef ?? null,
    fetchedAt: overrides.fetchedAt ?? '2026-11-20T00:00:00.000Z',
  };
}

test('extractOnPageSignalsFromHtml extracts visible text, headings, images, JSON-LD, and weak anchors safely', () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>Test Service</title>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Service","name":"SEO Audit"}
        </script>
        <script type="application/ld+json">{ invalid json</script>
        <style>.hidden { display: none; }</style>
      </head>
      <body>
        <main>
          <h1>Enterprise SEO Services</h1>
          <h3>Skipped heading level</h3>
          <p>Our engineering team delivers technical crawl diagnostics and structured data validation across complex domains.</p>
          <img src="/assets/architecture-diagram.png" />
          <img src="/assets/logo.svg" alt="" width="120" height="40" loading="lazy" />
          <a href="/pricing">Click here</a>
          <a href="/case-studies">Enterprise SEO Case Studies</a>
        </main>
        <script>console.log("ignore script text");</script>
      </body>
    </html>
  `;

  const extract = extractOnPageSignalsFromHtml({
    crawlUrl: makeCrawlUrl(),
    htmlSnapshot: html,
  });

  assert.equal(extract.htmlAvailable, true);
  assert.ok((extract.wordCount ?? 0) >= 15);
  assert.equal(extract.h1List.length, 1);
  assert.equal(extract.imagesTotal, 2);
  assert.equal(extract.imagesMissingAlt, 1);
  assert.equal(extract.imagesEmptyAlt, 1);
  assert.equal(extract.imagesMissingDimensions, 1);
  assert.equal(extract.jsonLdBlocks.length, 2);
  assert.equal(extract.invalidSchemaCount, 2);
  assert.ok(
    extract.jsonLdBlocks[0].missingRecommendedProps.includes('Service.provider'),
  );
  assert.equal(extract.weakAnchorCount, 1);
  assert.ok(!extract.bodyTextExcerpt.includes('ignore script text'));
});

test('computeExplainableOnPageScore returns Insufficient Evidence when fewer than 4 categories have evidence', () => {
  const result = computeExplainableOnPageScore([
    {
      category: 'title',
      label: 'Title',
      status: 'scored',
      score: 9,
      maxScore: 10,
      summary: 'Good',
      problems: [],
      recommendations: [],
      evidence: [],
    },
    {
      category: 'metaDescription',
      label: 'Meta',
      status: 'unavailable_evidence',
      score: null,
      maxScore: 10,
      summary: 'Unavailable',
      problems: [],
      recommendations: [],
      evidence: [],
    },
    {
      category: 'contentRelevance',
      label: 'Content',
      status: 'unavailable_evidence',
      score: null,
      maxScore: 15,
      summary: 'Unavailable',
      problems: [],
      recommendations: [],
      evidence: [],
    },
  ]);

  assert.equal(result.overallScore, null);
  assert.equal(result.scoreStatus, 'insufficient_evidence');
  assert.equal(result.scoredCategoriesCount, 1);
  assert.equal(result.unavailableCategoriesCount, 2);
});

test('analyzeCrawledPagesForOnPage detects duplicate titles, missing meta, cannibalization, and unavailable keyword evidence', () => {
  const url1 = makeCrawlUrl({
    id: 'u1',
    normalizedUrl: 'https://example.com/services/seo-audit',
    title: 'Shared Duplicate Title',
    metaDescription: null,
    h1: null,
    headings: [],
    missingAltCount: 2,
    schemaTypes: [],
  });
  const url2 = makeCrawlUrl({
    id: 'u2',
    normalizedUrl: 'https://example.com/blog/seo-audit-guide',
    title: 'Shared Duplicate Title',
    metaDescription:
      'A well-formed meta description covering enterprise technical SEO audits, crawl health monitoring, and actionable fixes for engineering teams.',
    h1: 'SEO Audit Guide',
    headings: [
      { tag: 'h1', text: 'SEO Audit Guide' },
      { tag: 'h2', text: 'Step One' },
    ],
  });

  const evaluations = analyzeCrawledPagesForOnPage({
    projectName: 'Example Corp',
    projectWebsite: 'https://example.com',
    crawledUrls: [url1, url2],
    htmlByUrlId: {
      u1: '<html><body><p>Short copy.</p><img src="/hero.jpg" /></body></html>',
      u2: null,
    },
    technicalIssues: [],
    keywords: [
      {
        id: 'kw1',
        tenantId: 'tenant_a',
        projectId: 'proj_a',
        researchRunId: null,
        keyword: 'enterprise seo audit',
        normalizedKeyword: 'enterprise seo audit',
        seedTopic: 'seo audit',
        primarySource: 'crawl_content',
        sources: ['crawl_content'],
        isAiSuggestion: false,
        intent: 'Commercial',
        intentInferred: false,
        intentVerifiedBy: 'Simon',
        intentConfidence: 92,
        intentReason: 'Commercial service query',
        targetCountry: 'US',
        targetCity: '',
        targetLanguage: 'en',
        metricGeographyScope: 'country',
        marketSearchVolume: null,
        volumeStatus: 'unavailable',
        volumeSource: 'unavailable',
        competitionLevel: 'unavailable',
        cpcEstimate: null,
        relativeTrendIndex: null,
        trendDirection: 'unavailable',
        gscClicks: null,
        gscImpressions: null,
        gscCtr: null,
        gscAvgPosition: null,
        gscObservedUrl: null,
        clusterId: null,
        clusterName: null,
        workflowState: 'approved',
        assignedTo: null,
        strategistNotes: '',
        scoreBreakdown: {
          businessRelevance: 90,
          searchIntent: 85,
          evidenceQuality: 80,
          marketRelevance: 85,
          pageSuitability: 80,
          competitionEvidence: 0,
          conversionPotential: 85,
          totalScore: 84,
          relevanceGatePassed: true,
          weights: {
            businessRelevance: 25,
            searchIntent: 15,
            evidenceQuality: 15,
            marketRelevance: 15,
            pageSuitability: 10,
            competitionEvidence: 10,
            conversionPotential: 10,
          },
          reasons: [],
        },
        opportunityScore: 84,
        mapping: null,
        evidence: [],
        approvedBy: 'Simon',
        approvedAt: '2026-11-20T00:00:00.000Z',
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
    ],
    clusters: [],
    keywordMappings: [
      {
        id: 'map1',
        tenantId: 'tenant_a',
        projectId: 'proj_a',
        keywordId: 'kw1',
        keyword: 'enterprise seo audit',
        targetUrl: 'https://example.com/services/seo-audit',
        mappingStatus: 'mapped_existing',
        recommendedSlug: null,
        pageTitle: 'Shared Duplicate Title',
        pageH1: null,
        pageStatusCode: 200,
        pageIndexable: true,
        matchConfidence: 90,
        cannibalizationRisk: 'high',
        competingUrls: ['https://example.com/blog/seo-audit-guide'],
        competingKeywordIds: [],
        resolutionRecommendation: 'Consolidate',
        updatedBy: 'Simon',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
      {
        id: 'map2',
        tenantId: 'tenant_a',
        projectId: 'proj_a',
        keywordId: 'kw1',
        keyword: 'enterprise seo audit',
        targetUrl: 'https://example.com/blog/seo-audit-guide',
        mappingStatus: 'mapped_existing',
        recommendedSlug: null,
        pageTitle: 'Shared Duplicate Title',
        pageH1: 'SEO Audit Guide',
        pageStatusCode: 200,
        pageIndexable: true,
        matchConfidence: 80,
        cannibalizationRisk: 'high',
        competingUrls: ['https://example.com/services/seo-audit'],
        competingKeywordIds: [],
        resolutionRecommendation: 'Differentiate',
        updatedBy: 'Simon',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
    ],
    approvedMarkets: [],
    contentGaps: [],
    architecturePages: [],
    internalLinkRecs: [],
  });

  const eval1 = evaluations.get('u1')!;
  const eval2 = evaluations.get('u2')!;

  assert.ok(eval1.issues.some((i) => i.issueKey === 'onpage_duplicate_title'));
  assert.ok(eval1.issues.some((i) => i.issueKey === 'onpage_missing_meta_description'));
  assert.ok(eval1.issues.some((i) => i.issueKey === 'onpage_missing_h1'));
  assert.ok(eval1.issues.some((i) => i.issueKey === 'onpage_thin_content'));
  assert.ok(eval1.issues.some((i) => i.issueKey === 'onpage_keyword_cannibalization'));
  assert.equal(eval1.keywordContext.mappingStatus, 'conflict_detected');

  // u2 has no HTML snapshot -> contentRelevance category must be unavailable_evidence, never fabricated
  const contentCat2 = eval2.scoreBreakdown.categories.find(
    (c) => c.category === 'contentRelevance',
  )!;
  assert.equal(contentCat2.status, 'unavailable_evidence');
  assert.equal(contentCat2.score, null);
});

test('verifyDraftAgainstFreshCrawl only marks verified when fresh crawl confirms expected title, meta, H1, schema, and image alts', () => {
  const draft: OnPageOptimizationDraftRecord = {
    id: 'draft_1',
    tenantId: 'tenant_a',
    projectId: 'proj_a',
    pageAnalysisId: 'pg_1',
    pageUrl: 'https://example.com/services/enterprise-seo',
    versionNumber: 1,
    originalSnapshot: {
      title: 'Old Title',
      metaDescription: null,
      h1: 'Old H1',
      headings: [],
      primaryKeyword: 'enterprise seo',
      detectedSchemaTypes: [],
      missingAltCount: 2,
      bodyTextExcerpt: '',
    },
    proposed: {
      proposedTitle: 'Enterprise Technical SEO Services | Example',
      proposedMetaDescription:
        'Enterprise technical SEO audits and crawl diagnostics to eliminate indexability bottlenecks and strengthen site architecture.',
      proposedH1: 'Enterprise Technical SEO Services',
      proposedHeadings: [],
      proposedPrimaryKeyword: 'enterprise seo',
      proposedSecondaryKeywords: [],
      proposedImageAlts: [
        { src: '/hero.png', currentAlt: null, proposedAlt: 'Enterprise SEO Architecture' },
      ],
      proposedSchemaJsonLd: '{"@context":"https://schema.org","@type":"Service","name":"SEO"}',
      proposedSchemaTypes: ['Service'],
      proposedContentNotes: '',
      proposedInternalLinks: [],
    },
    changeSummary: 'Initial optimization',
    approvalStatus: 'approved',
    lifecycleStatus: 'applied_externally',
    appliedExternallyAt: '2026-11-20T01:00:00.000Z',
    appliedExternallyBy: 'Simon',
    appliedExternallyChannel: 'manual_cms_update',
    appliedExternalNote: null,
    verifiedAt: null,
    verifiedCrawlId: null,
    createdBy: 'Simon',
    updatedBy: 'Simon',
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T01:00:00.000Z',
  };

  // Unchanged crawl -> not_reflected
  const before = verifyDraftAgainstFreshCrawl({
    draft,
    freshCrawlUrl: makeCrawlUrl({
      title: 'Old Title',
      metaDescription: null,
      h1: 'Old H1',
      schemaTypes: [],
      missingAltCount: 2,
    }),
    freshHtmlSnapshot: '<html><body><h1>Old H1</h1><img src="/hero.png" /></body></html>',
  });
  assert.equal(before.verificationStatus, 'not_reflected');
  assert.equal(before.matchedChecksCount, 0);

  // Updated fresh crawl -> verified
  const after = verifyDraftAgainstFreshCrawl({
    draft,
    freshCrawlUrl: makeCrawlUrl({
      crawlId: 'crawl_2',
      title: 'Enterprise Technical SEO Services | Example',
      metaDescription:
        'Enterprise technical SEO audits and crawl diagnostics to eliminate indexability bottlenecks and strengthen site architecture.',
      h1: 'Enterprise Technical SEO Services',
      schemaTypes: ['Service'],
      missingAltCount: 0,
    }),
    freshHtmlSnapshot:
      '<html><head><script type="application/ld+json">{"@type":"Service","name":"SEO","provider":{"@type":"Organization","name":"Example"}}</script></head><body><h1>Enterprise Technical SEO Services</h1><img src="/hero.png" alt="Enterprise SEO Architecture" /></body></html>',
  });
  assert.equal(after.verificationStatus, 'verified');
  assert.equal(after.matchedChecksCount, after.totalChecksCount);
});

test('serializeOnPageReportToCsv produces escaped CSV headers and rows', () => {
  const csv = serializeOnPageReportToCsv([
    {
      id: 'pg_1',
      tenantId: 't1',
      projectId: 'p1',
      analysisRunId: 'run1',
      crawlId: 'c1',
      crawlUrlId: 'u1',
      url: 'https://example.com/',
      slug: '/',
      pageType: 'homepage',
      statusCode: 200,
      indexability: 'Indexable',
      canonicalUrl: 'https://example.com/',
      canonicalStatus: 'self',
      title: 'Home, "Quoted" Title',
      metaDescription: 'Desc',
      h1: 'Home',
      htmlExtract: {
        htmlAvailable: true,
        renderingSource: 'raw_html',
        wordCount: 320,
        bodyTextExcerpt: 'Hello',
        headings: [],
        h1List: ['Home'],
        images: [],
        imagesTotal: 1,
        imagesMissingAlt: 0,
        imagesEmptyAlt: 0,
        imagesMissingDimensions: 0,
        jsonLdBlocks: [],
        detectedSchemaTypes: ['Organization'],
        invalidSchemaCount: 0,
        internalAnchors: [],
        weakAnchorCount: 0,
      },
      keywordContext: {
        existingPrimaryKeyword: 'enterprise seo',
        secondaryKeywords: [],
        searchIntent: 'Commercial',
        targetGeography: 'US',
        recommendedPrimaryKeyword: null,
        recommendedKeywordReason: null,
        mappingStatus: 'mapped_approved',
        cannibalizationWarnings: [],
        relatedClusterOpportunities: [],
        optimizeExistingInsteadOfDuplicate: false,
      },
      suggestedSchemaTypes: [],
      suggestedSubtopics: [],
      scoreBreakdown: {
        overallScore: 88,
        scoreStatus: 'scored',
        scoredCategoriesCount: 10,
        unavailableCategoriesCount: 0,
        caveat: 'Test',
        categories: [],
      },
      overallScore: 88,
      scoreStatus: 'scored',
      issueCount: 1,
      criticalHighIssueCount: 0,
      lifecycleStatus: 'detected',
      analyzedAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
    },
  ]);

  assert.ok(csv.startsWith('URL,Page Type,HTTP Status'));
  assert.ok(csv.includes('"Home, ""Quoted"" Title"'));
});
