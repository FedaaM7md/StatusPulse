/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api, ApiError, type MonitorPayload } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Link, navigate } from '../../lib/router';
import type { Monitor } from '../../../shared/types';

interface FormState {
  name: string;
  type: MonitorPayload['type'];
  url: string;
  host: string;
  port: string;
  recordType: NonNullable<MonitorPayload['recordType']>;
  expectedValue: string;
  httpMethod: MonitorPayload['httpMethod'];
  expectedStatus: string;
  keyword: string;
  keywordMode: MonitorPayload['keywordMode'];
  latencyThresholdMs: string;
  sslWarnDays: string;
  intervalSeconds: string;
  timeoutMs: string;
  retries: string;
  groupName: string;
  enabled: boolean;
  allowPrivate: boolean;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  type: 'http',
  url: '',
  host: '',
  port: '',
  recordType: 'A',
  expectedValue: '',
  httpMethod: 'GET',
  expectedStatus: '200',
  keyword: '',
  keywordMode: 'none',
  latencyThresholdMs: '',
  sslWarnDays: '14',
  intervalSeconds: '60',
  timeoutMs: '10000',
  retries: '1',
  groupName: 'General',
  enabled: true,
  allowPrivate: false,
  notes: '',
};

function fromMonitor(monitor: Monitor): FormState {
  return {
    name: monitor.name,
    type: monitor.type,
    url: monitor.url ?? '',
    host: monitor.host ?? '',
    port: monitor.port === null ? '' : String(monitor.port),
    recordType: monitor.recordType ?? 'A',
    expectedValue: monitor.expectedValue ?? '',
    httpMethod: monitor.httpMethod === 'HEAD' ? 'HEAD' : 'GET',
    expectedStatus: monitor.expectedStatus === null ? '' : String(monitor.expectedStatus),
    keyword: monitor.keyword ?? '',
    keywordMode: monitor.keywordMode,
    latencyThresholdMs: monitor.latencyThresholdMs === null ? '' : String(monitor.latencyThresholdMs),
    sslWarnDays: String(monitor.sslWarnDays),
    intervalSeconds: String(monitor.intervalSeconds),
    timeoutMs: String(monitor.timeoutMs),
    retries: String(monitor.retries),
    groupName: monitor.groupName,
    enabled: monitor.enabled,
    allowPrivate: monitor.allowPrivate,
    notes: monitor.notes ?? '',
  };
}

