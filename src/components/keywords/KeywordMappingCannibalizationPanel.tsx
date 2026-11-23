import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, FilePlus2, Link2 } from 'lucide-react';
import type {
  CannibalizationAlert,
  KeywordIntelligenceRecord,
} from '../../types/keywords';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyStateCard, StatusBadge } from '../ui/StateViews';

export function KeywordMappingCannibalizationPanel({
  keywords,
  alerts,
  onSelectKeyword,
  onStartDiscovery,
}: {
  keywords: KeywordIntelligenceRecord[];
  alerts: CannibalizationAlert[];
  onSelectKeyword: (kw: KeywordIntelligenceRecord) => void;
  onStartDiscovery: () => void;
}) {
  const groupedByTarget = useMemo(() => {
    const existingMap = new Map<string, KeywordIntelligenceRecord[]>();
    const newPageList: KeywordIntelligenceRecord[] = [];
    const unmappedList: KeywordIntelligenceRecord[] = [];

    for (const kw of keywords) {
      if (kw.mapping?.mappingStatus === 'mapped_existing' && kw.mapping.targetUrl) {
        const list = existingMap.get(kw.mapping.targetUrl) ?? [];
        list.push(kw);
        existingMap.set(kw.mapping.targetUrl, list);
      } else if (kw.mapping?.mappingStatus === 'recommend_new_page') {
        newPageList.push(kw);
      } else {
        unmappedList.push(kw);
      }
    }

    return {
      existingPages: Array.from(existingMap.entries()).sort(
        (a, b) => b[1].length - a[1].length,
      ),
      newPageList,
      unmappedList,
    };
  }, [keywords]);

  if (keywords.length === 0) {
    return (
      <EmptyStateCard
        title="No keyword-to-URL mappings yet"
        description="Run Keyword Discovery or a Technical SEO Audit crawl to match keywords to existing pages, identify new page gaps, and surface cannibalization risks."
        actionLabel="Launch Keyword Discovery"
        onAction={onStartDiscovery}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Cannibalization Alerts */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 ${
                alerts.length > 0 ? 'text-amber-500' : 'text-emerald-500'
              }`}
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Keyword Cannibalization &amp; Conflict Detection ({alerts.length})
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Checks competing crawled URLs and mixed intents sharing one target URL
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300/50 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              No keyword cannibalization conflicts detected across current mapped pages and crawled inventory.
            </span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/35 p-4 text-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-display text-sm font-bold text-amber-900 dark:text-amber-200">
                    {alert.title}
                  </div>
                  <StatusBadge
                    label={`${alert.severity} severity`}
                    tone={alert.severity === 'high' ? 'danger' : 'warning'}
                  />
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90">
                  {alert.summary}
                </p>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {alert.competingUrls.map((u) => (
                    <span
                      key={u}
                      className="rounded-md border border-amber-400/40 bg-[var(--bg-surface)] px-2 py-0.5 text-[var(--text-primary)]"
                    >
                      {u}
                    </span>
                  ))}
                </div>
                <div className="rounded-lg bg-[var(--bg-surface)]/80 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  <strong>Recommended Fix:</strong> {alert.recommendation}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Mapped Existing URLs */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
          <Link2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Mapped Existing Landing Pages ({groupedByTarget.existingPages.length})
          </h3>
        </div>

        {groupedByTarget.existingPages.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            No keywords are currently mapped to existing crawled URLs. Run a crawl or edit a keyword in the Explorer drawer to assign a URL.
          </p>
        ) : (
          <div className="space-y-3">
            {groupedByTarget.existingPages.map(([url, items]) => {
              const sampleMeta = items[0].mapping;
              return (
                <div
                  key={url}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono font-bold text-[var(--accent-primary)]">
                        {url}
                      </div>
                      {sampleMeta?.pageTitle && (
                        <div className="truncate text-[11px] text-[var(--text-muted)]">
                          Title: {sampleMeta.pageTitle}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sampleMeta?.pageStatusCode && (
                        <StatusBadge
                          label={`HTTP ${sampleMeta.pageStatusCode}`}
                          tone={sampleMeta.pageStatusCode < 400 ? 'success' : 'danger'}
                        />
                      )}
                      {sampleMeta?.pageIndexable !== null &&
                        sampleMeta?.pageIndexable !== undefined && (
                          <StatusBadge
                            label={sampleMeta.pageIndexable ? 'Indexable' : 'Non-Indexable'}
                            tone={sampleMeta.pageIndexable ? 'success' : 'warning'}
                          />
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {items.map((kw) => (
                      <button
                        key={kw.id}
                        type="button"
                        onClick={() => onSelectKeyword(kw)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 cursor-pointer"
                      >
                        <span>{kw.keyword}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          ({kw.intent})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* Recommended New Pages */}
      <GlassPanel className="p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
          <FilePlus2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Recommended New Pages ({groupedByTarget.newPageList.length})
          </h3>
        </div>

        {groupedByTarget.newPageList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            All active keywords are mapped to existing URLs or explicitly left unmapped.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {groupedByTarget.newPageList.map((kw) => (
              <button
                key={kw.id}
                type="button"
                onClick={() => onSelectKeyword(kw)}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-left hover:border-[var(--accent-primary)]/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-[var(--text-primary)]">
                    {kw.keyword}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-[var(--accent-primary)]">
                    {kw.opportunityScore}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  Suggested slug: {kw.mapping?.recommendedSlug ?? '/topic'}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                  {kw.intent} · {kw.workflowState}
                </div>
              </button>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
