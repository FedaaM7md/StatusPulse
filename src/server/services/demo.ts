/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * Demo dataset for StatusPulse.
 *
 * The public page belongs to the fictional fintech Wasla Pay. The dataset is
 * clearly labelled, uses customer-facing component names in both languages, and
 * is rebuilt by `npm run demo:reset` (also scheduled by the server when
 * DEMO_MODE=true). Synthetic components are marked `demo = 1`, so the
 * scheduler never performs live checks against them.
 */
import type { CheckState, DisplayState, Monitor } from '../../shared/types';
import { DEMO_EMAIL } from '../../shared/types';
import type { Db } from '../db';
import { generateSecret } from '../lib/password';
import { addIncidentUpdate, openIncident } from './incidents';
import { createMaintenanceWindow } from './maintenance';
import { createMonitor, type MonitorInput } from './monitors';
import { notify } from './notifications';
import { getSettings, updateSettings } from './settings';
import { upsertAdmin } from './users';
import { recordAudit } from './audit';

const DAY = 24 * 60 * 60 * 1000;

export const DEMO_ORG = {
  ar: 'وصلة باي',
  en: 'Wasla Pay',
};

export const DEMO_DESCRIPTION = {
  ar: 'حالة خدمات وصلة باي — نسخة عرض ببيانات افتراضية.',
  en: 'Wasla Pay service status — demo build with sample data.',
};

interface DemoSpec {
  name: string;
  publicNameAr: string;
  publicNameEn: string;
  publicGroupAr: string;
  publicGroupEn: string;
  type: 'http' | 'tcp' | 'dns' | 'ssl';
  url: string | null;
  host: string | null;
  port: number | null;
  recordType: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | null;
  expectedValue: string | null;
  expectedStatus: number | null;
  keyword: string | null;
  keywordMode: 'none' | 'present' | 'absent';
  latencyThresholdMs: number | null;
  intervalSeconds: number;
  groupName: string;
  baseLatency: number;
  failureRate: number;
  degradedRate: number;
  finalState: DisplayState;
}

