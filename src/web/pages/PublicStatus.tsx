/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import type { DisplayState, PublicIncident, PublicMonitor, PublicStatusResponse } from '../../shared/types';
import { LogoMark } from '../components/Logo';
import { PublicBrand } from '../components/PublicBrand';
import { LanguageSwitch } from '../components/Feedback';
import { StatusDot } from '../components/StatusBadge';
import { UptimeBars } from '../components/UptimeBars';
import { Icon } from '../components/Icon';
import { PublicFooter } from '../components/PublicFooter';
import { api } from '../lib/api';
import { readBootstrap } from '../lib/bootstrap';
import { formatDateTime, formatDay, formatPercent } from '../lib/format';
import { useI18n, usePageTitle } from '../lib/i18n';
import { statusTone, overallKey } from '../lib/status';
import { Link } from '../lib/router';

function UpdateMessage({ update }: { update: PublicIncident['updates'][number] }) {
  const { t } = useI18n();
  const params = (update.params ?? {}) as Record<string, string | number>;
  const text = update.message ?? (update.messageKey ? t(update.messageKey, params) : '');
  return <span>{text}</span>;
}

function incidentTitle(incident: PublicIncident, lang: 'ar' | 'en'): string {
  if (lang === 'ar') return incident.titleAr || incident.monitorDisplayName?.ar || incident.title;
  return incident.titleEn || incident.monitorDisplayName?.en || incident.title;
}

function incidentSummary(incident: PublicIncident, lang: 'ar' | 'en'): string | null {
  return lang === 'ar' ? incident.summaryAr : incident.summaryEn;
}

