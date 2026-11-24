/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { DailyPoint } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { barTone } from '../lib/status';
import { formatDate, formatPercent } from '../lib/format';

export function UptimeBars({
  days,
  label,
  compact = false,
}: {
  days: DailyPoint[];
  label?: string;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const title = label ?? t('public.uptime90');
  return (
    <div
      className={`flex w-full items-stretch gap-px ${compact ? 'h-5' : 'h-7'}`}
      role="img"
      aria-label={title}
    >
      {days.map((day) => {
        const formatted = formatDate(new Date(`${day.date}T12:00:00Z`).getTime(), lang);
        const dayTitle =
          day.uptime === null
            ? t('chart.tooltipNoData', { date: formatted })
            : t('chart.tooltipUptime', { date: formatted, value: formatPercent(day.uptime) });
        return (
          <span
            key={day.date}
            title={dayTitle}
            className={`min-w-[1px] flex-1 ${barTone(day.uptime)} transition-opacity hover:opacity-60`}
          />
        );
      })}
    </div>
  );
}
