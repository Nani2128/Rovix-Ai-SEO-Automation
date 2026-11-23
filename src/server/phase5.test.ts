import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectRecord,
  createSyncJob,
  createTenantAndUser,
  getActiveSyncJobByDedupeKey,
  getAuditDb,
  getProjectById,
  listProjectsByTenant,
  replaceGa4Metrics,
  replaceGscMetrics,
  softDeleteProject,
  updateSyncJob,
} from './audit/db';
import { SecurityBlockedError, validateOutboundUrl } from './audit/security';
import {
  DEFAULT_DEV_ORIGIN,
  DEFAULT_SHARED_ORIGIN,
  getGoogleOAuthCallbackUrls,
  isDevAuthEnabled,
  isProductionEnv,
  isSandboxCrawlAllowed,
} from './env';
import {
  decryptSecretPayload,
  encryptSecretPayload,
} from './integrations/cryptoVault';
import { buildRealDashboardOverview } from './realOverview';
import {
  consumeSseStreamTicket,
  csrfOriginCheck,
  issueSseStreamTicket,
} from './securityMiddleware';

test('Phase 5: OAuth callback URLs include exact dev and shared hosts', () => {
  const urls = getGoogleOAuthCallbackUrls();
  assert.equal(
    urls.dev,
    `${DEFAULT_DEV_ORIGIN}/api/integrations/google/oauth/callback`,
  );
  assert.equal(
    urls.shared,
    `${DEFAULT_SHARED_ORIGIN}/api/integrations/google/oauth/callback`,
  );
});

test('Phase 5: Production flag disables dev auth and sandbox fixtures automatically', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevProdSafe = process.env.ROVIX_PRODUCTION_SAFE;
  const prevSandbox = process.env.ALLOW_SANDBOX_FIXTURES;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_SANDBOX_FIXTURES;
    assert.equal(isProductionEnv(), true);
    assert.equal(isDevAuthEnabled(), false);
    assert.equal(isSandboxCrawlAllowed(), false);
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevProdSafe === undefined) delete process.env.ROVIX_PRODUCTION_SAFE;
    else process.env.ROVIX_PRODUCTION_SAFE = prevProdSafe;
    if (prevSandbox === undefined) delete process.env.ALLOW_SANDBOX_FIXTURES;
    else process.env.ALLOW_SANDBOX_FIXTURES = prevSandbox;
  }
});

test('Phase 5: AES-256-GCM integration vault encrypts, decrypts, and rejects tampered payloads', () => {
  const secret = {
    access_token: 'ya29.test-access-token',
    refresh_token: '1//0g-test-refresh-token',
    expiry_date: Date.now() + 3600_000,
  };
  const encrypted = encryptSecretPayload(secret);
  const parsedEnvelope = JSON.parse(encrypted) as {
    alg: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };
  assert.equal(parsedEnvelope.alg, 'aes-256-gcm');

  const decrypted = decryptSecretPayload<typeof secret>(encrypted);
  assert.equal(decrypted.access_token, secret.access_token);
  assert.equal(decrypted.refresh_token, secret.refresh_token);

  // Tamper auth tag -> must throw
  const tamperedTag = Buffer.from(parsedEnvelope.tag, 'base64');
  tamperedTag[0] = tamperedTag[0] ^ 0xff;
  const tampered = JSON.stringify({
    ...parsedEnvelope,
    tag: tamperedTag.toString('base64'),
  });
  assert.throws(() => decryptSecretPayload(tampered));
});

