import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-module8-test-'));
const PREV_DB_PATH = process.env.ROVIX_DB_PATH;
process.env.ROVIX_DB_PATH = path.join(TMP_DIR, 'module8.db');

import type { User } from '../../types/auth';
import {
  createProjectRecord,
  ensureTenantRecord,
  getAuditDb,
  getLatestSchemaVersion,
  resetDbConnectionForTests,
  saveObjectSnapshot,
} from '../audit/db';
import { upsertWorkspaceUsageBudget } from '../agentFactory/usageIntelligenceService';
import {
  configureCmsConnection,
  createTaskFromOnPageIssue,
  decideOnPageApproval,
  exportDraftHandoff,
  exportOnPageReport,
  generateAiRecommendationsForPages,
  getOnPageWorkspace,
  launchOnPageAgentWorkflow,
  markDraftAppliedExternally,
  removeCmsConnection,
  runOnPageAnalysis,
  saveOptimizationDraft,
  validateDraftAgainstLatestCrawl,
} from './onPageService';

const OWNER_USER: User = {
  id: 'usr_owner_m8',
  name: 'Simon Owner',
  email: 'simon@rovixai.com',
  role: 'Agency Owner',
  avatarInitials: 'SO',
  title: 'Agency Owner',
};

const VIEWER_USER: User = {
  id: 'usr_viewer_m8',
  name: 'Read Only QA',
  email: 'qa@rovixai.com',
  role: 'QA',
  avatarInitials: 'RQ',
  title: 'QA Reviewer',
};

const TENANT_B_USER: User = {
  id: 'usr_owner_b',
  name: 'Other Tenant',
  email: 'other@tenantb.com',
  role: 'Agency Owner',
  avatarInitials: 'OT',
  title: 'Agency Owner',
};

