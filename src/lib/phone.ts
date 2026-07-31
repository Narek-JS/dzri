/**
 * Armenia only. The account *is* the phone number, so normalization has
 * to be exact and total: two spellings of the same number must never
 * produce two accounts.
 *
 * Armenian NSNs are 8 digits (e.g. 77 12 34 56) behind country code 374.
 * Accepted spellings, all of which mean the same subscriber:
 *
 *   +374 77 123456   37477123456   0037477123456
 *   077 123456       77123456
 *
 * Validation is structural — length, country code, leading digit. It
 * deliberately does not check the operator prefix against a list of
 * assigned mobile ranges: those change when a new range is allocated,
 * and a stale list silently locks out real users. An undeliverable
 * number fails at the SMS gateway instead, which is the correct place.
 */

const COUNTRY_CODE = '374';
const NSN_LENGTH = 8;

/** Longest sane input — `+374 (0) 77-12-34-56` and friends. */
export const MAX_PHONE_INPUT_LENGTH = 32;

/**
 * @returns the number in E.164 (`+37477123456`), or `null` if it is not
 * a valid Armenian number. Never throws.
 */
export function normalizeArmenianPhone(input: string): string | null {
  if (input.length > MAX_PHONE_INPUT_LENGTH) return null;

  // Separators people actually type: spaces, dashes, dots, parentheses.
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = (hasPlus ? trimmed.slice(1) : trimmed).replace(/[\s().-]/g, '');

  if (!/^\d+$/.test(digits)) return null;

  // 00 is the international prefix; +374… and 00374… are the same number.
  const withoutIddPrefix = !hasPlus && digits.startsWith('00') ? digits.slice(2) : digits;

  // Branch on exact length so nothing is ambiguous. An 8-digit national
  // number that happens to start with "374" is not mistaken for a
  // country code, and a foreign number is rejected rather than mangled.
  let nsn: string;
  if (
    withoutIddPrefix.length === COUNTRY_CODE.length + NSN_LENGTH &&
    withoutIddPrefix.startsWith(COUNTRY_CODE)
  ) {
    nsn = withoutIddPrefix.slice(COUNTRY_CODE.length);
  } else if (hasPlus) {
    // An explicit + means an explicit country code, and it was not 374.
    return null;
  } else if (withoutIddPrefix.length === NSN_LENGTH + 1 && withoutIddPrefix.startsWith('0')) {
    nsn = withoutIddPrefix.slice(1); // national trunk prefix
  } else if (withoutIddPrefix.length === NSN_LENGTH) {
    nsn = withoutIddPrefix;
  } else {
    return null;
  }

  // No NSN begins with 0; that spelling is a mistyped trunk prefix.
  if (!/^[1-9]\d{7}$/.test(nsn)) return null;

  return `+${COUNTRY_CODE}${nsn}`;
}
