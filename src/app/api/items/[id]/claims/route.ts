import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { MAX_CLAIM_MESSAGE_LENGTH, createClaim } from '@/lib/claims/create';
import { getClaimsForOwner } from '@/lib/claims/forOwner';
import { sendPushToUser } from '@/lib/push';
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

  // Never lets a push failure change this response — sendPushToUser already
  // swallows its own errors, but the try/catch is the belt to that suspenders
  // in case a future edit there ever changes that contract.
  try {
    // No per-user locale stored yet, so Armenian-only copy is an explicit
    // simplification for this pass (see the push-notifications prompt).
    await sendPushToUser(result.itemOwnerId, {
      title: 'Նոր հայտ',
      body: result.itemTitleHy
        ? `«${result.itemTitleHy}»-ի համար նոր հայտ կա։`
        : 'Ձեր իրի համար նոր հայտ կա։',
      data: { url: `/items/${id}/claims` },
    });
  } catch (error) {
    console.error('Failed to send claim-created push notification', error);
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
 * The query itself lives in `src/lib/claims/forOwner.ts` (`getClaimsForOwner`),
 * shared with the claims page's server component — this handler owns only
 * auth and the response envelope (the page also wants the item's title and
 * status, which that function returns but this response does not carry).
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

  const result = await getClaimsForOwner(id, user.id);
  if (!result) {
    return apiError('ITEM_NOT_FOUND');
  }

  return NextResponse.json(
    { claims: result.claims },
    { headers: { 'Cache-Control': PRIVATE_CACHE } },
  );
}
