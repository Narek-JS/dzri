# dzri — API reference

Every endpoint the frontend can call. Read this before writing any UI
that talks to the backend.

Companion files: `CLAUDE.md` (conventions), `DECISIONS.md` (why things
are the way they are), `BRAND.md` (colors, tone).

---

## Conventions

**Base URL.** Same origin. The frontend and API are one Next.js app —
call `/api/...` directly, no host, no CORS.

**Auth.** A session cookie named `dzri_session`, httpOnly, secure in
production, sameSite=lax, 90 days sliding. The browser sends it
automatically. There is no token to attach and no Authorization header
to set. `fetch` needs `credentials: 'same-origin'` only if you override
the default.

**Errors.** Every failure returns the same envelope:

```json
{ "error": { "code": "STABLE_CODE", "message": "for logs, not users" } }
```

Switch on `code`. Never show `message` to a user — all user-facing copy
is translated on the client. Codes are listed per endpoint below.

**Phone numbers.** A phone number is returned by exactly three endpoints
— `POST /api/claims/[id]/approve`, `GET /api/items/[id]/claims` and
`GET /api/claims/mine` — and only for an approved claim. Everywhere else
the field is absent — not null, absent. Do not write client code that
expects a `phone` key to exist. See Rule 1 at the end.

**Dates.** ISO 8601 strings in JSON. Cursors are ISO timestamps taken
from the previous page's `nextCursor`.

**Pagination.** Cursor-based. A response with `nextCursor: null` is the
last page. Pass `?cursor=<value>` to get the next one.

---

## Reference data

### GET /api/reference

Every district and every category, in one response. No auth.

The create-item form needs both as dropdowns and the feed needs them as
filters. There is no pagination and no filtering — both tables are small
and fixed (22 districts, 12 Yerevan + 10 marzes; 10 categories).

**200**

```json
{
  "districts": [
    { "id": 7, "slug": "kentron", "nameHy": "Կենտրոն", "nameRu": "Кентрон", "nameEn": "Kentron" }
  ],
  "categories": [
    { "id": 1, "slug": "furniture", "nameHy": "Կահույք", "nameRu": "Мебель", "nameEn": "Furniture", "icon": "🪑", "position": 0 }
  ]
}
```

Districts are ordered by region then `nameHy`, which groups the Yerevan
districts together and the marzes after them. Categories are ordered by
`position` then `slug`. Render them in the order you receive them — the
ordering is server-side so every client agrees, and the tiebreaks exist
so two rows never swap places between requests.

`region` is not returned. It orders the list; it is not a grouping field
for the UI.

`Cache-Control: public, max-age=300, stale-while-revalidate=86400`. Fetch
it once per session and keep it.

**Errors:** none beyond `INTERNAL` 500.

---

## Auth

### POST /api/auth/otp/request

Sends a 6-digit code by SMS. No auth.

**Body**

```json
{ "phone": "077123456" }
```

Accepts any Armenian spelling — `+37477123456`, `37477123456`,
`0037477123456`, `077123456`, `77123456`, with spaces, dashes, dots or
parentheses. Normalized server-side to E.164. Foreign numbers are
rejected.

**200**

```json
{ "sent": true, "expiresInSeconds": 300 }
```

Identical whether or not the number has an account — deliberately, so the
endpoint can't be used to check who is registered.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `INVALID_PHONE` | 400 | Not a valid Armenian number |
| `RATE_LIMITED` | 429 | Carries a `Retry-After` header, in seconds |
| `SMS_FAILED` | 502 | Gateway could not deliver |

**Rate limits.** 30-second cooldown per number, 3 per number per hour,
10 per IP per hour. The cooldown is checked first, so a double-tap costs
a cooldown rather than one of only three hourly codes.

**UI note.** Show a countdown before enabling "resend." The 30-second
cooldown is the first thing users hit.

---

### POST /api/auth/otp/verify

Verifies the code and starts a session. No auth.

**Body**

```json
{ "phone": "077123456", "code": "123456", "displayName": "Անի" }
```

`displayName` is optional and only used when creating a new account.
It is ignored for an existing user — logging in is not how you rename
yourself. 2–50 characters.

**200 — new number, no name supplied**

```json
{ "isNewUser": true }
```

