import type { routing } from './routing';
import type messages from '../../messages/hy.json';

/**
 * Gives `useTranslations()`/`getTranslations()` typed keys and `Link` etc.
 * a typed `locale` prop, instead of `string`. hy is the reference shape —
 * ru.json and en.json are asserted to match it structurally by
 * `src/i18n/messages.test.ts`, since TypeScript alone can't check that a
 * sibling JSON file has the same keys.
 */
declare module 'use-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
