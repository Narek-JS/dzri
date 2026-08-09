import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { createItem } from '@/lib/items/create';
import { getFeed } from '@/lib/items/feed';
import {
  feedPerIp,
  getClientIp,
  itemCreatePerIp,
  itemCreatePerUser,
  retryAfterHeader,
} from '@/lib/ratelimit';

/**
 * A stale link should never 500, so the only hard failures here are a
 * structurally malformed `condition` or `cursor`. An unknown district or
 * category *slug* is not an error — it flows through as a filter that simply
 * matches no rows, and the caller gets an empty page (handled in the query, not
 * here).
 */
const feedQuerySchema = z.object({
  district: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  condition: z.enum(['working', 'needs_repair', 'for_parts']).optional(),
  cursor: z.string().datetime({ offset: true }).optional(),
});

/**
 * The public feed: active, unexpired items, newest first.
 *
 * PUBLIC — no auth, no cookie. A stranger off a shared link browses it, and it
 * must be indexable, so the response is cheap and lands in a short shared cache
 * (`s-maxage`/`stale-while-revalidate`). Reserved, given, expired, rejected and
 * pending items are all invisible here by construction: only `active` with a
 * live `expires_at` is returned.
 *
 * The thumbnail is a correlated subquery (position 0), not a join, so the
 * result stays one row per item — a join to item_images would multiply rows.
 * District and category are joined instead, because those are one-to-one and
 * the feed needs all three localized names of each anyway.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // A generous per-IP ceiling (see ratelimit.ts). Most hits are served from the
  // shared cache and never reach here; this only stops a script hammering it.
  const perIp = await feedPerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = feedQuerySchema.safeParse({
    district: searchParams.get('district') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    condition: searchParams.get('condition') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  const { items: page, nextCursor } = await getFeed(parsed.data);

  return NextResponse.json(
    { items: page, nextCursor },
    // Anonymous and identical for everyone — a short shared cache is safe and is
    // what keeps this endpoint cheap under load.
    {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    },
  );
}

/**
 * The largest dimension either side of an image may claim.
 *
 * These are layout hints, not measurements: nothing on the server decodes the
 * file to check them. The bound exists so a client cannot put an absurd number
 * into a column that a page will later turn into a CSS aspect ratio — 20000 is
 * comfortably past any phone camera and far short of anything that breaks a
 * layout calculation.
 */
const MAX_IMAGE_DIMENSION = 20_000;

/**
 * BlurHash is base83, and a 9×9 hash — the largest the format allows — is 1 + 1
 * + 4 + 2 × 80 = 166 characters. The 40-character cap here is well under that
 * and well over the ~30 a 4×3 hash takes, which is what the client emits.
 *
 * The charset is the point rather than the length. This string is stored and
 * handed back to clients, so it is pinned to exactly the alphabet a decoder
 * accepts and nothing else. It is never interpolated into markup, a URL, a
 * query or a style — it goes to `decode()` and nowhere else.
 */
const MAX_BLURHASH_LENGTH = 40;
const MIN_BLURHASH_LENGTH = 6;
const BLURHASH_CHARSET = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]+$/;

/**
 * One photo: the original, its 400px variant, and the layout hints the client
 * derived while it had the bitmap decoded. Index 0 of the array is the
 * thumbnail and the array order is gallery order.
 */
const itemImageSchema = z.object({
  key: z.string().min(1),
  thumbKey: z.string().min(1),
  width: z.number().int().positive().max(MAX_IMAGE_DIMENSION),
  height: z.number().int().positive().max(MAX_IMAGE_DIMENSION),
  blurhash: z.string().min(MIN_BLURHASH_LENGTH).max(MAX_BLURHASH_LENGTH).regex(BLURHASH_CHARSET),
});

/**
 * Structural validation only for the keys. Image count and key ownership are
 * business rules with their own stable error codes, checked in `createItem`,
 * so `images` is validated here for shape and left for the creator to size —
 * an empty array becomes IMAGES_REQUIRED and an oversized one TOO_MANY_IMAGES,
 * not a generic INVALID_BODY.
 *
 * `width`, `height` and `blurhash` are the exception: they are bounded here,
 * because they have no business meaning to fail on. There is no
 * "INVALID_DIMENSION" for a client that sends a negative height — that is a
 * malformed body.
 */
const createItemSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000).nullish(),
  categoryId: z.number().int().positive(),
  districtId: z.number().int().positive(),
  condition: z.enum(['working', 'needs_repair', 'for_parts']),
  pickupNotes: z.string().trim().max(300).nullish(),
  images: z.array(itemImageSchema),
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
      images: parsed.data.images,
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