The code is **not** consumed. Collect a name and re-submit the same
phone and the same code with `displayName`. No cookie is set.

**200 — signed in**

```json
{ "isNewUser": false, "user": { "id": "uuid", "displayName": "Անի" } }
```

Sets the `dzri_session` cookie.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `INVALID_PHONE` | 400 | |
| `INVALID_CODE` | 400 | Wrong, or already consumed |
| `CODE_EXPIRED` | 400 | Older than 5 minutes |
| `TOO_MANY_ATTEMPTS` | 429 | 5 wrong tries killed the code |
| `NAME_REQUIRED` | 400 | Supplied name failed validation |
| `USER_BANNED` | 403 | |
| `RATE_LIMITED` | 429 | |

**UI note.** The two-step flow (`isNewUser: true` → collect name →
re-submit) is the part that's easy to get wrong. Keep the code in state;
don't make the user retype it.

---

### GET /api/auth/me

The signed-in user. Requires auth.

**200**

```json
{
  "user": {
    "id": "uuid",
    "displayName": "Անի",
    "avatarUrl": null,
    "districtId": null,
    "createdAt": "2026-08-07T12:00:00.000Z",
    "lastSeenAt": "2026-08-07T12:00:00.000Z"
  }
}
```

Never includes a phone, not even the owner's own.

**401** `UNAUTHORIZED` — also returned for a banned user, since a ban
must take effect before the 90-day cookie expires.

`Cache-Control: no-store, private`.

---

### POST /api/auth/logout

Clears the cookie. Always succeeds, signed in or not.

**200** `{ "ok": true }`

---

## Images

Uploads go **directly from the browser to Cloudflare R2**. The server
only signs the request; the bytes never pass through it.

### POST /api/images/presign

Requires auth.

**Body**

```json
{ "contentType": "image/jpeg", "contentLength": 524288, "variant": "original" }
```

`variant` is **required** — `original` or `thumb`. There is no default.
It sets the byte ceiling the signature will accept, and nothing on the
server looks at the bytes, so this is the only thing that makes a
thumbnail a thumbnail.

**200**

```json
{
  "uploadUrl": "https://...r2.cloudflarestorage.com/uploads/...?X-Amz-...",
  "key": "uploads/{userId}/{uuid}.jpg",
  "publicUrl": "https://pub-....r2.dev/uploads/{userId}/{uuid}.jpg"
}
```

Identical for both variants — the key is minted server-side under the
same prefix either way.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | |
| `INVALID_BODY` | 400 | Missing or unknown `variant` |
| `INVALID_FILE_TYPE` | 400 | Only jpeg, png, webp |
| `FILE_TOO_LARGE` | 400 | Over the cap for the declared variant |
| `RATE_LIMITED` | 429 | 60/user/hour, 120/IP/hour |

| Variant | Cap |
|---|---|
| `original` | 8 MB |
| `thumb` | 256 KB |

**Upload flow**

Every photo is **two uploads**, so a six-photo listing is twelve presigns
and twelve PUTs. That is what the raised rate limits are for.

1. Run the file through `prepareImage` from `src/lib/images/`. It gives
   you a compressed original (1600px longest edge), a 400px thumbnail,
   the original's `width` and `height`, and a `blurhash` — all from one
   decode, in the browser. Phone photos are 4 MB before compression and
   bandwidth is a real cost.
2. `POST /api/images/presign` **twice**, once per variant, with that
   variant's byte count and the same content type. The pipeline never
   transcodes: both variants keep the source type.
3. `PUT` each blob to its `uploadUrl` with `Content-Type` and
   `Content-Length` matching exactly what you declared. The signature
   binds both — a mismatch is rejected by R2.
4. Keep both keys. They go to `POST /api/items` as `key` and `thumbKey`
   of the same entry, along with the width, height and blurhash.

The presigned URL expires in **5 minutes**. Uploading is a separate step
from creating the item, so an abandoned form leaves orphan objects in the
bucket — now two per photo rather than one. That's accepted for now.

---

## Items — public

No auth. These are the pages a stranger arrives at from a shared link.

### GET /api/items

The feed. Only `active`, unexpired items — `pending_review`, `rejected`,
`reserved`, `given` and `expired` are never visible here. Reserved items
are hidden on purpose: showing something already spoken for wastes the
viewer's time.

