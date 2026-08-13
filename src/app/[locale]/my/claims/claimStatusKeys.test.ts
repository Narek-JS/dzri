import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';

import en from '../../../../../messages/en.json';
import hy from '../../../../../messages/hy.json';
import ru from '../../../../../messages/ru.json';

import { myClaimStatusKeys } from './claimStatusKeys';

import type { ClaimRejectedReason, ClaimStatus } from '@/db/schema';
import type { MyClaim } from '@/lib/api/client';

/** The fields `myClaimStatusKeys` actually reads are `status` and `rejectedReason` — everything else is filler to satisfy the type. */
function mockClaim(status: ClaimStatus, rejectedReason?: ClaimRejectedReason): MyClaim {
  return {
    id: 'claim-1',
    status,
    ...(rejectedReason ? { rejectedReason } : {}),
    message: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    item: { id: 'item-1', title: 'Test item', status: 'active', thumbnailUrl: null },
    giver: { displayName: 'Test Giver' },
  };
}

describe('myClaimStatusKeys', () => {
  it("resolves 'pending' to its own key pair", () => {
    expect(myClaimStatusKeys(mockClaim('pending'))).toEqual({
      title: 'myClaims.status.pending.title',
      description: 'myClaims.status.pending.description',
    });
  });

  it("resolves 'approved' to its own key pair", () => {
    expect(myClaimStatusKeys(mockClaim('approved'))).toEqual({
      title: 'myClaims.status.approved.title',
      description: 'myClaims.status.approved.description',
    });
  });

  it("resolves 'withdrawn' to its own key pair", () => {
    expect(myClaimStatusKeys(mockClaim('withdrawn'))).toEqual({
      title: 'myClaims.status.withdrawn.title',
      description: 'myClaims.status.withdrawn.description',
    });
  });

  it("resolves 'completed' to its own key pair", () => {
    expect(myClaimStatusKeys(mockClaim('completed'))).toEqual({
      title: 'myClaims.status.completed.title',
      description: 'myClaims.status.completed.description',
    });
  });

  it("resolves 'no_show' to its own key pair", () => {
    expect(myClaimStatusKeys(mockClaim('no_show'))).toEqual({
      title: 'myClaims.status.no_show.title',
      description: 'myClaims.status.no_show.description',
    });
  });

  /**
   * `rejected` is the one status whose copy depends on a second field. Each
   * of the three routes to it (DECISIONS.md, 2026-08-13) must land on its
   * own key pair, not the shared `myClaims.status.rejected.*` fallback —
   * that fallback exists only for a reason value this bundle has never
   * heard of, never for one of these three.
   */
  it("resolves 'rejected' + 'declined' to the declined key pair", () => {
    expect(myClaimStatusKeys(mockClaim('rejected', 'declined'))).toEqual({
      title: 'myClaims.status.rejected_declined.title',
      description: 'myClaims.status.rejected_declined.description',
    });
  });

  it("resolves 'rejected' + 'lost_to_other_claimant' to the lost key pair", () => {
    expect(myClaimStatusKeys(mockClaim('rejected', 'lost_to_other_claimant'))).toEqual({
      title: 'myClaims.status.rejected_lost.title',
      description: 'myClaims.status.rejected_lost.description',
    });
  });

  it("resolves 'rejected' + 'item_removed' to the removed key pair", () => {
    expect(myClaimStatusKeys(mockClaim('rejected', 'item_removed'))).toEqual({
      title: 'myClaims.status.rejected_removed.title',
      description: 'myClaims.status.rejected_removed.description',
    });
  });
});

/**
 * Every key `myClaimStatusKeys` can hand back must resolve to a real,
 * non-empty string in all three catalogs — a title that exists in English
 * but was never added to Armenian or Russian would otherwise only surface
 * by clicking through the my-claims screen in that locale by hand.
 *
 * `src/i18n/messages.test.ts` already asserts the three catalogs share
 * exactly one set of keys, which would itself have caught a missing key —
 * this test is narrower and cheaper to read: it names the exact claims this
 * page depends on and fails on the specific key, not on a diff of the whole
 * catalog.
 */
describe('myClaims.status translations', () => {
  const claims: MyClaim[] = [
    mockClaim('pending'),
    mockClaim('approved'),
    mockClaim('withdrawn'),
    mockClaim('completed'),
    mockClaim('no_show'),
    mockClaim('rejected', 'declined'),
    mockClaim('rejected', 'lost_to_other_claimant'),
    mockClaim('rejected', 'item_removed'),
  ];

  const keys = claims.flatMap((claim) => {
    const { title, description } = myClaimStatusKeys(claim);
    return [title, description];
  });

  const catalogs = { hy, ru, en } as const;
  const locales = Object.keys(catalogs) as (keyof typeof catalogs)[];

  for (const locale of locales) {
    it(`resolves every key to a non-empty string in ${locale}`, () => {
      const t = createTranslator({ locale, messages: catalogs[locale] });

      for (const key of keys) {
        // Every `description` interpolates `{name}` (the giver's display
        // name); `title` never does, and use-intl ignores an unused value.
        // `key` comes back from `myClaimStatusKeys()` as a plain `string`, not
        // one of use-intl's typed literal paths — that's the whole point of
        // this test, so the cast is intentional, not a type-safety hole.
        const resolved = t(key as Parameters<typeof t>[0], { name: 'Անի' } as never);
        expect(resolved, key).not.toBe(key);
        expect(resolved.trim(), key).not.toBe('');
      }
    });
  }
});
