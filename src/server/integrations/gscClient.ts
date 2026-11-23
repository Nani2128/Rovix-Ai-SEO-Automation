import type { GooglePropertyOption } from '../../types/integrations';
import { replaceGscMetrics } from '../audit/db';
import { getValidGoogleAccessToken } from './googleOAuth';

function isoDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

export async function listGscProperties(params: {
  tenantId: string;
  projectId: string;
}): Promise<GooglePropertyOption[]> {
  const accessToken = await getValidGoogleAccessToken({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: 'gsc',
  });

  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GSC_API_ERROR (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    siteEntry?: { siteUrl: string; permissionLevel?: string }[];
  };

  return (json.siteEntry ?? []).map((entry) => ({
    id: entry.siteUrl,
    name: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
    kind: 'gsc' as const,
  }));
}

export async function fetchAndStoreGscData(params: {
  tenantId: string;
  projectId: string;
  propertyUrl: string;
  days?: number;
}): Promise<{ dailyRows: number; queryRows: number }> {
  const accessToken = await getValidGoogleAccessToken({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: 'gsc',
  });

  const lookback = params.days ?? 30;
  const startDate = isoDateDaysAgo(lookback);
  const endDate = isoDateDaysAgo(1);
  const encodedSite = encodeURIComponent(params.propertyUrl);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchanalytics/query`;

  const [dailyRes, queryRes] = await Promise.all([
    fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 90,
      }),
    }),
    fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query', 'page'],
        rowLimit: 50,
      }),
    }),
  ]);

  if (!dailyRes.ok) {
    const errText = await dailyRes.text().catch(() => '');
    throw new Error(`GSC_DAILY_QUERY_FAILED (${dailyRes.status}): ${errText.slice(0, 220)}`);
  }
  if (!queryRes.ok) {
    const errText = await queryRes.text().catch(() => '');
    throw new Error(`GSC_QUERY_FAILED (${queryRes.status}): ${errText.slice(0, 220)}`);
  }

  const dailyJson = (await dailyRes.json()) as {
    rows?: {
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }[];
  };
  const queryJson = (await queryRes.json()) as {
    rows?: {
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }[];
  };

  const daily = (dailyJson.rows ?? []).map((r) => ({
    date: r.keys?.[0] ?? '',
    clicks: Math.round(Number(r.clicks ?? 0)),
    impressions: Math.round(Number(r.impressions ?? 0)),
    ctr: Number(r.ctr ?? 0),
    avgPosition: Number(r.position ?? 0),
  })).filter((d) => Boolean(d.date));

  const queries = (queryJson.rows ?? []).map((r) => ({
    query: r.keys?.[0] ?? '',
    page: r.keys?.[1] ?? '/',
    clicks: Math.round(Number(r.clicks ?? 0)),
    impressions: Math.round(Number(r.impressions ?? 0)),
    ctr: Number(r.ctr ?? 0),
    avgPosition: Number(r.position ?? 0),
  })).filter((q) => Boolean(q.query));

  replaceGscMetrics({
    tenantId: params.tenantId,
    projectId: params.projectId,
    daily,
    queries,
  });

  return {
    dailyRows: daily.length,
    queryRows: queries.length,
  };
}
