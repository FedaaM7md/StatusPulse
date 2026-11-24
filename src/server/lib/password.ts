/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4]!, 'hex');
  const expected = Buffer.from(parts[5]!, 'hex');
  if (expected.length === 0 || salt.length === 0) return false;
  try {
    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
