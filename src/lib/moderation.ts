import type { ItemStatus } from '@/db/schema';

/**
 * Item moderation mode, from `MODERATION_MODE`.
 *
 * - `pre`  — an admin approves each new item before it is visible. New
 *   items start in `pending_review`. This is the launch default.
 * - `post` — items publish immediately as `active` and are only reviewed
 *   when reported.
 *
 * Pre-moderation at launch buys quality control while volume is low;
 * manual review does not scale, so this is meant to flip to `post` later
 * without a schema change. See DECISIONS.md.
 */
export type ModerationMode = 'pre' | 'post';

/** The status a newly created item may be given. */
type InitialItemStatus = Extract<ItemStatus, 'pending_review' | 'active'>;

/**
 * The status a freshly created item should get, based on `MODERATION_MODE`
 * and whether it still needs an admin translation.
 *
 * The env var is read lazily on every call, never at module scope: a
 * `next build` on a machine without it must still succeed, and flipping the
 * mode in the platform config should take effect without a rebuild.
 *
 * Anything other than an exact `post` — unset, misspelled, empty — falls
 * back to pre-moderation. The safe failure is to hold an item for review,
 * never to publish it unreviewed.
 *
 * `needsTranslation` overrides the mode outright: `item_translations_
 * complete_when_active` (src/db/schema/items.ts) refuses an `active` row
 * missing any locale's title, and a freshly created item flagged for
 * translation only has one. Publishing it straight to `active` in `post`
 * mode would not skip review, it would fail the insert — so a translation
 * request holds for `pending_review` regardless of moderation mode, the
 * same way a rejected item's non-null `rejection_reason` is not something
 * `MODERATION_MODE` can route around either.
 */
export function initialItemStatus(needsTranslation: boolean): InitialItemStatus {
  if (needsTranslation) return 'pending_review';
  return process.env.MODERATION_MODE === 'post' ? 'active' : 'pending_review';
}
