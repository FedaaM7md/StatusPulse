/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
export const MONITOR_TYPES = ['http', 'tcp', 'dns', 'ssl'] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

export const CHECK_STATES = ['up', 'degraded', 'down'] as const;
export type CheckState = (typeof CHECK_STATES)[number];
export type DisplayState = CheckState | 'maintenance' | 'unknown';

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const;

/** Shared demo operator account. It cannot be created or deleted from the UI. */
export const DEMO_EMAIL = 'demo@statuspulse.local';
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export const KEYWORD_MODES = ['none', 'present', 'absent'] as const;
export type KeywordMode = (typeof KEYWORD_MODES)[number];

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin';
  createdAt: number;
  /** True for the shared demo operator account. */
  isDemo: boolean;
}

export interface Monitor {
  id: number;
  name: string;
  type: MonitorType;
  url: string | null;
  host: string | null;
  port: number | null;
  recordType: DnsRecordType | null;
  expectedValue: string | null;
  httpMethod: string;
  expectedStatus: number | null;
  keyword: string | null;
  keywordMode: KeywordMode;
  latencyThresholdMs: number | null;
  sslWarnDays: number;
  intervalSeconds: number;
  timeoutMs: number;
  retries: number;
  groupName: string;
  enabled: boolean;
  allowPrivate: boolean;
  notes: string | null;
  currentState: DisplayState;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
  createdAt: number;
  updatedAt: number;
  /** Synthetic demo component; the scheduler never checks it. */
  demo: boolean;
  /** Customer-facing names for the public page (admin keeps the technical name). */
  publicNameAr: string | null;
  publicNameEn: string | null;
  publicGroupAr: string | null;
  publicGroupEn: string | null;
}

export interface CheckResult {
  id: number;
  monitorId: number;
  checkedAt: number;
  state: CheckState;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  detail: Record<string, unknown> | null;
}

export interface IncidentUpdate {
  id: number;
  incidentId: number;
  message: string | null;
  messageKey: string | null;
  params: Record<string, unknown> | null;
  status: IncidentStatus;
  isAutomatic: boolean;
  createdAt: number;
}

export interface Incident {
  id: number;
  monitorId: number | null;
  title: string;
  titleAr: string | null;
  titleEn: string | null;
  summaryAr: string | null;
  summaryEn: string | null;
  cause: string | null;
  status: IncidentStatus;
  severity: 'minor' | 'major';
  startedAt: number;
  resolvedAt: number | null;
  isAutomatic: boolean;
  createdAt: number;
  updates: IncidentUpdate[];
}

export interface MaintenanceWindow {
  id: number;
  title: string;
  titleAr: string | null;
  titleEn: string | null;
  startsAt: number;
  endsAt: number;
  monitorId: number | null;
  createdAt: number;
}

export interface PublicMonitor {
  id: number;
  /** Technical identifier, shown only as secondary mono text publicly. */
  name: string;
  /** Customer-facing name for the active language. */
  displayName: { ar: string; en: string };
  type: MonitorType;
  groupName: string;
  state: DisplayState;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  days: Array<{ date: string; uptime: number | null }>;
}

export interface PublicGroup {
  /** Technical grouping key used by the admin. */
  name: string;
  /** Customer-facing group name for the active language. */
  displayName: { ar: string; en: string };
  monitors: PublicMonitor[];
}

export interface PublicIncidentUpdate {
  id: number;
  message: string | null;
  messageKey: string | null;
  params: Record<string, unknown> | null;
  status: IncidentStatus;
  isAutomatic: boolean;
  createdAt: number;
}

export interface PublicIncident {
  id: number;
  monitorId: number | null;
  monitorName: string | null;
  monitorDisplayName: { ar: string; en: string } | null;
  title: string;
  titleAr: string | null;
  titleEn: string | null;
  summaryAr: string | null;
  summaryEn: string | null;
  status: IncidentStatus;
  severity: 'minor' | 'major';
  startedAt: number;
  resolvedAt: number | null;
  updates: PublicIncidentUpdate[];
}

export interface PublicStatusResponse {
  refreshedAt: number;
  siteName: { ar: string; en: string };
  siteDescription: { ar: string; en: string };
  publicPageEnabled: boolean;
  demoMode: boolean;
  groups: PublicGroup[];
  activeIncidents: PublicIncident[];
  recentIncidents: PublicIncident[];
  maintenance: Array<MaintenanceWindow & { active: boolean }>;
  overallState: DisplayState;
}

export interface NotificationMonitor {
  id: number;
  name: string;
  displayNameAr: string | null;
  displayNameEn: string | null;
}

export interface NotificationEntry {
  id: number;
  monitorId: number | null;
  incidentId: number | null;
  level: 'info' | 'success' | 'warning' | 'error';
  messageKey: string;
  params: Record<string, unknown>;
  monitor: NotificationMonitor | null;
  createdAt: number;
  read: boolean;
}

export interface AppSettings {
  siteNameAr: string;
  siteNameEn: string;
  siteDescriptionAr: string;
  siteDescriptionEn: string;
  allowPrivateTargets: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  publicPageEnabled: boolean;
}

export interface AdminSessionInfo {
  user: User;
  csrfToken: string;
  expiresAt: number;
  demo: boolean;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  userEmail: string;
  action: string;
  entity: string | null;
  entityId: number | null;
  summary: string | null;
  ip: string | null;
  createdAt: number;
}

export interface PublicConfig {
  demoMode: boolean;
  productName: string;
  demoResetMinutes: number;
}

export interface ApiError {
  error: string;
  message?: string;
  fields?: Record<string, string>;
}
