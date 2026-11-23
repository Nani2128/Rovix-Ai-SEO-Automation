import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import {
  createProjectRecord,
  createTenantAndUser,
  getAuditDb,
  getKeywordBusinessProfile,
  replaceGscMetrics,
  resetDbConnectionForTests,
} from '../audit/db';
import type { KeywordBusinessProfile, KeywordIntelligenceRecord } from '../../types/keywords';
import {
  canUserApproveKeywords,
  classifyKeywordIntent,
  clusterKeywords,
  detectKeywordCannibalization,
  evaluateBusinessRelevance,
  isValidKeywordStateTransition,
  requiresOwnerApprovedProfile,
  scoreKeywordOpportunity,
} from './intelligenceEngine';
import {
  addManualKeywordRecord,
  exportKeywordStrategyBundle,
  getKeywordWorkspace,
  mergeKeywordClustersWorkflow,
  transitionKeywordWorkflowState,
  updateBusinessProfileWorkflow,
  updateKeywordClusterWorkflow,
  updateKeywordIntentOrMapping,
} from './keywordService';
import {
  fetchCrawlContentKeywordCandidates,
  fetchCompetitorPageTopics,
  fetchGoogleAdsKeywordPlannerStatus,
  fetchGscKeywordSignals,
} from './providers';

let tempDir = '';
let prevDbPath: string | undefined;

before(() => {
  prevDbPath = process.env.ROVIX_DB_PATH;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-phase7-test-'));
  process.env.ROVIX_DB_PATH = path.join(tempDir, 'test-rovix-kw.db');
  resetDbConnectionForTests();
});

