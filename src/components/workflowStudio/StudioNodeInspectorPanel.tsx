import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Copy,
  ExternalLink,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ApprovalGateType } from '../../types/agentFactory';
import type {
  RestrictedConditionField,
  RestrictedConditionOperator,
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioNodeConfig,
  StudioNodeExecutionDetail,
  StudioProviderAvailabilityMap,
  StudioValidationIssue,
} from '../../types/workflowStudio';
import {
  ALLOWED_CONDITION_FIELDS,
  ALLOWED_CONDITION_OPERATORS,
} from '../../lib/workflowStudioEngine';
import { getStudioNodeCatalogItem } from '../../lib/workflowStudioCatalog';
import { workflowStudioService } from '../../services/workflowStudioService';

interface StudioNodeInspectorPanelProps {
  projectId: string | null;
  selectedNode: StudioCanvasNode | null;
  allNodes: StudioCanvasNode[];
  allEdges: StudioCanvasEdge[];
  activeExecutionWorkflowId: string | null;
  providerAvailability: StudioProviderAvailabilityMap;
  validationIssues: StudioValidationIssue[];
  canEdit: boolean;
  onUpdateNode: (nodeId: string, patch: { label?: string; config?: Partial<StudioNodeConfig> }) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const APPROVAL_GATE_OPTIONS: Array<{ value: ApprovalGateType; label: string }> = [
  { value: 'content_brief', label: 'Content Brief Approval' },
  { value: 'content_strategy', label: 'Content Strategy Approval' },
  { value: 'generated_content', label: 'Generated Content Review' },
  { value: 'publishing_readiness', label: 'Publishing Readiness Sign-Off' },
];

export function StudioNodeInspectorPanel({
  projectId,
  selectedNode,
  allNodes,
  allEdges,
  activeExecutionWorkflowId,
  providerAvailability,
  validationIssues,
  canEdit,
  onUpdateNode,
  onDuplicateNode,
  onDeleteNode,
  onDeleteEdge,
}: StudioNodeInspectorPanelProps) {
  const [tab, setTab] = useState<'configure' | 'execution'>('configure');
  const [execDetail, setExecDetail] = useState<StudioNodeExecutionDetail | null>(null);
  const [execLoading, setExecLoading] = useState(false);

  const nodeIssues = selectedNode
    ? validationIssues.filter((i) => i.nodeId === selectedNode.id)
    : [];

  useEffect(() => {
    if (!projectId || !activeExecutionWorkflowId || !selectedNode || tab !== 'execution') {
      setExecDetail(null);
      return;
    }
    let cancelled = false;
    setExecLoading(true);
    workflowStudioService
      .getNodeExecutionDetail(projectId, activeExecutionWorkflowId, selectedNode.id)
      .then((res) => {
        if (!cancelled) setExecDetail(res);
      })
      .catch(() => {
        if (!cancelled) setExecDetail(null);
      })
      .finally(() => {
        if (!cancelled) setExecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, activeExecutionWorkflowId, selectedNode, tab]);

  if (!selectedNode) {
    return (
      <aside
        aria-label="Node Properties Inspector"
        className="flex h-full w-[312px] shrink-0 flex-col items-center justify-center border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 text-center"
      >
        <Settings2 className="h-7 w-7 text-[var(--text-muted)]" aria-hidden="true" />
        <h2 className="mt-3 font-display text-sm font-semibold text-[var(--text-primary)]">
          Node Inspector
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Select any node on the canvas to configure instructions, condition rules, data mappings, approval gates, or inspect live execution outputs.
        </p>
      </aside>
    );
  }

  const catalog = getStudioNodeCatalogItem(selectedNode.subtype);
  const providerInfo =
    selectedNode.category === 'agent'
      ? providerAvailability[selectedNode.subtype]
      : null;
  const connectedEdges = allEdges.filter(
    (e) => e.source === selectedNode.id || e.target === selectedNode.id,
  );
  const isMandatoryGovernanceGate =
    selectedNode.subtype === 'human_approval' ||
    selectedNode.subtype === 'business_owner_review';

  const patchConfig = (patch: Partial<StudioNodeConfig>) => {
    onUpdateNode(selectedNode.id, { config: patch });
  };

  return (
    <aside
      aria-label="Node Properties Inspector"
      className="flex h-full w-[312px] shrink-0 flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-surface)]"
    >
      {/* Inspector Header */}
      <div className="shrink-0 border-b border-[var(--border-hairline)] px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
              {selectedNode.label}
            </div>
            <div className="text-[10.5px] text-[var(--text-muted)]">
              {catalog?.label ?? selectedNode.subtype} · {selectedNode.id}
            </div>
          </div>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onDuplicateNode(selectedNode.id)}
                aria-label={`Duplicate ${selectedNode.label}`}
                title="Duplicate node"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteNode(selectedNode.id)}
                aria-label={`Delete ${selectedNode.label}`}
                title="Delete node"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Sub-Tabs */}
        <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-0.5">
          <button
            type="button"
            onClick={() => setTab('configure')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold cursor-pointer ${
              tab === 'configure'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Configure</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('execution')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold cursor-pointer ${
              tab === 'execution'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Execution</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3">
        {/* Validation Notices */}
        {nodeIssues.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5">
            {nodeIssues.map((issue) => (
              <div key={issue.id} className="flex items-start gap-2 text-[11px]">
                <AlertCircle
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    issue.severity === 'error'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text-primary)]">
                    {issue.message}
                  </div>
                  {issue.remediation && (
                    <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                      {issue.remediation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'configure' ? (
          <>
            {/* Label */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                Node Label
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={selectedNode.label}
                onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-60"
              />
            </div>

            {/* Provider Status (Real Backend Availability) */}
            {providerInfo && (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
                <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                  <span>Provider Status</span>
                  <span
                    className={
                      providerInfo.status === 'connected'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : providerInfo.status === 'partial'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {providerInfo.status}
                  </span>
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-[var(--text-muted)]">
                  {providerInfo.summary}
                </p>
              </div>
            )}

            {/* Agent Instructions */}
            {selectedNode.category === 'agent' && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                  Specialist Task Instructions
                </label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={selectedNode.config.instructions ?? ''}
                  onChange={(e) => patchConfig({ instructions: e.target.value })}
                  placeholder="Optional focus guidance for this specialist step..."
                  className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-60"
                />
              </div>
            )}

            {/* Trigger Configuration */}
            {selectedNode.category === 'trigger' && (
              <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                  Trigger Preconditions
                </div>
                {selectedNode.subtype === 'manual_trigger' && (
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    Starts immediately when an authorized operator clicks Execute. No external precondition gate required.
                  </p>
                )}
                {selectedNode.subtype === 'existing_event_trigger' && (
                  <div>
                    <label className="block text-[10.5px] text-[var(--text-muted)]">
                      Workspace Event Source
                    </label>
                    <select
                      disabled={!canEdit}
                      value={selectedNode.config.triggerEventSource ?? 'crawl_completed'}
                      onChange={(e) =>
                        patchConfig({
                          triggerEventSource: e.target
                            .value as StudioNodeConfig['triggerEventSource'],
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                    >
                      <option value="crawl_completed">Latest Technical Crawl</option>
                      <option value="performance_completed">Latest PageSpeed Audit</option>
                      <option value="keyword_discovery">Latest Keyword Discovery</option>
                      <option value="approved_profile_ready">Approved Business Profile</option>
                    </select>
                  </div>
                )}

                {selectedNode.subtype === 'approved_project_event' && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={Boolean(selectedNode.config.requireApprovedProfile)}
                        onChange={(e) =>
                          patchConfig({ requireApprovedProfile: e.target.checked })
                        }
                      />
                      <span>Require approved business profile</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={Boolean(selectedNode.config.requireApprovedMarkets)}
                        onChange={(e) =>
                          patchConfig({ requireApprovedMarkets: e.target.checked })
                        }
                      />
                      <span>Require approved target markets</span>
                    </label>
                  </div>
                )}

                {selectedNode.subtype === 'scheduled_trigger' && (
                  <div>
                    <label className="block text-[10.5px] text-[var(--text-muted)]">
                      Cadence Policy Label
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={selectedNode.config.scheduleCronHint ?? ''}
                      onChange={(e) => patchConfig({ scheduleCronHint: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                      Stored as cadence metadata; run manually via Execute (no background cron daemon active).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Restricted Condition Rule Builder (Zero JS Eval) */}
            {selectedNode.category === 'condition' && (
              <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                    Restricted Condition Rule
                  </span>
                  <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    Safe Schema
                  </span>
                </div>
                <div>
                  <label className="block text-[10.5px] text-[var(--text-muted)]">
                    Metric Field
                  </label>
                  <select
                    disabled={!canEdit}
                    value={selectedNode.config.conditionRule?.field ?? 'evidenceCount'}
                    onChange={(e) =>
                      patchConfig({
                        conditionRule: {
                          field: e.target.value as RestrictedConditionField,
                          operator: selectedNode.config.conditionRule?.operator ?? 'gte',
                          value: selectedNode.config.conditionRule?.value ?? 1,
                          sourceNodeId: selectedNode.config.conditionRule?.sourceNodeId ?? null,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  >
                    {ALLOWED_CONDITION_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] text-[var(--text-muted)]">
                      Operator
                    </label>
                    <select
                      disabled={!canEdit}
                      value={selectedNode.config.conditionRule?.operator ?? 'gte'}
                      onChange={(e) =>
                        patchConfig({
                          conditionRule: {
                            field: selectedNode.config.conditionRule?.field ?? 'evidenceCount',
                            operator: e.target.value as RestrictedConditionOperator,
                            value: selectedNode.config.conditionRule?.value ?? 1,
                            sourceNodeId: selectedNode.config.conditionRule?.sourceNodeId ?? null,
                          },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                    >
                      {ALLOWED_CONDITION_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10.5px] text-[var(--text-muted)]">
                      Compare Value
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={String(selectedNode.config.conditionRule?.value ?? '')}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        const parsed =
                          raw === 'true'
                            ? true
                            : raw === 'false'
                              ? false
                              : raw !== '' && Number.isFinite(num)
                                ? num
                                : raw;
                        patchConfig({
                          conditionRule: {
                            field: selectedNode.config.conditionRule?.field ?? 'evidenceCount',
                            operator: selectedNode.config.conditionRule?.operator ?? 'gte',
                            value: parsed,
                            sourceNodeId: selectedNode.config.conditionRule?.sourceNodeId ?? null,
                          },
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] text-[var(--text-muted)]">
                    Upstream Source Filter
                  </label>
                  <select
                    disabled={!canEdit}
                    value={selectedNode.config.conditionRule?.sourceNodeId ?? ''}
                    onChange={(e) =>
                      patchConfig({
                        conditionRule: {
                          field: selectedNode.config.conditionRule?.field ?? 'evidenceCount',
                          operator: selectedNode.config.conditionRule?.operator ?? 'gte',
                          value: selectedNode.config.conditionRule?.value ?? 1,
                          sourceNodeId: e.target.value || null,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">Any upstream output</option>
                    {allNodes
                      .filter((n) => n.id !== selectedNode.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Data Transformation Config */}
            {selectedNode.category === 'data' && (
              <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                  Data Transformation Settings
                </div>

                {selectedNode.subtype === 'structured_data_mapping' && (
                  <div className="space-y-2">
                    {(selectedNode.config.fieldMappings ?? []).map((m, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          disabled={!canEdit}
                          placeholder="sourcePath"
                          value={m.sourcePath}
                          onChange={(e) => {
                            const next = [...(selectedNode.config.fieldMappings ?? [])];
                            next[idx] = { ...m, sourcePath: e.target.value };
                            patchConfig({ fieldMappings: next });
                          }}
                          className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px]"
                        />
                        <input
                          type="text"
                          disabled={!canEdit}
                          placeholder="targetField"
                          value={m.targetField}
                          onChange={(e) => {
                            const next = [...(selectedNode.config.fieldMappings ?? [])];
                            next[idx] = { ...m, targetField: e.target.value };
                            patchConfig({ fieldMappings: next });
                          }}
                          className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px]"
                        />
                      </div>
                    ))}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          patchConfig({
                            fieldMappings: [
                              ...(selectedNode.config.fieldMappings ?? []),
                              { sourcePath: 'summary', targetField: 'briefSummary' },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-primary)] cursor-pointer"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Add Mapping</span>
                      </button>
                    )}
                  </div>
                )}

                {selectedNode.subtype === 'output_transformation' && (
                  <select
                    disabled={!canEdit}
                    value={selectedNode.config.transformMode ?? 'consolidate_evidence'}
                    onChange={(e) =>
                      patchConfig({
                        transformMode: e.target.value as StudioNodeConfig['transformMode'],
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs"
                  >
                    <option value="consolidate_evidence">Consolidate Evidence</option>
                    <option value="normalize_brief">Normalize Content Brief</option>
                    <option value="extract_priority_issues">Extract Priority Issues</option>
                    <option value="deduplicate_keywords">Deduplicate Keywords</option>
                  </select>
                )}

                {selectedNode.subtype === 'merge_results' && (
                  <select
                    disabled={!canEdit}
                    value={selectedNode.config.mergeStrategy ?? 'union_evidence'}
                    onChange={(e) =>
                      patchConfig({
                        mergeStrategy: e.target.value as StudioNodeConfig['mergeStrategy'],
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs"
                  >
                    <option value="union_evidence">Union All Evidence</option>
                    <option value="combine_payloads">Combine Payloads</option>
                    <option value="intersect_keywords">Intersect Keywords</option>
                  </select>
                )}

                {selectedNode.subtype === 'evidence_validation' && (
                  <div>
                    <label className="block text-[10.5px] text-[var(--text-muted)]">
                      Minimum Required Evidence Refs
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      disabled={!canEdit}
                      value={selectedNode.config.requireMinEvidenceRefs ?? 1}
                      onChange={(e) =>
                        patchConfig({ requireMinEvidenceRefs: Math.max(0, Number(e.target.value)) })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs tabular-nums"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Governance & Approval Gate Controls */}
            {(selectedNode.category === 'governance' || selectedNode.category === 'agent') && (
              <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Governance & Approval Gate</span>
                </div>

                {selectedNode.subtype === 'conflict_resolution' ? (
                  <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={Boolean(selectedNode.config.blockOnOpenConflicts)}
                      onChange={(e) =>
                        patchConfig({ blockOnOpenConflicts: e.target.checked })
                      }
                    />
                    <span>Halt pipeline when open conflicts exist</span>
                  </label>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        disabled={!canEdit || isMandatoryGovernanceGate}
                        checked={
                          isMandatoryGovernanceGate
                            ? true
                            : Boolean(selectedNode.config.approvalRequired)
                        }
                        onChange={(e) =>
                          patchConfig({
                            approvalRequired: e.target.checked,
                            approvalGateType: e.target.checked
                              ? selectedNode.config.approvalGateType ?? 'content_brief'
                              : null,
                          })
                        }
                      />
                      <span>
                        Require human approval before continuing
                        {isMandatoryGovernanceGate ? ' (Mandatory)' : ''}
                      </span>
                    </label>

                    {(isMandatoryGovernanceGate || selectedNode.config.approvalRequired) && (
                      <div>
                        <label className="block text-[10.5px] text-[var(--text-muted)]">
                          Approval Gate Type
                        </label>
                        <select
                          disabled={!canEdit}
                          value={selectedNode.config.approvalGateType ?? 'content_brief'}
                          onChange={(e) =>
                            patchConfig({
                              approvalGateType: e.target.value as ApprovalGateType,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                        >
                          {APPROVAL_GATE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Reliability Controls (Retries & Timeout) */}
            <div className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                Error Handling & Limits
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10.5px] text-[var(--text-muted)]">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    disabled={!canEdit}
                    value={selectedNode.config.maxRetries ?? 1}
                    onChange={(e) =>
                      patchConfig({
                        maxRetries: Math.max(0, Math.min(5, Number(e.target.value))),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] text-[var(--text-muted)]">
                    Timeout (sec)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    disabled={!canEdit}
                    value={Math.round((selectedNode.config.timeoutMs ?? 60_000) / 1000)}
                    onChange={(e) =>
                      patchConfig({
                        timeoutMs:
                          Math.max(5, Math.min(300, Number(e.target.value))) * 1000,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
              {selectedNode.category === 'agent' && (
                <label className="flex items-center gap-2 pt-1 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(selectedNode.config.skipIfUnavailable)}
                    onChange={(e) => patchConfig({ skipIfUnavailable: e.target.checked })}
                  />
                  <span>Skip gracefully if provider unavailable</span>
                </label>
              )}
            </div>

            {/* Output Schema & Connections */}
            {catalog && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Output Contract Fields
                </div>
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--text-secondary)]">
                  {catalog.outputSchema.join(' · ')}
                </div>
              </div>
            )}

            {connectedEdges.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Connections ({connectedEdges.length})
                </div>
                <div className="space-y-1">
                  {connectedEdges.map((edge) => {
                    const isOutgoing = edge.source === selectedNode.id;
                    const peerId = isOutgoing ? edge.target : edge.source;
                    const peer = allNodes.find((n) => n.id === peerId);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="min-w-0 truncate text-[var(--text-secondary)]">
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">
                            {isOutgoing ? 'OUT' : 'IN'} · {edge.edgeType}
                          </span>{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {peer?.label ?? peerId}
                          </span>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onDeleteEdge(edge.id)}
                            aria-label={`Remove connection ${edge.id}`}
                            className="text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Live Execution Inspection Tab */
          <div className="space-y-3">
            {!activeExecutionWorkflowId ? (
              <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-4 text-center text-xs text-[var(--text-muted)]">
                Execute this workflow to inspect real backend inputs, outputs, evidence references, and telemetry for this node.
              </div>
            ) : execLoading ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                Loading persisted node execution data...
              </div>
            ) : !execDetail ? (
              <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-4 text-center text-xs text-[var(--text-muted)]">
                This node was not part of the active execution snapshot.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Status</div>
                    <div className="font-semibold capitalize text-[var(--text-primary)]">
                      {execDetail.taskStatus.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Duration</div>
                    <div className="font-mono tabular-nums text-[var(--text-primary)]">
                      {execDetail.durationMs !== null ? `${execDetail.durationMs}ms` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Attempts</div>
                    <div className="font-mono tabular-nums text-[var(--text-primary)]">
                      {execDetail.attemptCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Branch</div>
                    <div className="font-mono uppercase text-[var(--text-primary)]">
                      {execDetail.selectedBranch ?? '—'}
                    </div>
                  </div>
                </div>

                {execDetail.errorSummary && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-700 dark:text-rose-300">
                    {execDetail.errorSummary}
                  </div>
                )}

                {execDetail.blockingReason && !execDetail.errorSummary && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
                    {execDetail.blockingReason}
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Upstream Inputs ({execDetail.inputs.length})
                  </div>
                  {execDetail.inputs.length === 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Root node or no upstream output consumed.
                    </p>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      {execDetail.inputs.map((inp) => (
                        <div
                          key={inp.outputId}
                          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2 text-[11px]"
                        >
                          <div className="font-mono text-[10px] text-[var(--text-muted)]">
                            {inp.fromNodeId} · {inp.outputId}
                          </div>
                          <div className="mt-0.5 text-[var(--text-primary)]">{inp.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Persisted Output
                  </div>
                  {execDetail.output ? (
                    <div className="mt-1 space-y-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
                      <div className="font-medium text-[var(--text-primary)]">
                        {execDetail.output.summary}
                      </div>
                      {execDetail.output.evidenceRefs.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                            Evidence References ({execDetail.output.evidenceRefs.length})
                          </div>
                          {execDetail.output.evidenceRefs.slice(0, 6).map((ref) => (
                            <div
                              key={ref}
                              className="flex items-center gap-1 truncate font-mono text-[10px] text-[var(--text-secondary)]"
                            >
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{ref}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      No output recorded yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
