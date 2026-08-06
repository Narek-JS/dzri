import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { completeClaim } from '@/lib/claims/transitions';

/**
 * POST /api/claims/[id]/complete — the handover happened.
 *
 * Owner of the claimed item only; anybody else gets 404. Only from `approved`.
 * Sets the claim to `completed` and the item to `given`, which is terminal.
 *
 * This is the other half of what feeds `user_reliability`: a completed claim
 * is the record that somebody actually turned up.
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

  const result = await completeClaim(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'completed' },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