after(() => {
  resetDbConnectionForTests();
  if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
  else process.env.ROVIX_DB_PATH = prevDbPath;
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeProfile(overrides?: Partial<KeywordBusinessProfile>): KeywordBusinessProfile {
  return {
    id: 'kwprof-test',
    tenantId: 'ten-test',
    projectId: 'proj-test',
    approvedNiche: 'B2B Technical SEO & Core Web Vitals Agency',
    approvedServices: [
      'technical seo audit',
      'core web vitals optimization',
      'enterprise seo consulting',
    ],
    targetAudience: 'SaaS Marketing Leaders',
    targetCountry: 'US',
    targetCity: 'Austin',
    targetLanguage: 'en',
    competitorUrls: [],
    approvalStatus: 'approved',
    approvedBy: 'Simon Baler',
    approvedAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

test('Phase 7.1: Intent classification labels all 5 search intents as inferred with reasons', () => {
  const transactional = classifyKeywordIntent('hire technical seo audit services');
  assert.equal(transactional.intent, 'Transactional');
  assert.equal(transactional.intentInferred, true);

  const commercial = classifyKeywordIntent('best enterprise seo platform comparison');
  assert.equal(commercial.intent, 'Commercial');
  assert.equal(commercial.intentInferred, true);

  const local = classifyKeywordIntent('technical seo consultant austin near me', {
    targetCity: 'Austin',
  });
  assert.equal(local.intent, 'Local');
  assert.equal(local.intentInferred, true);

  const nav = classifyKeywordIntent('rovixai login dashboard', {
    brandDomain: 'rovixai.com',
  });
  assert.equal(nav.intent, 'Navigational');
  assert.equal(nav.intentInferred, true);

  const info = classifyKeywordIntent('how to improve largest contentful paint');
  assert.equal(info.intent, 'Informational');
  assert.equal(info.intentInferred, true);
});

test('Phase 7.2: Business relevance gate blocks unrelated queries and scoring never fabricates missing competition metrics', () => {
  const profile = makeProfile();

  const offTopic = evaluateBusinessRelevance({
    keyword: 'cheap running shoes discount',
    profile,
    seedTerms: profile.approvedServices,
  });
  assert.equal(offTopic.passed, false);

  const offTopicScore = scoreKeywordOpportunity({
    keyword: 'cheap running shoes discount',
    intent: 'Transactional',
    profile,
    seedTerms: profile.approvedServices,
    sourcesCount: 1,
    isAiSuggestion: false,
    marketSearchVolume: null,
    competitionLevel: 'unavailable',
    relativeTrendIndex: null,
    trendDirection: 'unavailable',
    gscClicks: null,
    gscImpressions: null,
    gscAvgPosition: null,
    targetCountry: 'US',
    targetCity: '',
    mappedPageIndexable: null,
    mappedStatusCode: null,
    mappedExistingUrl: null,
  });
  assert.equal(offTopicScore.relevanceGatePassed, false);
  assert.equal(offTopicScore.competitionEvidence, 0);
  assert.ok(offTopicScore.totalScore <= 34);

  const onTopicScore = scoreKeywordOpportunity({
    keyword: 'technical seo audit agency',
    intent: 'Transactional',
    profile,
    seedTerms: profile.approvedServices,
    sourcesCount: 2,
    isAiSuggestion: false,
    marketSearchVolume: null,
    competitionLevel: 'unavailable',
    relativeTrendIndex: 74,
    trendDirection: 'rising',
    gscClicks: 42,
    gscImpressions: 950,
    gscAvgPosition: 7.4,
    targetCountry: 'US',
    targetCity: '',
    mappedPageIndexable: true,
    mappedStatusCode: 200,
    mappedExistingUrl: 'https://example.com/technical-seo-audit',
  });
  assert.equal(onTopicScore.relevanceGatePassed, true);
  assert.equal(onTopicScore.competitionEvidence, 0);
  assert.ok(onTopicScore.totalScore >= 70);
  assert.ok(onTopicScore.reasons.some((r) => /unavailable/i.test(r)));
});

test('Phase 7.3: Semantic clustering groups tightly aligned terms and leaves unrelated terms unclustered cleanly', () => {
  const profile = makeProfile();
  const makeRecord = (id: string, keyword: string, intent: KeywordIntelligenceRecord['intent']): KeywordIntelligenceRecord => {
    const sb = scoreKeywordOpportunity({
      keyword,
      intent,
      profile,
      seedTerms: profile.approvedServices,
      sourcesCount: 1,
      isAiSuggestion: false,
      marketSearchVolume: null,
      competitionLevel: 'unavailable',
      relativeTrendIndex: null,
      trendDirection: 'unavailable',
      gscClicks: null,
      gscImpressions: 200,
      gscAvgPosition: 11,
      targetCountry: 'US',
      targetCity: '',
      mappedPageIndexable: true,
      mappedStatusCode: 200,
      mappedExistingUrl: null,
    });
    return {
      id,
      tenantId: 'ten-test',
      projectId: 'proj-test',
      researchRunId: null,
      keyword,
      normalizedKeyword: keyword.toLowerCase(),
      seedTopic: 'technical seo audit',
      primarySource: 'crawl_content',
      sources: ['crawl_content'],
      isAiSuggestion: false,
      intent,
      intentInferred: true,
      intentVerifiedBy: null,
      intentConfidence: 0.85,
      intentReason: 'test',
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
      gscImpressions: 200,
      gscCtr: null,
      gscAvgPosition: 11,
      gscObservedUrl: null,
      clusterId: null,
      clusterName: null,
      workflowState: 'recommended',
      assignedTo: null,
      strategistNotes: '',
      scoreBreakdown: sb,
      opportunityScore: sb.totalScore,
      mapping: null,
      evidence: [],
      approvedBy: null,
      approvedAt: null,
      createdAt: '2026-11-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
    };
  };

  const kw1 = makeRecord('k1', 'technical seo audit service', 'Transactional');
  const kw2 = makeRecord('k2', 'technical seo audit checklist', 'Informational');
  const kw3 = makeRecord('k3', 'core web vitals consulting', 'Transactional');

  const res = clusterKeywords({
    tenantId: 'ten-test',
    projectId: 'proj-test',
    keywords: [kw1, kw2, kw3],
    existingApprovedClusters: [],
    crawledPages: [],
  });

  assert.equal(res.clusters.length, 1);
  assert.deepEqual(new Set(res.clusters[0].keywordIds), new Set(['k1', 'k2']));
  // Singleton unrelated topic remains cleanly unclustered
  assert.equal(res.assignments.has('k3'), false);
});

test('Phase 7.4: SSRF guard blocks loopback & metadata competitor URLs without executing remote fetch', async () => {
  const res = await fetchCompetitorPageTopics({
    competitorUrls: [
      'http://127.0.0.1:3000/admin',
      'http://169.254.169.254/latest/meta-data/',
    ],
  });
  assert.equal(res.candidates.length, 0);
  assert.equal(res.status.state, 'blocked');
  assert.match(res.status.detail, /SSRF Blocked/i);
});

test('Phase 7.5: Keyword Planner returns credentials_required cleanly without API credentials', async () => {
  const prevDev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  try {
    const status = await fetchGoogleAdsKeywordPlannerStatus();
    assert.equal(status.state, 'credentials_required');
    assert.equal(status.configured, false);
    assert.match(status.detail, /Unavailable/i);
  } finally {
    if (prevDev !== undefined) process.env.GOOGLE_ADS_DEVELOPER_TOKEN = prevDev;
  }
});

test('Phase 7.6: End-to-end DB workflows, honest GSC vs Volume separation, cannibalization, 412 profile gate, RBAC, cluster merge, export, and tenant isolation', () => {
  const owner = createTenantAndUser({
    organizationName: 'Keyword Org Alpha',
    name: 'Simon Owner',
    email: 'simon-kw@alpha.test',
    password: 'StrongPassword!1',
    role: 'Agency Owner',
  });
  const qaUser = createTenantAndUser({
    organizationName: 'Keyword Org Alpha QA',
    name: 'Maya QA',
    email: 'maya-kw@alpha.test',
    password: 'StrongPassword!1',
    role: 'QA',
  });
  // Put QA inside same tenant for role test
  const qaInOwnerTenant = { ...qaUser.user, tenantId: owner.tenant.id };

  const tenantB = createTenantAndUser({
    organizationName: 'Keyword Org Beta',
    name: 'Bob Beta',
    email: 'bob-kw@beta.test',
    password: 'StrongPassword!1',
    role: 'Agency Owner',
  });

  const projA = createProjectRecord({
    tenantId: owner.tenant.id,
    name: 'Alpha SEO Agency',
    website: 'alpha-seo.example',
    owner: owner.user.name,
  });
  const projB = createProjectRecord({
    tenantId: tenantB.tenant.id,
    name: 'Beta SaaS',
    website: 'beta.example',
    owner: tenantB.user.name,
  });

  // Seed crawled pages (2 competing pages for "technical seo audit") + real GSC signal
  const db = getAuditDb();
  const nowIso = '2026-11-16T00:00:00.000Z';
  db.prepare(
    `INSERT INTO crawl_runs (
      id, tenant_id, project_id, status, crawl_type, configuration_json,
      started_at, completed_at, discovered_count, processed_count, error_count,
      summary_json, triggered_by
    ) VALUES (?, ?, ?, 'Completed', 'full', '{}', ?, ?, 2, 2, 0, '{}', ?)`,
  ).run('crawl-1', owner.tenant.id, projA.id, nowIso, nowIso, owner.user.name);

  const insertUrl = db.prepare(
    `INSERT INTO crawl_urls (
      id, tenant_id, crawl_id, normalized_url, requested_url, final_url,
      discovery_source, redirect_chain_json, status_code, content_type, response_time_ms,
      depth, indexability, indexability_reason, canonical_url, canonical_status,
      title, meta_description, h1, headings_json, robots_directives_json,
      schema_types_json, schema_errors_json, hreflang_json, internal_links_json,
      external_links_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'seed', '[]', 200, 'text/html', 140, ?, 'Indexable', 'Indexable', ?, 'Self-Referencing', ?, 'Desc', ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', ?)`,
  );
  insertUrl.run(
    'pg-1',
    owner.tenant.id,
    'crawl-1',
    'https://alpha-seo.example/technical-seo-audit',
    'https://alpha-seo.example/technical-seo-audit',
    'https://alpha-seo.example/technical-seo-audit',
    1,
    'https://alpha-seo.example/technical-seo-audit',
    'Technical SEO Audit Service',
    'Technical SEO Audit',
    JSON.stringify(['Technical SEO Audit', 'Core Web Vitals']),
    nowIso,
  );
  insertUrl.run(
    'pg-2',
    owner.tenant.id,
    'crawl-1',
    'https://alpha-seo.example/blog/technical-seo-audit-guide',
    'https://alpha-seo.example/blog/technical-seo-audit-guide',
    'https://alpha-seo.example/blog/technical-seo-audit-guide',
    2,
    'https://alpha-seo.example/blog/technical-seo-audit-guide',
    'Technical SEO Audit Checklist',
    'Technical SEO Audit Guide',
    JSON.stringify(['Technical SEO Audit Guide']),
    nowIso,
  );

  replaceGscMetrics({
    tenantId: owner.tenant.id,
    projectId: projA.id,
    daily: [
      {
        date: '2026-11-15',
        clicks: 45,
        impressions: 1200,
        ctr: 0.0375,
        avgPosition: 8.2,
      },
    ],
    queries: [
      {
        query: 'technical seo audit',
        clicks: 45,
        impressions: 1200,
        ctr: 0.0375,
        avgPosition: 8.2,
        page: 'https://alpha-seo.example/technical-seo-audit',
      },
    ],
  });

  const gscSignals = fetchGscKeywordSignals(owner.tenant.id, projA.id);
  assert.equal(gscSignals.candidates.length, 1);
  assert.equal(gscSignals.candidates[0].measurementKind, 'observed_site_traffic');

  const crawlSignals = fetchCrawlContentKeywordCandidates(owner.tenant.id, projA.id);
  assert.ok(crawlSignals.candidates.length >= 2);

  // Add manual keyword before business profile is approved -> volume must be null ("unavailable")
  const defaultProfile = getKeywordBusinessProfile(owner.tenant.id, projA.id);
  assert.equal(defaultProfile.approvalStatus, 'pending_owner_approval');

  const kwManual = addManualKeywordRecord({
    tenantId: owner.tenant.id,
    projectId: projA.id,
    user: owner.user,
    keyword: 'technical seo audit',
    targetUrl: 'https://alpha-seo.example/technical-seo-audit',
    notes: 'Core commercial target',
  });
  assert.equal(kwManual.marketSearchVolume, null);
  assert.equal(kwManual.volumeStatus, 'unavailable');

  // RBAC: QA user cannot approve business profile or keyword state
  assert.equal(canUserApproveKeywords('QA'), false);
  assert.throws(
    () =>
      transitionKeywordWorkflowState({
        tenantId: owner.tenant.id,
        keywordId: kwManual.id,
        user: qaInOwnerTenant,
        nextState: 'approved',
      }),
    /FORBIDDEN/,
  );

  // Governance Gate: Approver cannot approve keyword while business profile is pending_owner_approval (412 PRECONDITION_FAILED)
  assert.equal(requiresOwnerApprovedProfile('approved'), true);
  assert.throws(
    () =>
      transitionKeywordWorkflowState({
        tenantId: owner.tenant.id,
        keywordId: kwManual.id,
        user: owner.user,
        nextState: 'approved',
      }),
    /PRECONDITION_FAILED/,
  );

  // Approve Business Context Profile as Owner
  const approvedProfile = updateBusinessProfileWorkflow({
    tenantId: owner.tenant.id,
    projectId: projA.id,
    user: owner.user,
    approvedNiche: 'B2B Technical SEO Agency',
    approvedServices: ['technical seo audit', 'core web vitals consulting'],
    targetAudience: 'SaaS Marketing Teams',
    targetCountry: 'US',
    targetCity: 'Austin',
    targetLanguage: 'en',
    competitorUrls: [],
    approveProfile: true,
  });
  assert.equal(approvedProfile.approvalStatus, 'approved');

  // Now full 9-state lifecycle transition works cleanly
  assert.equal(isValidKeywordStateTransition('needs-data', 'approved'), true);
  const kwApproved = transitionKeywordWorkflowState({
    tenantId: owner.tenant.id,
    keywordId: kwManual.id,
    user: owner.user,
    nextState: 'approved',
    notes: 'Approved after context review',
  });
  assert.equal(kwApproved.workflowState, 'approved');

  const kwAssigned = transitionKeywordWorkflowState({
    tenantId: owner.tenant.id,
    keywordId: kwManual.id,
    user: owner.user,
    nextState: 'assigned',
    assignedTo: 'SEO Strategist',
  });
  assert.equal(kwAssigned.workflowState, 'assigned');

  const kwMeasured = transitionKeywordWorkflowState({
    tenantId: owner.tenant.id,
    keywordId: kwManual.id,
    user: owner.user,
    nextState: 'implemented',
  });
  assert.equal(kwMeasured.workflowState, 'implemented');

  const kwVerifiedIntent = updateKeywordIntentOrMapping({
    tenantId: owner.tenant.id,
    keywordId: kwManual.id,
    user: owner.user,
    intent: 'Transactional',
  });
  assert.equal(kwVerifiedIntent.intentInferred, false);
  assert.equal(kwVerifiedIntent.intentVerifiedBy, owner.user.name);

  // Cannibalization detection catches the 2 crawled pages matching "technical seo audit"
  const workspaceA = getKeywordWorkspace(owner.tenant.id, projA.id);
  assert.ok(workspaceA.cannibalizationAlerts.length >= 1);
  assert.equal(
    workspaceA.cannibalizationAlerts[0].kind,
    'multiple_pages_ranking',
  );
  assert.ok(workspaceA.recentAuditTrail.length >= 4);

  // Export bundle contains full workspace without crashing
  const exported = exportKeywordStrategyBundle(owner.tenant.id, projA.id);
  assert.equal(exported.keywords.length, 1);

  // Tenant isolation check: tenant B cannot inspect or access projA workspace
  assert.throws(
    () => getKeywordWorkspace(tenantB.tenant.id, projA.id),
    /NOT_FOUND/,
  );
  const workspaceB = getKeywordWorkspace(tenantB.tenant.id, projB.id);
  assert.equal(workspaceB.keywords.length, 0);

  // Verify cluster update/merge error guards cleanly
  assert.throws(
    () =>
      updateKeywordClusterWorkflow({
        tenantId: tenantB.tenant.id,
        clusterId: 'missing-cluster',
        user: tenantB.user,
      }),
    /NOT_FOUND/,
  );
  assert.throws(
    () =>
      mergeKeywordClustersWorkflow({
        tenantId: owner.tenant.id,
        projectId: projA.id,
        user: owner.user,
        clusterIds: ['only-one'],
      }),
    /BAD_REQUEST/,
  );

  // Verify direct cannibalization detection for distinct intents sharing same URL
  const { alerts: sameUrlAlerts } = detectKeywordCannibalization({
    keywords: [
      { ...kwVerifiedIntent, id: 'c-1', keyword: 'technical seo pricing', intent: 'Transactional' },
      { ...kwVerifiedIntent, id: 'c-2', keyword: 'what is technical seo', intent: 'Informational' },
    ],
    crawledPages: [],
  });
  assert.ok(sameUrlAlerts.some((a) => a.kind === 'competing_keywords_same_url'));
});
