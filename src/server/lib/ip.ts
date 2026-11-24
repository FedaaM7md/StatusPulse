/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
/**
 * IP parsing and classification used by the SSRF guard.
 * Everything here is dependency-free and synchronous so it can be unit tested
 * exhaustively and reused by the check engines.
 */

export type IpFamily = 4 | 6;

export type IpCategory =
  | 'public'
  | 'private'
  | 'loopback'
  | 'link-local'
  | 'cgnat'
  | 'metadata'
  | 'unspecified'
  | 'multicast'
  | 'reserved'
  | 'documentation'
  | 'benchmark'
  | 'unique-local'
  | 'invalid';

export interface IpClassification {
  family: IpFamily;
  category: IpCategory;
  /** True only for globally routable unicast addresses. */
  isPublic: boolean;
}

const METADATA_V4 = new Set(['169.254.169.254', '169.254.170.2', '100.100.100.200', '192.0.0.192']);
const METADATA_V6 = new Set(['fd00:ec2::254', 'fd00:ec2::23']);

export function stripBrackets(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  const zone = host.indexOf('%');
  if (zone !== -1) host = host.slice(0, zone);
  return host;
}

export function parseIpv4(input: string): number[] | null {
  const host = stripBrackets(input);
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function parseIpv4ToBytes(input: string): number[] | null {
  return parseIpv4(input);
}

export function parseIpv6(input: string): number[] | null {
  let host = stripBrackets(input);
  if (!host.includes(':')) return null;

  let ipv4Tail: number[] | null = null;
  const lastColon = host.lastIndexOf(':');
  const tail = host.slice(lastColon + 1);
  if (tail.includes('.')) {
    ipv4Tail = parseIpv4ToBytes(tail);
    if (!ipv4Tail) return null;
    host = host.slice(0, lastColon + 1) + '0:0';
  }

  const halves = host.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups = segment.split(':');
    const result: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      const value = Number.parseInt(group, 16);
      result.push((value >> 8) & 0xff, value & 0xff);
    }
    return result;
  };

  let bytes: number[];
  if (halves.length === 2) {
    const head = parseGroups(halves[0]!);
    const rest = parseGroups(halves[1]!);
    if (!head || !rest) return null;
    const zeros = 16 - head.length - rest.length;
    if (zeros < 0) return null;
    bytes = [...head, ...new Array<number>(zeros).fill(0), ...rest];
  } else {
    const all = parseGroups(host);
    if (!all) return null;
    bytes = all;
  }

  if (bytes.length !== 16) return null;

  if (ipv4Tail) {
    bytes[12] = ipv4Tail[0]!;
    bytes[13] = ipv4Tail[1]!;
    bytes[14] = ipv4Tail[2]!;
    bytes[15] = ipv4Tail[3]!;
  }

  return bytes;
}

export function bytesToIpv4(bytes: number[]): string {
  return bytes.join('.');
}

function isInV4(bytes: number[], prefix: number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  const remainder = bits % 8;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (bytes[fullBytes]! & mask) === (prefix[fullBytes]! & mask);
}

function classifyV4(bytes: number[]): IpCategory {
  const [a, b, c] = bytes as [number, number, number, number];
  const text = bytesToIpv4(bytes);

  if (METADATA_V4.has(text)) return 'metadata';
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10) return 'private';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 192 && b === 168) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
  if (a === 192 && b === 0 && c === 2) return 'documentation';
  if (a === 198 && b === 51 && c === 100) return 'documentation';
  if (a === 203 && b === 0 && c === 113) return 'documentation';
  if (a === 198 && (b === 18 || b === 19)) return 'benchmark';
  if (a === 192 && b === 0 && c === 0) return 'reserved';
  if (a === 192 && b === 88 && c === 99) return 'reserved';
  if (a >= 224 && a <= 239) return 'multicast';
  if (a >= 240) return 'reserved';
  return 'public';
}

