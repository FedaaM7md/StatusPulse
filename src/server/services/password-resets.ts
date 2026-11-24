/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { hashPassword } from '../lib/password';
import { findUserByEmail } from './users';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const RESET_PASSWORD_MIN = 12;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResetRequestResult {
  email: string;
  token: string;
  expiresAt: number;
}

/** Creates a one-time token. Returns null for unknown or demo accounts. */
export function createPasswordReset(
  db: Db,
  email: string,
  now = Date.now(),
): ResetRequestResult | null {
  const user = findUserByEmail(db, email);
  if (!user || user.isDemo) return null;
  const token = randomBytes(32).toString('hex');
  const expiresAt = now + RESET_TOKEN_TTL_MS;
  const write = db.transaction(() => {
    db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(user.id);
    db.prepare(
      'INSERT INTO password_resets (user_id, token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)',
    ).run(user.id, tokenHash(token), now, expiresAt);
  });
  write();
  return { email: user.email, token, expiresAt };
}

export type ResetConsumeResult =
  | { ok: true; userId: number; email: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'weak' };

export function consumePasswordReset(
  db: Db,
  token: string,
  password: string,
  now = Date.now(),
): ResetConsumeResult {
  if (password.length < RESET_PASSWORD_MIN) return { ok: false, reason: 'weak' };
  const row = db
    .prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL')
    .get(tokenHash(token.trim())) as
    | { id: number; user_id: number; expires_at: number }
    | undefined;
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM password_resets WHERE id = ?').run(row.id);
    return { ok: false, reason: 'expired' };
  }
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(row.user_id) as
    | { id: number; email: string }
    | undefined;
  if (!user) return { ok: false, reason: 'invalid' };

  const passwordHash = hashPassword(password);
  const commit = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, user.id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  });
  commit();
  return { ok: true, userId: user.id, email: user.email };
}

export function prunePasswordResets(db: Db, now = Date.now()): void {
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now - 24 * 60 * 60 * 1000);
}
