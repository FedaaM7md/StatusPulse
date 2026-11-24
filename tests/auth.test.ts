import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/lib/password';
import { authHeaders, makeApp, seedAdmin, TEST_PASSWORD } from './helpers';

function cookieFrom(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0]!;
}

async function login(app: ReturnType<typeof makeApp>['app'], email = 'admin@example.com') {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const payload = (await response.json()) as { csrfToken: string; user: { email: string } };
  return { response, payload, cookie: cookieFrom(response) };
}

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const hash = hashPassword('correct-horse-battery-staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('correct-horse');
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('uses a different salt for every hash', () => {
    const first = hashPassword('same-password-123');
    const second = hashPassword('same-password-123');
    expect(first).not.toBe(second);
    expect(verifyPassword('same-password-123', first)).toBe(true);
    expect(verifyPassword('same-password-123', second)).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'plaintext')).toBe(false);
    expect(verifyPassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
  });
});

describe('login and sessions', () => {
  it('logs in, sets a hardened cookie and returns a CSRF token', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const { response, payload, cookie } = await login(app);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(cookie).toMatch(/^sp_session=/);
    expect(payload.csrfToken).toHaveLength(64);
    expect(payload.user.email).toBe('admin@example.com');

    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    const mePayload = (await me.json()) as { user: { email: string }; csrfToken: string };
    expect(mePayload.user.email).toBe('admin@example.com');
    expect(mePayload.csrfToken).toBe(payload.csrfToken);
  });

  it('rejects incorrect credentials without revealing which field failed', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
    });
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe('INVALID_CREDENTIALS');
    expect(payload.message).toBe('login.invalid');
  });

  it('throttles repeated failed attempts', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'bad-password' }),
      });
      expect(response.status).toBe(401);
    }
    const blocked = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    const payload = (await blocked.json()) as { retryAfterSeconds: number };
    expect(payload.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('regenerates the session on every login', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const first = await login(app);
    const second = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: first.cookie },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    const secondCookie = cookieFrom(second);
    expect(secondCookie).not.toBe(first.cookie);

    const oldSession = await app.request('/api/auth/me', { headers: { cookie: first.cookie } });
    expect(oldSession.status).toBe(401);
    const newSession = await app.request('/api/auth/me', { headers: { cookie: secondCookie } });
    expect(newSession.status).toBe(200);
  });

  it('logs out and invalidates the session', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const { payload, cookie } = await login(app);
    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders(cookie, payload.csrfToken),
    });
    expect(logout.status).toBe(200);
    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(401);
  });

  it('rejects malformed login payloads', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '' }),
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(payload.fields).length).toBeGreaterThan(0);
  });
});

describe('authorization and CSRF', () => {
  it('requires authentication for admin endpoints', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/admin/summary');
    expect(response.status).toBe(401);
  });

  it('requires a valid CSRF token for state-changing requests', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const { payload, cookie } = await login(app);

    const missing = await app.request('/api/admin/notifications/read-all', {
      method: 'POST',
      headers: { cookie, Origin: 'http://localhost:8106' },
    });
    expect(missing.status).toBe(403);

    const wrong = await app.request('/api/admin/notifications/read-all', {
      method: 'POST',
      headers: { ...authHeaders(cookie, 'deadbeef') },
    });
    expect(wrong.status).toBe(403);

    const ok = await app.request('/api/admin/notifications/read-all', {
      method: 'POST',
      headers: authHeaders(cookie, payload.csrfToken),
    });
    expect(ok.status).toBe(200);
  });

  it('rejects cross-origin state-changing requests even with a token', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const { payload, cookie } = await login(app);
    const response = await app.request('/api/admin/notifications/read-all', {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': payload.csrfToken, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });
});
