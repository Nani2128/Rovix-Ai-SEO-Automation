import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Gauge,
  Play,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import type {
  PerformanceDashboardOverview,
  PerformanceFinding,
  PerformanceRunStrategyMode,
  PerformanceUrlMeasurement,
} from '../../types/performance';
import { crawlService } from '../../services/crawlService';
import { performanceService } from '../../services/performanceService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { AnimatedProgress, PageTransition } from '../../components/animation/MotionPrimitives';
import { CwvVitalsAndTrendPanel } from '../../components/performance/CwvVitalsAndTrendPanel';
import { DiagnosticsAndResourcesPanel } from '../../components/performance/DiagnosticsAndResourcesPanel';
import { MobileDesktopCompareCard } from '../../components/performance/MobileDesktopCompareCard';
import { PerformanceAuditLauncherModal } from '../../components/performance/PerformanceAuditLauncherModal';
import { PerformanceIssueDrawer } from '../../components/performance/PerformanceIssueDrawer';
import { PerformanceKpiStrip } from '../../components/performance/PerformanceKpiStrip';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
  StatusBadge,
} from '../../components/ui/StateViews';

export function PerformancePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { projects, selectedProjectId } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const projectId = activeProject?.id ?? null;

  const [overview, setOverview] = useState<PerformanceDashboardOverview | null>(
    null,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [crawlInventoryUrls, setCrawlInventoryUrls] = useState<string[]>([]);

  const [selectedFinding, setSelectedFinding] =
    useState<PerformanceFinding | null>(null);
  const [rawModal, setRawModal] = useState<{
    measurement: PerformanceUrlMeasurement;
    rawSnapshot: Record<string, unknown> | null;
  } | null>(null);

  const canOperate = useMemo(() => {
    const r = user?.role;
    return (
      r === 'Platform Admin' ||
      r === 'Agency Owner' ||
      r === 'SEO Strategist' ||
      r === 'Project Manager' ||
      r === 'Developer' ||
      r === 'Business Owner'
    );
  }, [user?.role]);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!projectId) {
        setOverview(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await performanceService.fetchOverview(
          projectId,
          selectedRunId,
        );
        setOverview(data);
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load performance diagnostics.',
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId, selectedRunId],
  );

  useEffect(() => {
    setSelectedRunId(undefined);
  }, [projectId]);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  // Load recent crawled URLs to populate quick-fill launcher options
  useEffect(() => {
    if (!projectId) {
      setCrawlInventoryUrls([]);
      return;
    }
    let cancelled = false;
    void crawlService
      .listProjectCrawls(projectId)
      .then(async ({ crawls }) => {
        const latest = crawls.find(
          (c) => c.status === 'Succeeded' || c.status === 'Partial',
        );
        if (!latest) return;
        const page = await crawlService.fetchCrawlUrls(latest.id, {
          filter: 'indexable',
          page: 1,
          pageSize: 10,
          sortBy: 'depth',
          sortDir: 'asc',
        });
        if (!cancelled) {
          setCrawlInventoryUrls(
            page.items.map((u) => u.finalUrl || u.normalizedUrl),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCrawlInventoryUrls([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Poll active runs automatically every 2.5s until terminal
  const latestRunStatus = overview?.latestRun?.status;
  useEffect(() => {
    if (latestRunStatus !== 'Queued' && latestRunStatus !== 'Running') return;
    const timer = setInterval(() => {
      void loadOverview(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [latestRunStatus, loadOverview]);

  const handleLaunchAudit = async (payload: {
    targetUrls: string[];
    strategyMode: PerformanceRunStrategyMode;
  }) => {
    if (!projectId) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const { auditRun } = await performanceService.startAudit(projectId, {
        targetUrls: payload.targetUrls,
        strategyMode: payload.strategyMode,
      });
      setSelectedRunId(auditRun.id);
      setLauncherOpen(false);
      pushToast({
        title: 'Performance audit queued',
        detail: `${auditRun.targetUrls.length} URL(s) · ${auditRun.strategyMode}`,
        tone: 'info',
      });
      await loadOverview(true);
    } catch (err) {
      setLaunchError(
        err instanceof Error ? err.message : 'Unable to start performance audit.',
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleCancelAudit = async (auditId: string) => {
    try {
      await performanceService.cancelAudit(auditId);
      pushToast({
        title: 'Performance audit cancelled',
        detail: auditId,
        tone: 'warning',
      });
      await loadOverview(true);
    } catch (err) {
      pushToast({
        title: 'Unable to cancel audit',
        detail: err instanceof Error ? err.message : 'Permission required.',
        tone: 'warning',
      });
    }
  };

  const handleBridgeFinding = async (
    findingId: string,
    createTicket: boolean,
  ) => {
    const res = await performanceService.bridgeFindingToIssue(findingId, {
      createTicket,
    });
    pushToast({
      title: res.deduplicated
        ? 'Linked to existing Technical Issue'
        : 'Created Technical Issue',
      detail: res.ticket ? `Ticket ${res.ticket.id} ready` : res.issue.title,
      tone: 'success',
    });
    await loadOverview(true);
    setSelectedFinding((prev) =>
      prev && prev.id === findingId
        ? { ...prev, linkedIssueId: res.issue.id }
        : prev,
    );
  };

  const handleReverifyIssue = async (issueId: string) => {
    const outcome = await performanceService.reverifyIssue(issueId);
    pushToast({
      title: `Reverification: ${outcome.verificationRun.result}`,
      detail: outcome.verificationRun.evidence.summary,
      tone: outcome.verificationRun.result === 'Verified' ? 'success' : 'warning',
    });
    await loadOverview(true);
  };

  const handleInspectRaw = async (m: PerformanceUrlMeasurement) => {
    try {
      const data = await performanceService.getMeasurementRawSnapshot(m.id);
      setRawModal(data);
    } catch (err) {
      pushToast({
        title: 'Unable to load raw snapshot',
        detail: err instanceof Error ? err.message : 'Snapshot unavailable.',
        tone: 'warning',
      });
    }
  };

  if (!projectId) {
    return (
      <PageTransition className="mx-auto max-w-[1360px] space-y-6">
        <GlassPanel className="p-6">
          <EmptyStateCard
            title="No domain project selected"
            description="Create a domain project first so Rovix AI can run PageSpeed Lighthouse Lab audits, inspect CrUX real-user telemetry, and track performance regressions."
            actionLabel="Create Domain Project"
            onAction={() => navigate('/projects')}
          />
        </GlassPanel>
      </PageTransition>
    );
  }

  if (loading && !overview) {
    return (
      <PageTransition className="mx-auto max-w-[1360px]">
        <DashboardSkeleton />
      </PageTransition>
    );
  }

  if (error && !overview) {
    return (
      <PageTransition className="mx-auto max-w-[1360px]">
        <ErrorStateCard message={error} onRetry={() => void loadOverview(false)} />
      </PageTransition>
    );
  }

  if (!overview) return null;

  const activeLinkedIssue = selectedFinding?.linkedIssueId
    ? overview.linkedIssues.find(
        (i) => i.id === selectedFinding.linkedIssueId,
      ) ?? null
    : selectedFinding
      ? overview.linkedIssues.find(
          (i) =>
            i.rootCauseKey ===
            `PERF::${selectedFinding.ruleId}::${selectedFinding.strategy}`,
        ) ?? null
      : null;

  const activeLinkedTicket = activeLinkedIssue
    ? overview.linkedTickets.find((t) => t.issueId === activeLinkedIssue.id) ??
      null
    : null;

  const activeVerifications = activeLinkedIssue
    ? overview.verificationRuns.filter(
        (v) => v.issueId === activeLinkedIssue.id,
      )
    : [];

  const isRunning =
    overview.latestRun?.status === 'Queued' ||
    overview.latestRun?.status === 'Running';

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      {/* Header Row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Performance &amp; Usability Intelligence
            </h1>
            <StatusBadge
              label={
                overview.pageSpeedKeyConfigured
                  ? 'PSI API Key Ready'
                  : 'Public PSI Quota'
              }
              tone={overview.pageSpeedKeyConfigured ? 'success' : 'warning'}
            />
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Live Lighthouse Lab &amp; Chrome UX Report (CrUX) diagnostics for{' '}
            <strong className="text-[var(--text-primary)]">
              {overview.projectName}
            </strong>{' '}
            ({overview.website})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {overview.runs.length > 0 && (
            <select
              aria-label="Select performance audit run"
              value={overview.latestRun?.id ?? ''}
              onChange={(e) => setSelectedRunId(e.target.value || undefined)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none cursor-pointer"
            >
              {overview.runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {new Date(run.startedAt).toLocaleString()} · {run.status} (
                  {run.targetUrls.length} URL)
                </option>
              ))}
            </select>
          )}

          <InteractiveButton
            variant="secondary"
            size="md"
            onClick={() => void loadOverview(false)}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </InteractiveButton>

          {canOperate && (
            <InteractiveButton
              variant="primary"
              size="md"
              onClick={() => {
                setLaunchError(null);
                setLauncherOpen(true);
              }}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Run Speed Audit</span>
            </InteractiveButton>
          )}
        </div>
      </div>

      {/* Missing API Key Honest Banner */}
      {!overview.pageSpeedKeyConfigured && (
        <GlassPanel className="flex flex-col gap-2 border-amber-300/70 dark:border-amber-800/60 bg-amber-50/75 dark:bg-amber-950/25 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>PAGESPEED_API_KEY not configured on server:</strong>{' '}
              Running with Google&apos;s shared public quota. Add{' '}
              <code>PAGESPEED_API_KEY</code> to <code>.env</code> for higher-throughput batch audits and reliable reverification.
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Active Audit Progress Banner */}
      {isRunning && overview.latestRun && (
        <GlassPanel className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB]">
                <Gauge className="h-4 w-4 animate-pulse" />
              </span>
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  Executing Performance Audit ({overview.latestRun.id})
                </div>
                <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                  Completed {overview.latestRun.completedChecks} /{' '}
                  {overview.latestRun.totalChecks} checks ·{' '}
                  {overview.latestRun.failedChecks} failed
                </div>
              </div>
            </div>

            {canOperate && (
              <InteractiveButton
                variant="secondary"
                size="sm"
                onClick={() => void handleCancelAudit(overview.latestRun!.id)}
              >
                <Square className="h-3 w-3" aria-hidden="true" />
                <span>Cancel Run</span>
              </InteractiveButton>
            )}
          </div>
          <div className="mt-3">
            <AnimatedProgress
              value={Math.round(
                (overview.latestRun.completedChecks /
                  Math.max(1, overview.latestRun.totalChecks)) *
                  100,
              )}
              tone="brand"
              heightClass="h-2"
            />
          </div>
        </GlassPanel>
      )}

      {/* KPI Strip */}
      <PerformanceKpiStrip overview={overview} />

      {/* Mobile vs Desktop Comparison */}
      <MobileDesktopCompareCard overview={overview} />

      {/* Lab vs Field & Historical Trend */}
      <CwvVitalsAndTrendPanel
        overview={overview}
        onLaunchAudit={() => {
          setLaunchError(null);
          setLauncherOpen(true);
        }}
      />

      {/* Findings, Slowest Pages, Resource Weights & Usability */}
      <DiagnosticsAndResourcesPanel
        overview={overview}
        onSelectFinding={(finding) => setSelectedFinding(finding)}
        onInspectRawSnapshot={(m) => void handleInspectRaw(m)}
        onLaunchAudit={() => {
          setLaunchError(null);
          setLauncherOpen(true);
        }}
      />

      {/* Audit Launcher Modal */}
      <PerformanceAuditLauncherModal
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        defaultDomain={overview.website}
        crawlInventoryUrls={crawlInventoryUrls}
        pageSpeedKeyConfigured={overview.pageSpeedKeyConfigured}
        maxUrlsPerAudit={overview.maxUrlsPerAudit}
        submitting={launching}
        errorMessage={launchError}
        onSubmit={(payload) => void handleLaunchAudit(payload)}
      />

      {/* Issue / Ticket / Reverify Drawer */}
      <PerformanceIssueDrawer
        finding={selectedFinding}
        linkedIssue={activeLinkedIssue}
        linkedTicket={activeLinkedTicket}
        verificationRuns={activeVerifications}
        canOperate={canOperate}
        onClose={() => setSelectedFinding(null)}
        onBridgeToIssue={handleBridgeFinding}
        onReverifyIssue={handleReverifyIssue}
      />

      {/* Sanitized Raw Snapshot Modal */}
      {rawModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sanitized PageSpeed JSON Snapshot"
        >
          <div
            onClick={() => setRawModal(null)}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
          />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-3xl flex-col rounded-3xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Sanitized Lighthouse / CrUX Snapshot
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {rawModal.measurement.strategy.toUpperCase()} ·{' '}
                  {rawModal.measurement.url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRawModal(null)}
                aria-label="Close raw snapshot"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="mt-3 flex-1 overflow-auto rounded-2xl bg-[var(--bg-subtle)] p-4 font-mono text-[11px] leading-relaxed text-[var(--text-primary)]">
              {JSON.stringify(rawModal.rawSnapshot, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
