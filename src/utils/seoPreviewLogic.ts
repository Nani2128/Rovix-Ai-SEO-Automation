import type {
  AppRoute,
  SeoPillarId,
  SeoPillarSpec,
} from '../types/navigation';

export const VALID_ROUTES: readonly AppRoute[] = [
  '/',
  '/onboarding',
  '/signin',
  '/pricing',
  '/resources',
] as const;

export function parseAppRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if ((VALID_ROUTES as readonly string[]).includes(normalized)) {
    return normalized as AppRoute;
  }
  return '/';
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export function interpolateMetricValue(
  target: number,
  progress: number,
  decimals = 0,
): number {
  const eased = easeOutCubic(progress);
  const raw = target * eased;
  const factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}

export function computeDampedValue(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  const alpha = 1 - Math.exp(-lambda * safeDt);
  return current + (target - current) * alpha;
}

export function computeGrowthDeltaPct(baseline: number, current: number): number {
  if (baseline <= 0) return 0;
  return Math.round(((current - baseline) / baseline) * 100);
}

export const SEO_PILLARS: readonly SeoPillarSpec[] = [
  {
    id: 'technical-seo',
    title: 'Technical SEO',
    shortDesc: 'Continuous crawl diagnostics, Core Web Vitals checks, and indexation hygiene.',
    capabilitySummary: 'HTTP + Headless Chromium Diagnostics',
    cameraPosition: [5.4, 3.1, 5.8],
    cameraTarget: [0, 0.45, 0],
    accentHex: '#635BFF',
  },
  {
    id: 'keyword-intelligence',
    title: 'Keyword Intelligence',
    shortDesc: 'Google Search Console query sync and priority tracking across search markets.',
    capabilitySummary: 'Google Search Console OAuth Sync',
    cameraPosition: [-5.2, 3.3, 5.4],
    cameraTarget: [-0.3, 0.5, 0.2],
    accentHex: '#8175FF',
  },
  {
    id: 'ai-content',
    title: 'PageSpeed Vitals',
    shortDesc: 'Live Core Web Vitals diagnostics powered by Google PageSpeed Insights v5.',
    capabilitySummary: 'PageSpeed Insights v5 API',
    cameraPosition: [0.2, 4.9, 6.4],
    cameraTarget: [0, 0.6, 0],
    accentHex: '#4F46E5',
  },
  {
    id: 'geo-visibility',
    title: 'GEO Visibility',
    shortDesc: 'Dual-approval engineering remediation and live URL reverification workflows.',
    capabilitySummary: 'Dual RBAC Signoff + Targeted Re-Crawl',
    cameraPosition: [5.8, 2.8, -4.6],
    cameraTarget: [0.25, 0.5, -0.2],
    accentHex: '#16B8A6',
  },
  {
    id: 'analytics-roi',
    title: 'Analytics & ROI',
    shortDesc: 'Connect Google Analytics 4 organic sessions and landing page key events.',
    capabilitySummary: 'GA4 Organic Search Attribution',
    cameraPosition: [-4.8, 3.0, -5.2],
    cameraTarget: [0, 0.45, 0],
    accentHex: '#0EA5E9',
  },
];

export function getPillarById(id: SeoPillarId): SeoPillarSpec {
  return SEO_PILLARS.find((p) => p.id === id) ?? SEO_PILLARS[0];
}
