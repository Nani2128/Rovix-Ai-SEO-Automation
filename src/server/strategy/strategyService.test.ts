import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { User } from '../../types/auth';
import {
  createProjectRecord,
  ensureTenantRecord,
  getAuditDb,
  listAuditTrailForEntity,
  listTicketsForProject,
  resetDbConnectionForTests,
  upsertGeoTargetMarket,
  upsertKeywordBusinessProfile,
} from '../audit/db';
import {
  archiveArchitecturePage,
  createArchitecturePage,
  createTaskFromRoadmapItem,
  decideStrategyApproval,
  generateStrategyVersion,
  getStrategyWorkspace,
  launchStrategyAgentWorkflow,
  moveArchitecturePage,
  updateArchitecturePage,
} from './strategyService';

const PREV_DB_PATH = process.env.ROVIX_DB_PATH;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rovix-module7-test-'));
process.env.ROVIX_DB_PATH = path.join(TMP_DIR, 'module7-strategy.db');

const OWNER_A: User = {
  id: 'usr-owner-a',
  name: 'Simon Owner',
  email: 'owner-a@rovix.test',
  role: 'Agency Owner',
  avatarInitials: 'SO',
  title: 'Agency Owner',
};

const QA_USER: User = {
  id: 'usr-qa-a',
  name: 'Maya QA',
  email: 'qa-a@rovix.test',
  role: 'QA',
  avatarInitials: 'MQ',
  title: 'QA Engineer',
};

const OWNER_B: User = {
  id: 'usr-owner-b',
  name: 'Alex OtherTenant',
  email: 'owner-b@rovix.test',
  role: 'Agency Owner',
  avatarInitials: 'AO',
  title: 'Agency Owner',
};

