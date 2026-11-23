import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Tenant, User, UserRole } from './src/types/auth';
import type {
  ApprovalStatus,
  DateRangePreset,
  KeywordIntent,
  OpportunityTier,
} from './src/types/dashboard';
import type { VerificationMethod } from './src/types/crawl';
import type { IntegrationProviderId } from './src/types/integrations';
import type { DeveloperTaskStatus } from './src/types/technicalIssue';
import { ALL_ROLES } from './src/config/navigation';
import {
  DEV_ACCOUNTS,
  ROLE_APPROVER_LIST,
  verifyPasswordHash,
} from './src/server/devData';
import {
  getGoogleOAuthCallbackUrls,
  getPageSpeedApiKey,
  hasIntegrationEncryptionKey,
  isDevAuthEnabled,
  isGoogleOAuthConfigured,
  isProductionEnv,
  isSandboxCrawlAllowed,
  isSessionSecretConfigured,
} from './src/server/env';
import {
  createManualKeyword,
  createProjectRecord,
  createSqliteSnapshotBackup,
  createTenantAndUser,
  ensureSandboxTestProject,
  ensureTenantRecord,
  findStoredUserByEmail,
  getCrawlRunById,
  getDatabaseHealthSnapshot,
  getGa4DailyMetrics,
  getGa4TopLandingPages,
  getGscDailyMetrics,
  getGscTopQueries,
  getOAuthIntegrationRow,
  getOrCreateSessionSecret,
  getProjectById,
  listCrawlEvents,
  listCrawlIssues,
  listCrawlRuns,
  listIssueEvidence,
  listOAuthIntegrations,
  listProjectIssues,
  listProjectKeywords,
  listProjectsByTenant,
  listSyncJobs,
  listTicketsForProject,
  queryCrawlUrls,
  recordActivityEvent,
  recoverInterruptedSyncJobs,
  softDeleteProject,
  updateKeywordApprovalInDb,
  upsertOAuthIntegration,
  verifyPasswordAgainstHash,
} from './src/server/audit/db';
import {
  normalizeCanonicalDomain,
  SecurityBlockedError,
} from './src/server/audit/security';
import { findHeadlessBrowserPath } from './src/server/audit/jsRenderer';
import {
  resetSandboxFixes,
  SANDBOX_FIX_STATE,
  type SandboxFixState,
} from './src/server/audit/sandboxFixture';
import {
  buildAuditOverview,
  buildCrawlComparison,
  cancelCrawlJob,
  createDeveloperTicket,
  getActiveCrawlCount,
  getCrawlConfigResponse,
  getIssueDetailsBundle,
  getUrlSnapshotContent,
  recoverInterruptedCrawls,
  runIssueReverification,
  startCrawlJob,
  subscribeToCrawlEvents,
  updateDeveloperTicket,
  updateProjectCrawlConfig,
  verifyProjectDomain,
} from './src/server/audit/crawlerEngine';
import { buildRealDashboardOverview } from './src/server/realOverview';
import {
  consumeSseStreamTicket,
  createRateLimiter,
  csrfOriginCheck,
  issueSseStreamTicket,
  safeErrorMessage,
  securityHeadersMiddleware,
} from './src/server/securityMiddleware';
import {
  buildGoogleAuthUrl,
  completeGoogleOAuthCallback,
  disconnectIntegration,
} from './src/server/integrations/googleOAuth';
import { listGscProperties } from './src/server/integrations/gscClient';
import { listGa4Properties } from './src/server/integrations/ga4Client';
import { runLivePageSpeedCheck } from './src/server/integrations/psiClient';
import {
  isProviderSupportedForOAuth,
  runIntegrationSyncJob,
} from './src/server/integrations/syncManager';
import {
  getPerformanceAuditRunById,
  getPerformanceMeasurementById,
  listPerformanceAuditRuns,
  readObjectSnapshot,
} from './src/server/audit/db';
import {
  bridgeFindingToTechnicalIssue,
  buildPerformanceOverview,
  cancelPerformanceAudit,
  reverifyPerformanceIssue,
  startPerformanceAudit,
} from './src/server/performance/performanceEngine';
import type { PerformanceRunStrategyMode } from './src/types/performance';
import {
  archiveStudioWorkflow,
  cancelStudioWorkflowExecution,
  createStudioWorkflow,
  duplicateStudioWorkflow,
  executeStudioWorkflow,
  getStudioExecutionNodeDetail,
  getStudioWorkflowDetail,
  listStudioWorkflowsAndTemplates,
  publishStudioWorkflow,
  restoreStudioWorkflowVersion,
  saveStudioTemplate,
  updateStudioWorkflowDraft,
  validateStudioWorkflow,
} from './src/server/agentFactory/workflowStudioService';
import {
  buildOperationsControlCenterPayload,
  buildRuntimeHealthSummary,
  createProjectSchedule,
  createTriggerSubscription,
  deleteProjectSchedule,
  deleteTriggerSubscription,
  dispatchDomainTriggerEvent,
  handleInboundWebhookEvent,
  pauseAgentWorkflow,
  reclaimStaleLeasesAndRecover,
  replayAgentWorkflow,
  resolveDeadLetterTask,
  resumeAgentWorkflow,
  retryDeadLetterTask,
  toggleProjectScheduleStatus,
  toggleTriggerSubscription,
  updateProjectAutonomyPolicy,
  updateProjectSchedule,
} from './src/server/agentFactory/operationsService';
import {
  runSchedulerTickNow,
  startAutonomousOperationsRuntime,
  stopAutonomousOperationsRuntime,
} from './src/server/agentFactory/schedulerRuntime';
import {
  calculateTokenCostWithRegistry,
  listWorkspacePricingRegistry,
  publishPricingVersion,
} from './src/server/agentFactory/pricingRegistryService';
import type {
  AutomationTriggerType,
  AutonomyMode,
  ScheduleCatchUpPolicy,
  ScheduleFrequency,
  ScheduleTargetKind,
} from './src/types/autonomousOperations';
import {
  addManualKeywordRecord,
  exportKeywordStrategyBundle,
  getKeywordWorkspace,
  mergeKeywordClustersWorkflow,
  runKeywordDiscoveryWorkflow,
  transitionKeywordWorkflowState,
  updateBusinessProfileWorkflow,
  updateKeywordClusterWorkflow,
  updateKeywordIntentOrMapping,
} from './src/server/keywords/keywordService';
import type { KeywordWorkflowState } from './src/types/keywords';
import {
  approveOrRejectTargetMarketWorkflow,
  deleteTargetMarketWorkflow,
  exportGeoReportBundle,
  getGeoWorkspace,
  runGeoDiscoveryWorkflow,
  syncGscCountriesWorkflow,
  updateGeoUrlMappingWorkflow,
  upsertTargetMarketWorkflow,
} from './src/server/geo/geoService';
import type { GeoMarketPriority } from './src/types/geographic';
import {
  decideCompetitorApprovalWorkflow,
  decideContentGapWorkflow,
  deleteCompetitorWorkflow,
  discoverCompetitorsWorkflow,
  exportCompetitorReportBundle,
  getCompetitorWorkspace,
  runCompetitorAnalysisWorkflow,
  upsertCompetitorWorkflow,
} from './src/server/competitors/competitorService';
import type { CompetitorCategory } from './src/types/competitors';
import { buildUnifiedRecentActivityFeed } from './src/server/activity/activityFeed';
import {
  listMissedAgentFactoryEvents,
  subscribeToAgentFactoryEvents,
  subscribeToTenantActivityUpdates,
} from './src/server/activity/activityBus';
import { buildAgentFactorySnapshot } from './src/server/agentFactory/agentFactoryService';
import {
  cancelAgentWorkflow,
  createAgentWorkflow,
  decideWorkflowApproval,
  getAgentOrchestrationOverview,
  getAgentWorkflowDetailScoped,
  recoverAndResumeAgentWorkflows,
  retryWorkflowTask,
  scheduleWorkflowExecution,
  startAgentWorkflow,
  updateAgentStationConfig,
  validateWorkflowDagRequest,
} from './src/server/agentFactory/orchestrationEngine';
import {
  buildCollaborationMonitorPayload,
  requestIntelligentDelegation,
  resolveWorkflowConflict,
  sendAgentMessage,
} from './src/server/agentFactory/collaborationService';
import {
  normalizeSpecialistAgentId,
  validateWorkflowGraphDetailed,
} from './src/lib/dagValidation';
import { searchTenantEntities } from './src/server/search/globalSearch';
import {
  acknowledgeWorkspaceBudgetAlert,
  buildUsageAnalyticsDashboard,
  createWorkspacePricingVersion,
  exportProjectUsageLedger,
  getWorkflowCostDetail,
  listUsageLedgerForProject,
  reconcileAndPersistWorkflowUsage,
  removeWorkspaceUsageBudget,
  upsertWorkspaceUsageBudget,
} from './src/server/agentFactory/usageIntelligenceService';
import {
  archiveArchitecturePage,
  createArchitecturePage,
  createTaskFromRoadmapItem,
  decideStrategyApproval,
  generateStrategyVersion,
  getStrategyWorkspace,
  launchStrategyAgentWorkflow,
  moveArchitecturePage,
  updateArchitecturePage,
} from './src/server/strategy/strategyService';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  StrategyApprovalStatus,
  StrategyEntityKind,
} from './src/types/strategy';
import {
  configureCmsConnection,
  createTaskFromOnPageIssue,
  decideOnPageApproval,
  exportDraftHandoff,
  exportOnPageReport,
  generateAiRecommendationsForPages,
  getOnPageWorkspace,
  launchOnPageAgentWorkflow,
  markDraftAppliedExternally,
  removeCmsConnection,
  runOnPageAnalysis,
  saveOptimizationDraft,
  validateDraftAgainstLatestCrawl,
} from './src/server/onPage/onPageService';
import type { CmsPlatform, OnPageDraftContentPayload } from './src/types/onPage';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = isProductionEnv();

function resolveServerPort(): number {
  const argIdx = process.argv.indexOf('--port');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    const cliPort = Number(process.argv[argIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  for (const arg of process.argv) {
    if (arg.startsWith('--port=')) {
      const cliPort = Number(arg.slice('--port='.length));
      if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
    }
  }
  const envPort = Number(
    process.env.PORT ?? process.env.DEFAULT_APP_PORT ?? 3000,
  );
  if (
    !IS_PROD &&
    process.env.NGINX_PORT &&
    String(envPort) === String(process.env.NGINX_PORT)
  ) {
    return Number(process.env.DEFAULT_APP_PORT ?? 3000);
  }
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolveServerPort();
const SESSION_COOKIE_NAME = 'rovix_session';
const SESSION_SECRET = getOrCreateSessionSecret();

const PROJECT_ADMIN_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
];

const INTEGRATION_ADMIN_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Developer',
  'Project Manager',
];

interface SessionPayload {
  user: User;
  tenant: Tenant;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  session?: SessionPayload;
}

function signSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function extractRequestToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME];
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return req.secure || forwardedProto.includes('https');
}

function getRequestOrigin(req: Request): string {
  const proto = isHttpsRequest(req) ? 'https' : 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function setSessionCookie(
  req: Request,
  res: Response,
  payload: SessionPayload,
  maxAgeMs: number,
): string {
  const token = signSession(payload);
  const https = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    maxAge: maxAgeMs,
    path: '/',
    ...(https ? { partitioned: true } : {}),
  } as express.CookieOptions);
  return token;
}

function authModeMeta() {
  const devEnabled = isDevAuthEnabled();
  return {
    devMode: devEnabled,
    productionSafe: !devEnabled && IS_PROD,
    authModeLabel: devEnabled
      ? 'Local Developer Sandbox + SQLite Auth (Disabled in Production)'
      : 'Production Workspace Authentication',
  };
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractRequestToken(req);
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({
      error: 'Authentication required or session expired. Please sign in again.',
    });
    return;
  }
  req.session = session;
  next();
}

function sendErrorResponse(res: Response, err: unknown) {
  if (err instanceof SecurityBlockedError) {
    res.status(422).json({ error: err.message, code: err.code });
    return;
  }
  const msg = err instanceof Error ? err.message : 'Unexpected server error.';
  if (msg.startsWith('FORBIDDEN:')) {
    res.status(403).json({ error: msg.replace('FORBIDDEN:', '').trim() });
    return;
  }
  if (msg.startsWith('NOT_FOUND:')) {
    res.status(404).json({ error: msg.replace('NOT_FOUND:', '').trim() });
    return;
  }
  if (
    msg.startsWith('PRECONDITION_FAILED:') ||
    msg.startsWith('PRECONDITION_REQUIRED:') ||
    msg.startsWith('PREREQUISITE_MISSING:') ||
    msg.startsWith('APPROVAL_REQUIRED:') ||
    msg.startsWith('CONFIG_REQUIRED:') ||
    msg.startsWith('NOT_CONNECTED:')
  ) {
    res.status(412).json({
      error: msg
        .replace(
          /^(PRECONDITION_FAILED|PRECONDITION_REQUIRED|PREREQUISITE_MISSING|APPROVAL_REQUIRED|CONFIG_REQUIRED|NOT_CONNECTED):/,
          '',
        )
        .trim(),
    });
    return;
  }
  if (msg.startsWith('CONFLICT:')) {
    res.status(409).json({ error: msg.replace('CONFLICT:', '').trim() });
    return;
  }
  if (msg.startsWith('BUDGET_EXCEEDED:') || msg.startsWith('BUDGET_BLOCKED:')) {
    res.status(402).json({
      code: 'BUDGET_EXCEEDED',
      error: msg.replace(/^(BUDGET_EXCEEDED|BUDGET_BLOCKED):/, '').trim(),
    });
    return;
  }
  if (msg.startsWith('BUDGET_APPROVAL_REQUIRED:')) {
    res.status(409).json({
      code: 'BUDGET_APPROVAL_REQUIRED',
      error: msg.replace('BUDGET_APPROVAL_REQUIRED:', '').trim(),
    });
    return;
  }
  if (msg.startsWith('PROVIDER_UNAVAILABLE:')) {
    res.status(503).json({
      code: 'PROVIDER_UNAVAILABLE',
      error: msg.replace('PROVIDER_UNAVAILABLE:', '').trim(),
    });
    return;
  }
  if (msg.startsWith('SSRF_BLOCKED:')) {
    res.status(422).json({
      code: 'SSRF_BLOCKED',
      error: msg.replace('SSRF_BLOCKED:', '').trim(),
    });
    return;
  }
  if (msg.startsWith('QUOTA_EXCEEDED:')) {
    res.status(429).json({
      error: msg.replace('QUOTA_EXCEEDED:', '').trim(),
    });
    return;
  }
  if (
    msg.startsWith('BAD_REQUEST:') ||
    msg.startsWith('TOKEN_EXPIRED:') ||
    msg.startsWith('VALIDATION_ERROR:') ||
    msg.startsWith('CONFIRMATION_REQUIRED:')
  ) {
    res.status(400).json({
      error: msg
        .replace(/^(BAD_REQUEST|TOKEN_EXPIRED|VALIDATION_ERROR|CONFIRMATION_REQUIRED):/, '')
        .trim(),
    });
    return;
  }
  res.status(500).json({ error: safeErrorMessage(err) });
}

