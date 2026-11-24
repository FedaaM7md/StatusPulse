import { describe, expect, it } from 'vitest';
import { ensureDemoDataset, resetDemoDataset } from '../src/server/services/demo';
import { getSettings } from '../src/server/services/settings';
import { authHeaders, makeApp, testConfig, testDb } from './helpers';

function demoConfig() {
  return testConfig({ demoMode: true });
}

describe('demo access', () => {
  it('returns 404 when demo mode is disabled', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/auth/demo', { method: 'POST' });
    expect(response.status).toBe(404);
    const config = await app.request('/api/public/config');
    const payload = (await config.json()) as { demoMode: boolean };
    expect(payload.demoMode).toBe(false);
  });

  it('signs in a guest in one click and seeds labelled demo data', async () => {
    const { app, db } = makeApp(testDb(), demoConfig());
    const response = await app.request('/api/auth/demo', { method: 'POST' });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user: { isDemo: boolean; email: string };
      csrfToken: string;
      demo: boolean;
    };
    expect(payload.demo).toBe(true);
    expect(payload.user.isDemo).toBe(true);
    expect(payload.user.email).toBe('demo@statuspulse.local');
    expect(payload.csrfToken).toHaveLength(64);

    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);

    const monitors = db.prepare('SELECT COUNT(*) AS c FROM monitors WHERE demo = 1').get() as { c: number };
    expect(monitors.c).toBe(6);

    const publicStatus = await app.request('/api/public/status');
    const data = (await publicStatus.json()) as {
      demoMode: boolean;
      groups: Array<{ monitors: unknown[] }>;
      activeIncidents: unknown[];
      overallState: string;
    };
    expect(data.demoMode).toBe(true);
    expect(data.groups.length).toBeGreaterThan(0);
    expect(data.activeIncidents).toHaveLength(0);
    expect(data.overallState).toBe('degraded');

    const components = (
      data.groups as Array<{
        displayName: { ar: string; en: string };
        monitors: Array<{ name: string; displayName: { ar: string; en: string } }>;
      }>
    ).flatMap((group) => group.monitors);
    const payments = components.find((component) => component.name === 'payments-api');
    expect(payments?.displayName.ar).toBe('بوابة الدفع');
    expect(payments?.displayName.en).toBe('Payments API');

    const settings = getSettings(db);
    expect(settings.siteNameEn).toBe('Wasla Pay');
    expect(settings.siteNameAr).toBe('وصلة باي');
    expect(settings.siteDescriptionEn).toMatch(/demo build|sample data/i);
  });

  it('rebuilds the dataset on reset and keeps the demo account', () => {
    const db = testDb();
    const first = resetDemoDataset(db);
    expect(first.monitors).toBe(6);
    const userId = (db.prepare("SELECT id FROM users WHERE email = 'demo@statuspulse.local'").get() as { id: number }).id;
    const before = (db.prepare('SELECT COUNT(*) AS c FROM check_results').get() as { c: number }).c;
    const second = resetDemoDataset(db);
    const after = (db.prepare('SELECT COUNT(*) AS c FROM check_results').get() as { c: number }).c;
    expect(second.monitors).toBe(6);
    expect(after).toBe(before);
    const sameUser = (db.prepare("SELECT id FROM users WHERE email = 'demo@statuspulse.local'").get() as { id: number }).id;
    expect(sameUser).toBe(userId);
  });

  it('does not reseed when a demo dataset already exists', () => {
    const db = testDb();
    const seeded = ensureDemoDataset(db);
    expect(seeded?.monitors).toBe(6);
    expect(ensureDemoDataset(db)).toBeNull();
  });

  it('uses the same 24h uptime publicly and in admin, with named incidents', async () => {
    const { app } = makeApp(testDb(), demoConfig());
    const login = await app.request('/api/auth/demo', { method: 'POST' });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;

    const publicPayload = (await (await app.request('/api/public/status')).json()) as {
      groups: Array<{
        monitors: Array<{ name: string; state: string; uptime24h: number | null }>;
      }>;
      recentIncidents: Array<{
        titleAr: string | null;
        titleEn: string | null;
        summaryAr: string | null;
        startedAt: number;
        resolvedAt: number | null;
        updates: unknown[];
      }>;
    };
    const adminPayload = (await (await app.request('/api/admin/monitors', { headers: { cookie } })).json()) as {
      monitors: Array<{ name: string; uptime24h: number | null }>;
    };

    const adminByName = new Map(adminPayload.monitors.map((monitor) => [monitor.name, monitor.uptime24h]));
    const components = publicPayload.groups.flatMap((group) => group.monitors);
    for (const component of components) {
      expect(component.uptime24h, component.name).toBe(adminByName.get(component.name));
      if (component.state === 'degraded' || component.state === 'down') {
        expect(component.uptime24h).not.toBe(100);
      }
    }

    expect(publicPayload.recentIncidents.length).toBeGreaterThanOrEqual(4);
    const titles = publicPayload.recentIncidents.map((incident) => incident.titleAr);
    expect(titles).toContain('تأخر في تأكيد مدفوعات البطاقات');
    expect(titles).toContain('تعذّر تسجيل الدخول لبعض مستخدمي أندرويد');
    for (const incident of publicPayload.recentIncidents) {
      expect(incident.titleAr).toBeTruthy();
      expect(incident.titleEn).toBeTruthy();
      expect(incident.summaryAr).toBeTruthy();
      expect(incident.resolvedAt).not.toBeNull();
      expect(incident.updates.length).toBeGreaterThanOrEqual(4);
    }
    const durations = new Set(
      publicPayload.recentIncidents.map((incident) => (incident.resolvedAt ?? 0) - incident.startedAt),
    );
    expect(durations.size).toBeGreaterThanOrEqual(4);
  });

  it('rate limits repeated guest sign-ins', async () => {
    const { app } = makeApp(testDb(), demoConfig());
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await app.request('/api/auth/demo', { method: 'POST' });
      expect(response.status).toBe(200);
    }
    const blocked = await app.request('/api/auth/demo', { method: 'POST' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('blocks demo visitors from weakening security settings', async () => {
    const { app, db } = makeApp(testDb(), demoConfig());
    const login = await app.request('/api/auth/demo', { method: 'POST' });
    const payload = (await login.json()) as { csrfToken: string };
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const settings = getSettings(db);
    const response = await app.request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(cookie, payload.csrfToken),
      body: JSON.stringify({
        siteNameAr: settings.siteNameAr,
        siteNameEn: settings.siteNameEn,
        siteDescriptionAr: settings.siteDescriptionAr,
        siteDescriptionEn: settings.siteDescriptionEn,
        allowPrivateTargets: true,
        webhookEnabled: false,
        webhookUrl: '',
        webhookSecret: '',
        publicPageEnabled: true,
      }),
    });
    expect(response.status).toBe(403);
    expect((await response.json() as { message: string }).message).toBe('demo.restricted');
  });
});
