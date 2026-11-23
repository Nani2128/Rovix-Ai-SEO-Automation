import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { DeveloperTaskStatus, DeveloperTicket } from '../../types/technicalIssue';
import { integrationsService } from '../../services/integrationsService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { EmptyStateCard, ErrorStateCard, StatusBadge, TableRowsSkeleton } from '../../components/ui/StateViews';

const STATUS_FILTERS: readonly (DeveloperTaskStatus | 'All')[] = [
  'All',
  'Proposed',
  'Triaged',
  'Awaiting approval',
  'Approved',
  'In progress',
  'Blocked',
  'Awaiting verification',
  'Verified',
  'Rejected',
];

function toneForTicketStatus(status: DeveloperTaskStatus) {
  if (status === 'Verified' || status === 'Approved') return 'success';
  if (status === 'Awaiting verification' || status === 'In progress') return 'indigo';
  if (status === 'Awaiting approval' || status === 'Triaged') return 'warning';
  if (status === 'Blocked' || status === 'Rejected') return 'danger';
  return 'neutral';
}

export function TasksPage() {
  const navigate = useNavigate();
  const { projects, selectedProjectId, loadProjectsOnly } = useDashboardStore();
  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const [tickets, setTickets] = useState<DeveloperTicket[]>([]);
  const [filterStatus, setFilterStatus] = useState<DeveloperTaskStatus | 'All'>('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  const loadTickets = useCallback(async () => {
    if (!selectedProjectId) {
      setTickets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await integrationsService.fetchProjectTickets(selectedProjectId);
      setTickets(res.tickets);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load remediation tasks.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const filtered =
    filterStatus === 'All'
      ? tickets
      : tickets.filter((t) => t.taskStatus === filterStatus);

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Tasks &amp; Engineering Approvals
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {activeProject
              ? `Remediation tickets created from verified technical crawl findings on ${activeProject.name}`
              : 'Select a domain project to inspect assigned technical SEO tasks'}
          </p>
        </div>

        {selectedProjectId && (
          <InteractiveButton
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={() => void loadTickets()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </InteractiveButton>
        )}
      </div>

      {!selectedProjectId ? (
        <EmptyStateCard
          title="No domain project selected"
          description="Create or select a domain project to track remediation tasks generated from site crawls."
          actionLabel="Add Domain Project"
          onAction={() => navigate('/projects')}
        />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadTickets()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  filterStatus === st
                    ? 'border-[#7047EB] bg-[#7047EB]/10 text-[#7047EB] dark:text-[#C4B5FD]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            {loading ? (
              <TableRowsSkeleton rows={5} />
            ) : filtered.length === 0 ? (
              <EmptyStateCard
                title="No remediation tickets found"
                description="Run a technical SEO crawl and create developer handoff tickets from any detected issue."
                actionLabel="Inspect Technical Issues"
                onAction={() => navigate('/audit/issues')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-2.5 pr-3">Task</th>
                      <th className="py-2.5 px-3">Owner Role</th>
                      <th className="py-2.5 px-3">Assignee</th>
                      <th className="py-2.5 px-3">Task Status</th>
                      <th className="py-2.5 px-3">Approval</th>
                      <th className="py-2.5 px-3">Verification</th>
                      <th className="py-2.5 pl-3 text-right">Issue &amp; Reverify</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-[var(--text-primary)]">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate max-w-[300px]">
                              {t.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[var(--text-secondary)]">
                          {t.responsibleRole}
                        </td>
                        <td className="py-3 px-3 text-[var(--text-secondary)]">
                          {t.assignedUser || 'Unassigned'}
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge
                            label={t.taskStatus}
                            tone={toneForTicketStatus(t.taskStatus)}
                          />
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge
                            label={t.approvalStatus}
                            tone={
                              t.approvalStatus === 'Dual Approved' ||
                              t.approvalStatus === 'Developer Approved'
                                ? 'success'
                                : t.approvalStatus === 'Rejected'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          />
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge
                            label={t.verificationStatus}
                            tone={
                              t.verificationStatus === 'Verified'
                                ? 'success'
                                : t.verificationStatus === 'Failed'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          />
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <Link
                            to={`/audit/issues/${t.issueId}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:border-[#7047EB]/40"
                          >
                            <span>Inspect Issue</span>
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </PageTransition>
  );
}
