import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import {
  createProjectRecord,
  createTenantAndUser,
  getPerformanceAuditRunById,
  getPerformanceMeasurementById,
  listProjectIssues,
  listTicketsForIssue,
  resetDbConnectionForTests,
} from '../audit/db';
import { SecurityBlockedError } from '../audit/security';
import {
  buildPageSpeedRequestUrl,
  fetchFullPageSpeedAudit,
} from '../integrations/psiClient';
import {
  detectPerformanceFindings,
  parsePageSpeedResponse,
  type RawPageSpeedApiResponse,
} from './diagnosticsEngine';
import {
  bridgeFindingToTechnicalIssue,
  buildPerformanceOverview,
  reverifyPerformanceIssue,
  startPerformanceAudit,
} from './performanceEngine';

let tempDir = '';
let prevDbPath: string | undefined;

before(() => {
  prevDbPath = process.env.ROVIX_DB_PATH;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-phase6-test-'));
  process.env.ROVIX_DB_PATH = path.join(tempDir, 'test-rovix.db');
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

function buildFixturePsiPayload(opts: {
  url: string;
  strategy: 'mobile' | 'desktop';
  perfScore?: number;
  lcpMs?: number;
  clsScore?: number;
  tbtMs?: number;
  ttfbMs?: number;
  cruxMode?: 'url' | 'origin' | 'none';
  withProblems?: boolean;
}): RawPageSpeedApiResponse {
  const withProblems = opts.withProblems ?? true;
  const cruxData = {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: {
        percentile: opts.strategy === 'mobile' ? 3100 : 1850,
        category: opts.strategy === 'mobile' ? 'AVERAGE' : 'FAST',
        distributions: [
          { proportion: 0.58 },
          { proportion: 0.27 },
          { proportion: 0.15 },
        ],
      },
      INTERACTION_TO_NEXT_PAINT: {
        percentile: 180,
        category: 'FAST',
        distributions: [
          { proportion: 0.82 },
          { proportion: 0.12 },
          { proportion: 0.06 },
        ],
      },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: {
        percentile: 14, // 0.14 in CrUX integer scale
        category: 'AVERAGE',
        distributions: [
          { proportion: 0.65 },
          { proportion: 0.22 },
          { proportion: 0.13 },
        ],
      },
    },
  };

  return {
    id: opts.url,
    analysisUTCTimestamp: '2026-11-16T08:00:00.000Z',
    loadingExperience: opts.cruxMode === 'url' ? cruxData : undefined,
    originLoadingExperience:
      opts.cruxMode === 'origin' ? cruxData : undefined,
    lighthouseResult: {
      finalUrl: opts.url,
      requestedUrl: opts.url,
      fetchTime: '2026-11-16T08:00:00.000Z',
      categories: {
        performance: { score: (opts.perfScore ?? (opts.strategy === 'mobile' ? 58 : 88)) / 100 },
        accessibility: { score: withProblems ? 0.84 : 0.98 },
        'best-practices': { score: 0.92 },
        seo: { score: 0.95 },
      },
      audits: {
        'first-contentful-paint': { numericValue: opts.strategy === 'mobile' ? 2100 : 950 },
        'largest-contentful-paint': { numericValue: opts.lcpMs ?? (opts.strategy === 'mobile' ? 3900 : 1700) },
        'speed-index': { numericValue: opts.strategy === 'mobile' ? 4200 : 1600 },
        'total-blocking-time': { numericValue: opts.tbtMs ?? (withProblems ? 420 : 65) },
        'cumulative-layout-shift': { numericValue: opts.clsScore ?? (withProblems ? 0.19 : 0.02) },
        'server-response-time': {
          score: withProblems ? 0.45 : 1,
          numericValue: opts.ttfbMs ?? (withProblems ? 920 : 210),
        },
        'total-byte-weight': { numericValue: withProblems ? 2_650_000 : 620_000 },
        'dom-size': { numericValue: withProblems ? 1720 : 540 },
        'resource-summary': {
          details: {
            items: [
              { resourceType: 'total', requestCount: 48, transferSize: withProblems ? 2_650_000 : 620_000 },
              { resourceType: 'script', requestCount: 16, transferSize: 780_000 },
              { resourceType: 'stylesheet', requestCount: 5, transferSize: 160_000 },
              { resourceType: 'image', requestCount: 14, transferSize: 1_240_000 },
              { resourceType: 'font', requestCount: 4, transferSize: 190_000 },
              { resourceType: 'third-party', requestCount: 12, transferSize: 410_000 },
            ],
          },
        },
        'render-blocking-resources': {
          score: withProblems ? 0.35 : 1,
          details: {
            type: 'opportunity',
            overallSavingsMs: withProblems ? 640 : 0,
            items: withProblems ? [{ url: 'https://example.com/styles.css', totalBytes: 82_000, wastedMs: 640 }] : [],
          },
        },
        'unused-javascript': {
          score: withProblems ? 0.4 : 1,
          details: {
            type: 'opportunity',
            overallSavingsBytes: withProblems ? 240_000 : 0,
            overallSavingsMs: withProblems ? 380 : 0,
            items: withProblems ? [{ url: 'https://example.com/vendor.js', totalBytes: 420_000, wastedBytes: 240_000 }] : [],
          },
        },
        'unused-css-rules': {
          score: withProblems ? 0.5 : 1,
          details: {
            type: 'opportunity',
            overallSavingsBytes: withProblems ? 48_000 : 0,
            items: withProblems ? [{ url: 'https://example.com/unused.css', totalBytes: 60_000, wastedBytes: 48_000 }] : [],
          },
        },
        'uses-responsive-images': {
          score: withProblems ? 0.45 : 1,
          details: {
            type: 'opportunity',
            overallSavingsBytes: withProblems ? 310_000 : 0,
            items: withProblems ? [{ url: 'https://example.com/hero.jpg', totalBytes: 490_000, wastedBytes: 310_000 }] : [],
          },
        },
        'modern-image-formats': {
          score: withProblems ? 0.5 : 1,
          details: {
            type: 'opportunity',
            overallSavingsBytes: withProblems ? 190_000 : 0,
            items: withProblems ? [{ url: 'https://example.com/hero.jpg', totalBytes: 490_000, wastedBytes: 190_000 }] : [],
          },
        },
        'font-display': {
          score: withProblems ? 0 : 1,
          displayValue: withProblems ? '1 font failing font-display: swap' : undefined,
        },
        'third-party-summary': {
          score: withProblems ? 0.2 : 1,
          details: {
            items: withProblems
              ? [{ entity: 'Tag Manager', transferSize: 320_000, blockingTime: 280 }]
              : [],
          },
        },
        viewport: { score: 1 },
        'font-size': { score: withProblems ? 0 : 1 },
        'target-size': { score: withProblems ? 0 : 1 },
        'color-contrast': { score: 1 },
      },
    },
  };
}

test('Phase 6.1: Parses Lighthouse v5 metrics, resource weights, usability, and detects problem/opportunity findings', () => {
  const raw = buildFixturePsiPayload({
    url: 'https://example.com/',
    strategy: 'mobile',
    cruxMode: 'url',
    withProblems: true,
  });

  const parsed = parsePageSpeedResponse(raw, {
    url: 'https://example.com/',
    strategy: 'mobile',
  });

  assert.equal(parsed.lab.performanceScore, 58);
  assert.equal(parsed.lab.lcpMs, 3900);
  assert.equal(parsed.lab.tbtMs, 420);
  assert.equal(parsed.lab.clsScore, 0.19);
  assert.equal(parsed.lab.ttfbMs, 920);
  assert.equal(parsed.resources.totalByteWeight, 2_650_000);
  assert.equal(parsed.resources.domNodesCount, 1720);
  assert.equal(parsed.usability.viewportConfigured, true);
  assert.equal(parsed.usability.legibleFontSizes, false);
  assert.equal(parsed.usability.tapTargetsAdequate, false);

  const findings = detectPerformanceFindings({
    parsed,
    tenantId: 'ten-1',
    projectId: 'proj-1',
    auditRunId: 'perf-1',
    measurementId: 'pm-1',
  });

  const ruleIds = new Set(findings.map((f) => f.ruleId));
  for (const expected of [
    'PERF-LCP-SLOW',
    'PERF-CLS-SHIFT',
    'PERF-JS-TBT',
    'PERF-CSS-RENDER-BLOCK',
    'PERF-IMG-OVERSIZED',
    'PERF-IMG-NEXTGEN',
    'PERF-JS-UNUSED',
    'PERF-CSS-UNUSED',
    'PERF-FONT-DISPLAY',
    'PERF-THIRD-PARTY',
    'PERF-TTFB-SLOW',
    'PERF-DOM-WEIGHT',
    'PERF-USABILITY-MOBILE',
  ]) {
    assert.ok(ruleIds.has(expected), `Expected finding rule ${expected}`);
  }
  assert.ok(findings.some((f) => f.findingKind === 'problem'));
  assert.ok(findings.some((f) => f.findingKind === 'opportunity'));
  assert.ok(findings.every((f) => f.estimatedEffort.includes('estimate')));
});

test('Phase 6.2 & 6.3: Builds PageSpeed request URL, handles 429 quota safely, and normalizes CrUX URL vs origin vs unavailable', async () => {
  const reqUrl = buildPageSpeedRequestUrl({
    targetUrl: 'https://example.com/',
    strategy: 'desktop',
    apiKey: 'secret-psi-key-123',
  });
  assert.match(reqUrl, /strategy=desktop/);
  assert.match(reqUrl, /category=performance/);
  assert.match(reqUrl, /key=secret-psi-key-123/);

  // 429 error redacts secret and raises QUOTA_EXCEEDED
  await assert.rejects(
    () =>
      fetchFullPageSpeedAudit({
        url: 'https://1.1.1.1/',
        strategy: 'mobile',
        apiKeyOverride: 'secret-psi-key-123',
        fetcher: async () =>
          new Response('Quota hit for secret-psi-key-123', { status: 429 }),
      }),
    /QUOTA_EXCEEDED/,
  );

  // CrUX origin fallback and CLS / 100 normalization
  const originRaw = buildFixturePsiPayload({
    url: 'https://1.1.1.1/',
    strategy: 'mobile',
    cruxMode: 'origin',
  });
  const originParsed = parsePageSpeedResponse(originRaw, {
    url: 'https://1.1.1.1/',
    strategy: 'mobile',
  });
  assert.equal(originParsed.field.available, true);
  assert.equal(originParsed.field.scope, 'origin');
  assert.equal(originParsed.field.cls.percentileP75, 0.14);

  // CrUX unavailable
  const noneRaw = buildFixturePsiPayload({
    url: 'https://1.1.1.1/',
    strategy: 'mobile',
    cruxMode: 'none',
  });
  const noneParsed = parsePageSpeedResponse(noneRaw, {
    url: 'https://1.1.1.1/',
    strategy: 'mobile',
  });
  assert.equal(noneParsed.field.available, false);
  assert.equal(noneParsed.field.scope, 'unavailable');
  assert.equal(noneParsed.field.measurementStatus, 'unavailable');
  assert.match(noneParsed.field.note, /unavailable/i);
});

test('Phase 6.6: SSRF protection rejects private, loopback, metadata IP, and file schemes before any fetcher call', async () => {
  let fetcherCalled = false;
  const blockedUrls = [
    'http://127.0.0.1:3000/',
    'http://localhost:3000/',
    'http://10.0.0.15/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'file:///etc/passwd',
  ];

  for (const badUrl of blockedUrls) {
    await assert.rejects(
      () =>
        fetchFullPageSpeedAudit({
          url: badUrl,
          strategy: 'mobile',
          fetcher: async () => {
            fetcherCalled = true;
            return new Response('{}');
          },
        }),
      (err) => err instanceof SecurityBlockedError,
      `Expected SSRF rejection for ${badUrl}`,
    );
  }
  assert.equal(fetcherCalled, false);
});

test('Phase 6.4, 6.5, 6.7, 6.8, 6.9, 6.10: Full audit workflow, Mobile/Desktop, Tenant isolation, Issue deduplication, History, and Evidence-Based Reverification', async () => {
  const tenantA = createTenantAndUser({
    organizationName: 'Perf Tenant Alpha',
    name: 'Alice Strategist',
    email: 'alice-perf@alpha.test',
    password: 'StrongPassword!1',
    role: 'SEO Strategist',
  });
  const projA = createProjectRecord({
    tenantId: tenantA.tenant.id,
    name: 'Alpha Site',
    website: 'example.com',
    owner: tenantA.user.name,
  });

  const tenantB = createTenantAndUser({
    organizationName: 'Perf Tenant Beta',
    name: 'Bob Beta',
    email: 'bob-perf@beta.test',
    password: 'StrongPassword!1',
    role: 'Agency Owner',
  });
  const projB = createProjectRecord({
    tenantId: tenantB.tenant.id,
    name: 'Beta Site',
    website: 'beta.test',
    owner: tenantB.user.name,
  });

  // Honest initial empty overview before any audit runs
  const emptyOverview = buildPerformanceOverview(tenantA.tenant.id, projA.id)!;
  assert.equal(emptyOverview.latestRun, null);
  assert.equal(emptyOverview.mobileSummary.score, null);
  assert.equal(emptyOverview.mobileSummary.provenance.measurementStatus, 'unavailable');
  assert.equal(emptyOverview.fieldSummary.available, false);

  let modeFixed = false;
  const mockFetcher = async (endpoint: string) => {
    const u = new URL(endpoint);
    const targetUrl = u.searchParams.get('url') ?? 'https://1.1.1.1/';
    const strategy = (u.searchParams.get('strategy') as 'mobile' | 'desktop') ?? 'mobile';

    const payload = modeFixed
      ? buildFixturePsiPayload({
          url: targetUrl,
          strategy,
          perfScore: 96,
          lcpMs: 1450,
          clsScore: 0.02,
          tbtMs: 50,
          ttfbMs: 180,
          cruxMode: 'none',
          withProblems: false,
        })
      : buildFixturePsiPayload({
          url: targetUrl,
          strategy,
          perfScore: strategy === 'mobile' ? 54 : 86,
          lcpMs: strategy === 'mobile' ? 4100 : 1750,
          cruxMode: 'none',
          withProblems: true,
        });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // Run 1: Mobile + Desktop audit
  const run1 = await startPerformanceAudit({
    tenantId: tenantA.tenant.id,
    user: tenantA.user,
    projectId: projA.id,
    targetUrls: ['https://1.1.1.1/'],
    strategyMode: 'both',
    awaitCompletion: true,
    fetcher: mockFetcher,
  });

  assert.equal(run1.status, 'Succeeded');
  assert.equal(run1.avgMobileScore, 54);
  assert.equal(run1.avgDesktopScore, 86);

  const overview1 = buildPerformanceOverview(tenantA.tenant.id, projA.id)!;
  assert.equal(overview1.mobileSummary.score, 54);
  assert.equal(overview1.desktopSummary.score, 86);
  // Strict Lab vs Field separation: CrUX remains unavailable even though Lab ran!
  assert.equal(overview1.mobileSummary.provenance.measurementStatus, 'measured');
  assert.equal(overview1.fieldSummary.available, false);
  assert.equal(overview1.fieldSummary.measurementStatus, 'unavailable');

  // Tenant isolation check
  assert.equal(getPerformanceAuditRunById(tenantB.tenant.id, run1.id), null);
  assert.equal(
    getPerformanceMeasurementById(tenantB.tenant.id, overview1.measurements[0].id),
    null,
  );
  assert.equal(buildPerformanceOverview(tenantB.tenant.id, projA.id), null);
  assert.equal(buildPerformanceOverview(tenantB.tenant.id, projB.id)!.runs.length, 0);

  // Bridge PERF-LCP-SLOW finding to TechnicalIssue + DeveloperTicket
  const lcpFinding1 = overview1.findings.find(
    (f) => f.ruleId === 'PERF-LCP-SLOW' && f.strategy === 'mobile',
  )!;
  assert.ok(lcpFinding1);

  const bridge1 = bridgeFindingToTechnicalIssue({
    tenantId: tenantA.tenant.id,
    findingId: lcpFinding1.id,
    user: tenantA.user,
    createTicket: true,
  });
  assert.equal(bridge1.deduplicated, false);
  assert.ok(bridge1.ticket);

  // Run 2 (still failing): historical trend & duplicate issue detection
  const run2 = await startPerformanceAudit({
    tenantId: tenantA.tenant.id,
    user: tenantA.user,
    projectId: projA.id,
    targetUrls: ['https://1.1.1.1/'],
    strategyMode: 'both',
    awaitCompletion: true,
    fetcher: mockFetcher,
  });
  const overview2 = buildPerformanceOverview(tenantA.tenant.id, projA.id)!;
  assert.equal(overview2.latestRun?.id, run2.id);
  assert.equal(overview2.previousRun?.id, run1.id);
  assert.equal(overview2.trendHistory.length, 2);

  const lcpFinding2 = overview2.findings.find(
    (f) => f.ruleId === 'PERF-LCP-SLOW' && f.strategy === 'mobile',
  )!;
  const bridge2 = bridgeFindingToTechnicalIssue({
    tenantId: tenantA.tenant.id,
    findingId: lcpFinding2.id,
    user: tenantA.user,
    createTicket: true,
  });
  assert.equal(bridge2.deduplicated, true);
  assert.equal(bridge2.issue.id, bridge1.issue.id);
  assert.equal(listProjectIssues(tenantA.tenant.id, projA.id).length, 1);

  // Cross-tenant reverification must be rejected
  await assert.rejects(
    () =>
      reverifyPerformanceIssue({
        tenantId: tenantB.tenant.id,
        issueId: bridge1.issue.id,
        user: tenantB.user,
        fetcher: mockFetcher,
      }),
    /NOT_FOUND/,
  );

  // Evidence-based Reverification #1 (LCP still slow -> MUST stay Unresolved, NEVER Verified!)
  const reverifyFail = await reverifyPerformanceIssue({
    tenantId: tenantA.tenant.id,
    issueId: bridge1.issue.id,
    user: tenantA.user,
    fetcher: mockFetcher,
  });
  assert.equal(reverifyFail.verificationRun.result, 'Unresolved');
  assert.notEqual(reverifyFail.issue.status, 'Verified');
  assert.equal(
    listTicketsForIssue(tenantA.tenant.id, bridge1.issue.id)[0].verificationStatus,
    'Failed',
  );

  // Evidence-based Reverification #2 (LCP fixed -> transitions to Verified!)
  modeFixed = true;
  const reverifyPass = await reverifyPerformanceIssue({
    tenantId: tenantA.tenant.id,
    issueId: bridge1.issue.id,
    user: tenantA.user,
    fetcher: mockFetcher,
  });
  assert.equal(reverifyPass.verificationRun.result, 'Verified');
  assert.equal(reverifyPass.issue.status, 'Verified');
  assert.equal(
    listTicketsForIssue(tenantA.tenant.id, bridge1.issue.id)[0].taskStatus,
    'Verified',
  );
});