**Query params**, all optional:

| Param | Value |
|---|---|
| `district` | district slug |
| `category` | category slug |
| `condition` | `working` \| `needs_repair` \| `for_parts` |
| `cursor` | ISO timestamp from `nextCursor` |

An unknown slug returns an empty page, not an error — a stale shared
link should never break.

**200**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Անվճար բազկաթոռ",
      "condition": "working",
      "createdAt": "2026-08-07T12:00:00.000Z",
      "thumbnailUrl": "https://.../photo.jpg",
      "district": { "slug": "kentron", "nameHy": "Կենտրոն", "nameRu": "Кентрон", "nameEn": "Kentron" },
      "category": { "slug": "furniture", "nameHy": "Կահույք", "nameRu": "Мебель", "nameEn": "Furniture" }
    }
  ],
  "nextCursor": "2026-08-07T11:00:00.000Z"
}
```

24 per page, newest first. No description, no pickup notes, no user info.

`Cache-Control: public, s-maxage=60, stale-while-revalidate=300` — safe
to render server-side and cheap to re-fetch.

**Errors:** `INVALID_BODY` 400 for a malformed `condition` or `cursor`.
`RATE_LIMITED` 429 at 120/IP/minute.

---

### GET /api/items/[id]

One listing.

Public when the item is `active` and unexpired. Two other people may
fetch it in **any** status:

- **the owner**, so they can see their own pending or rejected listing;
- **an approved or completed claimant**. Approving a claim moves the item
  to `reserved`, which is not public — without this the claimant's own
  approved claim would dead-end at a 404 the moment they were picked.
  Read `status` to render "reserved for you".

A claimant whose claim is `rejected`, `withdrawn`, `no_show` or still
`pending` gets nothing. Everyone else gets **404**, never 403 — a 403
would confirm the id exists, which leaks that someone posted something
that got rejected.

A malformed uuid also returns 404.

**200**

```json
{
  "item": {
    "id": "uuid",
    "title": "Անվճար բազկաթոռ",
    "description": "Լավ վիճակում",
    "condition": "working",
    "pickupNotes": "3-րդ հարկ, վերելակ չկա",
    "status": "active",
    "createdAt": "...",
    "expiresAt": "...",
    "images": [
      {
        "url": "https://.../photo.jpg",
        "thumbUrl": "https://.../photo-thumb.jpg",
        "width": 1200,
        "height": 900,
        "blurhash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        "position": 0
      }
    ],
    "district": { "slug": "...", "nameHy": "...", "nameRu": "...", "nameEn": "..." },
    "category": { "slug": "...", "nameHy": "...", "nameRu": "...", "nameEn": "..." },
    "giver": { "displayName": "Անի", "avatarUrl": null }
  }
}
```

Never the giver's phone — not for anyone, including the owner and
including the approved claimant. The claimant gets the number from
`GET /api/claims/mine`; this is not a fourth phone-bearing endpoint.

`thumbUrl` is the 400px variant. It is `null` on images uploaded before
the two-variant pipeline existed — fall back to `url` when it is. Use
`thumbUrl` for the gallery strip and the first paint, `url` for the
full-size view.

`view_count` increments on public fetches only — not when the owner looks
at their own item, and not for the approved claimant.

**Cache.** Public view: `s-maxage=60, stale-while-revalidate=300`.
Owner and claimant views: `no-store, private` — a pending item, and a
`reserved` item visible to exactly one person, must never land in a
shared cache.

**Errors:** `ITEM_NOT_FOUND` 404.

---

### DELETE /api/items/[id]

The giver takes their own listing down. Requires auth.

**Owner only.** Anyone else — signed in or not — gets **404**, never 403.

**No body.**

**200** `{ "id": "uuid", "status": "removed" }`

This is a **soft delete**. The item goes to `removed`, which hides it
from the feed, from search and from every stranger's detail view. The row
and its photos stay, so claims that pointed at it still resolve and a
claimant's history does not develop holes.

Allowed from `draft`, `pending_review`, `active` and `rejected`. Every
still-`pending` claim on the item is **rejected** in the same
transaction — what those people asked for is gone.

Refused from `reserved`, `given` and `expired` with
`INVALID_STATUS_TRANSITION`. `reserved` is the one to explain in the UI:
somebody was picked and may be on their way. The giver's route out is
"they didn't turn up" (`no-show`) or "it's done" (`complete`) — not
deletion. A second delete is also a 409.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | |
| `ITEM_NOT_FOUND` | 404 | Not yours, doesn't exist, or a malformed uuid |
| `INVALID_STATUS_TRANSITION` | 409 | Reserved, given, expired, or already removed |

---

## Items — authenticated

### POST /api/items

Creates a listing. Requires auth.

**Body**

```json
{
  "title": "Անվճար բազկաթոռ",
  "description": "Լավ վիճակում",
  "categoryId": 1,
  "districtId": 7,
  "condition": "working",
  "pickupNotes": "3-րդ հարկ",
  "images": [
    {
      "key": "uploads/{userId}/a.jpg",
      "thumbKey": "uploads/{userId}/a-thumb.jpg",
      "width": 1600,
      "height": 1200,
      "blurhash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
    }
  ]
}
```

| Field | Rule |
|---|---|
| `title` | 3–100 chars, trimmed, required |
| `description` | max 2000, optional |
| `categoryId` | int, must exist |
| `districtId` | int, must exist |
| `condition` | `working` \| `needs_repair` \| `for_parts` |
| `pickupNotes` | max 300, optional |
| `images` | 1–6 entries, in gallery order |

Each entry:

| Field | Rule |
|---|---|
| `key` | the original, from a `variant: "original"` presign |
| `thumbKey` | its 400px variant, from a `variant: "thumb"` presign |
| `width` | positive int, max 20000 — of the **original** |
| `height` | positive int, max 20000 |
| `blurhash` | 6–40 chars, base83 only |

Image order matters: index 0 is the thumbnail.

Every key — original and thumb alike — must be under
`uploads/{yourUserId}/` and must already exist in R2. No key may repeat
anywhere in the request, so `key` and `thumbKey` of the same entry cannot
be the same object.

`width`, `height` and `blurhash` are yours to compute and are used only
for layout: reserve the right aspect ratio and paint the blurhash while
the image loads. `prepareImage` in `src/lib/images/` produces all three
plus both blobs from one decode.

**201**

```json
{ "id": "uuid", "status": "pending_review" }
```

`status` comes from `MODERATION_MODE`. It is `pending_review` at launch
— **a new item is not visible on the feed until an admin approves it.**
The UI must say this after posting, or the giver will think it failed.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | |
| `INVALID_BODY` | 400 | Failed field validation, incl. a bad width, height or blurhash |
| `IMAGES_REQUIRED` | 400 | Empty `images` |
| `TOO_MANY_IMAGES` | 400 | More than 6 |
| `INVALID_IMAGE_KEY` | 400 | A `key` or `thumbKey` not under `uploads/{yourUserId}/`, or a duplicate |
| `IMAGE_NOT_FOUND` | 400 | A `key` or `thumbKey` was never actually uploaded to R2 |
| `INVALID_CATEGORY` | 400 | |
| `INVALID_DISTRICT` | 400 | |
| `RATE_LIMITED` | 429 | 10/user/hour, 20/IP/hour |

---

### GET /api/items/mine

The caller's own listings, newest first. Requires auth.

**Query:** `cursor` (ISO timestamp), optional.

**200**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Անվճար բազկաթոռ",
      "status": "rejected",
      "rejectionReason": "Նկարը հստակ չէ",
      "createdAt": "...",
      "expiresAt": "...",
      "imageUrl": "https://.../photo-thumb.jpg",
      "claimCount": 3,
      "pendingClaimCount": 1
    }
  ],
  "nextCursor": null
}
```

