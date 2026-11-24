/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { createHmac } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { createPinnedLookup } from '../lib/pinned-lookup';
import { resolvePinnedTarget, SsrfBlockedError, TargetError, type HostResolver } from '../lib/ssrf';

export interface WebhookPayload {
  event: string;
  state?: string;
  monitor?: { id: number; name: string; type: string };
  incidentId?: number | null;
  error?: string | null;
  at: string;
}

export interface WebhookResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface SendWebhookOptions {
  timeoutMs?: number;
  resolver?: HostResolver;
}

/**
 * Webhook delivery is optional and disabled by default. It is always subject
 * to the SSRF guard with private targets disallowed, even when the monitoring
 * global switch is on: outbound operator webhooks should never reach internal
 * metadata endpoints.
 */
export async function sendWebhook(
  rawUrl: string,
  secret: string,
  payload: WebhookPayload,
  options: SendWebhookOptions = {},
): Promise<WebhookResult> {
  if (!rawUrl) return { ok: false, error: 'No webhook URL configured.' };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid webhook URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https webhook URLs are supported.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Webhook URLs must not contain credentials.' };
  }

  let pinned;
  try {
    pinned = await resolvePinnedTarget(url.hostname, {
      allowPrivate: false,
      resolver: options.resolver,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof SsrfBlockedError
          ? 'Blocked webhook target (private or special-use address).'
          : error instanceof TargetError
            ? error.message
            : 'Webhook target could not be validated.',
    };
  }

  const body = JSON.stringify({ ...payload, timestamp: payload.at });
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'StatusPulse/1.0',
    'X-StatusPulse-Event': payload.event,
  };
  if (secret) {
    headers['X-StatusPulse-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  const timeoutMs = options.timeoutMs ?? 8000;

  return new Promise<WebhookResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: WebhookResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        agent: false,
        headers: { ...headers, Host: url.host },
        lookup: createPinnedLookup(pinned.address, pinned.family),
      },
      (response) => {
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > 64 * 1024) response.destroy();
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          finish({ ok: status >= 200 && status < 300, status });
        });
        response.on('error', () => finish({ ok: false, error: 'Webhook response failed.' }));
      },
    );

    timer = setTimeout(() => {
      request.destroy();
      finish({ ok: false, error: 'Webhook delivery timed out.' });
    }, timeoutMs);

    request.on('error', (error: NodeJS.ErrnoException) => {
      finish({ ok: false, error: error.message.replace(/\s+/g, ' ').slice(0, 160) });
    });

    request.write(body);
    request.end();
  });
}
