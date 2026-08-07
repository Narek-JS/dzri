import { NextResponse } from 'next/server';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getSession, requireUser } from '@/lib/auth/session';
import { db } from '@/db';
import { categories, claims, districts, itemImages, items, users } from '@/db/schema';
import { apiError } from '@/lib/http';
import { removeItem } from '@/lib/items/remove';

/**
 * A public detail response is identical for everyone, so it lands in the same
 * short shared cache as the feed. Every privileged view — the owner's of a
 * pending or rejected item, the claimant's of an item reserved for them — must
 * never be cached, so those paths are `no-store, private`.
 */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const PRIVATE_CACHE = 'no-store, private';

/** The claim statuses that entitle their holder to keep reading the item. */
const ENTITLED_CLAIM_STATUSES = ['approved', 'completed'] as const;

/**
 * GET /api/items/[id] — a single listing.
 *
 * PUBLIC when the item is `active` and unexpired. Two people may also read it
 * outside that window:
 *
 *  - the OWNER, in *any* status, so they can see their own listing while it is
 *    pending or rejected;
 *  - a CLAIMANT holding an `approved` or `completed` claim on it, also in any
 *    status. Approving a claim moves the item to `reserved`, so without this
 *    the claimant's own approved claim dead-ends at a 404 the instant they are
 *    picked — the one moment they most need to look at what they are collecting
 *    and where from. A `completed` claim keeps reading it afterwards, because
 *    the record of what changed hands should not evaporate on handover.
 *
 * A rejected or withdrawn claimant gets nothing: they held a claim once, and
 * that is not entitlement to a listing that is no longer public.
 *
 * Nobody else can see a non-active item, and they get a 404, not a 403: a 403
 * would confirm the id exists, leaking that someone posted something that was
 * rejected. An invalid uuid is the same 404 — a bad path must not 500.
 *
 * The giver's `displayName` and `avatarUrl` are the only user fields returned.
 * The phone is never selected here, for anyone — not the owner, and not the
 * approved claimant, who already has it from `GET /api/claims/mine` (CLAUDE.md
 * Rule 1 lists three phone-bearing endpoints, and this must not become a
 * fourth).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // An invalid uuid can never match a row; short-circuit to 404 rather than
  // letting a malformed value reach the database and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('ITEM_NOT_FOUND');
  }

  // Cookie-only, so the anonymous path stays a single query with no session
  // round trip. We only need the id to decide ownership.
  const session = await getSession();

  const [row] = await db
    .select({
      id: items.id,
      userId: items.userId,
      title: items.title,
      description: items.description,
      condition: items.condition,
      pickupNotes: items.pickupNotes,
      status: items.status,
      createdAt: items.createdAt,
      expiresAt: items.expiresAt,
      district: {
        slug: districts.slug,
        nameHy: districts.nameHy,
        nameRu: districts.nameRu,
        nameEn: districts.nameEn,
      },
      category: {
        slug: categories.slug,
        nameHy: categories.nameHy,
        nameRu: categories.nameRu,
        nameEn: categories.nameEn,
      },
      giver: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .innerJoin(users, eq(items.userId, users.id))
    .where(eq(items.id, id))
    .limit(1);

  if (!row) {
    return apiError('ITEM_NOT_FOUND');
  }

  const isOwner = session?.userId === row.userId;
  const isPublic = row.status === 'active' && row.expiresAt.getTime() > Date.now();

  // Only asked when it can change the answer: a signed-in stranger looking at
  // an item that is not public. The anonymous path and the ordinary public
  // path stay exactly as cheap as they were.
  const isEntitledClaimant =
    !isOwner && !isPublic && session ? await hasEntitlingClaim(id, session.userId) : false;

  // Anyone who is not the owner or an entitled claimant may see only a live,
  // active listing. Everything else is a 404 to them — never a 403.
  if (!isOwner && !isPublic && !isEntitledClaimant) {
    return apiError('ITEM_NOT_FOUND');
  }

  // The owner and the claimant both get a response nobody else may see, so
  // neither may land in a shared cache. A `reserved` item in particular is
  // visible to exactly one person.
  const isPrivateView = isOwner || isEntitledClaimant;

  // A gallery, not a list view, so it gets both: `thumbUrl` for the strip and
  // the first paint, `url` for the full-size view. `thumbUrl` is null on rows
  // written before the two-variant pipeline — the client falls back to `url`,
  // which is what it had to use for everything before this existed.
  const images = await db
    .select({
      url: itemImages.url,
      thumbUrl: itemImages.thumbUrl,
      width: itemImages.width,
      height: itemImages.height,
      blurhash: itemImages.blurhash,
      position: itemImages.position,
    })
    .from(itemImages)
    .where(eq(itemImages.itemId, id))
    .orderBy(asc(itemImages.position));

  // View count is a measure of public interest, so it only moves on a public
  // fetch — never when the owner looks at their own listing, and never when the
  // person who was picked opens it for the tenth time on their way over, or the
  // number means nothing. Guard on `status = 'active'` too so a race that flips
  // the item out of active between the read and the write cannot bump a
  // non-visible row.
  if (!isPrivateView) {
    await db
      .update(items)
      .set({ viewCount: sql`${items.viewCount} + 1` })
      .where(and(eq(items.id, id), eq(items.status, 'active')));
  }

  return NextResponse.json(
    {
      item: {
        id: row.id,
        title: row.title,
        description: row.description,
        condition: row.condition,
        pickupNotes: row.pickupNotes,
        status: row.status,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        images,
        district: row.district,
        category: row.category,
        giver: row.giver,
      },
    },
    { headers: { 'Cache-Control': isPrivateView ? PRIVATE_CACHE : PUBLIC_CACHE } },
  );
}

/**
 * Does this user hold a claim on this item that entitles them to keep reading
 * it after it stops being public?
 *
 * `approved` and `completed` only. A rejected or withdrawn claimant is a
 * stranger again — they asked once and it did not happen, which is not a key
 * to a listing that is no longer on the feed.
 *
 * Selects nothing but a literal: the answer is the existence of the row, and
 * selecting a column here would put claim data on a code path whose response
 * has no business carrying any.
 */
