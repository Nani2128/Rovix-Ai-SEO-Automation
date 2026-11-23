import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { User } from '../../types/auth';
import { clearAgentFactoryBusForTests } from '../activity/activityBus';
import {
  createProjectRecord,
  getAuditDb,
  resetDbConnectionForTests,
  upsertKeywordBusinessProfile,
} from '../audit/db';
import { buildAgentFactorySnapshot } from './agentFactoryService';
import { recoverInterruptedAgentWorkflowsInDb } from './orchestrationDb';
import {
  cancelAgentWorkflow,
  createAgentWorkflow,
  decideWorkflowApproval,
  getAgentOrchestrationOverview,
  getAgentWorkflowDetailScoped,
  retryWorkflowTask,
  setOrchestrationTestHooksForTests,
  waitForWorkflowToSettle,
} from './orchestrationEngine';

const TENANT_A = 'ten-orch-a';
const TENANT_B = 'ten-orch-b';
const PROJ_A = 'proj-orch-a1';
const PROJ_B = 'proj-orch-b1';

const OWNER_USER: User = {
  id: 'usr-owner-a',
  name: 'Alex Business Owner',
  email: 'owner@alpha.example',
  role: 'Business Owner',
  avatarInitials: 'AO',
  title: 'Business Owner',
};

const STRATEGIST_USER: User = {
  id: 'usr-strat-a',
  name: 'Jamie Strategist',
  email: 'strategist@alpha.example',
  role: 'SEO Strategist',
  avatarInitials: 'JS',
  title: 'SEO Strategist',
};

