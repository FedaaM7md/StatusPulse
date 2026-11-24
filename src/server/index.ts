/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { closeDb, openDb } from './db';
import { createApp } from './app';
import { createLogger } from './lib/logger';
import { countUsers } from './services/users';
import { ensureDemoDataset, resetDemoDataset } from './services/demo';
import { Scheduler } from './services/scheduler';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.debug || config.nodeEnv !== 'production');
  const db = openDb(config.dbPath);

  if (config.demoMode) {
    const seeded = ensureDemoDataset(db);
    if (seeded) {
      logger.info('Demo dataset ready', { monitors: seeded.monitors, results: seeded.results });
    }
    if (config.nodeEnv === 'production') {
      logger.warn('DEMO_MODE is enabled in production. Set DEMO_MODE=false for a real deployment.');
    }
  }

  const scheduler = new Scheduler({ db, config, logger });
  const app = createApp({ db, config, scheduler, logger });

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    logger.info('StatusPulse listening', {
      host: config.host,
      port: info.port,
      env: config.nodeEnv,
      url: config.appUrl,
      demoMode: config.demoMode,
    });
    if (!config.demoMode && countUsers(db) === 0) {
      logger.warn('No admin user exists yet. Run: npm run create-admin -- --email you@example.com --password "..."');
    }
  });

  scheduler.start();

  // Shared demo dataset: rebuilt on a fixed interval. Session cookies survive so
  // an open tab keeps working; only business data is replaced.
  let demoTimer: NodeJS.Timeout | null = null;
  if (config.demoMode) {
    demoTimer = setInterval(() => {
      try {
        const result = resetDemoDataset(db);
        logger.info('Demo dataset reset', result);
      } catch (error) {
        logger.error('Demo reset failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }, config.demoResetMinutes * 60 * 1000);
    demoTimer.unref();
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    if (demoTimer) clearInterval(demoTimer);
    scheduler.stop();
    server.close(() => {
      closeDb(db);
      process.exit(0);
    });
    setTimeout(() => {
      closeDb(db);
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Fatal startup error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
