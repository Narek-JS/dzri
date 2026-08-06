import { NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { runSweep } from '@/lib/cron/sweep';
import { apiError } from '@/lib/http';

/**
 * GET /api/cron/sweep — releases lapsed reservations, expires stale items and
 * deletes dead OTP rows.
 *
 * Called hourly by `.github/workflows/sweep.yml` with the `CRON_SECRET` bearer
 * token. Not a user endpoint: no session, no cookie, and a wrong or missing
 * token gets 404 rather than 401 so an anonymous caller does not learn the
 * endpoint is there (see `isAuthorizedCronRequest`).
 *
 * GET, not POST, because that is what a scheduler can call with one line of
 * curl and no body — and it is what Vercel's own cron would issue if the plan
 * ever made that worth switching to. It is not safe in the HTTP sense: it
 * writes. It is idempotent, which is the property that actually matters here.
 *
 * The handler does auth and nothing else; the work is `runSweep`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return apiError('NOT_FOUND');
  }

  const summary = await runSweep();

  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
