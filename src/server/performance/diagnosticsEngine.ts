import crypto from 'node:crypto';
import type {
  CruxMetricDistribution,
  EffortEstimate,
  FieldCruxMetrics,
  LabCoreWebVitals,
  PerformanceDiagnosticAudit,
  PerformanceFinding,
  PerformanceResourceItem,
  PerformanceResourceSummary,
  PerformanceRuleCategory,
  PerformanceStrategy,
  PerformanceUsabilityChecks,
} from '../../types/performance';
import type { IssueSeverity } from '../../types/technicalIssue';

export interface ParsedPageSpeedPayload {
  url: string;
  finalUrl: string;
  strategy: PerformanceStrategy;
  collectedAt: string;
  lab: LabCoreWebVitals;
  field: FieldCruxMetrics;
  resources: PerformanceResourceSummary;
  usability: PerformanceUsabilityChecks;
  diagnostics: PerformanceDiagnosticAudit[];
  rawAudits: Record<string, RawLighthouseAudit>;
}

export interface RawLighthouseAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: Record<string, unknown>[];
  };
}

interface RawCruxMetric {
  percentile?: number;
  category?: string;
  distributions?: {
    min?: number;
    max?: number;
    proportion?: number;
  }[];
}

export interface RawPageSpeedApiResponse {
  id?: string;
  analysisUTCTimestamp?: string;
  loadingExperience?: {
    id?: string;
    metrics?: Record<string, RawCruxMetric>;
    overall_category?: string;
  };
  originLoadingExperience?: {
    id?: string;
    metrics?: Record<string, RawCruxMetric>;
    overall_category?: string;
  };
  lighthouseResult?: {
    finalUrl?: string;
    requestedUrl?: string;
    fetchTime?: string;
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, RawLighthouseAudit>;
  };
}

function emptyCruxMetric(): CruxMetricDistribution {
  return {
    percentileP75: null,
    category: 'UNAVAILABLE',
    goodPct: null,
    needsImprovementPct: null,
    poorPct: null,
  };
}

function parseCruxMetric(
  raw: RawCruxMetric | undefined,
  opts?: { divideBy100?: boolean },
): CruxMetricDistribution {
  if (!raw || typeof raw.percentile !== 'number') {
    return emptyCruxMetric();
  }
  const percentileP75 = opts?.divideBy100
    ? Number((raw.percentile / 100).toFixed(3))
    : Math.round(raw.percentile);

  const dists = Array.isArray(raw.distributions) ? raw.distributions : [];
  const toPct = (idx: number): number | null => {
    const prop = dists[idx]?.proportion;
    return typeof prop === 'number' ? Math.round(prop * 1000) / 10 : null;
  };

  const catRaw = String(raw.category ?? 'UNAVAILABLE').toUpperCase();
  const category: CruxMetricDistribution['category'] =
    catRaw === 'FAST' || catRaw === 'AVERAGE' || catRaw === 'SLOW'
      ? catRaw
      : 'UNAVAILABLE';

  return {
    percentileP75,
    category,
    goodPct: toPct(0),
    needsImprovementPct: toPct(1),
    poorPct: toPct(2),
  };
}

export function extractFieldCruxMetrics(
  rawJson: RawPageSpeedApiResponse,
  collectedAt: string,
): FieldCruxMetrics {
  const urlMetrics = rawJson.loadingExperience?.metrics;
  const originMetrics = rawJson.originLoadingExperience?.metrics;

  const hasUrlMetrics = Boolean(urlMetrics && Object.keys(urlMetrics).length > 0);
  const hasOriginMetrics = Boolean(
    originMetrics && Object.keys(originMetrics).length > 0,
  );

  if (!hasUrlMetrics && !hasOriginMetrics) {
    return {
      available: false,
      scope: 'unavailable',
      source: 'Chrome UX Report (CrUX)',
      reportingPeriod: 'Rolling 28-day real-user collection',
      collectedAt: null,
      measurementStatus: 'unavailable',
      lcp: emptyCruxMetric(),
      inp: emptyCruxMetric(),
      cls: emptyCruxMetric(),
      fcp: emptyCruxMetric(),
      ttfb: emptyCruxMetric(),
      note: 'Chrome UX Report field data unavailable for this URL/origin (insufficient eligible real-user traffic in the 28-day CrUX window).',
    };
  }

  const scope: 'url' | 'origin' = hasUrlMetrics ? 'url' : 'origin';
  const sourceMetrics = (hasUrlMetrics ? urlMetrics : originMetrics) ?? {};

  return {
    available: true,
    scope,
    source:
      scope === 'url'
        ? 'Chrome UX Report (CrUX · URL Field Data)'
        : 'Chrome UX Report (CrUX · Origin Field Fallback)',
    reportingPeriod: 'Rolling 28-day real-user collection',
    collectedAt,
    measurementStatus: 'measured',
    lcp: parseCruxMetric(sourceMetrics.LARGEST_CONTENTFUL_PAINT_MS),
    inp: parseCruxMetric(
      sourceMetrics.INTERACTION_TO_NEXT_PAINT ?? sourceMetrics.FIRST_INPUT_DELAY_MS,
    ),
    cls: parseCruxMetric(sourceMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, {
      divideBy100: true,
    }),
    fcp: parseCruxMetric(sourceMetrics.FIRST_CONTENTFUL_PAINT_MS),
    ttfb: parseCruxMetric(sourceMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE),
    note:
      scope === 'url'
        ? 'Measured 75th-percentile real-user Chrome field experience for this exact URL.'
        : 'URL-level CrUX sample was too small; displaying origin-level 28-day CrUX field metrics.',
  };
}

