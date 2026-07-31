import { describe, expect, it } from 'vitest';

import { hashOtpCode, otpHashesMatch } from './otp';

const PHONE = '+37477123456';
const OTHER_PHONE = '+37477123457';
const CODE = '123456';

describe('hashOtpCode', () => {
  it('is deterministic for the same phone and code', () => {
    expect(hashOtpCode(PHONE, CODE)).toBe(hashOtpCode(PHONE, CODE));
  });

  it('is bound to the phone — the same code hashes differently per number', () => {
    // Without this, a hash captured for one number could be replayed
    // against another, and one leaked row would unlock a second account.
    expect(hashOtpCode(PHONE, CODE)).not.toBe(hashOtpCode(OTHER_PHONE, CODE));
  });

  it('produces a different hash for a different code on the same phone', () => {
    expect(hashOtpCode(PHONE, CODE)).not.toBe(hashOtpCode(PHONE, '123457'));
  });

  it('never returns the code itself', () => {
    const hash = hashOtpCode(PHONE, CODE);

    expect(hash).not.toContain(CODE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('otpHashesMatch', () => {
  it('accepts two hashes of the same phone and code', () => {
    expect(otpHashesMatch(hashOtpCode(PHONE, CODE), hashOtpCode(PHONE, CODE))).toBe(true);
  });

  it('rejects a mismatch', () => {
    expect(otpHashesMatch(hashOtpCode(PHONE, CODE), hashOtpCode(PHONE, '000000'))).toBe(false);
    expect(otpHashesMatch(hashOtpCode(PHONE, CODE), hashOtpCode(OTHER_PHONE, CODE))).toBe(false);
  });

  it('rejects rather than throwing on a length mismatch', () => {
    // timingSafeEqual throws on unequal lengths; a malformed stored row
    // must not become a 500.
    expect(otpHashesMatch(hashOtpCode(PHONE, CODE), 'short')).toBe(false);
    expect(otpHashesMatch('', hashOtpCode(PHONE, CODE))).toBe(false);
  });
});
