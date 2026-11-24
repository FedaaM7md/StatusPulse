import { describe, expect, it } from 'vitest';
import {
  classifyIp,
  isAllowedCategory,
  isIpLiteral,
  parseIpv4,
  parseIpv6,
  stripBrackets,
} from '../src/server/lib/ip';

describe('IP parsing', () => {
  it('parses valid IPv4 addresses', () => {
    expect(parseIpv4('192.168.1.20')).toEqual([192, 168, 1, 20]);
    expect(parseIpv4('0.0.0.0')).toEqual([0, 0, 0, 0]);
  });

  it('rejects malformed IPv4 addresses', () => {
    expect(parseIpv4('256.1.1.1')).toBeNull();
    expect(parseIpv4('1.2.3')).toBeNull();
    expect(parseIpv4('1.2.3.4.5')).toBeNull();
    expect(parseIpv4('abc')).toBeNull();
  });

  it('parses IPv6 forms including compression and mapped IPv4', () => {
    expect(parseIpv6('::1')).toHaveLength(16);
    expect(parseIpv6('2001:db8::1')).toHaveLength(16);
    expect(parseIpv6('::ffff:192.168.1.1')).toHaveLength(16);
    expect(parseIpv6('fe80::1%eth0')).toHaveLength(16);
    expect(parseIpv6('2001:db8::1::2')).toBeNull();
    expect(parseIpv6('gggg::1')).toBeNull();
  });

  it('strips brackets, zones and trailing dots', () => {
    expect(stripBrackets('[::1]')).toBe('::1');
    expect(stripBrackets('example.com.')).toBe('example.com');
    expect(stripBrackets('fe80::1%eth0')).toBe('fe80::1');
  });
});

describe('IP classification (SSRF ranges)', () => {
  const cases: Array<[string, string]> = [
    ['8.8.8.8', 'public'],
    ['1.1.1.1', 'public'],
    ['93.184.216.34', 'public'],
    ['2001:4860:4860::8888', 'public'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.254', 'private'],
    ['172.32.0.1', 'public'],
    ['192.168.0.1', 'private'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['::1', 'loopback'],
    ['169.254.10.10', 'link-local'],
    ['fe80::1', 'link-local'],
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.254', 'cgnat'],
    ['100.128.0.1', 'public'],
    ['169.254.169.254', 'metadata'],
    ['169.254.170.2', 'metadata'],
    ['100.100.100.200', 'metadata'],
    ['fd00:ec2::254', 'metadata'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['ff02::1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
    ['192.0.2.10', 'documentation'],
    ['198.51.100.10', 'documentation'],
    ['203.0.113.10', 'documentation'],
    ['2001:db8::1', 'documentation'],
    ['198.18.0.1', 'benchmark'],
    ['198.19.255.255', 'benchmark'],
    ['fd12:3456:789a::1', 'unique-local'],
    ['::ffff:192.168.1.5', 'private'],
    ['::ffff:8.8.8.8', 'public'],
    ['64:ff9b::a00:1', 'private'],
    ['2002:c0a8:0101::1', 'reserved'],
    ['2001:0000:4136:e378::1', 'reserved'],
    ['not-an-ip', 'invalid'],
  ];

  for (const [ip, category] of cases) {
    it(`classifies ${ip} as ${category}`, () => {
      const result = classifyIp(ip);
      expect(result.category).toBe(category);
      expect(result.isPublic).toBe(category === 'public');
    });
  }
});

describe('allow-private policy', () => {
  it('blocks all non-public categories by default', () => {
    expect(isAllowedCategory('public', false)).toBe(true);
    for (const category of ['private', 'loopback', 'link-local', 'cgnat', 'metadata', 'unique-local'] as const) {
      expect(isAllowedCategory(category, false)).toBe(false);
    }
  });

  it('allows private ranges only when explicitly enabled', () => {
    for (const category of ['private', 'loopback', 'link-local', 'cgnat', 'unique-local', 'benchmark'] as const) {
      expect(isAllowedCategory(category, true)).toBe(true);
    }
  });

  it('never allows metadata, unspecified, multicast or reserved addresses', () => {
    for (const category of ['metadata', 'unspecified', 'multicast', 'reserved', 'invalid'] as const) {
      expect(isAllowedCategory(category, true)).toBe(false);
    }
  });

  it('recognises IPv4 and IPv6 literals', () => {
    expect(isIpLiteral('8.8.8.8')).toBe(true);
    expect(isIpLiteral('[2001:db8::1]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});
