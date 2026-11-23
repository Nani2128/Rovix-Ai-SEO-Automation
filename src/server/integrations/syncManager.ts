import type { IntegrationProviderId, SyncJobRecord } from '../../types/integrations';
import {
  createSyncJob,
  getActiveSyncJobByDedupeKey,
  getOAuthIntegrationRow,
  recordActivityEvent,
  updateSyncJob,
  upsertOAuthIntegration,
} from '../audit/db';
import { fetchAndStoreGa4Data } from './ga4Client';
import { fetchAndStoreGscData } from './gscClient';

function isRetryableIntegrationError(msg: string): boolean {
  return /\b(429|500|502|503|504|ETIMEDOUT|ECONNRESET|fetch failed)\b/i.test(msg);
}

export async function runIntegrationSyncJob(params: {
  tenantId: string;
  projectId: string;
  provider: 'gsc' | 'ga4';
  actorName: string;
  days?: number;
  awaitCompletion?: boolean;
}): Promise<SyncJobRecord> {
  const integration = getOAuthIntegrationRow(
    params.tenantId,
    params.projectId,
    params.provider,
  );
  if (!integration || integration.status !== 'Connected') {
    throw new Error(
      `PRECONDITION_FAILED: Connect and authorize ${params.provider.toUpperCase()} before syncing.`,
    );
  }
  if (!integration.propertyId) {
    throw new Error(
      `PRECONDITION_FAILED: Select a ${params.provider.toUpperCase()} property before syncing.`,
    );
  }

  const dedupeKey = `${params.tenantId}:${params.projectId}:${params.provider}`;
  const existingActive = getActiveSyncJobByDedupeKey(dedupeKey);
  if (existingActive) {
    return existingActive;
  }

  const jobType: SyncJobRecord['jobType'] =
    params.provider === 'gsc' ? 'gsc_sync' : 'ga4_sync';

  const job = createSyncJob({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: params.provider,
    jobType,
    dedupeKey,
    maxAttempts: 3,
  });

  const execute = async (): Promise<SyncJobRecord> => {
    const startedAt = new Date().toISOString();
    updateSyncJob(job.id, { status: 'Running', startedAt });

    let attempt = 0;
    const maxAttempts = job.maxAttempts;
    let lastError = 'Unknown sync error';

    while (attempt < maxAttempts) {
      attempt += 1;
      updateSyncJob(job.id, {
        status: attempt > 1 ? 'Retrying' : 'Running',
        attemptCount: attempt,
      });

      try {
        let recordsSynced = 0;
        if (params.provider === 'gsc') {
          const out = await fetchAndStoreGscData({
            tenantId: params.tenantId,
            projectId: params.projectId,
            propertyUrl: integration.propertyId!,
            days: params.days ?? 30,
          });
          recordsSynced = out.dailyRows + out.queryRows;
        } else {
          const out = await fetchAndStoreGa4Data({
            tenantId: params.tenantId,
            projectId: params.projectId,
            propertyId: integration.propertyId!,
            days: params.days ?? 30,
          });
          recordsSynced = out.dailyRows + out.landingRows;
        }

        const completedAt = new Date().toISOString();
        upsertOAuthIntegration({
          tenantId: params.tenantId,
          projectId: params.projectId,
          provider: params.provider,
          status: 'Connected',
          lastError: null,
          lastSyncedAt: completedAt,
        });

        const done = updateSyncJob(job.id, {
          status: 'Succeeded',
          recordsSynced,
          errorMessage: null,
          completedAt,
        })!;

        recordActivityEvent({
          tenantId: params.tenantId,
          projectId: params.projectId,
          type: 'sync',
          actor: params.actorName,
          action: `Synced ${recordsSynced} ${params.provider.toUpperCase()} records from ${integration.propertyName ?? integration.propertyId}`,
          status: 'Succeeded',
          evidenceUrl: '/analytics',
        });

        return done;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Sync failed.';
        const retryable = isRetryableIntegrationError(lastError) && attempt < maxAttempts;
        if (retryable) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        break;
      }
    }

    const failedAt = new Date().toISOString();
    const isTokenExpired = lastError.includes('TOKEN_EXPIRED');
    upsertOAuthIntegration({
      tenantId: params.tenantId,
      projectId: params.projectId,
      provider: params.provider,
      status: isTokenExpired ? 'Expired' : 'Error',
      lastError,
    });

    const failedJob = updateSyncJob(job.id, {
      status: 'Failed',
      errorMessage: lastError,
      completedAt: failedAt,
    })!;

    recordActivityEvent({
      tenantId: params.tenantId,
      projectId: params.projectId,
      type: 'integration_failure',
      actor: params.actorName,
      action: `${params.provider.toUpperCase()} sync failed: ${lastError.slice(0, 120)}`,
      status: 'Failed',
      evidenceUrl: '/integrations',
    });

    return failedJob;
  };

  if (params.awaitCompletion) {
    return execute();
  }

  void execute();
  return job;
}

export function isProviderSupportedForOAuth(
  provider: string,
): provider is Extract<IntegrationProviderId, 'gsc' | 'ga4'> {
  return provider === 'gsc' || provider === 'ga4';
}
