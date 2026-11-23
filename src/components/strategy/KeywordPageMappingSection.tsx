import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Edit3, Search, X } from 'lucide-react';
import type { KeywordIntent } from '../../types/dashboard';
import type {
  SiteArchitecturePageRecord,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import type { UpdateArchitecturePagePayload } from '../../services/strategyService';
import {
  PAGE_STATUS_LABELS,
  PAGE_TYPE_LABELS,
  approvalLabel,
  approvalToneClass,
} from './strategyUiHelpers';

const INTENTS: readonly KeywordIntent[] = [
  'Informational',
  'Commercial',
  'Transactional',
  'Navigational',
  'Local',
];

interface KeywordPageMappingSectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onUpdatePage: (
    pageId: string,
    payload: UpdateArchitecturePagePayload,
  ) => Promise<void>;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
}

export function KeywordPageMappingSection({
  workspace,
  busyAction,
  onUpdatePage,
  onDecideApproval,
}: KeywordPageMappingSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState<KeywordIntent | 'all'>('all');
  const [showAllDiagnostics, setShowAllDiagnostics] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftPrimary, setDraftPrimary] = useState('');
  const [draftSecondary, setDraftSecondary] = useState('');
  const [draftIntent, setDraftIntent] = useState<KeywordIntent>('Informational');
  const [draftGeo, setDraftGeo] = useState('');

  const activePages = useMemo(
    () =>
      workspace.pages.filter(
        (p) => p.pageStatus !== 'archived' && !p.archivedAt,
      ),
    [workspace.pages],
  );

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activePages.filter((p) => {
      if (intentFilter !== 'all' && p.searchIntent !== intentFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.primaryKeyword?.toLowerCase().includes(q) ?? false) ||
        p.secondaryKeywords.some((k) => k.toLowerCase().includes(q)) ||
        (p.clusterName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [activePages, searchQuery, intentFilter]);

  const startEditing = (page: SiteArchitecturePageRecord) => {
    setEditingPageId(page.id);
    setDraftPrimary(page.primaryKeyword ?? '');
    setDraftSecondary(page.secondaryKeywords.join(', '));
    setDraftIntent(page.searchIntent);
    setDraftGeo(page.targetGeography ?? '');
  };

  const saveEditing = async (pageId: string) => {
    await onUpdatePage(pageId, {
      primaryKeyword: draftPrimary.trim() || null,
      secondaryKeywords: draftSecondary
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      searchIntent: draftIntent,
      targetGeography: draftGeo.trim() || null,
    });
    setEditingPageId(null);
  };

  if (!workspace.activeVersion) {
    return (
      <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
        Generate an SEO Strategy version first to review keyword-to-page mappings and cannibalization diagnostics.
      </div>
    );
  }

  const highAlerts = workspace.mappingDiagnostics.filter(
    (d) => d.severity === 'high',
  );

  return (
    <div className="space-y-4">
      {/* Cannibalization, Overlap, Intent Conflict & Uncovered Cluster Diagnostics */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Cannibalization &amp; Keyword Mapping Diagnostics
            </h2>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              Checks every architecture page against Module 5 keywords and clusters for duplicate primary targets, secondary overlap, intent conflicts, and existing URLs to optimize instead of duplicating.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
            <span
              className={
                highAlerts.length > 0
                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }
            >
              {highAlerts.length} high-severity
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-muted)]">
              {workspace.mappingDiagnostics.length} total check
              {workspace.mappingDiagnostics.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {workspace.mappingDiagnostics.length === 0 ? (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            No cannibalization, overlap, or intent conflicts detected across the current strategy architecture.
          </p>
        ) : (
          <div className="mt-3">
            <div className="divide-y divide-[var(--border-hairline)]">
              {(showAllDiagnostics
                ? workspace.mappingDiagnostics
                : workspace.mappingDiagnostics.slice(0, 4)
              ).map((alert) => {
                const sevColor =
                  alert.severity === 'high'
                    ? 'text-rose-600 dark:text-rose-400'
                    : alert.severity === 'medium'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-sky-600 dark:text-sky-400';

                return (
                  <div key={alert.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 shrink-0 ${sevColor}`}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-[var(--text-primary)]">
                        {alert.title}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className={`text-[11px] font-semibold uppercase ${sevColor}`}>
                        {alert.severity}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {alert.kind.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {alert.detail}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      <strong className="font-semibold text-[var(--text-secondary)]">
                        Recommended resolution:
                      </strong>{' '}
                      {alert.recommendedResolution}
                    </p>
                  </div>
                );
              })}
            </div>
            {workspace.mappingDiagnostics.length > 4 && (
              <div className="mt-3 border-t border-[var(--border-hairline)] pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowAllDiagnostics((v) => !v)}
                  className="text-xs font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:underline cursor-pointer"
                >
                  {showAllDiagnostics
                    ? 'Show fewer diagnostic checks'
                    : `Show all ${workspace.mappingDiagnostics.length} diagnostic checks`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main Page-to-Keyword Mapping Matrix */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Page-to-Keyword Mapping Matrix
            </h3>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              One primary keyword per canonical URL. Approve mappings individually or adjust targets inline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search page or keyword..."
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
              />
            </div>
            <select
              aria-label="Filter by search intent"
              value={intentFilter}
              onChange={(e) =>
                setIntentFilter(e.target.value as KeywordIntent | 'all')
              }
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              <option value="all">All Intents</option>
              {INTENTS.map((intent) => (
                <option key={intent} value={intent}>
                  {intent}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                <th className="py-2 pr-3">Page &amp; URL</th>
                <th className="py-2 pr-3">Primary Keyword</th>
                <th className="py-2 pr-3">Secondary Keywords</th>
                <th className="py-2 pr-3">Intent &amp; Geo</th>
                <th className="py-2 pr-3">Mapping Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filteredPages.map((page) => {
                const isEditing = editingPageId === page.id;
                return (
                  <tr key={page.id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {page.title}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--text-muted)]">
                        {page.slug}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                        {PAGE_TYPE_LABELS[page.pageType]} ·{' '}
                        {PAGE_STATUS_LABELS[page.pageStatus]}
                      </div>
                    </td>

                    <td className="py-2.5 pr-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftPrimary}
                          onChange={(e) => setDraftPrimary(e.target.value)}
                          list="module7-available-keywords"
                          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      ) : (
                        <span
                          className={
                            page.primaryKeyword
                              ? 'font-medium text-[var(--text-primary)]'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {page.primaryKeyword || 'Unmapped — Needs Assignment'}
                        </span>
                      )}
                      {page.clusterName && (
                        <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                          Cluster: {page.clusterName}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 pr-3 max-w-[220px]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftSecondary}
                          onChange={(e) => setDraftSecondary(e.target.value)}
                          placeholder="comma-separated"
                          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      ) : page.secondaryKeywords.length > 0 ? (
                        <span className="text-[var(--text-secondary)]">
                          {page.secondaryKeywords.join(', ')}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">None</span>
                      )}
                    </td>

                    <td className="py-2.5 pr-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <select
                            value={draftIntent}
                            onChange={(e) =>
                              setDraftIntent(e.target.value as KeywordIntent)
                            }
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
                          >
                            {INTENTS.map((i) => (
                              <option key={i} value={i}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={draftGeo}
                            onChange={(e) => setDraftGeo(e.target.value)}
                            placeholder="Geography"
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-[var(--text-secondary)]">
                            {page.searchIntent}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {page.targetGeography || 'Global / Non-Geo'}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-semibold ${approvalToneClass(page.mappingApprovalStatus)}`}
                      >
                        {approvalLabel(page.mappingApprovalStatus)}
                      </span>
                    </td>

                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={busyAction !== null}
                              onClick={() => void saveEditing(page.id)}
                              className="rounded-lg bg-[#7047EB] px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPageId(null)}
                              className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-[11px] text-[var(--text-secondary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {workspace.canEditStrategy && (
                              <button
                                type="button"
                                onClick={() => startEditing(page)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3" aria-hidden="true" />
                                <span>Map</span>
                              </button>
                            )}
                            {workspace.canApproveStrategy && (
                              <>
                                <button
                                  type="button"
                                  disabled={
                                    busyAction !== null ||
                                    page.mappingApprovalStatus === 'approved'
                                  }
                                  onClick={() =>
                                    void onDecideApproval(
                                      'keyword_mapping',
                                      page.id,
                                      'approved',
                                      `Approved keyword mapping for ${page.slug}.`,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                                >
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    busyAction !== null ||
                                    page.mappingApprovalStatus === 'rejected'
                                  }
                                  onClick={() =>
                                    void onDecideApproval(
                                      'keyword_mapping',
                                      page.id,
                                      'rejected',
                                      `Rejected keyword mapping for ${page.slug}.`,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <datalist id="module7-available-keywords">
            {workspace.availableKeywords.map((kw) => (
              <option key={kw.id} value={kw.keyword} />
            ))}
          </datalist>
        </div>
      </section>

      {/* Unmapped Keywords from Module 5 (strictly real measured or Unavailable metrics) */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Unmapped Module 5 Keywords
            </h3>
            <p className="text-[11.5px] text-[var(--text-muted)]">
              Discovered keywords not yet assigned to any strategy page. Search volume displays strictly measured provider data or &ldquo;Unavailable&rdquo; — never fabricated numbers.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {workspace.unmappedKeywords.length} unmapped
          </span>
        </div>

        {workspace.unmappedKeywords.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {workspace.availableKeywords.length === 0
              ? 'Needs Research — No keywords discovered yet in Keyword Lab.'
              : 'All discovered Module 5 keywords are mapped to strategy architecture pages.'}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">Intent</th>
                  <th className="py-2 pr-3">Cluster</th>
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3 text-right">Search Volume</th>
                  <th className="py-2 text-right">GSC Impressions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {workspace.unmappedKeywords.slice(0, 25).map((kw) => (
                  <tr key={kw.keywordId}>
                    <td className="py-2 pr-3 font-medium text-[var(--text-primary)]">
                      {kw.keyword}
                      {kw.isAiSuggestion && (
                        <span className="ml-2 text-[10.5px] text-amber-600 dark:text-amber-400">
                          · AI Suggestion
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-secondary)]">
                      {kw.intent}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">
                      {kw.clusterName || 'Unclustered'}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">
                      {kw.targetGeography}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {kw.volumeStatus === 'measured' &&
                      kw.marketSearchVolume !== null
                        ? kw.marketSearchVolume.toLocaleString()
                        : 'Unavailable'}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {kw.gscImpressions !== null
                        ? kw.gscImpressions.toLocaleString()
                        : 'Unavailable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
