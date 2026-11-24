/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  appUrl: string;
  debug: boolean;
  cookieSecure: boolean;
  sessionTtlMs: number;
  loginWindowMs: number;
  loginMaxAttempts: number;
  notificationsLogPath: string;
  /** Guest access without registration. Enabled by default for the demo deployment. */
  demoMode: boolean;
  /** Shared demo dataset is rebuilt on this interval. */
  demoResetMinutes: number;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  if (existsSync('.env')) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // A malformed .env should not take the whole server down.
    }
  }

  const dbPath = overrides.dbPath ?? process.env.DATABASE_PATH ?? './data/statuspulse.db';
  const dataDir = path.dirname(path.resolve(dbPath));

  const config: AppConfig = {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) || 'development',
    host: process.env.HOST || '127.0.0.1',
    port: int(process.env.PORT, 8106),
    dbPath,
    dataDir,
    appUrl: process.env.APP_URL || 'http://localhost:8106',
    debug: bool(process.env.APP_DEBUG, false),
    cookieSecure: bool(process.env.COOKIE_SECURE, false),
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    loginWindowMs: 15 * 60 * 1000,
    loginMaxAttempts: 5,
    notificationsLogPath: path.join(dataDir, 'notifications.log'),
    demoMode: bool(process.env.DEMO_MODE, true),
    demoResetMinutes: Math.max(5, int(process.env.DEMO_RESET_MINUTES, 60)),
    ...overrides,
  };

  return config;
}
