import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { markNoShow } from '@/lib/claims/transitions';

/**
 * POST /api/claims/[id]/no-show — they never turned up.
 *
 * Owner of the claimed item only; anybody else gets 404. Only from `approved`.
 * Sets the claim to `no_show` and puts the item straight back to `active`.
 *
 * No-shows are the number one thing that kills a free-item platform, so this
 * is deliberately one tap with no body and no confirmation step: a giver who
 * has just wasted an evening will not fill in a form. It is what feeds
 * `user_reliability`, which is what the next giver sees before choosing.
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

  const result = await markNoShow(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'no_show' },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
