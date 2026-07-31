import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Real routes, real Neon, no mocks (CLAUDE.md).
 *
 * One obstacle shapes this file. `createItem` confirms every image key
 * actually exists in R2 via HeadObject, and the integration server runs on
 * throwaway R2 config, so a real HeadObject would fail. The check is
 * injectable for exactly this reason: the cases that reach it — creating a
 * real item, and seeding items for the "my items" screen — call `createItem`
 * in this worker process with a stub that reports every object present, while
 * still writing real rows to the same Neon branch the server reads.
 *
 * Everything that a request can be rejected *before* the HeadObject step
 * (auth, image count, key ownership, an unknown category) is exercised over
 * real HTTP through the running server, because those paths never touch R2.
 * The production route always calls the real `headObject`; nothing here
 * changes that.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

// createItem is called in-process here, so this worker needs the same read
// base the server uses to build image URLs. `??=` never overrides a real
// value from .env.local, matching the server-side default in globalSetup.
process.env.R2_PUBLIC_URL ??= 'https://images.dzri.test';

const OTP_TTL_MS = 5 * 60 * 1000;

type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };
type MineItem = {
  id: string;
  title: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  expiresAt: string;
  imageUrl: string | null;
  claimCount: number;
};
type MineResponse = { items: MineItem[]; nextCursor: string | null };
type ApiErrorBody = { error: { code: string; message: string } };

type ApiResponse = {
  status: number;
  text: string;
  cookies: string[];
};

function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

// `@/db` throws at import time without DATABASE_URL, so everything that pulls
// it in is imported lazily — otherwise the file could not be collected on a
// machine with no secrets and `skipIf` would never run.
let db: (typeof import('@/db'))['db'];
let users: (typeof import('@/db/schema'))['users'];
let otpCodes: (typeof import('@/db/schema'))['otpCodes'];
let items: (typeof import('@/db/schema'))['items'];
let itemImages: (typeof import('@/db/schema'))['itemImages'];
let categories: (typeof import('@/db/schema'))['categories'];
let districts: (typeof import('@/db/schema'))['districts'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];
let createItem: (typeof import('@/lib/items/create'))['createItem'];

/** The injected existence check: pretend every uploaded object is present. */
const objectAlwaysExists = async (): Promise<boolean> => true;

