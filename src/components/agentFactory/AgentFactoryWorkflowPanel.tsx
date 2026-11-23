import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  GitBranch,
  Play,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  XCircle,
} from 'lucide-react';
import { getAgentCatalogDefinition } from '../../lib/agentFactoryCatalog';
import { getStateVisualSpec } from '../../lib/agentFactoryState';
import {
  WORKFLOW_TEMPLATES,
  buildWorkflowBlueprint,
  getApprovalGateLabel,
} from '../../lib/dagValidation';
import { agentFactoryService } from '../../services/agentFactoryService';
import { useAuthStore } from '../../stores/useAuthStore';
import type {
  AgentConfigRecord,
  AgentExecutionState,
  AgentOrchestrationOverview,
  AgentOutputRecord,
  AgentStationId,
  AgentWorkflowDetail,
  DagValidationResult,
  DagWorkflowEdgeInput,
  DagWorkflowNodeInput,
  WorkflowTemplateId,
} from '../../types/agentFactory';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

type OrchestrationTab = 'workflows' | 'launch' | 'approvals' | 'telemetry';

export interface AgentFactoryWorkflowPanelProps {
  projectId: string;
  overview: AgentOrchestrationOverview | null;
  selectedWorkflowDetail: AgentWorkflowDetail | null;
  selectedWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
  onRefreshOrchestration: (focusWorkflowId?: string) => Promise<void>;
  onSelectAgent: (agentId: AgentStationId) => void;
  onOpenAgentOutput: (agentId: AgentStationId) => void;
}

