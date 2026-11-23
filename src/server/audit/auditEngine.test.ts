import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from '../../types/auth';
import {
  getAuditDb,
  listIssueEvidence,
  listProjectIssues,
} from './db';
import {
  buildAuditOverview,
  buildCrawlComparison,
  createDeveloperTicket,
  getIssueDetailsBundle,
  runIssueReverification,
  startCrawlJob,
  updateDeveloperTicket,
} from './crawlerEngine';
import { parseRobotsTxt, evaluateRobotsForUrl } from './robotsParser';
import { parseSitemapXml } from './sitemapParser';
import { resetSandboxFixes, SANDBOX_FIX_STATE } from './sandboxFixture';
import { SecurityBlockedError, validateOutboundUrl } from './security';

const AGENCY_OWNER: User = {
  id: 'usr-simon',
  name: 'Simon Baler',
  email: 'simon@rovixai.com',
  role: 'Agency Owner',
  avatarInitials: 'SB',
  title: 'Agency Owner',
};

const DEVELOPER_USER: User = {
  id: 'usr-dev',
  name: 'Alex Rivera',
  email: 'alex.dev@rovixai.com',
  role: 'Developer',
  avatarInitials: 'AR',
  title: 'Developer',
};

const QA_USER: User = {
  id: 'usr-qa',
  name: 'Maya Lin',
  email: 'maya.qa@rovixai.com',
  role: 'QA',
  avatarInitials: 'ML',
  title: 'QA Reviewer',
};

const TENANT_A = 'tenant-rovix-dev';
const TENANT_B = 'tenant-other-org';

function clearTestProjectData(tenantId: string, projectId: string) {
  const db = getAuditDb();
  db.prepare('DELETE FROM verification_runs WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM developer_tickets WHERE tenant_id = ? AND project_id = ?').run(
    tenantId,
    projectId,
  );
  db.prepare('DELETE FROM issue_evidence WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM technical_issues WHERE tenant_id = ? AND project_id = ?').run(
    tenantId,
    projectId,
  );
  db.prepare('DELETE FROM crawl_events WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM crawl_urls WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM crawl_runs WHERE tenant_id = ? AND project_id = ?').run(
    tenantId,
    projectId,
  );
}

test('TEST 1, 2, 3, 9: Full crawl detects noindex, canonical conflict, redirect loop, and deduplicates issues across repeat crawls', async () => {
  resetSandboxFixes();
  clearTestProjectData(TENANT_A, 'proj-rovix-main');

  const crawl1 = await startCrawlJob({
    tenantId: TENANT_A,
    user: AGENCY_OWNER,
    projectId: 'proj-rovix-main',
    awaitCompletion: true,
    configOverrides: {
      startingUrl: 'https://sandbox.rovixai.test/',
      maxPages: 40,
      maxDepth: 4,
      requestDelayMs: 0,
      enableJsRendering: true,
      discoverSitemaps: true,
      respectRobotsTxt: true,
    },
  });

  assert.equal(crawl1.status, 'Succeeded');
  assert.ok(crawl1.processedCount >= 12);

  const issues1 = listProjectIssues(TENANT_A, 'proj-rovix-main');

  // TEST 1: Detect noindex page + sitemap noindex
  const noindexIssue = issues1.find((i) => i.ruleId === 'RULE-01-NOINDEX');
  assert.ok(noindexIssue, 'Expected RULE-01-NOINDEX to be detected');
  const noindexEvidence = listIssueEvidence(TENANT_A, noindexIssue.id, crawl1.id);
  assert.ok(
    noindexEvidence.some((e) => e.url.includes('/noindex-page')),
    'Expected /noindex-page in noindex evidence',
  );

  // TEST 2: Detect canonical conflict
  const canonicalIssue = issues1.find((i) => i.ruleId === 'RULE-02-CANONICAL-CONFLICT');
  assert.ok(canonicalIssue, 'Expected RULE-02-CANONICAL-CONFLICT to be detected');
  const canonicalEvidence = listIssueEvidence(TENANT_A, canonicalIssue.id, crawl1.id);
  assert.ok(
    canonicalEvidence.some((e) => e.url.includes('/canonical-conflict')),
    'Expected /canonical-conflict in canonical conflict evidence',
  );

  // TEST 3: Detect redirect loop
  const loopIssue = issues1.find((i) => i.ruleId === 'RULE-03-REDIRECT-LOOP');
  assert.ok(loopIssue, 'Expected RULE-03-REDIRECT-LOOP to be detected');
  const loopEvidence = listIssueEvidence(TENANT_A, loopIssue.id, crawl1.id);
  assert.ok(
    loopEvidence.some((e) => e.url.includes('/redirect-loop-a')),
    'Expected /redirect-loop-a in redirect loop evidence',
  );

  // Verify JS-rendered discovery found /js-discovered-feature when Chromium shell is available
  const db = getAuditDb();
  const jsUrlRow = db
    .prepare('SELECT discovery_source FROM crawl_urls WHERE crawl_id = ? AND normalized_url LIKE ?')
    .get(crawl1.id, '%/js-discovered-feature') as { discovery_source: string } | undefined;
  assert.ok(jsUrlRow, 'Expected /js-discovered-feature to be discovered via JS rendering');
  assert.equal(jsUrlRow.discovery_source, 'js_dom');

  // TEST 9: Duplicate crawling same project does NOT duplicate TechnicalIssue rows
  const crawl2 = await startCrawlJob({
    tenantId: TENANT_A,
    user: AGENCY_OWNER,
    projectId: 'proj-rovix-main',
    awaitCompletion: true,
    configOverrides: {
      startingUrl: 'https://sandbox.rovixai.test/',
      maxPages: 40,
      maxDepth: 4,
      requestDelayMs: 0,
    },
  });
  assert.equal(crawl2.status, 'Succeeded');

  const issues2 = listProjectIssues(TENANT_A, 'proj-rovix-main');
  assert.equal(
    issues2.length,
    issues1.length,
    'Second identical crawl must deduplicate TechnicalIssue rows by rootCauseKey',
  );
});

