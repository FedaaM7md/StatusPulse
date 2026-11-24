/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Hono } from 'hono';
import { appendFileSync } from 'node:fs';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import type { Logger } from '../lib/logger';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  checkLoginThrottle,
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  parseCookies,
  recordLoginAttempt,
  SESSION_COOKIE,
  sessionCookie,
} from '../lib/sessions';
import { createRateLimiter } from '../lib/rate-limit';
import { DEMO_EMAIL } from '../../shared/types';
import { recordAudit } from '../services/audit';
import { ensureDemoDataset } from '../services/demo';
import { consumePasswordReset, createPasswordReset } from '../services/password-resets';
import { findUserByEmail } from '../services/users';
import {
  fieldErrors,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './schemas';
import { clientIp, notFound, originAllowed, parseJson, requireAuth, requireCsrf, type AppEnv } from './middleware';

let dummyHash: string | null = null;
function getDummyHash(): string {
  // Equalises timing for unknown accounts so the login endpoint does not reveal
  // whether an email exists.
  dummyHash ??= hashPassword('statuspulse-dummy-password');
  return dummyHash;
}

/** Guest entry is rate limited separately from password login. */
export function createAuthRoutes(db: Db, config: AppConfig, logger: Logger): Hono<AppEnv> {
  const auth = new Hono<AppEnv>();
  const demoLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 15 });
  const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

  auth.post('/login', async (c) => {
    if (!originAllowed(c, config)) {
      return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
    }
    const raw = await parseJson(c);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }

    const email = parsed.data.email;
    const ip = clientIp(c);
    const throttle = checkLoginThrottle(db, email, ip, {
      windowMs: config.loginWindowMs,
      maxAttempts: config.loginMaxAttempts,
    });
    if (throttle.throttled) {
      logger.warn('Login throttled', { email, ip, attempts: throttle.attempts });
      return c.json(
        {
          error: 'RATE_LIMITED',
          message: 'login.throttled',
          retryAfterMs: throttle.retryAfterMs,
          retryAfterSeconds: Math.ceil(throttle.retryAfterMs / 1000),
        },
        429,
        { 'Retry-After': String(Math.ceil(throttle.retryAfterMs / 1000)) },
      );
    }

    const user = findUserByEmail(db, email);
    const valid = verifyPassword(parsed.data.password, user?.passwordHash ?? getDummyHash());
    if (!user || !valid) {
      recordLoginAttempt(db, email, ip, false);
      logger.warn('Login failed', { email, ip });
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'login.invalid' }, 401);
    }

    recordLoginAttempt(db, email, ip, true);

    // Session regeneration: an existing cookie must not be reused after login.
    const cookies = parseCookies(c.req.header('cookie'));
    const previous = cookies[SESSION_COOKIE];
    if (previous) deleteSession(db, previous);

    const session = createSession(db, user.id, {
      ttlMs: config.sessionTtlMs,
      ip,
      userAgent: c.req.header('user-agent') ?? null,
    });
    c.header('Set-Cookie', sessionCookie(session.id, config.sessionTtlMs, config.cookieSecure));
    logger.info('Login succeeded', { userId: user.id, email: user.email, ip });
    recordAudit(db, {
      userId: user.id,
      userEmail: user.email,
      action: 'auth.login',
      entity: 'session',
      summary: null,
      ip,
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return c.json({
      user: safeUser,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      demo: user.isDemo,
    });
  });

  /**
   * Password reset. There is no mail provider in this demo: the reset link is
   * appended to data/mail.log and the server log. The response is always the
   * same so the endpoint cannot be used to enumerate accounts.
   */
  auth.post('/password/request', async (c) => {
    if (!originAllowed(c, config)) {
      return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
    }
    const parsed = passwordResetRequestSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    const ip = clientIp(c);
    const limited = resetLimiter(`reset:${ip}:${parsed.data.email}`);
    if (!limited.allowed) {
      return c.json(
        {
          error: 'RATE_LIMITED',
          message: 'login.resetThrottled',
          retryAfterSeconds: Math.ceil(limited.retryAfterMs / 1000),
        },
        429,
        { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) },
      );
    }

    const reset = createPasswordReset(db, parsed.data.email);
    if (reset) {
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(reset.token)}`;
      const mail = {
        at: new Date().toISOString(),
        to: reset.email,
        subject: 'StatusPulse password reset',
        resetUrl,
        expiresAt: new Date(reset.expiresAt).toISOString(),
      };
      try {
        appendFileSync(`${config.dataDir}/mail.log`, `${JSON.stringify(mail)}\n`, 'utf8');
      } catch {
        // The server log below still records the mail.
      }
      logger.info('Password reset mail (local log)', { to: reset.email, resetUrl });
      recordAudit(db, {
        userId: null,
        userEmail: reset.email,
        action: 'auth.password_reset_requested',
        entity: 'user',
        summary: null,
        ip,
      });
    }
    return c.json({ ok: true, message: 'login.resetSent' });
  });

  auth.post('/password/confirm', async (c) => {
    if (!originAllowed(c, config)) {
      return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
    }
    const parsed = passwordResetConfirmSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    const result = consumePasswordReset(db, parsed.data.token, parsed.data.password);
    if (!result.ok) {
      if (result.reason === 'weak') {
        return c.json(
          { error: 'VALIDATION_FAILED', message: 'errors.validation', fields: { password: 'errors.weakPassword' } },
          400,
        );
      }
      return c.json({ error: 'RESET_INVALID', message: 'login.resetInvalid' }, 400);
    }
    logger.info('Password reset completed', { userId: result.userId });
    recordAudit(db, {
      userId: result.userId,
      userEmail: result.email,
      action: 'auth.password_reset_completed',
      entity: 'user',
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  /**
   * One-click guest access. Returns 404 when DEMO_MODE is off so the route
   * disappears with the UI entry point.
   */
  auth.post('/demo', (c) => {
    if (!config.demoMode) return notFound(c);
    if (!originAllowed(c, config)) {
      return c.json({ error: 'CSRF_FAILED', message: 'errors.csrf' }, 403);
    }
    const ip = clientIp(c);
    const limited = demoLimiter(`demo:${ip}`);
    if (!limited.allowed) {
      return c.json(
        {
          error: 'RATE_LIMITED',
          message: 'login.demoThrottled',
          retryAfterMs: limited.retryAfterMs,
          retryAfterSeconds: Math.ceil(limited.retryAfterMs / 1000),
        },
        429,
        { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) },
      );
    }

    ensureDemoDataset(db);
    const user = findUserByEmail(db, DEMO_EMAIL);
    if (!user) {
      return c.json({ error: 'DEMO_UNAVAILABLE', message: 'login.demoUnavailable' }, 503);
    }

    const cookies = parseCookies(c.req.header('cookie'));
    const previous = cookies[SESSION_COOKIE];
    if (previous) deleteSession(db, previous);

    const session = createSession(db, user.id, {
      ttlMs: config.sessionTtlMs,
      ip,
      userAgent: c.req.header('user-agent') ?? null,
    });
    c.header('Set-Cookie', sessionCookie(session.id, 4 * 60 * 60 * 1000, config.cookieSecure));
    logger.info('Demo session started', { ip });
    recordAudit(db, {
      userId: user.id,
      userEmail: user.email,
      action: 'auth.demo',
      entity: 'session',
      summary: null,
      ip,
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return c.json({
      user: safeUser,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      demo: true,
    });
  });

  auth.get('/me', requireAuth(db), async (c) => {
    const session = c.get('session');
    return c.json({
      user: session.user,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      demo: session.user.isDemo,
    });
  });

  auth.post('/logout', requireAuth(db), requireCsrf(config), async (c) => {
    const session = c.get('session');
    deleteSession(db, session.id);
    c.header('Set-Cookie', clearSessionCookie(config.cookieSecure));
    logger.info('Logout', { userId: session.user.id });
    recordAudit(db, {
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'auth.logout',
      entity: 'session',
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  auth.post('/logout-all', requireAuth(db), requireCsrf(config), (c) => {
    const session = c.get('session');
    const removed = deleteUserSessions(db, session.user.id);
    c.header('Set-Cookie', clearSessionCookie(config.cookieSecure));
    recordAudit(db, {
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'auth.logout_all',
      entity: 'session',
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ ok: true, removed });
  });

  return auth;
}
