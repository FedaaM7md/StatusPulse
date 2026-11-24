/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import net from 'node:net';
import { resolveConnectTarget } from '../lib/ssrf';
import type { TcpProbe, TcpProbeResult } from './types';

export const tcpProbe: TcpProbe = async (options) => {
  const pinned = await resolveConnectTarget(options.host, { allowPrivate: options.allowPrivate });
  const started = Date.now();

  return new Promise<TcpProbeResult>((resolve, reject) => {
    let settled = false;
    const socket = net.connect({
      host: pinned.address,
      port: options.port,
      family: pinned.family,
      allowHalfOpen: false,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Timed out after ${options.timeoutMs} ms.`)));
    }, options.timeoutMs);

    socket.once('connect', () => {
      const latencyMs = Date.now() - started;
      clearTimeout(timer);
      finish(() => resolve({ latencyMs, address: pinned.address }));
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const message =
        error.code === 'ECONNREFUSED'
          ? 'Connection refused.'
          : error.code === 'EHOSTUNREACH'
            ? 'Host unreachable.'
            : error.code === 'ENETUNREACH'
              ? 'Network unreachable.'
              : error.message.replace(/\s+/g, ' ').slice(0, 180);
      finish(() => reject(new Error(message)));
    });
  });
};
