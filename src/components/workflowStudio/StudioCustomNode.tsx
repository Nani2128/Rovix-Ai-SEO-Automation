import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  Loader2,
  PlayCircle,
  ShieldCheck,
  SkipForward,
  XCircle,
} from 'lucide-react';
import type { AgentAvailabilityStatus } from '../../types/agentFactory';
import type {
  StudioCanvasNode,
  StudioLiveNodeStatus,
  StudioNodeCategory,
  StudioValidationIssue,
} from '../../types/workflowStudio';
import { getStudioNodeCatalogItem } from '../../lib/workflowStudioCatalog';

export interface StudioFlowNodeData extends Record<string, unknown> {
  studioNode: StudioCanvasNode;
  liveStatus: StudioLiveNodeStatus;
  liveDurationMs: number | null;
  liveSummary: string | null;
  selectedBranch: 'true' | 'false' | null;
  providerStatus: AgentAvailabilityStatus | null;
  providerSummary: string | null;
  validationIssues: StudioValidationIssue[];
  onContextMenuRequest?: (nodeId: string, clientX: number, clientY: number) => void;
}

function getCategoryIcon(category: StudioNodeCategory) {
  switch (category) {
    case 'trigger':
      return PlayCircle;
    case 'condition':
      return GitBranch;
    case 'data':
      return Database;
    case 'governance':
      return ShieldCheck;
    case 'agent':
    default:
      return Bot;
  }
}

function getCategoryLabel(category: StudioNodeCategory): string {
  switch (category) {
    case 'trigger':
      return 'Trigger';
    case 'condition':
      return 'Condition';
    case 'data':
      return 'Data';
    case 'governance':
      return 'Governance';
    case 'agent':
    default:
      return 'Agent';
  }
}

function getStatusPresentation(status: StudioLiveNodeStatus): {
  label: string;
  colorClass: string;
  ringColor: string;
} {
  switch (status) {
    case 'running':
      return {
        label: 'Running',
        colorClass: 'text-sky-600 dark:text-sky-400',
        ringColor: '#0EA5E9',
      };
    case 'completed':
      return {
        label: 'Completed',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        ringColor: '#10B981',
      };
    case 'failed':
      return {
        label: 'Failed',
        colorClass: 'text-rose-600 dark:text-rose-400',
        ringColor: '#EF4444',
      };
    case 'waiting_for_approval':
      return {
        label: 'Awaiting Approval',
        colorClass: 'text-amber-600 dark:text-amber-400',
        ringColor: '#F59E0B',
      };
    case 'retrying':
      return {
        label: 'Retrying',
        colorClass: 'text-amber-600 dark:text-amber-400',
        ringColor: '#F59E0B',
      };
    case 'queued':
      return {
        label: 'Queued',
        colorClass: 'text-[var(--text-muted)]',
        ringColor: 'var(--border-hairline)',
      };
    case 'skipped':
      return {
        label: 'Skipped',
        colorClass: 'text-[var(--text-muted)]',
        ringColor: 'var(--border-hairline)',
      };
    case 'blocked':
      return {
        label: 'Blocked',
        colorClass: 'text-rose-500',
        ringColor: '#F43F5E',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        colorClass: 'text-[var(--text-muted)]',
        ringColor: 'var(--border-hairline)',
      };
    case 'idle':
    default:
      return {
        label: 'Ready',
        colorClass: 'text-[var(--text-muted)]',
        ringColor: 'var(--border-hairline)',
      };
  }
}