function IncidentBlock({ incident }: { incident: PublicIncident }) {
  const { t, lang } = useI18n();
  const latest = incident.updates[incident.updates.length - 1];
  return (
    <article className="border border-line bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${incident.severity === 'major' ? 'chip-down' : 'chip-degraded'}`}>
              {t(incident.severity === 'major' ? 'incidents.severity.major' : 'incidents.severity.minor')}
            </span>
            <span className="chip chip-unknown">{t(`incidents.status.${incident.status}`)}</span>
            {!incident.resolvedAt && (
              <span className="chip chip-down">
                <span className="h-1 w-1 animate-pulse-soft rounded-full bg-down" aria-hidden="true" />
                {t('public.ongoing')}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-ink">{incidentTitle(incident, lang)}</h3>
          {incidentSummary(incident, lang) && (
            <p className="mt-1 text-xs leading-relaxed text-muted">{incidentSummary(incident, lang)}</p>
          )}
          <p className="tnum mt-0.5 text-[9px] text-faint">
            {formatDateTime(incident.startedAt, lang)}
            {incident.resolvedAt ? ` → ${formatDateTime(incident.resolvedAt, lang)}` : ''}
          </p>
        </div>
      </div>
      {incident.updates.length > 0 && (
        <ol className="divide-y divide-line/70" aria-label={t('aria.incidentTimeline')}>
          {incident.updates.map((update) => (
            <li key={update.id} className="grid grid-cols-1 gap-0.5 px-4 py-2.5 sm:grid-cols-[auto_1fr] sm:gap-3">
              <span className="tnum whitespace-nowrap text-[9px] text-faint">
                {formatDateTime(update.createdAt, lang)}
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-relaxed text-muted">
                  <UpdateMessage update={update} />
                </p>
                <p className="text-[8px] text-faint">
                  {t(`incidents.status.${update.status}`)}
                  {update.isAutomatic ? ` · ${t('incidents.auto')}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {latest && incident.updates.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted">
          <UpdateMessage update={latest} />
        </p>
      )}
    </article>
  );
}

function ComponentRow({ monitor }: { monitor: PublicMonitor }) {
  const { t, lang } = useI18n();
  const tone = statusTone[monitor.state];
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px_74px_90px] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot state={monitor.state} pulse />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{monitor.displayName[lang] || monitor.name}</p>
          <p className="mono text-[9px] text-faint">
            {monitor.name} · {monitor.type}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <UptimeBars days={monitor.days} label={`${monitor.displayName[lang] || monitor.name} — ${t('public.uptime90')}`} compact />
        <div className="mt-1 flex justify-between text-[8px] text-faint">
          <span>{monitor.days[0] ? formatDay(monitor.days[0].date, lang) : ''}</span>
          <span>{t('public.uptime90Short')}</span>
        </div>
      </div>
      <div className="text-start sm:text-end" title={t('public.uptime24h')}>
        <span className="mono text-xs text-muted">{formatPercent(monitor.uptime24h)}</span>
        <span className="block text-[8px] text-faint">{t('public.uptime24h')}</span>
      </div>
      <div className={`text-start text-[10px] sm:text-end ${tone.text}`}>
        {t(`status.${monitor.state}`)}
      </div>
    </div>
  );
}

function OverallStrip({ data }: { data: PublicStatusResponse }) {
  const { t, lang } = useI18n();
  const state = data.overallState;
  const tone = statusTone[state];
  const counts = data.groups.reduce(
    (acc, group) => {
      for (const monitor of group.monitors) {
        acc.total += 1;
        acc[monitor.state] += 1;
      }
      return acc;
    },
    { total: 0, up: 0, degraded: 0, down: 0, maintenance: 0, unknown: 0 } as Record<DisplayState | 'total', number>,
  );
  return (
    <section className={`border-y ${tone.panel} px-4 py-4 sm:px-5`} aria-label={t('public.overall')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${tone.dot}`} aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-ink sm:text-lg">{t(overallKey(state))}</p>
            <p className="mt-0.5 text-[9px] text-muted">
              {counts.up}/{counts.total} {t('status.up')} · {t('public.checked', { time: formatDateTime(data.refreshedAt, lang) })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted">
          {counts.down > 0 && <span className="chip chip-down">{counts.down} {t('status.down')}</span>}
          {counts.degraded > 0 && <span className="chip chip-degraded">{counts.degraded} {t('status.degraded')}</span>}
          {counts.maintenance > 0 && <span className="chip chip-maint">{counts.maintenance} {t('status.maintenance')}</span>}
          <span>{t('public.autoRefresh')}</span>
        </div>
      </div>
    </section>
  );
}

export function PublicStatusPage() {
  const { t, lang } = useI18n();
  usePageTitle('public.statusTitle');
  const [data, setData] = useState<PublicStatusResponse | null>(() => readBootstrap()?.status ?? null);
  const [loading, setLoading] = useState(() => !readBootstrap()?.status);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.getPublicStatus();
      setData(response);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!data) return;
    document.title = `${data.siteName[lang]} — ${t('app.name')}`;
  }, [data, lang, t]);

  const findMonitorName = (monitorId: number | null): string => {
    if (monitorId === null) return t('maintenance.allMonitors');
    for (const group of data?.groups ?? []) {
      const monitor = group.monitors.find((item) => item.id === monitorId);
      if (monitor) return monitor.name;
    }
    return t('maintenance.allMonitors');
  };

  return (
    <div className="public-shell min-h-screen bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:border focus:border-accent focus:bg-panel focus:px-3 focus:py-2 focus:text-sm"
      >
        {t('aria.skipToContent')}
      </a>

      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <PublicBrand name={data?.siteName[lang] ?? 'Wasla Pay'} />
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <Link
              to="/login"
              className="hidden items-center gap-1.5 border border-line px-2.5 py-1.5 text-[10px] text-muted transition hover:border-line-strong hover:text-ink sm:inline-flex"
            >
              <Icon name="lock" className="h-3 w-3" />
              {t('public.viewAdmin')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && !data && (
          <div className="space-y-4" aria-busy="true">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-56 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        )}

        {error && !data && (
          <div className="mx-auto max-w-lg border border-line bg-panel p-6 text-center">
            <Icon name="alert" className="mx-auto mb-3 h-6 w-6 text-down" />
            <h1 className="text-base font-semibold text-ink">{t('public.errorTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('public.errorBody')}</p>
            <button type="button" onClick={() => void load()} className="btn-secondary btn-sm mt-5">
              <Icon name="refresh" className="h-3.5 w-3.5" />
              {t('common.retry')}
            </button>
          </div>
        )}

        {data && !data.publicPageEnabled && (
          <div className="mx-auto max-w-lg border border-line bg-panel p-6 text-center">
            <LogoMark size={38} className="mx-auto mb-3 text-ink" />
            <h1 className="text-base font-semibold text-ink">{data.siteName[lang]}</h1>
            <p className="mt-1 text-sm text-muted">{t('public.statusPageDisabled')}</p>
          </div>
        )}

        {data && data.publicPageEnabled && (
          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-faint">
                  {t('public.systemStatus')}
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
                  {data.siteName[lang]}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                  {data.siteDescription[lang] || t('app.tagline')}
                </p>
              </div>
              <p className="text-[9px] text-faint">
                {t('public.lastUpdated', { time: formatDateTime(data.refreshedAt, lang) })}
              </p>
            </div>

            <OverallStrip data={data} />

            {data.maintenance.length > 0 && (
              <section className="mt-6" aria-labelledby="maintenance-heading">
                <h2 id="maintenance-heading" className="mb-2 text-[10px] text-faint">
                  {t('public.scheduledMaintenance')}
                </h2>
                <div className="divide-y divide-line border border-line bg-panel">
                  {data.maintenance.map((window) => (
                    <div key={window.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5">
                        <Icon name="calendar" className="mt-0.5 h-4 w-4 shrink-0 text-maint" />
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {lang === 'ar' ? window.titleAr || window.title : window.titleEn || window.title}
                          </p>
                          <p className="text-[9px] text-faint">
                            {window.monitorId === null ? t('maintenance.allMonitors') : findMonitorName(window.monitorId)}
                          </p>
                        </div>
                      </div>
                      <div className="text-start sm:text-end">
                        <span className={`chip ${window.active ? 'chip-maint' : 'chip-unknown'}`}>
                          {window.active ? t('public.ongoing') : t('public.scheduled')}
                        </span>
                        <p className="mt-1 text-[9px] text-muted">
                          {formatDateTime(window.startsAt, lang)} → {formatDateTime(window.endsAt, lang)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6" aria-labelledby="components-heading">
              <div className="mb-2 flex items-end justify-between gap-3">
                <h2 id="components-heading" className="text-[10px] text-faint">
                  {t('public.components')}
                </h2>
                <span className="hidden text-[9px] text-faint sm:inline">
                  {t('public.barsLegend')}
                </span>
              </div>

              {data.groups.length === 0 && (
                <div className="border border-line bg-panel px-4 py-6 text-center text-sm text-muted">
                  {t('public.noComponents')}
                </div>
              )}

              <div className="border border-line bg-panel">
                {data.groups.map((group, index) => (
                  <div key={group.name}>
                    <div className={`flex items-center justify-between gap-3 bg-panel2 px-4 py-2 ${index === 0 ? '' : 'border-t border-line'}`}>
                      <h3 className="text-[10px] font-semibold text-ink">{group.displayName[lang] || group.name}</h3>
                      <span className="mono text-[9px] text-faint">{group.monitors.length}</span>
                    </div>
                    <div className="divide-y divide-line/70">
                      {group.monitors.map((monitor) => (
                        <ComponentRow key={monitor.id} monitor={monitor} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6" aria-labelledby="active-incidents-heading">
              <h2 id="active-incidents-heading" className="mb-2 text-[10px] text-faint">
                {t('public.activeIncidents')}
              </h2>
              {data.activeIncidents.length === 0 ? (
                <div className="flex items-center gap-2 border border-line bg-panel px-4 py-3 text-sm text-muted">
                  <Icon name="check" className="h-4 w-4 text-up" />
                  {t('public.noActiveIncidents')}
                </div>
              ) : (
                <div className="space-y-3">
                  {data.activeIncidents.map((incident) => (
                    <IncidentBlock key={incident.id} incident={incident} />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-6" aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-2 text-[10px] text-faint">
                {t('public.incidentHistory')}
              </h2>
              {data.recentIncidents.length === 0 ? (
                <div className="border border-line bg-panel px-4 py-3 text-sm text-muted">{t('public.noIncidents')}</div>
              ) : (
                <div className="divide-y divide-line border border-line bg-panel">
                  {data.recentIncidents.map((incident) => (
                    <details key={incident.id} className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-panel2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-up" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{incidentTitle(incident, lang)}</p>
                          {incidentSummary(incident, lang) && (
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{incidentSummary(incident, lang)}</p>
                          )}
                          <p className="tnum text-[9px] text-faint">
                            {formatDateTime(incident.startedAt, lang)}
                            {incident.resolvedAt ? ` → ${formatDateTime(incident.resolvedAt, lang)}` : ''}
                          </p>
                        </div>
                        <span className="chip chip-up">{t('incidents.status.resolved')}</span>
                        <Icon
                          name="chevron"
                          className="h-3.5 w-3.5 shrink-0 text-faint transition group-open:rotate-90 rtl:rotate-180 rtl:group-open:-rotate-90"
                        />
                      </summary>
                      <div className="border-t border-line bg-panel2/40 px-3 py-3">
                        <IncidentBlock incident={incident} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
