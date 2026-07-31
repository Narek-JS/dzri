/**
 * SMS bodies. Armenian only for now — the default locale, and the one
 * every recipient reads. There is no locale on an OTP request (the
 * caller has no session yet), so this cannot key off a user preference
 * until the client starts sending `Accept-Language`.
 *
 * When i18n lands these move into the message catalogue unchanged.
 */

/** Keep it inside one GSM-7 segment (160 chars) — two segments cost twice. */
export function otpMessage(code: string, ttlMinutes: number): string {
  return `dzri: ձեր հաստատման կոդը՝ ${code}։ Գործում է ${ttlMinutes} րոպե։ Կոդը ոչ ոքի մի հաղորդեք։`;
}
