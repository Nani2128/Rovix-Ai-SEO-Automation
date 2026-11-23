import { useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  Send,
  Trash2,
  Zap,
} from 'lucide-react';
import { WORKFLOW_TEMPLATES } from '../../lib/dagValidation';
import { operationsService } from '../../services/operationsService';
import type { WorkflowTemplateId } from '../../types/agentFactory';
import type {
  AutomationTriggerType,
  OperationsControlCenterPayload,
  ScheduleTargetKind,
} from '../../types/autonomousOperations';

const TRIGGER_OPTIONS: readonly {
  value: Exclude<AutomationTriggerType, 'schedule'>;
  label: string;
}[] = [
  { value: 'crawl_completed', label: 'Crawl Completed' },
  { value: 'technical_issue_detected', label: 'Technical Issue Detected' },
  {
    value: 'performance_regression_detected',
    label: 'Performance Regression Detected',
  },
  {
    value: 'keyword_intelligence_updated',
    label: 'Keyword Intelligence Updated',
  },
  {
    value: 'competitor_research_completed',
    label: 'Competitor Research Completed',
  },
  { value: 'budget_threshold_reached', label: 'Budget Threshold Reached' },
  { value: 'approval_decided', label: 'Human Approval Decided' },
  { value: 'workflow_completed', label: 'Workflow Completed' },
  { value: 'workflow_failed', label: 'Workflow Failed' },
  {
    value: 'external_webhook',
    label: 'External Signed Webhook (HMAC-SHA256)',
  },
];

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AutomationMonitorSection({
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
  const [triggerType, setTriggerType] =
    useState<Exclude<AutomationTriggerType, 'schedule'>>('crawl_completed');
  const [targetKind, setTargetKind] =
    useState<ScheduleTargetKind>('workflow_template');
  const [templateId, setTemplateId] = useState<WorkflowTemplateId>(
    'technical_seo_collaboration',
  );
  const [studioWorkflowId, setStudioWorkflowId] = useState(
    data.studioWorkflows[0]?.id ?? '',
  );
  const [workflowObjective, setWorkflowObjective] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(20);

  const [createdWebhook, setCreatedWebhook] = useState<{
    name: string;
    endpoint: string;
    secret: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'url' | 'secret' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async (text: string, field: 'url' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (!name.trim()) {
      setError('Automation trigger name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await operationsService.createTrigger(projectId, {
        name: name.trim(),
        description: description.trim(),
        triggerType,
        targetKind,
        templateId: targetKind === 'workflow_template' ? templateId : null,
        studioWorkflowId:
          targetKind === 'studio_workflow' ? studioWorkflowId || null : null,
        workflowObjective: workflowObjective.trim(),
        enabled: true,
        rateLimitPerMinute,
      });

      if (result.webhookSecretPlaintext && result.webhookEndpointPath) {
        setCreatedWebhook({
          name: result.subscription.name,
          endpoint: `${window.location.origin}${result.webhookEndpointPath}`,
          secret: result.webhookSecretPlaintext,
        });
      }
      setName('');
      setDescription('');
      setWorkflowObjective('');
      setFormOpen(false);
      setFeedback(`Created trigger subscription "${result.subscription.name}".`);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create automation trigger.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, nextEnabled: boolean) => {
    setBusyId(id);
    setError(null);
    setFeedback(null);
    try {
      await operationsService.toggleTrigger(projectId, id, nextEnabled);
      setFeedback(
        nextEnabled
          ? 'Enabled automation trigger subscription.'
          : 'Disabled automation trigger subscription.',
      );
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update trigger.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, subName: string) => {
    setBusyId(id);
    setError(null);
    setFeedback(null);
    try {
      await operationsService.deleteTrigger(projectId, id);
      setConfirmDeleteId(null);
      setFeedback(`Deleted trigger subscription "${subName}".`);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to delete trigger.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDispatchTest = async (
    type: Exclude<AutomationTriggerType, 'schedule' | 'external_webhook'>,
  ) => {
    setBusyId(`test:${type}`);
    setError(null);
    setFeedback(null);
    try {
      const res = await operationsService.dispatchTestTrigger(projectId, {
        triggerType: type,
        payloadSummary: `Operator-initiated ${type.replace(/_/g, ' ')} event verification`,
      });
      setFeedback(
        `Dispatched ${type}: ${res.events.length} subscription evaluation(s) recorded.`,
      );
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to dispatch test event.',
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
            Event-Driven Automation Triggers &amp; Signed Webhooks
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Launch workflows from verified SEO domain events or HMAC-SHA256 authenticated external webhooks with idempotency, replay protection, and rate limiting.
          </p>
        </div>
        {data.canManageOperations && (
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formOpen ? 'Close Trigger Form' : 'New Trigger'}</span>
          </button>
        )}
      </div>

      {/* One-time Webhook Signing Secret Reveal Banner */}
      {createdWebhook && (
        <section
          aria-label="New webhook signing credentials"
          className="rounded-[18px] border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>
                One-Time Webhook Credentials for &ldquo;{createdWebhook.name}
                &rdquo;
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCreatedWebhook(null)}
              className="text-xs font-semibold text-amber-800 dark:text-amber-200 underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-amber-900/90 dark:text-amber-100/90">
            Store this signing secret securely now. It will not be shown again. Send requests with headers{' '}
            <code className="font-mono">X-Rovix-Timestamp</code> (Unix seconds),{' '}
            <code className="font-mono">X-Rovix-Signature: sha256=&lt;hmac&gt;</code>, and{' '}
            <code className="font-mono">X-Idempotency-Key</code>.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                Endpoint URL
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-amber-500/30 bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)]">
                  {createdWebhook.endpoint}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(createdWebhook.endpoint, 'url')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'url' ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>{copiedField === 'url' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                HMAC-SHA256 Signing Secret
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-amber-500/30 bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)]">
                  {createdWebhook.secret}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopy(createdWebhook.secret, 'secret')
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'secret' ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>{copiedField === 'secret' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

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

      {/* Create Trigger Form */}
      {formOpen && data.canManageOperations && (
        <form
          onSubmit={handleCreateTrigger}
          aria-label="Create automation trigger"
          className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Trigger Name
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Auto-Diagnose After Site Crawl"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Trigger Event Type
              </span>
              <select
                value={triggerType}
                onChange={(e) =>
                  setTriggerType(
                    e.target.value as Exclude<
                      AutomationTriggerType,
                      'schedule'
                    >,
                  )
                }
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Target Workflow Kind
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
                  Target Workflow Template
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
                Objective Override (Optional)
              </span>
              <input
                type="text"
                value={workflowObjective}
                onChange={(e) => setWorkflowObjective(e.target.value)}
                placeholder="Objective passed to workflow launch"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>

            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Rate Limit (Requests / Minute)
              </span>
              <input
                type="number"
                min={1}
                max={300}
                value={rateLimitPerMinute}
                onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Description (Optional)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain when this automation should trigger"
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting ? 'Saving…' : 'Create Trigger'}
            </button>
          </div>
        </form>
      )}

      {/* Trigger Subscriptions Table */}
      <section
        aria-label="Configured trigger subscriptions"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        {data.triggers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <Zap
              className="h-6 w-6 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              No automation triggers configured
            </div>
            <p className="max-w-md text-xs text-[var(--text-muted)]">
              Subscribe a workflow to crawl completion, technical issue detection, performance regressions, budget thresholds, or external signed webhooks.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-3">Subscription</th>
                  <th className="px-4 py-3">Event Source</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fires / Last Fired</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.triggers.map((sub) => {
                  const isBusy = busyId === sub.id;
                  const isConfirming = confirmDeleteId === sub.id;
                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {sub.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                          {sub.triggerType === 'external_webhook'
                            ? `/api/webhooks/agent-factory/${sub.id} · secret ${sub.webhookSecretHint || '----'}`
                            : sub.description || sub.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-primary)]">
                        {sub.triggerType}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {sub.targetKind === 'studio_workflow'
                          ? `Studio: ${sub.studioWorkflowId}`
                          : sub.templateId}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            sub.enabled
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {sub.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        <div>{sub.totalTriggered} fired</div>
                        <div className="text-[10.5px] text-[var(--text-muted)]">
                          {formatTs(sub.lastTriggeredAt)}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {data.canManageOperations ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {sub.triggerType !== 'external_webhook' &&
                              sub.triggerType !== 'schedule' &&
                              sub.enabled && (
                                <button
                                  type="button"
                                  disabled={busyId === `test:${sub.triggerType}`}
                                  onClick={() =>
                                    void handleDispatchTest(
                                      sub.triggerType as Exclude<
                                        AutomationTriggerType,
                                        'schedule' | 'external_webhook'
                                      >,
                                    )
                                  }
                                  aria-label={`Test dispatch ${sub.name}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Send className="h-3 w-3" aria-hidden="true" />
                                  <span>Test</span>
                                </button>
                              )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleToggle(sub.id, !sub.enabled)
                              }
                              aria-label={
                                sub.enabled
                                  ? `Disable trigger ${sub.name}`
                                  : `Enable trigger ${sub.name}`
                              }
                              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {sub.enabled ? 'Disable' : 'Enable'}
                            </button>
                            {isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleDelete(sub.id, sub.name)
                                  }
                                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Confirm
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
                                onClick={() => setConfirmDeleteId(sub.id)}
                                aria-label={`Delete trigger ${sub.name}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/60 whitespace-nowrap shrink-0 cursor-pointer"
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

      {/* Trigger Event History */}
      <section
        aria-label="Trigger event history"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Trigger Event Audit Trail
          </h3>
        </div>
        {data.triggerEvents.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No trigger events recorded for this project yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Trigger Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Workflow</th>
                  <th className="px-5 py-2.5">Summary / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.triggerEvents.slice(0, 25).map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(ev.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                      {ev.triggerType}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          ev.status === 'dispatched'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ev.status === 'deduplicated'
                              ? 'text-[var(--text-muted)]'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {ev.launchedWorkflowId ?? '—'}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                      <div>{ev.payloadSummary}</div>
                      {ev.errorMessage && (
                        <div className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                          {ev.errorMessage}
                        </div>
                      )}
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
