/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Brand } from '../components/Logo';
import { Clock, DemoBanner, ThemeToggle } from '../components/ConsoleChrome';
import { FooterCredit } from '../components/FooterCredit';
import { LanguageSwitch } from '../components/Feedback';
import { useI18n, usePageTitle } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Link, navigate, usePath } from '../lib/router';

interface NavItem {
  to: string;
  key: string;
  icon: IconName;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'nav.groupMonitor',
    items: [
      { to: '/admin', key: 'nav.overview', icon: 'gauge' },
      { to: '/admin/monitors', key: 'nav.monitors', icon: 'activity' },
      { to: '/admin/incidents', key: 'nav.incidents', icon: 'alert' },
      { to: '/admin/maintenance', key: 'nav.maintenance', icon: 'calendar' },
    ],
  },
  {
    label: 'nav.groupSystem',
    items: [
      { to: '/admin/notifications', key: 'nav.notifications', icon: 'bell' },
      { to: '/admin/activity', key: 'nav.activity', icon: 'audit' },
      { to: '/admin/settings', key: 'nav.settings', icon: 'settings' },
    ],
  },
];

function isActive(path: string, to: string): boolean {
  if (to === '/admin') return path === '/admin';
  return path === to || path.startsWith(`${to}/`);
}

function titleKeyForPath(path: string): string {
  if (path === '/admin') return 'admin.overview.title';
  if (path === '/admin/monitors') return 'monitors.title';
  if (path === '/admin/monitors/new') return 'monitors.createTitle';
  if (/^\/admin\/monitors\/\d+\/edit$/.test(path)) return 'monitors.editTitle';
  if (/^\/admin\/monitors\/\d+$/.test(path)) return 'monitors.title';
  if (path === '/admin/incidents') return 'incidents.title';
  if (/^\/admin\/incidents\/\d+$/.test(path)) return 'incidents.title';
  if (path === '/admin/maintenance') return 'maintenance.title';
  if (path === '/admin/notifications') return 'notifications.title';
  if (path === '/admin/activity') return 'activity.title';
  if (path === '/admin/settings') return 'settings.title';
  return 'admin.overview.title';
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { session, logout, demoMode, demoResetMinutes } = useAuth();
  const path = usePath();
  const [menuOpen, setMenuOpen] = useState(false);
  usePageTitle(titleKeyForPath(path));

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const nav = (
    <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-4" aria-label={t('aria.mainNav')}>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="px-3 pb-1.5 pt-2 text-[9px] font-medium text-faint">
            {t(group.label)}
          </p>
          <div className="space-y-px">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rail-link ${isActive(path, item.to) ? 'rail-link-active' : ''}`}
                aria-current={isActive(path, item.to) ? 'page' : undefined}
              >
                <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-3">
      <Link
        to="/"
        className="mb-3 flex items-center gap-2 border border-line px-2.5 py-1.5 text-2xs text-muted transition hover:border-line-strong hover:text-ink"
      >
        <Icon name="external" className="h-3.5 w-3.5" />
        {t('nav.publicPage')}
      </Link>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-xs font-medium text-ink">
            {session?.user.name}
            {session?.user.isDemo && (
              <span className="border border-degraded/40 px-1 text-[8px] text-degraded">
                {t('demo.badge')}
              </span>
            )}
          </p>
          <p className="mono truncate text-[9px] text-faint">{session?.user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted transition hover:border-line-strong hover:text-ink"
          aria-label={t('common.logout')}
          title={t('common.logout')}
        >
          <Icon name="logout" className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
    </div>
  );

  const sidebarBody = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3.5">
        <Brand />
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label={t('aria.closeMenu')}
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[9px] text-faint">
        <span>{t('nav.noc')} / {t('nav.live')}</span>
        <span className="flex items-center gap-1.5 text-up">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-up" aria-hidden="true" />
          {t('demo.live')}
        </span>
      </div>
      {nav}
      {footer}
    </>
  );

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[70] focus:border focus:border-accent focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        {t('aria.skipToContent')}
      </a>

      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[236px] flex-col border-e border-line bg-panel lg:flex">
        {sidebarBody}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 start-0 flex w-[270px] max-w-[86vw] flex-col border-e border-line bg-panel">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="lg:ps-[236px]">
        {demoMode && <DemoBanner minutes={demoResetMinutes} />}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted lg:hidden"
              aria-label={t('aria.toggleMenu')}
            >
              <Icon name="menu" className="h-4 w-4" />
            </button>
            <span className="hidden text-2xs text-faint sm:inline">{t('nav.noc')}</span>
            <span className="text-faint">/</span>
            <span className="truncate text-xs font-medium text-ink">{t(titleKeyForPath(path))}</span>
            <span className="hidden border border-line px-1.5 py-0.5 text-[9px] text-faint md:inline">
              {t('app.envLive')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock />
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1360px] px-4 py-5 sm:px-5 lg:px-7 lg:py-6">
          {children}
          <footer className="no-print mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <FooterCredit />
            <span className="text-[9px] text-faint">{t('app.version')}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
