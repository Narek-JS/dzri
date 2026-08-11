import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/session';
import { getMyItems } from '@/lib/items/mine';
import { apiError } from '@/lib/http';

/**
 * GET /api/items/mine — the caller's own items, newest first: the "my items"
 * screen, including why a rejected item was rejected.
 *
 * The query itself lives in `src/lib/items/mine.ts`, shared with the my-items
 * page (`[locale]/my/items/page.tsx`) so the page reads the same rows without
 * an HTTP request to itself — the split `getFeed`, `getPendingQueue`,
 * `getClaimsForOwner` and `getMyClaims` already established. This handler keeps
 * auth, cursor validation and the response envelope.
 *
 * No phone number is selected on any path — see `getMyItems`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const cursorParam = new URL(request.url).searchParams.get('cursor');
  const cursor = cursorParam ? new Date(cursorParam) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return apiError('INVALID_BODY');
  }

  const { items, nextCursor } = await getMyItems(user.id, cursor);

  return NextResponse.json(
    { items, nextCursor },
    // A user's own list — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
