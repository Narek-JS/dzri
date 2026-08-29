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

### 2026-08-13 — `claims.rejected_reason` distinguishes the three routes to `rejected`

The my-claims screen showed "picked another person" for every rejected
claim, which is false whenever nobody was picked — a giver who declines a
request directly, or deletes the listing outright, has done something
different to a claimant than a giver who chose somebody else. `rejected`
carried no information about which of those happened, only that it did.

`claims.rejected_reason` is a nullable enum — `declined`,
`lost_to_other_claimant`, `item_removed` — mirroring
`items.rejection_reason` and the `rejection_reason_matches_status` check
this project already has (2026-07-31 entry): `claim_rejected_reason_matches_status`
makes a rejected claim with no reason, or a non-rejected claim with one,
unrepresentable rather than merely a bug somebody has to remember not to
write.

Three writers, one value each, set in the same statement as the status
change, never as a follow-up write:

- `rejectClaim` — `declined`. A single-row `UPDATE`, so this one was never
  at risk of a window between status and reason.
- `approveClaim`'s losing-claims statement — `lost_to_other_claimant`, in
  the same `set` as `status: 'rejected'`. This one mattered: the 2026-08-07
  entry on chained `db.batch` guards explains why a second statement here
  was never an option — neon-http has no interactive transaction, so a
  follow-up write would either land outside the approval's transaction or
  not at all, and a losing claimant would read "declined" copy for however
  long the gap lasted. Stamping it inside the existing statement costs
  nothing extra: the row is already being written.
