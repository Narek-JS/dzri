'use client';

import { useState } from 'react';

import Image from 'next/image';

import { useLocale, useTranslations } from 'next-intl';

import { Button, buttonClassName } from '@/components/ui/Button';
import { Notice, noticeClassName } from '@/components/ui/Notice';
import { Link } from '@/i18n/navigation';
import { apiErrorMessageKey } from '@/lib/api/client';
import { resolveLocalizedText } from '@/lib/items/localizedText';
import { relativeTimeMessage } from '@/lib/relativeTime';

import { hasClaimsToShow, isRemovable, MY_ITEM_STATUS_KEYS } from './itemStatusKeys';

import type { MyItem } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';

/**
 * The thumbnail's real rendered width, not the viewport: a fixed 64px square
 * below `sm` and 80px at or above it, matching the `size-16 sm:size-20` box
 * below. Next/Image turns this into a srcset, so a phone downloads the 64px
 * candidate rather than something viewport-sized — the image served here is
 * already the 400px variant (src/lib/items/mine.ts), and this is what stops
 * the browser paying full price for it anyway.
 */
const THUMBNAIL_SIZES = '(min-width: 640px) 80px, 64px';

/**
 * One listing in the giver's own list: the thumbnail and title, what is
 * happening with it, when they posted it, and who is waiting.
 *
 * The status block is the point of the row — this page is where a giver comes
 * to find out what became of the things they posted. It reads as a sentence
 * about their listing, not an enum label; see `itemStatusKeys.ts`. Nothing
 * here is distinguished by colour alone: the row with pending claims is tinted
 * because it is the one row with something to act on, but it also says how
 * many people are waiting and carries a link no other row has.
 *
 * `rejectionReason` is text an admin wrote TO THIS PERSON (API.md: "write it
 * as a message to a person, not an internal note"), so it is rendered
 * verbatim, and only on a `rejected` item — the column is null everywhere
 * else, and the `rejection_reason_matches_status` check constraint is what
 * makes that true rather than a convention this component has to trust.
 *
 * The title always links to the item page. Unlike the my-claims list there is
 * no dead-end problem to guard against: `GET /api/items/[id]` answers the
 * owner in every status, including the ones nobody else can see. The claims
 * page is linked only when there is something on it — see `hasClaimsToShow`.
 *
 * Delete is offered from the four statuses the API accepts and nowhere else
 * (`isRemovable`), behind an inline confirmation — the same shape
 * `MyClaimRow` and `PendingClaimRow` use, and for the same reason. The confirm
 * copy says what actually happens, including the part that costs other people
 * something: every pending claim on the listing is rejected. On a `reserved`
 * item there is no button and a line saying why instead — somebody was picked
 * and may be on their way, so the way out is a handover or a no-show, not a
 * deletion.
 *
 * `postedAgo` goes through `src/lib/relativeTime.ts`, not
 * `useFormatter().relativeTime` — see that file for why. `now` is frozen by
 * `MyItemsList` and passed down, so every row on the page (and every row
 * appended by a later page) measures against the same instant.
 */
export function MyItemRow({
  item,
  now,
  busy,
  errorCode,
  onDelete,
}: {
  item: MyItem;
  now: Date;
  busy: boolean;
  errorCode: ApiErrorCode | null;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);

  const postedAgo = relativeTimeMessage(new Date(item.createdAt), now);
  const statusKeys = MY_ITEM_STATUS_KEYS[item.status];
  // Falls back to item.sourceLocale's column for a pending_review or
  // rejected item that hasn't been translated into the viewer's locale yet
  // — this list mixes every status, unlike the public feed/detail views
  // where item_translations_complete_when_active makes the fallback moot.
  const title =
    resolveLocalizedText(
      { hy: item.titleHy, ru: item.titleRu, en: item.titleEn },
      item.sourceLocale,
      locale,
    ) ?? '';

  // The main call to action on this screen: real people are waiting on a
  // decision right now, and the decision is made on the claims page.
  const waiting = item.pendingClaimCount > 0;
  const claimsHref = `/items/${item.id}/claims`;

  return (
    <li
      className={
        waiting
          ? noticeClassName({ tone: 'brand', className: 'flex flex-col gap-3' })
          : 'flex flex-col gap-3 rounded border border-neutral-300 p-4'
      }
    >
      <div className="flex items-start gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded bg-neutral-100 sm:size-20">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt={t('itemDetail.gallery.photoAlt', { title })}
              fill
              sizes={THUMBNAIL_SIZES}
              className="object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/items/${item.id}`} className="text-neutral-900 hover:underline">
            <span className="font-medium break-words">{title}</span>
          </Link>

          <span className="text-xs text-neutral-500">
            {t('myItems.postedAgo', {
              time: t(postedAgo.key as Parameters<typeof t>[0], postedAgo.values),
            })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-neutral-900">
          {t(statusKeys.title as Parameters<typeof t>[0])}
        </p>
        <p className="text-sm text-neutral-700">
          {t(statusKeys.description as Parameters<typeof t>[0])}
        </p>
      </div>

      {/* Verbatim, on a rejected item and nowhere else. Whitespace is
          preserved because an admin may have written more than one line, and
          `break-words` because nothing constrains what they typed. */}
      {item.status === 'rejected' && item.rejectionReason && (
        <Notice tone="subtle" size="sm" className="flex flex-col gap-1">
          <span className="text-xs text-neutral-600">{t('myItems.rejectionReason.label')}</span>
          <p className="text-sm break-words whitespace-pre-wrap text-neutral-900">
            {item.rejectionReason}
          </p>
        </Notice>
      )}

      {waiting ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-brand-strong">
            {t('common.pendingClaimCount', { count: item.pendingClaimCount })}
          </span>
          <Link href={claimsHref} className={buttonClassName()}>
            {t('myItems.claims.decide')}
          </Link>
        </div>
      ) : hasClaimsToShow(item) ? (
        <div className="flex">
          <Link href={claimsHref} className="text-sm text-brand-strong hover:underline">
            {t('myItems.claims.history', { count: item.claimCount })}
          </Link>
        </div>
      ) : (
        // Only on a live listing: "nobody yet" is news there, and noise on
        // something that was never on the feed or is long finished.
        item.status === 'active' && (
          <p className="text-sm text-neutral-600">{t('myItems.claims.none')}</p>
        )
      )}

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      {item.status === 'reserved' && (
        <p className="text-sm text-neutral-600">{t('myItems.delete.reserved')}</p>
      )}

      {isRemovable(item) &&
        (confirming ? (
          <Notice tone="strong" size="sm" className="flex flex-col gap-2">
            <p className="text-sm font-medium text-neutral-900">
              {t('myItems.delete.confirmTitle')}
            </p>
            <p className="text-sm text-neutral-700">{t('myItems.delete.confirmDescription')}</p>
            {/* Said plainly and separately, because it is the part that costs
                somebody other than the giver something. */}
            {item.pendingClaimCount > 0 && (
              <p className="text-sm text-neutral-700">
                {t('myItems.delete.confirmClaims', { count: item.pendingClaimCount })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                {t('myItems.delete.cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={onDelete}
                disabled={busy}
                aria-busy={busy}
              >
                {t('myItems.delete.submit')}
              </Button>
            </div>
          </Notice>
        ) : (
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              {t('myItems.delete.open')}
            </Button>
          </div>
        ))}
    </li>
  );
}
