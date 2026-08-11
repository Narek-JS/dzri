import type { ClaimStatus } from '@/db/schema';
import type { MyClaim } from '@/lib/api/client';

/**
 * What each claim status means to the CLAIMANT, in their own words.
 *
 * Status is the whole information content of this screen — somebody opens
 * their claims list to find out where they stand — so every status gets a
 * plain-language `title` that answers "what is happening with this?" and a
 * `description` that says what it means for them next. A bare enum label
 * ("no_show", or even "No-show") answers neither.
 *
 * The same six statuses read differently on the giver's side of the
 * interaction, which is why these are not shared with
 * `itemClaims.history.status.*`: "Turned down" is what the giver did, "Given
 * to someone else" is what happened to the claimant. Same row in the
 * database, two different sentences.
 *
 * Both strings are the only carrier of meaning here — nothing on this page
 * distinguishes a status by colour alone.
 */
export const MY_CLAIM_STATUS_KEYS: Record<ClaimStatus, { title: string; description: string }> = {
  pending: {
    title: 'myClaims.status.pending.title',
    description: 'myClaims.status.pending.description',
  },
  approved: {
    title: 'myClaims.status.approved.title',
    description: 'myClaims.status.approved.description',
  },
  rejected: {
    title: 'myClaims.status.rejected.title',
    description: 'myClaims.status.rejected.description',
  },
  withdrawn: {
    title: 'myClaims.status.withdrawn.title',
    description: 'myClaims.status.withdrawn.description',
  },
  completed: {
    title: 'myClaims.status.completed.title',
    description: 'myClaims.status.completed.description',
  },
  no_show: {
    title: 'myClaims.status.no_show.title',
    description: 'myClaims.status.no_show.description',
  },
};

/**
 * The claim statuses that keep the item page readable for their holder in
 * any item status — `GET /api/items/[id]` answers an `approved` or
 * `completed` claimant whatever the item has since become (DECISIONS.md,
 * 2026-08-08). Mirrors `ENTITLED_CLAIM_STATUSES` in
 * src/lib/items/visibility.ts, which is the server-side rule this predicts.
 */
const ENTITLING_CLAIM_STATUSES: readonly ClaimStatus[] = ['approved', 'completed'];

/**
 * Will the item page actually open for this claimant, or 404?
 *
 * A link that dead-ends is worse than no link, and three of the six statuses
 * dead-end: a `rejected`, `withdrawn` or `no_show` claimant is nobody
 * special to `GET /api/items/[id]` — holding a claim once is not a standing
 * key to a listing (DECISIONS.md, 2026-08-08) — so they only get through
 * while the item is still publicly `active`, which after a rejection it
 * usually is (the giver picked someone else, the item stays live) and after
 * a no-show always is (the release puts it straight back). An `approved` or
 * `completed` claimant always gets through, which matters most: approving
 * moves the item to `reserved`, and `reserved` is invisible to everyone else
 * on the planet.
 *
 * The one case this reads wrong is an item whose `expiresAt` has passed but
 * which the hourly sweep has not yet flipped to `expired`: it still says
 * `active` here, and a non-entitled claimant following the link would get a
 * 404. The response carries no `expiresAt` to check (API.md), the window is
 * at most an hour, and it closes itself.
 */
export function canOpenItem(claim: MyClaim): boolean {
  return ENTITLING_CLAIM_STATUSES.includes(claim.status) || claim.item.status === 'active';
}
