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
- Who reviews the moderation queue when volume grows. Pre-moderation is
  one admin eyeballing every item — fine at launch, impossible at scale.
  Undecided options: trusted community reviewers, a reputation threshold
  that auto-approves known-good givers, or flipping `MODERATION_MODE` to
  `post` and relying on reports. Whoever it is, `is_admin` and
  `reviewed_by` already record that a human acted.

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

### 2026-07-31 — Pre-moderation at launch, switchable to post

Every new item lands in `pending_review`, and an admin approves or
rejects it — with a reason — before it becomes visible. At launch,
volume is low enough that a human can eyeball each listing, and the
first impression of the feed decides whether the platform reads as a
real place or a dumping ground. Rejections are recorded
(`rejection_reason`, `reviewed_at`, `reviewed_by`), not silent.

This does not scale, and it must not become load-bearing. Manual
review is a queue that grows with success, and the approval delay
competes directly with *just leaving the thing by the bins*: the
moment posting here is slower than that, we lose. So the mode is a
single env var, `MODERATION_MODE` (`pre` | `post`), read lazily so it
flips without a rebuild. `post` publishes new items straight to
`active` and leans on report-driven review instead.

The switch is deliberately config, not schema: `pending_review` and
`rejected` already exist in `item_status`, and `initialItemStatus()`
in `src/lib/moderation.ts` is the single place that reads the mode.
Anything other than an exact `post` is treated as `pre` — the unsafe
failure is publishing an unreviewed item, so the default fails toward
holding it.

One operational note on the migration. This landed first as a three-way
split — a base migration, one that added the `pending_review` and
`rejected` enum values, and one that used them — because Postgres will
not let a new enum value be *used* in the same transaction that adds it,
and `drizzle-kit migrate` runs all pending migrations in a single
transaction. That split worked incrementally but could never apply to a
fresh database in one `db:migrate` run: a new Neon branch would try the
`ADD VALUE` and the check constraint / partial index that reference it in
the same transaction, and fail.

So before launch the migrations were squashed into one file. With no
production data and no other developers, migration history had no value,
and a single migration removes the trap entirely: `item_status` is one
plain `CREATE TYPE` with all eight values, there is no `ALTER TYPE ADD
VALUE`, and nothing is used before it is committed. Keep it one migration
until launch. The trap only returns once there is data worth preserving
*and* you must add an enum value and reference it in the same deploy — at
that point, and only then, put the `ADD VALUE` in its own migration and
apply it in a separate `db:migrate` run before the one that uses it.

### 2026-08-07 — Claim transitions chain their guards inside one `db.batch`

neon-http has no interactive transaction, so approving a claim — which
must set the claim to `approved`, reserve the item, and reject the other
pending claims, all or nothing — is a `db.batch`. A batch is one real
transaction but cannot branch on a statement's result, so every
precondition is written as a WHERE clause and a statement whose guard
fails simply touches zero rows.

The three statements are deliberately *chained* on each other's writes,
which works because a later statement in the same transaction sees the
earlier ones: the item moves `active → reserved` only while the claim is
pending; the claim moves `pending → approved` only if the item is now
reserved for that claimant; the losing claims are rejected only if the
claim is now approved. Either the whole thing lands or none of it does.

This is why the guards look redundant and must not be "simplified". Drop
the `exists` on the item update and a double-click reserves an item
twice. Drop it on the claim update and you get an approved claim on an
item somebody else already holds. Drop it on the third statement and a
failed approval silently rejects every other claimant. The same shape
guards withdraw, complete and no-show.

### 2026-08-07 — The phone reveal is a SQL `CASE`, and the key is omitted

Phone privacy is the whole trust model (see the 2026-07-31 entry), so the
reveal is enforced in the *database*, not in the mapping layer: every
endpoint that could carry a phone selects it as
`case when status = 'approved' then users.phone end`. A pending or
rejected row therefore has no phone to leak by the time it reaches
application code, and a mistake in the response mapping cannot expose
one.

When there is no phone the key is left out of the JSON entirely rather
than sent as `null`. A client cannot come to depend on a field that is
sometimes populated, the integration tests can assert the string "phone"
never appears at all, and there is no null-vs-value confusion in a place
where the failure is unrecoverable.

`user_reliability` is queried with an explicit `in` list of claimant ids
and never joined, and only its two counts are selected — the view also
carries `phone`, and it must never back a response.

### 2026-08-07 — The sweep is set-based conditional UPDATEs, not read-then-write

Every step of `/api/cron/sweep` is one UPDATE (or DELETE) whose WHERE clause
carries the guard, over the whole matching set at once. Nothing reads a row and
writes it back, so there is no window in which an item's status can change
between the two — Postgres evaluates the guard against the current row version,
and an item somebody collected or withdrew from a millisecond earlier simply
does not match. That is what makes the job safe to run twice, or twice at once,
which it will be: GitHub's scheduler retries, and a hand-run overlaps.

