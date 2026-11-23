import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { VerificationRun } from '../../types/technicalIssue';
import { deriveReverificationStage } from '../../utils/uiMotionLogic';
import { AnimatedProgress, SuccessTransition } from '../animation/MotionPrimitives';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function ReverificationPanel({
  issueStatus,
  verificationRuns,
  running,
  onRunReverification,
}: {
  issueStatus: string;
  verificationRuns: VerificationRun[];
  running: boolean;
  onRunReverification: () => Promise<void>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const latestResult = verificationRuns[0]?.result ?? null;
  const stage = deriveReverificationStage({
    running,
    issueStatus,
    latestResult,
  });

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Evidence-Based Reverification Engine
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Re-crawls affected URLs and checks live HTTP/HTML signals before allowing Verified resolution
          </p>
        </div>

        <InteractiveButton
          variant="primary"
          size="md"
          disabled={running}
          onClick={() => void onRunReverification()}
          className="self-start bg-gradient-to-r from-[#7047EB] to-[#0D9488]"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>
            {running
              ? 'Re-crawling Affected URLs...'
              : issueStatus === 'Verified'
                ? 'Re-run Verification Check'
                : 'Re-crawl & Verify Fix'}
          </span>
        </InteractiveButton>
      </div>

      {/* Real-state Lifecycle Banner */}
      <AnimatePresence initial={false}>
        {stage === 'recrawling' && (
          <motion.div
            key="stage-recrawling"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2, ease: MOTION_EASE }}
            className="mt-4 rounded-xl border border-[#7047EB]/30 bg-[#7047EB]/6 dark:bg-[#7047EB]/12 p-3.5"
          >
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
              <span>Re-crawling target URLs &amp; inspecting live HTTP/DOM signals...</span>
              <span className="font-mono text-[11px] text-[#7047EB] dark:text-[#A78BFA]">
                Live Check
              </span>
            </div>
            <AnimatedProgress value={68} tone="brand" active heightClass="h-2" />
          </motion.div>
        )}

        {stage === 'verified' && (
          <motion.div
            key="stage-verified"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.24, ease: MOTION_EASE }}
            className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/12 px-4 py-3 text-xs text-emerald-950 dark:text-emerald-200"
          >
            <SuccessTransition size={22} />
            <div>
              <div className="font-semibold">
                Verified — Backend re-crawl confirmed all affected URLs pass diagnostics
              </div>
              <div className="text-[11px] text-emerald-800 dark:text-emerald-300/80">
                Status transitioned strictly from live crawl evidence.
              </div>
            </div>
          </motion.div>
        )}

        {stage === 'awaiting_verification' && (
          <motion.div
            key="stage-awaiting"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#7047EB]/25 bg-[#7047EB]/6 dark:bg-[#7047EB]/12 px-4 py-2.5 text-xs text-[var(--text-secondary)]"
          >
            <Clock className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
            <span>
              Issue is <strong className="text-[var(--text-primary)]">Awaiting verification</strong>. Run a targeted re-crawl above to confirm remediation.
            </span>
          </motion.div>
        )}

        {stage === 'failed' && (
          <motion.div
            key="stage-failed"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/12 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200"
          >
            <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>
              Latest verification returned <strong>{latestResult}</strong> — condition still present on target URLs.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 space-y-3">
        {verificationRuns.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-muted)]">
            No reverification runs executed yet. Apply the fix on the target site
            and trigger reverification above.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {verificationRuns.map((vr) => {
              const passed = vr.result === 'Verified';
              return (
                <motion.div
                  key={vr.id}
                  layout={!prefersReducedMotion}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: MOTION_EASE }}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {passed ? (
                        <CheckCircle2
                          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle
                          className="h-4 w-4 text-rose-600 dark:text-rose-400"
                          aria-hidden="true"
                        />
                      )}
                      <StatusBadge
                        label={vr.result}
                        tone={passed ? 'success' : 'danger'}
                      />
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {vr.verificationCrawlId}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Requested by {vr.requestedBy} ·{' '}
                      {new Date(vr.verifiedAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="mt-2 font-medium text-[var(--text-primary)]">
                    {vr.evidence.summary}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[var(--text-muted)] tabular-nums">
                    <span>Checked URLs: {vr.evidence.checkedUrls}</span>
                    <span>
                      Resolved: {vr.evidence.resolvedUrls.length}
                    </span>
                    <span>
                      Still Failing: {vr.evidence.stillFailingUrls.length}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
