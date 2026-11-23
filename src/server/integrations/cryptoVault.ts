import crypto from 'node:crypto';
import { getIntegrationEncryptionKeyBuffer } from '../env';

export interface EncryptedEnvelope {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptSecretPayload(payload: unknown): string {
  const key = getIntegrationEncryptionKeyBuffer();
  if (!key) {
    throw new Error(
      'CONFIG_REQUIRED: INTEGRATION_ENCRYPTION_KEY is required in production before storing OAuth credentials.',
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function decryptSecretPayload<T = Record<string, unknown>>(serialized: string): T {
  const key = getIntegrationEncryptionKeyBuffer();
  if (!key) {
    throw new Error(
      'CONFIG_REQUIRED: INTEGRATION_ENCRYPTION_KEY is missing and stored integration tokens cannot be decrypted.',
    );
  }
  const parsed = JSON.parse(serialized) as EncryptedEnvelope;
  if (parsed.v !== 1 || parsed.alg !== 'aes-256-gcm') {
    throw new Error('CORRUPT_CIPHERTEXT: Unsupported token encryption format.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