20 per page. `rejectionReason` is user-facing text written by an admin —
show it verbatim.

`claimCount` is how many people have asked for the item, ever, whatever
became of those claims. `pendingClaimCount` counts only the ones still
`pending` — people waiting on a decision right now. That is the number to
badge; `claimCount` is history and does not go down.

`Cache-Control: no-store, private`.

**Errors:** `UNAUTHORIZED` 401, `INVALID_BODY` 400 for a bad cursor.

---

## Claims

The core interaction. Someone says "I want this," the giver picks one
person, and **only then** do the two phone numbers become visible to each
other.

### Claim lifecycle

```
pending ──approve──> approved ──complete──> completed
   │                    │
   │                    ├──no-show──> no_show      (item back to active)
   │                    └──withdraw─> withdrawn    (item back to active)
   ├──reject──> rejected
   └──withdraw─> withdrawn
```

Approving one claim automatically **rejects every other pending claim**
on that item and reserves the item for 48 hours.

---

### POST /api/items/[id]/claims

"I want this." Requires auth.

**Body**

```json
{ "message": "Կարող եմ այսօր վերցնել ժամը 6-ից հետո" }
```

Optional, max 300 chars. An empty body `{}` is a valid claim.

**201**

```json
{ "id": "uuid", "status": "pending" }
```

