import { deleteExpiredOtpCodes } from '@/lib/auth/otp';
import { expireOverdueItems, releaseExpiredReservations } from '@/lib/items/expiry';

/**
 * The housekeeping run. `/api/cron/sweep` does auth and calls this; everything
 * the job actually does lives here.
 *
 * Nothing may sit stale and nothing may sit reserved for somebody who never
 * turned up — that is the whole reason the platform has a cron at all
 * (DECISIONS.md). Vercel Hobby cron fires once a day, which is useless against
 * a 48-hour reservation window, so GitHub Actions calls this hourly instead.
 *
 * Idempotent, because it will be called more than once and sometimes twice at
 * the same time. Every step is a conditional update guarded on the status it
 * expects, so a second run finds nothing to do and reports zeroes. No step
 * reads a row and then writes it back.
 */

export type SweepSummary = {
  /** Reservations whose window passed, put back on the feed. */
  reservationsReleased: number;
  /** Claims marked `no_show` by those releases — see below on why it differs. */
  noShowsRecorded: number;
  itemsExpired: number;
  otpCodesDeleted: number;
  durationMs: number;
};

/**
 * The three jobs, in order. The order between the first two matters: an item
 * whose reservation has just lapsed is back to `active` before expiry is
 * considered, so if its 30 days ran out while it was held, it is expired in
 * the same run instead of lingering on the feed for an hour.
 *
 * The counts are the only visibility into whether this is running at all —
 * GitHub Actions reports that the request succeeded, not that anything
 * happened. `noShowsRecorded` is reported separately from
 * `reservationsReleased` rather than assumed equal: a `reserved` row whose
 * claim was deleted with its account still releases, and the two numbers
 * drifting apart is a signal worth being able to see.
 */
export async function runSweep(): Promise<SweepSummary> {
  const startedAt = Date.now();

  const released = await releaseExpiredReservations();
  const itemsExpired = await expireOverdueItems();
  const otpCodesDeleted = await deleteExpiredOtpCodes();

  return {
    reservationsReleased: released.reservationsReleased,
    noShowsRecorded: released.noShowsRecorded,
    itemsExpired,
    otpCodesDeleted,
    durationMs: Date.now() - startedAt,
  };
}
