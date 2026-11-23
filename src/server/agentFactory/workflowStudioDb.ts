import crypto from 'node:crypto';
import type { WorkflowRunStatus } from '../../types/agentFactory';
import type {
  StudioValidationReport,
  StudioWorkflowGraph,
  StudioWorkflowRecord,
  StudioWorkflowStatus,
  StudioWorkflowTemplateRecord,
  StudioWorkflowVersionRecord,
} from '../../types/workflowStudio';
import { getAuditDb } from '../audit/db';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapStudioWorkflowRow(r: Record<string, unknown>): StudioWorkflowRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    status: String(r.status) as StudioWorkflowStatus,
    activeVersionNumber: Number(r.active_version_number ?? 1),
    publishedVersionId: r.published_version_id ? String(r.published_version_id) : null,
    draftGraph: parseJson<StudioWorkflowGraph>(r.draft_graph_json, {
      nodes: [],
      edges: [],
    }),
    lastValidation: parseJson<StudioValidationReport | null>(r.last_validation_json, null),
    lastExecutionWorkflowId: r.last_execution_workflow_id
      ? String(r.last_execution_workflow_id)
      : null,
    createdBy: String(r.created_by),
    updatedBy: String(r.updated_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapVersionRow(r: Record<string, unknown>): StudioWorkflowVersionRecord {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    projectId: String(r.project_id),
    studioWorkflowId: String(r.studio_workflow_id),
    versionNumber: Number(r.version_number),
    status: String(r.status) as 'snapshot' | 'published',
    changeSummary: String(r.change_summary ?? ''),
    graph: parseJson<StudioWorkflowGraph>(r.graph_json, { nodes: [], edges: [] }),
    validation: parseJson<StudioValidationReport>(r.validation_json, {
      valid: false,
      errorCount: 0,
      warningCount: 0,
      issues: [],
      topologicalOrder: [],
      layers: [],
      cyclePath: [],
      validatedAt: String(r.created_at),
    }),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  };
}

function mapTemplateRow(r: Record<string, unknown>): StudioWorkflowTemplateRecord {
  return {
    id: String(r.id),
    tenantId: r.tenant_id ? String(r.tenant_id) : null,
    projectId: r.project_id ? String(r.project_id) : null,
    name: String(r.name),
    category: String(r.category ?? 'Custom'),
    description: String(r.description ?? ''),
    isBuiltIn: false,
    graph: parseJson<StudioWorkflowGraph>(r.graph_json, { nodes: [], edges: [] }),
    requiredProviders: parseJson<string[]>(r.required_providers_json, []),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  };
}

