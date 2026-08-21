import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { approveClaim } from '@/lib/claims/transitions';
import { sendPushToUser } from '@/lib/push';

/**
 * POST /api/claims/[id]/approve — the giver picks this person.
 *
 * Owner of the claimed item only; anybody else, and any id that names no
 * claim, gets 404. Only from `pending`.
 *
 * One transaction sets the claim to `approved`, reserves the item for the
 * claimant for 48 hours, and rejects every other pending claim on it. A
 * double-click loses the conditional update on the item and comes back
 * INVALID_STATUS_TRANSITION rather than re-reserving.
 *
 * This response is the one place in the entire API where a phone number is
 * returned, and it goes only to the two people it belongs to.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const { id } = await params;

  // A malformed uuid can never name a claim; short-circuit rather than
  // letting it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('CLAIM_NOT_FOUND');
  }

  const result = await approveClaim(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  // Never lets a push failure change this response — sendPushToUser already
  // swallows its own errors, but the try/catch is the belt to that suspenders
  // in case a future edit there ever changes that contract.
  try {
    // No per-user locale stored yet, so Armenian-only copy is an explicit
    // simplification for this pass (see the push-notifications prompt).
    await sendPushToUser(result.claimantId, {
      title: result.itemTitleHy
        ? `«${result.itemTitleHy}»-ը ամրագրված է ձեզ համար`
        : 'Ամրագրված է ձեզ համար',
      body: 'Հայտատուն ընտրել է ձեզ։ Հեռախոսահամարը հասանելի է ձեր հայտերի էջում։',
      data: { url: '/my/claims' },
    });
  } catch (error) {
    console.error('Failed to send claim-approved push notification', error);
  }

  return NextResponse.json(
    {
      id,
      status: 'approved',
      reservedUntil: result.reservedUntil,
      giverPhone: result.giverPhone,
      claimantPhone: result.claimantPhone,
    },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
