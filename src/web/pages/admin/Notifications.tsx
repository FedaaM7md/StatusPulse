/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { useCallback, useEffect, useState } from 'react';
import type { NotificationEntry } from '../../../shared/types';
import { AdminLayout } from '../../components/AdminLayout';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, Spinner, useToast } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { notificationDisplayName, notificationMessage } from '../../lib/labels';
import { countText, notificationForms } from '../../lib/plural';
import { Link } from '../../lib/router';
import { levelTone } from '../../lib/status';

export function NotificationsPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getNotifications();
      setEntries(result.notifications);
      setUnread(result.unread);
    } catch {
      toast.show(t('errors.network'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    setMarking(true);
    try {
      await api.markNotificationsRead();
      setUnread(0);
      setEntries((previous) => previous.map((entry) => ({ ...entry, read: true })));
      toast.show(t('notifications.markedRead'), 'success');
    } catch {
      toast.show(t('errors.generic'), 'error');
    } finally {
      setMarking(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => void markAll()} disabled={marking || unread === 0}>
            {marking ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
            {t('notifications.markAllRead')}
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 border border-line bg-panel px-3 py-2 text-xs text-muted">
        <Icon name="inbox" className="h-3.5 w-3.5 text-accent" />
        <span>{t('notifications.logNote')}</span>
        {unread > 0 && (
          <span className="ms-auto border border-down/40 bg-down/10 px-1.5 py-0.5 text-[9px] text-down">
            {countText(unread, lang, notificationForms)}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-14" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && <EmptyState icon="bell" title={t('notifications.empty')} />}

      {!loading && entries.length > 0 && (
        <ul className="panel divide-y divide-line">
          {entries.map((entry) => {
            const tone = levelTone[entry.level] ?? levelTone.info!;
            const technicalName = entry.monitor?.name;
            const displayName = notificationDisplayName(entry, lang);
            const body = (
              <>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink">{notificationMessage(entry, lang, t)}</p>
                    <p className="mt-0.5 truncate text-[9px] text-faint">
                      {technicalName && displayName && technicalName !== displayName && (
                        <span className="mono" dir="ltr">
                          {technicalName} ·{' '}
                        </span>
                      )}
                      <span className="tnum">{formatDateTime(entry.createdAt, lang)}</span>
                    </p>
                  </div>
                </div>
                <span className={`chip shrink-0 ${tone.chip}`}>{t(`notifications.level.${entry.level}`)}</span>
              </>
            );
            return (
              <li key={entry.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${entry.read ? 'opacity-60' : ''}`}>
                {entry.incidentId ? (
                  <Link to={`/admin/incidents/${entry.incidentId}`} className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminLayout>
  );
}
