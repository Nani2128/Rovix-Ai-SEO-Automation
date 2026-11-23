import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '../../lib/motion';
import type { KeywordWorkspaceResponse } from '../../types/keywords';
import { AnimatedCounter } from '../animation/MotionPrimitives';
import { GlassPanel } from '../ui/GlassPanel';
import { StatusBadge } from '../ui/StateViews';

export function KeywordOverviewHeader({
  workspace,
  onJumpToProfile,
  onJumpToCannibalization,
}: {
  workspace: KeywordWorkspaceResponse;
  onJumpToProfile: () => void;
  onJumpToCannibalization: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const { summary, businessProfile, providerStatuses } = workspace;

  const cards = [
    {
      label: 'Tracked Keywords',
      value: summary.totalKeywords,
      sub: `${summary.recommendedCount} recommended · ${summary.needsDataCount} needs-data`,
      icon: Target,
      tone: 'text-[var(--accent-primary)] bg-[var(--accent-soft)]',
    },
    {
      label: 'Approved & Active',
      value: summary.approvedCount + summary.assignedOrImplementedCount,
      sub: `${summary.approvedCount} approved · ${summary.assignedOrImplementedCount} assigned/live`,
      icon: CheckCircle2,
      tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    },
    {
      label: 'Topic Clusters',
      value: summary.clusterCount,
      sub: `${summary.mappedToExistingCount} mapped · ${summary.newPageRecommendedCount} new pages`,
      icon: Layers,
      tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    },
    {
      label: 'Cannibalization Risks',
      value: summary.cannibalizationAlertsCount,
      sub:
        summary.avgOpportunityScore !== null
          ? `Avg Opportunity Score: ${summary.avgOpportunityScore}/100`
          : 'Run discovery to score opportunities',
      icon: summary.cannibalizationAlertsCount > 0 ? AlertTriangle : Sparkles,
      tone:
        summary.cannibalizationAlertsCount > 0
          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
          : 'text-[var(--accent-primary)] bg-[var(--accent-soft)]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Owner-Approved Business Context Gate Banner */}
      <GlassPanel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                businessProfile.approvalStatus === 'approved'
                  ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
              }`}
            >
              {businessProfile.approvalStatus === 'approved' ? (
                <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-4.5 w-4.5" aria-hidden="true" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Business Keyword Context &amp; Governance
                </h2>
                <StatusBadge
                  label={
                    businessProfile.approvalStatus === 'approved'
                      ? 'Owner Approved'
                      : 'Pending Owner Approval'
                  }
                  tone={
                    businessProfile.approvalStatus === 'approved'
                      ? 'success'
                      : 'warning'
                  }
                />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {businessProfile.approvalStatus === 'approved'
                  ? `Niche: ${businessProfile.approvedNiche} · Services: ${businessProfile.approvedServices.join(', ')} · Market: ${businessProfile.targetCountry}${businessProfile.targetCity ? ` (${businessProfile.targetCity})` : ''} / ${businessProfile.targetLanguage}`
                  : 'Define and approve the business niche & core services before approving or assigning keywords. Discovery remains enabled.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {summary.cannibalizationAlertsCount > 0 && (
              <button
                type="button"
                onClick={onJumpToCannibalization}
                className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:opacity-90 cursor-pointer transition-opacity"
              >
                Review {summary.cannibalizationAlertsCount} Conflict
                {summary.cannibalizationAlertsCount > 1 ? 's' : ''}
              </button>
            )}
            <button
              type="button"
              onClick={onJumpToProfile}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 cursor-pointer transition-colors"
            >
              {businessProfile.approvalStatus === 'approved'
                ? 'Edit Business Profile'
                : 'Configure & Approve Context'}
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* KPI Strip */}
      <motion.div
        variants={staggerContainer}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} variants={fadeInUp}>
              <GlassPanel interactive className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-muted)]">
                      {card.label}
                    </div>
                    <div className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums">
                      <AnimatedCounter target={card.value} />
                    </div>
                  </div>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-2 truncate text-[11px] text-[var(--text-muted)]">
                  {card.sub}
                </div>
              </GlassPanel>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Honest Data Source & Provider Status Strip */}
      <GlassPanel className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <Database className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>Evidence Provider Provenance &amp; Data Integrity</span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            GSC site clicks ≠ market volume · Trends 0–100 index ≠ monthly search volume
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {providerStatuses.map((ps) => {
            const tone =
              ps.state === 'available' || ps.state === 'connected'
                ? 'success'
                : ps.state === 'credentials_required' || ps.state === 'not_connected'
                  ? 'neutral'
                  : ps.state === 'rate_limited' || ps.state === 'blocked'
                    ? 'warning'
                    : 'danger';
            return (
              <div
                key={ps.provider}
                title={ps.detail}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                    {ps.label}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <StatusBadge
                    label={ps.state.replace(/_/g, ' ')}
                    tone={tone}
                  />
                  {ps.itemsReturned > 0 && (
                    <span className="font-mono text-[10.5px] font-semibold text-[var(--text-muted)]">
                      {ps.itemsReturned}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
