import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { CrawlComparisonResponse } from '../../types/audit';
import type { CrawlRun } from '../../types/crawl';
import { ApiError } from '../../services/apiClient';
import { auditService } from '../../services/auditService';
import { crawlService } from '../../services/crawlService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { AnimatedCard, PageTransition } from '../../components/animation/MotionPrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
  StatusBadge,
} from '../../components/ui/StateViews';
import { AuditSubNav, crawlStatusTone } from '../../components/audit/AuditSubNav';
import { CrawlComparison } from '../../components/audit/CrawlComparison';

export function CrawlHistoryPage() {
  const navigate = useNavigate();
  const { selectedProjectId, projects } = useDashboardStore();
  const [crawls, setCrawls] = useState<CrawlRun[]>([]);
  const [comparison, setComparison] = useState<CrawlComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const loadHistory = useCallback(async () => {
    if (!selectedProjectId) {
      setCrawls([]);
      setComparison(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [runsRes, cmpRes] = await Promise.all([
        crawlService.listProjectCrawls(selectedProjectId),
        auditService.fetchCrawlComparison(selectedProjectId),
      ]);
      setCrawls(runsRes.crawls);
      setComparison(cmpRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load crawl history.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Crawl History &amp; Comparison
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Audit run log and deterministic diff across completed full crawls (incomplete crawls excluded from baseline diffs).
        </p>
      </div>

      <AuditSubNav
        latestCrawlId={crawls[0]?.id}
        activeProjectName={activeProject?.name}
      />

      {!selectedProjectId && !loading && (
        <EmptyStateCard
          title="No domain project selected"
          description="Register a domain project to execute crawls and inspect historical comparisons."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      )}

      {selectedProjectId && loading && <DashboardSkeleton />}
      {selectedProjectId && !loading && error && (
        <ErrorStateCard message={error} onRetry={() => void loadHistory()} />
      )}

      {selectedProjectId && !loading && !error && (
        <>
          {comparison && <CrawlComparison comparison={comparison} />}

          <AnimatedCard
            delay={0.08}
            className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
          >
            <h2 className="font-display text-base font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border-hairline)]">
              All Historical Crawl Runs ({crawls.length})
            </h2>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2.5 pr-3">Crawl ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">URLs</th>
                    <th className="py-2.5 px-3">Issues</th>
                    <th className="py-2.5 px-3">Health</th>
                    <th className="py-2.5 px-3">Started</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {crawls.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                        No historical crawl runs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    crawls.map((c) => (
                      <tr
                        key={c.id}
                        className="group hover:bg-[#7047EB]/5 transition-colors duration-150"
                      >
                        <td className="py-3 pr-3 font-mono font-semibold text-[var(--text-primary)]">
                          {c.id}
                        </td>
                        <td className="py-3 px-3 text-[var(--text-secondary)]">
                          {c.crawlType}
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge
                            label={c.status}
                            tone={crawlStatusTone(c.status)}
                          />
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[var(--text-primary)]">
                          {c.processedCount}/{c.discoveredCount}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[var(--text-primary)]">
                          {c.summary.issuesTotal}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {c.summary.healthScore}/100
                        </td>
                        <td className="py-3 px-3 text-[var(--text-muted)]">
                          {new Date(c.startedAt).toLocaleString()}
                        </td>
                        <td className="py-3 pl-3 text-right space-x-2">
                          <Link
                            to={`/audit/urls/${c.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
                          >
                            <span>URLs</span>
                          </Link>
                          <Link
                            to={`/audit/live/${c.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#7047EB]/30 bg-[#7047EB]/8 px-2.5 py-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#C4B5FD] hover:bg-[#7047EB]/15 transition-colors"
                          >
                            <span>Log</span>
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </>
      )}
    </PageTransition>
  );
}
