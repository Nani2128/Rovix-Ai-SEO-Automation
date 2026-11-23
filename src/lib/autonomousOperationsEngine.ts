import type { AgentStationId, WorkflowTemplateId } from '../types/agentFactory';
import type {
  AutonomyPolicyRecord,
  ErrorClassificationKind,
  ScheduleCatchUpPolicy,
  ScheduleExecutionWindow,
  ScheduleFrequency,
  ScheduleTargetKind,
} from '../types/autonomousOperations';

export const DEFAULT_HIGH_IMPACT_ACTIONS: readonly string[] = [
  'content_publishing',
  'destructive_changes',
  'external_outreach',
  'publishing_readiness',
  'generated_content',
];

export const COMMON_TIMEZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function isValidIanaTimezone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export interface ZonedDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
  dayOfWeek: number; // 0=Sun..6=Sat
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let dayOfWeek = 0;

  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'hour') hour = Number(p.value) % 24;
    else if (p.type === 'minute') minute = Number(p.value);
    else if (p.type === 'second') second = Number(p.value);
    else if (p.type === 'weekday') dayOfWeek = WEEKDAY_MAP[p.value] ?? 0;
  }

  return { year, month, day, hour, minute, second, dayOfWeek };
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const p = getZonedDateParts(utcDate, timeZone);
  const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtcMs - Math.floor(utcDate.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock local date/time in an IANA timezone into an exact UTC Date.
 * Uses two-pass offset refinement to handle DST transitions cleanly.
 */
export function zonedLocalToUtcDate(
  local: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const sec = local.second ?? 0;
  const guessUtcMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    sec,
  );
  const offset1 = getTimeZoneOffsetMs(new Date(guessUtcMs), timeZone);
  const refined1 = guessUtcMs - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(refined1), timeZone);
  return new Date(guessUtcMs - offset2);
}

export function daysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function isWithinExecutionWindow(
  date: Date,
  timeZone: string,
  window: ScheduleExecutionWindow | null | undefined,
): boolean {
  if (!window) return true;
  const parts = getZonedDateParts(date, timeZone);
  if (
    Array.isArray(window.allowedDaysOfWeek) &&
    window.allowedDaysOfWeek.length > 0 &&
    !window.allowedDaysOfWeek.includes(parts.dayOfWeek)
  ) {
    return false;
  }
  const start = Math.max(0, Math.min(23, Math.trunc(window.startHour)));
  const end = Math.max(0, Math.min(23, Math.trunc(window.endHour)));
  if (start <= end) {
    return parts.hour >= start && parts.hour <= end;
  }
  // Overnight window e.g. 22 -> 05
  return parts.hour >= start || parts.hour <= end;
}

export interface ScheduleSpecInput {
  name: string;
  targetKind: ScheduleTargetKind;
  templateId?: WorkflowTemplateId | null;
  studioWorkflowId?: string | null;
  frequency: ScheduleFrequency;
  minuteOfHour?: number;
  hourOfDay?: number | null;
  daysOfWeek?: number[];
  dayOfMonth?: number | null;
  runAtIso?: string | null;
  timezone: string;
  executionWindow?: ScheduleExecutionWindow | null;
  catchUpPolicy?: ScheduleCatchUpPolicy;
  maxCatchUpRuns?: number;
}

