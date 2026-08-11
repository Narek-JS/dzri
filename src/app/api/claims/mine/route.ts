import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/session';
import { getMyClaims } from '@/lib/claims/mine';
import { apiError } from '@/lib/http';

/**
 * GET /api/claims/mine — everything the caller has asked for, newest first.
 *
 * The claimant's side of the interaction: what did I ask for, was I picked,
 * and if I was, who do I call.
 *
 * The query itself lives in `src/lib/claims/mine.ts`, shared with the
 * my-claims page (`[locale]/my/claims/page.tsx`) so the page reads the same
 * rows without an HTTP request to itself — the split `getFeed`,
 * `getPendingQueue` and `getClaimsForOwner` already established. This handler
 * keeps auth, cursor validation and the response envelope.
 *
 * PHONE PRIVACY. See `getMyClaims`: the giver's phone comes out of a
 * status-guarded SQL CASE, and the key is absent — not null — on anything but
 * an approved claim.
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

  const { claims, nextCursor } = await getMyClaims(user.id, cursor);

  return NextResponse.json(
    { claims, nextCursor },
    // A user's own list — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
