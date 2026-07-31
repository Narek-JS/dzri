import { NextResponse } from 'next/server';

import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { apiError, readJson } from '@/lib/http';
import { MAX_IMAGE_BYTES, isAllowedContentType, presignUpload } from '@/lib/r2';
import {
  getClientIp,
  imagePresignPerIp,
  imagePresignPerUser,
  retryAfterHeader,
} from '@/lib/ratelimit';

const presignSchema = z.object({
  /**
   * The declared MIME type. Only structurally validated here (a short
   * string) and checked against the allowlist in the handler, so a
   * disallowed type maps to INVALID_FILE_TYPE rather than a generic
   * INVALID_BODY.
   */
  contentType: z.string().min(1).max(100),
  /**
   * Byte count the client intends to upload. Structurally a positive
   * integer here; the 8 MB ceiling is enforced in the handler so it maps to
   * FILE_TOO_LARGE. This value is bound into the signature downstream.
   */
  contentLength: z.number().int().positive(),
});

/**
 * Signs a direct-to-R2 upload. The browser PUTs the file straight to R2
 * with the returned URL; only the signature is produced here, so the bytes
 * never pass through Vercel (DECISIONS.md).
 *
 * `requireUser`, not `getSession`: minting an upload credential acts on the
 * user's behalf, so a banned account must not get one. `requireUser` reads
 * `is_banned` and returns null, which becomes the 401 below.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser();

  if (!user) {
    return apiError('UNAUTHORIZED');
  }

  // Limiters run before the body work (CLAUDE.md — image upload is on the
  // list). Per-user first (the tighter budget), then per-IP. Both are the
  // caller's own budget, so an invalid request that spends a token only
  // slows the caller down.
  const perUser = await imagePresignPerUser().limit(user.id);
  if (!perUser.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perUser.reset) });
  }

  const perIp = await imagePresignPerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const parsed = presignSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError('INVALID_BODY');
  }

  const { contentType, contentLength } = parsed.data;

  if (!isAllowedContentType(contentType)) {
    return apiError('INVALID_FILE_TYPE');
  }
  if (contentLength > MAX_IMAGE_BYTES) {
    return apiError('FILE_TOO_LARGE');
  }

  // The key is generated server-side inside presignUpload — never taken
  // from the client — and namespaced under uploads/{userId}/.
  const upload = await presignUpload({ userId: user.id, contentType, contentLength });

  return NextResponse.json(upload, {
    // A short-lived write credential scoped to one user — never cache it.
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