describe('Stage 2 Multi-Agent Execution Engine & Orchestration', () => {
  let tmpDir = '';
  let prevDbPath: string | undefined;
  let prevGeminiKey: string | undefined;

  before(() => {
    prevDbPath = process.env.ROVIX_DB_PATH;
    prevGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-orch-'));
    process.env.ROVIX_DB_PATH = path.join(tmpDir, 'test-orch.db');
    resetDbConnectionForTests();
    clearAgentFactoryBusForTests();

    const db = getAuditDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(TENANT_A, 'Alpha Corp', now, TENANT_B, 'Beta Corp', now);

    createProjectRecord({
      id: PROJ_A,
      tenantId: TENANT_A,
      name: 'Alpha Dental Clinic',
      website: 'https://alphadental.example',
      targetMarkets: ['US', 'CA'],
      owner: 'Alex Business Owner',
    });

    createProjectRecord({
      id: PROJ_B,
      tenantId: TENANT_B,
      name: 'Beta Private Clinic',
      website: 'https://betaclinic.example',
      targetMarkets: ['UK'],
      owner: 'Sam',
    });

    upsertKeywordBusinessProfile({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvedNiche: 'Cosmetic and Preventive Dentistry',
      approvedServices: ['Dental Implants Austin', 'Emergency Tooth Repair'],
      targetAudience: 'Families and adults in Austin',
      targetCountry: 'US',
      targetCity: 'Austin',
      targetLanguage: 'en',
      competitorUrls: [],
      approvalStatus: 'approved',
      approvedBy: 'Alex Business Owner',
      approvedAt: now,
    });

    // Seed one verified crawled URL for QA internal-link checks
    db.prepare(
      `INSERT INTO crawl_runs (
         id, tenant_id, project_id, status, crawl_type, configuration_json,
         started_at, completed_at, discovered_count, processed_count, error_count,
         summary_json, triggered_by
       ) VALUES (?, ?, ?, 'Succeeded', 'full', ?, ?, ?, 1, 1, 0, ?, ?)`,
    ).run(
      'crw-orch-seed-1',
      TENANT_A,
      PROJ_A,
      JSON.stringify({ startingUrl: 'https://alphadental.example/' }),
      now,
      now,
      JSON.stringify({ healthScore: 92 }),
      'Alex Business Owner',
    );

    db.prepare(
      `INSERT INTO crawl_urls (
         id, tenant_id, crawl_id, normalized_url, requested_url, final_url,
         parent_url, discovery_source, redirect_chain_json, status_code,
         content_type, response_time_ms, depth, indexability, indexability_reason,
         canonical_url, canonical_status, title, meta_description, h1,
         headings_json, robots_directives_json, x_robots_tag,
         schema_types_json, schema_errors_json, hreflang_json,
         internal_links_json, external_links_json, missing_alt_count,
         has_viewport, html_lang, in_sitemap, issue_count,
         rendering_source, rendered_diff_json, raw_html_object_ref,
         rendered_dom_object_ref, fetched_at
       ) VALUES (
         'curl-seed-1', ?, 'crw-orch-seed-1', 'https://alphadental.example/services/implants',
         'https://alphadental.example/services/implants', 'https://alphadental.example/services/implants',
         'https://alphadental.example/', 'seed', '[]', 200,
         'text/html', 42, 1, 'Indexable', '200 OK',
         'https://alphadental.example/services/implants', 'Self',
         'Dental Implants Austin | Alpha Dental', 'Verified implant care', 'Dental Implants Austin',
         '[]', '[]', NULL,
         '[]', '[]', '[]',
         '[]', '[]', 0,
         1, 'en', 1, 0,
         'raw_html', NULL, NULL,
         NULL, ?
       )`,
    ).run(TENANT_A, now);
  });

  after(() => {
    setOrchestrationTestHooksForTests(null);
    clearAgentFactoryBusForTests();
    resetDbConnectionForTests();
    if (prevDbPath === undefined) delete process.env.ROVIX_DB_PATH;
    else process.env.ROVIX_DB_PATH = prevDbPath;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects circular dependency DAG graphs before creating or executing a workflow', () => {
    assert.throws(
      () =>
        createAgentWorkflow({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          user: STRATEGIST_USER,
          templateId: 'custom_dag',
          name: 'Invalid Cyclic Pipeline',
          nodes: [
            { nodeKey: 'a', agentId: 'research_agent', title: 'Research' },
            { nodeKey: 'b', agentId: 'content_strategy_agent', title: 'Strategy' },
          ],
          edges: [
            { fromNodeKey: 'a', toNodeKey: 'b' },
            { fromNodeKey: 'b', toNodeKey: 'a' },
          ],
        }),
      /Circular dependency detected/i,
    );
  });

  it('pauses at human approval gates, enforces RBAC on decisions, executes Gemini + QA handoffs, and records genuine token telemetry', async () => {
    let generatorCalls = 0;
    setOrchestrationTestHooksForTests({
      llmGenerator: async (input) => {
        generatorCalls += 1;
        return {
          provider: 'google_gemini',
          model: 'gemini-4-hydrogen',
          inputTokens: 412,
          outputTokens: 638,
          totalTokens: 1050,
          draft: {
            aiDraftLabel: 'AI-Generated Draft (Pending Human Review — Auto-Publish Disabled)',
            autoPublishPermitted: false,
            targetKeyword: input.targetKeyword,
            seoTitle: `${input.targetKeyword} Guide | Alpha Dental`,
            metaDescription: 'Evidence-grounded guide to dental implant consultations in Austin.',
            h1: input.recommendedH1,
            outline: input.recommendedSections,
            fullContentDraft:
              'Dental Implants Austin require careful diagnostic imaging, periodontal evaluation, and structured restorative planning before placement. Alpha Dental provides personalized clinical consultations across Austin tailored to individual patient bone density, gum health, and long-term bite alignment.\n\nSchedule a thorough diagnostic review through our verified service page so our clinical team can map your treatment timeline, review restorative materials, and confirm post-procedure recovery milestones.',
            faqSuggestions: [
              {
                question: 'What happens during an implant consultation?',
                answer: 'Clinicians assess gum health and diagnostic scans before planning.',
              },
            ],
            internalLinkingSuggestions: [
              {
                anchorText: 'Dental Implants Services',
                targetUrl: 'https://alphadental.example/services/implants',
                rationale: 'Matches verified crawled project URL',
              },
            ],
            schemaRecommendations: ['MedicalWebPage', 'FAQPage'],
            sourcedFacts: [`Verified URL: https://alphadental.example/services/implants`],
            aiGeneratedSuggestions: ['Add patient recovery timeline checklist'],
            supportingEvidenceReferences: input.supportingEvidence.map((e) => e.sourceUrl),
          },
        };
      },
    });

    const created = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: STRATEGIST_USER,
      templateId: 'content_brief_to_draft',
      config: { targetKeyword: 'Dental Implants Austin' },
      blueprintOptions: {
        requireStrategyApproval: true,
        requireDraftApproval: true,
      },
    });

    // Should pause at Strategy Approval Gate before calling content_generation_agent
    const settled1 = await waitForWorkflowToSettle(TENANT_A, created.workflow.id);
    assert.equal(settled1.workflow.status, 'waiting_for_approval');
    assert.equal(generatorCalls, 0);

    const strategyApproval = settled1.approvals.find(
      (a) => a.gateType === 'content_brief' && a.status === 'pending',
    );
    assert.ok(strategyApproval);

    // RBAC check: SEO Strategist CANNOT approve official owner gates
    assert.throws(
      () =>
        decideWorkflowApproval({
          tenantId: TENANT_A,
          projectId: PROJ_A,
          approvalId: strategyApproval.id,
          decision: 'approved',
          comments: 'Self-approve attempt',
          user: STRATEGIST_USER,
        }),
      /FORBIDDEN/,
    );

    // Tenant isolation check: Tenant B cannot read Tenant A workflow
    assert.throws(
      () => getAgentWorkflowDetailScoped(TENANT_B, PROJ_A, created.workflow.id),
      /NOT_FOUND/,
    );

    // Business Owner approves strategy -> unlocks Content Generation Agent -> pauses on draft gate
    decideWorkflowApproval({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvalId: strategyApproval.id,
      decision: 'approved',
      comments: 'Brief aligns with Austin clinical services.',
      user: OWNER_USER,
    });

    const settled2 = await waitForWorkflowToSettle(TENANT_A, created.workflow.id);
    assert.equal(settled2.workflow.status, 'waiting_for_approval');
    assert.equal(generatorCalls, 1);

    const draftApproval = settled2.approvals.find(
      (a) => a.gateType === 'generated_content' && a.status === 'pending',
    );
    assert.ok(draftApproval);

    // Approve generated AI draft -> unlocks QA + Reporting
    decideWorkflowApproval({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      approvalId: draftApproval.id,
      decision: 'approved',
      comments: 'Clinical tone and links approved.',
      user: OWNER_USER,
    });

    const settled3 = await waitForWorkflowToSettle(TENANT_A, created.workflow.id);
    assert.equal(settled3.workflow.status, 'completed');
    assert.ok(settled3.handoffs.length >= 4);
    assert.ok(settled3.outputs.some((o) => o.agentId === 'quality_assurance_agent'));
    assert.ok(settled3.outputs.some((o) => o.agentId === 'reporting_agent'));

    const overview = getAgentOrchestrationOverview(TENANT_A, PROJ_A);
    assert.equal(overview.telemetrySummary.measuredInputTokens, 412);
    assert.equal(overview.telemetrySummary.measuredOutputTokens, 638);
    assert.equal(overview.telemetrySummary.measuredTotalTokens, 1050);

    const snap = buildAgentFactorySnapshot({ tenantId: TENANT_A, projectId: PROJ_A });
    const genNode = snap.nodes.find((n) => n.agentId === 'content_generation_agent');
    assert.ok(genNode);
    assert.equal(genNode.metrics.totalInputTokens, 412);
    assert.equal(genNode.metrics.totalOutputTokens, 638);
  });

  it('fails recoverably without fake output when GEMINI_API_KEY is unconfigured, and supports manual task retry', async () => {
    setOrchestrationTestHooksForTests(null); // Use real generateSeoDraftWithProvider without GEMINI_API_KEY

    const wf = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: OWNER_USER,
      templateId: 'content_brief_to_draft',
      config: { targetKeyword: 'Emergency Tooth Repair' },
      blueprintOptions: {
        requireStrategyApproval: false,
        requireDraftApproval: false,
      },
    });

    const failedDetail = await waitForWorkflowToSettle(TENANT_A, wf.workflow.id);
    assert.equal(failedDetail.workflow.status, 'failed');

    const genTask = failedDetail.tasks.find(
      (t) => t.agentId === 'content_generation_agent',
    );
    assert.ok(genTask);
    assert.equal(genTask.status, 'failed');
    assert.match(genTask.errorSummary ?? '', /PROVIDER_UNAVAILABLE/);

    // Downstream QA & Reporting nodes must be blocked cleanly, never executed
    const qaTask = failedDetail.tasks.find(
      (t) => t.agentId === 'quality_assurance_agent',
    );
    assert.equal(qaTask?.status, 'blocked');

    // Now supply real provider override and test manual retryTask resumption
    setOrchestrationTestHooksForTests({
      llmGenerator: async (input) => ({
        provider: 'google_gemini',
        model: 'gemini-4-hydrogen',
        inputTokens: 200,
        outputTokens: 300,
        totalTokens: 500,
        draft: {
          aiDraftLabel: 'AI-Generated Draft (Pending Human Review — Auto-Publish Disabled)',
          autoPublishPermitted: false,
          targetKeyword: input.targetKeyword,
          seoTitle: `${input.targetKeyword} Help`,
          metaDescription: 'Immediate dental emergency assessment.',
          h1: input.recommendedH1,
          outline: input.recommendedSections,
          fullContentDraft:
            'Emergency Tooth Repair requires immediate professional diagnostic evaluation to protect tooth viability, stabilize fractured enamel, and manage acute discomfort safely. Alpha Dental offers urgent clinical triage, digital imaging, and same-day restorative stabilization across Austin.\n\nContact our verified dental clinic team directly if you experience severe dental trauma, swelling, or sudden restoration loss so clinicians can evaluate tissue health promptly.',
          faqSuggestions: [],
          internalLinkingSuggestions: [
            {
              anchorText: 'Implants & Restorative Care',
              targetUrl: 'https://alphadental.example/services/implants',
              rationale: 'Existing project page',
            },
          ],
          schemaRecommendations: ['MedicalWebPage'],
          sourcedFacts: ['Verified crawl baseline'],
          aiGeneratedSuggestions: [],
          supportingEvidenceReferences: ['https://alphadental.example/services/implants'],
        },
      }),
    });

    retryWorkflowTask({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      taskId: genTask.id,
      user: OWNER_USER,
    });

    const recovered = await waitForWorkflowToSettle(TENANT_A, wf.workflow.id);
    assert.equal(recovered.workflow.status, 'completed');
  });

  it('supports clean workflow cancellation and crash-recovery re-queuing on startup', async () => {
    setOrchestrationTestHooksForTests(null);

    const wf = createAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      user: STRATEGIST_USER,
      templateId: 'content_brief_to_draft',
      config: { targetKeyword: 'Teeth Whitening Austin' },
      blueprintOptions: { requireStrategyApproval: true, requireDraftApproval: true },
    });

    await waitForWorkflowToSettle(TENANT_A, wf.workflow.id);
    const cancelled = cancelAgentWorkflow({
      tenantId: TENANT_A,
      projectId: PROJ_A,
      workflowId: wf.workflow.id,
      user: STRATEGIST_USER,
      reason: 'Superseded by Q4 campaign',
    });

    assert.equal(cancelled.workflow.status, 'cancelled');
    assert.ok(cancelled.approvals.every((a) => a.status !== 'pending'));

    // Simulate interrupted in-flight running task across server restart
    const db = getAuditDb();
    db.prepare(
      `INSERT INTO agent_workflows (
         id, tenant_id, project_id, template_id, name, objective, status,
         current_stage, blocking_reason, created_by, started_at, completed_at,
         cancelled_at, config_json, created_at, updated_at
       ) VALUES (?, ?, ?, 'custom_dag', 'Crash Test WF', '', 'running', 'Running', NULL, 'Alex', ?, NULL, NULL, '{}', ?, ?)`,
    ).run(
      'awf-crash-test',
      TENANT_A,
      PROJ_A,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    );

    db.prepare(
      `INSERT INTO agent_tasks (
         id, tenant_id, project_id, workflow_id, node_key, agent_id, title,
         status, attempt_count, max_retries, next_retry_at, blocking_reason,
         error_summary, approval_required, approval_gate_type, started_at,
         completed_at, duration_ms, output_id, created_at, updated_at
       ) VALUES (?, ?, ?, 'awf-crash-test', 'r1', 'research_agent', 'Interrupted Research',
         'running', 1, 2, NULL, NULL, NULL, 0, NULL, ?, NULL, NULL, NULL, ?, ?)`,
    ).run(
      'task-crash-1',
      TENANT_A,
      PROJ_A,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const recoveredCount = recoverInterruptedAgentWorkflowsInDb();
    assert.ok(recoveredCount >= 1);

    const afterRecovery = getAgentWorkflowDetailScoped(TENANT_A, PROJ_A, 'awf-crash-test');
    assert.equal(afterRecovery.tasks[0].status, 'queued');
  });
});