No phone number. At `pending` the two parties are still strangers.

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | |
| `ITEM_NOT_FOUND` | 404 | Not active, expired, reserved, or doesn't exist |
| `CANNOT_CLAIM_OWN_ITEM` | 400 | |
| `ALREADY_CLAIMED` | 409 | You already claimed this item |
| `INVALID_BODY` | 400 | Message over 300 chars |
| `RATE_LIMITED` | 429 | 20/user/hour, 40/IP/hour |

---

### GET /api/items/[id]/claims

The giver's decision list. **Only the item's owner** — everyone else,
including people who claimed it, gets 404.

**200**

```json
{
  "claims": [
    {
      "id": "uuid",
      "status": "pending",
      "message": "Կարող եմ այսօր վերցնել",
      "createdAt": "...",
      "claimant": {
        "displayName": "Արամ",
        "avatarUrl": null,
        "reliability": { "completed": 2, "noShows": 0 }
      }
    }
  ]
}
```

Oldest first — whoever asked first is seen first.

`reliability` is what lets a giver choose between three strangers.
`noShows` counts times they were picked and never turned up.

**Phone.** `claimant.phone` appears **only** on a claim with status
`approved`. On any other status the key is absent entirely.

`Cache-Control: no-store, private`.

**Errors:** `UNAUTHORIZED` 401, `ITEM_NOT_FOUND` 404.

---

### POST /api/claims/[id]/approve

The giver picks this person. Owner only.

**No body.**

**200**

```json
{
  "id": "uuid",
  "status": "approved",
  "reservedUntil": "2026-08-09T12:00:00.000Z",
  "giverPhone": "+37477123456",
  "claimantPhone": "+37455987654"
}
```

**This is the only response in the entire API that returns a phone
number.** Both parties get both numbers. Show them prominently — this is
the moment the transaction becomes possible.

Side effects, all atomic:
- Item → `reserved`, held for the claimant for **48 hours**
- Every other pending claim on the item → `rejected`
- If nobody collects, the hourly cron releases the item back to `active`
  and marks this claim `no_show`

**Errors**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | |
| `CLAIM_NOT_FOUND` | 404 | Not yours, or doesn't exist |
| `INVALID_STATUS_TRANSITION` | 409 | Not pending — e.g. a double-click, or another claim won |

---

### POST /api/claims/[id]/reject

Turn someone down. Owner only. From `pending` only. No body, no reason
required.

**200** `{ "id": "uuid", "status": "rejected" }`

The item stays `active` for everyone else.

**Errors:** `UNAUTHORIZED` 401, `CLAIM_NOT_FOUND` 404,
`INVALID_STATUS_TRANSITION` 409.

---

### POST /api/claims/[id]/withdraw

The **claimant** backs out. Not the giver. From `pending` or `approved`.

**200** `{ "id": "uuid", "status": "withdrawn" }`

Withdrawing an approved claim releases the item back to `active`
immediately, rather than leaving it stuck for 48 hours.

**Errors:** `UNAUTHORIZED` 401, `CLAIM_NOT_FOUND` 404 (including when
the giver tries it), `INVALID_STATUS_TRANSITION` 409.

---

### POST /api/claims/[id]/complete

The handover happened. Owner only. From `approved` only.

**200** `{ "id": "uuid", "status": "completed" }`

Item → `given`, which is terminal.

**Errors:** `UNAUTHORIZED` 401, `CLAIM_NOT_FOUND` 404,
`INVALID_STATUS_TRANSITION` 409.

