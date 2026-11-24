/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { CheckState } from '../../shared/types';
import { describeBlockedTarget, SsrfBlockedError, TargetError } from '../lib/ssrf';
import { dnsProbe } from './dns-probe';
import { httpProbe } from './http-probe';
import { tcpProbe } from './tcp-probe';
import { tlsProbe } from './tls-probe';
import type { CheckContext, CheckOutcome, CheckProbes, MonitorCheckTarget } from './types';

function cleanMessage(error: unknown): string {
  if (error instanceof SsrfBlockedError) return describeBlockedTarget(error);
  if (error instanceof TargetError) return error.message;
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, ' ').trim().slice(0, 200) || 'The check failed.';
  }
  return 'The check failed.';
}

function exceedsThreshold(latencyMs: number | null, thresholdMs: number | null): boolean {
  if (thresholdMs === null || thresholdMs <= 0 || latencyMs === null) return false;
  return latencyMs > thresholdMs;
}

function pickProbes(ctx: CheckContext): CheckProbes {
  return {
    http: ctx.probes?.http ?? httpProbe,
    tcp: ctx.probes?.tcp ?? tcpProbe,
    dns: ctx.probes?.dns ?? dnsProbe,
    tls: ctx.probes?.tls ?? tlsProbe,
  };
}

/**
 * Run one logical check for a monitor. Probes are injectable so the check
 * engines can be tested without real network access.
 */
