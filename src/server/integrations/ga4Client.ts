import type { GooglePropertyOption } from '../../types/integrations';
import { replaceGa4Metrics } from '../audit/db';
import { getValidGoogleAccessToken } from './googleOAuth';

function normalizeGa4Date(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

export async function listGa4Properties(params: {
  tenantId: string;
  projectId: string;
}): Promise<GooglePropertyOption[]> {
  const accessToken = await getValidGoogleAccessToken({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: 'ga4',
  });

  const res = await fetch(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GA4_ADMIN_ERROR (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    accountSummaries?: {
      displayName?: string;
      propertySummaries?: { property?: string; displayName?: string }[];
    }[];
  };

  const out: GooglePropertyOption[] = [];
  for (const acc of json.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      const id = (p.property ?? '').replace(/^properties\//, '');
      if (!id) continue;
      out.push({
        id,
        name: `${p.displayName ?? id} (${acc.displayName ?? 'GA4'})`,
        kind: 'ga4',
      });
    }
  }
  return out;
}

export async function fetchAndStoreGa4Data(params: {
  tenantId: string;
  projectId: string;
  propertyId: string;
  days?: number;
}): Promise<{ dailyRows: number; landingRows: number }> {
  const accessToken = await getValidGoogleAccessToken({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: 'ga4',
  });

  const cleanProp = params.propertyId.replace(/^properties\//, '');
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(cleanProp)}:runReport`;
  const startDate = `${params.days ?? 30}daysAgo`;

  const organicFilter = {
    filter: {
      fieldName: 'sessionDefaultChannelGroup',
      stringFilter: {
        matchType: 'EXACT',
        value: 'Organic Search',
      },
    },
  };

  const [dailyRes, landingRes] = await Promise.all([
    fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: 'yesterday' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'keyEvents' },
        ],
        dimensionFilter: organicFilter,
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 90,
      }),
    }),
    fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: 'yesterday' }],
        dimensions: [{ name: 'landingPagePlusQueryString' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'keyEvents' },
        ],
        dimensionFilter: organicFilter,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 25,
      }),
    }),
  ]);

  if (!dailyRes.ok) {
    const errText = await dailyRes.text().catch(() => '');
    throw new Error(`GA4_REPORT_FAILED (${dailyRes.status}): ${errText.slice(0, 220)}`);
  }
  if (!landingRes.ok) {
    const errText = await landingRes.text().catch(() => '');
    throw new Error(`GA4_LANDING_FAILED (${landingRes.status}): ${errText.slice(0, 220)}`);
  }

  const dailyJson = (await dailyRes.json()) as {
    rows?: {
      dimensionValues?: { value?: string }[];
      metricValues?: { value?: string }[];
    }[];
  };
  const landingJson = (await landingRes.json()) as {
    rows?: {
      dimensionValues?: { value?: string }[];
      metricValues?: { value?: string }[];
    }[];
  };

  const daily = (dailyJson.rows ?? []).map((r) => ({
    date: normalizeGa4Date(r.dimensionValues?.[0]?.value ?? ''),
    sessions: Math.round(Number(r.metricValues?.[0]?.value ?? 0)),
    activeUsers: Math.round(Number(r.metricValues?.[1]?.value ?? 0)),
    keyEvents: Math.round(Number(r.metricValues?.[2]?.value ?? 0)),
  })).filter((d) => Boolean(d.date));

  const landingPages = (landingJson.rows ?? []).map((r) => ({
    landingPage: r.dimensionValues?.[0]?.value ?? '/',
    sessions: Math.round(Number(r.metricValues?.[0]?.value ?? 0)),
    activeUsers: Math.round(Number(r.metricValues?.[1]?.value ?? 0)),
    keyEvents: Math.round(Number(r.metricValues?.[2]?.value ?? 0)),
  }));

  replaceGa4Metrics({
    tenantId: params.tenantId,
    projectId: params.projectId,
    daily,
    landingPages,
  });

  return {
    dailyRows: daily.length,
    landingRows: landingPages.length,
  };
}
