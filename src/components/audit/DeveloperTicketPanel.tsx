import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, ClipboardCheck, Lock, Plus, ShieldCheck } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { UserRole } from '../../types/auth';
import type { DeveloperTaskStatus, DeveloperTicket } from '../../types/technicalIssue';
import { SuccessTransition } from '../animation/MotionPrimitives';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

const TASK_TRANSITIONS: DeveloperTaskStatus[] = [
  'Triaged',
  'Awaiting approval',
  'Approved',
  'In progress',
  'Blocked',
  'Awaiting verification',
  'Archived',
];

export function DeveloperTicketPanel({
  tickets,
  userRole,
  busy,
  onCreateTicket,
  onTicketAction,
}: {
  tickets: DeveloperTicket[];
  userRole: UserRole;
  busy: boolean;
  onCreateTicket: (payload: { title?: string; assignedUser?: string }) => Promise<void>;
  onTicketAction: (
    ticketId: string,
    payload: {
      action?: 'developer_approve' | 'lead_approve' | 'reject' | 'update_status';
      taskStatus?: DeveloperTaskStatus;
    },
  ) => Promise<void>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [customTitle, setCustomTitle] = useState('');
  const [assignee, setAssignee] = useState('');

  const canCreate = [
    'Platform Admin',
    'Agency Owner',
    'SEO Strategist',
    'Project Manager',
    'Developer',
    'QA',
  ].includes(userRole);
  const canDevApprove = userRole === 'Developer' || userRole === 'Platform Admin';
  const canLeadApprove = [
    'Platform Admin',
    'Agency Owner',
    'Project Manager',
    'SEO Strategist',
  ].includes(userRole);

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Developer Ticket &amp; Dual-Approval Workflow
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Completing implementation marks a ticket Awaiting verification — only
            evidence-based reverification can mark it Verified.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF]"
            aria-hidden="true"
          />
          <span>Active Role: {userRole}</span>
        </div>
      </div>

      {canCreate && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <label
              htmlFor="ticket-title-input"
              className="block text-[11px] font-semibold text-[var(--text-secondary)]"
            >
              Ticket Title (optional override)
            </label>
            <input
              id="ticket-title-input"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Auto-filled from issue root cause if blank"
              className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none transition-colors"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="ticket-assignee-input"
              className="block text-[11px] font-semibold text-[var(--text-secondary)]"
            >
              Assigned Engineer (optional)
            </label>
            <input
              id="ticket-assignee-input"
              type="text"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Engineer name or handle"
              className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none transition-colors"
            />
          </div>
          <div className="flex items-end sm:col-span-3">
            <InteractiveButton
              variant="primary"
              size="md"
              disabled={busy}
              loading={busy}
              onClick={() => {
                void onCreateTicket({
                  title: customTitle.trim() || undefined,
                  assignedUser: assignee.trim() || undefined,
                }).then(() => {
                  setCustomTitle('');
                  setAssignee('');
                });
              }}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Developer Task</span>
            </InteractiveButton>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {tickets.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-muted)]">
            No developer tickets created for this issue yet.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {tickets.map((tkt) => (
              <motion.div
                key={tkt.id}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: MOTION_EASE }}
                className={`rounded-xl border p-4 transition-colors ${
                  tkt.verificationStatus === 'Verified'
                    ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/25 dark:bg-emerald-950/25'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]'
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tkt.verificationStatus === 'Verified' && (
                        <SuccessTransition size={18} />
                      )}
                      <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)]">
                        {tkt.id}
                      </span>
                      <StatusBadge
                        label={tkt.taskStatus}
                        tone={
                          tkt.taskStatus === 'Verified'
                            ? 'success'
                            : tkt.taskStatus === 'Rejected'
                              ? 'danger'
                              : tkt.taskStatus === 'Awaiting verification' ||
                                  tkt.taskStatus === 'In progress'
                                ? 'indigo'
                                : 'warning'
                        }
                      />
                      <StatusBadge
                        label={`Approval: ${tkt.approvalStatus}`}
                        tone={
                          tkt.approvalStatus === 'Dual Approved' ||
                          tkt.approvalStatus === 'Not Required'
                            ? 'success'
                            : 'neutral'
                        }
                      />
                      <StatusBadge
                        label={`Verification: ${tkt.verificationStatus}`}
                        tone={
                          tkt.verificationStatus === 'Verified'
                            ? 'success'
                            : tkt.verificationStatus === 'Failed'
                              ? 'danger'
                              : 'neutral'
                        }
                      />
                    </div>
                    <h3 className="mt-2 font-display text-sm font-bold text-[var(--text-primary)]">
                      {tkt.title}
                    </h3>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Assigned: {tkt.assignedUser ?? 'Unassigned'} · Developer
                      Sign-off: {tkt.developerApprovedBy ?? 'Pending'} · Lead
                      Sign-off: {tkt.leadApprovedBy ?? 'Pending'}
                    </div>
                  </div>
                </div>

                {tkt.taskStatus !== 'Verified' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
                    {tkt.requiresDualApproval && (
                      <>
                        <InteractiveButton
                          variant="secondary"
                          size="sm"
                          disabled={
                            busy || !canDevApprove || Boolean(tkt.developerApprovedBy)
                          }
                          title={
                            canDevApprove
                              ? 'Approve technical implementation as Developer'
                              : 'Requires Developer or Platform Admin role'
                          }
                          onClick={() =>
                            void onTicketAction(tkt.id, {
                              action: 'developer_approve',
                            })
                          }
                        >
                          {canDevApprove ? (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>
                            {tkt.developerApprovedBy
                              ? 'Developer Approved'
                              : 'Developer Approve'}
                          </span>
                        </InteractiveButton>

                        <InteractiveButton
                          variant="subtle"
                          size="sm"
                          disabled={
                            busy || !canLeadApprove || Boolean(tkt.leadApprovedBy)
                          }
                          title={
                            canLeadApprove
                              ? 'Approve SEO/Project rollout as Lead'
                              : 'Requires Agency Owner, Project Manager, or SEO Strategist role'
                          }
                          onClick={() =>
                            void onTicketAction(tkt.id, { action: 'lead_approve' })
                          }
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {tkt.leadApprovedBy ? 'Lead Approved' : 'Lead Approve'}
                          </span>
                        </InteractiveButton>
                      </>
                    )}

                    <select
                      aria-label={`Change status for ticket ${tkt.id}`}
                      value={tkt.taskStatus}
                      disabled={busy}
                      onChange={(e) =>
                        void onTicketAction(tkt.id, {
                          action: 'update_status',
                          taskStatus: e.target.value as DeveloperTaskStatus,
                        })
                      }
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none transition-colors"
                    >
                      {TASK_TRANSITIONS.map((st) => (
                        <option key={st} value={st}>
                          Move to: {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
