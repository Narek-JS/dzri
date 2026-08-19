import { NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { EmailError, sendEmail } from '@/lib/email';
import { apiError } from '@/lib/http';
import { getAdminStats } from '@/lib/items/adminStats';

const ADMIN_QUEUE_URL = 'https://dzri.am/hy/admin';

/** Rounds down to whole days once the queue has sat for a day or more. */
function formatAge(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const hours = Math.max(1, Math.floor(seconds / 3600));
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * GET /api/cron/admin-digest — once-a-day nudge so the solo admin does not
 * let the moderation queue go stale unnoticed.
 *
 * Same auth as `/api/cron/sweep`: a `CRON_SECRET` bearer token, wrong or
 * missing token gets 404 rather than 401 (CLAUDE.md, `isAuthorizedCronRequest`).
 * No second secret — `.github/workflows/admin-digest.yml` reuses the one
 * `.github/workflows/sweep.yml` already has.
 *
 * Stateless like sweep: it sends whenever the queue is non-empty and leaves
 * "once a day" entirely to the GitHub Actions schedule, rather than tracking
 * whether it already sent one today.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return apiError('NOT_FOUND');
  }

  const { pendingCount, oldestPendingAgeSeconds } = await getAdminStats();

  if (pendingCount === 0) {
    return NextResponse.json(
      { sent: false, pendingCount: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('[admin-digest] ADMIN_EMAIL is not set');
    return apiError('INTERNAL');
  }

  const age = oldestPendingAgeSeconds !== null ? formatAge(oldestPendingAgeSeconds) : 'unknown';

  try {
    await sendEmail({
      to: adminEmail,
      subject: `${pendingCount} item(s) waiting for review`,
      text: [
        `${pendingCount} item(s) are waiting for moderation review.`,
        `The oldest has been waiting ${age}.`,
        '',
        `Review the queue: ${ADMIN_QUEUE_URL}`,
      ].join('\n'),
    });
  } catch (error) {
    console.error('[admin-digest] email delivery failed', {
      reason: error instanceof EmailError ? error.message : 'unknown',
    });
    return apiError('INTERNAL');
  }

  return NextResponse.json(
    { sent: true, pendingCount, oldestPendingAgeSeconds },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
