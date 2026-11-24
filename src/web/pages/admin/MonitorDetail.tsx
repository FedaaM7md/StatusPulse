/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { LatencyChart } from '../../components/LatencyChart';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { UptimeBars } from '../../components/UptimeBars';
import {
  api,
  ApiError,
  type CheckResultView,
  type DailyPoint,
  type MonitorDetailResponse,
  type MonitorResultsResponse,
} from '../../lib/api';
import { formatDateTime, formatMs, formatPercent, formatRelative } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Link, navigate } from '../../lib/router';
import { incidentDot, incidentTone, monitorTypeBadge, monitorTypeKey } from '../../lib/status';
import { incidentDisplayTitle, monitorDisplayName, monitorGroupName } from '../../lib/labels';
import { checkForms, countText, dayForms, downCheckForms } from '../../lib/plural';

function UptimeReading({ label, value, checks, down }: { label: string; value: number | null; checks: number; down: number }) {
  const { lang } = useI18n();
  return (
    <div className="px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="mono mt-1 text-xl font-medium text-ink">{formatPercent(value)}</p>
      <p className="mt-0.5 text-[9px] text-faint">
        {countText(checks, lang, checkForms)}
        {down > 0 ? ` · ${countText(down, lang, downCheckForms)}` : ''}
      </p>
    </div>
  );
}

function targetLabel(data: MonitorDetailResponse): string {
  const monitor = data.monitor;
  switch (monitor.type) {
    case 'http':
      return monitor.url ?? '—';
    case 'tcp':
      return `${monitor.host ?? '—'}:${monitor.port ?? '—'}`;
    case 'dns':
      return `${monitor.host ?? '—'} (${monitor.recordType ?? '—'})`;
    case 'ssl':
      return `${monitor.host ?? '—'}:${monitor.port ?? 443}`;
    default:
      return '—';
  }
}