export function listStudioWorkflowsInDb(
  tenantId: string,
  projectId: string,
  includeArchived = false,
): StudioWorkflowRecord[] {
  const db = getAuditDb();
  const rows = includeArchived
    ? (db
        .prepare(
          `SELECT * FROM studio_workflows
           WHERE tenant_id = ? AND project_id = ?
           ORDER BY updated_at DESC LIMIT 60`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM studio_workflows
           WHERE tenant_id = ? AND project_id = ? AND status != 'archived'
           ORDER BY updated_at DESC LIMIT 60`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[]);
  return rows.map(mapStudioWorkflowRow);
}

export function getStudioWorkflowByIdInDb(
  tenantId: string,
  projectId: string,
  studioWorkflowId: string,
): StudioWorkflowRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM studio_workflows
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, studioWorkflowId) as Record<string, unknown> | undefined;
  return row ? mapStudioWorkflowRow(row) : null;
}

export function createStudioWorkflowInDb(params: {
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  graph: StudioWorkflowGraph;
  validation: StudioValidationReport;
  createdBy: string;
}): {
  workflow: StudioWorkflowRecord;
  initialVersion: StudioWorkflowVersionRecord;
} {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `swf-${crypto.randomUUID().slice(0, 12)}`;
  const verId = `swv-${crypto.randomUUID().slice(0, 12)}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO studio_workflows (
        id, tenant_id, project_id, name, description, status,
        active_version_number, published_version_id, draft_graph_json,
        last_validation_json, last_execution_workflow_id,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', 1, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
      id,
      params.tenantId,
      params.projectId,
      params.name,
      params.description,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.createdBy,
      params.createdBy,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO studio_workflow_versions (
        id, tenant_id, project_id, studio_workflow_id, version_number,
        status, change_summary, graph_json, validation_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, 1, 'snapshot', 'Initial draft version', ?, ?, ?, ?)`,
    ).run(
      verId,
      params.tenantId,
      params.projectId,
      id,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.createdBy,
      now,
    );

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }

  return {
    workflow: getStudioWorkflowByIdInDb(params.tenantId, params.projectId, id)!,
    initialVersion: getStudioVersionByIdInDb(params.tenantId, params.projectId, verId)!,
  };
}

export function updateStudioWorkflowDraftInDb(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  name?: string;
  description?: string;
  graph?: StudioWorkflowGraph;
  validation?: StudioValidationReport | null;
  status?: StudioWorkflowStatus;
  updatedBy: string;
  createSnapshot?: boolean;
  changeSummary?: string;
}): {
  workflow: StudioWorkflowRecord;
  createdVersion: StudioWorkflowVersionRecord | null;
} {
  const db = getAuditDb();
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) {
    throw new Error('NOT_FOUND: Studio workflow not found in this project.');
  }

  const now = new Date().toISOString();
  const nextName = params.name !== undefined ? params.name : existing.name;
  const nextDesc =
    params.description !== undefined ? params.description : existing.description;
  const nextGraph = params.graph ?? existing.draftGraph;
  const nextVal =
    params.validation !== undefined ? params.validation : existing.lastValidation;
  const nextStatus =
    params.status ??
    (existing.status === 'draft' ? 'saved' : existing.status);

  let nextVersionNum = existing.activeVersionNumber;
  let createdVersionId: string | null = null;

  db.exec('BEGIN IMMEDIATE');
  try {
    if (params.createSnapshot) {
      const maxRow = db
        .prepare(
          `SELECT COALESCE(MAX(version_number), 0) AS max_ver
           FROM studio_workflow_versions
           WHERE tenant_id = ? AND studio_workflow_id = ?`,
        )
        .get(params.tenantId, params.studioWorkflowId) as { max_ver: number };
      nextVersionNum = Number(maxRow?.max_ver ?? existing.activeVersionNumber) + 1;
      createdVersionId = `swv-${crypto.randomUUID().slice(0, 12)}`;
      db.prepare(
        `INSERT INTO studio_workflow_versions (
          id, tenant_id, project_id, studio_workflow_id, version_number,
          status, change_summary, graph_json, validation_json, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'snapshot', ?, ?, ?, ?, ?)`,
      ).run(
        createdVersionId,
        params.tenantId,
        params.projectId,
        params.studioWorkflowId,
        nextVersionNum,
        params.changeSummary?.trim() || `Saved draft v${nextVersionNum}`,
        JSON.stringify(nextGraph),
        JSON.stringify(
          nextVal ?? {
            valid: false,
            errorCount: 0,
            warningCount: 0,
            issues: [],
            topologicalOrder: [],
            layers: [],
            cyclePath: [],
            validatedAt: now,
          },
        ),
        params.updatedBy,
        now,
      );
    }

    db.prepare(
      `UPDATE studio_workflows
       SET name = ?,
           description = ?,
           status = ?,
           active_version_number = ?,
           draft_graph_json = ?,
           last_validation_json = ?,
           updated_by = ?,
           updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      nextName,
      nextDesc,
      nextStatus,
      nextVersionNum,
      JSON.stringify(nextGraph),
      nextVal ? JSON.stringify(nextVal) : null,
      params.updatedBy,
      now,
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    );

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  return {
    workflow: getStudioWorkflowByIdInDb(
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    )!,
    createdVersion: createdVersionId
      ? getStudioVersionByIdInDb(params.tenantId, params.projectId, createdVersionId)
      : null,
  };
}

export function publishStudioWorkflowVersionInDb(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  graph: StudioWorkflowGraph;
  validation: StudioValidationReport;
  changeSummary: string;
  publishedBy: string;
}): {
  workflow: StudioWorkflowRecord;
  version: StudioWorkflowVersionRecord;
} {
  const db = getAuditDb();
  const existing = getStudioWorkflowByIdInDb(
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
  if (!existing) {
    throw new Error('NOT_FOUND: Studio workflow not found.');
  }

  const now = new Date().toISOString();
  const verId = `swv-${crypto.randomUUID().slice(0, 12)}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    const maxRow = db
      .prepare(
        `SELECT COALESCE(MAX(version_number), 0) AS max_ver
         FROM studio_workflow_versions
         WHERE tenant_id = ? AND studio_workflow_id = ?`,
      )
      .get(params.tenantId, params.studioWorkflowId) as { max_ver: number };
    const nextVer = Number(maxRow?.max_ver ?? existing.activeVersionNumber) + 1;

    db.prepare(
      `INSERT INTO studio_workflow_versions (
        id, tenant_id, project_id, studio_workflow_id, version_number,
        status, change_summary, graph_json, validation_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`,
    ).run(
      verId,
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
      nextVer,
      params.changeSummary.trim() || `Published v${nextVer}`,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.publishedBy,
      now,
    );

    db.prepare(
      `UPDATE studio_workflows
       SET status = 'published',
           active_version_number = ?,
           published_version_id = ?,
           draft_graph_json = ?,
           last_validation_json = ?,
           updated_by = ?,
           updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      nextVer,
      verId,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.publishedBy,
      now,
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    );

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  return {
    workflow: getStudioWorkflowByIdInDb(
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    )!,
    version: getStudioVersionByIdInDb(params.tenantId, params.projectId, verId)!,
  };
}

export function createImmutableExecutionSnapshotInDb(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  graph: StudioWorkflowGraph;
  validation: StudioValidationReport;
  createdBy: string;
}): StudioWorkflowVersionRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const verId = `swv-${crypto.randomUUID().slice(0, 12)}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    const maxRow = db
      .prepare(
        `SELECT COALESCE(MAX(version_number), 0) AS max_ver
         FROM studio_workflow_versions
         WHERE tenant_id = ? AND studio_workflow_id = ?`,
      )
      .get(params.tenantId, params.studioWorkflowId) as { max_ver: number };
    const nextVer = Number(maxRow?.max_ver ?? 0) + 1;

    db.prepare(
      `INSERT INTO studio_workflow_versions (
        id, tenant_id, project_id, studio_workflow_id, version_number,
        status, change_summary, graph_json, validation_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'snapshot', ?, ?, ?, ?, ?)`,
    ).run(
      verId,
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
      nextVer,
      `Immutable execution snapshot v${nextVer}`,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.createdBy,
      now,
    );

    db.prepare(
      `UPDATE studio_workflows
       SET active_version_number = ?,
           draft_graph_json = ?,
           last_validation_json = ?,
           updated_by = ?,
           updated_at = ?
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    ).run(
      nextVer,
      JSON.stringify(params.graph),
      JSON.stringify(params.validation),
      params.createdBy,
      now,
      params.tenantId,
      params.projectId,
      params.studioWorkflowId,
    );

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  return getStudioVersionByIdInDb(params.tenantId, params.projectId, verId)!;
}

