import crypto from 'node:crypto';
import type { IntegrationProviderId } from '../../types/integrations';
import {
  getOAuthIntegrationRow,
  getOrCreateSessionSecret,
  recordActivityEvent,
  upsertOAuthIntegration,
  deleteOAuthIntegration,
} from '../audit/db';
import {
  getGoogleOAuthCallbackUrls,
  getGoogleOAuthCredentials,
  hasIntegrationEncryptionKey,
} from '../env';
import { decryptSecretPayload, encryptSecretPayload } from './cryptoVault';

export interface StoredOAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number;
  scope: string;
  tokenType: string;
}

interface SignedOAuthState {
  tenantId: string;
  projectId: string;
  provider: 'gsc' | 'ga4';
  userId: string;
  nonce: string;
  exp: number;
}

const PROVIDER_SCOPES: Record<'gsc' | 'ga4', string[]> = {
  gsc: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  ga4: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

function signOAuthState(payload: SignedOAuthState): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getOrCreateSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(stateToken: string): SignedOAuthState | null {
  if (!stateToken || !stateToken.includes('.')) return null;
  const [encoded, sig] = stateToken.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getOrCreateSessionSecret())
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as SignedOAuthState;
    if (Date.now() > parsed.exp) return null;
    if (parsed.provider !== 'gsc' && parsed.provider !== 'ga4') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(params: {
  tenantId: string;
  projectId: string;
  provider: 'gsc' | 'ga4';
  userId: string;
  requestOrigin?: string;
}): { url: string; callbackUrl: string } {
  const creds = getGoogleOAuthCredentials();
  if (!creds) {
    throw new Error(
      'CONFIG_REQUIRED: Google OAuth credentials (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET) are not configured on this server.',
    );
  }
  if (!hasIntegrationEncryptionKey()) {
    throw new Error(
      'CONFIG_REQUIRED: INTEGRATION_ENCRYPTION_KEY is missing in production environment variables.',
    );
  }

  const callbacks = getGoogleOAuthCallbackUrls(params.requestOrigin);
  const state = signOAuthState({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: params.provider,
    userId: params.userId,
    nonce: crypto.randomBytes(12).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', callbacks.active);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', PROVIDER_SCOPES[params.provider].join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  return { url: url.toString(), callbackUrl: callbacks.active };
}

export async function completeGoogleOAuthCallback(params: {
  code: string;
  state: string;
  requestOrigin?: string;
}): Promise<{
  tenantId: string;
  projectId: string;
  provider: 'gsc' | 'ga4';
  accountEmail: string | null;
}> {
  const parsedState = verifyOAuthState(params.state);
  if (!parsedState) {
    throw new Error('BAD_REQUEST: Invalid or expired OAuth state parameter.');
  }

  const creds = getGoogleOAuthCredentials();
  if (!creds) {
    throw new Error('CONFIG_REQUIRED: Google OAuth client credentials are not configured.');
  }

  const callbacks = getGoogleOAuthCallbackUrls(params.requestOrigin);
  const body = new URLSearchParams({
    code: params.code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: callbacks.active,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const tokenJson = (await tokenRes.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!tokenRes.ok || !tokenJson || typeof tokenJson.access_token !== 'string') {
    const errMsg =
      (tokenJson && typeof tokenJson.error_description === 'string'
        ? tokenJson.error_description
        : null) ?? 'Failed to exchange Google OAuth authorization code.';
    throw new Error(`OAUTH_EXCHANGE_FAILED: ${errMsg}`);
  }

  let accountEmail: string | null = null;
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (userInfoRes.ok) {
      const ui = (await userInfoRes.json()) as { email?: string };
      accountEmail = ui.email ?? null;
    }
  } catch {
    accountEmail = null;
  }

  const existing = getOAuthIntegrationRow(
    parsedState.tenantId,
    parsedState.projectId,
    parsedState.provider,
  );
  let previousRefreshToken: string | null = null;
  if (existing?.encryptedTokensJson) {
    try {
      previousRefreshToken =
        decryptSecretPayload<StoredOAuthTokens>(existing.encryptedTokensJson).refreshToken ??
        null;
    } catch {
      previousRefreshToken = null;
    }
  }

  const expiresInSec = Number(tokenJson.expires_in ?? 3500);
  const storedTokens: StoredOAuthTokens = {
    accessToken: String(tokenJson.access_token),
    refreshToken:
      typeof tokenJson.refresh_token === 'string'
        ? tokenJson.refresh_token
        : previousRefreshToken,
    expiresAtMs: Date.now() + expiresInSec * 1000,
    scope:
      typeof tokenJson.scope === 'string'
        ? tokenJson.scope
        : PROVIDER_SCOPES[parsedState.provider].join(' '),
    tokenType: String(tokenJson.token_type ?? 'Bearer'),
  };

  const encryptedTokensJson = encryptSecretPayload(storedTokens);

  upsertOAuthIntegration({
    tenantId: parsedState.tenantId,
    projectId: parsedState.projectId,
    provider: parsedState.provider,
    accountEmail,
    scopes: storedTokens.scope.split(/\s+/).filter(Boolean),
    encryptedTokensJson,
    status: 'Connected',
    lastError: null,
  });

  recordActivityEvent({
    tenantId: parsedState.tenantId,
    projectId: parsedState.projectId,
    type: 'sync',
    actor: accountEmail ?? 'Google OAuth',
    action: `Authorized ${parsedState.provider.toUpperCase()} connector`,
    status: 'Succeeded',
    evidenceUrl: '/integrations',
  });

  return {
    tenantId: parsedState.tenantId,
    projectId: parsedState.projectId,
    provider: parsedState.provider,
    accountEmail,
  };
}

export async function getValidGoogleAccessToken(params: {
  tenantId: string;
  projectId: string;
  provider: 'gsc' | 'ga4';
}): Promise<string> {
  const row = getOAuthIntegrationRow(
    params.tenantId,
    params.projectId,
    params.provider,
  );
  if (!row || !row.encryptedTokensJson || row.status === 'Not Connected') {
    throw new Error(
      `NOT_CONNECTED: ${params.provider.toUpperCase()} integration is not authorized for this project.`,
    );
  }

  const tokens = decryptSecretPayload<StoredOAuthTokens>(row.encryptedTokensJson);
  if (tokens.accessToken && Date.now() < tokens.expiresAtMs - 60_000) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    upsertOAuthIntegration({
      tenantId: params.tenantId,
      projectId: params.projectId,
      provider: params.provider,
      status: 'Expired',
      lastError: 'Access token expired and no refresh token was granted. Re-authorize OAuth.',
    });
    throw new Error(
      'TOKEN_EXPIRED: Google OAuth access token expired. Re-authorize connection.',
    );
  }

  const creds = getGoogleOAuthCredentials();
  if (!creds) {
    throw new Error('CONFIG_REQUIRED: Google OAuth credentials missing on server.');
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await refreshRes.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!refreshRes.ok || !json || typeof json.access_token !== 'string') {
    const errText =
      (json && typeof json.error_description === 'string'
        ? json.error_description
        : null) ?? 'Refresh token rejected or revoked by Google.';
    upsertOAuthIntegration({
      tenantId: params.tenantId,
      projectId: params.projectId,
      provider: params.provider,
      status: 'Expired',
      lastError: errText,
    });
    throw new Error(`TOKEN_EXPIRED: ${errText}`);
  }

  const refreshed: StoredOAuthTokens = {
    ...tokens,
    accessToken: String(json.access_token),
    expiresAtMs: Date.now() + Number(json.expires_in ?? 3500) * 1000,
  };
  upsertOAuthIntegration({
    tenantId: params.tenantId,
    projectId: params.projectId,
    provider: params.provider,
    encryptedTokensJson: encryptSecretPayload(refreshed),
    status: 'Connected',
    lastError: null,
  });

  return refreshed.accessToken;
}

export async function disconnectIntegration(params: {
  tenantId: string;
  projectId: string;
  provider: IntegrationProviderId;
  actorName: string;
}): Promise<boolean> {
  const existing = getOAuthIntegrationRow(
    params.tenantId,
    params.projectId,
    params.provider,
  );
  if (existing?.encryptedTokensJson) {
    try {
      const tokens = decryptSecretPayload<StoredOAuthTokens>(
        existing.encryptedTokensJson,
      );
      const tokenToRevoke = tokens.refreshToken || tokens.accessToken;
      if (tokenToRevoke) {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
          { method: 'POST' },
        ).catch(() => undefined);
      }
    } catch {
      // Proceed with local removal even if remote revoke fails
    }
  }

  const removed = deleteOAuthIntegration(
    params.tenantId,
    params.projectId,
    params.provider,
  );
  if (removed) {
    recordActivityEvent({
      tenantId: params.tenantId,
      projectId: params.projectId,
      type: 'sync',
      actor: params.actorName,
      action: `Disconnected ${params.provider.toUpperCase()} integration & revoked tokens`,
      status: 'Warning',
      evidenceUrl: '/integrations',
    });
  }
  return removed;
}
