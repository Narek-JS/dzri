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

  it('strips a leading locale segment so the locale-aware router does not double-prefix it', () => {
    expect(resolveSafeNext('/ru/items/new')).toBe('/items/new');
    expect(resolveSafeNext('/en/items/new')).toBe('/items/new');
  });

  it('strips a bare locale segment down to the root path', () => {
    expect(resolveSafeNext('/ru')).toBe('/');
    expect(resolveSafeNext('/en')).toBe('/');
  });

  it('strips the default locale segment too, even though the app never generates one', () => {
    expect(resolveSafeNext('/hy/items/new')).toBe('/items/new');
  });

  it('does not strip a path that merely starts with a locale-like substring', () => {
    expect(resolveSafeNext('/ruined/items')).toBe('/ruined/items');
    expect(resolveSafeNext('/environment')).toBe('/environment');
  });

  it('leaves an already locale-less path untouched', () => {
    expect(resolveSafeNext('/items/new')).toBe('/items/new');
  });

  it('still rejects a protocol-relative path that starts with a locale-like segment', () => {
    expect(resolveSafeNext('//ru/evil.com')).toBeNull();
  });
});