test('TEST 4 & TEST 10: Ticket remains unverified until reverification succeeds with evidence after fix', async () => {
  resetSandboxFixes();
  const issues = listProjectIssues(TENANT_A, 'proj-rovix-main');
  const noindexIssue = issues.find((i) => i.ruleId === 'RULE-01-NOINDEX');
  assert.ok(noindexIssue);

  const ticket = createDeveloperTicket({
    tenantId: TENANT_A,
    issueId: noindexIssue.id,
    user: AGENCY_OWNER,
  });
  assert.equal(ticket.requiresDualApproval, true);
  assert.equal(ticket.verificationStatus, 'Pending');

  // TEST 7: Unauthorized role (QA / SEO Strategist) cannot perform developer-only approval
  assert.throws(
    () =>
      updateDeveloperTicket({
        tenantId: TENANT_A,
        ticketId: ticket.id,
        action: 'developer_approve',
        user: QA_USER,
      }),
    /FORBIDDEN:/,
  );

  // Developer + Lead dual approval
  const devApproved = updateDeveloperTicket({
    tenantId: TENANT_A,
    ticketId: ticket.id,
    action: 'developer_approve',
    user: DEVELOPER_USER,
  });
  assert.equal(devApproved.approvalStatus, 'Developer Approved');

  const dualApproved = updateDeveloperTicket({
    tenantId: TENANT_A,
    ticketId: ticket.id,
    action: 'lead_approve',
    user: AGENCY_OWNER,
  });
  assert.equal(dualApproved.approvalStatus, 'Dual Approved');

  // TEST 10: Moving ticket to In progress / Awaiting verification must NOT verify issue
  const inProg = updateDeveloperTicket({
    tenantId: TENANT_A,
    ticketId: ticket.id,
    taskStatus: 'In progress',
    user: DEVELOPER_USER,
  });
  assert.equal(inProg.taskStatus, 'In progress');
  assert.equal(inProg.verificationStatus, 'Pending');

  const awaitingVerif = updateDeveloperTicket({
    tenantId: TENANT_A,
    ticketId: ticket.id,
    taskStatus: 'Awaiting verification',
    user: DEVELOPER_USER,
  });
  assert.equal(awaitingVerif.verificationStatus, 'Pending');

  // Cannot manually mark Verified
  assert.throws(
    () =>
      updateDeveloperTicket({
        tenantId: TENANT_A,
        ticketId: ticket.id,
        taskStatus: 'Verified',
        user: DEVELOPER_USER,
      }),
    /BAD_REQUEST:/,
  );

  // Reverify BEFORE applying fix -> must remain Unresolved
  const preFixVerif = await runIssueReverification({
    tenantId: TENANT_A,
    issueId: noindexIssue.id,
    user: QA_USER,
  });
  assert.equal(preFixVerif.verificationRun.result, 'Unresolved');
  assert.notEqual(preFixVerif.issue.status, 'Verified');

  // TEST 4: Apply fix in sandbox and run reverification -> must succeed & verify!
  SANDBOX_FIX_STATE.fixNoindexPage = true;
  const postFixVerif = await runIssueReverification({
    tenantId: TENANT_A,
    issueId: noindexIssue.id,
    user: QA_USER,
  });
  assert.equal(postFixVerif.verificationRun.result, 'Verified');
  assert.equal(postFixVerif.issue.status, 'Verified');

  const bundle = getIssueDetailsBundle(TENANT_A, noindexIssue.id);
  assert.ok(bundle);
  assert.equal(bundle.tickets[0].taskStatus, 'Verified');
  assert.equal(bundle.tickets[0].verificationStatus, 'Verified');

  const overviewAfterReverify = buildAuditOverview(TENANT_A, 'proj-rovix-main');
  assert.ok(overviewAfterReverify?.latestCrawl);
  assert.equal(overviewAfterReverify.latestCrawl.crawlType, 'full');
  assert.ok(
    overviewAfterReverify.latestCrawl.processedCount >= 12,
    'Audit overview latestCrawl must stay anchored to full crawl instead of 1-URL reverification run',
  );
  resetSandboxFixes();
});

