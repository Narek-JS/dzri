import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { db } from '@/db';
import { deviceTokens, devicePlatform } from '@/db/schema';
import { pushRegisterPerUser, retryAfterHeader } from '@/lib/ratelimit';

const registerSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(devicePlatform.enumValues),
});

/**
 * POST /api/push/register — a device tells us where to send notifications.
 *
 * `token` is unique across the table, not `(userId, token)`: it identifies
 * one installation, not a relationship, so it always belongs to whichever
 * user most recently registered it. Re-registering the same token — a
 * re-login on the same device, or a different account signing in on it —
 * reassigns `userId` in place rather than leaving a stale row behind.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  // Not on CLAUDE.md's required list, but every other authenticated write
  // endpoint in this codebase is limited — match that pattern.
  const perUser = await pushRegisterPerUser().limit(user.id);
  if (!perUser.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perUser.reset) });
  }

  const parsed = registerSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  const { token, platform } = parsed.data;

  await db
    .insert(deviceTokens)
    .values({ userId: user.id, token, platform })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId: user.id, platform },
    });

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, private' } });
}