async function hasEntitlingClaim(itemId: string, userId: string): Promise<boolean> {
  const [claim] = await db
    .select({ present: sql<number>`1` })
    .from(claims)
    .where(
      and(
        eq(claims.itemId, itemId),
        eq(claims.userId, userId),
        inArray(claims.status, ENTITLED_CLAIM_STATUSES),
      ),
    )
    .limit(1);

  return Boolean(claim);
}

/**
 * DELETE /api/items/[id] — the giver takes their own listing down.
 *
 * OWNER ONLY. Anybody else — signed in or not — gets 404, the same answer the
 * read path gives them, so a stranger cannot learn that an id names a real
 * item by trying to delete it.
 *
 * Soft delete: the item moves to `removed`, which hides it everywhere, but the
 * row, its images and its R2 objects all stay. See `removeItem` for why, and
 * for why `reserved`, `given` and `expired` are refused with
 * INVALID_STATUS_TRANSITION rather than removed — an item somebody is on their
 * way to collect must not vanish from under them.
 *
 * `requireUser`, not `getSession`: this acts on the user's behalf and writes,
 * so a banned account must be turned away (it reads `is_banned`).
 *
 * The response is the resolved status rather than a bare 204, so the client can
 * update the row it is showing without a re-fetch.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const { id } = await params;

  // A malformed uuid can never name an item; short-circuit rather than letting
  // it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('ITEM_NOT_FOUND');
  }

  const result = await removeItem(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'removed' },
    { headers: { 'Cache-Control': PRIVATE_CACHE } },
  );
}