const OFFICIAL_APPROVER_ROLES = new Set([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
]);

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], {
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

function mapTaskStatusToVisual(status: string): AgentExecutionState {
  if (status === 'blocked') return 'cancelled';
  if (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting_for_approval' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'retrying' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'idle';
}

function OutputPayloadPreview({ output }: { output: AgentOutputRecord }) {
  const payload = output.payload ?? {};
  const sourcedFacts = Array.isArray(payload.sourcedFacts)
    ? (payload.sourcedFacts as string[])
    : null;
  const aiSuggestions = Array.isArray(payload.aiGeneratedSuggestions)
    ? (payload.aiGeneratedSuggestions as string[])
    : null;
  const fullDraft =
    typeof payload.fullContentDraft === 'string' ? payload.fullContentDraft : null;

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-primary)]">
          {output.summary}
        </span>
        {output.isAiGenerated ? (
          <StatusBadge label="AI-Generated Draft (Auto-Publish Off)" tone="warning" />
        ) : (
          <StatusBadge label="Verified System Output" tone="success" />
        )}
      </div>

      {typeof payload.seoTitle === 'string' && (
        <div className="rounded-lg bg-[var(--bg-subtle)] p-2 text-[11px]">
          <div>
            <span className="font-semibold text-[var(--text-muted)]">SEO Title: </span>
            <span className="text-[var(--text-primary)]">{payload.seoTitle}</span>
          </div>
          {typeof payload.metaDescription === 'string' && (
            <div className="mt-1">
              <span className="font-semibold text-[var(--text-muted)]">Meta: </span>
              <span className="text-[var(--text-secondary)]">
                {payload.metaDescription}
              </span>
            </div>
          )}
        </div>
      )}

      {fullDraft && (
        <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-[11.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
          {fullDraft}
        </div>
      )}

      {(sourcedFacts || aiSuggestions) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sourcedFacts && (
            <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/60 p-2 dark:border-emerald-800/50 dark:bg-emerald-950/25">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Sourced Facts
              </div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-emerald-900 dark:text-emerald-200">
                {sourcedFacts.slice(0, 4).map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {aiSuggestions && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-2 dark:border-amber-800/50 dark:bg-amber-950/25">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                AI Suggestions (Review)
              </div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-900 dark:text-amber-200">
                {aiSuggestions.slice(0, 4).map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {output.evidenceRefs.length > 0 && (
        <div className="text-[10.5px] text-[var(--text-muted)]">
          <span className="font-semibold">Evidence Refs: </span>
          <span className="font-mono">{output.evidenceRefs.slice(0, 3).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

export function AgentFactoryWorkflowPanel({
  projectId,
  overview,
  selectedWorkflowDetail,
  selectedWorkflowId,
  onSelectWorkflow,
  onRefreshOrchestration,
  onSelectAgent,
  onOpenAgentOutput,
}: AgentFactoryWorkflowPanelProps) {
  const user = useAuthStore((s) => s.user);
  const canApproveOfficial = user ? OFFICIAL_APPROVER_ROLES.has(user.role) : false;

  const pendingApprovals = overview?.pendingApprovals ?? [];
  const [activeTab, setActiveTab] = useState<OrchestrationTab>('workflows');

  // Launch form state
  const [templateId, setTemplateId] = useState<WorkflowTemplateId>('content_brief_to_draft');
  const [workflowName, setWorkflowName] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [requireStrategyApproval, setRequireStrategyApproval] = useState(true);
  const [requireDraftApproval, setRequireDraftApproval] = useState(true);
  const [includeGeo, setIncludeGeo] = useState(true);
  const [includeCompetitor, setIncludeCompetitor] = useState(true);

  // Custom DAG editor state (seeded with valid 2-node DAG)
  const [customNodes, setCustomNodes] = useState<DagWorkflowNodeInput[]>([
    { nodeKey: 'research', agentId: 'research_agent', title: 'Business Context & Sources' },
    { nodeKey: 'report', agentId: 'reporting_agent', title: 'Executive Evidence Digest' },
  ]);
  const [customEdges, setCustomEdges] = useState<DagWorkflowEdgeInput[]>([
    { fromNodeKey: 'research', toNodeKey: 'report' },
  ]);
  const [dagValidation, setDagValidation] = useState<DagValidationResult | null>(null);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Approval comments per approvalId
  const [commentByApprovalId, setCommentByApprovalId] = useState<Record<string, string>>({});

  // Agent config edits
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);

  // Preview blueprint layers for template selection
  const blueprintPreview = useMemo(() => {
    if (templateId === 'custom_dag') {
      return {
        name: workflowName.trim() || 'Custom Multi-Agent DAG',
        nodes: customNodes,
        edges: customEdges,
      };
    }
    return buildWorkflowBlueprint(templateId, {
      requireStrategyApproval,
      requireDraftApproval,
      includeGeo,
      includeCompetitor,
    });
  }, [
    templateId,
    workflowName,
    customNodes,
    customEdges,
    requireStrategyApproval,
    requireDraftApproval,
    includeGeo,
    includeCompetitor,
  ]);

  useEffect(() => {
    setDagValidation(null);
  }, [templateId, customNodes, customEdges, includeGeo, includeCompetitor]);

  const handleValidateDag = async () => {
    if (!projectId) return;
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await agentFactoryService.validateWorkflowDag(projectId, {
        templateId,
        nodes: blueprintPreview.nodes,
        edges: blueprintPreview.edges,
      });
      setDagValidation(res);
      if (res.valid) {
        setActionMessage(
          `DAG verified acyclic (${res.topologicalOrder.length} nodes across ${res.layers.length} execution stages).`,
        );
      } else {
        setActionError(res.errors.join(' '));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'DAG validation failed.');
    }
  };

  const handleCreateAndStart = async () => {
    if (!projectId) return;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const created = await agentFactoryService.createWorkflow(projectId, {
        templateId,
        name: workflowName.trim() || undefined,
        nodes: templateId === 'custom_dag' ? customNodes : undefined,
        edges: templateId === 'custom_dag' ? customEdges : undefined,
        config: targetKeyword.trim() ? { targetKeyword: targetKeyword.trim() } : {},
        blueprintOptions: {
          requireStrategyApproval,
          requireDraftApproval,
        },
        autoStart: true,
      });
      setActionMessage(`Started workflow "${created.workflow.name}".`);
      await onRefreshOrchestration(created.workflow.id);
      setActiveTab('workflows');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start workflow.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelWorkflow = async (wfId: string) => {
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await agentFactoryService.cancelWorkflow(projectId, wfId, 'Cancelled by operator');
      setActionMessage('Workflow cancelled cleanly.');
      await onRefreshOrchestration(wfId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel workflow.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartQueuedWorkflow = async (wfId: string) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await agentFactoryService.startWorkflow(projectId, wfId);
      setActionMessage('Workflow execution started.');
      await onRefreshOrchestration(wfId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to start workflow.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const updated = await agentFactoryService.retryTask(projectId, taskId);
      setActionMessage('Queued manual retry for failed task.');
      await onRefreshOrchestration(updated.workflow.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to retry task.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDecideApproval = async (
    approvalId: string,
    decision: 'approved' | 'rejected' | 'revision_requested',
  ) => {
    const comments = (commentByApprovalId[approvalId] ?? '').trim();
    if ((decision === 'rejected' || decision === 'revision_requested') && !comments) {
      setActionError('Please enter reviewer comments explaining a rejection or revision request.');
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await agentFactoryService.decideApproval(projectId, approvalId, {
        decision,
        comments,
      });
      setActionMessage(`Recorded ${decision.replace('_', ' ')} decision.`);
      await onRefreshOrchestration(res.workflow?.workflow?.id ?? res.approval.workflowId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit approval decision.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateConfig = async (
    cfg: AgentConfigRecord,
    patch: Partial<{ enabled: boolean; maxRetries: number; timeoutMs: number; preferredModel: string }>,
  ) => {
    setSavingConfigId(cfg.agentId);
    setActionError(null);
    try {
      await agentFactoryService.updateAgentConfig(projectId, cfg.agentId, {
        enabled: patch.enabled ?? cfg.enabled,
        maxRetries: patch.maxRetries ?? cfg.maxRetries,
        timeoutMs: patch.timeoutMs ?? cfg.timeoutMs,
        preferredModel: patch.preferredModel ?? cfg.preferredModel,
      });
      setActionMessage(`Updated runtime configuration for ${cfg.agentId}.`);
      await onRefreshOrchestration();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update agent configuration.');
    } finally {
      setSavingConfigId(null);
    }
  };

  const addCustomEdge = () => {
    if (customNodes.length < 2) return;
    setCustomEdges((prev) => [
      ...prev,
      { fromNodeKey: customNodes[0].nodeKey, toNodeKey: customNodes[1].nodeKey },
    ]);
  };

  const detail = selectedWorkflowDetail;
  const workflows = overview?.workflows ?? [];
  const telemetry = overview?.telemetrySummary;

  return (
    <GlassPanel
      as="section"
      ariaLabel="Multi-Agent Execution & Workflow Orchestration"
      className="p-4 space-y-4"
    >
      {/* Header + Sub-tabs */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Multi-Agent Orchestration Engine
            </h2>
            <StatusBadge label="DAG + Human Gates" tone="indigo" />
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Launch persistent multi-agent pipelines backed by verified project data, inspect structured handoffs, and decide gated approvals.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Orchestration Workspace Views"
          className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1 text-xs"
        >
          {(
            [
              { id: 'workflows', label: `Workflows (${workflows.length})` },
              { id: 'launch', label: 'Launch DAG' },
              {
                id: 'approvals',
                label: `Approvals (${pendingApprovals.length})`,
                highlight: pendingApprovals.length > 0,
              },
              { id: 'telemetry', label: 'Telemetry & Config' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{tab.label}</span>
              {'highlight' in tab && tab.highlight && (
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback banners */}
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/85 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}
      {actionMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300/70 bg-emerald-50/85 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* TAB 1: LAUNCH WORKFLOW & DAG VALIDATOR */}
      {activeTab === 'launch' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <label className="block space-y-1 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Orchestration Template
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as WorkflowTemplateId)}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              >
                {WORKFLOW_TEMPLATES.map((tpl) => (
                  <option key={tpl.templateId} value={tpl.templateId}>
                    {tpl.name}
                  </option>
                ))}
                <option value="custom_dag">Custom Multi-Agent DAG</option>
              </select>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Target Keyword (optional)
                </span>
                <input
                  type="text"
                  value={targetKeyword}
                  onChange={(e) => setTargetKeyword(e.target.value)}
                  placeholder="e.g., enterprise technical seo audit"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>

              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Workflow Title Override (optional)
                </span>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Uses template default title if blank"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
            </div>

            {templateId !== 'technical_performance_audit' && templateId !== 'custom_dag' && (
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs sm:grid-cols-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireStrategyApproval}
                    onChange={(e) => setRequireStrategyApproval(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#7047EB]"
                  />
                  <span className="text-[var(--text-secondary)]">
                    Require human gate on Content Brief
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireDraftApproval}
                    onChange={(e) => setRequireDraftApproval(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#7047EB]"
                  />
                  <span className="text-[var(--text-secondary)]">
                    Require human gate on AI Draft
                  </span>
                </label>
                {templateId === 'seo_content_pipeline' && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCompetitor}
                        onChange={(e) => setIncludeCompetitor(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#7047EB]"
                      />
                      <span className="text-[var(--text-secondary)]">
                        Include Competitor Agent
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeGeo}
                        onChange={(e) => setIncludeGeo(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#7047EB]"
                      />
                      <span className="text-[var(--text-secondary)]">
                        Include Geographic Agent
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* Custom DAG Editor */}
            {templateId === 'custom_dag' && (
              <div className="space-y-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">
                    Custom DAG Nodes &amp; Edges
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCustomNodes((prev) => [
                          ...prev,
                          {
                            nodeKey: `node_${prev.length + 1}`,
                            agentId: 'keyword_intelligence_agent',
                            title: `Custom Stage ${prev.length + 1}`,
                          },
                        ])
                      }
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold hover:border-[var(--accent-primary)] cursor-pointer"
                    >
                      + Node
                    </button>
                    <button
                      type="button"
                      onClick={addCustomEdge}
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold hover:border-[var(--accent-primary)] cursor-pointer"
                    >
                      + Edge
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {customNodes.map((n, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={n.nodeKey}
                        aria-label={`Custom node ${idx + 1} key`}
                        onChange={(e) =>
                          setCustomNodes((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, nodeKey: e.target.value } : item,
                            ),
                          )
                        }
                        className="col-span-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px]"
                      />
                      <select
                        value={n.agentId}
                        aria-label={`Custom node ${idx + 1} agent`}
                        onChange={(e) =>
                          setCustomNodes((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, agentId: e.target.value as AgentStationId }
                                : item,
                            ),
                          )
                        }
                        className="col-span-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px]"
                      >
                        {(
                          [
                            'research_agent',
                            'competitor_intelligence_agent',
                            'keyword_intelligence_agent',
                            'geographic_intelligence_agent',
                            'technical_seo_agent',
                            'performance_analysis_agent',
                            'content_strategy_agent',
                            'content_generation_agent',
                            'quality_assurance_agent',
                            'reporting_agent',
                          ] as AgentStationId[]
                        ).map((id) => (
                          <option key={id} value={id}>
                            {getAgentCatalogDefinition(id).shortName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={n.title}
                        aria-label={`Custom node ${idx + 1} title`}
                        onChange={(e) =>
                          setCustomNodes((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, title: e.target.value } : item,
                            ),
                          )
                        }
                        className="col-span-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px]"
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                    Dependency Edges (From -&gt; To)
                  </div>
                  {customEdges.map((edge, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={edge.fromNodeKey}
                        aria-label={`Edge ${idx + 1} source`}
                        onChange={(e) =>
                          setCustomEdges((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, fromNodeKey: e.target.value } : item,
                            ),
                          )
                        }
                        className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px]"
                      >
                        {customNodes.map((n) => (
                          <option key={n.nodeKey} value={n.nodeKey}>
                            {n.nodeKey}
                          </option>
                        ))}
                      </select>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                      <select
                        value={edge.toNodeKey}
                        aria-label={`Edge ${idx + 1} target`}
                        onChange={(e) =>
                          setCustomEdges((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, toNodeKey: e.target.value } : item,
                            ),
                          )
                        }
                        className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px]"
                      >
                        {customNodes.map((n) => (
                          <option key={n.nodeKey} value={n.nodeKey}>
                            {n.nodeKey}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomEdges((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded-lg px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <InteractiveButton
                variant="secondary"
                size="md"
                disabled={actionBusy}
                onClick={() => void handleValidateDag()}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Validate DAG</span>
              </InteractiveButton>
              <InteractiveButton
                variant="primary"
                size="md"
                disabled={actionBusy}
                onClick={() => void handleCreateAndStart()}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Create &amp; Start Workflow</span>
              </InteractiveButton>
            </div>
          </div>

          {/* Blueprint Stage Preview */}
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                DAG Execution Plan ({blueprintPreview.nodes.length} nodes)
              </span>
              {dagValidation && (
                <StatusBadge
                  label={dagValidation.valid ? 'Acyclic Verified' : 'Cycle / Error'}
                  tone={dagValidation.valid ? 'success' : 'danger'}
                />
              )}
            </div>
            <ol className="mt-3 space-y-2 text-xs">
              {blueprintPreview.nodes.map((node, i) => {
                const deps = blueprintPreview.edges
                  .filter((e) => e.toNodeKey === node.nodeKey)
                  .map((e) => e.fromNodeKey);
                return (
                  <li
                    key={node.nodeKey}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {i + 1}. {node.title}
                      </span>
                      {node.approvalRequired && (
                        <StatusBadge label="Human Gate" tone="warning" />
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                      {getAgentCatalogDefinition(node.agentId).shortName} ·{' '}
                      {deps.length > 0 ? `after ${deps.join(', ')}` : 'root stage'}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {/* TAB 2: WORKFLOWS & LIVE DAG TASK PIPELINE */}
      {activeTab === 'workflows' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Workflow list */}
          <div className="space-y-2 lg:col-span-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Persistent Workflows
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('launch')}
                className="text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
              >
                + New Pipeline
              </button>
            </div>
            {workflows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                No multi-agent workflows created yet. Launch a real pipeline from the Launch DAG tab.
              </div>
            ) : (
              <ul className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {workflows.map((wf) => {
                  const wfSpec = getStateVisualSpec(mapTaskStatusToVisual(wf.status));
                  const isSel = wf.id === (detail?.workflow.id ?? selectedWorkflowId);
                  return (
                    <li key={wf.id}>
                      <button
                        type="button"
                        onClick={() => onSelectWorkflow(wf.id)}
                        className={`w-full rounded-2xl border p-3 text-left text-xs transition-colors cursor-pointer ${
                          isSel
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)]/45'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-[var(--text-primary)]">
                            {wf.name}
                          </span>
                          <StatusBadge label={wfSpec.label} tone={wfSpec.badgeTone} />
                        </div>
                        <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                          {wf.currentStage}
                        </div>
                        <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                          <span>by {wf.createdBy}</span>
                          <span>{formatShortTime(wf.startedAt ?? wf.createdAt)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Selected workflow DAG tasks + handoffs + outputs */}
          <div className="space-y-3 lg:col-span-8">
            {!detail ? (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-6 text-xs text-[var(--text-muted)]">
                Select a workflow on the left or launch a new pipeline to inspect task dependencies, structured handoffs, and deliverables.
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                        {detail.workflow.name}
                      </h3>
                      <StatusBadge
                        label={getStateVisualSpec(mapTaskStatusToVisual(detail.workflow.status)).label}
                        tone={getStateVisualSpec(mapTaskStatusToVisual(detail.workflow.status)).badgeTone}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {detail.workflow.blockingReason || detail.workflow.objective}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {detail.workflow.status === 'queued' && (
                      <InteractiveButton
                        variant="primary"
                        size="sm"
                        disabled={actionBusy}
                        onClick={() => void handleStartQueuedWorkflow(detail.workflow.id)}
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Start</span>
                      </InteractiveButton>
                    )}
                    {(detail.workflow.status === 'running' ||
                      detail.workflow.status === 'queued' ||
                      detail.workflow.status === 'waiting_for_approval') && (
                      <InteractiveButton
                        variant="danger"
                        size="sm"
                        disabled={actionBusy}
                        onClick={() => void handleCancelWorkflow(detail.workflow.id)}
                      >
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Cancel Workflow</span>
                      </InteractiveButton>
                    )}
                  </div>
                </div>

                {/* Task Nodes */}
                <div className="space-y-2">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    DAG Task Graph ({detail.tasks.length} stages · {detail.handoffs.length} handoffs)
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[...detail.tasks]
                      .sort((a, b) => {
                        const idxA = detail.nodes.findIndex((n) => n.nodeKey === a.nodeKey);
                        const idxB = detail.nodes.findIndex((n) => n.nodeKey === b.nodeKey);
                        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                      })
                      .map((task, stageIdx) => {
                      const visual = mapTaskStatusToVisual(task.status);
                      const spec = getStateVisualSpec(visual);
                      const taskOut = task.outputId
                        ? detail.outputs.find((o) => o.id === task.outputId)
                        : null;
                      return (
                        <div
                          key={task.id}
                          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectAgent(task.agentId)}
                              className="text-left font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                            >
                              <span className="mr-1.5 font-mono text-[10.5px] text-[var(--text-muted)]">
                                {stageIdx + 1}.
                              </span>
                              {task.title}
                            </button>
                            <StatusBadge
                              label={task.status === 'blocked' ? 'Blocked' : spec.label}
                              tone={task.status === 'blocked' ? 'neutral' : spec.badgeTone}
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                            <span>{getAgentCatalogDefinition(task.agentId).shortName}</span>
                            <span>·</span>
                            <span>
                              Try {task.attemptCount}/{task.maxRetries + 1}
                            </span>
                            {task.durationMs !== null && (
                              <>
                                <span>·</span>
                                <span>{formatDuration(task.durationMs)}</span>
                              </>
                            )}
                          </div>
                          {task.errorSummary && (
                            <div className="mt-1.5 rounded-lg bg-rose-500/10 p-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                              {task.errorSummary}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(task.status === 'failed' || task.status === 'blocked') &&
                              detail.workflow.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleRetryTask(task.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
                                >
                                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                  <span>Retry Task</span>
                                </button>
                              )}
                            {taskOut && (
                              <button
                                type="button"
                                onClick={() => onOpenAgentOutput(task.agentId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
                              >
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                <span>Inspect Deliverable</span>
                              </button>
                            )}
                            {task.status === 'waiting_for_approval' && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('approvals')}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
                              >
                                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                                <span>Review Approval Gate</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Deliverable Preview */}
                {detail.outputs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Latest Structured Deliverable
                    </div>
                    <OutputPayloadPreview output={detail.outputs[0]} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HUMAN APPROVAL GATES */}
      {activeTab === 'approvals' && (
        <div className="space-y-3">
          {!canApproveOfficial && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                RBAC Policy: Current role <strong>{user?.role ?? 'Guest'}</strong> cannot approve or reject gated Content Strategy, Content Brief, AI Draft, or Publishing gates. Business Owner, Agency Owner, or Platform Admin role is required.
              </span>
            </div>
          )}

          {pendingApprovals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              No pending human approval gates across this project. Gated workflows automatically pause here for owner sign-off.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((appr) => {
                const matchedOutput =
                  detail?.outputs.find((o) => o.id === appr.outputId) ?? null;
                return (
                  <div
                    key={appr.id}
                    className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                            {appr.title}
                          </span>
                          <StatusBadge
                            label={getApprovalGateLabel(appr.gateType)}
                            tone="warning"
                          />
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {appr.summary}
                        </p>
                        <div className="mt-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                          Requested by {appr.requestedBy} · {formatShortTime(appr.createdAt)} · Ref {appr.versionRef}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWorkflow(appr.workflowId);
                          setActiveTab('workflows');
                        }}
                        className="text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        Inspect Workflow
                      </button>
                    </div>

                    {matchedOutput && <OutputPayloadPreview output={matchedOutput} />}

                    <div className="space-y-2">
                      <label className="block text-xs">
                        <span className="font-semibold text-[var(--text-secondary)]">
                          Reviewer Notes (required for Reject or Revision Request)
                        </span>
                        <textarea
                          rows={2}
                          value={commentByApprovalId[appr.id] ?? ''}
                          onChange={(e) =>
                            setCommentByApprovalId((prev) => ({
                              ...prev,
                              [appr.id]: e.target.value,
                            }))
                          }
                          placeholder="Add approval confirmation or revision instructions for the agent..."
                          className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <InteractiveButton
                          variant="primary"
                          size="sm"
                          disabled={actionBusy || !canApproveOfficial}
                          onClick={() => void handleDecideApproval(appr.id, 'approved')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Approve &amp; Continue</span>
                        </InteractiveButton>
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          disabled={actionBusy || !canApproveOfficial}
                          onClick={() =>
                            void handleDecideApproval(appr.id, 'revision_requested')
                          }
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Request Revision</span>
                        </InteractiveButton>
                        <InteractiveButton
                          variant="danger"
                          size="sm"
                          disabled={actionBusy || !canApproveOfficial}
                          onClick={() => void handleDecideApproval(appr.id, 'rejected')}
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reject Gate</span>
                        </InteractiveButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: METERED TELEMETRY & AGENT CONFIG */}
      {activeTab === 'telemetry' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Executions (OK / Fail)
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {telemetry
                  ? `${telemetry.completedExecutions} / ${telemetry.failedExecutions}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Avg Duration
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {formatDuration(telemetry?.avgExecutionDurationMs ?? null)}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Measured LLM Tokens
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {telemetry?.measuredTotalTokens !== null && telemetry?.measuredTotalTokens !== undefined
                  ? telemetry.measuredTotalTokens.toLocaleString()
                  : 'None reported'}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Active Workers
              </div>
              <div className="mt-1 font-display text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {telemetry
                  ? `${telemetry.activeWorkers} / ${telemetry.maxConcurrentWorkers}`
                  : '—'}
              </div>
            </div>
          </div>

          {telemetry && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
              <span>{telemetry.billingCostSummary}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Project Agent Runtime Policies</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border-hairline)]">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Specialist Agent</th>
                    <th className="px-3 py-2">Enabled</th>
                    <th className="px-3 py-2">Max Retries</th>
                    <th className="px-3 py-2">Timeout (s)</th>
                    <th className="px-3 py-2">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {(overview?.configs ?? []).map((cfg) => {
                    const def = getAgentCatalogDefinition(cfg.agentId);
                    const busy = savingConfigId === cfg.agentId;
                    return (
                      <tr key={cfg.agentId} className="bg-[var(--bg-surface)]">
                        <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">
                          <span className="inline-flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                            {def.shortName}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            disabled={busy}
                            aria-label={`Enable ${def.name}`}
                            onChange={(e) =>
                              void handleUpdateConfig(cfg, { enabled: e.target.checked })
                            }
                            className="h-3.5 w-3.5 accent-[#7047EB] cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={cfg.maxRetries}
                            disabled={busy}
                            aria-label={`Max retries for ${def.name}`}
                            onChange={(e) =>
                              void handleUpdateConfig(cfg, {
                                maxRetries: Number(e.target.value),
                              })
                            }
                            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs"
                          >
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-secondary)]">
                          {Math.round(cfg.timeoutMs / 1000)}s
                        </td>
                        <td className="px-3 py-2">
                          {cfg.agentId === 'content_generation_agent' ? (
                            <select
                              value={cfg.preferredModel}
                              disabled={busy}
                              aria-label="Preferred Gemini model"
                              onChange={(e) =>
                                void handleUpdateConfig(cfg, {
                                  preferredModel: e.target.value,
                                })
                              }
                              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 font-mono text-[11px]"
                            >
                              <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                            </select>
                          ) : (
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">
                              backend-service
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
