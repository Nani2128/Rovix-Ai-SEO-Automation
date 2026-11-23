import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getOrCreateSessionSecret } from './audit/db';
import { isProductionEnv } from './env';

const RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  res.setHeader('X-XSS-Protection', '0');

  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private',
    );
    res.setHeader('Pragma', 'no-cache');
  }

  next();
}

export function createRateLimiter(opts: {
  bucketPrefix: string;
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      'local';
    const key = `${opts.bucketPrefix}:${ip}`;
    const now = Date.now();
    const current = RATE_BUCKETS.get(key);

    if (!current || now > current.resetAt) {
      RATE_BUCKETS.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (current.count >= opts.maxRequests) {
      const retrySec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: `Too many requests. Try again in ${retrySec}s.`,
      });
    }

    current.count += 1;
    return next();
  };
}

function normalizeHostHeader(value: string): string {
  return value.trim().toLowerCase().replace(/:(80|443)$/, '');
}

export function csrfOriginCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin) {
    return next();
  }

  const candidateHosts = new Set<string>();
  if (req.headers.host) {
    candidateHosts.add(normalizeHostHeader(req.headers.host));
  }
  const forwardedHost = req.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string') {
    for (const part of forwardedHost.split(',')) {
      if (part.trim()) candidateHosts.add(normalizeHostHeader(part));
    }
  } else if (Array.isArray(forwardedHost)) {
    for (const item of forwardedHost) {
      if (item.trim()) candidateHosts.add(normalizeHostHeader(item));
    }
  }

  if (candidateHosts.size === 0) {
    return next();
  }

  try {
    const parsedOrigin = new URL(origin);
    const originHost = normalizeHostHeader(parsedOrigin.host);
    if (!candidateHosts.has(originHost)) {
      res.status(403).json({
        error: 'Origin mismatch on state-changing request.',
      });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Malformed Origin header.' });
    return;
  }

  next();
}

/* ---------------- Single-Use Short-Lived SSE Stream Tickets ---------------- */

interface SseTicketPayload {
  jti: string;
  crawlId: string;
  tenantId: string;
  userId: string;
  exp: number;
}

const CONSUMED_SSE_TICKETS = new Map<string, number>();

export function issueSseStreamTicket(params: {
  crawlId: string;
  tenantId: string;
  userId: string;
}): string {
  const now = Date.now();
  for (const [k, exp] of CONSUMED_SSE_TICKETS.entries()) {
    if (exp < now) CONSUMED_SSE_TICKETS.delete(k);
  }

  const payload: SseTicketPayload = {
    jti: crypto.randomBytes(12).toString('hex'),
    crawlId: params.crawlId,
    tenantId: params.tenantId,
    userId: params.userId,
    exp: now + 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const sig = crypto
    .createHmac('sha256', getOrCreateSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function consumeSseStreamTicket(
  ticket: string,
  crawlId: string,
): SseTicketPayload | null {
  if (!ticket || !ticket.includes('.')) return null;
  const [encoded, sig] = ticket.split('.');
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
    ) as SseTicketPayload;
    if (Date.now() > parsed.exp) return null;
    if (parsed.crawlId !== crawlId) return null;
    if (CONSUMED_SSE_TICKETS.has(parsed.jti)) return null;
    CONSUMED_SSE_TICKETS.set(parsed.jti, parsed.exp);
    return parsed;
  } catch {
    return null;
  }
}

export function safeErrorMessage(err: unknown, fallback = 'Internal server error'): string {
  if (err instanceof Error) {
    if (!isProductionEnv()) return err.message;
    // Allow explicit domain error codes in production, mask unexpected DB/OS errors
    if (/^(FORBIDDEN|BAD_REQUEST|NOT_FOUND|CONFLICT|PRECONDITION_FAILED|CONFIG_REQUIRED|NOT_CONNECTED|TOKEN_EXPIRED):/.test(err.message)) {
      return err.message;
    }
  }
  return fallback;
}
