/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Link } from '../lib/router';
import { useI18n } from '../lib/i18n';

/**
 * Original StatusPulse mark: a heartbeat trace held inside square brackets.
 * Designed for this product; no third-party logo assets are used.
 */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15 9H9v30h6M33 9h6v30h-6"
        fill="none"
        stroke="#4CC9F0"
        strokeWidth="2.6"
        strokeLinecap="square"
      />
      <path
        d="M12.5 25h6l3-8.5 5 15.5 3-7h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35.5" cy="25" r="2.2" fill="#3DDC84" />
    </svg>
  );
}

export function Brand({
  to = '/',
  compact = false,
}: {
  to?: string;
  compact?: boolean;
  /** Kept for call-site compatibility; the mark already adapts to surface tokens. */
  light?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      className="group flex min-w-0 items-center gap-2.5 rounded-sm"
      aria-label={t('aria.logoHome')}
    >
      <LogoMark size={compact ? 28 : 34} className="shrink-0 text-ink" />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-none text-ink">
          Status<span className="text-accent">Pulse</span>
        </span>
        {!compact && (
          <span className="mt-1 block truncate text-[8px] text-faint">
            {t('app.tagline')}
          </span>
        )}
      </span>
    </Link>
  );
}
