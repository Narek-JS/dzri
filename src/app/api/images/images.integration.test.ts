import { inArray } from 'drizzle-orm';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Real route, real Neon, no mocks (CLAUDE.md).
 *
 * Presigning is offline crypto — no R2 network call — so this exercises the
 * full happy path without a real bucket. The integration harness fills in
 * throwaway R2 config when a machine has none (see
 * vitest.integration.setup.mts), so the 200 case does not depend on real
 * Cloudflare credentials.
 *
 * Codes are seeded straight into `otp_codes` to sign a user in, matching
 * the auth suite: it keeps this file off the OTP request cooldown and out
 * of the SMS provider.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_THUMB_BYTES = 256 * 1024;

type PresignSuccess = { uploadUrl: string; key: string; publicUrl: string };
type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };
type ApiErrorBody = { error: { code: string; message: string } };

type ApiResponse = {
  status: number;
  text: string;
  cookies: string[];
};

function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

// `@/db` throws at import time without DATABASE_URL, so these are imported
// lazily — otherwise the file could not be collected on a machine with no
// secrets and `skipIf` would never run.
let db: (typeof import('@/db'))['db'];
let users: (typeof import('@/db/schema'))['users'];
let otpCodes: (typeof import('@/db/schema'))['otpCodes'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];

describe.skipIf(!hasDatabase)('images API', () => {
  const createdPhones = new Set<string>();

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes } = await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
  });

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

  async function seedCode(phone: string, code: string): Promise<void> {
    createdPhones.add(phone);

    await db.insert(otpCodes).values({
      phone,
      codeHash: hashOtpCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
  }

  async function api(path: string, init?: RequestInit & { cookie?: string }): Promise<ApiResponse> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        // Each call presents as a different client, so separate logical
        // users never share one per-IP presign budget.
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.2`,
        ...(init?.cookie ? { cookie: init.cookie } : {}),
      },
    });

    return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie() };
  }

  function post(path: string, body: unknown, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'POST', body: JSON.stringify(body), cookie });
  }

  /** Signs a fresh user in and returns their cookie and id. */
  async function signIn(): Promise<{ cookie: string; userId: string }> {
    const phone = testPhone();
    const code = '123456';
    await seedCode(phone, code);

    const response = await post('/api/auth/otp/verify', { phone, code, displayName: 'Թեստ' });
    expect(response.status, response.text).toBe(200);

    const cookie = response.cookies.find((v) => v.startsWith('dzri_session='))?.split(';')[0];
    expect(cookie, 'verify must set a session cookie').toBeDefined();

    return { cookie: cookie ?? '', userId: parse<VerifySuccess>(response.text).user.id };
  }

  it('rejects an anonymous caller with 401', async () => {
    const response = await post('/api/images/presign', {
      contentType: 'image/jpeg',
      contentLength: 1024,
      variant: 'original',
    });

    expect(response.status).toBe(401);
    expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a disallowed content type with 400 INVALID_FILE_TYPE', async () => {
    const { cookie } = await signIn();

    const response = await post(
      '/api/images/presign',
      { contentType: 'image/gif', contentLength: 1024, variant: 'original' },
      cookie,
    );

    expect(response.status).toBe(400);
    expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects an oversize file with 400 FILE_TOO_LARGE', async () => {
    const { cookie } = await signIn();

    const response = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: MAX_IMAGE_BYTES + 1, variant: 'original' },
      cookie,
    );

    expect(response.status).toBe(400);
    expect(parse<ApiErrorBody>(response.text).error.code).toBe('FILE_TOO_LARGE');
  });

  it('returns a signed URL and a userId-namespaced key for a valid request', async () => {
    const { cookie, userId } = await signIn();

    const response = await post(
      '/api/images/presign',
      { contentType: 'image/webp', contentLength: 512 * 1024, variant: 'original' },
      cookie,
    );

    expect(response.status, response.text).toBe(200);

    const body = parse<PresignSuccess>(response.text);

    // The client never sends a key; the server mints it under the user's
    // own prefix so a leaked key cannot reach another user's objects.
    expect(body.key.startsWith(`uploads/${userId}/`)).toBe(true);
    expect(body.key).toMatch(new RegExp(`^uploads/${userId}/[0-9a-f-]{36}\\.webp$`));

    // A real presigned URL, expiring in five minutes.
    const url = new URL(body.uploadUrl);
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');

    // The signature binds content-type and content-length, so the client
    // cannot swap in a different or larger file than it declared.
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('content-length');

    // publicUrl is the read path for the same key.
    expect(body.publicUrl.endsWith(`/${body.key}`)).toBe(true);
  });

  it('rejects a missing variant with 400 INVALID_BODY', async () => {
    const { cookie } = await signIn();

    // No default: guessing in the permissive direction would hand out an 8 MB
    // signature for something the client called a thumbnail.
    const response = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: 1024 },
      cookie,
    );

    expect(response.status, response.text).toBe(400);
    expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_BODY');
  });

  it('rejects an unknown variant with 400 INVALID_BODY', async () => {
    const { cookie } = await signIn();

    const response = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: 1024, variant: 'medium' },
      cookie,
    );

    expect(response.status, response.text).toBe(400);
    expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_BODY');
  });

  it('caps a thumb at 256 KB even though the same size passes as an original', async () => {
    const { cookie } = await signIn();

    const overThumbCap = MAX_THUMB_BYTES + 1;

    // The client asserts what a thumb is; this cap is the only server-side
    // control over it, so it has to bite well below the original's ceiling.
    const asThumb = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: overThumbCap, variant: 'thumb' },
      cookie,
    );
    expect(asThumb.status, asThumb.text).toBe(400);
    expect(parse<ApiErrorBody>(asThumb.text).error.code).toBe('FILE_TOO_LARGE');

    const asOriginal = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: overThumbCap, variant: 'original' },
      cookie,
    );
    expect(asOriginal.status, asOriginal.text).toBe(200);
  });

  it('signs a thumb at exactly the cap', async () => {
    const { cookie, userId } = await signIn();

    const response = await post(
      '/api/images/presign',
      { contentType: 'image/jpeg', contentLength: MAX_THUMB_BYTES, variant: 'thumb' },
      cookie,
    );

    expect(response.status, response.text).toBe(200);

    // A thumb key is minted exactly like an original's — same prefix, same
    // shape — so `createItem` can hold both to the same ownership rule.
    const body = parse<PresignSuccess>(response.text);
    expect(body.key.startsWith(`uploads/${userId}/`)).toBe(true);
  });

  it('never accepts a client-supplied key', async () => {
    const { cookie, userId } = await signIn();

    const response = await post(
      '/api/images/presign',
      {
        contentType: 'image/png',
        contentLength: 1024,
        variant: 'original',
        key: 'uploads/attacker/owned.png',
        Key: 'uploads/attacker/owned.png',
      },
      cookie,
    );

    expect(response.status, response.text).toBe(200);
    const body = parse<PresignSuccess>(response.text);

    expect(body.key.startsWith(`uploads/${userId}/`)).toBe(true);
    expect(body.key).not.toContain('attacker');
  });
});
