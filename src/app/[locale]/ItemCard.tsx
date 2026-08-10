import Image from 'next/image';

import { Link } from '@/i18n/navigation';

import type { FeedItem } from '@/lib/api/client';

/**
 * The card's real rendered width at each breakpoint, not the viewport —
 * derived from the grid this card is always placed in (`grid-cols-2
 * sm:grid-cols-3 lg:grid-cols-4`, `gap-4`, inside a `max-w-6xl px-6`
 * container). Above the container's 1152px cap the column width is fixed,
 * so the widest breakpoint is a literal pixel value; below it the columns
 * are fluid, so those are `vw`-based approximations of
 * `(100vw - padding - gaps) / columns`. Getting this right is what keeps
 * the feed's 24 thumbnails per page from downloading a viewport-sized
 * image apiece — the single largest lever on egress this page has
 * (CLAUDE.md).
 */
const CARD_IMAGE_SIZES = '(min-width: 1024px) 264px, (min-width: 640px) 31vw, 46vw';

/**
 * One feed card: thumbnail, title, condition, district, posted-ago. No
 * `'use client'` — `FeedList` (a Client Component) renders it for both the
 * server-rendered first page and its own client-fetched pages, so every
 * display string (`thumbnailAlt`, `conditionLabel`, `districtName`,
 * `postedAgo`) arrives pre-formatted from `FeedList`'s `useTranslations()`
 * rather than this component picking a translator itself. `postedAgo`
 * specifically goes through `src/lib/relativeTime.ts`, not
 * `useFormatter().relativeTime` — see that file for why.
 *
 * The feed response carries no `width`, `height` or `blurhash` for its
 * images (API.md — kept out to keep 24-item pages light), unlike the item
 * detail gallery, which has all three. There is nothing to paint as a
 * placeholder, so the box is a fixed `aspect-square` (matching the
 * gallery's own square convention) filled with a plain neutral background
 * until the thumbnail — already the small 400px variant — loads in.
 */
export function ItemCard({
  item,
  thumbnailAlt,
  conditionLabel,
  districtName,
  postedAgo,
}: {
  item: FeedItem;
  thumbnailAlt: string;
  conditionLabel: string;
  districtName: string;
  postedAgo: string;
}) {
  return (
    <Link href={`/items/${item.id}`} className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded bg-neutral-100">
        {item.thumbnailUrl && (
          <Image
            src={item.thumbnailUrl}
            alt={thumbnailAlt}
            fill
            sizes={CARD_IMAGE_SIZES}
            className="object-cover"
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <h2 className="line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</h2>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-600">
          <span>{conditionLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{districtName}</span>
        </div>
        <span className="text-xs text-neutral-500">{postedAgo}</span>
      </div>
    </Link>
  );
}
