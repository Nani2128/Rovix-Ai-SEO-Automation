import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, FileCode2 } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { IssueEvidence } from '../../types/technicalIssue';
import { StatusBadge } from '../ui/StateViews';

export function IssueEvidencePanel({
  evidence,
}: {
  evidence: IssueEvidence[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Captured Diagnostic Evidence
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Verbatim HTTP headers, HTML tags, robots.txt, or sitemap entries recorded during crawl
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
          {evidence.length} record(s)
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {evidence.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-muted)]">
            No evidence records stored.
          </div>
        ) : (
          evidence.slice(0, 25).map((ev, idx) => {
            const isLong = ev.snippet.length > 260;
            const expanded = Boolean(expandedIds[ev.id]);
            const displaySnippet =
              isLong && !expanded ? `${ev.snippet.slice(0, 260)}…` : ev.snippet;

            return (
              <motion.div
                key={ev.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: prefersReducedMotion ? 0 : Math.min(idx * 0.03, 0.24),
                  ease: MOTION_EASE,
                }}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 transition-colors hover:border-[#7047EB]/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode2
                      className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#A78BFA]"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate">
                      {ev.url}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge label={ev.source} tone="indigo" />
                    <StatusBadge label={ev.evidenceType} tone="neutral" />
                  </div>
                </div>
                <pre className="mt-2.5 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                  {displaySnippet}
                </pre>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-[var(--text-muted)]">
                  <span>
                    Crawl: {ev.crawlId} · Captured{' '}
                    {new Date(ev.capturedAt).toLocaleString()}
                  </span>
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(ev.id)}
                      className="inline-flex items-center gap-1 font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline cursor-pointer"
                    >
                      <span>{expanded ? 'Collapse snippet' : 'Expand full snippet'}</span>
                      <ChevronDown
                        className={`h-3 w-3 transition-transform duration-150 ${
                          expanded ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </section>
  );
}
