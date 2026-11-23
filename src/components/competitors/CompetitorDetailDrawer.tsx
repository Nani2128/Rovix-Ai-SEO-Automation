import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ExternalLink, ShieldCheck, X } from 'lucide-react';
import { drawerSlide } from '../../lib/motion';
import type {
  CompetitorProfileRecord,
  CompetitorWorkspaceResponse,
} from '../../types/competitors';
import { StatusBadge } from '../ui/StateViews';

export function CompetitorDetailDrawer({
  competitor,
  workspace,
  onClose,
}: {
  competitor: CompetitorProfileRecord | null;
  workspace: CompetitorWorkspaceResponse | null;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  const pages = competitor
    ? (workspace?.pages ?? []).filter((p) => p.competitorId === competitor.id)
    : [];
  const overlaps = competitor
    ? (workspace?.overlaps ?? []).filter((o) => o.competitorId === competitor.id)
    : [];
  const gaps = competitor
    ? (workspace?.contentGaps ?? []).filter((g) => g.competitorId === competitor.id)
    : [];

  return (
    <AnimatePresence>
      {competitor && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs">
          <div className="flex-1" onClick={onClose} aria-hidden="true" />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Competitor Details: ${competitor.domain}`}
            variants={prefersReducedMotion ? undefined : drawerSlide}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            exit={prefersReducedMotion ? undefined : 'exit'}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    {competitor.name}
                  </h2>
                  <StatusBadge
                    label={competitor.approvalStatus.replace(/_/g, ' ')}
                    tone={competitor.approvalStatus === 'approved' ? 'success' : 'warning'}
                  />
                </div>
                <a
                  href={competitor.homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-[var(--accent-primary)] hover:underline"
                >
                  <span>{competitor.homepageUrl}</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close competitor drawer"
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Provenance Box */}
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/65 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>Data Provenance & Methodology</span>
              </div>
              <div className="text-[var(--text-secondary)]">
                Source: {competitor.provenance.source} ({competitor.provenance.measurementStatus})
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {competitor.provenance.methodology}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Limitations: {competitor.provenance.limitations}
              </div>
            </div>

            {/* Summary Numbers */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Pages</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">{pages.length}</div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Overlaps</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">{overlaps.length}</div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Gaps</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">{gaps.length}</div>
              </div>
            </div>

            {/* Analyzed Pages */}
            <div className="space-y-2">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Analyzed HTML Pages ({pages.length})
              </h3>
              {pages.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No pages analyzed yet.</p>
              ) : (
                <div className="space-y-2">
                  {pages.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-[var(--border-hairline)] p-3 text-xs space-y-1"
                    >
                      <div className="font-mono text-[11px] text-[var(--accent-primary)] break-all">
                        {p.normalizedUrl}
                      </div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {p.title || 'Missing <title>'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Words: {p.wordCount.toLocaleString()} · Headings: {p.headings.length} · HTTP {p.statusCode} ({p.responseTimeMs}ms)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preserved Approval History */}
            <div className="space-y-2">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Approval History ({competitor.approvalHistory.length})
              </h3>
              <div className="space-y-2">
                {competitor.approvalHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/45 p-3 text-xs space-y-0.5"
                  >
                    <div className="font-semibold text-[var(--text-primary)]">
                      {h.actorName} ({h.actorRole}): {h.previousStatus} → {h.newStatus}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{h.reason}</div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">
                      {new Date(h.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
