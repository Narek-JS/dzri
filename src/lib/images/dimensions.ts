/**
 * The pure arithmetic behind the two-variant pipeline, kept away from the
 * canvas so it can be reasoned about and unit-tested without a browser.
 */

/**
 * What an original is scaled down to before upload. A phone photo is 4000px
 * and 4 MB; nothing on this site displays an image wider than a phone screen
 * at 3x, and the 8 MB presign ceiling is a ceiling, not a target.
 */
export const ORIGINAL_LONGEST_EDGE = 1600;

/** The variant every list view serves. Small enough that a feed is cheap. */
export const THUMB_LONGEST_EDGE = 400;

/**
 * The square the blurhash is computed from. BlurHash averages over a handful
 * of DCT components, so feeding it a full-size bitmap costs a lot of pixel
 * reads to produce the same ~30 characters. 32px is the size the reference
 * implementations use.
 */
export const BLURHASH_SAMPLE_EDGE = 32;

export type Size = { width: number; height: number };

/**
 * Scales a size down so its longest edge is at most `longestEdge`, preserving
 * aspect ratio. An image already smaller than the target is returned as-is —
 * upscaling a small photo to hit a number would add bytes and no detail.
 *
 * Both sides are floored to at least 1: a very wide, very short image scaled
 * down would otherwise round its short side to zero, and a zero-width canvas
 * throws.
 */
export function scaleToFit(size: Size, longestEdge: number): Size {
  const longest = Math.max(size.width, size.height);

  if (longest <= longestEdge) {
    return {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    };
  }

  const ratio = longestEdge / longest;

  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}

/**
 * How many DCT components to encode in each axis.
 *
 * BlurHash allows 1–9 per axis and costs bytes for each. Four along the long
 * axis and three along the short one is the shape the format's own examples
 * use: enough structure to read as "the shape of the photo", few enough that
 * the hash stays around thirty characters. The wider axis gets the extra
 * component, so a panorama does not blur into a single horizontal band.
 */
export function blurhashComponents(size: Size): { x: number; y: number } {
  if (size.width > size.height) return { x: 4, y: 3 };
  if (size.height > size.width) return { x: 3, y: 4 };

  return { x: 4, y: 4 };
}
