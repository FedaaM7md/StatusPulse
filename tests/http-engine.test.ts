import { describe, expect, it, vi } from 'vitest';
import { runMonitorCheck } from '../src/server/checks/engine';
import type { HttpProbe, HttpProbeResult } from '../src/server/checks/types';
import { SsrfBlockedError } from '../src/server/lib/ssrf';
import { target } from './helpers';

function probeResult(overrides: Partial<HttpProbeResult> = {}): HttpProbeResult {
  return {
    statusCode: 200,
    headers: {},
    body: 'ok',
    truncated: false,
    latencyMs: 120,
    finalUrl: 'https://example.com/',
    redirects: [],
    addresses: ['93.184.216.34'],
    ...overrides,
  };
}

function mockHttp(result: HttpProbeResult) {
  return vi.fn<HttpProbe>(async () => result);
}

describe('HTTP check verdicts', () => {
  it('marks a fast 200 response as up', async () => {
    const http = mockHttp(probeResult());
    const outcome = await runMonitorCheck(target({}), { allowPrivate: false, probes: { http }, now: () => 1000 });
    expect(outcome.state).toBe('up');
    expect(outcome.statusCode).toBe(200);
    expect(outcome.latencyMs).toBe(120);
    expect(outcome.error).toBeNull();
    expect(outcome.detail.finalUrl).toBe('https://example.com/');
    expect(outcome.checkedAt).toBe(1000);
  });

  it('marks an unexpected status as down', async () => {
    const http = mockHttp(probeResult({ statusCode: 503 }));
    const outcome = await runMonitorCheck(target({ expectedStatus: 200 }), {
      allowPrivate: false,
      probes: { http },
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toContain('503');
  });

  it('accepts a configured expected status', async () => {
    const http = mockHttp(probeResult({ statusCode: 204 }));
    const outcome = await runMonitorCheck(target({ expectedStatus: 204 }), {
      allowPrivate: false,
      probes: { http },
    });
    expect(outcome.state).toBe('up');
  });

  it('treats 2xx and 3xx as acceptable when no status is configured', async () => {
    const http = mockHttp(probeResult({ statusCode: 302 }));
    const outcome = await runMonitorCheck(target({ expectedStatus: null }), {
      allowPrivate: false,
      probes: { http },
    });
    expect(outcome.state).toBe('up');
  });

  it('fails when a required keyword is missing', async () => {
    const http = mockHttp(probeResult({ body: 'maintenance mode' }));
    const outcome = await runMonitorCheck(
      target({ keyword: 'Welcome', keywordMode: 'present' }),
      { allowPrivate: false, probes: { http } },
    );
    expect(outcome.state).toBe('down');
    expect(outcome.detail.keywordMatch).toBe(false);
  });

  it('passes when the required keyword is present (case-insensitive)', async () => {
    const http = mockHttp(probeResult({ body: 'Welcome to StatusPulse' }));
    const outcome = await runMonitorCheck(
      target({ keyword: 'welcome', keywordMode: 'present' }),
      { allowPrivate: false, probes: { http } },
    );
    expect(outcome.state).toBe('up');
    expect(outcome.detail.keywordMatch).toBe(true);
  });

  it('fails when a forbidden keyword is present', async () => {
    const http = mockHttp(probeResult({ body: 'Fatal error: database down' }));
    const outcome = await runMonitorCheck(
      target({ keyword: 'fatal error', keywordMode: 'absent' }),
      { allowPrivate: false, probes: { http } },
    );
    expect(outcome.state).toBe('down');
  });

  it('marks slow but successful responses as degraded', async () => {
    const http = mockHttp(probeResult({ latencyMs: 2500 }));
    const outcome = await runMonitorCheck(target({ latencyThresholdMs: 1000 }), {
      allowPrivate: false,
      probes: { http },
    });
    expect(outcome.state).toBe('degraded');
    expect(outcome.error).toContain('threshold');
  });

  it('reports SSRF blocks as down without leaking internals', async () => {
    const http = vi.fn<HttpProbe>(async () => {
      throw new SsrfBlockedError('internal.example', 'private', 'Blocked');
    });
    const outcome = await runMonitorCheck(target({ url: 'http://internal.example/' }), {
      allowPrivate: false,
      probes: { http },
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toBe('Blocked target (private).');
    expect(outcome.error).not.toContain('10.');
  });

  it('passes the effective allow-private flag and timeout to the probe', async () => {
    const http = mockHttp(probeResult());
    await runMonitorCheck(target({ timeoutMs: 3210 }), { allowPrivate: false, probes: { http } });
    expect(http).toHaveBeenCalledWith(
      expect.objectContaining({ allowPrivate: false, timeoutMs: 3210, method: 'GET', maxRedirects: 5 }),
    );
  });

  it('records network errors as down', async () => {
    const http = vi.fn<HttpProbe>(async () => {
      throw new Error('Connection refused.');
    });
    const outcome = await runMonitorCheck(target({}), { allowPrivate: false, probes: { http } });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toBe('Connection refused.');
    expect(outcome.latencyMs).toBeNull();
  });
});
