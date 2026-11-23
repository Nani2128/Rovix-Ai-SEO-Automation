import crypto from 'node:crypto';
import os from 'node:os';
import type { User } from '../../types/auth';
import {
  computeMissedScheduleRuns,
  isWithinExecutionWindow,
} from '../../lib/autonomousOperationsEngine';
import { emitRealAgentEvent } from './agentFactoryService';
import {
  claimDueSchedulesInDb,
  insertSchedulerExecutionLogInDb,
  releaseAllLeasesForWorkerInDb,
  releaseWorkerLeaseInDb,
  updateWorkflowScheduleInDb,
  upsertWorkerHeartbeatInDb,
} from './operationsDb';
import {
  launchAutonomousTargetWorkflow,
  reclaimStaleLeasesAndRecover,
} from './operationsService';

const DEFAULT_TICK_INTERVAL_MS = 10_000;
const SCHEDULE_LEASE_DURATION_MS = 60_000;

interface RuntimeState {
  workerId: string;
  running: boolean;
  startedAt: string;
  timer: ReturnType<typeof setInterval> | null;
  tickInProgress: boolean;
  processedTicks: number;
  lastTickDurationMs: number | null;
  lastError: string | null;
}

const runtime: RuntimeState = {
  workerId: `worker-${os.hostname().slice(0, 16)}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`,
  running: false,
  startedAt: new Date().toISOString(),
  timer: null,
  tickInProgress: false,
  processedTicks: 0,
  lastTickDurationMs: null,
  lastError: null,
};

function buildSchedulerActor(scheduleName: string): User {
  return {
    id: 'usr-scheduler-runtime',
    name: `Scheduler (${scheduleName})`,
    email: 'scheduler@rovix.local',
    role: 'SEO Strategist',
    avatarInitials: 'SC',
    title: 'Persistent Scheduler Engine',
  };
}

/**
 * Executes one full deterministic scheduler + self-healing maintenance tick.
 * Safe to invoke concurrently from multiple workers because due schedules are claimed
 * atomically via SQLite BEGIN IMMEDIATE worker leases.
 */