export function listStudioWorkflowVersionsInDb(
  tenantId: string,
  projectId: string,
  studioWorkflowId: string,
  limit = 30,
): StudioWorkflowVersionRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM studio_workflow_versions
       WHERE tenant_id = ? AND project_id = ? AND studio_workflow_id = ?
       ORDER BY version_number DESC LIMIT ?`,
    )
    .all(tenantId, projectId, studioWorkflowId, limit) as Record<string, unknown>[];
  return rows.map(mapVersionRow);
}

export function getStudioVersionByIdInDb(
  tenantId: string,
  projectId: string,
  versionId: string,
): StudioWorkflowVersionRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM studio_workflow_versions
       WHERE tenant_id = ? AND project_id = ? AND id = ?`,
    )
    .get(tenantId, projectId, versionId) as Record<string, unknown> | undefined;
  return row ? mapVersionRow(row) : null;
}

export function persistStudioValidationReportInDb(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  report: StudioValidationReport;
  validatedBy: string;
}): void {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO studio_validation_reports (
      id, tenant_id, project_id, studio_workflow_id, valid,
      error_count, warning_count, report_json, validated_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `sval-${crypto.randomUUID().slice(0, 12)}`,
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
    params.report.valid ? 1 : 0,
    params.report.errorCount,
    params.report.warningCount,
    JSON.stringify(params.report),
    params.validatedBy,
    now,
  );

  db.prepare(
    `UPDATE studio_workflows
     SET last_validation_json = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    JSON.stringify(params.report),
    now,
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
}

export function linkStudioWorkflowExecutionInDb(params: {
  tenantId: string;
  projectId: string;
  studioWorkflowId: string;
  studioVersionId: string;
  studioVersionNumber: number;
  workflowId: string;
}): void {
  const db = getAuditDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO studio_workflow_executions (
      workflow_id, tenant_id, project_id, studio_workflow_id,
      studio_version_id, studio_version_number, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.workflowId,
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
    params.studioVersionId,
    params.studioVersionNumber,
    now,
  );

  db.prepare(
    `UPDATE studio_workflows
     SET last_execution_workflow_id = ?, updated_at = ?
     WHERE tenant_id = ? AND project_id = ? AND id = ?`,
  ).run(
    params.workflowId,
    now,
    params.tenantId,
    params.projectId,
    params.studioWorkflowId,
  );
}

export function listStudioWorkflowExecutionsInDb(
  tenantId: string,
  projectId: string,
  studioWorkflowId: string,
  limit = 15,
): Array<{
  workflowId: string;
  studioVersionId: string | null;
  studioVersionNumber: number | null;
  status: WorkflowRunStatus;
  currentStage: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}> {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT swe.workflow_id, swe.studio_version_id, swe.studio_version_number,
              aw.status, aw.current_stage, aw.started_at, aw.completed_at, aw.created_at
       FROM studio_workflow_executions swe
       INNER JOIN agent_workflows aw ON aw.id = swe.workflow_id AND aw.tenant_id = swe.tenant_id
       WHERE swe.tenant_id = ? AND swe.project_id = ? AND swe.studio_workflow_id = ?
       ORDER BY swe.created_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, studioWorkflowId, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    workflowId: String(r.workflow_id),
    studioVersionId: r.studio_version_id ? String(r.studio_version_id) : null,
    studioVersionNumber:
      r.studio_version_number !== null && r.studio_version_number !== undefined
        ? Number(r.studio_version_number)
        : null,
    status: String(r.status) as WorkflowRunStatus,
    currentStage: String(r.current_stage ?? 'Queued'),
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
    createdAt: String(r.created_at),
  }));
}

export function insertStudioTemplateInDb(params: {
  tenantId: string;
  projectId: string | null;
  name: string;
  category: string;
  description: string;
  graph: StudioWorkflowGraph;
  requiredProviders: string[];
  createdBy: string;
}): StudioWorkflowTemplateRecord {
  const db = getAuditDb();
  const id = `stpl-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO studio_workflow_templates (
      id, tenant_id, project_id, name, category, description,
      graph_json, required_providers_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.name,
    params.category,
    params.description,
    JSON.stringify(params.graph),
    JSON.stringify(params.requiredProviders),
    params.createdBy,
    now,
  );
  const row = db
    .prepare('SELECT * FROM studio_workflow_templates WHERE tenant_id = ? AND id = ?')
    .get(params.tenantId, id) as Record<string, unknown>;
  return mapTemplateRow(row);
}

export function listCustomStudioTemplatesInDb(
  tenantId: string,
  projectId?: string | null,
): StudioWorkflowTemplateRecord[] {
  const db = getAuditDb();
  const rows = projectId
    ? (db
        .prepare(
          `SELECT * FROM studio_workflow_templates
           WHERE tenant_id = ? AND (project_id IS NULL OR project_id = ?)
           ORDER BY created_at DESC LIMIT 40`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM studio_workflow_templates
           WHERE tenant_id = ?
           ORDER BY created_at DESC LIMIT 40`,
        )
        .all(tenantId) as Record<string, unknown>[]);
  return rows.map(mapTemplateRow);
}
