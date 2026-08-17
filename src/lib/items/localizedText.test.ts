import { describe, expect, it } from 'vitest';

import { resolveLocalizedText } from './localizedText';

describe('resolveLocalizedText', () => {
  it('returns the requested locale when it is filled', () => {
    const text = { hy: 'Աթոռ', ru: 'Стул', en: 'Chair' };
    expect(resolveLocalizedText(text, 'hy', 'en')).toBe('Chair');
  });

  it("falls back to the source locale when the requested one hasn't been translated", () => {
    const text = { hy: 'Աթոռ', ru: null, en: null };
    expect(resolveLocalizedText(text, 'hy', 'en')).toBe('Աթոռ');
  });

  it('returns null when neither the requested nor the source locale has text', () => {
    const text = { hy: null, ru: null, en: null };
    expect(resolveLocalizedText(text, 'hy', 'en')).toBeNull();
  });

  it('treats an unrecognized locale the same as hy, matching the districts/categories helper', () => {
    const text = { hy: 'Աթոռ', ru: 'Стул', en: 'Chair' };
    expect(resolveLocalizedText(text, 'hy', 'xx')).toBe('Աթոռ');
  });
});
