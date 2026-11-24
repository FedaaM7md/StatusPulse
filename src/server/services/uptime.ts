/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { CheckState } from '../../shared/types';
import type { Db } from '../db';

export const UPTIME_WEIGHT: Record<CheckState, number> = {
  up: 1,
  degraded: 0.5,
  down: 0,
};

export function roundUptime(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Weighted uptime: up = 1, degraded = 0.5, down = 0. */
export function uptimeFromStates(states: Iterable<CheckState>): number | null {
  let total = 0;
  let score = 0;
  for (const state of states) {
    total += 1;
    score += UPTIME_WEIGHT[state];
  }
  if (total === 0) return null;
  return roundUptime((score / total) * 100);
}

export interface UptimeStats {
  uptime: number | null;
  checks: number;
  downChecks: number;
  avgLatencyMs: number | null;
}

interface AggregateRow {
  checks: number;
  score: number | null;
  down_checks: number | null;
  avg_latency: number | null;
}

const MAINTENANCE_EXCLUSION = `
  AND NOT EXISTS (
    SELECT 1 FROM maintenance_windows w
    WHERE w.starts_at <= check_results.checked_at
      AND w.ends_at > check_results.checked_at
      AND (w.monitor_id IS NULL OR w.monitor_id = check_results.monitor_id)
  )`;

export function getUptimeStats(db: Db, monitorId: number, sinceMs: number, now = Date.now()): UptimeStats {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS checks,
        SUM(CASE state WHEN 'up' THEN 1.0 WHEN 'degraded' THEN 0.5 ELSE 0 END) AS score,
        SUM(CASE state WHEN 'down' THEN 1 ELSE 0 END) AS down_checks,
        AVG(latency_ms) AS avg_latency
      FROM check_results
      WHERE monitor_id = ? AND checked_at >= ? AND checked_at <= ?${MAINTENANCE_EXCLUSION}`,
    )
    .get(monitorId, sinceMs, now) as AggregateRow;

  const checks = row?.checks ?? 0;
  return {
    uptime: checks > 0 && row.score !== null ? roundUptime((row.score / checks) * 100) : null,
    checks,
    downChecks: row?.down_checks ?? 0,
    avgLatencyMs: row?.avg_latency === null || row?.avg_latency === undefined ? null : Math.round(row.avg_latency),
  };
}

export function dayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export interface DailyUptime {
  date: string;
  uptime: number | null;
}

/** Pure helper used by tests: buckets results into UTC calendar days. */
export function dailyBuckets(
  rows: Array<{ checkedAt: number; state: CheckState }>,
  days: number,
  now: number,
): DailyUptime[] {
  const buckets = new Map<string, CheckState[]>();
  for (const row of rows) {
    const key = dayKey(row.checkedAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row.state);
    else buckets.set(key, [row.state]);
  }

  const result: DailyUptime[] = [];
  const today = new Date(now);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() - offset);
    const key = dayKey(cursor.getTime());
    const states = buckets.get(key) ?? [];
    result.push({ date: key, uptime: uptimeFromStates(states) });
  }
  return result;
}

export function getDailyUptime(db: Db, monitorId: number, days: number, now = Date.now()): DailyUptime[] {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const rows = db
    .prepare(
      `SELECT
        date(CAST(checked_at / 1000 AS INTEGER), 'unixepoch') AS day,
        COUNT(*) AS checks,
        SUM(CASE state WHEN 'up' THEN 1.0 WHEN 'degraded' THEN 0.5 ELSE 0 END) AS score
      FROM check_results
      WHERE monitor_id = ? AND checked_at >= ? AND checked_at <= ?${MAINTENANCE_EXCLUSION}
      GROUP BY day
      ORDER BY day ASC`,
    )
    .all(monitorId, start.getTime(), now) as Array<{ day: string; checks: number; score: number | null }>;

  const map = new Map(rows.map((row) => [row.day, row]));
  const result: DailyUptime[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(start);
    cursor.setUTCDate(start.getUTCDate() + (days - 1 - offset));
    const key = dayKey(cursor.getTime());
    const matched = map.get(key);
    result.push({
      date: key,
      uptime:
        matched && matched.checks > 0 && matched.score !== null
          ? roundUptime((matched.score / matched.checks) * 100)
          : null,
    });
  }
  return result;
}

export function overallUptime(statsList: UptimeStats[]): number | null {
  const withData = statsList.filter((stats) => stats.uptime !== null);
  if (withData.length === 0) return null;
  const total = withData.reduce((sum, stats) => sum + stats.uptime!, 0);
  return roundUptime(total / withData.length);
}
