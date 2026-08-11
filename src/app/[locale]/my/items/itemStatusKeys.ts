import type { ItemStatus } from '@/db/schema';
import type { MyItem } from '@/lib/api/client';

/**
 * What each item status means to the GIVER, in their own words.
 *
 * Status is what somebody opens this page for — "I posted a thing, what
 * happened to it?" — so every status gets a plain-language `title` that
 * answers that question and a `description` that says what it means for them
 * next. A bare enum label ("pending_review", or even "Awaiting review")
 * answers neither.
 *
 * Deliberately not shared with `itemClaims.itemStatus.*`, which is the same
 * eight statuses as a one-word chip beside a decision list. Same column in the
 * database, two different jobs: that one identifies the item's state at a
 * glance next to the claims it belongs to, this one is the whole content of a
 * row.
 *
 * Both strings are the only carrier of meaning here — nothing on this page
 * distinguishes a status by colour alone.
 *
 * `draft` is included because `ItemStatus` has eight members and this map is
 * total, not because a giver can reach it: nothing in the product writes
 * `draft` (CLAUDE.md). If something ever does, the row reads sensibly rather
 * than crashing on a missing key.
 */
export const MY_ITEM_STATUS_KEYS: Record<ItemStatus, { title: string; description: string }> = {
  draft: {
    title: 'myItems.status.draft.title',
    description: 'myItems.status.draft.description',
  },
  pending_review: {
    title: 'myItems.status.pending_review.title',
    description: 'myItems.status.pending_review.description',
  },
  active: {
    title: 'myItems.status.active.title',
    description: 'myItems.status.active.description',
  },
  rejected: {
    title: 'myItems.status.rejected.title',
    description: 'myItems.status.rejected.description',
  },
  reserved: {
    title: 'myItems.status.reserved.title',
    description: 'myItems.status.reserved.description',
  },
  given: {
    title: 'myItems.status.given.title',
    description: 'myItems.status.given.description',
  },
  expired: {
    title: 'myItems.status.expired.title',
    description: 'myItems.status.expired.description',
  },
  removed: {
    title: 'myItems.status.removed.title',
    description: 'myItems.status.removed.description',
  },
};

/**
 * Is the giver's decision list worth opening for this row?
 *
 * `/items/[id]/claims` answers the owner in every item status, so unlike the
 * my-claims list there is no dead-end to guard against — the question is only
 * whether the page has anything on it. It does not when nobody has ever
 * claimed the item, which covers every listing that was never `active` (a
 * claim can only be created against an active item, API.md) and every active
 * one nobody has asked for yet. Linking those would send the giver to an empty
 * page to find that out.
 *
 * `claimCount` is what answers this, and it is the one job it has on this
 * screen: it counts every claim ever, whatever became of it, so it stays true
 * for a `given` item's completed claim and for a `removed` item's rejected
 * ones. `pendingClaimCount` cannot stand in — it drops back to zero the moment
 * the giver decides, and the history is still there to read.
 */
export function hasClaimsToShow(item: MyItem): boolean {
  return item.claimCount > 0;
}
