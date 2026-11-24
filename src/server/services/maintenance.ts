/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type { MaintenanceWindow } from '../../shared/types';

interface Row {
  id: number;
  title: string;
  title_ar: string | null;
  title_en: string | null;
  starts_at: number;
  ends_at: number;
  monitor_id: number | null;
  created_at: number;
}

function map(row: Row): MaintenanceWindow {
  return {
    id: row.id,
    title: row.title,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    monitorId: row.monitor_id,
    createdAt: row.created_at,
  };
}

export function listMaintenanceWindows(db: Db): MaintenanceWindow[] {
  const rows = db
    .prepare('SELECT * FROM maintenance_windows ORDER BY starts_at DESC')
    .all() as Row[];
  return rows.map(map);
}

export function getMaintenanceWindow(db: Db, id: number): MaintenanceWindow | null {
  const row = db.prepare('SELECT * FROM maintenance_windows WHERE id = ?').get(id) as Row | undefined;
  return row ? map(row) : null;
}

export function createMaintenanceWindow(
  db: Db,
  input: {
    title: string;
    titleAr?: string | null;
    titleEn?: string | null;
    startsAt: number;
    endsAt: number;
    monitorId: number | null;
  },
  now = Date.now(),
): MaintenanceWindow {
  const result = db
    .prepare(
      'INSERT INTO maintenance_windows (title, title_ar, title_en, starts_at, ends_at, monitor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.title.trim(),
      input.titleAr?.trim() || null,
      input.titleEn?.trim() || null,
      input.startsAt,
      input.endsAt,
      input.monitorId,
      now,
    );
  return getMaintenanceWindow(db, Number(result.lastInsertRowid))!;
}

export function deleteMaintenanceWindow(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM maintenance_windows WHERE id = ?').run(id).changes > 0;
}

/**
 * A window is active when startsAt <= at < endsAt. Windows with monitorId null
 * apply to every monitor. Half-open boundaries prevent double counting.
 */
export function windowIsActive(window: MaintenanceWindow, at: number): boolean {
  return window.startsAt <= at && window.endsAt > at;
}

export function activeWindowsFor(
  windows: MaintenanceWindow[],
  monitorId: number,
  at: number,
): MaintenanceWindow[] {
  return windows.filter(
    (window) => windowIsActive(window, at) && (window.monitorId === null || window.monitorId === monitorId),
  );
}

export function isUnderMaintenance(
  db: Db,
  monitorId: number,
  at = Date.now(),
  windows?: MaintenanceWindow[],
): boolean {
  const list = windows ?? listMaintenanceWindows(db);
  return activeWindowsFor(list, monitorId, at).length > 0;
}

export function windowState(window: MaintenanceWindow, at: number): 'active' | 'upcoming' | 'past' {
  if (windowIsActive(window, at)) return 'active';
  return window.startsAt > at ? 'upcoming' : 'past';
}
