import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { approveItem } from '@/lib/items/moderate';

const titleField = z.string().trim().min(3).max(100).optional();
const descriptionField = z.string().trim().max(2000).optional();

/**
 * The missing locales' translations, when the item's `needsTranslation` is
 * true. Optional at every key — `approveItem` is what knows which of these
 * are actually required for a given item, and returns TRANSLATIONS_REQUIRED
 * if one is missing; this schema only rejects a structurally malformed
 * value (wrong type, too short, too long).
 */
const approveTranslationsSchema = z.object({
  titleHy: titleField,
  titleRu: titleField,
  titleEn: titleField,
  descriptionHy: descriptionField,
  descriptionRu: descriptionField,
  descriptionEn: descriptionField,
});

/**
 * POST /api/admin/items/[id]/approve — publish a pending item.
 *
 * ADMIN ONLY, 404 to everyone else so the surface is not discoverable.
 *
 * Only valid from `pending_review`; any other status (or a missing item)
 * returns INVALID_STATUS_TRANSITION. The transition helper does this as a
 * conditional update, so a double-click resolves to exactly one approval and
 * the second attempt gets INVALID_STATUS_TRANSITION rather than re-stamping
 * the review.
 *
 * No body is required. This historically took none at all — a caller that
 * still sends none gets exactly the old behavior, because `readJson`
 * returns null for an absent body and that parses to `{}` here. A body is
 * only meaningful when the item's `needsTranslation` is true, and
 * `approveItem` (src/lib/items/moderate.ts) is what actually knows which
 * locales are missing and returns TRANSLATIONS_REQUIRED — 400 — if the
 * caller didn't supply all of them.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return apiError('NOT_FOUND');
  }

  const { id } = await params;

  // A malformed uuid can never name a pending item; treat it as the same
  // refusal rather than letting it reach Postgres and 500.
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('INVALID_STATUS_TRANSITION');
  }

  const parsed = approveTranslationsSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  const result = await approveItem(id, admin.id, parsed.data);
  if (!result.ok) {
    return apiError(result.code);
  }

  return NextResponse.json({ id, status: 'active' }, { headers: { 'Cache-Control': 'no-store' } });
}
