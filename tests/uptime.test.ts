import { describe, expect, it } from 'vitest';
import type { CheckState } from '../src/shared/types';
import {
  dailyBuckets,
  getDailyUptime,
  getUptimeStats,
  overallUptime,
  roundUptime,
  uptimeFromStates,
} from '../src/server/services/uptime';
import { createMaintenanceWindow } from '../src/server/services/maintenance';
import { testDb } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('uptime math', () => {
  it('returns null with no checks', () => {
    expect(uptimeFromStates([])).toBeNull();
  });

  it('counts up as 100% and down as 0%', () => {
    expect(uptimeFromStates(['up', 'up', 'up'])).toBe(100);
    expect(uptimeFromStates(['down', 'down'])).toBe(0);
  });

  it('counts degraded as half', () => {
    expect(uptimeFromStates(['up', 'degraded'])).toBe(75);
    expect(uptimeFromStates(['degraded', 'degraded', 'down', 'up'])).toBe(50);
  });

  it('rounds to two decimal places', () => {
    expect(uptimeFromStates(['up', 'up', 'down'])).toBe(66.67);
    expect(roundUptime(99.999)).toBe(100);
  });

  it('averages only monitors with data', () => {
    expect(overallUptime([])).toBeNull();
    expect(
      overallUptime([
        { uptime: 100, checks: 1, downChecks: 0, avgLatencyMs: null },
        { uptime: 50, checks: 1, downChecks: 0, avgLatencyMs: null },
        { uptime: null, checks: 0, downChecks: 0, avgLatencyMs: null },
      ]),
    ).toBe(75);
  });
});

describe('daily buckets', () => {
  const now = Date.UTC(2026, 10, 24, 12, 0, 0);

  it('produces one aligned bucket per day in UTC', () => {
    const buckets = dailyBuckets([], 3, now);
    expect(buckets.map((bucket) => bucket.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(buckets.every((bucket) => bucket.uptime === null)).toBe(true);
  });

  it('weights states inside the correct day', () => {
    const rows: Array<{ checkedAt: number; state: CheckState }> = [
      { checkedAt: Date.UTC(2026, 10, 22, 1), state: 'up' },
      { checkedAt: Date.UTC(2026, 10, 22, 2), state: 'down' },
      { checkedAt: Date.UTC(2026, 10, 23, 1), state: 'up' },
      { checkedAt: Date.UTC(2026, 10, 23, 2), state: 'degraded' },
    ];
    const buckets = dailyBuckets(rows, 3, now);
    expect(buckets[0]!.uptime).toBe(50);
    expect(buckets[1]!.uptime).toBe(75);
    expect(buckets[2]!.uptime).toBeNull();
  });
});

describe('database uptime aggregates', () => {
  it('excludes results inside maintenance windows', () => {
    const db = testDb();
    const now = Date.UTC(2026, 10, 24, 12);
    db.prepare(
      `INSERT INTO monitors (name, type, url, interval_seconds, timeout_ms, retries, group_name, enabled, allow_private, current_state, created_at, updated_at)
       VALUES ('M', 'http', 'https://example.com', 60, 5000, 1, 'G', 1, 0, 'up', ?, ?)`,
    ).run(now - DAY, now);
    const monitorId = (db.prepare('SELECT id FROM monitors').get() as { id: number }).id;
    const insert = db.prepare(
      'INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms) VALUES (?, ?, ?, 200, 100)',
    );
    insert.run(monitorId, now - 5 * 60 * 1000, 'down');
    insert.run(monitorId, now - 4 * 60 * 1000, 'up');
    insert.run(monitorId, now - 3 * 60 * 1000, 'up');
    insert.run(monitorId, now - 2 * 60 * 1000, 'up');

    const before = getUptimeStats(db, monitorId, now - DAY, now);
    expect(before.uptime).toBe(75);
    expect(before.checks).toBe(4);
    expect(before.downChecks).toBe(1);

    createMaintenanceWindow(
      db,
      { title: 'Upgrade', startsAt: now - 6 * 60 * 1000, endsAt: now - 4.5 * 60 * 1000, monitorId: null },
      now,
    );

    const after = getUptimeStats(db, monitorId, now - DAY, now);
    expect(after.checks).toBe(3);
    expect(after.uptime).toBe(100);
  });

  it('computes 90-day daily bars from stored results', () => {
    const db = testDb();
    const now = Date.UTC(2026, 10, 24, 12);
    db.prepare(
      `INSERT INTO monitors (name, type, url, interval_seconds, timeout_ms, retries, group_name, enabled, allow_private, current_state, created_at, updated_at)
       VALUES ('M', 'http', 'https://example.com', 60, 5000, 1, 'G', 1, 0, 'up', ?, ?)`,
    ).run(now - DAY, now);
    const monitorId = (db.prepare('SELECT id FROM monitors').get() as { id: number }).id;
    const insert = db.prepare(
      'INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms) VALUES (?, ?, ?, 200, 100)',
    );
    insert.run(monitorId, now - DAY, 'down');
    insert.run(monitorId, now, 'up');

    const bars = getDailyUptime(db, monitorId, 3, now);
    expect(bars).toHaveLength(3);
    expect(bars[0]!.date).toBe('2026-11-22');
    expect(bars[1]!.uptime).toBe(0);
    expect(bars[2]!.uptime).toBe(100);
  });
});
