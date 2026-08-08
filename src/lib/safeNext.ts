import { locales } from '@/i18n/routing';

/**
 * Validates a `?next=` redirect target for the login page. Only a path
 * that starts with exactly one `/` is accepted — `//evil.com` is
 * schema-relative and browsers resolve it as a protocol-relative URL to a
 * different host, and anything with a scheme (`https://evil.com`) is
 * rejected outright. Everything else falls back to the caller's default
 * (the feed) rather than leaving the redirect target unset.
 *
 * The result is always a locale-less path. `router.push()` on the login
 * page (src/i18n/navigation.ts's locale-aware router) prefixes whatever it
 * is given with the current locale itself, so a `next` value that already
 * carries one — `/ru/items/new` — would double up into `/ru/ru/items/new`.
 * Stripping the prefix here (rather than rejecting the value outright) keeps
 * the redirect working for a link that happened to be copied from a
 * locale-prefixed URL, while every caller this app controls (Part 4's
 * create page) generates a locale-less `next` in the first place.
 */
export function resolveSafeNext(raw: string | null): string | null {
  if (raw === null) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;

  return stripLocalePrefix(raw);
}

function stripLocalePrefix(path: string): string {
  for (const locale of locales) {
    const prefix = `/${locale}`;

    if (path === prefix) return '/';
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  }

  return path;
}
