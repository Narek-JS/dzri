/**
 * A deleted user's `displayName` is the empty string (`deleteUser`, src/lib/
 * users/delete.ts) — not a stored placeholder, because CLAUDE.md requires
 * user-facing copy to be translated at the edge, never baked into one
 * language in the database. Empty is impossible to reach through the normal
 * 2–50 char validated signup input (`DISPLAY_NAME_MIN_LENGTH` in
 * src/lib/auth/users.ts), so it can't collide with a real name.
 *
 * A null byte was the first choice and doesn't work: Postgres rejects it in
 * a `text` column outright ("invalid byte sequence for encoding UTF8: 0x00"),
 * so that write fails at runtime rather than at review time.
 */
export const DELETED_USER_DISPLAY_NAME = '';

/**
 * Resolves a raw `displayName` from the API to what a viewer should see.
 *
 * `t` is typed as accepting only the one literal key this needs, not a
 * general `(key: string) => string` — next-intl's real `Translator` type
 * only accepts specific namespaced key literals, not arbitrary strings, so
 * a wider parameter type here would reject every real `t` at every call
 * site. A function typed to accept a wider domain (every real `t`, from
 * both `useTranslations` and `getTranslations`) is assignable wherever a
 * narrower one is expected, so this works unchanged from client components
 * and the item detail server component alike.
 */
export function resolveDisplayName(
  displayName: string,
  t: (key: 'common.deletedUser') => string,
): string {
  return displayName === DELETED_USER_DISPLAY_NAME ? t('common.deletedUser') : displayName;
}
