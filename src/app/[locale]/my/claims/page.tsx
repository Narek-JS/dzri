import { getTranslations, setRequestLocale } from 'next-intl/server';

import { buttonClassName } from '@/components/ui/Button';
import { containerClassName } from '@/components/ui/Container';
import { Link, redirect } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { requireUser } from '@/lib/auth/session';
import { getMyClaims } from '@/lib/claims/mine';

import { MyClaimsList } from './MyClaimsList';

import type { MyClaim } from '@/lib/api/client';

/**
 * The locale-less path the login page's `next` param round-trips back to.
 * Must never carry a locale prefix (src/lib/safeNext.ts) — `redirect()`
 * below adds the current one itself.
 */
const MY_CLAIMS_PATH = '/my/claims';

/**
 * The claimant's own list: everything they have asked for, and the only
 * place a claimant is ever shown the giver's phone number.
 *
 * Server component. A signed-out visitor is REDIRECTED TO LOGIN, not shown a
 * 404 — the 404-not-403 rule (CLAUDE.md, API.md Rule 2) exists to stop
 * strangers probing for resources whose existence is itself a secret, and
 * this page is neither: it is the caller's own page, at a fixed path, whose
 * existence is already advertised in the nav. Sending them to login with a
 * `next` back to here is the honest answer, and they land on their claims
 * once they are in.
 *
 * `requireUser()` rather than `getSession()` because the query needs a real
 * user id, and because a banned user must not read on with a 90-day cookie —
 * both cases take the same redirect.
 *
 * `getMyClaims` (src/lib/claims/mine.ts) is the exact query
 * `GET /api/claims/mine` runs, called directly rather than over HTTP — the
 * same split `getFeed`, `getPendingQueue` and `getClaimsForOwner` already
 * established. Pages 2+ are `MyClaimsList`'s job: it renders this first page
 * as given (no client-side refetch on mount) and extends it from the route
 * handler as the claimant asks for more.
 */
export default async function MyClaimsPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const user = await requireUser();
  if (!user) {
    // `return` so the compiler narrows `user` below. `redirect` is typed to
    // return `never`, but it arrives here as a destructured property of
    // `createNavigation(routing)` rather than a name with an explicit type
    // annotation, which is what TypeScript's never-return narrowing needs.
    return redirect({ href: { pathname: '/login', query: { next: MY_CLAIMS_PATH } }, locale });
  }

  const [page, t] = await Promise.all([getMyClaims(user.id, null), getTranslations()]);

  // Frozen once, threaded down (serialized) to `MyClaimsList` — see
  // src/lib/relativeTime.ts and `FeedList`'s `now` state for why every
  // "asked N days ago" on this page, on this first server-rendered page and
  // on every page the claimant loads after it, reads against one instant
  // instead of each render's own `new Date()`.
  const now = new Date();

  // The route handler's own shape, built here rather than passed through:
  // `MyClaimsList` appends pages fetched from `GET /api/claims/mine`, so
  // page 1 has to be the same JSON-shaped object as pages 2+. `rejectedReason`
  // and the phone key are both spread conditionally for the same reason the
  // API omits them — a non-rejected claim carries no reason field, and a
  // non-approved claim carries no phone field, not a null one either way.
  const claims: MyClaim[] = page.claims.map((claim) => ({
    id: claim.id,
    status: claim.status,
    ...(claim.rejectedReason ? { rejectedReason: claim.rejectedReason } : {}),
    message: claim.message,
    createdAt: claim.createdAt.toISOString(),
    item: claim.item,
    giver: claim.giver,
  }));

  return (
    <main
      className={containerClassName({ size: 'sm', className: 'flex flex-1 flex-col gap-6 py-8' })}
    >
      <h1 className="text-2xl font-semibold text-neutral-900">{t('pages.myClaims')}</h1>

      {claims.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-lg font-medium text-neutral-800">{t('myClaims.empty.title')}</p>
          <p className="text-sm text-neutral-600">{t('myClaims.empty.description')}</p>
          <Link href="/" className={buttonClassName({ className: 'mt-2' })}>
            {t('myClaims.empty.cta')}
          </Link>
        </div>
      ) : (
        <MyClaimsList
          initialClaims={claims}
          initialNextCursor={page.nextCursor}
          initialNow={now.toISOString()}
        />
      )}
    </main>
  );
}