test('Phase 5: Clean newly created workspace has zero fake projects, zero fake KPI values, and strict tenant isolation', () => {
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const recA = createTenantAndUser({
    organizationName: `Org Alpha ${uniqueSuffix}`,
    primaryDomain: 'alpha-example.com',
    name: 'Alice Founder',
    email: `alice-${uniqueSuffix}@alpha-example.com`,
    password: 'StrongPassword123!',
  });
  const recB = createTenantAndUser({
    organizationName: `Org Beta ${uniqueSuffix}`,
    primaryDomain: 'beta-example.com',
    name: 'Bob Founder',
    email: `bob-${uniqueSuffix}@beta-example.com`,
    password: 'StrongPassword123!',
  });

  try {
    // Empty brand-new workspace returns zero fake projects & null metrics
    assert.equal(listProjectsByTenant(recA.tenant.id).length, 0);
    const emptyOverview = buildRealDashboardOverview({
      tenantId: recA.tenant.id,
      dateRange: '30d',
    });
    assert.equal(emptyOverview.project, null);
    assert.equal(emptyOverview.isDevSampleData, false);
    assert.equal(emptyOverview.computedHealthScore, null);
    assert.equal(emptyOverview.trafficSeries.length, 0);
    assert.equal(emptyOverview.keywords.length, 0);
    for (const kpi of emptyOverview.kpis) {
      assert.equal(kpi.value, null);
      assert.equal(kpi.available, false);
    }

    // Create project in Tenant A -> invisible to Tenant B
    const projA = createProjectRecord({
      tenantId: recA.tenant.id,
      name: 'Alpha Marketing',
      website: 'alpha-example.com',
      owner: recA.user.name,
      targetMarkets: ['US'],
    });
    assert.equal(listProjectsByTenant(recA.tenant.id).length, 1);
    assert.equal(listProjectsByTenant(recB.tenant.id).length, 0);
    assert.equal(getProjectById(recB.tenant.id, projA.id), null);

    // Tenant B cannot soft-delete Tenant A project
    assert.equal(softDeleteProject(recB.tenant.id, projA.id), false);
    assert.equal(listProjectsByTenant(recA.tenant.id).length, 1);

    // Overview for projA before crawl/OAuth still reports null metrics (never fake numbers)
    const projOverview = buildRealDashboardOverview({
      tenantId: recA.tenant.id,
      projectId: projA.id,
      dateRange: '30d',
    });
    assert.equal(projOverview.project?.id, projA.id);
    assert.equal(projOverview.hasAnyCrawl, false);
    assert.equal(projOverview.computedHealthScore, null);
    for (const kpi of projOverview.kpis) {
      assert.equal(kpi.value, null);
      assert.equal(kpi.available, false);
    }
  } finally {
    const db = getAuditDb();
    db.prepare('DELETE FROM projects WHERE tenant_id IN (?, ?)').run(
      recA.tenant.id,
      recB.tenant.id,
    );
    db.prepare('DELETE FROM users WHERE tenant_id IN (?, ?)').run(
      recA.tenant.id,
      recB.tenant.id,
    );
    db.prepare('DELETE FROM tenants WHERE id IN (?, ?)').run(
      recA.tenant.id,
      recB.tenant.id,
    );
  }
});

test('Phase 5: Sync job deduplication returns existing active job per tenant/project/provider', () => {
  const uniqueKey = `ten-test:proj-test:gsc:${Date.now()}`;
  const db = getAuditDb();
  const job = createSyncJob({
    tenantId: 'ten-test',
    projectId: 'proj-test',
    provider: 'gsc',
    jobType: 'gsc_sync',
    dedupeKey: uniqueKey,
  });

  try {
    const active = getActiveSyncJobByDedupeKey(uniqueKey);
    assert.ok(active);
    assert.equal(active.id, job.id);

    updateSyncJob(job.id, {
      status: 'Succeeded',
      recordsSynced: 42,
      completedAt: new Date().toISOString(),
    });
    const afterComplete = getActiveSyncJobByDedupeKey(uniqueKey);
    assert.equal(afterComplete, null);
  } finally {
    db.prepare('DELETE FROM sync_jobs WHERE id = ?').run(job.id);
  }
});

test('Phase 5: Outbound SSRF validator blocks private/loopback/metadata targets', async () => {
  const blockedTargets = [
    'http://127.0.0.1/admin',
    'http://localhost:3000/api/auth/session',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://10.0.0.5/',
    'http://[::1]/',
    'file:///etc/passwd',
  ];

  for (const target of blockedTargets) {
    await assert.rejects(
      () => validateOutboundUrl(target, { allowSandboxHost: false }),
      (err: unknown) => err instanceof SecurityBlockedError,
      `Expected SSRF rejection for ${target}`,
    );
  }
});

test('Phase 5: Single-use SSE stream tickets cannot be replayed or cross-used across crawls', () => {
  const ticket = issueSseStreamTicket({
    crawlId: 'crawl-123',
    tenantId: 'ten-a',
    userId: 'usr-a',
  });

  // Wrong crawlId rejected without consuming
  assert.equal(consumeSseStreamTicket(ticket, 'crawl-other'), null);

  // First valid consumption succeeds
  const first = consumeSseStreamTicket(ticket, 'crawl-123');
  assert.ok(first);
  assert.equal(first.tenantId, 'ten-a');

  // Replay attempt immediately rejected
  assert.equal(consumeSseStreamTicket(ticket, 'crawl-123'), null);
});