export async function runMonitorCheck(monitor: MonitorCheckTarget, ctx: CheckContext): Promise<CheckOutcome> {
  const probes = pickProbes(ctx);
  const now = ctx.now ?? (() => Date.now());
  const checkedAt = now();
  const timeoutMs = monitor.timeoutMs;

  try {
    switch (monitor.type) {
      case 'http': {
        if (!monitor.url) throw new TargetError('INVALID_URL', 'No URL is configured.');
        const result = await probes.http({
          url: monitor.url,
          method: monitor.httpMethod || 'GET',
          timeoutMs,
          allowPrivate: ctx.allowPrivate,
          maxRedirects: 5,
        });

        const expected = monitor.expectedStatus;
        const statusOk =
          expected === null
            ? result.statusCode >= 200 && result.statusCode < 400
            : result.statusCode === expected;

        let keywordMatch: boolean | null = null;
        if (monitor.keyword && monitor.keywordMode !== 'none') {
          const haystack = result.body.toLowerCase();
          const needle = monitor.keyword.toLowerCase();
          const contains = haystack.includes(needle);
          keywordMatch = monitor.keywordMode === 'present' ? contains : !contains;
        }

        const detail: Record<string, unknown> = {
          finalUrl: result.finalUrl,
          redirects: result.redirects,
          truncated: result.truncated,
          keywordMatch,
          addresses: result.addresses,
        };

        let state: CheckState = 'up';
        let error: string | null = null;
        if (!statusOk) {
          state = 'down';
          error = `Unexpected HTTP status ${result.statusCode}${expected !== null ? ` (expected ${expected})` : ''}.`;
        } else if (keywordMatch === false) {
          state = 'down';
          error =
            monitor.keywordMode === 'present'
              ? 'The keyword was not found in the response body.'
              : 'The forbidden keyword was found in the response body.';
        } else if (exceedsThreshold(result.latencyMs, monitor.latencyThresholdMs)) {
          state = 'degraded';
          error = `Response time ${result.latencyMs} ms exceeded the ${monitor.latencyThresholdMs} ms threshold.`;
        }

        return {
          state,
          latencyMs: result.latencyMs,
          statusCode: result.statusCode,
          error,
          detail,
          checkedAt,
        };
      }

      case 'tcp': {
        if (!monitor.host || !monitor.port) throw new TargetError('INVALID_TARGET', 'No host or port is configured.');
        const result = await probes.tcp({
          host: monitor.host,
          port: monitor.port,
          timeoutMs,
          allowPrivate: ctx.allowPrivate,
        });
        const degraded = exceedsThreshold(result.latencyMs, monitor.latencyThresholdMs);
        return {
          state: degraded ? 'degraded' : 'up',
          latencyMs: result.latencyMs,
          statusCode: null,
          error: degraded
            ? `Connect time ${result.latencyMs} ms exceeded the ${monitor.latencyThresholdMs} ms threshold.`
            : null,
          detail: { address: result.address, port: monitor.port },
          checkedAt,
        };
      }

      case 'dns': {
        if (!monitor.host || !monitor.recordType) {
          throw new TargetError('INVALID_TARGET', 'No DNS host or record type is configured.');
        }
        const result = await probes.dns({
          host: monitor.host,
          recordType: monitor.recordType,
          timeoutMs,
        });
        const expected = (monitor.expectedValue ?? '').trim().toLowerCase();
        const matched =
          expected.length === 0 ||
          result.records.some((record) => record.trim().toLowerCase().includes(expected));
        const degraded = exceedsThreshold(result.latencyMs, monitor.latencyThresholdMs);
        let state: CheckState = 'up';
        let error: string | null = null;
        if (!matched) {
          state = 'down';
          error = `The expected DNS value was not found (${monitor.recordType} record).`;
        } else if (degraded) {
          state = 'degraded';
          error = `DNS lookup ${result.latencyMs} ms exceeded the ${monitor.latencyThresholdMs} ms threshold.`;
        }
        return {
          state,
          latencyMs: result.latencyMs,
          statusCode: null,
          error,
          detail: {
            recordType: monitor.recordType,
            records: result.records,
            expectedValue: monitor.expectedValue,
            resolver: result.resolver,
          },
          checkedAt,
        };
      }

      case 'ssl': {
        if (!monitor.host) throw new TargetError('INVALID_TARGET', 'No TLS host is configured.');
        const result = await probes.tls({
          host: monitor.host,
          port: monitor.port ?? 443,
          timeoutMs,
          allowPrivate: ctx.allowPrivate,
        });

        const detail: Record<string, unknown> = {
          validFrom: result.validFrom,
          validTo: result.validTo,
          issuer: result.issuer,
          subject: result.subject,
          fingerprint: result.fingerprint,
          daysRemaining: result.daysRemaining,
          address: result.address,
        };

        if (!result.authorized) {
          return {
            state: 'down',
            latencyMs: result.latencyMs,
            statusCode: null,
            error: result.authorizationError || 'The certificate is not trusted.',
            detail,
            checkedAt,
          };
        }

        if (result.daysRemaining !== null && result.daysRemaining <= 0) {
          return {
            state: 'down',
            latencyMs: result.latencyMs,
            statusCode: null,
            error: 'The certificate has expired.',
            detail,
            checkedAt,
          };
        }

        if (result.daysRemaining !== null && result.daysRemaining <= monitor.sslWarnDays) {
          return {
            state: 'degraded',
            latencyMs: result.latencyMs,
            statusCode: null,
            error: `The certificate expires in ${result.daysRemaining} days.`,
            detail,
            checkedAt,
          };
        }

        if (exceedsThreshold(result.latencyMs, monitor.latencyThresholdMs)) {
          return {
            state: 'degraded',
            latencyMs: result.latencyMs,
            statusCode: null,
            error: `TLS handshake ${result.latencyMs} ms exceeded the ${monitor.latencyThresholdMs} ms threshold.`,
            detail,
            checkedAt,
          };
        }

        return {
          state: 'up',
          latencyMs: result.latencyMs,
          statusCode: null,
          error: null,
          detail,
          checkedAt,
        };
      }

      default:
        throw new TargetError('INVALID_TYPE', 'Unsupported monitor type.');
    }
  } catch (error) {
    return {
      state: 'down',
      latencyMs: null,
      statusCode: null,
      error: cleanMessage(error),
      detail: { type: monitor.type },
      checkedAt,
    };
  }
}