function scoreToPercent(score?: number | null): number | null {
  return typeof score === 'number' && !Number.isNaN(score)
    ? Math.round(score * 100)
    : null;
}

function numericOrNull(audit?: RawLighthouseAudit): number | null {
  return typeof audit?.numericValue === 'number' && !Number.isNaN(audit.numericValue)
    ? audit.numericValue
    : null;
}

function parseResources(
  audits: Record<string, RawLighthouseAudit>,
): PerformanceResourceSummary {
  const totalByteWeight = numericOrNull(audits['total-byte-weight']);
  const domNodesCount = numericOrNull(audits['dom-size']);

  const summaryItems = Array.isArray(audits['resource-summary']?.details?.items)
    ? audits['resource-summary']!.details!.items!
    : [];

  let totalRequests: number | null = null;
  let scriptBytes: number | null = null;
  let stylesheetBytes: number | null = null;
  let imageBytes: number | null = null;
  let fontBytes: number | null = null;
  let thirdPartyBytes: number | null = null;
  let thirdPartyBlockingMs: number | null = null;

  for (const item of summaryItems) {
    const resourceType = String(item.resourceType ?? '').toLowerCase();
    const size = typeof item.transferSize === 'number' ? Math.round(item.transferSize) : 0;
    const reqs = typeof item.requestCount === 'number' ? Math.round(item.requestCount) : 0;
    if (resourceType === 'total') {
      totalRequests = reqs;
    } else if (resourceType === 'script') {
      scriptBytes = (scriptBytes ?? 0) + size;
    } else if (resourceType === 'stylesheet') {
      stylesheetBytes = (stylesheetBytes ?? 0) + size;
    } else if (resourceType === 'image') {
      imageBytes = (imageBytes ?? 0) + size;
    } else if (resourceType === 'font') {
      fontBytes = (fontBytes ?? 0) + size;
    } else if (resourceType === 'third-party') {
      thirdPartyBytes = (thirdPartyBytes ?? 0) + size;
    }
  }

  const tpItems = Array.isArray(audits['third-party-summary']?.details?.items)
    ? audits['third-party-summary']!.details!.items!
    : [];
  if (tpItems.length > 0) {
    let tpSize = 0;
    let tpBlock = 0;
    for (const tp of tpItems) {
      if (typeof tp.transferSize === 'number') tpSize += tp.transferSize;
      if (typeof tp.blockingTime === 'number') tpBlock += tp.blockingTime;
    }
    if (thirdPartyBytes === null && tpSize > 0) {
      thirdPartyBytes = Math.round(tpSize);
    }
    thirdPartyBlockingMs = Math.round(tpBlock);
  }

  const networkItems = Array.isArray(audits['network-requests']?.details?.items)
    ? audits['network-requests']!.details!.items!
    : [];

  if (totalRequests === null && networkItems.length > 0) {
    totalRequests = networkItems.length;
  }

  const largestResources: PerformanceResourceItem[] = networkItems
    .filter((i) => typeof i.url === 'string' && typeof i.transferSize === 'number')
    .sort((a, b) => Number(b.transferSize ?? 0) - Number(a.transferSize ?? 0))
    .slice(0, 10)
    .map((item) => ({
      url: String(item.url),
      resourceType: String(item.resourceType ?? 'other'),
      transferSizeBytes: Math.round(Number(item.transferSize ?? 0)),
      wastedBytes: null,
      wastedMs: null,
    }));

  if (largestResources.length === 0) {
    // Pull top resource URLs from opportunity audits if network-requests audit wasn't populated
    const opportunityAudits = [
      ['render-blocking-resources', 'stylesheet/script'],
      ['unused-javascript', 'script'],
      ['unused-css-rules', 'stylesheet'],
      ['uses-optimized-images', 'image'],
      ['modern-image-formats', 'image'],
    ] as const;

    const seenUrls = new Set<string>();
    for (const [auditId, fallbackType] of opportunityAudits) {
      const items = audits[auditId]?.details?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const u = typeof item.url === 'string' ? item.url : null;
        if (!u || seenUrls.has(u)) continue;
        seenUrls.add(u);
        largestResources.push({
          url: u,
          resourceType: fallbackType,
          transferSizeBytes: Math.round(Number(item.totalBytes ?? 0)),
          wastedBytes:
            typeof item.wastedBytes === 'number' ? Math.round(item.wastedBytes) : null,
          wastedMs:
            typeof item.wastedMs === 'number' ? Math.round(item.wastedMs) : null,
        });
      }
    }
    largestResources.sort(
      (a, b) =>
        (b.transferSizeBytes || b.wastedBytes || 0) -
        (a.transferSizeBytes || a.wastedBytes || 0),
    );
  }

  return {
    totalByteWeight: totalByteWeight !== null ? Math.round(totalByteWeight) : null,
    totalRequests,
    scriptBytes,
    stylesheetBytes,
    imageBytes,
    fontBytes,
    thirdPartyBytes,
    thirdPartyBlockingMs,
    domNodesCount: domNodesCount !== null ? Math.round(domNodesCount) : null,
    largestResources: largestResources.slice(0, 10),
  };
}

