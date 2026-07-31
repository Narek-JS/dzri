import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/lib/auth/session';

/**
 * Always succeeds, signed in or not — a client clearing a session it no
 * longer has is not an error worth a branch.
 *
 * The JWT itself stays valid until it expires; there is no server-side
 * session store to revoke against. A ban is enforced by `requireUser`
 * reading `is_banned` on each authenticated request instead.
 */
export async function POST(): Promise<NextResponse> {
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
