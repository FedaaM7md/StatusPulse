/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type {
  DnsRecordType,
  KeywordMode,
  Monitor,
  MonitorType,
  DisplayState,
} from '../../shared/types';

interface MonitorRow {
  id: number;
  name: string;
  type: MonitorType;
  url: string | null;
  host: string | null;
  port: number | null;
  record_type: DnsRecordType | null;
  expected_value: string | null;
  http_method: string;
  expected_status: number | null;
  keyword: string | null;
  keyword_mode: KeywordMode;
  latency_threshold_ms: number | null;
  ssl_warn_days: number;
  interval_seconds: number;
  timeout_ms: number;
  retries: number;
  group_name: string;
  enabled: number;
  allow_private: number;
  notes: string | null;
  current_state: DisplayState;
  last_checked_at: number | null;
  consecutive_failures: number;
  demo: number;
  public_name_ar: string | null;
  public_name_en: string | null;
  public_group_ar: string | null;
  public_group_en: string | null;
  created_at: number;
  updated_at: number;
}

export function mapMonitor(row: MonitorRow): Monitor {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    host: row.host,
    port: row.port,
    recordType: row.record_type,
    expectedValue: row.expected_value,
    httpMethod: row.http_method,
    expectedStatus: row.expected_status,
    keyword: row.keyword,
    keywordMode: row.keyword_mode,
    latencyThresholdMs: row.latency_threshold_ms,
    sslWarnDays: row.ssl_warn_days,
    intervalSeconds: row.interval_seconds,
    timeoutMs: row.timeout_ms,
    retries: row.retries,
    groupName: row.group_name,
    enabled: row.enabled === 1,
    allowPrivate: row.allow_private === 1,
    notes: row.notes,
    currentState: row.current_state,
    lastCheckedAt: row.last_checked_at,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    demo: row.demo === 1,
    publicNameAr: row.public_name_ar,
    publicNameEn: row.public_name_en,
    publicGroupAr: row.public_group_ar,
    publicGroupEn: row.public_group_en,
  };
}

export function listMonitors(db: Db, options: { enabledOnly?: boolean } = {}): Monitor[] {
  const sql = options.enabledOnly
    ? 'SELECT * FROM monitors WHERE enabled = 1 ORDER BY group_name ASC, name ASC'
    : 'SELECT * FROM monitors ORDER BY group_name ASC, name ASC';
  return (db.prepare(sql).all() as MonitorRow[]).map(mapMonitor);
}

export function getMonitor(db: Db, id: number): Monitor | null {
  const row = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined;
  return row ? mapMonitor(row) : null;
}

export interface MonitorInput {
  name: string;
  type: MonitorType;
  url: string | null;
  host: string | null;
  port: number | null;
  recordType: DnsRecordType | null;
  expectedValue: string | null;
  httpMethod: string;
  expectedStatus: number | null;
  keyword: string | null;
  keywordMode: KeywordMode;
  latencyThresholdMs: number | null;
  sslWarnDays: number;
  intervalSeconds: number;
  timeoutMs: number;
  retries: number;
  groupName: string;
  enabled: boolean;
  allowPrivate: boolean;
  notes: string | null;
}

function normalise(input: MonitorInput): MonitorInput {
  const groupName = input.groupName.trim() || 'General';
  const base: MonitorInput = {
    ...input,
    name: input.name.trim(),
    groupName,
    notes: input.notes?.trim() || null,
    keyword: input.keyword?.trim() || null,
    expectedValue: input.expectedValue?.trim() || null,
  };

  if (base.type === 'http') {
    base.url = base.url?.trim() || null;
    base.host = null;
    base.port = null;
    base.recordType = null;
    base.expectedValue = null;
  } else if (base.type === 'tcp') {
    base.url = null;
    base.recordType = null;
    base.expectedValue = null;
    base.keyword = null;
    base.keywordMode = 'none';
    base.expectedStatus = null;
  } else if (base.type === 'dns') {
    base.url = null;
    base.port = null;
    base.keyword = null;
    base.keywordMode = 'none';
    base.expectedStatus = null;
  } else if (base.type === 'ssl') {
    base.url = null;
    base.recordType = null;
    base.expectedValue = null;
    base.keyword = null;
    base.keywordMode = 'none';
    base.expectedStatus = null;
    base.port = base.port ?? 443;
  }

  if (base.type !== 'http') {
    base.httpMethod = 'GET';
  }

  return base;
}

export function createMonitor(db: Db, input: MonitorInput, now = Date.now()): Monitor {
  const value = normalise(input);
  const result = db
    .prepare(
      `INSERT INTO monitors (
        name, type, url, host, port, record_type, expected_value, http_method,
        expected_status, keyword, keyword_mode, latency_threshold_ms, ssl_warn_days,
        interval_seconds, timeout_ms, retries, group_name, enabled, allow_private,
        notes, current_state, last_checked_at, consecutive_failures, demo, created_at, updated_at
      ) VALUES (
        @name, @type, @url, @host, @port, @recordType, @expectedValue, @httpMethod,
        @expectedStatus, @keyword, @keywordMode, @latencyThresholdMs, @sslWarnDays,
        @intervalSeconds, @timeoutMs, @retries, @groupName, @enabled, @allowPrivate,
        @notes, 'unknown', NULL, 0, 0, @now, @now
      )`,
    )
    .run({
      ...value,
      enabled: value.enabled ? 1 : 0,
      allowPrivate: value.allowPrivate ? 1 : 0,
      now,
    });
  return getMonitor(db, Number(result.lastInsertRowid))!;
}

export function updateMonitor(db: Db, id: number, input: MonitorInput, now = Date.now()): Monitor | null {
  const existing = getMonitor(db, id);
  if (!existing) return null;
  const value = normalise(input);
  db.prepare(
    `UPDATE monitors SET
      name = @name, type = @type, url = @url, host = @host, port = @port,
      record_type = @recordType, expected_value = @expectedValue, http_method = @httpMethod,
      expected_status = @expectedStatus, keyword = @keyword, keyword_mode = @keywordMode,
      latency_threshold_ms = @latencyThresholdMs, ssl_warn_days = @sslWarnDays,
      interval_seconds = @intervalSeconds, timeout_ms = @timeoutMs, retries = @retries,
      group_name = @groupName, enabled = @enabled, allow_private = @allowPrivate,
      notes = @notes, updated_at = @now
    WHERE id = @id`,
  ).run({
    ...value,
    enabled: value.enabled ? 1 : 0,
    allowPrivate: value.allowPrivate ? 1 : 0,
    now,
    id,
  });
  return getMonitor(db, id);
}

export function deleteMonitor(db: Db, id: number): boolean {
  const result = db.prepare('DELETE FROM monitors WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setMonitorResult(
  db: Db,
  id: number,
  state: DisplayState,
  checkedAt: number,
  failures: number,
): void {
  db.prepare('UPDATE monitors SET current_state = ?, last_checked_at = ?, consecutive_failures = ? WHERE id = ?').run(
    state,
    checkedAt,
    failures,
    id,
  );
}
