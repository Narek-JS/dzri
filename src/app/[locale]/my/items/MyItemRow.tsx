'use client';

import Image from 'next/image';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { relativeTimeMessage } from '@/lib/relativeTime';

import type { MyItem } from '@/lib/api/client';

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
 * One listing in the giver's own list: the thumbnail, the title, and when they
 * posted it.
 *
 * The title always links to the item page. Unlike the my-claims list, there is
 * no dead-end problem to guard against here — `GET /api/items/[id]` answers the
 * owner in every status, including the ones nobody else can see, so the link
 * resolves whatever the row says.
 *
 * `postedAgo` goes through `src/lib/relativeTime.ts`, not
 * `useFormatter().relativeTime` — see that file for why. `now` is frozen by
 * `MyItemsList` and passed down, so every row on the page (and every row
 * appended by a later page) measures against the same instant.
 */
export function MyItemRow({ item, now }: { item: MyItem; now: Date }) {
  const t = useTranslations();

  const postedAgo = relativeTimeMessage(new Date(item.createdAt), now);

  return (
    <li className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
      <div className="flex items-start gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded bg-neutral-100 sm:size-20">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt={t('itemDetail.gallery.photoAlt', { title: item.title })}
              fill
              sizes={THUMBNAIL_SIZES}
              className="object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/items/${item.id}`} className="text-neutral-900 hover:underline">
            <span className="font-medium break-words">{item.title}</span>
          </Link>

          <span className="text-xs text-neutral-500">
            {t('myItems.postedAgo', {
              time: t(postedAgo.key as Parameters<typeof t>[0], postedAgo.values),
            })}
          </span>
        </div>
      </div>
    </li>
  );
}
