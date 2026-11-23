import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Globe2, Trash2, User } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { Project } from '../../types/dashboard';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import {
  calculatePrdProjectProgress,
  filterProjectsByStatus,
} from '../../utils/dashboardLogic';
import { AnimatedProgress } from '../animation/MotionPrimitives';
import { GlassPanel } from '../ui/GlassPanel';
import { SegmentedTabs } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const FILTERS = [
  { id: 'All Projects' as const, label: 'All Projects' },
  { id: 'Active' as const, label: 'Active' },
  { id: 'Blocked' as const, label: 'Blocked' },
  { id: 'Needs Attention' as const, label: 'Needs Attention' },
];

type PortfolioFilter = (typeof FILTERS)[number]['id'];

const STATUS_TONE: Record<Project['status'], BadgeTone> = {
  Active: 'success',
  Blocked: 'danger',
  'Needs Attention': 'warning',
};

export function MultiProjectPortfolio({
  projects,
  onCreateRequest,
  allowDelete = false,
}: {
  projects: Project[];
  onCreateRequest?: () => void;
  allowDelete?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<PortfolioFilter>('All Projects');
  const permissions = useAuthStore((s) => s.permissions);
  const { selectedProjectId, setSelectedProjectId, deleteProject } =
    useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const filtered = filterProjectsByStatus(projects, filter);

  return (
    <GlassPanel
      as="section"
      animate
      ariaLabelledBy="portfolio-heading"
      className="p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="portfolio-heading"
            className="font-display text-lg font-bold text-[var(--text-primary)]"
          >
            Domain Portfolio
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Operational completion reflects verified task weights divided by approved scoped weights
          </p>
        </div>

        <SegmentedTabs
          tabs={FILTERS}
          activeId={filter}
          onChange={setFilter}
          layoutGroupId="portfolio-status-tabs"
          variant="light"
        />
      </div>

      <div className="mt-5">
        {projects.length === 0 ? (
          <EmptyStateCard
            title="No domain projects found"
            description="Create a domain project to verify ownership, launch technical crawls, and connect Search Console or GA4."
            actionLabel={onCreateRequest ? 'Add Domain Project' : undefined}
            onAction={onCreateRequest}
          />
        ) : filtered.length === 0 ? (
          <EmptyStateCard
            title={`No ${filter.toLowerCase()} projects`}
            description="Switch filters to inspect active or blocked workspaces."
            actionLabel="Show All Projects"
            onAction={() => setFilter('All Projects')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {filtered.map((proj, idx) => {
              const progressPct = calculatePrdProjectProgress(
                proj.verifiedTaskWeight,
                proj.approvedScopedTaskWeight,
              );
              const isSelected = proj.id === selectedProjectId;

              return (
                <motion.article
                  key={proj.id}
                  layout={!prefersReducedMotion}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.28,
                    delay: prefersReducedMotion ? 0 : idx * 0.04,
                    ease: MOTION_EASE,
                  }}
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors ${
                    isSelected
                      ? 'border-[#7047EB]/50 bg-[#7047EB]/5 dark:bg-[#8B6BFF]/10 shadow-[0_12px_24px_-16px_rgba(112,71,235,0.28)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[#7047EB]/30'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-base font-bold text-[var(--text-primary)]">
                          {proj.name}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <Globe2
                            className="h-3.5 w-3.5 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]"
                            aria-hidden="true"
                          />
                          <span className="truncate">{proj.website}</span>
                        </div>
                      </div>
                      <StatusBadge
                        label={proj.status}
                        tone={STATUS_TONE[proj.status]}
                      />
                    </div>

                    <div className="mt-3 text-xs text-[var(--text-secondary)]">
                      <div className="font-medium text-[var(--text-primary)]">
                        {proj.currentMilestone}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {proj.owner}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.targetMarkets.join(', ')}</span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-[var(--text-muted)]">
                          Verified Operational Completion
                        </span>
                        <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                          {progressPct}% ({proj.verifiedTaskWeight}/
                          {proj.approvedScopedTaskWeight}w)
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <AnimatedProgress value={progressPct} tone="brand" heightClass="h-2" />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
                      <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                        {proj.criticalIssues} critical issues
                      </span>
                      <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">
                        {proj.overdueApprovals} pending approvals
                      </span>
                    </div>

                    {proj.blockers.length > 0 && (
                      <div className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/35 px-2.5 py-2 text-[11px] text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{proj.blockers[0]}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                    <div className="text-[11px] text-[var(--text-muted)]">
                      <strong className="text-[var(--text-primary)]">Next:</strong>{' '}
                      {proj.nextAction}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                        {proj.lastSuccessfulRun
                          ? `Last crawl: ${new Date(proj.lastSuccessfulRun).toLocaleDateString()}`
                          : 'No crawl yet'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {allowDelete && permissions.canManageProjects && (
                          <button
                            type="button"
                            aria-label={`Delete project ${proj.name}`}
                            onClick={() => {
                              void deleteProject(proj.id).then((ok) => {
                                if (ok) {
                                  pushToast({
                                    title: `Removed ${proj.name}`,
                                    detail: 'Project and related workspace telemetry deleted.',
                                    tone: 'info',
                                  });
                                }
                              });
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            pushToast({
                              title: `Selected ${proj.name}`,
                              detail: `Workspace telemetry switched to ${proj.website}.`,
                              tone: 'info',
                            });
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#7047EB] text-white'
                              : 'bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[#7047EB]'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="h-3 w-3" />}
                          <span>{isSelected ? 'Active View' : 'Inspect'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
