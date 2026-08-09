import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { items, itemStatus } from '@/db/schema';

import type { ItemStatus } from '@/db/schema';

export type AdminStats = {
  counts: Record<ItemStatus, number>;
  pendingCount: number;
  oldestPendingAt: Date | null;
  oldestPendingAgeSeconds: number | null;
};

/**
 * Moderation health at a glance.
 *
 * Extracted out of `GET /api/admin/stats` the way `getFeed` was extracted
 * for the public feed, so the admin page (`[locale]/admin/page.tsx`) can
 * read the same numbers the route handler would return without making an
 * HTTP request to itself.
 *
 * `pendingCount` and the age of the oldest pending item are the numbers
 * that say whether pre-moderation is still keeping up or has become the
 * bottleneck DECISIONS.md warns about — the moment the review delay beats
 * leaving the item by the bins, the platform loses.
 */
export async function getAdminStats(): Promise<AdminStats> {
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
  // than absent — the caller can read all eight without guarding for holes.
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

  return {
    counts,
    pendingCount: counts.pending_review,
    oldestPendingAt,
    oldestPendingAgeSeconds,
  };
}
