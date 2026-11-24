/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * Rebuild the shared demo dataset.
 *
 * Usage: npm run demo:reset
 *
 * Only demo deployments should use this. It deletes monitors, check history,
 * incidents, maintenance windows, notifications and the audit trail, then
 * writes the labelled synthetic dataset. User accounts and sessions are kept.
 */
import { loadConfig } from '../config';
import { closeDb, openDb } from '../db';
import { ensureDemoUser, resetDemoDataset } from '../services/demo';

const config = loadConfig();
const db = openDb(config.dbPath);

try {
  ensureDemoUser(db);
  const result = resetDemoDataset(db);
  console.log(`Demo dataset rebuilt: ${result.monitors} components, ${result.results} synthetic checks.`);
  console.log('The public page states that this is demo data. The scheduler never checks demo components.');
  console.log(`Database: ${config.dbPath}`);
  if (!config.demoMode) {
    console.log('Note: DEMO_MODE is off, so the demo sign-in route returns 404.');
  }
} finally {
  closeDb(db);
}
