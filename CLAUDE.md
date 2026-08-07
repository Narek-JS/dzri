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

## The sweep

`GET /api/cron/sweep` is the housekeeping job. It releases reservations
past `reserved_until` (marking the approved claim `no_show`), expires
active items past `expires_at`, and deletes OTP rows more than 24 hours
past expiry. It returns a JSON summary with the counts and how long the
run took — that summary is the only visibility into whether the job is
running at all, so read it before assuming it is.

It is scheduled by `.github/workflows/sweep.yml`, hourly, not by Vercel
cron — Hobby fires once a day, which is far too slow for a 48-hour
reservation window. The workflow also has a `workflow_dispatch` trigger,
so it can be run by hand from the Actions tab.

Auth is a bearer token compared against `CRON_SECRET` in constant time.
No session, no cookie. A wrong token, or an unset `CRON_SECRET`, is a
**404, not a 401** — same reasoning as the admin surface. It fails shut:
without the secret nothing sweeps, which is the safe direction.

Setting it up means putting the *same* value in two places:

```
# 1. Vercel — the app side
vercel env add CRON_SECRET production     # or paste it in the dashboard

# 2. GitHub — the caller side, as a repository secret
gh secret set CRON_SECRET                 # prompts for the value

# generate one:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In the UI that is Settings → Secrets and variables → Actions → New
repository secret, named exactly `CRON_SECRET`. The endpoint URL is not
a secret and defaults to production in the workflow; override it with a
repository *variable* named `SWEEP_URL` to point a fork or a preview
deployment elsewhere. Rotating the secret means changing both sides —
until they match again every run 404s, and the workflow prints the body
so that failure is legible in the Actions log.

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

**Image cost.** Compress client-side before upload. Every photo is
uploaded twice — the original and a 400px-longest-edge thumbnail,
both presigned separately, both stored on the `item_images` row
(`url` and `thumb_url`). The browser makes both variants; nothing
resizes server-side, because the bytes never pass through a route
handler. Never serve an original in a list view: list views read
`coalesce(thumb_url, url)`, and the fallback exists only for rows
written before the pipeline. Egress is the main variable cost of
this product.

**Status transitions.** The real flow, which is wider than the
original four states because moderation sits in front of it:

```
draft ──> pending_review ──approve──> active ──> reserved ──> given
                │                        │
                └──reject──> rejected    └──> expired
```

`given` and `expired` are terminal. `removed` is terminal too and is
reachable by the giver from `draft`, `pending_review`, `active` or
`rejected` — never from `reserved`, `given` or `expired`, because an
item somebody is on their way to collect must not vanish from under
them. `reserved` returns to `active` on withdraw, no-show, or the
sweep releasing it at `reserved_until`.

New items land in `pending_review` or `active` depending on
`MODERATION_MODE`; nothing writes `draft` yet. Never set `reserved`
without `reserved_for` and `reserved_until`. A `rejected` item must
carry a `rejection_reason` and a non-rejected one must not — the
`rejection_reason_matches_status` check enforces it, so any
transition *out* of `rejected` has to clear it. Never mutate status
directly in a route handler — go through the transition helpers in
`src/lib/items/`.

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
