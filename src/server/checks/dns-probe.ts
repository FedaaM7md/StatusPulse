/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import dns from 'node:dns';
import type { DnsProbe, DnsProbeResult } from './types';

type RawRecords = string[];

async function query(host: string, recordType: string): Promise<RawRecords> {
  switch (recordType) {
    case 'A':
      return dns.promises.resolve4(host);
    case 'AAAA':
      return dns.promises.resolve6(host);
    case 'CNAME':
      return dns.promises.resolveCname(host);
    case 'TXT': {
      const records = await dns.promises.resolveTxt(host);
      return records.map((chunks) => chunks.join(''));
    }
    case 'MX': {
      const records = await dns.promises.resolveMx(host);
      return records.map((record) => `${record.priority} ${record.exchange}`);
    }
    default:
      throw new Error(`Unsupported DNS record type: ${recordType}`);
  }
}

export const dnsProbe: DnsProbe = async (options) => {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const records = await Promise.race([
      query(options.host, options.recordType),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${options.timeoutMs} ms.`)), options.timeoutMs);
      }),
    ]);
    return {
      records,
      latencyMs: Date.now() - started,
      resolver: 'system',
    } satisfies DnsProbeResult;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Timed out')) throw error;
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 180) : 'DNS lookup failed.';
    throw new Error(message);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
