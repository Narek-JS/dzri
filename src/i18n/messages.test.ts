import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hy from '../../messages/hy.json';
import ru from '../../messages/ru.json';

/** All keys in a nested message object, as dotted paths — order-independent. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogs', () => {
  it('ru and en have exactly the same keys as hy, the reference locale', () => {
    const reference = keyPaths(hy).sort();

    expect(keyPaths(ru).sort()).toEqual(reference);
    expect(keyPaths(en).sort()).toEqual(reference);
  });

  // DECISIONS/CLAUDE.md: Russian plurals are real CLDR categories (one /
  // few / many / other), not string concatenation. one = 1, 21, 31, …; few
  // = 2-4, 22-24, …; many = 0, 5-20, 25-30, ….
  it('resolves Russian pendingClaimCount to the right CLDR plural category', () => {
    const t = createTranslator({ locale: 'ru', messages: ru });

    expect(t('common.pendingClaimCount', { count: 1 })).toBe('1 заявка в ожидании');
    expect(t('common.pendingClaimCount', { count: 2 })).toBe('2 заявки в ожидании');
    expect(t('common.pendingClaimCount', { count: 4 })).toBe('4 заявки в ожидании');
    expect(t('common.pendingClaimCount', { count: 5 })).toBe('5 заявок в ожидании');
    expect(t('common.pendingClaimCount', { count: 0 })).toBe('0 заявок в ожидании');
    expect(t('common.pendingClaimCount', { count: 11 })).toBe('11 заявок в ожидании');
    expect(t('common.pendingClaimCount', { count: 21 })).toBe('21 заявка в ожидании');
    expect(t('common.pendingClaimCount', { count: 22 })).toBe('22 заявки в ожидании');
  });

  it('resolves English and Armenian pendingClaimCount for singular and plural', () => {
    const tEn = createTranslator({ locale: 'en', messages: en });
    expect(tEn('common.pendingClaimCount', { count: 1 })).toBe('1 pending claim');
    expect(tEn('common.pendingClaimCount', { count: 5 })).toBe('5 pending claims');

    const tHy = createTranslator({ locale: 'hy', messages: hy });
    expect(tHy('common.pendingClaimCount', { count: 1 })).toBe('1 սպասող հայտ');
    expect(tHy('common.pendingClaimCount', { count: 5 })).toBe('5 սպասող հայտ');
  });
});
