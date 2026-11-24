/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { AuditEntry } from '../../shared/types';
import type { Db } from '../db';

export interface AuditInput {
  userId?: number | null;
  userEmail: string;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  summary?: string | null;
  ip?: string | null;
  at?: number;
}

interface AuditRow {
  id: number;
  user_id: number | null;
  user_email: string;
  action: string;
  entity: string | null;
  entity_id: number | null;
  summary: string | null;
  ip: string | null;
  created_at: number;
}

function map(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    summary: row.summary,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

export function recordAudit(db: Db, input: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, summary, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.userId ?? null,
      input.userEmail.slice(0, 200),
      input.action.slice(0, 80),
      input.entity?.slice(0, 80) ?? null,
      input.entityId ?? null,
      input.summary?.slice(0, 500) ?? null,
      input.ip?.slice(0, 80) ?? null,
      input.at ?? Date.now(),
    );
  } catch {
    // Audit failures must never break a user action.
  }
}

export function listAudit(db: Db, limit = 100): AuditEntry[] {
  const rows = db
    .prepare('SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(Math.min(Math.max(limit, 1), 500)) as AuditRow[];
  return rows.map(map);
}
