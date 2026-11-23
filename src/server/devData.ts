import crypto from 'node:crypto';
import type { Tenant, User, UserRole } from '../types/auth';

export interface DevAccountRecord {
  user: User;
  tenant: Tenant;
  salt: string;
  passwordHashHex: string;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPasswordHash(
  password: string,
  salt: string,
  expectedHex: string,
): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

const DEFAULT_DEV_TENANT: Tenant = {
  id: 'tenant-rovix-dev',
  name: 'Rovix Local Workspace',
  plan: 'Growth',
  primaryDomain: '',
};

const DEV_SALT_1 = 'rovix_dev_salt_01';
const DEV_SALT_2 = 'rovix_dev_salt_02';

/**
 * Strictly local developer sandbox accounts.
 * Refused whenever NODE_ENV=production or ROVIX_PRODUCTION_SAFE=true.
 * Note: Signing in provisions ZERO fake clients, zero fake metrics, and zero fake connections.
 */
export const DEV_ACCOUNTS: readonly DevAccountRecord[] = [
  {
    user: {
      id: 'usr-simon',
      name: 'Simon Baler',
      email: 'simon@rovixai.com',
      role: 'Agency Owner',
      avatarInitials: 'SB',
      title: 'Agency Owner',
    },
    tenant: DEFAULT_DEV_TENANT,
    salt: DEV_SALT_1,
    passwordHashHex: hashPassword('RovixDemo2026!', DEV_SALT_1),
  },
  {
    user: {
      id: 'usr-qa',
      name: 'Maya Lin',
      email: 'maya.qa@rovixai.com',
      role: 'QA',
      avatarInitials: 'ML',
      title: 'QA Reviewer',
    },
    tenant: DEFAULT_DEV_TENANT,
    salt: DEV_SALT_2,
    passwordHashHex: hashPassword('RovixQa2026!', DEV_SALT_2),
  },
];

export const ROLE_APPROVER_LIST: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Business Owner',
  'Project Manager',
];
