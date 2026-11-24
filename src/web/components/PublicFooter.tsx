/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Link } from '../lib/router';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { FooterCredit } from './FooterCredit';
import { LogoMark } from './Logo';

const LINKS = [
  ['/about', 'legal.about'],
  ['/help', 'legal.help'],
  ['/privacy', 'legal.privacy'],
  ['/terms', 'legal.terms'],
  ['/changelog', 'legal.changelog'],
] as const;

export function PublicFooter() {
  const { t } = useI18n();
  const { demoMode } = useAuth();
  return (
    <footer className="mt-10 border-t border-line bg-panel">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted"
          aria-label={t('legal.nav')}
        >
          {LINKS.map(([to, key]) => (
            <Link key={to} to={to} className="transition hover:text-ink hover:underline">
              {t(key)}
            </Link>
          ))}
          <span className="ms-auto text-[9px] text-faint">{t('app.version')}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
          <FooterCredit />
          {demoMode && <span className="text-[9px] text-degraded">{t('demo.publicNote')}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-3xl text-[10px] leading-relaxed text-faint">{t('public.uptimeLegend')}</p>
          <span className="flex items-center gap-1.5 text-[9px] text-faint">
            <LogoMark size={13} className="text-muted" />
            {t('public.poweredBy')}
          </span>
        </div>
      </div>
    </footer>
  );
}
