import { afterEach, describe, expect, it } from 'vitest';

import { isAuthorizedCronRequest } from './auth';

/**
 * The sweep's door. The failure that matters is falling open — an unset
 * secret, or a near-miss token being accepted — so every case here is about
 * refusing. The 404 that a refusal becomes is the route's job, tested over
 * HTTP in the integration suite.
 */
describe('isAuthorizedCronRequest', () => {
  const original = process.env.CRON_SECRET;

  const SECRET = 'a-long-enough-cron-secret-for-a-test';

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  function requestWith(authorization?: string): Request {
    return new Request('http://localhost/api/cron/sweep', {
      headers: authorization === undefined ? {} : { authorization },
    });
  }

  it('accepts the exact bearer token', () => {
    process.env.CRON_SECRET = SECRET;

    expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}`))).toBe(true);
  });

  it('accepts the scheme case-insensitively, as RFC 7235 requires', () => {
    process.env.CRON_SECRET = SECRET;

    for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
      expect(isAuthorizedCronRequest(requestWith(`${scheme} ${SECRET}`)), scheme).toBe(true);
    }
  });

  it('refuses every caller when CRON_SECRET is unset or empty', () => {
    // An open sweep endpoint is a stranger's button for expiring other
    // people's listings. Missing config must fail shut, not open.
    for (const value of [undefined, '']) {
      if (value === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = value;

      expect(isAuthorizedCronRequest(requestWith('Bearer ')), String(value)).toBe(false);
      expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}`)), String(value)).toBe(false);
      expect(isAuthorizedCronRequest(requestWith()), String(value)).toBe(false);
    }
  });

  it('refuses a missing, malformed or differently-schemed header', () => {
    process.env.CRON_SECRET = SECRET;

    const headers = [
      undefined,
      '',
      SECRET, // the raw secret with no scheme
      `Basic ${SECRET}`,
      `Token ${SECRET}`,
      `Bearer${SECRET}`, // no separating space
    ];

    for (const header of headers) {
      expect(isAuthorizedCronRequest(requestWith(header)), String(header)).toBe(false);
    }
  });

  it('refuses a near miss', () => {
    process.env.CRON_SECRET = SECRET;

    const nearMisses = [
      SECRET.slice(0, -1), // truncated
      `${SECRET}x`, // extended
      // A leading space survives: HTTP trims a field value's outer whitespace,
      // not the space after the scheme, so this arrives as ' <secret>'.
      ` ${SECRET}`,
      SECRET.toUpperCase(),
      SECRET.replace('cron', 'cr0n'),
      '',
    ];

    for (const token of nearMisses) {
      expect(isAuthorizedCronRequest(requestWith(`Bearer ${token}`)), token).toBe(false);
    }
  });
});
