/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { PublicConfig, PublicStatusResponse } from '../../shared/types';

export interface BootstrapData {
  status?: PublicStatusResponse;
  config?: PublicConfig;
}

declare global {
  interface Window {
    __SP_BOOTSTRAP__?: BootstrapData;
  }
}

export function readBootstrap(): BootstrapData | null {
  if (typeof window === 'undefined') return null;
  return window.__SP_BOOTSTRAP__ ?? null;
}
