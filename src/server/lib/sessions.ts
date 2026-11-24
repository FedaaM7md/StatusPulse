/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type { User } from '../../shared/types';
import { DEMO_EMAIL } from '../../shared/types';
import { generateSecret } from './password';

export const SESSION_COOKIE = 'sp_session';

export interface Session {
  id: string;
  userId: number;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionWithUser extends Session {
  user: User;
}

interface SessionRow {
  id: string;
  user_id: number;
  csrf_token: string;
  created_at: number;
  expires_at: number;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'admin';
  created_at: number;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    isDemo: row.email.toLowerCase() === DEMO_EMAIL,
  };
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function createSession(
  db: Db,
  userId: number,
  options: { now?: number; ttlMs: number; ip?: string | null; userAgent?: string | null },
): Session {
  const now = options.now ?? Date.now();
  const session: Session = {
    id: generateSecret(32),
    userId,
    csrfToken: generateSecret(32),
    createdAt: now,
    expiresAt: now + options.ttlMs,
  };
  db.prepare(
    'INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    session.id,
    session.userId,
    session.csrfToken,
    session.createdAt,
    session.expiresAt,
    options.ip ?? null,
    options.userAgent?.slice(0, 300) ?? null,
  );
  return session;
}

export function getSession(db: Db, sessionId: string, now = Date.now()): SessionWithUser | null {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT s.*, u.id AS user_id_join, u.email, u.name, u.role, u.created_at AS user_created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, now) as
    | (SessionRow & {
        user_id_join: number;
        email: string;
        name: string;
        role: 'admin';
        user_created_at: number;
      })
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    csrfToken: row.csrf_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id_join,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.user_created_at,
      isDemo: row.email.toLowerCase() === DEMO_EMAIL,
    },
  };
}

export function deleteSession(db: Db, sessionId: string): void {
  if (!sessionId) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteUserSessions(db: Db, userId: number): number {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function deleteExpiredSessions(db: Db, now = Date.now()): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes;
}

export function sessionCookie(sessionId: string, maxAgeMs: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export interface ThrottleResult {
  throttled: boolean;
  retryAfterMs: number;
  attempts: number;
}

export function recordLoginAttempt(
  db: Db,
  email: string,
  ip: string,
  success: boolean,
  now = Date.now(),
): void {
  db.prepare('INSERT INTO login_attempts (email, ip, attempted_at, success) VALUES (?, ?, ?, ?)').run(
    email.toLowerCase(),
    ip,
    now,
    success ? 1 : 0,
  );
}

export function checkLoginThrottle(
  db: Db,
  email: string,
  ip: string,
  options: { windowMs: number; maxAttempts: number; now?: number },
): ThrottleResult {
  const now = options.now ?? Date.now();
  const since = now - options.windowMs;
  const rows = db
    .prepare(
      `SELECT attempted_at FROM login_attempts
       WHERE success = 0 AND attempted_at >= ? AND (email = ? OR ip = ?)
       ORDER BY attempted_at ASC`,
    )
    .all(since, email.toLowerCase(), ip) as Array<{ attempted_at: number }>;

  if (rows.length < options.maxAttempts) {
    return { throttled: false, retryAfterMs: 0, attempts: rows.length };
  }
  const oldest = rows[0]!.attempted_at;
  const retryAfterMs = Math.max(1000, oldest + options.windowMs - now);
  return { throttled: true, retryAfterMs, attempts: rows.length };
}

export function pruneLoginAttempts(db: Db, now = Date.now()): void {
  db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(now - 24 * 60 * 60 * 1000);
}