Releasing a reservation spans two tables, so it is a `db.batch` for the same
reason claim approval is. The claim update runs *first*, and the order carries
two things. It needs to see the item still `reserved` to find the claim that
held it, because the item update erases exactly the columns it matches on. And
it takes the claim row's lock first — which is the lock complete, withdraw and
manual no-show all take first too, so a giver confirming a handover in the same
instant blocks on our claim row, re-reads it as `no_show` after we commit and
is refused, rather than half-completing against an item we just released.

The item release is deliberately *not* chained on the claim update, unlike the
approval batch. A `reserved` row with no approved claim behind it is releasable
all the same, and leaving one stuck forever is the worse failure.

Expiry runs after the release, not before, so an item whose reservation has
just lapsed is judged on its own expiry in the same run rather than sitting
back on the feed, already dead, until the next hour.

### 2026-08-07 — A wrong cron token is a 404, and the compare is over digests

Same reasoning as the admin surface: a 401 tells an anonymous prober that the
endpoint exists and that a token is the thing to guess. A 404 says nothing. An
unset `CRON_SECRET` refuses everyone too — an open sweep endpoint is a
stranger's button for expiring other people's listings, so it fails shut and a
deploy that forgets the secret stops sweeping instead.

The comparison hashes both sides with SHA-256 and `timingSafeEqual`s the
digests, rather than comparing the tokens directly. `timingSafeEqual` throws on
a length mismatch, so a direct compare needs a length check first — and that
check leaks the secret's length. Fixed-width digests leave nothing to branch on.

The endpoint is a GET. It writes, so it is not safe in the HTTP sense, but it is
idempotent, which is the property that matters here — and GET is what a
scheduler calls with one line of curl and no body.

### 2026-08-07 — OTP rows are kept 24 hours past expiry, then deleted

The sweep deletes `otp_codes` rows more than 24 hours past `expires_at`. They
are peppered hashes of a credential and a code five minutes dead can never be
verified again, so keeping them buys nothing and adds to what a database dump
would contain. The 24-hour tail exists only so the rows are still there when
somebody asks why a sign-in failed last night.

Deleted on `expires_at`, not `consumed_at`: an abandoned code is never consumed
and would otherwise stay forever.

### 2026-08-08 — Deleting an item is a soft delete to `removed`

`DELETE /api/items/[id]` sets `status = 'removed'`. The row stays, the
`item_images` rows stay, and the R2 objects stay.

The status already existed and nothing set it, so the choice here was really
between flipping it and deleting rows. Deleting rows loses more than storage:
`claims.item_id` cascades, so a hard delete would silently erase every claim
ever made on the item, including completed ones. A claimant opening their own
history would find handovers they actually made had disappeared, and
`user_reliability` — which counts `completed` and `no_show` over the claims
table — would quietly revise somebody's record every time a giver tidied up.
A giver must not be able to edit a stranger's reliability by deleting a
listing.

Refused from `reserved`, `given` and `expired`. `reserved` is the one that
matters: there is a live approved claim behind it, the other hopefuls have
already been turned away, and the person who was picked may be on a bus. The
giver's route out is no-show or complete, or waiting for the sweep — not
making the thing disappear mid-journey. `given` and `expired` are terminal and
there is nothing left to take down. A second delete is refused the same way, so
the endpoint reports what happened rather than silently succeeding twice.

Every *pending* claim on the item is rejected in the same transaction. What
they asked for is gone; leaving them pending would leave people waiting on a
decision that can never come.

Ownership is checked before status, so a stranger gets 404 rather than a 409
that would confirm the id is real and disclose what state it is in.

Reclaiming the R2 objects is deliberately not attempted here. It is the same
unsolved orphan problem listed under Open questions, and a delete path that
half-solves it — deleting objects for removed items but not for abandoned
uploads — would be a second mechanism to keep correct rather than a fix.

### 2026-08-08 — An approved claimant can read the item they were promised

Approving a claim moves the item to `reserved`, and `reserved` is invisible to
everyone but the owner. The effect was that the claimant's own approved claim
dead-ended at a 404 at exactly the moment they were picked — the one moment
they most need to re-read the pickup notes, look at the photos and check the
district. `GET /api/items/[id]` therefore also answers a user holding a claim
on that item with status `approved` or `completed`, in any item status.

`completed` is included because the record of what changed hands should not
evaporate on handover; the claimant can still open what they collected.
`rejected` and `withdrawn` are not: holding a claim once is not a standing key
to a listing that is no longer public. Everyone else still gets 404.

The response carries no phone, for the claimant as for everyone else. They
already have the giver's number from `GET /api/claims/mine`, which is where the
reveal belongs — Rule 1 names three phone-bearing endpoints, and the cost of a
fourth is not one more field, it is one more place to get wrong forever.

The claimant view is `no-store, private`. A `reserved` item is visible to
exactly one person on the planet, so a shared cache entry for it is a leak
waiting for the next request. `view_count` does not move for them either, for
the same reason it does not move for the owner: it measures public interest,
and the person who was picked opening it five times on their way over is not
that.

