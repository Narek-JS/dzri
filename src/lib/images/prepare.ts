import { encode } from 'blurhash';

import { isAllowedContentType } from './contentTypes';
import type { AllowedContentType } from './contentTypes';
import {
  BLURHASH_SAMPLE_EDGE,
  ORIGINAL_LONGEST_EDGE,
  THUMB_LONGEST_EDGE,
  blurhashComponents,
  scaleToFit,
} from './dimensions';
import type { Size } from './dimensions';

/**
 * Turns one file the user picked into everything `POST /api/items` needs for
 * it: a compressed original, a 400px thumbnail, and a blurhash.
 *
 * This runs in the BROWSER. It is a pure module — no React, no i18n, no
 * network — so it can be called from a form component, a worker, or a test
 * harness, and it throws plain `Error`s that the caller translates. Nothing
 * here imports from `src/lib/r2/`, which pulls in `node:crypto` and the S3
 * SDK; the shared content-type allowlist lives in `./contentTypes` for exactly
 * that reason.
 *
 * Why the client does the resizing at all: the bytes go straight from the
 * browser to R2 and never pass through a route handler (DECISIONS.md), so
 * there is no server-side moment at which a variant could be generated. The
 * server's only control over what a "thumb" turns out to be is the 256 KB cap
 * on its presign — which is why this deliberately produces something an order
 * of magnitude under it.
 *
 * Compression quality is applied to JPEG and WebP. PNG ignores it: the format
 * is lossless and the canvas encoder takes no quality hint for it.
 */
const COMPRESSION_QUALITY = 0.82;

export type PreparedImage = {
  /** Same type as the source file — the pipeline never transcodes. */
  contentType: AllowedContentType;
  /** The compressed original, scaled to at most 1600px on its longest edge. */
  original: Blob;
  /** Its 400px-longest-edge variant. */
  thumb: Blob;
  /** Dimensions of `original`, which is what the layout hint describes. */
  width: number;
  height: number;
  blurhash: string;
};

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const contentType = file.type;

  // The type comes from the OS's idea of the file. Checking it here means the
  // caller fails on the file picker rather than on a presign round trip.
  if (!isAllowedContentType(contentType)) {
    throw new Error(`Unsupported image type: ${contentType || 'unknown'}`);
  }

  const bitmap = await createImageBitmap(file);

  try {
    const source: Size = { width: bitmap.width, height: bitmap.height };

    // Both variants are rendered from the same decoded bitmap. Deriving the
    // thumbnail from the already-compressed original instead would compound
    // two lossy passes for no saving.
    const originalSize = scaleToFit(source, ORIGINAL_LONGEST_EDGE);
    const thumbSize = scaleToFit(source, THUMB_LONGEST_EDGE);

    const [original, thumb] = await Promise.all([
      renderToBlob(bitmap, originalSize, contentType),
      renderToBlob(bitmap, thumbSize, contentType),
    ]);

    return {
      contentType,
      original,
      thumb,
      width: originalSize.width,
      height: originalSize.height,
      blurhash: computeBlurhash(bitmap, source),
    };
  } finally {
    // The decoded bitmap holds the full uncompressed frame. Six 12-megapixel
    // photos is nearly 300 MB of it, which is enough to be killed for on a
    // phone, so it is released even when a render throws.
    bitmap.close();
  }
}

/**
 * Encodes a blurhash from a deliberately tiny render of the image.
 *
 * `encode(pixels, width, height, componentX, componentY)` — the signature is
 * from the blurhash package's own README, and `pixels` is RGBA, four bytes per
 * pixel, exactly what `getImageData().data` hands back.
 */
function computeBlurhash(bitmap: ImageBitmap, source: Size): string {
  const sampleSize = scaleToFit(source, BLURHASH_SAMPLE_EDGE);
  const { data } = renderToImageData(bitmap, sampleSize);
  const components = blurhashComponents(source);

  return encode(data, sampleSize.width, sampleSize.height, components.x, components.y);
}

/**
 * A 2D canvas of the given size, as an `OffscreenCanvas` where the browser has
 * one and a detached `<canvas>` otherwise. Offscreen is preferred because it
 * works inside a worker, which is where a caller should put this if it is
 * processing six photos while the user is still typing.
 */
type Canvas2D = {
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  toBlob: (contentType: AllowedContentType) => Promise<Blob>;
};

function createCanvas(size: Size): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Could not get a 2D context for image resizing');

    return {
      context,
      toBlob: (contentType) =>
        canvas.convertToBlob({ type: contentType, quality: COMPRESSION_QUALITY }),
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a 2D context for image resizing');

  return {
    context,
    toBlob: (contentType) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image data'))),
          contentType,
          COMPRESSION_QUALITY,
        );
      }),
  };
}

/**
 * Draws the bitmap scaled into a canvas of `size` and encodes it.
 *
 * `imageSmoothingQuality: 'high'` matters here: the default in some browsers
 * is a nearest-neighbour-ish downscale, which on a 4x reduction turns fine
 * detail into aliasing artefacts that then cost bytes to encode.
 */
async function renderToBlob(
  bitmap: ImageBitmap,
  size: Size,
  contentType: AllowedContentType,
): Promise<Blob> {
  const canvas = createCanvas(size);

  canvas.context.imageSmoothingEnabled = true;
  canvas.context.imageSmoothingQuality = 'high';
  canvas.context.drawImage(bitmap, 0, 0, size.width, size.height);

  return canvas.toBlob(contentType);
}

function renderToImageData(bitmap: ImageBitmap, size: Size): ImageData {
  const canvas = createCanvas(size);

  canvas.context.imageSmoothingEnabled = true;
  canvas.context.imageSmoothingQuality = 'high';
  canvas.context.drawImage(bitmap, 0, 0, size.width, size.height);

  return canvas.context.getImageData(0, 0, size.width, size.height);
}