function StudioCustomNodeInner({ data, selected }: NodeProps) {
  const nodeData = data as unknown as StudioFlowNodeData;
  const { studioNode, liveStatus, liveDurationMs, validationIssues, providerStatus } = nodeData;
  const catalog = getStudioNodeCatalogItem(studioNode.subtype);
  const Icon = getCategoryIcon(studioNode.category);
  const statusInfo = getStatusPresentation(liveStatus);
  const errorCount = validationIssues.filter((i) => i.severity === 'error').length;
  const warningCount = validationIssues.filter((i) => i.severity === 'warning').length;

  const sourceHandles = catalog?.sourceHandles ?? [
    { id: 'default' as const, label: 'Next', edgeType: 'dependency' as const },
  ];

  const isSkipped = liveStatus === 'skipped';
  const borderColor =
    errorCount > 0
      ? '#EF4444'
      : selected
        ? 'var(--accent-primary)'
        : liveStatus === 'running' ||
            liveStatus === 'completed' ||
            liveStatus === 'failed' ||
            liveStatus === 'waiting_for_approval'
          ? statusInfo.ringColor
          : 'var(--border-hairline)';

  return (
    <div
      data-testid={`studio-node-${studioNode.id}`}
      data-node-status={liveStatus}
      onContextMenu={(e) => {
        e.preventDefault();
        nodeData.onContextMenuRequest?.(studioNode.id, e.clientX, e.clientY);
      }}
      className={`group relative w-[238px] rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] transition-shadow ${
        isSkipped ? 'opacity-60' : ''
      } ${selected ? 'shadow-[0_12px_28px_-10px_rgba(112,71,235,0.35)]' : 'shadow-sm hover:shadow-md'}`}
      style={{
        border: `1.5px solid ${borderColor}`,
      }}
    >
      {/* Incoming Target Handle */}
      {catalog?.acceptsIncomingConnections !== false && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-[var(--bg-surface)] !bg-[var(--text-muted)] hover:!bg-[var(--accent-primary)]"
          style={{ left: -6 }}
        />
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `${catalog?.accentHex ?? '#6366F1'}1A`,
              color: catalog?.accentHex ?? '#6366F1',
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-[12.5px] font-semibold leading-tight text-[var(--text-primary)]">
              {studioNode.label}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
              <span>{getCategoryLabel(studioNode.category)}</span>
              {studioNode.config?.approvalRequired && (
                <>
                  <span>·</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Approval Gate
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Validation Error / Warning Indicator */}
        {errorCount > 0 ? (
          <span
            title={validationIssues.find((i) => i.severity === 'error')?.message}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400"
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : warningCount > 0 ? (
          <span
            title={validationIssues.find((i) => i.severity === 'warning')?.message}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      {/* Body Summary */}
      <div className="space-y-1.5 px-3 py-2">
        {/* Rule / Sub-summary */}
        {studioNode.category === 'condition' && studioNode.config?.conditionRule ? (
          <div className="truncate rounded-md bg-[var(--bg-subtle)] px-2 py-1 font-mono text-[10.5px] text-[var(--text-secondary)]">
            {studioNode.config.conditionRule.field} {studioNode.config.conditionRule.operator}{' '}
            {String(studioNode.config.conditionRule.value ?? '')}
          </div>
        ) : (
          <div className="line-clamp-2 text-[11px] leading-snug text-[var(--text-secondary)]">
            {nodeData.liveSummary ||
              studioNode.config?.instructions ||
              catalog?.description ||
              'Configured workflow node'}
          </div>
        )}

        {/* Footer Telemetry Row */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-[10.5px]">
          <div className={`flex items-center gap-1 font-medium ${statusInfo.colorClass}`}>
            {liveStatus === 'running' && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            {liveStatus === 'completed' && (
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            )}
            {liveStatus === 'failed' && (
              <XCircle className="h-3 w-3" aria-hidden="true" />
            )}
            {liveStatus === 'waiting_for_approval' && (
              <Clock className="h-3 w-3" aria-hidden="true" />
            )}
            {liveStatus === 'skipped' && (
              <SkipForward className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{statusInfo.label}</span>
            {nodeData.selectedBranch && (
              <span className="font-mono uppercase text-[10px]">
                · {nodeData.selectedBranch}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums text-[10px] text-[var(--text-muted)]">
            {liveDurationMs !== null ? (
              <span>
                {liveDurationMs < 1000
                  ? `${liveDurationMs}ms`
                  : `${(liveDurationMs / 1000).toFixed(1)}s`}
              </span>
            ) : providerStatus === 'unavailable' ? (
              <span className="text-amber-600 dark:text-amber-400">Provider N/A</span>
            ) : (
              <span>{catalog?.shortLabel ?? studioNode.subtype}</span>
            )}
          </div>
        </div>
      </div>

      {/* Outgoing Source Handles */}
      {sourceHandles.map((handle, index) => {
        const topPct =
          sourceHandles.length === 1
            ? 50
            : Math.round(((index + 1) / (sourceHandles.length + 1)) * 100);
        const handleColor =
          handle.id === 'true' || handle.id === 'approved'
            ? '#10B981'
            : handle.id === 'false' || handle.id === 'error'
              ? '#EF4444'
              : catalog?.accentHex ?? '#7047EB';
        return (
          <div key={handle.id}>
            <Handle
              id={handle.id}
              type="source"
              position={Position.Right}
              title={handle.label}
              className="!h-3 !w-3 !border-2 !border-[var(--bg-surface)]"
              style={{
                top: `${topPct}%`,
                right: -6,
                backgroundColor: handleColor,
              }}
            />
            {sourceHandles.length > 1 && (
              <span
                className="pointer-events-none absolute right-2 -translate-y-1/2 font-mono text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                style={{ top: `${topPct}%` }}
              >
                {handle.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const StudioCustomNode = memo(StudioCustomNodeInner);