function setupTenantAndProject(tenantId: string, name: string, website: string) {
  ensureTenantRecord({
    id: tenantId,
    name: `Tenant ${tenantId}`,
    plan: 'Enterprise',
    primaryDomain: website.replace(/^https?:\/\//, ''),
  });
  return createProjectRecord({
    tenantId,
    name,
    website,
    targetMarkets: ['United States'],
    owner: OWNER_A.name,
  });
}

test.after(() => {
  resetDbConnectionForTests();
  if (PREV_DB_PATH === undefined) delete process.env.ROVIX_DB_PATH;
  else process.env.ROVIX_DB_PATH = PREV_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('Module 7 Integration: Strategy generation, version history, architecture CRUD, drag-drop move, cycle guard, and safe archive', () => {
  resetDbConnectionForTests();
  const project = setupTenantAndProject(
    'ten-m7-a',
    'Northstar Solar',
    'https://northstarsolar.test',
  );

  // Seed real approved business profile + approved location
  upsertKeywordBusinessProfile({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    approvedNiche: 'Commercial Solar Installation',
    approvedServices: ['Commercial Solar Panels', 'Battery Storage'],
    targetAudience: 'Commercial facility managers',
    targetCountry: 'US',
    targetCity: 'Denver',
    targetLanguage: 'en',
    competitorUrls: [],
    approvalStatus: 'approved',
    approvedBy: OWNER_A.name,
    approvedAt: new Date().toISOString(),
  });

  upsertGeoTargetMarket({
    id: 'geo-denver',
    tenantId: 'ten-m7-a',
    projectId: project.id,
    granularity: 'city',
    countryCode: 'US',
    countryName: 'United States',
    isoNumeric: '840',
    stateRegion: 'Colorado',
    stateFips: '08',
    city: 'Denver',
    language: 'en',
    serviceAreas: ['Denver Metro'],
    priority: 'primary',
    approvalStatus: 'approved',
    approvedBy: OWNER_A.name,
    approvedAt: new Date().toISOString(),
    recommendedBy: OWNER_A.name,
    recommendedReason: 'Primary service branch',
    latitude: 39.7392,
    longitude: -104.9903,
    approvalHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Generate Version 1
  const gen1 = generateStrategyVersion({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    user: OWNER_A,
  });
  assert.equal(gen1.version.versionNumber, 1);
  assert.ok(gen1.workspace.pages.length >= 4);
  assert.ok(
    gen1.workspace.pages.some((p) => p.pageType === 'location' && p.targetGeography?.includes('Denver')),
  );

  // Create custom proposed page
  const rootPage = gen1.workspace.pages.find((p) => p.pageType === 'homepage')!;
  const servicesHub = gen1.workspace.pages.find((p) => p.slug === '/services')!;
  const created = createArchitecturePage({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    strategyVersionId: gen1.version.id,
    user: OWNER_A,
    parentPageId: rootPage.id,
    title: 'Solar Maintenance Plans',
    slug: '/services/maintenance-plans',
    pageType: 'service',
    primaryKeyword: 'commercial solar maintenance',
    secondaryKeywords: ['solar panel servicing'],
    searchIntent: 'Commercial',
    targetGeography: 'Denver, Colorado',
  });
  assert.equal(created.parentPageId, rootPage.id);

  // Edit page keyword mapping
  const updated = updateArchitecturePage({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    pageId: created.id,
    user: OWNER_A,
    patch: {
      primaryKeyword: 'commercial solar maintenance denver',
      notes: 'Verified with ops team',
    },
  });
  assert.equal(updated.primaryKeyword, 'commercial solar maintenance denver');

  // Drag-and-drop move under Services Hub
  const moved = moveArchitecturePage({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    pageId: created.id,
    newParentPageId: servicesHub.id,
    newSortOrder: 2,
    user: OWNER_A,
  });
  assert.equal(moved.parentPageId, servicesHub.id);
  assert.equal(moved.sortOrder, 2);

  // Cycle protection blocks moving Services Hub under its own child
  assert.throws(
    () =>
      moveArchitecturePage({
        tenantId: 'ten-m7-a',
        projectId: project.id,
        pageId: servicesHub.id,
        newParentPageId: created.id,
        user: OWNER_A,
      }),
    /VALIDATION/,
  );

  // Safe archive preserves row in DB without touching live site
  const archived = archiveArchitecturePage({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    pageId: created.id,
    user: OWNER_A,
    reason: 'Deferred to Q3',
  });
  assert.equal(archived.pageStatus, 'archived');
  assert.ok(archived.archivedAt);

  // Generate Version 2 and confirm both versions are retained in history
  const gen2 = generateStrategyVersion({
    tenantId: 'ten-m7-a',
    projectId: project.id,
    user: OWNER_A,
  });
  assert.equal(gen2.version.versionNumber, 2);
  assert.equal(gen2.workspace.versions.length, 2);

  // Audit trail captured creation/move/archive
  const pageTrail = listAuditTrailForEntity('ten-m7-a', created.id);
  assert.ok(pageTrail.length >= 3);
});

test('Module 7 Integration: Approvals, Roadmap-to-Ticket promotion, Agent Factory launch, RBAC, and strict Tenant Isolation', () => {
  const projectA = setupTenantAndProject(
    'ten-m7-iso-a',
    'Solar Co A',
    'https://solar-a.test',
  );
  setupTenantAndProject('ten-m7-iso-b', 'Solar Co B', 'https://solar-b.test');

  const gen = generateStrategyVersion({
    tenantId: 'ten-m7-iso-a',
    projectId: projectA.id,
    user: OWNER_A,
  });
  const roadmapItem = gen.workspace.roadmapItems[0];
  assert.ok(roadmapItem);

  // QA role cannot edit, approve, create tasks, or launch workflows
  assert.throws(
    () =>
      generateStrategyVersion({
        tenantId: 'ten-m7-iso-a',
        projectId: projectA.id,
        user: QA_USER,
      }),
    /FORBIDDEN/,
  );
  assert.throws(
    () =>
      decideStrategyApproval({
        tenantId: 'ten-m7-iso-a',
        projectId: projectA.id,
        entityKind: 'roadmap_item',
        entityId: roadmapItem.id,
        decision: 'approved',
        user: QA_USER,
      }),
    /FORBIDDEN/,
  );

  // Cannot create task before roadmap item is approved
  assert.throws(
    () =>
      createTaskFromRoadmapItem({
        tenantId: 'ten-m7-iso-a',
        projectId: projectA.id,
        roadmapItemId: roadmapItem.id,
        user: OWNER_A,
      }),
    /VALIDATION/,
  );

  // Owner approves roadmap item -> recorded in approvals & audit trail
  const approval = decideStrategyApproval({
    tenantId: 'ten-m7-iso-a',
    projectId: projectA.id,
    entityKind: 'roadmap_item',
    entityId: roadmapItem.id,
    decision: 'approved',
    comment: 'Approved for sprint execution',
    user: OWNER_A,
  });
  assert.equal(approval.newStatus, 'approved');

  // Create real developer ticket from approved roadmap item
  const taskResult = createTaskFromRoadmapItem({
    tenantId: 'ten-m7-iso-a',
    projectId: projectA.id,
    roadmapItemId: roadmapItem.id,
    assignedUser: 'Dev Lead',
    user: OWNER_A,
  });
  assert.ok(taskResult.ticket.id.startsWith('tkt-'));
  assert.equal(taskResult.roadmapItem.implementationStatus, 'queued_task');
  assert.equal(taskResult.roadmapItem.linkedTicketId, taskResult.ticket.id);

  const ticketsInDb = listTicketsForProject('ten-m7-iso-a', projectA.id);
  assert.ok(ticketsInDb.some((t) => t.id === taskResult.ticket.id));

  // Launch real Agent Factory workflow via existing Stage 2-6 engine
  const wfLaunch = launchStrategyAgentWorkflow({
    tenantId: 'ten-m7-iso-a',
    projectId: projectA.id,
    user: OWNER_A,
    roadmapItemId: roadmapItem.id,
  });
  assert.ok(wfLaunch.workflow.workflow.id.startsWith('awf-'));
  assert.equal(wfLaunch.roadmapItem?.linkedWorkflowId, wfLaunch.workflow.workflow.id);
  assert.equal(
    wfLaunch.roadmapItem?.implementationStatus,
    'agent_workflow_launched',
  );

  // Tenant B cannot access Tenant A's project or strategy records
  assert.throws(
    () =>
      getStrategyWorkspace({
        tenantId: 'ten-m7-iso-b',
        projectId: projectA.id,
        user: OWNER_B,
      }),
    /NOT_FOUND/,
  );
  assert.throws(
    () =>
      decideStrategyApproval({
        tenantId: 'ten-m7-iso-b',
        projectId: projectA.id,
        entityKind: 'roadmap_item',
        entityId: roadmapItem.id,
        decision: 'rejected',
        user: OWNER_B,
      }),
    /NOT_FOUND/,
  );

  // Verify DB schema version recorded 012_module7_seo_strategy_architecture
  const db = getAuditDb();
  const mig = db
    .prepare(
      'SELECT version FROM schema_migrations WHERE version = ?',
    )
    .get('012_module7_seo_strategy_architecture') as { version: string } | undefined;
  assert.equal(mig?.version, '012_module7_seo_strategy_architecture');
});