export function validateScheduleInput(input: ScheduleSpecInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input.name || !input.name.trim()) {
    errors.push('Schedule name is required.');
  }
  if (input.targetKind === 'workflow_template' && !input.templateId) {
    errors.push('Select a workflow template to execute.');
  }
  if (input.targetKind === 'studio_workflow' && !input.studioWorkflowId) {
    errors.push('Select a published Studio workflow to execute.');
  }
  if (!isValidIanaTimezone(input.timezone)) {
    errors.push(`Invalid IANA timezone: "${input.timezone}".`);
  }

  const minute = input.minuteOfHour ?? 0;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    errors.push('Minute of hour must be an integer between 0 and 59.');
  }

  if (input.frequency === 'once') {
    if (!input.runAtIso || !Number.isFinite(Date.parse(input.runAtIso))) {
      errors.push('One-time schedules require a valid ISO run timestamp.');
    }
  } else if (input.frequency === 'daily' || input.frequency === 'weekly' || input.frequency === 'monthly') {
    const hr = input.hourOfDay ?? 0;
    if (!Number.isInteger(hr) || hr < 0 || hr > 23) {
      errors.push('Hour of day must be an integer between 0 and 23.');
    }
  }

  if (input.frequency === 'weekly') {
    const days = input.daysOfWeek ?? [];
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      errors.push('Weekly schedules require at least one valid day of week (0=Sun..6=Sat).');
    }
  }

  if (input.frequency === 'monthly') {
    const dom = input.dayOfMonth ?? 1;
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
      errors.push('Monthly schedules require a day of month between 1 and 31.');
    }
  }

  if (input.executionWindow) {
    const { startHour, endHour, allowedDaysOfWeek } = input.executionWindow;
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      errors.push('Execution window start hour must be between 0 and 23.');
    }
    if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
      errors.push('Execution window end hour must be between 0 and 23.');
    }
    if (
      allowedDaysOfWeek &&
      allowedDaysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      errors.push('Execution window allowed days must be integers 0..6.');
    }
  }

  if (input.maxCatchUpRuns !== undefined) {
    if (!Number.isInteger(input.maxCatchUpRuns) || input.maxCatchUpRuns < 1 || input.maxCatchUpRuns > 25) {
      errors.push('Max catch-up runs must be an integer between 1 and 25.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface ComputeNextRunSpec {
  frequency: ScheduleFrequency;
  minuteOfHour: number;
  hourOfDay: number | null;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  runAtIso: string | null;
  timezone: string;
  executionWindow?: ScheduleExecutionWindow | null;
}

/**
 * Computes the next strictly-future UTC ISO run timestamp for a schedule in its IANA timezone,
 * honoring optional execution windows. Returns null if a one-time schedule has already elapsed.
 */
export function computeNextScheduledRunAt(
  spec: ComputeNextRunSpec,
  afterDate: Date = new Date(),
): string | null {
  const tz = isValidIanaTimezone(spec.timezone) ? spec.timezone : 'UTC';
  const afterMs = afterDate.getTime();

  if (spec.frequency === 'once') {
    if (!spec.runAtIso) return null;
    const targetMs = Date.parse(spec.runAtIso);
    if (!Number.isFinite(targetMs) || targetMs <= afterMs) return null;
    return new Date(targetMs).toISOString();
  }

  const minute = Math.max(0, Math.min(59, Math.trunc(spec.minuteOfHour ?? 0)));
  const hour = Math.max(0, Math.min(23, Math.trunc(spec.hourOfDay ?? 0)));

  if (spec.frequency === 'hourly') {
    const startParts = getZonedDateParts(afterDate, tz);
    // Start from current hour at :minute and step hour-by-hour up to 14 days
    let baseUtc = zonedLocalToUtcDate(
      {
        year: startParts.year,
        month: startParts.month,
        day: startParts.day,
        hour: startParts.hour,
        minute,
        second: 0,
      },
      tz,
    );
    for (let step = 0; step < 24 * 14; step++) {
      const candidate = new Date(baseUtc.getTime() + step * 3_600_000);
      if (
        candidate.getTime() > afterMs &&
        isWithinExecutionWindow(candidate, tz, spec.executionWindow)
      ) {
        return candidate.toISOString();
      }
    }
    return null;
  }

  if (spec.frequency === 'daily' || spec.frequency === 'weekly') {
    const allowedDays =
      spec.frequency === 'weekly'
        ? new Set(spec.daysOfWeek.length > 0 ? spec.daysOfWeek : [1])
        : null;
    const startParts = getZonedDateParts(afterDate, tz);
    for (let dayOffset = 0; dayOffset <= 400; dayOffset++) {
      const probeUtc = new Date(
        Date.UTC(startParts.year, startParts.month - 1, startParts.day + dayOffset, 12, 0, 0),
      );
      const y = probeUtc.getUTCFullYear();
      const m = probeUtc.getUTCMonth() + 1;
      const d = probeUtc.getUTCDate();
      const candidate = zonedLocalToUtcDate(
        { year: y, month: m, day: d, hour, minute, second: 0 },
        tz,
      );
      if (candidate.getTime() <= afterMs) continue;
      const candParts = getZonedDateParts(candidate, tz);
      if (allowedDays && !allowedDays.has(candParts.dayOfWeek)) continue;
      if (!isWithinExecutionWindow(candidate, tz, spec.executionWindow)) continue;
      return candidate.toISOString();
    }
    return null;
  }

  // Monthly
  const targetDom = Math.max(1, Math.min(31, Math.trunc(spec.dayOfMonth ?? 1)));
  const startParts = getZonedDateParts(afterDate, tz);
  for (let monthOffset = 0; monthOffset <= 36; monthOffset++) {
    const totalMonths = startParts.year * 12 + (startParts.month - 1) + monthOffset;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const clampedDay = Math.min(targetDom, daysInMonth(y, m));
    const candidate = zonedLocalToUtcDate(
      { year: y, month: m, day: clampedDay, hour, minute, second: 0 },
      tz,
    );
    if (candidate.getTime() <= afterMs) continue;
    if (!isWithinExecutionWindow(candidate, tz, spec.executionWindow)) continue;
    return candidate.toISOString();
  }
  return null;
}

/**
 * Resolves missed due occurrences between `nextRunAt` and `nowDate` using the configured catch-up policy:
 * - `skip`: execute only the most recent slot if within a 2-minute grace window, otherwise skip missed runs.
 * - `run_once`: coalesce all missed occurrences into a single catch-up execution.
 * - `run_all_capped`: return up to `maxCatchUpRuns` missed occurrences in chronological order.
 */
export function computeMissedScheduleRuns(
  spec: ComputeNextRunSpec & {
    nextRunAt: string | null;
    catchUpPolicy: ScheduleCatchUpPolicy;
    maxCatchUpRuns: number;
  },
  nowDate: Date = new Date(),
): {
  runsToExecute: string[];
  skippedCount: number;
  nextFutureRunAt: string | null;
} {
  if (!spec.nextRunAt) {
    return {
      runsToExecute: [],
      skippedCount: 0,
      nextFutureRunAt: computeNextScheduledRunAt(spec, nowDate),
    };
  }

  const nowMs = nowDate.getTime();
  const firstDueMs = Date.parse(spec.nextRunAt);
  if (!Number.isFinite(firstDueMs) || firstDueMs > nowMs) {
    return {
      runsToExecute: [],
      skippedCount: 0,
      nextFutureRunAt: spec.nextRunAt,
    };
  }

  const dueSlots: string[] = [new Date(firstDueMs).toISOString()];
  let cursor = new Date(firstDueMs);

  // Enumerate up to 50 missed slots deterministically
  if (spec.frequency !== 'once') {
    for (let i = 0; i < 50; i++) {
      const nextIso = computeNextScheduledRunAt(spec, cursor);
      if (!nextIso) break;
      const nextMs = Date.parse(nextIso);
      if (nextMs > nowMs) {
        break;
      }
      dueSlots.push(nextIso);
      cursor = new Date(nextMs);
    }
  }

  const nextFutureRunAt =
    spec.frequency === 'once' ? null : computeNextScheduledRunAt(spec, nowDate);

  const graceWindowMs = 2 * 60 * 1000;
  const latestSlotIso = dueSlots[dueSlots.length - 1];
  const latestSlotAgeMs = nowMs - Date.parse(latestSlotIso);

  if (spec.catchUpPolicy === 'skip') {
    // If the most recent due slot is fresh (within 2 minutes), run it normally; skip older missed slots
    if (latestSlotAgeMs <= graceWindowMs) {
      return {
        runsToExecute: [latestSlotIso],
        skippedCount: Math.max(0, dueSlots.length - 1),
        nextFutureRunAt,
      };
    }
    return {
      runsToExecute: [],
      skippedCount: dueSlots.length,
      nextFutureRunAt,
    };
  }

  if (spec.catchUpPolicy === 'run_once') {
    return {
      runsToExecute: [latestSlotIso],
      skippedCount: Math.max(0, dueSlots.length - 1),
      nextFutureRunAt,
    };
  }

  // run_all_capped
  const cap = Math.max(1, Math.min(25, Math.trunc(spec.maxCatchUpRuns || 3)));
  const selected = dueSlots.slice(0, cap);
  return {
    runsToExecute: selected,
    skippedCount: Math.max(0, dueSlots.length - selected.length),
    nextFutureRunAt,
  };
}

// ============================================================================
// ERROR CLASSIFICATION & EXPONENTIAL BACKOFF WITH JITTER
// ============================================================================

export interface ErrorClassificationResult {
  classification: ErrorClassificationKind;
  errorCode: string;
  reason: string;
}

const NON_RETRYABLE_PREFIXES = [
  'FORBIDDEN:',
  'UNAUTHORIZED:',
  'BAD_REQUEST:',
  'VALIDATION_ERROR:',
  'PREREQUISITE_FAILED:',
  'PROVIDER_UNAVAILABLE:',
  'BUDGET_EXCEEDED:',
  'POLICY_BLOCKED:',
  'SSRF_BLOCKED:',
  'INVALID_CONFIG:',
  'NOT_FOUND:',
  'CANCELLED:',
];

export function classifyExecutionError(errorMessage: string): ErrorClassificationResult {
  const normalized = (errorMessage || '').trim();
  const upper = normalized.toUpperCase();
  const code = normalized.includes(':')
    ? normalized.split(':')[0].trim().slice(0, 48)
    : 'EXECUTION_ERROR';

  for (const prefix of NON_RETRYABLE_PREFIXES) {
    if (upper.startsWith(prefix)) {
      return {
        classification: 'non_retryable',
        errorCode: prefix.replace(':', ''),
        reason: `Deterministic error (${prefix.replace(':', '')}) will not succeed on blind retry.`,
      };
    }
  }

  if (
    upper.includes('INVALID API KEY') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('HTTP 400') ||
    upper.includes('HTTP 401') ||
    upper.includes('HTTP 403') ||
    upper.includes('HTTP 404') ||
    upper.includes('SCHEMA VALIDATION')
  ) {
    return {
      classification: 'non_retryable',
      errorCode: code,
      reason: 'Client, authentication, or schema error requires configuration/input fix.',
    };
  }

  return {
    classification: 'retryable',
    errorCode: code,
    reason: 'Transient runtime, network, timeout, or provider rate-limit error eligible for backoff retry.',
  };
}

export function computeBackoffWithJitterMs(
  attemptNumber: number,
  opts?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
    /** Optional deterministic random seed [0..1] for testing */
    randomValue?: number;
  },
): number {
  const attempt = Math.max(1, Math.trunc(attemptNumber));
  const base = Math.max(100, opts?.baseDelayMs ?? 1_500);
  const maxDelay = Math.max(base, opts?.maxDelayMs ?? 30_000);
  const jitterRatio = Math.max(0, Math.min(0.5, opts?.jitterRatio ?? 0.25));
  const raw = Math.min(maxDelay, base * Math.pow(2, attempt - 1));
  const rand =
    typeof opts?.randomValue === 'number' && Number.isFinite(opts.randomValue)
      ? Math.max(0, Math.min(1, opts.randomValue))
      : Math.random();
  // Symmetric jitter in [-jitterRatio, +jitterRatio] clamped to [base/2, maxDelay]
  const delta = (rand * 2 - 1) * raw * jitterRatio;
  return Math.max(100, Math.min(maxDelay, Math.round(raw + delta)));
}

// ============================================================================
// AUTONOMY POLICY EVALUATION ENGINE
// ============================================================================

export interface AutonomyPolicyEvaluationInput {
  policy: AutonomyPolicyRecord;
  triggerSource: 'manual' | 'schedule' | 'event_trigger' | 'external_webhook' | 'retry';
  templateId?: WorkflowTemplateId | null;
  targetAgentIds: AgentStationId[];
  activeWorkflowCount: number;
  activeTaskCount: number;
  containsHighImpactActions?: boolean;
  highImpactActionTypesPresent?: string[];
  estimatedCostMicros?: number | null;
  estimatedTokens?: number | null;
}

export interface AutonomyPolicyEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  enforcedApprovalGateRequired: boolean;
  blockingReason: string | null;
  warnings: string[];
}

