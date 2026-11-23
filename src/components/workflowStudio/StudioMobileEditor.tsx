import { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioLiveNodeStatus,
  StudioNodeSubtype,
  StudioValidationReport,
  StudioWorkflowTemplateRecord,
} from '../../types/workflowStudio';
import {
  STUDIO_NODE_CATALOG,
  getStudioNodeCatalogItem,
} from '../../lib/workflowStudioCatalog';

interface StudioMobileEditorProps {
  workflowName: string;
  nodes: StudioCanvasNode[];
  edges: StudioCanvasEdge[];
  templates: StudioWorkflowTemplateRecord[];
  validation: StudioValidationReport | null;
  liveStatusByNode: Record<string, StudioLiveNodeStatus>;
  canEdit: boolean;
  isExecuting: boolean;
  onChangeWorkflowName: (name: string) => void;
  onAddNode: (subtype: StudioNodeSubtype) => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onLoadTemplate: (template: StudioWorkflowTemplateRecord) => void;
  onValidate: () => void;
  onSave: () => void;
  onExecute: () => void;
}

export function StudioMobileEditor({
  workflowName,
  nodes,
  edges,
  templates,
  validation,
  liveStatusByNode,
  canEdit,
  isExecuting,
  onChangeWorkflowName,
  onAddNode,
  onDeleteNode,
  onSelectNode,
  onLoadTemplate,
  onValidate,
  onSave,
  onExecute,
}: StudioMobileEditorProps) {
  const [selectedSubtypeToAdd, setSelectedSubtypeToAdd] =
    useState<StudioNodeSubtype>('research_agent');

  return (
    <div className="space-y-4 lg:hidden">
      {/* Compact Header Card */}
      <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Workflow Name
        </label>
        <input
          type="text"
          disabled={!canEdit}
          value={workflowName}
          onChange={(e) => onChangeWorkflowName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
        />

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onValidate}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Validate</span>
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={onSave}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Save</span>
          </button>
          <button
            type="button"
            disabled={!canEdit || isExecuting || (validation ? !validation.valid : false)}
            onClick={onExecute}
            className="inline-flex items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--accent-on-pill)] disabled:opacity-45 cursor-pointer"
            style={{
              background:
                'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
            }}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Execute</span>
          </button>
        </div>

        {validation && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {validation.valid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            )}
            <span className="text-[var(--text-secondary)]">
              {validation.valid
                ? `Valid (${validation.warningCount} warning(s))`
                : `${validation.errorCount} blocking error(s) — fix before executing`}
            </span>
          </div>
        )}
      </div>

      {/* Quick Template Loader */}
      <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="text-xs font-semibold text-[var(--text-primary)]">
          Quick-Load Template
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {templates.slice(0, 5).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={!canEdit}
              onClick={() => onLoadTemplate(tpl)}
              className="shrink-0 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Add Step Control */}
      {canEdit && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
          <select
            aria-label="Choose workflow node to add"
            value={selectedSubtypeToAdd}
            onChange={(e) => setSelectedSubtypeToAdd(e.target.value as StudioNodeSubtype)}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs text-[var(--text-primary)]"
          >
            {STUDIO_NODE_CATALOG.map((item) => (
              <option key={item.subtype} value={item.subtype}>
                {item.category.toUpperCase()} — {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAddNode(selectedSubtypeToAdd)}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
      )}

      {/* Simplified Step Card List */}
      <div className="space-y-2.5">
        {nodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
            No workflow steps yet. Choose a template above or add a Trigger / Specialist node.
          </div>
        ) : (
          nodes.map((node, index) => {
            const meta = getStudioNodeCatalogItem(node.subtype);
            const live = liveStatusByNode[node.id] ?? 'idle';
            const outgoing = edges.filter((e) => e.source === node.id);
            return (
              <div key={node.id} className="space-y-1.5">
                <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: meta?.accentHex ?? '#6366F1' }}
                        />
                        <span className="truncate font-display text-sm font-semibold text-[var(--text-primary)]">
                          {index + 1}. {node.label}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {node.category} · Status: {live.replace(/_/g, ' ')}
                        {outgoing.length > 0 ? ` · ${outgoing.length} link(s)` : ''}
                      </div>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onDeleteNode(node.id)}
                        aria-label={`Remove ${node.label}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                {index < nodes.length - 1 && (
                  <div className="flex justify-center text-[var(--text-muted)]">
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
