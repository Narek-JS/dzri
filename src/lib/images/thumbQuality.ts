import { ImagePrepareError } from './errors';

/**
 * The presign ceiling for a `variant: "thumb"` upload (API.md). Nothing on
 * the server looks at the bytes — this cap is the only thing that makes a
 * thumbnail a thumbnail (DECISIONS.md, 2026-08-08) — so a thumb that would
 * be refused server-side must never leave the browser.
 */
export const THUMB_MAX_BYTES = 256 * 1024;

/**
 * Quality values tried in order, decreasing, for a `canvas.toBlob` /
 * `convertToBlob` encode. Only meaningful for JPEG and WebP — PNG is
 * lossless and its encoder takes no quality hint, so a PNG caller passes a
 * single-element array instead of retrying at the same size for nothing.
 */
export const THUMB_QUALITY_STEPS = [0.82, 0.6, 0.42, 0.28, 0.16] as const;

/**
 * Tries each quality step in order, returning the first encode at or under
 * `maxBytes`. Throws `ImagePrepareError('THUMB_TOO_LARGE', ...)` if even the
 * last (lowest-quality) step doesn't fit.
 *
 * `encode` is injected rather than this function calling a canvas directly,
 * so the exit conditions — first-fit short-circuits, exhaustion throws — can
 * be unit-tested under Node with no canvas or image decoder involved.
 */
export async function encodeUnderCap<T extends { size: number }>(
  encode: (quality: number | undefined) => Promise<T>,
  steps: readonly (number | undefined)[],
  maxBytes: number,
): Promise<T> {
  let smallest: T | undefined;

  for (const quality of steps) {
    const result = await encode(quality);

    if (result.size <= maxBytes) return result;
    if (!smallest || result.size < smallest.size) smallest = result;
  }

  throw new ImagePrepareError(
    'THUMB_TOO_LARGE',
    `Thumbnail could not be reduced under ${maxBytes} bytes ` +
      `(smallest attempt: ${smallest?.size ?? 0} bytes over ${steps.length} step(s))`,
  );
}
