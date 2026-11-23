import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrawlURLRecord } from '../types/crawl.ts';
import {
  buildUrlTopologyGraph,
  classifyUrlBucket,
  extractShortPath,
} from './crawlTopology.ts';

function makeUrlRecord(
  id: string,
  normalizedUrl: string,
  depth: number,
  statusCode: number,
  issueCount = 0,
  parentUrl: string | null = null,
): CrawlURLRecord {
  return {
    id,
    tenantId: 'tenant-1',
    crawlId: 'crawl-1',
    normalizedUrl,
    requestedUrl: normalizedUrl,
    finalUrl: normalizedUrl,
    parentUrl,
    discoverySource: depth === 0 ? 'seed' : 'internal_link',
    redirectChain: [],
    statusCode,
    contentType: 'text/html',
    responseTimeMs: 120,
    depth,
    indexability: statusCode === 200 ? 'Indexable' : 'Non-Indexable',
    indexabilityReason: '200 OK',
    canonicalUrl: normalizedUrl,
    canonicalStatus: 'self_referencing',
    title: 'Sample',
    metaDescription: 'Sample',
    h1: 'Sample',
    headings: [],
    robotsDirectives: [],
    xRobotsTag: null,
    schemaTypes: [],
    schemaErrors: [],
    hreflangTags: [],
    internalLinks: [],
    externalLinks: [],
    missingAltCount: 0,
    hasViewport: true,
    htmlLang: 'en',
    inSitemap: true,
    issueCount,
    renderingSource: 'raw_html',
    renderedDiff: null,
    rawHtmlObjectRef: null,
    renderedDomObjectRef: null,
    fetchedAt: '2026-11-16T00:00:00.000Z',
  };
}

test('classifyUrlBucket categorizes HTTP status codes and issue counts accurately', () => {
  assert.equal(classifyUrlBucket(200, 0), 'clean');
  assert.equal(classifyUrlBucket(200, 3), 'issues');
  assert.equal(classifyUrlBucket(301, 0), 'redirect');
  assert.equal(classifyUrlBucket(404, 1), 'error');
  assert.equal(classifyUrlBucket(500, 0), 'error');
  assert.equal(classifyUrlBucket(0, 1), 'error');
});

test('buildUrlTopologyGraph returns empty graph when no URLs have been crawled', () => {
  const graph = buildUrlTopologyGraph([]);
  assert.equal(graph.nodes.length, 0);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.summary.total, 0);
});

test('buildUrlTopologyGraph maps parent-to-child links and coordinates deterministically', () => {
  const urls: CrawlURLRecord[] = [
    makeUrlRecord('u-root', 'https://example.com/', 0, 200, 0, null),
    makeUrlRecord('u-pricing', 'https://example.com/pricing', 1, 200, 2, 'https://example.com/'),
    makeUrlRecord('u-old', 'https://example.com/old-docs', 1, 301, 0, 'https://example.com/'),
    makeUrlRecord('u-missing', 'https://example.com/pricing/enterprise', 2, 404, 1, 'https://example.com/pricing'),
  ];

  const graph = buildUrlTopologyGraph(urls);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 3);
  assert.deepEqual(graph.depths, [0, 1, 2]);
  assert.equal(graph.summary.clean, 1);
  assert.equal(graph.summary.issues, 1);
  assert.equal(graph.summary.redirect, 1);
  assert.equal(graph.summary.error, 1);

  const deepEdge = graph.edges.find((e) => e.toId === 'u-missing');
  assert.ok(deepEdge);
  assert.equal(deepEdge.fromId, 'u-pricing');
});

test('buildUrlTopologyGraph respects status filter while keeping summary counts for full crawl', () => {
  const urls: CrawlURLRecord[] = [
    makeUrlRecord('u1', 'https://example.com/', 0, 200, 0, null),
    makeUrlRecord('u2', 'https://example.com/broken', 1, 404, 1, 'https://example.com/'),
  ];

  const filtered = buildUrlTopologyGraph(urls, 'error');
  assert.equal(filtered.nodes.length, 1);
  assert.equal(filtered.nodes[0]?.id, 'u2');
  assert.equal(filtered.summary.total, 2);
  assert.equal(filtered.summary.clean, 1);
  assert.equal(filtered.summary.error, 1);
});

test('extractShortPath truncates long paths cleanly', () => {
  assert.equal(extractShortPath('https://example.com/'), '/');
  assert.equal(
    extractShortPath('https://example.com/very-long-technical-audit-documentation-path'),
    '/very-long-techn…',
  );
});
