/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { api, ApiError, type AdminMonitorListItem, type MaintenanceListItem } from '../../lib/api';
import { formatDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { monitorDisplayName } from '../../lib/labels';

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = now.getTime() + 60 * 60 * 1000;
  return { start: toDateTimeLocalValue(start), end: toDateTimeLocalValue(start + 2 * 60 * 60 * 1000) };
}

export function MaintenancePage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const initial = useMemo(defaultRange, []);
  const [windows, setWindows] = useState<MaintenanceListItem[]>([]);
  const [monitors, setMonitors] = useState<AdminMonitorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(initial.start);
  const [endsAt, setEndsAt] = useState(initial.end);
  const [monitorId, setMonitorId] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MaintenanceListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [windowsResult, monitorsResult] = await Promise.all([api.getMaintenance(), api.getMonitors()]);
      setWindows(windowsResult.windows);
      setMonitors(monitorsResult.monitors);
    } catch {
      toast.show(t('errors.network'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopeName = (id: number | null): string => {
    if (id === null) return t('maintenance.allMonitors');
    const monitor = monitors.find((item) => item.id === id);
    return monitor ? monitorDisplayName(monitor, lang) : t('maintenance.allMonitors');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const start = fromDateTimeLocalValue(startsAt);
    const end = fromDateTimeLocalValue(endsAt);
    if (!title.trim() || !Number.isFinite(start) || !Number.isFinite(end)) {
      setFormError(t('errors.validation'));
      return;
    }
    if (end <= start) {
      setFormError(t('maintenance.invalidRange'));
      return;
    }
    setCreating(true);
    try {
      await api.createMaintenance({
        title: title.trim(),
        startsAt: start,
        endsAt: end,
        monitorId: monitorId ? Number(monitorId) : null,
      });
      toast.show(t('maintenance.created'), 'success');
      setTitle('');
      const range = defaultRange();
      setStartsAt(range.start);
      setEndsAt(range.end);
      setMonitorId('');
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        const firstField = Object.values(error.fields)[0];
        setFormError(t(firstField ?? error.messageKey));
      } else {
        setFormError(t('errors.generic'));
      }
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteMaintenance(toDelete.id);
      toast.show(t('maintenance.deleted'), 'success');
      setToDelete(null);
      await load();
    } catch (error) {
      toast.show(t(error instanceof ApiError ? error.messageKey : 'errors.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const groups: Array<{ key: 'active' | 'upcoming' | 'past'; items: MaintenanceListItem[] }> = [
    { key: 'active', items: windows.filter((window) => window.state === 'active') },
    { key: 'upcoming', items: windows.filter((window) => window.state === 'upcoming') },
    { key: 'past', items: windows.filter((window) => window.state === 'past') },
  ];

  return (
    <AdminLayout>
      <PageHeader title={t('maintenance.title')} subtitle={t('maintenance.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {loading && (
            <div className="space-y-2" aria-busy="true">
              {[0, 1].map((index) => (
                <div key={index} className="skeleton h-20" />
              ))}
            </div>
          )}

          {!loading && windows.length === 0 && (
            <EmptyState icon="calendar" title={t('maintenance.empty')} hint={t('maintenance.explain')} />
          )}

          {!loading &&
            groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <section key={group.key} aria-labelledby={`maintenance-${group.key}`}>
                  <h2 id={`maintenance-${group.key}`} className="eyebrow mb-2">
                    {t(`maintenance.${group.key}`)}
                  </h2>
                  <div className="panel divide-y divide-line">
                    {group.items.map((window) => (
                      <div key={window.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span
                            className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center border ${
                              window.state === 'active'
                                ? 'border-maint/35 bg-maint/10 text-maint'
                                : window.state === 'upcoming'
                                  ? 'border-accent/30 bg-accent/10 text-accent'
                                  : 'border-line bg-panel2 text-muted'
                            }`}
                          >
                            <Icon name="calendar" className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {lang === 'ar' ? window.titleAr || window.title : window.titleEn || window.title}
                            </p>
                            <p className="text-[9px] text-faint">{scopeName(window.monitorId)}</p>
                            <p className="tnum mt-1 text-[9px] text-muted">
                              {formatDateTime(window.startsAt, lang)} → {formatDateTime(window.endsAt, lang)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`chip ${
                              window.state === 'active' ? 'chip-maint' : window.state === 'upcoming' ? 'chip-unknown' : 'chip-unknown'
                            }`}
                          >
                            {t(`maintenance.${window.state}`)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setToDelete(window)}
                            className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-muted transition hover:border-down/40 hover:bg-down/10 hover:text-down"
                            aria-label={t('maintenance.deleteTitle')}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
        </div>

        <section className="panel h-fit lg:sticky lg:top-[4.5rem]" aria-labelledby="schedule-heading">
          <div className="panel-head">
            <h2 id="schedule-heading" className="flex items-center gap-2 text-xs font-medium text-ink">
              <Icon name="calendar" className="h-3.5 w-3.5 text-accent" />
              {t('maintenance.new')}
            </h2>
          </div>
          <form onSubmit={submit} className="space-y-3 p-4" noValidate>
            <div>
              <label htmlFor="window-title" className="label">{t('maintenance.windowTitle')}</label>
              <input
                id="window-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('maintenance.titlePlaceholder')}
                maxLength={120}
                required
              />
            </div>
            <div>
              <label htmlFor="window-start" className="label">{t('maintenance.start')}</label>
              <input id="window-start" type="datetime-local" className="input mono" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
            </div>
            <div>
              <label htmlFor="window-end" className="label">{t('maintenance.end')}</label>
              <input id="window-end" type="datetime-local" className="input mono" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
            </div>
            <div>
              <label htmlFor="window-scope" className="label">{t('maintenance.scope')}</label>
              <select id="window-scope" className="select" value={monitorId} onChange={(event) => setMonitorId(event.target.value)}>
                <option value="">{t('maintenance.allMonitors')}</option>
                {monitors.map((monitor) => (
                  <option key={monitor.id} value={monitor.id}>{monitorDisplayName(monitor, lang)}</option>
                ))}
              </select>
            </div>

            {formError && (
              <p className="field-error" role="alert">
                <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
                {formError}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />}
              {creating ? t('common.saving') : t('maintenance.new')}
            </button>
            <p className="text-[10px] leading-relaxed text-faint">{t('maintenance.explain')}</p>
          </form>
        </section>
      </div>

      <Modal
        open={toDelete !== null}
        title={t('maintenance.deleteTitle')}
        onClose={() => setToDelete(null)}
        busy={deleting}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setToDelete(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p>{t('maintenance.deleteConfirm')}</p>
        {toDelete && <p className="mt-2 font-medium text-ink">{toDelete.title}</p>}
      </Modal>
    </AdminLayout>
  );
}
