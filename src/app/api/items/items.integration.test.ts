import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ItemStatus } from '@/db/schema';

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

// Only the fields the feed/detail assertions read are typed; the JSON carries
// more (localized district/category names, thumbnails, giver) and structural
// typing lets those ride along untyped.
type FeedItem = { id: string; title: string; createdAt: string };
type FeedResponse = { items: FeedItem[]; nextCursor: string | null };
type DetailResponse = { item: { id: string; status: string } };

type ApiErrorBody = { error: { code: string; message: string } };

type ApiResponse = {
  status: number;
  text: string;
  cookies: string[];
  cacheControl: string | null;
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
let claims: (typeof import('@/db/schema'))['claims'];
let categories: (typeof import('@/db/schema'))['categories'];
let districts: (typeof import('@/db/schema'))['districts'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];
let createItem: (typeof import('@/lib/items/create'))['createItem'];

/** The injected existence check: pretend every uploaded object is present. */
const objectAlwaysExists = async (): Promise<boolean> => true;

describe.skipIf(!hasDatabase)('items API', () => {
  const createdPhones = new Set<string>();

  // Two categories and two districts owned by this suite, so the tests do not
  // depend on the seed having run on the branch, and the feed's district/
  // category filters have a second bucket to exclude. Cleaned up in afterAll.
  // The slugs are unique per run, so a district filter isolates this suite's
  // rows from anything else on the shared branch.
  let categoryId: number;
  let districtId: number;
  let categoryId2: number;
  let districtId2: number;
  let categorySlug: string;
  let districtSlug: string;
  let categorySlug2: string;
  let districtSlug2: string;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes, items, itemImages, claims, categories, districts } =
      await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
    ({ createItem } = await import('@/lib/items/create'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    categorySlug = `test-cat-${suffix}`;
    districtSlug = `test-dist-${suffix}`;
    categorySlug2 = `test-cat2-${suffix}`;
    districtSlug2 = `test-dist2-${suffix}`;

    const insertedCategories = await db
      .insert(categories)
      .values([
        { slug: categorySlug, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' },
        { slug: categorySlug2, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' },
      ])
      .returning({ id: categories.id });
    const insertedDistricts = await db
      .insert(districts)
      .values([
        { slug: districtSlug, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test', region: 'yerevan' },
        { slug: districtSlug2, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test', region: 'yerevan' },
      ])
      .returning({ id: districts.id });

    [categoryId, categoryId2] = insertedCategories.map((c) => c.id);
    [districtId, districtId2] = insertedDistricts.map((d) => d.id);
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
    await db.delete(categories).where(inArray(categories.id, [categoryId, categoryId2]));
    await db.delete(districts).where(inArray(districts.id, [districtId, districtId2]));
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

    return {
      status: res.status,
      text: await res.text(),
      cookies: res.headers.getSetCookie(),
      cacheControl: res.headers.get('cache-control'),
    };
  }

  function post(path: string, body: unknown, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'POST', body: JSON.stringify(body), cookie });
  }

  function del(path: string, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'DELETE', cookie });
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

  /**
   * Seeds one item through `createItem` with the R2 stub — the same in-process
   * path the existing tests use — then forces it into `status`. Under the
   * default moderation mode `createItem` always writes `pending_review`, so
   * every other feed/detail state (active, reserved, expired, rejected) is
   * reached by this post-write update, exactly as the moderation flow and the
   * cron sweep reach them. The row's owner is a tracked-phone user, so afterEach
   * cascade-deletes it.
   */
  async function seedItem(
    userId: string,
    status: ItemStatus,
    overrides: { categoryId?: number; districtId?: number; expiresAt?: Date; title?: string } = {},
  ): Promise<string> {
    const result = await createItem(
      {
        userId,
        title: overrides.title ?? 'Ապրանք',
        description: null,
        categoryId: overrides.categoryId ?? categoryId,
        districtId: overrides.districtId ?? districtId,
        condition: 'working',
        pickupNotes: null,
        imageKeys: [ownedKey(userId, 'seed.jpg')],
      },
      objectAlwaysExists,
    );
    if (!result.ok) throw new Error(`seedItem could not create the row: ${result.code}`);

    // pending_review is already the created status; touch the row only when the
    // test wants something else, or a non-default expiry.
    if (status !== 'pending_review' || overrides.expiresAt) {
      await db
        .update(items)
        .set({
          status,
          // Two check constraints ride on status: a rejected item must carry a
          // reason, a reserved item must name who it is reserved for.
          rejectionReason: status === 'rejected' ? 'Չի համապատասխանում' : null,
          reservedFor: status === 'reserved' ? userId : null,
          reservedUntil: status === 'reserved' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
          ...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
        })
        .where(eq(items.id, result.id));
    }

    return result.id;
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

  describe('GET /api/items (feed)', () => {
    it('serves the feed to a caller with no cookie at all', async () => {
      const { userId } = await signIn();
      const id = await seedItem(userId, 'active');

      // No cookie option passed: a stranger off a shared link.
      const response = await api(`/api/items?district=${districtSlug}`);

      expect(response.status, response.text).toBe(200);
      const ids = parse<FeedResponse>(response.text).items.map((item) => item.id);
      expect(ids).toContain(id);
    });

    it('excludes pending_review, rejected, reserved and expired items', async () => {
      const { userId } = await signIn();

      const active = await seedItem(userId, 'active');
      const pending = await seedItem(userId, 'pending_review');
      const rejected = await seedItem(userId, 'rejected');
      const reserved = await seedItem(userId, 'reserved');
      const expired = await seedItem(userId, 'expired');
      // Still 'active' but past its expiry: the sweep has not flipped it yet,
      // and the feed's `expires_at > now()` guard must hide it anyway.
      const stale = await seedItem(userId, 'active', { expiresAt: new Date(Date.now() - 1000) });

      const response = await api(`/api/items?district=${districtSlug}`);
      expect(response.status, response.text).toBe(200);

      const ids = parse<FeedResponse>(response.text).items.map((item) => item.id);
      expect(ids).toContain(active);
      for (const hidden of [pending, rejected, reserved, expired, stale]) {
        expect(ids).not.toContain(hidden);
      }
    });

    it('filters by district slug, excluding items in another district', async () => {
      const { userId } = await signIn();
      const here = await seedItem(userId, 'active', { districtId });
      const elsewhere = await seedItem(userId, 'active', { districtId: districtId2 });

      const response = await api(`/api/items?district=${districtSlug}`);
      expect(response.status, response.text).toBe(200);

      const ids = parse<FeedResponse>(response.text).items.map((item) => item.id);
      expect(ids).toContain(here);
      expect(ids).not.toContain(elsewhere);
    });

    it('filters by category slug, excluding items in another category', async () => {
      const { userId } = await signIn();
      const here = await seedItem(userId, 'active', { categoryId });
      const elsewhere = await seedItem(userId, 'active', { categoryId: categoryId2 });

      const response = await api(`/api/items?category=${categorySlug}`);
      expect(response.status, response.text).toBe(200);

      const ids = parse<FeedResponse>(response.text).items.map((item) => item.id);
      expect(ids).toContain(here);
      expect(ids).not.toContain(elsewhere);
    });

    it('returns an empty page for an unknown slug, not an error', async () => {
      const { userId } = await signIn();
      await seedItem(userId, 'active');

      const response = await api('/api/items?district=no-such-district-anywhere');
      expect(response.status, response.text).toBe(200);

      const body = parse<FeedResponse>(response.text);
      expect(body.items).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('paginates by cursor with no overlap between the two pages', async () => {
      const { userId } = await signIn();

      // One more than a full page forces a second page. The suite's private
      // district holds nothing else, so the two pages must union to exactly
      // these rows with no id on both.
      const PAGE_SIZE = 24;
      const seeded = new Set<string>();
      for (let i = 0; i < PAGE_SIZE + 1; i++) {
        seeded.add(await seedItem(userId, 'active', { title: `Էջ ${i}` }));
      }

      const first = await api(`/api/items?district=${districtSlug}`);
      expect(first.status, first.text).toBe(200);
      const firstBody = parse<FeedResponse>(first.text);
      expect(firstBody.items).toHaveLength(PAGE_SIZE);

      const cursor = firstBody.nextCursor;
      expect(cursor, 'a full first page must hand back a cursor').not.toBeNull();
      if (cursor === null) return;

      const second = await api(
        `/api/items?district=${districtSlug}&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(second.status, second.text).toBe(200);
      const secondBody = parse<FeedResponse>(second.text);

      const firstIds = firstBody.items.map((item) => item.id);
      const secondIds = secondBody.items.map((item) => item.id);

      // No id appears on both pages, and together they account for every row.
      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
      expect(new Set([...firstIds, ...secondIds])).toEqual(seeded);
      expect(secondBody.nextCursor).toBeNull();
    });
  });

  describe('GET /api/items/[id]', () => {
    it('returns 200 to an anonymous caller for an active item', async () => {
      const { userId } = await signIn();
      const id = await seedItem(userId, 'active');

      const response = await api(`/api/items/${id}`);
      expect(response.status, response.text).toBe(200);

      const item = parse<DetailResponse>(response.text).item;
      expect(item.id).toBe(id);
      expect(item.status).toBe('active');
    });

    it('returns 404 ITEM_NOT_FOUND to an anonymous caller for a pending_review item', async () => {
      const { userId } = await signIn();
      const id = await seedItem(userId, 'pending_review');

      const response = await api(`/api/items/${id}`);
      expect(response.status, response.text).toBe(404);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');
    });

    it('returns 200 for a pending_review item to its owner', async () => {
      const owner = await signIn();
      const id = await seedItem(owner.userId, 'pending_review');

      const response = await api(`/api/items/${id}`, { cookie: owner.cookie });
      expect(response.status, response.text).toBe(200);

      const item = parse<DetailResponse>(response.text).item;
      expect(item.id).toBe(id);
      expect(item.status).toBe('pending_review');
    });

    it('returns 404 for a malformed uuid in the path', async () => {
      const response = await api('/api/items/not-a-real-uuid');
      expect(response.status, response.text).toBe(404);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');
    });
  });

  /**
   * Approving a claim moves the item to `reserved`, which is invisible to
   * everyone but the owner — so without this the claimant's own approved claim
   * dead-ends at a 404 the moment they are picked.
   *
   * The whole scenario is built through real endpoints: two users, a real
   * claim, a real approval. That is the only way to get an item into `reserved`
   * with a genuinely approved claim behind it.
   */
  describe('GET /api/items/[id] — claimant access to a reserved item', () => {
    /**
     * Seeds an active item, has `claimant` claim it, has the owner approve it,
     * and returns the item id. The item is `reserved` afterwards.
     */
    async function reserveFor(
      owner: { cookie: string; userId: string },
      claimant: { cookie: string },
    ): Promise<{ itemId: string; claimId: string }> {
      const itemId = await seedItem(owner.userId, 'active');

      const created = await post(`/api/items/${itemId}/claims`, {}, claimant.cookie);
      expect(created.status, created.text).toBe(201);
      const claimId = parse<{ id: string }>(created.text).id;

      const approved = await post(`/api/claims/${claimId}/approve`, {}, owner.cookie);
      expect(approved.status, approved.text).toBe(200);

      return { itemId, claimId };
    }

    it('returns 200 to the approved claimant for a reserved item', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const { itemId } = await reserveFor(owner, claimant);

      const response = await api(`/api/items/${itemId}`, { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      const item = parse<DetailResponse>(response.text).item;
      expect(item.id).toBe(itemId);
      // The UI renders "reserved for you" off this.
      expect(item.status).toBe('reserved');
    });

    it('returns 404 to a rejected claimant on the same reserved item', async () => {
      const owner = await signIn();
      const winner = await signIn();
      const loser = await signIn();

      const itemId = await seedItem(owner.userId, 'active');

      // Both claim while it is still active; approving the winner rejects the
      // loser automatically.
      const winning = await post(`/api/items/${itemId}/claims`, {}, winner.cookie);
      expect(winning.status, winning.text).toBe(201);
      const losing = await post(`/api/items/${itemId}/claims`, {}, loser.cookie);
      expect(losing.status, losing.text).toBe(201);

      const approved = await post(
        `/api/claims/${parse<{ id: string }>(winning.text).id}/approve`,
        {},
        owner.cookie,
      );
      expect(approved.status, approved.text).toBe(200);

      const forWinner = await api(`/api/items/${itemId}`, { cookie: winner.cookie });
      expect(forWinner.status, forWinner.text).toBe(200);

      // Held a claim once; that is not a key to a listing that is no longer public.
      const forLoser = await api(`/api/items/${itemId}`, { cookie: loser.cookie });
      expect(forLoser.status, forLoser.text).toBe(404);
      expect(parse<ApiErrorBody>(forLoser.text).error.code).toBe('ITEM_NOT_FOUND');
    });

    it('returns 404 to a withdrawn claimant and to a signed-in stranger', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const stranger = await signIn();
      const { itemId, claimId } = await reserveFor(owner, claimant);

      const strangerView = await api(`/api/items/${itemId}`, { cookie: stranger.cookie });
      expect(strangerView.status, strangerView.text).toBe(404);

      const withdrawn = await post(`/api/claims/${claimId}/withdraw`, {}, claimant.cookie);
      expect(withdrawn.status, withdrawn.text).toBe(200);

      // Withdrawing releases the item back to active, so make it non-public
      // again before re-checking: the point is that the ex-claimant has no
      // standing, not that the item happens to be visible.
      await db.update(items).set({ status: 'pending_review' }).where(eq(items.id, itemId));

      const afterWithdraw = await api(`/api/items/${itemId}`, { cookie: claimant.cookie });
      expect(afterWithdraw.status, afterWithdraw.text).toBe(404);
    });

    it('keeps access for a completed claim', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const { itemId, claimId } = await reserveFor(owner, claimant);

      const completed = await post(`/api/claims/${claimId}/complete`, {}, owner.cookie);
      expect(completed.status, completed.text).toBe(200);

      const response = await api(`/api/items/${itemId}`, { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);
      expect(parse<DetailResponse>(response.text).item.status).toBe('given');
    });

    it('carries no phone key and no public cache header', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const { itemId } = await reserveFor(owner, claimant);

      const response = await api(`/api/items/${itemId}`, { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      // The claimant already has the giver's phone from GET /api/claims/mine.
      // This must not become a fourth endpoint that carries one.
      expectNoPhone(response, owner.phone);
      expectNoPhone(response, claimant.phone);

      // A reserved item is visible to exactly one person; it must never enter
      // a shared cache.
      expect(response.cacheControl).toBe('no-store, private');
    });

    it('does not increment view_count for the claimant', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const { itemId } = await reserveFor(owner, claimant);

      const before = await db
        .select({ viewCount: items.viewCount })
        .from(items)
        .where(eq(items.id, itemId));

      await api(`/api/items/${itemId}`, { cookie: claimant.cookie });
      await api(`/api/items/${itemId}`, { cookie: claimant.cookie });

      const after = await db
        .select({ viewCount: items.viewCount })
        .from(items)
        .where(eq(items.id, itemId));

      expect(after[0].viewCount).toBe(before[0].viewCount);
    });

    it('leaves the public and owner cache behaviour unchanged', async () => {
      const owner = await signIn();
      const activeId = await seedItem(owner.userId, 'active');
      const pendingId = await seedItem(owner.userId, 'pending_review');

      const anonymous = await api(`/api/items/${activeId}`);
      expect(anonymous.status, anonymous.text).toBe(200);
      expect(anonymous.cacheControl).toBe('public, s-maxage=60, stale-while-revalidate=300');

      const ownerView = await api(`/api/items/${pendingId}`, { cookie: owner.cookie });
      expect(ownerView.status, ownerView.text).toBe(200);
      expect(ownerView.cacheControl).toBe('no-store, private');
    });
  });

  describe('DELETE /api/items/[id]', () => {
    it('rejects an anonymous caller with 401', async () => {
      const { userId } = await signIn();
      const id = await seedItem(userId, 'active');

      const response = await del(`/api/items/${id}`);

      expect(response.status, response.text).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 to a signed-in stranger, never 403', async () => {
      const owner = await signIn();
      const stranger = await signIn();
      const id = await seedItem(owner.userId, 'active');

      const response = await del(`/api/items/${id}`, stranger.cookie);

      // 403 would confirm the id names a real item. It must not.
      expect(response.status, response.text).toBe(404);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');

      // And the item is untouched.
      const [row] = await db.select({ status: items.status }).from(items).where(eq(items.id, id));
      expect(row.status).toBe('active');
    });

    it('soft-deletes an active item for its owner, keeping the row and its images', async () => {
      const owner = await signIn();
      const id = await seedItem(owner.userId, 'active');

      const response = await del(`/api/items/${id}`, owner.cookie);
      expect(response.status, response.text).toBe(200);

      const [row] = await db.select({ status: items.status }).from(items).where(eq(items.id, id));
      expect(row.status).toBe('removed');

      // Soft delete: the image rows survive, so the R2 objects stay referenced.
      const images = await db
        .select({ url: itemImages.url })
        .from(itemImages)
        .where(eq(itemImages.itemId, id));
      expect(images.length).toBeGreaterThan(0);
    });

    it('rejects pending claims on the removed item', async () => {
      const owner = await signIn();
      const claimant = await signIn();
      const id = await seedItem(owner.userId, 'active');

      const claim = await post(`/api/items/${id}/claims`, {}, claimant.cookie);
      expect(claim.status, claim.text).toBe(201);

      const response = await del(`/api/items/${id}`, owner.cookie);
      expect(response.status, response.text).toBe(200);

      const rows = await db
        .select({ status: claims.status })
        .from(claims)
        .where(eq(claims.itemId, id));
      expect(rows.map((row) => row.status)).toEqual(['rejected']);
    });

    it('refuses a reserved item with 409, so it cannot vanish from under its claimant', async () => {
      const owner = await signIn();
      const id = await seedItem(owner.userId, 'reserved');

      const response = await del(`/api/items/${id}`, owner.cookie);

      expect(response.status, response.text).toBe(409);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_STATUS_TRANSITION');

      const [row] = await db.select({ status: items.status }).from(items).where(eq(items.id, id));
      expect(row.status).toBe('reserved');
    });

    it('refuses given and expired items with 409', async () => {
      const owner = await signIn();

      for (const status of ['given', 'expired'] as const) {
        const id = await seedItem(owner.userId, status);
        const response = await del(`/api/items/${id}`, owner.cookie);

        expect(response.status, `${status}: ${response.text}`).toBe(409);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('removes a pending_review item and a rejected one', async () => {
      const owner = await signIn();

      for (const status of ['pending_review', 'rejected'] as const) {
        const id = await seedItem(owner.userId, status);
        const response = await del(`/api/items/${id}`, owner.cookie);

        expect(response.status, `${status}: ${response.text}`).toBe(200);

        const [row] = await db
          .select({ status: items.status, rejectionReason: items.rejectionReason })
          .from(items)
          .where(eq(items.id, id));
        expect(row.status).toBe('removed');
        // rejection_reason_matches_status forbids a non-rejected item from
        // carrying a reason, so removing a rejected item has to clear it.
        expect(row.rejectionReason).toBeNull();
      }
    });

    it('refuses a second delete with 409', async () => {
      const owner = await signIn();
      const id = await seedItem(owner.userId, 'active');

      expect((await del(`/api/items/${id}`, owner.cookie)).status).toBe(200);

      const second = await del(`/api/items/${id}`, owner.cookie);
      expect(second.status, second.text).toBe(409);
      expect(parse<ApiErrorBody>(second.text).error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns 404 for a malformed uuid', async () => {
      const { cookie } = await signIn();

      const response = await del('/api/items/not-a-real-uuid', cookie);
      expect(response.status, response.text).toBe(404);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');
    });

    it('hides a removed item from the feed and from its own detail page', async () => {
      const owner = await signIn();
      const id = await seedItem(owner.userId, 'active');

      expect((await del(`/api/items/${id}`, owner.cookie)).status).toBe(200);

      const feed = await api(`/api/items?district=${districtSlug}`);
      expect(parse<FeedResponse>(feed.text).items.map((item) => item.id)).not.toContain(id);

      const stranger = await api(`/api/items/${id}`);
      expect(stranger.status).toBe(404);
    });
  });

  // The non-negotiable rule (CLAUDE.md): no phone leaves either read endpoint.
  describe('phone privacy', () => {
    it('never returns a phone number from the feed or the detail endpoint', async () => {
      const { userId, phone } = await signIn();
      const id = await seedItem(userId, 'active');

      const feed = await api(`/api/items?district=${districtSlug}`);
      expect(feed.status, feed.text).toBe(200);
      expectNoPhone(feed, phone);

      const detail = await api(`/api/items/${id}`);
      expect(detail.status, detail.text).toBe(200);
      expectNoPhone(detail, phone);
    });
  });
});