test.after(() => {
  resetDbConnectionForTests();
  if (PREV_DB_PATH === undefined) {
    delete process.env.ROVIX_DB_PATH;
  } else {
    process.env.ROVIX_DB_PATH = PREV_DB_PATH;
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

function insertTestCrawlRun(params: {
  id: string;
  tenantId: string;
  projectId: string;
  startedAt: string;
  completedAt: string;
}) {
  const db = getAuditDb();
  db.prepare(
    `INSERT INTO crawl_runs (
      id, tenant_id, project_id, status, crawl_type, configuration_json,
      started_at, completed_at, discovered_count, processed_count, error_count,
      summary_json, robots_snapshot_ref, sitemap_summary_json, triggered_by
    ) VALUES (?, ?, ?, 'Succeeded', 'full', ?, ?, ?, 2, 2, 0, ?, NULL, NULL, ?)`,
  ).run(
    params.id,
    params.tenantId,
    params.projectId,
    JSON.stringify({ startUrl: 'https://sandbox.rovixai.test/' }),
    params.startedAt,
    params.completedAt,
    JSON.stringify({ totalPages: 2 }),
    OWNER_USER.name,
  );
}

function insertTestCrawlUrl(params: {
  id: string;
  tenantId: string;
  crawlId: string;
  normalizedUrl: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: { tag: string; text: string }[];
  canonicalUrl: string | null;
  canonicalStatus: string;
  internalLinks: string[];
  missingAltCount: number;
  schemaTypes: string[];
  depth: number;
  rawHtmlObjectRef: string | null;
}) {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crawl_urls (
      id, tenant_id, crawl_id, normalized_url, requested_url, final_url,
      parent_url, discovery_source, redirect_chain_json, status_code,
      content_type, response_time_ms, depth, indexability, indexability_reason,
      canonical_url, canonical_status, title, meta_description, h1,
      headings_json, robots_directives_json, x_robots_tag, schema_types_json,
      schema_errors_json, hreflang_json, internal_links_json, external_links_json,
      missing_alt_count, has_viewport, html_lang, in_sitemap, issue_count,
      rendering_source, rendered_diff_json, raw_html_object_ref,
      rendered_dom_object_ref, fetched_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, NULL, 'seed', '[]', 200,
      'text/html; charset=utf-8', 120, ?, 'Indexable', 'Indexable',
      ?, ?, ?, ?, ?,
      ?, '[]', NULL, ?,
      '[]', '[]', ?, '[]',
      ?, 1, 'en', 1, 0,
      'raw_html', NULL, ?,
      NULL, ?
    )`,
  ).run(
    params.id,
    params.tenantId,
    params.crawlId,
    params.normalizedUrl,
    params.normalizedUrl,
    params.normalizedUrl,
    params.depth,
    params.canonicalUrl,
    params.canonicalStatus,
    params.title,
    params.metaDescription,
    params.h1,
    JSON.stringify(params.headings),
    JSON.stringify(params.schemaTypes),
    JSON.stringify(params.internalLinks),
    params.missingAltCount,
    params.rawHtmlObjectRef,
    now,
  );
}

function seedTenantAndCrawledProject() {
  resetDbConnectionForTests();
  ensureTenantRecord({
    id: 'tenant_m8_a',
    name: 'Tenant A',
    plan: 'Enterprise',
    primaryDomain: 'sandbox.rovixai.test',
  });
  ensureTenantRecord({
    id: 'tenant_m8_b',
    name: 'Tenant B',
    plan: 'Enterprise',
    primaryDomain: 'tenantb.example.com',
  });

  const project = createProjectRecord({
    tenantId: 'tenant_m8_a',
    name: 'Sandbox Enterprise SEO',
    website: 'https://sandbox.rovixai.test',
    targetMarkets: ['United States'],
    owner: OWNER_USER.name,
  });

  const crawlId = 'crawl_m8_1';
  const t1 = '2026-11-20T00:00:00.000Z';
  insertTestCrawlRun({
    id: crawlId,
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    startedAt: t1,
    completedAt: t1,
  });

  const htmlHome = `
    <html>
      <head>
        <title>Duplicate Brand Title</title>
      </head>
      <body>
        <h1>Enterprise SEO Platform</h1>
        <p>Automated technical crawl diagnostics and on-page intelligence built for growth engineering teams across global web properties.</p>
        <img src="/assets/dashboard.png" />
        <a href="/services/technical-seo">Click here</a>
      </body>
    </html>
  `;
  const htmlRef1 = saveObjectSnapshot('tenant_m8_a', 'm8_home_v1', htmlHome);

  insertTestCrawlUrl({
    id: 'curl_m8_1',
    tenantId: 'tenant_m8_a',
    crawlId,
    normalizedUrl: 'https://sandbox.rovixai.test/',
    title: 'Duplicate Brand Title',
    metaDescription: null,
    h1: 'Enterprise SEO Platform',
    headings: [{ tag: 'h1', text: 'Enterprise SEO Platform' }],
    canonicalUrl: 'https://sandbox.rovixai.test/',
    canonicalStatus: 'self',
    internalLinks: ['https://sandbox.rovixai.test/services/technical-seo'],
    missingAltCount: 1,
    schemaTypes: [],
    depth: 0,
    rawHtmlObjectRef: htmlRef1,
  });

  insertTestCrawlUrl({
    id: 'curl_m8_2',
    tenantId: 'tenant_m8_a',
    crawlId,
    normalizedUrl: 'https://sandbox.rovixai.test/services/technical-seo',
    title: 'Duplicate Brand Title',
    metaDescription: 'Technical SEO services description.',
    h1: null,
    headings: [],
    canonicalUrl: null,
    canonicalStatus: 'missing',
    internalLinks: ['https://sandbox.rovixai.test/'],
    missingAltCount: 0,
    schemaTypes: [],
    depth: 1,
    rawHtmlObjectRef: null,
  });

  return { project, crawlId };
}

test('Module 8 full lifecycle: migration 013, idempotent crawl analysis, deduplication, versioned drafts, approvals, fresh-crawl verification, tickets, workflows, CMS vault, RBAC & tenant isolation', async () => {
  const { project } = seedTenantAndCrawledProject();

  // 1. Migration 013 applied
  assert.equal(getLatestSchemaVersion(), '013_module8_onpage_seo_optimization');

  // 2. RBAC blocks Client Viewer from running analysis
  assert.throws(
    () =>
      runOnPageAnalysis({
        tenantId: 'tenant_m8_a',
        projectId: project.id,
        user: VIEWER_USER,
      }),
    /FORBIDDEN/,
  );

  // 3. Tenant isolation blocks cross-tenant workspace access
  assert.throws(
    () => getOnPageWorkspace('tenant_m8_b', project.id, TENANT_B_USER),
    /NOT_FOUND/,
  );

  // 4. Run On-Page analysis twice and verify strict issue deduplication
  const run1 = runOnPageAnalysis({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    user: OWNER_USER,
  });
  assert.equal(run1.pages.length, 2);
  assert.ok(run1.issues.length >= 4);

  const wsAfterRun1 = getOnPageWorkspace('tenant_m8_a', project.id, OWNER_USER);
  const issueCountAfterRun1 = wsAfterRun1.issues.length;
  assert.equal(wsAfterRun1.overview.crawledPagesAnalyzed, 2);

  runOnPageAnalysis({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    user: OWNER_USER,
  });
  const wsAfterRun2 = getOnPageWorkspace('tenant_m8_a', project.id, OWNER_USER);
  assert.equal(
    wsAfterRun2.issues.length,
    issueCountAfterRun1,
    'Re-running analysis must deduplicate issues by (tenant, project, page_url, issue_key)',
  );

  const homePage = wsAfterRun2.pages.find(
    (p) => p.url === 'https://sandbox.rovixai.test/',
  )!;
  assert.ok(homePage);
  assert.equal(homePage.htmlExtract.htmlAvailable, true);
  assert.equal(homePage.htmlExtract.imagesMissingAlt, 1);

  // 5. Save versioned drafts v1 and v2
  const draftV1 = saveOptimizationDraft({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    pageAnalysisId: homePage.id,
    proposed: {
      proposedTitle: 'Rovix AI — Enterprise Technical SEO Platform',
      proposedMetaDescription:
        'Enterprise crawl intelligence, automated on-page diagnostics, and approval-gated optimization workflows for technical SEO teams.',
      proposedH1: 'Enterprise Technical SEO Intelligence Platform',
      proposedHeadings: [
        { tag: 'h1', text: 'Enterprise Technical SEO Intelligence Platform' },
        { tag: 'h2', text: 'Automated Crawl Diagnostics' },
      ],
      proposedPrimaryKeyword: 'enterprise technical seo platform',
      proposedSecondaryKeywords: ['technical crawl diagnostics'],
      proposedImageAlts: [
        {
          src: '/assets/dashboard.png',
          currentAlt: null,
          proposedAlt: 'Rovix AI Technical SEO Diagnostics Dashboard',
        },
      ],
      proposedSchemaJsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Rovix AI',
        url: 'https://sandbox.rovixai.test',
      }),
      proposedSchemaTypes: ['Organization'],
      proposedContentNotes: 'Clarify enterprise crawl workflow in intro.',
      proposedInternalLinks: [],
    },
    changeSummary: 'Fix duplicate title, missing meta, missing alt, and add Organization JSON-LD',
    user: OWNER_USER,
  });
  assert.equal(draftV1.versionNumber, 1);
  assert.equal(draftV1.lifecycleStatus, 'draft_ready');

  const draftV2 = saveOptimizationDraft({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    pageAnalysisId: homePage.id,
    proposed: draftV1.proposed,
    changeSummary: 'Refined draft v2',
    user: OWNER_USER,
  });
  assert.equal(draftV2.versionNumber, 2);

  // 6. Cannot mark applied externally before approval
  assert.throws(
    () =>
      markDraftAppliedExternally({
        tenantId: 'tenant_m8_a',
        projectId: project.id,
        draftId: draftV2.id,
        channel: 'manual_cms_update',
        user: OWNER_USER,
      }),
    /APPROVAL_REQUIRED/,
  );

  // 7. Approve draft & recommendation via approval workflow
  const firstRec = wsAfterRun2.recommendations[0];
  const approvalRes = decideOnPageApproval({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    items: [
      { entityKind: 'draft', entityId: draftV2.id },
      ...(firstRec
        ? [{ entityKind: 'recommendation' as const, entityId: firstRec.id }]
        : []),
    ],
    decision: 'approved',
    comment: 'Reviewed and approved for release',
    user: OWNER_USER,
  });
  assert.ok(approvalRes.updatedCount >= 1);

  // 8. Mark applied externally, then verify against OLD crawl -> NOT verified!
  const applied = markDraftAppliedExternally({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    draftId: draftV2.id,
    channel: 'manual_cms_update',
    note: 'Updated via WordPress editor',
    user: OWNER_USER,
  });
  assert.equal(applied.lifecycleStatus, 'applied_externally');

  const valBefore = validateDraftAgainstLatestCrawl({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    draftId: draftV2.id,
    user: OWNER_USER,
  });
  assert.equal(valBefore.validation.verificationStatus, 'not_reflected');
  assert.notEqual(valBefore.draft.lifecycleStatus, 'verified');

  // 9. Insert a FRESH crawl with the updated live HTML & metadata -> now VERIFIED!
  const crawl2Id = 'crawl_m8_2';
  const t2 = '2026-11-20T02:00:00.000Z';
  insertTestCrawlRun({
    id: crawl2Id,
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    startedAt: t2,
    completedAt: t2,
  });
  const updatedHtml = `
    <html>
      <head>
        <title>Rovix AI — Enterprise Technical SEO Platform</title>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Organization","name":"Rovix AI","url":"https://sandbox.rovixai.test"}
        </script>
      </head>
      <body>
        <h1>Enterprise Technical SEO Intelligence Platform</h1>
        <img src="/assets/dashboard.png" alt="Rovix AI Technical SEO Diagnostics Dashboard" />
      </body>
    </html>
  `;
  const updatedHtmlRef = saveObjectSnapshot('tenant_m8_a', 'm8_home_v2', updatedHtml);
  insertTestCrawlUrl({
    id: 'curl_m8_3',
    tenantId: 'tenant_m8_a',
    crawlId: crawl2Id,
    normalizedUrl: 'https://sandbox.rovixai.test/',
    title: 'Rovix AI — Enterprise Technical SEO Platform',
    metaDescription:
      'Enterprise crawl intelligence, automated on-page diagnostics, and approval-gated optimization workflows for technical SEO teams.',
    h1: 'Enterprise Technical SEO Intelligence Platform',
    headings: [{ tag: 'h1', text: 'Enterprise Technical SEO Intelligence Platform' }],
    canonicalUrl: 'https://sandbox.rovixai.test/',
    canonicalStatus: 'self',
    internalLinks: [],
    missingAltCount: 0,
    schemaTypes: ['Organization'],
    depth: 0,
    rawHtmlObjectRef: updatedHtmlRef,
  });

  const valAfter = validateDraftAgainstLatestCrawl({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    draftId: draftV2.id,
    crawlId: crawl2Id,
    user: OWNER_USER,
  });
  assert.equal(valAfter.validation.verificationStatus, 'verified');
  assert.equal(valAfter.draft.lifecycleStatus, 'verified');

  // 10. Create developer ticket from an On-Page issue
  const issue0 = wsAfterRun2.issues[0];
  const taskRes = createTaskFromOnPageIssue({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    issueId: issue0.id,
    user: OWNER_USER,
  });
  assert.ok(taskRes.ticket.id.startsWith('TKT-OP-'));
  assert.equal(taskRes.issue.linkedTicketId, taskRes.ticket.id);

  // 11. CMS adapters: SSRF blocks localhost, valid config stores AES-256-GCM encrypted & stays configured_unverified (never fakes connected)
  await assert.rejects(
    () =>
      configureCmsConnection({
        tenantId: 'tenant_m8_a',
        projectId: project.id,
        platform: 'wordpress',
        siteUrl: 'http://127.0.0.1:8080',
        credentials: { username: 'admin', applicationPassword: 'secret' },
        user: OWNER_USER,
      }),
    /SSRF_BLOCKED/,
  );

  const cmsConn = await configureCmsConnection({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    platform: 'wordpress',
    siteUrl: 'https://sandbox.rovixai.test',
    credentials: { username: 'wp_editor', applicationPassword: 'app-password-1234' },
    user: OWNER_USER,
  });
  assert.equal(cmsConn.status, 'configured_unverified');
  assert.equal(cmsConn.hasEncryptedCredentials, true);
  assert.equal(cmsConn.autoPublishPermitted, false);

  // Verify raw SQLite row does NOT contain plaintext password
  const db = getAuditDb();
  const rawCmsRow = db
    .prepare(
      'SELECT encrypted_credentials_json FROM cms_connection_records WHERE id = ?',
    )
    .get(cmsConn.id) as { encrypted_credentials_json: string };
  assert.ok(!rawCmsRow.encrypted_credentials_json.includes('app-password-1234'));
  assert.ok(rawCmsRow.encrypted_credentials_json.includes('aes-256-gcm'));

  const handoffMd = exportDraftHandoff({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    draftId: draftV2.id,
    platform: 'wordpress',
    format: 'markdown',
  });
  assert.ok(handoffMd.content.includes('Manual implementation handoff only'));

  assert.equal(
    removeCmsConnection({
      tenantId: 'tenant_m8_a',
      projectId: project.id,
      platform: 'wordpress',
      user: OWNER_USER,
    }).deleted,
    true,
  );

  // 12. Bulk AI recommendation requires explicit confirmation AND enforces Stage 5 budget
  await assert.rejects(
    () =>
      generateAiRecommendationsForPages({
        tenantId: 'tenant_m8_a',
        projectId: project.id,
        pageAnalysisIds: wsAfterRun2.pages.map((p) => p.id),
        confirmedBulk: false,
        user: OWNER_USER,
      }),
    /CONFIRMATION_REQUIRED/,
  );

  const strictBudget = upsertWorkspaceUsageBudget({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    scopeType: 'project',
    scopeTargetId: project.id,
    name: 'Strict Zero AI Spend Cap',
    periodType: 'monthly',
    budgetLimitMicros: 1,
    maxTokensPerRun: 1,
    warningThresholdPct: 80,
    enforcementPolicy: 'pause_execution',
    enabled: true,
    user: OWNER_USER,
  });

  // Record a real Stage 5 usage event so measured spend exceeds budgetLimitMicros=1
  const { recordAgentExecutionUsage, removeWorkspaceUsageBudget } = await import(
    '../agentFactory/usageIntelligenceService'
  );
  recordAgentExecutionUsage({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    workflowId: null,
    executionId: null,
    taskId: null,
    agentId: 'content_strategy_agent',
    provider: 'google_gemini',
    model: 'gemini-4-hydrogen',
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 0,
    totalTokens: 1500,
    usageSource: 'provider_response',
    measurementStatus: 'measured',
    providerRequestId: 'req_budget_test_1',
    latencyMs: 120,
    status: 'succeeded',
    idempotencyKey: 'm8_test_budget_evt_1',
    rawUsageMetadata: null,
  });

  await assert.rejects(
    () =>
      generateAiRecommendationsForPages({
        tenantId: 'tenant_m8_a',
        projectId: project.id,
        pageAnalysisIds: [homePage.id],
        user: OWNER_USER,
      }),
    /BUDGET_BLOCKED/,
  );

  // Clean up test cap before testing Agent Factory DAG workflow launch
  removeWorkspaceUsageBudget({
    tenantId: 'tenant_m8_a',
    budgetId: strictBudget.id,
    user: OWNER_USER,
  });

  // 13. Export CSV & JSON report
  const csvExport = exportOnPageReport({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    format: 'csv',
  });
  assert.ok(csvExport.content.includes('https://sandbox.rovixai.test/'));

  // 14. Launch Agent Factory On-Page DAG workflow reusing Stages 2-6
  const wf = launchOnPageAgentWorkflow({
    tenantId: 'tenant_m8_a',
    projectId: project.id,
    pageAnalysisId: homePage.id,
    user: OWNER_USER,
  });
  assert.ok(wf.workflow.id);
  assert.equal(wf.tasks.length, 6);
});
