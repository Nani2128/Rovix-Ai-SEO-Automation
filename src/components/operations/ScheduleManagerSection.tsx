import { useState } from 'react';
import {
  CalendarClock,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { COMMON_TIMEZONES } from '../../lib/autonomousOperationsEngine';
import { WORKFLOW_TEMPLATES } from '../../lib/dagValidation';
import { operationsService } from '../../services/operationsService';
import type { WorkflowTemplateId } from '../../types/agentFactory';
import type {
  OperationsControlCenterPayload,
  ScheduleCatchUpPolicy,
  ScheduleFrequency,
  ScheduleTargetKind,
  WorkflowScheduleRecord,
} from '../../types/autonomousOperations';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeScheduleCadence(s: WorkflowScheduleRecord): string {
  if (s.frequency === 'once') {
    return `Once at ${formatTs(s.runAtIso)}`;
  }
  const mm = String(s.minuteOfHour).padStart(2, '0');
  const hh = String(s.hourOfDay ?? 0).padStart(2, '0');
  if (s.frequency === 'hourly') return `Hourly at :${mm}`;
  if (s.frequency === 'daily') return `Daily at ${hh}:${mm}`;
  if (s.frequency === 'weekly') {
    const days = s.daysOfWeek.map((d) => DAY_LABELS[d] ?? d).join(', ');
    return `Weekly (${days || 'Mon'}) at ${hh}:${mm}`;
  }
  return `Monthly day ${s.dayOfMonth ?? 1} at ${hh}:${mm}`;
}

export function ScheduleManagerSection({
  projectId,
  data,
  onRefresh,
}: {
  projectId: string;
  data: OperationsControlCenterPayload;
  onRefresh: () => Promise<void>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetKind, setTargetKind] =
    useState<ScheduleTargetKind>('workflow_template');
  const [templateId, setTemplateId] = useState<WorkflowTemplateId>(
    'technical_performance_audit',
  );
  const [studioWorkflowId, setStudioWorkflowId] = useState<string>(
    data.studioWorkflows[0]?.id ?? '',
  );
  const [workflowObjective, setWorkflowObjective] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [hourOfDay, setHourOfDay] = useState(6);
  const [minuteOfHour, setMinuteOfHour] = useState(0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [runAtLocal, setRunAtLocal] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [useWindow, setUseWindow] = useState(false);
  const [windowStartHour, setWindowStartHour] = useState(1);
  const [windowEndHour, setWindowEndHour] = useState(6);
  const [catchUpPolicy, setCatchUpPolicy] =
    useState<ScheduleCatchUpPolicy>('run_once');
  const [maxCatchUpRuns, setMaxCatchUpRuns] = useState(3);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleWeekday = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!name.trim()) {
      setError('Schedule name is required.');
      return;
    }
    if (frequency === 'once' && !runAtLocal) {
      setError('Select a future date and time for a one-time schedule.');
      return;
    }
    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      setError('Select at least one weekday for a weekly schedule.');
      return;
    }

    setSubmitting(true);
    try {
      await operationsService.createSchedule(projectId, {
        name: name.trim(),
        description: description.trim(),
        targetKind,
        templateId: targetKind === 'workflow_template' ? templateId : null,
        studioWorkflowId:
          targetKind === 'studio_workflow' ? studioWorkflowId || null : null,
        workflowObjective: workflowObjective.trim(),
        frequency,
        minuteOfHour,
        hourOfDay: frequency === 'hourly' || frequency === 'once' ? null : hourOfDay,
        daysOfWeek: frequency === 'weekly' ? daysOfWeek : [],
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        runAtIso:
          frequency === 'once' ? new Date(runAtLocal).toISOString() : null,
        timezone,
        executionWindow: useWindow
          ? { startHour: windowStartHour, endHour: windowEndHour }
          : null,
        catchUpPolicy,
        maxCatchUpRuns,
        status: 'active',
      });
      setName('');
      setDescription('');
      setWorkflowObjective('');
      setFormOpen(false);
      setFeedback('Persistent workflow schedule created and activated.');
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create schedule.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (schedule: WorkflowScheduleRecord) => {
    setBusyId(schedule.id);
    setError(null);
    setFeedback(null);
    try {
      const action = schedule.status === 'active' ? 'pause' : 'resume';
      await operationsService.toggleSchedule(projectId, schedule.id, action);
      setFeedback(
        action === 'pause'
          ? `Paused schedule "${schedule.name}".`
          : `Resumed schedule "${schedule.name}".`,
      );
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update schedule state.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (scheduleId: string, scheduleName: string) => {
    setBusyId(scheduleId);
    setError(null);
    setFeedback(null);
    try {
      await operationsService.deleteSchedule(projectId, scheduleId);
      setConfirmDeleteId(null);
      setFeedback(`Deleted schedule "${scheduleName}".`);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to delete schedule.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Persistent Workflow Schedules
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Database-backed recurring and one-time schedules with IANA timezone awareness, execution windows, catch-up policies, and multi-worker lease protection.
          </p>
        </div>
        {data.canManageOperations && (
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formOpen ? 'Close Schedule Form' : 'New Schedule'}</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Create Schedule Form */}
      {formOpen && data.canManageOperations && (
        <form
          onSubmit={handleCreateSchedule}
          aria-label="Create workflow schedule"
          className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Schedule Name
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily Technical & Speed Audit"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Workflow Target Type
              </span>
              <select
                value={targetKind}
                onChange={(e) =>
                  setTargetKind(e.target.value as ScheduleTargetKind)
                }
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="workflow_template">
                  Built-in Orchestration Template
                </option>
                {data.studioWorkflows.length > 0 && (
                  <option value="studio_workflow">
                    Published Visual Studio Workflow
                  </option>
                )}
              </select>
            </label>

            {targetKind === 'workflow_template' ? (
              <label className="block space-y-1.5 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Workflow Template
                </span>
                <select
                  value={templateId}
                  onChange={(e) =>
                    setTemplateId(e.target.value as WorkflowTemplateId)
                  }
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                >
                  {WORKFLOW_TEMPLATES.map((tpl) => (
                    <option key={tpl.templateId} value={tpl.templateId}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-1.5 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Published Studio Workflow
                </span>
                <select
                  value={studioWorkflowId}
                  onChange={(e) => setStudioWorkflowId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                >
                  {data.studioWorkflows.map((sw) => (
                    <option key={sw.id} value={sw.id}>
                      {sw.name} ({sw.status})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                IANA Timezone
              </span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Frequency
              </span>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as ScheduleFrequency)
                }
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="once">One-Time</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Missed Run Catch-Up Policy
              </span>
              <select
                value={catchUpPolicy}
                onChange={(e) =>
                  setCatchUpPolicy(e.target.value as ScheduleCatchUpPolicy)
                }
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="skip">Skip missed runs</option>
                <option value="run_once">Run once for missed window</option>
                <option value="run_all_capped">
                  Run missed occurrences (capped)
                </option>
              </select>
            </label>
          </div>

          {/* Cadence timing inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {frequency === 'once' ? (
              <label className="block space-y-1.5 text-xs sm:col-span-2">
                <span className="font-semibold text-[var(--text-primary)]">
                  Run At (Local Date &amp; Time)
                </span>
                <input
                  type="datetime-local"
                  value={runAtLocal}
                  onChange={(e) => setRunAtLocal(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
            ) : (
              <>
                {frequency !== 'hourly' && (
                  <label className="block space-y-1.5 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Hour (0–23)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={hourOfDay}
                      onChange={(e) => setHourOfDay(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </label>
                )}
                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">
                    Minute (0–59)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minuteOfHour}
                    onChange={(e) => setMinuteOfHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                </label>
                {frequency === 'monthly' && (
                  <label className="block space-y-1.5 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Day of Month (1–31)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </label>
                )}
              </>
            )}

            {catchUpPolicy === 'run_all_capped' && (
              <label className="block space-y-1.5 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Max Catch-Up Runs (1–20)
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxCatchUpRuns}
                  onChange={(e) => setMaxCatchUpRuns(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
            )}
          </div>

          {frequency === 'weekly' && (
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-[var(--text-primary)]">
                Days of Week
              </div>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, idx) => {
                  const selected = daysOfWeek.includes(idx);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(idx)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                        selected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Execution Window */}
          <div className="space-y-2 border-t border-[var(--border-hairline)] pt-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={useWindow}
                onChange={(e) => setUseWindow(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#7047EB]"
              />
              <span>Restrict launches to an allowed execution hour window</span>
            </label>
            {useWindow && (
              <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
                <label className="block space-y-1 text-xs">
                  <span className="text-[var(--text-muted)]">Start Hour</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={windowStartHour}
                    onChange={(e) => setWindowStartHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="text-[var(--text-muted)]">End Hour</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={windowEndHour}
                    onChange={(e) => setWindowEndHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Objective Override (Optional)
              </span>
              <input
                type="text"
                value={workflowObjective}
                onChange={(e) => setWorkflowObjective(e.target.value)}
                placeholder="Custom SEO objective passed to orchestrator"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Description (Optional)
              </span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes for operations team"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting ? 'Creating…' : 'Create Schedule'}
            </button>
          </div>
        </form>
      )}

      {/* Schedules Table */}
      <section
        aria-label="Configured workflow schedules"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        {data.schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <CalendarClock
              className="h-6 w-6 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              No persistent schedules configured
            </div>
            <p className="max-w-md text-xs text-[var(--text-muted)]">
              Create a recurring or one-time workflow schedule to automate technical audits, Core Web Vitals monitoring, or keyword intelligence refreshes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-3">Schedule</th>
                  <th className="px-4 py-3">Cadence &amp; Timezone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Next Run</th>
                  <th className="px-4 py-3">Last Run / Runs</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.schedules.map((s) => {
                  const isBusy = busyId === s.id;
                  const isConfirming = confirmDeleteId === s.id;
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {s.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                          {s.targetKind === 'studio_workflow'
                            ? `Studio: ${s.studioWorkflowId}`
                            : `Template: ${s.templateId}`}{' '}
                          · Catch-up: {s.catchUpPolicy}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-primary)]">
                          {describeScheduleCadence(s)}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                          {s.timezone}
                          {s.executionWindow
                            ? ` · Window ${s.executionWindow.startHour}:00–${s.executionWindow.endHour}:00`
                            : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold capitalize ${
                            s.status === 'active'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : s.status === 'paused'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-primary)] tabular-nums">
                        {formatTs(s.nextRunAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <div>{formatTs(s.lastRunAt)}</div>
                        <div className="text-[10.5px] text-[var(--text-muted)]">
                          {s.totalRuns} run(s)
                          {s.lastRunStatus ? ` · ${s.lastRunStatus}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {data.canManageOperations ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {s.status !== 'completed' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggle(s)}
                                aria-label={
                                  s.status === 'active'
                                    ? `Pause schedule ${s.name}`
                                    : `Resume schedule ${s.name}`
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {s.status === 'active' ? (
                                  <>
                                    <Pause className="h-3 w-3" aria-hidden="true" />
                                    <span>Pause</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3 w-3" aria-hidden="true" />
                                    <span>Resume</span>
                                  </>
                                )}
                              </button>
                            )}
                            {isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleDelete(s.id, s.name)}
                                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(s.id)}
                                aria-label={`Delete schedule ${s.name}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Scheduler Execution History */}
      <section
        aria-label="Scheduler execution logs"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Scheduler Execution History
          </h3>
        </div>
        {data.schedulerLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No scheduled execution events recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Executed At</th>
                  <th className="px-4 py-2.5">Schedule</th>
                  <th className="px-4 py-2.5">Outcome</th>
                  <th className="px-4 py-2.5">Worker</th>
                  <th className="px-5 py-2.5">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.schedulerLogs.slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(log.executedAtIso)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {log.scheduleName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {log.outcome}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-muted)]">
                      {log.workerId}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
