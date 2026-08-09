import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { getPendingQueue } from '@/lib/items/pendingQueue';

/**
 * GET /api/admin/items/pending — the moderation work queue.
 *
 * ADMIN ONLY. A non-admin (anonymous or a logged-in stranger) gets 404, not
 * 403, so the surface is not discoverable by probing paths.
 *
 * This is a work queue, not a feed: OLDEST first, so the submission that has
 * waited longest is reviewed first. Paginated on `createdAt` ascending. The
 * query itself lives in `src/lib/items/pendingQueue.ts` (`getPendingQueue`),
 * shared with the admin page's server component — this handler owns only
 * auth and cursor parsing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const cursorParam = new URL(request.url).searchParams.get('cursor');
  const cursor = cursorParam ? new Date(cursorParam) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return apiError('INVALID_BODY');
  }

  const { items: queue, nextCursor } = await getPendingQueue(cursor);

  return NextResponse.json(
    { items: queue, nextCursor },
    // A moderator's working view — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
