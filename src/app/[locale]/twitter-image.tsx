/**
 * Twitter's card image and the Open Graph image are the same artwork —
 * re-exporting the generator (rather than duplicating it) is what makes
 * that "same generated image" guarantee structural instead of something
 * that can drift the next time either one is edited.
 */
export { default, alt, size, contentType } from './opengraph-image';

// Next reads route segment config (like `runtime`) via static analysis of
// this file's own exports — re-exporting it from opengraph-image.tsx above
// doesn't count, it silently falls back to the default Node runtime, which
// can't run the font-loading `fetch(new URL(...))` calls (see the comment
// on `runtime` in opengraph-image.tsx).
export const runtime = 'edge';