---

### POST /api/claims/[id]/no-show

They never turned up. Owner only. From `approved` only.

**200** `{ "id": "uuid", "status": "no_show" }`

Item goes straight back to `active`. This feeds `user_reliability`, which
the next giver sees.

Make this **one tap, no confirmation dialog**. A giver who has just
wasted an evening will not fill in a form.

**Errors:** `UNAUTHORIZED` 401, `CLAIM_NOT_FOUND` 404,
`INVALID_STATUS_TRANSITION` 409.

---

### GET /api/claims/mine

Everything the caller has asked for, newest first. Requires auth.

**Query:** `cursor`, optional.

**200**

```json
{
  "claims": [
    {
      "id": "uuid",
      "status": "approved",
      "message": "Կարող եմ այսօր վերցնել",
      "createdAt": "...",
      "item": {
        "id": "uuid",
        "title": "Անվճար բազկաթոռ",
        "status": "reserved",
        "thumbnailUrl": "https://.../photo.jpg"
      },
      "giver": { "displayName": "Անի", "phone": "+37477123456" }
    }
  ],
  "nextCursor": null
}
```

20 per page. `giver.phone` appears **only** when `status` is `approved`.
Absent otherwise.

`Cache-Control: no-store, private`.

**Errors:** `UNAUTHORIZED` 401, `INVALID_BODY` 400.

---

## Admin

Every admin route requires `users.is_admin = true`. A non-admin —
anonymous or signed in — gets **404**, not 403, so the admin surface
isn't discoverable by probing paths.

There is no API to become an admin. It's set out of band with
`npm run db:make-admin -- <phone>`.

### GET /api/admin/items/pending

The moderation queue. **Oldest first** — this is a work queue, not a
feed. The person who has waited longest is reviewed first.

**Query:** `cursor` (ISO timestamp), optional.

