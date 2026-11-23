import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Gauge, KeyRound, Monitor, Smartphone, X } from 'lucide-react';
import { scaleIn } from '../../lib/motion';
import type { PerformanceRunStrategyMode } from '../../types/performance';
import { InteractiveButton } from '../ui/InteractivePrimitives';

export function PerformanceAuditLauncherModal({
  open,
  onClose,
  defaultDomain,
  crawlInventoryUrls,
  pageSpeedKeyConfigured,
  maxUrlsPerAudit,
  submitting,
  errorMessage,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultDomain: string;
  crawlInventoryUrls: string[];
  pageSpeedKeyConfigured: boolean;
  maxUrlsPerAudit: number;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (payload: {
    targetUrls: string[];
    strategyMode: PerformanceRunStrategyMode;
  }) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [strategyMode, setStrategyMode] =
    useState<PerformanceRunStrategyMode>('both');
  const [urlsText, setUrlsText] = useState(`https://${defaultDomain}/`);

  useEffect(() => {
    if (!open) return;
    if (crawlInventoryUrls.length > 0) {
      setUrlsText(crawlInventoryUrls.slice(0, 3).join('\n'));
    } else if (defaultDomain) {
      setUrlsText(`https://${defaultDomain}/`);
    }
  }, [open, defaultDomain, crawlInventoryUrls]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const parsedUrls = Array.from(
    new Set(
      urlsText
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perf-launcher-title"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
      />

      <motion.div
        variants={scaleIn}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        className="relative z-10 w-full max-w-xl rounded-3xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#A78BFA]">
              <Gauge className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="perf-launcher-title"
                className="font-display text-lg font-extrabold text-[var(--text-primary)]"
              >
                Run Performance &amp; Usability Audit
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Executes live Google PageSpeed Insights v5 (Lighthouse Lab + CrUX Field)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit modal"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider / API key notice */}
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${
            pageSpeedKeyConfigured
              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
              : 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200'
          }`}
        >
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {pageSpeedKeyConfigured ? (
              <span>
                <strong>PAGESPEED_API_KEY configured:</strong> Server-side requests authenticate with your dedicated Google Cloud quota.
              </span>
            ) : (
              <span>
                <strong>Public PageSpeed quota active:</strong> <code>PAGESPEED_API_KEY</code> is not configured in server environment variables. Single checks work within Google&apos;s public rate limit; multi-URL batches may receive HTTP 429 until configured.
              </span>
            )}
          </div>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              targetUrls: parsedUrls,
              strategyMode,
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Device Emulation Strategy
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { id: 'both' as const, label: 'Mobile + Desktop', icon: Gauge },
                { id: 'mobile' as const, label: 'Mobile Only', icon: Smartphone },
                { id: 'desktop' as const, label: 'Desktop Only', icon: Monitor },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = strategyMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStrategyMode(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      active
                        ? 'border-[#7047EB] bg-[#7047EB]/12 text-[#7047EB] dark:text-[#C4B5FD]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="perf-target-urls"
                className="text-xs font-semibold text-[var(--text-primary)]"
              >
                Target URLs (one per line · max {maxUrlsPerAudit})
              </label>
              <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                {parsedUrls.length}/{maxUrlsPerAudit} URLs
              </span>
            </div>
            <textarea
              id="perf-target-urls"
              rows={4}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder={`https://${defaultDomain}/`}
              className="mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            />
            {crawlInventoryUrls.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Quick fill from latest crawl:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setUrlsText(crawlInventoryUrls.slice(0, 5).join('\n'))
                  }
                  className="text-[11px] font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline cursor-pointer"
                >
                  Load top {Math.min(5, crawlInventoryUrls.length)} crawled URLs
                </button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/35 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <InteractiveButton
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </InteractiveButton>
            <InteractiveButton
              variant="primary"
              size="md"
              type="submit"
              disabled={
                submitting ||
                parsedUrls.length === 0 ||
                parsedUrls.length > maxUrlsPerAudit
              }
            >
              {submitting ? 'Queuing Audit...' : 'Launch Live Audit'}
            </InteractiveButton>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
