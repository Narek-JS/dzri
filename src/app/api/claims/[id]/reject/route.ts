import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { rejectClaim } from '@/lib/claims/transitions';

/**
 * POST /api/claims/[id]/reject — the giver turns this person down.
 *
 * Owner of the claimed item only; anybody else gets 404. Only from `pending`.
 * The listing itself is untouched and stays active for everybody else.
 *
 * No body, and no reason. Declining somebody for a free chair is not a
 * moderation action and does not need justification — unlike an admin
 * rejecting a listing, which does.
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

  const result = await rejectClaim(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'rejected' },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
