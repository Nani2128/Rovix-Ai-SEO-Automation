import { Check, History, ShieldCheck, X } from 'lucide-react';
import type {
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import {
  ENTITY_KIND_LABELS,
  approvalLabel,
  approvalToneClass,
  formatShortDate,
} from './strategyUiHelpers';

interface StrategyApprovalsHistorySectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onSelectVersion: (versionId: string) => void;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
}

export function StrategyApprovalsHistorySection({
  workspace,
  busyAction,
  onSelectVersion,
  onDecideApproval,
}: StrategyApprovalsHistorySectionProps) {
  return (
    <div className="space-y-4">
      {/* Version History */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
          <div className="flex items-center gap-2">
            <History
              className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Strategy Version History
              </h2>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                Every generated SEO strategy is immutably versioned. Switch between versions to compare architecture and roadmap plans.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {workspace.versions.length} version
            {workspace.versions.length === 1 ? '' : 's'}
          </span>
        </div>

        {workspace.versions.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            No strategy versions generated yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-hairline)]">
            {workspace.versions.map((ver) => {
              const isActive = workspace.activeVersion?.id === ver.id;
              return (
                <div
                  key={ver.id}
                  className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono font-bold text-[var(--text-primary)]">
                        v{ver.versionNumber}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {ver.title}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span
                        className={`font-semibold ${approvalToneClass(ver.approvalStatus)}`}
                      >
                        {approvalLabel(ver.approvalStatus)}
                      </span>
                      {isActive && (
                        <>
                          <span className="text-[var(--text-muted)]">·</span>
                          <span className="font-semibold text-[#7047EB] dark:text-[#22D3EE]">
                            Viewing Now
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      Created by {ver.createdBy} on{' '}
                      {formatShortDate(ver.createdAt)} · Readiness:{' '}
                      {ver.evidenceReadiness.overallReadiness}
                      {ver.approvedBy
                        ? ` · Reviewed by ${ver.approvedBy}`
                        : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => onSelectVersion(ver.id)}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Load v{ver.versionNumber}
                      </button>
                    )}
                    {workspace.canApproveStrategy && (
                      <>
                        <button
                          type="button"
                          disabled={
                            busyAction !== null ||
                            ver.approvalStatus === 'approved'
                          }
                          onClick={() =>
                            void onDecideApproval(
                              'strategy_version',
                              ver.id,
                              'approved',
                              `Approved strategy version v${ver.versionNumber}.`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={
                            busyAction !== null ||
                            ver.approvalStatus === 'rejected'
                          }
                          onClick={() =>
                            void onDecideApproval(
                              'strategy_version',
                              ver.id,
                              'rejected',
                              `Rejected strategy version v${ver.versionNumber}.`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Immutable Governance & Approval Audit Log */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
              aria-hidden="true"
            />
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Approval &amp; Governance Audit Log
              </h3>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                Timestamped human approvals and rejections recorded across strategy versions, objectives, pages, keyword mappings, internal links, topical clusters, and roadmap tasks.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {workspace.approvals.length} event
            {workspace.approvals.length === 1 ? '' : 's'}
          </span>
        </div>

        {workspace.approvals.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            No approval decisions have been recorded for this project yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  <th className="py-2 pr-3">Timestamp</th>
                  <th className="py-2 pr-3">Entity</th>
                  <th className="py-2 pr-3">Decision</th>
                  <th className="py-2 pr-3">Reviewer</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {workspace.approvals.map((rec) => (
                  <tr key={rec.id} className="align-top">
                    <td className="py-2 pr-3 font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      {formatShortDate(rec.timestamp)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {rec.entityLabel}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        {ENTITY_KIND_LABELS[rec.entityKind]}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {rec.previousStatus.replace(/_/g, ' ')} →{' '}
                      </span>
                      <span
                        className={`font-semibold ${approvalToneClass(rec.newStatus)}`}
                      >
                        {approvalLabel(rec.newStatus)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="font-medium text-[var(--text-primary)]">
                        {rec.actorName}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        {rec.actorRole}
                      </div>
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">
                      {rec.comment || '—'}
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
