# dzri

Free item giveaway platform for Armenia. People post items they no
longer need; whoever needs one submits a claim and comes to collect
it. Nothing is sold, no payments, no delivery.

Read `DECISIONS.md` before proposing architecture changes. It
records what was already decided and why.

## Stack

- Next.js (App Router) + TypeScript — route handlers are the API
- PostgreSQL on Neon
- Drizzle ORM + drizzle-kit for migrations
- Cloudflare R2 for images (S3-compatible SDK)
- Upstash Redis for rate limiting
- Tailwind CSS
- Deployed on Vercel

## Commands

```
npm run dev           # local dev
npm run build         # production build
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # apply migrations
npm run db:studio     # drizzle studio
npm run db:seed       # seed districts and categories
npm run db:make-admin -- +37477123456   # grant is_admin to a phone
```

## Admins

There is no API path to becoming an admin, by design. The first (and
every) admin is granted out of band with
`npm run db:make-admin -- <phone>`, run from a machine that holds
`DATABASE_URL`. The target must have signed in at least once — the
script flips `is_admin` on an existing user, it does not create one.

Admin routes live under `/api/admin/*` and require `is_admin`. A
non-admin — anonymous or a logged-in stranger — gets **404, not 403**,
so the surface is not discoverable by probing paths. Use
`requireAdmin()` from `src/lib/auth/session.ts`; a null return is a 404.

## Structure

```
src/
  app/
    (site)/           # public pages
    api/              # route handlers
  db/
    schema/           # drizzle table definitions
    index.ts          # db client
  lib/
    auth/             # OTP, JWT, session
    r2/               # image upload and signing
    ratelimit.ts      # upstash wrappers
  components/
```

## Non-negotiable rules

**Phone numbers.** A user's phone is never returned by any API
unless the requester is the giver of the item and the claim status
is `approved`, or the requester is the approved claimant. There is
no endpoint that returns a phone by user id. Select phone columns
explicitly — never `select()` a whole user row into a response.

**Rate limiting.** Every one of these needs an Upstash limiter
before the handler body runs: OTP request, OTP verify, item create,
image upload, claim create, report create. OTP request is limited
per phone *and* per IP.

**OTP storage.** Only the hash is stored. Codes expire in 5 minutes,
max 5 verify attempts, and a consumed code cannot be reused.

**Image cost.** Compress client-side before upload. Store one
original plus generated thumbnails. Never serve an original in a
list view. Egress is the main variable cost of this product.

**Status transitions.** Items move
`draft → active → reserved → given`, with `expired` and `removed` as
terminal states. Never set `reserved` without `reserved_for` and
`reserved_until`. Never mutate status directly in a route handler —
go through the transition helpers in `src/lib/items/`.

**Cron endpoint.** `/api/cron/sweep` expires stale active items and
releases reservations past `reserved_until`. Authenticated by a
bearer secret. Idempotent — it will be called more than once.

## Conventions

- Server components by default; `'use client'` only where needed
- Zod schemas for every request body, colocated with the handler
- Never `any`. Never non-null assertions on user input.
- Errors return `{ error: { code, message } }` — codes are stable
  strings the client can switch on, messages are for logs
- No raw hex colors. Brand tokens live in the Tailwind theme:
  `brand`, `brand-strong`, `brand-tint`, `brand-dark`
- All user-facing strings go through i18n. Armenian is the default
  locale, then Russian, then English. No hardcoded English in JSX.
- Timestamps are `timestamptz`, always UTC in the DB, formatted at
  the edge

## Testing

Integration tests hit a real Neon branch, not mocks. Every route
that touches phone numbers has a test asserting the phone is absent
from the response for an unapproved claim. That test is not
optional.
