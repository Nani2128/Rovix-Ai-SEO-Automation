import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Wrench } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { DeveloperTaskStatus } from '../../types/technicalIssue';
import { ApiError } from '../../services/apiClient';
import { auditService, type SandboxFixesState } from '../../services/auditService';
import { issueService, type IssueDetailsBundle } from '../../services/issueService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { DashboardSkeleton, ErrorStateCard } from '../../components/ui/StateViews';
import { AuditSubNav } from '../../components/audit/AuditSubNav';
import { DeveloperTicketPanel } from '../../components/audit/DeveloperTicketPanel';
import { IssueEvidencePanel } from '../../components/audit/IssueEvidencePanel';
import { IssueRootCausePanel } from '../../components/audit/IssueRootCausePanel';
import { ReverificationPanel } from '../../components/audit/ReverificationPanel';

const SANDBOX_FIX_MAP: Record<string, { key: keyof SandboxFixesState; label: string }> = {
  'RULE-01-NOINDEX': { key: 'fixNoindexPage', label: 'Remove noindex meta on /noindex-page' },
  'RULE-01-SITEMAP-NOINDEX': { key: 'fixNoindexPage', label: 'Remove noindex meta on /noindex-page' },
  'RULE-02-CANONICAL-CONFLICT': { key: 'fixCanonicalConflict', label: 'Remove conflicting canonical on /canonical-conflict' },
  'RULE-04-BROKEN-4XX': { key: 'fixBrokenLink', label: 'Point broken link to valid /other-page' },
  'RULE-05-MISSING-META-DESC': { key: 'fixMissingMetaDescription', label: 'Populate meta descriptions on duplicate-title pages' },
  'RULE-07-INVALID-SCHEMA': { key: 'fixInvalidSchema', label: 'Fix malformed JSON-LD syntax on /invalid-schema' },
  'RULE-03-REDIRECT-CHAIN': { key: 'fixRedirectChain', label: 'Collapse 2-hop redirect chain to 1 hop' },
};

