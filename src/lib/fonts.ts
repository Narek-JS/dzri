import { Manrope, Noto_Sans, Noto_Sans_Armenian } from 'next/font/google';

/**
 * Body text has to cover Armenian, Russian and English. "Noto Sans
 * Armenian" — CLAUDE.md's suggested safe default — only ships `armenian`
 * and `latin` glyphs (checked against Google Fonts' own coverage metadata
 * at fonts.google.com/metadata/fonts/Noto%20Sans%20Armenian): no cyrillic,
 * so Russian text would silently fall back to a system font mid-word.
 * Plain "Noto Sans" covers `cyrillic` and `latin` but has no Armenian.
 *
 * Loading both and stacking them (see --font-sans in globals.css) lets the
 * browser pick per character: Armenian glyphs render in Noto Sans Armenian,
 * Cyrillic and Latin in Noto Sans. Neither font alone has full coverage for
 * this app's three locales.
 */
export const notoSansArmenian = Noto_Sans_Armenian({
  subsets: ['armenian', 'latin'],
  variable: '--font-noto-armenian',
  display: 'swap',
});

export const notoSans = Noto_Sans({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-noto-sans',
  display: 'swap',
});

/**
 * The "dzri" wordmark only (BRAND.md: "Poppins or Manrope for the
 * wordmark"), never body text — Manrope has no Armenian or Cyrillic
 * coverage.
 */
export const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});
