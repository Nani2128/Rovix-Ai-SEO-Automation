import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Gauge,
  Globe,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import type {
  GooglePropertyOption,
  IntegrationsOverviewResponse,
  OAuthIntegrationRecord,
  PageSpeedCheckResult,
} from '../../types/integrations';
import { integrationsService } from '../../services/integrationsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { EmptyStateCard, ErrorStateCard, StatusBadge, TableRowsSkeleton } from '../../components/ui/StateViews';
import { Link } from 'react-router-dom';

const PROVIDER_META: Record<
  'gsc' | 'ga4',
  {
    title: string;
    subtitle: string;
    scope: string;
  }
> = {
  gsc: {
    title: 'Google Search Console',
    subtitle: 'Verified search clicks, impressions, CTR, average position, and top queries.',
    scope: 'webmasters.readonly',
  },
  ga4: {
    title: 'Google Analytics 4',
    subtitle: 'Real organic sessions, active users, key events, and top landing pages.',
    scope: 'analytics.readonly',
  },
};

export function IntegrationsPage() {
  const { projects, selectedProjectId, loadProjectsOnly, loadDashboardData } =
    useDashboardStore();
  const permissions = useAuthStore((s) => s.permissions);
  const pushToast = useToastStore((s) => s.pushToast);

  const [overview, setOverview] = useState<IntegrationsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [propertiesByProvider, setPropertiesByProvider] = useState<
    Record<'gsc' | 'ga4', GooglePropertyOption[]>
  >({ gsc: [], ga4: [] });
  const [selectedPropertyMap, setSelectedPropertyMap] = useState<
    Record<'gsc' | 'ga4', string>
  >({ gsc: '', ga4: '' });
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  // PageSpeed Insights live URL check
  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const [psiUrl, setPsiUrl] = useState('');
  const [psiStrategy, setPsiStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [psiLoading, setPsiLoading] = useState(false);
  const [psiResult, setPsiResult] = useState<PageSpeedCheckResult | null>(null);
  const [psiError, setPsiError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  useEffect(() => {
    if (activeProject?.website && !psiUrl) {
      setPsiUrl(activeProject.website);
    }
  }, [activeProject, psiUrl]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsService.fetchOverview(selectedProjectId);
      setOverview(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to inspect integrations status.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'rovix_oauth_complete') {
        void loadOverview();
        void loadDashboardData();
        pushToast({
          title: 'Google authorization updated',
          detail: event.data.provider
            ? `${String(event.data.provider).toUpperCase()} connection refreshed.`
            : undefined,
          tone: event.data.status === 'error' ? 'warning' : 'success',
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadOverview, loadDashboardData, pushToast]);

  const handleCopy = (label: string, val: string) => {
    void navigator.clipboard.writeText(val);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const handleConnectOAuth = async (provider: 'gsc' | 'ga4') => {
    if (!selectedProjectId) return;
    setBusyProvider(`connect-${provider}`);
    try {
      const { url } = await integrationsService.getOAuthUrl(provider, selectedProjectId);
      const popup = window.open(
        url,
        `rovix_oauth_${provider}`,
        'width=540,height=680,menubar=no,toolbar=no',
      );
      if (!popup) {
        pushToast({
          title: 'Popup blocked',
          detail: 'Allow popups for this site or authorize Google in a new tab.',
          tone: 'warning',
        });
      }
    } catch (err) {
      pushToast({
        title: `Cannot initiate ${provider.toUpperCase()} OAuth`,
        detail: err instanceof Error ? err.message : 'Configuration missing.',
        tone: 'warning',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleLoadProperties = async (provider: 'gsc' | 'ga4') => {
    if (!selectedProjectId) return;
    setBusyProvider(`props-${provider}`);
    try {
      const res = await integrationsService.listProperties(provider, selectedProjectId);
      setPropertiesByProvider((prev) => ({ ...prev, [provider]: res.properties }));
      if (res.properties[0]) {
        setSelectedPropertyMap((prev) => ({
          ...prev,
          [provider]: prev[provider] || res.properties[0].id,
        }));
      }
      if (res.properties.length === 0) {
        pushToast({
          title: 'No accessible properties found',
          detail: `This Google account has no ${provider.toUpperCase()} properties.`,
          tone: 'info',
        });
      }
    } catch (err) {
      pushToast({
        title: `Unable to load ${provider.toUpperCase()} properties`,
        detail: err instanceof Error ? err.message : 'Authorization required.',
        tone: 'warning',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleSelectProperty = async (provider: 'gsc' | 'ga4') => {
    if (!selectedProjectId) return;
    const propId = selectedPropertyMap[provider];
    const propObj = propertiesByProvider[provider].find((p) => p.id === propId);
    if (!propId || !propObj) return;
    setBusyProvider(`save-${provider}`);
    try {
      await integrationsService.selectProperty(provider, {
        projectId: selectedProjectId,
        propertyId: propObj.id,
        propertyName: propObj.name,
      });
      await loadOverview();
      pushToast({
        title: `${provider.toUpperCase()} property bound`,
        detail: propObj.name,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Unable to save property binding',
        detail: err instanceof Error ? err.message : 'Request failed.',
        tone: 'warning',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleSync = async (provider: 'gsc' | 'ga4') => {
    if (!selectedProjectId) return;
    setBusyProvider(`sync-${provider}`);
    try {
      const res = await integrationsService.syncProvider(provider, {
        projectId: selectedProjectId,
        days: 30,
        awaitCompletion: true,
      });
      await loadOverview();
      await loadDashboardData();
      pushToast({
        title: `${provider.toUpperCase()} sync ${res.syncJob.status}`,
        detail: `${res.syncJob.recordsSynced} record(s) stored.`,
        tone: res.syncJob.status === 'Succeeded' ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: `${provider.toUpperCase()} sync failed`,
        detail: err instanceof Error ? err.message : 'Unable to sync.',
        tone: 'warning',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (provider: 'gsc' | 'ga4') => {
    if (!selectedProjectId) return;
    setBusyProvider(`disc-${provider}`);
    try {
      await integrationsService.disconnectProvider(provider, selectedProjectId);
      await loadOverview();
      await loadDashboardData();
      pushToast({
        title: `${provider.toUpperCase()} disconnected`,
        detail: 'Stored OAuth tokens revoked and wiped from encrypted vault.',
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Disconnect failed',
        detail: err instanceof Error ? err.message : 'Unable to disconnect.',
        tone: 'warning',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleRunPsi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!psiUrl.trim()) return;
    setPsiLoading(true);
    setPsiError(null);
    try {
      const res = await integrationsService.runPageSpeedCheck({
        url: psiUrl.trim(),
        strategy: psiStrategy,
      });
      setPsiResult(res.result);
    } catch (err) {
      setPsiError(
        err instanceof Error ? err.message : 'PageSpeed Insights request failed.',
      );
    } finally {
      setPsiLoading(false);
    }
  };

  const getIntegrationRecord = (
    provider: 'gsc' | 'ga4',
  ): OAuthIntegrationRecord | null =>
    overview?.integrations.find((i) => i.provider === provider) ?? null;

  const badgeToneForStatus = (status: string) => {
    if (status === 'Connected' || status === 'Succeeded') return 'success';
    if (status === 'Expired' || status === 'Error' || status === 'Failed') return 'danger';
    if (status === 'Running' || status === 'Retrying' || status === 'Queued') return 'indigo';
    if (status === 'Config Required') return 'warning';
    return 'neutral';
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Integrations &amp; Data Connectors
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Real OAuth 2.0 connections encrypted with AES-256-GCM at rest · Zero simulated connector states
          </p>
        </div>

        <InteractiveButton
          variant="secondary"
          size="md"
          onClick={() => void loadOverview()}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Refresh Status</span>
        </InteractiveButton>
      </div>

      {error && <ErrorStateCard message={error} onRetry={() => void loadOverview()} />}

      {/* OAuth Callback URLs & Server Readiness */}
      {overview && (
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Google OAuth 2.0 Configuration &amp; Callback URIs
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Register these exact Authorized Redirect URIs inside Google Cloud Console
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={overview.oauthConfigured ? 'OAuth Credentials Ready' : 'OAuth Env Vars Missing'}
                tone={overview.oauthConfigured ? 'success' : 'warning'}
              />
              <StatusBadge
                label={overview.encryptionConfigured ? 'AES-256-GCM Vault Active' : 'Vault Key Missing'}
                tone={overview.encryptionConfigured ? 'success' : 'danger'}
              />
              <StatusBadge
                label={overview.pageSpeedKeyConfigured ? 'PSI API Key Configured' : 'PSI Public Quota'}
                tone={overview.pageSpeedKeyConfigured ? 'indigo' : 'neutral'}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[
              { id: 'dev', label: 'Development Callback URL', url: overview.callbackUrls.dev },
              { id: 'shared', label: 'Shared App Callback URL', url: overview.callbackUrls.shared },
            ].map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {item.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-primary)]">
                    {item.url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(item.id, item.url)}
                  aria-label={`Copy ${item.label}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[#7047EB]/40 hover:text-[#7047EB] cursor-pointer transition-colors"
                >
                  {copiedKey === item.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {!overview.oauthConfigured && overview.requiredEnvVars.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/75 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Setup required before OAuth sign-in:</span>{' '}
              Configure server secrets{' '}
              <span className="font-mono font-semibold">
                {overview.requiredEnvVars.join(', ')}
              </span>{' '}
              in your environment panel. Once set, OAuth authorizations and property syncing activate immediately.
            </div>
          )}
        </section>
      )}

      {/* No project guard */}
      {!selectedProjectId ? (
        <EmptyStateCard
          title="No domain project selected"
          description="Add a domain project first to bind Google Search Console or Google Analytics 4 properties to that domain."
          actionLabel="Add Domain Project"
          onAction={() => {
            window.location.href = '/projects';
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(['gsc', 'ga4'] as const).map((provider) => {
            const meta = PROVIDER_META[provider];
            const record = getIntegrationRecord(provider);
            const props = propertiesByProvider[provider];
            const isConnected = record?.status === 'Connected';

            return (
              <section
                key={provider}
                className="flex flex-col justify-between rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/10 text-[#7047EB] dark:text-[#A78BFA]">
                        <Link2 className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                          {meta.title}
                        </h2>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {meta.subtitle}
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      label={record?.status ?? 'Not Connected'}
                      tone={badgeToneForStatus(record?.status ?? 'Not Connected')}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 text-xs">
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Authorized Account</div>
                      <div className="mt-0.5 font-medium text-[var(--text-primary)] truncate">
                        {record?.accountEmail ?? 'Not Connected'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Bound Property</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--text-primary)] truncate">
                        {record?.propertyName ?? record?.propertyId ?? 'None selected'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Last Synced</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {record?.lastSyncedAt
                          ? new Date(record.lastSyncedAt).toLocaleString()
                          : 'Never'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Scope</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                        {meta.scope}
                      </div>
                    </div>
                  </div>

                  {record?.lastError && (
                    <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/75 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                      {record.lastError}
                    </div>
                  )}

                  {isConnected && props.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Select ${meta.title} property`}
                        value={selectedPropertyMap[provider] || record?.propertyId || ''}
                        onChange={(e) =>
                          setSelectedPropertyMap((prev) => ({
                            ...prev,
                            [provider]: e.target.value,
                          }))
                        }
                        className="min-w-[200px] flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
                      >
                        {props.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <InteractiveButton
                        variant="secondary"
                        size="sm"
                        disabled={busyProvider === `save-${provider}`}
                        onClick={() => void handleSelectProperty(provider)}
                      >
                        Save Property
                      </InteractiveButton>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-4">
                  {!permissions.canManageIntegrations ? (
                    <span className="text-xs text-[var(--text-muted)]">
                      Integration authorization requires Admin, Owner, Strategist, PM, or Developer role.
                    </span>
                  ) : (
                    <>
                      <InteractiveButton
                        variant={isConnected ? 'secondary' : 'primary'}
                        size="sm"
                        disabled={
                          !overview?.oauthConfigured ||
                          busyProvider === `connect-${provider}`
                        }
                        onClick={() => void handleConnectOAuth(provider)}
                      >
                        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isConnected ? 'Re-authorize Google' : `Connect ${provider.toUpperCase()}`}</span>
                      </InteractiveButton>

                      {isConnected && (
                        <>
                          <InteractiveButton
                            variant="secondary"
                            size="sm"
                            disabled={busyProvider === `props-${provider}`}
                            onClick={() => void handleLoadProperties(provider)}
                          >
                            Load Properties
                          </InteractiveButton>
                          <InteractiveButton
                            variant="primary"
                            size="sm"
                            disabled={
                              !record?.propertyId || busyProvider === `sync-${provider}`
                            }
                            onClick={() => void handleSync(provider)}
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${
                                busyProvider === `sync-${provider}` ? 'animate-spin' : ''
                              }`}
                              aria-hidden="true"
                            />
                            <span>Sync Now</span>
                          </InteractiveButton>
                          <button
                            type="button"
                            onClick={() => void handleDisconnect(provider)}
                            disabled={busyProvider === `disc-${provider}`}
                            className="ml-auto inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-800/60 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Disconnect</span>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Live PageSpeed Insights v5 URL Diagnostic */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Gauge className="h-5 w-5 text-[#0891B2] dark:text-[#22D3EE]" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Google PageSpeed Insights v5 (Live Core Web Vitals)
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Fetches real Lighthouse scores and CrUX / Lab Core Web Vitals directly from Google APIs
              </p>
            </div>
          </div>
          {activeProject && (
            <span className="font-mono text-xs text-[var(--text-muted)]">
              Active target: {activeProject.website}
            </span>
          )}
        </div>

        <form onSubmit={(e) => void handleRunPsi(e)} className="mt-4 flex flex-wrap items-center gap-2.5">
          <input
            type="url"
            required
            value={psiUrl}
            onChange={(e) => setPsiUrl(e.target.value)}
            placeholder="https://example.com/"
            aria-label="URL to test with PageSpeed Insights"
            className="min-w-[260px] flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none"
          />
          <select
            aria-label="PageSpeed strategy"
            value={psiStrategy}
            onChange={(e) => setPsiStrategy(e.target.value as 'mobile' | 'desktop')}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
          <InteractiveButton type="submit" variant="primary" size="md" disabled={psiLoading}>
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{psiLoading ? 'Running Lighthouse...' : 'Run PageSpeed Check'}</span>
          </InteractiveButton>
        </form>

        {psiError && (
          <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/75 dark:bg-rose-950/30 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
            {psiError}
          </div>
        )}

        {psiResult && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[
              { label: 'Performance', val: psiResult.performanceScore !== null ? `${psiResult.performanceScore}/100` : 'N/A' },
              { label: 'SEO', val: psiResult.seoScore !== null ? `${psiResult.seoScore}/100` : 'N/A' },
              { label: 'Accessibility', val: psiResult.accessibilityScore !== null ? `${psiResult.accessibilityScore}/100` : 'N/A' },
              { label: 'Best Practices', val: psiResult.bestPracticesScore !== null ? `${psiResult.bestPracticesScore}/100` : 'N/A' },
              { label: 'LCP', val: psiResult.metrics.lcp ?? 'N/A' },
              { label: 'CLS', val: psiResult.metrics.cls ?? 'N/A' },
              { label: 'INP', val: psiResult.metrics.inp ?? 'N/A' },
              { label: 'TTFB', val: psiResult.metrics.ttfb ?? 'N/A' },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3"
              >
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {m.label}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                  {m.val}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sync Jobs History */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
          <div>
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Sync Queue &amp; Job History
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Persistent deduplicated sync executions across connected providers
            </p>
          </div>
          <Link
            to="/monitoring"
            className="text-xs font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline"
          >
            System Health →
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <TableRowsSkeleton rows={3} />
          ) : !overview || overview.syncJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-[var(--text-muted)]">
              <Unplug className="mb-2 h-5 w-5 opacity-60" aria-hidden="true" />
              No provider sync jobs executed for this project yet.
            </div>
          ) : (
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 px-3">Job Type</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Attempts</th>
                  <th className="py-2 px-3 text-right">Records</th>
                  <th className="py-2 px-3">Created</th>
                  <th className="py-2 pl-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {overview.syncJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold uppercase text-[var(--text-primary)]">
                      {job.provider}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {job.jobType}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={job.status} tone={badgeToneForStatus(job.status)} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {job.attemptCount}/{job.maxAttempts}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {job.recordsSynced}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pl-3 text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                      {job.errorMessage ?? (job.completedAt ? 'Completed cleanly' : 'Queued')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </PageTransition>
  );
}
