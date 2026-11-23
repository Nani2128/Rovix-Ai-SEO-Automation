import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  clearAgentFactoryBusForTests,
  listMissedAgentFactoryEvents,
  subscribeToAgentFactoryEvents,
} from '../activity/activityBus';
import {
  createProjectRecord,
  getAuditDb,
  resetDbConnectionForTests,
} from '../audit/db';
import {
  buildAgentFactorySnapshot,
  emitRealAgentEvent,
} from './agentFactoryService';
import type { AgentFactoryEvent } from '../../types/agentFactory';

const TENANT_A = 'ten-af-a';
const TENANT_B = 'ten-af-b';
const PROJ_A1 = 'proj-af-a1';
const PROJ_B1 = 'proj-af-b1';

describe('Agent Factory Backend Snapshot & Real SSE Stream Service', () => {
  let tmpDir = '';
  let prevDbPath: string | undefined;

  before(() => {
    prevDbPath = process.env.ROVIX_DB_PATH;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-agent-factory-'));
    process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-agent-factory.db');
    resetDbConnectionForTests();
    clearAgentFactoryBusForTests();

    const db = getAuditDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(TENANT_A, 'Tenant Alpha', now, TENANT_B, 'Tenant Beta', now);

    createProjectRecord({
      id: PROJ_A1,
      tenantId: TENANT_A,
      name: 'Alpha Workspace',
      website: 'https://alpha-af.example',
      targetMarkets: ['US'],
      owner: 'Alex',
    });

    createProjectRecord({
      id: PROJ_B1,
      tenantId: TENANT_B,
      name: 'Beta Secret Workspace',
      website: 'https://beta-af.example',
      targetMarkets: ['UK'],
      owner: 'Sam',
    });

    // Seed one running crawl & one failed performance audit in Tenant A
    db.prepare(
      `INSERT INTO crawl_runs (
         id, tenant_id, project_id, status, crawl_type, configuration_json,
         started_at, completed_at, discovered_count, processed_count, error_count,
         summary_json, triggered_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'crw-af-1',
      TENANT_A,
      PROJ_A1,
      'Running',
      'full',
      JSON.stringify({ startingUrl: 'https://alpha-af.example' }),
      '2026-11-17T12:00:00.000Z',
      null,
      20,
      10,
      0,
      JSON.stringify({ healthScore: 0 }),
      'Alex',
    );

    db.prepare(
      `INSERT INTO performance_audit_runs (
         id, tenant_id, project_id, source_crawl_id, strategy_mode, status, provider,
         target_urls_json, total_checks, completed_checks, failed_checks,
         error_summary, avg_mobile_score, avg_desktop_score, triggered_by, started_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'par-af-1',
      TENANT_A,
      PROJ_A1,
      null,
      'both',
      'Failed',
      'pagespeed_insights',
      JSON.stringify(['https://alpha-af.example/']),
      2,
      2,
      2,
      'Lighthouse PSI rate limited',
      null,
      null,
      'Alex',
      '2026-11-17T12:05:00.000Z',
      '2026-11-17T12:06:00.000Z',
    );
  });

  after(() => {
    clearAgentFactoryBusForTests();
    resetDbConnectionForTests();
    if (prevDbPath === undefined) {
      delete process.env.ROVIX_DB_PATH;
    } else {
      process.env.ROVIX_DB_PATH = prevDbPath;
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('builds an accurate tenant-isolated snapshot with honest availability states', () => {
    const snap = buildAgentFactorySnapshot({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
    });

    assert.equal(snap.nodes.length, 11);
    assert.equal(snap.counts.runningWorkflows, 1);
    assert.equal(snap.counts.activeAgents, 1);
    assert.equal(snap.counts.failedExecutions, 1);
    assert.equal(snap.counts.waitingApprovalTasks, 0);
    assert.equal(snap.systemHealth, 'attention_required');

    const tech = snap.nodes.find((n) => n.agentId === 'technical_seo_agent');
    assert.ok(tech);
    assert.equal(tech.state, 'running');
    assert.equal(tech.currentTask?.progressPct, 50); // 10 / 20 processed
    assert.equal(typeof tech.metrics.queueDepth, 'number');

    const perf = snap.nodes.find(
      (n) => n.agentId === 'performance_analysis_agent',
    );
    assert.ok(perf);
    assert.equal(perf.state, 'failed');
    assert.match(perf.lastExecution?.errorSummary ?? '', /rate limited/i);

    const contentGen = snap.nodes.find(
      (n) => n.agentId === 'content_generation_agent',
    );
    assert.ok(contentGen);
    if (!process.env.GEMINI_API_KEY?.trim()) {
      assert.equal(contentGen.availabilityStatus, 'unavailable');
      assert.equal(contentGen.state, 'unavailable');
    } else {
      assert.equal(contentGen.availabilityStatus, 'connected');
    }
  });

  it('blocks cross-tenant project access cleanly with NOT_FOUND', () => {
    assert.throws(
      () =>
        buildAgentFactorySnapshot({
          tenantId: TENANT_A,
          projectId: PROJ_B1,
        }),
      /NOT_FOUND/,
    );
  });

  it('emits deduplicated tenant-isolated SSE events and supports Last-Event-ID replay', () => {
    const receivedA: AgentFactoryEvent[] = [];
    const receivedB: AgentFactoryEvent[] = [];

    const unsubA = subscribeToAgentFactoryEvents(TENANT_A, (ev) => {
      if (ev.projectId === PROJ_A1) receivedA.push(ev);
    });
    const unsubB = subscribeToAgentFactoryEvents(TENANT_B, (ev) => {
      if (ev.projectId === PROJ_B1) receivedB.push(ev);
    });

    const ev1 = emitRealAgentEvent({
      id: 'afe-test-1',
      eventType: 'agent.started',
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      workflowId: 'wf-test-1',
      taskId: 'wf-test-1',
      agentId: 'keyword_intelligence_agent',
      status: 'running',
      taskTitle: 'Keyword Clustering',
      summary: 'Clustering 25 search terms',
    });

    // Emit duplicate ID — bus must ignore duplicate dispatch
    emitRealAgentEvent({
      id: 'afe-test-1',
      eventType: 'agent.started',
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      workflowId: 'wf-test-1',
      taskId: 'wf-test-1',
      agentId: 'keyword_intelligence_agent',
      status: 'running',
      taskTitle: 'Keyword Clustering',
      summary: 'Duplicate dispatch',
    });

    const ev2 = emitRealAgentEvent({
      id: 'afe-test-2',
      eventType: 'agent.completed',
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      workflowId: 'wf-test-1',
      taskId: 'wf-test-1',
      agentId: 'keyword_intelligence_agent',
      status: 'completed',
      taskTitle: 'Keyword Clustering',
      summary: 'Clustered 25 search terms',
    });

    unsubA();
    unsubB();

    assert.equal(receivedA.length, 2);
    assert.equal(receivedA[0].id, ev1.id);
    assert.equal(receivedA[1].id, ev2.id);
    assert.equal(receivedB.length, 0);

    // Replay missed events strictly after ev1
    const missed = listMissedAgentFactoryEvents({
      tenantId: TENANT_A,
      projectId: PROJ_A1,
      lastEventId: ev1.id,
    });
    assert.equal(missed.length, 1);
    assert.equal(missed[0].id, ev2.id);
  });
});
