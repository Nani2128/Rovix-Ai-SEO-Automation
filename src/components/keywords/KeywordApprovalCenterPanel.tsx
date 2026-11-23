import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  History,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type {
  KeywordBusinessProfile,
  KeywordIntelligenceRecord,
  KeywordWorkflowState,
  KeywordWorkspaceResponse,
} from '../../types/keywords';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge } from '../ui/StateViews';

const STAGES: { id: KeywordWorkflowState; label: string }[] = [
  { id: 'discovered', label: 'Discovered' },
  { id: 'enriched', label: 'Enriched' },
  { id: 'needs-data', label: 'Needs Data' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'approved', label: 'Approved' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'implemented', label: 'Implemented' },
  { id: 'measured', label: 'Measured' },
  { id: 'rejected', label: 'Rejected' },
];

export function KeywordApprovalCenterPanel({
  keywords,
  businessProfile,
  auditTrail,
  canApprove,
  onSelectKeyword,
  onTransitionState,
  onJumpToProfile,
}: {
  keywords: KeywordIntelligenceRecord[];
  businessProfile: KeywordBusinessProfile;
  auditTrail: KeywordWorkspaceResponse['recentAuditTrail'];
  canApprove: boolean;
  onSelectKeyword: (kw: KeywordIntelligenceRecord) => void;
  onTransitionState: (
    keywordId: string,
    payload: {
      nextState: KeywordWorkflowState;
      assignedTo?: string | null;
      notes?: string;
    },
  ) => Promise<void>;
  onJumpToProfile: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const profileApproved = businessProfile.approvalStatus === 'approved';

  const stageCounts = useMemo(() => {
    const map: Record<KeywordWorkflowState, number> = {
      discovered: 0,
      enriched: 0,
      'needs-data': 0,
      recommended: 0,
      rejected: 0,
      approved: 0,
      assigned: 0,
      implemented: 0,
      measured: 0,
    };
    for (const kw of keywords) {
      map[kw.workflowState] = (map[kw.workflowState] ?? 0) + 1;
    }
    return map;
  }, [keywords]);

  const queue = useMemo(
    () =>
      [...keywords]
        .filter((k) => k.workflowState !== 'rejected')
        .sort((a, b) => b.opportunityScore - a.opportunityScore),
    [keywords],
  );

  const handleAction = async (
    kw: KeywordIntelligenceRecord,
    nextState: KeywordWorkflowState,
  ) => {
    setBusyId(kw.id);
    try {
      await onTransitionState(kw.id, {
        nextState,
        assignedTo:
          nextState === 'assigned' ? kw.assignedTo || 'SEO Strategist' : kw.assignedTo,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 9-State Funnel Summary */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck
              className="h-4 w-4 text-[var(--accent-primary)]"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              9-State Keyword Governance Pipeline
            </h2>
          </div>
          {!profileApproved && (
            <button
              type="button"
              onClick={onJumpToProfile}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Owner Context Approval Required</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {STAGES.map((stage) => (
            <div
              key={stage.id}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-center"
            >
              <div className="font-mono text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {stageCounts[stage.id]}
              </div>
              <div className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--text-muted)]">
                {stage.label}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Review & Approval Queue */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Prioritized Keyword Approval Queue ({queue.length})
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            Sorted by Explainable Opportunity Score
          </span>
        </div>

        {queue.length === 0 ? (
          <EmptyStateCard
            title="Approval queue is empty"
            description="Run Keyword Discovery or add manual keyword targets to evaluate and approve candidates."
          />
        ) : (
          <div className="space-y-2.5">
            {queue.slice(0, 30).map((kw) => {
              const isBusy = busyId === kw.id;
              return (
                <div
                  key={kw.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectKeyword(kw)}
                        className="font-display text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer text-left"
                      >
                        {kw.keyword}
                      </button>
                      <StatusBadge label={kw.workflowState} tone="indigo" />
                      <span className="font-mono text-xs font-bold text-[var(--accent-primary)]">
                        {kw.opportunityScore}/100
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {kw.intent} ({kw.intentInferred ? 'Inferred' : 'Verified'}) ·{' '}
                      {kw.mapping?.targetUrl ?? kw.mapping?.recommendedSlug ?? 'Unmapped'}
                      {kw.assignedTo ? ` · Assigned: ${kw.assignedTo}` : ''}
                    </div>
                  </div>

                  {canApprove && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {kw.workflowState !== 'approved' &&
                        kw.workflowState !== 'assigned' &&
                        kw.workflowState !== 'implemented' &&
                        kw.workflowState !== 'measured' && (
                          <InteractiveButton
                            variant="primary"
                            size="sm"
                            loading={isBusy}
                            disabled={!profileApproved}
                            onClick={() => void handleAction(kw, 'approved')}
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            <span>Approve</span>
                          </InteractiveButton>
                        )}
                      {kw.workflowState === 'approved' && (
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          loading={isBusy}
                          disabled={!profileApproved}
                          onClick={() => void handleAction(kw, 'assigned')}
                        >
                          <UserCheck className="h-3 w-3" aria-hidden="true" />
                          <span>Assign</span>
                        </InteractiveButton>
                      )}
                      {kw.workflowState === 'assigned' && (
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          loading={isBusy}
                          disabled={!profileApproved}
                          onClick={() => void handleAction(kw, 'implemented')}
                        >
                          <span>Mark Implemented</span>
                        </InteractiveButton>
                      )}
                      {kw.workflowState === 'implemented' && (
                        <InteractiveButton
                          variant="primary"
                          size="sm"
                          loading={isBusy}
                          disabled={!profileApproved}
                          onClick={() => void handleAction(kw, 'measured')}
                        >
                          <span>Mark Measured</span>
                        </InteractiveButton>
                      )}
                      <InteractiveButton
                        variant="danger"
                        size="sm"
                        loading={isBusy}
                        onClick={() => void handleAction(kw, 'rejected')}
                      >
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                        <span>Reject</span>
                      </InteractiveButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* Audit Trail */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
          <History className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Keyword Governance Audit Trail ({auditTrail.length})
          </h3>
        </div>

        {auditTrail.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            No keyword governance approvals, assignments, or cluster edits have been recorded yet.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            {auditTrail.slice(0, 20).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {entry.actorName}{' '}
                    <span className="font-normal text-[var(--text-muted)]">
                      ({entry.actorRole})
                    </span>{' '}
                    · {entry.previousState} → {entry.newState}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-secondary)]">
                    {entry.reason}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10.5px] text-[var(--text-muted)]">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
