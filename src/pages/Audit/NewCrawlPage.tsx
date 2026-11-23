import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CrawlConfigResponse } from '../../types/audit';
import type { CrawlConfigurationData, VerificationMethod } from '../../types/crawl';
import { MOTION_EASE } from '../../config/motion';
import { ApiError } from '../../services/apiClient';
import { crawlService } from '../../services/crawlService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { DashboardSkeleton, EmptyStateCard, ErrorStateCard } from '../../components/ui/StateViews';
import { AuditSubNav } from '../../components/audit/AuditSubNav';
import { CrawlConfiguration } from '../../components/audit/CrawlConfiguration';

const OPERATOR_ROLES = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Developer',
];

export function NewCrawlPage() {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { selectedProjectId, projects, loadProjectsOnly } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);
  const [data, setData] = useState<CrawlConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!selectedProjectId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await crawlService.fetchCrawlConfig(selectedProjectId);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load crawl configuration.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (projects.length === 0) void loadProjectsOnly();
  }, [projects.length, loadProjectsOnly]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const canOperate = OPERATOR_ROLES.includes(user?.role ?? 'QA');

  const handleVerifyDomain = async (payload: {
    canonicalDomain: string;
    verificationMethod: VerificationMethod;
    crawlPolicyApproved: boolean;
  }) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await crawlService.verifyDomain(selectedProjectId, payload);
      setData((prev) =>
        prev ? { ...prev, verification: res.verification } : prev,
      );
      const msg = `Verified ownership for ${res.verification.canonicalDomain} via ${res.verification.verificationMethod}.`;
      setNotice(msg);
      pushToast({
        title: 'Domain Ownership Verified',
        detail: msg,
        tone: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Domain verification failed.';
      setError(msg);
      pushToast({ title: 'Verification Failed', detail: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = async (next: CrawlConfigurationData) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await crawlService.saveCrawlConfig(selectedProjectId, next);
      setData((prev) =>
        prev ? { ...prev, configuration: res.configuration } : prev,
      );
      setNotice('Crawl configuration saved.');
      pushToast({
        title: 'Crawl Settings Saved',
        detail: `${res.configuration.maxPages} pages · depth ${res.configuration.maxDepth}`,
        tone: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
      setError(msg);
      pushToast({ title: 'Save Failed', detail: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleStartCrawl = async (next: CrawlConfigurationData) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await crawlService.saveCrawlConfig(selectedProjectId, next);
      const res = await crawlService.startCrawl(selectedProjectId, next);
      pushToast({
        title: 'Crawl Started',
        detail: `Monitoring live execution ${res.crawlRun.id}`,
        tone: 'info',
      });
      navigate(`/audit/live/${res.crawlRun.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start crawl.';
      setError(msg);
      pushToast({ title: 'Unable to Start Crawl', detail: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Configure &amp; Launch Crawl
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Verify domain ownership, enforce SSRF &amp; rate guardrails, and start a live technical crawl.
        </p>
      </div>

      <AuditSubNav
        latestCrawlId={data?.previousCrawl?.id}
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

      {!selectedProjectId && !loading && (
        <EmptyStateCard
          title="No domain project selected"
          description="Create a domain project first so you can verify ownership and configure crawl parameters."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      )}

      {error && <ErrorStateCard message={error} onRetry={() => void loadConfig()} />}

      {selectedProjectId && loading && <DashboardSkeleton />}

      {selectedProjectId && !loading && data && (
        <CrawlConfiguration
          key={`${selectedProjectId}-${data.verification.canonicalDomain}`}
          verification={data.verification}
          configuration={data.configuration}
          rendererAvailable={data.rendererAvailable}
          policySummary={data.policySummary}
          estimatedScope={data.estimatedScope}
          canOperate={canOperate}
          busy={busy}
          onVerifyDomain={handleVerifyDomain}
          onSaveConfig={handleSaveConfig}
          onStartCrawl={handleStartCrawl}
        />
      )}
    </PageTransition>
  );
}
