# dzri — brand reference

## What it is

A platform for Armenia where people give away items they no longer
need, and whoever needs them comes to collect for free. Nothing is
sold. It is a product, not a charity.

The name is ձրի — "free." Wordmark is always lowercase: `dzri`.

## Positioning

The real competitor is not list.am. It is the trash container
downstairs and the scrap collector driving through the yard. Both
are already free and instant. Anything that adds friction loses to
them.

Warm and neighborly. Never charity-flavored — no ribbons, no
hearts, no "donate," no pity framing. Receiving something here
should feel normal, not like accepting help.

## Color tokens

| Token          | Hex       | Use                                          |
|----------------|-----------|----------------------------------------------|
| `brand`        | `#E8894A` | Logo, illustrations, large fills. Never text.|
| `brand-strong` | `#B4530F` | Links, icons, buttons with white text, text  |
| `brand-tint`   | `#FDF1E7` | Card backgrounds, hover, selected rows       |
| `brand-dark`   | `#F5A76A` | Dark mode substitute for `brand`             |

Contrast, measured against white:

- `#E8894A` — 2.6:1. Fails WCAG AA for text. Large shapes only.
- `#B4530F` — 5.0:1. Passes AA. This is the text color.
- `#F5A76A` on `#141414` — 9.5:1. Dark mode.

## Color rules

1. A filled `#E8894A` button carries near-black text, never white.
   If you want white text, the background must be `#B4530F`.
2. Brand orange never also means "warning." Red is destructive and
   error. Green is success. Warning is a distinct yellow. Never
   reuse the brand hue for a system state.
3. Never encode meaning by color alone. A reserved item needs an
   icon and a label, not just an orange badge.
4. No raw hex anywhere in the codebase. These four are Tailwind
   theme tokens and nothing else is allowed.

## Logo

- Icon: open palm facing upward, small square box floating above it.
  Flat vector, 2–3 thick strokes, rounded caps.
- Horizontal lockup (icon + wordmark) for site header, social
  covers, email signature.
- Icon alone for favicon, app icon, and every social avatar — a
  four-letter wordmark is unreadable in a circular crop.
- Every icon change must survive two tests: legible at 32×32, and
  legible cropped to a circle.

## Language

Armenian first, then Russian, then English. Russian matters because
relocants are the strongest early user segment — they leave the
country and give away entire apartments.

UI copy is short and plain. No exclamation marks. No "please." Verb
first on buttons: «Տեղադրել», not «Տեղադրման ձև».

## Typography

Geometric sans. Poppins or Manrope for the wordmark. Body text in a
font with full Armenian coverage — verify Armenian glyphs before
committing to any typeface, since many geometric sans families have
none.
