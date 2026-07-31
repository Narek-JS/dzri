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
