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

  // src/lib/relativeTime.ts exists because `Intl.RelativeTimeFormat('hy')`
  // silently falls back to `en-US` in the browser this app ships to — these
  // keys are what stand in for it, so unlike `Intl.RelativeTimeFormat`
  // itself, `Intl.PluralRules` (which is what ICU MessageFormat's plural
  // syntax actually resolves through) has real `hy` and `ru` data
  // everywhere, confirmed against the same CLDR categories as
  // `pendingClaimCount` above.
  it('resolves Russian relativeTime units to the right CLDR plural category', () => {
    const t = createTranslator({ locale: 'ru', messages: ru });

    expect(t('common.relativeTime.hour', { count: 1 })).toBe('1 час назад');
    expect(t('common.relativeTime.hour', { count: 2 })).toBe('2 часа назад');
    expect(t('common.relativeTime.hour', { count: 5 })).toBe('5 часов назад');
    expect(t('common.relativeTime.hour', { count: 21 })).toBe('21 час назад');

    expect(t('common.relativeTime.day', { count: 1 })).toBe('1 день назад');
    expect(t('common.relativeTime.day', { count: 3 })).toBe('3 дня назад');
    expect(t('common.relativeTime.day', { count: 11 })).toBe('11 дней назад');
  });

  it('resolves English and Armenian relativeTime units for singular and plural', () => {
    const tEn = createTranslator({ locale: 'en', messages: en });
    expect(tEn('common.relativeTime.now')).toBe('just now');
    expect(tEn('common.relativeTime.day', { count: 1 })).toBe('1 day ago');
    expect(tEn('common.relativeTime.day', { count: 6 })).toBe('6 days ago');

    const tHy = createTranslator({ locale: 'hy', messages: hy });
    expect(tHy('common.relativeTime.now')).toBe('հենց նոր');
    expect(tHy('common.relativeTime.day', { count: 1 })).toBe('1 օր առաջ');
    expect(tHy('common.relativeTime.day', { count: 6 })).toBe('6 օր առաջ');
  });
});
