/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { CheckState, Monitor } from '../../shared/types';
import { runMonitorCheck } from '../checks/engine';
import { effectiveAllowPrivate, type CheckContext, type CheckOutcome } from '../checks/types';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import type { Logger } from '../lib/logger';
import { closeOpenIncidentForMonitor, findOpenIncident, openIncident } from './incidents';
import { isUnderMaintenance, listMaintenanceWindows } from './maintenance';
import { getMonitor, listMonitors, setMonitorResult } from './monitors';
import { notify } from './notifications';
import { getSettings } from './settings';
import { prunePasswordResets } from './password-resets';
import { sendWebhook } from './webhook';

export interface SchedulerDeps {
  db: Db;
  config: Pick<AppConfig, 'notificationsLogPath'>;
  logger: Logger;
  now?: () => number;
  runCheck?: (monitor: Monitor, ctx: CheckContext) => Promise<CheckOutcome>;
  retryDelayMs?: number;
  tickIntervalMs?: number;
  concurrency?: number;
  sleep?: (ms: number) => Promise<void>;
  onNotification?: () => void;
}

export interface CheckRecord {
  monitorId: number;
  state: CheckState;
  checkedAt: number;
  incidentOpened: number | null;
  incidentClosed: number | null;
}

export interface TickResult {
  checked: number;
  skipped: number;
  results: CheckRecord[];
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Scheduler {
  private readonly db: Db;
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly runCheck: (monitor: Monitor, ctx: CheckContext) => Promise<CheckOutcome>;
  private readonly retryDelayMs: number;
  private readonly tickIntervalMs: number;
  private readonly concurrency: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logPath: string;
  private readonly onNotification?: () => void;

  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly inFlight = new Set<number>();
  private lastPrune = 0;

  constructor(deps: SchedulerDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
    this.now = deps.now ?? (() => Date.now());
    this.runCheck = deps.runCheck ?? runMonitorCheck;
    this.retryDelayMs = deps.retryDelayMs ?? 800;
    this.tickIntervalMs = deps.tickIntervalMs ?? 1000;
    this.concurrency = deps.concurrency ?? 4;
    this.sleep = deps.sleep ?? defaultSleep;
    this.logPath = deps.config.notificationsLogPath;
    this.onNotification = deps.onNotification;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger.error('Scheduler tick failed', { error: error instanceof Error ? error.message : String(error) });
      });
    }, this.tickIntervalMs);
    void this.tick().catch((error) => {
      this.logger.error('Initial scheduler tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.logger.info('Scheduler started', { tickIntervalMs: this.tickIntervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Scheduler stopped');
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  private due(monitor: Monitor, at: number): boolean {
    if (!monitor.enabled) return false;
    if (monitor.demo) return false; // Demo components use clearly labelled synthetic history.
    if (monitor.lastCheckedAt === null) return true;
    return monitor.lastCheckedAt + monitor.intervalSeconds * 1000 <= at;
  }

  async tick(at = this.now()): Promise<TickResult> {
    if (this.ticking) return { checked: 0, skipped: 0, results: [] };
    this.ticking = true;
    try {
      this.pruneIfNeeded(at);
      const monitors = listMonitors(this.db, { enabledOnly: true }).filter((monitor) => this.due(monitor, at));
      const queue = monitors.filter((monitor) => !this.inFlight.has(monitor.id));

      const results: CheckRecord[] = [];
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const index = cursor;
          cursor += 1;
          const monitor = queue[index];
          if (!monitor) return;
          try {
            const record = await this.executeMonitor(monitor);
            if (record) results.push(record);
          } catch (error) {
            this.logger.error('Check execution failed', {
              monitorId: monitor.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(this.concurrency, Math.max(queue.length, 1)) }, () => worker());
      await Promise.all(workers);

      return {
        checked: results.length,
        skipped: monitors.length - queue.length,
        results,
      };
    } finally {
      this.ticking = false;
    }
  }

  /** Run one check immediately (admin "check now" action). */
  async runNow(monitorId: number): Promise<CheckRecord | null> {
    const monitor = getMonitor(this.db, monitorId);
    if (!monitor) return null;
    if (monitor.demo) {
      throw new Error('Demo components use synthetic results and are not checked live.');
    }
    if (this.inFlight.has(monitor.id)) {
      throw new Error('A check for this monitor is already running.');
    }
    return this.executeMonitor(monitor);
  }

  private async executeMonitor(monitor: Monitor): Promise<CheckRecord | null> {
    if (this.inFlight.has(monitor.id)) return null;
    this.inFlight.add(monitor.id);
    try {
      const settings = getSettings(this.db);
      const allowPrivate = effectiveAllowPrivate(settings.allowPrivateTargets, monitor.allowPrivate);
      const attempts = Math.max(0, monitor.retries) + 1;
      let outcome: CheckOutcome | null = null;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        outcome = await this.runCheck(monitor, {
          allowPrivate,
          now: this.now,
        });
        if (outcome.state === 'up') break;
        if (attempt < attempts) await this.sleep(this.retryDelayMs);
      }

      if (!outcome) return null;
      const checkedAt = outcome.checkedAt || this.now();

      this.db
        .prepare(
          `INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms, error, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          monitor.id,
          checkedAt,
          outcome.state,
          outcome.statusCode,
          outcome.latencyMs,
          outcome.error,
          JSON.stringify(outcome.detail ?? {}),
        );

      const failures =
        outcome.state === 'up' ? 0 : monitor.consecutiveFailures + 1;
      setMonitorResult(this.db, monitor.id, outcome.state, checkedAt, failures);

      let incidentOpened: number | null = null;
      let incidentClosed: number | null = null;

      const windows = listMaintenanceWindows(this.db);
      const inMaintenance = isUnderMaintenance(this.db, monitor.id, checkedAt, windows);

      if (inMaintenance) {
        if (outcome.state !== 'up') {
          notify(
            this.db,
            {
              monitorId: monitor.id,
              level: 'info',
              messageKey: 'notifications.event.maintenanceSuppressed',
              params: { monitor: monitor.name },
            },
            { at: checkedAt, logPath: this.logPath },
          );
          this.onNotification?.();
        }
      } else if (outcome.state === 'down' || outcome.state === 'degraded') {
        const existing = findOpenIncident(this.db, monitor.id);
        if (!existing) {
          const incident = openIncident(this.db, {
            monitorId: monitor.id,
            title: monitor.name,
            cause: outcome.error,
            severity: outcome.state === 'degraded' ? 'minor' : 'major',
            automatic: true,
            at: checkedAt,
          });
          incidentOpened = incident.id;
          const level = outcome.state === 'degraded' ? 'warning' : 'error';
          const key = outcome.state === 'degraded' ? 'notifications.event.monitorDegraded' : 'notifications.event.monitorDown';
          notify(
            this.db,
            {
              monitorId: monitor.id,
              incidentId: incident.id,
              level,
              messageKey: key,
              params: { monitor: monitor.name },
            },
            { at: checkedAt, logPath: this.logPath },
          );
          this.onNotification?.();
          await this.maybeWebhook('monitor.down', monitor, outcome, incident.id);
        }
      } else if (outcome.state === 'up') {
        const closed = closeOpenIncidentForMonitor(this.db, monitor.id, checkedAt, true);
        if (closed) {
          incidentClosed = closed.id;
          notify(
            this.db,
            {
              monitorId: monitor.id,
              incidentId: closed.id,
              level: 'success',
              messageKey: 'notifications.event.monitorRecovered',
              params: { monitor: monitor.name },
            },
            { at: checkedAt, logPath: this.logPath },
          );
          this.onNotification?.();
          await this.maybeWebhook('monitor.recovered', monitor, outcome, closed.id);
        }
      }

      return {
        monitorId: monitor.id,
        state: outcome.state,
        checkedAt,
        incidentOpened,
        incidentClosed,
      };
    } finally {
      this.inFlight.delete(monitor.id);
    }
  }

  private async maybeWebhook(
    event: string,
    monitor: Monitor,
    outcome: CheckOutcome,
    incidentId: number | null,
  ): Promise<void> {
    try {
      const settings = getSettings(this.db);
      if (!settings.webhookEnabled || !settings.webhookUrl) return;
      const result = await sendWebhook(settings.webhookUrl, settings.webhookSecret, {
        event,
        state: outcome.state,
        monitor: { id: monitor.id, name: monitor.name, type: monitor.type },
        incidentId,
        error: outcome.error,
        at: new Date(outcome.checkedAt).toISOString(),
      });
      if (!result.ok) {
        this.logger.warn('Webhook delivery failed', { event, error: result.error ?? `HTTP ${result.status}` });
      }
    } catch (error) {
      this.logger.warn('Webhook delivery error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private pruneIfNeeded(at: number): void {
    if (at - this.lastPrune < 24 * 60 * 60 * 1000) return;
    this.lastPrune = at;
    try {
      const cutoff = at - 180 * 24 * 60 * 60 * 1000;
      this.db.prepare('DELETE FROM check_results WHERE checked_at < ?').run(cutoff);
      this.db.prepare('DELETE FROM notifications WHERE created_at < ?').run(at - 90 * 24 * 60 * 60 * 1000);
      this.db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff);
      prunePasswordResets(this.db, at);
      this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(at);
      this.db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(at - 24 * 60 * 60 * 1000);
    } catch (error) {
      this.logger.warn('Data pruning failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
