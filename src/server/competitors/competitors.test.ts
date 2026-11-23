import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { User } from '../../types/auth';
import type { CompetitorProfileRecord } from '../../types/competitors';
import {
  createProjectRecord,
  createTenantAndUser,
  getAuditDb,
  listKeywordIntelligenceRecords,
  listTicketsForProject,
  resetDbConnectionForTests,
  upsertCompetitorPageSnapshot,
} from '../audit/db';
import { validateOutboundUrl } from '../audit/security';
import {
  applyCompetitorRecommendation,
  buildCompetitorComparisonRows,
  canUserApproveCompetitors,
  canUserApproveContentGaps,
  canUserManageCompetitors,
  computeKeywordOverlap,
  discoverInternalLinksFromHtml,
  extractHtmlPageSignals,
  extractJsonLdSchemaTypes,
  identifyContentGaps,
  normalizeCompetitorDomain,
} from './competitorEngine';
import {
  analyzeCompetitorUrlsLive,
  discoverCompetitorsViaSerpApi,
} from './competitorProviders';
import {
  decideCompetitorApprovalWorkflow,
  decideContentGapWorkflow,
  deleteCompetitorWorkflow,
  exportCompetitorReportBundle,
  getCompetitorWorkspace,
  upsertCompetitorWorkflow,
} from './competitorService';
import {
  addManualKeywordRecord,
  updateBusinessProfileWorkflow,
} from '../keywords/keywordService';
import { upsertTargetMarketWorkflow } from '../geo/geoService';

const OWNER_USER: User = {
  id: 'usr-owner-comp',
  name: 'Elena Owner',
  email: 'elena@comp.test',
  role: 'Business Owner',
  avatarInitials: 'EO',
  title: 'Business Owner',
};

const STRATEGIST_USER: User = {
  id: 'usr-strat-comp',
  name: 'Alex Strategist',
  email: 'alex@comp.test',
  role: 'SEO Strategist',
  avatarInitials: 'AS',
  title: 'Senior Strategist',
};

const QA_USER: User = {
  id: 'usr-qa-comp',
  name: 'Maya QA',
  email: 'maya@comp.test',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Reviewer',
};

