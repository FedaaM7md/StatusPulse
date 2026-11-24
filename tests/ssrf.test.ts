import { describe, expect, it, vi } from 'vitest';
import { createPinnedLookup } from '../src/server/lib/pinned-lookup';
import {
  describeBlockedTarget,
  resolvePinnedTarget,
  SsrfBlockedError,
  TargetError,
  validateTargetUrl,
  type HostResolver,
} from '../src/server/lib/ssrf';

function resolverReturning(entries: Array<{ address: string; family: 4 | 6 }>): HostResolver {
  return vi.fn(async () => entries);
}

describe('SSRF guard — resolution and pinning', () => {
  it('pins the first public address', async () => {
    const resolver = resolverReturning([{ address: '93.184.216.34', family: 4 }]);
    const target = await resolvePinnedTarget('example.com', { allowPrivate: false, resolver });
    expect(target).toEqual({ hostname: 'example.com', address: '93.184.216.34', family: 4 });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('skips private records when a public one exists (DNS rebinding defence)', async () => {
    const resolver = resolverReturning([
      { address: '10.0.0.5', family: 4 },
      { address: '169.254.169.254', family: 4 },
      { address: '93.184.216.34', family: 4 },
    ]);
    const target = await resolvePinnedTarget('mixed.example', { allowPrivate: false, resolver });
    expect(target.address).toBe('93.184.216.34');
  });

  it('blocks hostnames that only resolve to private addresses', async () => {
    const resolver = resolverReturning([{ address: '10.0.0.5', family: 4 }]);
    await expect(resolvePinnedTarget('internal.example', { allowPrivate: false, resolver })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('blocks link-local metadata addresses even when private targets are allowed', async () => {
    const resolver = resolverReturning([{ address: '169.254.169.254', family: 4 }]);
    await expect(resolvePinnedTarget('metadata.example', { allowPrivate: true, resolver })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('allows RFC1918 hosts when private targets are enabled', async () => {
    const resolver = resolverReturning([{ address: '10.1.2.3', family: 4 }]);
    const target = await resolvePinnedTarget('internal.example', { allowPrivate: true, resolver });
    expect(target.address).toBe('10.1.2.3');
  });

  it('validates literal IP hosts without DNS', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]);
    await expect(resolvePinnedTarget('127.0.0.1', { allowPrivate: false, resolver })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    const allowed = await resolvePinnedTarget('8.8.8.8', { allowPrivate: false, resolver });
    expect(allowed.address).toBe('8.8.8.8');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('handles bracketed IPv6 literals', async () => {
    await expect(resolvePinnedTarget('[::1]', { allowPrivate: false })).rejects.toBeInstanceOf(SsrfBlockedError);
    const allowed = await resolvePinnedTarget('[2001:4860:4860::8888]', { allowPrivate: false });
    expect(allowed.family).toBe(6);
    expect(allowed.address).toBe('2001:4860:4860::8888');
  });

  it('reports DNS failures and empty answers', async () => {
    const failing: HostResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(resolvePinnedTarget('nope.example', { allowPrivate: false, resolver: failing })).rejects.toMatchObject({
      code: 'DNS_FAILED',
    });
    await expect(
      resolvePinnedTarget('empty.example', { allowPrivate: false, resolver: async () => [] }),
    ).rejects.toBeInstanceOf(TargetError);
  });

  it('rejects invalid hostnames', async () => {
    await expect(resolvePinnedTarget('bad host!', { allowPrivate: false })).rejects.toBeInstanceOf(TargetError);
  });
});

describe('SSRF guard — URL validation', () => {
  it('accepts http and https URLs', async () => {
    const resolver = resolverReturning([{ address: '93.184.216.34', family: 4 }]);
    const result = await validateTargetUrl('https://example.com/health?x=1', { allowPrivate: false, resolver });
    expect(result.url.toString()).toBe('https://example.com/health?x=1');
    expect(result.address).toBe('93.184.216.34');
  });

  it('rejects unsupported protocols', async () => {
    for (const url of ['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/']) {
      await expect(validateTargetUrl(url, { allowPrivate: false })).rejects.toMatchObject({
        code: 'INVALID_PROTOCOL',
      });
    }
  });

  it('rejects embedded credentials', async () => {
    await expect(validateTargetUrl('https://user:pass@example.com/', { allowPrivate: false })).rejects.toMatchObject({
      code: 'URL_CREDENTIALS',
    });
  });

  it('rejects malformed URLs', async () => {
    await expect(validateTargetUrl('not a url', { allowPrivate: false })).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
  });

  it('produces a sanitised error message', () => {
    const error = new SsrfBlockedError('x', 'metadata', 'Blocked');
    expect(describeBlockedTarget(error)).toBe('Blocked target (metadata).');
  });
});

describe('pinned lookup adapter', () => {
  it('supports the classic single-address callback', () => {
    const lookup = createPinnedLookup('93.184.216.34', 4);
    const callback = vi.fn();
    lookup('example.com', { all: false } as never, callback as never);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('supports Node autoSelectFamily (all: true) array callbacks', () => {
    const lookup = createPinnedLookup('2001:4860:4860::8888', 6);
    const callback = vi.fn();
    lookup('example.com', { all: true } as never, callback as never);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '2001:4860:4860::8888', family: 6 }]);
  });
});
