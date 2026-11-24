/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Hono } from 'hono';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import type {
  DisplayState,
  Incident,
  PublicIncident,
  PublicMonitor,
  PublicStatusResponse,
  Monitor,
} from '../../shared/types';
import { listIncidents } from '../services/incidents';
import { listMaintenanceWindows, windowIsActive } from '../services/maintenance';
import { getMonitor, listMonitors } from '../services/monitors';
import { getSettings } from '../services/settings';
import { getDailyUptime, getUptimeStats } from '../services/uptime';

const DAY = 24 * 60 * 60 * 1000;

function toPublicIncident(incident: Incident, monitor: Monitor | null): PublicIncident {
  return {
    id: incident.id,
    monitorId: incident.monitorId,
    monitorName: monitor?.name ?? null,
    monitorDisplayName: monitor
      ? { ar: monitor.publicNameAr || monitor.name, en: monitor.publicNameEn || monitor.name }
      : null,
    title: incident.title,
    titleAr: incident.titleAr,
    titleEn: incident.titleEn,
    summaryAr: incident.summaryAr,
    summaryEn: incident.summaryEn,
    status: incident.status,
    severity: incident.severity,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    updates: incident.updates.map((update) => ({
      id: update.id,
      message: update.message,
      messageKey: update.messageKey,
      params: update.params,
      status: update.status,
      isAutomatic: update.isAutomatic,
      createdAt: update.createdAt,
    })),
  };
}

function overallState(states: DisplayState[], hasMajorIncident: boolean, hasMinorIncident: boolean): DisplayState {
  if (states.length === 0) return 'unknown';
  if (states.includes('down') || hasMajorIncident) return 'down';
  if (states.includes('degraded') || hasMinorIncident) return 'degraded';
  if (states.includes('maintenance')) return 'maintenance';
  return 'up';
}

export function buildPublicStatus(db: Db, config: AppConfig, now = Date.now()): PublicStatusResponse {
  const settings = getSettings(db);
  const base: PublicStatusResponse = {
    refreshedAt: now,
    siteName: { ar: settings.siteNameAr, en: settings.siteNameEn },
    siteDescription: { ar: settings.siteDescriptionAr, en: settings.siteDescriptionEn },
    publicPageEnabled: settings.publicPageEnabled,
    demoMode: config.demoMode,
    groups: [],
    activeIncidents: [],
    recentIncidents: [],
    maintenance: [],
    overallState: 'unknown',
  };

  if (!settings.publicPageEnabled) {
    return base;
  }

  const windows = listMaintenanceWindows(db);
  const activeWindows = windows.filter((window) => windowIsActive(window, now));

  const groups = new Map<string, { displayName: { ar: string; en: string }; monitors: PublicMonitor[] }>();
  const states: DisplayState[] = [];

  for (const monitor of listMonitors(db, { enabledOnly: true })) {
    const underMaintenance = activeWindows.some(
      (window) => window.monitorId === null || window.monitorId === monitor.id,
    );
    const state: DisplayState = underMaintenance ? 'maintenance' : monitor.currentState;
    states.push(state);
    const item: PublicMonitor = {
      id: monitor.id,
      name: monitor.name,
      displayName: {
        ar: monitor.publicNameAr || monitor.name,
        en: monitor.publicNameEn || monitor.name,
      },
      type: monitor.type,
      groupName: monitor.groupName,
      state,
      uptime24h: getUptimeStats(db, monitor.id, now - DAY, now).uptime,
      uptime7d: getUptimeStats(db, monitor.id, now - 7 * DAY, now).uptime,
      uptime30d: getUptimeStats(db, monitor.id, now - 30 * DAY, now).uptime,
      days: getDailyUptime(db, monitor.id, 90, now),
    };
    const existing = groups.get(monitor.groupName);
    if (existing) existing.monitors.push(item);
    else
      groups.set(monitor.groupName, {
        displayName: {
          ar: monitor.publicGroupAr || monitor.groupName,
          en: monitor.publicGroupEn || monitor.groupName,
        },
        monitors: [item],
      });
  }

  const monitorFor = (id: number | null): Monitor | null => (id === null ? null : getMonitor(db, id));

  const active = listIncidents(db, { status: 'open', limit: 20 }).map((incident) =>
    toPublicIncident(incident, monitorFor(incident.monitorId)),
  );
  const resolved = listIncidents(db, { status: 'resolved', limit: 20 }).map((incident) =>
    toPublicIncident(incident, monitorFor(incident.monitorId)),
  );

  const upcoming = windows
    .filter((window) => window.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 10)
    .map((window) => ({ ...window, active: windowIsActive(window, now) }));

  return {
    ...base,
    groups: Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, group]) => ({ name, displayName: group.displayName, monitors: group.monitors })),
    activeIncidents: active,
    recentIncidents: resolved,
    maintenance: upcoming,
    overallState: overallState(
      states,
      active.some((incident) => incident.severity === 'major'),
      active.some((incident) => incident.severity === 'minor'),
    ),
  };
}

export function createPublicRoutes(db: Db, config: AppConfig): Hono {
  const pub = new Hono();

  pub.get('/healthz', (c) => c.json({ ok: true, now: Date.now(), uptimeSeconds: Math.round(process.uptime()) }));

  pub.get('/config', (c) =>
    c.json({
      demoMode: config.demoMode,
      productName: 'StatusPulse',
      demoResetMinutes: config.demoResetMinutes,
    }),
  );

  pub.get('/status', (c) => c.json(buildPublicStatus(db, config)));

  pub.get('/incidents', (c) => {
    const settings = getSettings(db);
    if (!settings.publicPageEnabled) return c.json({ incidents: [] });
    const monitorFor = (id: number | null): Monitor | null => (id === null ? null : getMonitor(db, id));
    return c.json({
      incidents: listIncidents(db, { limit: 50 }).map((incident) =>
        toPublicIncident(incident, monitorFor(incident.monitorId)),
      ),
    });
  });

  return pub;
}
