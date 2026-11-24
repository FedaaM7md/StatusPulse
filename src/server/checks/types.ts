/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { CheckState, Monitor } from '../../shared/types';

export interface CheckOutcome {
  state: CheckState;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  detail: Record<string, unknown>;
  checkedAt: number;
}

export interface HttpProbeOptions {
  url: string;
  method: string;
  timeoutMs: number;
  allowPrivate: boolean;
  maxRedirects: number;
}

export interface HttpProbeResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  truncated: boolean;
  latencyMs: number;
  finalUrl: string;
  redirects: string[];
  addresses: string[];
}

export type HttpProbe = (options: HttpProbeOptions) => Promise<HttpProbeResult>;

export interface TcpProbeOptions {
  host: string;
  port: number;
  timeoutMs: number;
  allowPrivate: boolean;
}

export interface TcpProbeResult {
  latencyMs: number;
  address: string;
}

export type TcpProbe = (options: TcpProbeOptions) => Promise<TcpProbeResult>;

export interface DnsProbeOptions {
  host: string;
  recordType: string;
  timeoutMs: number;
}

export interface DnsProbeResult {
  records: string[];
  latencyMs: number;
  resolver?: string;
}

export type DnsProbe = (options: DnsProbeOptions) => Promise<DnsProbeResult>;

export interface TlsProbeOptions {
  host: string;
  port: number;
  timeoutMs: number;
  allowPrivate: boolean;
}

export interface TlsProbeResult {
  latencyMs: number;
  authorized: boolean;
  authorizationError: string | null;
  validFrom: string | null;
  validTo: string | null;
  issuer: string | null;
  subject: string | null;
  fingerprint: string | null;
  daysRemaining: number | null;
  address: string;
}

export type TlsProbe = (options: TlsProbeOptions) => Promise<TlsProbeResult>;

export interface CheckProbes {
  http: HttpProbe;
  tcp: TcpProbe;
  dns: DnsProbe;
  tls: TlsProbe;
}

export interface CheckContext {
  /** Result of global setting AND per-monitor flag. */
  allowPrivate: boolean;
  now?: () => number;
  probes?: Partial<CheckProbes>;
}

export type MonitorCheckTarget = Pick<
  Monitor,
  | 'type'
  | 'url'
  | 'host'
  | 'port'
  | 'recordType'
  | 'expectedValue'
  | 'httpMethod'
  | 'expectedStatus'
  | 'keyword'
  | 'keywordMode'
  | 'latencyThresholdMs'
  | 'sslWarnDays'
  | 'timeoutMs'
  | 'retries'
>;

/** A per-monitor private override only applies when the global switch is on. */
export function effectiveAllowPrivate(globalSetting: boolean, monitorSetting: boolean): boolean {
  return globalSetting && monitorSetting;
}