test('TEST 5: Partial crawl remains Partial and is excluded from complete crawl comparisons', async () => {
  resetSandboxFixes();
  SANDBOX_FIX_STATE.simulatePartial500 = true;

  const partialCrawl = await startCrawlJob({
    tenantId: TENANT_A,
    user: AGENCY_OWNER,
    projectId: 'proj-rovix-main',
    awaitCompletion: true,
    configOverrides: {
      startingUrl: 'https://sandbox.rovixai.test/',
      maxPages: 40,
      maxDepth: 4,
      requestDelayMs: 0,
    },
  });

  assert.equal(partialCrawl.status, 'Partial');
  assert.ok(partialCrawl.errorCount >= 1);

  const comparison = buildCrawlComparison(TENANT_A, 'proj-rovix-main');
  assert.ok(comparison.incompleteExcludedCount >= 1);
  assert.notEqual(comparison.currentCrawl?.id, partialCrawl.id);
  assert.equal(comparison.currentCrawl?.status, 'Succeeded');
  resetSandboxFixes();
});

test('TEST 6: Tenant isolation blocks Tenant B from accessing Tenant A crawl data and issues', () => {
  const issuesA = listProjectIssues(TENANT_A, 'proj-rovix-main');
  assert.ok(issuesA.length > 0);
  const sampleIssue = issuesA[0];

  const bundleForTenantB = getIssueDetailsBundle(TENANT_B, sampleIssue.id);
  assert.equal(bundleForTenantB, null, 'Tenant B must not read Tenant A issue bundle');

  const issuesForTenantB = listProjectIssues(TENANT_B, 'proj-rovix-main');
  assert.equal(issuesForTenantB.length, 0, 'Tenant B must see zero issues for Tenant A project');
});

test('TEST 8: SSRF protection blocks internal, loopback, link-local metadata, private IPv4/IPv6, and disallowed schemes', async () => {
  const blockedTargets = [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://192.168.1.10/',
    'http://172.16.5.4/',
    'http://[::1]/',
    'http://localhost:3000/',
    'http://metadata.google.internal/',
    'file:///etc/passwd',
    'ftp://example.com/',
    'https://user:pass@example.com/',
  ];

  for (const target of blockedTargets) {
    await assert.rejects(
      () => validateOutboundUrl(target, { allowSandboxHost: true }),
      (err) => err instanceof SecurityBlockedError,
      `Expected SSRF protection to block ${target}`,
    );
  }
});

test('Robots.txt and XML sitemap / sitemapindex parsers handle valid and malformed inputs', () => {
  const robots = parseRobotsTxt(
    'User-agent: *\nDisallow: /private/\nAllow: /private/public-doc\nSitemap: https://example.com/sitemap.xml',
    'https://example.com/robots.txt',
    200,
  );
  assert.equal(robots.accessible, true);
  assert.equal(evaluateRobotsForUrl('/private/secret', robots.groups).allowed, false);
  assert.equal(evaluateRobotsForUrl('/private/public-doc', robots.groups).allowed, true);

  const indexXml = parseSitemapXml(
    '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sm-1.xml</loc></sitemap></sitemapindex>',
    'https://example.com/sitemap.xml',
  );
  assert.equal(indexXml.kind, 'sitemapindex');
  assert.deepEqual(indexXml.childSitemaps, ['https://example.com/sm-1.xml']);

  const badXml = parseSitemapXml('<html><body>Not XML</body></html>', 'https://example.com/sitemap.xml');
  assert.equal(badXml.kind, 'malformed');
});
