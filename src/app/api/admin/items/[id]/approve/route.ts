import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { approveItem } from '@/lib/items/moderate';

/**
 * POST /api/admin/items/[id]/approve — publish a pending item.
 *
 * ADMIN ONLY, 404 to everyone else so the surface is not discoverable.
 *
 * Only valid from `pending_review`; any other status (or a missing item)
 * returns INVALID_STATUS_TRANSITION. The transition helper does this as a
 * conditional update, so a double-click resolves to exactly one approval and
 * the second attempt gets INVALID_STATUS_TRANSITION rather than re-stamping
 * the review.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const { id } = await params;

  // A malformed uuid can never name a pending item; treat it as the same
  // refusal rather than letting it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('INVALID_STATUS_TRANSITION');
  }

  const result = await approveItem(id, admin.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json({ id, status: 'active' }, { headers: { 'Cache-Control': 'no-store' } });
}