export function MonitorDetailPage({ monitorId }: { monitorId: number }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<MonitorDetailResponse | null>(null);
  const [rangeData, setRangeData] = useState<MonitorResultsResponse | null>(null);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getMonitor(monitorId);
      setData(result);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [monitorId]);

  const loadRange = useCallback(
    async (nextRange: '24h' | '7d' | '30d') => {
      try {
        const result = await api.getMonitorResults(monitorId, nextRange);
        setRangeData(result);
      } catch {
        toast.show(t('errors.network'), 'error');
      }
    },
    [monitorId, t, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRange(range);
  }, [range, loadRange]);

  const runCheck = async () => {
    setChecking(true);
    try {
      await api.runCheck(monitorId);
      await Promise.all([load(), loadRange(range)]);
      toast.show(t('monitors.checkQueued'), 'success');
    } catch (error) {
      toast.show(t(error instanceof ApiError ? error.messageKey : 'monitors.checkError'), 'error');
    } finally {
      setChecking(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteMonitor(monitorId);
      toast.show(t('monitors.deleted'), 'success');
      navigate('/admin/monitors');
    } catch (error) {
      toast.show(t(error instanceof ApiError ? error.messageKey : 'errors.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-20" />
          <div className="skeleton h-72" />
        </div>
      </AdminLayout>
    );
  }

  if (notFound || !data) {
    return (
      <AdminLayout>
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('monitorDetail.notFound')}</p>
          <Link to="/admin/monitors" className="btn-primary mt-4">
            {t('monitors.detailBack')}
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const monitor = data.monitor;
  const currentDailies: DailyPoint[] = rangeData?.daily ?? data.daily;
  const results: CheckResultView[] = rangeData?.results ?? data.results;
  const latest = results[results.length - 1];
  const detail = (latest?.detail ?? {}) as Record<string, unknown>;
  const sslValidTo = typeof detail.validTo === 'string' ? detail.validTo : null;
  const sslIssuer = typeof detail.issuer === 'string' ? detail.issuer : null;
  const sslDays = typeof detail.daysRemaining === 'number' ? detail.daysRemaining : null;

  return (
    <AdminLayout>
      <PageHeader
        title={monitorDisplayName(monitor, lang)}
        subtitle={`${monitorGroupName(monitor, lang)} · ${t(monitorTypeKey[monitor.type]!)}`}
        backTo="/admin/monitors"
        actions={
          <>
            {!monitor.demo && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void runCheck()} disabled={checking}>
                {checking ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
                {checking ? t('monitors.checking') : t('monitors.runCheck')}
              </button>
            )}
            <Link to={`/admin/monitors/${monitor.id}/edit`} className="btn-secondary btn-sm">
              <Icon name="edit" className="h-3.5 w-3.5" />
              {t('common.edit')}
            </Link>
            <button type="button" className="btn-secondary btn-sm text-down" onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              {t('common.delete')}
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge state={monitor.maintenance ? 'maintenance' : monitor.currentState} />
        <span className={`chip ${monitorTypeBadge[monitor.type]}`}>{t(monitorTypeKey[monitor.type]!)}</span>
        {monitor.demo && <span className="chip chip-unknown">{t('demo.badge')}</span>}
        <span className={`chip ${monitor.enabled ? 'chip-up' : 'chip-unknown'}`}>
          {monitor.enabled ? t('monitors.enabledBadge') : t('monitors.pausedBadge')}
        </span>
        <span className="mono max-w-full truncate border border-line bg-panel2 px-2 py-1 text-[10px] text-muted" dir="ltr">
          {monitor.name}
        </span>
        <span className="mono max-w-full truncate border border-line bg-panel2 px-2 py-1 text-[10px] text-muted" dir="ltr">
          {targetLabel(data)}
        </span>
        <span className="ms-auto text-[9px] text-faint">
          {monitor.lastCheckedAt ? t('monitorDetail.lastChecked', { time: formatRelative(monitor.lastCheckedAt, lang) }) : t('admin.overview.neverChecked')}
        </span>
      </div>

      <div className="space-y-4">
        <section className="panel grid grid-cols-1 divide-line sm:grid-cols-3 sm:divide-x rtl:sm:divide-x-reverse">
          <UptimeReading label={t('monitors.uptime24h')} value={data.stats.uptime24h.uptime} checks={data.stats.uptime24h.checks} down={data.stats.uptime24h.downChecks} />
          <UptimeReading label={t('monitors.uptime7d')} value={data.stats.uptime7d.uptime} checks={data.stats.uptime7d.checks} down={data.stats.uptime7d.downChecks} />
          <UptimeReading label={t('monitors.uptime30d')} value={data.stats.uptime30d.uptime} checks={data.stats.uptime30d.checks} down={data.stats.uptime30d.downChecks} />
        </section>

        {sslValidTo && (
          <section className="panel" aria-labelledby="ssl-heading">
            <div className="panel-head">
              <h2 id="ssl-heading" className="flex items-center gap-2 text-xs font-medium text-ink">
                <Icon name="lock" className="h-3.5 w-3.5 text-accent" />
                {t('monitorDetail.sslDetails')}
              </h2>
            </div>
            <dl className="grid gap-3 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="eyebrow">{t('monitorDetail.expires')}</dt>
                <dd className="tnum mt-1 text-xs text-ink">{formatDateTime(new Date(sslValidTo).getTime(), lang)}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('monitorDetail.daysRemaining', { days: countText(sslDays ?? 0, lang, dayForms) })}</dt>
                <dd className="mono mt-1 text-xs text-ink">{sslDays ?? '—'}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('monitorDetail.issuer')}</dt>
                <dd className="mt-1 truncate text-xs text-ink" dir="ltr">{sslIssuer ?? '—'}</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="panel" aria-labelledby="chart-heading">
          <div className="panel-head">
            <div>
              <h2 id="chart-heading" className="text-xs font-medium text-ink">
                {t('chart.latencyTitle')}
              </h2>
              <p className="text-[9px] text-faint">
                {t('monitorDetail.avgLatency')}: {formatMs(rangeData?.stats.uptime24h.avgLatencyMs ?? data.stats.uptime24h.avgLatencyMs)}
              </p>
            </div>
            <div className="flex border border-line bg-panel2 p-0.5" role="group" aria-label={t('aria.timeRange')}>
              {(['24h', '7d', '30d'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={range === option}
                  onClick={() => setRange(option)}
                  className={`px-2.5 py-1 text-[9px] transition ${
                    range === option ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t(`monitorDetail.range${option}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <LatencyChart results={results} />
          </div>
        </section>

        <section className="panel" aria-labelledby="bars-heading">
          <div className="panel-head">
            <h2 id="bars-heading" className="text-xs font-medium text-ink">
              {t('public.uptime90')}
            </h2>
            <span className="text-[9px] text-faint">{t('public.uptimeLegend')}</span>
          </div>
          <div className="p-4">
            <UptimeBars days={currentDailies} label={`${monitor.name} — ${t('public.uptime90')}`} />
          </div>
        </section>

        <section className="panel overflow-hidden" aria-labelledby="checks-heading">
          <div className="panel-head">
            <h2 id="checks-heading" className="text-xs font-medium text-ink">
              {t('monitorDetail.checksTable')}
            </h2>
            <div className="flex items-center gap-3">
              <a
                href={`/api/admin/monitors/${monitor.id}/export?range=${range}`}
                className="text-[9px] text-accent hover:underline"
              >
                {t('monitorDetail.exportCsv')}
              </a>
              <span className="mono text-[9px] text-faint">{results.length}</span>
            </div>
          </div>
          {results.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">{t('monitorDetail.noResults')}</p>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[620px]">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitorDetail.checkedAt')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('common.status')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitorDetail.statusCode')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitorDetail.latency')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitorDetail.error')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...results]
                    .slice(-40)
                    .reverse()
                    .map((result) => (
                      <tr key={result.id} className="transition hover:bg-panel2/50">
                        <td className="table-cell tnum whitespace-nowrap text-[10px] text-muted">{formatDateTime(result.checkedAt, lang)}</td>
                        <td className="table-cell"><StatusBadge state={result.state} size="sm" /></td>
                        <td className="table-cell mono text-xs">{result.statusCode ?? '—'}</td>
                        <td className="table-cell mono text-xs">{formatMs(result.latencyMs)}</td>
                        <td className="table-cell max-w-[22rem]">
                          <span className="block truncate text-xs text-muted" title={result.error ?? ''}>{result.error ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-line md:hidden">
              {[...results]
                .slice(-40)
                .reverse()
                .map((result) => (
                  <div key={result.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum text-[10px] text-muted">{formatDateTime(result.checkedAt, lang)}</span>
                      <StatusBadge state={result.state} size="sm" />
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-faint">
                      <span>
                        {t('monitorDetail.statusCode')}: <span className="mono text-muted">{result.statusCode ?? '—'}</span>
                      </span>
                      <span>
                        {t('monitorDetail.latency')}: <span className="mono text-muted">{formatMs(result.latencyMs)}</span>
                      </span>
                    </div>
                    {result.error && <p className="mt-1 truncate text-[10px] text-down" title={result.error}>{result.error}</p>}
                  </div>
                ))}
            </div>
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="monitor-incidents-heading">
          <div className="panel-head">
            <h2 id="monitor-incidents-heading" className="text-xs font-medium text-ink">
              {t('monitorDetail.incidents')}
            </h2>
            <Link to="/admin/incidents" className="text-[9px] text-accent hover:underline">
              {t('common.viewAll')}
            </Link>
          </div>
          {data.incidents.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">{t('monitorDetail.noIncidents')}</p>
          ) : (
            <ul className="divide-y divide-line/70 px-4">
              {data.incidents.map((incident) => (
                <li key={incident.id}>
                  <Link to={`/admin/incidents/${incident.id}`} className="flex items-center gap-2.5 py-2.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${incidentDot[incident.status]}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">{incidentDisplayTitle(incident, lang)}</p>
                      <p className="tnum text-[9px] text-faint">{formatDateTime(incident.startedAt, lang)}</p>
                    </div>
                    <span className={`chip ${incidentTone[incident.status]}`}>{t(`incidents.status.${incident.status}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={deleteOpen}
        title={t('monitors.deleteTitle')}
        onClose={() => setDeleteOpen(false)}
        busy={deleting}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="font-medium text-ink">{monitor.name}</p>
        <p className="mt-2">{t('monitors.deleteWarning')}</p>
      </Modal>
    </AdminLayout>
  );
}
