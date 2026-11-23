import crypto from 'node:crypto';
import { getAuditDb } from '../audit/db';
import { calculateUsageCostMicros } from '../../lib/usageCostEngine';
import type { AgentId, AgentStationId } from '../../types/agentFactory';
import type {
  BudgetAlertType,
  BudgetEnforcementPolicy,
  BudgetPeriodType,
  CostBasis,
  PerformanceIntelligenceSummary,
  PricingSourceType,
  ProviderPricingVersionRecord,
  ProviderUsageEventRecord,
  UsageBudgetAlertRecord,
  UsageBudgetConfigRecord,
  UsageCostCalculationRecord,
  UsageEventStatus,
  UsageLedgerFilterParams,
  UsageLedgerRow,
  UsageMeasurementStatus,
  UsageReconciliationRecord,
  UsageSource,
} from '../../types/usageIntelligence';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function runInSqliteTx<T>(db: ReturnType<typeof getAuditDb>, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error if transaction wasn't active
    }
    throw err;
  }
}

function mapPricingRow(row: Record<string, unknown>): ProviderPricingVersionRecord {
  return {
    id: String(row.id),
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
    provider: String(row.provider),
    model: String(row.model),
    inputPricePer1mMicros:
      typeof row.input_price_per_1m_micros === 'number'
        ? row.input_price_per_1m_micros
        : null,
    outputPricePer1mMicros:
      typeof row.output_price_per_1m_micros === 'number'
        ? row.output_price_per_1m_micros
        : null,
    cachedInputPricePer1mMicros:
      typeof row.cached_input_price_per_1m_micros === 'number'
        ? row.cached_input_price_per_1m_micros
        : null,
    currency: String(row.currency ?? 'USD'),
    effectiveDate: String(row.effective_date),
    sourceOfPricing: String(row.source_of_pricing),
    sourceType: String(row.source_type ?? 'unconfigured') as PricingSourceType,
    pricingVersion: String(row.pricing_version),
    isActive: Number(row.is_active ?? 0) === 1,
    configuredBy: row.configured_by ? String(row.configured_by) : null,
    auditNote: row.audit_note ? String(row.audit_note) : null,
    createdAt: String(row.created_at),
  };
}

function mapJoinedLedgerRow(row: Record<string, unknown>): UsageLedgerRow {
  const event: ProviderUsageEventRecord = {
    id: String(row.e_id),
    tenantId: String(row.e_tenant_id),
    projectId: String(row.e_project_id),
    workflowId: row.e_workflow_id ? String(row.e_workflow_id) : null,
    executionId: row.e_execution_id ? String(row.e_execution_id) : null,
    taskId: row.e_task_id ? String(row.e_task_id) : null,
    agentId: String(row.e_agent_id) as AgentId,
    provider: String(row.e_provider),
    model: row.e_model ? String(row.e_model) : null,
    requestTimestamp: String(row.e_request_timestamp),
    inputTokens: typeof row.e_input_tokens === 'number' ? row.e_input_tokens : null,
    outputTokens: typeof row.e_output_tokens === 'number' ? row.e_output_tokens : null,
    cachedInputTokens:
      typeof row.e_cached_input_tokens === 'number' ? row.e_cached_input_tokens : null,
    totalTokens: typeof row.e_total_tokens === 'number' ? row.e_total_tokens : null,
    providerRequestId: row.e_provider_request_id
      ? String(row.e_provider_request_id)
      : null,
    usageSource: String(row.e_usage_source ?? 'unavailable') as UsageSource,
    measurementStatus: String(
      row.e_measurement_status ?? 'unavailable',
    ) as UsageMeasurementStatus,
    latencyMs: typeof row.e_latency_ms === 'number' ? row.e_latency_ms : null,
    status: String(row.e_status ?? 'succeeded') as UsageEventStatus,
    errorType: row.e_error_type ? String(row.e_error_type) : null,
    isQuotaError: Number(row.e_is_quota_error ?? 0) === 1,
    isRetry: Number(row.e_is_retry ?? 0) === 1,
    attemptNumber: Number(row.e_attempt_number ?? 1),
    rawUsageMetadata: safeJsonParse<Record<string, unknown> | null>(
      row.e_raw_usage_metadata_json,
      null,
    ),
    idempotencyKey: String(row.e_idempotency_key),
    createdAt: String(row.e_created_at),
  };

  const cost: UsageCostCalculationRecord = {
    id: String(row.c_id),
    usageEventId: String(row.c_usage_event_id),
    tenantId: String(row.c_tenant_id),
    projectId: String(row.c_project_id),
    workflowId: row.c_workflow_id ? String(row.c_workflow_id) : null,
    agentId: String(row.c_agent_id) as AgentId,
    pricingVersionId: row.c_pricing_version_id
      ? String(row.c_pricing_version_id)
      : null,
    pricingVersionLabel: row.c_pricing_version_label
      ? String(row.c_pricing_version_label)
      : null,
    pricingSourceLabel: row.c_pricing_source_label
      ? String(row.c_pricing_source_label)
      : null,
    costBasis: String(row.c_cost_basis ?? 'unavailable') as CostBasis,
    currency: String(row.c_currency ?? 'USD'),
    inputCostMicros:
      typeof row.c_input_cost_micros === 'number' ? row.c_input_cost_micros : null,
    outputCostMicros:
      typeof row.c_output_cost_micros === 'number' ? row.c_output_cost_micros : null,
    cachedInputCostMicros:
      typeof row.c_cached_input_cost_micros === 'number'
        ? row.c_cached_input_cost_micros
        : null,
    totalCostMicros:
      typeof row.c_total_cost_micros === 'number' ? row.c_total_cost_micros : null,
    unavailableReason: row.c_unavailable_reason
      ? String(row.c_unavailable_reason)
      : null,
    calculatedAt: String(row.c_calculated_at),
  };

  return { event, cost };
}

