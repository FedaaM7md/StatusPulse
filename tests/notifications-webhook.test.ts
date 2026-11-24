import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listNotifications, markAllNotificationsRead, notify, unreadNotificationCount } from '../src/server/services/notifications';
import { sendWebhook } from '../src/server/services/webhook';
import { authHeaders, makeApp, seedAdmin, TEST_PASSWORD } from './helpers';

const NOW = 1_800_000_000_000;
const tempDir = path.join(process.cwd(), 'data', `test-notifications-${process.pid}`);
const logPath = path.join(tempDir, 'notifications.log');

afterAll(() => {
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

describe('notification centre and log file', () => {
  it('stores notifications and appends a JSON line to the log', () => {
    mkdirSync(tempDir, { recursive: true });
    const { db } = makeApp();
    const monitorId = Number(
      db
        .prepare(
          `INSERT INTO monitors (name, type, public_name_ar, public_name_en, created_at, updated_at)
           VALUES ('payments-api', 'http', 'بوابة الدفع', 'Payments API', ?, ?)`,
        )
        .run(NOW, NOW).lastInsertRowid,
    );
    const entry = notify(
      db,
      {
        monitorId,
        level: 'error',
        messageKey: 'notifications.event.monitorDown',
        params: { monitor: 'payments-api' },
      },
      { at: NOW, logPath },
    );
    expect(entry.read).toBe(false);
    expect(entry.messageKey).toBe('notifications.event.monitorDown');
    expect(entry.monitor).toEqual({
      id: monitorId,
      name: 'payments-api',
      displayNameAr: 'بوابة الدفع',
      displayNameEn: 'Payments API',
    });
    const stored = listNotifications(db)[0]!;
    expect(stored.monitor?.displayNameAr).toBe('بوابة الدفع');
    expect(stored.monitor?.displayNameEn).toBe('Payments API');
    expect(listNotifications(db)).toHaveLength(1);
    expect(unreadNotificationCount(db)).toBe(1);

    const line = readFileSync(logPath, 'utf8').trim();
    const parsed = JSON.parse(line) as { event: string; level: string; params: { monitor: string } };
    expect(parsed.event).toBe('notifications.event.monitorDown');
    expect(parsed.level).toBe('error');
    expect(parsed.params.monitor).toBe('payments-api');

    expect(markAllNotificationsRead(db)).toBe(1);
    expect(unreadNotificationCount(db)).toBe(0);
  });

  it('never throws when the log path is unusable', () => {
    mkdirSync(tempDir, { recursive: true });
    const { db } = makeApp();
    expect(() =>
      notify(
        db,
        { level: 'info', messageKey: 'notifications.event.test' },
        { at: NOW, logPath: tempDir },
      ),
    ).not.toThrow();
  });
});

describe('webhook security', () => {
  it('blocks invalid and private URLs without making a request', async () => {
    const invalid = await sendWebhook('not-a-url', '', { event: 'test', at: new Date(NOW).toISOString() });
    expect(invalid.ok).toBe(false);

    const badProtocol = await sendWebhook('ftp://example.com/hook', '', {
      event: 'test',
      at: new Date(NOW).toISOString(),
    });
    expect(badProtocol.ok).toBe(false);

    const privateTarget = await sendWebhook(
      'http://internal.example/hook',
      '',
      { event: 'test', at: new Date(NOW).toISOString() },
      { resolver: async () => [{ address: '10.0.0.5', family: 4 }], timeoutMs: 100 },
    );
    expect(privateTarget.ok).toBe(false);
    expect(privateTarget.error).toMatch(/Blocked/);

    const metadata = await sendWebhook(
      'http://metadata.example/hook',
      '',
      { event: 'test', at: new Date(NOW).toISOString() },
      { resolver: async () => [{ address: '169.254.169.254', family: 4 }], timeoutMs: 100 },
    );
    expect(metadata.ok).toBe(false);
    expect(metadata.error).toMatch(/Blocked/);
  });

  it('refuses to send when the webhook is disabled', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    const payload = (await login.json()) as { csrfToken: string };
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const response = await app.request('/api/admin/webhook/test', {
      method: 'POST',
      headers: authHeaders(cookie, payload.csrfToken),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('WEBHOOK_DISABLED');
  });
});

describe('settings API', () => {
  it('saves identity and security settings and masks the webhook secret', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    const loginPayload = (await login.json()) as { csrfToken: string };
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const headers = authHeaders(cookie, loginPayload.csrfToken);

    const response = await app.request('/api/admin/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        siteNameAr: 'حالة خدماتنا',
        siteNameEn: 'Our Status',
        siteDescriptionAr: 'وصف',
        siteDescriptionEn: 'Description',
        allowPrivateTargets: true,
        webhookEnabled: false,
        webhookUrl: '',
        webhookSecret: 'super-secret-value',
        publicPageEnabled: true,
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      settings: { webhookSecret: string; webhookSecretSet: boolean; allowPrivateTargets: boolean };
    };
    expect(payload.settings.webhookSecret).toBe('');
    expect(payload.settings.webhookSecretSet).toBe(true);
    expect(payload.settings.allowPrivateTargets).toBe(true);

    const get = await app.request('/api/admin/settings', { headers: { cookie } });
    const getPayload = (await get.json()) as { settings: { webhookSecret: string } };
    expect(getPayload.settings.webhookSecret).toBe('');

    const stored = db.prepare("SELECT value FROM settings WHERE key = 'webhook_secret'").get() as { value: string };
    expect(stored.value).toBe('super-secret-value');
  });

  it('rejects enabling the webhook without a URL', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    const loginPayload = (await login.json()) as { csrfToken: string };
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const response = await app.request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(cookie, loginPayload.csrfToken),
      body: JSON.stringify({
        siteNameAr: 'حالة',
        siteNameEn: 'Status',
        siteDescriptionAr: '',
        siteDescriptionEn: '',
        allowPrivateTargets: false,
        webhookEnabled: true,
        webhookUrl: '',
        webhookSecret: '',
        publicPageEnabled: true,
      }),
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { fields: Record<string, string> };
    expect(payload.fields.webhookUrl).toBe('settings.webhookUrlInvalid');
  });
});
