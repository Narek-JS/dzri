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

- **No pre-check for "already claimed."** The claim button
  (`src/app/[locale]/items/[id]/ClaimButton.tsx`) finds out a viewer
  already claimed an item only when `POST /api/items/[id]/claims`
  answers `ALREADY_CLAIMED` — there is no endpoint to ask ahead of time,
  by design (see the task brief this page shipped under). A viewer who
  claimed earlier, left, and comes back to the item sees an enabled
  button again until they press it once. Acceptable for now, but worth
  revisiting if it turns out to be a common path once there's usage data.

- **No way back to `/items/[id]/claims` once the item leaves `active`.**
  `src/app/[locale]/items/[id]/page.tsx`'s "View claims" banner is gated on
  `isOwner && item.status === 'active'`, so it disappears the moment a
  giver approves a claim (item → `reserved`) — exactly the point they most
  need to get back to that page to mark it given or no-show, on a return
  visit rather than the same browser tab. Found while building the claims
  page; out of scope for that task (it only consumes the existing link, an
  explicit given fact in the brief), but the claims page itself works
  correctly on a direct/bookmarked/reloaded URL regardless — this is a
  discoverability gap, not a functional one. Fix is presumably widening
  that banner's status check to include `reserved` and `given`.