The claim lookup only runs for a signed-in caller looking at a non-public item,
so the anonymous path and the ordinary public path cost exactly what they did
before.

### 2026-08-08 — Two image variants, both made by the browser

Every photo is now uploaded twice: a compressed original and a
400px-longest-edge variant, presigned separately and stored on one
`item_images` row as `url` and `thumb_url`. The client also computes the
original's width, height and blurhash and sends them along;
`POST /api/items` takes `images: [{ key, thumbKey, width, height, blurhash }]`
where it used to take `imageKeys: string[]`. No UI consumed the old shape yet,
so it was replaced outright rather than versioned.

This exists because the feed was serving originals. `GET /api/items` selected
`item_images.url` at position 0 — the 8 MB-ceiling upload — twenty-four to a
page, to anonymous visitors, from the endpoint most likely to be linked from
social media. Egress is this product's main variable cost and that was the
largest single way to spend it.

The resizing happens in the browser because there is nowhere else for it to
happen. The bytes go straight to R2 and never pass through a route handler, by
an earlier decision that is not worth reversing; a server-side resize would
mean proxying every photo through Vercel to avoid serving it from R2, which is
backwards. The cost is that the server never sees the pixels, so *the client
asserts what a thumbnail is*. The 256 KB cap on a `thumb` presign is the only
control over that assertion, which is why `variant` is a required field with no
default: defaulting it in the permissive direction would hand out an 8 MB
signature for something labelled a thumbnail and quietly undo the whole change.

Presign budgets doubled to 60/user/hour and 120/IP/hour. Six photos cost twelve
presigns now, so one ordinary listing spent a fifth of the old per-user budget,
and the old 60/IP would have throttled two real people posting from one
connection — a limit that bites normal use is a limit that gets raised in an
incident instead of in a commit.

`thumb_url` is nullable and existing rows are not backfilled. There is nothing
to backfill *from* — regenerating a variant would mean the server downloading
each original out of R2 and resizing it, which is the proxying this design
exists to avoid. Reads coalesce `thumb_url` to `url`, so old rows keep
rendering at the old cost and only those rows pay it.

Both halves of a pair are held to the same rules: the same
`uploads/{userId}/` ownership check, the same HeadObject existence check, and
one pooled duplicate check across both roles, so naming one object as both an
original and a thumbnail is refused. `width`, `height` and `blurhash` are
untrusted client input used only for layout — bounded and charset-checked at
the schema, never computed on, and the blurhash goes to a decoder and nowhere
else.

Two consequences worth writing down. Orphaned R2 objects now accumulate at
**twice** the rate: an abandoned form leaves two objects per photo. That is the
same unsolved problem already under Open questions, made twice as expensive,
and it is still unfixed. And this shipped as a second migration file rather
than a squash into the first — the "keep it one migration until launch" note
above is about the `ALTER TYPE ADD VALUE` trap, and a plain `ADD COLUMN` has
no such trap and applies cleanly to a fresh branch in one `db:migrate` run.

### 2026-08-08 — `user_reliability` no longer selects `phone`

The 2026-08-07 entry above ends by noting that the view "also carries
`phone`, and it must never back a response", and that its one caller
therefore selects only the two counts. That is now enforced by the view
instead of by a comment: `phone` is dropped from `user_reliability` in
migration `0002`.

Nothing needed it. `GET /api/items/[id]/claims` — the only reader —
joins reliability to claimants by id and gets the phone, when there is
one to get, from the status-guarded `case` over `users.phone` that
DECISIONS.md already describes as the single mechanism for a reveal. A
second copy of the column, sitting in an aggregate view with no status
attached to it, was a phone number reachable by a `select()` that
forgot to name its columns — the exact mistake CLAUDE.md's phone rule
exists to make impossible.

Dropping a column from a view means `DROP VIEW` then `CREATE VIEW`,
which drizzle-kit generates as one migration. Views hold no data, so
there is nothing to preserve across the drop and nothing to backfill.

### 2026-08-10 — Social handles differ per platform, anchored on the domain

The wordmark is `dzri`, but that exact string was not available
everywhere. Instagram's `dzri` belongs to an existing account, and
Telegram refuses public `t.me` links under five characters, so a
four-letter handle is structurally impossible there regardless of
who holds it.

Rather than invent a separate brand string to fit around those
gaps, `dzri.am` — the domain, not the wordmark — is the anchor, and
each platform gets the closest variant it allows: `dzri.am` where a
dot is permitted (Instagram), `dzri_am` where it is not (Telegram).
The Facebook Page kept the plain `dzri` display name; only its
username is still outstanding, and its URL is provisional until
that is claimed.

Consequence: never hardcode a social URL from memory in code, copy,
or a future footer. Read it from `BRAND.md`, because the handles
deliberately differ from the wordmark and from each other.