- `removeItem`'s claim-rejection statement — `item_removed`. This route
  existed before this change (2026-08-08 entry, "a soft delete to
  `removed`") and was not named in the original three-state design; adding
  the enum value surfaced that a real third writer of `rejected` was
  already shipping with no reason recorded, which the check constraint
  would otherwise have made a hard failure on `DELETE /api/items/[id]`
  rather than a silent gap.

An earlier version of the my-claims copy split worked around the missing
column by inferring the deletion case from `item.status === 'removed'` —
which could only ever detect that one route, and even then read a claim's
rejection as caused by a deletion if the giver removed the listing weeks
after rejecting it, because `removed` says nothing about order. A real
column set at the moment of rejection has no such gap: it records what
happened, not what can be reconstructed from where things ended up.

One migration-tooling finding worth recording separately from the schema
change itself. `drizzle-kit migrate`'s CLI silently exits 1 with **no error
text** on this project's setup, on any failure — its own catch block does
`console.error` then `process.exit(1)` back to back, and Node truncates
unflushed async stdout/stderr writes on `process.exit()` when the stream is
a pipe or file rather than a TTY, which a spawned or redirected CLI always
is. The underlying `drizzle-orm/neon-http/migrator` `migrate()` function has
no such swallowing and threw the real Postgres error immediately when called
directly. Below that: applying this migration to this dev branch failed
once on the `ADD CONSTRAINT` step because two pre-existing `rejected` claims
predated the column, and because neon-http executes each migration
statement as its own HTTP request with no wrapping transaction, that partial
failure left `CREATE TYPE` and `ADD COLUMN` committed while the constraint
was not — a second attempt then failed differently, on `CREATE TYPE`
already existing. Recovery was to backfill the two rows to `declined` (the
migration now does this itself, see the migration file), finish the
remaining two statements by hand, and insert the matching row into
`drizzle.__drizzle_migrations` so the tracked state matches what
`drizzle-kit` itself would have written. Anyone who hits a silent `exit 1`
from `db:migrate` again should go straight to calling `migrate()` from
`drizzle-orm/neon-http/migrator` directly rather than re-running the CLI
blind — the CLI will keep saying nothing.

### 2026-08-16 — SMS gateway vendor chosen: Messaggio

Answers the open question recorded on 2026-07-31. SMS.to rejected the
application because the applicant is an individual, not a registered
company. Twilio and Plivo both price +374 delivery at roughly
$0.25–0.30 per SMS regardless of vendor — high enough, per the original
entry, to change the auth design. Messaggio accepted the application
and offers per-operator pricing instead of a single blended rate:
Beeline ~€0.085, Karabakh Telecom ~€0.115, MTS ~€0.145, Ucom ~€0.312.

OTP sends use a generic, non-branded sender ID, which does not require
a registered legal entity or supporting documents — the same reason
this vendor was reachable at all as a solo applicant.

Confirmed live on 2026-08-16: `POST /api/v1/send` with a
`Messaggio-Login` header and no signature or secret-key header returns
200 and actually delivers. `MESSAGGIO_SECRET_KEY` is provisioned and
read into the environment but unused by this call — kept for a future
requirement, not wired to anything yet.

### 2026-08-17 — `GET /api/reference` returns `region` again

Districts now carry `region` in the API response. It was deliberately
withheld before — that reasoning lived in the route handler's own doc
comment, not a standalone entry here, so there is nothing above to
correct: it said `region` "orders the list; it is not a grouping field
for the UI," and a client that needed to group by it should get "an
explicit grouping field designed for that, not a column whose values
are internal slugs."

That was correct for what existed then — nothing grouped by it. It is
superseded, not wrong, now that the District combobox does: it renders
its options under region headings (Yerevan first, then each marz), and
`region` already carries exactly the right partition —`'yerevan'` for a
Yerevan city district, otherwise the parent marz's slug, per
`src/db/schema/reference.ts`'s own comment on the column. Adding a
second, parallel field to describe the same partition just to avoid
returning a column that already is one would be a distinction without a
difference, and one more shape to keep hand-in-sync with the district
table.

### 2026-08-17 — Item translation is a manual admin step, not a live AI call

`items.title`/`description` became per-locale columns —
`title_hy`/`title_ru`/`title_en`, `description_hy`/`description_ru`/
`description_en` — mirroring the `name_hy`/`name_ru`/`name_en`
convention `districts`/`categories` already used. No translation API is
called anywhere in this change. A solo pre-launch product does not
justify the cost or the failure modes (rate limits, a vendor outage
blocking every new listing, a mistranslation nobody reviewed) of a live
call on the request path, and CLAUDE.md already runs one moderation
queue with a human in it — routing translation through the same human
is free in a way a second vendor integration is not.

`CreateItemForm`'s checkbox (default checked) sets `needsTranslation`
and `sourceLocale` instead: checked writes the giver's text into one
locale's columns and leaves the other two null for an admin to fill in
during moderation; unchecked shows three tabs and requires all three
directly, with no admin step at all. The checkbox label deliberately
does not say "auto-translate" or anything implying immediacy — a
pending item can sit in the queue for a while, and copy that reads as
instant would be a lie the moment review is not.

The load-bearing piece is `item_translations_complete_when_active`
(`src/db/schema/items.ts`), a check constraint mirroring
`rejection_reason_matches_status`'s own shape: `active` requires all
three titles non-null, and description is all-three-or-none. This is
what makes "an approved item missing a translation" structurally
unrepresentable rather than a rule `approveItem` has to remember to
enforce — the same reasoning CLAUDE.md already gives for the older
constraints on this table. Description is checked as a symmetric
all-or-nothing across the three columns rather than "the other two
follow whichever one is `source_locale`": the two conditions are
equivalent under the only way the app ever writes these columns (a
translation only ever fills in the locales the giver did not, never
invents a description in a locale the source never had one in), and
the symmetric form needs no per-row branch on which locale is the
source.

One interaction this forced a change to elsewhere: `initialItemStatus`
(`src/lib/moderation.ts`) now takes `needsTranslation` and returns
`pending_review` regardless of `MODERATION_MODE` when it's true.
Without that, a translation-flagged item created under `MODERATION_MODE
= post` would attempt to insert as `active` with two title columns
still null and fail the check constraint outright — moderation mode
governs whether a *complete* listing needs a human's approval, not
whether an *incomplete* one can skip translation.

Approval reads the row before writing it, a change from the plain
conditional `UPDATE` `approveItem` used before: it has to know which of
the three locale columns are actually null to validate the caller
supplied all of them (`TRANSLATIONS_REQUIRED` if not) and to fold the
fill into the same statement that flips the status, since the
constraint above evaluates on that one statement's result, not on two.
The transition's safety against a double-click or a second admin is
unchanged — the write is still a conditional `UPDATE ... WHERE status =
'pending_review'`, so a row that moved between the read and the write
still resolves to `INVALID_STATUS_TRANSITION`, exactly as it did before
this function took a second argument.

Resolving a title/description to one string for display follows
whichever convention was already established for the same viewer: the
public feed, item detail and my-items views return the raw per-locale
columns and the client picks one — the same
`localizedName()`-over-`nameHy`/`nameRu`/`nameEn` pattern already used
for `districts`/`categories` — rather than the server resolving it,
so this is one convention, not two. The admin queue is the exception on
purpose: it needs to see exactly which locales are `null` to render
inputs for them, so it gets the raw columns with no resolution at all.
A small addition on top of the districts/categories pattern:
`resolveLocalizedText` (`src/lib/items/localizedText.ts`) falls back to
`source_locale`'s column when the requested locale is null. For the
feed this never triggers — `item_translations_complete_when_active`
guarantees every column non-null on the only status the feed shows. It
matters on my-items and the owner's own item-detail view, where a
`pending_review` or `rejected` item may have only one locale filled in
at all, and showing nothing would be worse than showing the language
the giver actually typed.

### 2026-08-18 — Categories restructured into 41 categories under 11 translated groups, via a new `category_groups` table

The flat 10-category list became 41 categories organized under 11 groups
(Furniture & Decor, Clothing & Shoes, ...), so a giver picking a category
now sees the same kind of grouped picker the District combobox already
gives them for districts — one pattern for "a long list that groups
naturally," not a bespoke shape per field.

A new `category_groups` table (`src/db/schema/reference.ts`) carries the
group data: `slug`, `name_hy`/`name_ru`/`name_en`, `position` — the same
shape as `districts`/`categories` themselves. `categories` gained a
`group_id` FK into it. This is *not* the same move as districts' `region`:
`region` is a plain `text` column that happens to already carry the right
partition (a marz slug, or `'yerevan'`), so grouping districts needed no
new table at all (2026-08-17 entry). Categories had no equivalent column
to borrow — a group needs three translated display names of its own, and
there is no existing category-table column that could stand in for that.
So unlike `region`, this grouping needed a real table, seeded the same
upsert-by-slug way `districts`/`categories` already are.

Before writing the migration, the brief for this change required checking
`items` for rows referencing `categories.id` in both prod and dev, since
the category slugs are changing outright and a live FK would need a
remapping strategy that does not exist. Prod's local `DATABASE_URL` (from
a `vercel env pull`) turned out to be a stale 11-character placeholder,
not a real connection string, so no prod count was obtainable that way.
Dev had 18 rows — non-zero, which is exactly the condition the brief said
to stop on, so the migration was not written yet and the count was
reported back instead. Those 18 rows turned out to be pre-launch seed/test
data from the friend-account and item-photo seeding work, not real
listings, and were explicitly cleared by running
`TRUNCATE TABLE items, item_images, claims RESTART IDENTITY CASCADE`
against dev's `DATABASE_URL` before the migration proceeded — a
destructive statement run only after the user identified the data as
disposable and asked for it directly, not a judgment call made
unilaterally.

