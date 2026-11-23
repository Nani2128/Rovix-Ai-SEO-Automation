import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IssueCategory, IssueSeverity, TechnicalIssue } from '../../types/technicalIssue';
import { ApiError } from '../../services/apiClient';
import { issueService } from '../../services/issueService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import {
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
} from '../../components/ui/StateViews';
import { AuditSubNav } from '../../components/audit/AuditSubNav';
import { IssueSeverityCards } from '../../components/audit/IssueSeverityCards';
import { TechnicalIssueTable } from '../../components/audit/TechnicalIssueTable';

export function TechnicalIssuesPage() {
  const navigate = useNavigate();
  const { selectedProjectId, projects } = useDashboardStore();
  const [issues, setIssues] = useState<TechnicalIssue[]>([]);
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const loadIssues = useCallback(async () => {
    if (!selectedProjectId) {
      setIssues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await issueService.fetchProjectIssues(selectedProjectId);
      setIssues(res.issues);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load technical issues.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const categories = useMemo(
    () => Array.from(new Set(issues.map((i) => i.category))),
    [issues],
  );

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (severityFilter !== 'All' && i.severity !== severityFilter) return false;
      if (categoryFilter !== 'All' && i.category !== categoryFilter) return false;
      if (statusFilter !== 'All' && i.status !== statusFilter) return false;
      return true;
    });
  }, [issues, severityFilter, categoryFilter, statusFilter]);

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Technical SEO Issues
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Deduplicated root-cause diagnostics grouped across crawls with captured evidence and remediation workflows.
        </p>
      </div>

      <AuditSubNav activeProjectName={activeProject?.name} />

      {loading && <DashboardSkeleton />}
      {!loading && error && (
        <ErrorStateCard message={error} onRetry={() => void loadIssues()} />
      )}

      {!loading && !error && issues.length === 0 && (
        <EmptyStateCard
          title="No technical issues detected yet"
          description={
            selectedProjectId
              ? 'Run a technical crawl on this project to analyze indexability, canonicals, redirects, metadata, and structured data.'
              : 'Create a domain project first before inspecting technical issues.'
          }
          actionLabel={selectedProjectId ? 'Start Technical Crawl' : 'Go to Projects'}
          onAction={() => navigate(selectedProjectId ? '/audit/new' : '/projects')}
        />
      )}

      {!loading && !error && issues.length > 0 && (
        <>
          <IssueSeverityCards
            issues={issues}
            activeSeverity={severityFilter}
            onSelectSeverity={setSeverityFilter}
          />

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter issues by category"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as IssueCategory | 'All')
              }
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              <option value="All">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter issues by lifecycle status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              <option value="All">All Lifecycle States</option>
              <option value="Open">Open</option>
              <option value="Triaged">Triaged</option>
              <option value="Awaiting approval">Awaiting approval</option>
              <option value="In progress">In progress</option>
              <option value="Awaiting verification">Awaiting verification</option>
              <option value="Verified">Verified</option>
            </select>
          </div>

          <TechnicalIssueTable issues={filteredIssues} />
        </>
      )}
    </PageTransition>
  );
}
