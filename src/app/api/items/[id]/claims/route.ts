import { NextResponse } from 'next/server';

import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { db } from '@/db';
import { claims, items, userReliability, users } from '@/db/schema';
import { apiError, readJson } from '@/lib/http';
import { MAX_CLAIM_MESSAGE_LENGTH, createClaim } from '@/lib/claims/create';
import {
  claimCreatePerIp,
  claimCreatePerUser,
  getClientIp,
  retryAfterHeader,
} from '@/lib/ratelimit';

/** A claimant's own list is private to them — never a shared cache. */
const PRIVATE_CACHE = 'no-store, private';

/**
 * The message is optional: tapping "I want this" with nothing to say is a
 * complete claim. An absent body is therefore not an error, and `{}` and
 * `{ message: null }` mean the same thing.
 */
const createClaimSchema = z.object({
  message: z.string().trim().max(MAX_CLAIM_MESSAGE_LENGTH).nullish(),
});

/**
 * POST /api/items/[id]/claims — "I want this."
 *
 * Auth required. The item must be `active` and unexpired; every other status
 * is ITEM_NOT_FOUND, a 404 and never a 403, so a reserved or rejected listing
 * cannot be distinguished from one that never existed.
 *
 * The response carries the claim id and nothing else that matters — no phone
 * number. At `pending` the two parties are still strangers to each other.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  // Limiters run before the body work (CLAUDE.md). Per-user is the tighter
  // budget, then per-IP.
  const perUser = await claimCreatePerUser().limit(user.id);
  if (!perUser.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perUser.reset) });
  }

  const perIp = await claimCreatePerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const { id } = await params;

  // A malformed uuid can never name an item; short-circuit rather than
  // letting it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('ITEM_NOT_FOUND');
  }

  const parsed = createClaimSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  // Empty strings survive `.trim()` as `''`; store absence as null, not `''`.
  const message = parsed.data.message?.length ? parsed.data.message : null;

  const result = await createClaim({ itemId: id, userId: user.id, message });
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id: result.id, status: 'pending' },
    { status: 201, headers: { 'Cache-Control': PRIVATE_CACHE } },
  );
}

/**
 * GET /api/items/[id]/claims — the giver's decision list.
 *
 * ONLY the item's owner. Everybody else gets 404, not 403: that an item has
 * claims at all is information about somebody else's listing, so the endpoint
 * must not confirm the id exists.
 *
 * Each claimant carries their reliability history — how many handovers they
 * completed, how many times they never turned up. That history is the whole
 * point of the screen: it is what lets a giver choose between three strangers.
 *
 * Oldest first. Whoever asked first should be seen first.
 *
 * PHONE PRIVACY. The phone is emitted by the *database*, in a CASE guarded on
 * `status = 'approved'`, so a pending or rejected row has no phone to leak by
 * the time it reaches this process. The key is then omitted entirely unless it
 * has a value, so a list of pending claims contains no phone field at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const { id } = await params;

  if (!z.string().uuid().safeParse(id).success) {
    return apiError('ITEM_NOT_FOUND');
  }

  const [item] = await db
    .select({ userId: items.userId })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);

  // Missing item and somebody else's item are the same 404.
  if (!item || item.userId !== user.id) {
    return apiError('ITEM_NOT_FOUND');
  }

  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      message: claims.message,
      createdAt: claims.createdAt,
      claimantId: claims.userId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      phone: sql<string | null>`case when ${claims.status} = 'approved' then ${users.phone} end`,
    })
    .from(claims)
    .innerJoin(users, eq(claims.userId, users.id))
    .where(eq(claims.itemId, id))
    .orderBy(asc(claims.createdAt), asc(claims.id));

  const claimantIds = [...new Set(rows.map((row) => row.claimantId))];

  // Queried by id rather than joined: `user_reliability` aggregates over every
  // user, and an explicit `in` list is a filter Postgres pushes down into the
  // grouping instead of materializing the whole view. Only the two counts are
  // selected — the view also carries `phone`, and it must never be read here.
  const reliabilityRows = claimantIds.length
    ? await db
        .select({
          id: userReliability.id,
          completed: userReliability.completed,
          noShows: userReliability.noShows,
        })
        .from(userReliability)
        .where(inArray(userReliability.id, claimantIds))
    : [];

  const reliabilityByUser = new Map(reliabilityRows.map((row) => [row.id, row]));

  const list = rows.map((row) => {
    const reliability = reliabilityByUser.get(row.claimantId);

    return {
      id: row.id,
      status: row.status,
      message: row.message,
      createdAt: row.createdAt,
      claimant: {
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        reliability: {
          completed: reliability?.completed ?? 0,
          noShows: reliability?.noShows ?? 0,
        },
        ...(row.phone ? { phone: row.phone } : {}),
      },
    };
  });

  return NextResponse.json({ claims: list }, { headers: { 'Cache-Control': PRIVATE_CACHE } });
}
