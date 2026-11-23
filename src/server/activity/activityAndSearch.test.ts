import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  createProjectRecord,
  getAuditDb,
  resetDbConnectionForTests,
} from '../audit/db';
import {
  publishTenantActivityUpdate,
  subscribeToTenantActivityUpdates,
} from './activityBus';
import { buildUnifiedRecentActivityFeed } from './activityFeed';
import { searchTenantEntities } from '../search/globalSearch';

const TENANT_A = 'ten-activity-a';
const TENANT_B = 'ten-activity-b';
const PROJ_A1 = 'proj-act-a1';
const PROJ_B1 = 'proj-act-b1';

describe('Real-Time Activity Feed & Global Search', () => {
  let tmpDir = '';
  let prevDbPath: string | undefined;

  before(() => {
    prevDbPath = process.env.ROVIX_DB_PATH;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-activity-search-'));
    process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-activity-search.db');
    resetDbConnectionForTests();

    const db = getAuditDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(TENANT_A, 'Tenant Alpha', now, TENANT_B, 'Tenant Beta', now);

    createProjectRecord({
      id: PROJ_A1,
      tenantId: TENANT_A,
      name: 'Alpha Commerce',
      website: 'https://alpha-commerce.example',
      targetMarkets: ['US'],
      owner: 'Alex',
    });

    createProjectRecord({
      id: PROJ_B1,
      tenantId: TENANT_B,
      name: 'Beta Secret',
      website: 'https://beta-secret.example',
      targetMarkets: ['UK'],
      owner: 'Sam',
    });

    db.prepare(
      `INSERT INTO crawl_runs (
         id, tenant_id, project_id, status, crawl_type, configuration_json,
         started_at, completed_at, discovered_count, processed_count, error_count,
         summary_json, triggered_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'crw-act-a1',
      TENANT_A,
      PROJ_A1,
      'Succeeded',
      'full',
      '{}',
      '2026-11-10T10:00:00.000Z',
      '2026-11-10T10:05:00.000Z',
      18,
      18,
      0,
      JSON.stringify({ healthScore: 88 }),
      'Alex',
    );

    db.prepare(
      `INSERT INTO crawl_runs (
         id, tenant_id, project_id, status, crawl_type, configuration_json,
         started_at, completed_at, discovered_count, processed_count, error_count,
         summary_json, triggered_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'crw-act-b1',
      TENANT_B,
      PROJ_B1,
      'Failed',
      'full',
      '{}',
      '2026-11-10T11:00:00.000Z',
      '2026-11-10T11:02:00.000Z',
      4,
      0,
      4,
      JSON.stringify({ healthScore: 12 }),
      'Sam',
    );

    db.prepare(
      `INSERT INTO technical_issues (
         id, tenant_id, project_id, last_crawl_id, rule_id, rule_name, category,
         severity, root_cause_key, title, explanation, impact, recommended_fix,
         responsible_role, status, confidence, affected_url_count, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'iss-act-a1',
      TENANT_A,
      PROJ_A1,
      'crw-act-a1',
      'META-002',
      'Duplicate Meta Description',
      'On-Page SEO',
      'High',
      'META-002::category',
      'Duplicate meta descriptions across category pages',
      'Multiple URLs share identical meta descriptions.',
      'Reduces click-through clarity in search snippets.',
      'Write unique meta descriptions per category.',
      'Editor',
      'Open',
      0.95,
      6,
      '2026-11-10T10:05:00.000Z',
      '2026-11-10T10:06:00.000Z',
    );

    db.prepare(
      `INSERT INTO technical_issues (
         id, tenant_id, project_id, last_crawl_id, rule_id, rule_name, category,
         severity, root_cause_key, title, explanation, impact, recommended_fix,
         responsible_role, status, confidence, affected_url_count, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'iss-act-b1',
      TENANT_B,
      PROJ_B1,
      'crw-act-b1',
      'IDX-001',
      'Accidental Noindex',
      'Indexability',
      'Critical',
      'IDX-001::checkout',
      'Tenant Beta Private Checkout Noindex',
      'Secret beta checkout issue.',
      'Blocks organic indexing.',
      'Remove noindex.',
      'Developer',
      'Open',
      0.99,
      3,
      '2026-11-10T11:05:00.000Z',
      '2026-11-10T11:06:00.000Z',
    );

    db.prepare(
      `INSERT INTO developer_tickets (
         id, tenant_id, issue_id, project_id, title, description, responsible_role,
         assigned_user, task_status, approval_status, requires_dual_approval,
         verification_status, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'tkt-act-a1',
      TENANT_A,
      'iss-act-a1',
      PROJ_A1,
      'Deduplicate category meta tags',
      'Update CMS template',
      'Developer',
      'Dev Lee',
      'In progress',
      'Dual Approved',
      1,
      'Pending',
      'Alex',
      '2026-11-10T10:08:00.000Z',
      '2026-11-10T10:10:00.000Z',
    );
  });

  after(() => {
    resetDbConnectionForTests();
    if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
    else process.env.ROVIX_DB_PATH = prevDbPath;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds a unified activity feed with crawl completions, error reports, and pending tasks sorted newest-first', () => {
    const feed = buildUnifiedRecentActivityFeed({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      limit: 20,
    });

    assert.equal(feed.counts.crawl_completion, 1);
    assert.equal(feed.counts.error_report, 1);
    assert.equal(feed.counts.pending_task, 1);
    assert.equal(feed.counts.all, 3);

    assert.equal(feed.events[0].id, 'feed-task-tkt-act-a1');
    assert.equal(feed.events[1].id, 'feed-issue-iss-act-a1');
    assert.equal(feed.events[2].id, 'feed-crawl-crw-act-a1');
    assert.equal(feed.events[1].evidenceUrl, '/audit/issues/iss-act-a1');
    assert.equal(feed.events[2].evidenceUrl, '/audit/urls/crw-act-a1');
  });

  it('enforces strict tenant isolation in activity feed', () => {
    const feedA = buildUnifiedRecentActivityFeed({ tenantId: TENANT_A });
    const feedB = buildUnifiedRecentActivityFeed({ tenantId: TENANT_B });

    assert.ok(feedA.events.every((e) => !e.action.includes('Beta')));
    assert.ok(feedB.events.every((e) => !e.action.includes('Alpha')));
    assert.equal(feedB.counts.error_report, 2);
  });

  it('notifies real-time activity bus subscribers only for matching tenant and cleans up on unsubscribe', () => {
    const receivedA: string[] = [];
    const receivedB: string[] = [];

    const unsubA = subscribeToTenantActivityUpdates(TENANT_A, (msg) => {
      receivedA.push(msg.reason);
    });
    const unsubB = subscribeToTenantActivityUpdates(TENANT_B, (msg) => {
      receivedB.push(msg.reason);
    });

    publishTenantActivityUpdate({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      reason: 'crawl_completed',
    });

    assert.deepEqual(receivedA, ['crawl_completed']);
    assert.deepEqual(receivedB, []);

    unsubA();
    publishTenantActivityUpdate({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      reason: 'ticket_updated',
    });
    assert.deepEqual(receivedA, ['crawl_completed']);
    unsubB();
  });

  it('searches crawl issues, crawl runs, and tasks via globalSearch with tenant isolation', () => {
    const defaultResults = searchTenantEntities({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      query: '',
    });
    assert.equal(defaultResults.issues.length, 1);
    assert.equal(defaultResults.issues[0].ruleId, 'META-002');
    assert.equal(defaultResults.crawls.length, 1);
    assert.equal(defaultResults.tasks.length, 1);

    const ruleSearch = searchTenantEntities({
      tenantId: TENANT_A,
      query: 'META-002',
    });
    assert.equal(ruleSearch.issues.length, 1);
    assert.equal(ruleSearch.issues[0].id, 'iss-act-a1');

    const crossTenantSearch = searchTenantEntities({
      tenantId: TENANT_A,
      query: 'Checkout Noindex',
    });
    assert.equal(crossTenantSearch.issues.length, 0);
  });
});