function renderOAuthPopupResultHtml(params: {
  ok: boolean;
  provider: string;
  projectId: string;
  message: string;
}): string {
  const safePayload = JSON.stringify({
    type: 'ROVIX_OAUTH_COMPLETE',
    ok: params.ok,
    provider: params.provider,
    projectId: params.projectId,
    message: params.message,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Rovix AI OAuth</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;background:#f8fafc;color:#0f172a;">
  <h2 style="margin-bottom:8px;">${params.ok ? 'Authorization Connected' : 'Authorization Failed'}</h2>
  <p style="color:#475569;font-size:14px;">${params.message.replace(/</g, '&lt;')}</p>
  <script>
    (function () {
      try {
        if (window.opener) {
          window.opener.postMessage(${safePayload}, window.location.origin);
        }
      } catch (e) {}
      setTimeout(function () { window.close(); }, 600);
    })();
  </script>
</body>
</html>`;
}

async function startServer() {
  recoverInterruptedCrawls();
  recoverInterruptedSyncJobs();
  recoverAndResumeAgentWorkflows();

  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  // Stage 6 External Signed Webhook Ingress (mounted before browser CSRF check, captures exact raw body for HMAC-SHA256 verification)
  app.post(
    '/api/webhooks/agent-factory/:subscriptionId',
    express.text({ type: '*/*', limit: '64kb' }),
    (req, res) => {
      try {
        const rawBody =
          typeof req.body === 'string'
            ? req.body
            : req.body
              ? JSON.stringify(req.body)
              : '';
        const result = handleInboundWebhookEvent({
          subscriptionId: req.params.subscriptionId,
          rawBody,
          signatureHeader:
            typeof req.headers['x-rovix-signature'] === 'string'
              ? req.headers['x-rovix-signature']
              : undefined,
          timestampHeader:
            typeof req.headers['x-rovix-timestamp'] === 'string'
              ? req.headers['x-rovix-timestamp']
              : undefined,
          idempotencyKeyHeader:
            typeof req.headers['x-idempotency-key'] === 'string'
              ? req.headers['x-idempotency-key']
              : undefined,
        });
        res.status(result.httpStatus).json({
          accepted: result.accepted,
          deduplicated: result.deduplicated,
          event: result.event,
          error: result.error,
        });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.use(express.json({ limit: '512kb' }));
  app.use('/api', csrfOriginCheck);

  const authRateLimiter = createRateLimiter({
    bucketPrefix: 'auth',
    windowMs: 60_000,
    maxRequests: 25,
  });
  const crawlRateLimiter = createRateLimiter({
    bucketPrefix: 'crawl',
    windowMs: 60_000,
    maxRequests: 15,
  });
  const syncRateLimiter = createRateLimiter({
    bucketPrefix: 'sync',
    windowMs: 60_000,
    maxRequests: 20,
  });

  // =========================================================================
  // AUTHENTICATION & WORKSPACE REGISTRATION
  // =========================================================================

  app.get('/api/auth/session', (req, res) => {
    const token = extractRequestToken(req);
    const session = verifySessionToken(token);
    const meta = authModeMeta();
    if (!session) {
      res.json({
        authenticated: false,
        user: null,
        tenant: null,
        ...meta,
      });
      return;
    }

    res.json({
      authenticated: true,
      user: session.user,
      tenant: session.tenant,
      ...meta,
      expiresAt: new Date(session.exp).toISOString(),
      sessionToken: token,
    });
  });

  app.post('/api/auth/register', authRateLimiter, (req, res) => {
    try {
      const organizationName = String(
        req.body?.workspaceName ?? req.body?.organizationName ?? '',
      ).trim();
      const primaryDomain = String(req.body?.primaryDomain ?? '').trim();
      const name = String(req.body?.name ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const rememberMe = Boolean(req.body?.rememberMe ?? true);

      if (organizationName.length < 2 || organizationName.length > 80) {
        res.status(400).json({ error: 'Workspace name must be 2–80 characters.' });
        return;
      }
      if (name.length < 2 || name.length > 80) {
        res.status(400).json({ error: 'Full name must be 2–80 characters.' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Enter a valid work email address.' });
        return;
      }
      if (password.length < 8 || password.length > 128) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      const cleanDomain = primaryDomain
        ? normalizeCanonicalDomain(primaryDomain)
        : '';

      const created = createTenantAndUser({
        organizationName,
        primaryDomain: cleanDomain,
        name,
        email,
        password,
        role: 'Agency Owner',
      });

      if (cleanDomain) {
        createProjectRecord({
          tenantId: created.tenant.id,
          name: organizationName,
          website: cleanDomain,
          owner: created.user.name,
        });
      }

      recordActivityEvent({
        tenantId: created.tenant.id,
        type: 'publishing',
        actor: created.user.name,
        action: `Created workspace "${created.tenant.name}"`,
        status: 'Succeeded',
        evidenceUrl: '/settings',
      });

      const maxAgeMs = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
      const payload: SessionPayload = {
        user: created.user,
        tenant: created.tenant,
        exp: Date.now() + maxAgeMs,
      };

      const sessionToken = setSessionCookie(req, res, payload, maxAgeMs);

      res.status(201).json({
        authenticated: true,
        user: payload.user,
        tenant: payload.tenant,
        ...authModeMeta(),
        expiresAt: new Date(payload.exp).toISOString(),
        sessionToken,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/auth/login', authRateLimiter, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // 1. Check real persisted SQLite accounts first
    const dbAccount = findStoredUserByEmail(email);
    let authedUser: User | null = null;
    let authedTenant: Tenant | null = null;

    if (
      dbAccount &&
      verifyPasswordAgainstHash(password, dbAccount.salt, dbAccount.passwordHash)
    ) {
      authedUser = dbAccount.user;
      authedTenant = dbAccount.tenant;
    } else if (isDevAuthEnabled()) {
      // 2. Fallback to isolated local developer accounts ONLY when dev mode is active
      const devAccount = DEV_ACCOUNTS.find(
        (acc) => acc.user.email.toLowerCase() === email,
      );
      if (
        devAccount &&
        verifyPasswordHash(password, devAccount.salt, devAccount.passwordHashHex)
      ) {
        ensureTenantRecord(devAccount.tenant);
        authedUser = devAccount.user;
        authedTenant = devAccount.tenant;
      }
    }

    if (!authedUser || !authedTenant) {
      res.status(401).json({
        error: isDevAuthEnabled()
          ? 'Invalid email or password. Sign in with your workspace account or local developer credentials.'
          : 'Invalid email or password.',
      });
      return;
    }

    const maxAgeMs = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
    const payload: SessionPayload = {
      user: authedUser,
      tenant: authedTenant,
      exp: Date.now() + maxAgeMs,
    };

    const sessionToken = setSessionCookie(req, res, payload, maxAgeMs);

    res.json({
      authenticated: true,
      user: payload.user,
      tenant: payload.tenant,
      ...authModeMeta(),
      expiresAt: new Date(payload.exp).toISOString(),
      sessionToken,
    });
  });

  // Strictly blocked in production environments (prevents vertical privilege escalation)
  app.post('/api/auth/switch-role', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isDevAuthEnabled()) {
      res.status(403).json({
        error: 'Role switching is disabled outside local developer sandbox mode.',
      });
      return;
    }

    const requestedRole = String(req.body?.role ?? '') as UserRole;
    if (!ALL_ROLES.includes(requestedRole)) {
      res.status(400).json({ error: 'Invalid role specified.' });
      return;
    }

    const current = req.session!;
    const updatedPayload: SessionPayload = {
      user: {
        ...current.user,
        role: requestedRole,
        title: requestedRole,
      },
      tenant: current.tenant,
      exp: current.exp,
    };

    const remainingMs = Math.max(60_000, current.exp - Date.now());
    const sessionToken = setSessionCookie(req, res, updatedPayload, remainingMs);

    res.json({
      authenticated: true,
      user: updatedPayload.user,
      tenant: updatedPayload.tenant,
      ...authModeMeta(),
      expiresAt: new Date(updatedPayload.exp).toISOString(),
      sessionToken,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const https = isHttpsRequest(req);
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: https ? 'none' : 'lax',
      secure: https,
      ...(https ? { partitioned: true } : {}),
    } as express.CookieOptions);
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', authRateLimiter, (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid work email address.' });
      return;
    }

    res.json({
      ok: true,
      devMode: isDevAuthEnabled(),
      message:
        'Password reset email delivery is not configured (SMTP / Transactional Mail provider not connected). Contact your workspace administrator.',
    });
  });

  // =========================================================================
  // REAL PROJECTS & ZERO-FAKE-DATA DASHBOARD TELEMETRY
  // =========================================================================

  app.get('/api/dashboard/overview', requireAuth, (req: AuthenticatedRequest, res) => {
    const tenantId = req.session!.tenant.id;
    const projectId =
      typeof req.query.projectId === 'string' && req.query.projectId.trim()
        ? req.query.projectId.trim()
        : undefined;
    const rangeParam = String(req.query.range ?? '30d');
    const validRanges: DateRangePreset[] = ['7d', '30d', '90d', 'custom'];
    const dateRange: DateRangePreset = validRanges.includes(
      rangeParam as DateRangePreset,
    )
      ? (rangeParam as DateRangePreset)
      : '30d';

    const customStart =
      typeof req.query.start === 'string' ? req.query.start : undefined;
    const customEnd =
      typeof req.query.end === 'string' ? req.query.end : undefined;

    const overview = buildRealDashboardOverview({
      tenantId,
      projectId,
      dateRange,
      customStart,
      customEnd,
    });
    res.json(overview);
  });

  app.get('/api/projects', requireAuth, (req: AuthenticatedRequest, res) => {
    const projects = listProjectsByTenant(req.session!.tenant.id);
    res.json({
      projects,
      isDevSampleData: false,
    });
  });

  app.post('/api/projects', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session!.user;
      if (!PROJECT_ADMIN_ROLES.includes(user.role)) {
        res.status(403).json({
          error: `Role "${user.role}" does not have permission to create workspace projects.`,
        });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      const website = String(req.body?.website ?? '').trim();
      const marketsRaw = Array.isArray(req.body?.targetMarkets)
        ? (req.body.targetMarkets as unknown[]).map((m) => String(m).trim()).filter(Boolean)
        : ['Global'];

      if (name.length < 2 || name.length > 80) {
        res.status(400).json({ error: 'Project name must be 2–80 characters.' });
        return;
      }
      if (!website) {
        res.status(400).json({ error: 'Project website domain is required.' });
        return;
      }

      const canonical = normalizeCanonicalDomain(website);
      ensureTenantRecord(req.session!.tenant);
      const project = createProjectRecord({
        tenantId: req.session!.tenant.id,
        name,
        website: canonical,
        owner: user.name,
        targetMarkets: marketsRaw,
      });

      recordActivityEvent({
        tenantId: req.session!.tenant.id,
        projectId: project.id,
        type: 'publishing',
        actor: user.name,
        action: `Created project "${project.name}" (${project.website})`,
        status: 'Succeeded',
        evidenceUrl: '/audit/new',
      });

      res.status(201).json({ project });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.delete('/api/projects/:projectId', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.session!.user;
    if (!PROJECT_ADMIN_ROLES.includes(user.role)) {
      res.status(403).json({
        error: `Role "${user.role}" cannot remove projects.`,
      });
      return;
    }
    const deleted = softDeleteProject(req.session!.tenant.id, req.params.projectId);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Explicit isolated sandbox crawler registration (never enabled in production)
  app.post('/api/projects/sandbox', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isSandboxCrawlAllowed()) {
      res.status(403).json({
        error: 'Sandbox fixture projects are disabled in production mode.',
      });
      return;
    }
    const user = req.session!.user;
    if (!PROJECT_ADMIN_ROLES.includes(user.role)) {
      res.status(403).json({
        error: `Role "${user.role}" cannot register sandbox targets.`,
      });
      return;
    }
    ensureTenantRecord(req.session!.tenant);
    const project = ensureSandboxTestProject(
      req.session!.tenant.id,
      'proj-rovix-main',
    );
    res.status(201).json({ project });
  });

  // =========================================================================
  // REAL KEYWORDS (GSC SYNCED OR MANUAL TRACKED TARGETS)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/keywords',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const keywords = listProjectKeywords(
        req.session!.tenant.id,
        req.params.projectId,
      );
      res.json({ keywords });
    },
  );

  app.post(
    '/api/projects/:projectId/keywords',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const tenantId = req.session!.tenant.id;
        const project = getProjectById(tenantId, req.params.projectId);
        if (!project) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }
        const keyword = String(req.body?.keyword ?? '').trim();
        if (keyword.length < 2) {
          res.status(400).json({ error: 'Keyword phrase must be at least 2 characters.' });
          return;
        }
        const intent = (req.body?.intent as KeywordIntent) ?? 'Informational';
        const targetMarket = String(req.body?.targetMarket ?? 'Global').trim();
        const targetUrl = String(req.body?.targetUrl ?? '/').trim();
        const opportunity = (req.body?.opportunity as OpportunityTier) ?? 'Medium';
        const rationale = String(
          req.body?.rationale ?? 'Added manually in workspace Keyword Lab.',
        ).trim();

        const created = createManualKeyword({
          tenantId,
          projectId: project.id,
          keyword,
          intent,
          targetMarket,
          targetUrl,
          opportunity,
          rationale,
        });
        res.status(201).json({ keyword: created });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/keywords/:id/approval',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.session!.user;
      if (!ROLE_APPROVER_LIST.includes(user.role)) {
        res.status(403).json({
          error: `Role "${user.role}" does not have permission to approve or modify keyword statuses.`,
        });
        return;
      }

      const keywordId = req.params.id;
      const nextStatus = String(req.body?.status ?? '') as ApprovalStatus;
      const allowedStatuses: ApprovalStatus[] = [
        'Approved',
        'Pending',
        'Revision Requested',
      ];
      if (!allowedStatuses.includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid approval status.' });
        return;
      }

      const updated = updateKeywordApprovalInDb(
        req.session!.tenant.id,
        keywordId,
        nextStatus,
      );
      if (!updated) {
        res.status(404).json({ error: 'Keyword target not found.' });
        return;
      }

      recordActivityEvent({
        tenantId: req.session!.tenant.id,
        type: 'keyword_approval',
        actor: user.name,
        action: `Set keyword "${updated.keyword}" status to ${nextStatus}`,
        status: nextStatus === 'Approved' ? 'Succeeded' : 'Pending',
        evidenceUrl: '/keywords',
      });

      res.json({ ok: true, keyword: updated });
    },
  );

  // =========================================================================
  // GOOGLE SEARCH CONSOLE, GA4 OAUTH & REAL SYNC ENGINE
  // =========================================================================

  app.get(
    '/api/integrations/overview',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const projectId = String(req.query.projectId ?? '').trim();
      const integrations = projectId
        ? listOAuthIntegrations(tenantId, projectId)
        : [];
      const syncJobs = projectId
        ? listSyncJobs(tenantId, projectId, 20)
        : [];

      res.json({
        projectId,
        oauthConfigured: isGoogleOAuthConfigured(),
        encryptionConfigured: hasIntegrationEncryptionKey(),
        pageSpeedKeyConfigured: getPageSpeedApiKey() !== null,
        callbackUrls: getGoogleOAuthCallbackUrls(getRequestOrigin(req)),
        requiredEnvVars: [
          'GOOGLE_OAUTH_CLIENT_ID',
          'GOOGLE_OAUTH_CLIENT_SECRET',
          'INTEGRATION_ENCRYPTION_KEY',
          'SESSION_SECRET',
        ],
        integrations,
        syncJobs,
      });
    },
  );

  app.post(
    '/api/integrations/:provider/oauth/url',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const user = req.session!.user;
        if (!INTEGRATION_ADMIN_ROLES.includes(user.role)) {
          res.status(403).json({
            error: `Role "${user.role}" cannot authorize external OAuth integrations.`,
          });
          return;
        }
        const provider = req.params.provider;
        if (!isProviderSupportedForOAuth(provider)) {
          res.status(400).json({ error: 'Unsupported OAuth provider.' });
          return;
        }
        const projectId = String(req.body?.projectId ?? '').trim();
        const project = getProjectById(req.session!.tenant.id, projectId);
        if (!project) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }

        const auth = buildGoogleAuthUrl({
          tenantId: req.session!.tenant.id,
          projectId: project.id,
          provider,
          userId: user.id,
          requestOrigin: getRequestOrigin(req),
        });
        res.json(auth);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get('/api/integrations/google/oauth/callback', async (req, res) => {
    const errParam = typeof req.query.error === 'string' ? req.query.error : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (errParam || !code || !state) {
      res
        .status(400)
        .type('html')
        .send(
          renderOAuthPopupResultHtml({
            ok: false,
            provider: 'google',
            projectId: '',
            message: errParam
              ? `Google OAuth cancelled or denied (${errParam}).`
              : 'Missing OAuth code or state parameter.',
          }),
        );
      return;
    }

    try {
      const completed = await completeGoogleOAuthCallback({
        code,
        state,
        requestOrigin: getRequestOrigin(req),
      });
      res.type('html').send(
        renderOAuthPopupResultHtml({
          ok: true,
          provider: completed.provider,
          projectId: completed.projectId,
          message: `Connected ${completed.provider.toUpperCase()} (${completed.accountEmail ?? 'Google Account'}). You can close this window.`,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OAuth callback failed.';
      res
        .status(400)
        .type('html')
        .send(
          renderOAuthPopupResultHtml({
            ok: false,
            provider: 'google',
            projectId: '',
            message: msg,
          }),
        );
    }
  });

  app.get(
    '/api/integrations/:provider/properties',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const provider = req.params.provider;
        const projectId = String(req.query.projectId ?? '').trim();
        if (!projectId) {
          res.status(400).json({ error: 'projectId query parameter is required.' });
          return;
        }
        if (provider === 'gsc') {
          const properties = await listGscProperties({
            tenantId: req.session!.tenant.id,
            projectId,
          });
          res.json({ properties });
          return;
        }
        if (provider === 'ga4') {
          const properties = await listGa4Properties({
            tenantId: req.session!.tenant.id,
            projectId,
          });
          res.json({ properties });
          return;
        }
        res.status(400).json({ error: 'Unsupported provider.' });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/integrations/:provider/property',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.session!.user;
      if (!INTEGRATION_ADMIN_ROLES.includes(user.role)) {
        res.status(403).json({
          error: `Role "${user.role}" cannot bind properties.`,
        });
        return;
      }
      const provider = req.params.provider as IntegrationProviderId;
      const projectId = String(req.body?.projectId ?? '').trim();
      const propertyId = String(req.body?.propertyId ?? '').trim();
      const propertyName = String(req.body?.propertyName ?? propertyId).trim();

      const existing = getOAuthIntegrationRow(
        req.session!.tenant.id,
        projectId,
        provider,
      );
      if (!existing || existing.status !== 'Connected') {
        res.status(412).json({
          error: 'Authorize Google OAuth connection before selecting a property.',
        });
        return;
      }

      const updated = upsertOAuthIntegration({
        tenantId: req.session!.tenant.id,
        projectId,
        provider,
        propertyId,
        propertyName,
        status: 'Connected',
      });
      res.json({ integration: updated });
    },
  );

  app.post(
    '/api/integrations/:provider/sync',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const user = req.session!.user;
        if (!INTEGRATION_ADMIN_ROLES.includes(user.role)) {
          res.status(403).json({
            error: `Role "${user.role}" cannot run integration sync jobs.`,
          });
          return;
        }
        const provider = req.params.provider;
        if (!isProviderSupportedForOAuth(provider)) {
          res.status(400).json({ error: 'Unsupported provider for sync.' });
          return;
        }
        const projectId = String(req.body?.projectId ?? '').trim();
        const days = Math.max(7, Math.min(90, Number(req.body?.days ?? 30)));
        const job = await runIntegrationSyncJob({
          tenantId: req.session!.tenant.id,
          projectId,
          provider,
          actorName: user.name,
          days,
          awaitCompletion: Boolean(req.body?.awaitCompletion ?? true),
        });
        res.status(200).json({ syncJob: job });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/integrations/:provider',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.session!.user;
      if (!INTEGRATION_ADMIN_ROLES.includes(user.role)) {
        res.status(403).json({
          error: `Role "${user.role}" cannot disconnect integrations.`,
        });
        return;
      }
      const provider = req.params.provider as IntegrationProviderId;
      const projectId = String(req.query.projectId ?? '').trim();
      const removed = await disconnectIntegration({
        tenantId: req.session!.tenant.id,
        projectId,
        provider,
        actorName: user.name,
      });
      res.json({ ok: true, removed });
    },
  );

  app.post(
    '/api/integrations/pagespeed/check',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const url = String(req.body?.url ?? '').trim();
        const strategy = req.body?.strategy === 'desktop' ? 'desktop' : 'mobile';
        if (!url) {
          res.status(400).json({ error: 'Target URL is required.' });
          return;
        }
        const result = await runLivePageSpeedCheck({ url, strategy });
        res.json({ result });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/analytics',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const projectId = req.params.projectId;
      const project = getProjectById(tenantId, projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const gscInt = getOAuthIntegrationRow(tenantId, projectId, 'gsc');
      const ga4Int = getOAuthIntegrationRow(tenantId, projectId, 'ga4');
      const gscDaily = getGscDailyMetrics(tenantId, projectId, 90);
      const gscTopQueries = getGscTopQueries(tenantId, projectId, 25);
      const ga4Daily = getGa4DailyMetrics(tenantId, projectId, 90);
      const ga4TopLandingPages = getGa4TopLandingPages(tenantId, projectId, 20);

      const gscTotals =
        gscDaily.length > 0
          ? {
              clicks: gscDaily.reduce((s, d) => s + d.clicks, 0),
              impressions: gscDaily.reduce((s, d) => s + d.impressions, 0),
              ctr:
                gscDaily.reduce((s, d) => s + d.impressions, 0) > 0
                  ? gscDaily.reduce((s, d) => s + d.clicks, 0) /
                    gscDaily.reduce((s, d) => s + d.impressions, 0)
                  : 0,
              avgPosition:
                gscDaily.reduce((s, d) => s + d.avgPosition, 0) / gscDaily.length,
            }
          : null;

      const ga4Totals =
        ga4Daily.length > 0
          ? {
              sessions: ga4Daily.reduce((s, d) => s + d.sessions, 0),
              activeUsers: ga4Daily.reduce((s, d) => s + d.activeUsers, 0),
              keyEvents: ga4Daily.reduce((s, d) => s + d.keyEvents, 0),
            }
          : null;

      const gscHasRows = gscDaily.length > 0;
      const ga4HasRows = ga4Daily.length > 0;
      const reportingPeriod = 'Last 90 days (synced daily snapshots)';

      res.json({
        projectId,
        reportingPeriod,
        gscConnected: gscInt?.status === 'Connected',
        gscLastSyncedAt: gscInt?.lastSyncedAt ?? null,
        gscMeasurementStatus: gscHasRows ? 'measured' : 'unavailable',
        gscTotals,
        gscDaily,
        gscTopQueries,
        ga4Connected: ga4Int?.status === 'Connected',
        ga4LastSyncedAt: ga4Int?.lastSyncedAt ?? null,
        ga4MeasurementStatus: ga4HasRows ? 'measured' : 'unavailable',
        ga4Totals,
        ga4Daily,
        ga4TopLandingPages,
        crmConnected: false,
        crmMeasurementStatus: 'unavailable',
        crmNotice:
          'No CRM revenue attribution connector configured. GA4 key events reflect analytics conversions only.',
      });
    },
  );

  // =========================================================================
  // OPERATIONAL HEALTH, MONITORING, TICKETS & REAL EXPORTS
  // =========================================================================

  app.get('/api/monitoring/health', requireAuth, (req: AuthenticatedRequest, res) => {
    const tenantId = req.session!.tenant.id;
    const dbHealth = getDatabaseHealthSnapshot();
    const recentCrawls = listCrawlRuns(tenantId)
      .slice(0, 12)
      .map((c) => ({
        id: c.id,
        projectId: c.projectId,
        status: c.status,
        crawlType: c.crawlType,
        processedCount: c.processedCount,
        errorCount: c.errorCount,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
      }));
    const recentSyncJobs = listSyncJobs(tenantId, undefined, 12);

    res.json({
      checkedAt: new Date().toISOString(),
      environment: IS_PROD ? 'production' : 'development',
      database: dbHealth,
      security: {
        productionSafe: !isDevAuthEnabled() && IS_PROD,
        devAuthEnabled: isDevAuthEnabled(),
        sandboxFixturesEnabled: isSandboxCrawlAllowed(),
        encryptionKeyConfigured: hasIntegrationEncryptionKey(),
        sessionSecretConfigured: isSessionSecretConfigured(),
        oauthConfigured: isGoogleOAuthConfigured(),
        ssrfProtectionActive: true,
      },
      crawler: {
        activeCrawls: getActiveCrawlCount(),
        headlessBrowserAvailable: findHeadlessBrowserPath() !== null,
      },
      recentCrawls,
      recentSyncJobs,
    });
  });

  app.post('/api/monitoring/backup', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.session!.user;
    if (user.role !== 'Platform Admin' && user.role !== 'Agency Owner') {
      res.status(403).json({
        error: 'Only Platform Admin or Agency Owner can create database backup snapshots.',
      });
      return;
    }
    try {
      const snap = createSqliteSnapshotBackup();
      recordActivityEvent({
        tenantId: req.session!.tenant.id,
        type: 'publishing',
        actor: user.name,
        action: `Created verified SQLite WAL backup (${Math.round(snap.sizeBytes / 1024)} KB)`,
        status: 'Succeeded',
        evidenceUrl: '/monitoring',
      });
      res.json({ ok: true, backup: snap });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.get(
    '/api/projects/:projectId/tickets',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tickets = listTicketsForProject(
        req.session!.tenant.id,
        req.params.projectId,
      );
      res.json({ tickets });
    },
  );

  app.get(
    '/api/projects/:projectId/report',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const projectId = req.params.projectId;
      const project = getProjectById(tenantId, projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const overview = buildRealDashboardOverview({
        tenantId,
        projectId,
        dateRange: '30d',
      });
      const issues = listProjectIssues(tenantId, projectId);
      const tickets = listTicketsForProject(tenantId, projectId);
      const crawls = listCrawlRuns(tenantId, projectId);
      const keywords = listProjectKeywords(tenantId, projectId);
      const gscInt = overview.integrations.find((i) => i.provider === 'GSC');
      const ga4Int = overview.integrations.find((i) => i.provider === 'GA4');
      const latestCrawlRun = crawls[0] ?? null;

      const reportBundle = {
        generatedAt: new Date().toISOString(),
        workspace: req.session!.tenant.name,
        project,
        computedHealthScore: overview.computedHealthScore,
        healthBreakdown: overview.healthBreakdown,
        kpis: overview.kpis,
        openIssuesCount: issues.filter(
          (i) => i.status !== 'Verified' && i.status !== 'Rejected',
        ).length,
        latestCrawl: latestCrawlRun
          ? {
              id: latestCrawlRun.id,
              status: latestCrawlRun.status,
              processedCount: latestCrawlRun.processedCount,
              errorCount: latestCrawlRun.errorCount,
              completedAt: latestCrawlRun.completedAt,
              seoHealthScore: overview.computedHealthScore,
            }
          : null,
        summary: {
          totalIssues: issues.length,
          openIssues: issues.filter(
            (i) => i.status !== 'Verified' && i.status !== 'Rejected',
          ).length,
          verifiedFixedIssues: issues.filter((i) => i.status === 'Verified').length,
          totalKeywords: keywords.length,
          approvedKeywords: keywords.filter((k) => k.approvalStatus === 'Approved').length,
          openTickets: tickets.filter(
            (t) => t.taskStatus !== 'Verified' && t.taskStatus !== 'Rejected' && t.taskStatus !== 'Archived',
          ).length,
        },
        gscConnected: Boolean(gscInt?.connected),
        ga4Connected: Boolean(ga4Int?.connected),
        issues,
        tickets,
        crawls: crawls.slice(0, 10),
        integrations: overview.integrations,
      };

      if (req.query.format === 'csv') {
        const escapeCsv = (val: unknown) => {
          const str = String(val ?? '');
          return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        };
        const lines: string[] = [
          'Section,MetricOrId,ValueOrTitle,Status,Detail',
          `Project,${escapeCsv(project.id)},${escapeCsv(project.name)},${escapeCsv(project.status)},${escapeCsv(project.website)}`,
          `Summary,SEO_Health_Score,${escapeCsv(overview.computedHealthScore ?? 'Pending')},Computed,${escapeCsv(latestCrawlRun?.id ?? 'No crawl')}`,
          `Summary,Open_Issues,${reportBundle.summary.openIssues},Active,${reportBundle.summary.verifiedFixedIssues} verified fixed`,
          `Summary,Tracked_Keywords,${reportBundle.summary.totalKeywords},Tracked,${reportBundle.summary.approvedKeywords} approved`,
          `Summary,Open_Tickets,${reportBundle.summary.openTickets},Active,${tickets.length} total`,
        ];
        for (const issue of issues) {
          lines.push(
            `Issue,${escapeCsv(issue.ruleId)},${escapeCsv(issue.title)},${escapeCsv(issue.status)},${escapeCsv(`${issue.severity} · ${issue.affectedUrlCount} URL(s)`)}`,
          );
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-report-${project.website}.csv"`,
        );
        res.send(lines.join('\n'));
        return;
      }

      if (req.query.format === 'download') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-report-${project.website}.json"`,
        );
        res.send(JSON.stringify(reportBundle, null, 2));
        return;
      }

      res.json(reportBundle);
    },
  );

  // =========================================================================
  // PHASE 3: TECHNICAL SEO AUDIT & CRAWL ENGINE APIs (Tenant-Scoped + RBAC)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/audit-overview',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const overview = buildAuditOverview(tenantId, req.params.projectId);
      if (!overview) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      res.json(overview);
    },
  );

  app.get(
    '/api/projects/:projectId/crawl-config',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const cfg = getCrawlConfigResponse(tenantId, req.params.projectId);
      if (!cfg) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      res.json(cfg);
    },
  );

  app.put(
    '/api/projects/:projectId/crawl-config',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const updated = updateProjectCrawlConfig({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          config: req.body ?? {},
          user: req.session!.user,
        });
        res.json({ configuration: updated });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/verify-domain',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const canonicalDomainInput = String(req.body?.canonicalDomain ?? '').trim();
        const verificationMethod = String(
          req.body?.verificationMethod ?? 'DNS_TXT',
        ) as VerificationMethod;
        const crawlPolicyApproved = Boolean(req.body?.crawlPolicyApproved ?? true);

        if (!canonicalDomainInput) {
          res.status(400).json({ error: 'Canonical domain is required.' });
          return;
        }

        const verification = await verifyProjectDomain({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          canonicalDomainInput,
          verificationMethod,
          crawlPolicyApproved,
          user: req.session!.user,
        });
        recordActivityEvent({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          type: 'verification',
          actor: req.session!.user.name,
          action: `Verified domain ${verification.canonicalDomain} (${verificationMethod})`,
          status: 'Succeeded',
          evidenceUrl: '/audit/new',
        });
        res.json({ verification });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/crawls',
    requireAuth,
    crawlRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const crawlRun = await startCrawlJob({
          tenantId: req.session!.tenant.id,
          user: req.session!.user,
          projectId: req.params.projectId,
          configOverrides: req.body?.configuration,
          awaitCompletion: Boolean(req.body?.awaitCompletion),
        });
        recordActivityEvent({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          type: 'crawl',
          actor: req.session!.user.name,
          action: `Started crawl ${crawlRun.id} (${crawlRun.configuration.startingUrl})`,
          status: crawlRun.status === 'Failed' ? 'Failed' : 'Succeeded',
          evidenceUrl: `/audit/live/${crawlRun.id}`,
        });
        res.status(202).json({ crawlRun });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/crawls',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const runs = listCrawlRuns(req.session!.tenant.id, req.params.projectId);
      res.json({ crawls: runs });
    },
  );

  app.get(
    '/api/crawls/:crawlId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const crawl = getCrawlRunById(tenantId, req.params.crawlId);
      if (!crawl) {
        res.status(404).json({ error: 'Crawl run not found.' });
        return;
      }
      const events = listCrawlEvents(tenantId, crawl.id);
      const urlPreview = queryCrawlUrls({
        tenantId,
        crawlId: crawl.id,
        page: 1,
        pageSize: 60,
        sortBy: 'depth',
        sortDir: 'asc',
      });
      res.json({ crawlRun: crawl, events, urls: urlPreview.items });
    },
  );

  // Single-use short-lived SSE stream ticket (replaces raw session token in URLs)
  app.post(
    '/api/crawls/:crawlId/stream-ticket',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const crawl = getCrawlRunById(tenantId, req.params.crawlId);
      if (!crawl) {
        res.status(404).json({ error: 'Crawl run not found.' });
        return;
      }
      const ticket = issueSseStreamTicket({
        crawlId: crawl.id,
        tenantId,
        userId: req.session!.user.id,
      });
      res.json({ ticket });
    },
  );

  // Real-time Server-Sent Events (SSE) stream via HttpOnly cookie OR single-use ticket
  app.get(
    '/api/crawls/:crawlId/events',
    (req: AuthenticatedRequest, res) => {
      let tenantId: string | null = null;
      const token = extractRequestToken(req);
      const session = verifySessionToken(token);
      if (session) {
        tenantId = session.tenant.id;
      } else if (typeof req.query.ticket === 'string') {
        const consumed = consumeSseStreamTicket(
          req.query.ticket,
          req.params.crawlId,
        );
        if (consumed) tenantId = consumed.tenantId;
      }

      if (!tenantId) {
        res.status(401).json({
          error: 'Authentication required for crawl event stream.',
        });
        return;
      }

      const crawl = getCrawlRunById(tenantId, req.params.crawlId);
      if (!crawl) {
        res.status(404).json({ error: 'Crawl run not found.' });
        return;
      }

      if (req.query.mode === 'json') {
        res.json({
          crawlRun: crawl,
          events: listCrawlEvents(tenantId, crawl.id),
        });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const history = listCrawlEvents(tenantId, crawl.id);
      res.write(
        `event: snapshot\ndata: ${JSON.stringify({ crawlRun: crawl, events: history })}\n\n`,
      );

      if (
        crawl.status === 'Succeeded' ||
        crawl.status === 'Partial' ||
        crawl.status === 'Failed' ||
        crawl.status === 'Cancelled'
      ) {
        res.end();
        return;
      }

      const activeTenant = tenantId;
      const unsubscribe = subscribeToCrawlEvents(crawl.id, (evt) => {
        if (evt.tenantId !== activeTenant) return;
        const latest = getCrawlRunById(activeTenant, crawl.id);
        res.write(
          `event: crawl_event\ndata: ${JSON.stringify({ event: evt, crawlRun: latest })}\n\n`,
        );
        if (
          evt.eventType === 'crawl_completed' ||
          evt.eventType === 'crawl_cancelled'
        ) {
          unsubscribe();
          clearInterval(keepAlive);
          res.end();
        }
      });

      const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);

      req.on('close', () => {
        unsubscribe();
        clearInterval(keepAlive);
      });
    },
  );

  app.post(
    '/api/crawls/:crawlId/cancel',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const crawlRun = cancelCrawlJob(
          req.session!.tenant.id,
          req.params.crawlId,
          req.session!.user,
        );
        res.json({ crawlRun });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/crawls/:crawlId/urls',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const crawl = getCrawlRunById(tenantId, req.params.crawlId);
      if (!crawl) {
        res.status(404).json({ error: 'Crawl run not found.' });
        return;
      }

      const result = queryCrawlUrls({
        tenantId,
        crawlId: crawl.id,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        filter: typeof req.query.filter === 'string' ? req.query.filter : undefined,
        sortBy: (typeof req.query.sortBy === 'string'
          ? req.query.sortBy
          : 'depth') as 'normalized_url' | 'status_code' | 'depth' | 'issue_count' | 'fetched_at',
        sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
        page: req.query.format === 'csv' ? 1 : Number(req.query.page ?? 1),
        pageSize: req.query.format === 'csv' ? 1000 : Number(req.query.pageSize ?? 20),
      });

      if (req.query.format === 'csv') {
        const header = [
          'URL',
          'Status',
          'Indexability',
          'Reason',
          'Canonical',
          'Depth',
          'Title',
          'H1',
          'Issues',
          'Rendering',
        ].join(',');
        const escapeCsv = (val: unknown) =>
          `"${String(val ?? '').replace(/"/g, '""')}"`;
        const lines = result.items.map((u) =>
          [
            escapeCsv(u.normalizedUrl),
            u.statusCode,
            escapeCsv(u.indexability),
            escapeCsv(u.indexabilityReason),
            escapeCsv(u.canonicalUrl ?? ''),
            u.depth,
            escapeCsv(u.title ?? ''),
            escapeCsv(u.h1 ?? ''),
            u.issueCount,
            u.renderingSource,
          ].join(','),
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-urls-${crawl.id}.csv"`,
        );
        res.send([header, ...lines].join('\n'));
        return;
      }

      res.json(result);
    },
  );

  app.get(
    '/api/crawls/:crawlId/urls/:urlId/snapshot',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const snap = getUrlSnapshotContent(
        req.session!.tenant.id,
        req.params.crawlId,
        req.params.urlId,
      );
      if (!snap) {
        res.status(404).json({ error: 'URL snapshot not found.' });
        return;
      }
      res.json(snap);
    },
  );

  app.get(
    '/api/crawls/:crawlId/issues',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const crawl = getCrawlRunById(tenantId, req.params.crawlId);
      if (!crawl) {
        res.status(404).json({ error: 'Crawl run not found.' });
        return;
      }
      const issues = listCrawlIssues(tenantId, crawl.id);
      res.json({ issues });
    },
  );

  app.get(
    '/api/projects/:projectId/issues',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const issues = listProjectIssues(req.session!.tenant.id, req.params.projectId);
      res.json({ issues });
    },
  );

  app.get(
    '/api/issues/:issueId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const bundle = getIssueDetailsBundle(req.session!.tenant.id, req.params.issueId);
      if (!bundle) {
        res.status(404).json({ error: 'Technical issue not found.' });
        return;
      }
      res.json(bundle);
    },
  );

  app.get(
    '/api/issues/:issueId/evidence',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const evidence = listIssueEvidence(
        req.session!.tenant.id,
        req.params.issueId,
        typeof req.query.crawlId === 'string' ? req.query.crawlId : undefined,
      );
      res.json({ evidence });
    },
  );

  app.post(
    '/api/issues/:issueId/tickets',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const ticket = createDeveloperTicket({
          tenantId: req.session!.tenant.id,
          issueId: req.params.issueId,
          title: typeof req.body?.title === 'string' ? req.body.title : undefined,
          description:
            typeof req.body?.description === 'string' ? req.body.description : undefined,
          assignedUser:
            typeof req.body?.assignedUser === 'string' ? req.body.assignedUser : null,
          user: req.session!.user,
        });
        recordActivityEvent({
          tenantId: req.session!.tenant.id,
          projectId: ticket.projectId,
          type: 'issue',
          actor: req.session!.user.name,
          action: `Created remediation ticket "${ticket.title}"`,
          status: 'Pending',
          evidenceUrl: `/audit/issues/${req.params.issueId}`,
        });
        res.status(201).json({ ticket });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/tickets/:ticketId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const ticket = updateDeveloperTicket({
          tenantId: req.session!.tenant.id,
          ticketId: req.params.ticketId,
          action: req.body?.action,
          taskStatus: req.body?.taskStatus as DeveloperTaskStatus | undefined,
          assignedUser: req.body?.assignedUser,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
          user: req.session!.user,
        });
        res.json({ ticket });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/issues/:issueId/reverify',
    requireAuth,
    crawlRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const tenantId = req.session!.tenant.id;
        const bundle = getIssueDetailsBundle(tenantId, req.params.issueId);
        if (!bundle) {
          res.status(404).json({ error: 'Technical issue not found.' });
          return;
        }

        if (bundle.issue.ruleId.startsWith('PERF-')) {
          const perfOutcome = await reverifyPerformanceIssue({
            tenantId,
            issueId: req.params.issueId,
            user: req.session!.user,
          });
          recordActivityEvent({
            tenantId,
            projectId: perfOutcome.issue.projectId,
            type: 'verification',
            actor: req.session!.user.name,
            action: `Reverified performance issue "${perfOutcome.issue.title}": ${perfOutcome.verificationRun.result}`,
            status:
              perfOutcome.verificationRun.result === 'Verified'
                ? 'Succeeded'
                : 'Warning',
            evidenceUrl: '/performance',
          });
          res.json(perfOutcome);
          return;
        }

        const outcome = await runIssueReverification({
          tenantId,
          issueId: req.params.issueId,
          user: req.session!.user,
        });
        recordActivityEvent({
          tenantId,
          projectId: outcome.issue.projectId,
          type: 'verification',
          actor: req.session!.user.name,
          action: `Reverified "${outcome.issue.title}": ${outcome.verificationRun.result}`,
          status: outcome.verificationRun.result === 'Verified' ? 'Succeeded' : 'Warning',
          evidenceUrl: `/audit/issues/${outcome.issue.id}`,
        });
        res.json(outcome);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // PHASE 6: PERFORMANCE & USABILITY INTELLIGENCE APIs (Tenant-Scoped + RBAC)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/performance/overview',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const overview = buildPerformanceOverview(
        req.session!.tenant.id,
        req.params.projectId,
        typeof req.query.runId === 'string' ? req.query.runId : undefined,
      );
      if (!overview) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      res.json(overview);
    },
  );

  app.get(
    '/api/projects/:projectId/performance/runs',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const runs = listPerformanceAuditRuns(
        req.session!.tenant.id,
        req.params.projectId,
      );
      res.json({ runs });
    },
  );

  app.post(
    '/api/projects/:projectId/performance/audits',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const targetUrls = Array.isArray(req.body?.targetUrls)
          ? req.body.targetUrls.map((u: unknown) => String(u ?? '').trim()).filter(Boolean)
          : undefined;
        const strategyMode = (
          req.body?.strategyMode === 'mobile' ||
          req.body?.strategyMode === 'desktop' ||
          req.body?.strategyMode === 'both'
            ? req.body.strategyMode
            : 'both'
        ) as PerformanceRunStrategyMode;

        const auditRun = await startPerformanceAudit({
          tenantId: req.session!.tenant.id,
          user: req.session!.user,
          projectId: req.params.projectId,
          targetUrls,
          sourceCrawlId:
            typeof req.body?.sourceCrawlId === 'string'
              ? req.body.sourceCrawlId
              : null,
          strategyMode,
          awaitCompletion: Boolean(req.body?.awaitCompletion),
        });
        res.status(202).json({ auditRun });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/performance/audits/:auditId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const run = getPerformanceAuditRunById(
        req.session!.tenant.id,
        req.params.auditId,
      );
      if (!run) {
        res.status(404).json({ error: 'Performance audit run not found.' });
        return;
      }
      res.json({ auditRun: run });
    },
  );

  app.post(
    '/api/performance/audits/:auditId/cancel',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const auditRun = cancelPerformanceAudit(
          req.session!.tenant.id,
          req.params.auditId,
          req.session!.user,
        );
        res.json({ auditRun });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/performance/measurements/:measurementId/raw',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const meas = getPerformanceMeasurementById(
        tenantId,
        req.params.measurementId,
      );
      if (!meas) {
        res.status(404).json({ error: 'Performance measurement not found.' });
        return;
      }
      const rawJson = readObjectSnapshot(tenantId, meas.rawObjectRef);
      res.json({
        measurement: meas,
        rawSnapshot: rawJson ? JSON.parse(rawJson) : null,
      });
    },
  );

  app.post(
    '/api/performance/findings/:findingId/issue',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = bridgeFindingToTechnicalIssue({
          tenantId: req.session!.tenant.id,
          findingId: req.params.findingId,
          user: req.session!.user,
          createTicket: Boolean(req.body?.createTicket),
          assignedUser:
            typeof req.body?.assignedUser === 'string'
              ? req.body.assignedUser
              : null,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/performance/issues/:issueId/reverify',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const outcome = await reverifyPerformanceIssue({
          tenantId: req.session!.tenant.id,
          issueId: req.params.issueId,
          user: req.session!.user,
        });
        recordActivityEvent({
          tenantId: req.session!.tenant.id,
          projectId: outcome.issue.projectId,
          type: 'verification',
          actor: req.session!.user.name,
          action: `Reverified performance issue "${outcome.issue.title}": ${outcome.verificationRun.result}`,
          status:
            outcome.verificationRun.result === 'Verified'
              ? 'Succeeded'
              : 'Warning',
          evidenceUrl: '/performance',
        });
        res.json(outcome);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // PHASE 7: KEYWORD & DEMAND INTELLIGENCE APIs (Tenant-Scoped + RBAC)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/keywords/workspace',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workspace = getKeywordWorkspace(
          req.session!.tenant.id,
          req.params.projectId,
        );
        res.json(workspace);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.put(
    '/api/projects/:projectId/keywords/business-profile',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const profile = updateBusinessProfileWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          approvedNiche: String(req.body?.approvedNiche ?? ''),
          approvedServices: Array.isArray(req.body?.approvedServices)
            ? req.body.approvedServices.map((s: unknown) => String(s ?? ''))
            : [],
          targetAudience: String(req.body?.targetAudience ?? ''),
          targetCountry: String(req.body?.targetCountry ?? 'US'),
          targetCity: String(req.body?.targetCity ?? ''),
          targetLanguage: String(req.body?.targetLanguage ?? 'en'),
          competitorUrls: Array.isArray(req.body?.competitorUrls)
            ? req.body.competitorUrls.map((u: unknown) => String(u ?? ''))
            : [],
          approveProfile: Boolean(req.body?.approveProfile),
        });
        res.json({ businessProfile: profile });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/keywords/discover',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await runKeywordDiscoveryWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          seedTerms: Array.isArray(req.body?.seedTerms)
            ? req.body.seedTerms.map((s: unknown) => String(s ?? ''))
            : [],
          targetCountry:
            typeof req.body?.targetCountry === 'string'
              ? req.body.targetCountry
              : undefined,
          targetCity:
            typeof req.body?.targetCity === 'string'
              ? req.body.targetCity
              : undefined,
          targetLanguage:
            typeof req.body?.targetLanguage === 'string'
              ? req.body.targetLanguage
              : undefined,
          intentFocus:
            typeof req.body?.intentFocus === 'string'
              ? (req.body.intentFocus as KeywordIntent | 'all')
              : 'all',
          competitorUrls: Array.isArray(req.body?.competitorUrls)
            ? req.body.competitorUrls.map((u: unknown) => String(u ?? ''))
            : undefined,
          includeAutocomplete: req.body?.includeAutocomplete !== false,
          includeTrends: req.body?.includeTrends !== false,
          includeAiExpansion: Boolean(req.body?.includeAiExpansion),
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/keywords/manual',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const keyword = addManualKeywordRecord({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          keyword: String(req.body?.keyword ?? ''),
          intent:
            typeof req.body?.intent === 'string'
              ? (req.body.intent as KeywordIntent)
              : undefined,
          targetCountry:
            typeof req.body?.targetCountry === 'string'
              ? req.body.targetCountry
              : undefined,
          targetCity:
            typeof req.body?.targetCity === 'string'
              ? req.body.targetCity
              : undefined,
          targetLanguage:
            typeof req.body?.targetLanguage === 'string'
              ? req.body.targetLanguage
              : undefined,
          targetUrl:
            typeof req.body?.targetUrl === 'string'
              ? req.body.targetUrl
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.status(201).json({ keyword });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/keywords/:keywordId/workflow',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const keyword = transitionKeywordWorkflowState({
          tenantId: req.session!.tenant.id,
          keywordId: req.params.keywordId,
          user: req.session!.user,
          nextState: String(req.body?.nextState ?? '') as KeywordWorkflowState,
          assignedTo:
            typeof req.body?.assignedTo === 'string' || req.body?.assignedTo === null
              ? req.body.assignedTo
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ keyword });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/keywords/:keywordId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const keyword = updateKeywordIntentOrMapping({
          tenantId: req.session!.tenant.id,
          keywordId: req.params.keywordId,
          user: req.session!.user,
          intent:
            typeof req.body?.intent === 'string'
              ? (req.body.intent as KeywordIntent)
              : undefined,
          targetUrl:
            req.body?.targetUrl !== undefined
              ? req.body.targetUrl === null
                ? null
                : String(req.body.targetUrl)
              : undefined,
          mappingStatus:
            typeof req.body?.mappingStatus === 'string'
              ? req.body.mappingStatus
              : undefined,
          recommendedSlug:
            req.body?.recommendedSlug !== undefined
              ? req.body.recommendedSlug === null
                ? null
                : String(req.body.recommendedSlug)
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ keyword });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/keyword-clusters/:clusterId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const cluster = updateKeywordClusterWorkflow({
          tenantId: req.session!.tenant.id,
          clusterId: req.params.clusterId,
          user: req.session!.user,
          clusterName:
            typeof req.body?.clusterName === 'string'
              ? req.body.clusterName
              : undefined,
          suggestedLandingUrl:
            req.body?.suggestedLandingUrl !== undefined
              ? req.body.suggestedLandingUrl === null
                ? null
                : String(req.body.suggestedLandingUrl)
              : undefined,
          approvalState:
            typeof req.body?.approvalState === 'string'
              ? req.body.approvalState
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ cluster });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/keyword-clusters/merge',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const cluster = mergeKeywordClustersWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          clusterIds: Array.isArray(req.body?.clusterIds)
            ? req.body.clusterIds.map((c: unknown) => String(c ?? ''))
            : [],
          mergedName:
            typeof req.body?.mergedName === 'string'
              ? req.body.mergedName
              : undefined,
        });
        res.json({ cluster });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/keywords/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const bundle = exportKeywordStrategyBundle(
          req.session!.tenant.id,
          req.params.projectId,
        );
        if (req.query.format === 'csv') {
          const esc = (v: unknown) => {
            const s = String(v ?? '');
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const rows: string[] = [
            [
              'Keyword',
              'Workflow State',
              'Opportunity Score',
              'Intent',
              'Intent Inferred',
              'Primary Source',
              'AI Suggestion',
              'Country',
              'City',
              'Language',
              'Market Search Volume',
              'Relative Trend Index (0-100)',
              'GSC Clicks',
              'GSC Impressions',
              'GSC Avg Pos',
              'Cluster',
              'Mapping Status',
              'Target URL / Recommended Slug',
              'Cannibalization Risk',
            ].join(','),
          ];
          for (const k of bundle.keywords) {
            rows.push(
              [
                k.keyword,
                k.workflowState,
                k.opportunityScore,
                k.intent,
                k.intentInferred ? 'Inferred' : 'Verified',
                k.primarySource,
                k.isAiSuggestion ? 'Yes' : 'No',
                k.targetCountry,
                k.targetCity,
                k.targetLanguage,
                k.marketSearchVolume ?? 'Unavailable',
                k.relativeTrendIndex ?? 'Unavailable',
                k.gscClicks ?? 'Unavailable',
                k.gscImpressions ?? 'Unavailable',
                k.gscAvgPosition ?? 'Unavailable',
                k.clusterName ?? 'Unclustered',
                k.mapping?.mappingStatus ?? 'unmapped',
                k.mapping?.targetUrl ?? k.mapping?.recommendedSlug ?? '',
                k.mapping?.cannibalizationRisk ?? 'none',
              ]
                .map(esc)
                .join(','),
            );
          }
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="rovix-keywords-${bundle.projectId}.csv"`,
          );
          res.send(rows.join('\n'));
          return;
        }
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-keywords-${bundle.projectId}.json"`,
        );
        res.json(bundle);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/crawl-comparison',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const comparison = buildCrawlComparison(
        req.session!.tenant.id,
        req.params.projectId,
        typeof req.query.currentCrawlId === 'string'
          ? req.query.currentCrawlId
          : undefined,
        typeof req.query.previousCrawlId === 'string'
          ? req.query.previousCrawlId
          : undefined,
      );
      res.json(comparison);
    },
  );

  // =========================================================================
  // PHASE 8: GEOGRAPHIC SEARCH INTELLIGENCE APIs (Tenant-Scoped + RBAC)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/geographic/workspace',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workspace = getGeoWorkspace(
          req.session!.tenant.id,
          req.params.projectId,
        );
        res.json(workspace);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/geographic/markets',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const market = upsertTargetMarketWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          marketId:
            typeof req.body?.marketId === 'string'
              ? req.body.marketId
              : undefined,
          countryCode: String(req.body?.countryCode ?? ''),
          stateRegion:
            typeof req.body?.stateRegion === 'string'
              ? req.body.stateRegion
              : '',
          city: typeof req.body?.city === 'string' ? req.body.city : '',
          language:
            typeof req.body?.language === 'string'
              ? req.body.language
              : undefined,
          serviceAreas: Array.isArray(req.body?.serviceAreas)
            ? req.body.serviceAreas.map((s: unknown) => String(s ?? ''))
            : undefined,
          priority:
            typeof req.body?.priority === 'string'
              ? (req.body.priority as GeoMarketPriority)
              : undefined,
          approve: Boolean(req.body?.approve),
          reason:
            typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.status(201).json({ market });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/geographic/markets/:marketId/decision',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const action = req.body?.action === 'reject' ? 'reject' : 'approve';
        const market = approveOrRejectTargetMarketWorkflow({
          tenantId: req.session!.tenant.id,
          marketId: req.params.marketId,
          user: req.session!.user,
          action,
          priority:
            typeof req.body?.priority === 'string'
              ? (req.body.priority as GeoMarketPriority)
              : undefined,
          reason:
            typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json({ market });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/geographic/markets/:marketId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        deleteTargetMarketWorkflow({
          tenantId: req.session!.tenant.id,
          marketId: req.params.marketId,
          user: req.session!.user,
        });
        res.json({ deleted: true });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/geographic/sync-gsc',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await syncGscCountriesWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          days: typeof req.body?.days === 'number' ? req.body.days : 30,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/geographic/discover',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await runGeoDiscoveryWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          countryCode: String(req.body?.countryCode ?? 'US'),
          stateRegion:
            typeof req.body?.stateRegion === 'string'
              ? req.body.stateRegion
              : '',
          city: typeof req.body?.city === 'string' ? req.body.city : '',
          language:
            typeof req.body?.language === 'string'
              ? req.body.language
              : undefined,
          seedTerms: Array.isArray(req.body?.seedTerms)
            ? req.body.seedTerms.map((s: unknown) => String(s ?? ''))
            : undefined,
          intentFocus:
            typeof req.body?.intentFocus === 'string'
              ? (req.body.intentFocus as KeywordIntent | 'all')
              : 'all',
          includeAutocomplete: req.body?.includeAutocomplete !== false,
          includeTrends: req.body?.includeTrends !== false,
          includeAiExpansion: Boolean(req.body?.includeAiExpansion),
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/geographic/mappings/:mappingId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const mapping = updateGeoUrlMappingWorkflow({
          tenantId: req.session!.tenant.id,
          mappingId: req.params.mappingId,
          user: req.session!.user,
          targetUrl:
            req.body?.targetUrl !== undefined
              ? req.body.targetUrl === null
                ? null
                : String(req.body.targetUrl)
              : undefined,
          recommendedSlug:
            req.body?.recommendedSlug !== undefined
              ? req.body.recommendedSlug === null
                ? null
                : String(req.body.recommendedSlug)
              : undefined,
          approveNewPage: Boolean(req.body?.approveNewPage),
        });
        res.json({ mapping });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/geographic/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const bundle = exportGeoReportBundle(
          req.session!.tenant.id,
          req.params.projectId,
        );
        if (req.query.format === 'csv') {
          const esc = (v: unknown) => {
            const s = String(v ?? '');
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const rows: string[] = [
            [
              'Location',
              'Granularity',
              'Priority',
              'Approval Status',
              'GSC Clicks (Country Only)',
              'GSC Impressions (Country Only)',
              'GSC Avg Position',
              'Trends Relative Index (0-100)',
              'Geo Rank Avg',
              'Geo Keywords Count',
              'Mapped URLs',
              'Missing Page Gaps',
              'Overlap Warnings',
            ].join(','),
          ];
          for (const row of bundle.comparisonRows) {
            rows.push(
              [
                row.locationLabel,
                row.granularity,
                row.priority,
                row.approvalStatus,
                row.gscDimension.clicks ?? 'Unavailable',
                row.gscDimension.impressions ?? 'Unavailable',
                row.gscDimension.avgPosition !== null
                  ? row.gscDimension.avgPosition.toFixed(1)
                  : 'Unavailable',
                row.trendsDimension.relativeIndex ?? 'Unavailable',
                row.rankTrackerDimension.avgRank ?? 'Unavailable',
                row.geoKeywordCount,
                row.urlCoverage.mappedCount,
                row.urlCoverage.missingPageCount,
                row.urlCoverage.overlapWarningCount,
              ]
                .map(esc)
                .join(','),
            );
          }
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="rovix-geographic-report-${bundle.projectId}.csv"`,
          );
          res.send(rows.join('\n'));
          return;
        }
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-geographic-report-${bundle.projectId}.json"`,
        );
        res.json(bundle);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // PHASE 9: COMPETITOR & CONTENT GAP INTELLIGENCE APIs (PRD MODULE 06)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/competitors/workspace',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workspace = getCompetitorWorkspace(
          req.session!.tenant.id,
          req.params.projectId,
        );
        res.json(workspace);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/competitors',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const competitor = upsertCompetitorWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          domainOrUrl: String(req.body?.domainOrUrl ?? ''),
          name:
            typeof req.body?.name === 'string' ? req.body.name : undefined,
          category:
            typeof req.body?.category === 'string'
              ? (req.body.category as CompetitorCategory)
              : undefined,
          targetMarkets: Array.isArray(req.body?.targetMarkets)
            ? req.body.targetMarkets.map((s: unknown) => String(s ?? ''))
            : undefined,
          discoveryOrigin:
            typeof req.body?.discoveryOrigin === 'string'
              ? (req.body.discoveryOrigin as 'manual' | 'keyword_profile' | 'serp_provider' | 'crawl_reference')
              : 'manual',
          discoveryEvidence:
            typeof req.body?.discoveryEvidence === 'string'
              ? req.body.discoveryEvidence
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
          approve: Boolean(req.body?.approve),
        });
        res.status(201).json({ competitor });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/competitors/:competitorId/decision',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const action =
          req.body?.action === 'reject'
            ? 'reject'
            : req.body?.action === 'archive'
              ? 'archive'
              : 'approve';
        const competitor = decideCompetitorApprovalWorkflow({
          tenantId: req.session!.tenant.id,
          competitorId: req.params.competitorId,
          user: req.session!.user,
          action,
          reason:
            typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json({ competitor });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/competitors/:competitorId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        deleteCompetitorWorkflow({
          tenantId: req.session!.tenant.id,
          competitorId: req.params.competitorId,
          user: req.session!.user,
        });
        res.json({ deleted: true });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/competitors/:competitorId/analyze',
    requireAuth,
    crawlRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await runCompetitorAnalysisWorkflow({
          tenantId: req.session!.tenant.id,
          competitorId: req.params.competitorId,
          user: req.session!.user,
          urlsToAnalyze: Array.isArray(req.body?.urlsToAnalyze)
            ? req.body.urlsToAnalyze.map((u: unknown) => String(u ?? ''))
            : undefined,
          discoverInternalPages: req.body?.discoverInternalPages !== false,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/competitors/discover',
    requireAuth,
    syncRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await discoverCompetitorsWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          queries: Array.isArray(req.body?.queries)
            ? req.body.queries.map((q: unknown) => String(q ?? ''))
            : undefined,
          countryCode:
            typeof req.body?.countryCode === 'string'
              ? req.body.countryCode
              : undefined,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/content-gaps/:gapId/decision',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const rawAction = String(req.body?.action ?? '');
        const validActions = [
          'recommend',
          'approve',
          'reject',
          'send_to_keywords',
          'create_task',
        ] as const;
        if (!validActions.includes(rawAction as (typeof validActions)[number])) {
          res.status(400).json({ error: 'Invalid content gap action.' });
          return;
        }
        const gap = decideContentGapWorkflow({
          tenantId: req.session!.tenant.id,
          gapId: req.params.gapId,
          user: req.session!.user,
          action: rawAction as (typeof validActions)[number],
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ gap });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/competitors/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const bundle = exportCompetitorReportBundle(
          req.session!.tenant.id,
          req.params.projectId,
        );
        if (req.query.format === 'csv') {
          const esc = (v: unknown) => {
            const s = String(v ?? '');
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const rows: string[] = [
            [
              'Entity Type',
              'Name',
              'Domain',
              'Approval Status',
              'Analyzed Pages',
              'Avg Word Count',
              'Avg Response Time (ms)',
              'Topics Observed',
              'Shared Keywords',
              'Gap Opportunities',
              'External Domain Authority',
              'External Monthly Traffic',
              'External Backlinks',
              'Data Availability Note',
            ].join(','),
          ];
          for (const row of bundle.comparisonRows) {
            rows.push(
              [
                row.entityType,
                row.name,
                row.domain,
                row.approvalStatus,
                row.analyzedPagesCount,
                row.avgWordCount ?? 'Unavailable',
                row.avgResponseTimeMs ?? 'Unavailable',
                row.topicKeywordsCount,
                row.sharedKeywordsCount,
                row.gapOpportunitiesCount,
                row.externalDomainAuthority ?? 'Unavailable',
                row.externalMonthlyTraffic ?? 'Unavailable',
                row.externalBacklinksCount ?? 'Unavailable',
                row.dataAvailabilityNote,
              ]
                .map(esc)
                .join(','),
            );
          }
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="rovix-competitor-report-${bundle.projectId}.csv"`,
          );
          res.send(rows.join('\n'));
          return;
        }
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="rovix-competitor-report-${bundle.projectId}.json"`,
        );
        res.json(bundle);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // REAL-TIME RECENT ACTIVITY FEED & GLOBAL COMMAND SEARCH APIs
  // =========================================================================

  app.get('/api/activity/recent', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const projectId =
        typeof req.query.projectId === 'string' && req.query.projectId.trim()
          ? req.query.projectId.trim()
          : undefined;
      const limit = Math.min(60, Math.max(5, Number(req.query.limit ?? 30)));
      const feed = buildUnifiedRecentActivityFeed({
        tenantId: req.session!.tenant.id,
        projectId,
        limit,
      });
      res.json(feed);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.get('/api/activity/stream', requireAuth, (req: AuthenticatedRequest, res) => {
    const tenantId = req.session!.tenant.id;
    const projectId =
      typeof req.query.projectId === 'string' && req.query.projectId.trim()
        ? req.query.projectId.trim()
        : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSnapshot = (eventName: 'activity_snapshot' | 'activity_update') => {
      const feed = buildUnifiedRecentActivityFeed({
        tenantId,
        projectId,
        limit: 30,
      });
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(feed)}\n\n`);
    };

    sendSnapshot('activity_snapshot');

    const unsubscribe = subscribeToTenantActivityUpdates(tenantId, (signal) => {
      if (projectId && signal.projectId && signal.projectId !== projectId) {
        return;
      }
      sendSnapshot('activity_update');
    });

    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(keepAlive);
    });
  });

  // =========================================================================
  // ROVIX AI — 3D AGENT FACTORY TELEMETRY & REAL-TIME EVENT STREAM (STAGE 1)
  // =========================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/snapshot',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const snapshot = buildAgentFactorySnapshot({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
        });
        res.json(snapshot);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/stream',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const tenantId = req.session!.tenant.id;
      const projectId = req.params.projectId;

      const project = getProjectById(tenantId, projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or not authorized for this tenant.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sentIds = new Set<string>();
      const writeEventFrame = (
        eventName: 'agent_snapshot' | 'agent_event',
        payload: unknown,
        id?: string,
      ) => {
        if (res.writableEnded || res.destroyed) return;
        if (id) {
          if (sentIds.has(id)) return;
          sentIds.add(id);
          if (sentIds.size > 400) {
            const first = sentIds.values().next().value;
            if (first) sentIds.delete(first);
          }
          res.write(`id: ${id}\n`);
        }
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const snapshot = buildAgentFactorySnapshot({ tenantId, projectId });
      writeEventFrame('agent_snapshot', snapshot);

      const lastEventIdHeader =
        typeof req.headers['last-event-id'] === 'string'
          ? req.headers['last-event-id'].trim()
          : typeof req.query.lastEventId === 'string'
            ? req.query.lastEventId.trim()
            : '';

      if (lastEventIdHeader) {
        const missed = listMissedAgentFactoryEvents({
          tenantId,
          projectId,
          lastEventId: lastEventIdHeader,
        });
        for (const ev of missed) {
          writeEventFrame('agent_event', ev, ev.id);
        }
      }

      const unsubscribeAgent = subscribeToAgentFactoryEvents(tenantId, (event) => {
        if (event.projectId && event.projectId !== projectId) return;
        writeEventFrame('agent_event', event, event.id);
      });

      const keepAlive = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(': keepalive\n\n');
        }
      }, 15000);

      const cleanup = () => {
        unsubscribeAgent();
        clearInterval(keepAlive);
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
    },
  );

  // =========================================================================
  // ROVIX AI — STAGE 2 MULTI-AGENT EXECUTION ENGINE & ORCHESTRATION ROUTES
  // =========================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/overview',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const overview = getAgentOrchestrationOverview(
          req.session!.tenant.id,
          req.params.projectId,
        );
        res.json(overview);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/validate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = validateWorkflowDagRequest({
          templateId: req.body?.templateId,
          nodes: req.body?.nodes,
          edges: req.body?.edges,
          options: req.body?.blueprintOptions,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows',
    requireAuth,
    crawlRateLimiter,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = createAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          templateId: req.body?.templateId ?? 'seo_content_pipeline',
          name: req.body?.name,
          objective: req.body?.objective,
          nodes: req.body?.nodes,
          edges: req.body?.edges,
          config: req.body?.config,
          blueprintOptions: req.body?.blueprintOptions,
          autoStart: req.body?.autoStart,
        });
        res.status(201).json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = getAgentWorkflowDetailScoped(
          req.session!.tenant.id,
          req.params.projectId,
          req.params.workflowId,
        );
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId/start',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = startAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
        });
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId/cancel',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = cancelAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
          reason: req.body?.reason,
        });
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/tasks/:taskId/retry',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = retryWorkflowTask({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          taskId: req.params.taskId,
          user: req.session!.user,
        });
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/approvals/:approvalId/decide',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const decision = String(req.body?.decision ?? '');
        if (
          decision !== 'approved' &&
          decision !== 'rejected' &&
          decision !== 'revision_requested'
        ) {
          res.status(400).json({
            error: 'Decision must be approved, rejected, or revision_requested.',
          });
          return;
        }
        const result = decideWorkflowApproval({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          approvalId: req.params.approvalId,
          decision,
          comments: req.body?.comments,
          user: req.session!.user,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/projects/:projectId/agent-factory/configs/:agentId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const stationId = normalizeSpecialistAgentId(req.params.agentId);
        if (!stationId) {
          res.status(400).json({ error: 'Unknown specialist agentId.' });
          return;
        }
        const cfg = updateAgentStationConfig({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          agentId: stationId,
          enabled: req.body?.enabled !== false,
          maxRetries: Number(req.body?.maxRetries ?? 2),
          timeoutMs: Number(req.body?.timeoutMs ?? 60_000),
          preferredModel: String(req.body?.preferredModel ?? 'gemini-4-hydrogen'),
          user: req.session!.user,
        });
        res.json(cfg);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // ============================================================================
  // AGENT FACTORY STAGE 3 — COLLABORATION, MESSAGING, DELEGATION & CONFLICTS
  // ============================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/collaboration',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const payload = buildCollaborationMonitorPayload({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId:
            typeof req.query.workflowId === 'string' && req.query.workflowId.trim()
              ? req.query.workflowId.trim()
              : null,
          agentId:
            typeof req.query.agentId === 'string' && req.query.agentId.trim()
              ? req.query.agentId.trim()
              : null,
          messageType:
            typeof req.query.messageType === 'string' && req.query.messageType.trim()
              ? req.query.messageType.trim()
              : null,
          status:
            typeof req.query.status === 'string' && req.query.status.trim()
              ? req.query.status.trim()
              : null,
          search:
            typeof req.query.search === 'string' && req.query.search.trim()
              ? req.query.search.trim()
              : null,
        });
        res.json(payload);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId/messages',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const userRole = req.session!.user.role;
        if (userRole === 'QA') {
          res.status(403).json({
            error: `Role "${userRole}" has read-only collaboration access and cannot dispatch agent messages.`,
          });
          return;
        }
        const msg = sendAgentMessage({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          executionId: String(req.body?.executionId ?? `manual-${Date.now()}`),
          sourceAgentId: req.body?.sourceAgentId,
          destinationAgentId: req.body?.destinationAgentId,
          messageType: req.body?.messageType,
          payload:
            req.body?.payload && typeof req.body.payload === 'object'
              ? req.body.payload
              : {},
          evidenceReferences: Array.isArray(req.body?.evidenceReferences)
            ? req.body.evidenceReferences
            : [],
          correlationId: req.body?.correlationId,
          replyToMessageId: req.body?.replyToMessageId ?? null,
        });
        res.status(201).json(msg);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId/delegate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const userRole = req.session!.user.role;
        if (userRole === 'QA') {
          res.status(403).json({
            error: `Role "${userRole}" does not have permission to delegate agent tasks.`,
          });
          return;
        }
        const targetStation = normalizeSpecialistAgentId(
          String(req.body?.targetAgentId ?? ''),
        );
        if (!targetStation) {
          res.status(400).json({ error: 'Valid specialist targetAgentId is required.' });
          return;
        }
        const result = requestIntelligentDelegation({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          parentTaskId: String(req.body?.parentTaskId ?? ''),
          sourceAgentId: req.body?.sourceAgentId,
          targetAgentId: targetStation,
          reason: String(req.body?.reason ?? 'Requested specialist verification'),
          requestedObjective: String(
            req.body?.requestedObjective ?? 'Verify upstream evidence',
          ),
          evidenceReferences: Array.isArray(req.body?.evidenceReferences)
            ? req.body.evidenceReferences
            : [],
          downstreamNodeKeys: Array.isArray(req.body?.downstreamNodeKeys)
            ? req.body.downstreamNodeKeys
            : [],
          onScheduleWorkflow: (tid, wid) => {
            queueMicrotask(() => scheduleWorkflowExecution(tid, wid));
          },
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/conflicts/:conflictId/resolve',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const selectedResolution = String(req.body?.selectedResolution ?? '');
        if (
          selectedResolution !== 'keep_a' &&
          selectedResolution !== 'keep_b' &&
          selectedResolution !== 'custom'
        ) {
          res.status(400).json({
            error: 'selectedResolution must be keep_a, keep_b, or custom.',
          });
          return;
        }
        const resolved = resolveWorkflowConflict({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          conflictId: req.params.conflictId,
          selectedResolution,
          resolutionNote: String(req.body?.resolutionNote ?? ''),
          dismiss: Boolean(req.body?.dismiss),
          user: req.session!.user,
        });
        res.json(resolved);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/workflows/:workflowId/validate-graph',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = getAgentWorkflowDetailScoped(
          req.session!.tenant.id,
          req.params.projectId,
          req.params.workflowId,
        );
        const nodesInput = Array.isArray(req.body?.nodes)
          ? req.body.nodes
          : detail.nodes.map((n) => ({
              id: n.nodeKey,
              agentId: n.agentId,
              title: n.title,
              prerequisites: detail.edges
                .filter((e) => e.toNodeKey === n.nodeKey)
                .map((e) => e.fromNodeKey),
            }));
        const report = validateWorkflowGraphDetailed(nodesInput);
        res.json(report);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // ============================================================================
  // AGENT FACTORY STAGE 4 — VISUAL WORKFLOW BUILDER & AUTOMATION STUDIO
  // ============================================================================

  app.get(
    '/api/projects/:projectId/workflow-studio/workflows',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const includeArchived = req.query.includeArchived === 'true';
        const data = listStudioWorkflowsAndTemplates({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          includeArchived,
        });
        res.json(data);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const created = createStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          name: String(req.body?.name ?? ''),
          description: typeof req.body?.description === 'string' ? req.body.description : '',
          graph: req.body?.graph,
          templateId: typeof req.body?.templateId === 'string' ? req.body.templateId : null,
        });
        res.status(201).json(created);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = getStudioWorkflowDetail({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
        });
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.put(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const updated = updateStudioWorkflowDraft({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          user: req.session!.user,
          name: typeof req.body?.name === 'string' ? req.body.name : undefined,
          description: typeof req.body?.description === 'string' ? req.body.description : undefined,
          graph: req.body?.graph,
          createSnapshot: Boolean(req.body?.createSnapshot),
          changeSummary:
            typeof req.body?.changeSummary === 'string' ? req.body.changeSummary : undefined,
        });
        res.json(updated);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/validate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const report = validateStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId:
            typeof req.body?.studioWorkflowId === 'string' ? req.body.studioWorkflowId : null,
          graph: req.body?.graph ?? { nodes: [], edges: [] },
          user: req.session!.user,
        });
        res.json(report);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId/publish',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const published = publishStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          user: req.session!.user,
          graph: req.body?.graph,
          changeSummary:
            typeof req.body?.changeSummary === 'string' ? req.body.changeSummary : undefined,
        });
        res.json(published);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId/archive',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const archived = archiveStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          user: req.session!.user,
        });
        res.json(archived);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId/duplicate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const dup = duplicateStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          user: req.session!.user,
          newName: typeof req.body?.name === 'string' ? req.body.name : undefined,
        });
        res.status(201).json(dup);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId/versions/:versionId/restore',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const restored = restoreStudioWorkflowVersion({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          versionId: req.params.versionId,
          user: req.session!.user,
        });
        res.json(restored);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/workflows/:studioWorkflowId/execute',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const started = executeStudioWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          studioWorkflowId: req.params.studioWorkflowId,
          user: req.session!.user,
          graphOverride: req.body?.graph,
          objective: typeof req.body?.objective === 'string' ? req.body.objective : undefined,
        });
        res.status(201).json(started);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/executions/:workflowId/cancel',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const cancelled = cancelStudioWorkflowExecution({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json(cancelled);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/workflow-studio/executions/:workflowId/nodes/:nodeId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const nodeDetail = getStudioExecutionNodeDetail({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          nodeId: req.params.nodeId,
        });
        res.json(nodeDetail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/workflow-studio/templates',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const data = listStudioWorkflowsAndTemplates({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
        });
        res.json({ templates: data.templates, providerAvailability: data.providerAvailability });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/workflow-studio/templates',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const tpl = saveStudioTemplate({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          name: String(req.body?.name ?? ''),
          category: typeof req.body?.category === 'string' ? req.body.category : 'Custom',
          description: typeof req.body?.description === 'string' ? req.body.description : '',
          graph: req.body?.graph ?? { nodes: [], edges: [] },
        });
        res.status(201).json(tpl);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // ============================================================================
  // AGENT FACTORY STAGE 5 — TOKEN CONSUMPTION, API COST & PERFORMANCE INTELLIGENCE
  // ============================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/usage/dashboard',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const from =
          typeof req.query.from === 'string' && req.query.from.trim()
            ? req.query.from.trim()
            : null;
        const to =
          typeof req.query.to === 'string' && req.query.to.trim()
            ? req.query.to.trim()
            : null;
        const dashboard = buildUsageAnalyticsDashboard({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          userRole: req.session!.user.role,
          from,
          to,
        });
        res.json(dashboard);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/usage/workflows/:workflowId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const detail = getWorkflowCostDetail(
          req.session!.tenant.id,
          req.params.projectId,
          req.params.workflowId,
        );
        res.json(detail);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/usage/workflows/:workflowId/reconcile',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const rec = reconcileAndPersistWorkflowUsage(
          req.session!.tenant.id,
          req.params.projectId,
          req.params.workflowId,
        );
        if (!rec) {
          res.status(404).json({ error: 'Workflow not found.' });
          return;
        }
        res.json(rec);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/usage/ledger',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const strParam = (v: unknown) =>
          typeof v === 'string' && v.trim() ? v.trim() : null;
        const rows = listUsageLedgerForProject(
          req.session!.tenant.id,
          req.params.projectId,
          {
            agentId: strParam(req.query.agentId),
            workflowId: strParam(req.query.workflowId),
            provider: strParam(req.query.provider),
            model: strParam(req.query.model),
            status: strParam(req.query.status),
            costBasis: strParam(req.query.costBasis),
            from: strParam(req.query.from),
            to: strParam(req.query.to),
            limit: req.query.limit ? Number(req.query.limit) : 500,
          },
        );
        res.json({ rows, totalCount: rows.length });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/usage/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const format = req.query.format === 'json' ? 'json' : 'csv';
        const strParam = (v: unknown) =>
          typeof v === 'string' && v.trim() ? v.trim() : null;
        const exported = exportProjectUsageLedger({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          format,
          filters: {
            agentId: strParam(req.query.agentId),
            workflowId: strParam(req.query.workflowId),
            provider: strParam(req.query.provider),
            model: strParam(req.query.model),
            status: strParam(req.query.status),
            costBasis: strParam(req.query.costBasis),
            from: strParam(req.query.from),
            to: strParam(req.query.to),
          },
        });
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.send(exported.content);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/usage/pricing',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const parseNullableNum = (v: unknown): number | null => {
          if (v === null || v === undefined || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const created = createWorkspacePricingVersion({
          tenantId: req.session!.tenant.id,
          user: req.session!.user,
          provider: String(body.provider ?? ''),
          model: String(body.model ?? ''),
          inputPricePer1mMicros: parseNullableNum(body.inputPricePer1mMicros),
          outputPricePer1mMicros: parseNullableNum(body.outputPricePer1mMicros),
          cachedInputPricePer1mMicros: parseNullableNum(body.cachedInputPricePer1mMicros),
          currency: typeof body.currency === 'string' ? body.currency : 'USD',
          effectiveDate:
            typeof body.effectiveDate === 'string' ? body.effectiveDate : undefined,
          sourceOfPricing: String(body.sourceOfPricing ?? ''),
          sourceType:
            body.sourceType === 'official_provider_pricing' ||
            body.sourceType === 'workspace_configured' ||
            body.sourceType === 'internal_non_billed' ||
            body.sourceType === 'unconfigured'
              ? body.sourceType
              : 'workspace_configured',
          pricingVersion:
            typeof body.pricingVersion === 'string' ? body.pricingVersion : undefined,
          auditNote: typeof body.auditNote === 'string' ? body.auditNote : null,
        });
        res.status(201).json(created);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/usage/budgets',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const parseNullableNum = (v: unknown): number | null => {
          if (v === null || v === undefined || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const stationAgentId =
          typeof body.agentId === 'string' && body.agentId.trim()
            ? normalizeSpecialistAgentId(body.agentId)
            : null;
        const saved = upsertWorkspaceUsageBudget({
          id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null,
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          scopeType:
            body.scopeType === 'tenant' ||
            body.scopeType === 'project' ||
            body.scopeType === 'workflow' ||
            body.scopeType === 'agent'
              ? body.scopeType
              : 'project',
          scopeTargetId:
            typeof body.scopeTargetId === 'string' ? body.scopeTargetId : null,
          agentId: stationAgentId,
          name: String(body.name ?? ''),
          periodType:
            body.periodType === 'daily' ||
            body.periodType === 'weekly' ||
            body.periodType === 'monthly' ||
            body.periodType === 'per_workflow' ||
            body.periodType === 'per_agent'
              ? body.periodType
              : 'monthly',
          budgetLimitMicros: parseNullableNum(body.budgetLimitMicros),
          maxExecutionCostMicros: parseNullableNum(body.maxExecutionCostMicros),
          maxTokensPerRun: parseNullableNum(body.maxTokensPerRun),
          warningThresholdPct: Number(body.warningThresholdPct ?? 80),
          enforcementPolicy:
            body.enforcementPolicy === 'pause_execution' ||
            body.enforcementPolicy === 'require_approval' ||
            body.enforcementPolicy === 'warn_only'
              ? body.enforcementPolicy
              : 'warn_only',
          enabled: body.enabled !== false,
        });
        res.status(201).json(saved);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/projects/:projectId/agent-factory/usage/budgets/:budgetId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const deleted = removeWorkspaceUsageBudget({
          tenantId: req.session!.tenant.id,
          budgetId: req.params.budgetId,
          user: req.session!.user,
        });
        if (!deleted) {
          res.status(404).json({ error: 'Budget configuration not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/usage/alerts/:alertId/acknowledge',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const updated = acknowledgeWorkspaceBudgetAlert({
          tenantId: req.session!.tenant.id,
          alertId: req.params.alertId,
          user: req.session!.user,
        });
        res.json(updated);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // PRICING REGISTRY SERVICE LAYER & TIERED COST ESTIMATOR
  // =========================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/pricing-registry',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const activeOnly = req.query.activeOnly === 'true';
        const provider =
          typeof req.query.provider === 'string' && req.query.provider.trim()
            ? req.query.provider.trim()
            : undefined;
        const entries = listWorkspacePricingRegistry(req.session!.tenant.id, {
          activeOnly,
          provider,
        });
        res.json({ entries });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/pricing-registry',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const entry = publishPricingVersion({
          tenantId: req.session!.tenant.id,
          user: req.session!.user,
          provider: String(body.provider ?? ''),
          model: String(body.model ?? ''),
          inputPricePer1mUsd:
            body.inputPricePer1mUsd !== undefined ? Number(body.inputPricePer1mUsd) : undefined,
          outputPricePer1mUsd:
            body.outputPricePer1mUsd !== undefined ? Number(body.outputPricePer1mUsd) : undefined,
          cachedInputPricePer1mUsd:
            body.cachedInputPricePer1mUsd !== undefined && body.cachedInputPricePer1mUsd !== null
              ? Number(body.cachedInputPricePer1mUsd)
              : undefined,
          inputPricePer1mMicros:
            body.inputPricePer1mMicros !== undefined ? Number(body.inputPricePer1mMicros) : undefined,
          outputPricePer1mMicros:
            body.outputPricePer1mMicros !== undefined ? Number(body.outputPricePer1mMicros) : undefined,
          cachedInputPricePer1mMicros:
            body.cachedInputPricePer1mMicros !== undefined
              ? Number(body.cachedInputPricePer1mMicros)
              : undefined,
          currency: typeof body.currency === 'string' ? body.currency : 'USD',
          effectiveDate:
            typeof body.effectiveDate === 'string' ? body.effectiveDate : undefined,
          sourceOfPricing: String(body.sourceOfPricing ?? ''),
          auditNote: typeof body.auditNote === 'string' ? body.auditNote : null,
        });
        res.status(201).json(entry);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/pricing-registry/calculate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const calc = calculateTokenCostWithRegistry({
          tenantId: req.session!.tenant.id,
          provider: String(body.provider ?? 'google_gemini'),
          model: typeof body.model === 'string' ? body.model : null,
          inputTokens:
            body.inputTokens !== undefined && body.inputTokens !== null
              ? Number(body.inputTokens)
              : null,
          outputTokens:
            body.outputTokens !== undefined && body.outputTokens !== null
              ? Number(body.outputTokens)
              : null,
          cachedInputTokens:
            body.cachedInputTokens !== undefined && body.cachedInputTokens !== null
              ? Number(body.cachedInputTokens)
              : null,
        });
        res.json(calc);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // STAGE 6: AUTONOMOUS OPERATIONS, SCHEDULING & SELF-HEALING RUNTIME ROUTES
  // =========================================================================

  app.get(
    '/api/projects/:projectId/agent-factory/operations',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const payload = buildOperationsControlCenterPayload({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          userRole: req.session!.user.role,
        });
        res.json(payload);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/agent-factory/operations/health',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const health = buildRuntimeHealthSummary(
          req.session!.tenant.id,
          req.params.projectId,
        );
        res.json(health);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/schedules',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const schedule = createProjectSchedule({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          payload: {
            name: String(body.name ?? ''),
            description: typeof body.description === 'string' ? body.description : '',
            targetKind: (body.targetKind === 'studio_workflow'
              ? 'studio_workflow'
              : 'workflow_template') as ScheduleTargetKind,
            templateId: typeof body.templateId === 'string' ? (body.templateId as any) : null,
            studioWorkflowId:
              typeof body.studioWorkflowId === 'string' ? body.studioWorkflowId : null,
            workflowObjective:
              typeof body.workflowObjective === 'string' ? body.workflowObjective : '',
            frequency: String(body.frequency ?? 'daily') as ScheduleFrequency,
            minuteOfHour:
              body.minuteOfHour !== undefined ? Number(body.minuteOfHour) : 0,
            hourOfDay:
              body.hourOfDay !== undefined && body.hourOfDay !== null
                ? Number(body.hourOfDay)
                : null,
            daysOfWeek: Array.isArray(body.daysOfWeek)
              ? body.daysOfWeek.map((d: unknown) => Number(d))
              : [],
            dayOfMonth:
              body.dayOfMonth !== undefined && body.dayOfMonth !== null
                ? Number(body.dayOfMonth)
                : null,
            runAtIso: typeof body.runAtIso === 'string' ? body.runAtIso : null,
            timezone: typeof body.timezone === 'string' ? body.timezone : 'UTC',
            executionWindow:
              body.executionWindow && typeof body.executionWindow === 'object'
                ? {
                    startHour: Number(body.executionWindow.startHour ?? 0),
                    endHour: Number(body.executionWindow.endHour ?? 23),
                    allowedDaysOfWeek: Array.isArray(body.executionWindow.allowedDaysOfWeek)
                      ? body.executionWindow.allowedDaysOfWeek.map((d: unknown) => Number(d))
                      : undefined,
                  }
                : null,
            catchUpPolicy: String(body.catchUpPolicy ?? 'skip') as ScheduleCatchUpPolicy,
            maxCatchUpRuns:
              body.maxCatchUpRuns !== undefined ? Number(body.maxCatchUpRuns) : 3,
            status: body.status === 'paused' ? 'paused' : 'active',
          },
        });
        res.status(201).json({ schedule });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.put(
    '/api/projects/:projectId/agent-factory/operations/schedules/:scheduleId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const schedule = updateProjectSchedule({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          scheduleId: req.params.scheduleId,
          user: req.session!.user,
          payload: body,
        });
        res.json({ schedule });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/schedules/:scheduleId/:action',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const action = req.params.action;
        if (action !== 'pause' && action !== 'resume') {
          res.status(400).json({ error: 'Action must be "pause" or "resume".' });
          return;
        }
        const schedule = toggleProjectScheduleStatus({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          scheduleId: req.params.scheduleId,
          action,
          user: req.session!.user,
        });
        res.json({ schedule });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/projects/:projectId/agent-factory/operations/schedules/:scheduleId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const deleted = deleteProjectSchedule({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          scheduleId: req.params.scheduleId,
          user: req.session!.user,
        });
        if (!deleted) {
          res.status(404).json({ error: 'Schedule not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/triggers',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const created = createTriggerSubscription({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          name: String(body.name ?? ''),
          description: typeof body.description === 'string' ? body.description : '',
          triggerType: String(body.triggerType ?? 'crawl_completed') as AutomationTriggerType,
          targetKind: (body.targetKind === 'studio_workflow'
            ? 'studio_workflow'
            : 'workflow_template') as ScheduleTargetKind,
          templateId: typeof body.templateId === 'string' ? (body.templateId as any) : null,
          studioWorkflowId:
            typeof body.studioWorkflowId === 'string' ? body.studioWorkflowId : null,
          workflowObjective:
            typeof body.workflowObjective === 'string' ? body.workflowObjective : '',
          enabled: body.enabled !== false,
          filterConfig:
            body.filterConfig && typeof body.filterConfig === 'object' ? body.filterConfig : {},
          rateLimitPerMinute:
            body.rateLimitPerMinute !== undefined ? Number(body.rateLimitPerMinute) : 30,
        });
        res.status(201).json(created);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/triggers/:subscriptionId/toggle',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const subscription = toggleTriggerSubscription({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          subscriptionId: req.params.subscriptionId,
          enabled: Boolean(req.body?.enabled),
          user: req.session!.user,
        });
        res.json({ subscription });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/projects/:projectId/agent-factory/operations/triggers/:subscriptionId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const deleted = deleteTriggerSubscription({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          subscriptionId: req.params.subscriptionId,
          user: req.session!.user,
        });
        if (!deleted) {
          res.status(404).json({ error: 'Trigger subscription not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/triggers/dispatch-test',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const events = dispatchDomainTriggerEvent({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          triggerType: String(body.triggerType ?? 'crawl_completed') as any,
          idempotencyKey:
            typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
              ? body.idempotencyKey.trim()
              : `manual:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`,
          sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef : req.session!.user.id,
          payloadSummary:
            typeof body.payloadSummary === 'string' && body.payloadSummary.trim()
              ? body.payloadSummary.trim()
              : `Domain event triggered by ${req.session!.user.name}`,
          payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        });
        res.json({ events });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/workflows/:workflowId/pause',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workflow = pauseAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json({ workflow });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/workflows/:workflowId/resume',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workflow = resumeAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json({ workflow });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/workflows/:workflowId/replay',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workflow = replayAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          workflowId: req.params.workflowId,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
          autoStart: req.body?.autoStart !== false,
        });
        res.status(201).json({ workflow });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/dead-letters/:dlqId/replay',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const mode =
          req.body?.mode === 'replay_workflow' ? 'replay_workflow' : 'retry_task';
        const result = retryDeadLetterTask({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          deadLetterId: req.params.dlqId,
          mode,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/dead-letters/:dlqId/resolve',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const deadLetter = resolveDeadLetterTask({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          deadLetterId: req.params.dlqId,
          user: req.session!.user,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        });
        res.json({ deadLetter });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.put(
    '/api/projects/:projectId/agent-factory/operations/policy',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body ?? {};
        const parseNullableInt = (v: unknown): number | null => {
          if (v === null || v === undefined || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
        };
        const policy = updateProjectAutonomyPolicy({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          payload: {
            name: typeof body.name === 'string' ? body.name : undefined,
            autonomyMode: (body.autonomyMode === 'approval_required' ||
            body.autonomyMode === 'restricted'
              ? body.autonomyMode
              : 'automatic_low_risk') as AutonomyMode,
            maxConcurrentWorkflows: Number(body.maxConcurrentWorkflows ?? 3),
            maxActiveAgentTasks: Number(body.maxActiveAgentTasks ?? 6),
            maxWorkflowDurationMs: Number(body.maxWorkflowDurationMs ?? 900_000),
            maxTokensPerWorkflow: parseNullableInt(body.maxTokensPerWorkflow),
            maxSpendMicrosPerRun: parseNullableInt(body.maxSpendMicrosPerRun),
            allowedTemplates: Array.isArray(body.allowedTemplates)
              ? body.allowedTemplates.map((t: unknown) => String(t) as any)
              : [],
            allowedAgents: Array.isArray(body.allowedAgents)
              ? body.allowedAgents.map((a: unknown) => String(a) as any)
              : [],
            requireApprovalForHighImpact: body.requireApprovalForHighImpact !== false,
            highImpactActionTypes: Array.isArray(body.highImpactActionTypes)
              ? body.highImpactActionTypes.map((x: unknown) => String(x))
              : undefined,
            allowAutonomousRetries: body.allowAutonomousRetries !== false,
            allowExternalWebhooks: body.allowExternalWebhooks !== false,
            enabled: body.enabled !== false,
          },
        });
        res.json({ policy });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/agent-factory/operations/maintenance/tick',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const role = req.session!.user.role;
        if (
          role !== 'Platform Admin' &&
          role !== 'Agency Owner' &&
          role !== 'Business Owner' &&
          role !== 'SEO Strategist'
        ) {
          res.status(403).json({ error: 'FORBIDDEN: Insufficient permissions.' });
          return;
        }
        const tickResult = runSchedulerTickNow();
        const recovery = reclaimStaleLeasesAndRecover({
          actor: `${req.session!.user.name} (${req.session!.user.role})`,
        });
        res.json({ tickResult, recovery });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get('/api/search/global', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const projectId =
        typeof req.query.projectId === 'string' && req.query.projectId.trim()
          ? req.query.projectId.trim()
          : undefined;
      const results = searchTenantEntities({
        tenantId: req.session!.tenant.id,
        projectId,
        query: q,
        limit: 12,
      });
      res.json(results);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // =========================================================================
  // MODULE 7: SEO STRATEGY & WEBSITE ARCHITECTURE INTELLIGENCE ENGINE APIs
  // =========================================================================

  app.get(
    '/api/projects/:projectId/strategy',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const versionId =
          typeof req.query.versionId === 'string' && req.query.versionId.trim()
            ? req.query.versionId.trim()
            : null;
        const workspace = getStrategyWorkspace({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          versionId,
        });
        res.json(workspace);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/generate',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = generateStrategyVersion({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          title:
            typeof req.body?.title === 'string' ? req.body.title : undefined,
          sourceWorkflowId:
            typeof req.body?.sourceWorkflowId === 'string'
              ? req.body.sourceWorkflowId
              : null,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/pages',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const page = createArchitecturePage({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          strategyVersionId: String(req.body?.strategyVersionId ?? ''),
          user: req.session!.user,
          parentPageId:
            req.body?.parentPageId === null || req.body?.parentPageId === ''
              ? null
              : typeof req.body?.parentPageId === 'string'
                ? req.body.parentPageId
                : null,
          title: String(req.body?.title ?? ''),
          slug: String(req.body?.slug ?? ''),
          pageType: String(
            req.body?.pageType ?? 'resource',
          ) as ArchitecturePageType,
          primaryKeyword:
            typeof req.body?.primaryKeyword === 'string'
              ? req.body.primaryKeyword
              : null,
          secondaryKeywords: Array.isArray(req.body?.secondaryKeywords)
            ? req.body.secondaryKeywords.map((k: unknown) => String(k ?? ''))
            : [],
          relatedKeywords: Array.isArray(req.body?.relatedKeywords)
            ? req.body.relatedKeywords.map((k: unknown) => String(k ?? ''))
            : [],
          searchIntent:
            typeof req.body?.searchIntent === 'string'
              ? (req.body.searchIntent as KeywordIntent)
              : 'Informational',
          clusterId:
            typeof req.body?.clusterId === 'string' ? req.body.clusterId : null,
          clusterName:
            typeof req.body?.clusterName === 'string'
              ? req.body.clusterName
              : null,
          targetGeography:
            typeof req.body?.targetGeography === 'string'
              ? req.body.targetGeography
              : null,
          existingUrl:
            typeof req.body?.existingUrl === 'string'
              ? req.body.existingUrl
              : null,
          pageStatus:
            typeof req.body?.pageStatus === 'string'
              ? (req.body.pageStatus as ArchitecturePageStatus)
              : 'proposed',
          rationale:
            typeof req.body?.rationale === 'string'
              ? req.body.rationale
              : undefined,
          notes:
            typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.status(201).json({ page });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.patch(
    '/api/projects/:projectId/strategy/pages/:pageId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const page = updateArchitecturePage({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageId: req.params.pageId,
          user: req.session!.user,
          patch: {
            title:
              typeof req.body?.title === 'string' ? req.body.title : undefined,
            slug:
              typeof req.body?.slug === 'string' ? req.body.slug : undefined,
            pageType:
              typeof req.body?.pageType === 'string'
                ? (req.body.pageType as ArchitecturePageType)
                : undefined,
            primaryKeyword:
              req.body?.primaryKeyword !== undefined
                ? req.body.primaryKeyword === null
                  ? null
                  : String(req.body.primaryKeyword)
                : undefined,
            secondaryKeywords: Array.isArray(req.body?.secondaryKeywords)
              ? req.body.secondaryKeywords.map((k: unknown) => String(k ?? ''))
              : undefined,
            relatedKeywords: Array.isArray(req.body?.relatedKeywords)
              ? req.body.relatedKeywords.map((k: unknown) => String(k ?? ''))
              : undefined,
            searchIntent:
              typeof req.body?.searchIntent === 'string'
                ? (req.body.searchIntent as KeywordIntent)
                : undefined,
            clusterId:
              req.body?.clusterId !== undefined
                ? req.body.clusterId === null
                  ? null
                  : String(req.body.clusterId)
                : undefined,
            clusterName:
              req.body?.clusterName !== undefined
                ? req.body.clusterName === null
                  ? null
                  : String(req.body.clusterName)
                : undefined,
            targetGeography:
              req.body?.targetGeography !== undefined
                ? req.body.targetGeography === null
                  ? null
                  : String(req.body.targetGeography)
                : undefined,
            existingUrl:
              req.body?.existingUrl !== undefined
                ? req.body.existingUrl === null
                  ? null
                  : String(req.body.existingUrl)
                : undefined,
            pageStatus:
              typeof req.body?.pageStatus === 'string'
                ? (req.body.pageStatus as ArchitecturePageStatus)
                : undefined,
            rationale:
              typeof req.body?.rationale === 'string'
                ? req.body.rationale
                : undefined,
            notes:
              typeof req.body?.notes === 'string' ? req.body.notes : undefined,
          },
        });
        res.json({ page });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/pages/:pageId/move',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const page = moveArchitecturePage({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageId: req.params.pageId,
          newParentPageId:
            req.body?.newParentPageId === null ||
            req.body?.newParentPageId === ''
              ? null
              : String(req.body?.newParentPageId ?? ''),
          newSortOrder:
            typeof req.body?.newSortOrder === 'number'
              ? req.body.newSortOrder
              : undefined,
          user: req.session!.user,
        });
        res.json({ page });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/pages/:pageId/archive',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const page = archiveArchitecturePage({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageId: req.params.pageId,
          reason:
            typeof req.body?.reason === 'string' ? req.body.reason : undefined,
          user: req.session!.user,
        });
        res.json({ page });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/approvals',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const approval = decideStrategyApproval({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          entityKind: String(req.body?.entityKind ?? '') as StrategyEntityKind,
          entityId: String(req.body?.entityId ?? ''),
          decision: String(
            req.body?.decision ?? '',
          ) as StrategyApprovalStatus,
          comment:
            typeof req.body?.comment === 'string'
              ? req.body.comment
              : undefined,
          user: req.session!.user,
        });
        res.status(201).json({ approval });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/roadmap/:itemId/create-task',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = createTaskFromRoadmapItem({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          roadmapItemId: req.params.itemId,
          assignedUser:
            typeof req.body?.assignedUser === 'string'
              ? req.body.assignedUser
              : null,
          user: req.session!.user,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/strategy/workflows/launch',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = launchStrategyAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          roadmapItemId:
            typeof req.body?.roadmapItemId === 'string'
              ? req.body.roadmapItemId
              : null,
          strategyVersionId:
            typeof req.body?.strategyVersionId === 'string'
              ? req.body.strategyVersionId
              : null,
          objective:
            typeof req.body?.objective === 'string'
              ? req.body.objective
              : undefined,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // =========================================================================
  // MODULE 8: ON-PAGE SEO OPTIMIZATION & PAGE INTELLIGENCE ENGINE
  // =========================================================================

  app.get(
    '/api/projects/:projectId/on-page',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workspace = getOnPageWorkspace(
          req.session!.tenant.id,
          req.params.projectId,
          req.session!.user,
        );
        res.json(workspace);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/analyze',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = runOnPageAnalysis({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          user: req.session!.user,
          crawlId:
            typeof req.body?.crawlId === 'string' ? req.body.crawlId : null,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/recommendations/ai',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const pageAnalysisIds = Array.isArray(req.body?.pageAnalysisIds)
          ? req.body.pageAnalysisIds.map(String)
          : typeof req.body?.pageAnalysisId === 'string'
            ? [req.body.pageAnalysisId]
            : [];
        const result = await generateAiRecommendationsForPages({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageAnalysisIds,
          confirmedBulk: req.body?.confirmedBulk === true,
          preferredModel:
            typeof req.body?.preferredModel === 'string'
              ? req.body.preferredModel
              : null,
          user: req.session!.user,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/drafts',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const draft = saveOptimizationDraft({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageAnalysisId: String(req.body?.pageAnalysisId ?? ''),
          proposed: (req.body?.proposed ?? {}) as OnPageDraftContentPayload,
          changeSummary: String(req.body?.changeSummary ?? ''),
          user: req.session!.user,
        });
        res.status(201).json({ draft });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/approvals',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const items = Array.isArray(req.body?.items)
          ? req.body.items.map((item: Record<string, unknown>) => ({
              entityKind: String(item.entityKind ?? '') as
                | 'recommendation'
                | 'draft'
                | 'issue',
              entityId: String(item.entityId ?? ''),
            }))
          : [];
        const result = decideOnPageApproval({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          items,
          decision: req.body?.decision === 'rejected' ? 'rejected' : 'approved',
          comment:
            typeof req.body?.comment === 'string' ? req.body.comment : '',
          user: req.session!.user,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/drafts/:draftId/applied-externally',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const draft = markDraftAppliedExternally({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          draftId: req.params.draftId,
          channel: String(req.body?.channel ?? 'manual_cms_update'),
          note: typeof req.body?.note === 'string' ? req.body.note : '',
          user: req.session!.user,
        });
        res.json({ draft });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/drafts/:draftId/verify',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = validateDraftAgainstLatestCrawl({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          draftId: req.params.draftId,
          crawlId:
            typeof req.body?.crawlId === 'string' ? req.body.crawlId : null,
          user: req.session!.user,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/on-page/drafts/:draftId/handoff',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const format = req.query.format === 'markdown' ? 'markdown' : 'json';
        const platformRaw = String(req.query.platform ?? 'manual');
        const platform = (
          platformRaw === 'wordpress' ||
          platformRaw === 'webflow' ||
          platformRaw === 'shopify'
            ? platformRaw
            : 'manual'
        ) as CmsPlatform | 'manual';
        const exported = exportDraftHandoff({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          draftId: req.params.draftId,
          platform,
          format,
        });
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.send(exported.content);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/issues/:issueId/create-task',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = createTaskFromOnPageIssue({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          issueId: req.params.issueId,
          assigneeName:
            typeof req.body?.assigneeName === 'string'
              ? req.body.assigneeName
              : undefined,
          user: req.session!.user,
        });
        res.status(201).json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.post(
    '/api/projects/:projectId/on-page/workflows/launch',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const workflow = launchOnPageAgentWorkflow({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          pageAnalysisId:
            typeof req.body?.pageAnalysisId === 'string'
              ? req.body.pageAnalysisId
              : null,
          objective:
            typeof req.body?.objective === 'string'
              ? req.body.objective
              : undefined,
          user: req.session!.user,
        });
        res.status(201).json({ workflow });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.put(
    '/api/projects/:projectId/on-page/cms/:platform',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const connection = await configureCmsConnection({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          platform: req.params.platform as CmsPlatform,
          siteUrl: String(req.body?.siteUrl ?? ''),
          displayName:
            typeof req.body?.displayName === 'string'
              ? req.body.displayName
              : undefined,
          credentials:
            req.body?.credentials && typeof req.body.credentials === 'object'
              ? (req.body.credentials as Record<string, string>)
              : {},
          user: req.session!.user,
        });
        res.json({ connection });
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.delete(
    '/api/projects/:projectId/on-page/cms/:platform',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const result = removeCmsConnection({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          platform: req.params.platform as CmsPlatform,
          user: req.session!.user,
        });
        res.json(result);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  app.get(
    '/api/projects/:projectId/on-page/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const format = req.query.format === 'json' ? 'json' : 'csv';
        const pageIdsRaw =
          typeof req.query.pageIds === 'string' ? req.query.pageIds : '';
        const pageIds = pageIdsRaw
          ? pageIdsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
        const exported = exportOnPageReport({
          tenantId: req.session!.tenant.id,
          projectId: req.params.projectId,
          format,
          pageIds,
        });
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.send(exported.content);
      } catch (err) {
        sendErrorResponse(res, err);
      }
    },
  );

  // Isolated Sandbox Fixture Toggles (explicitly disabled in production environments!)
  app.get('/api/sandbox/fixes', requireAuth, (_req, res) => {
    if (!isSandboxCrawlAllowed()) {
      res.status(403).json({
        error: 'Sandbox fixture controls are disabled in production.',
      });
      return;
    }
    res.json({ fixes: SANDBOX_FIX_STATE });
  });

  app.post('/api/sandbox/fixes', requireAuth, (req, res) => {
    if (!isSandboxCrawlAllowed()) {
      res.status(403).json({
        error: 'Sandbox fixture controls are disabled in production.',
      });
      return;
    }
    if (req.body?.reset === true) {
      resetSandboxFixes();
      res.json({ fixes: SANDBOX_FIX_STATE });
      return;
    }
    const keys: (keyof SandboxFixState)[] = [
      'fixNoindexPage',
      'fixCanonicalConflict',
      'fixBrokenLink',
      'fixMissingMetaDescription',
      'fixInvalidSchema',
      'fixRedirectChain',
      'simulatePartial500',
    ];
    for (const k of keys) {
      if (typeof req.body?.[k] === 'boolean') {
        SANDBOX_FIX_STATE[k] = req.body[k];
      }
    }
    res.json({ fixes: SANDBOX_FIX_STATE });
  });

  if (!IS_PROD) {
    let viteMiddleware:
      | ((req: Request, res: Response, next: NextFunction) => void)
      | null = null;
    let viteReadyPromise: Promise<void> | null = null;

    app.use((req, res, next) => {
      if (viteMiddleware) {
        viteMiddleware(req, res, next);
        return;
      }
      if (!viteReadyPromise) {
        next();
        return;
      }
      viteReadyPromise
        .then(() => {
          if (viteMiddleware) {
            viteMiddleware(req, res, next);
          } else {
            next();
          }
        })
        .catch(next);
    });

    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Rovix AI server listening on http://localhost:${PORT}`);
      startAutonomousOperationsRuntime();
    });

    const shutdownRuntime = () => {
      stopAutonomousOperationsRuntime();
    };
    process.once('SIGINT', shutdownRuntime);
    process.once('SIGTERM', shutdownRuntime);

    viteReadyPromise = (async () => {
      if (process.env.CONTROL_PLANE_PORT && process.env.DISABLE_HMR === undefined) {
        process.env.DISABLE_HMR = 'true';
      }
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr:
            process.env.DISABLE_HMR === 'true'
              ? false
              : { server: httpServer },
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })();
    await viteReadyPromise;
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Rovix AI server listening on http://localhost:${PORT}`);
      startAutonomousOperationsRuntime();
    });

    const shutdownRuntime = () => {
      stopAutonomousOperationsRuntime();
    };
    process.once('SIGINT', shutdownRuntime);
    process.once('SIGTERM', shutdownRuntime);
  }
}

startServer().catch((err) => {
  console.error('Failed to start Rovix AI server:', err);
  process.exit(1);
});
