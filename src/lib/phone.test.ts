import { describe, expect, it } from 'vitest';

import { normalizeArmenianPhone } from './phone';

/**
 * The phone number *is* the account, so two spellings of one number must
 * never produce two accounts — and a foreign number must never be
 * silently reshaped into an Armenian one.
 */
describe('normalizeArmenianPhone', () => {
  it('collapses every accepted spelling of one number to the same E.164', () => {
    const spellings = [
      '+37477123456',
      '37477123456',
      '0037477123456',
      '077123456',
      '77123456',
      '+374 77 12 34 56',
      '+374 (77) 12-34-56',
      '  077 123.456  ',
      '0 77 12 34 56',
    ];

    for (const spelling of spellings) {
      expect(normalizeArmenianPhone(spelling), spelling).toBe('+37477123456');
    }
  });

  it('accepts any structurally valid national number, not just known prefixes', () => {
    // Operator ranges get reallocated; a prefix allowlist would lock real
    // users out of accounts they already have.
    expect(normalizeArmenianPhone('+37410123456')).toBe('+37410123456');
    expect(normalizeArmenianPhone('+37433987654')).toBe('+37433987654');
    expect(normalizeArmenianPhone('+37491000001')).toBe('+37491000001');
  });

  it('returns null for foreign numbers', () => {
    expect(normalizeArmenianPhone('+15551234567')).toBeNull();
    expect(normalizeArmenianPhone('+7 495 1234567')).toBeNull();
    expect(normalizeArmenianPhone('+44 20 7946 0958')).toBeNull();
    expect(normalizeArmenianPhone('+995322123456')).toBeNull();
  });

  it('returns null for malformed input', () => {
    const malformed = [
      '', // empty
      '+', // nothing but a plus
      '7712345', // one digit short
      '771234567', // one digit too long
      '+374771234567', // too long behind a valid country code
      '037412345678', // trunk prefix and too long
      '00123456', // international prefix, wrong country
      '+37477abc456', // letters
      '077-123-45', // a digit short once separators are stripped
      ' '.repeat(40), // whitespace past the length cap
      '0'.repeat(40),
    ];

    for (const input of malformed) {
      expect(normalizeArmenianPhone(input), JSON.stringify(input)).toBeNull();
    }
  });

  it('rejects a national number starting with 0', () => {
    // That is a mistyped trunk prefix, not a subscriber number.
    expect(normalizeArmenianPhone('+37407123456')).toBeNull();
    expect(normalizeArmenianPhone('07123456')).toBeNull();
  });

  it('is idempotent — normalizing its own output changes nothing', () => {
    const once = normalizeArmenianPhone('077 12 34 56');
    expect(once).toBe('+37477123456');
    expect(normalizeArmenianPhone(once ?? '')).toBe(once);
  });
});
