/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { navigate, Link } from '../../lib/router';

interface SettingsForm {
  siteNameAr: string;
  siteNameEn: string;
  siteDescriptionAr: string;
  siteDescriptionEn: string;
  allowPrivateTargets: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  publicPageEnabled: boolean;
}

const EMPTY: SettingsForm = {
  siteNameAr: '',
  siteNameEn: '',
  siteDescriptionAr: '',
  siteDescriptionEn: '',
  allowPrivateTargets: false,
  webhookEnabled: false,
  webhookUrl: '',
  webhookSecret: '',
  publicPageEnabled: true,
};

function Toggle({
  id,
  checked,
  onChange,
  label,
  help,
  danger = false,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  help?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {help && <p className="help mt-1">{help}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center border transition disabled:opacity-40 ${
          checked ? (danger ? 'border-degraded bg-degraded/25' : 'border-accent bg-accent/25') : 'border-line bg-panel2'
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          className={`inline-block h-3.5 w-3.5 transform transition ${
            checked
              ? `translate-x-[1.15rem] rtl:-translate-x-[1.15rem] ${danger ? 'bg-degraded' : 'bg-accent'}`
              : 'translate-x-0.5 bg-muted rtl:-translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [secretSet, setSecretSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemo = Boolean(session?.user.isDemo);

  const load = useCallback(async () => {
    try {
      const result = await api.getSettings();
      setForm({
        siteNameAr: result.settings.siteNameAr,
        siteNameEn: result.settings.siteNameEn,
        siteDescriptionAr: result.settings.siteDescriptionAr,
        siteDescriptionEn: result.settings.siteDescriptionEn,
        allowPrivateTargets: result.settings.allowPrivateTargets,
        webhookEnabled: result.settings.webhookEnabled,
        webhookUrl: result.settings.webhookUrl,
        webhookSecret: '',
        publicPageEnabled: result.settings.publicPageEnabled,
      });
      setSecretSet(result.settings.webhookSecretSet);
    } catch {
      setError(t('errors.network'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.siteNameAr.trim() || !form.siteNameEn.trim()) {
      setError(t('errors.validation'));
      return;
    }
    if (form.webhookUrl && !/^https?:\/\//i.test(form.webhookUrl.trim())) {
      setError(t('settings.webhookUrlInvalid'));
      return;
    }
    if (form.webhookEnabled && !form.webhookUrl.trim()) {
      setError(t('settings.webhookUrlInvalid'));
      return;
    }
    setSaving(true);
    try {
      const result = await api.saveSettings({
        siteNameAr: form.siteNameAr.trim(),
        siteNameEn: form.siteNameEn.trim(),
        siteDescriptionAr: form.siteDescriptionAr.trim(),
        siteDescriptionEn: form.siteDescriptionEn.trim(),
        allowPrivateTargets: form.allowPrivateTargets,
        webhookEnabled: form.webhookEnabled,
        webhookUrl: form.webhookUrl.trim(),
        webhookSecret: form.webhookSecret,
        publicPageEnabled: form.publicPageEnabled,
      });
      setSecretSet(result.settings.webhookSecretSet);
      set('webhookSecret', '');
      toast.show(t('settings.saved'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        const firstField = Object.values(err.fields)[0];
        setError(t(firstField ?? err.messageKey));
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    setTesting(true);
    try {
      await api.testWebhook();
      toast.show(t('settings.webhookSent'), 'success');
    } catch (err) {
      toast.show(t(err instanceof ApiError ? err.messageKey : 'settings.webhookFailed'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const signOutAll = async () => {
    setSigningOut(true);
    try {
      await api.logoutAll();
      toast.show(t('settings.signOutAllDone'), 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.show(t(err instanceof ApiError ? err.messageKey : 'errors.generic'), 'error');
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="skeleton h-10 w-64" />
        <div className="mt-6 space-y-4">
          <div className="skeleton h-64" />
          <div className="skeleton h-48" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <button type="submit" form="settings-form" className="btn-primary btn-sm" disabled={saving}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      />

      {isDemo && (
        <div className="mb-4 flex items-start gap-2 border border-degraded/35 bg-degraded/10 px-3 py-2 text-xs text-muted">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
          {t('demo.restrictedHint')}
        </div>
      )}

      <form id="settings-form" onSubmit={submit} className="grid gap-4 lg:grid-cols-3" noValidate>
        <div className="space-y-4 lg:col-span-2">
          {error && (
            <div className="flex items-start gap-2 border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down" role="alert">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <section className="panel" aria-labelledby="identity-heading">
            <div className="panel-head">
              <h2 id="identity-heading" className="text-xs font-medium text-ink">
                {t('settings.identity')}
              </h2>
              <span className="text-[9px] text-faint">{t('settings.publicLabel')}</span>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="siteNameAr" className="label">{t('settings.siteNameAr')}</label>
                  <input id="siteNameAr" className="input" value={form.siteNameAr} onChange={(event) => set('siteNameAr', event.target.value)} dir="rtl" maxLength={80} required />
                </div>
                <div>
                  <label htmlFor="siteNameEn" className="label">{t('settings.siteNameEn')}</label>
                  <input id="siteNameEn" className="input" value={form.siteNameEn} onChange={(event) => set('siteNameEn', event.target.value)} dir="ltr" maxLength={80} required />
                </div>
                <div>
                  <label htmlFor="siteDescriptionAr" className="label">{t('settings.siteDescAr')}</label>
                  <input id="siteDescriptionAr" className="input" value={form.siteDescriptionAr} onChange={(event) => set('siteDescriptionAr', event.target.value)} dir="rtl" maxLength={300} />
                </div>
                <div>
                  <label htmlFor="siteDescriptionEn" className="label">{t('settings.siteDescEn')}</label>
                  <input id="siteDescriptionEn" className="input" value={form.siteDescriptionEn} onChange={(event) => set('siteDescriptionEn', event.target.value)} dir="ltr" maxLength={300} />
                </div>
              </div>
              <div className="border-t border-line pt-3">
                <Toggle
                  id="publicPageEnabled"
                  checked={form.publicPageEnabled}
                  onChange={(value) => set('publicPageEnabled', value)}
                  label={t('settings.publicPageEnabled')}
                  help={t('settings.publicPageHelp')}
                />
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="security-heading">
            <div className="panel-head">
              <h2 id="security-heading" className="flex items-center gap-2 text-xs font-medium text-ink">
                <Icon name="shield" className="h-3.5 w-3.5 text-accent" />
                {t('settings.security')}
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="border border-degraded/35 bg-degraded/10 p-3">
                <Toggle
                  id="allowPrivateTargets"
                  checked={form.allowPrivateTargets}
                  onChange={(value) => set('allowPrivateTargets', value)}
                  label={t('settings.allowPrivate')}
                  help={t('settings.allowPrivateHelp')}
                  danger
                  disabled={isDemo}
                />
                <p className="mt-3 border-t border-degraded/25 pt-2 text-[10px] leading-relaxed text-degraded">
                  {t('settings.privateWarning')}
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted">{t('settings.privateConfirm')}</p>
            </div>
          </section>

          <section className="panel" aria-labelledby="webhook-heading">
            <div className="panel-head">
              <h2 id="webhook-heading" className="flex items-center gap-2 text-xs font-medium text-ink">
                <Icon name="external" className="h-3.5 w-3.5 text-accent" />
                {t('settings.webhook')}
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <Toggle
                id="webhookEnabled"
                checked={form.webhookEnabled}
                onChange={(value) => set('webhookEnabled', value)}
                label={t('settings.webhookEnabled')}
                help={t('settings.webhookHelp')}
                disabled={isDemo}
              />
              <div className={form.webhookEnabled ? 'space-y-3' : 'space-y-3 opacity-60'}>
                <div>
                  <label htmlFor="webhookUrl" className="label">{t('settings.webhookUrl')}</label>
                  <input id="webhookUrl" className="input" value={form.webhookUrl} onChange={(event) => set('webhookUrl', event.target.value)} placeholder={t('settings.webhookUrlPlaceholder')} dir="ltr" inputMode="url" disabled={isDemo} />
                </div>
                <div>
                  <label htmlFor="webhookSecret" className="label">{t('settings.webhookSecret')}</label>
                  <input id="webhookSecret" type="password" autoComplete="new-password" className="input" value={form.webhookSecret} onChange={(event) => set('webhookSecret', event.target.value)} placeholder={secretSet ? '••••••••••••' : ''} dir="ltr" maxLength={200} disabled={isDemo} />
                  <p className="help">{t('settings.webhookSecretHelp')}</p>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => void testWebhook()} disabled={!form.webhookEnabled || testing || isDemo}>
                  {testing ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="external" className="h-3.5 w-3.5" />}
                  {t('settings.testWebhook')}
                </button>
                {!form.webhookEnabled && <p className="text-[10px] text-faint">{t('settings.webhookDisabled')}</p>}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel p-4">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-ink">
              <Icon name="bell" className="h-4 w-4 text-accent" />
              {t('settings.notifications')}
            </h2>
            <p className="text-xs leading-relaxed text-muted">{t('settings.notificationsHelp')}</p>
            <code className="mono mt-3 block truncate border border-line bg-panel2 px-2.5 py-1.5 text-[9px] text-muted" dir="ltr">
              data/notifications.log
            </code>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-ink">
              <Icon name="key" className="h-4 w-4 text-accent" />
              {t('settings.sessions')}
            </h2>
            <p className="text-xs leading-relaxed text-muted">{t('settings.signOutAllHelp')}</p>
            <button type="button" className="btn-secondary btn-sm mt-3 w-full" onClick={() => void signOutAll()} disabled={signingOut}>
              {signingOut ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="logout" className="h-3.5 w-3.5 rtl:rotate-180" />}
              {t('settings.signOutAll')}
            </button>
            <Link to="/admin/activity" className="mt-3 flex items-center justify-between border border-line px-2.5 py-1.5 text-[9px] text-muted transition hover:border-line-strong hover:text-ink">
              {t('nav.activity')}
              <Icon name="chevron" className="h-3 w-3 rtl:rotate-180" />
            </Link>
          </section>

          <section className="border border-line bg-panel p-4">
            <h2 className="text-xs font-medium text-ink">{t('app.name')}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t('public.uptimeLegend')}</p>
          </section>
        </div>
      </form>
    </AdminLayout>
  );
}
