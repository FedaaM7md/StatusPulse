/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Icon } from './Icon';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { formatClock, useNow } from '../lib/time';

/** Small demo strip shown only inside demo sessions in the admin console. */
export function DemoBanner({ minutes = 60 }: { minutes?: number }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-degraded/30 bg-degraded/10">
      <div className="flex items-center gap-2 overflow-hidden px-4 py-1.5 text-[11px] sm:px-5">
        <span className="shrink-0 border border-degraded/40 px-1.5 py-0.5 text-[9px] font-medium text-degraded">
          {t('demo.badge')}
        </span>
        <span className="truncate text-muted">{t('demo.banner', { minutes })}</span>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-7 w-7 items-center justify-center border border-line bg-panel text-muted transition hover:border-line-strong hover:text-ink"
      aria-label={t('theme.toggle')}
      title={t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-3.5 w-3.5" />
    </button>
  );
}

export function Clock() {
  const now = useNow(1000);
  return (
    <time className="mono hidden text-2xs text-muted sm:inline" dateTime={new Date(now).toISOString()}>
      {formatClock(now)}
    </time>
  );
}
