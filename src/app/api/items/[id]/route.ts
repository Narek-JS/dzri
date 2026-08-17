import { NextResponse } from 'next/server';

import { z } from 'zod';

import { getSession, requireUser } from '@/lib/auth/session';
import { apiError } from '@/lib/http';
import { getItemForViewer } from '@/lib/items/visibility';
import { removeItem } from '@/lib/items/remove';

/**
 * A public detail response is identical for everyone, so it lands in the same
 * short shared cache as the feed. Every privileged view — the owner's of a
 * pending or rejected item, the claimant's of an item reserved for them — must
 * never be cached, so those paths are `no-store, private`.
 */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const PRIVATE_CACHE = 'no-store, private';

/**
 * GET /api/items/[id] — a single listing.
 *
 * A thin wrapper: `getItemForViewer` (src/lib/items/visibility.ts) is the one
 * place that decides who may read an item and what it costs them (a view
 * count bump). This route handler only turns that answer into an HTTP
 * response — same statuses, same 404s, same cache headers as before the
 * logic moved. The item-detail page (src/app/[locale]/items/[id]) calls the
 * same function directly rather than reimplementing any of it, per
 * CLAUDE.md: two copies of this rule is two places to get it wrong forever.
 *
 * `rejectionReason` and `ownerId`, which the shared function returns for a
 * caller that needs them, are deliberately left off this response — no
 * behaviour change from before the extraction. The phone is never selected
 * by the shared query for anyone (CLAUDE.md Rule 1).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Cookie-only, so the anonymous path stays a single query with no session
  // round trip.
  const session = await getSession();

  const result = await getItemForViewer(id, session);
  if (!result) {
    return apiError('ITEM_NOT_FOUND');
  }

  const { item, isPrivateView } = result;

  return NextResponse.json(
    {
      item: {
        id: item.id,
        titleHy: item.titleHy,
        titleRu: item.titleRu,
        titleEn: item.titleEn,
        descriptionHy: item.descriptionHy,
        descriptionRu: item.descriptionRu,
        descriptionEn: item.descriptionEn,
        sourceLocale: item.sourceLocale,
        condition: item.condition,
        pickupNotes: item.pickupNotes,
        status: item.status,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        images: item.images,
        district: item.district,
        category: item.category,
        giver: item.giver,
      },
    },
    { headers: { 'Cache-Control': isPrivateView ? PRIVATE_CACHE : PUBLIC_CACHE } },
  );
}

/**
 * DELETE /api/items/[id] — the giver takes their own listing down.
 *
 * OWNER ONLY. Anybody else — signed in or not — gets 404, the same answer the
 * read path gives them, so a stranger cannot learn that an id names a real
 * item by trying to delete it.
 *
 * Soft delete: the item moves to `removed`, which hides it everywhere, but the
 * row, its images and its R2 objects all stay. See `removeItem` for why, and
 * for why `reserved`, `given` and `expired` are refused with
 * INVALID_STATUS_TRANSITION rather than removed — an item somebody is on their
 * way to collect must not vanish from under them.
 *
 * `requireUser`, not `getSession`: this acts on the user's behalf and writes,
 * so a banned account must be turned away (it reads `is_banned`).
 *
 * The response is the resolved status rather than a bare 204, so the client can
 * update the row it is showing without a re-fetch.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  const { id } = await params;

  // A malformed uuid can never name an item; short-circuit rather than letting
  // it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('ITEM_NOT_FOUND');
  }

  const result = await removeItem(id, user.id);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json(
    { id, status: 'removed' },
    { headers: { 'Cache-Control': PRIVATE_CACHE } },
  );
}
