/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Incident, IncidentStatus, Monitor } from '../../../shared/types';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api, ApiError } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Link } from '../../lib/router';
import { incidentDot, incidentTone } from '../../lib/status';
import { incidentDisplaySummary, incidentDisplayTitle, monitorDisplayName } from '../../lib/labels';
import { countText, updateForms } from '../../lib/plural';

function TimelineMessage({
  message,
  messageKey,
  params,
}: {
  message: string | null;
  messageKey: string | null;
  params: Record<string, unknown> | null;
}) {
  const { t } = useI18n();
  if (message) return <>{message}</>;
  if (messageKey) return <>{t(messageKey, (params ?? {}) as Record<string, string | number>)}</>;
  return null;
}

export function IncidentDetailPage({ incidentId }: { incidentId: number }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<IncidentStatus>('investigating');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getIncident(incidentId);
      setIncident(result.incident);
      setMonitor(result.monitor);
      setStatus(result.incident.status === 'resolved' ? 'resolved' : result.incident.status);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setError(t('incidents.updateRequired'));
      return;
    }
    setError(null);
    setPosting(true);
    try {
      const result = await api.postIncidentUpdate(incidentId, message.trim(), status);
      setIncident(result.incident);
      setMessage('');
      toast.show(t('incidents.updatePosted'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(t(err.fields.message ?? err.messageKey));
      } else {
        toast.show(t('errors.generic'), 'error');
      }
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-64" />
        </div>
      </AdminLayout>
    );
  }

  if (notFound || !incident) {
    return (
      <AdminLayout>
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('incidents.notFound')}</p>
          <Link to="/admin/incidents" className="btn-primary mt-4">
            {t('incidents.title')}
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title={incidentDisplayTitle(incident, lang)}
        subtitle={`${t('incidents.affectedComponent')}: ${monitor ? monitorDisplayName(monitor, lang) : incidentDisplayTitle(incident, lang)}`}
        backTo="/admin/incidents"
        actions={
          monitor && (
            <Link to={`/admin/monitors/${monitor.id}`} className="btn-secondary btn-sm">
              <Icon name="activity" className="h-3.5 w-3.5" />
              {t('monitors.title')}
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="panel">
            <div className="panel-head">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`chip ${incidentTone[incident.status]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${incidentDot[incident.status]}`} aria-hidden="true" />
                  {t(`incidents.status.${incident.status}`)}
                </span>
                <span className="chip chip-unknown">
                  {t(incident.severity === 'major' ? 'incidents.severity.major' : 'incidents.severity.minor')}
                </span>
                {incident.isAutomatic && <span className="chip chip-unknown">{t('incidents.auto')}</span>}
              </div>
              <span className="mono text-[9px] text-faint">INC-{String(incident.id).padStart(4, '0')}</span>
            </div>
            <div className="p-4">
              {incidentDisplaySummary(incident, lang) && (
                <p className="mb-4 text-sm leading-relaxed text-muted">{incidentDisplaySummary(incident, lang)}</p>
              )}
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="eyebrow">{t('incidents.started')}</dt>
                  <dd className="tnum mt-1 text-xs text-ink">{formatDateTime(incident.startedAt, lang)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">{t('incidents.resolvedAt')}</dt>
                  <dd className="tnum mt-1 text-xs text-ink">{incident.resolvedAt ? formatDateTime(incident.resolvedAt, lang) : '—'}</dd>
                </div>
                <div>
                  <dt className="eyebrow">{t('incidents.duration')}</dt>
                  <dd className="mt-1 text-xs text-ink">{formatDuration(incident.startedAt, incident.resolvedAt, lang)}</dd>
                </div>
              </dl>

              {incident.cause && (
                <div className="mt-4 border border-line bg-panel2 p-3">
                  <p className="eyebrow">{t('incidents.cause')}</p>
                  <p className="mono mt-1 break-words text-[10px] leading-relaxed text-muted" dir="ltr">
                    {incident.cause}
                  </p>
                </div>
              )}

              {incident.status === 'resolved' && incident.isAutomatic && (
                <p className="mt-3 flex items-center gap-2 text-xs text-up">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {t('incidents.closedOnRecovery')}
                </p>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="timeline-heading">
            <div className="panel-head">
              <h2 id="timeline-heading" className="text-xs font-medium text-ink">
                {t('incidents.timeline')}
              </h2>
              <span className="text-[9px] text-faint">{countText(incident.updates.length, lang, updateForms)}</span>
            </div>
            {incident.updates.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t('incidents.noUpdates')}</p>
            ) : (
              <ol className="space-y-4 border-s border-line ps-4 pt-4" aria-label={t('aria.incidentTimeline')}>
                {incident.updates.map((update) => (
                  <li key={update.id} className="relative pb-1 pe-4">
                    <span
                      className={`absolute -start-[1.36rem] top-1 h-2 w-2 rounded-full ring-4 ring-panel ${incidentDot[update.status]}`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`chip ${incidentTone[update.status]}`}>{t(`incidents.status.${update.status}`)}</span>
                      {update.isAutomatic && <span className="text-[9px] text-faint">{t('incidents.auto')}</span>}
                      <span className="tnum text-[9px] text-faint">{formatDateTime(update.createdAt, lang)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      <TimelineMessage message={update.message} messageKey={update.messageKey} params={update.params} />
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div>
          <section className="panel p-4 lg:sticky lg:top-[4.5rem]" aria-labelledby="update-heading">
            <h2 id="update-heading" className="text-xs font-medium text-ink">
              {t('incidents.addUpdate')}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t('incidents.statusHelp')}</p>
            <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
              <div>
                <label htmlFor="update-status" className="label">
                  {t('incidents.updateStatus')}
                </label>
                <select id="update-status" className="select" value={status} onChange={(event) => setStatus(event.target.value as IncidentStatus)}>
                  {(['investigating', 'identified', 'monitoring', 'resolved'] as const).map((option) => (
                    <option key={option} value={option}>
                      {t(`incidents.status.${option}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="update-message" className="label">
                  {t('incidents.updates')}
                </label>
                <textarea
                  id="update-message"
                  className="textarea"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t('incidents.updatePlaceholder')}
                  maxLength={2000}
                  rows={5}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'update-error' : undefined}
                />
                {error && (
                  <p id="update-error" className="field-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <button type="submit" className="btn-primary w-full" disabled={posting}>
                {posting ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />}
                {posting ? t('common.saving') : t('incidents.postUpdate')}
              </button>
              <p className="text-[10px] leading-relaxed text-faint">{t('incidents.resolveHint')}</p>
            </form>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
