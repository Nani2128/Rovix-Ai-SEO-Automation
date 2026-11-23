import { Suspense, lazy, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Box, ExternalLink, GitFork, Orbit } from 'lucide-react';
import type { CrawlURLRecord } from '../../types/crawl';
import {
  buildUrlTopologyGraph,
  type TopologyFilterMode,
  type TopologyNode,
} from '../../utils/crawlTopology';
import { SegmentedTabs } from '../ui/InteractivePrimitives';
import { InteractiveFilterPanel } from '../ui/PremiumPrimitives';

const UrlTopology3DCanvas = lazy(() =>
  import('./UrlTopology3DCanvas').then((m) => ({
    default: m.UrlTopology3DCanvas,
  })),
);

type TopologyViewMode = 'tree' | 'radial' | '3d';

const VIEW_TABS: { id: TopologyViewMode; label: string; icon: typeof GitFork }[] = [
  { id: 'tree', label: 'Depth Tree', icon: GitFork },
  { id: 'radial', label: 'Radial Cluster', icon: Orbit },
  { id: '3d', label: '3D Spatial', icon: Box },
];

export function CrawlVisualization({
  urls,
  onSelectUrl,
}: {
  urls: CrawlURLRecord[];
  onSelectUrl?: (urlRecord: CrawlURLRecord) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [viewMode, setViewMode] = useState<TopologyViewMode>('tree');
  const [filterMode, setFilterMode] = useState<TopologyFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredUrls = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return urls;
    return urls.filter((u) => u.normalizedUrl.toLowerCase().includes(q));
  }, [urls, searchQuery]);

  const graph = useMemo(
    () => buildUrlTopologyGraph(filteredUrls, filterMode, 44),
    [filteredUrls, filterMode],
  );

  const activeNode =
    hoveredNode ??
    graph.nodes.find((n) => n.id === selectedId) ??
    graph.nodes[0] ??
    null;

  const handleNodeClick = (node: TopologyNode) => {
    setSelectedId(node.id);
    const matched = urls.find((u) => u.id === node.id);
    if (matched) onSelectUrl?.(matched);
  };

  return (
    <section
      aria-label="Interactive URL Topology Explorer"
      className="rovix-soft-card rounded-[22px] p-5 space-y-4"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Interactive URL Discovery &amp; Link Topology
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Real parent-to-child paths across {graph.summary.total} crawled URL(s) · Max depth{' '}
            {graph.summary.maxDepth}
          </p>
        </div>

        <SegmentedTabs
          tabs={VIEW_TABS.map((t) => {
            const Icon = t.icon;
            return {
              id: t.id,
              label: t.label,
              icon: <Icon className="h-3.5 w-3.5" aria-hidden="true" />,
            };
          })}
          activeId={viewMode}
          onChange={setViewMode}
          layoutGroupId="url-topology-view-tabs"
          variant="indigo"
        />
      </div>

      <InteractiveFilterPanel
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter URLs in graph..."
        activeChip={filterMode}
        onChipChange={setFilterMode}
        onReset={
          filterMode !== 'all' || searchQuery
            ? () => {
                setFilterMode('all');
                setSearchQuery('');
              }
            : undefined
        }
        chips={[
          { id: 'all', label: 'All URLs', count: graph.summary.total },
          { id: 'clean', label: 'Clean 200', count: graph.summary.clean },
          { id: 'issues', label: '200 w/ Issues', count: graph.summary.issues },
          { id: 'redirect', label: '3xx', count: graph.summary.redirect },
          { id: 'error', label: '4xx / 5xx', count: graph.summary.error },
        ]}
      />

      {graph.nodes.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 text-center">
          <p className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {urls.length === 0
              ? 'Waiting for crawler to discover initial URLs'
              : 'No crawled URLs match the current topology filter'}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
            {urls.length === 0
              ? 'Launch or resume a technical crawl to plot real parent-to-child paths.'
              : 'Reset the filter chips or search box to view all crawled URLs.'}
          </p>
        </div>
      ) : viewMode === '3d' ? (
        <Suspense
          fallback={
            <div className="flex h-[360px] items-center justify-center rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)]">
              Initializing 3D spatial topology renderer...
            </div>
          }
        >
          <UrlTopology3DCanvas
            graph={graph}
            selectedId={selectedId}
            onHoverNode={setHoveredNode}
            onSelectNode={handleNodeClick}
          />
        </Suspense>
      ) : viewMode === 'radial' ? (
        <div className="flex justify-center overflow-x-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2">
          <svg
            width={graph.radialSize}
            height={graph.radialSize}
            viewBox={`0 0 ${graph.radialSize} ${graph.radialSize}`}
            className="block max-w-full"
            role="img"
            aria-label="Radial cluster graph of crawled URLs"
          >
            {graph.depths
              .filter((d) => d > 0)
              .map((d, idx) => (
                <circle
                  key={d}
                  cx={graph.radialSize / 2}
                  cy={graph.radialSize / 2}
                  r={Math.min(215, 76 + (idx + 1) * 64)}
                  fill="none"
                  stroke="var(--chart-grid)"
                  strokeDasharray="4 4"
                />
              ))}

            {graph.edges.map((edge) => (
              <line
                key={edge.id}
                x1={edge.fromRadialX}
                y1={edge.fromRadialY}
                x2={edge.toRadialX}
                y2={edge.toRadialY}
                stroke="var(--chart-grid)"
                strokeWidth={1.4}
                opacity={0.85}
              />
            ))}

            {graph.nodes.map((node, idx) => {
              const isHighlighted =
                hoveredNode?.id === node.id || selectedId === node.id;
              return (
                <motion.g
                  key={node.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.25) }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={node.radialX}
                    cy={node.radialY}
                    r={node.depth === 0 ? 14 : isHighlighted ? 12 : 9.5}
                    fill={node.color}
                    stroke="var(--bg-surface)"
                    strokeWidth={2.5}
                  />
                  {(node.depth <= 1 || isHighlighted) && (
                    <text
                      x={node.radialX}
                      y={node.radialY + 21}
                      textAnchor="middle"
                      fontSize={9.5}
                      fill="var(--text-secondary)"
                      fontWeight={600}
                    >
                      {node.label}
                    </text>
                  )}
                </motion.g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2">
          <svg
            width={graph.treeWidth}
            height={graph.treeHeight}
            viewBox={`0 0 ${graph.treeWidth} ${graph.treeHeight}`}
            className="block min-w-full"
            role="img"
            aria-label="Hierarchical depth tree of crawled URLs"
          >
            {graph.depths.map((d, idx) => (
              <text
                key={d}
                x={12}
                y={52 + idx * graph.rowHeight}
                fontSize={10}
                fill="var(--chart-axis)"
                fontFamily="monospace"
              >
                D{d}
              </text>
            ))}

            {graph.edges.map((edge, idx) => (
              <motion.line
                key={edge.id}
                x1={edge.fromTreeX}
                y1={edge.fromTreeY}
                x2={edge.toTreeX}
                y2={edge.toTreeY}
                stroke="var(--chart-grid)"
                strokeWidth={1.5}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 0.9 }}
                transition={{ duration: 0.22, delay: Math.min(idx * 0.012, 0.22) }}
              />
            ))}

            {graph.nodes.map((node, idx) => {
              const rowItems = graph.nodes.filter((n) => n.depth === node.depth);
              const colIdx = rowItems.findIndex((n) => n.id === node.id);
              const isStaggered = rowItems.length > 5 && colIdx % 2 === 1;
              const labelY = isStaggered ? node.treeY + 39 : node.treeY + 24;
              const isHighlighted =
                hoveredNode?.id === node.id || selectedId === node.id;

              return (
                <motion.g
                  key={node.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.25) }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                  className="cursor-pointer"
                >
                  {isStaggered && (
                    <line
                      x1={node.treeX}
                      y1={node.treeY + 12}
                      x2={node.treeX}
                      y2={node.treeY + 28}
                      stroke="var(--chart-grid)"
                      strokeWidth={1}
                    />
                  )}
                  <circle
                    cx={node.treeX}
                    cy={node.treeY}
                    r={isHighlighted ? 14 : 11}
                    fill={node.color}
                    stroke="var(--bg-surface)"
                    strokeWidth={2.5}
                  />
                  <text
                    x={node.treeX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--text-secondary)"
                    fontWeight={600}
                  >
                    {node.label}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Legend + Active URL Telemetry Strip */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" /> Clean 200
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#7047EB]" /> 200 w/ Issues
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" /> 3xx Redirect
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E05275]" /> 4xx / 5xx
          </span>
        </div>

        {activeNode && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs">
            <span className="max-w-[260px] truncate font-mono text-[11px] font-semibold text-[var(--text-primary)]">
              {activeNode.url}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              HTTP {activeNode.statusCode} · D{activeNode.depth} ·{' '}
              {activeNode.issueCount} issue(s)
            </span>
            {onSelectUrl && (
              <button
                type="button"
                onClick={() => handleNodeClick(activeNode)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline cursor-pointer"
              >
                <span>Inspect</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
