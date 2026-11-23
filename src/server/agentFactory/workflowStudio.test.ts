import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';
import {
  studioValidationReports,
  studioWorkflowExecutions,
  studioWorkflowTemplates,
  studioWorkflowVersions,
  studioWorkflows,
} from '../../db/agentWorkflowSchema';
import {
  BUILTIN_STUDIO_TEMPLATES,
  createStudioNodeFromCatalog,
} from '../../lib/workflowStudioCatalog';
import type { User } from '../../types/auth';
import type { StudioWorkflowGraph } from '../../types/workflowStudio';
import { clearAgentFactoryBusForTests } from '../activity/activityBus';
import {
  createProjectRecord,
  getAuditDb,
  resetDbConnectionForTests,
  upsertKeywordBusinessProfile,
} from '../audit/db';
import {
  SharedWorkflowContext,
  createSharedWorkflowContext,
  decideWorkflowApproval,
  waitForWorkflowToSettle,
} from './orchestrationEngine';
import {
  archiveStudioWorkflow,
  createStudioWorkflow,
  duplicateStudioWorkflow,
  executeStudioWorkflow,
  getStudioExecutionNodeDetail,
  getStudioWorkflowDetail,
  listStudioWorkflowsAndTemplates,
  publishStudioWorkflow,
  restoreStudioWorkflowVersion,
  saveStudioTemplate,
  updateStudioWorkflowDraft,
} from './workflowStudioService';

const TENANT_A = 'ten-stage4-a';
const TENANT_B = 'ten-stage4-b';
const PROJ_A = 'proj-stage4-a1';
const PROJ_B = 'proj-stage4-b1';

const OWNER_A: User = {
  id: 'usr-s4-owner',
  name: 'Simon Agency Owner',
  email: 'simon@alpha.example',
  role: 'Agency Owner',
  avatarInitials: 'SO',
  title: 'Agency Owner',
};

const STRATEGIST_A: User = {
  id: 'usr-s4-strat',
  name: 'Liam SEO Strategist',
  email: 'liam@alpha.example',
  role: 'SEO Strategist',
  avatarInitials: 'LS',
  title: 'SEO Strategist',
};

const QA_USER_A: User = {
  id: 'usr-s4-qa',
  name: 'Maya QA Reviewer',
  email: 'maya@alpha.example',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Reviewer',
};