function setupTempDb() {
  const prevDbPath = process.env.ROVIX_DB_PATH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-comp-test-'));
  process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-comp.db');
  resetDbConnectionForTests();
  return () => {
    resetDbConnectionForTests();
    if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
    else process.env.ROVIX_DB_PATH = prevDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
}

function seedCrawlBaselinePage(params: {
  tenantId: string;
  projectId: string;
  url: string;
  title: string;
  h1: string;
  headings?: string[];
  schemaTypes?: string[];
}) {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const crawlId = `crw-test-${params.projectId}`;
  db.prepare(`
    INSERT OR IGNORE INTO crawl_runs (
      id, tenant_id, project_id, status, crawl_type, configuration_json,
      started_at, completed_at, discovered_count, processed_count, error_count,
      summary_json, robots_snapshot_ref, sitemap_summary_json, triggered_by
    ) VALUES (?, ?, ?, 'Succeeded', 'full', '{}', ?, ?, 1, 1, 0, '{}', NULL, NULL, 'Test')
  `).run(crawlId, params.tenantId, params.projectId, now, now);

  db.prepare(`
    INSERT INTO crawl_urls (
      id, tenant_id, crawl_id, normalized_url, requested_url, final_url, parent_url,
      discovery_source, redirect_chain_json, status_code, content_type, response_time_ms,
      depth, indexability, indexability_reason, canonical_url, canonical_status,
      title, meta_description, h1, headings_json, robots_directives_json, x_robots_tag,
      schema_types_json, schema_errors_json, hreflang_json, internal_links_json, external_links_json,
      missing_alt_count, has_viewport, html_lang, in_sitemap, issue_count, rendering_source, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'seed', '[]', 200, 'text/html', 120,
      0, 'Indexable', 'HTTP 200', ?, 'self_referencing', ?, 'Test meta', ?, ?, '[]', NULL,
      ?, '[]', '[]', '[]', '[]', 0, 1, 'en', 1, 0, 'raw_html', ?)
  `).run(
    `curl-${Math.random().toString(36).slice(2, 10)}`,
    params.tenantId,
    crawlId,
    params.url,
    params.url,
    params.url,
    params.url,
    params.title,
    params.h1,
    JSON.stringify(params.headings ?? []),
    JSON.stringify(params.schemaTypes ?? []),
    now,
  );
}

test('domain normalization and SSRF guard block private/loopback/metadata targets', async () => {
  const norm = normalizeCompetitorDomain('https://www.ExampleRival.com/pricing?ref=1');
  assert.equal(norm.domain, 'examplerival.com');
  assert.equal(norm.homepageUrl, 'https://www.examplerival.com');

  assert.throws(() => normalizeCompetitorDomain('localhost'), /not a valid public domain/i);
  assert.throws(() => normalizeCompetitorDomain(''), /required/i);

  await assert.rejects(() => validateOutboundUrl('http://127.0.0.1:8080/secret'));
  await assert.rejects(() => validateOutboundUrl('http://169.254.169.254/latest/meta-data/'));
});

test('HTML page parser extracts real title, headings, visible words, JSON-LD, and internal links without fake metrics', () => {
  const sampleHtml = `
    <!doctype html>
    <html>
      <head>
        <title>Technical SEO Audit Software | RivalCo</title>
        <meta name="description" content="Automated site crawl audits and indexability reports." />
        <meta property="og:title" content="Technical SEO Audit Software" />
        <link rel="canonical" href="https://rivalco.example/seo-audit-software" />
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication"},{"@type":"FAQPage"}]}
        </script>
      </head>
      <body>
        <script>console.log("should not count as visible words");</script>
        <nav><a href="/privacy">Privacy Policy</a> <a href="/services/technical-seo-audit">Technical SEO Services</a></nav>
        <main>
          <h1>Technical SEO Audit Platform</h1>
          <h2>Core Web Vitals Monitoring</h2>
          <h2>Structured Schema Validation</h2>
          <h2>Internal Link Architecture</h2>
          <h2>Crawl Budget Diagnostics</h2>
          <h2>Log File Analysis Workflows</h2>
          <p>Measure crawlability, canonicalization, and schema coverage across large web applications with verifiable HTTP snapshots.</p>
          <a href="https://external.example/other">External</a>
          <a href="/guides/enterprise-crawl-guide">Enterprise Crawl Guide</a>
        </main>
      </body>
    </html>
  `;

  const schemas = extractJsonLdSchemaTypes(sampleHtml);
  assert.deepEqual(schemas.sort(), ['FAQPage', 'SoftwareApplication']);

  const signals = extractHtmlPageSignals({
    html: sampleHtml,
    url: 'https://rivalco.example/seo-audit-software',
    statusCode: 200,
    contentType: 'text/html',
    responseTimeMs: 145,
    collectedAt: '2026-11-16T00:00:00.000Z',
  });

  assert.equal(signals.title, 'Technical SEO Audit Software | RivalCo');
  assert.equal(signals.h1, 'Technical SEO Audit Platform');
  assert.equal(signals.headings.length, 5);
  assert.equal(signals.hasOpenGraph, true);
  assert.ok(signals.wordCount > 20 && signals.wordCount < 60);
  assert.ok(!signals.extractedTopics.includes('privacy policy'));
  assert.ok(signals.extractedTopics.includes('technical seo audit software'));
  assert.ok(signals.extractedTopics.includes('core web vitals monitoring'));

  const innerLinks = discoverInternalLinksFromHtml(
    sampleHtml,
    'https://rivalco.example/',
    4,
  );
  assert.ok(innerLinks.some((u) => u.includes('/services/technical-seo-audit')));
  assert.ok(innerLinks.some((u) => u.includes('/guides/enterprise-crawl-guide')));
  assert.ok(!innerLinks.some((u) => u.includes('/privacy')));
  assert.ok(!innerLinks.some((u) => u.includes('external.example')));
});

test('SERP discovery returns explicit credentials_required when SERPAPI_API_KEY is unset and never invents domains', async () => {
  const prevKey = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  try {
    const res = await discoverCompetitorsViaSerpApi({
      queries: ['technical seo agency'],
      excludeDomain: 'acme.example',
      countryCode: 'US',
    });
    assert.equal(res.status.state, 'credentials_required');
    assert.equal(res.status.configured, false);
    assert.equal(res.candidates.length, 0);
  } finally {
    if (prevKey !== undefined) process.env.SERPAPI_API_KEY = prevKey;
  }
});

test('RBAC: strategist recommendations never overwrite owner-approved competitors and approval history is preserved', () => {
  assert.equal(canUserApproveCompetitors('Business Owner'), true);
  assert.equal(canUserApproveCompetitors('Agency Owner'), true);
  assert.equal(canUserApproveCompetitors('Platform Admin'), true);
  assert.equal(canUserApproveCompetitors('SEO Strategist'), false);
  assert.equal(canUserApproveCompetitors('QA'), false);
  assert.equal(canUserManageCompetitors('SEO Strategist'), true);
  assert.equal(canUserManageCompetitors('QA'), false);
  assert.equal(canUserApproveContentGaps('SEO Strategist'), false);
  assert.equal(canUserApproveContentGaps('Business Owner'), true);

  const ownerApproved: CompetitorProfileRecord = {
    id: 'comp-1',
    tenantId: 't1',
    projectId: 'p1',
    domain: 'rivalone.com',
    name: 'Rival One',
    homepageUrl: 'https://rivalone.com',
    category: 'direct',
    targetMarkets: ['US'],
    discoveryOrigin: 'manual',
    discoveryEvidence: 'Owner added',
    approvalStatus: 'approved',
    approvedBy: 'Elena Owner',
    approvedAt: '2026-11-16T00:00:00.000Z',
    recommendedBy: null,
    notes: 'Original owner note',
    lastAnalyzedAt: null,
    analyzedPagesCount: 0,
    externalDomainAuthority: null,
    externalMonthlyTraffic: null,
    externalBacklinksCount: null,
    provenance: {
      source: 'Owner Approved',
      collectedAt: null,
      reportingPeriod: 'Current',
      measurementStatus: 'unavailable',
      methodology: 'Owner approved',
      limitations: 'No external API metrics',
    },
    approvalHistory: [
      {
        id: 'h1',
        actorName: 'Elena Owner',
        actorRole: 'Business Owner',
        previousStatus: 'none',
        newStatus: 'approved',
        reason: 'Primary direct rival',
        timestamp: '2026-11-16T00:00:00.000Z',
      },
    ],
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  };

  const afterStrat = applyCompetitorRecommendation({
    existing: ownerApproved,
    tenantId: 't1',
    projectId: 'p1',
    domain: 'rivalone.com',
    name: 'Attempt Rename',
    homepageUrl: 'https://rivalone.com',
    category: 'indirect',
    targetMarkets: ['US', 'CA'],
    discoveryOrigin: 'serp_provider',
    discoveryEvidence: 'SERP overlap',
    notes: 'Added regional focus note',
    actorName: 'Alex Strategist',
    actorRole: 'SEO Strategist',
  });

  assert.equal(afterStrat.approvalStatus, 'approved');
  assert.equal(afterStrat.approvedBy, 'Elena Owner');
  assert.equal(afterStrat.name, 'Rival One');
  assert.equal(afterStrat.approvalHistory.length, 2);
});

test('Opportunity scoring strictly reports Needs Evidence (null) when project crawl baseline is missing, and scores explainably once baseline exists', () => {
  const baseComp: CompetitorProfileRecord = {
    id: 'comp-gap-1',
    tenantId: 't1',
    projectId: 'p1',
    domain: 'rival.example',
    name: 'Rival',
    homepageUrl: 'https://rival.example',
    category: 'direct',
    targetMarkets: ['Austin, US'],
    discoveryOrigin: 'manual',
    discoveryEvidence: '',
    approvalStatus: 'approved',
    approvedBy: 'Elena Owner',
    approvedAt: '2026-11-16T00:00:00.000Z',
    recommendedBy: null,
    notes: '',
    lastAnalyzedAt: '2026-11-16T00:00:00.000Z',
    analyzedPagesCount: 1,
    externalDomainAuthority: null,
    externalMonthlyTraffic: null,
    externalBacklinksCount: null,
    provenance: {
      source: 'Live HTML',
      collectedAt: '2026-11-16T00:00:00.000Z',
      reportingPeriod: 'Current',
      measurementStatus: 'measured',
      methodology: 'HTML',
      limitations: 'None',
    },
    approvalHistory: [],
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  };

  const compPage = {
    id: 'cpg-1',
    tenantId: 't1',
    projectId: 'p1',
    competitorId: 'comp-gap-1',
    ...extractHtmlPageSignals({
      html: `
        <html><head><title>Austin HVAC Repair Guide | Rival</title>
        <script type="application/ld+json">{"@type":"Service"}</script></head>
        <body><h1>Austin HVAC Repair</h1><h2>Emergency Furnace Service</h2><h2>AC Tune-Ups</h2>
        <p>${'heat pump maintenance '.repeat(120)}</p></body></html>
      `,
      url: 'https://rival.example/austin/hvac-repair',
      statusCode: 200,
      contentType: 'text/html',
      responseTimeMs: 110,
    }),
  };

  // Without crawl baseline -> opportunityScore must be null and priorityTier 'Needs Evidence'
  const gapsWithoutBaseline = identifyContentGaps({
    tenantId: 't1',
    projectId: 'p1',
    competitor: baseComp,
    competitorPages: [compPage],
    crawlPages: [],
    projectKeywords: [],
    businessProfile: {
      id: 'bp-1',
      tenantId: 't1',
      projectId: 'p1',
      approvedNiche: 'HVAC Services',
      approvedServices: ['HVAC Repair'],
      targetAudience: 'Homeowners',
      targetCountry: 'US',
      targetCity: 'Austin',
      targetLanguage: 'English',
      competitorUrls: [],
      approvalStatus: 'pending_owner_approval',
      approvedBy: null,
      approvedAt: null,
      updatedAt: '2026-11-16T00:00:00.000Z',
    },
    geoMarkets: [],
  });
  assert.equal(gapsWithoutBaseline.length, 1);
  assert.equal(gapsWithoutBaseline[0].opportunityScore, null);
  assert.equal(gapsWithoutBaseline[0].priorityTier, 'Needs Evidence');

  // With crawl baseline + approved profile -> explainable numeric score
  const gapsWithBaseline = identifyContentGaps({
    tenantId: 't1',
    projectId: 'p1',
    competitor: baseComp,
    competitorPages: [compPage],
    crawlPages: [
      {
        url: 'https://acme.example/',
        title: 'Acme Home Comfort',
        metaDescription: 'Home services',
        h1: 'Acme Home Comfort',
        headings: ['About Us'],
        schemaTypes: ['Organization'],
        statusCode: 200,
        responseTimeMs: 95,
        indexability: 'Indexable',
      },
    ],
    projectKeywords: [],
    businessProfile: {
      id: 'bp-1',
      tenantId: 't1',
      projectId: 'p1',
      approvedNiche: 'HVAC Services',
      approvedServices: ['HVAC Repair', 'Furnace Service'],
      targetAudience: 'Homeowners',
      targetCountry: 'US',
      targetCity: 'Austin',
      targetLanguage: 'English',
      competitorUrls: [],
      approvalStatus: 'approved',
      approvedBy: 'Elena Owner',
      approvedAt: '2026-11-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
    },
    geoMarkets: [
      {
        id: 'gm-1',
        tenantId: 't1',
        projectId: 'p1',
        granularity: 'city',
        countryCode: 'US',
        countryName: 'United States',
        isoNumeric: '840',
        stateRegion: 'Texas',
        stateFips: '48',
        city: 'Austin',
        language: 'en',
        serviceAreas: [],
        priority: 'primary',
        approvalStatus: 'approved',
        approvedBy: 'Elena Owner',
        approvedAt: '2026-11-16T00:00:00.000Z',
        recommendedBy: null,
        recommendedReason: '',
        latitude: 30.2672,
        longitude: -97.7431,
        approvalHistory: [],
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
  });

  assert.equal(gapsWithBaseline.length, 1);
  assert.equal(gapsWithBaseline[0].gapType, 'missing_geo_coverage');
  assert.ok(gapsWithBaseline[0].opportunityScore !== null && gapsWithBaseline[0].opportunityScore >= 60);
  assert.notEqual(gapsWithBaseline[0].priorityTier, 'Needs Evidence');
});

test('Full end-to-end competitor workflows, RBAC, Keyword Lab + Tasks integration, export honesty, and tenant isolation', async () => {
  const cleanup = setupTempDb();
  try {
    const tA = createTenantAndUser({
      organizationName: 'Tenant Alpha',
      primaryDomain: 'alpha.example',
      name: OWNER_USER.name,
      email: OWNER_USER.email,
      password: 'Password123!',
      role: 'Business Owner',
    });
    const tB = createTenantAndUser({
      organizationName: 'Tenant Beta',
      primaryDomain: 'beta.example',
      name: 'Beta Owner',
      email: 'beta@comp.test',
      password: 'Password123!',
      role: 'Business Owner',
    });

    const projA = createProjectRecord({
      tenantId: tA.tenant.id,
      name: 'Alpha Site',
      website: 'https://alpha.example',
      owner: OWNER_USER.name,
      targetMarkets: ['United States'],
    });
    const projB = createProjectRecord({
      tenantId: tB.tenant.id,
      name: 'Beta Site',
      website: 'https://beta.example',
      owner: 'Beta Owner',
      targetMarkets: ['United States'],
    });

    // Cannot add own project domain as competitor
    assert.throws(
      () =>
        upsertCompetitorWorkflow({
          tenantId: tA.tenant.id,
          projectId: projA.id,
          user: OWNER_USER,
          domainOrUrl: 'alpha.example',
          approve: true,
        }),
      /own project domain/i,
    );

    // QA blocked
    assert.throws(
      () =>
        upsertCompetitorWorkflow({
          tenantId: tA.tenant.id,
          projectId: projA.id,
          user: QA_USER,
          domainOrUrl: 'rival-seo.example',
        }),
      /FORBIDDEN/,
    );

    // Strategist cannot direct-approve
    assert.throws(
      () =>
        upsertCompetitorWorkflow({
          tenantId: tA.tenant.id,
          projectId: projA.id,
          user: STRATEGIST_USER,
          domainOrUrl: 'rival-seo.example',
          approve: true,
        }),
      /FORBIDDEN/,
    );

    // Strategist saves recommendation -> Owner approves
    const rec = upsertCompetitorWorkflow({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      user: STRATEGIST_USER,
      domainOrUrl: 'https://rival-seo.example',
      category: 'direct',
      targetMarkets: ['US'],
      notes: 'Direct product peer',
      approve: false,
    });
    assert.equal(rec.approvalStatus, 'pending_owner_approval');

    const approved = decideCompetitorApprovalWorkflow({
      tenantId: tA.tenant.id,
      competitorId: rec.id,
      user: OWNER_USER,
      action: 'approve',
      reason: 'Confirmed rival',
    });
    assert.equal(approved.approvalStatus, 'approved');
    assert.equal(approved.approvalHistory.length, 2);

    // Tenant B cannot view or approve Tenant A's competitor
    assert.throws(
      () =>
        decideCompetitorApprovalWorkflow({
          tenantId: tB.tenant.id,
          competitorId: rec.id,
          user: OWNER_USER,
          action: 'reject',
        }),
      /NOT_FOUND/,
    );

    // Seed Phase 3 crawl baseline + Phase 7 profile + Phase 8 geo market + persisted competitor snapshot
    seedCrawlBaselinePage({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      url: 'https://alpha.example/technical-seo',
      title: 'Technical SEO Consulting',
      h1: 'Technical SEO Consulting',
      headings: ['Site Speed'],
      schemaTypes: [],
    });
    updateBusinessProfileWorkflow({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      user: OWNER_USER,
      approvedNiche: 'SEO Audits',
      approvedServices: ['Technical SEO Consulting', 'Enterprise Log Analysis'],
      targetAudience: 'Enterprise Teams',
      targetCountry: 'US',
      targetCity: '',
      targetLanguage: 'English',
      competitorUrls: [],
      approveProfile: true,
    });
    addManualKeywordRecord({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      user: OWNER_USER,
      keyword: 'technical seo consulting',
      targetUrl: 'https://alpha.example/technical-seo',
    });
    upsertTargetMarketWorkflow({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      user: OWNER_USER,
      countryCode: 'US',
      approve: true,
    });

    const compSnapshot = {
      id: 'cpg-test-1',
      tenantId: tA.tenant.id,
      projectId: projA.id,
      competitorId: rec.id,
      ...extractHtmlPageSignals({
        html: `
          <html>
            <head>
              <title>Enterprise Log Analysis Platform | Rival SEO</title>
              <script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
            </head>
            <body>
              <h1>Enterprise Log File Analysis</h1>
              <h2>Bot Crawl Frequency</h2>
              <h2>Orphan Page Detection</h2>
              <p>${'crawl budget log parsing insights '.repeat(90)}</p>
            </body>
          </html>
        `,
        url: 'https://rival-seo.example/enterprise-log-analysis',
        statusCode: 200,
        contentType: 'text/html',
        responseTimeMs: 130,
      }),
    };
    upsertCompetitorPageSnapshot(compSnapshot);

    const crawlPages = getCompetitorWorkspace(tA.tenant.id, projA.id).projectBaseline.crawlPages;
    const keywords = listKeywordIntelligenceRecords(tA.tenant.id, projA.id);
    const overlaps = computeKeywordOverlap({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      competitor: approved,
      competitorPages: [compSnapshot],
      projectKeywords: keywords,
      crawlPages,
    });
    assert.ok(overlaps.some((o) => o.overlapType === 'project_advantage' && o.keyword === 'technical seo consulting'));
    assert.ok(overlaps.some((o) => o.overlapType === 'competitor_only_gap' && o.keyword.includes('enterprise log analysis')));
    // Honest unavailable metrics remain null
    for (const o of overlaps) {
      assert.equal(o.competitorSerpPosition, null);
      assert.equal(o.externalSearchVolume, null);
    }

    const gaps = identifyContentGaps({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      competitor: approved,
      competitorPages: [compSnapshot],
      crawlPages,
      projectKeywords: keywords,
      businessProfile: {
        id: 'bp-a',
        tenantId: tA.tenant.id,
        projectId: projA.id,
        approvedNiche: 'SEO Audits',
        approvedServices: ['Technical SEO Consulting', 'Enterprise Log Analysis'],
        targetAudience: 'Enterprise Teams',
        targetCountry: 'US',
        targetCity: '',
        targetLanguage: 'English',
        competitorUrls: [],
        approvalStatus: 'approved',
        approvedBy: OWNER_USER.name,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      geoMarkets: [],
    });

    // Save overlaps + gap into DB via internal upsert helper so decision workflow runs end-to-end
    const dbMod = await import('../audit/db');
    for (const o of overlaps) dbMod.upsertCompetitorOverlap(o);
    for (const g of gaps) dbMod.upsertContentGap(g);

    const wsA = getCompetitorWorkspace(tA.tenant.id, projA.id);
    assert.equal(wsA.projectBaseline.hasCompletedCrawl, true);
    assert.ok(wsA.projectBaseline.crawlPages.length > 0);
    assert.equal(wsA.contentGaps.length, 1);
    const gapId = wsA.contentGaps[0].id;
    assert.ok(
      wsA.contentGaps[0].opportunityScore !== null &&
        wsA.contentGaps[0].priorityTier !== 'Needs Evidence',
    );

    // Strategist cannot queue task before owner approval
    assert.throws(
      () =>
        decideContentGapWorkflow({
          tenantId: tA.tenant.id,
          gapId,
          user: STRATEGIST_USER,
          action: 'create_task',
        }),
      /PRECONDITION_REQUIRED/,
    );

    // Owner approves -> Strategist promotes to Keyword Lab & queues task
    const approvedGap = decideContentGapWorkflow({
      tenantId: tA.tenant.id,
      gapId,
      user: OWNER_USER,
      action: 'approve',
      notes: 'Build Q4 guide',
    });
    assert.equal(approvedGap.workflowState, 'owner_approved');

    const withKw = decideContentGapWorkflow({
      tenantId: tA.tenant.id,
      gapId,
      user: STRATEGIST_USER,
      action: 'send_to_keywords',
    });
    assert.ok(withKw.linkedKeywordId);
    assert.ok(
      listKeywordIntelligenceRecords(tA.tenant.id, projA.id).some(
        (k) => k.id === withKw.linkedKeywordId,
      ),
    );

    const withTask = decideContentGapWorkflow({
      tenantId: tA.tenant.id,
      gapId,
      user: STRATEGIST_USER,
      action: 'create_task',
    });
    assert.equal(withTask.workflowState, 'queued_for_content');
    assert.ok(withTask.linkedTicketId);
    assert.ok(
      listTicketsForProject(tA.tenant.id, projA.id).some(
        (t) => t.id === withTask.linkedTicketId,
      ),
    );

    // Export bundle honesty check & cross-tenant isolation
    const bundleA = exportCompetitorReportBundle(tA.tenant.id, projA.id);
    assert.match(bundleA.provenanceDisclosure, /Unavailable/i);
    for (const row of bundleA.comparisonRows) {
      assert.equal(row.externalDomainAuthority, null);
      assert.equal(row.externalMonthlyTraffic, null);
      assert.equal(row.externalBacklinksCount, null);
    }

    const wsB = getCompetitorWorkspace(tB.tenant.id, projB.id);
    assert.equal(wsB.competitors.length, 0);
    assert.equal(wsB.contentGaps.length, 0);

    // SSRF-guarded live fetch against localhost returns blocked error cleanly rather than fake page
    const ssrfRes = await analyzeCompetitorUrlsLive({
      tenantId: tA.tenant.id,
      projectId: projA.id,
      competitorId: rec.id,
      homepageUrl: 'http://127.0.0.1:9/test',
      discoverInternalPages: false,
      maxPages: 1,
    });
    assert.equal(ssrfRes.pages.length, 0);
    assert.equal(ssrfRes.status.state, 'blocked');

    // Comparison row builder sanity check
    const compRows = buildCompetitorComparisonRows({
      projectId: projA.id,
      projectName: projA.name,
      projectWebsite: projA.website,
      crawlPages,
      projectKeywords: keywords,
      avgMobilePerf: 88,
      avgDesktopPerf: 96,
      competitors: [approved],
      competitorPages: [compSnapshot],
      overlaps,
      contentGaps: gaps,
    });
    assert.equal(compRows.length, 2);
    assert.equal(compRows[0].avgWordCount, null);
    assert.ok((compRows[1].avgWordCount ?? 0) > 200);

    // Owner deletes competitor
    deleteCompetitorWorkflow({
      tenantId: tA.tenant.id,
      competitorId: rec.id,
      user: OWNER_USER,
    });
    assert.equal(getCompetitorWorkspace(tA.tenant.id, projA.id).competitors.length, 0);
  } finally {
    cleanup();
  }
});
