/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { isIpLiteral, stripBrackets } from '../lib/ip';
import { resolveConnectTarget } from '../lib/ssrf';
import type { TlsProbe, TlsProbeResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface HandshakeResult {
  authorized: boolean;
  authorizationError: string | null;
  certificate: X509Certificate;
  latencyMs: number;
}

const AUTH_ERRORS: Record<string, string> = {
  CERT_HAS_EXPIRED: 'Certificate has expired.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificate is self-signed.',
  SELF_SIGNED_CERT_IN_CHAIN: 'Certificate chain contains a self-signed certificate.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Certificate chain could not be verified.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'Certificate issuer is not trusted.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'Certificate does not match the hostname.',
  CERT_NOT_YET_VALID: 'Certificate is not valid yet.',
};

function handshake(host: string, address: string, port: number, timeoutMs: number, verify: boolean): Promise<HandshakeResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const servername = isIpLiteral(host) ? undefined : stripBrackets(host);
    const socket = tls.connect({
      host: address,
      port,
      servername,
      rejectUnauthorized: verify,
      ALPNProtocols: ['http/1.1'],
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error(`Timed out after ${timeoutMs} ms.`), { code: 'ETIMEDOUT' })));
    }, timeoutMs);

    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate(true);
      if (!certificate || !certificate.raw) {
        finish(() => reject(new Error('The target did not present a certificate.')));
        return;
      }
      try {
        const parsed = new X509Certificate(certificate.raw);
        clearTimeout(timer);
        finish(() =>
          resolve({
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            certificate: parsed,
            latencyMs: Date.now() - started,
          }),
        );
      } catch {
        finish(() => reject(new Error('The certificate could not be parsed.')));
      }
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
  });
}

export const tlsProbe: TlsProbe = async (options) => {
  const pinned = await resolveConnectTarget(options.host, { allowPrivate: options.allowPrivate });
  const started = Date.now();
  let primaryError: NodeJS.ErrnoException | null = null;

  try {
    const result = await handshake(options.host, pinned.address, options.port, options.timeoutMs, true);
    return buildResult(result, pinned.address, options.timeoutMs, started);
  } catch (error) {
    primaryError = error as NodeJS.ErrnoException;
  }

  // If verification failed we still inspect the certificate so that expiry
  // problems are visible to operators instead of hiding behind a generic error.
  try {
    const result = await handshake(options.host, pinned.address, options.port, options.timeoutMs, false);
    const code = primaryError?.code ?? 'CERT_UNTRUSTED';
    const message = AUTH_ERRORS[code] ?? primaryError?.message ?? 'Certificate is not trusted.';
    return {
      ...buildResult(result, pinned.address, options.timeoutMs, started),
      authorized: false,
      authorizationError: message,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message =
      primaryError?.code === 'ETIMEDOUT'
        ? `Timed out after ${options.timeoutMs} ms.`
        : primaryError?.message
          ? primaryError.message.replace(/\s+/g, ' ').slice(0, 180)
          : error instanceof Error
            ? error.message.replace(/\s+/g, ' ').slice(0, 180)
            : 'TLS connection failed.';
    throw new Error(message);
  }
};

function buildResult(
  result: HandshakeResult,
  address: string,
  timeoutMs: number,
  started: number,
): TlsProbeResult {
  const validTo = result.certificate.validTo ? new Date(result.certificate.validTo) : null;
  const daysRemaining = validTo ? Math.floor((validTo.getTime() - Date.now()) / DAY_MS) : null;
  void timeoutMs;
  void started;
  return {
    latencyMs: result.latencyMs,
    authorized: result.authorized && !result.authorizationError,
    authorizationError: result.authorizationError,
    validFrom: result.certificate.validFrom || null,
    validTo: result.certificate.validTo || null,
    issuer: result.certificate.issuer || null,
    subject: result.certificate.subject || null,
    fingerprint: result.certificate.fingerprint256 || null,
    daysRemaining,
    address,
  };
}
