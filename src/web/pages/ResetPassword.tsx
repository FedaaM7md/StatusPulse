/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useState, type FormEvent } from 'react';
import { Brand } from '../components/Logo';
import { FooterCredit } from '../components/FooterCredit';
import { LanguageSwitch, Spinner } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useI18n, usePageTitle } from '../lib/i18n';
import { Link, navigate } from '../lib/router';

export function ResetPasswordPage() {
  const { t } = useI18n();
  usePageTitle('login.resetTitle');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError(t('errors.weakPassword'));
      return;
    }
    if (password !== confirm) {
      setError(t('login.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(t(err instanceof ApiError ? (err.fields.password ?? err.messageKey) : 'errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="console-shell flex min-h-screen flex-col bg-bg text-ink">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
        <Brand />
        <LanguageSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <p className="text-[10px] text-faint">{t('login.resetEyebrow')}</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{t('login.resetTitle')}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('login.resetSubtitle')}</p>

          {done ? (
            <div className="mt-5 border border-up/40 bg-up/10 p-4">
              <p className="flex items-center gap-2 text-sm text-up">
                <Icon name="check" className="h-4 w-4" />
                {t('login.resetDone')}
              </p>
              <button type="button" className="btn-secondary mt-4 w-full" onClick={() => navigate('/login')}>
                {t('login.submit')}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4 border border-line bg-panel p-5" noValidate>
              {!token && (
                <p className="border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{t('login.resetInvalid')}</p>
              )}
              {error && (
                <p role="alert" className="border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
                  {error}
                </p>
              )}
              <div>
                <label htmlFor="new-password" className="label">{t('login.newPassword')}</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  dir="ltr"
                  minLength={12}
                  required
                />
                <p className="help">{t('login.passwordHelp')}</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className="label">{t('login.confirmPassword')}</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  dir="ltr"
                  minLength={12}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy || !token}>
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="key" className="h-4 w-4" />}
                {busy ? t('common.saving') : t('login.resetSubmit')}
              </button>
              <Link to="/login" className="link-quiet block text-center text-xs">
                {t('login.backToLogin')}
              </Link>
            </form>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 sm:px-8">
        <FooterCredit />
        <span className="text-[9px] text-faint">{t('app.version')}</span>
      </div>
    </div>
  );
}
