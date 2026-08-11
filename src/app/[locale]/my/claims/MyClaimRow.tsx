'use client';

import { useState } from 'react';

import Image from 'next/image';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { apiErrorMessageKey } from '@/lib/api/client';
import { relativeTimeMessage } from '@/lib/relativeTime';

import { canOpenItem, isWithdrawable, MY_CLAIM_STATUS_KEYS } from './claimStatusKeys';

import type { MyClaim } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

/**
 * The thumbnail's real rendered width, not the viewport: a fixed 64px square
 * below `sm` and 80px at or above it, matching the `size-16 sm:size-20` box
 * below. Next/Image turns this into a srcset, so a phone downloads the 64px
 * candidate rather than something viewport-sized — the image served here is
 * already the 400px variant (src/lib/claims/mine.ts), and this is what stops
 * the browser paying full price for it anyway.
 */
const THUMBNAIL_SIZES = '(min-width: 640px) 80px, 64px';

/**
 * One claim in the claimant's own list: the item's thumbnail and title, what
 * is happening with the claim, and when they asked.
 *
 * The status block is the point of the row. It reads as a sentence about
 * this person's situation, not an enum label — see `claimStatusKeys.ts`.
 * Nothing here is distinguished by colour alone: the approved row is tinted
 * because it is the one row with something to act on, but it also says "you
 * were picked" and carries a phone number no other row has.
 *
 * PHONE PRIVACY. `giver.phone` is an OPTIONAL key — the API omits it
 * entirely on anything but an approved claim, rather than sending null
 * (API.md Rule 1). It is read once, into a local, and rendered only where
 * that local is truthy; nothing on this page assumes the key exists.
 *
 * Withdraw is offered on a `pending` or `approved` claim and nowhere else
 * (API.md), behind an inline confirmation — the same shape `PendingClaimRow`
 * uses for approve, and for the same reason. From an approved claim it is
 * the consequential one on this page: the item goes back to the feed
 * immediately, the number above disappears, and the unique constraint on
 * (item, claimant) means there is no asking again. The confirm copy says all
 * three.
 *
 * `askedAgo` goes through `src/lib/relativeTime.ts`, not
 * `useFormatter().relativeTime` — see that file for why. `now` is frozen by
 * `MyClaimsList` and passed down, so every row on the page (and every row
 * appended by a later page) measures against the same instant.
 */
export function MyClaimRow({
  claim,
  now,
  busy,
  errorCode,
  onWithdraw,
}: {
  claim: MyClaim;
  now: Date;
  busy: boolean;
  errorCode: ApiErrorCode | null;
  onWithdraw: () => void;
}) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);

  const askedAgo = relativeTimeMessage(new Date(claim.createdAt), now);
  const statusKeys = MY_CLAIM_STATUS_KEYS[claim.status];
  const giverPhone = claim.giver.phone;
  const isApproved = claim.status === 'approved';

  const title = <span className="font-medium break-words">{claim.item.title}</span>;

  return (
    <li
      className={`flex flex-col gap-3 rounded border p-4 ${
        isApproved ? 'border-brand-strong bg-brand-tint' : 'border-neutral-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded bg-neutral-100 sm:size-20">
          {claim.item.thumbnailUrl && (
            <Image
              src={claim.item.thumbnailUrl}
              alt={t('itemDetail.gallery.photoAlt', { title: claim.item.title })}
              fill
              sizes={THUMBNAIL_SIZES}
              className="object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          {/* Linked only when the item page will actually answer this
              claimant — see `canOpenItem`. A rejected or withdrawn claimant
              gets a 404 there, and a link into a 404 is worse than a title
              that is simply not a link. */}
          {canOpenItem(claim) ? (
            <Link href={`/items/${claim.item.id}`} className="text-neutral-900 hover:underline">
              {title}
            </Link>
          ) : (
            <span className="text-neutral-900">{title}</span>
          )}

          <span className="text-xs text-neutral-500">
            {t('myClaims.askedAgo', {
              time: t(askedAgo.key as Parameters<typeof t>[0], askedAgo.values),
            })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <p
          className={`text-sm font-medium ${isApproved ? 'text-brand-strong' : 'text-neutral-900'}`}
        >
          {t(statusKeys.title as Parameters<typeof t>[0])}
        </p>
        <p className="text-sm text-neutral-700">
          {t(statusKeys.description as Parameters<typeof t>[0], {
            name: claim.giver.displayName,
          })}
        </p>
      </div>

      {giverPhone && (
        <div className="flex flex-col gap-0.5 rounded border border-neutral-300 bg-white p-3">
          <span className="text-xs text-neutral-600">{t('myClaims.giverPhone.label')}</span>
          <span className="text-sm text-neutral-900">{claim.giver.displayName}</span>
          <a href={`tel:${giverPhone}`} className="text-lg font-semibold text-neutral-900">
            {giverPhone}
          </a>
        </div>
      )}

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      {isWithdrawable(claim) &&
        (confirming ? (
          <div className="flex flex-col gap-2 rounded border border-neutral-400 bg-white p-3">
            <p className="text-sm font-medium text-neutral-900">
              {t('myClaims.withdraw.confirmTitle')}
            </p>
            <p className="text-sm text-neutral-700">
              {isApproved
                ? t('myClaims.withdraw.confirmApproved', { name: claim.giver.displayName })
                : t('myClaims.withdraw.confirmPending', { name: claim.giver.displayName })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {t('myClaims.withdraw.cancel')}
              </button>
              <button
                type="button"
                onClick={onWithdraw}
                disabled={busy}
                aria-busy={busy}
                className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                {t('myClaims.withdraw.submit')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 disabled:opacity-50"
            >
              {t('myClaims.withdraw.open')}
            </button>
          </div>
        ))}
    </li>
  );
}
