import { hasLocale } from 'next-intl';
import type { Locale } from 'next-intl';

import { routing } from './routing';

/** What Next hands every page and layout under `app/[locale]/`. */
export type LocaleParams = { locale: string };

/**
 * Narrows the `[locale]` segment to `Locale`. Safe to call unconditionally
 * in any page: `[locale]/layout.tsx` already renders `notFound()` for a
 * segment outside `routing.locales` before a nested page runs, so this
 * only re-confirms what the layout already guaranteed. The fallback to
 * `defaultLocale` only matters if that guard is ever removed — it keeps
 * this function honest on its own rather than trusting the caller.
 */
export function resolveLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}
