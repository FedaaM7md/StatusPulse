/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type {
  Incident,
  IncidentStatus,
  IncidentUpdate,
} from '../../shared/types';

interface IncidentRow {
  id: number;
  monitor_id: number | null;
  title: string;
  title_ar: string | null;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  cause: string | null;
  status: IncidentStatus;
  severity: 'minor' | 'major';
  started_at: number;
  resolved_at: number | null;
  is_automatic: number;
  created_at: number;
  updated_at: number;
}

interface UpdateRow {
  id: number;
  incident_id: number;
  message: string | null;
  message_key: string | null;
  params: string | null;
  status: IncidentStatus;
  is_automatic: number;
  created_at: number;
}

function parseParams(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mapIncidentUpdate(row: UpdateRow): IncidentUpdate {
  return {
    id: row.id,
    incidentId: row.incident_id,
    message: row.message,
    messageKey: row.message_key,
    params: parseParams(row.params),
    status: row.status,
    isAutomatic: row.is_automatic === 1,
    createdAt: row.created_at,
  };
}

function updatesFor(db: Db, incidentId: number): IncidentUpdate[] {
  const rows = db
    .prepare('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC, id ASC')
    .all(incidentId) as UpdateRow[];
  return rows.map(mapIncidentUpdate);
}

export function mapIncident(row: IncidentRow, updates: IncidentUpdate[] = []): Incident {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    title: row.title,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    summaryAr: row.summary_ar,
    summaryEn: row.summary_en,
    cause: row.cause,
    status: row.status,
    severity: row.severity,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    isAutomatic: row.is_automatic === 1,
    createdAt: row.created_at,
    updates,
  };
}

export function listIncidents(
  db: Db,
  options: { status?: IncidentStatus | 'open'; monitorId?: number; limit?: number } = {},
): Incident[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.status === 'open') {
    where.push("status != 'resolved'");
  } else if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }
  if (options.monitorId !== undefined) {
    where.push('monitor_id = ?');
    params.push(options.monitorId);
  }
  const sql = `SELECT * FROM incidents ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as IncidentRow[];
  return rows.map((row) => mapIncident(row, updatesFor(db, row.id)));
}

export function getIncident(db: Db, id: number): Incident | null {
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as IncidentRow | undefined;
  if (!row) return null;
  return mapIncident(row, updatesFor(db, row.id));
}

export function findOpenIncident(db: Db, monitorId: number): Incident | null {
  const row = db
    .prepare("SELECT * FROM incidents WHERE monitor_id = ? AND status != 'resolved' ORDER BY started_at DESC LIMIT 1")
    .get(monitorId) as IncidentRow | undefined;
  if (!row) return null;
  return mapIncident(row, updatesFor(db, row.id));
}

export function countOpenIncidents(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status != 'resolved'").get() as { c: number };
  return row.c;
}

export interface CreateIncidentInput {
  monitorId: number;
  title: string;
  titleAr?: string | null;
  titleEn?: string | null;
  summaryAr?: string | null;
  summaryEn?: string | null;
  cause: string | null;
  severity?: 'minor' | 'major';
  automatic?: boolean;
  at?: number;
}

export function openIncident(db: Db, input: CreateIncidentInput): Incident {
  const now = input.at ?? Date.now();
  const automatic = input.automatic !== false;
  const result = db
    .prepare(
      `INSERT INTO incidents (monitor_id, title, title_ar, title_en, summary_ar, summary_en, cause, status, severity, started_at, resolved_at, is_automatic, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'investigating', ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      input.monitorId,
      input.title,
      input.titleAr ?? null,
      input.titleEn ?? null,
      input.summaryAr ?? null,
      input.summaryEn ?? null,
      input.cause,
      input.severity ?? 'major',
      now,
      automatic ? 1 : 0,
      now,
      now,
    );
  const id = Number(result.lastInsertRowid);
  addIncidentUpdate(db, id, {
    messageKey: 'incidents.autoOpened',
    params: {},
    status: 'investigating',
    automatic,
    at: now,
  });
  return getIncident(db, id)!;
}

export interface UpdateIncidentInput {
  message?: string | null;
  messageKey?: string | null;
  params?: Record<string, unknown> | null;
  status: IncidentStatus;
  automatic?: boolean;
  at?: number;
}

export function addIncidentUpdate(db: Db, incidentId: number, input: UpdateIncidentInput): IncidentUpdate {
  const now = input.at ?? Date.now();
  const automatic = input.automatic === true;
  const result = db
    .prepare(
      `INSERT INTO incident_updates (incident_id, message, message_key, params, status, is_automatic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      incidentId,
      input.message ?? null,
      input.messageKey ?? null,
      input.params ? JSON.stringify(input.params) : null,
      input.status,
      automatic ? 1 : 0,
      now,
    );
  const resolvedAt = input.status === 'resolved' ? now : null;
  if (input.status === 'resolved') {
    db.prepare("UPDATE incidents SET status = ?, resolved_at = COALESCE(resolved_at, ?), updated_at = ? WHERE id = ?").run(
      input.status,
      resolvedAt,
      now,
      incidentId,
    );
  } else {
    db.prepare("UPDATE incidents SET status = ?, resolved_at = NULL, updated_at = ? WHERE id = ?").run(
      input.status,
      now,
      incidentId,
    );
  }
  return mapIncidentUpdate(
    db.prepare('SELECT * FROM incident_updates WHERE id = ?').get(result.lastInsertRowid) as UpdateRow,
  );
}

export function resolveIncident(
  db: Db,
  incidentId: number,
  options: { at?: number; automatic?: boolean } = {},
): Incident | null {
  const incident = getIncident(db, incidentId);
  if (!incident) return null;
  if (incident.status === 'resolved') return incident;
  const now = options.at ?? Date.now();
  if (options.automatic !== false) {
    addIncidentUpdate(db, incidentId, {
      messageKey: 'incidents.resolvedAutomatically',
      params: {},
      status: 'resolved',
      automatic: true,
      at: now,
    });
  } else {
    db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = COALESCE(resolved_at, ?), updated_at = ? WHERE id = ?").run(
      now,
      now,
      incidentId,
    );
  }
  return getIncident(db, incidentId);
}

export function closeOpenIncidentForMonitor(
  db: Db,
  monitorId: number,
  at = Date.now(),
  automatic = true,
): Incident | null {
  const open = findOpenIncident(db, monitorId);
  if (!open) return null;
  return resolveIncident(db, open.id, { at, automatic });
}