export function evaluateAutonomyPolicy(
  input: AutonomyPolicyEvaluationInput,
): AutonomyPolicyEvaluationResult {
  const { policy } = input;
  const warnings: string[] = [];

  if (!policy.enabled) {
    return {
      allowed: true,
      requiresApproval: false,
      enforcedApprovalGateRequired: Boolean(
        policy.requireApprovalForHighImpact && input.containsHighImpactActions,
      ),
      blockingReason: null,
      warnings: ['Autonomy policy guardrails are currently disabled for this project.'],
    };
  }

  // External webhook gate
  if (input.triggerSource === 'external_webhook' && !policy.allowExternalWebhooks) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason:
        'POLICY_BLOCKED: External webhook triggers are disabled by the project autonomy policy.',
      warnings,
    };
  }

  // Autonomous retry gate
  if (input.triggerSource === 'retry' && !policy.allowAutonomousRetries) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason:
        'POLICY_BLOCKED: Autonomous retries are disabled by the project autonomy policy.',
      warnings,
    };
  }

  // Restricted mode blocks non-manual autonomous execution
  if (
    policy.autonomyMode === 'restricted' &&
    input.triggerSource !== 'manual'
  ) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason:
        'POLICY_BLOCKED: Project autonomy mode is set to Restricted. Scheduled and event-triggered launches are paused.',
      warnings,
    };
  }

  // Concurrency limits
  if (input.activeWorkflowCount >= policy.maxConcurrentWorkflows) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason: `POLICY_BLOCKED: Active workflows (${input.activeWorkflowCount}) reached the configured concurrency limit (${policy.maxConcurrentWorkflows}).`,
      warnings,
    };
  }

  if (input.activeTaskCount >= policy.maxActiveAgentTasks) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason: `POLICY_BLOCKED: Active agent tasks (${input.activeTaskCount}) reached the configured limit (${policy.maxActiveAgentTasks}).`,
      warnings,
    };
  }

  // Allowed templates scope
  if (
    input.templateId &&
    input.templateId !== 'custom_dag' &&
    policy.allowedTemplates.length > 0 &&
    !policy.allowedTemplates.includes(input.templateId)
  ) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason: `POLICY_BLOCKED: Workflow template "${input.templateId}" is not in the project's allowed autonomous templates.`,
      warnings,
    };
  }

  // Allowed agent scope
  if (policy.allowedAgents.length > 0) {
    const disallowed = input.targetAgentIds.filter(
      (aid) => !policy.allowedAgents.includes(aid),
    );
    if (disallowed.length > 0) {
      return {
        allowed: false,
        requiresApproval: false,
        enforcedApprovalGateRequired: false,
        blockingReason: `POLICY_BLOCKED: Agents [${disallowed.join(', ')}] are outside the allowed project autonomy scope.`,
        warnings,
      };
    }
  }

  // Token / spend cap guardrails
  if (
    policy.maxTokensPerWorkflow !== null &&
    typeof input.estimatedTokens === 'number' &&
    input.estimatedTokens > policy.maxTokensPerWorkflow
  ) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason: `POLICY_BLOCKED: Projected tokens (${input.estimatedTokens.toLocaleString()}) exceed policy cap (${policy.maxTokensPerWorkflow.toLocaleString()}).`,
      warnings,
    };
  }

  if (
    policy.maxSpendMicrosPerRun !== null &&
    typeof input.estimatedCostMicros === 'number' &&
    input.estimatedCostMicros > policy.maxSpendMicrosPerRun
  ) {
    return {
      allowed: false,
      requiresApproval: false,
      enforcedApprovalGateRequired: false,
      blockingReason: `POLICY_BLOCKED: Projected run cost exceeds autonomy spend cap.`,
      warnings,
    };
  }

  // Mandatory human approval for high-impact operations (never bypassed in autonomous modes)
  const hasHighImpact =
    Boolean(input.containsHighImpactActions) ||
    Boolean(
      input.highImpactActionTypesPresent?.some((a) =>
        policy.highImpactActionTypes.includes(a),
      ),
    );
  const enforcedApprovalGateRequired =
    policy.requireApprovalForHighImpact && hasHighImpact;

  // Approval-required autonomy mode requires explicit human gate on autonomous launches
  if (
    policy.autonomyMode === 'approval_required' &&
    input.triggerSource !== 'manual'
  ) {
    return {
      allowed: true,
      requiresApproval: true,
      enforcedApprovalGateRequired: true,
      blockingReason: null,
      warnings: [
        'Autonomy mode requires human approval before autonomous workflows finalize high-impact steps.',
      ],
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    enforcedApprovalGateRequired,
    blockingReason: null,
    warnings,
  };
}
