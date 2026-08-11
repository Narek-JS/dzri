'use client';

import Image from 'next/image';

import { useTranslations } from 'next-intl';

import { relativeTimeMessage } from '@/lib/relativeTime';

import type { MyClaim } from '@/lib/api/client';

/**
 * The thumbnail's real rendered width, not the viewport: a fixed 64px square
 * below `sm` and 80px at or above it, matching the `size-16 sm:size-20` box
 * below. Next/Image turns this into a srcset, so a phone downloads the 64px
 * candidate rather than something viewport-sized — the image served here is
 * already the 400px variant (src/lib/claims/mine.ts), and this is what stops
 * the browser from paying full price for it anyway.
 */
const THUMBNAIL_SIZES = '(min-width: 640px) 80px, 64px';

/**
 * One claim in the claimant's own list: the item's thumbnail and title, and
 * when they asked for it.
 *
 * `askedAgo` goes through `src/lib/relativeTime.ts`, not
 * `useFormatter().relativeTime` — see that file for why. `now` is frozen by
 * `MyClaimsList` and passed down, so every row on the page (and every row
 * appended by a later page) measures against the same instant.
 */
export function MyClaimRow({ claim, now }: { claim: MyClaim; now: Date }) {
  const t = useTranslations();
  const askedAgo = relativeTimeMessage(new Date(claim.createdAt), now);

  return (
    <li className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
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
          <span className="font-medium break-words text-neutral-900">{claim.item.title}</span>
          <span className="text-xs text-neutral-500">
            {t('myClaims.askedAgo', {
              time: t(askedAgo.key as Parameters<typeof t>[0], askedAgo.values),
            })}
          </span>
        </div>
      </div>
    </li>
  );
}
