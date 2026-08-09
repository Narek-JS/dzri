import { notFound } from 'next/navigation';

import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminStats } from '@/lib/items/adminStats';
import { getPendingQueue } from '@/lib/items/pendingQueue';

import { ModerationQueue } from './ModerationQueue';

/**
 * The moderation queue: review pending items, approve or reject with a
 * reason. Nothing posted is visible on the feed until this page (or the
 * endpoints behind it) says so.
 *
 * Server component. `requireAdmin()` returns null for anonymous *and* for
 * a signed-in non-admin — both get the same `notFound()` the API gives
 * them (CLAUDE.md Rule 2), never a "you don't have permission" page, so a
 * logged-in stranger probing `/admin` learns nothing.
 *
 * Both the stats and the first page of the queue are read directly from
 * `src/lib/items/` (`getAdminStats`, `getPendingQueue`) — the same
 * functions the admin API routes call — rather than fetching this app's
 * own API over HTTP, the same split `getFeed` and `getItemForViewer`
 * already established for the feed and item detail pages.
 */
export default async function AdminPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const [stats, queue, t, format] = await Promise.all([
    getAdminStats(),
    getPendingQueue(null),
    getTranslations(),
    getFormatter(),
  ]);

  const items = queue.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t('pages.admin')}</h1>

      {/* The pending count and the age of the oldest pending item are what
          say whether pre-moderation is still keeping up or has become the
          bottleneck (DECISIONS.md, 2026-07-31) — shown above the queue so
          that answer is visible before scrolling past a single row. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border border-neutral-300 p-4">
          <p className="text-sm text-neutral-600">{t('admin.stats.pendingCount')}</p>
          <p className="text-2xl font-semibold text-neutral-900">{stats.pendingCount}</p>
        </div>
        <div className="rounded border border-neutral-300 p-4">
          <p className="text-sm text-neutral-600">{t('admin.stats.oldestPending')}</p>
          <p className="text-2xl font-semibold text-neutral-900">
            {stats.oldestPendingAt
              ? format.relativeTime(stats.oldestPendingAt, new Date())
              : t('admin.stats.oldestPendingNone')}
          </p>
        </div>
      </div>

      <ModerationQueue initialItems={items} initialNextCursor={queue.nextCursor} />
    </main>
  );
}