test('Phase 5: csrfOriginCheck accepts X-Forwarded-Host proxy origin and blocks foreign origins', () => {
  const invoke = (headers: Record<string, string>) => {
    let statusCode = 200;
    let passed = false;
    const req = { method: 'POST', headers } as unknown as Parameters<
      typeof csrfOriginCheck
    >[0];
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Parameters<typeof csrfOriginCheck>[1];
    csrfOriginCheck(req, res, () => {
      passed = true;
    });
    return { statusCode, passed };
  };

  // Reverse proxy where Host is localhost:3000 but X-Forwarded-Host matches Origin
  const proxied = invoke({
    origin: DEFAULT_DEV_ORIGIN,
    host: 'localhost:3000',
    'x-forwarded-host': new URL(DEFAULT_DEV_ORIGIN).host,
  });
  assert.equal(proxied.passed, true);
  assert.equal(proxied.statusCode, 200);

  // Foreign attacker origin still rejected with 403
  const foreign = invoke({
    origin: 'https://evil-attacker.example',
    host: new URL(DEFAULT_DEV_ORIGIN).host,
  });
  assert.equal(foreign.passed, false);
  assert.equal(foreign.statusCode, 403);
});

test('Phase 5A: All dashboard KPIs and charts expose 4-field Data Provenance and honest measurement states', () => {
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rec = createTenantAndUser({
    organizationName: `Provenance Org ${uniqueSuffix}`,
    primaryDomain: 'prov-example.com',
    name: 'Clara Provenance',
    email: `clara-${uniqueSuffix}@prov-example.com`,
    password: 'StrongPassword123!',
  });

  try {
    const proj = createProjectRecord({
      tenantId: rec.tenant.id,
      name: 'Provenance Site',
      website: 'prov-example.com',
      owner: rec.user.name,
      targetMarkets: ['US'],
    });

    // 1. Before any sync or crawl: every metric reports measurementStatus='unavailable' and collectedAt=null
    const beforeOverview = buildRealDashboardOverview({
      tenantId: rec.tenant.id,
      projectId: proj.id,
      dateRange: '30d',
    });
    assert.equal(beforeOverview.reportingPeriodLabel, 'Last 30 days');
    assert.equal(beforeOverview.trafficProvenance.measurementStatus, 'unavailable');
    assert.equal(beforeOverview.trafficProvenance.collectedAt, null);
    assert.equal(beforeOverview.healthProvenance.measurementStatus, 'unavailable');
    for (const kpi of beforeOverview.kpis) {
      assert.ok(kpi.source.length > 0);
      assert.ok(kpi.reportingPeriod.length > 0);
      assert.equal(kpi.collectedAt, null);
      assert.equal(kpi.measurementStatus, 'unavailable');
    }

    // 2. After real GSC & GA4 daily metric rows are stored: KPIs & chart switch to measurementStatus='measured' with real collection dates
    const today = new Date().toISOString().slice(0, 10);
    replaceGscMetrics({
      tenantId: rec.tenant.id,
      projectId: proj.id,
      daily: [
        { date: today, clicks: 45, impressions: 620, ctr: 0.0725, avgPosition: 11.4 },
      ],
      queries: [],
    });
    replaceGa4Metrics({
      tenantId: rec.tenant.id,
      projectId: proj.id,
      daily: [{ date: today, sessions: 88, activeUsers: 74, keyEvents: 4 }],
      landingPages: [],
    });

    const afterOverview = buildRealDashboardOverview({
      tenantId: rec.tenant.id,
      projectId: proj.id,
      dateRange: '30d',
    });
    const trafficKpi = afterOverview.kpis.find((k) => k.id === 'traffic')!;
    const clicksKpi = afterOverview.kpis.find((k) => k.id === 'keywords')!;
    const healthKpi = afterOverview.kpis.find((k) => k.id === 'health')!;

    assert.equal(trafficKpi.value, 88);
    assert.equal(trafficKpi.measurementStatus, 'measured');
    assert.equal(trafficKpi.source, 'Google Analytics 4');
    assert.equal(trafficKpi.reportingPeriod, 'Last 30 days');
    assert.ok(trafficKpi.collectedAt !== null);

    assert.equal(clicksKpi.value, 45);
    assert.equal(clicksKpi.measurementStatus, 'measured');
    assert.equal(clicksKpi.source, 'Google Search Console');
    assert.ok(clicksKpi.collectedAt !== null);

    // Health still unavailable until crawl runs
    assert.equal(healthKpi.measurementStatus, 'unavailable');
    assert.equal(afterOverview.trafficProvenance.measurementStatus, 'measured');
    assert.ok(afterOverview.trafficProvenance.collectedAt !== null);
  } finally {
    const db = getAuditDb();
    db.prepare('DELETE FROM gsc_daily_metrics WHERE tenant_id = ?').run(rec.tenant.id);
    db.prepare('DELETE FROM ga4_daily_metrics WHERE tenant_id = ?').run(rec.tenant.id);
    db.prepare('DELETE FROM projects WHERE tenant_id = ?').run(rec.tenant.id);
    db.prepare('DELETE FROM users WHERE tenant_id = ?').run(rec.tenant.id);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(rec.tenant.id);
  }
});
