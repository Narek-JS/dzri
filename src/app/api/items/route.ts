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

const ITEM_LOCALES = ['hy', 'ru', 'en'] as const;

const titleField = z.string().trim().min(3).max(100).nullish();
const descriptionField = z.string().trim().max(2000).nullish();
const pickupNotesField = z.string().trim().max(300).nullish();

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
 *
 * Title/description/pickup notes are per-locale (`titleHy`/`titleRu`/
 * `titleEn`, `descriptionHy`/`descriptionRu`/`descriptionEn`,
 * `pickupNotesHy`/`pickupNotesRu`/`pickupNotesEn`), mirroring the
 * `title_hy`/`title_ru`/`title_en` columns. `needsTranslation` and
 * `sourceLocale` come straight off CreateItemForm's checkbox (PART 2): the
 * `superRefine` below is what stops a half-filled multi-locale submission —
 * exactly `sourceLocale`'s fields when `needsTranslation` is true, all three
 * when it is false. This is request-shape validation, not the "can this
 * become `active`" question — that is the database's job
 * (`item_translations_complete_when_active`), and a request never sets
 * `status` directly anyway.
 */
const createItemSchema = z
  .object({
    titleHy: titleField,
    titleRu: titleField,
    titleEn: titleField,
    descriptionHy: descriptionField,
    descriptionRu: descriptionField,
    descriptionEn: descriptionField,
    needsTranslation: z.boolean(),
    sourceLocale: z.enum(ITEM_LOCALES),
    categoryId: z.number().int().positive(),
    districtId: z.number().int().positive(),
    condition: z.enum(['working', 'needs_repair', 'for_parts']),
    pickupNotesHy: pickupNotesField,
    pickupNotesRu: pickupNotesField,
    pickupNotesEn: pickupNotesField,
    images: z.array(itemImageSchema),
  })
  .superRefine((body, ctx) => {
    const titleByLocale = { hy: body.titleHy, ru: body.titleRu, en: body.titleEn };
    const descriptionByLocale = {
      hy: body.descriptionHy,
      ru: body.descriptionRu,
      en: body.descriptionEn,
    };
    const pickupNotesByLocale = {
      hy: body.pickupNotesHy,
      ru: body.pickupNotesRu,
      en: body.pickupNotesEn,
    };
    const filled = (value: string | null | undefined) => Boolean(value && value.length > 0);

    if (body.needsTranslation) {
      // Exactly sourceLocale's title, nothing in the other two — a
      // needsTranslation item only ever has one language to show until an
      // admin fills the rest in.
      for (const locale of ITEM_LOCALES) {
        const shouldBeFilled = locale === body.sourceLocale;
        if (filled(titleByLocale[locale]) !== shouldBeFilled) {
          ctx.addIssue({
            code: 'custom',
            message: "needsTranslation requires exactly sourceLocale's title, and no others",
            path: ['titleHy'],
          });
          return;
        }
        if (locale !== body.sourceLocale && filled(descriptionByLocale[locale])) {
          ctx.addIssue({
            code: 'custom',
            message:
              'a description outside sourceLocale is not allowed when needsTranslation is true',
            path: ['descriptionHy'],
          });
          return;
        }
        if (locale !== body.sourceLocale && filled(pickupNotesByLocale[locale])) {
          ctx.addIssue({
            code: 'custom',
            message:
              'pickup notes outside sourceLocale is not allowed when needsTranslation is true',
            path: ['pickupNotesHy'],
          });
          return;
        }
      }
    } else {
      // All three titles required; description is all-or-nothing across the
      // three, matching item_translations_complete_when_active exactly, so a
      // non-translation item is always immediately eligible for 'active'.
      for (const locale of ITEM_LOCALES) {
        if (!filled(titleByLocale[locale])) {
          ctx.addIssue({
            code: 'custom',
            message: 'all three locale titles are required when needsTranslation is false',
            path: ['titleHy'],
          });
          return;
        }
      }

      const descriptionFlags = ITEM_LOCALES.map((locale) => filled(descriptionByLocale[locale]));
      const allFilled = descriptionFlags.every(Boolean);
      const noneFilled = descriptionFlags.every((flag) => !flag);
      if (!allFilled && !noneFilled) {
        ctx.addIssue({
          code: 'custom',
          message: 'description must be filled in all three locales or none',
          path: ['descriptionHy'],
        });
      }

      const pickupNotesFlags = ITEM_LOCALES.map((locale) => filled(pickupNotesByLocale[locale]));
      const pickupNotesAllFilled = pickupNotesFlags.every(Boolean);
      const pickupNotesNoneFilled = pickupNotesFlags.every((flag) => !flag);
      if (!pickupNotesAllFilled && !pickupNotesNoneFilled) {
        ctx.addIssue({
          code: 'custom',
          message: 'pickup notes must be filled in all three locales or none',
          path: ['pickupNotesHy'],
        });
      }
    }
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
      titleHy: orNull(parsed.data.titleHy),
      titleRu: orNull(parsed.data.titleRu),
      titleEn: orNull(parsed.data.titleEn),
      descriptionHy: orNull(parsed.data.descriptionHy),
      descriptionRu: orNull(parsed.data.descriptionRu),
      descriptionEn: orNull(parsed.data.descriptionEn),
      needsTranslation: parsed.data.needsTranslation,
      sourceLocale: parsed.data.sourceLocale,
      categoryId: parsed.data.categoryId,
      districtId: parsed.data.districtId,
      condition: parsed.data.condition,
      pickupNotesHy: orNull(parsed.data.pickupNotesHy),
      pickupNotesRu: orNull(parsed.data.pickupNotesRu),
      pickupNotesEn: orNull(parsed.data.pickupNotesEn),
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
