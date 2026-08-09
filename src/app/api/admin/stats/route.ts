import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { getAdminStats } from '@/lib/items/adminStats';

/**
 * GET /api/admin/stats — moderation health at a glance.
 *
 * ADMIN ONLY, 404 to everyone else so the surface is not discoverable.
 *
 * The query itself lives in `src/lib/items/adminStats.ts` (`getAdminStats`),
 * shared with the admin page's server component — this handler owns only
 * auth and the response envelope.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const stats = await getAdminStats();

  return NextResponse.json(
    {
      counts: stats.counts,
      pendingCount: stats.pendingCount,
      oldestPendingAt: stats.oldestPendingAt ? stats.oldestPendingAt.toISOString() : null,
      oldestPendingAgeSeconds: stats.oldestPendingAgeSeconds,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
