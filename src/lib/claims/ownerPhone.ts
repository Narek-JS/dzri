import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

/**
 * The one sanctioned way this app looks up a phone by user id outside the
 * status-guarded `case` that route handlers select through (DECISIONS.md,
 * 2026-08-07 — "The phone reveal is a SQL CASE"). This is deliberately not a
 * fourth phone-bearing endpoint: API.md's Rule 1 names three, and
 * DECISIONS.md (2026-08-08) is explicit that the cost of a fourth "is not
 * one more field, it is one more place to get wrong forever."
 *
 * It backs no route handler and is never serialized into a JSON response. It
 * exists only so the claims page (`[locale]/items/[id]/claims/page.tsx`) —
 * server-rendered, `no-store`, already gated on `requireUser()` plus an
 * ownership check — can show a GIVER THEIR OWN number in the handover view.
 *
 * That gap is real: `POST /api/claims/[id]/approve` returns `giverPhone`
 * once, in the moment of approval, and never again — a later
 * `GET /api/items/[id]/claims` carries `claimant.phone` on the approved
 * claim but has no field for the giver's own number, because the API has no
 * reason to tell someone their own phone number back. A fresh page load (a
 * reload, a new tab, the next day, still inside the 48-hour window) has
 * nothing to read that response from. Showing someone their own phone
 * number back to themselves is not the leak Rule 1 exists to prevent — the
 * leak is showing it to anyone *else* — so this is a narrow, self-contained
 * substitute for that one missing round trip rather than a new surface.
 *
 * Callers are what make this safe: pass `ownerId` only after it has already
 * passed an ownership check against the caller's own session (never a
 * client-supplied id), and only when there is an approved claim on their
 * item to show it for. Selects exactly the one column — CLAUDE.md: never
 * `select()` a whole user row into a response.
 */
export async function getOwnerPhone(ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  return row?.phone ?? null;
}
