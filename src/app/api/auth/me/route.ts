import { NextResponse } from 'next/server';

import { clearSessionCookie, requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import {
  accountDeletePerIp,
  accountDeletePerUser,
  getClientIp,
  retryAfterHeader,
} from '@/lib/ratelimit';
import { deleteUser } from '@/lib/users/delete';

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

/**
 * Account deletion. A SOFT delete (`deleteUser`, src/lib/users/delete.ts;
 * DECISIONS.md, 2026-08-30) — the row stays, `deleted_at` is stamped,
 * `phone`/`display_name`/`avatar_url` are wiped, every removable item goes
 * to `removed`, every pending or approved claim the caller holds is
 * withdrawn, and device tokens are hard-deleted.
 *
 * `requireUser()` already refuses a banned caller (`is_banned`), so a
 * banned user cannot reach this at all — deletion can never be used to
 * free a banned phone number for a fresh registration.
 *
 * Refuses with `ACCOUNT_HAS_RESERVED_ITEMS` if the caller has a listing
 * reserved for an approved claimant — see `deleteUser`'s own doc comment
 * for why this blocks rather than silently releasing it.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const perUser = await accountDeletePerUser().limit(user.id);
  if (!perUser.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perUser.reset) });
  }

  const perIp = await accountDeletePerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const result = await deleteUser(user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
