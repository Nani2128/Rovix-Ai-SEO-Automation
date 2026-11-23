import dns from 'node:dns/promises';
import net from 'node:net';
import type { CrawlScopeMode, QueryParamPolicy } from '../../types/crawl';

export class SecurityBlockedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecurityBlockedError';
    this.code = code;
  }
}

export const SANDBOX_HOST = 'sandbox.rovixai.test';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

export function isPrivateOrReservedIp(ipRaw: string): boolean {
  let ip = ipRaw.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (ip.startsWith('::ffff:')) {
    const rest = ip.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIp(rest);
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIp(ipv4);
      }
    }
  }

  if (net.isIPv4(ip)) {
    const n = ipv4ToUint32(ip);
    if (n === null) return true;
    const inRange = (start: string, maskBits: number): boolean => {
      const s = ipv4ToUint32(start)!;
      const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
      return (n & mask) === (s & mask);
    };

    return (
      inRange('0.0.0.0', 8) || // Current network
      inRange('10.0.0.0', 8) || // RFC 1918
      inRange('100.64.0.0', 10) || // CGNAT
      inRange('127.0.0.0', 8) || // Loopback
      inRange('169.254.0.0', 16) || // Link-local / Cloud metadata
      inRange('172.16.0.0', 12) || // RFC 1918
      inRange('192.0.0.0', 24) || // IETF protocol
      inRange('192.0.2.0', 24) || // TEST-NET-1
      inRange('192.168.0.0', 16) || // RFC 1918
      inRange('198.18.0.0', 15) || // Benchmarking
      inRange('198.51.100.0', 24) || // TEST-NET-2
      inRange('203.0.113.0', 24) || // TEST-NET-3
      inRange('224.0.0.0', 4) || // Multicast
      inRange('240.0.0.0', 4) // Reserved
    );
  }

  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // Unique local fc00::/7
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true; // Link-local fe80::/10
    }
    if (ip.startsWith('ff')) return true; // Multicast
    return false;
  }

  return true;
}

export function normalizeCanonicalDomain(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new SecurityBlockedError('INVALID_URL', 'Website URL is malformed.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityBlockedError('INVALID_SCHEME', 'Only HTTP and HTTPS protocols are permitted.');
  }
  return parsed.hostname.toLowerCase().replace(/\.+$/, '');
}

export function isDomainWithinScope(
  targetHost: string,
  rootDomain: string,
  scopeMode: CrawlScopeMode,
): boolean {
  const cleanTarget = targetHost.toLowerCase().replace(/^www\./, '');
  const cleanRoot = rootDomain.toLowerCase().replace(/^www\./, '');
  if (cleanTarget === cleanRoot) return true;
  if (scopeMode === 'authorized_subdomains') {
    return cleanTarget.endsWith(`.${cleanRoot}`);
  }
  return false;
}

export function normalizeCrawlUrl(
  rawUrl: string,
  baseUrl?: string,
  options?: {
    queryParamPolicy?: QueryParamPolicy;
    queryAllowlist?: string[];
  },
): string | null {
  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    const policy = options?.queryParamPolicy ?? 'keep_all';
    if (policy === 'ignore_all') {
      parsed.search = '';
    } else if (policy === 'allowlist') {
      const allowed = new Set((options?.queryAllowlist ?? []).map((k) => k.trim()));
      const nextParams = new URLSearchParams();
      for (const [k, v] of parsed.searchParams.entries()) {
        if (allowed.has(k)) nextParams.append(k, v);
      }
      nextParams.sort();
      parsed.search = nextParams.toString() ? `?${nextParams.toString()}` : '';
    } else {
      parsed.searchParams.sort();
    }

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function matchesUrlPatterns(
  urlStr: string,
  includePatterns: string[],
  excludePatterns: string[],
): boolean {
  let pathname = '/';
  try {
    pathname = new URL(urlStr).pathname;
  } catch {
    return false;
  }

  for (const ex of excludePatterns) {
    const p = ex.trim();
    if (!p) continue;
    if (pathname.includes(p) || urlStr.includes(p)) return false;
  }

  const activeIncludes = includePatterns.map((i) => i.trim()).filter(Boolean);
  if (activeIncludes.length > 0) {
    return activeIncludes.some(
      (inc) => pathname.includes(inc) || urlStr.includes(inc),
    );
  }
  return true;
}

export interface ValidatedTarget {
  url: URL;
  isSandboxFixture: boolean;
  resolvedIps: string[];
}

export async function validateOutboundUrl(
  rawUrl: string,
  options?: { allowSandboxHost?: boolean },
): Promise<ValidatedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SecurityBlockedError('INVALID_URL', `Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityBlockedError(
      'SSRF_SCHEME_BLOCKED',
      `Blocked disallowed protocol "${parsed.protocol}". Only HTTP/HTTPS are allowed.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new SecurityBlockedError(
      'SSRF_CREDENTIALS_BLOCKED',
      'URLs containing embedded credentials are blocked.',
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  if (options?.allowSandboxHost && hostname === SANDBOX_HOST) {
    return { url: parsed, isSandboxFixture: true, resolvedIps: [] };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.arpa')
  ) {
    throw new SecurityBlockedError(
      'SSRF_HOST_BLOCKED',
      `Blocked internal or reserved hostname "${hostname}".`,
    );
  }

  const cleanIpLiteral =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (net.isIP(cleanIpLiteral)) {
    if (isPrivateOrReservedIp(cleanIpLiteral)) {
      throw new SecurityBlockedError(
        'SSRF_IP_BLOCKED',
        `Blocked private, loopback, or link-local IP address "${cleanIpLiteral}".`,
      );
    }
    return { url: parsed, isSandboxFixture: false, resolvedIps: [cleanIpLiteral] };
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SecurityBlockedError(
      'DNS_RESOLUTION_FAILED',
      `Unable to resolve hostname "${hostname}".`,
    );
  }

  if (!records || records.length === 0) {
    throw new SecurityBlockedError(
      'DNS_RESOLUTION_EMPTY',
      `DNS lookup returned no addresses for "${hostname}".`,
    );
  }

  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new SecurityBlockedError(
        'SSRF_DNS_REBIND_BLOCKED',
        `Hostname "${hostname}" resolved to blocked internal/reserved IP "${rec.address}".`,
      );
    }
  }

  return {
    url: parsed,
    isSandboxFixture: false,
    resolvedIps: records.map((r) => r.address),
  };
}
