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
 * The status a freshly created item should get, based on `MODERATION_MODE`.
 *
 * The env var is read lazily on every call, never at module scope: a
 * `next build` on a machine without it must still succeed, and flipping the
 * mode in the platform config should take effect without a rebuild.
 *
 * Anything other than an exact `post` — unset, misspelled, empty — falls
 * back to pre-moderation. The safe failure is to hold an item for review,
 * never to publish it unreviewed.
 */
export function initialItemStatus(): InitialItemStatus {
  return process.env.MODERATION_MODE === 'post' ? 'active' : 'pending_review';
}
