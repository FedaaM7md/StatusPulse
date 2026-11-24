/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import { constantTimeEqual } from '../lib/password';
import {
  getSession,
  parseCookies,
  SESSION_COOKIE,
  type SessionWithUser,
} from '../lib/sessions';

export interface AppEnv {
  Variables: {
    session: SessionWithUser;
    db: Db;
    config: AppConfig;
  };
}

export function clientIp(c: Context): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? 'unknown';
  } catch {
    return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  }
}

export function requireAuth(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const cookies = parseCookies(c.req.header('cookie'));
    const session = getSession(db, cookies[SESSION_COOKIE] ?? '');
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED', message: 'errors.unauthorized' }, 401);
    }
    c.set('session', session);
    await next();
  };
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Same-origin check used by unauthenticated session creation endpoints. */
export function originAllowed(c: Context, config: AppConfig): boolean {
  const origin = c.req.header('origin');
  if (!origin) return true;
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(config.appUrl).host);
  } catch {
    // Malformed APP_URL is tolerated; the request host still applies.
  }
  const requestHost = c.req.header('host');
  if (requestHost) allowed.add(requestHost);
  return allowed.has(originHost);
}

/**
 * Double-submit CSRF protection: the token lives in the server-side session and
 * must be echoed in X-CSRF-Token. Origin is also checked when present.
 */
export function requireCsrf(config: AppConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!UNSAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }
    const session = c.get('session');
    const token = c.req.header('x-csrf-token') ?? '';
    if (!session || !token || !constantTimeEqual(token, session.csrfToken)) {
      return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
    }

    const origin = c.req.header('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
      }
      const allowed = new Set<string>();
      try {
        allowed.add(new URL(config.appUrl).host);
      } catch {
        // appUrl may be malformed in local development; the request host still applies.
      }
      const requestHost = c.req.header('host');
      if (requestHost) allowed.add(requestHost);
      if (!allowed.has(originHost)) {
        return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
      }
    }

    await next();
  };
}

export const securityHeaders = (config: AppConfig): MiddlewareHandler => async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('X-DNS-Prefetch-Control', 'off');
  let https = config.cookieSecure;
  try {
    https ||= new URL(config.appUrl).protocol === 'https:';
  } catch {
    // A malformed APP_URL should not break headers.
  }
  if (https) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'",
  );
  if (c.req.path.startsWith('/api/')) {
    headers.set('Cache-Control', 'no-store');
  }
};

export async function parseJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function notFound(c: Context): Response {
  return c.json({ error: 'NOT_FOUND', message: 'errors.notFound' }, 404);
}

export type Handler = (c: Context<AppEnv>, next: Next) => Promise<Response> | Response;
