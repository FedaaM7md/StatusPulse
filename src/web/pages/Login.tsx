/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PublicStatusResponse } from '../../shared/types';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Logo';
import { FooterCredit } from '../components/FooterCredit';
import { LanguageSwitch, Spinner } from '../components/Feedback';
import { StatusDot } from '../components/StatusBadge';
import { UptimeBars } from '../components/UptimeBars';
import { Clock } from '../components/ConsoleChrome';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { useI18n, usePageTitle } from '../lib/i18n';
import { navigate, Link } from '../lib/router';
import { formatDateTime, formatPercent } from '../lib/format';
import { overallKey, statusTone } from '../lib/status';

function LivePreview() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicStatus()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="border border-line bg-panel/60 p-4 font-mono text-2xs text-faint">
        <p className="text-muted">$ statuspulse probe --public</p>
        <p className="mt-2 text-down">status endpoint unreachable</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2 border border-line bg-panel/60 p-4" aria-busy="true">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }

  const state = data.overallState;
  const tone = statusTone[state];
  const components = data.groups.flatMap((group) => group.monitors).slice(0, 4);
  const total = data.groups.reduce((sum, group) => sum + group.monitors.length, 0);
  const up = data.groups.reduce(
    (sum, group) => sum + group.monitors.filter((monitor) => monitor.state === 'up').length,
    0,
  );

  return (
    <div className="border border-line bg-panel/80">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[9px] text-faint">{t('login.previewLabel')}</span>
        <Link to="/" className="text-[9px] text-accent hover:underline">
          {t('login.previewOpen')}
        </Link>
      </div>
      <div className={`flex items-center gap-2.5 border-b px-3 py-2.5 ${tone.panel}`}>
        <StatusDot state={state} pulse />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{t(overallKey(state))}</p>
          <p className="truncate text-[9px] text-muted">
            {data.siteName[lang]} · <span className="tnum">{formatDateTime(data.refreshedAt, lang)}</span>
          </p>
        </div>
        <span className={`chip ms-auto ${tone.chip}`}>
          {up}/{total} {t('status.up')}
        </span>
      </div>
      <div className="divide-y divide-line/70">
        {components.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">{t('public.noComponents')}</p>
        )}
        {components.map((component) => (
          <div key={component.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusDot state={component.state} />
                <span className="truncate text-xs text-ink">{component.displayName[lang] || component.name}</span>
                <span className="mono text-[9px] text-faint">{component.name}</span>
              </div>
              <div className="mt-1.5">
                <UptimeBars days={component.days.slice(-60)} compact />
              </div>
            </div>
            <span className="mono text-2xs text-muted">{formatPercent(component.uptime24h)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-3 py-2 text-[9px] text-faint">
        {t('public.uptimeLegend')}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { session, loading, login, loginDemo, demoMode, demoResetMinutes } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string | number>>({});
  usePageTitle('login.title');

  useEffect(() => {
    if (!loading && session) navigate('/admin', { replace: true });
  }, [loading, session]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorKey(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/admin');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
          setErrorKey('login.throttled');
          setErrorParams({ minutes });
        } else {
          setErrorKey(error.messageKey);
        }
      } else {
        setErrorKey('errors.generic');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onForgot = async (event: FormEvent) => {
    event.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setResetBusy(true);
    try {
      await api.requestPasswordReset(resetEmail.trim());
      setResetMessage(t('login.resetSent'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setResetError(t('login.resetThrottled'));
      } else {
        setResetError(t('errors.network'));
      }
    } finally {
      setResetBusy(false);
    }
  };

  const onDemo = async () => {    setErrorKey(null);
    setDemoBusy(true);
    try {
      await loginDemo();
      navigate('/admin');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
          setErrorKey('login.demoThrottled');
          setErrorParams({ minutes });
        } else {
          setErrorKey(error.messageKey);
        }
      } else {
        setErrorKey('errors.network');
      }
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="console-shell min-h-screen bg-bg text-ink">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between border-e border-line p-8 lg:flex">
          <div className="pointer-events-none absolute inset-0 grid-fade opacity-30" aria-hidden="true" />
          <div className="relative flex items-center justify-between">
            <Brand />
            <Clock />
          </div>

          <div className="relative mx-auto w-full max-w-xl py-8">
            <p className="text-[10px] text-accent">
              {t('login.previewEyebrow')}
            </p>
            <h2 className="mt-2 max-w-md text-2xl font-semibold leading-snug text-ink">
              {t('login.previewTitle')}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t('login.previewBody')}</p>
            <div className="mt-5">
              <LivePreview />
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <FooterCredit />
            <span className="text-[9px] text-faint">{t('app.version')}</span>
          </div>
        </section>

        <section className="flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 sm:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="ms-auto flex items-center gap-2">
              <LanguageSwitch />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
            <div className="w-full max-w-sm">
              <div className="mb-6">
                <p className="text-[10px] text-faint">{t('login.authEyebrow')}</p>
                <h1 className="mt-2 text-2xl font-semibold text-ink">{t('login.title')}</h1>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t('login.subtitle')}</p>
              </div>

              {demoMode && (
                <div className="mb-5 border border-degraded/35 bg-degraded/10 p-3">
                  <div className="flex items-start gap-2">
                    <Icon name="play" className="mt-0.5 h-4 w-4 shrink-0 text-degraded" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{t('demo.try')}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {t('demo.loginHint', { minutes: demoResetMinutes })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDemo()}
                    disabled={demoBusy}
                    className="btn mt-3 w-full border-degraded/60 bg-degraded text-[#1a1305] hover:bg-degraded/90"
                  >
                    {demoBusy ? <Spinner className="h-4 w-4" /> : <Icon name="terminal" className="h-4 w-4" />}
                    {demoBusy ? t('demo.entering') : t('demo.enter')}
                    <span className="ms-auto border border-black/20 px-1.5 py-0.5 text-[9px]">
                      {t('demo.roleAdmin')}
                    </span>
                  </button>
                </div>
              )}

              {forgotOpen ? (
                <form onSubmit={onForgot} className="border border-line bg-panel p-5" noValidate>
                  <h2 className="text-sm font-medium text-ink">{t('login.forgotTitle')}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t('login.forgotHelp')}</p>
                  {resetMessage && (
                    <p className="mt-3 border border-up/40 bg-up/10 px-3 py-2 text-sm text-up">{resetMessage}</p>
                  )}
                  {resetError && (
                    <p role="alert" className="mt-3 border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{resetError}</p>
                  )}
                  <div className="mt-4">
                    <label htmlFor="reset-email" className="label">{t('login.email')}</label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="username"
                      className="input"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="operator@example.com"
                      dir="ltr"
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary mt-4 w-full" disabled={resetBusy}>
                    {resetBusy ? <Spinner className="h-4 w-4" /> : <Icon name="mail" className="h-4 w-4" />}
                    {resetBusy ? t('common.saving') : t('login.resetRequest')}
                  </button>
                  <p className="mt-3 text-[10px] leading-relaxed text-faint">{t('login.resetLogNote')}</p>
                  <button
                    type="button"
                    className="link-quiet mt-3 text-xs"
                    onClick={() => {
                      setForgotOpen(false);
                      setResetMessage(null);
                      setResetError(null);
                    }}
                  >
                    {t('login.backToLogin')}
                  </button>
                </form>
              ) : (
                <form onSubmit={onSubmit} className="border border-line bg-panel p-5" noValidate>
                  {errorKey && (
                    <div
                      role="alert"
                      className="mb-4 flex items-start gap-2 border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down"
                    >
                      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t(errorKey, errorParams)}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="email" className="label">
                        {t('login.email')}
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="input"
                        placeholder="operator@example.com"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="label">
                        {t('login.password')}
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="input"
                        placeholder="••••••••••"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="mt-1.5 text-2xs text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
                        onClick={() => {
                          setForgotOpen(true);
                          setResetEmail(email);
                        }}
                      >
                        {t('login.forgotLink')}
                      </button>
                    </div>

                    <button type="submit" className="btn-primary w-full" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Spinner className="h-4 w-4" />
                          {t('login.submitting')}
                        </>
                      ) : (
                        <>
                          <Icon name="lock" className="h-4 w-4" />
                          {t('login.submit')}
                        </>
                      )}
                    </button>
                  </div>

                  <p className="mt-4 border-t border-line pt-3 text-2xs leading-relaxed text-faint">
                    {t('login.securityNote')}
                  </p>
                </form>
              )}

              <p className="mt-4 text-center text-2xs leading-relaxed text-faint">
                {t('login.demoHint')}{' '}
                <Link to="/" className="link-quiet">
                  {t('app.publicStatus')}
                </Link>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 sm:px-8">
            <FooterCredit />
            <span className="text-[9px] text-faint">{t('app.version')}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