`items` being empty did not mean `categories` was empty — the 10 legacy
category rows were still there, seeded independently — and the new
`group_id` column is `NOT NULL` with no default. `drizzle-kit generate`
produced the two DDL statements (`CREATE TABLE category_groups`,
`ALTER TABLE categories ADD COLUMN group_id ... NOT NULL`), and the
generated migration was hand-edited to add one `DELETE FROM "categories"`
ahead of the `ALTER`, the same way the 2026-08-13 entry's
`claim_rejected_reason` migration and the 2026-08-08 image-variant
migration were hand-edited with a data step no schema diff can express —
not a hand-written schema change, just a data step bolted onto a
generated one. Deleting first is safe specifically because the 10 old
rows are being replaced outright by the reseed below, not remapped, and
because the empty-`items` check above already confirmed nothing points at
them.

`src/db/seed.ts` now seeds `category_groups` before `categories`, both
idempotent upserts keyed on `slug`. A category needs its group's `id`,
resolved from the seed data's nested `groupSlug` via one `returning()` on
the groups upsert rather than a second round-trip select. `position` on
both tables is assigned by array index — 0 through 10 for a group's place
among the 11, and 0 through however-many-1 for a category's place within
*its* group, not a single global counter across all 41 the way the old
10-category seed used one.

