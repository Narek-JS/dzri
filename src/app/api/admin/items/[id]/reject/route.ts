import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { rejectItem } from '@/lib/items/moderate';

/**
 * The reason is shown to the giver in `/api/items/mine`, so it is user-facing
 * text, not an internal note: required, trimmed, and long enough to actually
 * explain the rejection. It is stored verbatim and never truncated.
 */
const rejectSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

/**
 * POST /api/admin/items/[id]/reject — reject a pending item with a reason.
 *
 * ADMIN ONLY, 404 to everyone else so the surface is not discoverable.
 *
 * Only valid from `pending_review`; any other status (or a missing item)
 * returns INVALID_STATUS_TRANSITION. The conditional update in the transition
 * helper makes a double-click safe: the second attempt sees a non-pending row
 * and gets INVALID_STATUS_TRANSITION.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const parsed = rejectSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  const { id } = await params;

  // A malformed uuid can never name a pending item; treat it as the same
  // refusal rather than letting it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('INVALID_STATUS_TRANSITION');
  }

  const result = await rejectItem(id, admin.id, parsed.data.reason);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'rejected' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
