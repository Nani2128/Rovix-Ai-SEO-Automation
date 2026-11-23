import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENT_MESSAGE_STATUSES,
  AGENT_MESSAGE_TYPES,
  classifyEvidenceReference,
  createCorrelationId,
  groupMessagesIntoThreads,
  isTerminalMessageStatus,
  isValidAgentMessageStatus,
  isValidAgentMessageType,
} from './agentFactory/agentCommunication';
import {
  BUILTIN_STUDIO_TEMPLATES,
  STUDIO_NODE_CATALOG,
  createStudioNodeFromCatalog,
} from './workflowStudioCatalog';
import {
  ALLOWED_CONDITION_FIELDS,
  ALLOWED_CONDITION_OPERATORS,
  MAX_STUDIO_EDGES,
  MAX_STUDIO_NODES,
  autoLayoutStudioGraph,
  compileStudioGraphToDag,
  createStudioHistory,
  evaluateRestrictedCondition,
  isValidStudioConnection,
  pushStudioHistory,
  redoStudioHistory,
  undoStudioHistory,
  validateStudioWorkflowGraph,
} from './workflowStudioEngine';
import type { AgentMessageRecord } from '../types/agentFactory';
import type { StudioWorkflowGraph } from '../types/workflowStudio';

describe('Deliverable 1: Agent-to-Agent Communication Protocol Helpers', () => {
  it('validates canonical message types, statuses, and terminal status checks', () => {
    assert.equal(AGENT_MESSAGE_TYPES.length, 8);
    assert.equal(AGENT_MESSAGE_STATUSES.length, 5);
    assert.equal(isValidAgentMessageType('research_request'), true);
    assert.equal(isValidAgentMessageType('delegation_request'), true);
    assert.equal(isValidAgentMessageType('unknown_type'), false);

    assert.equal(isValidAgentMessageStatus('delivered'), true);
    assert.equal(isValidAgentMessageStatus('bogus'), false);

    assert.equal(isTerminalMessageStatus('sent'), false);
    assert.equal(isTerminalMessageStatus('delivered'), false);
    assert.equal(isTerminalMessageStatus('acknowledged'), true);
    assert.equal(isTerminalMessageStatus('failed'), true);
    assert.equal(isTerminalMessageStatus('rejected'), true);
  });

  it('generates prefixed correlation IDs and classifies evidence references', () => {
    const corr = createCorrelationId('seo_flow');
    assert.ok(corr.startsWith('seo_flow-'));
    assert.ok(corr.length > 12);

    assert.equal(classifyEvidenceReference('https://example.com/pricing').kind, 'url');
    assert.equal(classifyEvidenceReference('aout-12345').kind, 'output_id');
    assert.equal(classifyEvidenceReference('crawl-abc').kind, 'crawl_id');
    assert.equal(classifyEvidenceReference('wctx-xyz').kind, 'context_item');
    assert.equal(classifyEvidenceReference('aappr-99').kind, 'approval_id');
    assert.equal(classifyEvidenceReference('custom-ref').kind, 'other');
  });

  it('groups correlated agent messages into ordered communication threads', () => {
    const msgs: AgentMessageRecord[] = [
      {
        messageId: 'm2',
        tenantId: 't1',
        projectId: 'p1',
        workflowId: 'wf1',
        executionId: 'ex1',
        sourceAgentId: 'keyword_intelligence_agent',
        destinationAgentId: 'research_agent',
        messageType: 'findings_response',
        payload: { summary: 'Done' },
        evidenceReferences: ['aout-2'],
        correlationId: 'corr-alpha',
        replyToMessageId: 'm1',
        timestamp: '2026-04-01T10:01:00.000Z',
        status: 'acknowledged',
        errorSummary: null,
      },
      {
        messageId: 'm1',
        tenantId: 't1',
        projectId: 'p1',
        workflowId: 'wf1',
        executionId: 'ex1',
        sourceAgentId: 'research_agent',
        destinationAgentId: 'keyword_intelligence_agent',
        messageType: 'research_request',
        payload: { topic: 'Pricing intent' },
        evidenceReferences: ['https://example.com/pricing'],
        correlationId: 'corr-alpha',
        replyToMessageId: null,
        timestamp: '2026-04-01T10:00:00.000Z',
        status: 'delivered',
        errorSummary: null,
      },
    ];

    const threads = groupMessagesIntoThreads(msgs);
    assert.equal(threads.length, 1);
    assert.equal(threads[0].correlationId, 'corr-alpha');
    assert.equal(threads[0].rootMessageId, 'm1');
    assert.equal(threads[0].messageCount, 2);
    assert.equal(threads[0].latestStatus, 'acknowledged');
    assert.deepEqual(threads[0].participants.sort(), [
      'keyword_intelligence_agent',
      'research_agent',
    ]);
  });
});

