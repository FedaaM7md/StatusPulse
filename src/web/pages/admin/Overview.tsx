/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import type { NotificationEntry } from '../../../shared/types';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { StatusBadge, StatusDot } from '../../components/StatusBadge';
import { api, type AdminMonitorListItem, type SummaryResponse } from '../../lib/api';
import { formatPercent, formatRelative } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Link } from '../../lib/router';
import { incidentDot, incidentTone } from '../../lib/status';
import { incidentDisplayTitle, monitorDisplayName, monitorGroupName, notificationDisplayName, notificationMessage } from '../../lib/labels';
import { activeCheckForms, countText, monitorForms, pausedMonitorForms } from '../../lib/plural';

function Reading({ label, value, hint, tone = 'text-ink' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`mono mt-1.5 text-xl font-medium ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[9px] text-faint">{hint}</p>}
    </div>
  );
}

function NotificationLine({ entry }: { entry: NotificationEntry }) {
  const { t, lang } = useI18n();
  const dot =
    entry.level === 'error'
      ? 'bg-down'
      : entry.level === 'warning'
        ? 'bg-degraded'
        : entry.level === 'success'
          ? 'bg-up'
          : 'bg-maint';
  const technicalName = entry.monitor?.name;
  const displayName = notificationDisplayName(entry, lang);
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{notificationMessage(entry, lang, t)}</p>
        <p className="mt-0.5 truncate text-[9px] text-faint">
          {technicalName && displayName && technicalName !== displayName && (
            <span className="mono" dir="ltr">
              {technicalName} ·{' '}
            </span>
          )}
          {formatRelative(entry.createdAt, lang)}
        </p>
      </div>
    </li>
  );
}

export function OverviewPage() {
  const { t, lang } = useI18n();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [monitors, setMonitors] = useState<AdminMonitorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [summaryResult, monitorResult] = await Promise.all([api.getSummary(), api.getMonitors()]);
      setSummary(summaryResult);
      setMonitors(monitorResult.monitors);
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

  const enabled = monitors.filter((monitor) => monitor.enabled);

  return (
    <AdminLayout>
      <PageHeader
        title={t('admin.overview.title')}
        subtitle={t('admin.overview.subtitle')}
        actions={
          <>
            <button type="button" onClick={() => void load()} className="btn-secondary btn-sm" disabled={loading}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              {t('common.refresh')}
            </button>
            <Link to="/admin/monitors/new" className="btn-primary btn-sm">
              <Icon name="plus" className="h-3.5 w-3.5" />
              {t('monitors.new')}
            </Link>
          </>
        }
      />

      {loading && !summary && (
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="skeleton h-72 lg:col-span-2" />
            <div className="skeleton h-72" />
          </div>
        </div>
      )}

      {error && !summary && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('errors.network')}</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <section className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse" aria-label={t('admin.overview.title')}>
            <Reading
              label={t('admin.overview.monitors')}
              value={`${summary.monitors.enabled}`}
              hint={`${countText(summary.monitors.total, lang, monitorForms)} · ${countText(summary.monitors.paused, lang, pausedMonitorForms)}`}
            />
            <Reading
              label={t('admin.overview.up')}
              value={`${summary.monitors.up}/${summary.monitors.enabled}`}
              hint={
                summary.monitors.down + summary.monitors.degraded === 0
                  ? t('admin.overview.allGood')
                  : t('admin.overview.needsAttention')
              }
              tone={summary.monitors.down > 0 ? 'text-down' : 'text-up'}
            />
            <Reading
              label={t('admin.overview.openIncidents')}
              value={`${summary.openIncidents}`}
              hint={summary.openIncidents > 0 ? t('incidents.ongoing') : t('admin.overview.allGood')}
              tone={summary.openIncidents > 0 ? 'text-degraded' : 'text-up'}
            />
            <Reading
              label={t('admin.overview.avgUptime')}
              value={formatPercent(summary.avgUptime24h)}
              hint={t('admin.overview.last24h')}
              tone="text-accent"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <section className="panel overflow-hidden" aria-labelledby="health-heading">
              <div className="panel-head">
                <div>
                  <h2 id="health-heading" className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Icon name="pulse" className="h-4 w-4 text-accent" />
                    {t('admin.overview.health')}
                  </h2>
                  <p className="text-[9px] text-faint">{t('admin.overview.nextRun')}</p>
                </div>
                <Link to="/admin/monitors" className="text-[9px] text-accent hover:underline">
                  {t('common.viewAll')}
                </Link>
              </div>

              {enabled.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon="server"
                    title={t('admin.overview.noMonitors')}
                    action={
                      <Link to="/admin/monitors/new" className="btn-primary btn-sm">
                        <Icon name="plus" className="h-3.5 w-3.5" />
                        {t('admin.overview.createFirst')}
                      </Link>
                    }
                  />
                </div>
              ) : (
                <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[640px]">
                    <thead className="table-head">
                      <tr>
                        <th scope="col" className="px-4 py-2 text-start font-medium">{t('common.name')}</th>
                        <th scope="col" className="px-4 py-2 text-start font-medium">{t('common.status')}</th>
                        <th scope="col" className="px-4 py-2 text-start font-medium">{t('monitors.uptime24h')}</th>
                        <th scope="col" className="hidden px-4 py-2 text-start font-medium sm:table-cell">{t('monitors.lastCheck')}</th>
                        <th scope="col" className="px-4 py-2 text-end font-medium">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enabled.map((monitor) => (
                        <tr key={monitor.id} className="transition hover:bg-panel2/60">
                          <td className="table-cell">
                            <Link to={`/admin/monitors/${monitor.id}`} className="flex min-w-0 items-center gap-2.5">
                              <StatusDot state={monitor.maintenance ? 'maintenance' : monitor.currentState} pulse />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-ink">{monitorDisplayName(monitor, lang)}</span>
                                <span className="block text-[9px] text-faint">
                                  {monitorGroupName(monitor, lang)} · {monitor.type}
                                  {monitor.demo ? ` · ${t('demo.badge')}` : ''}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="table-cell">
                            <StatusBadge state={monitor.maintenance ? 'maintenance' : monitor.currentState} size="sm" />
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <span className="mono text-xs text-ink">{formatPercent(monitor.uptime24h)}</span>
                              <svg width="64" height="4" viewBox="0 0 64 4" className="hidden sm:block" aria-hidden="true">
                                <rect width="64" height="4" className="fill-line" />
                                <rect
                                  width={Math.max(0, Math.min(64, (monitor.uptime24h ?? 0) * 0.64))}
                                  height="4"
                                  className={monitor.uptime24h === null ? 'fill-line' : monitor.uptime24h >= 99 ? 'fill-up' : monitor.uptime24h >= 95 ? 'fill-degraded' : 'fill-down'}
                                />
                              </svg>
                            </div>
                          </td>
                          <td className="table-cell hidden text-[11px] text-muted sm:table-cell">
                            {monitor.lastCheckedAt ? formatRelative(monitor.lastCheckedAt, lang) : t('admin.overview.neverChecked')}
                          </td>
                          <td className="table-cell text-end">
                            <Link
                              to={`/admin/monitors/${monitor.id}`}
                              className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted transition hover:border-line-strong hover:text-ink"
                              aria-label={t('monitors.title')}
                            >
                              <Icon name="chevron" className="h-3.5 w-3.5 rtl:rotate-180" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-line md:hidden">
                  {enabled.map((monitor) => (
                    <Link
                      key={monitor.id}
                      to={`/admin/monitors/${monitor.id}`}
                      className="block px-4 py-3 transition hover:bg-panel2/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <StatusDot state={monitor.maintenance ? 'maintenance' : monitor.currentState} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{monitorDisplayName(monitor, lang)}</span>
                            <span className="block text-[9px] text-faint">
                              {monitorGroupName(monitor, lang)} · {monitor.type}
                              {monitor.demo ? ` · ${t('demo.badge')}` : ''}
                            </span>
                          </span>
                        </div>
                        <StatusBadge state={monitor.maintenance ? 'maintenance' : monitor.currentState} size="sm" />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                        <span>{monitor.lastCheckedAt ? formatRelative(monitor.lastCheckedAt, lang) : t('admin.overview.neverChecked')}</span>
                        <span className="mono text-xs text-ink">{formatPercent(monitor.uptime24h)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                </>
              )}
              <div className="border-t border-line bg-panel2 px-4 py-2 text-[9px] text-faint">
                {t('admin.overview.footer', { checks: countText(summary.monitors.enabled, lang, activeCheckForms) })}
              </div>
            </section>

            <div className="space-y-4">
              <section className="panel" aria-labelledby="recent-incidents-heading">
                <div className="panel-head">
                  <h2 id="recent-incidents-heading" className="text-xs font-medium text-ink">
                    {t('admin.overview.recentIncidents')}
                  </h2>
                  <Link to="/admin/incidents" className="text-[9px] text-accent hover:underline">
                    {t('common.viewAll')}
                  </Link>
                </div>
                {summary.recentIncidents.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">{t('admin.overview.noIncidents')}</p>
                ) : (
                  <ul className="divide-y divide-line/70 px-4">
                    {summary.recentIncidents.map((incident) => (
                      <li key={incident.id}>
                        <Link to={`/admin/incidents/${incident.id}`} className="flex items-center gap-2.5 py-2.5">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${incidentDot[incident.status]}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-ink">{incidentDisplayTitle(incident, lang)}</p>
                            <p className="text-[9px] text-faint">{formatRelative(incident.startedAt, lang)}</p>
                          </div>
                          <span className={`chip ${incidentTone[incident.status]}`}>{t(`incidents.status.${incident.status}`)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel" aria-labelledby="notifications-heading">
                <div className="panel-head">
                  <h2 id="notifications-heading" className="text-xs font-medium text-ink">
                    {t('admin.overview.notifications')}
                  </h2>
                  <Link to="/admin/notifications" className="text-[9px] text-accent hover:underline">
                    {t('common.viewAll')}
                  </Link>
                </div>
                {summary.notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">{t('admin.overview.noNotifications')}</p>
                ) : (
                  <ul className="divide-y divide-line/70 px-4">
                    {summary.notifications.map((entry) => (
                      <NotificationLine key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </section>

              <section className="border border-line bg-[rgb(var(--c-bg))] p-3" aria-labelledby="console-heading">
                <h2 id="console-heading" className="eyebrow mb-2 flex items-center gap-1.5">
                  <Icon name="terminal" className="h-3.5 w-3.5 text-accent" />
                  {t('admin.overview.console')}
                </h2>
                <div className="mono space-y-1 text-[9px] leading-relaxed text-faint">
                  <p><span className="text-up">$</span> scheduler --status</p>
                  <p className="text-muted">tick=1s concurrency=4 retention=180d</p>
                  <p><span className="text-up">$</span> monitors --summary</p>
                  <p className="text-muted">
                    enabled={summary.monitors.enabled} down={summary.monitors.down} degraded={summary.monitors.degraded}
                  </p>
                  <p><span className="text-up">$</span> incidents --open</p>
                  <p className="text-muted">open={summary.openIncidents} unread={summary.unreadNotifications}</p>
                  <p className="flex items-center gap-1.5 text-accent">
                    <span className="h-1 w-1 animate-pulse-soft rounded-full bg-accent" aria-hidden="true" />
                    {t('admin.overview.liveTail')}
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
