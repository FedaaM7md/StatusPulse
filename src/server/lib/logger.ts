/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta } : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error' || level === 'warn') {
    console.error(text);
  } else {
    console.log(text);
  }
}

export function createLogger(debugEnabled = false): Logger {
  // Errors and warnings are always emitted; debug output is opt-in.
  return {
    debug(message, meta) {
      if (debugEnabled) write('debug', message, meta);
    },
    info(message, meta) {
      write('info', message, meta);
    },
    warn(message, meta) {
      write('warn', message, meta);
    },
    error(message, meta) {
      write('error', message, meta);
    },
  };
}

export function silentLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

export const LOG_LEVEL_VALUE = LEVELS;
