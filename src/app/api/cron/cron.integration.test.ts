import { eq, inArray, or } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ItemStatus } from '@/db/schema';

/**
 * Real route, real Neon, no mocks (CLAUDE.md).
 *
 * The sweep is the only thing standing between this platform and the graveyard
 * of free-item boards that came before it (DECISIONS.md), and it is the one
 * endpoint no human ever looks at — nobody notices it has quietly stopped
 * working. So the states it must act on are set up here the way they actually
 * arise: an item is claimed and approved over HTTP, and only the clock is
 * faked, by backdating `reserved_until` / `expires_at` in the database.
 *
 * Items are seeded in-process through `createItem` with an R2 stub, as in the
 * items and claims suites — the integration server runs on throwaway R2
 * config, but the rows are real rows on the branch the server reads.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

// createItem runs in this worker, so it needs the same read base the server
// uses to build image URLs. `??=` never overrides a real value from .env.local.
process.env.R2_PUBLIC_URL ??= 'https://images.dzri.test';

// Must match the default in vitest.integration.setup.mts, which is what the
// server process is running with. `??=` so a real .env.local secret wins on
// both sides at once.
process.env.CRON_SECRET ??= 'integration-test-cron-secret';

const CRON_SECRET = process.env.CRON_SECRET;

const OTP_TTL_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type VerifySuccess = { isNewUser: false; user: { id: string; displayName: string } };
type ClaimCreated = { id: string; status: string };

type SweepSummary = {
  reservationsReleased: number;
  noShowsRecorded: number;
  itemsExpired: number;
  otpCodesDeleted: number;
  durationMs: number;
};

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

describe.skipIf(!hasDatabase)('cron sweep', () => {
  const createdPhones = new Set<string>();
  const createdOtpIds = new Set<number>();

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
      .values({ slug: `cron-cat-${suffix}`, nameHy: 'Թեստ', nameRu: 'Тест', nameEn: 'Test' })
      .returning({ id: categories.id });
    const [district] = await db
      .insert(districts)
      .values({
        slug: `cron-dist-${suffix}`,
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
   * Items go before their owners: `items.reserved_for` references users with
   * no ON DELETE action, so a reservation pins its claimant and deleting both
   * users at once could trip the constraint. Dropping the items first cascades
   * their claims away and clears the reference. Runs even after a failure.
   */
  afterEach(async () => {
    if (createdOtpIds.size > 0) {
      const ids = [...createdOtpIds];
      createdOtpIds.clear();
      await db.delete(otpCodes).where(inArray(otpCodes.id, ids));
    }

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

  async function api(path: string, init?: RequestInit & { cookie?: string }): Promise<ApiResponse> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        // Each call presents as a different client so logically separate users
        // never share one per-IP budget.
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.9`,
        ...(init?.cookie ? { cookie: init.cookie } : {}),
        ...init?.headers,
      },
    });

    return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie() };
  }

  function post(path: string, body: unknown, cookie?: string): Promise<ApiResponse> {
    return api(path, { method: 'POST', body: JSON.stringify(body), cookie });
  }

  /** Signs a fresh user in and returns their cookie and id. */
  async function signIn(): Promise<{ cookie: string; userId: string; phone: string }> {
    const phone = testPhone();
    const code = '123456';

    await db.insert(otpCodes).values({
      phone,
      codeHash: hashOtpCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const response = await post('/api/auth/otp/verify', { phone, code, displayName: 'Թեստ' });
    expect(response.status, response.text).toBe(200);

    const cookie = response.cookies.find((v) => v.startsWith('dzri_session='))?.split(';')[0];
    expect(cookie, 'verify must set a session cookie').toBeDefined();

    return { cookie: cookie ?? '', userId: parse<VerifySuccess>(response.text).user.id, phone };
  }

  /** Seeds one item through `createItem`, then forces it into `status`. */
  async function seedItem(userId: string, status: ItemStatus = 'active'): Promise<string> {
    const result = await createItem(
      {
        userId,
        title: 'Անվճար բազկաթոռ',
        description: 'Լավ վիճակում',
        categoryId,
        districtId,
        condition: 'working',
        pickupNotes: null,
        imageKeys: [`uploads/${userId}/seed.jpg`],
      },
      objectAlwaysExists,
    );
    if (!result.ok) throw new Error(`seedItem could not create the row: ${result.code}`);

    if (status !== 'pending_review') {
      await db.update(items).set({ status }).where(eq(items.id, result.id));
    }

    return result.id;
  }

  /**
   * The real path into `reserved`: the claimant claims, the giver approves.
   * Nothing here forces a status, so the state under test is the state the
   * application actually produces.
   */
  async function reserve(
    giver: { cookie: string },
    claimant: { cookie: string },
    itemId: string,
  ): Promise<string> {
    const created = await post(`/api/items/${itemId}/claims`, {}, claimant.cookie);
    expect(created.status, created.text).toBe(201);

    const claimId = parse<ClaimCreated>(created.text).id;

    const approved = await post(`/api/claims/${claimId}/approve`, {}, giver.cookie);
    expect(approved.status, approved.text).toBe(200);

    return claimId;
  }

  /** Only the clock is faked. Moves the collection window into the past. */
  async function backdate(
    itemId: string,
    columns: { reservedUntil?: Date; expiresAt?: Date },
  ): Promise<void> {
    await db.update(items).set(columns).where(eq(items.id, itemId));
  }

  async function itemRow(id: string) {
    const [row] = await db
      .select({
        status: items.status,
        reservedFor: items.reservedFor,
        reservedUntil: items.reservedUntil,
      })
      .from(items)
      .where(eq(items.id, id));

    return row;
  }

  async function claimStatus(id: string): Promise<string> {
    const [row] = await db.select({ status: claims.status }).from(claims).where(eq(claims.id, id));

    return row.status;
  }

  /** Inserts an OTP row with a chosen expiry, tracked for cleanup. */
  async function seedOtpRow(expiresAt: Date): Promise<number> {
    const phone = testPhone();

    const [row] = await db
      .insert(otpCodes)
      .values({ phone, codeHash: hashOtpCode(phone, '123456'), expiresAt })
      .returning({ id: otpCodes.id });

    createdOtpIds.add(row.id);
    return row.id;
  }

  async function otpRowExists(id: number): Promise<boolean> {
    const rows = await db.select({ id: otpCodes.id }).from(otpCodes).where(eq(otpCodes.id, id));

    return rows.length > 0;
  }

  function sweep(token: string | null = CRON_SECRET): Promise<ApiResponse> {
    return api('/api/cron/sweep', {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });
  }

  /** Runs the sweep, asserts it was authorized, and returns the summary. */
  async function sweepOk(): Promise<SweepSummary> {
    const response = await sweep();
    expect(response.status, response.text).toBe(200);

    return parse<SweepSummary>(response.text);
  }

  describe('auth', () => {
    /**
     * 404, never 401 — an anonymous caller must not learn the endpoint is
     * there at all (CLAUDE.md, and the same rule as the admin surface).
     */
    it('returns 404 for a missing, malformed or wrong bearer token', async () => {
      const attempts: (string | null)[] = [
        null, // no Authorization header
        '',
        'wrong-secret',
        `${CRON_SECRET}x`,
        CRON_SECRET.slice(0, -1),
      ];

      for (const token of attempts) {
        const response = await sweep(token);

        expect(response.status, `${token}: ${response.text}`).toBe(404);
        expect(parse<ApiErrorBody>(response.text).error.code).toBe('NOT_FOUND');
      }
    });

    it('rejects the secret presented without the Bearer scheme', async () => {
      const response = await api('/api/cron/sweep', { headers: { authorization: CRON_SECRET } });

      expect(response.status, response.text).toBe(404);
    });

    it('runs for the correct token', async () => {
      const summary = await sweepOk();

      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stale reservations', () => {
    it('releases the item and marks the approved claim no_show', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await reserve(giver, claimant, itemId);

      expect((await itemRow(itemId)).status).toBe('reserved');

      await backdate(itemId, { reservedUntil: new Date(Date.now() - HOUR_MS) });

      const summary = await sweepOk();
      expect(summary.reservationsReleased).toBeGreaterThanOrEqual(1);
      expect(summary.noShowsRecorded).toBeGreaterThanOrEqual(1);

      // Back on the feed, with nothing left pointing at the person who never
      // came — this is the listing being rescued, not just tidied.
      const item = await itemRow(itemId);
      expect(item.status).toBe('active');
      expect(item.reservedFor).toBeNull();
      expect(item.reservedUntil).toBeNull();

      // They were picked, everyone else was turned away, and they did not
      // collect. That is what no_show means.
      expect(await claimStatus(claimId)).toBe('no_show');
    });

    it('feeds the sweep no_show into user_reliability', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);

      await reserve(giver, claimant, itemId);
      await backdate(itemId, { reservedUntil: new Date(Date.now() - HOUR_MS) });

      await sweepOk();

      // A no-show the sweep records has to count exactly like one a giver taps
      // in by hand: it is the same fact about the same person, and this view is
      // what the next giver sees before choosing between strangers.
      const [reliability] = await db
        .select({ completed: userReliability.completed, noShows: userReliability.noShows })
        .from(userReliability)
        .where(eq(userReliability.id, claimant.userId));

      expect(reliability.noShows).toBe(1);
      expect(reliability.completed).toBe(0);
    });

    it('leaves a reservation still inside its window alone', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await reserve(giver, claimant, itemId);

      const before = await itemRow(itemId);

      await sweepOk();

      // Somebody is on their way to collect this. Releasing it early would
      // hand their item to the next person to tap.
      const after = await itemRow(itemId);
      expect(after.status).toBe('reserved');
      expect(after.reservedFor).toBe(claimant.userId);
      expect(after.reservedUntil?.getTime()).toBe(before.reservedUntil?.getTime());

      expect(await claimStatus(claimId)).toBe('approved');
    });
  });

  describe('stale items', () => {
    it('expires an active item past expires_at', async () => {
      const giver = await signIn();
      const itemId = await seedItem(giver.userId);

      await backdate(itemId, { expiresAt: new Date(Date.now() - HOUR_MS) });

      const summary = await sweepOk();
      expect(summary.itemsExpired).toBeGreaterThanOrEqual(1);

      expect((await itemRow(itemId)).status).toBe('expired');
    });

    it('leaves an item inside its 30 days alone', async () => {
      const giver = await signIn();
      const itemId = await seedItem(giver.userId);

      await sweepOk();

      expect((await itemRow(itemId)).status).toBe('active');
    });

    /**
     * The reason expiry runs after the release, not before: an item whose
     * reservation lapsed is judged on its own expiry in the same run. Left the
     * other way round it would sit back on the feed, already dead, until the
     * next hour.
     */
    it('releases and then expires the same item in a single run', async () => {
      const giver = await signIn();
      const claimant = await signIn();
      const itemId = await seedItem(giver.userId);
      const claimId = await reserve(giver, claimant, itemId);

      await backdate(itemId, {
        reservedUntil: new Date(Date.now() - HOUR_MS),
        expiresAt: new Date(Date.now() - HOUR_MS),
      });

      await sweepOk();

      const item = await itemRow(itemId);
      expect(item.status).toBe('expired');
      expect(item.reservedFor).toBeNull();
      expect(item.reservedUntil).toBeNull();

      // The listing died, but the person who did not turn up is still on the
      // hook for it.
      expect(await claimStatus(claimId)).toBe('no_show');
    });
  });

  describe('stale otp codes', () => {
    it('deletes rows expired over 24 hours ago and keeps the rest', async () => {
      const longDead = await seedOtpRow(new Date(Date.now() - 25 * HOUR_MS));
      const recentlyDead = await seedOtpRow(new Date(Date.now() - HOUR_MS));
      const live = await seedOtpRow(new Date(Date.now() + OTP_TTL_MS));

      const summary = await sweepOk();
      expect(summary.otpCodesDeleted).toBeGreaterThanOrEqual(1);

      // These are peppered hashes of a credential; there is no reason to keep
      // one that can never be verified again.
      expect(await otpRowExists(longDead)).toBe(false);

      // The 24-hour tail is deliberate — a code that failed an hour ago is
      // still worth being able to look at.
      expect(await otpRowExists(recentlyDead)).toBe(true);
      expect(await otpRowExists(live)).toBe(true);
    });
  });

  describe('idempotence', () => {
    /**
     * It will be called more than once — a retried workflow, an overlapping
     * run, somebody curling it by hand. Every write is a conditional update
     * guarded on the status it expects, so the second pass has nothing left
     * to match.
     */
    it('changes nothing on a second run', async () => {
      const giver = await signIn();
      const claimant = await signIn();

      const lapsed = await seedItem(giver.userId);
      const claimId = await reserve(giver, claimant, lapsed);
      await backdate(lapsed, { reservedUntil: new Date(Date.now() - HOUR_MS) });

      const overdue = await seedItem(giver.userId);
      await backdate(overdue, { expiresAt: new Date(Date.now() - HOUR_MS) });

      const untouched = await seedItem(giver.userId);
      const longDead = await seedOtpRow(new Date(Date.now() - 25 * HOUR_MS));

      const first = await sweepOk();
      expect(first.reservationsReleased).toBeGreaterThanOrEqual(1);
      expect(first.itemsExpired).toBeGreaterThanOrEqual(1);
      expect(first.otpCodesDeleted).toBeGreaterThanOrEqual(1);

      const afterFirst = await itemRow(lapsed);

      const second = await sweepOk();
      expect(second.reservationsReleased).toBe(0);
      expect(second.noShowsRecorded).toBe(0);
      expect(second.itemsExpired).toBe(0);
      expect(second.otpCodesDeleted).toBe(0);

      // Nothing moved on again: no double no-show, no released item swept
      // into `expired` on its way past.
      const afterSecond = await itemRow(lapsed);
      expect(afterSecond.status).toBe(afterFirst.status);
      expect(afterSecond.reservedFor).toBeNull();

      expect(await claimStatus(claimId)).toBe('no_show');
      expect((await itemRow(overdue)).status).toBe('expired');
      expect((await itemRow(untouched)).status).toBe('active');
      expect(await otpRowExists(longDead)).toBe(false);
    });
  });
});
