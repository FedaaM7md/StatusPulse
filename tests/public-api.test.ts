import { describe, expect, it } from 'vitest';
import type { PublicStatusResponse } from '../src/shared/types';
import { addIncidentUpdate, openIncident } from '../src/server/services/incidents';
import { createMaintenanceWindow } from '../src/server/services/maintenance';
import { createMonitor } from '../src/server/services/monitors';
import { updateSettings } from '../src/server/services/settings';
import { makeApp, testDb } from './helpers';

const NOW = Date.now();

function setup() {
  const db = testDb();
  const { app } = makeApp(db);
  const monitor = createMonitor(
    db,
    {
      name: 'Public website',
      type: 'http',
      url: 'https://secret-target.example/health',
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
      groupName: 'Website',
      enabled: true,
      allowPrivate: false,
      notes: 'internal note',
    },
    NOW,
  );
  const insert = db.prepare(
    'INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms) VALUES (?, ?, ?, 200, 90)',
  );
  insert.run(monitor.id, NOW - 3 * 60 * 60 * 1000, 'up');
  insert.run(monitor.id, NOW - 2 * 60 * 60 * 1000, 'up');
  insert.run(monitor.id, NOW - 1 * 60 * 60 * 1000, 'down');
  insert.run(monitor.id, NOW - 30 * 60 * 1000, 'up');
  db.prepare("UPDATE monitors SET current_state = 'degraded' WHERE id = ?").run(monitor.id);

  const incident = openIncident(db, {
    monitorId: monitor.id,
    title: monitor.name,
    cause: 'Unexpected HTTP status 503.',
    severity: 'major',
    at: NOW - 60 * 60 * 1000,
  });
  addIncidentUpdate(db, incident.id, {
    message: 'Engineers are investigating.',
    status: 'identified',
    at: NOW - 30 * 60 * 1000,
  });

  createMaintenanceWindow(
    db,
    { title: 'Planned upgrade', startsAt: NOW + 60 * 60 * 1000, endsAt: NOW + 2 * 60 * 60 * 1000, monitorId: null },
    NOW,
  );

  return { db, app, monitor };
}

describe('public status API', () => {
  it('returns grouped components with uptime data and no private target details', async () => {
    const { app } = setup();
    const response = await app.request('/api/public/status');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('secret-target.example');
    expect(text).not.toContain('internal note');

    const data = JSON.parse(text) as PublicStatusResponse;
    expect(data.publicPageEnabled).toBe(true);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]!.name).toBe('Website');
    expect(data.groups[0]!.displayName).toEqual({ ar: 'Website', en: 'Website' });
    const monitor = data.groups[0]!.monitors[0]!;
    expect(monitor.name).toBe('Public website');
    expect(monitor.displayName).toEqual({ ar: 'Public website', en: 'Public website' });
    expect(monitor.state).toBe('degraded');
    expect(monitor.uptime24h).toBe(75);
    expect(monitor.days).toHaveLength(90);
    expect(data.activeIncidents).toHaveLength(1);
    expect(data.activeIncidents[0]!.title).toBe('Public website');
    expect(data.activeIncidents[0]!.updates).toHaveLength(2);
    expect(data.maintenance).toHaveLength(1);
    expect(data.maintenance[0]!.active).toBe(false);
    expect(data.overallState).toBe('down');
  });

  it('hides component data when the public page is disabled', async () => {
    const { app, db } = setup();
    updateSettings(db, { publicPageEnabled: false });
    const response = await app.request('/api/public/status');
    const data = (await response.json()) as PublicStatusResponse;
    expect(data.publicPageEnabled).toBe(false);
    expect(data.groups).toHaveLength(0);
    expect(data.activeIncidents).toHaveLength(0);
    const incidents = await app.request('/api/public/incidents');
    const payload = (await incidents.json()) as { incidents: unknown[] };
    expect(payload.incidents).toHaveLength(0);
  });

  it('marks a component as maintenance during an active window', async () => {
    const { app, db, monitor } = setup();
    createMaintenanceWindow(
      db,
      { title: 'Active window', startsAt: NOW - 1000, endsAt: NOW + 60 * 60 * 1000, monitorId: monitor.id },
      NOW,
    );
    const data = (await (await app.request('/api/public/status')).json()) as PublicStatusResponse;
    const component = data.groups[0]!.monitors[0]!;
    expect(component.state).toBe('maintenance');
    expect(data.maintenance.some((window) => window.active)).toBe(true);
  });

  it('exposes a health endpoint', async () => {
    const { app } = setup();
    const response = await app.request('/api/public/healthz');
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean };
    expect(payload.ok).toBe(true);
  });
});
