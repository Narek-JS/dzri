import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Real routes, real Neon, no mocks (CLAUDE.md).
 *
 * This is not a full suite. It covers the things that must never
 * regress: that a phone number cannot escape through the auth endpoints,
 * and that a code cannot be replayed or brute-forced.
 *
 * Codes are seeded straight into `otp_codes` with a known plaintext
 * rather than requested through `/api/auth/otp/request`. That keeps the
 * suite off the 30-second per-phone cooldown and out of the SMS
 * provider — the limiters are deliberately not tested here, because
 * asserting on them means sleeping.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };
type MeSuccess = { user: { id: string; displayName: string } };
type ApiErrorBody = { error: { code: string; message: string } };

type ApiResponse = {
  status: number;
  text: string;
  cookies: string[];
};

function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

// `@/db` throws at import time when DATABASE_URL is absent, so these are
// imported lazily — otherwise the file could not even be collected on a
// machine without secrets, and `skipIf` would never get a chance to run.
let db: (typeof import('@/db'))['db'];
let users: (typeof import('@/db/schema'))['users'];
let otpCodes: (typeof import('@/db/schema'))['otpCodes'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];

describe.skipIf(!hasDatabase)('auth API', () => {
  /** Every phone this file touches, so cleanup never has to guess. */
  const createdPhones = new Set<string>();

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes } = await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
  });

  // Runs even when the test that created the rows failed part-way, so a
  // red run does not leave junk behind.
  afterEach(async () => {
    if (createdPhones.size === 0) return;

    const phones = [...createdPhones];
    createdPhones.clear();

    await db.delete(otpCodes).where(inArray(otpCodes.phone, phones));
    await db.delete(users).where(inArray(users.phone, phones));
  });

  function testPhone(): string {
    const nsn = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    const phone = `+374${nsn}`;

    createdPhones.add(phone);
    return phone;
  }

  async function seedCode(phone: string, code: string, attempts = 0): Promise<void> {
    createdPhones.add(phone);

    await db.insert(otpCodes).values({
      phone,
      codeHash: hashOtpCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts,
    });
  }

  async function api(path: string, init?: RequestInit & { cookie?: string }): Promise<ApiResponse> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        // Each call presents as a different client. These are logically
        // separate users, and sharing one per-IP budget would make the
        // suite order-dependent.
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`,
        ...(init?.cookie ? { cookie: init.cookie } : {}),
      },
    });

    return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie() };
  }

  function post(path: string, body: unknown, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'POST', body: JSON.stringify(body), cookie });
  }

  /**
   * The assertion this whole file exists for. Checks both the field name
   * and the value, so neither a renamed key nor a raw number gets through.
   */
  function expectNoPhone(response: ApiResponse, phone: string): void {
    expect(response.text).not.toMatch(/phone/i);
    expect(response.text).not.toContain(phone); // +37477123456
    expect(response.text).not.toContain(phone.slice(1)); // 37477123456
    expect(response.text).not.toContain(phone.slice(4)); // 77123456
  }

  async function signIn(
    phone: string,
    displayName = 'Թեստ',
  ): Promise<{
    cookie: string;
    userId: string;
    response: ApiResponse;
  }> {
    const code = '123456';
    await seedCode(phone, code);

    const response = await post('/api/auth/otp/verify', { phone, code, displayName });
    expect(response.status, response.text).toBe(200);

    const cookie = response.cookies
      .find((value) => value.startsWith('dzri_session='))
      ?.split(';')[0];
    expect(cookie, 'verify must set a session cookie').toBeDefined();

    return {
      cookie: cookie ?? '',
      userId: parse<VerifySuccess>(response.text).user.id,
      response,
    };
  }

  describe('GET /api/auth/me', () => {
    it('returns no phone when unauthenticated', async () => {
      const phone = testPhone();
      const response = await api('/api/auth/me');

      expect(response.status).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
      expectNoPhone(response, phone);
    });

    it('returns no phone when authenticated as the owner of the number', async () => {
      const phone = testPhone();
      const { cookie, userId } = await signIn(phone);

      const response = await api('/api/auth/me', { cookie });

      expect(response.status, response.text).toBe(200);
      expect(parse<MeSuccess>(response.text).user.id).toBe(userId);
      expectNoPhone(response, phone);
    });

    it('returns no phone for a tampered cookie', async () => {
      const phone = testPhone();
      await signIn(phone);

      const response = await api('/api/auth/me', {
        cookie: 'dzri_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.not-a-signature',
      });

      expect(response.status).toBe(401);
      expectNoPhone(response, phone);
    });
  });

  describe('POST /api/auth/otp/verify', () => {
    it('returns no phone in a successful response', async () => {
      const phone = testPhone();
      const { response } = await signIn(phone);

      expect(parse<VerifySuccess>(response.text).isNewUser).toBe(false);
      expectNoPhone(response, phone);
    });

    it('refuses to replay a consumed code', async () => {
      const phone = testPhone();
      const code = '123456';
      await seedCode(phone, code);

      const first = await post('/api/auth/otp/verify', { phone, code, displayName: 'Թեստ' });
      expect(first.status, first.text).toBe(200);

      const replay = await post('/api/auth/otp/verify', { phone, code, displayName: 'Թեստ' });

      expect(replay.status).toBe(400);
      expect(parse<ApiErrorBody>(replay.text).error.code).toBe('INVALID_CODE');
    });

    it('kills a code after five wrong attempts', async () => {
      const phone = testPhone();
      const code = '123456';
      const wrong = '000000';
      await seedCode(phone, code);

      const outcomes: string[] = [];
      for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt++) {
        const response = await post('/api/auth/otp/verify', { phone, code: wrong });
        outcomes.push(parse<ApiErrorBody>(response.text).error.code);
      }

      expect(outcomes.slice(0, OTP_MAX_ATTEMPTS - 1)).toEqual(
        Array(OTP_MAX_ATTEMPTS - 1).fill('INVALID_CODE'),
      );
      expect(outcomes.at(-1)).toBe('TOO_MANY_ATTEMPTS');

      // The real code is now worthless, which is the point.
      const withRealCode = await post('/api/auth/otp/verify', {
        phone,
        code,
        displayName: 'Թեստ',
      });

      expect(withRealCode.status).toBe(429);
      expect(parse<ApiErrorBody>(withRealCode.text).error.code).toBe('TOO_MANY_ATTEMPTS');
    });
  });

  describe('banned users', () => {
    it('rejects an existing session and a fresh login', async () => {
      const phone = testPhone();
      const { cookie } = await signIn(phone);

      await db.update(users).set({ isBanned: true }).where(eq(users.phone, phone));

      // A 90-day cookie must not outlive a ban.
      const me = await api('/api/auth/me', { cookie });
      expect(me.status).toBe(401);
      expect(parse<ApiErrorBody>(me.text).error.code).toBe('UNAUTHORIZED');
      expectNoPhone(me, phone);

      const code = '654321';
      await seedCode(phone, code);
      const relogin = await post('/api/auth/otp/verify', { phone, code });

      expect(relogin.status).toBe(403);
      expect(parse<ApiErrorBody>(relogin.text).error.code).toBe('USER_BANNED');
    });
  });
});
