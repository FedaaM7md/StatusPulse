/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { StatusBadge, StatusDot } from '../../components/StatusBadge';
import { api, ApiError, type AdminMonitorListItem } from '../../lib/api';
import { formatPercent, formatRelative } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Link, navigate } from '../../lib/router';
import { monitorTypeBadge, monitorTypeKey } from '../../lib/status';
import { monitorDisplayName, monitorGroupName } from '../../lib/labels';

function targetLabel(monitor: AdminMonitorListItem): string {
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

export function MonitorsPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [monitors, setMonitors] = useState<AdminMonitorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminMonitorListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getMonitors();
      setMonitors(result.monitors);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return monitors;
    return monitors.filter(
      (monitor) =>
        monitor.name.toLowerCase().includes(term) ||
        (monitor.publicNameAr ?? '').toLowerCase().includes(term) ||
        (monitor.publicNameEn ?? '').toLowerCase().includes(term) ||
        monitor.groupName.toLowerCase().includes(term) ||
        (monitor.publicGroupAr ?? '').toLowerCase().includes(term) ||
        (monitor.publicGroupEn ?? '').toLowerCase().includes(term) ||
        targetLabel(monitor).toLowerCase().includes(term),
    );
  }, [monitors, query]);

  const runCheck = async (monitor: AdminMonitorListItem) => {
    setRunning(monitor.id);
    try {
      await api.runCheck(monitor.id);
      toast.show(t('monitors.checkQueued'), 'success');
      await load();
    } catch (error) {
      toast.show(t(error instanceof ApiError ? error.messageKey : 'monitors.checkError'), 'error');
    } finally {
      setRunning(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteMonitor(toDelete.id);
      toast.show(t('monitors.deleted'), 'success');
      setToDelete(null);
      await load();
    } catch (error) {
      toast.show(t(error instanceof ApiError ? error.messageKey : 'errors.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t('monitors.title')}
        subtitle={t('monitors.subtitle')}
        actions={
          <Link to="/admin/monitors/new" className="btn-primary btn-sm">
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('monitors.new')}
          </Link>
        }
      />

      <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setFilterOpen((open) => !open)}
          aria-expanded={filterOpen}
          className="btn-secondary btn-sm"
        >
          <Icon name="filter" className="h-3.5 w-3.5" />
          {t('monitors.filter')}
        </button>
        <span className="text-[10px] text-faint">
          {filtered.length} / {monitors.length}
        </span>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/65" onClick={() => setFilterOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-filter-title"
            className="absolute inset-x-0 bottom-0 border-t border-line bg-panel p-4 pb-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="monitor-filter-title" className="text-sm font-medium text-ink">{t('monitors.filter')}</h2>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center border border-line text-muted"
                aria-label={t('common.close')}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <label className="relative block w-full">
              <span className="sr-only">{t('monitors.target')}</span>
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('monitors.searchPlaceholder')}
                className="input ps-8"
              />
              <Icon name="filter" className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            </label>
            <button type="button" className="btn-primary mt-3 w-full" onClick={() => setFilterOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 hidden sm:block">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">{t('monitors.target')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('monitors.searchPlaceholder')}
            className="input ps-8"
          />
          <Icon name="filter" className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        </label>
        <p className="text-[9px] text-faint">
          {filtered.length} / {monitors.length} {t('monitors.title').toLowerCase()}
        </p>
      </div>
      </div>

      {loading && monitors.length === 0 && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-14" />
          ))}
        </div>
      )}

      {error && monitors.length === 0 && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('errors.network')}</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && monitors.length === 0 && !error && (
        <EmptyState
          icon="server"
          title={t('monitors.empty')}
          hint={t('monitors.emptyHint')}
          action={
            <Link to="/admin/monitors/new" className="btn-primary btn-sm">
              <Icon name="plus" className="h-3.5 w-3.5" />
              {t('monitors.new')}
            </Link>
          }
        />
      )}

      {filtered.length > 0 && (
        <>
          <div className="panel hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]" aria-label={t('aria.tableMonitors')}>
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('common.name')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('common.type')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('common.status')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitors.uptime24h')}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('monitors.lastCheck')}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((monitor) => (
                    <tr key={monitor.id} className="transition hover:bg-panel2/50">
                      <td className="table-cell">
                        <Link to={`/admin/monitors/${monitor.id}`} className="flex min-w-0 items-center gap-2.5">
                          <StatusDot state={monitor.maintenance ? 'maintenance' : monitor.currentState} pulse />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-ink">{monitorDisplayName(monitor, lang)}</span>
                              {monitor.demo && <span className="chip chip-unknown">{t('demo.badge')}</span>}
                              {!monitor.enabled && <span className="chip chip-unknown">{t('monitors.pausedBadge')}</span>}
                            </span>
                            <span className="mono mt-0.5 block max-w-[22rem] truncate text-[9px] text-faint" dir="ltr">
                              {monitor.name} · {targetLabel(monitor)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="table-cell">
                        <span className={`chip ${monitorTypeBadge[monitor.type]}`}>{t(monitorTypeKey[monitor.type]!)}</span>
                        <span className="mt-1 block text-[9px] text-faint">{monitorGroupName(monitor, lang)}</span>
                      </td>
                      <td className="table-cell">
                        <StatusBadge state={monitor.maintenance ? 'maintenance' : monitor.currentState} size="sm" />
                      </td>
                      <td className="table-cell">
                        <span className="mono text-xs font-medium text-ink">{formatPercent(monitor.uptime24h)}</span>
                      </td>
                      <td className="table-cell text-[10px] text-muted">
                        {monitor.lastCheckedAt ? formatRelative(monitor.lastCheckedAt, lang) : t('common.never')}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1">
                          {!monitor.demo && (
                            <button
                              type="button"
                              onClick={() => void runCheck(monitor)}
                              disabled={running === monitor.id}
                              className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-muted transition hover:border-line hover:bg-panel2 hover:text-accent disabled:opacity-60"
                              title={t('monitors.runCheck')}
                              aria-label={t('monitors.runCheck')}
                            >
                              {running === monitor.id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/monitors/${monitor.id}/edit`)}
                            className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-muted transition hover:border-line hover:bg-panel2 hover:text-ink"
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                          >
                            <Icon name="edit" className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(monitor)}
                            className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-muted transition hover:border-down/40 hover:bg-down/10 hover:text-down"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 md:hidden">
            {filtered.map((monitor) => (
              <div key={monitor.id} className="panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/admin/monitors/${monitor.id}`} className="flex min-w-0 items-center gap-2">
                    <StatusDot state={monitor.maintenance ? 'maintenance' : monitor.currentState} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">{monitorDisplayName(monitor, lang)}</span>
                        {monitor.demo && <span className="chip chip-unknown">{t('demo.badge')}</span>}
                      </span>
                      <span className="mono block truncate text-[9px] text-faint" dir="ltr">
                        {monitor.name} · {targetLabel(monitor)}
                      </span>
                    </span>
                  </Link>
                  <StatusBadge state={monitor.maintenance ? 'maintenance' : monitor.currentState} size="sm" />
                </div>
                <div className="mt-2 flex items-center justify-between text-2xs text-faint">
                  <span className={`chip ${monitorTypeBadge[monitor.type]}`}>{t(monitorTypeKey[monitor.type]!)}</span>
                  <span className="mono text-ink">{formatPercent(monitor.uptime24h)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-[9px] text-faint">
                    {monitor.lastCheckedAt ? formatRelative(monitor.lastCheckedAt, lang) : t('common.never')}
                  </span>
                  <div className="flex items-center gap-1">
                    {!monitor.demo && (
                      <button type="button" onClick={() => void runCheck(monitor)} disabled={running === monitor.id} className="btn-secondary btn-sm" aria-label={t('monitors.runCheck')}>
                        {running === monitor.id ? <Spinner className="h-3 w-3" /> : <Icon name="refresh" className="h-3 w-3" />}
                      </button>
                    )}
                    <Link to={`/admin/monitors/${monitor.id}/edit`} className="btn-secondary btn-sm" aria-label={t('common.edit')}>
                      <Icon name="edit" className="h-3 w-3" />
                    </Link>
                    <button type="button" onClick={() => setToDelete(monitor)} className="btn-secondary btn-sm text-down" aria-label={t('common.delete')}>
                      <Icon name="trash" className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && monitors.length > 0 && filtered.length === 0 && (
        <div className="panel p-6 text-center text-sm text-muted">{t('common.none')}</div>
      )}

      <Modal
        open={toDelete !== null}
        title={t('monitors.deleteTitle')}
        onClose={() => setToDelete(null)}
        busy={deleting}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setToDelete(null)} disabled={deleting}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="font-medium text-ink">{toDelete?.name}</p>
        <p className="mt-2">{t('monitors.deleteWarning')}</p>
      </Modal>
    </AdminLayout>
  );
}
