import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/server/lib/rate-limit';
import { makeApp, seedAdmin, authHeaders, TEST_PASSWORD, testConfig, testDb } from './helpers';

async function login(app: ReturnType<typeof makeApp>['app'], email = 'admin@example.com') {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const payload = (await response.json()) as { csrfToken: string };
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { response, payload, cookie };
}

describe('security headers', () => {
  it('sets a strict CSP, frame protection and cross-origin isolation', async () => {
    const { app } = makeApp();
    const response = await app.request('/');
    expect(response.status).toBe(200);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('adds HSTS when the deployment is HTTPS', async () => {
    const { app } = makeApp(testDb(), testConfig({ cookieSecure: true, appUrl: 'https://status.example.com' }));
    const response = await app.request('/');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });

  it('marks API responses as non-cacheable', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/public/healthz');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects cross-origin session creation', async () => {
    const { app, db } = makeApp(testDb(), testConfig({ demoMode: true }));
    seedAdmin(db);
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    expect(response.status).toBe(403);
    const demo = await app.request('/api/auth/demo', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(demo.status).toBe(403);
  });
  it('rate limits repeated public hits in a sliding window', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => 1_000 });
    expect(limiter('ip').allowed).toBe(true);
    expect(limiter('ip').allowed).toBe(true);
    const blocked = limiter('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(limiter('other').allowed).toBe(true);
  });
});

describe('audit log', () => {
  it('records sign-in and monitor changes', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const { cookie, payload } = await login(app);
    const created = await app.request('/api/admin/monitors', {
      method: 'POST',
      headers: authHeaders(cookie, payload.csrfToken),
      body: JSON.stringify({
        name: 'audit-target',
        type: 'http',
        url: 'https://example.com/',
        host: null,
        port: null,
        recordType: null,
        expectedValue: null,
        httpMethod: 'GET',
        expectedStatus: 200,
        keyword: null,
        keywordMode: 'none',
        latencyThresholdMs: null,
        sslWarnDays: 14,
        intervalSeconds: 60,
        timeoutMs: 5000,
        retries: 1,
        groupName: 'Audit',
        enabled: true,
        allowPrivate: false,
        notes: null,
      }),
    });
    expect(created.status).toBe(201);

    const audit = await app.request('/api/admin/audit', { headers: { cookie } });
    expect(audit.status).toBe(200);
    const body = (await audit.json()) as { entries: Array<{ action: string; userEmail: string }> };
    const actions = body.entries.map((entry) => entry.action);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('monitor.create');
    expect(body.entries.every((entry) => entry.userEmail === 'admin@example.com')).toBe(true);
  });

  it('does not expose the audit log to anonymous callers', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/admin/audit')).status).toBe(401);
  });
});

describe('session revocation', () => {
  it('revokes every session for the operator', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const first = await login(app);
    const second = await login(app);
    const response = await app.request('/api/auth/logout-all', {
      method: 'POST',
      headers: authHeaders(second.cookie, second.payload.csrfToken),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { removed: number };
    expect(payload.removed).toBeGreaterThanOrEqual(2);
    expect((await app.request('/api/auth/me', { headers: { cookie: first.cookie } })).status).toBe(401);
    expect((await app.request('/api/auth/me', { headers: { cookie: second.cookie } })).status).toBe(401);
  });
});
