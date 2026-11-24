/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect } from 'react';
import { I18nProvider, useI18n, usePageTitle } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/Feedback';
import { usePath, navigate, Link } from './lib/router';
import { LogoMark } from './components/Logo';
import { PublicStatusPage } from './pages/PublicStatus';
import { LoginPage } from './pages/Login';
import { ResetPasswordPage } from './pages/ResetPassword';
import { AboutPage, ChangelogPage, HelpPage, PrivacyPage, TermsPage } from './pages/Legal';
import { OverviewPage } from './pages/admin/Overview';
import { MonitorsPage } from './pages/admin/Monitors';
import { MonitorFormPage } from './pages/admin/MonitorForm';
import { MonitorDetailPage } from './pages/admin/MonitorDetail';
import { IncidentsPage } from './pages/admin/Incidents';
import { IncidentDetailPage } from './pages/admin/IncidentDetail';
import { MaintenancePage } from './pages/admin/Maintenance';
import { NotificationsPage } from './pages/admin/Notifications';
import { AuditLogPage } from './pages/admin/AuditLog';
import { SettingsPage } from './pages/admin/Settings';

function FullPageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg" aria-busy="true">
      <LogoMark size={44} className="text-ink" />
      <div className="h-px w-28 overflow-hidden bg-line">
        <span className="block h-full w-1/2 animate-scan bg-accent" />
      </div>
      <p className="text-2xs text-faint">{t('common.loading')}</p>
    </div>
  );
}

function NotFoundPage() {
  const { t } = useI18n();
  usePageTitle('errors.notFound');
  return (
    <div className="console-shell flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md border border-line bg-panel p-6">
        <div className="mb-4 flex items-center gap-2 text-2xs text-faint">
          <LogoMark size={22} className="text-ink" />
          404 / {t('errors.notFound')}
        </div>
        <h1 className="text-lg font-semibold text-ink">{t('errors.notFound')}</h1>
        <p className="mt-1 text-sm text-muted">{t('app.tagline')}</p>
        <Link to="/" className="btn-secondary btn-sm mt-5">
          {t('app.publicStatus')}
        </Link>
      </div>
    </div>
  );
}

function Routes() {
  const path = usePath();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (path.startsWith('/admin') && !session) {
      navigate('/login', { replace: true });
    }
  }, [path, session, loading]);

  if (path === '/') return <PublicStatusPage />;
  if (path === '/login') return <LoginPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/about') return <AboutPage />;
  if (path === '/privacy') return <PrivacyPage />;
  if (path === '/terms') return <TermsPage />;
  if (path === '/help') return <HelpPage />;
  if (path === '/changelog') return <ChangelogPage />;

  if (path.startsWith('/admin')) {
    if (loading) return <FullPageLoader />;
    if (!session) return <FullPageLoader />;

    if (path === '/admin') return <OverviewPage />;
    if (path === '/admin/monitors') return <MonitorsPage />;
    if (path === '/admin/monitors/new') return <MonitorFormPage />;

    const editMatch = path.match(/^\/admin\/monitors\/(\d+)\/edit$/);
    if (editMatch) return <MonitorFormPage monitorId={Number(editMatch[1])} />;

    const detailMatch = path.match(/^\/admin\/monitors\/(\d+)$/);
    if (detailMatch) return <MonitorDetailPage monitorId={Number(detailMatch[1])} />;

    if (path === '/admin/incidents') return <IncidentsPage />;

    const incidentMatch = path.match(/^\/admin\/incidents\/(\d+)$/);
    if (incidentMatch) return <IncidentDetailPage incidentId={Number(incidentMatch[1])} />;

    if (path === '/admin/maintenance') return <MaintenancePage />;
    if (path === '/admin/notifications') return <NotificationsPage />;
    if (path === '/admin/activity') return <AuditLogPage />;
    if (path === '/admin/settings') return <SettingsPage />;
  }

  return <NotFoundPage />;
}

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