describe('Stage 4 Workflow Studio Catalog, Validation, Conditions, DAG Compilation & History', () => {
  it('exposes all 5 built-in templates and all of them validate cleanly with 0 blocking errors', () => {
    assert.equal(BUILTIN_STUDIO_TEMPLATES.length, 5);
    assert.ok(STUDIO_NODE_CATALOG.length >= 26);

    for (const tpl of BUILTIN_STUDIO_TEMPLATES) {
      const report = validateStudioWorkflowGraph(tpl.graph, {
        projectId: 'proj-test-1',
      });
      assert.equal(
        report.valid,
        true,
        `Template "${tpl.name}" failed validation: ${report.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join('; ')}`,
      );
      assert.equal(report.errorCount, 0);
      assert.equal(report.topologicalOrder.length, tpl.graph.nodes.length);
    }
  });

  it('rejects empty graphs, cycles, self-loops, trigger incoming edges, and limit overflows', () => {
    const empty = validateStudioWorkflowGraph({ nodes: [], edges: [] });
    assert.equal(empty.valid, false);
    assert.ok(empty.issues.some((i) => i.code === 'EMPTY_GRAPH'));

    // Cycle check
    const n1 = createStudioNodeFromCatalog('research_agent', { x: 0, y: 0 }, 'n1');
    const n2 = createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 250, y: 0 }, 'n2');
    const cyclic: StudioWorkflowGraph = {
      nodes: [n1, n2],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', edgeType: 'dependency', sourceHandle: 'default' },
        { id: 'e2', source: 'n2', target: 'n1', edgeType: 'dependency', sourceHandle: 'default' },
      ],
    };
    const cycleReport = validateStudioWorkflowGraph(cyclic);
    assert.equal(cycleReport.valid, false);
    assert.ok(cycleReport.issues.some((i) => i.code === 'CIRCULAR_DEPENDENCY'));

    // Trigger receiving incoming edge
    const trig = createStudioNodeFromCatalog('manual_trigger', { x: 0, y: 0 }, 't1');
    const badTrigConn = isValidStudioConnection({
      sourceNode: n1,
      targetNode: trig,
      existingEdges: [],
    });
    assert.equal(badTrigConn.valid, false);

    // Self-loop check
    const selfConn = isValidStudioConnection({
      sourceNode: n1,
      targetNode: n1,
      existingEdges: [],
    });
    assert.equal(selfConn.valid, false);

    // Node limit overflow
    const tooManyNodes = Array.from({ length: MAX_STUDIO_NODES + 1 }, (_, i) =>
      createStudioNodeFromCatalog('research_agent', { x: i * 10, y: 0 }, `n_${i}`),
    );
    const limitReport = validateStudioWorkflowGraph({ nodes: tooManyNodes, edges: [] });
    assert.equal(limitReport.valid, false);
    assert.ok(limitReport.issues.some((i) => i.code === 'NODE_LIMIT_EXCEEDED'));

    // Edge limit overflow
    const tooManyEdges = Array.from({ length: MAX_STUDIO_EDGES + 1 }, (_, i) => ({
      id: `e_${i}`,
      source: 'n1',
      target: 'n2',
      edgeType: 'dependency' as const,
      sourceHandle: 'default' as const,
    }));
    const edgeLimitReport = validateStudioWorkflowGraph({
      nodes: [n1, n2],
      edges: tooManyEdges,
    });
    assert.ok(edgeLimitReport.issues.some((i) => i.code === 'EDGE_LIMIT_EXCEEDED'));
  });

  it('enforces mandatory approval gate on content generation, condition branches, unreachable nodes, and cross-project isolation', () => {
    const trig = createStudioNodeFromCatalog('manual_trigger', { x: 0, y: 0 }, 'trig');
    const content = createStudioNodeFromCatalog('content_generation_agent', { x: 250, y: 0 }, 'gen');
    content.config.approvalRequired = false;
    content.config.approvalGateType = null;

    const cond = createStudioNodeFromCatalog('if_else', { x: 500, y: 0 }, 'cond');
    const orphan = createStudioNodeFromCatalog('reporting_agent', { x: 750, y: 0 }, 'orphan');
    orphan.config.targetProjectRef = 'other-project-999';

    const report = validateStudioWorkflowGraph(
      {
        nodes: [trig, content, cond, orphan],
        edges: [
          { id: 'e1', source: 'trig', target: 'gen', edgeType: 'dependency', sourceHandle: 'default' },
          { id: 'e2', source: 'gen', target: 'cond', edgeType: 'dependency', sourceHandle: 'default' },
        ],
      },
      { projectId: 'proj-current-1' },
    );

    assert.equal(report.valid, false);
    assert.ok(report.issues.some((i) => i.code === 'MANDATORY_APPROVAL_BYPASS'));
    assert.ok(report.issues.some((i) => i.code === 'MISSING_CONDITION_BRANCH'));
    assert.ok(report.issues.some((i) => i.code === 'UNREACHABLE_NODE'));
    assert.ok(report.issues.some((i) => i.code === 'CROSS_PROJECT_REFERENCE'));
  });

  it('evaluates restricted condition rules safely across all operators with zero arbitrary eval', () => {
    assert.ok(ALLOWED_CONDITION_FIELDS.includes('evidenceCount'));
    assert.ok(ALLOWED_CONDITION_OPERATORS.includes('gte'));

    const metrics = {
      evidenceCount: 5,
      healthScore: 82,
      hasApprovedProfile: true,
      qaVerdict: 'passed_with_evidence',
      openConflictsCount: 0,
    };

    assert.equal(
      evaluateRestrictedCondition({ field: 'evidenceCount', operator: 'gte', value: 3 }, metrics).matched,
      true,
    );
    assert.equal(
      evaluateRestrictedCondition({ field: 'healthScore', operator: 'lt', value: 70 }, metrics).matched,
      false,
    );
    assert.equal(
      evaluateRestrictedCondition({ field: 'hasApprovedProfile', operator: 'is_true', value: true }, metrics).matched,
      true,
    );
    assert.equal(
      evaluateRestrictedCondition({ field: 'qaVerdict', operator: 'contains', value: 'passed' }, metrics).matched,
      true,
    );
    assert.equal(
      evaluateRestrictedCondition({ field: 'openConflictsCount', operator: 'eq', value: 0 }, metrics).matched,
      true,
    );
    // Unsafe / disallowed field fails closed safely
    assert.equal(
      evaluateRestrictedCondition(
        { field: '__proto__' as unknown as 'evidenceCount', operator: 'exists', value: null },
        metrics,
      ).matched,
      false,
    );
  });

  it('compiles visual graph to Stage 2/3 DAG, performs deterministic auto-layout, and supports undo/redo history', () => {
    const tpl = BUILTIN_STUDIO_TEMPLATES[0].graph;
    const compiled = compileStudioGraphToDag(tpl);
    assert.equal(compiled.nodes.length, tpl.nodes.length);
    assert.equal(compiled.edges.length, tpl.edges.length);

    const laidOut = autoLayoutStudioGraph(tpl);
    assert.equal(laidOut.nodes.length, tpl.nodes.length);
    const coords = new Set(laidOut.nodes.map((n) => `${n.position.x}:${n.position.y}`));
    assert.equal(coords.size, laidOut.nodes.length);

    // Undo/Redo stack
    let stack = createStudioHistory(tpl);
    const added = createStudioNodeFromCatalog('reporting_agent', { x: 900, y: 200 }, 'extra_rep');
    stack = pushStudioHistory(stack, {
      nodes: [...tpl.nodes, added],
      edges: tpl.edges,
    });
    assert.equal(stack.present.nodes.length, tpl.nodes.length + 1);
    stack = undoStudioHistory(stack);
    assert.equal(stack.present.nodes.length, tpl.nodes.length);
    stack = redoStudioHistory(stack);
    assert.equal(stack.present.nodes.length, tpl.nodes.length + 1);
  });
});
