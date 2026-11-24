/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db';
import type { NotificationEntry } from '../../shared/types';

export type NotificationLevel = NotificationEntry['level'];

interface Row {
  id: number;
  monitor_id: number | null;
  incident_id: number | null;
  level: NotificationLevel;
  message_key: string;
  params: string;
  created_at: number;
  read: number;
  monitor_name: string | null;
  monitor_public_name_ar: string | null;
  monitor_public_name_en: string | null;
}

const SELECT_NOTIFICATION = `
  SELECT n.*, m.name AS monitor_name, m.public_name_ar AS monitor_public_name_ar,
         m.public_name_en AS monitor_public_name_en
  FROM notifications n
  LEFT JOIN monitors m ON m.id = n.monitor_id
`;

function map(row: Row): NotificationEntry {
  let params: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.params);
    if (parsed && typeof parsed === 'object') params = parsed as Record<string, unknown>;
  } catch {
    params = {};
  }
  return {
    id: row.id,
    monitorId: row.monitor_id,
    incidentId: row.incident_id,
    level: row.level,
    messageKey: row.message_key,
    params,
    monitor:
      row.monitor_id !== null && row.monitor_name
        ? {
            id: row.monitor_id,
            name: row.monitor_name,
            displayNameAr: row.monitor_public_name_ar,
            displayNameEn: row.monitor_public_name_en,
          }
        : null,
    createdAt: row.created_at,
    read: row.read === 1,
  };
}

export interface NotifyInput {
  monitorId?: number | null;
  incidentId?: number | null;
  level: NotificationLevel;
  messageKey: string;
  params?: Record<string, unknown>;
}

/**
 * Store a notification for the on-screen centre and append a JSON line to the
 * local log file. Webhook delivery is handled separately and is off by default.
 */
export function notify(
  db: Db,
  input: NotifyInput,
  options: { at?: number; logPath?: string | null } = {},
): NotificationEntry {
  const now = options.at ?? Date.now();
  const params = input.params ?? {};
  const result = db
    .prepare(
      `INSERT INTO notifications (monitor_id, incident_id, level, message_key, params, created_at, read)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      input.monitorId ?? null,
      input.incidentId ?? null,
      input.level,
      input.messageKey,
      JSON.stringify(params),
      now,
    );

  if (options.logPath) {
    try {
      mkdirSync(path.dirname(options.logPath), { recursive: true });
      appendFileSync(
        options.logPath,
        `${JSON.stringify({
          ts: new Date(now).toISOString(),
          level: input.level,
          event: input.messageKey,
          params,
          monitorId: input.monitorId ?? null,
          incidentId: input.incidentId ?? null,
        })}\n`,
        'utf8',
      );
    } catch {
      // A failed log append must never break monitoring.
    }
  }

  const row = db.prepare(`${SELECT_NOTIFICATION} WHERE n.id = ?`).get(result.lastInsertRowid) as Row;
  return map(row);
}

export function listNotifications(db: Db, limit = 100): NotificationEntry[] {
  const rows = db
    .prepare(`${SELECT_NOTIFICATION} ORDER BY n.created_at DESC, n.id DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 500)) as Row[];
  return rows.map(map);
}

export function unreadNotificationCount(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE read = 0').get() as { c: number };
  return row.c;
}

export function markAllNotificationsRead(db: Db): number {
  return db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run().changes;
}
