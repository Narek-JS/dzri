import type { ItemStatus } from '@/db/schema';

/**
 * Shared by `page.tsx` (the initial server render) and `ClaimsBoard` (which
 * keeps the label in sync with actions taken in this tab — see
 * `ClaimsBoard`'s `itemStatus` derivation for why a client-side copy of
 * this mapping is what fixes the header going stale after approve/
 * complete/no-show).
 */
export const ITEM_STATUS_KEYS: Record<ItemStatus, string> = {
  draft: 'itemClaims.itemStatus.draft',
  active: 'itemClaims.itemStatus.active',
  reserved: 'itemClaims.itemStatus.reserved',
  given: 'itemClaims.itemStatus.given',
  expired: 'itemClaims.itemStatus.expired',
  removed: 'itemClaims.itemStatus.removed',
  pending_review: 'itemClaims.itemStatus.pending_review',
  rejected: 'itemClaims.itemStatus.rejected',
};
