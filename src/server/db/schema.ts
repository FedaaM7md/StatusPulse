/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  success INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_password_resets_expiry ON password_resets(expires_at);

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'dns', 'ssl')),
  url TEXT,
  host TEXT,
  port INTEGER,
  record_type TEXT,
  expected_value TEXT,
  http_method TEXT NOT NULL DEFAULT 'GET',
  expected_status INTEGER,
  keyword TEXT,
  keyword_mode TEXT NOT NULL DEFAULT 'none',
  latency_threshold_ms INTEGER,
  ssl_warn_days INTEGER NOT NULL DEFAULT 14,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  retries INTEGER NOT NULL DEFAULT 1,
  group_name TEXT NOT NULL DEFAULT 'General',
  enabled INTEGER NOT NULL DEFAULT 1,
  allow_private INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  current_state TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  public_name_ar TEXT,
  public_name_en TEXT,
  public_group_ar TEXT,
  public_group_en TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(enabled, last_checked_at);

CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('up', 'degraded', 'down')),
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_results_monitor_time ON check_results(monitor_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER REFERENCES monitors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_ar TEXT,
  title_en TEXT,
  summary_ar TEXT,
  summary_en TEXT,
  cause TEXT,
  status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  severity TEXT NOT NULL DEFAULT 'major' CHECK (severity IN ('minor', 'major')),
  started_at INTEGER NOT NULL,
  resolved_at INTEGER,
  is_automatic INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents(monitor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  message TEXT,
  message_key TEXT,
  params TEXT,
  status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  is_automatic INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_updates ON incident_updates(incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_ar TEXT,
  title_en TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maintenance_time ON maintenance_windows(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER,
  incident_id INTEGER,
  level TEXT NOT NULL CHECK (level IN ('info', 'success', 'warning', 'error')),
  message_key TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_time ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  summary TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
