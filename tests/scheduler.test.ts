import { describe, expect, it, vi } from 'vitest';
import type { CheckState } from '../src/shared/types';
import type { CheckContext, CheckOutcome } from '../src/server/checks/types';
import { silentLogger } from '../src/server/lib/logger';
import { Scheduler } from '../src/server/services/scheduler';
import { createMaintenanceWindow } from '../src/server/services/maintenance';
import { createMonitor } from '../src/server/services/monitors';
import { testConfig, testDb } from './helpers';

const NOW = 1_800_000_000_000;

function makeMonitor(db: ReturnType<typeof testDb>, overrides: { enabled?: boolean; retries?: number } = {}) {
  return createMonitor(
    db,
    {
      name: 'API',
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
      retries: overrides.retries ?? 1,
      groupName: 'Platform',
      enabled: overrides.enabled ?? true,
      allowPrivate: false,
      notes: null,
    },
    NOW,
  );
}

function outcome(state: CheckState, at: number): CheckOutcome {
  return {
    state,
    latencyMs: state === 'up' ? 80 : null,
    statusCode: state === 'up' ? 200 : 503,
    error: state === 'up' ? null : 'Unexpected HTTP status 503.',
    detail: { mocked: true },
    checkedAt: at,
  };
}

function makeScheduler(
  db: ReturnType<typeof testDb>,
  runCheck: (monitor: unknown, ctx: CheckContext) => Promise<CheckOutcome>,
  getNow: () => number,
) {
  return new Scheduler({
    db,
    config: testConfig(),
    logger: silentLogger(),
    now: getNow,
    runCheck: runCheck as never,
    retryDelayMs: 0,
    sleep: async () => {},
    concurrency: 1,
  });
}

describe('scheduler ticks', () => {
  it('runs due checks, stores results and opens an incident on failure', async () => {
    const db = testDb();
    makeMonitor(db, { retries: 0 });
    let clock = NOW;
    let state: CheckState = 'down';
    const runCheck = vi.fn(async () => outcome(state, clock));
    const scheduler = makeScheduler(db, runCheck, () => clock);

    const first = await scheduler.tick(clock);
    expect(first.checked).toBe(1);
    expect(runCheck).toHaveBeenCalledTimes(1);

    const monitor = db.prepare('SELECT current_state, last_checked_at FROM monitors').get() as {
      current_state: string;
      last_checked_at: number;
    };
    expect(monitor.current_state).toBe('down');
    expect(monitor.last_checked_at).toBe(NOW);

    const results = db.prepare('SELECT state, status_code FROM check_results').all() as Array<{
      state: string;
      status_code: number;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ state: 'down', status_code: 503 });

    const incidents = db.prepare('SELECT status FROM incidents').all() as Array<{ status: string }>;
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.status).toBe('investigating');

    const notifications = db.prepare('SELECT message_key, level FROM notifications').all() as Array<{
      message_key: string;
      level: string;
    }>;
    expect(notifications.some((item) => item.message_key === 'notifications.event.monitorDown')).toBe(true);

    // Not due again within the interval.
    const second = await scheduler.tick(NOW + 30_000);
    expect(second.checked).toBe(0);
    expect(runCheck).toHaveBeenCalledTimes(1);

    // Recovery closes the incident and records a success notification.
    state = 'up';
    clock = NOW + 61_000;
    const third = await scheduler.tick(clock);
    expect(third.checked).toBe(1);
    expect(third.results[0]!.incidentClosed).not.toBeNull();

    const incident = db.prepare('SELECT status, resolved_at FROM incidents').get() as {
      status: string;
      resolved_at: number;
    };
    expect(incident.status).toBe('resolved');
    expect(incident.resolved_at).toBe(clock);

    const recovered = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE message_key = 'notifications.event.monitorRecovered'")
      .get() as { c: number };
    expect(recovered.c).toBe(1);
  });

  it('retries before recording a final result', async () => {
    const db = testDb();
    makeMonitor(db, { retries: 1 });
    let clock = NOW;
    let calls = 0;
    const runCheck = vi.fn(async () => {
      calls += 1;
      return outcome(calls === 1 ? 'down' : 'up', clock);
    });
    const scheduler = makeScheduler(db, runCheck, () => clock);
    const result = await scheduler.tick(clock);
    expect(calls).toBe(2);
    expect(result.results[0]!.state).toBe('up');
    const rows = db.prepare('SELECT state FROM check_results').all() as Array<{ state: string }>;
    expect(rows).toEqual([{ state: 'up' }]);
    const incidents = db.prepare('SELECT COUNT(*) AS c FROM incidents').get() as { c: number };
    expect(incidents.c).toBe(0);
  });

  it('suppresses incidents during maintenance but keeps history', async () => {
    const db = testDb();
    const monitor = makeMonitor(db);
    createMaintenanceWindow(
      db,
      { title: 'Upgrade', startsAt: NOW - 1000, endsAt: NOW + 10 * 60 * 1000, monitorId: null },
      NOW,
    );
    let clock = NOW;
    const runCheck = vi.fn(async () => outcome('down', clock));
    const scheduler = makeScheduler(db, runCheck, () => clock);

    const result = await scheduler.tick(clock);
    expect(result.checked).toBe(1);
    const incidents = db.prepare('SELECT COUNT(*) AS c FROM incidents').get() as { c: number };
    expect(incidents.c).toBe(0);
    const results = db.prepare('SELECT COUNT(*) AS c FROM check_results').get() as { c: number };
    expect(results.c).toBe(1);
    const suppressed = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE message_key = 'notifications.event.maintenanceSuppressed'")
      .get() as { c: number };
    expect(suppressed.c).toBe(1);
    void monitor;
  });

  it('skips disabled monitors and exposes manual runs', async () => {
    const db = testDb();
    const monitor = makeMonitor(db, { enabled: false });
    let clock = NOW;
    const runCheck = vi.fn(async () => outcome('up', clock));
    const scheduler = makeScheduler(db, runCheck, () => clock);

    const tick = await scheduler.tick(clock);
    expect(tick.checked).toBe(0);

    const manual = await scheduler.runNow(monitor.id);
    expect(manual?.state).toBe('up');
    expect(runCheck).toHaveBeenCalledTimes(1);
  });

  it('uses the global allow-private setting together with the monitor flag', async () => {
    const db = testDb();
    makeMonitor(db);
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'allow_private_targets'").run();
    let clock = NOW;
    const seen: CheckContext[] = [];
    const runCheck = vi.fn(async (_monitor: unknown, ctx: CheckContext) => {
      seen.push(ctx);
      return outcome('up', clock);
    });
    const scheduler = makeScheduler(db, runCheck, () => clock);
    await scheduler.tick(clock);
    expect(seen[0]!.allowPrivate).toBe(false);
  });
});
