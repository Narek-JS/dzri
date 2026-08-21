import { NextResponse } from 'next/server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { db } from '@/db';
import { deviceTokens } from '@/db/schema';

const unregisterSchema = z.object({
  token: z.string().trim().min(1),
});

/**
 * POST /api/push/unregister — a device says stop.
 *
 * Scoped to `userId = caller` as well as `token`, so a caller can never
 * delete another user's token row by guessing or replaying a token that no
 * longer belongs to them. Deleting nothing (an already-unregistered token,
 * or one owned by somebody else) is not an error — the caller's desired end
 * state is achieved either way.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const parsed = unregisterSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.token, parsed.data.token), eq(deviceTokens.userId, user.id)));

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, private' } });
}
