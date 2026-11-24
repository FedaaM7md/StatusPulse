/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Link } from '../lib/router';
import { useI18n } from '../lib/i18n';

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backTo?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-5 border-b border-line pb-4">
      {backTo && (
        <Link
          to={backTo}
          className="mb-2 inline-flex items-center gap-1.5 text-2xs text-muted transition hover:text-ink"
        >
          <Icon name="back" className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('common.back')}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">{t('app.tagline')}</p>
          <h1 className="truncate text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
