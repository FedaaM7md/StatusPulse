/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import type { Incident } from '../../../shared/types';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { formatDuration, formatRelative } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Link } from '../../lib/router';
import { incidentDot, incidentTone } from '../../lib/status';
import { incidentDisplaySummary, incidentDisplayTitle, monitorDisplayName } from '../../lib/labels';
import { countText, updateForms } from '../../lib/plural';

type Filter = 'open' | 'resolved' | 'all';

export function IncidentsPage() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (nextFilter: Filter) => {
    setLoading(true);
    try {
      const result = await api.getIncidents(nextFilter === 'all' ? undefined : nextFilter);
      setIncidents(result.incidents);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  return (
    <AdminLayout>
      <PageHeader title={t('incidents.title')} subtitle={t('incidents.subtitle')} />

      <div className="mb-3 flex flex-wrap gap-0.5 border border-line bg-panel p-0.5" role="group" aria-label={t('incidents.filter')}>
        {(['open', 'resolved', 'all'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={`px-3 py-1.5 text-[10px] transition ${
              filter === option ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-panel2 hover:text-ink'
            }`}
          >
            {t(`incidents.${option}`)}
          </button>
        ))}
      </div>

      {loading && incidents.length === 0 && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-16" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('errors.network')}</p>
          <button type="button" onClick={() => void load(filter)} className="btn-secondary mt-4">
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !error && incidents.length === 0 && (
        <EmptyState
          icon="alert"
          title={filter === 'open' ? t('incidents.noTitle') : t('incidents.empty')}
          hint={filter === 'open' ? t('incidents.noTitleHint') : undefined}
        />
      )}

      {!loading && !error && incidents.length > 0 && (
        <div className="panel divide-y divide-line">
          {incidents.map((incident) => (
            <Link key={incident.id} to={`/admin/incidents/${incident.id}`} className="block px-4 py-3 transition hover:bg-panel2/60">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${incidentDot[incident.status]}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="truncate text-sm font-medium text-ink">{incidentDisplayTitle(incident, lang)}</h2>
                      {incidentDisplaySummary(incident, lang) && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{incidentDisplaySummary(incident, lang)}</p>
                      )}
                      <span className={`chip ${incidentTone[incident.status]}`}>{t(`incidents.status.${incident.status}`)}</span>
                      <span className="chip chip-unknown">
                        {t(incident.severity === 'major' ? 'incidents.severity.major' : 'incidents.severity.minor')}
                      </span>
                      {incident.isAutomatic && <span className="chip chip-unknown">{t('incidents.auto')}</span>}
                    </div>
                    <p className="mt-1 text-[9px] text-faint">
                      {formatRelative(incident.startedAt, lang)} · {formatDuration(incident.startedAt, incident.resolvedAt, lang)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-faint">
                  <span className="flex items-center gap-1">
                    <Icon name="clock" className="h-3 w-3" />
                    {countText(incident.updates.length, lang, updateForms)}
                  </span>
                  <Icon name="chevron" className="h-3.5 w-3.5 rtl:rotate-180" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
