import { describe, expect, it } from 'vitest';
import {
  addIncidentUpdate,
  closeOpenIncidentForMonitor,
  countOpenIncidents,
  findOpenIncident,
  getIncident,
  listIncidents,
  openIncident,
  resolveIncident,
} from '../src/server/services/incidents';
import { createMonitor } from '../src/server/services/monitors';
import { testDb } from './helpers';

const NOW = 1_800_000_000_000;

function makeMonitor(db: ReturnType<typeof testDb>, name = 'API') {
  return createMonitor(
    db,
    {
      name,
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
      groupName: 'Platform',
      enabled: true,
      allowPrivate: false,
      notes: null,
    },
    NOW,
  );
}

describe('incident lifecycle', () => {
  it('opens an incident with an automatic investigating update', () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    const incident = openIncident(db, {
      monitorId: monitor.id,
      title: monitor.name,
      cause: 'Unexpected HTTP status 503.',
      severity: 'major',
      at: NOW,
    });
    expect(incident.status).toBe('investigating');
    expect(incident.severity).toBe('major');
    expect(incident.resolvedAt).toBeNull();
    expect(incident.updates).toHaveLength(1);
    expect(incident.updates[0]!.messageKey).toBe('incidents.autoOpened');
    expect(incident.updates[0]!.isAutomatic).toBe(true);
    expect(findOpenIncident(db, monitor.id)?.id).toBe(incident.id);
    expect(countOpenIncidents(db)).toBe(1);
  });

  it('posts manual updates and resolves with a status change', () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    const incident = openIncident(db, { monitorId: monitor.id, title: monitor.name, cause: null, at: NOW });

    addIncidentUpdate(db, incident.id, {
      message: 'We are investigating elevated error rates.',
      status: 'identified',
      at: NOW + 1000,
    });
    let current = getIncident(db, incident.id)!;
    expect(current.status).toBe('identified');
    expect(current.resolvedAt).toBeNull();
    expect(current.updates).toHaveLength(2);

    addIncidentUpdate(db, incident.id, { message: 'Resolved.', status: 'resolved', at: NOW + 2000 });
    current = getIncident(db, incident.id)!;
    expect(current.status).toBe('resolved');
    expect(current.resolvedAt).toBe(NOW + 2000);
    expect(countOpenIncidents(db)).toBe(0);
  });

  it('clears resolved_at when an incident is reopened', () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    const incident = openIncident(db, { monitorId: monitor.id, title: monitor.name, cause: null, at: NOW });
    addIncidentUpdate(db, incident.id, { message: 'Resolved.', status: 'resolved', at: NOW + 1000 });
    addIncidentUpdate(db, incident.id, { message: 'It happened again.', status: 'investigating', at: NOW + 2000 });
    const current = getIncident(db, incident.id)!;
    expect(current.status).toBe('investigating');
    expect(current.resolvedAt).toBeNull();
  });

  it('auto-resolves once and does not append duplicate updates', () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    const incident = openIncident(db, { monitorId: monitor.id, title: monitor.name, cause: null, at: NOW });
    const resolved = resolveIncident(db, incident.id, { at: NOW + 5000, automatic: true })!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.updates.at(-1)!.messageKey).toBe('incidents.resolvedAutomatically');
    const again = resolveIncident(db, incident.id, { at: NOW + 6000, automatic: true })!;
    expect(again.updates).toHaveLength(resolved.updates.length);
  });

  it('closes the open incident for a monitor and returns null when none exists', () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    expect(closeOpenIncidentForMonitor(db, monitor.id, NOW)).toBeNull();
    openIncident(db, { monitorId: monitor.id, title: monitor.name, cause: null, at: NOW });
    const closed = closeOpenIncidentForMonitor(db, monitor.id, NOW + 1000)!;
    expect(closed.status).toBe('resolved');
    expect(closed.resolvedAt).toBe(NOW + 1000);
    expect(findOpenIncident(db, monitor.id)).toBeNull();
  });

  it('filters and limits incident lists', () => {
    const db = testDb();
    const first = makeMonitor(db, 'First');
    const second = makeMonitor(db, 'Second');
    openIncident(db, { monitorId: first.id, title: first.name, cause: null, at: NOW });
    const resolved = openIncident(db, { monitorId: second.id, title: second.name, cause: null, at: NOW + 1000 });
    addIncidentUpdate(db, resolved.id, { message: 'Fixed', status: 'resolved', at: NOW + 2000 });

    expect(listIncidents(db, { status: 'open' })).toHaveLength(1);
    expect(listIncidents(db, { status: 'resolved' })).toHaveLength(1);
    expect(listIncidents(db, { monitorId: first.id })).toHaveLength(1);
    expect(listIncidents(db, { limit: 1 })).toHaveLength(1);
    expect(getIncident(db, 999)).toBeNull();
  });
});
