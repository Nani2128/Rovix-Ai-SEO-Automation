import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { User } from '../../types/auth';
import type { GeoMeasurementRecord } from '../../types/geographic';
import {
  createProjectRecord,
  createTenantAndUser,
  getAuditDb,
  resetDbConnectionForTests,
} from '../audit/db';
import { resolveCountryEntry, resolveStateEntry } from './geoCatalog';
import {
  applyStrategistRecommendation,
  buildGeoComparisonRows,
  buildGeoLocationKey,
  buildGeoOpportunities,
  buildMapCountryFeatures,
  canUserApproveGeoMarkets,
  canUserRecommendGeoMarkets,
  evaluateGeoUrlMappings,
  validateMeasurementGranularity,
} from './geoEngine';
import { buildGeoModifiedSeeds, fetchGscCountryAnalytics } from './geoProviders';
import {
  approveOrRejectTargetMarketWorkflow,
  exportGeoReportBundle,
  getGeoWorkspace,
  updateGeoUrlMappingWorkflow,
  upsertTargetMarketWorkflow,
} from './geoService';

const OWNER_USER: User = {
  id: 'usr-owner-geo',
  name: 'Elena Owner',
  email: 'elena@company.test',
  role: 'Business Owner',
  avatarInitials: 'EO',
  title: 'Business Owner',
};

const STRATEGIST_USER: User = {
  id: 'usr-strat-geo',
  name: 'Alex Strategist',
  email: 'alex@agency.test',
  role: 'SEO Strategist',
  avatarInitials: 'AS',
  title: 'Senior Strategist',
};

const QA_USER: User = {
  id: 'usr-qa-geo',
  name: 'Maya QA',
  email: 'maya@agency.test',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Reviewer',
};