const SPECS: DemoSpec[] = [
  {
    name: 'payments-api',
    publicNameAr: 'بوابة الدفع',
    publicNameEn: 'Payments API',
    publicGroupAr: 'المدفوعات',
    publicGroupEn: 'Payments',
    type: 'http',
    url: 'https://api.waslapay.example/v1/payments',
    host: null,
    port: null,
    recordType: null,
    expectedValue: null,
    expectedStatus: 200,
    keyword: 'ok',
    keywordMode: 'present',
    latencyThresholdMs: 700,
    intervalSeconds: 60,
    groupName: 'Payments',
    baseLatency: 180,
    failureRate: 0.0001,
    degradedRate: 0.0004,
    finalState: 'up',
  },
  {
    name: 'mobile-app',
    publicNameAr: 'تطبيق الموبايل',
    publicNameEn: 'Mobile app',
    publicGroupAr: 'التطبيقات',
    publicGroupEn: 'Apps',
    type: 'http',
    url: 'https://m.waslapay.example/health',
    host: null,
    port: null,
    recordType: null,
    expectedValue: null,
    expectedStatus: 200,
    keyword: null,
    keywordMode: 'none',
    latencyThresholdMs: 1100,
    intervalSeconds: 120,
    groupName: 'Apps',
    baseLatency: 320,
    failureRate: 0.0002,
    degradedRate: 0.001,
    finalState: 'degraded',
  },
  {
    name: 'merchant-dashboard',
    publicNameAr: 'لوحة التجار',
    publicNameEn: 'Merchant dashboard',
    publicGroupAr: 'التجار',
    publicGroupEn: 'Merchants',
    type: 'http',
    url: 'https://merchants.waslapay.example/health',
    host: null,
    port: null,
    recordType: null,
    expectedValue: null,
    expectedStatus: 200,
    keyword: null,
    keywordMode: 'none',
    latencyThresholdMs: 900,
    intervalSeconds: 120,
    groupName: 'Merchants',
    baseLatency: 240,
    failureRate: 0.0002,
    degradedRate: 0.0008,
    finalState: 'up',
  },
  {
    name: 'bank-transfers',
    publicNameAr: 'تحويلات البنوك',
    publicNameEn: 'Bank transfers',
    publicGroupAr: 'المدفوعات',
    publicGroupEn: 'Payments',
    type: 'http',
    url: 'https://transfers.waslapay.example/health',
    host: null,
    port: null,
    recordType: null,
    expectedValue: null,
    expectedStatus: 200,
    keyword: null,
    keywordMode: 'none',
    latencyThresholdMs: 1200,
    intervalSeconds: 120,
    groupName: 'Payments',
    baseLatency: 410,
    failureRate: 0.0002,
    degradedRate: 0.0008,
    finalState: 'up',
  },
  {
    name: 'notifications-svc',
    publicNameAr: 'الإشعارات',
    publicNameEn: 'Notifications',
    publicGroupAr: 'المنصة',
    publicGroupEn: 'Platform',
    type: 'http',
    url: 'https://notify.waslapay.example/health',
    host: null,
    port: null,
    recordType: null,
    expectedValue: null,
    expectedStatus: 200,
    keyword: null,
    keywordMode: 'none',
    latencyThresholdMs: 900,
    intervalSeconds: 120,
    groupName: 'Platform',
    baseLatency: 160,
    failureRate: 0.0001,
    degradedRate: 0.0006,
    finalState: 'up',
  },
  {
    name: 'db-primary',
    publicNameAr: 'قاعدة البيانات',
    publicNameEn: 'Database',
    publicGroupAr: 'المنصة',
    publicGroupEn: 'Platform',
    type: 'tcp',
    url: null,
    host: 'db-primary.waslapay.example',
    port: 5432,
    recordType: null,
    expectedValue: null,
    expectedStatus: null,
    keyword: null,
    keywordMode: 'none',
    latencyThresholdMs: 120,
    intervalSeconds: 120,
    groupName: 'Platform',
    baseLatency: 14,
    failureRate: 0.0001,
    degradedRate: 0.0002,
    finalState: 'up',
  },
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toInput(spec: DemoSpec): MonitorInput {
  return {
    name: spec.name,
    type: spec.type,
    url: spec.url,
    host: spec.host,
    port: spec.port,
    recordType: spec.recordType,
    expectedValue: spec.expectedValue,
    httpMethod: 'GET',
    expectedStatus: spec.expectedStatus,
    keyword: spec.keyword,
    keywordMode: spec.keywordMode,
    latencyThresholdMs: spec.latencyThresholdMs,
    sslWarnDays: 21,
    intervalSeconds: spec.intervalSeconds,
    timeoutMs: 10000,
    retries: 1,
    groupName: spec.groupName,
    enabled: true,
    allowPrivate: false,
    notes: 'Synthetic demo component. Not a real monitoring target.',
  };
}

function insertResult(
  db: Db,
  monitorId: number,
  at: number,
  state: CheckState,
  statusCode: number | null,
  latencyMs: number | null,
  error: string | null,
): void {
  db.prepare(
    `INSERT INTO check_results (monitor_id, checked_at, state, status_code, latency_ms, error, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(monitorId, at, state, statusCode, latencyMs, error, JSON.stringify({ demo: true }));
}

export function ensureDemoUser(db: Db): number {
  const user = upsertAdmin(db, {
    email: DEMO_EMAIL,
    password: generateSecret(24),
    name: 'Demo operator',
  });
  return user.id;
}

function addResolvedIncident(
  db: Db,
  monitor: Monitor,
  at: number,
  severity: 'minor' | 'major',
  copy: { titleAr: string; titleEn: string; summaryAr: string; summaryEn: string; durationMinutes: number },
): void {
  const duration = copy.durationMinutes * 60 * 1000;
  const incident = openIncident(db, {
    monitorId: monitor.id,
    title: monitor.name,
    titleAr: copy.titleAr,
    titleEn: copy.titleEn,
    summaryAr: copy.summaryAr,
    summaryEn: copy.summaryEn,
    cause: severity === 'major' ? 'HTTP 503' : 'elevated latency',
    severity,
    automatic: true,
    at,
  });
  addIncidentUpdate(db, incident.id, {
    messageKey: 'demo.incident.identified',
    params: {},
    status: 'identified',
    automatic: false,
    at: at + Math.max(4 * 60 * 1000, Math.round(duration * 0.2)),
  });
  addIncidentUpdate(db, incident.id, {
    messageKey: 'demo.incident.monitoring',
    params: {},
    status: 'monitoring',
    automatic: false,
    at: at + Math.round(duration * 0.6),
  });
  addIncidentUpdate(db, incident.id, {
    messageKey: 'demo.incident.resolved',
    params: {},
    status: 'resolved',
    automatic: false,
    at: at + duration,
  });
  notify(
    db,
    {
      monitorId: monitor.id,
      incidentId: incident.id,
      level: 'success',
      messageKey: 'notifications.event.monitorRecovered',
      params: { monitor: monitor.name },
    },
    { at: at + duration },
  );
}

export function resetDemoDataset(db: Db, now = Date.now()): { monitors: number; results: number } {
  const random = mulberry32(Math.floor(now / 60000) % 2147483647);
  const userId = ensureDemoUser(db);

  const build = db.transaction(() => {
    db.exec(`
      DELETE FROM incident_updates;
      DELETE FROM incidents;
      DELETE FROM maintenance_windows;
      DELETE FROM check_results;
      DELETE FROM notifications;
      DELETE FROM monitors;
      DELETE FROM audit_log;
    `);

    updateSettings(db, {
      siteNameAr: DEMO_ORG.ar,
      siteNameEn: DEMO_ORG.en,
      siteDescriptionAr: DEMO_DESCRIPTION.ar,
      siteDescriptionEn: DEMO_DESCRIPTION.en,
      publicPageEnabled: true,
      allowPrivateTargets: false,
      webhookEnabled: false,
      webhookUrl: '',
    });

    const created: Array<{ monitor: Monitor; spec: DemoSpec }> = [];
    let resultCount = 0;

    for (const spec of SPECS) {
      const monitor = createMonitor(db, toInput(spec), now);
      db.prepare(
        `UPDATE monitors SET demo = 1, public_name_ar = ?, public_name_en = ?,
           public_group_ar = ?, public_group_en = ? WHERE id = ?`,
      ).run(spec.publicNameAr, spec.publicNameEn, spec.publicGroupAr, spec.publicGroupEn, monitor.id);
      created.push({ monitor: { ...monitor, publicNameAr: spec.publicNameAr, publicNameEn: spec.publicNameEn }, spec });

      const stepMs = 60 * 60 * 1000;
      const start = now - 90 * DAY;
      for (let at = start; at <= now - 60 * 1000; at += stepMs) {
        const roll = random();
        let state: CheckState = 'up';
        if (roll < spec.failureRate) state = 'down';
        else if (roll < spec.failureRate + spec.degradedRate) state = 'degraded';
        const latency =
          state === 'down'
            ? null
            : Math.round(spec.baseLatency + random() * spec.baseLatency * 0.45);
        insertResult(
          db,
          monitor.id,
          at,
          state,
          spec.type === 'http' && state !== 'down' ? 200 : null,
          latency,
          state === 'down' ? 'Timeout' : null,
        );
        resultCount += 1;
      }

      // Denser recent data so 24h uptime reads like a real 99.9x% service.
      for (let at = now - DAY; at <= now - 60 * 60 * 1000; at += 60 * 1000) {
        const roll = random();
        let state: CheckState = 'up';
        if (roll < spec.failureRate) state = 'down';
        else if (roll < spec.failureRate + spec.degradedRate) state = 'degraded';
        const latency =
          state === 'down'
            ? null
            : Math.round(spec.baseLatency + random() * spec.baseLatency * 0.45);
        insertResult(
          db,
          monitor.id,
          at,
          state,
          spec.type === 'http' && state !== 'down' ? 200 : null,
          latency,
          state === 'down' ? 'Timeout' : null,
        );
        resultCount += 1;
      }

      db.prepare(
        'UPDATE monitors SET current_state = ?, last_checked_at = ?, consecutive_failures = ? WHERE id = ?',
      ).run(spec.finalState, now - 50 * 1000, spec.finalState === 'up' ? 0 : 1, monitor.id);
    }

    const byTech = (name: string) => created.find((item) => item.monitor.name === name)?.monitor ?? null;
    const payments = byTech('payments-api');
    const mobile = byTech('mobile-app');
    const dashboard = byTech('merchant-dashboard');
    const database = byTech('db-primary');

    if (mobile) {
      insertResult(db, mobile.id, now - 6 * 60 * 1000, 'degraded', 200, 1840, null);
      resultCount += 1;
      db.prepare('UPDATE monitors SET current_state = ?, last_checked_at = ?, consecutive_failures = 1 WHERE id = ?').run(
        'degraded',
        now - 6 * 60 * 1000,
        mobile.id,
      );
    }

    if (payments)
      addResolvedIncident(db, payments, now - 18 * DAY - 2 * 60 * 60 * 1000, 'major', {
        titleAr: 'تأخر في تأكيد مدفوعات البطاقات',
        titleEn: 'Delayed card payment confirmations',
        summaryAr: 'تأخرت تأكيدات بعض عمليات البطاقات بين 6 و9 دقائق. أُعيدت المعالجة ولم تُفقد أي عملية.',
        summaryEn: 'Some card confirmations were delayed by 6-9 minutes. Processing was replayed; no payments were lost.',
        durationMinutes: 23,
      });
    if (mobile)
      addResolvedIncident(db, mobile, now - 37 * DAY - 5 * 60 * 60 * 1000, 'minor', {
        titleAr: 'تعذّر تسجيل الدخول لبعض مستخدمي أندرويد',
        titleEn: 'Android sign-in failures for some users',
        summaryAr: 'تعذّر على بعض مستخدمي أندرويد تسجيل الدخول. صدر تحديث للتطبيق وعادت الجلسات للعمل.',
        summaryEn: 'Some Android users could not sign in. An app update restored sessions.',
        durationMinutes: 107,
      });
    if (dashboard)
      addResolvedIncident(db, dashboard, now - 61 * DAY - 8 * 60 * 60 * 1000, 'major', {
        titleAr: 'بطء في تحميل تقارير التجار',
        titleEn: 'Slow merchant report loading',
        summaryAr: 'استغرقت تقارير التجار وقتاً أطول للتحميل. أُعيد بناء فهرس التقارير.',
        summaryEn: 'Merchant reports were slow to load. The report index was rebuilt.',
        durationMinutes: 41,
      });
    if (database)
      addResolvedIncident(db, database, now - 82 * DAY - 11 * 60 * 60 * 1000, 'minor', {
        titleAr: 'صيانة طارئة لقاعدة البيانات',
        titleEn: 'Emergency database maintenance',
        summaryAr: 'أُجريت صيانة طارئة على قاعدة البيانات الرئيسية. تأثرت بعض الطلبات لدقائق.',
        summaryEn: 'Emergency maintenance was performed on the primary database. Some requests were affected for minutes.',
        durationMinutes: 185,
      });

    createMaintenanceWindow(
      db,
      {
        title: 'Database upgrade',
        titleAr: 'ترقية قاعدة البيانات',
        titleEn: 'Database upgrade',
        startsAt: now + 3 * DAY,
        endsAt: now + 3 * DAY + 90 * 60 * 1000,
        monitorId: database?.id ?? null,
      },
      now,
    );

    recordAudit(db, {
      userId,
      userEmail: DEMO_EMAIL,
      action: 'demo.reset',
      entity: 'dataset',
      entityId: null,
      summary: null,
      ip: null,
      at: now,
    });

    return { monitors: created.length, results: resultCount };
  });

  return build();
}

/** Seed once when demo mode starts, keeping later edits until the next reset. */
export function ensureDemoDataset(db: Db, now = Date.now()): { monitors: number; results: number } | null {
  ensureDemoUser(db);
  const row = db.prepare('SELECT COUNT(*) AS c FROM monitors WHERE demo = 1').get() as { c: number };
  if (row.c > 0) {
    const settings = getSettings(db);
    if (settings.siteNameAr !== DEMO_ORG.ar || settings.siteNameEn !== DEMO_ORG.en) {
      return resetDemoDataset(db, now);
    }
    return null;
  }
  return resetDemoDataset(db, now);
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === DEMO_EMAIL;
}
