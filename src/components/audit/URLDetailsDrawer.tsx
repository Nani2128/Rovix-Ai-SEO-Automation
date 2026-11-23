import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Code2, FileText, GitFork, X } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { CrawlURLRecord } from '../../types/crawl';
import { crawlService } from '../../services/crawlService';
import { AnimatedDrawer, LoadingShimmer } from '../animation/MotionPrimitives';
import { SegmentedTabs } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

type SnapshotTabId = 'signals' | 'raw' | 'dom';

const SNAPSHOT_TABS: readonly { id: SnapshotTabId; label: string; icon: typeof FileText }[] = [
  { id: 'signals', label: 'Extracted SEO Signals', icon: FileText },
  { id: 'raw', label: 'Raw HTML', icon: Code2 },
  { id: 'dom', label: 'Rendered DOM', icon: GitFork },
];

export function URLDetailsDrawer({
  crawlId,
  urlRecord,
  onClose,
}: {
  crawlId: string;
  urlRecord: CrawlURLRecord | null;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [snapshotTab, setSnapshotTab] = useState<SnapshotTabId>('signals');
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [renderedDom, setRenderedDom] = useState<string | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  useEffect(() => {
    if (!urlRecord) return;
    setSnapshotTab('signals');
    setRawHtml(null);
    setRenderedDom(null);
    setLoadingSnap(true);
    crawlService
      .fetchUrlSnapshot(crawlId, urlRecord.id)
      .then((res) => {
        setRawHtml(res.rawHtml);
        setRenderedDom(res.renderedDom);
      })
      .catch(() => {
        // Snapshot optional if missing
      })
      .finally(() => setLoadingSnap(false));
  }, [crawlId, urlRecord]);

  return (
    <AnimatedDrawer
      open={Boolean(urlRecord)}
      onClose={onClose}
      ariaLabel="URL inspection details"
      maxWidthClass="max-w-2xl"
    >
      {urlRecord && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-6 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={`HTTP ${urlRecord.statusCode || 'ERR'}`}
                  tone={
                    urlRecord.statusCode >= 200 && urlRecord.statusCode < 300
                      ? 'success'
                      : urlRecord.statusCode >= 300 && urlRecord.statusCode < 400
                        ? 'warning'
                        : 'danger'
                  }
                />
                <StatusBadge
                  label={urlRecord.indexability}
                  tone={
                    urlRecord.indexability === 'Indexable' ? 'success' : 'warning'
                  }
                />
                <StatusBadge
                  label={
                    urlRecord.renderingSource === 'rendered_dom'
                      ? 'JS DOM Rendered'
                      : 'Raw HTML'
                  }
                  tone="indigo"
                />
              </div>
              <h2 className="mt-2 break-all font-mono text-sm font-bold text-[var(--text-primary)]">
                {urlRecord.normalizedUrl}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                {urlRecord.indexabilityReason} · Depth {urlRecord.depth} ·{' '}
                {urlRecord.responseTimeMs}ms
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close URL inspector"
              className="rounded-xl border border-[var(--border-hairline)] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tab Bar */}
          <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-6 py-2.5">
            <SegmentedTabs
              layoutGroupId="url-drawer-tab"
              activeId={snapshotTab}
              onChange={setSnapshotTab}
              tabs={SNAPSHOT_TABS.map((t) => {
                const Icon = t.icon;
                return {
                  id: t.id,
                  label: t.label,
                  icon: <Icon className="h-3.5 w-3.5" aria-hidden="true" />,
                };
              })}
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 text-xs">
            {snapshotTab === 'signals' && (
              <motion.div
                key="signals"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, ease: MOTION_EASE }}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                    <div className="font-semibold text-[var(--text-muted)]">Title Tag</div>
                    <div className="mt-1 font-medium text-[var(--text-primary)]">
                      {urlRecord.title ?? 'Missing'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
                    <div className="font-semibold text-[var(--text-muted)]">Primary H1</div>
                    <div className="mt-1 font-medium text-[var(--text-primary)]">
                      {urlRecord.h1 ?? 'Missing'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 sm:col-span-2">
                    <div className="font-semibold text-[var(--text-muted)]">
                      Meta Description
                    </div>
                    <div className="mt-1 text-[var(--text-primary)]">
                      {urlRecord.metaDescription ?? 'Missing'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 sm:col-span-2">
                    <div className="font-semibold text-[var(--text-muted)]">
                      Canonical ({urlRecord.canonicalStatus})
                    </div>
                    <div className="mt-1 font-mono text-[var(--text-primary)] break-all">
                      {urlRecord.canonicalUrl ?? 'None emitted'}
                    </div>
                  </div>
                </div>

                {urlRecord.redirectChain.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/12 p-4">
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                      Redirect Chain ({urlRecord.redirectChain.length} hop(s))
                    </div>
                    <ul className="mt-2 space-y-1 font-mono text-[11px] text-amber-950 dark:text-amber-100">
                      {urlRecord.redirectChain.map((h, i) => (
                        <li key={`${h.url}-${i}`}>
                          {h.statusCode} {h.url} → {h.location}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {urlRecord.renderedDiff && (
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
                    <div className="font-semibold text-[var(--text-primary)]">
                      JS Rendering Diff ({urlRecord.renderedDiff.status})
                    </div>
                    <p className="mt-1 text-[var(--text-muted)]">
                      {urlRecord.renderedDiff.reason ??
                        `Added ${urlRecord.renderedDiff.addedLinksCount} internal link(s) after JS hydration.`}
                    </p>
                    {urlRecord.renderedDiff.addedLinks.length > 0 && (
                      <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#7047EB] dark:text-[#A78BFA]">
                        {urlRecord.renderedDiff.addedLinks.map((lnk) => (
                          <li key={lnk}>+ {lnk}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
                    <div className="font-semibold text-[var(--text-muted)]">
                      Schema Types ({urlRecord.schemaTypes.length})
                    </div>
                    <div className="mt-1 text-[var(--text-primary)]">
                      {urlRecord.schemaTypes.join(', ') || 'None'}
                    </div>
                    {urlRecord.schemaErrors.length > 0 && (
                      <div className="mt-2 text-rose-600 dark:text-rose-400">
                        {urlRecord.schemaErrors.join('; ')}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5">
                    <div className="font-semibold text-[var(--text-muted)]">
                      Links &amp; Hygiene
                    </div>
                    <div className="mt-1 text-[var(--text-primary)] tabular-nums">
                      Internal: {urlRecord.internalLinks.length} · External:{' '}
                      {urlRecord.externalLinks.length}
                    </div>
                    <div className="mt-1 text-[var(--text-muted)] tabular-nums">
                      Missing img alt: {urlRecord.missingAltCount} · Viewport:{' '}
                      {urlRecord.hasViewport ? 'Yes' : 'No'} · Lang:{' '}
                      {urlRecord.htmlLang ?? 'None'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {snapshotTab === 'raw' && (
              <motion.div
                key="raw"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, ease: MOTION_EASE }}
              >
                {loadingSnap ? (
                  <div className="space-y-2">
                    <LoadingShimmer className="h-6 w-48 rounded-lg" />
                    <LoadingShimmer className="h-56 w-full rounded-xl" />
                  </div>
                ) : (
                  <pre className="max-h-[70vh] overflow-auto rounded-xl border border-[var(--border-hairline)] bg-slate-950 p-4 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                    {rawHtml ?? 'No raw HTML snapshot captured for this response.'}
                  </pre>
                )}
              </motion.div>
            )}

            {snapshotTab === 'dom' && (
              <motion.div
                key="dom"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, ease: MOTION_EASE }}
              >
                {loadingSnap ? (
                  <div className="space-y-2">
                    <LoadingShimmer className="h-6 w-48 rounded-lg" />
                    <LoadingShimmer className="h-56 w-full rounded-xl" />
                  </div>
                ) : (
                  <pre className="max-h-[70vh] overflow-auto rounded-xl border border-[var(--border-hairline)] bg-slate-950 p-4 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                    {renderedDom ??
                      'No rendered DOM snapshot captured (either JS rendering was disabled, unavailable, or raw HTML was used).'}
                  </pre>
                )}
              </motion.div>
            )}
          </div>
        </>
      )}
    </AnimatedDrawer>
  );
}
