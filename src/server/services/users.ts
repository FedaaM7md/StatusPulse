/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Db } from '../db';
import type { User } from '../../shared/types';
import { hashPassword } from '../lib/password';
import { mapUser } from '../lib/sessions';

export interface UserWithHash extends User {
  passwordHash: string;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin';
  created_at: number;
}

export function findUserByEmail(db: Db, email: string): UserWithHash | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | UserRow
    | undefined;
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export function findUserById(db: Db, id: number): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function countUsers(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c;
}

export interface AdminInput {
  email: string;
  password: string;
  name?: string;
}

export function upsertAdmin(db: Db, input: AdminInput, now = Date.now()): User {
  const email = input.email.trim().toLowerCase();
  const passwordHash = hashPassword(input.password);
  const existing = findUserByEmail(db, email);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, name = ?, updated_at = ? WHERE id = ?').run(
      passwordHash,
      input.name?.trim() || existing.name,
      now,
      existing.id,
    );
    return findUserById(db, existing.id)!;
  }
  const result = db
    .prepare(
      "INSERT INTO users (email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)",
    )
    .run(email, input.name?.trim() || 'Administrator', passwordHash, now, now);
  return findUserById(db, Number(result.lastInsertRowid))!;
}
