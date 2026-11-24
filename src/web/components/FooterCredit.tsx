/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useI18n } from '../lib/i18n';

/** Bottom-line owner credit. The product name stands alone everywhere else. */
export function FooterCredit({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-faint ${className}`}>
      <span>{t('app.copyright')}</span>
      <a
        href="https://fedaamohamed.com"
        rel="noopener"
        className="underline decoration-line-strong underline-offset-4 transition hover:text-ink hover:decoration-accent"
      >
        {t('app.credit')}
      </a>
    </span>
  );
}