function checkBinaryAudit(audit?: RawLighthouseAudit): boolean | null {
  if (!audit || typeof audit.score !== 'number') return null;
  return audit.score >= 0.9;
}

function parseUsability(
  audits: Record<string, RawLighthouseAudit>,
  strategy: PerformanceStrategy,
): PerformanceUsabilityChecks {
  const viewportConfigured = checkBinaryAudit(audits.viewport);
  const legibleFontSizes = checkBinaryAudit(audits['font-size']);
  const tapTargetsAdequate = checkBinaryAudit(
    audits['target-size'] ?? audits['tap-targets'],
  );
  const colorContrastOk = checkBinaryAudit(audits['color-contrast']);

  const notes: string[] = [];
  if (viewportConfigured === false) {
    notes.push('Missing or invalid mobile <meta name="viewport"> tag.');
  }
  if (legibleFontSizes === false) {
    notes.push('Document uses font sizes smaller than 12px on mobile viewport.');
  }
  if (tapTargetsAdequate === false) {
    notes.push('Interactive tap targets are too small or spaced too closely.');
  }
  if (colorContrastOk === false) {
    notes.push('Foreground and background colors do not meet WCAG AA contrast ratios.');
  }
  if (notes.length === 0 && strategy === 'mobile') {
    notes.push('Measured mobile viewport, font legibility, and tap-target audits passed.');
  }

  return {
    viewportConfigured,
    legibleFontSizes,
    tapTargetsAdequate,
    colorContrastOk,
    notes,
  };
}

const DIAGNOSTIC_AUDIT_KEYS = [
  'render-blocking-resources',
  'unused-javascript',
  'unused-css-rules',
  'uses-optimized-images',
  'modern-image-formats',
  'uses-responsive-images',
  'unsized-images',
  'offscreen-images',
  'uses-text-compression',
  'font-display',
  'third-party-summary',
  'bootup-time',
  'mainthread-work-breakdown',
  'dom-size',
  'server-response-time',
  'largest-contentful-paint-element',
  'layout-shift-elements',
  'viewport',
  'font-size',
  'target-size',
  'tap-targets',
  'color-contrast',
] as const;

