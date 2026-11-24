/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * Small in-process sliding-window limiter for public endpoints.
 *
 * The app runs as a single Node process (see docs/DECISIONS.md), so an
 * in-memory limiter is sufficient and avoids another database write path.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Optional clock override for tests. */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? (() => Date.now());
  let lastSweep = 0;

  return function check(key: string): RateLimitResult {
    const at = now();
    if (at - lastSweep > options.windowMs * 4) {
      lastSweep = at;
      for (const [entryKey, stamps] of hits) {
        const live = stamps.filter((stamp) => at - stamp < options.windowMs);
        if (live.length === 0) hits.delete(entryKey);
        else hits.set(entryKey, live);
      }
    }

    const since = at - options.windowMs;
    const stamps = (hits.get(key) ?? []).filter((stamp) => stamp >= since);
    if (stamps.length >= options.max) {
      const oldest = stamps[0] ?? at;
      hits.set(key, stamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1000, oldest + options.windowMs - at),
      };
    }
    stamps.push(at);
    hits.set(key, stamps);
    return { allowed: true, remaining: options.max - stamps.length, retryAfterMs: 0 };
  };
}

export function resetRateLimiter(): void {
  // Tests build a fresh limiter per app; exported for completeness.
}
