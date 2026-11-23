import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  ExternalLink,
  FileText,
  MessageSquare,
  Network,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { getAgentCatalogDefinition } from '../../lib/agentFactoryCatalog';
import { getStateVisualSpec } from '../../lib/agentFactoryState';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import type {
  AgentId,
  AgentStationNodeSnapshot,
  AgentWorkflowDetail,
  CollaborationMonitorPayload,
  EvidenceTrustBreakdown,
} from '../../types/agentFactory';
import { SmoothModal } from '../animation/MotionPrimitives';
import { StatusBadge } from '../ui/StateViews';

export interface AgentFactoryInspectorDrawerProps {
  open: boolean;
  agent: AgentStationNodeSnapshot | null;
  allNodes: AgentStationNodeSnapshot[];
  workflowDetail?: AgentWorkflowDetail | null;
  collaboration?: CollaborationMonitorPayload | null;
  onClose: () => void;
  onSelectConnectedAgent: (agentId: AgentId) => void;
  onRetryTask?: (taskId: string) => void;
}

function formatIsoShort(iso: string | null | undefined): string {
  if (!iso) return 'None recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function AgentFactoryInspectorDrawer({
  open,
  agent,
  allNodes,
  workflowDetail,
  collaboration,
  onClose,
  onSelectConnectedAgent,
  onRetryTask,
}: AgentFactoryInspectorDrawerProps) {
  if (!agent) return null;

  const spec = getStateVisualSpec(agent.state);
  const availabilityTone =
    agent.availabilityStatus === 'connected'
      ? 'success'
      : agent.availabilityStatus === 'partial'
        ? 'warning'
        : 'neutral';
  const availabilityLabel =
    agent.availabilityStatus === 'connected'
      ? 'Connected'
      : agent.availabilityStatus === 'partial'
        ? 'Partial Config'
        : 'Unavailable';

  const errorEvents = agent.recentEvents.filter((ev) => ev.errorSummary);
  const agentOutputs =
    workflowDetail?.outputs.filter((o) => o.agentId === agent.agentId) ?? [];
  const agentHandoffs =
    workflowDetail?.handoffs.filter(
      (h) =>
        h.sourceAgentId === agent.agentId ||
        h.destinationAgentId === agent.agentId,
    ) ?? [];
  const agentTasks =
    workflowDetail?.tasks.filter((t) => t.agentId === agent.agentId) ?? [];
  const retryableTask = agentTasks.find(
    (t) => t.status === 'failed' || t.status === 'blocked',
  );

  const agentCollab = collaboration?.byAgent?.[agent.agentId] ?? null;
  const agentMessages =
    collaboration?.messages.filter(
      (m) =>
        m.sourceAgentId === agent.agentId ||
        m.destinationAgentId === agent.agentId,
    ) ?? [];

  const latestOutput = agentOutputs[0] ?? null;
  const latestPayload = latestOutput?.payload ?? {};
  const evidenceTrust =
    latestPayload.evidenceTrust &&
    typeof latestPayload.evidenceTrust === 'object'
      ? (latestPayload.evidenceTrust as EvidenceTrustBreakdown)
      : null;
  const sourcedFacts = Array.isArray(latestPayload.sourcedFacts)
    ? (latestPayload.sourcedFacts as string[])
    : null;
  const aiSuggestions = Array.isArray(latestPayload.aiGeneratedSuggestions)
    ? (latestPayload.aiGeneratedSuggestions as string[])
    : null;
  const qaChecks = Array.isArray(latestPayload.checks)
    ? (latestPayload.checks as {
        name: string;
        status: string;
        detail: string;
      }[])
    : null;

  const totalTokens =
    agent.metrics.tokenUsageAvailable &&
    agent.metrics.totalInputTokens !== null &&
    agent.metrics.totalOutputTokens !== null
      ? agent.metrics.totalInputTokens + agent.metrics.totalOutputTokens
      : null;

  return (
    <SmoothModal
      open={open}
      onClose={onClose}
      ariaLabel={`${agent.name} inspection drawer`}
      maxWidthClass="max-w-2xl"
    >
      <div className="flex max-h-[85vh] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Cpu
                className="h-4 w-4 shrink-0"
                style={{ color: spec.colorHex }}
                aria-hidden="true"
              />
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {agent.name}
              </h2>
              <StatusBadge label={spec.label} tone={spec.badgeTone} />
              <StatusBadge label={availabilityLabel} tone={availabilityTone} />
            </div>
            <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
              {agent.role}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close agent inspector"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {/* Description & Stage 2 Scope */}
          <section className="space-y-2">
            <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Station Role &amp; Multi-Agent Telemetry
            </h3>
            <p className="leading-relaxed text-[var(--text-secondary)]">
              {agent.description}
            </p>

            {/* Measured Station Performance Metrics */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  Completed / Failed
                </div>
                <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                  {agent.metrics.completedCount} / {agent.metrics.failedCount}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  Avg Duration
                </div>
                <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                  {formatDuration(agent.metrics.avgDurationMs)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  Metered Tokens
                </div>
                <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                  {totalTokens !== null ? totalTokens.toLocaleString() : 'None reported'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  Model / Provider
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                  {agent.metrics.lastModel ?? agent.metrics.lastProvider ?? 'Backend'}
                </div>
              </div>
            </div>
          </section>

          {/* Stage 5 Usage & Cost Intelligence */}
          <section
            data-testid="inspector-usage-intelligence-section"
            className="space-y-2.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Usage &amp; Cost Intelligence</span>
              </span>
              <Link
                to={`/agent-factory/analytics?tab=ledger&agentId=${encodeURIComponent(agent.agentId)}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:underline whitespace-nowrap shrink-0"
              >
                <span>Open Usage Ledger</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>

            {agent.metrics.usageTelemetry &&
            agent.metrics.usageTelemetry.totalRequests > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Measured Cost
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agent.metrics.usageTelemetry.measuredCostMicros !== null
                        ? formatMicroUsd(
                            agent.metrics.usageTelemetry.measuredCostMicros,
                          )
                        : 'Unavailable'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Total Tokens
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agent.metrics.usageTelemetry.totalTokens > 0
                        ? agent.metrics.usageTelemetry.totalTokens.toLocaleString()
                        : 'None reported'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Avg Latency
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {formatDuration(agent.metrics.usageTelemetry.avgLatencyMs)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Requests / Retries
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agent.metrics.usageTelemetry.totalRequests} /{' '}
                      {agent.metrics.usageTelemetry.retryRequests}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
                  <span>
                    In {agent.metrics.usageTelemetry.inputTokens.toLocaleString()} ·
                    Out {agent.metrics.usageTelemetry.outputTokens.toLocaleString()}
                    {agent.metrics.usageTelemetry.cachedInputTokens > 0
                      ? ` · Cached ${agent.metrics.usageTelemetry.cachedInputTokens.toLocaleString()}`
                      : ''}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    Basis: {agent.metrics.usageTelemetry.costBasis.replace(/_/g, ' ')}
                  </span>
                </div>

                {agent.metrics.usageTelemetry.providerModels.length > 0 && (
                  <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-mono">
                    {agent.metrics.usageTelemetry.providerModels.map((pm) => (
                      <div
                        key={`${pm.provider}:${pm.model ?? 'default'}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                      >
                        <span className="text-[var(--text-primary)]">
                          {pm.provider}
                          {pm.model ? ` / ${pm.model}` : ''}
                        </span>
                        <span className="text-[var(--text-secondary)] tabular-nums">
                          {pm.requests} req · {pm.totalTokens.toLocaleString()} tok ·{' '}
                          {pm.unavailableCostCount === pm.requests
                            ? 'Unavailable'
                            : formatMicroUsd(pm.measuredCostMicros)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                No metered provider or specialist usage events recorded for this agent yet.
              </p>
            )}
          </section>

          {/* Provider Availability */}
          <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-display font-bold text-[var(--text-primary)]">
                <ShieldCheck
                  className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#22D3EE]"
                  aria-hidden="true"
                />
                <span>Provider &amp; Integration Status</span>
              </span>
              <StatusBadge label={availabilityLabel} tone={availabilityTone} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-[var(--text-secondary)]">
              {agent.providerSummary}
            </p>
          </section>

          {/* Current Task & Last Activity */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Current Task
              </div>
              {agent.currentTask ? (
                <div className="mt-2 space-y-1.5">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {agent.currentTask.title}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                    Task {agent.currentTask.taskId} · Started{' '}
                    {formatIsoShort(agent.currentTask.startedAt)}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                    Progress:{' '}
                    {agent.currentTask.progressPct !== null
                      ? `${agent.currentTask.progressPct}% (reported by backend)`
                      : 'Not reported by backend'}
                  </div>
                  {agent.currentTask.evidenceUrl && (
                    <Link
                      to={agent.currentTask.evidenceUrl}
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:underline"
                    >
                      <span>Open Execution Details</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-[var(--text-muted)]">
                  No active backend task running for this station.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Last Activity
              </div>
              {agent.lastExecution ? (
                <div className="mt-2 space-y-1.5">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {agent.lastExecution.summary}
                  </div>
                  <div className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>{formatIsoShort(agent.lastExecution.timestamp)}</span>
                  </div>
                  {retryableTask && onRetryTask && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          onRetryTask(retryableTask.id);
                          onClose();
                        }}
                        className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB] cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        <span>Retry Failed Task</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-[var(--text-muted)]">
                  No execution recorded yet in this project workspace.
                </p>
              )}
            </div>
          </section>

          {/* Latest Stage 2 Deliverable Output */}
          {latestOutput && (
            <section className="space-y-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Latest Workflow Deliverable</span>
                </span>
                {latestOutput.isAiGenerated ? (
                  <StatusBadge label="AI-Generated Draft (Auto-Publish Disabled)" tone="warning" />
                ) : (
                  <StatusBadge label="Verified Backend Data" tone="success" />
                )}
              </div>

              <p className="font-semibold text-[var(--text-primary)]">
                {latestOutput.summary}
              </p>

              {typeof latestPayload.fullContentDraft === 'string' && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-[11.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                  {latestPayload.fullContentDraft}
                </div>
              )}

              {(sourcedFacts || aiSuggestions) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sourcedFacts && (
                    <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/60 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/25">
                      <div className="text-[10.5px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                        Verified Sourced Facts
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-emerald-900 dark:text-emerald-200">
                        {sourcedFacts.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiSuggestions && (
                    <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/25">
                      <div className="text-[10.5px] font-bold uppercase text-amber-700 dark:text-amber-300">
                        AI Editorial Suggestions
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-900 dark:text-amber-200">
                        {aiSuggestions.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {evidenceTrust && (
                <div className="space-y-2 pt-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Evidence Trust Separation
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {evidenceTrust.verifiedFacts.length > 0 && (
                      <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/60 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/25">
                        <div className="text-[10.5px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                          Verified Facts ({evidenceTrust.verifiedFacts.length})
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-emerald-900 dark:text-emerald-200">
                          {evidenceTrust.verifiedFacts.slice(0, 4).map((item, i) => (
                            <li key={i}>
                              {item.statement}{' '}
                              <span className="font-mono text-[10px] opacity-80">
                                [{item.source}]
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evidenceTrust.measuredMetrics.length > 0 && (
                      <div className="rounded-xl border border-sky-300/60 bg-sky-50/60 p-2.5 dark:border-sky-800/50 dark:bg-sky-950/25">
                        <div className="text-[10.5px] font-bold uppercase text-sky-700 dark:text-sky-300">
                          Measured Metrics ({evidenceTrust.measuredMetrics.length})
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-sky-900 dark:text-sky-200">
                          {evidenceTrust.measuredMetrics.slice(0, 4).map((item, i) => (
                            <li key={i}>
                              {item.statement}{' '}
                              <span className="font-mono text-[10px] opacity-80">
                                [{item.source}]
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evidenceTrust.inferredFindings.length > 0 && (
                      <div className="rounded-xl border border-indigo-300/60 bg-indigo-50/60 p-2.5 dark:border-indigo-800/50 dark:bg-indigo-950/25">
                        <div className="text-[10.5px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                          Inferred Findings ({evidenceTrust.inferredFindings.length})
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-indigo-900 dark:text-indigo-200">
                          {evidenceTrust.inferredFindings.slice(0, 4).map((item, i) => (
                            <li key={i}>{item.statement}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evidenceTrust.aiGeneratedSuggestions.length > 0 && (
                      <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/25">
                        <div className="text-[10.5px] font-bold uppercase text-amber-700 dark:text-amber-300">
                          AI Suggestions ({evidenceTrust.aiGeneratedSuggestions.length})
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900 dark:text-amber-200">
                          {evidenceTrust.aiGeneratedSuggestions.slice(0, 4).map((item, i) => (
                            <li key={i}>{item.statement}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {evidenceTrust.unavailableInformation.length > 0 && (
                    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        Unavailable Information:{' '}
                      </span>
                      {evidenceTrust.unavailableInformation.join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {qaChecks && qaChecks.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {qaChecks.map((chk, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px]"
                    >
                      <CheckCircle2
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          chk.status === 'pass'
                            ? 'text-emerald-500'
                            : chk.status === 'warning'
                              ? 'text-amber-500'
                              : 'text-rose-500'
                        }`}
                        aria-hidden="true"
                      />
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {chk.name}:
                        </span>{' '}
                        <span className="text-[var(--text-secondary)]">
                          {chk.detail}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Stage 3 Collaboration & Messaging Telemetry */}
          {(agentCollab || agentMessages.length > 0) && (
            <section
              data-testid="inspector-collaboration-section"
              className="space-y-2.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agent-to-Agent Collaboration</span>
                </span>
                {agentCollab && agentCollab.activeCollaborationPeerIds.length > 0 && (
                  <StatusBadge
                    label={`${agentCollab.activeCollaborationPeerIds.length} Peer(s)`}
                    tone="indigo"
                  />
                )}
              </div>

              {agentCollab && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Messages Sent
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agentCollab.messagesSent}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Messages Received
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agentCollab.messagesReceived}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Delegations (Out/In)
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agentCollab.delegatedTasksCreated} /{' '}
                      {agentCollab.delegatedTasksReceived}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Pending / Failed
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {agentCollab.pendingResponses} /{' '}
                      {agentCollab.failedCommunications}
                    </div>
                  </div>
                </div>
              )}

              {agentCollab?.currentCollaborationSummary && (
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  {agentCollab.currentCollaborationSummary}
                </div>
              )}

              {agentMessages.length > 0 && (
                <ul className="space-y-1.5">
                  {agentMessages.slice(0, 5).map((msg) => {
                    const msgSummary =
                      typeof msg.payload.summary === 'string'
                        ? msg.payload.summary
                        : typeof msg.payload.question === 'string'
                          ? msg.payload.question
                          : typeof msg.payload.objective === 'string'
                            ? msg.payload.objective
                            : msg.messageType;
                    return (
                      <li
                        key={msg.messageId}
                        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[11px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                          <span>
                            {msg.sourceAgentId} -&gt; {msg.destinationAgentId} ·{' '}
                            {msg.messageType}
                          </span>
                          <span>
                            {msg.status} · {msg.evidenceReferences.length} ref(s)
                          </span>
                        </div>
                        <div className="mt-0.5 text-[var(--text-primary)]">
                          {msgSummary}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Structured Handoff Lineage */}
          {agentHandoffs.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Validated Structured Handoffs ({agentHandoffs.length})</span>
              </div>
              <ul className="space-y-1.5">
                {agentHandoffs.slice(0, 6).map((h) => (
                  <li
                    key={h.id}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] text-[var(--text-muted)]">
                      <span>
                        {h.sourceAgentId} -&gt; {h.destinationAgentId}
                      </span>
                      <span>{h.evidenceRefs.length} evidence ref(s)</span>
                    </div>
                    <div className="mt-0.5 text-[var(--text-secondary)]">
                      {h.validationSummary}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Errors */}
          {(agent.lastExecution?.errorSummary || errorEvents.length > 0) && (
            <section className="rounded-2xl border border-rose-300/70 bg-rose-50/80 p-3.5 dark:border-rose-800/60 dark:bg-rose-950/35">
              <div className="flex items-center gap-1.5 font-display font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Recorded Execution Errors</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-[11.5px] text-rose-900 dark:text-rose-200">
                {agent.lastExecution?.errorSummary && (
                  <li>{agent.lastExecution.errorSummary}</li>
                )}
                {errorEvents.map((errEv) => (
                  <li key={`err-${errEv.id}`} className="font-mono">
                    [{formatIsoShort(errEv.timestamp)}] {errEv.errorSummary}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Connected Agents */}
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Network className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Connected Pathways</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.connectedAgentIds.map((peerId) => {
                const peerSnap = allNodes.find((n) => n.agentId === peerId);
                const def = getAgentCatalogDefinition(peerId);
                const peerSpec = getStateVisualSpec(peerSnap?.state ?? 'idle');
                return (
                  <button
                    key={peerId}
                    type="button"
                    onClick={() => onSelectConnectedAgent(peerId)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB] cursor-pointer transition-colors"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: peerSpec.colorHex }}
                    />
                    <span>{def.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Actual Logs / Recent Execution History */}
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Recent Execution History &amp; Actual Logs</span>
            </div>
            {agent.recentEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] px-4 py-5 text-center text-[var(--text-muted)]">
                No live stream events logged for this agent in the current session. Start a multi-agent workflow or module job to observe real-time events here.
              </div>
            ) : (
              <ol className="divide-y divide-[var(--border-hairline)] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
                {agent.recentEvents.map((ev) => {
                  const evSpec = getStateVisualSpec(ev.status);
                  return (
                    <li key={ev.id} className="space-y-1 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                          {ev.eventType}
                        </span>
                        <span className="font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                          {formatIsoShort(ev.timestamp)}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[var(--text-secondary)]">
                        {ev.summary}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--text-muted)]">
                        <span>wf:{ev.workflowId}</span>
                        <span>·</span>
                        <span style={{ color: evSpec.colorHex }}>{evSpec.label}</span>
                        {ev.progressPct !== null && (
                          <>
                            <span>·</span>
                            <span>{ev.progressPct}%</span>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </SmoothModal>
  );
}
