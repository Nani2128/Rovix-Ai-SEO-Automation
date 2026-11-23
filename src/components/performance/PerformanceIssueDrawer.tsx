import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Ticket,
  Wrench,
  X,
} from 'lucide-react';
import { drawerSlide } from '../../lib/motion';
import type { PerformanceFinding } from '../../types/performance';
import type {
  DeveloperTicket,
  TechnicalIssue,
  VerificationRun,
} from '../../types/technicalIssue';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function PerformanceIssueDrawer({
  finding,
  linkedIssue,
  linkedTicket,
  verificationRuns,
  canOperate,
  onClose,
  onBridgeToIssue,
  onReverifyIssue,
}: {
  finding: PerformanceFinding | null;
  linkedIssue: TechnicalIssue | null;
  linkedTicket: DeveloperTicket | null;
  verificationRuns: VerificationRun[];
  canOperate: boolean;
  onClose: () => void;
  onBridgeToIssue: (
    findingId: string,
    createTicket: boolean,
  ) => Promise<void>;
  onReverifyIssue: (issueId: string) => Promise<void>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [createTicket, setCreateTicket] = useState(true);
  const [busyAction, setBusyAction] = useState<'bridge' | 'reverify' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setActionError(null);
  }, [finding?.id]);

  useEffect(() => {
    if (!finding) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finding, onClose]);

  if (!finding) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perf-drawer-title"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
      />

      <motion.aside
        variants={drawerSlide}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        exit={prefersReducedMotion ? undefined : 'exit'}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={finding.severity}
                tone={
                  finding.severity === 'Critical'
                    ? 'danger'
                    : finding.severity === 'High'
                      ? 'warning'
                      : 'indigo'
                }
              />
              <StatusBadge label={finding.strategy.toUpperCase()} tone="info" />
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {finding.ruleId}
              </span>
            </div>
            <h2
              id="perf-drawer-title"
              className="mt-1.5 font-display text-base font-extrabold text-[var(--text-primary)]"
            >
              {finding.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close issue drawer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Measured Evidence ({finding.evidence.metricLabel})
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-lg font-extrabold text-[var(--text-primary)] tabular-nums">
                {finding.evidence.measuredValue}
              </span>
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                Target: {finding.evidence.thresholdLabel}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] break-all">
              URL: {finding.url}
            </div>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Root Cause &amp; Impact
            </h3>
            <p className="mt-1.5 leading-relaxed text-[var(--text-secondary)]">
              {finding.rootCause}
            </p>
            <p className="mt-1.5 leading-relaxed text-[var(--text-muted)]">
              {finding.explanation}
            </p>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Recommended Engineering Solution
            </h3>
            <p className="mt-1.5 leading-relaxed text-[var(--text-primary)]">
              {finding.recommendedSolution}
            </p>
            <div className="mt-2 inline-flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              Effort: {finding.estimatedEffort}
            </div>
          </div>

          {finding.evidence.sampleUrls.length > 0 && (
            <div>
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Sample Affected Assets / Elements
              </h3>
              <ul className="mt-1.5 space-y-1">
                {finding.evidence.sampleUrls.map((s, idx) => (
                  <li
                    key={`${s}-${idx}`}
                    className="truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked Technical Issue & Reverification Section */}
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Issue &amp; Ticket Lifecycle
              </h3>
              {linkedIssue && (
                <StatusBadge
                  label={linkedIssue.status}
                  tone={linkedIssue.status === 'Verified' ? 'success' : 'indigo'}
                />
              )}
            </div>

            {!linkedIssue ? (
              <div className="space-y-3">
                <p className="text-[var(--text-muted)] leading-relaxed">
                  Promote this diagnostic finding to a deduplicated{' '}
                  <strong>Technical Issue</strong> to assign engineering remediation and enforce evidence-based PageSpeed reverification.
                </p>

                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createTicket}
                    onChange={(e) => setCreateTicket(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#7047EB]"
                  />
                  <span>Also create a Developer Remediation Ticket</span>
                </label>

                {canOperate && (
                  <InteractiveButton
                    variant="primary"
                    size="md"
                    disabled={busyAction !== null}
                    onClick={async () => {
                      setBusyAction('bridge');
                      setActionError(null);
                      try {
                        await onBridgeToIssue(finding.id, createTicket);
                      } catch (err) {
                        setActionError(
                          err instanceof Error
                            ? err.message
                            : 'Failed to create issue.',
                        );
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {busyAction === 'bridge'
                        ? 'Linking Issue...'
                        : createTicket
                          ? 'Create Issue & Developer Ticket'
                          : 'Track as Technical Issue'}
                    </span>
                  </InteractiveButton>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-[var(--text-muted)]">
                    Issue ID: {linkedIssue.id}
                  </span>
                  <Link
                    to={`/audit/issues/${linkedIssue.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline"
                  >
                    <span>Open Full Issue Page</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {linkedTicket && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[11.5px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Ticket className="h-3.5 w-3.5 shrink-0 text-[#7047EB]" />
                      <span className="truncate font-semibold text-[var(--text-primary)]">
                        {linkedTicket.title}
                      </span>
                    </div>
                    <StatusBadge label={linkedTicket.taskStatus} tone="info" />
                  </div>
                )}

                {verificationRuns.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                      Recent Reverification Runs
                    </div>
                    {verificationRuns.slice(0, 3).map((vr) => (
                      <div
                        key={vr.id}
                        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge
                            label={vr.result}
                            tone={
                              vr.result === 'Verified'
                                ? 'success'
                                : vr.result === 'Changed'
                                  ? 'warning'
                                  : 'danger'
                            }
                          />
                          <span className="text-[var(--text-muted)]">
                            {new Date(vr.verifiedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[var(--text-secondary)]">
                          {vr.evidence.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {canOperate && linkedIssue.status !== 'Verified' && (
                  <InteractiveButton
                    variant="primary"
                    size="md"
                    disabled={busyAction !== null}
                    onClick={async () => {
                      setBusyAction('reverify');
                      setActionError(null);
                      try {
                        await onReverifyIssue(linkedIssue.id);
                      } catch (err) {
                        setActionError(
                          err instanceof Error
                            ? err.message
                            : 'Reverification failed.',
                        );
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        busyAction === 'reverify' ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {busyAction === 'reverify'
                        ? 'Running Fresh PageSpeed Check...'
                        : 'Reverify with Fresh PageSpeed Audit'}
                    </span>
                  </InteractiveButton>
                )}

                {linkedIssue.status === 'Verified' && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/35 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Verified resolved by live PageSpeed performance audit.
                    </span>
                  </div>
                )}
              </div>
            )}

            {actionError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/35 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {actionError}
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </div>
  );
}
