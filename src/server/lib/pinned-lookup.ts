/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { LookupFunction } from 'node:net';

/**
 * Node's `autoSelectFamily` (Happy Eyeballs) calls a custom lookup function
 * with `{ all: true }` and expects an array of addresses. Other call sites
 * expect the classic `(err, address, family)` signature. This adapter supports
 * both while always returning the single address that passed the SSRF guard.
 */
export function createPinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
    const wantsAll =
      options !== null && typeof options === 'object' && (options as { all?: boolean }).all === true;
    if (wantsAll) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  }) as unknown as LookupFunction;
}
