import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { withdrawClaim } from '@/lib/claims/transitions';

/**
 * POST /api/claims/[id]/withdraw — the claimant backs out.
 *
 * The CLAIMANT only, not the giver: the giver has reject and no-show. Anybody
 * else gets 404. Valid from `pending` or `approved`.
 *
 * Withdrawing an approved claim also releases the item back to `active` and
 * clears the reservation. Somebody who changes their mind must not leave the
 * listing stuck for 48 hours until the sweep notices.
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

  if (!z.string().uuid().safeParse(id).success) {
    return apiError('CLAIM_NOT_FOUND');
  }

  const result = await withdrawClaim(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'withdrawn' },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
