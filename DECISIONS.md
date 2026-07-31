# dzri — decision log

Append-only. One entry per decision, with the reason. Never delete
an entry — if a decision is reversed, add a new entry that says so.

This file lives in the repo and is also uploaded to the Claude
project. It is the shared memory between planning sessions and
Claude Code.

---

### 2026-07-31 — Name is `dzri`, domain `dzri.am`

ձրի means "free." Four Latin letters, works as a handle everywhere,
survives a circular crop.

### 2026-07-31 — Claims, not first-come-first-served

Interested users submit a claim with a short message. The giver
picks one. Auto-reserving for whoever taps first gets farmed by
resellers running scripts, and the giver has no say in who arrives
at their door. Giver choice is also culturally correct here —
people want to know who is coming.

### 2026-07-31 — Phone numbers hidden until a claim is approved

Both sides see only a display name until the giver approves. This
is the entire trust model. Enforced server-side: the phone field
must never appear in any API response for a pending claim. One
leaked endpoint permanently destroys the platform's reputation.

### 2026-07-31 — Everything expires

Items expire 30 days after creation. Reservations release
automatically at `reserved_until`. Dead listings are what killed
every free-item board that came before — browse 40 items, message
five people, get zero replies, never return. The expiry job is v1,
not v2.

### 2026-07-31 — No in-app chat in v1

People here will call. Chat is a large build with its own
moderation burden, and it is not how this transaction actually
happens. Phone reveal after approval replaces it.

### 2026-07-31 — Auth is phone + SMS OTP only

No email, no password, no OAuth. list.am's mental model is a phone
number; email/password signup would cut conversion badly in this
market. NextAuth is not used — it is built around OAuth and email,
and bending it costs more than 200 lines of custom code.

### 2026-07-31 — PWA before native mobile

An app store listing for a marketplace with 12 items is dead
weight. Expo comes later, reusing the same API and TypeScript
types.

### 2026-07-31 — Stack: Next.js full-stack on Vercel

Route handlers are the API; the future mobile app consumes the same
endpoints. One language, one repo. NestJS rejected — correct answer
for a team, wrong answer for a solo v1 built alongside a full-time
job.

### 2026-07-31 — PostgreSQL on Neon, Drizzle ORM

Neon has a real free tier and branching for migrations. Drizzle is
SQL-first and TypeScript-native, so `schema.sql` maps over almost
directly. Prisma is heavier and fights raw SQL.

### 2026-07-31 — Images on Cloudflare R2, not S3

Zero egress fees. This is a photo-heavy consumer app; S3 egress is
how side projects get surprise bills.

### 2026-07-31 — SMS via a local Armenian gateway, not Twilio

Twilio pricing to +374 is high enough to change the auth design.
Must be priced before auth is built, not after.

### 2026-07-31 — Cron via GitHub Actions, not Vercel

Vercel Hobby cron fires once per day. The expiry and reservation-
release job needs at least hourly. GitHub Actions hits an
authenticated endpoint on a schedule instead.

### 2026-07-31 — Rate limiting on Upstash Redis from the first commit

An unthrottled OTP endpoint is a direct bill. Applies to OTP request,
OTP verify, and image upload.

---

## Open questions

- SMS gateway vendor and per-message price — not yet answered.
- Revenue model. The platform has none by design. The likely wedge
  is paid haul-away for people who want the item gone regardless of
  whether anyone claims it. Not built, not decided.
- Whether item location is district-level only, or map pin. Currently
  district only, for privacy.
- Orphaned R2 objects. A presigned upload can succeed without the client
  ever creating the item that references the key, leaving the object
  unreferenced. No sweeper is built yet — `POST /api/images/presign`
  mints keys under `uploads/{userId}/` and nothing reclaims the ones that
  never get attached. Options for later: a bucket lifecycle rule on an
  `uploads/` prefix, or reconciling stored keys against item references
  inside the sweep cron. Not decided. TODO before image upload ships to
  real users.

### 2026-07-31 — npm, not pnpm

No architectural reason for pnpm on a solo repo. Fewer moving parts.

### 2026-07-31 — Neon over Supabase, reasoning recorded

Supabase free projects pause after 7 days idle and need a manual
dashboard click to resume. Neon suspends and self-wakes with a
500ms–2s cold start. Supabase's bundled auth and storage are
unused here — auth is custom phone OTP, images are on R2.

### 2026-07-31 — Session is a stateless JWT cookie, no session table