export function runSchedulerTickNow(opts?: {
  workerId?: string;
  nowDate?: Date;
}): {
  workerId: string;
  claimedSchedules: number;
  launchedWorkflowIds: string[];
  reclaimedLeasesCount: number;
  recoveredWorkflowsCount: number;
} {
  const activeWorkerId = opts?.workerId ?? runtime.workerId;
  const nowDate = opts?.nowDate ?? new Date();
  const nowIso = nowDate.toISOString();
  const tickStartMs = Date.now();
  const launchedWorkflowIds: string[] = [];

  let reclaimedLeasesCount = 0;
  let recoveredWorkflowsCount = 0;
  let claimedCount = 0;

  try {
    // 1. Reclaim expired worker leases & resume interrupted workflows
    const recovery = reclaimStaleLeasesAndRecover({
      actor: `Scheduler Worker (${activeWorkerId})`,
      nowIso,
    });
    reclaimedLeasesCount = recovery.reclaimedLeasesCount;
    recoveredWorkflowsCount = recovery.recoveredWorkflowsCount;

    // 2. Atomically claim due active schedules with DB-backed worker leases
    const claimedSchedules = claimDueSchedulesInDb({
      workerId: activeWorkerId,
      nowIso,
      leaseDurationMs: SCHEDULE_LEASE_DURATION_MS,
      limit: 15,
    });
    claimedCount = claimedSchedules.length;

    for (const sched of claimedSchedules) {
      const leaseKey = `schedule:${sched.id}`;
      try {
        const missed = computeMissedScheduleRuns(
          {
            frequency: sched.frequency,
            minuteOfHour: sched.minuteOfHour,
            hourOfDay: sched.hourOfDay,
            daysOfWeek: sched.daysOfWeek,
            dayOfMonth: sched.dayOfMonth,
            runAtIso: sched.runAtIso,
            timezone: sched.timezone,
            executionWindow: sched.executionWindow,
            nextRunAt: sched.nextRunAt,
            catchUpPolicy: sched.catchUpPolicy,
            maxCatchUpRuns: sched.maxCatchUpRuns,
          },
          nowDate,
        );

        // Log skipped catch-up occurrences truthfully
        if (missed.skippedCount > 0 && missed.runsToExecute.length === 0) {
          insertSchedulerExecutionLogInDb({
            tenantId: sched.tenantId,
            projectId: sched.projectId,
            scheduleId: sched.id,
            scheduleName: sched.name,
            workerId: activeWorkerId,
            scheduledForIso: sched.nextRunAt ?? nowIso,
            outcome: 'skipped_catchup',
            launchedWorkflowId: null,
            message: `Skipped ${missed.skippedCount} missed occurrence(s) per catch-up policy (${sched.catchUpPolicy}).`,
          });
        }

        let lastLaunchedWfId: string | null = sched.lastWorkflowId;
        let lastStatus: string | null = sched.lastRunStatus;
        let lastError: string | null = null;
        let runsIncrement = 0;

        for (const slotIso of missed.runsToExecute) {
          // Verify execution window at runtime before launching
          if (!isWithinExecutionWindow(nowDate, sched.timezone, sched.executionWindow)) {
            insertSchedulerExecutionLogInDb({
              tenantId: sched.tenantId,
              projectId: sched.projectId,
              scheduleId: sched.id,
              scheduleName: sched.name,
              workerId: activeWorkerId,
              scheduledForIso: slotIso,
              outcome: 'skipped_window',
              launchedWorkflowId: null,
              message: `Skipped execution outside configured ${sched.timezone} execution window.`,
            });
            lastStatus = 'skipped_window';
            continue;
          }

          const launchRes = launchAutonomousTargetWorkflow({
            tenantId: sched.tenantId,
            projectId: sched.projectId,
            targetKind: sched.targetKind,
            templateId: sched.templateId,
            studioWorkflowId: sched.studioWorkflowId,
            name: `${sched.name} (Scheduled)`,
            objective: sched.workflowObjective,
            triggerSource: 'schedule',
            actor: buildSchedulerActor(sched.name),
            metadata: {
              scheduleId: sched.id,
              scheduleName: sched.name,
              scheduledForIso: slotIso,
              workerId: activeWorkerId,
            },
          });

          insertSchedulerExecutionLogInDb({
            tenantId: sched.tenantId,
            projectId: sched.projectId,
            scheduleId: sched.id,
            scheduleName: sched.name,
            workerId: activeWorkerId,
            scheduledForIso: slotIso,
            outcome: launchRes.outcome,
            launchedWorkflowId: launchRes.workflowId,
            message: launchRes.reason,
          });

          if (launchRes.launched && launchRes.workflowId) {
            launchedWorkflowIds.push(launchRes.workflowId);
            lastLaunchedWfId = launchRes.workflowId;
            lastStatus = 'launched';
            runsIncrement += 1;
            emitRealAgentEvent({
              eventType: 'schedule.triggered',
              tenantId: sched.tenantId,
              projectId: sched.projectId,
              workflowId: launchRes.workflowId,
              taskId: sched.id,
              agentId: 'orchestrator',
              status: 'scheduled',
              taskTitle: sched.name,
              summary: `Scheduled run launched workflow ${launchRes.workflowId} (${sched.frequency} · ${sched.timezone})`,
              evidenceUrl: '/agent-factory/operations',
            });
          } else {
            lastStatus = launchRes.outcome;
            lastError = launchRes.reason;
          }
        }

        // Advance schedule cursor & mark one-time schedules completed
        const nextStatus =
          sched.frequency === 'once' ? 'completed' : sched.status;
        updateWorkflowScheduleInDb({
          tenantId: sched.tenantId,
          scheduleId: sched.id,
          status: nextStatus,
          nextRunAt: nextStatus === 'completed' ? null : missed.nextFutureRunAt,
          lastRunAt: runsIncrement > 0 ? nowIso : sched.lastRunAt,
          lastWorkflowId: lastLaunchedWfId,
          lastRunStatus: lastStatus,
          lastError,
          incrementTotalRuns: runsIncrement,
        });
      } finally {
        releaseWorkerLeaseInDb(leaseKey, activeWorkerId);
      }
    }

    const durationMs = Math.max(1, Date.now() - tickStartMs);
    if (activeWorkerId === runtime.workerId) {
      runtime.processedTicks += 1;
      runtime.lastTickDurationMs = durationMs;
      runtime.lastError = null;
    }

    upsertWorkerHeartbeatInDb({
      workerId: activeWorkerId,
      status: 'healthy',
      startedAt: runtime.startedAt,
      lastHeartbeatAt: nowIso,
      processedTicks: activeWorkerId === runtime.workerId ? runtime.processedTicks : 1,
      lastTickDurationMs: durationMs,
      lastError: null,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (activeWorkerId === runtime.workerId) {
      runtime.lastError = errMsg;
    }
    try {
      upsertWorkerHeartbeatInDb({
        workerId: activeWorkerId,
        status: 'degraded',
        startedAt: runtime.startedAt,
        lastHeartbeatAt: nowIso,
        processedTicks: runtime.processedTicks,
        lastTickDurationMs: Math.max(1, Date.now() - tickStartMs),
        lastError: errMsg,
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    workerId: activeWorkerId,
    claimedSchedules: claimedCount,
    launchedWorkflowIds,
    reclaimedLeasesCount,
    recoveredWorkflowsCount,
  };
}

export function startAutonomousOperationsRuntime(
  intervalMs: number = DEFAULT_TICK_INTERVAL_MS,
): void {
  if (runtime.running) return;
  runtime.running = true;
  runtime.startedAt = new Date().toISOString();

  // Execute an immediate startup tick to record heartbeat, reclaim stale leases, and check due schedules
  runSchedulerTickNow();

  runtime.timer = setInterval(() => {
    if (runtime.tickInProgress || !runtime.running) return;
    runtime.tickInProgress = true;
    try {
      runSchedulerTickNow();
    } finally {
      runtime.tickInProgress = false;
    }
  }, Math.max(2_000, intervalMs));

  // Allow Node processes (such as tests) to exit cleanly without being blocked by the timer
  if (typeof runtime.timer.unref === 'function') {
    runtime.timer.unref();
  }
}

export function stopAutonomousOperationsRuntime(): void {
  runtime.running = false;
  if (runtime.timer) {
    clearInterval(runtime.timer);
    runtime.timer = null;
  }
  try {
    releaseAllLeasesForWorkerInDb(runtime.workerId);
    upsertWorkerHeartbeatInDb({
      workerId: runtime.workerId,
      status: 'stopped',
      startedAt: runtime.startedAt,
      lastHeartbeatAt: new Date().toISOString(),
      processedTicks: runtime.processedTicks,
      lastTickDurationMs: runtime.lastTickDurationMs,
      lastError: runtime.lastError,
    });
  } catch {
    // Non-fatal during shutdown
  }
}

export function getAutonomousWorkerStatus(): {
  workerId: string;
  running: boolean;
  startedAt: string;
  processedTicks: number;
  lastTickDurationMs: number | null;
  lastError: string | null;
} {
  return {
    workerId: runtime.workerId,
    running: runtime.running,
    startedAt: runtime.startedAt,
    processedTicks: runtime.processedTicks,
    lastTickDurationMs: runtime.lastTickDurationMs,
    lastError: runtime.lastError,
  };
}
