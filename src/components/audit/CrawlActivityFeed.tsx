import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, FileCode2, RefreshCw, Search } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { CrawlEventRecord } from '../../types/crawl';

export function CrawlActivityFeed({
  events,
}: {
  events: CrawlEventRecord[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const recent = [...events].reverse().slice(0, 40);

  const formatEvent = (ev: CrawlEventRecord) => {
    const p = ev.payload;
    switch (ev.eventType) {
      case 'crawl_queued':
        return {
          title: 'Crawl queued',
          detail: `Seed: ${String(p.startingUrl ?? '')}`,
          icon: Search,
          tone: 'text-[#7047EB] dark:text-[#8B6BFF] bg-[#7047EB]/12',
        };
      case 'crawl_started':
        return {
          title: 'Crawler worker started',
          detail: `Max pages ${String(p.maxPages ?? '')}, depth ${String(p.maxDepth ?? '')}`,
          icon: CheckCircle2,
          tone: 'text-[#7047EB] dark:text-[#8B6BFF] bg-[#7047EB]/12',
        };
      case 'robots_parsed':
        return {
          title: 'Parsed robots.txt',
          detail: `Status ${String(p.statusCode ?? 'N/A')} · ${String(p.rulesCount ?? 0)} rule group(s)`,
          icon: FileCode2,
          tone: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50',
        };
      case 'sitemap_parsed':
        return {
          title: 'Parsed XML Sitemap',
          detail: `${String(p.entriesCount ?? 0)} URLs indexed across ${String(p.sitemapsChecked ?? 0)} sitemap(s)`,
          icon: FileCode2,
          tone: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50',
        };
      case 'url_discovered':
        return {
          title: `Discovered (${String(p.discoverySource ?? 'link')})`,
          detail: String(p.url ?? ''),
          icon: Search,
          tone: 'text-[var(--text-secondary)] bg-slate-100 dark:bg-slate-800',
        };
      case 'url_crawled':
        return {
          title: `HTTP ${String(p.statusCode ?? '')} · ${String(p.indexability ?? '')}`,
          detail: `${String(p.url ?? '')} (${String(p.responseTimeMs ?? 0)}ms · ${String(p.renderingSource ?? 'raw_html')})`,
          icon: CheckCircle2,
          tone:
            Number(p.statusCode) >= 400
              ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50'
              : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
        };
      case 'url_retry':
        return {
          title: `Retry attempt #${String(p.attempt ?? 1)}`,
          detail: `${String(p.url ?? '')} (${String(p.reason ?? '')})`,
          icon: RefreshCw,
          tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
        };
      case 'url_error':
        return {
          title: 'Fetch error',
          detail: `${String(p.url ?? '')}: ${String(p.reason ?? '')}`,
          icon: AlertCircle,
          tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
        };
      case 'issue_detected':
        return {
          title: `${String(p.severity ?? '')} Issue: ${String(p.title ?? '')}`,
          detail: `${String(p.ruleId ?? '')} · ${String(p.affectedUrlCount ?? 0)} affected URL(s)`,
          icon: AlertCircle,
          tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
        };
      case 'crawl_completed':
      case 'crawl_cancelled':
        return {
          title: `Crawl ${String(p.status ?? ev.eventType)}`,
          detail: `${String(p.processedCount ?? 0)} processed · ${String(p.issuesTotal ?? 0)} issue group(s)`,
          icon: CheckCircle2,
          tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
        };
      default:
        return {
          title: ev.eventType,
          detail: JSON.stringify(p),
          icon: CheckCircle2,
          tone: 'text-[var(--text-secondary)] bg-slate-100 dark:bg-slate-800',
        };
    }
  };

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
        <div>
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Live Crawl Activity Stream
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Real-time worker events via Server-Sent Events
          </p>
        </div>
        <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
          {events.length} events
        </span>
      </div>

      <div className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {recent.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-muted)]">
            No crawl events recorded yet.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {recent.map((ev) => {
              const info = formatEvent(ev);
              const Icon = info.icon;
              return (
                <motion.div
                  key={ev.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: MOTION_EASE }}
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs transition-colors hover:border-[#7047EB]/30"
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${info.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {info.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
                      {info.detail}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
