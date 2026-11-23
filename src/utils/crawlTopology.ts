import type { CrawlURLRecord } from '../types/crawl';

export type TopologyStatusBucket = 'clean' | 'issues' | 'redirect' | 'error';
export type TopologyFilterMode = 'all' | TopologyStatusBucket;

export interface TopologyNode {
  id: string;
  label: string;
  url: string;
  depth: number;
  statusCode: number;
  issueCount: number;
  bucket: TopologyStatusBucket;
  color: string;
  parentUrl: string | null;
  discoverySource: CrawlURLRecord['discoverySource'];
  treeX: number;
  treeY: number;
  radialX: number;
  radialY: number;
  spatialX: number;
  spatialY: number;
  spatialZ: number;
}

export interface TopologyEdge {
  id: string;
  fromId: string;
  toId: string;
  fromTreeX: number;
  fromTreeY: number;
  toTreeX: number;
  toTreeY: number;
  fromRadialX: number;
  fromRadialY: number;
  toRadialX: number;
  toRadialY: number;
  fromSpatial: [number, number, number];
  toSpatial: [number, number, number];
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  treeWidth: number;
  treeHeight: number;
  radialSize: number;
  rowHeight: number;
  depths: number[];
  summary: {
    total: number;
    clean: number;
    issues: number;
    redirect: number;
    error: number;
    maxDepth: number;
  };
}

export function classifyUrlBucket(
  statusCode: number,
  issueCount: number,
): TopologyStatusBucket {
  if (statusCode >= 400 || statusCode === 0) return 'error';
  if (statusCode >= 300) return 'redirect';
  if (issueCount > 0) return 'issues';
  return 'clean';
}

export function topologyBucketColor(bucket: TopologyStatusBucket): string {
  switch (bucket) {
    case 'error':
      return '#E05275';
    case 'redirect':
      return '#D97706';
    case 'issues':
      return '#7047EB';
    case 'clean':
      return '#0D9488';
  }
}

export function extractShortPath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname === '/' ? '/' : parsed.pathname;
    return path.length > 18 ? `${path.slice(0, 16)}…` : path;
  } catch {
    return rawUrl.length > 18 ? `${rawUrl.slice(0, 16)}…` : rawUrl;
  }
}

export function buildUrlTopologyGraph(
  urls: CrawlURLRecord[],
  filter: TopologyFilterMode = 'all',
  maxNodes = 48,
): TopologyGraph {
  const filtered =
    filter === 'all'
      ? urls
      : urls.filter(
          (u) => classifyUrlBucket(u.statusCode, u.issueCount) === filter,
        );

  const visible = filtered.slice(0, maxNodes);
  if (visible.length === 0) {
    return {
      nodes: [],
      edges: [],
      treeWidth: 820,
      treeHeight: 280,
      radialSize: 480,
      rowHeight: 114,
      depths: [],
      summary: {
        total: urls.length,
        clean: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'clean').length,
        issues: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'issues').length,
        redirect: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'redirect').length,
        error: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'error').length,
        maxDepth: urls.reduce((acc, u) => Math.max(acc, u.depth), 0),
      },
    };
  }

  const byDepth = new Map<number, CrawlURLRecord[]>();
  for (const u of visible) {
    const list = byDepth.get(u.depth) ?? [];
    list.push(u);
    byDepth.set(u.depth, list);
  }

  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  const maxCols = Math.max(
    1,
    ...depths.map((d) => (byDepth.get(d) ?? []).length),
  );
  const treeWidth = Math.max(820, maxCols * 126);
  const rowHeight = 114;
  const treeHeight = Math.max(280, depths.length * rowHeight + 70);
  const radialSize = 520;
  const radialCenter = radialSize / 2;

  const nodes: TopologyNode[] = [];
  const nodeByUrl = new Map<string, TopologyNode>();

  depths.forEach((depth, rowIdx) => {
    const rowItems = byDepth.get(depth) ?? [];
    const usableWidth = treeWidth - 56;
    const spacing = usableWidth / (rowItems.length + 1);
    const radialRadius = rowIdx === 0 ? 0 : Math.min(215, 76 + rowIdx * 64);

    rowItems.forEach((rec, colIdx) => {
      const bucket = classifyUrlBucket(rec.statusCode, rec.issueCount);
      const treeX = 40 + spacing * (colIdx + 1);
      const treeY = 48 + rowIdx * rowHeight;

      const angle =
        rowItems.length === 1 && rowIdx === 0
          ? 0
          : (colIdx / Math.max(1, rowItems.length)) * Math.PI * 2 - Math.PI / 2;
      const radialX = radialCenter + Math.cos(angle) * radialRadius;
      const radialY = radialCenter + Math.sin(angle) * radialRadius;

      const spatialRadius = rowIdx === 0 ? 0 : 1.55 + rowIdx * 1.15;
      const spatialX = Math.cos(angle) * spatialRadius;
      const spatialZ = Math.sin(angle) * spatialRadius;
      const spatialY = Math.max(0.25, 2.35 - rowIdx * 0.48);

      const node: TopologyNode = {
        id: rec.id,
        label: extractShortPath(rec.normalizedUrl),
        url: rec.normalizedUrl,
        depth: rec.depth,
        statusCode: rec.statusCode,
        issueCount: rec.issueCount,
        bucket,
        color: topologyBucketColor(bucket),
        parentUrl: rec.parentUrl,
        discoverySource: rec.discoverySource,
        treeX,
        treeY,
        radialX,
        radialY,
        spatialX,
        spatialY,
        spatialZ,
      };
      nodes.push(node);
      nodeByUrl.set(rec.normalizedUrl, node);
    });
  });

  const rootNode = nodes[0];
  const edges: TopologyEdge[] = [];
  for (const node of nodes) {
    if (node.id === rootNode.id && node.depth === 0) continue;
    const parent =
      (node.parentUrl ? nodeByUrl.get(node.parentUrl) : undefined) ?? rootNode;
    if (parent && parent.id !== node.id) {
      edges.push({
        id: `${parent.id}->${node.id}`,
        fromId: parent.id,
        toId: node.id,
        fromTreeX: parent.treeX,
        fromTreeY: parent.treeY,
        toTreeX: node.treeX,
        toTreeY: node.treeY,
        fromRadialX: parent.radialX,
        fromRadialY: parent.radialY,
        toRadialX: node.radialX,
        toRadialY: node.radialY,
        fromSpatial: [parent.spatialX, parent.spatialY, parent.spatialZ],
        toSpatial: [node.spatialX, node.spatialY, node.spatialZ],
      });
    }
  }

  return {
    nodes,
    edges,
    treeWidth,
    treeHeight,
    radialSize,
    rowHeight,
    depths,
    summary: {
      total: urls.length,
      clean: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'clean').length,
      issues: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'issues').length,
      redirect: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'redirect').length,
      error: urls.filter((u) => classifyUrlBucket(u.statusCode, u.issueCount) === 'error').length,
      maxDepth: urls.reduce((acc, u) => Math.max(acc, u.depth), 0),
    },
  };
}