export function parsePageSpeedResponse(
  rawJson: RawPageSpeedApiResponse,
  params: {
    url: string;
    strategy: PerformanceStrategy;
    collectedAt?: string;
  },
): ParsedPageSpeedPayload {
  const lhr = rawJson.lighthouseResult ?? {};
  const cats = lhr.categories ?? {};
  const audits = lhr.audits ?? {};
  const collectedAt =
    params.collectedAt ??
    lhr.fetchTime ??
    rawJson.analysisUTCTimestamp ??
    new Date().toISOString();

  const lab: LabCoreWebVitals = {
    performanceScore: scoreToPercent(cats.performance?.score),
    accessibilityScore: scoreToPercent(cats.accessibility?.score),
    bestPracticesScore: scoreToPercent(cats['best-practices']?.score),
    seoScore: scoreToPercent(cats.seo?.score),
    fcpMs:
      numericOrNull(audits['first-contentful-paint']) !== null
        ? Math.round(numericOrNull(audits['first-contentful-paint'])!)
        : null,
    lcpMs:
      numericOrNull(audits['largest-contentful-paint']) !== null
        ? Math.round(numericOrNull(audits['largest-contentful-paint'])!)
        : null,
    speedIndexMs:
      numericOrNull(audits['speed-index']) !== null
        ? Math.round(numericOrNull(audits['speed-index'])!)
        : null,
    tbtMs:
      numericOrNull(audits['total-blocking-time']) !== null
        ? Math.round(numericOrNull(audits['total-blocking-time'])!)
        : null,
    clsScore:
      numericOrNull(audits['cumulative-layout-shift']) !== null
        ? Number(numericOrNull(audits['cumulative-layout-shift'])!.toFixed(3))
        : null,
    ttfbMs:
      numericOrNull(audits['server-response-time']) !== null
        ? Math.round(numericOrNull(audits['server-response-time'])!)
        : null,
  };

  const field = extractFieldCruxMetrics(rawJson, collectedAt);
  const resources = parseResources(audits);
  const usability = parseUsability(audits, params.strategy);

  const diagnostics: PerformanceDiagnosticAudit[] = [];
  for (const auditId of DIAGNOSTIC_AUDIT_KEYS) {
    const a = audits[auditId];
    if (!a) continue;
    const score = typeof a.score === 'number' ? a.score : null;
    const savingsMs =
      typeof a.details?.overallSavingsMs === 'number'
        ? Math.round(a.details.overallSavingsMs)
        : null;
    const savingsBytes =
      typeof a.details?.overallSavingsBytes === 'number'
        ? Math.round(a.details.overallSavingsBytes)
        : null;
    const items = Array.isArray(a.details?.items) ? a.details!.items! : [];

    const kind: PerformanceDiagnosticAudit['kind'] =
      score !== null && score >= 0.9
        ? 'passed'
        : a.details?.type === 'opportunity' || (savingsMs ?? 0) > 0 || (savingsBytes ?? 0) > 0
          ? 'opportunity'
          : 'problem';

    diagnostics.push({
      auditId,
      title: a.title ?? auditId,
      description: (a.description ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
      score,
      displayValue: a.displayValue ?? null,
      numericValue: typeof a.numericValue === 'number' ? a.numericValue : null,
      numericUnit: a.numericUnit ?? null,
      savingsMs,
      savingsBytes,
      kind,
      itemCount: items.length,
    });
  }

  return {
    url: params.url,
    finalUrl: lhr.finalUrl ?? lhr.requestedUrl ?? params.url,
    strategy: params.strategy,
    collectedAt,
    lab,
    field,
    resources,
    usability,
    diagnostics,
    rawAudits: audits,
  };
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extractSampleUrls(audit?: RawLighthouseAudit): string[] {
  const items = audit?.details?.items;
  if (!Array.isArray(items)) return [];
  const urls: string[] = [];
  for (const item of items) {
    if (typeof item.url === 'string' && item.url.startsWith('http')) {
      urls.push(item.url);
    } else if (
      item.node &&
      typeof item.node === 'object' &&
      typeof (item.node as { snippet?: unknown }).snippet === 'string'
    ) {
      urls.push((item.node as { snippet: string }).snippet.slice(0, 120));
    }
    if (urls.length >= 5) break;
  }
  return urls;
}

export function detectPerformanceFindings(params: {
  parsed: ParsedPageSpeedPayload;
  tenantId: string;
  projectId: string;
  auditRunId: string;
  measurementId: string;
}): PerformanceFinding[] {
  const { parsed, tenantId, projectId, auditRunId, measurementId } = params;
  const { lab, resources, usability, rawAudits, url, strategy, collectedAt } = parsed;
  const findings: PerformanceFinding[] = [];

  const pushFinding = (f: {
    ruleId: string;
    category: PerformanceRuleCategory;
    findingKind: 'problem' | 'opportunity';
    severity: IssueSeverity;
    title: string;
    rootCause: string;
    explanation: string;
    auditId: string;
    metricLabel: string;
    measuredValue: string;
    thresholdLabel: string;
    sampleUrls?: string[];
    recommendedSolution: string;
    estimatedEffort: EffortEstimate;
    affectedBytes?: number | null;
    affectedMs?: number | null;
  }) => {
    findings.push({
      id: `pf-${crypto.randomUUID().slice(0, 10)}`,
      tenantId,
      projectId,
      auditRunId,
      measurementId,
      url,
      strategy,
      ruleId: f.ruleId,
      category: f.category,
      findingKind: f.findingKind,
      severity: f.severity,
      title: f.title,
      rootCause: f.rootCause,
      explanation: f.explanation,
      evidence: {
        auditId: f.auditId,
        metricLabel: f.metricLabel,
        measuredValue: f.measuredValue,
        thresholdLabel: f.thresholdLabel,
        sampleUrls: f.sampleUrls && f.sampleUrls.length > 0 ? f.sampleUrls : [url],
      },
      recommendedSolution: f.recommendedSolution,
      estimatedEffort: f.estimatedEffort,
      affectedBytes: f.affectedBytes ?? null,
      affectedMs: f.affectedMs ?? null,
      linkedIssueId: null,
      createdAt: collectedAt,
    });
  };

  // 1. Slow LCP
  if (lab.lcpMs !== null && lab.lcpMs > 2500) {
    const lcpElement = rawAudits['largest-contentful-paint-element'];
    pushFinding({
      ruleId: 'PERF-LCP-SLOW',
      category: 'Core Web Vitals',
      findingKind: 'problem',
      severity: lab.lcpMs > 4000 ? 'Critical' : 'High',
      title: `Slow Largest Contentful Paint (${(lab.lcpMs / 1000).toFixed(2)}s on ${strategy})`,
      rootCause: 'Above-the-fold hero media or primary text block took longer than the 2.5s Good CWV threshold to render.',
      explanation: `Lighthouse lab measured LCP at ${(lab.lcpMs / 1000).toFixed(2)}s on ${strategy}, exceeding Google's 2.5s Core Web Vitals threshold.`,
      auditId: 'largest-contentful-paint',
      metricLabel: 'Largest Contentful Paint (Lab)',
      measuredValue: `${(lab.lcpMs / 1000).toFixed(2)}s (${lab.lcpMs} ms)`,
      thresholdLabel: '<= 2.50s (Good)',
      sampleUrls: extractSampleUrls(lcpElement),
      recommendedSolution:
        'Preload the LCP hero image/font with <link rel="preload" fetchpriority="high">, remove render-blocking CSS/JS above the fold, and optimize TTFB.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedMs: lab.lcpMs - 2500,
    });
  }

  // 2. High CLS / Layout Shifts
  if (lab.clsScore !== null && lab.clsScore > 0.1) {
    const clsElements = rawAudits['layout-shift-elements'];
    pushFinding({
      ruleId: 'PERF-CLS-SHIFT',
      category: 'Core Web Vitals',
      findingKind: 'problem',
      severity: lab.clsScore > 0.25 ? 'Critical' : 'High',
      title: `Layout Instability Detected (CLS ${lab.clsScore.toFixed(3)} on ${strategy})`,
      rootCause: 'Elements shifted unexpectedly during viewport hydration due to missing media dimensions or late-injected banners/fonts.',
      explanation: `Cumulative Layout Shift measured ${lab.clsScore.toFixed(3)} in Lighthouse Lab, exceeding the <= 0.10 stability threshold.`,
      auditId: 'cumulative-layout-shift',
      metricLabel: 'Cumulative Layout Shift (Lab)',
      measuredValue: lab.clsScore.toFixed(3),
      thresholdLabel: '<= 0.100 (Good)',
      sampleUrls: extractSampleUrls(clsElements),
      recommendedSolution:
        'Set explicit width/height or CSS aspect-ratio attributes on all images, embeds, and ad/cookie containers; avoid inserting DOM content above existing viewport text.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
    });
  }

  // 3. Blocking JS / High TBT
  const bootupAudit = rawAudits['bootup-time'];
  if ((lab.tbtMs !== null && lab.tbtMs > 200) || (typeof bootupAudit?.score === 'number' && bootupAudit.score < 0.7)) {
    const tbtVal = lab.tbtMs ?? Math.round(bootupAudit?.numericValue ?? 0);
    pushFinding({
      ruleId: 'PERF-JS-TBT',
      category: 'JavaScript & Execution',
      findingKind: 'problem',
      severity: tbtVal > 600 ? 'Critical' : 'High',
      title: `Main-Thread Blocking JavaScript (${tbtVal} ms TBT on ${strategy})`,
      rootCause: 'Long JavaScript evaluation and hydration tasks blocked user input responsiveness on the main thread.',
      explanation: `Total Blocking Time reached ${tbtVal} ms (recommended <= 200 ms), delaying interactivity and harming INP responsiveness.`,
      auditId: 'total-blocking-time',
      metricLabel: 'Total Blocking Time (Lab)',
      measuredValue: `${tbtVal} ms`,
      thresholdLabel: '<= 200 ms (Good)',
      sampleUrls: extractSampleUrls(bootupAudit),
      recommendedSolution:
        'Code-split heavy client bundles, defer non-critical hydration tasks, and break long (>50ms) JavaScript work into smaller scheduled chunks.',
      estimatedEffort: 'High (1–3 days, estimate)',
      affectedMs: tbtVal > 200 ? tbtVal - 200 : tbtVal,
    });
  }

  // 4. Render-blocking resources (CSS/JS)
  const renderBlock = rawAudits['render-blocking-resources'];
  if (renderBlock && typeof renderBlock.score === 'number' && renderBlock.score < 0.9) {
    const savingsMs = Math.round(renderBlock.details?.overallSavingsMs ?? renderBlock.numericValue ?? 0);
    pushFinding({
      ruleId: 'PERF-CSS-RENDER-BLOCK',
      category: 'CSS & Render Blocking',
      findingKind: 'opportunity',
      severity: savingsMs >= 500 ? 'High' : 'Medium',
      title: `Render-Blocking Stylesheets or Scripts (${savingsMs} ms potential savings)`,
      rootCause: 'Synchronous <link rel="stylesheet"> or blocking <script> tags in <head> paused initial paint.',
      explanation: `Lighthouse detected ${renderBlock.details?.items?.length ?? 1} render-blocking resource(s) delaying First Contentful Paint by ~${savingsMs} ms.`,
      auditId: 'render-blocking-resources',
      metricLabel: 'Estimated Paint Delay',
      measuredValue: `${savingsMs} ms`,
      thresholdLabel: '0 ms blocking resources',
      sampleUrls: extractSampleUrls(renderBlock),
      recommendedSolution:
        'Inline critical above-the-fold CSS, load remaining stylesheets asynchronously, and move blocking scripts to defer/module.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedMs: savingsMs,
    });
  }

  // 5. Oversized / unsized images
  const optImg = rawAudits['uses-optimized-images'];
  const respImg = rawAudits['uses-responsive-images'];
  const unsizedImg = rawAudits['unsized-images'];
  const imgSavingsBytes =
    Math.round(optImg?.details?.overallSavingsBytes ?? 0) +
    Math.round(respImg?.details?.overallSavingsBytes ?? 0);
  if (
    imgSavingsBytes > 25_000 ||
    (typeof unsizedImg?.score === 'number' && unsizedImg.score < 0.9)
  ) {
    pushFinding({
      ruleId: 'PERF-IMG-OVERSIZED',
      category: 'Images & Media',
      findingKind: 'opportunity',
      severity: imgSavingsBytes > 250_000 ? 'High' : 'Medium',
      title: `Oversized or Unsized Images (${fmtBytes(imgSavingsBytes)} wasted)`,
      rootCause: 'Images are served at larger dimensions than rendered slots or lack explicit width/height attributes.',
      explanation: `Responsive/optimized image audits identified ${fmtBytes(imgSavingsBytes)} of excess image transfer weight.`,
      auditId: respImg ? 'uses-responsive-images' : 'uses-optimized-images',
      metricLabel: 'Excess Image Payload',
      measuredValue: fmtBytes(imgSavingsBytes),
      thresholdLabel: '<= 25 KB overhead',
      sampleUrls: [...extractSampleUrls(respImg), ...extractSampleUrls(optImg)].slice(0, 5),
      recommendedSolution:
        'Serve responsive srcset variants matching rendered container sizes and include explicit width/height attributes on every <img>.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
      affectedBytes: imgSavingsBytes,
    });
  }

  // 6. Modern image formats (WebP/AVIF) & text compression
  const modernImg = rawAudits['modern-image-formats'];
  const modernBytes = Math.round(modernImg?.details?.overallSavingsBytes ?? 0);
  const textComp = rawAudits['uses-text-compression'];
  const compBytes = Math.round(textComp?.details?.overallSavingsBytes ?? 0);
  if (modernBytes > 25_000 || compBytes > 15_000) {
    const total = modernBytes + compBytes;
    pushFinding({
      ruleId: 'PERF-IMG-NEXTGEN',
      category: 'Images & Media',
      findingKind: 'opportunity',
      severity: total > 200_000 ? 'Medium' : 'Low',
      title: `Missing Modern Image Formats / Compression (${fmtBytes(total)} savings)`,
      rootCause: 'Legacy JPEG/PNG assets or uncompressed text responses increase network transfer time.',
      explanation: `Converting eligible images to AVIF/WebP and enabling Brotli/Gzip compression saves ~${fmtBytes(total)}.`,
      auditId: modernBytes >= compBytes ? 'modern-image-formats' : 'uses-text-compression',
      metricLabel: 'Compression Savings',
      measuredValue: fmtBytes(total),
      thresholdLabel: 'AVIF/WebP + Brotli active',
      sampleUrls: [...extractSampleUrls(modernImg), ...extractSampleUrls(textComp)].slice(0, 5),
      recommendedSolution:
        'Deliver AVIF/WebP images via CDN/image pipeline and enable Brotli or Gzip compression for HTML, CSS, JS, and JSON responses.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
      affectedBytes: total,
    });
  }

  // 7. Unused JavaScript
  const unusedJs = rawAudits['unused-javascript'];
  const unusedJsBytes = Math.round(unusedJs?.details?.overallSavingsBytes ?? 0);
  if (unusedJs && typeof unusedJs.score === 'number' && unusedJs.score < 0.9 && unusedJsBytes > 20_000) {
    pushFinding({
      ruleId: 'PERF-JS-UNUSED',
      category: 'JavaScript & Execution',
      findingKind: 'opportunity',
      severity: unusedJsBytes > 180_000 ? 'High' : 'Medium',
      title: `Unused JavaScript Bundles (${fmtBytes(unusedJsBytes)} unused)`,
      rootCause: 'Shipped client-side JavaScript contains dead routes, polyfills, or un-shaken libraries not executed on initial load.',
      explanation: `Lighthouse coverage detected ${fmtBytes(unusedJsBytes)} of unexecuted JavaScript downloaded during initial load.`,
      auditId: 'unused-javascript',
      metricLabel: 'Unused JS Payload',
      measuredValue: fmtBytes(unusedJsBytes),
      thresholdLabel: '<= 20 KB unused JS',
      sampleUrls: extractSampleUrls(unusedJs),
      recommendedSolution:
        'Apply route-based dynamic import(), tree-shake unused dependencies, and defer non-initial modals/charts until interaction.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedBytes: unusedJsBytes,
      affectedMs: Math.round(unusedJs.details?.overallSavingsMs ?? 0) || null,
    });
  }

  // 8. Unused CSS
  const unusedCss = rawAudits['unused-css-rules'];
  const unusedCssBytes = Math.round(unusedCss?.details?.overallSavingsBytes ?? 0);
  if (unusedCss && typeof unusedCss.score === 'number' && unusedCss.score < 0.9 && unusedCssBytes > 12_000) {
    pushFinding({
      ruleId: 'PERF-CSS-UNUSED',
      category: 'CSS & Render Blocking',
      findingKind: 'opportunity',
      severity: unusedCssBytes > 80_000 ? 'Medium' : 'Low',
      title: `Unused CSS Rules (${fmtBytes(unusedCssBytes)} unused)`,
      rootCause: 'Stylesheets bundle utility or component rules not referenced by this template.',
      explanation: `${fmtBytes(unusedCssBytes)} of downloaded CSS rules were unused during initial page render.`,
      auditId: 'unused-css-rules',
      metricLabel: 'Unused CSS Payload',
      measuredValue: fmtBytes(unusedCssBytes),
      thresholdLabel: '<= 12 KB unused CSS',
      sampleUrls: extractSampleUrls(unusedCss),
      recommendedSolution:
        'Purge unused CSS classes at build time and split component styles into route-scoped chunks.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
      affectedBytes: unusedCssBytes,
    });
  }

  // 9. Font loading / font-display
  const fontDisplay = rawAudits['font-display'];
  if (fontDisplay && typeof fontDisplay.score === 'number' && fontDisplay.score < 0.9) {
    pushFinding({
      ruleId: 'PERF-FONT-DISPLAY',
      category: 'Fonts & Web Typography',
      findingKind: 'problem',
      severity: 'Medium',
      title: 'Webfonts Blocking Text Visibility (Missing font-display: swap)',
      rootCause: '@font-face declarations lack font-display: swap/optional, causing invisible text (FOIT) while fonts download.',
      explanation: fontDisplay.displayValue || 'Lighthouse flagged webfonts delaying visible text rendering.',
      auditId: 'font-display',
      metricLabel: 'Font Display Policy',
      measuredValue: fontDisplay.displayValue ?? 'Blocking FOIT',
      thresholdLabel: 'font-display: swap/optional',
      sampleUrls: extractSampleUrls(fontDisplay),
      recommendedSolution:
        'Add font-display: swap to @font-face declarations (or &display=swap for hosted fonts) and preload primary heading/body WOFF2 weights.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
    });
  }

  // 10. Third-party script overhead
  if (
    (resources.thirdPartyBlockingMs !== null && resources.thirdPartyBlockingMs > 150) ||
    (resources.thirdPartyBytes !== null && resources.thirdPartyBytes > 250_000)
  ) {
    const tpBlock = resources.thirdPartyBlockingMs ?? 0;
    const tpBytes = resources.thirdPartyBytes ?? 0;
    pushFinding({
      ruleId: 'PERF-THIRD-PARTY',
      category: 'Third-Party Scripts',
      findingKind: 'problem',
      severity: tpBlock > 350 ? 'High' : 'Medium',
      title: `Heavy Third-Party Script Overhead (${tpBlock} ms blocking · ${fmtBytes(tpBytes)})`,
      rootCause: 'Analytics, tag managers, chat widgets, or external embeds consumed excessive main-thread time or bandwidth.',
      explanation: `Third-party origins contributed ${tpBlock} ms main-thread blocking and ${fmtBytes(tpBytes)} network transfer.`,
      auditId: 'third-party-summary',
      metricLabel: 'Third-Party Impact',
      measuredValue: `${tpBlock} ms blocking · ${fmtBytes(tpBytes)}`,
      thresholdLabel: '<= 150 ms blocking',
      sampleUrls: extractSampleUrls(rawAudits['third-party-summary']),
      recommendedSolution:
        'Audit tag manager containers, remove redundant trackers, defer chat/marketing widgets until user idle/scroll, and self-host critical static scripts.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedBytes: tpBytes,
      affectedMs: tpBlock,
    });
  }

  // 11. Slow Server Response / TTFB
  const ttfbAudit = rawAudits['server-response-time'];
  if (
    (lab.ttfbMs !== null && lab.ttfbMs > 600) ||
    (typeof ttfbAudit?.score === 'number' && ttfbAudit.score < 0.9)
  ) {
    const ttfb = lab.ttfbMs ?? Math.round(ttfbAudit?.numericValue ?? 0);
    pushFinding({
      ruleId: 'PERF-TTFB-SLOW',
      category: 'Server Response',
      findingKind: 'problem',
      severity: ttfb > 1200 ? 'Critical' : 'High',
      title: `Slow Origin Server Response Time (${ttfb} ms TTFB)`,
      rootCause: 'Origin HTML document generation, database queries, or missing edge caching delayed the first byte.',
      explanation: `Server Time to First Byte measured ${ttfb} ms, exceeding Google's 600 ms / 800 ms guidance.`,
      auditId: 'server-response-time',
      metricLabel: 'Time to First Byte (TTFB)',
      measuredValue: `${ttfb} ms`,
      thresholdLabel: '<= 600 ms',
      sampleUrls: [url],
      recommendedSolution:
        'Enable full-page/edge CDN caching with stale-while-revalidate, optimize uncached SSR queries, and warm origin keep-alive connections.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedMs: ttfb > 600 ? ttfb - 600 : ttfb,
    });
  }

  // 12A. Resource Weight / DOM Size
  if (
    (resources.totalByteWeight !== null && resources.totalByteWeight > 2_000_000) ||
    (resources.domNodesCount !== null && resources.domNodesCount > 1500)
  ) {
    pushFinding({
      ruleId: 'PERF-DOM-WEIGHT',
      category: 'Resource Efficiency',
      findingKind: 'problem',
      severity: (resources.totalByteWeight ?? 0) > 4_000_000 ? 'High' : 'Medium',
      title: `Excessive Page Payload or DOM Complexity (${fmtBytes(resources.totalByteWeight)} · ${resources.domNodesCount ?? '—'} DOM nodes)`,
      rootCause: 'Unbounded asset payloads or deeply nested DOM trees increase memory usage and style recalculation time.',
      explanation: `Measured total payload of ${fmtBytes(resources.totalByteWeight)} and ${resources.domNodesCount ?? 'unreported'} DOM nodes.`,
      auditId: (resources.totalByteWeight ?? 0) > 2_000_000 ? 'total-byte-weight' : 'dom-size',
      metricLabel: 'Payload & DOM Footprint',
      measuredValue: `${fmtBytes(resources.totalByteWeight)} / ${resources.domNodesCount ?? '—'} nodes`,
      thresholdLabel: '<= 2.0 MB / <= 1,500 DOM nodes',
      sampleUrls: resources.largestResources.slice(0, 4).map((r) => r.url),
      recommendedSolution:
        'Compress or lazy-load heavy below-the-fold media, virtualize long lists/tables, and flatten wrapper DOM containers.',
      estimatedEffort: 'Medium (0.5–1 day, estimate)',
      affectedBytes: resources.totalByteWeight,
    });
  }

  // 12B. Mobile Usability Failures
  const failedUsability: string[] = [];
  if (usability.viewportConfigured === false) failedUsability.push('Missing viewport tag');
  if (usability.legibleFontSizes === false) failedUsability.push('Small font sizes (<12px)');
  if (usability.tapTargetsAdequate === false) failedUsability.push('Cramped tap targets');
  if (usability.colorContrastOk === false) failedUsability.push('Insufficient contrast');

  if (failedUsability.length > 0) {
    pushFinding({
      ruleId: 'PERF-USABILITY-MOBILE',
      category: 'Mobile Usability',
      findingKind: 'problem',
      severity: usability.viewportConfigured === false ? 'High' : 'Medium',
      title: `Mobile Usability Barriers (${failedUsability.join(', ')})`,
      rootCause: 'Document lacks responsive viewport configuration, legible mobile typography, adequate tap spacing, or WCAG AA contrast.',
      explanation: `Lighthouse accessibility & usability checks flagged: ${failedUsability.join('; ')}.`,
      auditId: usability.viewportConfigured === false ? 'viewport' : 'target-size',
      metricLabel: 'Usability Compliance',
      measuredValue: failedUsability.join(', '),
      thresholdLabel: 'All mobile usability checks pass',
      sampleUrls: [url],
      recommendedSolution:
        'Ensure <meta name="viewport" content="width=device-width, initial-scale=1">, maintain >=16px body text, >=44x44px interactive targets with >=8px spacing, and >=4.5:1 contrast.',
      estimatedEffort: 'Low (1–2 hours, estimate)',
    });
  }

  return findings;
}

export function computeUsabilityScore(usability: PerformanceUsabilityChecks): number | null {
  const checks = [
    usability.viewportConfigured,
    usability.legibleFontSizes,
    usability.tapTargetsAdequate,
    usability.colorContrastOk,
  ].filter((v): v is boolean => v !== null);
  if (checks.length === 0) return null;
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}
