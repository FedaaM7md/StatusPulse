/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * Create or update the local admin account.
 *
 * Usage:
 *   npm run create-admin -- --email admin@example.com --password "a-long-password" --name "Admin"
 *
 * The password can also be supplied through ADMIN_PASSWORD for automation.
 * Nothing is sent over the network; the credentials are stored in the local
 * SQLite database using scrypt hashes.
 */
import { loadConfig } from '../config';
import { closeDb, openDb } from '../db';
import { upsertAdmin } from '../services/users';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const email = arg('email') ?? process.env.ADMIN_EMAIL ?? '';
const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? '';
const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrator';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('a valid --email is required.');
}
if (password.length < 12) {
  fail('the password must be at least 12 characters long.');
}

const config = loadConfig();
const db = openDb(config.dbPath);
try {
  const user = upsertAdmin(db, { email, password, name });
  console.log(`Admin account ready: ${user.email} (id ${user.id}).`);
  console.log(`Database: ${config.dbPath}`);
} finally {
  closeDb(db);
}