HS256 JWT in an httpOnly cookie, 90 days, re-issued once a token is
older than 7 days. A session table would mean a database round trip
on every request to a serverless function talking to Neon over HTTP,
which is the wrong cost for reading "who is this".

The trade is that a token cannot be revoked. That matters for exactly
one case — banning someone — so `requireUser()` reads `is_banned`
when a request acts on the user's behalf, while `getSession()` stays
cookie-only for cheap reads like rendering a header.

### 2026-07-31 — OTP codes hashed with peppered HMAC-SHA256, not bcrypt

A 6-digit code has a million possible values. Against a leaked
database that is a rainbow table for any unkeyed digest and a
tractable brute force for bcrypt at a sane cost factor. Keying the
hash with `JWT_SECRET` means the database alone is not enough to
check a guess at all. The phone number is bound into the hash input
so a captured hash cannot be replayed against another number.

Bcrypt's slowness buys nothing here that the 5-attempt cap and the
5-minute expiry do not already buy, and it would add per-verify CPU
on a serverless function.

### 2026-07-31 — Phone validation is structural, not an operator allowlist

`+374` plus an 8-digit national number, first digit non-zero. It
deliberately does not check the operator prefix against a list of
assigned mobile ranges: ranges get allocated, the list goes stale,
and a stale list silently locks real users out of an account they
already have. An undeliverable number fails at the SMS gateway,
which is the layer that actually knows.

### 2026-07-31 — A new user without a name is a flow state, not an error

`users.display_name` is NOT NULL, and that name is what a stranger
sees before deciding to come to your door — so it cannot be a
generated placeholder like "User 4821". When a valid code arrives for
a phone with no account and no name, verify returns
`{ isNewUser: true }` and leaves the code unconsumed, so the client
can collect a name and re-submit the same code.

The response is a 200, not an error: nothing went wrong, and the
client discriminates on `isNewUser` rather than on a status code.

### 2026-07-31 — Rate limiters degrade to in-process counters off production

Missing Upstash credentials are a hard failure in production — an
unmetered OTP endpoint is a direct SMS bill, and failing closed is
the only safe default. Locally they fall back to an in-process
counter with the same interface, so `npm run dev` and `npm run build`
work on a machine with no secrets. The fallback is per-process and
therefore useless behind more than one instance, which is exactly why
it is refused in production.

### 2026-07-31 — Vitest, split into `npm test` and `npm run test:integration`

Vitest over Jest: it reads `vitest.config.mts` with the same ESM and
TypeScript setup the rest of the repo already uses, so there is no
Babel or ts-jest layer to keep in sync with tsconfig. Nothing in the
project needs Jest's ecosystem.

Two commands, because they have different prerequisites and a single
`npm test` that needs a database is a test suite people stop running:

- `npm test` — unit only. No database, no server, no network, no
  secrets. This is the one that runs on every commit.
- `npm run test:integration` — real route handlers over HTTP against a
  real Neon branch, per CLAUDE.md. Skips with an explanation when
  DATABASE_URL is absent rather than failing.

The integration suite runs its own dev server on :3100 with its own
`distDir` (`.next-test`, via NEXT_DIST_DIR in next.config.ts). Both
halves of that are load-bearing. Next refuses a second dev server that
shares a build directory, so without the split the suite would fail
for anyone who had `npm run dev` open. And the harness force-kills the
server at the end of a run — a kill that lands mid-write truncates
generated type files, which breaks `npm run typecheck` and the run
after it. Pointed at its own directory it can only damage output that
nothing else reads.

Scope is deliberately narrow — phone-privacy and code-replay, the
things whose regression is unrecoverable. It is not a general test
suite and should not grow into one by accident. Rate limiting is not
covered: asserting on the 30-second cooldown means sleeping, which
buys flakiness rather than confidence.

### 2026-07-31 — Image upload is a presigned PUT to R2, not a proxy

The browser uploads the file straight to R2 with a URL signed by
`POST /api/images/presign`; the bytes never pass through a route
handler. Proxying every photo would burn the Vercel bandwidth that
R2 exists to avoid, and would hit the serverless request-body limit
on a photo-heavy app.

The signature binds `content-type` and `content-length` (both set on
the `PutObjectCommand`), so a client cannot upload a different or
larger file than it declared. Object keys are generated server-side
as `uploads/{userId}/{uuid}.{ext}` and never accepted from the
client, so a leaked key cannot be used to guess or overwrite another
user's objects and the extension cannot be spoofed via a filename.
Allowlist is jpeg/png/webp, 8 MB max. Presigned URLs expire in five
minutes; presign is rate limited at 30/user/hour and 60/IP/hour.