`GET /api/reference` joins `categories` to `category_groups` and returns
`groupSlug`/`groupNameHy`/`groupNameRu`/`groupNameEn` per category — the
same "return the column the UI groups by" reasoning the 2026-08-17 entry
gives for returning `region` on a district, applied here now that
categories have a real group column instead of nothing to group by at
all. Ordering changed to match: a group's `position`, then the category's
own `position` within it, then `slug` as the same defensive tiebreak the
old single-level ordering already had. `src/lib/reference.ts` — the
server-component twin of the route handler, kept in sync by hand per its
own doc comment — got the identical join and ordering.

On the frontend, `Combobox` (`src/components/ui/Combobox.tsx`) needed no
changes at all: it already accepted an optional `groups` prop and an
`options[].group` field, built when the District combobox was added, and
neither is district-specific. `buildDistrictGroups`
(`src/lib/districtGroups.ts`) was left untouched rather than generalized
into a shared function, per the brief — it does real district-only work
(hoisting `'yerevan'` to the front of the group order, relabeling the
marz-wide "anywhere in this marz" row) that a category grouping has no
equivalent of: `GET /api/reference` already returns categories in the
right group order, and there is no "anywhere in this group" pseudo-row to
special-case. A new, much smaller `buildCategoryGroups`
(`src/lib/categoryGroups.ts`) does only what is actually shared — turn
grouped rows into `Combobox`'s `groups`/`options` shape — and both
`CreateItemForm`'s category picker and the feed's `FeedFilters` category
filter now group visually by category group, the same way both already
group by region for district.

The admin moderation queue shows a category's group name too
(`PendingItemCard`), but only as a label next to the category name, not a
picker — an admin never changes an item's category from that screen.
`getPendingQueue` (`src/lib/items/pendingQueue.ts`) joins
`category_groups` for exactly the three name columns needed to render
that label; the public feed and item-detail queries
(`src/lib/items/feed.ts`, `src/lib/items/visibility.ts`) were not touched,
since nothing in this brief asked either of those views to show a group.

### 2026-08-18 — Migration 0005's blanket category delete broke on production; scoped to non-overlapping slugs only

The category-restructure migration (`drizzle/0005_workable_cammi.sql`,
previous entry) applied cleanly to dev but rolled back the whole
transaction against production. Per the 2026-08-13 entry on
`drizzle-kit migrate`'s silent `exit 1` with no error text, the build log
said nothing useful; the actual cause was found by querying production
directly. `DELETE FROM "categories"` — hand-added ahead of the `NOT NULL
group_id` column for the reason the previous entry gives — deletes every
category row unconditionally, and production has one real item whose
`category_id` still points at the legacy `'other'` row. The delete tripped
`items.category_id`'s foreign key and Postgres rolled the transaction
back, so the `category_groups` table and the `group_id` column never
landed there either — an all-or-nothing failure, not a partial one, which
is the same guarantee `db.batch` and the neon-http driver give everywhere
else in this codebase.

Dev never hit this because dev's `items` table had been truncated to zero
rows earlier in the same category-restructure task, with the user's
explicit sign-off, specifically to let this migration proceed at all
(previous entry). That made dev's `items` table empty at exactly the
moment this migration ran on it — a state production was never in and was
never asked to be in. The FK-safety check that *was* performed up front
(counting `items` rows referencing `categories.id` before writing the
migration) was real and correctly gated the original migration on an
empty count; what it did not cover was whether the delete-and-reseed
strategy for `categories` itself was safe independent of `items` — those
are two different tables with two different questions, and only the first
one got asked.

