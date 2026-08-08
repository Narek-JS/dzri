import { describe, expect, it } from 'vitest';

import { resolveSafeNext } from './safeNext';

describe('resolveSafeNext', () => {
  it('accepts a single-leading-slash path', () => {
    expect(resolveSafeNext('/items/abc-123')).toBe('/items/abc-123');
  });

  it('rejects a protocol-relative path (open redirect via //)', () => {
    expect(resolveSafeNext('//evil.com')).toBeNull();
  });

  it('rejects an absolute URL with a scheme', () => {
    expect(resolveSafeNext('https://evil.com')).toBeNull();
    expect(resolveSafeNext('http://evil.com/x')).toBeNull();
  });

  it('rejects a value with no leading slash', () => {
    expect(resolveSafeNext('evil.com')).toBeNull();
  });

  it('rejects null', () => {
    expect(resolveSafeNext(null)).toBeNull();
  });
});
