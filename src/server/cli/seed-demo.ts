/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * Backwards-compatible alias for `npm run demo:reset`.
 *
 * Usage: npm run seed:demo -- --yes
 */
import { closeDb, openDb } from '../db';
import { loadConfig } from '../config';
import { ensureDemoUser, resetDemoDataset } from '../services/demo';

if (!process.argv.includes('--yes')) {
  console.error('Refusing to replace the demo dataset without --yes.');
  console.error('Run: npm run seed:demo -- --yes   (or npm run demo:reset)');
  process.exit(1);
}

const config = loadConfig();
const db = openDb(config.dbPath);
try {
  ensureDemoUser(db);
  const result = resetDemoDataset(db);
  console.log(`Demo dataset rebuilt: ${result.monitors} components, ${result.results} synthetic checks.`);
} finally {
  closeDb(db);
}
