import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { items } from '@/db/schema';

/**
 * The moderation status transitions. Route handlers never mutate
 * `items.status` directly (CLAUDE.md) — they go through these helpers,
 * which are the single place that knows an item may only be approved or
 * rejected out of `pending_review`.
 *
 * Both are written as a conditional update guarded on
 * `status = 'pending_review'`, so they are safe against a double-click and
 * against two admins acting at once: the guard is evaluated atomically by
 * Postgres, exactly one update touches the row, and the loser sees zero
 * rows affected. Zero rows means the item was not pending — already
 * reviewed, or never in a reviewable state — and maps onto
 * INVALID_STATUS_TRANSITION. There is no separate "not found" here: a
 * missing id is indistinguishable from a non-pending one, and both are the
 * same refusal to the caller.
 */

export type ModerationResult =
  { ok: true } | { ok: false; code: 'INVALID_STATUS_TRANSITION' | 'TRANSLATIONS_REQUIRED' };

/** The missing locales' title/description/pickup notes, keyed exactly like the item's own columns. */
export type ApproveTranslations = {
  titleHy?: string;
  titleRu?: string;
  titleEn?: string;
  descriptionHy?: string;
  descriptionRu?: string;
  descriptionEn?: string;
  pickupNotesHy?: string;
  pickupNotesRu?: string;
  pickupNotesEn?: string;
};

/**
 * `pending_review → active`.
 *
 * Resets `expiresAt` to 30 days from *now*, not from submission: the
 * 30-day lifetime starts when the item becomes visible, so a slow review
 * never silently eats into it. Clears any prior `rejectionReason` (the
 * check constraint forbids a non-rejected item carrying one) and records
 * who reviewed it and when.
 *
 * When the item's `needsTranslation` is true, `item_translations_complete_
 * when_active` refuses this update unless every currently-null locale
 * column is filled in the same statement — so this reads the row first to
 * learn which columns are actually missing, validates `translations` covers
 * all of them, and folds the fill into the same conditional UPDATE that
 * performs the transition. A row that turns out not to be `pending_review`
 * by the time that UPDATE runs (approved or rejected between the read and
 * the write) still resolves to `INVALID_STATUS_TRANSITION`, exactly as
 * before this function took a second argument — the guard is unchanged,
 * there is just more it can now also set.
 *
 * `translations` is ignored entirely when `needsTranslation` is false: a
 * caller that sends nothing (today's only caller) sees no behavior change.
 */
export async function approveItem(
  itemId: string,
  adminId: string,
  translations?: ApproveTranslations,
): Promise<ModerationResult> {
  const [item] = await db
    .select({
      status: items.status,
      needsTranslation: items.needsTranslation,
      titleHy: items.titleHy,
      titleRu: items.titleRu,
      titleEn: items.titleEn,
      descriptionHy: items.descriptionHy,
      descriptionRu: items.descriptionRu,
      descriptionEn: items.descriptionEn,
      pickupNotesHy: items.pickupNotesHy,
      pickupNotesRu: items.pickupNotesRu,
      pickupNotesEn: items.pickupNotesEn,
    })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);

  if (!item || item.status !== 'pending_review') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  const fill: ApproveTranslations = {};

  if (item.needsTranslation) {
    if (item.titleHy === null) {
      if (!translations?.titleHy) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
      fill.titleHy = translations.titleHy;
    }
    if (item.titleRu === null) {
      if (!translations?.titleRu) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
      fill.titleRu = translations.titleRu;
    }
    if (item.titleEn === null) {
      if (!translations?.titleEn) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
      fill.titleEn = translations.titleEn;
    }

    // Description only needs filling in when the source locale actually has
    // one — an item posted with no description needs no description
    // translated, and item_translations_complete_when_active allows all
    // three to stay null just as readily as all three filled.
    const hasSourceDescription =
      item.descriptionHy !== null || item.descriptionRu !== null || item.descriptionEn !== null;
    if (hasSourceDescription) {
      if (item.descriptionHy === null) {
        if (!translations?.descriptionHy) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.descriptionHy = translations.descriptionHy;
      }
      if (item.descriptionRu === null) {
        if (!translations?.descriptionRu) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.descriptionRu = translations.descriptionRu;
      }
      if (item.descriptionEn === null) {
        if (!translations?.descriptionEn) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.descriptionEn = translations.descriptionEn;
      }
    }

    // Pickup notes only needs filling in when the source locale actually has
    // one — an item posted with no pickup notes needs none translated, and
    // item_translations_complete_when_active allows all three to stay null
    // just as readily as all three filled.
    const hasSourcePickupNotes =
      item.pickupNotesHy !== null || item.pickupNotesRu !== null || item.pickupNotesEn !== null;
    if (hasSourcePickupNotes) {
      if (item.pickupNotesHy === null) {
        if (!translations?.pickupNotesHy) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.pickupNotesHy = translations.pickupNotesHy;
      }
      if (item.pickupNotesRu === null) {
        if (!translations?.pickupNotesRu) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.pickupNotesRu = translations.pickupNotesRu;
      }
      if (item.pickupNotesEn === null) {
        if (!translations?.pickupNotesEn) return { ok: false, code: 'TRANSLATIONS_REQUIRED' };
        fill.pickupNotesEn = translations.pickupNotesEn;
      }
    }
  }

  const updated = await db
    .update(items)
    .set({
      status: 'active',
      reviewedAt: sql`now()`,
      reviewedBy: adminId,
      rejectionReason: null,
      expiresAt: sql`now() + interval '30 days'`,
      updatedAt: sql`now()`,
      ...fill,
    })
    .where(and(eq(items.id, itemId), eq(items.status, 'pending_review')))
    .returning({ id: items.id });

  if (updated.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}

/**
 * `pending_review → rejected`.
 *
 * `reason` is stored verbatim — it is shown to the giver in
 * `/api/items/mine`, so it is user-facing text, not an internal note, and
 * is never truncated here (length is bounded by the route's schema). The
 * check constraint requires a rejected item to carry a reason, which the
 * caller guarantees by validating it before this runs.
 */
export async function rejectItem(
  itemId: string,
  adminId: string,
  reason: string,
): Promise<ModerationResult> {
  const updated = await db
    .update(items)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      reviewedAt: sql`now()`,
      reviewedBy: adminId,
      updatedAt: sql`now()`,
    })
    .where(and(eq(items.id, itemId), eq(items.status, 'pending_review')))
    .returning({ id: items.id });

  if (updated.length === 0) {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
  }

  return { ok: true };
}
