/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { Hono } from 'hono';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import type { Logger } from '../lib/logger';
import type { IncidentStatus } from '../../shared/types';
import type { Scheduler } from '../services/scheduler';
import {
  addIncidentUpdate,
  countOpenIncidents,
  findOpenIncident,
  getIncident,
  listIncidents,
} from '../services/incidents';
import {
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  getMaintenanceWindow,
  isUnderMaintenance,
  listMaintenanceWindows,
  windowState,
} from '../services/maintenance';
import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  listMonitors,
  updateMonitor,
  type MonitorInput,
} from '../services/monitors';
import {
  listNotifications,
  markAllNotificationsRead,
  notify,
  unreadNotificationCount,
} from '../services/notifications';
import { getSettings, updateSettings } from '../services/settings';
import { recordAudit, listAudit } from '../services/audit';
import { getDailyUptime, getUptimeStats, overallUptime } from '../services/uptime';
import { sendWebhook } from '../services/webhook';
import {
  fieldErrors,
  incidentUpdateSchema,
  maintenanceSchema,
  monitorSchema,
  settingsSchema,
} from './schemas';
import { clientIp, notFound, parseJson, requireAuth, requireCsrf, type AppEnv } from './middleware';

const DAY = 24 * 60 * 60 * 1000;

function toMonitorInput(value: ReturnType<typeof monitorSchema.parse>): MonitorInput {
  return {
    name: value.name,
    type: value.type,
    url: value.url ?? null,
    host: value.host ?? null,
    port: value.port ?? null,
    recordType: value.recordType ?? null,
    expectedValue: value.expectedValue ?? null,
    httpMethod: value.httpMethod,
    expectedStatus: value.expectedStatus ?? null,
    keyword: value.keyword ?? null,
    keywordMode: value.keywordMode,
    latencyThresholdMs: value.latencyThresholdMs ?? null,
    sslWarnDays: value.sslWarnDays,
    intervalSeconds: value.intervalSeconds,
    timeoutMs: value.timeoutMs,
    retries: value.retries,
    groupName: value.groupName,
    enabled: value.enabled,
    allowPrivate: value.allowPrivate,
    notes: value.notes ?? null,
  };
}

interface ResultRow {
  id: number;
  monitor_id: number;
  checked_at: number;
  state: 'up' | 'degraded' | 'down';
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  detail: string | null;
}

function mapResult(row: ResultRow) {
  let detail: Record<string, unknown> = {};
  try {
    const parsed = row.detail ? JSON.parse(row.detail) : {};
    if (parsed && typeof parsed === 'object') detail = parsed as Record<string, unknown>;
  } catch {
    detail = {};
  }
  return {
    id: row.id,
    monitorId: row.monitor_id,
    checkedAt: row.checked_at,
    state: row.state,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    error: row.error,
    detail,
  };
}

function recentResults(db: Db, monitorId: number, sinceMs: number, limit = 400) {
  const rows = db
    .prepare(
      'SELECT * FROM check_results WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at DESC LIMIT ?',
    )
    .all(monitorId, sinceMs, limit) as ResultRow[];
  return rows.reverse().map(mapResult);
}

function testWebhookResponseShape(result: { ok: boolean; status?: number; error?: string }) {
  return { ok: result.ok, status: result.status ?? null, error: result.error ?? null };
}

