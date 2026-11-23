import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { AutomationJob, AutomationJobState } from '../../types/dashboard';
import { AnimatedProgress } from '../animation/MotionPrimitives';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const JOB_ICONS: Record<AutomationJob['category'], typeof RefreshCw> = {
  'Technical Site Audit': RefreshCw,
  'Keyword Discovery': SearchCheck,
  'Data Sync Job': Database,
  'Domain Verification': ShieldCheck,
  'Recurring Monitoring': Clock,
};

const STATE_TONE: Record<AutomationJobState, BadgeTone> = {
  Queued: 'neutral',
  Running: 'indigo',
  Retrying: 'warning',
  Succeeded: 'success',
  Partial: 'warning',
  Failed: 'danger',
  Cancelled: 'neutral',
};

export function OngoingAutomationsPanel({
  automations,
}: {
  automations: AutomationJob[];
}) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <GlassPanel
      as="section"
      animate
      ariaLabelledBy="ongoing-automations-heading"
      className="p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            id="ongoing-automations-heading"
            className="font-display text-lg font-bold text-[var(--text-primary)]"
          >
            Crawl &amp; Sync Jobs
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Recorded crawls, integration syncs, and monitoring history
          </p>
        </div>
        <Link
          to="/monitoring"
          className="text-xs font-semibold text-[#7047EB] dark:text-[#8B6BFF] hover:underline whitespace-nowrap"
        >
          System Health →
        </Link>
      </div>

      <div className="mt-4 space-y-2.5">
        {automations.length === 0 ? (
          <EmptyStateCard
            title="No crawl or sync jobs executed yet"
            description="Start a technical website crawl or run a Google integration sync to view job execution progress here."
            actionLabel="Configure First Crawl"
            onAction={() => navigate('/audit/new')}
          />
        ) : (
          automations.map((job) => {
            const Icon = JOB_ICONS[job.category] ?? ShieldAlert;
            const isOpen = expandedId === job.id;
            const hasMeaningfulProgress =
              job.progressPct !== null &&
              (job.state === 'Running' ||
                job.state === 'Succeeded' ||
                job.state === 'Partial');

            return (
              <div
                key={job.id}
                className={`rounded-2xl border px-3.5 py-3 transition-colors ${
                  isOpen
                    ? 'border-[#7047EB]/40 bg-[var(--bg-surface)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[#7047EB]/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : job.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF]">
                      <Icon
                        className={`h-4 w-4 ${
                          job.state === 'Running' && !prefersReducedMotion
                            ? 'animate-spin'
                            : ''
                        }`}
                        style={
                          job.state === 'Running'
                            ? { animationDuration: '5s' }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                          {job.name}
                        </span>
                        <StatusBadge
                          label={job.state}
                          tone={STATE_TONE[job.state]}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {job.progressLabel} · Next: {job.nextScheduledRun}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {hasMeaningfulProgress && (
                      <div className="hidden sm:flex items-center gap-2 w-32">
                        <AnimatedProgress
                          value={job.progressPct ?? 0}
                          tone={
                            job.state === 'Succeeded'
                              ? 'success'
                              : job.state === 'Partial'
                                ? 'warning'
                                : 'brand'
                          }
                          active={job.state === 'Running'}
                          heightClass="h-1.5"
                        />
                        <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)] tabular-nums w-8 text-right shrink-0">
                          {job.progressPct}%
                        </span>
                      </div>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-[#7047EB] dark:text-[#8B6BFF]' : ''
                      }`}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: MOTION_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 border-t border-[var(--border-hairline)] pt-2.5 text-[11.5px] text-[var(--text-secondary)]">
                        <p>{job.detail}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                          <span>
                            Started:{' '}
                            {new Date(job.startedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span>
                            Updated:{' '}
                            {new Date(job.lastUpdated).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {job.history.length > 0 && (
                          <div className="mt-2 rounded-xl bg-[var(--bg-surface)] p-2.5 border border-[var(--border-hairline)]">
                            <div className="text-[10.5px] font-semibold text-[var(--text-primary)]">
                              Previous Run ({job.history[0].runId})
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                              <span>{job.history[0].summary}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </GlassPanel>
  );
}
