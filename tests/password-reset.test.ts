/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { describe, expect, it } from 'vitest';
import {
  consumePasswordReset,
  createPasswordReset,
  RESET_TOKEN_TTL_MS,
} from '../src/server/services/password-resets';
import { findUserByEmail } from '../src/server/services/users';
import { createSession, getSession } from '../src/server/lib/sessions';
import { DEMO_EMAIL } from '../src/shared/types';
import { ensureDemoDataset } from '../src/server/services/demo';
import { makeApp, seedAdmin, testDb, TEST_PASSWORD } from './helpers';

describe('password reset', () => {
  it('creates a single-use token, changes the password and revokes sessions', () => {
    const db = testDb();
    const userId = seedAdmin(db);
    const session = createSession(db, userId, { ttlMs: 60_000 });
    const reset = createPasswordReset(db, 'admin@example.com');
    expect(reset).not.toBeNull();
    expect(reset!.token).toHaveLength(64);

    const result = consumePasswordReset(db, reset!.token, 'A-new-password-123');
    expect(result.ok).toBe(true);
    expect(getSession(db, session.id)).toBeNull();
    expect(findUserByEmail(db, 'admin@example.com')?.passwordHash).not.toBe('');
    const reused = consumePasswordReset(db, reset!.token, 'Another-password-123');
    expect(reused).toEqual({ ok: false, reason: 'invalid' });
    expect(findUserByEmail(db, 'admin@example.com')).not.toBeNull();
  });

  it('rejects weak passwords and expired tokens', () => {
    const db = testDb();
    seedAdmin(db);
    const weak = createPasswordReset(db, 'admin@example.com');
    expect(consumePasswordReset(db, weak!.token, 'short')).toEqual({ ok: false, reason: 'weak' });

    const expired = createPasswordReset(db, 'admin@example.com');
    const late = Date.now() + RESET_TOKEN_TTL_MS + 1000;
    expect(consumePasswordReset(db, expired!.token, 'A-new-password-123', late)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('does not issue tokens for demo or unknown accounts', () => {
    const db = testDb();
    ensureDemoDataset(db);
    expect(createPasswordReset(db, DEMO_EMAIL)).toBeNull();
    expect(createPasswordReset(db, 'nobody@example.com')).toBeNull();
  });

  it('always returns the same generic response over HTTP', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const known = await app.request('/api/auth/password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8106' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });
    const unknown = await app.request('/api/auth/password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8106' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it('rejects an invalid confirmation token', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/auth/password/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8106' },
      body: JSON.stringify({ token: 'a'.repeat(64), password: 'Another-password-123' }),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { message: string }).message).toBe('login.resetInvalid');
  });

  it('keeps the existing password login working after a reset', async () => {
    const { app, db } = makeApp();
    seedAdmin(db);
    const reset = createPasswordReset(db, 'admin@example.com');
    consumePasswordReset(db, reset!.token, 'A-new-password-123');
    const oldLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: TEST_PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'A-new-password-123' }),
    });
    expect(newLogin.status).toBe(200);
  });
});
