import { describe, expect, it, vi } from 'vitest';
import { runMonitorCheck } from '../src/server/checks/engine';
import { effectiveAllowPrivate, type DnsProbe, type TcpProbe, type TlsProbe } from '../src/server/checks/types';
import { target } from './helpers';

describe('TCP check verdicts', () => {
  it('is up when the port accepts a connection', async () => {
    const tcp = vi.fn<TcpProbe>(async () => ({ latencyMs: 24, address: '93.184.216.34' }));
    const outcome = await runMonitorCheck(target({ type: 'tcp', url: null, host: 'db.example.com', port: 5432 }), {
      allowPrivate: false,
      probes: { tcp },
    });
    expect(outcome.state).toBe('up');
    expect(outcome.latencyMs).toBe(24);
    expect(outcome.detail.port).toBe(5432);
  });

  it('is degraded when connect time exceeds the threshold', async () => {
    const tcp = vi.fn<TcpProbe>(async () => ({ latencyMs: 400, address: '93.184.216.34' }));
    const outcome = await runMonitorCheck(
      target({ type: 'tcp', url: null, host: 'db.example.com', port: 5432, latencyThresholdMs: 200 }),
      { allowPrivate: false, probes: { tcp } },
    );
    expect(outcome.state).toBe('degraded');
  });

  it('is down when the connection fails', async () => {
    const tcp = vi.fn<TcpProbe>(async () => {
      throw new Error('Connection refused.');
    });
    const outcome = await runMonitorCheck(target({ type: 'tcp', url: null, host: 'db.example.com', port: 5432 }), {
      allowPrivate: false,
      probes: { tcp },
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toBe('Connection refused.');
  });

  it('requires a host and port', async () => {
    const outcome = await runMonitorCheck(target({ type: 'tcp', url: null, host: null, port: null }), {
      allowPrivate: false,
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toContain('host or port');
  });
});

describe('DNS check verdicts', () => {
  it('is up when the expected value is present', async () => {
    const dns = vi.fn<DnsProbe>(async () => ({
      records: ['93.184.216.34', '93.184.216.35'],
      latencyMs: 12,
      resolver: 'system',
    }));
    const outcome = await runMonitorCheck(
      target({
        type: 'dns',
        url: null,
        host: 'example.com',
        recordType: 'A',
        expectedValue: '93.184.216.35',
      }),
      { allowPrivate: false, probes: { dns } },
    );
    expect(outcome.state).toBe('up');
    expect(outcome.detail.records).toEqual(['93.184.216.34', '93.184.216.35']);
  });

  it('accepts any non-empty answer when no value is configured', async () => {
    const dns = vi.fn<DnsProbe>(async () => ({ records: ['mail.example.com'], latencyMs: 9 }));
    const outcome = await runMonitorCheck(
      target({ type: 'dns', url: null, host: 'example.com', recordType: 'MX', expectedValue: null }),
      { allowPrivate: false, probes: { dns } },
    );
    expect(outcome.state).toBe('up');
  });

  it('is down when the expected value is missing', async () => {
    const dns = vi.fn<DnsProbe>(async () => ({ records: ['10.0.0.1'], latencyMs: 9 }));
    const outcome = await runMonitorCheck(
      target({ type: 'dns', url: null, host: 'example.com', recordType: 'A', expectedValue: '93.184.216.34' }),
      { allowPrivate: false, probes: { dns } },
    );
    expect(outcome.state).toBe('down');
    expect(outcome.error).toContain('expected DNS value');
  });

  it('is down when the resolver fails', async () => {
    const dns = vi.fn<DnsProbe>(async () => {
      throw new Error('queryA ENOTFOUND');
    });
    const outcome = await runMonitorCheck(
      target({ type: 'dns', url: null, host: 'missing.example', recordType: 'A' }),
      { allowPrivate: false, probes: { dns } },
    );
    expect(outcome.state).toBe('down');
  });
});

function tlsResult(overrides: Partial<Awaited<ReturnType<TlsProbe>>> = {}) {
  return {
    latencyMs: 80,
    authorized: true,
    authorizationError: null,
    validFrom: 'Nov 1 00:00:00 2026 GMT',
    validTo: 'Nov 1 00:00:00 2027 GMT',
    issuer: 'CN=Example CA',
    subject: 'CN=example.com',
    fingerprint: 'AA:BB',
    daysRemaining: 120,
    address: '93.184.216.34',
    ...overrides,
  };
}

describe('TLS check verdicts', () => {
  it('is up for a valid certificate outside the warning window', async () => {
    const tls = vi.fn<TlsProbe>(async () => tlsResult());
    const outcome = await runMonitorCheck(target({ type: 'ssl', url: null, host: 'example.com', port: 443 }), {
      allowPrivate: false,
      probes: { tls },
    });
    expect(outcome.state).toBe('up');
    expect(outcome.detail.daysRemaining).toBe(120);
  });

  it('is degraded near expiry', async () => {
    const tls = vi.fn<TlsProbe>(async () => tlsResult({ daysRemaining: 7 }));
    const outcome = await runMonitorCheck(
      target({ type: 'ssl', url: null, host: 'example.com', port: 443, sslWarnDays: 14 }),
      { allowPrivate: false, probes: { tls } },
    );
    expect(outcome.state).toBe('degraded');
    expect(outcome.error).toContain('7 days');
  });

  it('is down when the certificate has expired', async () => {
    const tls = vi.fn<TlsProbe>(async () => tlsResult({ daysRemaining: 0 }));
    const outcome = await runMonitorCheck(target({ type: 'ssl', url: null, host: 'example.com', port: 443 }), {
      allowPrivate: false,
      probes: { tls },
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toContain('expired');
  });

  it('is down when the certificate is untrusted', async () => {
    const tls = vi.fn<TlsProbe>(async () =>
      tlsResult({ authorized: false, authorizationError: 'Certificate has expired.' }),
    );
    const outcome = await runMonitorCheck(target({ type: 'ssl', url: null, host: 'example.com', port: 443 }), {
      allowPrivate: false,
      probes: { tls },
    });
    expect(outcome.state).toBe('down');
    expect(outcome.error).toBe('Certificate has expired.');
  });

  it('defaults the SSL port to 443', async () => {
    const tls = vi.fn<TlsProbe>(async () => tlsResult());
    await runMonitorCheck(target({ type: 'ssl', url: null, host: 'example.com', port: null }), {
      allowPrivate: false,
      probes: { tls },
    });
    expect(tls).toHaveBeenCalledWith(expect.objectContaining({ port: 443 }));
  });
});

describe('private target policy', () => {
  it('requires both the global setting and the per-monitor flag', () => {
    expect(effectiveAllowPrivate(false, false)).toBe(false);
    expect(effectiveAllowPrivate(false, true)).toBe(false);
    expect(effectiveAllowPrivate(true, false)).toBe(false);
    expect(effectiveAllowPrivate(true, true)).toBe(true);
  });
});
