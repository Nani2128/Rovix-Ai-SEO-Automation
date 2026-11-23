import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_DEV_ORIGIN =
  'https://ais-dev-ldkxjqf52bdv5aj7xj5bmj-485000081269.asia-east1.run.app';
export const DEFAULT_SHARED_ORIGIN =
  'https://ais-pre-ldkxjqf52bdv5aj7xj5bmj-485000081269.asia-east1.run.app';

export function getDataRoot(): string {
  const customPath = process.env.ROVIX_DB_PATH?.trim();
  if (customPath) {
    return path.dirname(path.resolve(customPath));
  }
  return path.resolve(process.cwd(), '.rovix-data');
}

export function getDbFilePath(): string {
  const customPath = process.env.ROVIX_DB_PATH?.trim();
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.join(getDataRoot(), 'rovix.db');
}

export function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ROVIX_PRODUCTION_SAFE === 'true'
  );
}

/**
 * Explicit development-only auth mode.
 * Automatically disabled in production regardless of client flags.
 */
export function isDevAuthEnabled(): boolean {
  if (isProductionEnv()) return false;
  return process.env.ALLOW_DEV_ACCOUNTS !== 'false';
}

/**
 * Isolated internal test/sandbox fixtures (sandbox.rovixai.test).
 * Disabled in live production unless explicitly overridden for integration testing.
 */
export function isSandboxCrawlAllowed(): boolean {
  if (isProductionEnv()) {
    return process.env.ALLOW_SANDBOX_FIXTURES === 'true';
  }
  return process.env.ALLOW_SANDBOX_FIXTURES !== 'false';
}

export function isSessionSecretConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32);
}

export function getIntegrationEncryptionKeyBuffer(): Buffer | null {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (raw && raw.length >= 16) {
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
  }

  // In non-production dev environments, auto-provision a local persistent 32-byte key
  // outside git so OAuth integration testing still encrypts tokens cleanly at rest.
  if (!isProductionEnv()) {
    const root = getDataRoot();
    fs.mkdirSync(root, { recursive: true });
    const keyPath = path.join(root, 'integration.key');
    if (fs.existsSync(keyPath)) {
      const hex = fs.readFileSync(keyPath, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, generated, { encoding: 'utf8', mode: 0o600 });
    return Buffer.from(generated, 'hex');
  }

  return null;
}

export function hasIntegrationEncryptionKey(): boolean {
  return getIntegrationEncryptionKeyBuffer() !== null;
}

export function getGoogleOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthCredentials() !== null && hasIntegrationEncryptionKey();
}

export function getPageSpeedApiKey(): string | null {
  const key = process.env.PAGESPEED_API_KEY?.trim() ?? '';
  return key.length > 0 ? key : null;
}

export function resolveAppOrigin(requestOrigin?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, '');
  }
  return DEFAULT_DEV_ORIGIN;
}

export function getGoogleOAuthCallbackUrls(requestOrigin?: string) {
  const activeOrigin = resolveAppOrigin(requestOrigin);
  return {
    active: `${activeOrigin}/api/integrations/google/oauth/callback`,
    dev: `${DEFAULT_DEV_ORIGIN}/api/integrations/google/oauth/callback`,
    shared: `${DEFAULT_SHARED_ORIGIN}/api/integrations/google/oauth/callback`,
  };
}
