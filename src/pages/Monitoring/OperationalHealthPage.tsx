import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Database,
  HardDriveDownload,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { OperationalHealthResponse } from '../../types/integrations';
import { integrationsService } from '../../services/integrationsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { ErrorStateCard, StatusBadge, TableRowsSkeleton } from '../../components/ui/StateViews';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OperationalHealthPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const pushToast = useToastStore((s) => s.pushToast);

  const [health, setHealth] = useState<OperationalHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<{
    backupPath: string;
    sizeBytes: number;
    createdAt: string;
  } | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsService.fetchOperationalHealth();
      setHealth(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to read operational health metrics.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await integrationsService.createBackupSnapshot();
      setLastBackup(res.backup);
      pushToast({
        title: 'SQLite WAL backup snapshot created',
        detail: `${formatBytes(res.backup.sizeBytes)}`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Backup creation failed',
        detail: err instanceof Error ? err.message : 'Permission required.',
        tone: 'warning',
      });
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Operational Monitoring &amp; Persistence
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Live SQLite WAL integrity diagnostics, crawler worker pool, security flags, and queue runs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {permissions.canManageSettings && (
            <InteractiveButton
              variant="secondary"
              size="md"
              disabled={backingUp}
              onClick={() => void handleBackup()}
            >
              <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{backingUp ? 'Snapshotting...' : 'Create SQLite Backup'}</span>
            </InteractiveButton>
          )}
          <InteractiveButton
            variant="primary"
            size="md"
            disabled={loading}
            onClick={() => void loadHealth()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh Check</span>
          </InteractiveButton>
        </div>
      </div>

      {error && <ErrorStateCard message={error} onRetry={() => void loadHealth()} />}

      {lastBackup && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/75 dark:bg-emerald-950/30 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200">
          <span className="font-semibold">Latest snapshot:</span>{' '}
          <span className="font-mono">{lastBackup.backupPath}</span> ({formatBytes(lastBackup.sizeBytes)}) ·{' '}
          {new Date(lastBackup.createdAt).toLocaleString()}
        </div>
      )}

      {loading && !health ? (
        <TableRowsSkeleton rows={5} />
      ) : (
        health && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Database Integrity */}
              <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Database Engine
                    </h2>
                  </div>
                  <StatusBadge
                    label={health.database.integrityOk ? 'Integrity OK' : 'Integrity Warning'}
                    tone={health.database.integrityOk ? 'success' : 'danger'}
                  />
                </div>
                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Engine</dt>
                    <dd className="font-mono text-[var(--text-primary)]">{health.database.engine}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Schema Version</dt>
                    <dd className="font-mono text-[var(--text-primary)]">{health.database.schemaVersion}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">DB Size</dt>
                    <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                      {formatBytes(health.database.sizeBytes)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">PRAGMA quick_check</dt>
                    <dd className="font-mono text-emerald-600 dark:text-emerald-400">
                      {health.database.integrityDetail}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Security Posture */}
              <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {health.security.productionSafe ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    )}
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Security Posture
                    </h2>
                  </div>
                  <StatusBadge
                    label={health.environment.toUpperCase()}
                    tone={health.security.productionSafe ? 'success' : 'indigo'}
                  />
                </div>
                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Dev Sandbox Accounts</dt>
                    <dd className="font-mono text-[var(--text-primary)]">
                      {health.security.devAuthEnabled ? 'Enabled (Dev)' : 'Disabled'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">SSRF Guard</dt>
                    <dd className="font-mono text-emerald-600 dark:text-emerald-400">
                      {health.security.ssrfProtectionActive ? 'Active' : 'Inactive'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Token Vault Key</dt>
                    <dd className="font-mono text-[var(--text-primary)]">
                      {health.security.encryptionKeyConfigured ? 'Configured' : 'Missing'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Google OAuth Client</dt>
                    <dd className="font-mono text-[var(--text-primary)]">
                      {health.security.oauthConfigured ? 'Configured' : 'Env Required'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Crawler Runtime & Table Volume */}
              <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" aria-hidden="true" />
                    <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      Crawler &amp; Store Counts
                    </h2>
                  </div>
                  <StatusBadge
                    label={`${health.crawler.activeCrawls} Active Crawl`}
                    tone={health.crawler.activeCrawls > 0 ? 'indigo' : 'neutral'}
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: 'Projects', v: health.database.tableCounts.projects },
                    { k: 'Crawl Runs', v: health.database.tableCounts.crawlRuns },
                    { k: 'Issues', v: health.database.tableCounts.technicalIssues },
                    { k: 'OAuth Conns', v: health.database.tableCounts.oauthIntegrations },
                    { k: 'Sync Jobs', v: health.database.tableCounts.syncJobs },
                    { k: 'Users', v: health.database.tableCounts.users },
                  ].map((c) => (
                    <div
                      key={c.k}
                      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-2"
                    >
                      <div className="font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                        {c.v}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">{c.k}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                  Headless Chromium renderer:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {health.crawler.headlessBrowserAvailable ? 'Available' : 'Raw HTML fallback mode'}
                  </span>
                </div>
              </section>
            </div>

            {/* Recent Crawl Runs */}
            <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Recent Crawl Executions (All Workspace Projects)
                </h2>
                <Link
                  to="/audit/history"
                  className="text-xs font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline"
                >
                  Audit History →
                </Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                {health.recentCrawls.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No crawl runs executed in the database yet.
                  </p>
                ) : (
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="py-2 pr-3">Crawl ID</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Processed URLs</th>
                        <th className="py-2 px-3 text-right">Errors</th>
                        <th className="py-2 pl-3">Started</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)]">
                      {health.recentCrawls.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 pr-3 font-mono text-[11px]">
                            <Link
                              to={`/audit/live/${c.id}`}
                              className="font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline"
                            >
                              {c.id}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-secondary)]">{c.crawlType}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge
                              label={c.status}
                              tone={
                                c.status === 'Completed'
                                  ? 'success'
                                  : c.status === 'Failed'
                                    ? 'danger'
                                    : 'indigo'
                              }
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                            {c.processedCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                            {c.errorCount}
                          </td>
                          <td className="py-2.5 pl-3 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                            {new Date(c.startedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )
      )}
    </PageTransition>
  );
}
