import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { TechnicalIssue } from '../../types/technicalIssue';
import { ApiError } from '../../services/apiClient';
import { auditService, type SandboxFixesState } from '../../services/auditService';
import { issueService } from '../../services/issueService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
  StatusBadge,
} from '../../components/ui/StateViews';
import { AuditSubNav, severityTone } from '../../components/audit/AuditSubNav';

export function ReverificationPage() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { selectedProjectId, projects, sandboxFixturesEnabled } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);
  const [issues, setIssues] = useState<TechnicalIssue[]>([]);
  const [sandboxFixes, setSandboxFixes] = useState<SandboxFixesState | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const loadData = useCallback(async () => {
    if (!selectedProjectId) {
      setIssues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [issRes, sbRes] = await Promise.all([
        issueService.fetchProjectIssues(selectedProjectId),
        sandboxFixturesEnabled
          ? auditService.fetchSandboxFixes().catch(() => null)
          : Promise.resolve(null),
      ]);
      setIssues(issRes.issues);
      if (sbRes) setSandboxFixes(sbRes.fixes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load reverification queue.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, sandboxFixturesEnabled]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleReverify = async (issueId: string) => {
    setRunningId(issueId);
    setNotice(null);
    setError(null);
    try {
      const res = await issueService.reverifyIssue(issueId);
      const passed = res.verificationRun.result === 'Verified';
      const msg = `${res.verificationRun.result}: ${res.verificationRun.evidence.summary}`;
      setNotice(msg);
      pushToast({
        title: passed ? 'Issue Verified' : `Reverification ${res.verificationRun.result}`,
        detail: res.verificationRun.evidence.summary,
        tone: passed ? 'success' : 'warning',
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reverification failed.';
      setError(msg);
      pushToast({ title: 'Reverification Failed', detail: msg, tone: 'error' });
    } finally {
      setRunningId(null);
    }
  };

  const toggleSandboxKey = async (key: keyof SandboxFixesState) => {
    if (!sandboxFixes) return;
    const nextVal = !sandboxFixes[key];
    const res = await auditService.updateSandboxFixes({ [key]: nextVal });
    setSandboxFixes(res.fixes);
    pushToast({
      title: nextVal ? 'Sandbox Fix Enabled' : 'Sandbox Fix Disabled',
      detail: key,
      tone: 'info',
    });
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Fix Reverification Queue
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Trigger targeted re-crawls to confirm remediated SEO issues with live HTTP and DOM evidence.
        </p>
      </div>

      <AuditSubNav activeProjectName={activeProject?.name} />

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
      {error && <ErrorStateCard message={error} onRetry={() => void loadData()} />}

      {sandboxFixturesEnabled &&
        selectedProjectId.startsWith('proj-sandbox') &&
        sandboxFixes && (
          <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
              <div className="flex items-center gap-2">
                <Wrench
                  className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF]"
                  aria-hidden="true"
                />
                <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Local Sandbox Fix Controls
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  void auditService
                    .updateSandboxFixes({ reset: true })
                    .then((r) => {
                      setSandboxFixes(r.fixes);
                      pushToast({
                        title: 'Sandbox Fixes Reset',
                        detail: 'All defects restored on sandbox origin.',
                        tone: 'info',
                      });
                    })
                }
                className="text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF] hover:underline cursor-pointer"
              >
                Reset All Fixes
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              {(
                [
                  ['fixNoindexPage', 'Fix /noindex-page robots'],
                  ['fixCanonicalConflict', 'Fix /canonical-conflict'],
                  ['fixBrokenLink', 'Fix broken /broken-target link'],
                  ['fixMissingMetaDescription', 'Add missing meta descriptions'],
                  ['fixInvalidSchema', 'Fix JSON-LD syntax'],
                  ['fixRedirectChain', 'Collapse redirect chain'],
                  ['simulatePartial500', 'Simulate HTTP 500 (Partial Crawl)'],
                ] as [keyof SandboxFixesState, string][]
              ).map(([k, label]) => (
                <label
                  key={k}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-medium text-[var(--text-primary)] hover:border-[#7047EB]/35 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={sandboxFixes[k]}
                    onChange={() => void toggleSandboxKey(k)}
                    className="h-4 w-4 rounded border-[var(--border-hairline)] accent-[#7047EB]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>
        )}

      {loading && <DashboardSkeleton />}

      {!loading && !error && issues.length === 0 && (
        <EmptyStateCard
          title="No issues in reverification queue"
          description={
            selectedProjectId
              ? 'Run an audit crawl first to discover technical issues eligible for remediation and reverification.'
              : 'Register a domain project before launching crawls and verifying fixes.'
          }
          actionLabel={selectedProjectId ? 'Start Technical Crawl' : 'Go to Projects'}
          onAction={() => navigate(selectedProjectId ? '/audit/new' : '/projects')}
        />
      )}

      {!loading && !error && issues.length > 0 && (
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 transition-colors hover:border-[#7047EB]/35 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={issue.severity}
                    tone={severityTone(issue.severity)}
                  />
                  <StatusBadge
                    label={issue.status}
                    tone={issue.status === 'Verified' ? 'success' : 'warning'}
                  />
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    {issue.ruleId}
                  </span>
                </div>
                <Link
                  to={`/audit/issues/${issue.id}`}
                  className="mt-1.5 block font-display text-sm font-bold text-[var(--text-primary)] hover:text-[#7047EB] dark:hover:text-[#8B6BFF] transition-colors"
                >
                  {issue.title}
                </Link>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {issue.affectedUrlCount} affected URL(s) · Last seen{' '}
                  {new Date(issue.lastSeenAt).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/audit/issues/${issue.id}`}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  Inspect
                </Link>
                <InteractiveButton
                  variant="primary"
                  size="md"
                  disabled={runningId === issue.id}
                  onClick={() => void handleReverify(issue.id)}
                >
                  {issue.status === 'Verified' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        runningId === issue.id ? 'animate-spin' : ''
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {runningId === issue.id
                      ? 'Verifying...'
                      : issue.status === 'Verified'
                        ? 'Re-check'
                        : 'Verify Fix'}
                  </span>
                </InteractiveButton>
              </div>
            </div>
          ))}
        </section>
      )}
    </PageTransition>
  );
}
