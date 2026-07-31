import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';

/**
 * The signed-in user's own profile.
 *
 * There is no `phone` on any path through this handler, and there must
 * never be one — not even for the owner of the number. Nothing needs it:
 * the client already knows which number it logged in with, and a
 * phone-bearing response here would be one cache header away from being
 * the leak that CLAUDE.md and DECISIONS.md are both written around.
 *
 * The fields are listed one by one rather than spread, so adding a
 * column to `users` cannot quietly widen this response.
 */
export async function GET(): Promise<NextResponse> {
  const user = await requireUser();

  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  return NextResponse.json(
    {
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        districtId: user.districtId,
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
      },
    },
    // Personal payload — never store it in a shared cache.
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
