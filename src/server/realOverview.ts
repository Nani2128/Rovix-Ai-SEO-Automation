import type {
  AutomationJob,
  DateRangePreset,
  IntegrationStatus,
  KpiMetricItem,
  SEOOverview,
  SeoHealthCategory,
  TrafficMetric,
} from '../types/dashboard';
import { calculateWeightedSeoHealth } from '../utils/dashboardLogic';
import {
  getGa4DailyMetrics,
  getGscDailyMetrics,
  getOAuthIntegrationRow,
  getProjectById,
  listCrawlRuns,
  listProjectIssues,
  listProjectKeywords,
  listProjectsByTenant,
  listSyncJobs,
} from './audit/db';
import { buildUnifiedRecentActivityFeed } from './activity/activityFeed';
import { isProductionEnv } from './env';

function daysForRange(range: DateRangePreset, customStart?: string, customEnd?: string): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  if (range === 'custom' && customStart && customEnd) {
    const startMs = Date.parse(customStart);
    const endMs = Date.parse(customEnd);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      return Math.max(1, Math.min(365, Math.ceil((endMs - startMs) / 86400_000) + 1));
    }
  }
  return 30;
}

function formatReportingPeriod(
  range: DateRangePreset,
  lookbackDays: number,
  customStart?: string,
  customEnd?: string,
): string {
  if (range === 'custom' && customStart && customEnd) {
    return `${customStart} – ${customEnd}`;
  }
  return `Last ${lookbackDays} days`;
}

function penaltyForSeverity(sev: string): number {
  switch (sev) {
    case 'Critical':
      return 18;
    case 'High':
      return 10;
    case 'Medium':
      return 5;
    case 'Low':
      return 2;
    default:
      return 0;
  }
}

