import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  Lightbulb,
  Smartphone,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { accordionExpand } from '../../lib/motion';
import type {
  PerformanceDashboardOverview,
  PerformanceFinding,
  PerformanceUrlMeasurement,
} from '../../types/performance';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton, SegmentedTabs } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge, type BadgeTone } from '../ui/StateViews';

const SECTION_TABS = [
  { id: 'findings' as const, label: 'Problems & Opportunities' },
  { id: 'pages' as const, label: 'Slowest Pages' },
  { id: 'resources' as const, label: 'Resource Weight & Usability' },
];

const SEVERITY_TONE: Record<string, BadgeTone> = {
  Critical: 'danger',
  High: 'warning',
  Medium: 'indigo',
  Low: 'neutral',
  Info: 'neutral',
};

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms} ms`;
}

export function DiagnosticsAndResourcesPanel({
  overview,
  onSelectFinding,
  onInspectRawSnapshot,
  onLaunchAudit,
}: {
  overview: PerformanceDashboardOverview;
  onSelectFinding: (finding: PerformanceFinding) => void;
  onInspectRawSnapshot: (measurement: PerformanceUrlMeasurement) => void;
  onLaunchAudit: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'findings' | 'pages' | 'resources'>(
    'findings',
  );
  const [kindFilter, setKindFilter] = useState<'all' | 'problem' | 'opportunity'>(
    'all',
  );
  const [strategyFilter, setStrategyFilter] = useState<'all' | 'mobile' | 'desktop'>(
    'all',
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredFindings = useMemo(() => {
    return overview.findings.filter((f) => {
      if (kindFilter !== 'all' && f.findingKind !== kindFilter) return false;
      if (strategyFilter !== 'all' && f.strategy !== strategyFilter) return false;
      return true;
    });
  }, [overview.findings, kindFilter, strategyFilter]);

  const sortedMeasurements = useMemo(() => {
    return [...overview.measurements].sort((a, b) => {
      const aScore = a.lab.performanceScore ?? 999;
      const bScore = b.lab.performanceScore ?? 999;
      return aScore - bScore;
    });
  }, [overview.measurements]);

  const primaryResourceMeasurement = useMemo(() => {
    return (
      overview.measurements.find(
        (m) => m.status === 'Succeeded' && m.strategy === 'mobile',
      ) ??
      overview.measurements.find((m) => m.status === 'Succeeded') ??
      null
    );
  }, [overview.measurements]);

  return (
    <GlassPanel as="section" animate className="p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Diagnostics, Resource Efficiency &amp; Usability
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Verified bottlenecks, optimization opportunities, heavy assets, and mobile usability signals
          </p>
        </div>

        <SegmentedTabs
          tabs={SECTION_TABS}
          activeId={activeTab}
          onChange={setActiveTab}
          layoutGroupId="perf-diagnostics-tabs"
          variant="light"
        />
      </div>

      {overview.measurements.length === 0 ? (
        <div className="mt-5">
          <EmptyStateCard
            title="No diagnostic findings yet"
            description="Launch a performance audit to inspect Lighthouse opportunities, JS/CSS bundle overhead, TTFB, and mobile usability."
            actionLabel="Run Performance Audit"
            onAction={onLaunchAudit}
          />
        </div>
      ) : activeTab === 'findings' ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1 text-xs">
              {(['all', 'problem', 'opportunity'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`rounded-lg px-2.5 py-1 font-semibold capitalize cursor-pointer transition-colors whitespace-nowrap ${
                    kindFilter === k
                      ? 'bg-[#7047EB] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {k === 'all' ? 'All Findings' : k === 'problem' ? 'Problems' : 'Opportunities'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1 text-xs">
              {(['all', 'mobile', 'desktop'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategyFilter(s)}
                  className={`rounded-lg px-2.5 py-1 font-semibold capitalize cursor-pointer transition-colors whitespace-nowrap ${
                    strategyFilter === s
                      ? 'bg-[#0891B2] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s === 'all' ? 'All Devices' : s}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs font-medium text-[var(--text-muted)] tabular-nums">
              {filteredFindings.length} finding(s)
            </span>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-6 text-center text-xs text-[var(--text-muted)]">
              No findings match the current device/category filter.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredFindings.map((finding) => {
                const isOpen = expandedId === finding.id;
                const Icon =
                  finding.findingKind === 'problem' ? AlertTriangle : Lightbulb;

                return (
                  <div
                    key={finding.id}
                    className={`rounded-2xl border transition-colors ${
                      isOpen
                        ? 'border-[#7047EB]/40 bg-[var(--bg-surface)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[#7047EB]/25'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : finding.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                            finding.findingKind === 'problem'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {finding.title}
                            </span>
                            <StatusBadge
                              label={finding.severity}
                              tone={SEVERITY_TONE[finding.severity] ?? 'neutral'}
                            />
                            <StatusBadge
                              label={finding.strategy.toUpperCase()}
                              tone="info"
                            />
                            {finding.linkedIssueId && (
                              <StatusBadge label="Issue Tracked" tone="success" />
                            )}
                          </div>
                          <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                            {finding.category} · {finding.url}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline font-mono text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                          {finding.evidence.measuredValue}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${
                            isOpen ? 'rotate-180 text-[#7047EB]' : ''
                          }`}
                        />
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          variants={accordionExpand}
                          initial={prefersReducedMotion ? false : 'hidden'}
                          animate="visible"
                          exit={prefersReducedMotion ? undefined : 'exit'}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-[var(--border-hairline)] px-4 py-3.5 text-xs space-y-2.5">
                            <p className="text-[var(--text-secondary)] leading-relaxed">
                              <strong className="text-[var(--text-primary)]">
                                Root Cause:
                              </strong>{' '}
                              {finding.rootCause}
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <div className="rounded-xl bg-[var(--bg-subtle)] p-2.5">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                  Measured Evidence
                                </div>
                                <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)] tabular-nums">
                                  {finding.evidence.measuredValue}
                                </div>
                              </div>
                              <div className="rounded-xl bg-[var(--bg-subtle)] p-2.5">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                  Target Threshold
                                </div>
                                <div className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                  {finding.evidence.thresholdLabel}
                                </div>
                              </div>
                              <div className="rounded-xl bg-[var(--bg-subtle)] p-2.5">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                  Estimated Effort
                                </div>
                                <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                                  {finding.estimatedEffort}
                                </div>
                              </div>
                            </div>
                            <p className="text-[var(--text-secondary)] leading-relaxed">
                              <strong className="text-[var(--text-primary)]">
                                Recommended Fix:
                              </strong>{' '}
                              {finding.recommendedSolution}
                            </p>
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                              <InteractiveButton
                                variant="primary"
                                size="sm"
                                onClick={() => onSelectFinding(finding)}
                              >
                                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  {finding.linkedIssueId
                                    ? 'Manage Linked Issue & Reverify'
                                    : 'Inspect & Create Developer Issue'}
                                </span>
                              </InteractiveButton>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'pages' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-semibold">URL</th>
                <th className="py-2 px-2.5 font-semibold">Device</th>
                <th className="py-2 px-2.5 font-semibold text-right">Score</th>
                <th className="py-2 px-2.5 font-semibold text-right">LCP</th>
                <th className="py-2 px-2.5 font-semibold text-right">TBT</th>
                <th className="py-2 px-2.5 font-semibold text-right">CLS</th>
                <th className="py-2 px-2.5 font-semibold text-right">Payload</th>
                <th className="py-2 pl-2.5 font-semibold text-right">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {sortedMeasurements.map((m) => (
                <tr key={m.id} className="hover:bg-[var(--bg-subtle)]/60">
                  <td className="py-2.5 pr-3 max-w-[260px]">
                    <div className="truncate font-medium text-[var(--text-primary)]">
                      {m.url}
                    </div>
                    {m.errorMessage && (
                      <div className="mt-0.5 text-[10.5px] text-rose-600 dark:text-rose-400">
                        {m.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5">
                    <StatusBadge
                      label={m.strategy}
                      tone={m.strategy === 'mobile' ? 'indigo' : 'info'}
                    />
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-bold tabular-nums">
                    {m.lab.performanceScore !== null ? `${m.lab.performanceScore}/100` : 'Failed'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                    {fmtMs(m.lab.lcpMs)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                    {fmtMs(m.lab.tbtMs)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                    {m.lab.clsScore !== null ? m.lab.clsScore.toFixed(3) : '—'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                    {fmtBytes(m.resources.totalByteWeight)}
                  </td>
                  <td className="py-2.5 pl-2.5 text-right">
                    <button
                      type="button"
                      disabled={!m.rawObjectRef}
                      onClick={() => onInspectRawSnapshot(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <FileCode2 className="h-3 w-3" aria-hidden="true" />
                      <span>JSON</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Resource Breakdown */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--text-primary)]">
                  Resource Payload Footprint ({primaryResourceMeasurement?.url ?? '—'})
                </h3>
                <span className="font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                  {fmtBytes(primaryResourceMeasurement?.resources.totalByteWeight ?? null)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 text-xs">
                {[
                  ['JavaScript', primaryResourceMeasurement?.resources.scriptBytes ?? null],
                  ['Stylesheets', primaryResourceMeasurement?.resources.stylesheetBytes ?? null],
                  ['Images', primaryResourceMeasurement?.resources.imageBytes ?? null],
                  ['Fonts', primaryResourceMeasurement?.resources.fontBytes ?? null],
                  ['Third-Party', primaryResourceMeasurement?.resources.thirdPartyBytes ?? null],
                  [
                    'DOM Nodes',
                    primaryResourceMeasurement?.resources.domNodesCount ?? null,
                  ],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5"
                  >
                    <div className="text-[10.5px] text-[var(--text-muted)]">{label}</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-[var(--text-primary)] tabular-nums">
                      {label === 'DOM Nodes'
                        ? val !== null
                          ? Number(val).toLocaleString()
                          : '—'
                        : fmtBytes(val as number | null)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {primaryResourceMeasurement &&
              primaryResourceMeasurement.resources.largestResources.length > 0 && (
                <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    Largest Transfer / Optimization Targets
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    {primaryResourceMeasurement.resources.largestResources
                      .slice(0, 6)
                      .map((res, idx) => (
                        <div
                          key={`${res.url}-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px]"
                        >
                          <span className="truncate font-mono text-[var(--text-primary)]">
                            {res.url}
                          </span>
                          <span className="shrink-0 font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                            {res.transferSizeBytes > 0
                              ? fmtBytes(res.transferSizeBytes)
                              : res.wastedBytes
                                ? `${fmtBytes(res.wastedBytes)} wasted`
                                : res.resourceType}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>

          {/* Mobile Usability Panel */}
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 lg:col-span-5">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-[#7047EB]" />
              <h3 className="text-xs font-bold text-[var(--text-primary)]">
                Mobile Usability &amp; Accessibility Signals
              </h3>
            </div>

            {primaryResourceMeasurement ? (
              <div className="mt-3 space-y-2.5">
                {[
                  [
                    'Viewport Meta Configured',
                    primaryResourceMeasurement.usability.viewportConfigured,
                  ],
                  [
                    'Legible Mobile Font Sizes',
                    primaryResourceMeasurement.usability.legibleFontSizes,
                  ],
                  [
                    'Adequate Tap Target Sizing',
                    primaryResourceMeasurement.usability.tapTargetsAdequate,
                  ],
                  [
                    'WCAG AA Color Contrast',
                    primaryResourceMeasurement.usability.colorContrastOk,
                  ],
                ].map(([label, state]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs"
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {label}
                    </span>
                    {state === null ? (
                      <StatusBadge label="Not Tested" tone="neutral" />
                    ) : state ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Pass
                      </span>
                    ) : (
                      <StatusBadge label="Needs Fix" tone="danger" />
                    )}
                  </div>
                ))}

                {primaryResourceMeasurement.usability.notes.length > 0 && (
                  <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
                    <Sparkles className="mb-1 inline h-3.5 w-3.5 text-[#7047EB] mr-1" />
                    {primaryResourceMeasurement.usability.notes.join(' ')}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Run a mobile audit to inspect viewport, font legibility, tap target spacing, and contrast diagnostics.
              </p>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
