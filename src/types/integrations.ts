export type IntegrationProviderId = 'gsc' | 'ga4' | 'psi';

export type IntegrationConnectionStatus =
  | 'Not Connected'
  | 'Connected'
  | 'Expired'
  | 'Config Required'
  | 'Error';

export interface OAuthIntegrationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  provider: IntegrationProviderId;
  accountEmail: string | null;
  propertyId: string | null;
  propertyName: string | null;
  scopes: string[];
  status: IntegrationConnectionStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJobRecord {
  id: string;
  tenantId: string;
  projectId: string;
  provider: IntegrationProviderId;
  jobType: 'gsc_sync' | 'ga4_sync' | 'psi_check';
  status: 'Queued' | 'Running' | 'Retrying' | 'Succeeded' | 'Failed' | 'Cancelled';
  attemptCount: number;
  maxAttempts: number;
  recordsSynced: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GooglePropertyOption {
  id: string;
  name: string;
  permissionLevel?: string;
  kind: 'gsc' | 'ga4';
}

export interface IntegrationsOverviewResponse {
  projectId: string;
  oauthConfigured: boolean;
  encryptionConfigured: boolean;
  pageSpeedKeyConfigured: boolean;
  callbackUrls: {
    active: string;
    dev: string;
    shared: string;
  };
  requiredEnvVars: string[];
  integrations: OAuthIntegrationRecord[];
  syncJobs: SyncJobRecord[];
}

export interface AnalyticsWorkspaceData {
  projectId: string;
  reportingPeriod: string;
  gscConnected: boolean;
  gscLastSyncedAt: string | null;
  gscMeasurementStatus: 'measured' | 'estimated' | 'unavailable';
  gscTotals: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  } | null;
  gscDaily: {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  }[];
  gscTopQueries: {
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  }[];
  ga4Connected: boolean;
  ga4LastSyncedAt: string | null;
  ga4MeasurementStatus: 'measured' | 'estimated' | 'unavailable';
  ga4Totals: {
    sessions: number;
    activeUsers: number;
    keyEvents: number;
  } | null;
  ga4Daily: {
    date: string;
    sessions: number;
    activeUsers: number;
    keyEvents: number;
  }[];
  ga4TopLandingPages: {
    landingPage: string;
    sessions: number;
    activeUsers: number;
    keyEvents: number;
  }[];
  crmConnected: boolean;
  crmMeasurementStatus: 'measured' | 'estimated' | 'unavailable';
  crmNotice: string;
}

export interface PageSpeedCheckResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  fetchedAt: string;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  metrics: {
    lcp: string | null;
    cls: string | null;
    inp: string | null;
    fcp: string | null;
    ttfb: string | null;
  };
  source: string;
}

export interface OperationalHealthResponse {
  checkedAt: string;
  environment: 'production' | 'development';
  database: {
    engine: string;
    path: string;
    integrityOk: boolean;
    integrityDetail: string;
    sizeBytes: number;
    schemaVersion: string;
    tableCounts: {
      tenants: number;
      users: number;
      projects: number;
      crawlRuns: number;
      technicalIssues: number;
      oauthIntegrations: number;
      syncJobs: number;
    };
  };
  security: {
    productionSafe: boolean;
    devAuthEnabled: boolean;
    sandboxFixturesEnabled: boolean;
    encryptionKeyConfigured: boolean;
    sessionSecretConfigured: boolean;
    oauthConfigured: boolean;
    ssrfProtectionActive: boolean;
  };
  crawler: {
    activeCrawls: number;
    headlessBrowserAvailable: boolean;
  };
  recentCrawls: {
    id: string;
    projectId: string;
    status: string;
    crawlType: string;
    processedCount: number;
    errorCount: number;
    startedAt: string;
    completedAt: string | null;
  }[];
  recentSyncJobs: SyncJobRecord[];
}