function classifyV6(bytes: number[]): IpCategory {
  const allZeroExceptLast = bytes.slice(0, 15).every((b) => b === 0);
  if (allZeroExceptLast && bytes[15] === 0) return 'unspecified';
  if (allZeroExceptLast && bytes[15] === 1) return 'loopback';

  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96
  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const compatible = bytes.slice(0, 12).every((b) => b === 0);
  if (mapped || compatible) {
    return classifyV4(bytes.slice(12, 16));
  }

  // NAT64 64:ff9b::/96 — the embedded IPv4 determines reachability.
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0)
  ) {
    return classifyV4(bytes.slice(12, 16));
  }

  const formatted = formatV6(bytes);
  if (METADATA_V6.has(formatted)) return 'metadata';

  // 6to4 2002::/16 — block because it encapsulates arbitrary IPv4.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return 'reserved';
  // Teredo 2001:0000::/32
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'reserved';
  // Documentation 2001:db8::/32 and 3fff::/20
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return 'documentation';
  if (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2]! & 0xf0) === 0x00) return 'documentation';
  // Discard 100::/64
  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.slice(2, 8).every((b) => b === 0)) return 'reserved';
  // Unique local fc00::/7
  if ((bytes[0]! & 0xfe) === 0xfc) return 'unique-local';
  // Link local fe80::/10
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return 'link-local';
  // Site local (deprecated) fec0::/10
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) return 'reserved';
  // Multicast ff00::/8
  if (bytes[0] === 0xff) return 'multicast';
  // Only 2000::/3 is global unicast.
  if ((bytes[0]! & 0xe0) !== 0x20) return 'reserved';

  return 'public';
}

export function formatV6(bytes: number[]): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i]! << 8) | bytes[i + 1]!).toString(16));
  }
  // Compress the longest run of zero groups, like a canonical IPv6 address.
  let bestStart = -1;
  let bestLen = 1;
  let currentStart = -1;
  let currentLen = 0;
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i] === '0') {
      if (currentStart === -1) currentStart = i;
      currentLen += 1;
      if (currentLen > bestLen) {
        bestStart = currentStart;
        bestLen = currentLen;
      }
    } else {
      currentStart = -1;
      currentLen = 0;
    }
  }
  if (bestStart === -1) return groups.join(':');
  const before = groups.slice(0, bestStart).join(':');
  const after = groups.slice(bestStart + bestLen).join(':');
  return `${before}::${after}`;
}

export function classifyIp(input: string): IpClassification {
  const host = stripBrackets(input);
  if (host.includes(':')) {
    const bytes = parseIpv6(host);
    if (!bytes) return { family: 6, category: 'invalid', isPublic: false };
    const category = classifyV6(bytes);
    return { family: 6, category, isPublic: category === 'public' };
  }
  const bytes = parseIpv4(host);
  if (!bytes) return { family: 4, category: 'invalid', isPublic: false };
  const category = classifyV4(bytes);
  return { family: 4, category, isPublic: category === 'public' };
}

export function isIpLiteral(host: string): boolean {
  const value = stripBrackets(host);
  return parseIpv4(value) !== null || (value.includes(':') && parseIpv6(value) !== null);
}

/**
 * Categories that may be reached when an administrator explicitly enables
 * private targets. Metadata endpoints, unspecified, multicast and reserved
 * ranges stay blocked unconditionally.
 */
const PRIVATE_CATEGORIES: ReadonlySet<IpCategory> = new Set([
  'private',
  'loopback',
  'link-local',
  'cgnat',
  'unique-local',
  'documentation',
  'benchmark',
]);

export function isAllowedCategory(category: IpCategory, allowPrivate: boolean): boolean {
  if (category === 'public') return true;
  if (!allowPrivate) return false;
  if (category === 'metadata' || category === 'unspecified' || category === 'multicast' || category === 'reserved' || category === 'invalid') {
    return false;
  }
  return PRIVATE_CATEGORIES.has(category);
}