export function createAdminRoutes(
  db: Db,
  config: AppConfig,
  scheduler: Scheduler | null,
  logger: Logger,
): Hono<AppEnv> {
  const admin = new Hono<AppEnv>();
  admin.use('*', requireAuth(db), requireCsrf(config));

  const monitoredMonitors = (now: number) =>
    listMonitors(db).map((monitor) => ({
      ...monitor,
      maintenance: isUnderMaintenance(db, monitor.id, now),
      uptime24h: getUptimeStats(db, monitor.id, now - DAY, now).uptime,
    }));

  admin.get('/summary', (c) => {
    const now = Date.now();
    const monitors = monitoredMonitors(now);
    const enabled = monitors.filter((monitor) => monitor.enabled);
    const stats = enabled.map((monitor) => getUptimeStats(db, monitor.id, now - DAY, now));
    return c.json({
      refreshedAt: now,
      monitors: {
        total: monitors.length,
        enabled: enabled.length,
        paused: monitors.length - enabled.length,
        up: enabled.filter((monitor) => monitor.currentState === 'up' && !monitor.maintenance).length,
        down: enabled.filter((monitor) => monitor.currentState === 'down' && !monitor.maintenance).length,
        degraded: enabled.filter((monitor) => monitor.currentState === 'degraded' && !monitor.maintenance).length,
        maintenance: enabled.filter((monitor) => monitor.maintenance).length,
      },
      openIncidents: countOpenIncidents(db),
      avgUptime24h: overallUptime(stats),
      unreadNotifications: unreadNotificationCount(db),
      recentIncidents: listIncidents(db, { limit: 5 }),
      notifications: listNotifications(db, 5),
    });
  });

  admin.get('/monitors', (c) => {
    return c.json({ monitors: monitoredMonitors(Date.now()) });
  });

  admin.post('/monitors', async (c) => {
    const parsed = monitorSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    const monitor = createMonitor(db, toMonitorInput(parsed.data));
    logger.info('Monitor created', { monitorId: monitor.id, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'monitor.create',
      entity: 'monitor',
      entityId: monitor.id,
      summary: monitor.name,
      ip: clientIp(c),
    });
    return c.json({ monitor }, 201);
  });

  admin.get('/monitors/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const monitor = getMonitor(db, id);
    if (!monitor) return notFound(c);
    const now = Date.now();
    return c.json({
      monitor: { ...monitor, maintenance: isUnderMaintenance(db, monitor.id, now) },
      stats: {
        uptime24h: getUptimeStats(db, id, now - DAY, now),
        uptime7d: getUptimeStats(db, id, now - 7 * DAY, now),
        uptime30d: getUptimeStats(db, id, now - 30 * DAY, now),
      },
      daily: getDailyUptime(db, id, 90, now),
      results: recentResults(db, id, now - DAY),
      incidents: listIncidents(db, { monitorId: id, limit: 20 }),
    });
  });

  admin.put('/monitors/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const parsed = monitorSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    const monitor = updateMonitor(db, id, toMonitorInput(parsed.data));
    if (!monitor) return notFound(c);
    if (!monitor.enabled) {
      // Disabling a monitor must not leave a dangling public incident.
      const open = findOpenIncident(db, id);
      if (open) {
        addIncidentUpdate(db, open.id, {
          messageKey: 'incidents.closedOnDisable',
          params: {},
          status: 'resolved',
          automatic: true,
        });
      }
    }
    logger.info('Monitor updated', { monitorId: id, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'monitor.update',
      entity: 'monitor',
      entityId: id,
      summary: monitor.name,
      ip: clientIp(c),
    });
    return c.json({ monitor });
  });

  admin.delete('/monitors/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const open = findOpenIncident(db, id);
    if (open) {
      addIncidentUpdate(db, open.id, {
        messageKey: 'incidents.closedOnDelete',
        params: {},
        status: 'resolved',
        automatic: true,
      });
    }
    if (!deleteMonitor(db, id)) return notFound(c);
    logger.info('Monitor deleted', { monitorId: id, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'monitor.delete',
      entity: 'monitor',
      entityId: id,
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  admin.get('/monitors/:id/results', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const monitor = getMonitor(db, id);
    if (!monitor) return notFound(c);
    const range = c.req.query('range');
    const span = range === '30d' ? 30 * DAY : range === '7d' ? 7 * DAY : DAY;
    const now = Date.now();
    return c.json({
      stats: {
        uptime24h: getUptimeStats(db, id, now - DAY, now),
        uptime7d: getUptimeStats(db, id, now - 7 * DAY, now),
        uptime30d: getUptimeStats(db, id, now - 30 * DAY, now),
      },
      range: range === '30d' ? '30d' : range === '7d' ? '7d' : '24h',
      results: recentResults(db, id, now - span, 600),
      daily: getDailyUptime(db, id, 90, now),
    });
  });

  admin.get('/monitors/:id/export', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const monitor = getMonitor(db, id);
    if (!monitor) return notFound(c);
    const range = c.req.query('range');
    const span = range === '30d' ? 30 * DAY : range === '7d' ? 7 * DAY : DAY;
    const rows = recentResults(db, id, Date.now() - span, 5000);
    const cell = (value: string | number | null): string => {
      const text = value === null ? '' : String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [
      ['checked_at', 'state', 'status_code', 'latency_ms', 'error'].map(cell).join(','),
      ...rows.map((row) =>
        [new Date(row.checkedAt).toISOString(), row.state, row.statusCode, row.latencyMs, row.error]
          .map(cell)
          .join(','),
      ),
    ];
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="statuspulse-${id}-${range === '30d' ? '30d' : range === '7d' ? '7d' : '24h'}.csv"`);
    return c.body(`\uFEFF${lines.join('\r\n')}\r\n`);
  });

  admin.post('/monitors/:id/check', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    if (!scheduler) return c.json({ error: 'SCHEDULER_DISABLED', message: 'monitors.checkError' }, 503);
    const monitor = getMonitor(db, id);
    if (!monitor) return notFound(c);
    if (monitor.demo) {
      return c.json({ error: 'DEMO_COMPONENT', message: 'monitors.demoCheckUnavailable' }, 409);
    }
    try {
      const record = await scheduler.runNow(id);
      if (!record) return notFound(c);
      logger.info('Manual check completed', { monitorId: id, state: record.state, userId: c.get('session').user.id });
      return c.json({ ok: true, result: record, monitor: getMonitor(db, id) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'errors.generic';
      return c.json({ error: 'CHECK_FAILED', message }, 409);
    }
  });

  admin.get('/incidents', (c) => {
    const status = c.req.query('status');
    const limit = Number(c.req.query('limit') ?? 100);
    const allowed: Array<IncidentStatus | 'open'> = [
      'investigating',
      'identified',
      'monitoring',
      'resolved',
      'open',
    ];
    const filter = status && allowed.includes(status as IncidentStatus | 'open') ? (status as IncidentStatus | 'open') : undefined;
    const monitorIdRaw = c.req.query('monitorId');
    const monitorId = monitorIdRaw ? Number(monitorIdRaw) : undefined;
    return c.json({
      incidents: listIncidents(db, {
        status: filter,
        monitorId: Number.isInteger(monitorId) ? monitorId : undefined,
        limit: Number.isFinite(limit) ? limit : 100,
      }),
    });
  });

  admin.get('/incidents/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const incident = getIncident(db, id);
    if (!incident) return notFound(c);
    return c.json({
      incident,
      monitor: incident.monitorId ? getMonitor(db, incident.monitorId) : null,
    });
  });

  admin.post('/incidents/:id/updates', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const incident = getIncident(db, id);
    if (!incident) return notFound(c);
    const parsed = incidentUpdateSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    addIncidentUpdate(db, id, {
      message: parsed.data.message,
      status: parsed.data.status,
      automatic: false,
    });
    if (incident.monitorId) {
      const monitor = getMonitor(db, incident.monitorId);
      notify(
        db,
        {
          monitorId: incident.monitorId,
          incidentId: incident.id,
          level: parsed.data.status === 'resolved' ? 'success' : 'info',
          messageKey: 'notifications.event.incidentUpdate',
          params: { monitor: monitor?.name ?? incident.title },
        },
        { logPath: config.notificationsLogPath },
      );
    }
    logger.info('Incident update posted', { incidentId: id, status: parsed.data.status, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'incident.update',
      entity: 'incident',
      entityId: id,
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ incident: getIncident(db, id) });
  });

  admin.get('/maintenance', (c) => {
    const now = Date.now();
    return c.json({
      windows: listMaintenanceWindows(db).map((window) => ({
        ...window,
        state: windowState(window, now),
      })),
    });
  });

  admin.post('/maintenance', async (c) => {
    const parsed = maintenanceSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    if (parsed.data.monitorId) {
      if (!getMonitor(db, parsed.data.monitorId)) return notFound(c);
    }
    const window = createMaintenanceWindow(db, {
      title: parsed.data.title,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      monitorId: parsed.data.monitorId ?? null,
    });
    logger.info('Maintenance window created', { windowId: window.id, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'maintenance.create',
      entity: 'maintenance',
      entityId: window.id,
      summary: window.title,
      ip: clientIp(c),
    });
    return c.json({ window }, 201);
  });

  admin.delete('/maintenance/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    if (!getMaintenanceWindow(db, id)) return notFound(c);
    deleteMaintenanceWindow(db, id);
    logger.info('Maintenance window deleted', { windowId: id, userId: c.get('session').user.id });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'maintenance.delete',
      entity: 'maintenance',
      entityId: id,
      summary: null,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  admin.get('/settings', (c) => {
    const settings = getSettings(db);
    return c.json({
      settings: {
        ...settings,
        webhookSecret: '',
        webhookSecretSet: settings.webhookSecret.length > 0,
      },
    });
  });

  admin.put('/settings', async (c) => {
    const parsed = settingsSchema.safeParse(await parseJson(c));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_FAILED', message: 'errors.validation', fields: fieldErrors(parsed.error) }, 400);
    }
    if (parsed.data.webhookEnabled && !parsed.data.webhookUrl) {
      return c.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'errors.validation',
          fields: { webhookUrl: 'settings.webhookUrlInvalid' },
        },
        400,
      );
    }
    if (c.get('session').user.isDemo && (parsed.data.allowPrivateTargets || parsed.data.webhookEnabled)) {
      return c.json({ error: 'DEMO_RESTRICTED', message: 'demo.restricted' }, 403);
    }
    const existing = getSettings(db);
    const patch = {
      siteNameAr: parsed.data.siteNameAr,
      siteNameEn: parsed.data.siteNameEn,
      siteDescriptionAr: parsed.data.siteDescriptionAr,
      siteDescriptionEn: parsed.data.siteDescriptionEn,
      allowPrivateTargets: parsed.data.allowPrivateTargets,
      webhookEnabled: parsed.data.webhookEnabled,
      webhookUrl: parsed.data.webhookUrl,
      publicPageEnabled: parsed.data.publicPageEnabled,
      ...(parsed.data.webhookSecret.trim() ? { webhookSecret: parsed.data.webhookSecret.trim() } : {}),
    };
    const settings = updateSettings(db, patch);
    logger.info('Settings updated', {
      userId: c.get('session').user.id,
      allowPrivateTargets: settings.allowPrivateTargets,
      webhookEnabled: settings.webhookEnabled,
      secretChanged: Boolean(parsed.data.webhookSecret.trim()),
      hadSecret: existing.webhookSecret.length > 0,
    });
    recordAudit(db, {
      userId: c.get('session').user.id,
      userEmail: c.get('session').user.email,
      action: 'settings.update',
      entity: 'settings',
      summary: null,
      ip: clientIp(c),
    });
    return c.json({
      settings: { ...settings, webhookSecret: '', webhookSecretSet: settings.webhookSecret.length > 0 },
    });
  });

  admin.post('/webhook/test', async (c) => {
    const settings = getSettings(db);
    if (!settings.webhookEnabled) {
      return c.json({ error: 'WEBHOOK_DISABLED', message: 'settings.webhookDisabled' }, 400);
    }
    if (!settings.webhookUrl) {
      return c.json({ error: 'WEBHOOK_URL_MISSING', message: 'settings.webhookUrlInvalid' }, 400);
    }
    const result = await sendWebhook(settings.webhookUrl, settings.webhookSecret, {
      event: 'test',
      at: new Date().toISOString(),
    });
    logger.info('Webhook test attempted', { ok: result.ok, status: result.status, userId: c.get('session').user.id });
    return c.json(
      { ...testWebhookResponseShape(result), message: result.ok ? 'settings.webhookSent' : 'settings.webhookFailed' },
      result.ok ? 200 : 502,
    );
  });

  admin.get('/notifications', (c) => {
    const limit = Number(c.req.query('limit') ?? 100);
    return c.json({
      notifications: listNotifications(db, Number.isFinite(limit) ? limit : 100),
      unread: unreadNotificationCount(db),
    });
  });

  admin.post('/notifications/read-all', (c) => {
    const changed = markAllNotificationsRead(db);
    return c.json({ ok: true, changed });
  });

  admin.get('/audit', (c) => {
    const limit = Number(c.req.query('limit') ?? 100);
    return c.json({ entries: listAudit(db, Number.isFinite(limit) ? limit : 100) });
  });

  return admin;
}