export function IssueDetailsPage() {
  const prefersReducedMotion = useReducedMotion();
  const { issueId } = useParams<{ issueId: string }>();
  const user = useAuthStore((s) => s.user);
  const { selectedProjectId, projects, sandboxFixturesEnabled } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);
  const [bundle, setBundle] = useState<IssueDetailsBundle | null>(null);
  const [sandboxFixes, setSandboxFixes] = useState<SandboxFixesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const loadBundle = useCallback(async () => {
    if (!issueId) return;
    setLoading(true);
    setError(null);
    try {
      const [res, sb] = await Promise.all([
        issueService.fetchIssueDetails(issueId),
        sandboxFixturesEnabled
          ? auditService.fetchSandboxFixes().catch(() => null)
          : Promise.resolve(null),
      ]);
      setBundle(res);
      if (sb) setSandboxFixes(sb.fixes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load issue details.',
      );
    } finally {
      setLoading(false);
    }
  }, [issueId, sandboxFixturesEnabled]);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  const handleCreateTicket = async (payload: {
    title?: string;
    assignedUser?: string;
  }) => {
    if (!issueId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await issueService.createTicket(issueId, payload);
      const msg = `Created developer ticket ${res.ticket.id}.`;
      setNotice(msg);
      pushToast({ title: 'Developer Ticket Created', detail: msg, tone: 'success' });
      await loadBundle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create ticket.';
      setError(msg);
      pushToast({ title: 'Ticket Error', detail: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleTicketAction = async (
    ticketId: string,
    payload: {
      action?: 'developer_approve' | 'lead_approve' | 'reject' | 'update_status';
      taskStatus?: DeveloperTaskStatus;
    },
  ) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await issueService.updateTicket(ticketId, payload);
      const msg = `Updated ticket ${ticketId}.`;
      setNotice(msg);
      pushToast({ title: 'Ticket Updated', detail: msg, tone: 'info' });
      await loadBundle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update ticket.';
      setError(msg);
      pushToast({ title: 'Action Blocked', detail: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleReverify = async () => {
    if (!issueId) return;
    setReverifying(true);
    setNotice(null);
    setError(null);
    try {
      const res = await issueService.reverifyIssue(issueId);
      const passed = res.verificationRun.result === 'Verified';
      const msg = passed
        ? 'Reverification passed: fix confirmed across all affected URLs.'
        : `Reverification completed (${res.verificationRun.result}): ${res.verificationRun.evidence.summary}`;
      setNotice(msg);
      pushToast({
        title: passed ? 'Fix Verified' : `Verification ${res.verificationRun.result}`,
        detail: res.verificationRun.evidence.summary,
        tone: passed ? 'success' : 'warning',
      });
      await loadBundle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reverification failed.';
      setError(msg);
      pushToast({ title: 'Reverification Failed', detail: msg, tone: 'error' });
    } finally {
      setReverifying(false);
    }
  };

  const sandboxControl = bundle ? SANDBOX_FIX_MAP[bundle.issue.ruleId] : undefined;

  const handleToggleSandboxFix = async () => {
    if (!sandboxControl || !sandboxFixes) return;
    const nextVal = !sandboxFixes[sandboxControl.key];
    setBusy(true);
    try {
      const res = await auditService.updateSandboxFixes({
        [sandboxControl.key]: nextVal,
      });
      setSandboxFixes(res.fixes);
      const msg = nextVal
        ? `Applied sandbox remediation: ${sandboxControl.label}. Now run Reverification below to verify.`
        : `Reverted sandbox remediation: ${sandboxControl.label}.`;
      setNotice(msg);
      pushToast({
        title: nextVal ? 'Sandbox Fix Applied' : 'Sandbox Fix Reverted',
        detail: sandboxControl.label,
        tone: nextVal ? 'success' : 'info',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <Link
          to="/audit/issues"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Technical Issues</span>
        </Link>
      </div>

      <AuditSubNav
        latestCrawlId={bundle?.issue.lastCrawlId}
        activeProjectName={activeProject?.name}
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      {error && <ErrorStateCard message={error} onRetry={() => void loadBundle()} />}

      {loading && <DashboardSkeleton />}

      {!loading && bundle && (
        <div className="space-y-6">
          <IssueRootCausePanel issue={bundle.issue} rule={bundle.rule} />

          {sandboxFixturesEnabled &&
            sandboxControl &&
            sandboxFixes &&
            bundle.issue.projectId.startsWith('proj-sandbox') && (
              <section className="flex flex-col gap-3 rounded-[20px] border border-[#7047EB]/25 bg-[#7047EB]/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/15 text-[#7047EB] dark:text-[#8B6BFF]">
                    <Wrench className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-display text-xs font-bold text-[var(--text-primary)]">
                      Local Development Sandbox Remediation Toggle ({sandboxControl.key})
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {sandboxControl.label} — Status:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {sandboxFixes[sandboxControl.key]
                          ? 'Fix Applied on Sandbox Origin'
                          : 'Original Defect Active'}
                      </strong>
                    </p>
                  </div>
                </div>
                <InteractiveButton
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  onClick={() => void handleToggleSandboxFix()}
                  className="self-start sm:self-auto"
                >
                  {sandboxFixes[sandboxControl.key]
                    ? 'Revert Sandbox Fix'
                    : 'Apply Sandbox Fix'}
                </InteractiveButton>
              </section>
            )}

          <DeveloperTicketPanel
            tickets={bundle.tickets}
            userRole={user?.role ?? 'QA'}
            busy={busy}
            onCreateTicket={handleCreateTicket}
            onTicketAction={handleTicketAction}
          />

          <ReverificationPanel
            issueStatus={bundle.issue.status}
            verificationRuns={bundle.verificationRuns}
            running={reverifying}
            onRunReverification={handleReverify}
          />

          <IssueEvidencePanel evidence={bundle.evidence} />

          {bundle.auditTrail.length > 0 && (
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Immutable Audit Trail
              </h2>
              <div className="mt-3 space-y-2 text-xs">
                {bundle.auditTrail.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5"
                  >
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {entry.actorName} ({entry.actorRole})
                      </span>{' '}
                      <span className="text-[var(--text-secondary)]">
                        changed {entry.entityType} from{' '}
                        <strong className="text-[var(--text-primary)]">
                          {entry.previousState}
                        </strong>{' '}
                        →{' '}
                        <strong className="text-[var(--text-primary)]">
                          {entry.newState}
                        </strong>
                      </span>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {entry.reason}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageTransition>
  );
}
