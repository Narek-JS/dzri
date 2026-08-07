import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ItemStatus } from '@/db/schema';

/**
 * Real routes, real Neon, no mocks (CLAUDE.md).
 *
 * As in the items suite, `createItem` verifies each image key against R2, and
 * the integration server runs on throwaway R2 config, so items are seeded
 * in-process through `createItem` with a stub that reports every object
 * present — while still writing real rows to the same Neon branch the server
 * reads. Everything an admin request does over HTTP hits the real handlers.
 *
 * Admins are seeded the only way the product allows: by flipping `is_admin`
 * on an existing user (the `db:make-admin` path), never through the API.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

// createItem runs in this worker, so it needs the same read base the server
// uses to build image URLs. `??=` never overrides a real value from .env.local.
process.env.R2_PUBLIC_URL ??= 'https://images.dzri.test';

const OTP_TTL_MS = 5 * 60 * 1000;

type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };

type PendingItem = {
  id: string;
  title: string;
  createdAt: string;
  images: string[];
  giver: { displayName: string; approvedCount: number; rejectedCount: number };
};
type PendingResponse = { items: PendingItem[]; nextCursor: string | null };

type StatsResponse = {
  counts: Record<string, number>;
  pendingCount: number;
  oldestPendingAt: string | null;
  oldestPendingAgeSeconds: number | null;
};

type MineItem = { id: string; status: string; rejectionReason: string | null };
type MineResponse = { items: MineItem[]; nextCursor: string | null };

type FeedItem = { id: string };
type FeedResponse = { items: FeedItem[]; nextCursor: string | null };

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
let categories: (typeof import('@/db/schema'))['categories'];
let districts: (typeof import('@/db/schema'))['districts'];
let hashOtpCode: (typeof import('@/lib/auth/otp'))['hashOtpCode'];
let createItem: (typeof import('@/lib/items/create'))['createItem'];

const objectAlwaysExists = async (): Promise<boolean> => true;

describe.skipIf(!hasDatabase)('admin API', () => {
  const createdPhones = new Set<string>();

  let categoryId: number;
  let districtId: number;
  let districtSlug: string;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ users, otpCodes, items, categories, districts } = await import('@/db/schema'));
    ({ hashOtpCode } = await import('@/lib/auth/otp'));
    ({ createItem } = await import('@/lib/items/create'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const categorySlug = `admin-cat-${suffix}`;
    districtSlug = `admin-dist-${suffix}`;

    const [category] = await db
      .insert(categories)
      .values({ slug: categorySlug, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' })
      .returning({ id: categories.id });
    const [district] = await db
      .insert(districts)
      .values({
        slug: districtSlug,
        nameHy: 'Թեստ',
        nameRu: 'Тест',
        nameEn: 'Test',
        region: 'yerevan',
      })
      .returning({ id: districts.id });

    categoryId = category.id;
    districtId = district.id;
  });

  // Deleting a user cascades to the items they own, but `items.reviewed_by`
  // has no cascade — an approved/rejected item pins the admin who reviewed it.
  // So delete every item these users own or reviewed first, then the users.
  // Runs even after a failed test.
  afterEach(async () => {
    if (createdPhones.size === 0) return;

    const phones = [...createdPhones];
    createdPhones.clear();

    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.phone, phones));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await db.delete(items).where(or(inArray(items.userId, ids), inArray(items.reviewedBy, ids)));
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
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`,
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
    expect(response.text).not.toContain(phone);
    expect(response.text).not.toContain(phone.slice(1));
    expect(response.text).not.toContain(phone.slice(4));
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

  /** A signed-in user who has since been granted is_admin, as db:make-admin does. */
  async function signInAdmin(): Promise<{ cookie: string; userId: string; phone: string }> {
    const admin = await signIn();
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.userId));
    return admin;
  }

  function ownedKey(userId: string, name: string): string {
    return `uploads/${userId}/${name}`;
  }

  /**
   * Seeds one item through `createItem` (in-process, with the R2 stub), which
   * writes `pending_review` under the default moderation mode. `status` and
   * `createdAt` overrides are applied with a follow-up update, exactly as the
   * moderation flow and the cron sweep reach other states.
   */
  async function seedItem(
    userId: string,
    status: ItemStatus = 'pending_review',
    overrides: { createdAt?: Date } = {},
  ): Promise<string> {
    const result = await createItem(
      {
        userId,
        title: 'Ապրանք',
        description: 'Նկարագրություն',
        categoryId,
        districtId,
        condition: 'working',
        pickupNotes: '3-րդ հարկ',
        images: [
          {
            key: ownedKey(userId, 'seed.jpg'),
            thumbKey: ownedKey(userId, 'seed-thumb.jpg'),
            width: 1200,
            height: 900,
            blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
          },
        ],
      },
      objectAlwaysExists,
    );
    if (!result.ok) throw new Error(`seedItem could not create the row: ${result.code}`);

    if (status !== 'pending_review' || overrides.createdAt) {
      await db
        .update(items)
        .set({
          status,
          rejectionReason: status === 'rejected' ? 'Չի համապատասխանում' : null,
          reservedFor: status === 'reserved' ? userId : null,
          ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
        })
        .where(eq(items.id, result.id));
    }

    return result.id;
  }

  describe('admin access control', () => {
    it('returns 404 to an anonymous caller on every admin route', async () => {
      const someId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

      const responses = await Promise.all([
        api('/api/admin/items/pending'),
        api('/api/admin/stats'),
        post(`/api/admin/items/${someId}/approve`, {}),
        post(`/api/admin/items/${someId}/reject`, { reason: 'not allowed anyway' }),
      ]);

      for (const response of responses) {
        expect(response.status, response.text).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('NOT_FOUND');
      }
    });

    it('returns 404 to a logged-in non-admin on every admin route', async () => {
      const { cookie } = await signIn();
      const someId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

      const responses = await Promise.all([
        api('/api/admin/items/pending', { cookie }),
        api('/api/admin/stats', { cookie }),
        post(`/api/admin/items/${someId}/approve`, {}, cookie),
        post(`/api/admin/items/${someId}/reject`, { reason: 'not allowed anyway' }, cookie),
      ]);

      for (const response of responses) {
        expect(response.status, response.text).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('GET /api/admin/items/pending', () => {
    it('returns pending items oldest first and excludes non-pending ones', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();

      const hour = 60 * 60 * 1000;
      const oldest = await seedItem(giver.userId, 'pending_review', {
        createdAt: new Date(Date.now() - 3 * hour),
      });
      const middle = await seedItem(giver.userId, 'pending_review', {
        createdAt: new Date(Date.now() - 2 * hour),
      });
      const newest = await seedItem(giver.userId, 'pending_review', {
        createdAt: new Date(Date.now() - 1 * hour),
      });
      const active = await seedItem(giver.userId, 'active');

      const response = await api('/api/admin/items/pending', { cookie: admin.cookie });
      expect(response.status, response.text).toBe(200);

      const returnedIds = parse<PendingResponse>(response.text).items.map((item) => item.id);

      // A non-pending item is never in the queue.
      expect(returnedIds).not.toContain(active);

      // Our three pending items appear, and in oldest-first order relative to
      // one another (other suites' rows are cleaned up between tests).
      const ours = returnedIds.filter((id) => [oldest, middle, newest].includes(id));
      expect(ours).toEqual([oldest, middle, newest]);
    });

    it("carries the giver's prior approved and rejected counts", async () => {
      const admin = await signInAdmin();
      const giver = await signIn();

      // Prior history: one approved (active + reviewed) and one rejected.
      await seedItem(giver.userId, 'active');
      await db
        .update(items)
        .set({ reviewedAt: new Date(), reviewedBy: admin.userId })
        .where(eq(items.userId, giver.userId));
      await seedItem(giver.userId, 'rejected');

      // The item now under review.
      const pending = await seedItem(giver.userId, 'pending_review');

      const response = await api('/api/admin/items/pending', { cookie: admin.cookie });
      expect(response.status, response.text).toBe(200);

      const row = parse<PendingResponse>(response.text).items.find((item) => item.id === pending);
      expect(row?.giver.approvedCount).toBe(1);
      expect(row?.giver.rejectedCount).toBe(1);
    });

    it('never includes a phone number in the response', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      await seedItem(giver.userId, 'pending_review');

      const response = await api('/api/admin/items/pending', { cookie: admin.cookie });
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, giver.phone);
      expectNoPhone(response, admin.phone);
    });
  });

  describe('POST /api/admin/items/[id]/approve', () => {
    it('moves pending_review to active and pushes expiresAt ~30 days out', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'pending_review');

      const response = await post(`/api/admin/items/${id}/approve`, {}, admin.cookie);
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, giver.phone);

      const [row] = await db
        .select({ status: items.status, expiresAt: items.expiresAt, reviewedBy: items.reviewedBy })
        .from(items)
        .where(eq(items.id, id));

      expect(row.status).toBe('active');
      expect(row.reviewedBy).toBe(admin.userId);
      // 30 days from now, minus a generous margin for review clock skew.
      const twentyNineDays = Date.now() + 29 * 24 * 60 * 60 * 1000;
      expect(row.expiresAt.getTime()).toBeGreaterThan(twentyNineDays);
    });

    it('appears in the public feed once approved', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'pending_review');

      const before = await api(`/api/items?district=${districtSlug}`);
      expect(parse<FeedResponse>(before.text).items.map((i) => i.id)).not.toContain(id);

      const approve = await post(`/api/admin/items/${id}/approve`, {}, admin.cookie);
      expect(approve.status, approve.text).toBe(200);

      const after = await api(`/api/items?district=${districtSlug}`);
      expect(after.status, after.text).toBe(200);
      expect(parse<FeedResponse>(after.text).items.map((i) => i.id)).toContain(id);
    });

    it('returns INVALID_STATUS_TRANSITION when approving an already-approved item', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'pending_review');

      const first = await post(`/api/admin/items/${id}/approve`, {}, admin.cookie);
      expect(first.status, first.text).toBe(200);

      const second = await post(`/api/admin/items/${id}/approve`, {}, admin.cookie);
      expect(second.status, second.text).toBe(409);
      expect(parse<ApiErrorBody>(second.text).error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('POST /api/admin/items/[id]/reject', () => {
    it('requires a reason', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'pending_review');

      const response = await post(`/api/admin/items/${id}/reject`, {}, admin.cookie);
      expect(response.status, response.text).toBe(400);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_BODY');
    });

    it('stores the reason and surfaces it to the giver in /api/items/mine', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'pending_review');

      const reason = 'Նկարը հստակ չէ, խնդրում ենք վերբեռնել ավելի պարզ լուսանկար';
      const response = await post(`/api/admin/items/${id}/reject`, { reason }, admin.cookie);
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, giver.phone);

      const mine = await api('/api/items/mine', { cookie: giver.cookie });
      expect(mine.status, mine.text).toBe(200);

      const row = parse<MineResponse>(mine.text).items.find((item) => item.id === id);
      expect(row?.status).toBe('rejected');
      // Stored verbatim, not truncated.
      expect(row?.rejectionReason).toBe(reason);
    });

    it('returns INVALID_STATUS_TRANSITION for a non-pending item', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();
      const id = await seedItem(giver.userId, 'active');

      const response = await post(
        `/api/admin/items/${id}/reject`,
        { reason: 'too late, already active' },
        admin.cookie,
      );
      expect(response.status, response.text).toBe(409);
      expect(parse<ApiErrorBody>(response.text).error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('GET /api/admin/stats', () => {
    it('counts by status and reports the oldest pending age', async () => {
      const admin = await signInAdmin();
      const giver = await signIn();

      const hour = 60 * 60 * 1000;
      await seedItem(giver.userId, 'pending_review', {
        createdAt: new Date(Date.now() - 5 * hour),
      });
      await seedItem(giver.userId, 'pending_review');
      await seedItem(giver.userId, 'active');

      const response = await api('/api/admin/stats', { cookie: admin.cookie });
      expect(response.status, response.text).toBe(200);
      expectNoPhone(response, giver.phone);

      const body = parse<StatsResponse>(response.text);
      // At least our two pending and one active are reflected (the branch may
      // carry other rows, so assert lower bounds).
      expect(body.counts.pending_review).toBeGreaterThanOrEqual(2);
      expect(body.counts.active).toBeGreaterThanOrEqual(1);
      expect(body.pendingCount).toBe(body.counts.pending_review);
      expect(body.oldestPendingAt).not.toBeNull();
      // The 5-hour-old item makes the oldest pending age at least ~5 hours.
      expect(body.oldestPendingAgeSeconds ?? 0).toBeGreaterThanOrEqual(4 * 60 * 60);
    });
  });
});