The fix is narrower, not more permissive: of the 10 legacy category
slugs, 4 are spelled identically in the new 41-category list — `furniture`,
`books`, `plants`, `other`. `src/db/seed.ts`'s `onConflictDoUpdate`
targets `categories.slug`, so seeding these four is an `UPDATE` on the
existing row (same `id`, new name/position/`group_id`), never a delete
and reinsert. A row that is never deleted needs no FK check against it at
all — the production item referencing `'other'` keeps pointing at the
same row, now correctly grouped, without ever being touched by a delete
statement. The migration's `DELETE` is now scoped to exactly the 6 legacy
slugs with no equivalent in the new list (`appliances`, `electronics`,
`clothes`, `kids`, `kitchen`, `building_materials`) — everything else in
the file (the `category_groups` table, the `NOT NULL group_id` column and
its FK) is unchanged. If a live item ever turns up referencing one of
those six, this statement fails exactly the way the original blanket
delete did, on purpose — that is still the correct, safe outcome for a
slug this migration has no update path for, not a case worth silently
working around.

One tooling question this raised: does editing `0005_workable_cammi.sql`
after dev already applied it require fixing up dev's migration-tracking
metadata? Traced through `readMigrationFiles()` and `migrate()` in
`drizzle-orm/migrator.js` and `drizzle-orm/neon-http/migrator.js` (the
same functions the 2026-08-13 entry already points at as the ground truth
under `drizzle-kit migrate`'s silent CLI). Each migration's `hash` is a
`sha256` of the full file's current content, but the apply/skip decision
in `migrate()` never reads that stored hash back for comparison — it
computes `lastDbMigration` as the tracking table's most recent row by
`created_at` and applies a migration only if its `folderMillis` (the
`when` timestamp from `meta/_journal.json`, not derived from the file at
all) is greater than that. The `hash` column is written on insert and
never consulted again. Confirmed empirically against dev before editing
anything: `drizzle.__drizzle_migrations` row `id=6` has
`created_at=1786997179536`, exactly `_journal.json`'s `"when"` for
`0005_workable_cammi`, and its stored `hash` matched
`sha256sum drizzle/0005_workable_cammi.sql` computed on the file exactly
as it stood before this edit. After this edit the file's hash no longer
matches that stored value — and that mismatch is permanently inert:
nothing in `migrate()` will ever read it again, dev will never attempt to
reapply migration 5, and no correction to dev's tracking table is needed
or was made. `hash` here is an audit trail of what ran, not a checksum
gate on what may run again.

The general lesson: a migration that changes the primary-key set under a
live table — new category slugs replacing old ones — has to reason about
overlap with whatever the table already holds, not just about whether
some *other*, upstream table (`items`) is empty. "The table this FK
points at has no incoming references" and "the table this FK points at
can be safely deleted and reseeded" are different claims, and checking
the first does not establish the second whenever any old and new key
values happen to coincide.

**Follow-up, a few minutes later.** The scoped delete above was correct
and ran cleanly against production — confirmed directly: `category_groups`
existed, `categories` was down to exactly the 4 surviving rows
(`furniture`, `books`, `plants`, `other`), and the item referencing
`'other'` was untouched. The very next statement,
`ALTER TABLE categories ADD COLUMN group_id integer NOT NULL`, then failed
with Postgres error 23502, `column "group_id" of relation "categories"
contains null values`. This has nothing to do with neon-http's lack of
cross-statement transactions (the running theme in the 2026-08-13 and
first-half-of-today entries) — it is a plain Postgres rule that has
nothing to do with this project's driver choice: adding a `NOT NULL`
column with no `DEFAULT` to a table that already has rows always fails,
full stop, because Postgres has to fill every existing row with *some*
value for the new column and refuses to guess one. Dev never hit this
because dev's `categories` table was empty at this exact point in the file
under the *original* blanket-delete version of this migration — a
coincidence of dev's state, not evidence the statement itself was safe.

The deeper miss: making `group_id` `NOT NULL` needs backfill data — every
surviving row needs a real group to point at — and that data (which
`category_groups` row is `furniture`'s group, versus `books`'s) existed
only in `src/db/seed.ts`'s TypeScript, never in the SQL migration itself.
Scoping the `DELETE` correctly (first half of this entry) fixed *which
rows survive* but did nothing about *what those rows should point at*,
because nothing before this follow-up had put the answer to that question
anywhere the migration file could read it.

The fix, in order, all idempotent so the file is safe to run again from
wherever a prior attempt stopped:

1. `CREATE TABLE "category_groups"` → `CREATE TABLE IF NOT EXISTS
   "category_groups"` — production already has this table from the
   partially-applied run; the bare form errors with "relation already
   exists" on a second attempt.
2. A new `INSERT INTO "category_groups" ... ON CONFLICT ("slug") DO
   NOTHING`, right after the table creation, carrying only the 4 groups
   the 4 surviving categories need (`furniture-decor`, `garden`,
   `hobby-sport`, `other` — cross-checked byte-for-byte against
   `categoryGroupSeeds` in `src/db/seed.ts`, including `position`, not
   retyped from memory). Not all 11 — `npm run db:seed`, run against
   production immediately after this migration succeeds, inserts the
   remaining 7 and reconciles these 4's names/positions through its own
   already-idempotent upsert-by-slug. This statement only has to unblock
   the constraint two statements later, not duplicate the seed.
3. `ADD COLUMN "group_id" integer NOT NULL` → `ADD COLUMN IF NOT EXISTS
   "group_id" integer` — nullable, no default needed because nothing
   reads it as a real value before the backfill below runs.
4. Four backfill `UPDATE ... WHERE "slug" = '...'` statements, one per
   surviving category, each setting `group_id` via a subquery against
   `category_groups` by slug. Only these 4 slugs can exist in
   `categories` at this point in the file — the scoped `DELETE` already
   ran — so four statements fully backfill the table; nothing is left
   null for the next statement to reject. Deliberately narrow: only
   `group_id` is set, not `position`/`name_hy`/etc., which stay at their
   stale 4-old-category values on purpose, since `db:seed` corrects those
   right after and duplicating that logic here would be a second place to
   keep in sync with `seed.ts` for no benefit.
5. `ALTER TABLE "categories" ALTER COLUMN "group_id" SET NOT NULL` —
   its own statement now, separated from the `ADD COLUMN` above. This is
   the exact pattern the 2026-08-13 entry already established for
   `claims.rejected_reason`: a `NOT NULL` column addition to a live table
   needs either a `DEFAULT` or a backfill step in the same migration, and
   this is that same rule applying to a second column that the scoped
   `DELETE` fix, on its own, didn't fully anticipate. Setting `NOT NULL`
   on an already-`NOT NULL` column is a no-op in Postgres, so this
   statement is also safe to re-run.
6. The FK constraint statement (`group_id` → `category_groups.id`) is
   unchanged — it was never reached by the failed run.

On the acceptance question of full idempotency: statements 1 through 5
are each safe to run any number of times, in order, from this
partially-applied state or from empty. Statement 6, the `ADD CONSTRAINT`,
is not idempotent in isolation — running it a second time after it has
already succeeded errors with "constraint already exists" — but per the
brief it was left unchanged rather than guarded, and in practice this is
inert: it is the last statement in the file, so it is only ever reached
once every statement before it has already succeeded, meaning there is
nothing left in the file that could fail and force a second attempt to
reach it again.

The general lesson, sharpened by this second half of the same incident:
a `NOT NULL` column addition to a live table always needs either a
`DEFAULT` or a backfill step in the same migration — not a new rule, this
project already wrote it down once (2026-08-13, `claims.rejected_reason`)
— and scoping a `DELETE` correctly is a necessary fix for a live-FK
failure but not a sufficient one for a `NOT NULL` column that comes right
after it. The two failures in this migration were caused by the same root
gap — a migration written under the assumption `categories` would be
empty, patched once to survive with rows left in it, but not re-audited
for every later statement that assumption had been quietly load-bearing
for.

### 2026-08-19 — Combobox gets a separate mobile presentation

Below Tailwind's `md`, `Combobox` (District and Category) no longer
renders a type-in-the-trigger input plus a Radix Popover. The field is a
button showing the current selection, and tapping it opens a full-screen
Radix `Dialog` with the search box inside the panel and the options in
its own scroll area. Desktop is untouched — same input, same popover,
same cmdk wiring; `useIsMobile` (a `useSyncExternalStore` over
`matchMedia`, server snapshot `false`) picks between the two.

Two separate defects forced this, and neither was fixable in the popover.

The first: **the options could not be scrolled at all** when the popover
was opened from inside the mobile filters sheet. A popover is portalled
to `document.body`, and `BottomSheet` is vaul over a Radix modal dialog,
whose `Overlay` wraps the page in `react-remove-scroll` with the drawer
content as its only registered shard. That library installs a
non-passive document `touchmove` listener that `preventDefault()`s every
touch scroll whose target is neither inside the lock nor inside a shard
(`shouldPrevent` in
node_modules/react-remove-scroll/dist/es2015/SideEffect.js, the
`shouldStop = shardNodes.length > 0 ? … : !noIsolation` branch), and a
body-portalled popover is exactly that. There is no attribute or prop
that exempts one — but only the *last* lock on that module's
`lockStack` is active, so a nested modal that installs its own lock
takes over. Radix `Dialog` installs one unconditionally. Radix `Popover`
only installs one under `modal`, and `modal` also traps focus inside the
content, which is where the old trigger — an `Anchor` sibling, not a
child — could never be. So the fix had to be a dialog, not a flag.

The second: **the trigger being a text input was the wrong control for a
thumb.** Tapping the field raised the software keyboard over the list it
had just opened, and browsers offered their own autofill on top of the
options — Chrome reads a field's label and placeholder as heuristics,
and "District"/"Region"/"Category" read as an address form to it, so it
covered real options with the user's saved street address. That is what
made the control feel like it was "suggesting remembered values". A
button trigger has neither problem; the panel's search box carries
`NO_AUTOFILL_PROPS` (`autocomplete="off"` plus the documented 1Password
/ LastPass / generic opt-outs, since `autocomplete="off"` alone does not
stop Chrome's address heuristics) and deliberately does *not* take focus
on open, so the keyboard only appears if the user asks for it.

Both `Combobox` call sites now pass a `label`, which titles the panel —
a full-screen panel covers the label the user just tapped.

### 2026-08-19 — BottomSheet caps its content column to the visible sheet

`Drawer.Content` is a rigid `h-[90vh]` block anchored to the bottom and
translated *down* by the active snap point's offset, so at any snap
short of fully open a large part of it is below the viewport. Its
children were laid out over that whole 90vh, which meant content past
the fold was simply drawn off-screen with nothing to scroll: measured at
390x664, FeedFilters' third field (Condition) landed at y 614-652 with
the pinned footer starting at 595 — underneath the footer, untappable,
with no way to reach it short of dragging to the taller snap point.

The visible slice is exactly `90vh - offset`, and vaul already publishes
that offset as `--snap-point-height` on `Drawer.Content`'s inline style.
An inner column capped at `calc(90vh - var(--snap-point-height, 0px))`
therefore ends at the screen edge, which lets the existing
`overflow-y-auto` on the content area actually engage. `max-height`, not
`height`: vaul only rewrites the variable once a snap *settles*, so a
fixed height would hold a stale gap open for the length of every drag,
while a cap just stops applying early. The `0px` fallback covers a
caller that passes no snap points, where the variable is never set.

`FeedFilters`' own lower snap point moves 0.55 → 0.7 on top of that.
0.55 was measured at 375x667 and did not generalise. Solving
`0.9vh - (1 - s)vh - 53px (header) >= 346px (the three fields and their
padding)` at 390x664 gives s >= 0.70. Viewports shorter than ~664px
still need a scroll to reach the last field; the cap above is what makes
that scroll exist, so nothing is unreachable at any height — the snap
number is only about not needing it on a typical phone.
### 2026-08-18 — Pickup notes split into per-locale columns, mirroring title/description

`pickup_notes` was the one remaining free-text field still on a single
column; it is now `pickup_notes_hy`/`_ru`/`_en`, following the exact same
optional, all-three-or-none convention `item_translations_complete_when_
active` already enforces for description, filled the same way through
`needsTranslation`/`sourceLocale` and completed by an admin during
`approveItem` when a translation is missing. Migration
`0006_add_pickup_notes_locales.sql` backfills the old column's value into
`source_locale`'s new column, then — for rows already `active`, which the
constraint's all-or-none clause covers immediately and which have no real
translation to recover for their other two locales — duplicates that same
text into the other two rather than leaving them unable to satisfy a
constraint they legitimately satisfied a moment before, the same reasoning
`0004_wild_bishop` used backfilling title/description.

### 2026-08-25 — Giver phone made public on the item detail page; the 2026-07-31 "hidden until approved" decision reverses for this one endpoint

`GET /api/items/[id]` now always includes `giver.phone`, for any caller
who reaches the response at all — a public viewer of an `active` item,
the owner, or an approved/completed claimant. This is a deliberate
interim step ahead of a planned simpler contact flow, not a change of
mind about privacy in general: claim → wait for approval → get a number
turned out to be more round trip than this transaction needs, and the
2026-07-31 entry's own reasoning ("people want to know who is coming")
was always about a name, not about withholding a phone number
specifically. The item detail page now shows the number with a `tel:`
link and no longer renders "I want this."

Nothing else about phone handling changed. The feed
(`GET /api/items`) still carries no user info at all — this was never in
scope, on purpose, since a phone number sitting in a paginated public
list is a different exposure than one behind a single detail fetch. The
other three phone-bearing endpoints — `POST /api/claims/[id]/approve`,
`GET /api/items/[id]/claims`, `GET /api/claims/mine` — are untouched and
still gate on an approved claim through the status-guarded `CASE` the
2026-08-07 entry describes. `GET /api/items/[id]` doesn't use that
`CASE` at all: `src/lib/items/visibility.ts` now selects `users.phone`
unconditionally (still an explicit column, joined on `items.userId`,
never a whole-row `select()` — CLAUDE.md Rule 1), because there is no
status left to guard on here — the function already refuses anyone who
isn't the public, the owner, or an entitled claimant before phone is
ever read.

The claim/approve/reject system — every route under
`/api/items/[id]/claims` and `/api/claims/[id]/*`, `GET /api/claims/mine`,
and the owner's decision page at `/items/[id]/claims` — is fully live and
untouched. Only the item detail page stopped linking to it: the "I want
this" form and the owner's "View claims" banner are both gone from that
one page. The owner's route to their decision queue still exists, from
`/my/items` (`MyItemRow`), so the queue does not go dark, and nothing
about approving, rejecting, completing or no-showing a claim changed
behaviorally. Reversing this again means restoring two small UI pieces
on one page — no data migration in either direction, and the backend was
never in question.

`items.integration.test.ts`'s phone-privacy suite is updated to match:
it now asserts `giver.phone` is present on the detail endpoint for a
public viewer, the owner, and an approved/completed claimant, and that
the feed still carries none. `claims.integration.test.ts` needed no
change — none of the endpoints it covers moved.

### 2026-08-30 — Notification small icon is a white silhouette, tinted brand orange

The Android app now ships `ic_stat_notify` as the FCM default notification
icon instead of falling back to whatever the OS derives from the launcher
icon (a grey circle in practice). Android 5.0+ ignores color entirely on a
notification's small icon: every non-transparent pixel is drawn white, then
tinted with the notification's accent color. Shipping the full-color logo
as-is would have rendered as a solid tinted blob, not the palm-and-box mark.
`mobile/scripts/gen-notification-icon.mjs` generates the five density
variants from `mobile/assets/logo.svg` by preserving the source alpha
channel exactly and forcing every pixel's RGB to pure white, so antialiased
edges stay antialiased instead of being thresholded into jagged edges.

`notification_color` in `colors.xml` is `brand` (`#E8894A`), not
`brand-strong` (`#B4530F`). This is the same reasoning BRAND.md gives for
picking `brand-dark` in dark mode: `brand-strong` is tuned for AA text
contrast against a white background and disappears against a dark
notification shade, while a tint icon is a large-shape use where the WCAG
text-contrast rule doesn't apply.

The literal hex in `colors.xml` is a deliberate exception to CLAUDE.md's
"no raw hex anywhere in the codebase" rule, not an oversight — that rule
governs the web app, where the four brand colors exist as Tailwind theme
tokens. Android resource files have no way to reference a Tailwind token,
so there is no non-literal way to express this color on that side of the
repo.
