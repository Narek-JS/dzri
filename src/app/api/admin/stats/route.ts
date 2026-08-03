import { NextResponse } from 'next/server';

import { asc, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/db';
import { items, itemStatus } from '@/db/schema';
import type { ItemStatus } from '@/db/schema';
import { apiError } from '@/lib/http';

/**
 * GET /api/admin/stats — moderation health at a glance.
 *
 * ADMIN ONLY, 404 to everyone else so the surface is not discoverable.
 *
 * `pendingCount` and the age of the oldest pending item are the numbers that
 * say whether pre-moderation is still keeping up or has become the bottleneck
 * DECISIONS.md warns about — the moment the review delay beats leaving the
 * item by the bins, the platform loses.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const [statusRows, oldestPendingRows] = await Promise.all([
    db
      .select({ status: items.status, count: sql<number>`count(*)::int` })
      .from(items)
      .groupBy(items.status),
    db
      .select({ createdAt: items.createdAt })
      .from(items)
      .where(eq(items.status, 'pending_review'))
      .orderBy(asc(items.createdAt))
      .limit(1),
  ]);

  // Start every status at 0 so a status with no rows is present as 0 rather
  // than absent — the client can read all eight without guarding for holes.
  const counts = Object.fromEntries(itemStatus.enumValues.map((status) => [status, 0])) as Record<
    ItemStatus,
    number
  >;
  for (const row of statusRows) {
    counts[row.status] = row.count;
  }

  const oldestPendingAt = oldestPendingRows[0]?.createdAt ?? null;
  const oldestPendingAgeSeconds = oldestPendingAt
    ? Math.floor((Date.now() - oldestPendingAt.getTime()) / 1000)
    : null;

  return NextResponse.json(
    {
      counts,
      pendingCount: counts.pending_review,
      oldestPendingAt: oldestPendingAt ? oldestPendingAt.toISOString() : null,
      oldestPendingAgeSeconds,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