**200**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Անվճար բազկաթոռ",
      "description": "Լավ վիճակում",
      "condition": "working",
      "pickupNotes": "3-րդ հարկ",
      "createdAt": "...",
      "images": ["https://.../a.jpg", "https://.../b.jpg"],
      "district": { "slug": "...", "nameHy": "...", "nameRu": "...", "nameEn": "..." },
      "category": { "slug": "...", "nameHy": "...", "nameRu": "...", "nameEn": "..." },
      "giver": { "displayName": "Անի", "approvedCount": 4, "rejectedCount": 1 }
    }
  ],
  "nextCursor": null
}
```

20 per page. The giver's prior counts are what make a repeat spammer
obvious at a glance. Never a phone.

`Cache-Control: no-store`.

**Errors:** `NOT_FOUND` 404.

---

### POST /api/admin/items/[id]/approve

Publishes a pending item. No body.

**200** `{ "id": "uuid", "status": "active" }`

Also resets `expiresAt` to 30 days from **now**, so a slow review doesn't
eat the item's lifetime.

**Errors:** `NOT_FOUND` 404, `INVALID_STATUS_TRANSITION` 409 (not
pending — including a double-click).

---

### POST /api/admin/items/[id]/reject

**Body**

```json
{ "reason": "Նկարը հստակ չէ, խնդրում ենք վերբեռնել ավելի պարզ լուսանկար" }
```

Required, 5–500 chars, trimmed. **This text is shown to the giver** in
`/api/items/mine`. Write it as a message to a person, not an internal
note.

**200** `{ "id": "uuid", "status": "rejected" }`

**Errors:** `NOT_FOUND` 404, `INVALID_BODY` 400 (missing or too short
reason), `INVALID_STATUS_TRANSITION` 409.

---

### GET /api/admin/stats

**200**

```json
{
  "counts": {
    "draft": 0, "pending_review": 4, "active": 37, "rejected": 2,
    "reserved": 3, "given": 12, "expired": 8, "removed": 0
  },
  "pendingCount": 4,
  "oldestPendingAt": "2026-08-07T09:00:00.000Z",
  "oldestPendingAgeSeconds": 10800
}
```

All eight statuses are always present, zero-filled.
`oldestPendingAgeSeconds` is the number that says whether pre-moderation
is still keeping up or has become the bottleneck.

`oldestPendingAt` and `oldestPendingAgeSeconds` are `null` when the queue
is empty.

**Errors:** `NOT_FOUND` 404.

---

## Cron

### GET /api/cron/sweep

**Not for the frontend.** Called hourly by GitHub Actions with a bearer
token. Releases lapsed reservations, expires stale items, purges old OTP
rows. Returns 404 to anyone without the secret.

Documented here only so nobody wires a UI button to it.

---

## Item status reference

| Status | Meaning | Visible on feed |
|---|---|---|
| `draft` | Unused so far | No |
| `pending_review` | Awaiting admin approval | No |
| `active` | Live and claimable | **Yes** |
| `rejected` | Admin declined, `rejectionReason` set | No |
| `reserved` | Held 48h for an approved claimant | No |
| `given` | Handed over, terminal | No |
| `expired` | 30 days passed, terminal | No |
| `removed` | Giver deleted it, terminal | No |

## Claim status reference

| Status | Meaning |
|---|---|
| `pending` | Waiting on the giver |
| `approved` | Picked — phones revealed, item reserved 48h |
| `rejected` | Giver chose someone else |
| `withdrawn` | Claimant backed out |
| `completed` | Handover happened |
| `no_show` | Approved but never collected — counts against reliability |

---

## Full error code list

| Code | Status |
|---|---|
| `INVALID_PHONE` | 400 |
| `INVALID_CODE` | 400 |
| `CODE_EXPIRED` | 400 |
| `TOO_MANY_ATTEMPTS` | 429 |
| `NAME_REQUIRED` | 400 |
| `USER_BANNED` | 403 |
| `INVALID_BODY` | 400 |
| `UNAUTHORIZED` | 401 |
| `RATE_LIMITED` | 429 |
| `SMS_FAILED` | 502 |
| `INVALID_FILE_TYPE` | 400 |
| `FILE_TOO_LARGE` | 400 |
| `IMAGES_REQUIRED` | 400 |
| `TOO_MANY_IMAGES` | 400 |
| `INVALID_IMAGE_KEY` | 400 |
| `IMAGE_NOT_FOUND` | 400 |
| `INVALID_CATEGORY` | 400 |
| `INVALID_DISTRICT` | 400 |
| `ITEM_NOT_FOUND` | 404 |
| `CANNOT_CLAIM_OWN_ITEM` | 400 |
| `ALREADY_CLAIMED` | 409 |
| `CLAIM_NOT_FOUND` | 404 |
| `INVALID_STATUS_TRANSITION` | 409 |
| `NOT_FOUND` | 404 |
| `INTERNAL` | 500 |

A `429` may carry a `Retry-After` header, in whole seconds.

---

## Rules the UI must respect

1. **Never assume a `phone` key exists.** It appears only on an approved
   claim, and only in `POST /api/claims/[id]/approve`,
   `GET /api/items/[id]/claims`, and `GET /api/claims/mine`.

2. **404 means 404.** Several endpoints return 404 where 403 would be
   natural — non-owner, non-admin, non-active item. That's deliberate.
   Render "not found," never "you don't have permission."

3. **A new item is invisible.** It goes to `pending_review`. Tell the
   giver their listing is waiting for review, or they'll assume it broke.

4. **Ask for login lazily.** Browsing needs no account. Request the phone
   only when someone taps "post" or "I want this" — and persist the
   half-filled form so the OTP round trip doesn't lose it.

5. **Rate limits are user-visible.** The 30-second OTP cooldown in
   particular. Show a countdown rather than a failed request.

---

## Known gaps

Things the UI will need that don't exist yet:

- **`PATCH /api/items/[id]`** — editing a listing.
- **`PATCH /api/auth/me`** — changing display name, avatar, district.
- **Notifications.** A giver has no way to learn someone claimed their
  item except by opening the app. This is the biggest product gap.
- **`POST /api/items/[id]/report`** — the `reports` table exists but no
  endpoint writes to it.
- **Orphan image cleanup.** Presigned uploads that never get attached to
  an item stay in R2 forever — and since every photo is now two objects,
  an abandoned form leaves twice as many.
- **`GET /api/claims/mine` still serves originals.** Its `thumbnailUrl`
  reads `item_images.url`, not the variant, so the claimant's list is the
  one list view that has not been moved onto thumbnails.
