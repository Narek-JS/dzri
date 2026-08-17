import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ItemStatus } from '@/db/schema';

/**
 * Real routes, real Neon, no mocks (CLAUDE.md).
 *
 * As in the items suite, `createItem` verifies each image key against R2 and
 * the integration server runs on throwaway R2 config, so items are seeded
 * in-process through `createItem` with a stub that reports every object
 * present — while still writing real rows to the same Neon branch the server
 * reads. Everything a claim request does goes over real HTTP through the
 * running server.
 *
 * The load-bearing assertions here are the phone-privacy ones. A phone number
 * may appear in exactly one response in this entire API — an approved claim,
 * returned to the two parties — and every other path is checked for its
 * absence, including the absence of the word "phone" itself.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

// createItem runs in this worker, so it needs the same read base the server
// uses to build image URLs. `??=` never overrides a real value from .env.local.
process.env.R2_PUBLIC_URL ??= 'https://images.dzri.test';

const OTP_TTL_MS = 5 * 60 * 1000;

type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };

type ClaimCreated = { id: string; status: string };

type ClaimListEntry = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  claimant: {
    displayName: string;
    avatarUrl: string | null;
    reliability: { completed: number; noShows: number };
    phone?: string;
  };
};
type ClaimListResponse = { claims: ClaimListEntry[] };

type ApproveResponse = {
  id: string;
  status: string;
  reservedUntil: string;
  giverPhone: string;
  claimantPhone: string;
};

type MineClaim = {
  id: string;
  status: string;
  rejectedReason?: string;
  message: string | null;
  createdAt: string;
  item: {
    id: string;
    titleHy: string;
    titleRu: string;
    titleEn: string;
    status: string;
    thumbnailUrl: string | null;
  };
  giver: { displayName: string; phone?: string };
};
type MineResponse = { claims: MineClaim[]; nextCursor: string | null };

type ApiErrorBody = { error: { code: string; message: string } };

type ApiResponse = { status: number; text: string; cookies: string[] };

function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

// `@/db` throws at import time without DATABASE_URL, so everything that pulls
// it in is imported lazily.
let db: (typeof import('@/db'))['db'];
let users: (typeof import('@/db/schema'))['users'];
let otpCodes: (typeof import('@/db/schema'))['otpCodes'];
let items: (typeof import('@/db/schema'))['items'];
let claims: (typeof import('@/db/schema'))['claims'];
let userReliability: (typeof import('@/db/schema'))['userReliability'];
let categories: (typeof import('@/db/schema'))['categories'];
let districts: (typeof import('@/db/schema'))['districts'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];
let createItem: (typeof import('@/lib/items/create'))['createItem'];

const objectAlwaysExists = async (): Promise<boolean> => true;

describe.skipIf(!hasDatabase)('claims API', () => {
  const createdPhones = new Set<string>();

  let categoryId: number;
  let districtId: number;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes, items, claims, userReliability, categories, districts } =
      await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
    ({ createItem } = await import('@/lib/items/create'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const [category] = await db
      .insert(categories)
      .values({ slug: `claim-cat-${suffix}`, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' })
      .returning({ id: categories.id });
    const [district] = await db
      .insert(districts)
      .values({
        slug: `claim-dist-${suffix}`,
        nameHy: 'Թեստ',
        nameRu: 'Тест',
        nameEn: 'Test',
        region: 'yerevan',
      })
      .returning({ id: districts.id });

    categoryId = category.id;
    districtId = district.id;
  });

  /**
   * Items are deleted explicitly before their owners, rather than left to the
   * user cascade. A claimant is not the owner of the item they claimed, and
   * `items.reserved_for` references users with no ON DELETE action — so an
   * approved claim pins the claimant, and deleting the two users in one
   * statement could trip that constraint. Removing the items first drops their
   * claims (cascade) and clears the reference. Runs even after a failed test.
   */
  afterEach(async () => {
    if (createdPhones.size === 0) return;

    const phones = [...createdPhones];
    createdPhones.clear();

    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.phone, phones));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await db.delete(items).where(or(inArray(items.userId, ids), inArray(items.reservedFor, ids)));
    }

    await db.delete(otpCodes).where(inArray(otpCodes.phone, phones));
    await db.delete(users).where(inArray(users.phone, phones));
  });

  afterAll(async () => {
    if (categoryId === undefined) return;

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
        // Each call presents as a different client so logically separate users
        // never share one per-IP claim budget.
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.9`,
        ...(init?.cookie ? { cookie: init.cookie } : {}),
      },
    });

    return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie() };
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

  /**
   * Seeds one item through `createItem` (in-process, with the R2 stub), which
   * writes `pending_review` under the default moderation mode, then forces it
   * into `status` — exactly as the moderation flow reaches `active`.
   */
  async function seedItem(userId: string, status: ItemStatus = 'active'): Promise<string> {
    const result = await createItem(
      {
        userId,
        titleHy: 'Անվճար բազկաթոռ',
        titleRu: 'Անվճար բազկաթոռ',
        titleEn: 'Անվճար բազկաթոռ',
        descriptionHy: 'Լավ վիճակում',
        descriptionRu: 'Լավ վիճակում',
        descriptionEn: 'Լավ վիճակում',
        needsTranslation: false,
        sourceLocale: 'hy',
        categoryId,
        districtId,
        condition: 'working',
        pickupNotes: null,
        images: [
          {
            key: `uploads/${userId}/seed.jpg`,
            thumbKey: `uploads/${userId}/seed-thumb.jpg`,
            width: 1200,
            height: 900,
            blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
          },
        ],
      },
      objectAlwaysExists,
    );
    if (!result.ok) throw new Error(`seedItem could not create the row: ${result.code}`);

    if (status !== 'pending_review') {
      await db
        .update(items)
        .set({
          status,
          rejectionReason: status === 'rejected' ? 'Չի համապատասխանում' : null,
          reservedFor: status === 'reserved' ? userId : null,
          reservedUntil: status === 'reserved' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
        })
        .where(eq(items.id, result.id));
    }

    return result.id;
  }

  async function claim(itemId: string, cookie: string, message?: string): Promise<ApiResponse> {
    return post(`/api/items/${itemId}/claims`, message === undefined ? {} : { message }, cookie);
  }

  /** Claims an item and returns the new claim id, asserting it was created. */
  async function claimOk(itemId: string, cookie: string, message?: string): Promise<string> {
    const response = await claim(itemId, cookie, message);
    expect(response.status, response.text).toBe(201);

    return parse<ClaimCreated>(response.text).id;
  }

  async function itemRow(id: string) {
    const [row] = await db
      .select({
        status: items.status,
        reservedFor: items.reservedFor,
        reservedUntil: items.reservedUntil,
        givenAt: items.givenAt,
      })
      .from(items)
      .where(eq(items.id, id));

    return row;
  }

  async function claimStatus(id: string): Promise<string> {
    const [row] = await db.select({ status: claims.status }).from(claims).where(eq(claims.id, id));

    return row.status;
  }

  describe('POST /api/items/[id]/claims', () => {
    it('rejects an anonymous caller with 401', async () => {
      const giver = await signIn();
      const itemId = await seedItem(giver.userId);

      const response = await post(`/api/items/${itemId}/claims`, {});

      expect(response.status, response.text).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
    });

    it('creates a pending claim on an active item', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);

      const response = await claim(itemId, claimant.cookie, 'Կարող եմ այսօր վերցնել');
      expect(response.status, response.text).toBe(201);

      const body = parse<ClaimCreated>(response.text);
      expect(body.status).toBe('pending');
      expect(await claimStatus(body.id)).toBe('pending');
    });

    it('refuses a giver claiming their own item with CANNOT_CLAIM_OWN_ITEM', async () => {
      const giver = await signIn();
      const itemId = await seedItem(giver.userId);

      const response = await claim(itemId, giver.cookie);

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('CANNOT_CLAIM_OWN_ITEM');
    });

    it('returns ALREADY_CLAIMED when the same person claims twice', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);

      await claimOk(itemId, claimant.cookie);

      const second = await claim(itemId, claimant.cookie, 'Նորից');
      expect(second.status, second.text).toBe(409);
      expect(parse<ApiErrorBody>(second.text).error.code).toBe('ALREADY_CLAIMED');
    });

    it('returns ITEM_NOT_FOUND for a pending_review or reserved item', async () => {
      const giver = await signIn();
      const claimant = await signIn();

      const pending = await seedItem(giver.userId, 'pending_review');
      const reserved = await seedItem(giver.userId, 'reserved');

      for (const itemId of [pending, reserved]) {
        const response = await claim(itemId, claimant.cookie);
        expect(response.status, response.text).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');
      }
    });

    it('rejects a message longer than 300 characters', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);

      const response = await claim(itemId, claimant.cookie, 'ա'.repeat(301));

      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_BODY');
    });
  });

  describe('GET /api/items/[id]/claims', () => {
    it('returns 404 to a non-owner, not 403', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const stranger = await signIn();
      const itemId = await seedItem(giver.userId);
      await claimOk(itemId, claimant.cookie);

      // The claimant is not the owner either — having a claim on an item does
      // not let you see who else claimed it.
      for (const cookie of [claimant.cookie, stranger.cookie]) {
        const response = await api(`/api/items/${itemId}/claims`, { cookie });
        expect(response.status, response.text).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('ITEM_NOT_FOUND');
      }
    });

    it('lists claims oldest first with the claimant reliability history', async () => {
      const giver = await signIn();
      const first = await signIn();
      const second = await signIn();
      const itemId = await seedItem(giver.userId);

      const firstClaim = await claimOk(itemId, first.cookie, 'Ես առաջինն եմ');
      const secondClaim = await claimOk(itemId, second.cookie);

      const response = await api(`/api/items/${itemId}/claims`, { cookie: giver.cookie });
      expect(response.status, response.text).toBe(200);

      const list = parse<ClaimListResponse>(response.text).claims;
      expect(list.map((entry) => entry.id)).toEqual([firstClaim, secondClaim]);
      expect(list[0].message).toBe('Ես առաջինն եմ');
      expect(list[0].claimant.reliability).toEqual({ completed: 0, noShows: 0 });
    });
  });

  describe('POST /api/claims/[id]/approve', () => {
    it('reserves the item, rejects the other pending claims and returns both phones', async () => {
      const giver = await signIn();
      const chosen = await signIn();
      const passedOver = await signIn();
      const itemId = await seedItem(giver.userId);

      const chosenClaim = await claimOk(itemId, chosen.cookie);
      const otherClaim = await claimOk(itemId, passedOver.cookie);

      const response = await post(`/api/claims/${chosenClaim}/approve`, {}, giver.cookie);
      expect(response.status, response.text).toBe(200);

      // The one moment the reveal happens, to the two parties and nobody else.
      const body = parse<ApproveResponse>(response.text);
      expect(body.giverPhone).toBe(giver.phone);
      expect(body.claimantPhone).toBe(chosen.phone);

      expect(await claimStatus(chosenClaim)).toBe('approved');
      expect(await claimStatus(otherClaim)).toBe('rejected');

      const item = await itemRow(itemId);
      expect(item.status).toBe('reserved');
      expect(item.reservedFor).toBe(chosen.userId);
      // 48 hours out, minus a generous margin for round-trip clock skew.
      expect(item.reservedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now() + 47 * 60 * 60 * 1000);
    });

    it('returns 404 to somebody who is not the item owner', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const stranger = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      // Including the claimant: approving your own claim is not a thing.
      for (const cookie of [claimant.cookie, stranger.cookie]) {
        const response = await post(`/api/claims/${claimId}/approve`, {}, cookie);
        expect(response.status, response.text).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('CLAIM_NOT_FOUND');
      }

      expect(await claimStatus(claimId)).toBe('pending');
    });

    it('returns INVALID_STATUS_TRANSITION when approving twice', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      const first = await post(`/api/claims/${claimId}/approve`, {}, giver.cookie);
      expect(first.status, first.text).toBe(200);

      const second = await post(`/api/claims/${claimId}/approve`, {}, giver.cookie);
      expect(second.status, second.text).toBe(409);
      expect(parse<ApiErrorBody>(second.text).error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('refuses a second claim on an item another claim already reserved', async () => {
      const giver = await signIn();
      const chosen = await signIn();
      const other = await signIn();
      const itemId = await seedItem(giver.userId);

      const chosenClaim = await claimOk(itemId, chosen.cookie);
      const otherClaim = await claimOk(itemId, other.cookie);

      expect((await post(`/api/claims/${chosenClaim}/approve`, {}, giver.cookie)).status).toBe(200);

      // The loser was rejected by the approval, so there is nothing to approve.
      const response = await post(`/api/claims/${otherClaim}/approve`, {}, giver.cookie);
      expect(response.status, response.text).toBe(409);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_STATUS_TRANSITION');

      const item = await itemRow(itemId);
      expect(item.reservedFor).toBe(chosen.userId);
    });
  });

  describe('POST /api/claims/[id]/reject', () => {
    it('rejects a pending claim and leaves the item active', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      const response = await post(`/api/claims/${claimId}/reject`, {}, giver.cookie);
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, claimant.phone);

      expect(await claimStatus(claimId)).toBe('rejected');
      expect((await itemRow(itemId)).status).toBe('active');
    });
  });

  describe('POST /api/claims/[id]/withdraw', () => {
    it('releases the item back to active when an approved claim is withdrawn', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/approve`, {}, giver.cookie)).status).toBe(200);
      expect((await itemRow(itemId)).status).toBe('reserved');

      const response = await post(`/api/claims/${claimId}/withdraw`, {}, claimant.cookie);
      expect(response.status, response.text).toBe(200);

      expect(await claimStatus(claimId)).toBe('withdrawn');

      // Nobody who backs out may leave the listing stuck in `reserved`.
      const item = await itemRow(itemId);
      expect(item.status).toBe('active');
      expect(item.reservedFor).toBeNull();
      expect(item.reservedUntil).toBeNull();
    });

    it('returns 404 when the giver tries to withdraw somebody else’s claim', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      const response = await post(`/api/claims/${claimId}/withdraw`, {}, giver.cookie);
      expect(response.status, response.text).toBe(404);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('CLAIM_NOT_FOUND');

      expect(await claimStatus(claimId)).toBe('pending');
    });
  });

  describe('POST /api/claims/[id]/complete', () => {
    it('marks the claim completed and the item given', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await post(`/api/claims/${claimId}/complete`, {}, giver.cookie);
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, claimant.phone);

      expect(await claimStatus(claimId)).toBe('completed');

      const item = await itemRow(itemId);
      expect(item.status).toBe('given');
      expect(item.givenAt).not.toBeNull();
    });
  });

  describe('POST /api/claims/[id]/no-show', () => {
    it('releases the item and shows up in user_reliability', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await post(`/api/claims/${claimId}/no-show`, {}, giver.cookie);
      expect(response.status, response.text).toBe(200);

      expect(await claimStatus(claimId)).toBe('no_show');

      const item = await itemRow(itemId);
      expect(item.status).toBe('active');
      expect(item.reservedFor).toBeNull();
      expect(item.reservedUntil).toBeNull();

      // This is what the next giver sees before choosing between strangers.
      const [reliability] = await db
        .select({ completed: userReliability.completed, noShows: userReliability.noShows })
        .from(userReliability)
        .where(eq(userReliability.id, claimant.userId));

      expect(reliability.noShows).toBe(1);
      expect(reliability.completed).toBe(0);
    });

    it('surfaces the no-show to the next giver reviewing that claimant', async () => {
      const firstGiver = await signIn();
      const claimant = await signIn();

      const firstItem = await seedItem(firstGiver.userId);
      const firstClaim = await claimOk(firstItem, claimant.cookie);
      await post(`/api/claims/${firstClaim}/approve`, {}, firstGiver.cookie);
      await post(`/api/claims/${firstClaim}/no-show`, {}, firstGiver.cookie);

      const secondGiver = await signIn();
      const secondItem = await seedItem(secondGiver.userId);
      await claimOk(secondItem, claimant.cookie);

      const response = await api(`/api/items/${secondItem}/claims`, { cookie: secondGiver.cookie });
      expect(response.status, response.text).toBe(200);

      const entry = parse<ClaimListResponse>(response.text).claims[0];
      expect(entry.claimant.reliability).toEqual({ completed: 0, noShows: 1 });
    });
  });

  describe('GET /api/claims/mine', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await api('/api/claims/mine');

      expect(response.status, response.text).toBe(401);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('UNAUTHORIZED');
    });

    it("returns the caller's own claims with the item summary, newest first", async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const stranger = await signIn();

      const firstItem = await seedItem(giver.userId);
      const secondItem = await seedItem(giver.userId);

      const firstClaim = await claimOk(firstItem, claimant.cookie);
      const secondClaim = await claimOk(secondItem, claimant.cookie);
      const strangerClaim = await claimOk(firstItem, stranger.cookie);

      const response = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      const list = parse<MineResponse>(response.text).claims;
      const ids = list.map((entry) => entry.id);

      expect(ids).toEqual([secondClaim, firstClaim]);
      expect(ids).not.toContain(strangerClaim);

      const newest = list[0];
      expect(newest.item.id).toBe(secondItem);
      expect(newest.item.status).toBe('active');
      expect(newest.item.titleHy).toBe('Անվճար բազկաթոռ');
      expect(newest.item.thumbnailUrl).not.toBeNull();
    });

    it("reveals the giver's phone once the claim is approved", async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      const entry = parse<MineResponse>(response.text).claims.find((row) => row.id === claimId);
      expect(entry?.status).toBe('approved');
      expect(entry?.giver.phone).toBe(giver.phone);
    });

    it("tags a direct decline as 'declined'", async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/reject`, {}, giver.cookie)).status).toBe(200);

      const response = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      const entry = parse<MineResponse>(response.text).claims.find((row) => row.id === claimId);
      expect(entry?.status).toBe('rejected');
      expect(entry?.rejectedReason).toBe('declined');
    });

    it("tags the losing side of an approval cascade as 'lost_to_other_claimant'", async () => {
      const giver = await signIn();
      const chosen = await signIn();
      const passedOver = await signIn();
      const itemId = await seedItem(giver.userId);

      const chosenClaim = await claimOk(itemId, chosen.cookie);
      const otherClaim = await claimOk(itemId, passedOver.cookie);

      expect((await post(`/api/claims/${chosenClaim}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await api('/api/claims/mine', { cookie: passedOver.cookie });
      expect(response.status, response.text).toBe(200);

      const entry = parse<MineResponse>(response.text).claims.find((row) => row.id === otherClaim);
      expect(entry?.status).toBe('rejected');
      expect(entry?.rejectedReason).toBe('lost_to_other_claimant');
    });

    it('never includes rejectedReason on a claim that is not rejected', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      await claimOk(itemId, claimant.cookie);

      const response = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      const entry = parse<MineResponse>(response.text).claims[0];
      expect(entry.status).toBe('pending');
      expect(entry.rejectedReason).toBeUndefined();
      expect(response.text).not.toContain('rejectedReason');
    });
  });

  /**
   * The actual substitute for opening a browser. `myClaimStatusKeys()` and
   * the `rejectedReason` plumbing through `GET /api/claims/mine` are unit-
   * and route-tested above, but neither of those proves the my-claims
   * *page* — src/app/[locale]/my/claims/page.tsx — actually puts the right
   * sentence on screen for a real signed-in visitor. This fetches that page
   * over real HTTP, exactly as a browser would, and reads the rendered HTML.
   *
   * `MyClaimsPage` is an `async` Server Component that calls `getMyClaims`
   * directly (no HTTP round trip to itself) and passes the first page into
   * `MyClaimsList` — a `'use client'` component. That directive controls
   * hydration, not whether Next server-renders it: React still renders
   * `MyClaimsList` (and `MyClaimRow` beneath it) to HTML on the very first
   * response, the same as any other component in the tree, and
   * `NextIntlClientProvider` in `[locale]/layout.tsx` supplies `useTranslations`
   * with the full message catalog during that SSR pass without an explicit
   * `messages` prop (next-intl reads it from the request config). So the
   * translated title is present in the initial HTML, before any client-side
   * JavaScript runs — there is no hydration-only text to miss here.
   *
   * The URL has no locale prefix: `src/i18n/routing.ts` sets `hy` as
   * `defaultLocale` with `localePrefix: 'as-needed'`, which gives hy the bare
   * path and only `ru`/`en` a prefix. `src/proxy.ts` (next-intl's middleware,
   * renamed per Next 16.2) rewrites `/my/claims` to locale `hy` when neither
   * the URL, the `NEXT_LOCALE` cookie, nor `Accept-Language` says otherwise —
   * none of which this fetch sets — so `hy.json` is the catalog these
   * assertions check against.
   *
   * `rendersStatusTitle` below exists because a naive `response.text.includes(title)`
   * is not a real check here: the same `NextIntlClientProvider` that lets
   * `MyClaimRow` translate server-side also serializes the *entire* message
   * catalog into a hydration payload later in the same document, so every
   * `myClaims.status.*` string — used on this page or not — is present in
   * the raw response regardless of which one actually rendered. Confirmed by
   * hand: fetching this page for a `declined` claim before `page.tsx` passed
   * `rejectedReason` through to `MyClaimsList` showed the generic
   * `myClaims.status.rejected.*` title in the rendered `<p>`, while the
   * *specific* `rejected_declined` string was still findable elsewhere in the
   * same document, inside that catalog blob — a plain `.toContain()` would
   * have passed on a page showing the wrong copy. Anchoring on `>title</p>`
   * matches the literal DOM MyClaimRow renders and nothing else: the
   * catalog blob is JSON, so every string in it is wrapped in escaped quotes,
   * never a bare `>` immediately before it.
   */
  function rendersStatusTitle(html: string, title: string): boolean {
    return html.includes(`>${title}</p>`);
  }

  describe('my-claims page render', () => {
    it("renders the 'declined' title after a direct reject", async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/reject`, {}, giver.cookie)).status).toBe(200);

      const response = await api('/my/claims', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);
      expect(response.text).toContain('Իմ հայտերը'); // pages.myClaims — confirms this is the right page
      // myClaims.status.rejected_declined.title
      expect(rendersStatusTitle(response.text, 'Հայտը մերժվել է'), response.text).toBe(true);
    });

    it("renders the 'lost to another claimant' title for the losing side of an approval", async () => {
      const giver = await signIn();
      const chosen = await signIn();
      const passedOver = await signIn();
      const itemId = await seedItem(giver.userId);

      const chosenClaim = await claimOk(itemId, chosen.cookie);
      await claimOk(itemId, passedOver.cookie);

      expect((await post(`/api/claims/${chosenClaim}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await api('/my/claims', { cookie: passedOver.cookie });
      expect(response.status, response.text).toBe(200);
      expect(response.text).toContain('Իմ հայտերը');
      // myClaims.status.rejected_lost.title
      expect(rendersStatusTitle(response.text, 'Տրվել է ուրիշին'), response.text).toBe(true);
    });

    it("renders the 'listing taken down' title when the item is deleted with a pending claim", async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      await claimOk(itemId, claimant.cookie);

      expect((await del(`/api/items/${itemId}`, giver.cookie)).status).toBe(200);

      const response = await api('/my/claims', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);
      expect(response.text).toContain('Իմ հայտերը');
      // myClaims.status.rejected_removed.title
      expect(rendersStatusTitle(response.text, 'Հայտարարությունը հանվել է'), response.text).toBe(
        true,
      );
    });
  });

  /**
   * The non-negotiable rule (CLAUDE.md, DECISIONS.md): a phone number appears
   * in exactly one situation — an approved claim, returned to the two parties.
   * Every other path omits it, and omits the word entirely, so there is not
   * even a null field a client could come to depend on.
   */
  describe('phone privacy', () => {
    it('never returns a phone from the claim creation response', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);

      const response = await claim(itemId, claimant.cookie, 'Բարև');
      expect(response.status, response.text).toBe(201);

      expectNoPhone(response, giver.phone);
      expectNoPhone(response, claimant.phone);
    });

    it('never returns a claimant phone in the claim list while claims are pending', async () => {
      const giver = await signIn();
      const first = await signIn();
      const second = await signIn();
      const itemId = await seedItem(giver.userId);

      await claimOk(itemId, first.cookie);
      await claimOk(itemId, second.cookie);

      const response = await api(`/api/items/${itemId}/claims`, { cookie: giver.cookie });
      expect(response.status, response.text).toBe(200);

      expectNoPhone(response, first.phone);
      expectNoPhone(response, second.phone);
    });

    it('never returns a phone for a rejected claim in the claim list', async () => {
      const giver = await signIn();
      const chosen = await signIn();
      const passedOver = await signIn();
      const itemId = await seedItem(giver.userId);

      const chosenClaim = await claimOk(itemId, chosen.cookie);
      await claimOk(itemId, passedOver.cookie);

      expect((await post(`/api/claims/${chosenClaim}/approve`, {}, giver.cookie)).status).toBe(200);

      const response = await api(`/api/items/${itemId}/claims`, { cookie: giver.cookie });
      expect(response.status, response.text).toBe(200);

      const list = parse<ClaimListResponse>(response.text).claims;
      const approved = list.find((entry) => entry.status === 'approved');
      const rejected = list.find((entry) => entry.status === 'rejected');

      // The approved claimant's phone is the one thing that is allowed through.
      expect(approved?.claimant.phone).toBe(chosen.phone);

      // The person who was passed over stays a stranger.
      expect(rejected?.claimant.phone).toBeUndefined();
      expect(response.text).not.toContain(passedOver.phone);
      expect(response.text).not.toContain(passedOver.phone.slice(4));
    });

    it('never returns a giver phone in /api/claims/mine for a pending claim', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      await claimOk(itemId, claimant.cookie);

      const response = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(response.status, response.text).toBe(200);

      expectNoPhone(response, giver.phone);
      expectNoPhone(response, claimant.phone);
    });

    it('stops revealing the phone once an approved claim is withdrawn', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await claimOk(itemId, claimant.cookie);

      expect((await post(`/api/claims/${claimId}/approve`, {}, giver.cookie)).status).toBe(200);
      expect((await post(`/api/claims/${claimId}/withdraw`, {}, claimant.cookie)).status).toBe(200);

      const mine = await api('/api/claims/mine', { cookie: claimant.cookie });
      expect(mine.status, mine.text).toBe(200);
      expectNoPhone(mine, giver.phone);

      const list = await api(`/api/items/${itemId}/claims`, { cookie: giver.cookie });
      expect(list.status, list.text).toBe(200);
      expectNoPhone(list, claimant.phone);
    });
  });
});
