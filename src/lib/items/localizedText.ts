/**
 * Per-locale title/description text, straight off `items.title_{hy,ru,en}`
 * or `description_{hy,ru,en}`.
 */
export type LocalizedText = { hy: string | null; ru: string | null; en: string | null };

function pick(text: LocalizedText, locale: string): string | null {
  if (locale === 'ru') return text.ru;
  if (locale === 'en') return text.en;
  return text.hy;
}

/**
 * The text to show a viewer reading in `locale`, falling back to
 * `sourceLocale`'s column when `locale`'s hasn't been translated yet.
 *
 * For an `active` item this fallback never triggers —
 * `item_translations_complete_when_active` (src/db/schema/items.ts)
 * guarantees every locale's title is filled, and description is
 * either filled in all three or none. It exists for the private views an
 * item can be read in before that: the owner reading their own
 * `pending_review` or `rejected` listing, where only `sourceLocale`'s column
 * is guaranteed to hold anything. `sourceLocale`'s own column is always
 * written at creation, so the fallback itself never returns null unless
 * `text` genuinely has nothing in it (used for `description`, which is
 * optional).
 */
export function resolveLocalizedText(
  text: LocalizedText,
  sourceLocale: string,
  locale: string,
): string | null {
  return pick(text, locale) ?? pick(text, sourceLocale);
}