describe('Deliverable 2 & Stage 4: SharedWorkflowContext + Visual Workflow Studio Integration', () => {
  let tmpDir = '';
  let prevDbPath: string | undefined;
  let prevGeminiKey: string | undefined;

  before(() => {
    prevDbPath = process.env.ROVIX_DB_PATH;
    prevGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-stage4-'));
    process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-stage4.db');
    resetDbConnectionForTests();
    clearAgentFactoryBusForTests();
    const db = getAuditDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(TENANT_A, 'Stage4 Alpha', now, TENANT_B, 'Stage4 Beta', now);

    createProjectRecord({
      id: PROJ_A,
      tenantId: TENANT_A,
      name: 'Alpha Dental Clinic',
      website: 'https://alphadental.example',
      targetMarkets: ['US', 'CA'],
      owner: OWNER_A.name,
    });

    createProjectRecord({
      id: PROJ_B,
      tenantId: TENANT_B,
      name: 'Beta Logistics',
      website: 'https://betalogistics.example',
      targetMarkets: ['UK'],
      owner: 'Beta Owner',
    });

    upsertKeywordBusinessProfile({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvedNiche: 'Family & cosmetic dentistry clinic in Austin',
      approvedServices: ['Dental Implants', 'Invisalign Clear Aligners', 'Emergency Dental Care'],
      targetAudience: 'Families and dental patients in Austin, TX',
      targetCountry: 'US',
      targetCity: 'Austin',
      targetLanguage: 'en',
      competitorUrls: ['https://rivaldental.example'],
      approvalStatus: 'approved',
      approvedBy: OWNER_A.name,
      approvedAt: now,
    });
  });

  after(() => {
    resetDbConnectionForTests();
    clearAgentFactoryBusForTests();
    if (prevDbPath !== undefined) process.env.ROVIX_DB_PATH = prevDbPath;
    else delete process.env.ROVIX_DB_PATH;
    if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('registers all 5 Stage 4 Drizzle schema tables matching SQLite migration 009', () => {
    assert.equal(getTableName(studioWorkflows), 'studio_workflows');
    assert.equal(getTableName(studioWorkflowVersions), 'studio_workflow_versions');
    assert.equal(getTableName(studioWorkflowTemplates), 'studio_workflow_templates');
    assert.equal(getTableName(studioValidationReports), 'studio_validation_reports');
    assert.equal(getTableName(studioWorkflowExecutions), 'studio_workflow_executions');
  });

  it('Deliverable 2: SharedWorkflowContext provides deeply frozen read-only approved project data with provenance', () => {
    const ctx = createSharedWorkflowContext({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: 'wf-ctx-test',
    });
    assert.ok(ctx instanceof SharedWorkflowContext);

    const profileEntry = ctx.getApprovedBusinessProfile();
    assert.equal(profileEntry.data.projectName, 'Alpha Dental Clinic');
    assert.equal(profileEntry.data.isApproved, true);
    assert.ok(profileEntry.data.approvedServices.includes('Dental Implants'));
    assert.equal(profileEntry.provenance.approvalStatus, 'approved');
    assert.equal(profileEntry.provenance.tenantId, TENANT_A);

    // Strictly immutable: mutation throws TypeError in strict mode
    assert.throws(() => {
      (profileEntry.data as { projectName: string }).projectName = 'Tampered';
    }, TypeError);
    assert.throws(() => {
      (profileEntry.data.approvedServices as string[]).push('Unauthorized');
    }, TypeError);

    const marketsEntry = ctx.getApprovedTargetMarkets();
    assert.equal(marketsEntry.data.hasApprovedMarkets, true);
    assert.ok(marketsEntry.data.marketCodes.includes('US'));

    const kwEntry = ctx.getApprovedKeywords();
    assert.equal(kwEntry.provenance.scope, 'approved_keywords');

    const compEntry = ctx.getCompetitorEvidence();
    assert.equal(compEntry.provenance.scope, 'competitor_evidence');

    const techEntry = ctx.getTechnicalAuditSnapshot();
    assert.equal(techEntry.data.hasCompletedCrawl, false);

    // Cross-tenant isolation check
    const crossTenantCtx = createSharedWorkflowContext({
      tenantId: TENANT_B,
      projectId: PROJ_A,
      workflowId: 'wf-ctx-cross',
    });
    assert.throws(() => crossTenantCtx.getApprovedBusinessProfile(), /NOT_FOUND/);
  });

  it('supports Workflow Studio CRUD, versioning, restore, publish/archive RBAC, custom templates, and tenant isolation', () => {
    // QA role is read-only
    assert.throws(
      () =>
        createStudioWorkflow({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          user: QA_USER_A,
          name: 'QA Blocked',
          templateId: BUILTIN_STUDIO_TEMPLATES[0].id,
        }),
      /FORBIDDEN/,
    );

    const created = createStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: OWNER_A,
      name: 'Alpha Audit Pipeline',
      templateId: BUILTIN_STUDIO_TEMPLATES[0].id,
    });
    assert.equal(created.validation.valid, true);
    assert.equal(created.version.versionNumber, 1);

    // Save v2 draft snapshot with modified node label
    const v2Graph = structuredClone(created.workflow.draftGraph);
    v2Graph.nodes[0].label = 'Custom Audit Trigger v2';
    const updated = updateStudioWorkflowDraft({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: STRATEGIST_A,
      graph: v2Graph,
      createSnapshot: true,
      changeSummary: 'Renamed trigger',
    });
    assert.equal(updated.workflow.activeVersionNumber, 2);
    assert.equal(updated.workflow.draftGraph.nodes[0].label, 'Custom Audit Trigger v2');

    // Restore v1
    const restored = restoreStudioWorkflowVersion({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      versionId: created.version.id,
      user: OWNER_A,
    });
    assert.equal(restored.workflow.draftGraph.nodes[0].label, created.workflow.draftGraph.nodes[0].label);

    // Publish succeeds for strategist, archive blocked for strategist but succeeds for owner
    const published = publishStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: STRATEGIST_A,
    });
    assert.equal(published.workflow.status, 'published');

    assert.throws(
      () =>
        archiveStudioWorkflow({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          studioWorkflowId: created.workflow.id,
          user: STRATEGIST_A,
        }),
      /FORBIDDEN/,
    );

    const dup = duplicateStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: OWNER_A,
    });
    assert.ok(dup.workflow.name.includes('(Copy)'));

    // Save custom template
    const customTpl = saveStudioTemplate({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: OWNER_A,
      name: 'Alpha Reusable Template',
      category: 'Agency Standard',
      description: 'Reusable audit flow',
      graph: created.workflow.draftGraph,
    });
    assert.equal(customTpl.isBuiltIn, false);

    const listRes = listStudioWorkflowsAndTemplates({
      tenantId: TENANT_A,
      projectId: PROJ_A,
    });
    assert.ok(listRes.templates.some((t) => t.id === customTpl.id));

    // Tenant B cannot access Tenant A's studio workflow
    assert.throws(
      () =>
        getStudioWorkflowDetail({
          tenantId: TENANT_B,
          projectId: PROJ_A,
          studioWorkflowId: created.workflow.id,
        }),
      /NOT_FOUND/,
    );

    const archived = archiveStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: dup.workflow.id,
      user: OWNER_A,
    });
    assert.equal(archived.status, 'archived');
  });

  it('executes visual conditional workflow via single Stage 2/3 DAG engine, prunes untaken branch, and preserves immutable version snapshot', async () => {
    const trig = createStudioNodeFromCatalog('manual_trigger', { x: 40, y: 160 }, 'trig_1');
    const research = createStudioNodeFromCatalog('research_agent', { x: 300, y: 160 }, 'res_1');
    const cond = createStudioNodeFromCatalog('if_else', { x: 560, y: 160 }, 'cond_1');
    cond.config.conditionRule = {
      field: 'hasApprovedProfile',
      operator: 'is_true',
      value: true,
      sourceNodeId: 'res_1',
    };
    const trueMerge = createStudioNodeFromCatalog('merge_results', { x: 840, y: 80 }, 'true_merge');
    const trueReport = createStudioNodeFromCatalog('reporting_agent', { x: 1120, y: 80 }, 'true_report');
    const falseSkipped = createStudioNodeFromCatalog('keyword_intelligence_agent', { x: 840, y: 260 }, 'false_kw');

    const graph: StudioWorkflowGraph = {
      nodes: [trig, research, cond, trueMerge, trueReport, falseSkipped],
      edges: [
        { id: 'e1', source: 'trig_1', target: 'res_1', edgeType: 'dependency', sourceHandle: 'default' },
        { id: 'e2', source: 'res_1', target: 'cond_1', edgeType: 'dependency', sourceHandle: 'default' },
        { id: 'e3', source: 'cond_1', target: 'true_merge', edgeType: 'conditional', sourceHandle: 'true', label: 'True' },
        { id: 'e4', source: 'true_merge', target: 'true_report', edgeType: 'dependency', sourceHandle: 'default' },
        { id: 'e5', source: 'cond_1', target: 'false_kw', edgeType: 'conditional', sourceHandle: 'false', label: 'False' },
      ],
    };

    const created = createStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: OWNER_A,
      name: 'Conditional Profile Branching Test',
      graph,
    });
    assert.equal(created.validation.valid, true);

    const launched = executeStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: OWNER_A,
    });

    // Mutate draft immediately after launch — running execution must stay isolated to immutable snapshot
    const mutatedGraph = structuredClone(graph);
    mutatedGraph.nodes[0].label = 'Mutated Draft After Launch';
    updateStudioWorkflowDraft({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: OWNER_A,
      graph: mutatedGraph,
      createSnapshot: false,
    });

    await waitForWorkflowToSettle(TENANT_A, launched.execution.workflow.id, 15_000);

    const detail = getStudioWorkflowDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
    });
    assert.ok(detail.activeExecution);
    assert.equal(detail.activeExecution.workflow.status, 'completed');

    // Verify condition node evaluated to 'true'
    const condExec = getStudioExecutionNodeDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: launched.execution.workflow.id,
      nodeId: 'cond_1',
    });
    assert.equal(condExec.taskStatus, 'completed');
    assert.equal(condExec.selectedBranch, 'true');

    // Verify True branch executed and produced real output
    const reportExec = getStudioExecutionNodeDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: launched.execution.workflow.id,
      nodeId: 'true_report',
    });
    assert.equal(reportExec.taskStatus, 'completed');
    assert.ok(reportExec.output);

    // Verify untaken False branch was cleanly skipped and NEVER executed
    const falseExec = getStudioExecutionNodeDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: launched.execution.workflow.id,
      nodeId: 'false_kw',
    });
    assert.equal(falseExec.taskStatus, 'skipped');
    assert.equal(falseExec.executions.length, 0);

    // Verify immutable version snapshot was unaffected by later draft mutation
    const execVersion = detail.versions.find((v) => v.id === launched.version.id);
    assert.ok(execVersion);
    assert.notEqual(execVersion.graph.nodes[0].label, 'Mutated Draft After Launch');
  });

  it('pauses visual workflow at Human Approval Gate node and resumes to completion upon owner approval', async () => {
    const trig = createStudioNodeFromCatalog('manual_trigger', { x: 40, y: 120 }, 't_app');
    const res = createStudioNodeFromCatalog('research_agent', { x: 300, y: 120 }, 'r_app');
    const gate = createStudioNodeFromCatalog('human_approval', { x: 560, y: 120 }, 'g_app');
    const rep = createStudioNodeFromCatalog('reporting_agent', { x: 840, y: 120 }, 'rep_app');

    const created = createStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: OWNER_A,
      name: 'Approval Gate Studio Flow',
      graph: {
        nodes: [trig, res, gate, rep],
        edges: [
          { id: 'ea1', source: 't_app', target: 'r_app', edgeType: 'dependency', sourceHandle: 'default' },
          { id: 'ea2', source: 'r_app', target: 'g_app', edgeType: 'dependency', sourceHandle: 'default' },
          { id: 'ea3', source: 'g_app', target: 'rep_app', edgeType: 'approval', sourceHandle: 'approved', label: 'Approved' },
        ],
      },
    });

    const launched = executeStudioWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
      user: OWNER_A,
    });

    await waitForWorkflowToSettle(TENANT_A, launched.execution.workflow.id, 15_000);

    const paused = getStudioWorkflowDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
    });
    assert.equal(paused.activeExecution?.workflow.status, 'waiting_for_approval');
    const pendingApproval = paused.activeExecution?.approvals.find((a) => a.status === 'pending');
    assert.ok(pendingApproval);

    // Non-approver (QA) cannot approve
    assert.throws(
      () =>
        decideWorkflowApproval({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          approvalId: pendingApproval.id,
          user: QA_USER_A,
          decision: 'approved',
        }),
      /FORBIDDEN/,
    );

    // Owner approves and workflow resumes to completion
    decideWorkflowApproval({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvalId: pendingApproval.id,
      user: OWNER_A,
      decision: 'approved',
      comments: 'Approved in Stage 4 test',
    });

    await waitForWorkflowToSettle(TENANT_A, launched.execution.workflow.id, 15_000);
    const finished = getStudioWorkflowDetail({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      studioWorkflowId: created.workflow.id,
    });
    assert.equal(finished.activeExecution?.workflow.status, 'completed');
  });
});
