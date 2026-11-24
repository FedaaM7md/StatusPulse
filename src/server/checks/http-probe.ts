/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import http from 'node:http';
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { createPinnedLookup } from '../lib/pinned-lookup';
import { assertSafeUrlSyntax, resolvePinnedTarget, TargetError } from '../lib/ssrf';
import type { HttpProbe, HttpProbeResult } from './types';

const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT = 'StatusPulse/1.0 (+uptime monitor)';

interface SingleResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  truncated: boolean;
}

function networkErrorMessage(error: NodeJS.ErrnoException): string {
  switch (error.code) {
    case 'ECONNREFUSED':
      return 'Connection refused.';
    case 'ECONNRESET':
      return 'Connection reset by the target.';
    case 'ENOTFOUND':
      return 'Host not found.';
    case 'EHOSTUNREACH':
      return 'Host unreachable.';
    case 'ETIMEDOUT':
      return 'Connection timed out.';
    case 'EPIPE':
      return 'Connection closed unexpectedly.';
    case 'ERR_INVALID_URL':
      return 'The URL is not valid.';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'TLS certificate validation failed.';
    default:
      return error.message ? error.message.replace(/\s+/g, ' ').slice(0, 180) : 'Request failed.';
  }
}

function requestOnce(
  url: URL,
  address: string,
  family: 4 | 6,
  method: string,
  timeoutMs: number,
): Promise<SingleResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const requestOptions: https.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      agent: false,
      headers: {
        Host: url.host,
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
      // Pin the validated address. No second DNS lookup happens at connect time.
      lookup: createPinnedLookup(address, family),
    };

    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    let request: http.ClientRequest;
    try {
      request = transport.request(requestOptions, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;

        response.on('data', (chunk: Buffer) => {
          if (truncated) return;
          const remaining = MAX_BODY_BYTES - size;
          if (chunk.length >= remaining) {
            chunks.push(chunk.subarray(0, remaining));
            size += remaining;
            truncated = true;
            response.destroy();
            finish(() =>
              resolve({
                statusCode: response.statusCode ?? 0,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
                truncated,
              }),
            );
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });

        response.on('end', () => {
          finish(() =>
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString('utf8'),
              truncated,
            }),
          );
        });

        response.on('error', (error: NodeJS.ErrnoException) => {
          finish(() => reject(new TargetError('CHECK_FAILED', networkErrorMessage(error))));
        });
      });
    } catch (error) {
      finish(() => reject(new TargetError('CHECK_FAILED', networkErrorMessage(error as NodeJS.ErrnoException))));
      return;
    }

    timer = setTimeout(() => {
      request.destroy();
      finish(() => reject(new TargetError('TIMEOUT', `Timed out after ${timeoutMs} ms.`)));
    }, timeoutMs);

    request.on('error', (error: NodeJS.ErrnoException) => {
      finish(() => reject(new TargetError('CHECK_FAILED', networkErrorMessage(error))));
    });

    request.end();
  });
}

/**
 * HTTP probe with SSRF validation and DNS pinning on every hop.
 * Redirects are followed manually so that each Location is re-validated.
 */
export const httpProbe: HttpProbe = async (options) => {
  const started = Date.now();
  const deadline = started + options.timeoutMs;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = assertSafeUrlSyntax(options.url);
  let method = options.method || 'GET';
  let redirects = 0;
  const visited: string[] = [];
  const addresses: string[] = [];

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TargetError('TIMEOUT', `Timed out after ${options.timeoutMs} ms.`);

    const pinned = await resolvePinnedTarget(currentUrl.hostname, {
      allowPrivate: options.allowPrivate,
    });
    addresses.push(pinned.address);
    visited.push(`${method} ${currentUrl.origin}${currentUrl.pathname}${currentUrl.search}`);

    const response = await requestOnce(currentUrl, pinned.address, pinned.family, method, remaining);
    const location = response.headers.location;
    const status = response.statusCode;

    if ([301, 302, 303, 307, 308].includes(status) && typeof location === 'string' && location.length > 0) {
      if (redirects >= maxRedirects) {
        throw new TargetError('TOO_MANY_REDIRECTS', `More than ${maxRedirects} redirects.`);
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new TargetError('INVALID_REDIRECT', 'The target returned an invalid redirect location.');
      }
      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new TargetError('INVALID_PROTOCOL', 'Redirected to an unsupported protocol.');
      }
      // Loop protection and credential rejection before the next hop.
      assertSafeUrlSyntax(nextUrl.toString());
      if (visited.includes(`${method} ${nextUrl.origin}${nextUrl.pathname}${nextUrl.search}`)) {
        throw new TargetError('REDIRECT_LOOP', 'The target redirects in a loop.');
      }
      currentUrl = nextUrl;
      redirects += 1;
      if (status === 303 || ((status === 301 || status === 302) && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET';
      }
      continue;
    }

    return {
      statusCode: status,
      headers: response.headers,
      body: response.body,
      truncated: response.truncated,
      latencyMs: Date.now() - started,
      finalUrl: currentUrl.toString(),
      redirects: visited.slice(1),
      addresses,
    } satisfies HttpProbeResult;
  }
};
