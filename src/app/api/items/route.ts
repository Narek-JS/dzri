import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { createItem } from '@/lib/items/create';
import { getClientIp, itemCreatePerIp, itemCreatePerUser, retryAfterHeader } from '@/lib/ratelimit';

/**
 * Structural validation only. Image count and key ownership are business
 * rules with their own stable error codes, checked in `createItem`, so
 * `imageKeys` is validated here as a plain array of non-empty strings and
 * left for the creator to size — an empty array becomes IMAGES_REQUIRED and
 * an oversized one TOO_MANY_IMAGES, not a generic INVALID_BODY.
 */
const createItemSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000).nullish(),
  categoryId: z.number().int().positive(),
  districtId: z.number().int().positive(),
  condition: z.enum(['working', 'needs_repair', 'for_parts']),
  pickupNotes: z.string().trim().max(300).nullish(),
  imageKeys: z.array(z.string().min(1)),
});

/** Empty strings survive `.trim()` as `''`; store absence as null, not `''`. */
function orNull(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  // requireUser, not getSession: creating an item acts on the user's behalf,
  // so a banned account must be turned away (it reads is_banned).
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  // Limiters run before the body work (CLAUDE.md). Per-user first (the tighter
  // budget), then per-IP; both are the caller's own budget.
  const perUser = await itemCreatePerUser().limit(user.id);
  if (!perUser.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perUser.reset) });
  }

  const perIp = await itemCreatePerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const parsed = createItemSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  try {
    const result = await createItem({
      userId: user.id,
      title: parsed.data.title,
      description: orNull(parsed.data.description),
      categoryId: parsed.data.categoryId,
      districtId: parsed.data.districtId,
      condition: parsed.data.condition,
      pickupNotes: orNull(parsed.data.pickupNotes),
      imageKeys: parsed.data.imageKeys,
    });

    if (!result.ok) {
      return apiError(result.code);
    }

    // The client redirects to the item page, a separate endpoint — it needs
    // nothing back but the id and the resolved status.
    return NextResponse.json({ id: result.id, status: result.status }, { status: 201 });
  } catch (error) {
    // A HeadObject network failure or a write error lands here; surface the
    // stable shape rather than Next's default 500.
    console.error('POST /api/items failed', error);
    return apiError('INTERNAL');
  }
}