describe.skipIf(!hasDatabase)('items API', () => {
  const createdPhones = new Set<string>();

  // A category and district owned by this suite, so the tests do not depend
  // on the seed having run on the branch. Cleaned up in afterAll.
  let categoryId: number;
  let districtId: number;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes, items, itemImages, categories, districts } = await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
    ({ createItem } = await import('@/lib/items/create'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [category] = await db
      .insert(categories)
      .values({ slug: `test-cat-${suffix}`, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' })
      .returning({ id: categories.id });
    const [district] = await db
      .insert(districts)
      .values({
        slug: `test-dist-${suffix}`,
        nameHy: 'Թեստ',
        nameRu: 'Тест',
        nameEn: 'Test',
        region: 'yerevan',
      })
      .returning({ id: districts.id });

    categoryId = category.id;
    districtId = district.id;
  });

  // Deleting the users cascades to their items, item_images and claims
  // (all FK onDelete: cascade), so tracking phones is enough to clean every
  // row a test created. Runs even after a failed test.
  afterEach(async () => {
    if (createdPhones.size === 0) return;

    const phones = [...createdPhones];
    createdPhones.clear();

    await db.delete(otpCodes).where(inArray(otpCodes.phone, phones));
    await db.delete(users).where(inArray(users.phone, phones));
  });

  afterAll(async () => {
    if (categoryId === undefined) return;

    // Reference rows have no cascade; by now afterEach has removed every item
    // that referenced them, so these deletes cannot hit an FK.
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(districts).where(eq(districts.id, districtId));
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
        // Each call presents as a different client so logically separate
        // users never share one per-IP create budget.
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.3`,
        ...(init?.cookie ? { cookie: init.cookie } : {}),
      },
    });

    return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie() };
  }

  function post(path: string, body: unknown, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'POST', body: JSON.stringify(body), cookie });
  }

  /** No phone, in any form, anywhere in the response body. */
  function expectNoPhone(response: ApiResponse, phone: string): void {
    expect(response.text).not.toMatch(/phone/i);
    expect(response.text).not.toContain(phone); // +37477123456
    expect(response.text).not.toContain(phone.slice(1)); // 37477123456
    expect(response.text).not.toContain(phone.slice(4)); // 77123456
  }

  /** Signs a fresh user in and returns their cookie, id and phone. */
  async function signIn(): Promise<{ cookie: string; userId: string; phone: string }> {
    const phone = testPhone();
    const code = '123456';
    await seedCode(phone, code);

    const response = await post('/api/auth/otp/verify', { phone, code, displayName: 'Թեստ' });
    expect(response.status, response.text).toBe(200);

    const cookie = response.cookies.find((v) => v.startsWith('dzri_session='))?.split(';')[0];
    expect(cookie, 'verify must set a session cookie').toBeDefined();

    return { cookie: cookie ?? '', userId: parse<VerifySuccess>(response.text).user.id, phone };
  }

  function ownedKey(userId: string, name: string): string {
    return `uploads/${userId}/${name}`;
  }

  /** The full valid body, with per-test overrides. */
  function validBody(
    userId: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      title: 'Անվճար բազկաթոռ',
      description: 'Լավ վիճակում',
      categoryId,
      districtId,
      condition: 'working',
      imageKeys: [ownedKey(userId, 'a.jpg')],
      ...overrides,
    };
  }

  describe('POST /api/items', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await post('/api/items', validBody('someone'));

      expect(response.status).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an empty imageKeys array with 400 IMAGES_REQUIRED', async () => {
      const { cookie, userId } = await signIn();

      const response = await post('/api/items', validBody(userId, { imageKeys: [] }), cookie);

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('IMAGES_REQUIRED');
    });

    it('rejects seven images with 400 TOO_MANY_IMAGES', async () => {
      const { cookie, userId } = await signIn();

      const imageKeys = Array.from({ length: 7 }, (_, i) => ownedKey(userId, `${i}.jpg`));
      const response = await post('/api/items', validBody(userId, { imageKeys }), cookie);

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('TOO_MANY_IMAGES');
    });

    it("rejects a key under another user's prefix with 400 INVALID_IMAGE_KEY", async () => {
      const { cookie, userId } = await signIn();
      const otherId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      expect(otherId).not.toBe(userId);

      const response = await post(
        '/api/items',
        validBody(userId, { imageKeys: [`uploads/${otherId}/stolen.jpg`] }),
        cookie,
      );

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_IMAGE_KEY');
    });

    it('rejects a nonexistent categoryId with 400 INVALID_CATEGORY', async () => {
      const { cookie, userId } = await signIn();

      const response = await post(
        '/api/items',
        validBody(userId, { categoryId: 2_000_000_000 }),
        cookie,
      );

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_CATEGORY');
    });

    it('creates a pending_review item with its images in submitted order', async () => {
      // In-process with the stub: this is the one path that reaches the R2
      // existence check, which the throwaway server config cannot satisfy.
      const { userId } = await signIn();

      const imageKeys = [
        ownedKey(userId, 'first.jpg'),
        ownedKey(userId, 'second.jpg'),
        ownedKey(userId, 'third.jpg'),
      ];

      const result = await createItem(
        {
          userId,
          title: 'Սեղան',
          description: null,
          categoryId,
          districtId,
          condition: 'working',
          pickupNotes: null,
          imageKeys,
        },
        objectAlwaysExists,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Default MODERATION_MODE holds new items for review.
      expect(result.status).toBe('pending_review');

      const rows = await db
        .select({ url: itemImages.url, position: itemImages.position })
        .from(itemImages)
        .where(eq(itemImages.itemId, result.id))
        .orderBy(itemImages.position);

      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
      // Row order follows submission order; each url is the public URL of its key.
      rows.forEach((row, i) => {
        expect(row.url.endsWith(imageKeys[i])).toBe(true);
      });
    });
  });

  describe('GET /api/items/mine', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await api('/api/items/mine');

      expect(response.status).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
    });

    it("returns only the caller's own items, never another user's", async () => {
      const alice = await signIn();
      const bob = await signIn();

      const mine = await createItem(
        {
          userId: alice.userId,
          title: 'Իմ սեղանը',
          description: null,
          categoryId,
          districtId,
          condition: 'working',
          pickupNotes: null,
          imageKeys: [ownedKey(alice.userId, 'mine.jpg')],
        },
        objectAlwaysExists,
      );
      const theirs = await createItem(
        {
          userId: bob.userId,
          title: 'Ուրիշի սեղանը',
          description: null,
          categoryId,
          districtId,
          condition: 'working',
          pickupNotes: null,
          imageKeys: [ownedKey(bob.userId, 'theirs.jpg')],
        },
        objectAlwaysExists,
      );

      expect(mine.ok && theirs.ok).toBe(true);
      if (!mine.ok || !theirs.ok) return;

      const response = await api('/api/items/mine', { cookie: alice.cookie });
      expect(response.status, response.text).toBe(200);

      const ids = parse<MineResponse>(response.text).items.map((item) => item.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });

    it('includes the rejection reason for a rejected item', async () => {
      const { cookie, userId } = await signIn();

      const created = await createItem(
        {
          userId,
          title: 'Մերժված',
          description: null,
          categoryId,
          districtId,
          condition: 'working',
          pickupNotes: null,
          imageKeys: [ownedKey(userId, 'rejected.jpg')],
        },
        objectAlwaysExists,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const reason = 'Նկարը հստակ չէ';
      await db
        .update(items)
        .set({ status: 'rejected', rejectionReason: reason })
        .where(eq(items.id, created.id));

      const response = await api('/api/items/mine', { cookie });
      expect(response.status, response.text).toBe(200);

      const row = parse<MineResponse>(response.text).items.find((item) => item.id === created.id);
      expect(row?.status).toBe('rejected');
      expect(row?.rejectionReason).toBe(reason);
    });

    it('never includes a phone number in the response', async () => {
      const { cookie, userId, phone } = await signIn();

      await createItem(
        {
          userId,
          title: 'Առարկա',
          description: null,
          categoryId,
          districtId,
          condition: 'working',
          pickupNotes: null,
          imageKeys: [ownedKey(userId, 'photo.jpg')],
        },
        objectAlwaysExists,
      );

      const response = await api('/api/items/mine', { cookie });
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, phone);
    });
  });
});
