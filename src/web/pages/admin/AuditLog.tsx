/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from '../../../shared/types';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { actionForms, countText } from '../../lib/plural';

export function AuditLogPage() {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getAudit(150);
      setEntries(result.entries);
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

  return (
    <AdminLayout>
      <PageHeader
        title={t('activity.title')}
        subtitle={t('activity.subtitle')}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {t('common.refresh')}
          </button>
        }
      />

      {loading && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-12" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-muted">{t('errors.network')}</p>
          <button type="button" onClick={() => void load()} className="btn-secondary mt-4">
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <EmptyState icon="audit" title={t('activity.empty')} hint={t('activity.emptyHint')} />
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.when')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.actor')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.action')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.entity')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.details')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('activity.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const labelKey = `audit.action.${entry.action}`;
                  const label = t(labelKey);
                  return (
                    <tr key={entry.id} className="transition hover:bg-panel2/50">
                      <td className="table-cell tnum whitespace-nowrap text-[10px] text-muted">{formatDateTime(entry.createdAt, lang)}</td>
                      <td className="table-cell mono max-w-[14rem] truncate text-[10px] text-ink" dir="ltr">{entry.userEmail}</td>
                      <td className="table-cell">
                        <span className="chip chip-unknown">{label === labelKey ? entry.action : label}</span>
                      </td>
                      <td className="table-cell mono text-[10px] text-muted">
                        {entry.entity ?? '—'}
                        {entry.entityId !== null ? ` #${entry.entityId}` : ''}
                      </td>
                      <td className="table-cell max-w-[22rem] truncate text-xs text-muted" title={entry.summary ?? ''}>{entry.summary ?? '—'}</td>
                      <td className="table-cell mono text-[10px] text-faint" dir="ltr">{entry.ip ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line md:hidden">
            {entries.map((entry) => {
              const labelKey = `audit.action.${entry.action}`;
              const label = t(labelKey);
              return (
                <div key={entry.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum text-[10px] text-muted">{formatDateTime(entry.createdAt, lang)}</span>
                    <span className="chip chip-unknown">{label === labelKey ? entry.action : label}</span>
                  </div>
                  <p className="mono mt-1 truncate text-[10px] text-ink" dir="ltr">{entry.userEmail}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {entry.entity ?? '—'}{entry.entityId !== null ? ` #${entry.entityId}` : ''}
                    {entry.ip ? ` · ${entry.ip}` : ''}
                  </p>
                  {entry.summary && <p className="mt-0.5 text-[10px] text-faint">{entry.summary}</p>}
                </div>
              );
            })}
          </div>
          <div className="border-t border-line bg-panel2 px-3 py-2 text-[9px] text-faint">
            {t('activity.footer', { count: countText(entries.length, lang, actionForms) })}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
