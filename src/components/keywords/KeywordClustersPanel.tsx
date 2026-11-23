import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  ChevronDown,
  Edit3,
  GitMerge,
  Layers,
  XCircle,
} from 'lucide-react';
import { accordionExpand, fadeInUp, staggerContainer } from '../../lib/motion';
import type {
  CrawledPageOption,
  KeywordBusinessProfile,
  KeywordCluster,
  KeywordIntelligenceRecord,
} from '../../types/keywords';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { EmptyStateCard, StatusBadge } from '../ui/StateViews';

export function KeywordClustersPanel({
  clusters,
  keywords,
  crawledUrls,
  businessProfile,
  canApprove,
  onSelectKeyword,
  onUpdateCluster,
  onMergeClusters,
  onStartDiscovery,
}: {
  clusters: KeywordCluster[];
  keywords: KeywordIntelligenceRecord[];
  crawledUrls: CrawledPageOption[];
  businessProfile: KeywordBusinessProfile;
  canApprove: boolean;
  onSelectKeyword: (kw: KeywordIntelligenceRecord) => void;
  onUpdateCluster: (
    clusterId: string,
    payload: {
      clusterName?: string;
      suggestedLandingUrl?: string | null;
      approvalState?: KeywordCluster['approvalState'];
      notes?: string;
    },
  ) => Promise<void>;
  onMergeClusters: (payload: {
    clusterIds: string[];
    mergedName?: string;
  }) => Promise<void>;
  onStartDiscovery: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<string>>(new Set());
  const [mergedName, setMergedName] = useState('');
  const [merging, setMerging] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLandingUrl, setEditLandingUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingClusterId, setSavingClusterId] = useState<string | null>(null);

  const keywordById = useMemo(
    () => new Map(keywords.map((k) => [k.id, k])),
    [keywords],
  );
  const unclustered = useMemo(
    () => keywords.filter((k) => !k.clusterId),
    [keywords],
  );
  const profileApproved = businessProfile.approvalStatus === 'approved';

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMergeSelect = (id: string) => {
    setSelectedMergeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditing = (c: KeywordCluster) => {
    setEditingId(c.id);
    setEditName(c.clusterName);
    setEditLandingUrl(c.suggestedLandingUrl ?? '');
    setEditNotes(c.notes ?? '');
    setExpandedIds((prev) => new Set(prev).add(c.id));
  };

  const handleSaveEdit = async (c: KeywordCluster) => {
    setSavingClusterId(c.id);
    try {
      await onUpdateCluster(c.id, {
        clusterName: editName.trim() || c.clusterName,
        suggestedLandingUrl: editLandingUrl.trim() || null,
        notes: editNotes,
      });
      setEditingId(null);
    } finally {
      setSavingClusterId(null);
    }
  };

  const handleApproval = async (
    c: KeywordCluster,
    approvalState: KeywordCluster['approvalState'],
  ) => {
    setSavingClusterId(c.id);
    try {
      await onUpdateCluster(c.id, { approvalState });
    } finally {
      setSavingClusterId(null);
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMergeIds.size < 2) return;
    setMerging(true);
    try {
      await onMergeClusters({
        clusterIds: Array.from(selectedMergeIds),
        mergedName: mergedName.trim() || undefined,
      });
      setSelectedMergeIds(new Set());
      setMergedName('');
    } finally {
      setMerging(false);
    }
  };

  if (clusters.length === 0 && keywords.length === 0) {
    return (
      <EmptyStateCard
        title="No topic clusters formed yet"
        description="Run Keyword Discovery to group semantically aligned terms into cohesive topic hubs. Unrelated singletons remain cleanly unclustered."
        actionLabel="Launch Keyword Discovery"
        onAction={onStartDiscovery}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Merge Toolbar */}
      {canApprove && clusters.length >= 2 && (
        <GlassPanel className="p-4">
          <form
            onSubmit={(e) => void handleMerge(e)}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2 text-xs">
              <GitMerge className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--text-primary)]">
                Merge Semantic Clusters ({selectedMergeIds.size} selected)
              </span>
              <span className="text-[var(--text-muted)]">
                Select 2+ clusters below to consolidate into one primary topic hub.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={mergedName}
                onChange={(e) => setMergedName(e.target.value)}
                placeholder="Optional merged cluster name"
                aria-label="Merged cluster name"
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              <InteractiveButton
                type="submit"
                variant="primary"
                size="sm"
                loading={merging}
                disabled={selectedMergeIds.size < 2}
              >
                <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Merge Selected</span>
              </InteractiveButton>
            </div>
          </form>
        </GlassPanel>
      )}

      {clusters.length === 0 ? (
        <GlassPanel className="p-6 text-center text-xs text-[var(--text-muted)]">
          All {keywords.length} keywords are currently unclustered because they did not meet the strict semantic cohesion threshold (no forced grouping of unrelated topics).
        </GlassPanel>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          className="space-y-3.5"
        >
          {clusters.map((cluster) => {
            const expanded = expandedIds.has(cluster.id);
            const members = cluster.keywordIds
              .map((id) => keywordById.get(id))
              .filter((k): k is KeywordIntelligenceRecord => Boolean(k));
            const isEditing = editingId === cluster.id;
            const busy = savingClusterId === cluster.id;

            return (
              <motion.div key={cluster.id} variants={fadeInUp}>
                <GlassPanel className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      {canApprove && (
                        <input
                          type="checkbox"
                          checked={selectedMergeIds.has(cluster.id)}
                          onChange={() => toggleMergeSelect(cluster.id)}
                          aria-label={`Select cluster ${cluster.clusterName} for merge`}
                          className="mt-1 h-4 w-4 shrink-0 rounded accent-[var(--accent-primary)] cursor-pointer"
                        />
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                            {cluster.clusterName}
                          </h3>
                          <StatusBadge
                            label={
                              cluster.approvalState === 'approved'
                                ? 'Approved'
                                : cluster.approvalState === 'rejected'
                                  ? 'Rejected'
                                  : 'Pending Review'
                            }
                            tone={
                              cluster.approvalState === 'approved'
                                ? 'success'
                                : cluster.approvalState === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          />
                          <StatusBadge label={cluster.dominantIntent} tone="indigo" />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span>
                            Primary: <strong className="text-[var(--text-primary)]">{cluster.primaryKeyword}</strong>
                          </span>
                          <span>· {cluster.keywordsCount} keywords</span>
                          <span>· Cohesion {Math.round(cluster.cohesionScore * 100)}%</span>
                          <span>· Confidence {Math.round(cluster.confidence * 100)}%</span>
                          <span>· {cluster.recommendedPageType}</span>
                        </div>

                        <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                          Landing Target:{' '}
                          {cluster.suggestedLandingUrl ? (
                            <span className="text-[var(--accent-primary)]">
                              {cluster.suggestedLandingUrl}
                            </span>
                          ) : (
                            <span>Create dedicated new hub page</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {canApprove && (
                        <>
                          <InteractiveButton
                            variant="secondary"
                            size="sm"
                            onClick={() => startEditing(cluster)}
                          >
                            <Edit3 className="h-3 w-3" aria-hidden="true" />
                            <span>Edit</span>
                          </InteractiveButton>
                          <InteractiveButton
                            variant="primary"
                            size="sm"
                            loading={busy}
                            disabled={!profileApproved || cluster.approvalState === 'approved'}
                            title={
                              profileApproved
                                ? 'Approve cluster'
                                : 'Approve Business Context Profile first'
                            }
                            onClick={() => void handleApproval(cluster, 'approved')}
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            <span>Approve</span>
                          </InteractiveButton>
                          <InteractiveButton
                            variant="danger"
                            size="sm"
                            loading={busy}
                            disabled={cluster.approvalState === 'rejected'}
                            onClick={() => void handleApproval(cluster, 'rejected')}
                          >
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            <span>Reject</span>
                          </InteractiveButton>
                        </>
                      )}

                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleExpand(cluster.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <span>{expanded ? 'Hide' : 'Details'}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            expanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  {/* Intent Breakdown Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    {Object.entries(cluster.intentDistribution)
                      .filter(([, count]) => count > 0)
                      .map(([intentName, count]) => (
                        <span
                          key={intentName}
                          className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[var(--text-secondary)]"
                        >
                          {intentName}: {count}
                        </span>
                      ))}
                    <span className="text-[var(--text-muted)] ml-1">
                      {cluster.evidenceSummary}
                    </span>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        key="cluster-body"
                        variants={accordionExpand}
                        initial={prefersReducedMotion ? false : 'initial'}
                        animate="animate"
                        exit={prefersReducedMotion ? undefined : 'exit'}
                        className="overflow-hidden border-t border-[var(--border-hairline)] pt-3 space-y-3 text-xs"
                      >
                        {isEditing && (
                          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 space-y-2.5">
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                              <div>
                                <label className="block font-semibold text-[var(--text-primary)]">
                                  Cluster Name
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-[var(--text-primary)]">
                                  Suggested Landing URL
                                </label>
                                {crawledUrls.length > 0 ? (
                                  <select
                                    value={editLandingUrl}
                                    onChange={(e) => setEditLandingUrl(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                                  >
                                    <option value="">Create new dedicated page</option>
                                    {crawledUrls.map((u) => (
                                      <option key={u.url} value={u.url}>
                                        {u.url} ({u.statusCode})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={editLandingUrl}
                                    onChange={(e) => setEditLandingUrl(e.target.value)}
                                    placeholder="/dedicated-pillar-page"
                                    className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                                  />
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block font-semibold text-[var(--text-primary)]">
                                Cluster Strategy Notes
                              </label>
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <InteractiveButton
                                variant="subtle"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </InteractiveButton>
                              <InteractiveButton
                                variant="primary"
                                size="sm"
                                loading={busy}
                                onClick={() => void handleSaveEdit(cluster)}
                              >
                                Save Cluster
                              </InteractiveButton>
                            </div>
                          </div>
                        )}

                        {cluster.contentGaps.length > 0 && (
                          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
                            <div className="font-semibold text-[var(--text-primary)]">
                              Content Gaps &amp; Page Recommendations
                            </div>
                            <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--text-secondary)]">
                              {cluster.contentGaps.map((gap, idx) => (
                                <li key={idx}>• {gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="font-semibold text-[var(--text-primary)]">
                            Cluster Member Keywords ({members.length})
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {members.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => onSelectKeyword(m)}
                                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-left hover:border-[var(--accent-primary)]/50 cursor-pointer transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-[var(--text-primary)]">
                                    {m.keyword}
                                  </div>
                                  <div className="text-[10.5px] text-[var(--text-muted)]">
                                    {m.intent} · {m.workflowState}
                                  </div>
                                </div>
                                <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--accent-primary)]">
                                  {m.opportunityScore}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassPanel>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Unclustered Keywords */}
      {unclustered.length > 0 && (
        <GlassPanel className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Unclustered Standalone Keywords ({unclustered.length})
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              Left ungrouped instead of forcing unrelated terms together
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unclustered.slice(0, 24).map((kw) => (
              <button
                key={kw.id}
                type="button"
                onClick={() => onSelectKeyword(kw)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 cursor-pointer transition-colors"
              >
                <span className="font-medium">{kw.keyword}</span>
                <span className="font-mono text-[10.5px] text-[var(--accent-primary)]">
                  {kw.opportunityScore}
                </span>
              </button>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
