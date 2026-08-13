import type { ClaimRejectedReason, ClaimStatus } from '@/db/schema';
import type { MyClaim } from '@/lib/api/client';

type StatusCopy = { title: string; description: string };

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
const MY_CLAIM_STATUS_KEYS: Record<ClaimStatus, StatusCopy> = {
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
 * `rejected` is three different events wearing one status, and they are not
 * interchangeable news for the person reading this screen:
 *
 *  - `declined` — the giver read this request and said no to it. Nobody was
 *    picked; the listing is still there and may still go to somebody else.
 *  - `lost_to_other_claimant` — the giver picked another person, which
 *    auto-rejected this claim (the cascade in `approveClaim`).
 *  - `item_removed` — the giver took the listing down, which rejected every
 *    pending claim on it (the cascade in `removeItem`). Nobody was picked and
 *    there is nothing left to ask for.
 *
 * This used to be inferred from `claim.item.status === 'removed'`, which could
 * only ever see the third case and got even that wrong on ordering — a giver
 * who deleted a listing weeks after rejecting somebody rewrote that old
 * rejection into "listing taken down". The claim row now records which route
 * it took (`claims.rejected_reason`, set in the same statement as the status),
 * so the copy is read off the event instead of reconstructed from the item's
 * present state. Item status is no longer consulted here at all.
 */
const MY_CLAIM_REJECTED_KEYS: Record<ClaimRejectedReason, StatusCopy> = {
  declined: {
    title: 'myClaims.status.rejected_declined.title',
    description: 'myClaims.status.rejected_declined.description',
  },
  lost_to_other_claimant: {
    title: 'myClaims.status.rejected_lost.title',
    description: 'myClaims.status.rejected_lost.description',
  },
  item_removed: {
    title: 'myClaims.status.rejected_removed.title',
    description: 'myClaims.status.rejected_removed.description',
  },
};

/**
 * The copy for one claim, which for a rejection depends on `rejectedReason`.
 *
 * `claim_rejected_reason_matches_status` makes a rejected claim without a
 * reason unrepresentable, so the fallback is for one case only: a tab left
 * open across a deploy that added a fourth reason this bundle has never heard
 * of. It falls back to `myClaims.status.rejected.*`, which is deliberately
 * written to be true of any rejection — the specific claim that somebody else
 * was picked lives in `rejected_lost` now, and is never the guess.
 */
export function myClaimStatusKeys(claim: MyClaim): StatusCopy {
  if (claim.status === 'rejected') {
    const reason = claim.rejectedReason;
    return (reason && MY_CLAIM_REJECTED_KEYS[reason]) ?? MY_CLAIM_STATUS_KEYS.rejected;
  }

  return MY_CLAIM_STATUS_KEYS[claim.status];
}

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

/**
 * `pending` and `approved` only — the two statuses
 * `POST /api/claims/[id]/withdraw` accepts (API.md). Everything else is
 * already settled and the server answers INVALID_STATUS_TRANSITION, so the
 * button is not offered rather than offered and refused.
 *
 * This is the client's copy of the server's rule, not the rule itself: the
 * state can move under an open tab, which is what the 409 handling in
 * `MyClaimsList` is for.
 */
const WITHDRAWABLE_CLAIM_STATUSES: readonly ClaimStatus[] = ['pending', 'approved'];

export function isWithdrawable(claim: MyClaim): boolean {
  return WITHDRAWABLE_CLAIM_STATUSES.includes(claim.status);
}
