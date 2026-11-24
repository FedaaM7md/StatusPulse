/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import dns from 'node:dns';
import { classifyIp, isAllowedCategory, isIpLiteral, stripBrackets } from './ip';

export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_BLOCKED';
  readonly reason: string;
  readonly category: string;
  readonly host: string;

  constructor(host: string, category: string, reason: string) {
    super(reason);
    this.name = 'SsrfBlockedError';
    this.host = host;
    this.category = category;
    this.reason = reason;
  }
}

export class TargetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TargetError';
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: HostResolver = async (hostname) => {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
};

export interface ResolveOptions {
  allowPrivate: boolean;
  resolver?: HostResolver;
}

export interface PinnedTarget {
  /** Normalised hostname used for the Host header and TLS SNI. */
  hostname: string;
  /** The single IP address that the socket must connect to. */
  address: string;
  family: 4 | 6;
}

/**
 * Resolve a hostname and return exactly one pinned address that passed the
 * guard. Pinning after resolution closes the DNS-rebinding window: the check
 * engine connects to this address and never performs a second DNS lookup.
 */
export async function resolvePinnedTarget(hostname: string, options: ResolveOptions): Promise<PinnedTarget> {
  const host = stripBrackets(hostname);
  if (!host) {
    throw new TargetError('INVALID_HOST', 'The target hostname is empty.');
  }

  if (isIpLiteral(host)) {
    const classification = classifyIp(host);
    if (!isAllowedCategory(classification.category, options.allowPrivate)) {
      throw new SsrfBlockedError(
        host,
        classification.category,
        `Blocked target address (${classification.category}).`,
      );
    }
    return { hostname: host, address: host, family: classification.family };
  }

  if (host.length > 253 || !/^[a-z0-9._-]+$/.test(host)) {
    throw new TargetError('INVALID_HOST', 'The hostname is not valid.');
  }

  const resolver = options.resolver ?? systemResolver;
  let resolved: ResolvedAddress[];
  try {
    resolved = await resolver(host);
  } catch {
    throw new TargetError('DNS_FAILED', 'The hostname could not be resolved.');
  }
  if (resolved.length === 0) {
    throw new TargetError('DNS_FAILED', 'The hostname did not resolve to any address.');
  }

  const allowed = resolved.filter((entry) => isAllowedCategory(classifyIp(entry.address).category, options.allowPrivate));
  if (allowed.length === 0) {
    const first = resolved[0]!;
    const classification = classifyIp(first.address);
    throw new SsrfBlockedError(
      host,
      classification.category,
      `Blocked target address (${classification.category}).`,
    );
  }

  const chosen = allowed[0]!;
  return { hostname: host, address: chosen.address, family: chosen.family };
}

export interface ValidatedUrl extends PinnedTarget {
  url: URL;
}

/** Validate URL syntax, credentials and scheme before any network access. */
export function assertSafeUrlSyntax(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TargetError('INVALID_URL', 'The URL is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetError('INVALID_PROTOCOL', 'Only http and https URLs are supported.');
  }
  if (url.username || url.password) {
    throw new TargetError('URL_CREDENTIALS', 'URLs with embedded credentials are not allowed.');
  }
  if (!url.hostname) {
    throw new TargetError('INVALID_HOST', 'The URL has no hostname.');
  }
  return url;
}

export async function validateTargetUrl(rawUrl: string, options: ResolveOptions): Promise<ValidatedUrl> {
  const url = assertSafeUrlSyntax(rawUrl);
  const pinned = await resolvePinnedTarget(url.hostname, options);
  return { ...pinned, url };
}

/**
 * Resolve a hostname used by TCP/TLS checks and return the pinned address.
 */
export async function resolveConnectTarget(hostname: string, options: ResolveOptions): Promise<PinnedTarget> {
  return resolvePinnedTarget(hostname, options);
}

/** Sanitised reason for storage in the database (no internal DNS details). */
export function describeBlockedTarget(error: unknown): string {
  if (error instanceof SsrfBlockedError) {
    return `Blocked target (${error.category}).`;
  }
  if (error instanceof TargetError) {
    return error.message;
  }
  return 'The target could not be validated.';
}
