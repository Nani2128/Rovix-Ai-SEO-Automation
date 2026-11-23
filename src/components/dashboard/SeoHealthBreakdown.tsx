import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { MetricProvenance, SeoHealthCategory } from '../../types/dashboard';
import { AnimatedCounter, AnimatedProgress } from '../animation/MotionPrimitives';
import { DataProvenanceStrip } from '../ui/DataProvenanceMeta';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard } from '../ui/StateViews';

export function SeoHealthBreakdown({
  score,
  categories,
  provenance,
}: {
  score: number | null;
  categories: SeoHealthCategory[];
  provenance?: MetricProvenance;
}) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (score === null || categories.length === 0) {
    return (
      <GlassPanel
        as="section"
        animate
        ariaLabelledBy="seo-health-heading"
        className="flex h-full flex-col justify-between p-5 sm:p-6"
      >
        <div>
          <h2
            id="seo-health-heading"
            className="font-display text-lg font-bold text-[var(--text-primary)]"
          >
            SEO Health Breakdown
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Computed from deterministic technical crawl rules
          </p>
          <DataProvenanceStrip
            source={provenance?.source ?? 'Rovix Crawl Engine'}
            collectedAt={provenance?.collectedAt ?? null}
            reportingPeriod={provenance?.reportingPeriod ?? 'Awaiting initial crawl'}
            measurementStatus={provenance?.measurementStatus ?? 'unavailable'}
          />
        </div>
        <div className="mt-5">
          <EmptyStateCard
            title="No crawl data yet"
            description="Run a technical website audit on your selected domain to compute weighted health scores."
            actionLabel="Start Technical Crawl"
            onAction={() => navigate('/audit/new')}
          />
        </div>
      </GlassPanel>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const ratingLabel =
    score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : 'Needs Focus';

  return (
    <GlassPanel
      as="section"
      animate
      ariaLabelledBy="seo-health-heading"
      className="flex flex-col justify-between p-5 sm:p-6"
    >
      <div>
        <h2
          id="seo-health-heading"
          className="font-display text-lg font-bold text-[var(--text-primary)]"
        >
          SEO Health Breakdown
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Calculated from weighted crawl checks and verified URL evidence
        </p>
        <DataProvenanceStrip
          source={provenance?.source ?? 'Rovix Crawl Engine'}
          collectedAt={provenance?.collectedAt ?? null}
          reportingPeriod={provenance?.reportingPeriod ?? 'Latest completed crawl'}
          measurementStatus={provenance?.measurementStatus ?? 'estimated'}
        />
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="var(--chart-grid)"
              strokeWidth="12"
            />
            <motion.circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="url(#healthRingGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={prefersReducedMotion ? false : { strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.9, ease: MOTION_EASE }}
            />
            <defs>
              <linearGradient id="healthRingGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0891B2" />
                <stop offset="55%" stopColor="#0D9488" />
                <stop offset="100%" stopColor="#7047EB" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
              <AnimatedCounter target={score} suffix="%" />
            </span>
            <span className="text-xs font-semibold text-[#0D9488] dark:text-[#2DD4BF]">
              {ratingLabel}
            </span>
          </div>
        </div>

        <div className="w-full flex-1 space-y-2">
          {categories.map((cat) => {
            const isOpen = expandedId === cat.id;
            return (
              <div
                key={cat.id}
                className={`rounded-xl border px-3 py-2 transition-colors ${
                  isOpen
                    ? 'border-[#7047EB]/35 bg-[var(--bg-surface)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[#7047EB]/25'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : cat.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${
                        cat.score >= 90
                          ? 'text-[#0D9488] dark:text-[#2DD4BF]'
                          : 'text-[#D97706] dark:text-[#FBBF24]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {cat.label}
                    </span>
                    <span className="text-[10.5px] text-[var(--text-muted)] whitespace-nowrap">
                      ({cat.issueCount} {cat.issueCount === 1 ? 'issue' : 'issues'})
                    </span>
                  </span>

                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {cat.score}%
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-[#7047EB] dark:text-[#8B6BFF]' : ''
                      }`}
                    />
                  </span>
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
                      <div className="mt-2 border-t border-[var(--border-hairline)] pt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        <div className="mb-2">
                          <AnimatedProgress
                            value={cat.score}
                            tone={cat.score >= 90 ? 'success' : 'warning'}
                            heightClass="h-1.5"
                          />
                        </div>
                        <div>
                          <strong className="text-[var(--text-primary)]">Evidence:</strong>{' '}
                          {cat.evidenceSummary}
                        </div>
                        <div className="mt-0.5 text-[var(--text-muted)]">
                          <strong>Rule ({Math.round(cat.weight * 100)}% weight):</strong>{' '}
                          {cat.rulesApplied}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </GlassPanel>
  );
}