function setupTempDb() {
  const prevDbPath = process.env.ROVIX_DB_PATH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-geo-test-'));
  process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-geo.db');
  resetDbConnectionForTests();
  return () => {
    resetDbConnectionForTests();
    if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
    else process.env.ROVIX_DB_PATH = prevDbPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
}

test('ISO catalog resolves GSC alpha-3 codes and US state FIPS accurately', () => {
  assert.equal(resolveCountryEntry('usa')?.alpha2, 'US');
  assert.equal(resolveCountryEntry('usa')?.isoNumeric, '840');
  assert.equal(resolveCountryEntry('gbr')?.alpha2, 'GB');
  assert.equal(resolveCountryEntry('ind')?.isoNumeric, '356');
  assert.equal(resolveStateEntry('US', 'TX')?.fips, '48');
  assert.equal(resolveStateEntry('US', 'Texas')?.code, 'TX');
});

test('granularity validation blocks extrapolating country GSC totals onto city/state records', () => {
  const cityCheck = validateMeasurementGranularity({
    recordGranularity: 'city',
    gscClicks: 420,
    gscImpressions: 8500,
    gscSourceDimension: 'country',
  });
  assert.equal(cityCheck.valid, false);
  assert.equal(cityCheck.sanitizedClicks, null);
  assert.equal(cityCheck.sanitizedImpressions, null);

  const countryCheck = validateMeasurementGranularity({
    recordGranularity: 'country',
    gscClicks: 420,
    gscImpressions: 8500,
    gscSourceDimension: 'country',
  });
  assert.equal(countryCheck.valid, true);
  assert.equal(countryCheck.sanitizedImpressions, 8500);
});

test('RBAC: only owners/admins can approve target markets; strategists recommend without overwriting owner-approved markets', () => {
  assert.equal(canUserApproveGeoMarkets('Business Owner'), true);
  assert.equal(canUserApproveGeoMarkets('Agency Owner'), true);
  assert.equal(canUserApproveGeoMarkets('SEO Strategist'), false);
  assert.equal(canUserApproveGeoMarkets('QA'), false);

  assert.equal(canUserRecommendGeoMarkets('SEO Strategist'), true);
  assert.equal(canUserRecommendGeoMarkets('QA'), false);

  const existingApproved = applyStrategistRecommendation({
    existing: {
      id: 'geomkt-1',
      tenantId: 't1',
      projectId: 'p1',
      granularity: 'country',
      countryCode: 'US',
      countryName: 'United States',
      isoNumeric: '840',
      stateRegion: '',
      stateFips: null,
      city: '',
      language: 'en',
      serviceAreas: ['United States'],
      priority: 'primary',
      approvalStatus: 'approved',
      approvedBy: 'Elena Owner',
      approvedAt: '2026-01-01T00:00:00.000Z',
      recommendedBy: null,
      recommendedReason: 'Core domestic market',
      latitude: 39.8,
      longitude: -98.5,
      approvalHistory: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    tenantId: 't1',
    projectId: 'p1',
    countryCode: 'US',
    recommendedReason: 'Expand US enterprise content',
    actorName: 'Alex Strategist',
    actorRole: 'SEO Strategist',
  });

  // Owner-approved status & primary priority remain intact, history preserved!
  assert.equal(existingApproved.approvalStatus, 'approved');
  assert.equal(existingApproved.priority, 'primary');
  assert.equal(existingApproved.approvedBy, 'Elena Owner');
  assert.equal(existingApproved.approvalHistory.length, 1);
  assert.ok(existingApproved.approvalHistory[0].reason.includes('without overwriting'));
});

test('location-to-URL mapping detects missing regional pages, overlapping locations, and doorway risks without auto-creating doorway pages', () => {
  const cleanups: (() => void)[] = [];
  const cleanup = setupTempDb();
  cleanups.push(cleanup);

  try {
    const mappings = evaluateGeoUrlMappings({
      tenantId: 't1',
      projectId: 'p1',
      markets: [
        {
          id: 'm-austin',
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
          serviceAreas: ['Austin Metro'],
          priority: 'primary',
          approvalStatus: 'approved',
          approvedBy: 'Elena Owner',
          approvedAt: '2026-01-01T00:00:00.000Z',
          recommendedBy: null,
          recommendedReason: '',
          latitude: 30.26,
          longitude: -97.74,
          approvalHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'm-london',
          tenantId: 't1',
          projectId: 'p1',
          granularity: 'city',
          countryCode: 'GB',
          countryName: 'United Kingdom',
          isoNumeric: '826',
          stateRegion: 'England',
          stateFips: null,
          city: 'London',
          language: 'en',
          serviceAreas: ['Greater London'],
          priority: 'secondary',
          approvalStatus: 'approved',
          approvedBy: 'Elena Owner',
          approvedAt: '2026-01-01T00:00:00.000Z',
          recommendedBy: null,
          recommendedReason: '',
          latitude: 51.5,
          longitude: -0.12,
          approvalHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      crawledPages: [
        {
          url: 'https://example.com/austin-seo-services',
          title: 'Austin SEO Services & Audits',
          h1: 'SEO Agency in Austin Texas',
          statusCode: 200,
          indexability: 'Indexable',
        },
        {
          url: 'https://example.com/locations/austin',
          title: 'Austin Texas Location Page',
          h1: 'Austin SEO Office',
          statusCode: 200,
          indexability: 'Indexable',
        },
      ],
      existingMappings: [],
      actorName: 'System',
    });

    const austin = mappings.find((m) => m.marketId === 'm-austin')!;
    assert.equal(austin.mappingStatus, 'duplicate_overlap');
    assert.equal(austin.duplicateRisk, 'high');
    assert.ok(austin.doorwayRiskWarning?.includes('Consolidate'));

    const london = mappings.find((m) => m.marketId === 'm-london')!;
    assert.equal(london.mappingStatus, 'recommend_new_page');
    assert.equal(london.targetUrl, null);
    assert.ok(london.recommendedSlug?.includes('london'));
    assert.ok(london.doorwayRiskWarning?.includes('doorway'));
  } finally {
    cleanups.forEach((c) => c());
  }
});

test('comparison & opportunities keep incomparable metrics separated and mark unavailable metrics honestly', () => {
  const usMeas: GeoMeasurementRecord = {
    id: 'meas-us',
    tenantId: 't1',
    projectId: 'p1',
    marketId: null,
    granularity: 'country',
    locationKey: buildGeoLocationKey({ countryCode: 'US' }),
    locationLabel: 'United States',
    countryCode: 'US',
    countryName: 'United States',
    isoNumeric: '840',
    stateRegion: '',
    city: '',
    latitude: 39.8,
    longitude: -98.5,
    gscClicks: 140,
    gscImpressions: 3200,
    gscCtr: 0.04375,
    gscAvgPosition: 11.4,
    gscGranularityNote: 'Country GSC',
    relativeTrendIndex: 74,
    trendDirection: 'rising',
    trendsNote: 'Relative 0-100',
    gbpLocationsCount: null,
    gbpVisibilityNote: 'Not connected',
    trackedRankPosition: null,
    trackedRankProvider: null,
    rankTrackingNote: 'Credentials required',
    provenance: {
      source: 'GSC + Trends',
      collectedAt: '2026-02-01T00:00:00.000Z',
      reportingPeriod: '30d',
      measurementStatus: 'measured',
      granularity: 'country',
      methodology: 'Direct GSC country',
      limitations: 'Country scope',
    },
    collectedAt: '2026-02-01T00:00:00.000Z',
  };

  const rows = buildGeoComparisonRows({
    markets: [
      {
        id: 'm-us',
        tenantId: 't1',
        projectId: 'p1',
        granularity: 'country',
        countryCode: 'US',
        countryName: 'United States',
        isoNumeric: '840',
        stateRegion: '',
        stateFips: null,
        city: '',
        language: 'en',
        serviceAreas: ['United States'],
        priority: 'primary',
        approvalStatus: 'approved',
        approvedBy: 'Owner',
        approvedAt: '2026-02-01T00:00:00.000Z',
        recommendedBy: null,
        recommendedReason: '',
        latitude: 39.8,
        longitude: -98.5,
        approvalHistory: [],
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'm-austin',
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
        serviceAreas: ['Austin'],
        priority: 'secondary',
        approvalStatus: 'approved',
        approvedBy: 'Owner',
        approvedAt: '2026-02-01T00:00:00.000Z',
        recommendedBy: null,
        recommendedReason: '',
        latitude: 30.26,
        longitude: -97.74,
        approvalHistory: [],
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    measurements: [usMeas],
    geoKeywords: [],
    urlMappings: [],
  });

  const usRow = rows.find((r) => r.marketId === 'm-us')!;
  const austinRow = rows.find((r) => r.marketId === 'm-austin')!;

  // Country row has measured GSC & relative Trends, while rank tracker and GBP remain Unavailable
  assert.equal(usRow.gscDimension.status, 'measured');
  assert.equal(usRow.gscDimension.impressions, 3200);
  assert.equal(usRow.trendsDimension.status, 'relative_interest');
  assert.equal(usRow.trendsDimension.relativeIndex, 74);
  assert.equal(usRow.rankTrackerDimension.status, 'unavailable');
  assert.equal(usRow.rankTrackerDimension.avgRank, null);
  assert.equal(usRow.gbpDimension.status, 'unavailable');

  // City row MUST NOT inherit country GSC impressions
  assert.equal(austinRow.gscDimension.status, 'unavailable');
  assert.equal(austinRow.gscDimension.impressions, null);

  // Opportunities with no hard signals for a city stay unscored ("Needs Evidence")
  const opps = buildGeoOpportunities({
    markets: [
      {
        id: 'm-de',
        tenantId: 't1',
        projectId: 'p1',
        granularity: 'country',
        countryCode: 'DE',
        countryName: 'Germany',
        isoNumeric: '276',
        stateRegion: '',
        stateFips: null,
        city: '',
        language: 'de',
        serviceAreas: ['Germany'],
        priority: 'recommended',
        approvalStatus: 'strategist_recommended',
        approvedBy: null,
        approvedAt: null,
        recommendedBy: 'Alex',
        recommendedReason: 'Test',
        latitude: 51.1,
        longitude: 10.4,
        approvalHistory: [],
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    measurements: [],
    geoKeywords: [],
    urlMappings: [],
  });

  assert.equal(opps[0].score, null);
  assert.equal(opps[0].priorityTier, 'Needs Evidence');
  assert.equal(opps[0].blockedByMissingData, true);

  // Map features mark countries without data as Unavailable
  const mapFeats = buildMapCountryFeatures({
    markets: [],
    measurements: [usMeas],
    geoKeywords: [],
    urlMappings: [],
  });
  const jp = mapFeats.find((f) => f.countryCode === 'JP')!;
  assert.equal(jp.dataAvailabilityLabel, 'Unavailable');
  assert.equal(jp.gscImpressions, null);
});

test('geoService workflow enforces tenant isolation, RBAC, history preservation, and exports without fake GSC connections', async () => {
  const cleanup = setupTempDb();
  try {
    const seeded = createTenantAndUser({
      organizationName: 'Apex Local Tenant',
      name: 'Elena Owner',
      email: 'elena@company.test',
      password: 'StrongPassword!1',
      role: 'Business Owner',
    });
    const tenantId = seeded.tenant.id;
    const project = createProjectRecord({
      tenantId,
      name: 'Apex Local Co',
      website: 'https://apexlocal.example',
      targetMarkets: ['United States'],
      owner: 'Elena Owner',
    });

    // Crawl page for URL mapping test
    const db = getAuditDb();
    const nowIso = '2026-11-16T00:00:00.000Z';
    db.prepare(
      `INSERT INTO crawl_runs (
        id, tenant_id, project_id, status, crawl_type, configuration_json,
        started_at, completed_at, discovered_count, processed_count, error_count,
        summary_json, triggered_by
      ) VALUES (?, ?, ?, 'Completed', 'full', '{}', ?, ?, 1, 1, 0, '{}', ?)`,
    ).run('cr-geo-1', tenantId, project.id, nowIso, nowIso, 'Elena Owner');

    db.prepare(
      `INSERT INTO crawl_urls (
        id, tenant_id, crawl_id, normalized_url, requested_url, final_url,
        discovery_source, redirect_chain_json, status_code, content_type, response_time_ms,
        depth, indexability, indexability_reason, canonical_url, canonical_status,
        title, meta_description, h1, headings_json, robots_directives_json,
        schema_types_json, schema_errors_json, hreflang_json, internal_links_json,
        external_links_json, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'seed', '[]', 200, 'text/html', 120, 1, 'Indexable', 'Indexable', ?, 'Self-Referencing', ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', ?)`,
    ).run(
      'curl-geo-1',
      tenantId,
      'cr-geo-1',
      'https://apexlocal.example/austin-seo',
      'https://apexlocal.example/austin-seo',
      'https://apexlocal.example/austin-seo',
      'https://apexlocal.example/austin-seo',
      'Austin SEO Services',
      'Austin SEO help',
      'Austin SEO Agency',
      JSON.stringify(['Texas SEO']),
      nowIso,
    );

    // QA blocked from recommending/creating markets
    assert.throws(() => {
      upsertTargetMarketWorkflow({
        tenantId: tenantId,
        projectId: project.id,
        user: QA_USER,
        countryCode: 'CA',
        approve: false,
      });
    }, /FORBIDDEN/);

    // Strategist cannot approve a target market
    assert.throws(() => {
      upsertTargetMarketWorkflow({
        tenantId: tenantId,
        projectId: project.id,
        user: STRATEGIST_USER,
        countryCode: 'CA',
        approve: true,
      });
    }, /FORBIDDEN/);

    // Strategist CAN recommend Canada
    const recCanada = upsertTargetMarketWorkflow({
      tenantId: tenantId,
      projectId: project.id,
      user: STRATEGIST_USER,
      countryCode: 'CA',
      stateRegion: 'Ontario',
      city: 'Toronto',
      reason: 'High regional demand observed',
      approve: false,
    });
    assert.equal(recCanada.approvalStatus, 'strategist_recommended');
    assert.equal(recCanada.priority, 'recommended');

    // Owner approves Canada recommendation & preserves history
    const approvedCanada = approveOrRejectTargetMarketWorkflow({
      tenantId: tenantId,
      marketId: recCanada.id,
      user: OWNER_USER,
      action: 'approve',
      priority: 'secondary',
      reason: 'Confirmed Toronto service partner',
    });
    assert.equal(approvedCanada.approvalStatus, 'approved');
    assert.equal(approvedCanada.priority, 'secondary');
    assert.equal(approvedCanada.approvalHistory.length, 2);

    // Owner approves Austin city market
    const austinMkt = upsertTargetMarketWorkflow({
      tenantId: tenantId,
      projectId: project.id,
      user: OWNER_USER,
      countryCode: 'US',
      stateRegion: 'Texas',
      city: 'Austin',
      serviceAreas: ['Austin Metro', 'Round Rock'],
      priority: 'primary',
      approve: true,
    });
    assert.equal(austinMkt.approvalStatus, 'approved');

    // Tenant isolation: another tenant gets NOT_FOUND
    assert.throws(() => {
      getGeoWorkspace('t-other-tenant', project.id);
    }, /NOT_FOUND/);

    // Check GSC country client returns not_connected honestly without OAuth
    const gscRes = await fetchGscCountryAnalytics({
      tenantId: tenantId,
      projectId: project.id,
    });
    assert.equal(gscRes.status.state, 'not_connected');
    assert.equal(gscRes.measurements.length, 0);

    // Build geo seeds verifies city/region enrichment
    const seeds = buildGeoModifiedSeeds({
      baseSeeds: ['technical seo'],
      countryName: 'United States',
      stateRegion: 'Texas',
      city: 'Austin',
    });
    assert.ok(seeds.includes('technical seo Austin'));
    assert.ok(seeds.includes('technical seo in Austin'));

    // Check URL mapping & approve plan
    const ws = getGeoWorkspace(tenantId, project.id);
    assert.ok(ws.targetMarkets.length >= 2);
    const torontoMap = ws.urlMappings.find((m) => m.marketId === recCanada.id)!;
    const approvedMap = updateGeoUrlMappingWorkflow({
      tenantId: tenantId,
      mappingId: torontoMap.id,
      user: OWNER_USER,
      approveNewPage: true,
    });
    assert.equal(approvedMap.approvalState, 'Approved');

    // Export bundle
    const bundle = exportGeoReportBundle(tenantId, project.id);
    assert.equal(bundle.projectId, project.id);
    assert.ok(bundle.granularityDisclosure.includes('country'));
  } finally {
    cleanup();
  }
});
