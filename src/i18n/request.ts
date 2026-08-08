import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/**
 * Resolves the locale and its message catalog for the current request.
 * Called once per RSC render (wired in via the plugin in next.config.ts),
 * not per component — `getTranslations`/`useTranslations` read from this.
 *
 * `requestLocale` is the `[locale]` segment the middleware matched. It can
 * be missing or invalid (a request outside the `[locale]` tree, or a stale
 * value); either way this falls back to `defaultLocale` rather than letting
 * an unrecognized locale reach `next-intl` and throw.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
