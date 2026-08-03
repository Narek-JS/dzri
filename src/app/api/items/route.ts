import { NextResponse } from 'next/server';

import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { db } from '@/db';
import { categories, districts, itemImages, items } from '@/db/schema';
import { apiError, readJson } from '@/lib/http';
import { createItem } from '@/lib/items/create';
import {
  feedPerIp,
  getClientIp,
  itemCreatePerIp,
  itemCreatePerUser,
  retryAfterHeader,
} from '@/lib/ratelimit';

/** One screen of the public feed. The client asks for more with `nextCursor`. */
const FEED_PAGE_SIZE = 24;

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

  const { district, category, condition, cursor } = parsed.data;

  const thumbnailUrl = sql<string | null>`(
    select ${itemImages.url}
    from ${itemImages}
    where ${itemImages.itemId} = ${items.id}
    order by ${itemImages.position} asc
    limit 1
  )`;

  // Reserved items are deliberately excluded (a viewer should not see something
  // already spoken for), as is everything that is not `active`.
  const filters = [eq(items.status, 'active'), gt(items.expiresAt, sql`now()`)];
  if (cursor) filters.push(lt(items.createdAt, new Date(cursor)));
  // An unknown slug matches nothing here — that is the empty-page behavior, not
  // an error path.
  if (district) filters.push(eq(districts.slug, district));
  if (category) filters.push(eq(categories.slug, category));
  if (condition) filters.push(eq(items.condition, condition));

  // Fetch one extra to learn whether another page exists without a count query.
  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      condition: items.condition,
      createdAt: items.createdAt,
      thumbnailUrl,
      district: {
        slug: districts.slug,
        nameHy: districts.nameHy,
        nameRu: districts.nameRu,
        nameEn: districts.nameEn,
      },
      category: {
        slug: categories.slug,
        nameHy: categories.nameHy,
        nameRu: categories.nameRu,
        nameEn: categories.nameEn,
      },
    })
    .from(items)
    .innerJoin(districts, eq(items.districtId, districts.id))
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .where(and(...filters))
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(FEED_PAGE_SIZE + 1);

  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

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
