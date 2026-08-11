# dzri — TODO

A plain running list of things known to be unfinished. Not a decision log
(see `DECISIONS.md`) and not the gap list in `API.md`'s "Known gaps" —
those are missing endpoints; this is anything, anywhere, left undone.
Enough context per item to pick it up cold.

- **EXIF orientation is unverified.** `prepareImage`
  (`src/lib/images/prepare.ts`) passes `imageOrientation: 'from-image'` to
  `createImageBitmap`, but every photo run through it so far was a PNG,
  which carries no EXIF orientation tag. Needs one portrait JPEG straight
  off a phone (not re-saved by an image editor, which often bakes
  orientation into the pixels itself) to confirm the browser rotates it
  upright instead of rendering it sideways.

- **PNG thumbnails may exceed the 256 KB presign cap.** PNG has no
  quality lever, so `encodeUnderCap` (`src/lib/images/thumbQuality.ts`)
  gets exactly one attempt at the thumbnail — no retry at a lower
  quality the way JPEG/WebP get. A busy screenshot or a PNG with a lot of
  detail can fail the upload with `THUMB_TOO_LARGE`. Unmeasured against
  real R2 objects; needs a handful of representative PNGs (a screenshot,
  a scanned document, a photo saved as PNG) pushed through the real
  pipeline to see how often this actually fires.

- **The item detail page's "full-size view" is a lightbox, not a second
  page.** `src/app/[locale]/items/[id]/ItemGallery.tsx` shows `thumbUrl`
  for the gallery strip and the hero image on first paint, and only
  fetches `url` (the original) when the viewer clicks the hero to open
  it larger — matching API.md's "`thumbUrl` for the gallery strip and
  the first paint, `url` for the full-size view" literally. Never
  verified this reading against product intent; if the "full-size view"
  was actually meant to be the hero image itself at a bigger display
  size (not a distinct click-to-open view), this needs rebuilding.

- **The my-claims page has never been run against a real database.**
  `[locale]/my/claims` (page, `MyClaimsList`, `MyClaimRow`) and the
  `getMyClaims` extraction it shares with `GET /api/claims/mine` were
  built on a checkout with no `.env.local`, so `npm run test:integration`
  skipped all 122 tests rather than passing them and nothing was opened
  in a browser. Unverified by hand, in order of how much it would matter
  if wrong: that a pending or rejected row carries no phone anywhere in
  the rendered HTML; that the approved row shows the giver's number and
  still does after a full reload; that withdrawing from approved releases
  the item and takes the number off the page; that the thumbnails on the
  wire are the 400px variant and not the original; that a signed-out
  visitor is bounced to login and lands back here. Needs a `DATABASE_URL`
  pointed at a Neon *branch* and two accounts with claims in at least
  pending, approved and rejected.

- **A my-claims item link can still dead-end for about an hour.**
  `canOpenItem` (`src/app/[locale]/my/claims/claimStatusKeys.ts`) decides
  whether to link a row's title by predicting what `GET /api/items/[id]`
  will answer: entitled for an `approved`/`completed` claimant, otherwise
  only while the item is `active`. An item whose `expiresAt` has passed
  but which the hourly sweep has not yet flipped to `expired` still reads
  `active`, so a pending or rejected claimant gets a link into a 404. The
  response carries no `expiresAt` to check against; adding one to
  `GET /api/claims/mine` would close it, at the cost of a field on the
  documented shape for a window that closes itself.

- **No pre-check for "already claimed."** The claim button
  (`src/app/[locale]/items/[id]/ClaimButton.tsx`) finds out a viewer
  already claimed an item only when `POST /api/items/[id]/claims`
  answers `ALREADY_CLAIMED` — there is no endpoint to ask ahead of time,
  by design (see the task brief this page shipped under). A viewer who
  claimed earlier, left, and comes back to the item sees an enabled
  button again until they press it once. Acceptable for now, but worth
  revisiting if it turns out to be a common path once there's usage data.