function mapBudgetRow(row: Record<string, unknown>): UsageBudgetConfigRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: row.project_id ? String(row.project_id) : null,
    scopeType: String(row.scope_type ?? 'project') as UsageBudgetConfigRecord['scopeType'],
    scopeTargetId: row.scope_target_id ? String(row.scope_target_id) : null,
    agentId: row.agent_id ? (String(row.agent_id) as AgentStationId) : null,
    name: String(row.name),
    periodType: String(row.period_type ?? 'monthly') as BudgetPeriodType,
    budgetLimitMicros:
      typeof row.budget_limit_micros === 'number' ? row.budget_limit_micros : null,
    maxExecutionCostMicros:
      typeof row.max_execution_cost_micros === 'number'
        ? row.max_execution_cost_micros
        : null,
    maxTokensPerRun:
      typeof row.max_tokens_per_run === 'number' ? row.max_tokens_per_run : null,
    warningThresholdPct: Number(row.warning_threshold_pct ?? 80),
    enforcementPolicy: String(
      row.enforcement_policy ?? 'warn_only',
    ) as BudgetEnforcementPolicy,
    enabled: Number(row.enabled ?? 1) === 1,
    updatedBy: String(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAlertRow(row: Record<string, unknown>): UsageBudgetAlertRecord {
  return {
    id: String(row.id),
    budgetId: String(row.budget_id),
    tenantId: String(row.tenant_id),
    projectId: row.project_id ? String(row.project_id) : null,
    workflowId: row.workflow_id ? String(row.workflow_id) : null,
    agentId: row.agent_id ? (String(row.agent_id) as AgentId) : null,
    alertType: String(row.alert_type) as BudgetAlertType,
    periodWindow: String(row.period_window),
    measuredSpendMicros: Number(row.measured_spend_micros ?? 0),
    budgetLimitMicros:
      typeof row.budget_limit_micros === 'number' ? row.budget_limit_micros : null,
    measuredTokens:
      typeof row.measured_tokens === 'number' ? row.measured_tokens : null,
    tokenLimit: typeof row.token_limit === 'number' ? row.token_limit : null,
    message: String(row.message),
    acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    createdAt: String(row.created_at),
  };
}

function mapReconciliationRow(row: Record<string, unknown>): UsageReconciliationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    workflowId: String(row.workflow_id),
    underlyingEventCount: Number(row.underlying_event_count ?? 0),
    measuredEventCount: Number(row.measured_event_count ?? 0),
    unavailableCostEventCount: Number(row.unavailable_cost_event_count ?? 0),
    sumEventCostMicros: Number(row.sum_event_cost_micros ?? 0),
    aggregatedWorkflowCostMicros: Number(row.aggregated_workflow_cost_micros ?? 0),
    isReconciled: Number(row.is_reconciled ?? 1) === 1,
    discrepancyMicros: Number(row.discrepancy_micros ?? 0),
    unavailableComponents: safeJsonParse<string[]>(
      row.unavailable_components_json,
      [],
    ),
    reconciledAt: String(row.reconciled_at),
  };
}

