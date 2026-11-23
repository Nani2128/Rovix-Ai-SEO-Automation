import crypto from 'node:crypto';

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function deriveEncryptionKey(): Buffer {
  const seed =
    process.env.SESSION_SECRET?.trim() ||
    process.env.WEBHOOK_ENCRYPTION_KEY?.trim() ||
    'rovix-stage6-local-webhook-secret-key-v1';
  return crypto.createHash('sha256').update(seed).digest();
}

export function generateWebhookSecret(): {
  plaintextSecret: string;
  secretHash: string;
  secretEncrypted: string;
  secretHint: string;
} {
  const plaintextSecret = `rvx_whsec_${crypto.randomBytes(24).toString('hex')}`;
  const secretHash = crypto.createHash('sha256').update(plaintextSecret).digest('hex');
  const secretHint = `...${plaintextSecret.slice(-6)}`;
  const secretEncrypted = encryptWebhookSecret(plaintextSecret);
  return { plaintextSecret, secretHash, secretEncrypted, secretHint };
}

export function encryptWebhookSecret(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptWebhookSecret(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  const parts = encoded.split(':');
  if (parts.length !== 3) return null;
  try {
    const key = deriveEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Computes canonical HMAC-SHA256 webhook signature over `${timestamp}.${rawBody}`.
 */
export function computeWebhookHmacSignature(
  secret: string,
  timestampHeader: string,
  rawBody: string,
): string {
  const payload = `${timestampHeader}.${rawBody}`;
  const digest = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

/**
 * Verifies inbound webhook HMAC-SHA256 signature and timestamp replay window using constant-time comparison.
 */
export function verifyInboundWebhookSignature(params: {
  secret: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  rawBody: string;
  nowMs?: number;
  replayWindowMs?: number;
}): { valid: boolean; reason: string | null } {
  const sig = (params.signatureHeader ?? '').trim();
  const tsRaw = (params.timestampHeader ?? '').trim();
  if (!sig || !tsRaw) {
    return {
      valid: false,
      reason: 'Missing required X-Rovix-Signature or X-Rovix-Timestamp header.',
    };
  }

  // Parse timestamp either as unix seconds, unix ms, or ISO timestamp
  let tsMs = Number.NaN;
  if (/^\d{10}$/.test(tsRaw)) {
    tsMs = Number(tsRaw) * 1000;
  } else if (/^\d{13}$/.test(tsRaw)) {
    tsMs = Number(tsRaw);
  } else {
    tsMs = Date.parse(tsRaw);
  }

  const nowMs = params.nowMs ?? Date.now();
  const maxSkew = params.replayWindowMs ?? REPLAY_WINDOW_MS;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > maxSkew) {
    return {
      valid: false,
      reason: 'Webhook timestamp is invalid or outside the 5-minute replay protection window.',
    };
  }

  const expected = computeWebhookHmacSignature(params.secret, tsRaw, params.rawBody);
  const actualBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'Invalid HMAC-SHA256 webhook signature.' };
  }
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid HMAC-SHA256 webhook signature.' };
  }

  return { valid: true, reason: null };
}
