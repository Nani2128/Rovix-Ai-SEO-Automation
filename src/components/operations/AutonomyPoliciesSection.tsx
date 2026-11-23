import { useEffect, useState } from 'react';
import { Lock, Save, ShieldCheck } from 'lucide-react';
import { AGENT_CATALOG } from '../../lib/agentFactoryCatalog';
import { WORKFLOW_TEMPLATES } from '../../lib/dagValidation';
import { MICROS_PER_USD } from '../../lib/usageCostEngine';
import { operationsService } from '../../services/operationsService';
import type { AgentStationId, WorkflowTemplateId } from '../../types/agentFactory';
import type {
  AutonomyMode,
  OperationsControlCenterPayload,
} from '../../types/autonomousOperations';

const STATION_AGENTS = AGENT_CATALOG.filter((a) => !a.isOrchestrator);

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

export function AutonomyPoliciesSection({
  projectId,
  data,
  onRefresh,
}: {
  projectId: string;
  data: OperationsControlCenterPayload;
  onRefresh: () => Promise<void>;
}) {
  const { policy, canManagePolicies, policyAuditHistory } = data;

  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>(
    policy.autonomyMode,
  );
  const [maxConcurrentWorkflows, setMaxConcurrentWorkflows] = useState(
    policy.maxConcurrentWorkflows,
  );
  const [maxActiveAgentTasks, setMaxActiveAgentTasks] = useState(
    policy.maxActiveAgentTasks,
  );
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(
    Math.max(1, Math.round(policy.maxWorkflowDurationMs / 60_000)),
  );
  const [maxTokensPerWorkflow, setMaxTokensPerWorkflow] = useState<string>(
    policy.maxTokensPerWorkflow !== null
      ? String(policy.maxTokensPerWorkflow)
      : '',
  );
  const [maxSpendUsdPerRun, setMaxSpendUsdPerRun] = useState<string>(
    policy.maxSpendMicrosPerRun !== null
      ? (policy.maxSpendMicrosPerRun / MICROS_PER_USD).toFixed(4)
      : '',
  );
  const [allowedTemplates, setAllowedTemplates] = useState<WorkflowTemplateId[]>(
    policy.allowedTemplates,
  );
  const [allowedAgents, setAllowedAgents] = useState<AgentStationId[]>(
    policy.allowedAgents,
  );
  const [requireApprovalForHighImpact, setRequireApprovalForHighImpact] =
    useState(policy.requireApprovalForHighImpact);
  const [allowAutonomousRetries, setAllowAutonomousRetries] = useState(
    policy.allowAutonomousRetries,
  );
  const [allowExternalWebhooks, setAllowExternalWebhooks] = useState(
    policy.allowExternalWebhooks,
  );
  const [enabled, setEnabled] = useState(policy.enabled);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAutonomyMode(policy.autonomyMode);
    setMaxConcurrentWorkflows(policy.maxConcurrentWorkflows);
    setMaxActiveAgentTasks(policy.maxActiveAgentTasks);
    setMaxDurationMinutes(
      Math.max(1, Math.round(policy.maxWorkflowDurationMs / 60_000)),
    );
    setMaxTokensPerWorkflow(
      policy.maxTokensPerWorkflow !== null
        ? String(policy.maxTokensPerWorkflow)
        : '',
    );
    setMaxSpendUsdPerRun(
      policy.maxSpendMicrosPerRun !== null
        ? (policy.maxSpendMicrosPerRun / MICROS_PER_USD).toFixed(4)
        : '',
    );
    setAllowedTemplates(policy.allowedTemplates);
    setAllowedAgents(policy.allowedAgents);
    setRequireApprovalForHighImpact(policy.requireApprovalForHighImpact);
    setAllowAutonomousRetries(policy.allowAutonomousRetries);
    setAllowExternalWebhooks(policy.allowExternalWebhooks);
    setEnabled(policy.enabled);
  }, [policy]);

  const toggleTemplate = (id: WorkflowTemplateId) => {
    setAllowedTemplates((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAgent = (id: AgentStationId) => {
    setAllowedAgents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const parsedTokens =
      maxTokensPerWorkflow.trim() === '' ? null : Number(maxTokensPerWorkflow);
    if (
      parsedTokens !== null &&
      (!Number.isFinite(parsedTokens) || parsedTokens < 0)
    ) {
      setError('Max tokens per workflow must be a non-negative integer.');
      return;
    }

    const parsedUsd =
      maxSpendUsdPerRun.trim() === '' ? null : Number(maxSpendUsdPerRun);
    if (parsedUsd !== null && (!Number.isFinite(parsedUsd) || parsedUsd < 0)) {
      setError('Max spend per run must be a non-negative USD amount.');
      return;
    }

    setSaving(true);
    try {
      await operationsService.updatePolicy(projectId, {
        name: policy.name,
        autonomyMode,
        maxConcurrentWorkflows,
        maxActiveAgentTasks,
        maxWorkflowDurationMs: Math.max(60_000, maxDurationMinutes * 60_000),
        maxTokensPerWorkflow:
          parsedTokens !== null ? Math.trunc(parsedTokens) : null,
        maxSpendMicrosPerRun:
          parsedUsd !== null ? Math.round(parsedUsd * MICROS_PER_USD) : null,
        allowedTemplates,
        allowedAgents,
        requireApprovalForHighImpact,
        highImpactActionTypes: policy.highImpactActionTypes,
        allowAutonomousRetries,
        allowExternalWebhooks,
        enabled,
      });
      setFeedback('Autonomy policy saved and recorded in governance audit log.');
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save autonomy policy.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Autonomous Operations Policy &amp; Safety Guardrails
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Enforced before every scheduled launch, event trigger, webhook dispatch, workflow resume, and automated retry. Stage 5 budget limits always apply.
          </p>
        </div>
        {!canManagePolicies && (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Admin or Owner role required to modify</span>
          </div>
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

      <form
        onSubmit={handleSave}
        aria-label="Autonomy policy configuration"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-5"
      >
        {/* Mode & Master Switch */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Autonomy Mode
            </span>
            <select
              disabled={!canManagePolicies}
              value={autonomyMode}
              onChange={(e) => setAutonomyMode(e.target.value as AutonomyMode)}
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            >
              <option value="automatic_low_risk">
                Automatic (Low-Risk Operations Only)
              </option>
              <option value="approval_required">
                Approval Required for Autonomous Launches
              </option>
              <option value="restricted">
                Restricted (Block All Autonomous Launches)
              </option>
            </select>
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Max Concurrent Workflows
            </span>
            <input
              type="number"
              min={1}
              max={25}
              disabled={!canManagePolicies}
              value={maxConcurrentWorkflows}
              onChange={(e) =>
                setMaxConcurrentWorkflows(Number(e.target.value))
              }
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Max Active Agent Tasks
            </span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={!canManagePolicies}
              value={maxActiveAgentTasks}
              onChange={(e) => setMaxActiveAgentTasks(Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            />
          </label>
        </div>

        {/* Time, Token & Spend Limits */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Max Workflow Timeout (Minutes)
            </span>
            <input
              type="number"
              min={1}
              max={240}
              disabled={!canManagePolicies}
              value={maxDurationMinutes}
              onChange={(e) => setMaxDurationMinutes(Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Max Tokens per Workflow (Blank = Policy Uncapped)
            </span>
            <input
              type="number"
              min={0}
              disabled={!canManagePolicies}
              value={maxTokensPerWorkflow}
              onChange={(e) => setMaxTokensPerWorkflow(e.target.value)}
              placeholder="e.g. 250000"
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">
              Max USD Spend per Run (Blank = Use Stage 5 Budget)
            </span>
            <input
              type="number"
              min={0}
              step="0.001"
              disabled={!canManagePolicies}
              value={maxSpendUsdPerRun}
              onChange={(e) => setMaxSpendUsdPerRun(e.target.value)}
              placeholder="e.g. 1.50"
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
            />
          </label>
        </div>

        {/* Governance Toggles */}
        <div className="grid grid-cols-1 gap-3 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2">
          <label className="flex items-start gap-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManagePolicies}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#7047EB]"
            />
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                Enable Autonomous Operations Runtime
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                Unchecking suspends all scheduled and event-triggered launches for this project.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManagePolicies}
              checked={requireApprovalForHighImpact}
              onChange={(e) =>
                setRequireApprovalForHighImpact(e.target.checked)
              }
              className="mt-0.5 h-3.5 w-3.5 accent-[#7047EB]"
            />
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                Mandatory Human Approval for High-Impact Actions
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                Enforces human sign-off on content publishing, production mutations, external outreach, and budget-sensitive actions.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManagePolicies}
              checked={allowAutonomousRetries}
              onChange={(e) => setAllowAutonomousRetries(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#7047EB]"
            />
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                Allow Automatic Retries with Exponential Backoff
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                Automatically retries transient network/provider errors while dead-lettering non-retryable faults immediately.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManagePolicies}
              checked={allowExternalWebhooks}
              onChange={(e) => setAllowExternalWebhooks(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#7047EB]"
            />
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                Allow Signed External Webhook Triggers
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                Permits HMAC-SHA256 authenticated external webhooks to trigger workflows for this project.
              </span>
            </span>
          </label>
        </div>

        {/* Allowed Templates & Agents */}
        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Allowed Autonomous Workflow Templates (Empty = All Permitted)
            </div>
            <div className="space-y-1.5">
              {WORKFLOW_TEMPLATES.map((tpl) => (
                <label
                  key={tpl.templateId}
                  className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    disabled={!canManagePolicies}
                    checked={allowedTemplates.includes(tpl.templateId)}
                    onChange={() => toggleTemplate(tpl.templateId)}
                    className="h-3.5 w-3.5 accent-[#7047EB]"
                  />
                  <span>{tpl.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Allowed Specialist Agents (Empty = All Permitted)
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {STATION_AGENTS.map((agent) => (
                <label
                  key={agent.agentId}
                  className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    disabled={!canManagePolicies}
                    checked={allowedAgents.includes(
                      agent.agentId as AgentStationId,
                    )}
                    onChange={() =>
                      toggleAgent(agent.agentId as AgentStationId)
                    }
                    className="h-3.5 w-3.5 accent-[#7047EB]"
                  />
                  <span className="truncate">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {canManagePolicies && (
          <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Last updated by {policy.updatedBy} at{' '}
                {formatTs(policy.updatedAt)}
              </span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{saving ? 'Saving Policy…' : 'Save Autonomy Policy'}</span>
            </button>
          </div>
        )}
      </form>

      {/* Policy Change Audit Trail */}
      <section
        aria-label="Autonomy policy audit trail"
        className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="border-b border-[var(--border-hairline)] px-5 py-3.5">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Governance Policy Audit Trail
          </h3>
        </div>
        {policyAuditHistory.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
            No policy or schedule governance edits recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Transition</th>
                  <th className="px-5 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {policyAuditHistory.slice(0, 20).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTs(entry.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-primary)]">
                      {entry.actorName}{' '}
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ({entry.actorRole})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {entry.entityType}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {entry.previousState} {'->'} {entry.newState}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                      {entry.reason}
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
