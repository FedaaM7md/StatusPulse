/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Link } from '../lib/router';

/** Simple original wordmark for the fictional public status brand. */
export function PublicBrand({ name, to = '/' }: { name: string; to?: string }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2.5" aria-label={name}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <path
          d="M3 11c3.6 0 4.8 10 8.4 10s4.8-14 8.4-14 4.8 10 9.2 10"
          fill="none"
          stroke="#0D9488"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="29" cy="17" r="2" fill="#4CC9F0" />
      </svg>
      <span className="truncate text-[15px] font-semibold text-ink">{name}</span>
    </Link>
  );
}
