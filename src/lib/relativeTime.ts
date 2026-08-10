/**
 * "N days ago"-style formatting that does NOT go through
 * `Intl.RelativeTimeFormat` (via next-intl's `relativeTime`/`useFormatter`).
 *
 * Root cause this works around: `next-intl`'s client-side `useFormatter()`
 * and server-side `getFormatter()` both resolve the same context locale
 * (verified — `useLocale()` and `useTranslations()` agree with the server on
 * every render), but `Intl.RelativeTimeFormat('hy')` in Chromium silently
 * falls back to `en-US` — `Intl.RelativeTimeFormat.supportedLocalesOf(['hy'])`
 * returns `[]` in the browser this app ships to, even though Node (the
 * server) has full ICU data and formats `hy` correctly. So a server-rendered
 * card reads "6 օր առաջ" and the same card, once hydrated, silently
 * re-renders as "6 days ago" — with a hydration warning as a side effect
 * where a server render exists to diff against, and no warning at all (just
 * silently wrong output) anywhere client-only, e.g. every card appended by
 * infinite scroll. `Intl.DateTimeFormat('hy')` and `Intl.NumberFormat('hy')`
 * have the identical gap; `Intl.PluralRules('hy')` does not — Armenian
 * plural-category data is bundled, the larger per-locale CLDR tables
 * (relative-time phrases, date patterns, number symbols) are not.
 *
 * The fix is therefore to stop asking the browser's `Intl.RelativeTimeFormat`
 * for Armenian phrases at all, on either side, and instead render the phrase
 * from this app's own message catalog (`common.relativeTime.*` in
 * messages/{hy,ru,en}.json) via `t()` — which resolves through
 * `Intl.PluralRules`, the one piece of this puzzle that *is* present
 * everywhere. Both the server and the client end up running the exact same
 * bucketing logic and reading the exact same translated string, so there is
 * nothing left for the two to disagree about.
 */

export type RelativeTimeUnit = 'now' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * The message-catalog key (under `common.relativeTime`) and ICU plural
 * argument for a given age. `values` is absent for `now`, which has no
 * count to pluralize on.
 */
export type RelativeTimeMessage = {
  key: `common.relativeTime.${RelativeTimeUnit}`;
  values?: { count: number };
};

/**
 * Buckets `date` against a reference instant `now` into a coarse unit and a
 * whole count, then names the catalog key to render it. Every caller in this
 * app only ever formats a past `createdAt`, so this clamps a `date` after
 * `now` (clock skew between the app server and the database, at most) to
 * "now" rather than producing a negative count — there is no future-tense
 * phrasing to reach for.
 */
export function relativeTimeMessage(date: Date, now: Date): RelativeTimeMessage {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);

  if (seconds < MINUTE) return { key: 'common.relativeTime.now' };
  if (seconds < HOUR) {
    return { key: 'common.relativeTime.minute', values: { count: Math.floor(seconds / MINUTE) } };
  }
  if (seconds < DAY) {
    return { key: 'common.relativeTime.hour', values: { count: Math.floor(seconds / HOUR) } };
  }
  if (seconds < WEEK) {
    return { key: 'common.relativeTime.day', values: { count: Math.floor(seconds / DAY) } };
  }
  if (seconds < MONTH) {
    return { key: 'common.relativeTime.week', values: { count: Math.floor(seconds / WEEK) } };
  }
  if (seconds < YEAR) {
    return { key: 'common.relativeTime.month', values: { count: Math.floor(seconds / MONTH) } };
  }
  return { key: 'common.relativeTime.year', values: { count: Math.floor(seconds / YEAR) } };
}
