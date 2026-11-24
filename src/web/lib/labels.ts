/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { Incident, Monitor, NotificationEntry } from '../../shared/types';
import type { Lang } from './lang';

/** Customer-facing monitor name with the technical id as fallback. */
export function monitorDisplayName(monitor: Monitor, lang: Lang): string {
  if (lang === 'ar') return monitor.publicNameAr || monitor.name;
  return monitor.publicNameEn || monitor.name;
}

/** Localised group label with the technical group as fallback. */
export function monitorGroupName(monitor: Monitor, lang: Lang): string {
  if (lang === 'ar') return monitor.publicGroupAr || monitor.groupName;
  return monitor.publicGroupEn || monitor.groupName;
}

export function incidentDisplayTitle(incident: Incident, lang: Lang): string {
  if (lang === 'ar') return incident.titleAr || incident.title;
  return incident.titleEn || incident.title;
}

export function incidentDisplaySummary(incident: Incident, lang: Lang): string | null {
  return lang === 'ar' ? incident.summaryAr : incident.summaryEn;
}

/** Localised monitor name carried by a notification, or null when it has no component. */
export function notificationDisplayName(entry: NotificationEntry, lang: Lang): string | null {
  if (!entry.monitor) return null;
  return lang === 'ar'
    ? entry.monitor.displayNameAr || entry.monitor.name
    : entry.monitor.displayNameEn || entry.monitor.name;
}

/** Render a notification message with the customer-facing monitor name. */
export function notificationMessage(
  entry: NotificationEntry,
  lang: Lang,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const name = notificationDisplayName(entry, lang);
  const params = { ...(entry.params ?? {}) } as Record<string, string | number>;
  if (name) params.monitor = name;
  return t(entry.messageKey, params);
}