const LEDGER_SELECT = `
  SELECT
    e.id AS e_id,
    e.tenant_id AS e_tenant_id,
    e.project_id AS e_project_id,
    e.workflow_id AS e_workflow_id,
    e.execution_id AS e_execution_id,
    e.task_id AS e_task_id,
    e.agent_id AS e_agent_id,
    e.provider AS e_provider,
    e.model AS e_model,
    e.request_timestamp AS e_request_timestamp,
    e.input_tokens AS e_input_tokens,
    e.output_tokens AS e_output_tokens,
    e.cached_input_tokens AS e_cached_input_tokens,
    e.total_tokens AS e_total_tokens,
    e.provider_request_id AS e_provider_request_id,
    e.usage_source AS e_usage_source,
    e.measurement_status AS e_measurement_status,
    e.latency_ms AS e_latency_ms,
    e.status AS e_status,
    e.error_type AS e_error_type,
    e.is_quota_error AS e_is_quota_error,
    e.is_retry AS e_is_retry,
    e.attempt_number AS e_attempt_number,
    e.raw_usage_metadata_json AS e_raw_usage_metadata_json,
    e.idempotency_key AS e_idempotency_key,
    e.created_at AS e_created_at,
    c.id AS c_id,
    c.usage_event_id AS c_usage_event_id,
    c.tenant_id AS c_tenant_id,
    c.project_id AS c_project_id,
    c.workflow_id AS c_workflow_id,
    c.agent_id AS c_agent_id,
    c.pricing_version_id AS c_pricing_version_id,
    c.pricing_version_label AS c_pricing_version_label,
    c.pricing_source_label AS c_pricing_source_label,
    c.cost_basis AS c_cost_basis,
    c.currency AS c_currency,
    c.input_cost_micros AS c_input_cost_micros,
    c.output_cost_micros AS c_output_cost_micros,
    c.cached_input_cost_micros AS c_cached_input_cost_micros,
    c.total_cost_micros AS c_total_cost_micros,
    c.unavailable_reason AS c_unavailable_reason,
    c.calculated_at AS c_calculated_at
  FROM provider_usage_events e
  INNER JOIN usage_cost_calculations c ON c.usage_event_id = e.id
`;

export function resolveActivePricingVersionInDb(
  tenantId: string,
  provider: string,
  model: string | null,
): ProviderPricingVersionRecord | null {
  const db = getAuditDb();
  const normalizedModel = model?.trim() || '*';

  // 1. Tenant-scoped active exact match first
  const tenantExact = db
    .prepare(
      `SELECT * FROM provider_pricing_versions
       WHERE tenant_id = ? AND provider = ? AND model = ? AND is_active = 1
       ORDER BY effective_date DESC, created_at DESC LIMIT 1`,
    )
    .get(tenantId, provider, normalizedModel) as Record<string, unknown> | undefined;
  if (tenantExact) return mapPricingRow(tenantExact);

  // 2. Global active exact match
  const globalExact = db
    .prepare(
      `SELECT * FROM provider_pricing_versions
       WHERE tenant_id IS NULL AND provider = ? AND model = ? AND is_active = 1
       ORDER BY effective_date DESC, created_at DESC LIMIT 1`,
    )
    .get(provider, normalizedModel) as Record<string, unknown> | undefined;
  if (globalExact) return mapPricingRow(globalExact);

  // 3. Tenant wildcard match
  const tenantWildcard = db
    .prepare(
      `SELECT * FROM provider_pricing_versions
       WHERE tenant_id = ? AND provider = ? AND model = '*' AND is_active = 1
       ORDER BY effective_date DESC, created_at DESC LIMIT 1`,
    )
    .get(tenantId, provider) as Record<string, unknown> | undefined;
  if (tenantWildcard) return mapPricingRow(tenantWildcard);

  // 4. Global wildcard match (e.g. internal services)
  const globalWildcard = db
    .prepare(
      `SELECT * FROM provider_pricing_versions
       WHERE tenant_id IS NULL AND provider = ? AND model = '*' AND is_active = 1
       ORDER BY effective_date DESC, created_at DESC LIMIT 1`,
    )
    .get(provider) as Record<string, unknown> | undefined;
  if (globalWildcard) return mapPricingRow(globalWildcard);

  return null;
}