export function buildRealDashboardOverview(params: {
  tenantId: string;
  projectId?: string;
  dateRange: DateRangePreset;
  customStart?: string;
  customEnd?: string;
}): SEOOverview {
  const projects = listProjectsByTenant(params.tenantId);
  const project =
    (params.projectId
      ? getProjectById(params.tenantId, params.projectId)
      : null) ??
    projects[0] ??
    null;

  const lookbackDays = daysForRange(
    params.dateRange,
    params.customStart,
    params.customEnd,
  );
  const nowIso = new Date().toISOString();

  const reportingPeriodLabel = formatReportingPeriod(
    params.dateRange,
    lookbackDays,
    params.customStart,
    params.customEnd,
  );

  if (!project) {
    return {
      project: null,
      dateRange: params.dateRange,
      customStart: params.customStart,
      customEnd: params.customEnd,
      reportingPeriodLabel,
      lastUpdated: nowIso,
      isStale: false,
      isDevSampleData: false,
      hasAnyCrawl: false,
      hasGscData: false,
      hasGa4Data: false,
      dataSourceNotice:
        'No projects exist in this workspace yet. Create a domain project to unlock crawls and Google Search Console / GA4 telemetry.',
      kpis: [
        {
          id: 'traffic',
          label: 'Organic Traffic (GA4)',
          value: null,
          available: false,
          emptyReason: 'No project selected',
          comparisonLabel: 'Not Connected',
          trendDirection: 'flat',
          source: 'Google Analytics 4',
          collectedAt: null,
          reportingPeriod: reportingPeriodLabel,
          measurementStatus: 'unavailable',
          tooltipDetail: 'Create a project and connect Google Analytics 4 OAuth to ingest real organic sessions.',
          route: '/integrations',
          sparkline: [],
        },
        {
          id: 'keywords',
          label: 'Search Clicks (GSC)',
          value: null,
          available: false,
          emptyReason: 'No project selected',
          comparisonLabel: 'Not Connected',
          trendDirection: 'flat',
          source: 'Google Search Console',
          collectedAt: null,
          reportingPeriod: reportingPeriodLabel,
          measurementStatus: 'unavailable',
          tooltipDetail: 'Create a project and connect Google Search Console OAuth to ingest real clicks & queries.',
          route: '/integrations',
          sparkline: [],
        },
        {
          id: 'health',
          label: 'Technical SEO Health',
          value: null,
          available: false,
          emptyReason: 'No crawl completed',
          unitSuffix: '/100',
          comparisonLabel: 'Awaiting Crawl',
          trendDirection: 'flat',
          source: 'Rovix Crawl Engine',
          collectedAt: null,
          reportingPeriod: 'Awaiting initial crawl',
          measurementStatus: 'unavailable',
          tooltipDetail: 'Estimated composite score computed from deterministic crawl rules once a project crawl completes.',
          route: '/audit/new',
          sparkline: [],
        },
        {
          id: 'conversions',
          label: 'CRM Leads / Revenue',
          value: null,
          available: false,
          emptyReason: 'CRM Connector Not Configured',
          comparisonLabel: 'Unavailable',
          trendDirection: 'flat',
          source: 'CRM Attribution',
          collectedAt: null,
          reportingPeriod: reportingPeriodLabel,
          measurementStatus: 'unavailable',
          tooltipDetail: 'Rovix AI never fabricates leads or ROI. Connect GA4 key events or CRM attribution.',
          route: '/integrations',
          sparkline: [],
        },
      ],
      trafficSeries: [],
      trafficProvenance: {
        source: 'Google Search Console / GA4',
        collectedAt: null,
        reportingPeriod: reportingPeriodLabel,
        measurementStatus: 'unavailable',
      },
      healthBreakdown: [],
      healthProvenance: {
        source: 'Rovix Crawl Engine',
        collectedAt: null,
        reportingPeriod: 'Awaiting initial crawl',
        measurementStatus: 'unavailable',
      },
      computedHealthScore: null,
      keywords: [],
      automations: [],
      recentActivity: buildUnifiedRecentActivityFeed({
        tenantId: params.tenantId,
        limit: 20,
      }).events,
      integrations: [
        {
          id: 'int-crawler',
          name: 'Rovix Technical Crawler',
          provider: 'Site Crawler',
          connected: true,
          lastSyncedAt: null,
          stale: false,
          statusLabel: 'Ready (Create project)',
        },
        {
          id: 'int-gsc',
          name: 'Google Search Console',
          provider: 'GSC',
          connected: false,
          lastSyncedAt: null,
          stale: false,
          statusLabel: 'Not Connected',
        },
        {
          id: 'int-ga4',
          name: 'Google Analytics 4',
          provider: 'GA4',
          connected: false,
          lastSyncedAt: null,
          stale: false,
          statusLabel: 'Not Connected',
        },
        {
          id: 'int-crm',
          name: 'CRM Lead Attribution',
          provider: 'CRM',
          connected: false,
          lastSyncedAt: null,
          stale: false,
          statusLabel: 'Connector Not Configured',
        },
      ],
    };
  }

  const crawls = listCrawlRuns(params.tenantId, project.id);
  const fullCrawls = crawls.filter((c) => c.crawlType === 'full');
  const latestFullCrawl = fullCrawls.find(
    (c) => c.status === 'Succeeded' || c.status === 'Partial',
  ) ?? null;

  const openIssues = listProjectIssues(params.tenantId, project.id).filter(
    (i) => i.status !== 'Verified' && i.status !== 'Rejected',
  );

  let healthBreakdown: SeoHealthCategory[] = [];
  let computedHealthScore: number | null = null;

  if (latestFullCrawl) {
    const scoreCategory = (
      id: SeoHealthCategory['id'],
      label: string,
      weight: number,
      categories: string[],
      rulesDesc: string,
    ): SeoHealthCategory => {
      const matching = openIssues.filter((i) => categories.includes(i.category));
      const penalty = matching.reduce(
        (acc, item) => acc + penaltyForSeverity(item.severity),
        0,
      );
      const score = Math.max(0, Math.min(100, 100 - penalty));
      return {
        id,
        label,
        score,
        weight,
        issueCount: matching.length,
        evidenceSummary:
          matching.length === 0
            ? `0 open issues detected in latest crawl (${latestFullCrawl.processedCount} URLs inspected).`
            : `${matching.length} open issue rule(s) affecting ${matching.reduce((s, i) => s + i.affectedUrlCount, 0)} URL occurrence(s).`,
        rulesApplied: rulesDesc,
      };
    };

    const perfPenalty =
      latestFullCrawl.errorCount > 0 || latestFullCrawl.summary.brokenCount > 0
        ? Math.min(60, latestFullCrawl.errorCount * 8 + latestFullCrawl.summary.brokenCount * 6)
        : 0;

    healthBreakdown = [
      scoreCategory(
        'technical',
        'Technical SEO',
        0.25,
        ['Technical SEO', 'Security', 'Links'],
        'Broken targets, 5xx errors, mixed/blocked hosts, robots rules',
      ),
      scoreCategory(
        'on-page',
        'On-Page SEO',
        0.2,
        ['On-Page', 'Metadata'],
        'Title, meta description, H1 structure, image alt compliance',
      ),
      scoreCategory(
        'content',
        'Structured & Content',
        0.2,
        ['Content', 'Structured Data'],
        'JSON-LD syntax validation and duplicate content metadata checks',
      ),
      {
        id: 'performance',
        label: 'Crawl Reliability & Speed',
        score: Math.max(0, 100 - perfPenalty),
        weight: 0.2,
        issueCount: latestFullCrawl.errorCount + latestFullCrawl.summary.brokenCount,
        evidenceSummary: `${latestFullCrawl.processedCount} processed URLs, ${latestFullCrawl.errorCount} transport errors, ${latestFullCrawl.summary.brokenCount} 4xx/5xx responses.`,
        rulesApplied: 'HTTP response stability, 5xx errors, and broken asset/link rates',
      },
      scoreCategory(
        'indexability',
        'Indexability',
        0.15,
        ['Indexability', 'Canonicals', 'Redirects', 'Sitemaps'],
        'Noindex directives, canonical conflicts, redirect chains/loops, sitemap alignment',
      ),
    ];

    computedHealthScore = calculateWeightedSeoHealth(healthBreakdown);
  }

  // Real GSC & GA4 telemetry
  const gscIntegration = getOAuthIntegrationRow(params.tenantId, project.id, 'gsc');
  const ga4Integration = getOAuthIntegrationRow(params.tenantId, project.id, 'ga4');
  const gscDaily = getGscDailyMetrics(params.tenantId, project.id, lookbackDays);
  const ga4Daily = getGa4DailyMetrics(params.tenantId, project.id, lookbackDays);

  const hasGscData = gscDaily.length > 0;
  const hasGa4Data = ga4Daily.length > 0;

  const totalClicks = hasGscData
    ? gscDaily.reduce((s, d) => s + d.clicks, 0)
    : null;
  const totalImpressions = hasGscData
    ? gscDaily.reduce((s, d) => s + d.impressions, 0)
    : null;
  const totalGa4Sessions = hasGa4Data
    ? ga4Daily.reduce((s, d) => s + d.sessions, 0)
    : null;
  const totalGa4KeyEvents = hasGa4Data
    ? ga4Daily.reduce((s, d) => s + d.keyEvents, 0)
    : null;

  // Merge date map for chart
  const dateMap = new Map<string, TrafficMetric>();
  for (const row of gscDaily) {
    dateMap.set(row.date, {
      date: row.date,
      sessions: null,
      clicks: row.clicks,
      impressions: row.impressions,
    });
  }
  for (const row of ga4Daily) {
    const existing = dateMap.get(row.date);
    if (existing) {
      existing.sessions = row.sessions;
    } else {
      dateMap.set(row.date, {
        date: row.date,
        sessions: row.sessions,
        clicks: null,
        impressions: null,
      });
    }
  }
  const trafficSeries = Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const crawlHealthSpark = fullCrawls
    .slice(0, 8)
    .reverse()
    .map((r) => r.summary.healthScore)
    .filter((v) => typeof v === 'number');

  const ga4CollectedAt = hasGa4Data
    ? ga4Integration?.lastSyncedAt ?? `${ga4Daily[ga4Daily.length - 1].date}T00:00:00.000Z`
    : null;
  const gscCollectedAt = hasGscData
    ? gscIntegration?.lastSyncedAt ?? `${gscDaily[gscDaily.length - 1].date}T00:00:00.000Z`
    : null;
  const latestCrawlCollectedAt = latestFullCrawl
    ? latestFullCrawl.completedAt ?? latestFullCrawl.startedAt
    : null;
  const crawlPeriodLabel = latestFullCrawl
    ? `Latest crawl (${latestFullCrawl.id})`
    : 'Awaiting initial crawl';

  const kpis: KpiMetricItem[] = [
    {
      id: 'traffic',
      label: 'Organic Sessions (GA4)',
      value: totalGa4Sessions,
      available: hasGa4Data,
      emptyReason:
        ga4Integration?.status === 'Connected'
          ? 'Connected · Run GA4 Sync'
          : 'GA4 Not Connected',
      comparisonLabel: hasGa4Data
        ? `${ga4Daily.length}d synced`
        : ga4Integration?.status ?? 'Not Connected',
      trendDirection: hasGa4Data ? 'up' : 'flat',
      source: 'Google Analytics 4',
      collectedAt: ga4CollectedAt,
      reportingPeriod: reportingPeriodLabel,
      measurementStatus: hasGa4Data ? 'measured' : 'unavailable',
      tooltipDetail: hasGa4Data
        ? `Measured GA4 organic search sessions synced for ${ga4Integration?.propertyName ?? project.website}.`
        : 'Authorize Google Analytics 4 under Integrations to display real organic sessions.',
      route: '/analytics',
      sparkline: ga4Daily.slice(-10).map((d) => d.sessions),
    },
    {
      id: 'keywords',
      label: 'Search Clicks (GSC)',
      value: totalClicks,
      available: hasGscData,
      emptyReason:
        gscIntegration?.status === 'Connected'
          ? 'Connected · Run GSC Sync'
          : 'Search Console Not Connected',
      comparisonLabel:
        hasGscData && totalImpressions !== null
          ? `${totalImpressions.toLocaleString()} impr.`
          : gscIntegration?.status ?? 'Not Connected',
      trendDirection: hasGscData ? 'up' : 'flat',
      source: 'Google Search Console',
      collectedAt: gscCollectedAt,
      reportingPeriod: reportingPeriodLabel,
      measurementStatus: hasGscData ? 'measured' : 'unavailable',
      tooltipDetail: hasGscData
        ? `Measured Google Search Console clicks and impressions for ${gscIntegration?.propertyId ?? project.website}.`
        : 'Authorize Google Search Console under Integrations to ingest clicks, impressions, and queries.',
      route: '/keywords',
      sparkline: gscDaily.slice(-10).map((d) => d.clicks),
    },
    {
      id: 'health',
      label: 'Technical SEO Health',
      value: computedHealthScore,
      available: computedHealthScore !== null,
      emptyReason: 'No crawl completed',
      unitSuffix: '/100',
      comparisonLabel: latestFullCrawl
        ? `${openIssues.length} open issues`
        : 'Run First Crawl',
      trendDirection:
        computedHealthScore === null
          ? 'flat'
          : computedHealthScore >= 80
            ? 'up'
            : 'down',
      source: 'Rovix Crawl Engine',
      collectedAt: latestCrawlCollectedAt,
      reportingPeriod: crawlPeriodLabel,
      measurementStatus: computedHealthScore !== null ? 'estimated' : 'unavailable',
      tooltipDetail: latestFullCrawl
        ? `Estimated weighted index (0–100) derived from measured crawl findings on ${latestFullCrawl.processedCount} URLs (${latestFullCrawl.id}).`
        : 'Launch a technical site crawl to compute an indexability, metadata, and HTTP health score.',
      route: '/audit',
      sparkline: crawlHealthSpark,
    },
    {
      id: 'conversions',
      label: 'GA4 Key Events',
      value: totalGa4KeyEvents,
      available: hasGa4Data,
      emptyReason: 'GA4 / CRM Not Connected',
      comparisonLabel: hasGa4Data ? 'Organic Key Events' : 'CRM Not Configured',
      trendDirection: hasGa4Data ? 'up' : 'flat',
      source: hasGa4Data ? 'Google Analytics 4' : 'CRM Attribution',
      collectedAt: ga4CollectedAt,
      reportingPeriod: reportingPeriodLabel,
      measurementStatus: hasGa4Data ? 'measured' : 'unavailable',
      tooltipDetail: hasGa4Data
        ? 'Measured Organic Search Key Events reported by Google Analytics 4 (distinct from CRM pipeline revenue).'
        : 'No CRM revenue connector is configured. Connect GA4 for organic key events.',
      route: '/analytics',
      sparkline: ga4Daily.slice(-10).map((d) => d.keyEvents),
    },
  ];

  // Real background tasks (crawls + sync jobs)
  const syncJobs = listSyncJobs(params.tenantId, project.id, 10);
  const automations: AutomationJob[] = [
    ...crawls.slice(0, 4).map((c) => {
      const pct =
        c.status === 'Succeeded'
          ? 100
          : c.status === 'Partial'
            ? Math.min(99, Math.round((c.processedCount / Math.max(1, c.discoveredCount)) * 100))
            : c.discoveredCount > 0
              ? Math.min(98, Math.round((c.processedCount / c.discoveredCount) * 100))
              : 0;
      return {
        id: c.id,
        name:
          c.crawlType === 'reverification'
            ? `Fix Reverification (${project.website})`
            : `Technical Site Crawl (${project.website})`,
        category: 'Technical Site Audit' as const,
        state: c.status,
        progressPct: pct,
        progressLabel: `${c.processedCount}/${Math.max(c.processedCount, c.discoveredCount)} URLs processed`,
        startedAt: c.startedAt,
        lastUpdated: c.completedAt ?? c.startedAt,
        nextScheduledRun: 'On-demand',
        detail: `Triggered by ${c.triggeredBy} · ${c.errorCount} transport errors · Health ${c.summary.healthScore}/100`,
        history: [],
      };
    }),
    ...syncJobs.slice(0, 4).map((sj) => ({
      id: sj.id,
      name: `${sj.provider.toUpperCase()} Data Sync`,
      category: 'Data Sync Job' as const,
      state: sj.status,
      progressPct:
        sj.status === 'Succeeded' ? 100 : sj.status === 'Failed' ? 0 : null,
      progressLabel:
        sj.status === 'Succeeded'
          ? `${sj.recordsSynced} records synced`
          : sj.errorMessage
            ? sj.errorMessage.slice(0, 80)
            : `Attempt ${sj.attemptCount}/${sj.maxAttempts}`,
      startedAt: sj.startedAt ?? sj.createdAt,
      lastUpdated: sj.completedAt ?? sj.startedAt ?? sj.createdAt,
      nextScheduledRun: 'Manual / On-demand',
      detail: sj.errorMessage ?? `Synced ${sj.recordsSynced} rows into SQLite analytics tables.`,
      history: [],
    })),
  ];

  const isStaleSync = (iso: string | null): boolean => {
    if (!iso) return false;
    return Date.now() - Date.parse(iso) > 48 * 3600_000;
  };

  const integrations: IntegrationStatus[] = [
    {
      id: 'int-crawler',
      name: 'Rovix Technical Crawler',
      provider: 'Site Crawler',
      connected: Boolean(latestFullCrawl),
      lastSyncedAt: latestFullCrawl?.completedAt ?? latestFullCrawl?.startedAt ?? null,
      stale: false,
      statusLabel: latestFullCrawl
        ? `Last crawl ${latestFullCrawl.status}`
        : 'Ready (No crawl yet)',
      propertyName: project.website,
    },
    {
      id: 'int-gsc',
      name: 'Google Search Console',
      provider: 'GSC',
      connected: gscIntegration?.status === 'Connected',
      lastSyncedAt: gscIntegration?.lastSyncedAt ?? null,
      stale:
        gscIntegration?.status === 'Expired' ||
        isStaleSync(gscIntegration?.lastSyncedAt ?? null),
      statusLabel: gscIntegration?.status ?? 'Not Connected',
      propertyName: gscIntegration?.propertyName ?? gscIntegration?.propertyId ?? null,
    },
    {
      id: 'int-ga4',
      name: 'Google Analytics 4',
      provider: 'GA4',
      connected: ga4Integration?.status === 'Connected',
      lastSyncedAt: ga4Integration?.lastSyncedAt ?? null,
      stale:
        ga4Integration?.status === 'Expired' ||
        isStaleSync(ga4Integration?.lastSyncedAt ?? null),
      statusLabel: ga4Integration?.status ?? 'Not Connected',
      propertyName: ga4Integration?.propertyName ?? ga4Integration?.propertyId ?? null,
    },
    {
      id: 'int-crm',
      name: 'CRM Lead Attribution',
      provider: 'CRM',
      connected: false,
      lastSyncedAt: null,
      stale: false,
      statusLabel: 'Connector Not Configured',
      propertyName: null,
    },
  ];

  const keywords = listProjectKeywords(params.tenantId, project.id);
  const recentActivity = buildUnifiedRecentActivityFeed({
    tenantId: params.tenantId,
    projectId: project.id,
    limit: 24,
  }).events;
  const anyStale = integrations.some((i) => i.stale);

  const latestTrafficCollectedAt =
    gscCollectedAt && ga4CollectedAt
      ? gscCollectedAt > ga4CollectedAt
        ? gscCollectedAt
        : ga4CollectedAt
      : gscCollectedAt ?? ga4CollectedAt ?? null;

  const trafficProvenance = {
    source:
      hasGscData && hasGa4Data
        ? 'Google Search Console & GA4'
        : hasGscData
          ? 'Google Search Console'
          : hasGa4Data
            ? 'Google Analytics 4'
            : 'Google Search Console / GA4',
    collectedAt: latestTrafficCollectedAt,
    reportingPeriod: reportingPeriodLabel,
    measurementStatus: (hasGscData || hasGa4Data ? 'measured' : 'unavailable') as
      | 'measured'
      | 'estimated'
      | 'unavailable',
  };

  const healthProvenance = {
    source: 'Rovix Crawl Engine',
    collectedAt: latestCrawlCollectedAt,
    reportingPeriod: crawlPeriodLabel,
    measurementStatus: (computedHealthScore !== null ? 'estimated' : 'unavailable') as
      | 'measured'
      | 'estimated'
      | 'unavailable',
  };

  return {
    project,
    dateRange: params.dateRange,
    customStart: params.customStart,
    customEnd: params.customEnd,
    reportingPeriodLabel,
    lastUpdated: nowIso,
    isStale: anyStale,
    isDevSampleData: false,
    hasAnyCrawl: Boolean(latestFullCrawl),
    hasGscData,
    hasGa4Data,
    dataSourceNotice: isProductionEnv()
      ? 'Production Mode: Displaying verified database & live OAuth integration telemetry only.'
      : 'Live SQLite Telemetry: All dashboard metrics come strictly from crawls and connected APIs (zero fake sample metrics).',
    kpis,
    trafficSeries,
    trafficProvenance,
    healthBreakdown,
    healthProvenance,
    computedHealthScore,
    keywords,
    automations,
    recentActivity,
    integrations,
  };
}
