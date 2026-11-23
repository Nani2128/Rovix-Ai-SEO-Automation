import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { THEME_PRESETS } from '../config/themes';
import { AGENT_CATALOG } from './agentFactoryCatalog';
import {
  COMMUNICATION_LINK_TTL_MS,
  applyAgentFactoryEvent,
  createInitialAgentFactoryState,
  extractTheme3DPalette,
  getStateVisualSpec,
  pruneExpiredCommunicationLinks,
  resolveAgentFactoryLayout,
} from './agentFactoryState';
import type {
  AgentFactoryEvent,
  AgentFactorySnapshot,
  AgentStationNodeSnapshot,
} from '../types/agentFactory';

function makeBaseSnapshot(overrides?: Partial<AgentFactorySnapshot>): AgentFactorySnapshot {
  const nodes: AgentStationNodeSnapshot[] = AGENT_CATALOG.map((def) => ({
    ...def,
    availabilityStatus:
      def.agentId === 'content_generation_agent' ? 'unavailable' : 'connected',
    providerSummary:
      def.agentId === 'content_generation_agent'
        ? 'No live AI generation provider connected in Stage 1.'
        : 'Connected to SQLite telemetry.',
    state: def.agentId === 'content_generation_agent' ? 'unavailable' : 'idle',
    currentTask: null,
    lastExecution: null,
    recentEvents: [],
    metrics: {
      queueDepth: 0,
      runningCount: 0,
      waitingApprovalCount: 0,
      completedCount: 0,
      failedCount: 0,
      retryCount: 0,
      avgDurationMs: null,
      lastDurationMs: null,
      totalInputTokens: null,
      totalOutputTokens: null,
      tokenUsageAvailable: false,
      lastProvider: null,
      lastModel: null,
    },
  }));

  return {
    tenantId: 'ten-1',
    projectId: 'proj-1',
    projectName: 'Primary Project',
    projectWebsite: 'https://primary.example',
    generatedAt: '2026-11-17T20:00:00.000Z',
    systemHealth: 'healthy',
    counts: {
      activeAgents: 0,
      runningWorkflows: 0,
      queuedTasks: 0,
      failedExecutions: 0,
      waitingApprovalTasks: 0,
      connectedAgents: 9,
      unavailableAgents: 1,
    },
    nodes,
    workflows: [],
    recentEvents: [],
    activeLinks: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<AgentFactoryEvent>): AgentFactoryEvent {
  return {
    id: 'ev-1',
    eventType: 'agent.started',
    tenantId: 'ten-1',
    projectId: 'proj-1',
    workflowId: 'wf-1',
    taskId: 'task-1',
    agentId: 'technical_seo_agent',
    sourceAgentId: null,
    destinationAgentId: null,
    status: 'running',
    taskTitle: 'Full Site Crawl',
    summary: 'Crawl started on example.com',
    progressPct: null,
    errorSummary: null,
    evidenceUrl: '/audit/live/wf-1',
    timestamp: '2026-11-17T20:01:00.000Z',
    ...overrides,
  };
}

describe('Agent Factory Pure State & Theme Palette', () => {
  it('resolves all 11 spatial stations without overlapping positions', () => {
    const coords = resolveAgentFactoryLayout();
    assert.equal(coords.length, 11);
    const hub = coords.find((c) => c.agentId === 'orchestrator');
    assert.ok(hub);
    assert.equal(hub.x, 0);
    assert.equal(hub.z, 0);

    const agents = coords.filter((c) => c.agentId !== 'orchestrator');
    assert.equal(agents.length, 10);

    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const dist = Math.hypot(
          coords[i].x - coords[j].x,
          coords[i].z - coords[j].z,
        );
        assert.ok(
          dist > 3.5,
          `Stations ${coords[i].agentId} and ${coords[j].agentId} too close (${dist})`,
        );
      }
    }
  });

  it('extracts valid theme palettes for all 7 themes', () => {
    for (const theme of THEME_PRESETS) {
      const p = extractTheme3DPalette(theme.id);
      assert.equal(p.presetId, theme.id);
      assert.ok(p.canvasBg.startsWith('#'));
      assert.ok(p.plinthHex.startsWith('#'));
      assert.ok(p.accentPrimary.startsWith('#'));
      assert.equal(p.isDark, theme.isDark);
    }
  });

  it('maps every AgentExecutionState to a distinct readable spec', () => {
    const states = [
      'idle',
      'queued',
      'running',
      'communicating',
      'waiting_for_approval',
      'completed',
      'failed',
      'retrying',
      'cancelled',
      'unavailable',
    ] as const;
    for (const s of states) {
      const spec = getStateVisualSpec(s);
      assert.ok(spec.label.length > 0);
      assert.ok(spec.colorHex.startsWith('#'));
    }
  });

  it('never fabricates progressPct when backend omits it and prevents duplicate events', () => {
    const initial = createInitialAgentFactoryState(makeBaseSnapshot());
    const startEv = makeEvent({
      id: 'ev-start',
      eventType: 'agent.started',
      progressPct: null,
    });

    const afterStart = applyAgentFactoryEvent(initial, startEv, 1_000);
    const tech = afterStart.snapshot.nodes.find(
      (n) => n.agentId === 'technical_seo_agent',
    );
    assert.ok(tech);
    assert.equal(tech.state, 'running');
    assert.equal(tech.currentTask?.progressPct, null);
    assert.equal(afterStart.snapshot.counts.activeAgents, 1);
    assert.equal(afterStart.snapshot.counts.runningWorkflows, 1);

    // Duplicate event ID must be ignored identically
    const afterDup = applyAgentFactoryEvent(afterStart, startEv, 2_000);
    assert.equal(afterDup, afterStart);

    // Real progress update applies accurately
    const progEv = makeEvent({
      id: 'ev-prog',
      eventType: 'agent.progress',
      progressPct: 60,
      summary: 'Processed 6 of 10 URLs',
    });
    const afterProg = applyAgentFactoryEvent(afterStart, progEv, 3_000);
    const techProg = afterProg.snapshot.nodes.find(
      (n) => n.agentId === 'technical_seo_agent',
    );
    assert.equal(techProg?.currentTask?.progressPct, 60);
  });

  it('rejects events belonging to a different tenant or project', () => {
    const initial = createInitialAgentFactoryState(makeBaseSnapshot());
    const crossTenant = applyAgentFactoryEvent(
      initial,
      makeEvent({ id: 'ev-x', tenantId: 'ten-other' }),
      1_000,
    );
    assert.equal(crossTenant, initial);

    const crossProject = applyAgentFactoryEvent(
      initial,
      makeEvent({ id: 'ev-y', projectId: 'proj-other' }),
      1_000,
    );
    assert.equal(crossProject, initial);
  });

  it('drives communication pathways strictly from real agent.communication events and prunes on expiry/completion', () => {
    const initial = createInitialAgentFactoryState(makeBaseSnapshot());
    assert.equal(initial.snapshot.activeLinks.length, 0);

    const commEv = makeEvent({
      id: 'ev-comm',
      eventType: 'agent.communication',
      agentId: 'competitor_intelligence_agent',
      sourceAgentId: 'orchestrator',
      destinationAgentId: 'competitor_intelligence_agent',
      status: 'communicating',
      taskTitle: 'Competitor Analysis',
      summary: 'Dispatching competitor scrape',
    });

    const afterComm = applyAgentFactoryEvent(initial, commEv, 10_000);
    assert.equal(afterComm.snapshot.activeLinks.length, 1);
    const orch = afterComm.snapshot.nodes.find((n) => n.isOrchestrator);
    const comp = afterComm.snapshot.nodes.find(
      (n) => n.agentId === 'competitor_intelligence_agent',
    );
    assert.equal(orch?.state, 'communicating');
    assert.equal(comp?.state, 'communicating');

    // Prune after TTL
    const afterTtl = pruneExpiredCommunicationLinks(
      afterComm,
      10_000 + COMMUNICATION_LINK_TTL_MS + 100,
    );
    assert.equal(afterTtl.snapshot.activeLinks.length, 0);

    // Or clear immediately on terminal failure
    const failEv = makeEvent({
      id: 'ev-fail',
      eventType: 'agent.failed',
      agentId: 'competitor_intelligence_agent',
      status: 'failed',
      errorSummary: 'Upstream DNS timeout',
      workflowId: 'wf-1',
    });
    const afterFail = applyAgentFactoryEvent(afterComm, failEv, 11_000);
    assert.equal(afterFail.snapshot.activeLinks.length, 0);
    assert.equal(afterFail.snapshot.counts.failedExecutions, 1);
    assert.equal(afterFail.snapshot.systemHealth, 'attention_required');
  });
});
