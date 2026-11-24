import type { Hono } from 'hono';
import { openDb, type Db } from '../src/server/db';
import type { AppConfig } from '../src/server/config';
import type { MonitorCheckTarget } from '../src/server/checks/types';
import { createApp } from '../src/server/app';
import { silentLogger } from '../src/server/lib/logger';
import { createSession } from '../src/server/lib/sessions';
import { upsertAdmin } from '../src/server/services/users';
import type { Monitor } from '../src/shared/types';

export const TEST_PASSWORD = 'demo-password-123';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 8106,
    dbPath: ':memory:',
    dataDir: './data',
    appUrl: 'http://localhost:8106',
    debug: false,
    cookieSecure: false,
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    loginWindowMs: 15 * 60 * 1000,
    loginMaxAttempts: 5,
    notificationsLogPath: './data/test-notifications.log',
    demoMode: false,
    demoResetMinutes: 60,
    ...overrides,
  };
}

export function testDb(): Db {
  return openDb(':memory:');
}

export function makeApp(db: Db = testDb(), config: AppConfig = testConfig()) {
  return {
    db,
    config,
    app: createApp({ db, config, logger: silentLogger() }),
  };
}

export async function createAdminAndLogin(
  app: Hono,
  email = 'admin@example.com',
): Promise<{ cookie: string; csrf: string; userId: number }> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as { csrfToken: string };
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0]!;
  return { cookie, csrf: payload.csrfToken, userId: 1 };
}

export function seedAdmin(db: Db, email = 'admin@example.com'): number {
  return upsertAdmin(db, { email, password: TEST_PASSWORD, name: 'Test Admin' }).id;
}

export function authHeaders(cookie: string, csrf: string): Record<string, string> {
  return {
    cookie,
    'X-CSRF-Token': csrf,
    'Content-Type': 'application/json',
    Origin: 'http://localhost:8106',
  };
}

export function createSessionFor(db: Db, userId: number) {
  return createSession(db, userId, { ttlMs: 7 * 24 * 60 * 60 * 1000 });
}

export function target(overrides: Partial<MonitorCheckTarget>): MonitorCheckTarget {
  return {
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
    timeoutMs: 5000,
    retries: 1,
    ...overrides,
  };
}

export function monitorFixture(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Example',
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
    groupName: 'General',
    enabled: true,
    allowPrivate: false,
    notes: null,
    currentState: 'unknown',
    lastCheckedAt: null,
    consecutiveFailures: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    demo: false,
    publicNameAr: null,
    publicNameEn: null,
    publicGroupAr: null,
    publicGroupEn: null,
    ...overrides,
  };
}
