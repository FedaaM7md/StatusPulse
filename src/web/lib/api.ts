/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type {
  AdminSessionInfo,
  AppSettings,
  AuditEntry,
  Incident,
  IncidentStatus,
  MaintenanceWindow,
  Monitor,
  NotificationEntry,
  PublicConfig,
  PublicStatusResponse,
  User,
} from '../../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly fields: Record<string, string>;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string,
    messageKey: string,
    fields: Record<string, string> = {},
    retryAfterSeconds: number | null = null,
  ) {
    super(messageKey);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let csrfToken = '';

export function setCsrfToken(token: string | null): void {
  csrfToken = token ?? '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const signal = options.signal ?? controller.signal;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'errors.network');
    }
    throw new ApiError(0, 'NETWORK', 'errors.network');
  }
  clearTimeout(timeout);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as {
      error?: string;
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
    };
    if (response.status === 401 && !path.endsWith('/login')) {
      csrfToken = '';
      window.dispatchEvent(new CustomEvent('sp:unauthorized'));
    }
    throw new ApiError(
      response.status,
      data.error ?? 'ERROR',
      data.message ?? 'errors.generic',
      data.fields ?? {},
      data.retryAfterSeconds ?? null,
    );
  }

  return payload as T;
}

export interface AdminMonitor extends Monitor {
  maintenance: boolean;
}

export interface AdminMonitorListItem extends AdminMonitor {
  uptime24h: number | null;
}

export interface UptimeAggregate {
  uptime: number | null;
  checks: number;
  downChecks: number;
  avgLatencyMs: number | null;
}

export interface DailyPoint {
  date: string;
  uptime: number | null;
}

export interface CheckResultView {
  id: number;
  monitorId: number;
  checkedAt: number;
  state: 'up' | 'degraded' | 'down';
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  detail: Record<string, unknown>;
}

export interface MonitorDetailResponse {
  monitor: AdminMonitor;
  stats: { uptime24h: UptimeAggregate; uptime7d: UptimeAggregate; uptime30d: UptimeAggregate };
  daily: DailyPoint[];
  results: CheckResultView[];
  incidents: Incident[];
}

export interface MonitorResultsResponse {
  stats: { uptime24h: UptimeAggregate; uptime7d: UptimeAggregate; uptime30d: UptimeAggregate };
  range: '24h' | '7d' | '30d';
  results: CheckResultView[];
  daily: DailyPoint[];
}

export interface SummaryResponse {
  refreshedAt: number;
  monitors: {
    total: number;
    enabled: number;
    paused: number;
    up: number;
    down: number;
    degraded: number;
    maintenance: number;
  };
  openIncidents: number;
  avgUptime24h: number | null;
  unreadNotifications: number;
  recentIncidents: Incident[];
  notifications: NotificationEntry[];
}

export interface SettingsResponse {
  settings: AppSettings & { webhookSecretSet: boolean };
}

export interface MaintenanceListItem extends MaintenanceWindow {
  state: 'active' | 'upcoming' | 'past';
}

export interface MonitorPayload {
  name: string;
  type: 'http' | 'tcp' | 'dns' | 'ssl';
  url: string | null;
  host: string | null;
  port: number | null;
  recordType: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | null;
  expectedValue: string | null;
  httpMethod: 'GET' | 'HEAD';
  expectedStatus: number | null;
  keyword: string | null;
  keywordMode: 'none' | 'present' | 'absent';
  latencyThresholdMs: number | null;
  sslWarnDays: number;
  intervalSeconds: number;
  timeoutMs: number;
  retries: number;
  groupName: string;
  enabled: boolean;
  allowPrivate: boolean;
  notes: string | null;
}

export const api = {
  getPublicStatus: () => request<PublicStatusResponse>('/api/public/status'),
  getPublicIncidents: () => request<{ incidents: Incident[] }>('/api/public/incidents'),
  getPublicConfig: () => request<PublicConfig>('/api/public/config'),
  me: () => request<AdminSessionInfo>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<AdminSessionInfo>('/api/auth/login', { method: 'POST', body: { email, password } }),
  demoLogin: () => request<AdminSessionInfo>('/api/auth/demo', { method: 'POST' }),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/password/request', { method: 'POST', body: { email } }),
  confirmPasswordReset: (token: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/password/confirm', { method: 'POST', body: { token, password } }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => request<{ ok: boolean; removed: number }>('/api/auth/logout-all', { method: 'POST' }),

  getSummary: () => request<SummaryResponse>('/api/admin/summary'),
  getMonitors: () => request<{ monitors: AdminMonitorListItem[] }>('/api/admin/monitors'),
  getMonitor: (id: number) => request<MonitorDetailResponse>(`/api/admin/monitors/${id}`),
  getMonitorResults: (id: number, range: '24h' | '7d' | '30d') =>
    request<MonitorResultsResponse>(`/api/admin/monitors/${id}/results?range=${range}`),
  createMonitor: (payload: MonitorPayload) =>
    request<{ monitor: Monitor }>('/api/admin/monitors', { method: 'POST', body: payload }),
  updateMonitor: (id: number, payload: MonitorPayload) =>
    request<{ monitor: Monitor }>(`/api/admin/monitors/${id}`, { method: 'PUT', body: payload }),
  deleteMonitor: (id: number) => request<{ ok: boolean }>(`/api/admin/monitors/${id}`, { method: 'DELETE' }),
  runCheck: (id: number) => request<{ ok: boolean }>(`/api/admin/monitors/${id}/check`, { method: 'POST' }),

  getIncidents: (status?: string) =>
    request<{ incidents: Incident[] }>(`/api/admin/incidents${status ? `?status=${status}` : ''}`),
  getIncident: (id: number) => request<{ incident: Incident; monitor: Monitor | null }>(`/api/admin/incidents/${id}`),
  postIncidentUpdate: (id: number, message: string, status: IncidentStatus) =>
    request<{ incident: Incident }>(`/api/admin/incidents/${id}/updates`, {
      method: 'POST',
      body: { message, status },
    }),

  getMaintenance: () => request<{ windows: MaintenanceListItem[] }>('/api/admin/maintenance'),
  createMaintenance: (payload: { title: string; startsAt: number; endsAt: number; monitorId: number | null }) =>
    request<{ window: MaintenanceWindow }>('/api/admin/maintenance', { method: 'POST', body: payload }),
  deleteMaintenance: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/maintenance/${id}`, { method: 'DELETE' }),

  getSettings: () => request<SettingsResponse>('/api/admin/settings'),
  saveSettings: (
    payload: Omit<AppSettings, 'webhookSecret'> & { webhookSecret?: string },
  ) => request<SettingsResponse>('/api/admin/settings', { method: 'PUT', body: payload }),
  testWebhook: () =>
    request<{ ok: boolean; status: number | null; error: string | null; message: string }>(
      '/api/admin/webhook/test',
      { method: 'POST' },
    ),

  getNotifications: () =>
    request<{ notifications: NotificationEntry[]; unread: number }>('/api/admin/notifications'),
  markNotificationsRead: () =>
    request<{ ok: boolean; changed: number }>('/api/admin/notifications/read-all', { method: 'POST' }),
  getAudit: (limit = 100) => request<{ entries: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`),
};

export type { User };
