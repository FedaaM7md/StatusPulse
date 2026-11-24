import { describe, expect, it } from 'vitest';
import type { Incident } from '../src/shared/types';
import { openIncident } from '../src/server/services/incidents';
import { authHeaders, makeApp, seedAdmin, TEST_PASSWORD } from './helpers';

async function setup() {
  const { app, db } = makeApp();
  seedAdmin(db);
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
  });
  const payload = (await response.json()) as { csrfToken: string };
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { app, db, headers: authHeaders(cookie, payload.csrfToken) };
}

const baseMonitor = {
  name: 'Public website',
  type: 'http',
  url: 'https://example.com/health',
  host: null,
  port: null,
  recordType: null,
  expectedValue: null,
  httpMethod: 'GET',
  expectedStatus: 200,
  keyword: null,
  keywordMode: 'none',
  latencyThresholdMs: 1500,
  sslWarnDays: 14,
  intervalSeconds: 60,
  timeoutMs: 5000,
  retries: 1,
  groupName: 'Website',
  enabled: true,
  allowPrivate: false,
  notes: null,
};

async function create(app: Awaited<ReturnType<typeof setup>>['app'], headers: Record<string, string>, body: unknown) {
  return app.request('/api/admin/monitors', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('monitor CRUD API', () => {
  it('creates, lists, updates and deletes a monitor', async () => {
    const { app, headers } = await setup();
    const created = await create(app, headers, baseMonitor);
    expect(created.status).toBe(201);
    const createdPayload = (await created.json()) as { monitor: { id: number; name: string; groupName: string } };
    const id = createdPayload.monitor.id;
    expect(createdPayload.monitor.name).toBe('Public website');
    expect(createdPayload.monitor.groupName).toBe('Website');

    const list = await app.request('/api/admin/monitors', { headers: { cookie: headers.cookie! } });
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as { monitors: Array<{ id: number; uptime24h: number | null }> };
    expect(listPayload.monitors).toHaveLength(1);
    expect(listPayload.monitors[0]!.uptime24h).toBeNull();

    const detail = await app.request(`/api/admin/monitors/${id}`, { headers: { cookie: headers.cookie! } });
    expect(detail.status).toBe(200);
    const detailPayload = (await detail.json()) as {
      stats: { uptime24h: { uptime: number | null } };
      daily: unknown[];
      results: unknown[];
      incidents: unknown[];
    };
    expect(detailPayload.stats.uptime24h.uptime).toBeNull();
    expect(detailPayload.daily).toHaveLength(90);
    expect(detailPayload.results).toHaveLength(0);

    const updated = await app.request(`/api/admin/monitors/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...baseMonitor, name: 'Renamed website', intervalSeconds: 120 }),
    });
    expect(updated.status).toBe(200);
    const updatedPayload = (await updated.json()) as { monitor: { name: string; intervalSeconds: number } };
    expect(updatedPayload.monitor.name).toBe('Renamed website');
    expect(updatedPayload.monitor.intervalSeconds).toBe(120);

    const deleted = await app.request(`/api/admin/monitors/${id}`, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);
    const missing = await app.request(`/api/admin/monitors/${id}`, { headers: { cookie: headers.cookie! } });
    expect(missing.status).toBe(404);
  });

  it('validates URLs, ports, ranges and required fields', async () => {
    const { app, headers } = await setup();

    const badUrl = await create(app, headers, { ...baseMonitor, url: 'javascript:alert(1)' });
    expect(badUrl.status).toBe(400);
    expect((await badUrl.json() as { fields: Record<string, string> }).fields.url).toBe('monitors.invalidUrl');

    const missingUrl = await create(app, headers, { ...baseMonitor, url: null });
    expect(missingUrl.status).toBe(400);

    const tcpMissingPort = await create(app, headers, {
      ...baseMonitor,
      type: 'tcp',
      url: null,
      host: 'db.example.com',
      port: null,
    });
    expect(tcpMissingPort.status).toBe(400);
    expect((await tcpMissingPort.json() as { fields: Record<string, string> }).fields.port).toBe('monitors.invalidPort');

    const badPort = await create(app, headers, {
      ...baseMonitor,
      type: 'tcp',
      url: null,
      host: 'db.example.com',
      port: 70000,
    });
    expect(badPort.status).toBe(400);

    const badInterval = await create(app, headers, { ...baseMonitor, intervalSeconds: 0 });
    expect(badInterval.status).toBe(400);

    const badLatency = await create(app, headers, { ...baseMonitor, latencyThresholdMs: 10 });
    expect(badLatency.status).toBe(400);

    const emptyName = await create(app, headers, { ...baseMonitor, name: '   ' });
    expect(emptyName.status).toBe(400);
  });

  it('normalises type-specific fields', async () => {
    const { app, headers } = await setup();
    const dns = await create(app, headers, {
      ...baseMonitor,
      name: 'DNS',
      type: 'dns',
      url: null,
      host: 'example.com',
      recordType: 'A',
      expectedValue: '93.184.216.34',
      keyword: 'ignored',
      keywordMode: 'present',
    });
    expect(dns.status).toBe(201);
    const payload = (await dns.json()) as {
      monitor: { url: string | null; port: number | null; keyword: string | null; recordType: string };
    };
    expect(payload.monitor.url).toBeNull();
    expect(payload.monitor.port).toBeNull();
    expect(payload.monitor.keyword).toBeNull();
    expect(payload.monitor.recordType).toBe('A');

    const ssl = await create(app, headers, {
      ...baseMonitor,
      name: 'TLS',
      type: 'ssl',
      url: null,
      host: 'example.com',
      port: null,
    });
    expect(ssl.status).toBe(201);
    const sslPayload = (await ssl.json()) as { monitor: { port: number } };
    expect(sslPayload.monitor.port).toBe(443);
  });

  it('closes an open incident when a monitor is disabled or deleted', async () => {
    const { app, db, headers } = await setup();
    const created = await create(app, headers, baseMonitor);
    const id = ((await created.json()) as { monitor: { id: number } }).monitor.id;
    const incident = openIncident(db, {
      monitorId: id,
      title: 'Public website',
      cause: 'Unexpected HTTP status 503.',
      at: Date.now(),
    });

    const disabled = await app.request(`/api/admin/monitors/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...baseMonitor, enabled: false }),
    });
    expect(disabled.status).toBe(200);

    const afterDisable = await app.request(`/api/admin/incidents/${incident.id}`, {
      headers: { cookie: headers.cookie! },
    });
    const disabledPayload = (await afterDisable.json()) as { incident: Incident };
    expect(disabledPayload.incident.status).toBe('resolved');
    expect(disabledPayload.incident.resolvedAt).not.toBeNull();
    expect(disabledPayload.incident.updates.at(-1)!.messageKey).toBe('incidents.closedOnDisable');

    const secondCreated = await create(app, headers, { ...baseMonitor, name: 'Second monitor' });
    const secondId = ((await secondCreated.json()) as { monitor: { id: number } }).monitor.id;
    const secondIncident = openIncident(db, {
      monitorId: secondId,
      title: 'Second monitor',
      cause: null,
      at: Date.now(),
    });

    const deleted = await app.request(`/api/admin/monitors/${secondId}`, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);

    const afterDelete = await app.request(`/api/admin/incidents/${secondIncident.id}`, {
      headers: { cookie: headers.cookie! },
    });
    expect(afterDelete.status).toBe(200);
    const deletedPayload = (await afterDelete.json()) as { incident: Incident; monitor: unknown };
    expect(deletedPayload.incident.status).toBe('resolved');
    expect(deletedPayload.incident.monitorId).toBeNull();
    expect(deletedPayload.incident.updates.at(-1)!.messageKey).toBe('incidents.closedOnDelete');
    expect(deletedPayload.monitor).toBeNull();
  });

  it('returns 404 for unknown monitors and unauthorised callers get 401', async () => {
    const { app, headers } = await setup();
    expect((await app.request('/api/admin/monitors/999', { headers: { cookie: headers.cookie! } })).status).toBe(404);
    expect((await app.request('/api/admin/monitors')).status).toBe(401);
    expect(
      (await app.request('/api/admin/monitors/999', { method: 'DELETE', headers: { cookie: headers.cookie! } })).status,
    ).toBe(403);
  });

  it('exports a CSV report with formula-injection-safe cells', async () => {
    const { app, db, headers } = await setup();
    const created = await create(app, headers, baseMonitor);
    const id = ((await created.json()) as { monitor: { id: number } }).monitor.id;
    db.prepare(
      'INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, Date.now(), 'down', 503, null, '=SUM(A1:A2)');
    const response = await app.request(`/api/admin/monitors/${id}/export?range=24h`, {
      headers: { cookie: headers.cookie! },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const text = await response.text();
    expect(text).toContain('checked_at');
    expect(text).toContain("'=SUM(A1:A2)");
    expect((await app.request(`/api/admin/monitors/${id}/export`)).status).toBe(401);
  });
});

describe('manual checks', () => {
  it('returns 503 when no scheduler is attached', async () => {
    const { app, headers } = await setup();
    const created = await create(app, headers, baseMonitor);
    const id = ((await created.json()) as { monitor: { id: number } }).monitor.id;
    const response = await app.request(`/api/admin/monitors/${id}/check`, { method: 'POST', headers });
    expect(response.status).toBe(503);
  });
});