function num(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({
  label,
  htmlFor,
  error,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        help && <p className="help">{help}</p>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  help,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help?: string;
  id: string;
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
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center border transition ${
          checked ? 'border-accent bg-accent/25' : 'border-line bg-panel2'
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          className={`inline-block h-3.5 w-3.5 transform transition ${
            checked ? 'translate-x-[1.15rem] bg-accent rtl:-translate-x-[1.15rem]' : 'translate-x-0.5 bg-muted rtl:-translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function MonitorFormPage({ monitorId }: { monitorId?: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(Boolean(monitorId));
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!monitorId) return;
    let cancelled = false;
    api
      .getMonitor(monitorId)
      .then((result) => {
        if (!cancelled) {
          setForm(fromMonitor(result.monitor));
          setIsDemo(result.monitor.demo);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monitorId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('monitors.nameRequired');
    if (form.type === 'http') {
      try {
        const url = new URL(form.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') next.url = t('monitors.invalidUrl');
      } catch {
        next.url = t('monitors.invalidUrl');
      }
    }
    if (form.type === 'tcp' || form.type === 'dns' || form.type === 'ssl') {
      if (!form.host.trim()) next.host = t('monitors.invalidHost');
    }
    if ((form.type === 'tcp' || form.type === 'ssl') && form.port.trim() !== '') {
      const port = Number(form.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) next.port = t('monitors.invalidPort');
    }
    if (form.type === 'tcp' && form.port.trim() === '') next.port = t('monitors.invalidPort');
    const interval = Number(form.intervalSeconds);
    if (!Number.isInteger(interval) || interval < 1 || interval > 3600) next.intervalSeconds = t('monitors.intervalRange');
    const timeout = Number(form.timeoutMs);
    if (!Number.isInteger(timeout) || timeout < 500 || timeout > 60000) next.timeoutMs = t('monitors.timeoutRange');
    const retries = Number(form.retries);
    if (!Number.isInteger(retries) || retries < 0 || retries > 5) next.retries = t('monitors.retriesRange');
    if (form.latencyThresholdMs.trim() !== '') {
      const latency = Number(form.latencyThresholdMs);
      if (!Number.isFinite(latency) || latency < 50 || latency > 600000) {
        next.latencyThresholdMs = t('monitors.latencyRange');
      }
    }
    if (form.type === 'http' && form.expectedStatus.trim() !== '') {
      const status = Number(form.expectedStatus);
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        next.expectedStatus = t('errors.validation');
      }
    }
    if (form.keywordMode !== 'none' && !form.keyword.trim()) {
      next.keyword = t('monitors.keywordHelp');
    }
    return next;
  };

  const buildPayload = (): MonitorPayload => ({
    name: form.name.trim(),
    type: form.type,
    url: form.type === 'http' ? form.url.trim() : null,
    host: form.type === 'http' ? null : form.host.trim(),
    port: form.type === 'tcp' || form.type === 'ssl' ? num(form.port) ?? (form.type === 'ssl' ? 443 : null) : null,
    recordType: form.type === 'dns' ? form.recordType : null,
    expectedValue: form.type === 'dns' ? form.expectedValue.trim() || null : null,
    httpMethod: form.httpMethod,
    expectedStatus: form.type === 'http' ? num(form.expectedStatus) : null,
    keyword: form.type === 'http' && form.keywordMode !== 'none' ? form.keyword.trim() || null : null,
    keywordMode: form.type === 'http' ? form.keywordMode : 'none',
    latencyThresholdMs: num(form.latencyThresholdMs),
    sslWarnDays: Number(form.sslWarnDays),
    intervalSeconds: Number(form.intervalSeconds),
    timeoutMs: Number(form.timeoutMs),
    retries: Number(form.retries),
    groupName: form.groupName.trim() || 'General',
    enabled: form.enabled,
    allowPrivate: form.allowPrivate,
    notes: form.notes.trim() || null,
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      toast.show(t('errors.validation'), 'error');
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (monitorId) {
        const result = await api.updateMonitor(monitorId, buildPayload());
        toast.show(t('monitors.saved'), 'success');
        navigate(`/admin/monitors/${result.monitor.id}`);
      } else {
        const result = await api.createMonitor(buildPayload());
        toast.show(t('monitors.saved'), 'success');
        navigate(`/admin/monitors/${result.monitor.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const translated: Record<string, string> = {};
        for (const [key, value] of Object.entries(error.fields)) translated[key] = t(value);
        setErrors(translated);
        toast.show(t(error.messageKey), 'error');
      } else {
        toast.show(t('errors.generic'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="skeleton h-10 w-64" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-80 lg:col-span-2" />
          <div className="skeleton h-80" />
        </div>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout>
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('monitors.loadError')}</p>
          <Link to="/admin/monitors" className="btn-primary mt-4">
            {t('monitors.detailBack')}
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const typeOptions: Array<{ value: FormState['type']; icon: 'globe' | 'server' | 'mail' | 'lock'; label: string }> = [
    { value: 'http', icon: 'globe', label: t('monitors.typeHttp') },
    { value: 'tcp', icon: 'server', label: t('monitors.typeTcp') },
    { value: 'dns', icon: 'mail', label: t('monitors.typeDns') },
    { value: 'ssl', icon: 'lock', label: t('monitors.typeSsl') },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title={monitorId ? t('monitors.editTitle') : t('monitors.createTitle')}
        subtitle={monitorId ? t('monitors.editSubtitle') : t('monitors.createSubtitle')}
        backTo={monitorId ? `/admin/monitors/${monitorId}` : '/admin/monitors'}
        actions={
          <>
            <Link to={monitorId ? `/admin/monitors/${monitorId}` : '/admin/monitors'} className="btn-secondary">
              {t('common.cancel')}
            </Link>
            <button type="submit" form="monitor-form" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
              {submitting ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      />

      {isDemo && (
        <div className="mb-4 flex items-start gap-2 border border-degraded/35 bg-degraded/10 px-3 py-2 text-xs text-muted">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
          {t('monitors.demoEditNotice')}
        </div>
      )}

      <form id="monitor-form" onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
        <div className="space-y-4 lg:col-span-2">
          <section className="panel">
            <div className="panel-head">
              <h2 className="text-xs font-medium text-ink">{t('monitors.basic')}</h2>
              <span className="mono text-[9px] text-faint">01</span>
            </div>
            <div className="space-y-4 p-4">
              <Field label={t('monitors.name')} htmlFor="name" error={errors.name}>
                <input
                  id="name"
                  className="input"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder={t('monitors.namePlaceholder')}
                  maxLength={120}
                  required
                />
              </Field>

              <div>
                <span className="label">{t('monitors.type')}</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('monitors.type')}>
                  {typeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={form.type === option.value}
                      onClick={() => set('type', option.value)}
                      className={`flex flex-col items-center gap-1.5 border px-2 py-2.5 text-xs font-medium transition ${
                        form.type === option.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-line bg-panel2 text-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <Icon name={option.icon} className="h-4 w-4" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {form.type === 'http' ? (
                  <>
                    <div className="sm:col-span-2">
                      <Field label={t('monitors.url')} htmlFor="url" error={errors.url} help={t('monitors.urlHelp')}>
                        <input
                          id="url"
                          className="input"
                          value={form.url}
                          onChange={(event) => set('url', event.target.value)}
                          placeholder={t('monitors.urlPlaceholder')}
                          dir="ltr"
                          inputMode="url"
                        />
                      </Field>
                    </div>
                    <Field label={t('monitors.method')} htmlFor="method">
                      <select
                        id="method"
                        className="select"
                        value={form.httpMethod}
                        onChange={(event) => set('httpMethod', event.target.value as FormState['httpMethod'])}
                      >
                        <option value="GET">GET</option>
                        <option value="HEAD">HEAD</option>
                      </select>
                    </Field>
                    <Field
                      label={t('monitors.expectedStatus')}
                      htmlFor="expectedStatus"
                      error={errors.expectedStatus}
                      help={t('monitors.expectedStatusHelp')}
                    >
                      <input
                        id="expectedStatus"
                        className="input numeric"
                        value={form.expectedStatus}
                        onChange={(event) => set('expectedStatus', event.target.value)}
                        inputMode="numeric"
                        placeholder="200"
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className={form.type === 'dns' ? 'sm:col-span-2' : ''}>
                      <Field label={t('monitors.host')} htmlFor="host" error={errors.host} help={t('monitors.hostHelp')}>
                        <input
                          id="host"
                          className="input"
                          value={form.host}
                          onChange={(event) => set('host', event.target.value)}
                          placeholder={t('monitors.hostPlaceholder')}
                          dir="ltr"
                        />
                      </Field>
                    </div>
                    {(form.type === 'tcp' || form.type === 'ssl') && (
                      <Field label={t('monitors.port')} htmlFor="port" error={errors.port}>
                        <input
                          id="port"
                          className="input numeric"
                          value={form.port}
                          onChange={(event) => set('port', event.target.value)}
                          placeholder={form.type === 'ssl' ? '443' : '5432'}
                          inputMode="numeric"
                        />
                      </Field>
                    )}
                    {form.type === 'dns' && (
                      <>
                        <Field label={t('monitors.recordType')} htmlFor="recordType">
                          <select
                            id="recordType"
                            className="select"
                            value={form.recordType}
                            onChange={(event) => set('recordType', event.target.value as FormState['recordType'])}
                          >
                            {['A', 'AAAA', 'CNAME', 'TXT', 'MX'].map((record) => (
                              <option key={record} value={record}>
                                {record}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t('monitors.expectedValue')} htmlFor="expectedValue" help={t('monitors.expectedValueHelp')}>
                          <input
                            id="expectedValue"
                            className="input"
                            value={form.expectedValue}
                            onChange={(event) => set('expectedValue', event.target.value)}
                            dir="ltr"
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('monitors.group')} htmlFor="group" help={t('monitors.groupHelp')}>
                  <input
                    id="group"
                    className="input"
                    value={form.groupName}
                    onChange={(event) => set('groupName', event.target.value)}
                    placeholder={t('monitors.groupPlaceholder')}
                    maxLength={80}
                  />
                </Field>
                <Field label={t('monitors.notes')} htmlFor="notes">
                  <input
                    id="notes"
                    className="input"
                    value={form.notes}
                    onChange={(event) => set('notes', event.target.value)}
                    placeholder={t('monitors.notesPlaceholder')}
                    maxLength={1000}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="text-xs font-medium text-ink">{t('monitors.healthRules')}</h2>
              <span className="mono text-[9px] text-faint">02</span>
            </div>
            <div className="space-y-4 p-4">
              {form.type === 'http' && (
                <>
                  <Field label={t('monitors.keywordMode')} htmlFor="keywordMode" help={t('monitors.keywordHelp')}>
                    <select
                      id="keywordMode"
                      className="select"
                      value={form.keywordMode}
                      onChange={(event) => set('keywordMode', event.target.value as FormState['keywordMode'])}
                    >
                      <option value="none">{t('monitors.keywordNone')}</option>
                      <option value="present">{t('monitors.keywordPresent')}</option>
                      <option value="absent">{t('monitors.keywordAbsent')}</option>
                    </select>
                  </Field>
                  {form.keywordMode !== 'none' && (
                    <Field label={t('monitors.keyword')} htmlFor="keyword" error={errors.keyword}>
                      <input
                        id="keyword"
                        className="input"
                        value={form.keyword}
                        onChange={(event) => set('keyword', event.target.value)}
                        maxLength={200}
                      />
                    </Field>
                  )}
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('monitors.latencyThreshold')}
                  htmlFor="latency"
                  error={errors.latencyThresholdMs}
                  help={t('monitors.latencyHelp')}
                >
                  <input
                    id="latency"
                    className="input numeric"
                    value={form.latencyThresholdMs}
                    onChange={(event) => set('latencyThresholdMs', event.target.value)}
                    inputMode="numeric"
                    placeholder="1000"
                  />
                </Field>
                {form.type === 'ssl' && (
                  <Field label={t('monitors.sslWarnDays')} htmlFor="sslWarnDays">
                    <input
                      id="sslWarnDays"
                      className="input numeric"
                      value={form.sslWarnDays}
                      onChange={(event) => set('sslWarnDays', event.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                )}
              </div>

              <div className="border border-degraded/35 bg-degraded/10 p-3">
                <Toggle
                  id="allowPrivate"
                  checked={form.allowPrivate}
                  onChange={(checked) => set('allowPrivate', checked)}
                  label={t('monitors.allowPrivate')}
                  help={t('monitors.allowPrivateHelp')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel">
            <div className="panel-head">
              <h2 className="text-xs font-medium text-ink">{t('monitors.schedule')}</h2>
              <span className="mono text-[9px] text-faint">03</span>
            </div>
            <div className="space-y-4 p-4">
              <Field label={t('monitors.interval')} htmlFor="interval" error={errors.intervalSeconds} help={t('monitors.intervalHelp')}>
                <div className="relative">
                  <input
                    id="interval"
                    className="input numeric pe-16"
                    value={form.intervalSeconds}
                    onChange={(event) => set('intervalSeconds', event.target.value)}
                    inputMode="numeric"
                  />
                  <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[9px] text-faint">
                    {t('monitors.seconds')}
                  </span>
                </div>
              </Field>
              <Field label={t('monitors.timeout')} htmlFor="timeout" error={errors.timeoutMs}>
                <div className="relative">
                  <input
                    id="timeout"
                    className="input numeric pe-14"
                    value={form.timeoutMs}
                    onChange={(event) => set('timeoutMs', event.target.value)}
                    inputMode="numeric"
                  />
                  <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[9px] text-faint">
                    {t('common.milliseconds')}
                  </span>
                </div>
              </Field>
              <Field label={t('monitors.retries')} htmlFor="retries" error={errors.retries} help={t('monitors.retriesHelp')}>
                <input
                  id="retries"
                  className="input numeric"
                  value={form.retries}
                  onChange={(event) => set('retries', event.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <div className="border-t border-line pt-3">
                <Toggle
                  id="enabled"
                  checked={form.enabled}
                  onChange={(checked) => set('enabled', checked)}
                  label={t('monitors.enabled')}
                  help={t('monitors.enabledHelp')}
                />
              </div>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-ink">
              <Icon name="shield" className="h-4 w-4 text-accent" />
              {t('settings.security')}
            </h2>
            <p className="text-xs leading-relaxed text-muted">{t('settings.privateWarning')}</p>
          </section>
        </div>
      </form>
    </AdminLayout>
  );
}
