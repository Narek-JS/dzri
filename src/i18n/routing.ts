import { defineRouting } from 'next-intl/routing';

/**
 * hy first (BRAND.md: "Armenian first, then Russian, then English"), then
 * ru, then en.
 */
export const locales = ['hy', 'ru', 'en'] as const;
export const defaultLocale = 'hy' as const;

/**
 * `localePrefix: 'as-needed'` is what gives hy the bare root with no prefix
 * and ru/en a `/ru`/`/en` prefix — 'as-needed' means only non-default
 * locales get one, which is exactly this split with no extra config.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});