export function listPricingVersionsInDb(
  tenantId: string,
): ProviderPricingVersionRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM provider_pricing_versions
       WHERE tenant_id IS NULL OR tenant_id = ?
       ORDER BY provider ASC, model ASC, is_active DESC, created_at DESC`,
    )
    .all(tenantId) as Record<string, unknown>[];
  return rows.map(mapPricingRow);
}

/**
 * Append-only versioned pricing update. Never overwrites historical versions so
 * previously calculated usage costs retain exact historical audit provenance.
 */
export function createPricingVersionInDb(params: {
  tenantId: string;
  provider: string;
  model: string;
  inputPricePer1mMicros: number | null;
  outputPricePer1mMicros: number | null;
  cachedInputPricePer1mMicros: number | null;
  currency?: string;
  effectiveDate?: string;
  sourceOfPricing: string;
  sourceType: PricingSourceType;
  pricingVersion?: string;
  configuredBy: string;
  auditNote?: string | null;
}): ProviderPricingVersionRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const id = `prc-${crypto.randomUUID().slice(0, 12)}`;
  const provider = params.provider.trim();
  const model = params.model.trim();

  const existingCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM provider_pricing_versions
       WHERE tenant_id = ? AND provider = ? AND model = ?`,
    )
    .get(params.tenantId, provider, model) as { cnt: number };
  const nextVerNum = (existingCountRow?.cnt ?? 0) + 1;
  const pricingVersion =
    params.pricingVersion?.trim() || `v${nextVerNum}.0-workspace`;

  runInSqliteTx(db, () => {
    // Deactivate prior tenant-specific active version for this provider+model (keeps history intact)
    db.prepare(
      `UPDATE provider_pricing_versions
       SET is_active = 0
       WHERE tenant_id = ? AND provider = ? AND model = ? AND is_active = 1`,
    ).run(params.tenantId, provider, model);

    db.prepare(
      `INSERT INTO provider_pricing_versions (
        id, tenant_id, provider, model,
        input_price_per_1m_micros, output_price_per_1m_micros, cached_input_price_per_1m_micros,
        currency, effective_date, source_of_pricing, source_type, pricing_version,
        is_active, configured_by, audit_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      params.tenantId,
      provider,
      model,
      params.inputPricePer1mMicros,
      params.outputPricePer1mMicros,
      params.cachedInputPricePer1mMicros,
      params.currency?.trim() || 'USD',
      params.effectiveDate?.trim() || now.slice(0, 10),
      params.sourceOfPricing.trim(),
      params.sourceType,
      pricingVersion,
      params.configuredBy,
      params.auditNote?.trim() || null,
      now,
    );
  });

  const inserted = db
    .prepare('SELECT * FROM provider_pricing_versions WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapPricingRow(inserted);
}

export interface RecordUsageEventInput {
  tenantId: string;
  projectId: string;
  workflowId?: string | null;
  executionId?: string | null;
  taskId?: string | null;
  agentId: AgentId;
  provider: string;
  model?: string | null;
  requestTimestamp?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
  providerRequestId?: string | null;
  usageSource: UsageSource;
  measurementStatus: UsageMeasurementStatus;
  latencyMs?: number | null;
  status: UsageEventStatus;
  errorType?: string | null;
  isQuotaError?: boolean;
  isRetry?: boolean;
  attemptNumber?: number;
  rawUsageMetadata?: Record<string, unknown> | null;
  idempotencyKey: string;
  providerReportedBilledMicros?: number | null;
}

/**
 * Records an immutable usage event and its linked cost calculation atomically.
 * Strictly idempotent by `idempotencyKey`: duplicate calls return the existing record without double-counting.
 */
export function recordUsageEventWithCostInDb(
  input: RecordUsageEventInput,
): { row: UsageLedgerRow; deduplicated: boolean } {
  const db = getAuditDb();

  const existing = db
    .prepare(`${LEDGER_SELECT} WHERE e.idempotency_key = ? LIMIT 1`)
    .get(input.idempotencyKey) as Record<string, unknown> | undefined;
  if (existing) {
    return { row: mapJoinedLedgerRow(existing), deduplicated: true };
  }

  const now = new Date().toISOString();
  const eventId = `uev-${crypto.randomUUID().slice(0, 12)}`;
  const costId = `ucs-${crypto.randomUUID().slice(0, 12)}`;
  const requestTs = input.requestTimestamp ?? now;

  const activePricing = resolveActivePricingVersionInDb(
    input.tenantId,
    input.provider,
    input.model ?? null,
  );

  const computedCost = calculateUsageCostMicros({
    provider: input.provider,
    model: input.model ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    cachedInputTokens: input.cachedInputTokens ?? null,
    usageSource: input.usageSource,
    measurementStatus: input.measurementStatus,
    pricing: activePricing,
    providerReportedBilledMicros: input.providerReportedBilledMicros ?? null,
  });

  // Never store secret-bearing fields inside rawUsageMetadata
  const sanitizedMetadata = input.rawUsageMetadata
    ? Object.fromEntries(
        Object.entries(input.rawUsageMetadata).filter(
          ([k]) =>
            !/key|secret|token_value|auth|password|cookie|bearer/i.test(k),
        ),
      )
    : null;

  try {
    runInSqliteTx(db, () => {
      db.prepare(
        `INSERT INTO provider_usage_events (
          id, tenant_id, project_id, workflow_id, execution_id, task_id,
          agent_id, provider, model, request_timestamp,
          input_tokens, output_tokens, cached_input_tokens, total_tokens,
          provider_request_id, usage_source, measurement_status,
          latency_ms, status, error_type, is_quota_error, is_retry, attempt_number,
          raw_usage_metadata_json, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        input.tenantId,
        input.projectId,
        input.workflowId ?? null,
        input.executionId ?? null,
        input.taskId ?? null,
        input.agentId,
        input.provider,
        input.model ?? null,
        requestTs,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.cachedInputTokens ?? null,
        input.totalTokens ?? null,
        input.providerRequestId ?? null,
        input.usageSource,
        input.measurementStatus,
        input.latencyMs ?? null,
        input.status,
        input.errorType ?? null,
        input.isQuotaError ? 1 : 0,
        input.isRetry ? 1 : 0,
        input.attemptNumber ?? 1,
        sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
        input.idempotencyKey,
        now,
      );

      db.prepare(
        `INSERT INTO usage_cost_calculations (
          id, usage_event_id, tenant_id, project_id, workflow_id, agent_id,
          pricing_version_id, pricing_version_label, pricing_source_label,
          cost_basis, currency, input_cost_micros, output_cost_micros,
          cached_input_cost_micros, total_cost_micros, unavailable_reason, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        costId,
        eventId,
        input.tenantId,
        input.projectId,
        input.workflowId ?? null,
        input.agentId,
        computedCost.pricingVersionId,
        computedCost.pricingVersionLabel,
        computedCost.pricingSourceLabel,
        computedCost.costBasis,
        computedCost.currency,
        computedCost.inputCostMicros,
        computedCost.outputCostMicros,
        computedCost.cachedInputCostMicros,
        computedCost.totalCostMicros,
        computedCost.unavailableReason,
        now,
      );
    });
  } catch (err) {
    // Handle concurrent race on UNIQUE(idempotency_key)
    const raced = db
      .prepare(`${LEDGER_SELECT} WHERE e.idempotency_key = ? LIMIT 1`)
      .get(input.idempotencyKey) as Record<string, unknown> | undefined;
    if (raced) {
      return { row: mapJoinedLedgerRow(raced), deduplicated: true };
    }
    throw err;
  }

  const created = db
    .prepare(`${LEDGER_SELECT} WHERE e.id = ? LIMIT 1`)
    .get(eventId) as Record<string, unknown>;
  return { row: mapJoinedLedgerRow(created), deduplicated: false };
}

export function listUsageLedgerRowsInDb(
  tenantId: string,
  projectId: string,
  filters?: UsageLedgerFilterParams,
): UsageLedgerRow[] {
  const db = getAuditDb();
  const clauses: string[] = ['e.tenant_id = ?', 'e.project_id = ?'];
  const args: (string | number | null)[] = [tenantId, projectId];

  if (filters?.agentId) {
    clauses.push('e.agent_id = ?');
    args.push(filters.agentId);
  }
  if (filters?.workflowId) {
    clauses.push('e.workflow_id = ?');
    args.push(filters.workflowId);
  }
  if (filters?.provider) {
    clauses.push('e.provider = ?');
    args.push(filters.provider);
  }
  if (filters?.model) {
    clauses.push('e.model = ?');
    args.push(filters.model);
  }
  if (filters?.status) {
    clauses.push('e.status = ?');
    args.push(filters.status);
  }
  if (filters?.costBasis) {
    clauses.push('c.cost_basis = ?');
    args.push(filters.costBasis);
  }
  if (filters?.from) {
    clauses.push('e.request_timestamp >= ?');
    args.push(filters.from);
  }
  if (filters?.to) {
    clauses.push('e.request_timestamp <= ?');
    args.push(filters.to);
  }

  const limit = Math.max(1, Math.min(2000, filters?.limit ?? 500));
  args.push(limit);

  const rows = db
    .prepare(
      `${LEDGER_SELECT}
       WHERE ${clauses.join(' AND ')}
       ORDER BY e.request_timestamp DESC, e.created_at DESC
       LIMIT ?`,
    )
    .all(...args) as Record<string, unknown>[];

  return rows.map(mapJoinedLedgerRow);
}

export function listTenantUsageLedgerRowsInDb(
  tenantId: string,
  limit = 2000,
): UsageLedgerRow[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `${LEDGER_SELECT}
       WHERE e.tenant_id = ?
       ORDER BY e.request_timestamp DESC
       LIMIT ?`,
    )
    .all(tenantId, Math.max(1, Math.min(5000, limit))) as Record<string, unknown>[];
  return rows.map(mapJoinedLedgerRow);
}

export function listBudgetConfigsInDb(
  tenantId: string,
  projectId?: string | null,
): UsageBudgetConfigRecord[] {
  const db = getAuditDb();
  const rows = projectId
    ? (db
        .prepare(
          `SELECT * FROM usage_budget_configs
           WHERE tenant_id = ? AND (project_id IS NULL OR project_id = ?)
           ORDER BY enabled DESC, updated_at DESC`,
        )
        .all(tenantId, projectId) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM usage_budget_configs
           WHERE tenant_id = ?
           ORDER BY enabled DESC, updated_at DESC`,
        )
        .all(tenantId) as Record<string, unknown>[]);
  return rows.map(mapBudgetRow);
}

export function upsertBudgetConfigInDb(params: {
  id?: string | null;
  tenantId: string;
  projectId: string | null;
  scopeType: UsageBudgetConfigRecord['scopeType'];
  scopeTargetId?: string | null;
  agentId?: AgentStationId | null;
  name: string;
  periodType: BudgetPeriodType;
  budgetLimitMicros: number | null;
  maxExecutionCostMicros?: number | null;
  maxTokensPerRun?: number | null;
  warningThresholdPct: number;
  enforcementPolicy: BudgetEnforcementPolicy;
  enabled: boolean;
  updatedBy: string;
}): UsageBudgetConfigRecord {
  const db = getAuditDb();
  const now = new Date().toISOString();

  if (params.id) {
    const existing = db
      .prepare('SELECT id FROM usage_budget_configs WHERE id = ? AND tenant_id = ?')
      .get(params.id, params.tenantId) as { id: string } | undefined;
    if (existing) {
      db.prepare(
        `UPDATE usage_budget_configs
         SET project_id = ?, scope_type = ?, scope_target_id = ?, agent_id = ?,
             name = ?, period_type = ?, budget_limit_micros = ?,
             max_execution_cost_micros = ?, max_tokens_per_run = ?,
             warning_threshold_pct = ?, enforcement_policy = ?, enabled = ?,
             updated_by = ?, updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
      ).run(
        params.projectId,
        params.scopeType,
        params.scopeTargetId ?? null,
        params.agentId ?? null,
        params.name.trim(),
        params.periodType,
        params.budgetLimitMicros,
        params.maxExecutionCostMicros ?? null,
        params.maxTokensPerRun ?? null,
        Math.max(1, Math.min(100, Math.round(params.warningThresholdPct))),
        params.enforcementPolicy,
        params.enabled ? 1 : 0,
        params.updatedBy,
        now,
        params.id,
        params.tenantId,
      );
      const updated = db
        .prepare('SELECT * FROM usage_budget_configs WHERE id = ?')
        .get(params.id) as Record<string, unknown>;
      return mapBudgetRow(updated);
    }
  }

  const id = `ubdg-${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO usage_budget_configs (
      id, tenant_id, project_id, scope_type, scope_target_id, agent_id,
      name, period_type, budget_limit_micros, max_execution_cost_micros,
      max_tokens_per_run, warning_threshold_pct, enforcement_policy,
      enabled, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.scopeType,
    params.scopeTargetId ?? null,
    params.agentId ?? null,
    params.name.trim(),
    params.periodType,
    params.budgetLimitMicros,
    params.maxExecutionCostMicros ?? null,
    params.maxTokensPerRun ?? null,
    Math.max(1, Math.min(100, Math.round(params.warningThresholdPct))),
    params.enforcementPolicy,
    params.enabled ? 1 : 0,
    params.updatedBy,
    now,
    now,
  );
  const created = db
    .prepare('SELECT * FROM usage_budget_configs WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapBudgetRow(created);
}

export function deleteBudgetConfigInDb(
  tenantId: string,
  budgetId: string,
): boolean {
  const db = getAuditDb();
  const res = db
    .prepare('DELETE FROM usage_budget_configs WHERE id = ? AND tenant_id = ?')
    .run(budgetId, tenantId);
  return res.changes > 0;
}

export function insertBudgetAlertInDb(params: {
  budgetId: string;
  tenantId: string;
  projectId?: string | null;
  workflowId?: string | null;
  agentId?: AgentId | null;
  alertType: BudgetAlertType;
  periodWindow: string;
  measuredSpendMicros: number;
  budgetLimitMicros: number | null;
  measuredTokens?: number | null;
  tokenLimit?: number | null;
  message: string;
}): UsageBudgetAlertRecord {
  const db = getAuditDb();
  const id = `ualt-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO usage_budget_alerts (
      id, budget_id, tenant_id, project_id, workflow_id, agent_id,
      alert_type, period_window, measured_spend_micros, budget_limit_micros,
      measured_tokens, token_limit, message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.budgetId,
    params.tenantId,
    params.projectId ?? null,
    params.workflowId ?? null,
    params.agentId ?? null,
    params.alertType,
    params.periodWindow,
    params.measuredSpendMicros,
    params.budgetLimitMicros,
    params.measuredTokens ?? null,
    params.tokenLimit ?? null,
    params.message,
    now,
  );

  const created = db
    .prepare('SELECT * FROM usage_budget_alerts WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapAlertRow(created);
}

export function listBudgetAlertsInDb(
  tenantId: string,
  projectId: string,
  limit = 60,
): UsageBudgetAlertRecord[] {
  const db = getAuditDb();
  const rows = db
    .prepare(
      `SELECT * FROM usage_budget_alerts
       WHERE tenant_id = ? AND (project_id IS NULL OR project_id = ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(tenantId, projectId, Math.max(1, Math.min(200, limit))) as Record<
    string,
    unknown
  >[];
  return rows.map(mapAlertRow);
}

export function acknowledgeBudgetAlertInDb(
  tenantId: string,
  alertId: string,
  acknowledgedBy: string,
): UsageBudgetAlertRecord | null {
  const db = getAuditDb();
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE usage_budget_alerts
       SET acknowledged_by = ?, acknowledged_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .run(acknowledgedBy, now, alertId, tenantId);
  if (res.changes === 0) return null;
  const row = db
    .prepare('SELECT * FROM usage_budget_alerts WHERE id = ?')
    .get(alertId) as Record<string, unknown>;
  return mapAlertRow(row);
}

export function insertReconciliationRecordInDb(params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  underlyingEventCount: number;
  measuredEventCount: number;
  unavailableCostEventCount: number;
  sumEventCostMicros: number;
  aggregatedWorkflowCostMicros: number;
  isReconciled: boolean;
  discrepancyMicros: number;
  unavailableComponents: string[];
}): UsageReconciliationRecord {
  const db = getAuditDb();
  const id = `urec-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO usage_reconciliation_records (
      id, tenant_id, project_id, workflow_id,
      underlying_event_count, measured_event_count, unavailable_cost_event_count,
      sum_event_cost_micros, aggregated_workflow_cost_micros,
      is_reconciled, discrepancy_micros, unavailable_components_json, reconciled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.tenantId,
    params.projectId,
    params.workflowId,
    params.underlyingEventCount,
    params.measuredEventCount,
    params.unavailableCostEventCount,
    params.sumEventCostMicros,
    params.aggregatedWorkflowCostMicros,
    params.isReconciled ? 1 : 0,
    params.discrepancyMicros,
    JSON.stringify(params.unavailableComponents),
    now,
  );
  const row = db
    .prepare('SELECT * FROM usage_reconciliation_records WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapReconciliationRow(row);
}

export function getLatestReconciliationForWorkflowInDb(
  tenantId: string,
  projectId: string,
  workflowId: string,
): UsageReconciliationRecord | null {
  const db = getAuditDb();
  const row = db
    .prepare(
      `SELECT * FROM usage_reconciliation_records
       WHERE tenant_id = ? AND project_id = ? AND workflow_id = ?
       ORDER BY reconciled_at DESC LIMIT 1`,
    )
    .get(tenantId, projectId, workflowId) as Record<string, unknown> | undefined;
  return row ? mapReconciliationRow(row) : null;
}

/**
 * Computes strictly real performance intelligence from persisted agent_tasks, agent_executions,
 * agent_workflows, and provider_usage_events. Returns null for any metric with zero samples.
 */
export function getPerformanceTimingTelemetryInDb(
  tenantId: string,
  projectId: string,
): {
  summary: PerformanceIntelligenceSummary;
  activeExecutions: number;
  perAgentTiming: Map<
    AgentId,
    { avgQueueWaitMs: number | null; avgExecutionDurationMs: number | null }
  >;
} {
  const db = getAuditDb();

  const taskRows = db
    .prepare(
      `SELECT agent_id, status, attempt_count, created_at, started_at, completed_at, duration_ms, error_summary
       FROM agent_tasks
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];

  const wfRows = db
    .prepare(
      `SELECT status, started_at, completed_at, created_at
       FROM agent_workflows
       WHERE tenant_id = ? AND project_id = ?`,
    )
    .all(tenantId, projectId) as Record<string, unknown>[];

  const activeExecRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM agent_executions
       WHERE tenant_id = ? AND project_id = ? AND status = 'running'`,
    )
    .get(tenantId, projectId) as { cnt: number };

  const providerLatencyRow = db
    .prepare(
      `SELECT AVG(latency_ms) AS avg_lat FROM provider_usage_events
       WHERE tenant_id = ? AND project_id = ? AND latency_ms IS NOT NULL`,
    )
    .get(tenantId, projectId) as { avg_lat: number | null };

  let completedTasks = 0;
  let failedTasks = 0;
  let cancelledTasks = 0;
  let timeoutCount = 0;
  let retryCount = 0;
  let totalQueueWaitMs = 0;
  let queueWaitSamples = 0;
  let totalExecDurationMs = 0;
  let execDurationSamples = 0;

  const perAgentAcc = new Map<
    AgentId,
    { qSum: number; qCnt: number; dSum: number; dCnt: number }
  >();

  for (const row of taskRows) {
    const aid = String(row.agent_id) as AgentId;
    const status = String(row.status);
    const attempts = Number(row.attempt_count ?? 0);
    const errSummary = row.error_summary ? String(row.error_summary) : '';

    if (status === 'completed') completedTasks += 1;
    if (status === 'failed' || status === 'blocked') failedTasks += 1;
    if (status === 'cancelled') cancelledTasks += 1;
    if (attempts > 1) retryCount += attempts - 1;
    if (/timeout/i.test(errSummary)) timeoutCount += 1;

    const acc = perAgentAcc.get(aid) ?? { qSum: 0, qCnt: 0, dSum: 0, dCnt: 0 };

    if (row.created_at && row.started_at) {
      const waitMs = Date.parse(String(row.started_at)) - Date.parse(String(row.created_at));
      if (Number.isFinite(waitMs) && waitMs >= 0) {
        totalQueueWaitMs += waitMs;
        queueWaitSamples += 1;
        acc.qSum += waitMs;
        acc.qCnt += 1;
      }
    }

    if (typeof row.duration_ms === 'number' && Number.isFinite(row.duration_ms) && row.duration_ms >= 0) {
      totalExecDurationMs += row.duration_ms;
      execDurationSamples += 1;
      acc.dSum += row.duration_ms;
      acc.dCnt += 1;
    }

    perAgentAcc.set(aid, acc);
  }

  let wfDurationSum = 0;
  let wfDurationCount = 0;
  for (const wf of wfRows) {
    if (wf.status === 'completed' && wf.completed_at) {
      const startRef = String(wf.started_at ?? wf.created_at);
      const diff = Date.parse(String(wf.completed_at)) - Date.parse(startRef);
      if (Number.isFinite(diff) && diff >= 0) {
        wfDurationSum += diff;
        wfDurationCount += 1;
      }
    }
  }

  const settled = completedTasks + failedTasks + cancelledTasks;
  const perAgentTiming = new Map<
    AgentId,
    { avgQueueWaitMs: number | null; avgExecutionDurationMs: number | null }
  >();
  perAgentAcc.forEach((v, k) => {
    perAgentTiming.set(k, {
      avgQueueWaitMs: v.qCnt > 0 ? Math.round(v.qSum / v.qCnt) : null,
      avgExecutionDurationMs: v.dCnt > 0 ? Math.round(v.dSum / v.dCnt) : null,
    });
  });

  return {
    activeExecutions: activeExecRow?.cnt ?? 0,
    perAgentTiming,
    summary: {
      totalTasksMeasured: taskRows.length,
      completedTasks,
      failedTasks,
      cancelledTasks,
      timeoutCount,
      retryCount,
      avgQueueWaitMs:
        queueWaitSamples > 0 ? Math.round(totalQueueWaitMs / queueWaitSamples) : null,
      avgExecutionDurationMs:
        execDurationSamples > 0
          ? Math.round(totalExecDurationMs / execDurationSamples)
          : null,
      avgProviderLatencyMs:
        typeof providerLatencyRow?.avg_lat === 'number' &&
        Number.isFinite(providerLatencyRow.avg_lat)
          ? Math.round(providerLatencyRow.avg_lat)
          : null,
      avgWorkflowCompletionMs:
        wfDurationCount > 0 ? Math.round(wfDurationSum / wfDurationCount) : null,
      completionRatePct:
        settled > 0 ? Math.round((completedTasks / settled) * 1000) / 10 : null,
      failureRatePct:
        settled > 0 ? Math.round((failedTasks / settled) * 1000) / 10 : null,
    },
  };
}
