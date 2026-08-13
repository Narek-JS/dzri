import { getTranslations, setRequestLocale } from 'next-intl/server';

import { containerClassName } from '@/components/ui/Container';
import { Link, redirect } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { requireUser } from '@/lib/auth/session';
import { getMyItems } from '@/lib/items/mine';

import { MyItemsList } from './MyItemsList';

import type { MyItem } from '@/lib/api/client';

/**
 * The locale-less path the login page's `next` param round-trips back to.
 * Must never carry a locale prefix (src/lib/safeNext.ts) — `redirect()`
 * below adds the current one itself.
 */
const MY_ITEMS_PATH = '/my/items';

/**
 * The giver's own listings: everything this person has posted, whatever became
 * of it, and the only place a rejection reason or a pending-claim count is ever
 * shown.
 *
 * Server component. A signed-out visitor is REDIRECTED TO LOGIN, not shown a
 * 404 — the 404-not-403 rule (CLAUDE.md, API.md Rule 2) exists to stop
 * strangers probing for resources whose existence is itself a secret, and this
 * page is neither: it is the caller's own page, at a fixed path, already
 * advertised in the nav. Same reasoning, same shape, as the my-claims page.
 *
 * `requireUser()` rather than `getSession()` because the query needs a real
 * user id, and because a banned user must not read on with a 90-day cookie —
 * both cases take the same redirect.
 *
 * `getMyItems` (src/lib/items/mine.ts) is the exact query `GET /api/items/mine`
 * runs, called directly rather than over HTTP — the same split `getFeed`,
 * `getPendingQueue`, `getClaimsForOwner` and `getMyClaims` already established.
 * Pages 2+ are `MyItemsList`'s job: it renders this first page as given (no
 * client-side refetch on mount) and extends it from the route handler as the
 * giver asks for more.
 */
export default async function MyItemsPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const user = await requireUser();
  if (!user) {
    // `return` so the compiler narrows `user` below. `redirect` is typed to
    // return `never`, but it arrives here as a destructured property of
    // `createNavigation(routing)` rather than a name with an explicit type
    // annotation, which is what TypeScript's never-return narrowing needs.
    return redirect({ href: { pathname: '/login', query: { next: MY_ITEMS_PATH } }, locale });
  }

  const [page, t] = await Promise.all([getMyItems(user.id, null), getTranslations()]);

  // Frozen once, threaded down (serialized) to `MyItemsList` — see
  // src/lib/relativeTime.ts and `FeedList`'s `now` state for why every
  // "posted N days ago" on this page, on this first server-rendered page and
  // on every page the giver loads after it, reads against one instant instead
  // of each render's own `new Date()`.
  const now = new Date();

  // The route handler's own shape, built here rather than passed through:
  // `MyItemsList` appends pages fetched from `GET /api/items/mine`, so page 1
  // has to be the same JSON-shaped object as pages 2+.
  const items: MyItem[] = page.items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    rejectionReason: item.rejectionReason,
    createdAt: item.createdAt.toISOString(),
    expiresAt: item.expiresAt.toISOString(),
    imageUrl: item.imageUrl,
    claimCount: item.claimCount,
    pendingClaimCount: item.pendingClaimCount,
  }));

  return (
    <main
      className={containerClassName({ size: 'sm', className: 'flex flex-1 flex-col gap-6 py-8' })}
    >
      <h1 className="text-2xl font-semibold text-neutral-900">{t('pages.myItems')}</h1>

      {items.length === 0 ? (
        // A starting point, not a failure: nobody has done anything wrong by
        // not having posted yet, so the copy describes what this page will
        // hold and points at the one action that fills it.
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-lg font-medium text-neutral-800">{t('myItems.empty.title')}</p>
          <p className="text-sm text-neutral-600">{t('myItems.empty.description')}</p>
          <Link
            href="/items/new"
            className="mt-2 rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900"
          >
            {t('myItems.empty.cta')}
          </Link>
        </div>
      ) : (
        <MyItemsList
          initialItems={items}
          initialNextCursor={page.nextCursor}
          initialNow={now.toISOString()}
        />
      )}
    </main>
  );
}
