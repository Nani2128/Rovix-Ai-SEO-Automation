import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { integrationsService } from '../../services/integrationsService';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { EmptyStateCard, ErrorStateCard, StatusBadge, TableRowsSkeleton } from '../../components/ui/StateViews';

type ProjectReportPayload = Awaited<
  ReturnType<typeof integrationsService.fetchProjectReportJson>
>;

export function ReportsPage() {
  const navigate = useNavigate();
  const { selectedProjectId, loadProjectsOnly } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [report, setReport] = useState<ProjectReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<'json' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  const loadReport = useCallback(async () => {
    if (!selectedProjectId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsService.fetchProjectReportJson(selectedProjectId);
      setReport(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to generate project report.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleDownload = async (format: 'json' | 'csv') => {
    if (!selectedProjectId) return;
    setDownloading(format);
    try {
      await integrationsService.downloadProjectReport(selectedProjectId, format);
      pushToast({
        title: `Exported ${format.toUpperCase()} report`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Export failed',
        detail: err instanceof Error ? err.message : 'Unable to export report.',
        tone: 'warning',
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Executive Reports &amp; Exports
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Live SQLite snapshot summaries exported from actual crawls, technical issues, and keyword records
          </p>
        </div>

        {selectedProjectId && (
          <div className="flex flex-wrap items-center gap-2.5">
            <InteractiveButton
              variant="secondary"
              size="md"
              disabled={loading}
              onClick={() => void loadReport()}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </InteractiveButton>
            <InteractiveButton
              variant="secondary"
              size="md"
              disabled={downloading === 'csv'}
              onClick={() => void handleDownload('csv')}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </InteractiveButton>
            <InteractiveButton
              variant="primary"
              size="md"
              disabled={downloading === 'json'}
              onClick={() => void handleDownload('json')}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Download JSON</span>
            </InteractiveButton>
          </div>
        )}
      </div>

      {!selectedProjectId ? (
        <EmptyStateCard
          title="No domain project selected"
          description="Select or create a domain project to compile real CSV and JSON stakeholder reports."
          actionLabel="Add Domain Project"
          onAction={() => navigate('/projects')}
        />
      ) : error ? (
        <ErrorStateCard message={error} onRetry={() => void loadReport()} />
      ) : loading && !report ? (
        <TableRowsSkeleton rows={5} />
      ) : (
        report && (
          <div className="space-y-5">
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-5 w-5 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
                  <div>
                    <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                      {report.project.name} · {report.project.website}
                    </h2>
                    <p className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      Generated {new Date(report.generatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={report.gscConnected ? 'GSC Connected' : 'GSC Disconnected'}
                    tone={report.gscConnected ? 'success' : 'neutral'}
                  />
                  <StatusBadge
                    label={report.ga4Connected ? 'GA4 Connected' : 'GA4 Disconnected'}
                    tone={report.ga4Connected ? 'success' : 'neutral'}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: 'Total Issues', value: report.summary.totalIssues },
                  { label: 'Open Issues', value: report.summary.openIssues },
                  { label: 'Verified Fixed', value: report.summary.verifiedFixedIssues },
                  { label: 'Tracked Keywords', value: report.summary.totalKeywords },
                  { label: 'Approved Keywords', value: report.summary.approvedKeywords },
                  { label: 'Open Dev Tickets', value: report.summary.openTickets },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {m.label}
                    </div>
                    <div className="mt-1 font-display text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Latest Crawl Baseline Included in Report
              </h2>
              {!report.latestCrawl ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  No crawl executed yet for this domain project. Run a Technical SEO Audit to include crawl telemetry in reports.
                </p>
              ) : (
                <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-5">
                  <div>
                    <dt className="text-[var(--text-muted)]">Crawl ID</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-[var(--text-primary)]">
                      {report.latestCrawl.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Status</dt>
                    <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">
                      {report.latestCrawl.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">URLs Crawled</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-[var(--text-primary)]">
                      {report.latestCrawl.processedCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Fetch Errors</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-[var(--text-primary)]">
                      {report.latestCrawl.errorCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">SEO Health Score</dt>
                    <dd className="mt-0.5 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {report.latestCrawl.seoHealthScore !== null
                        ? `${report.latestCrawl.seoHealthScore}/100`
                        : 'Pending'}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          </div>
        )
      )}
    </PageTransition>
  );
}
