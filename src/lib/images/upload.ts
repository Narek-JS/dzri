import { ApiClientError, api } from '@/lib/api/client';

import type { AllowedContentType } from './contentTypes';
import type { PreparedImage } from './prepare';

import type { ImageVariant } from '@/lib/api/client';

/**
 * Turns a `PreparedImage` (./prepare) into the `{ key, thumbKey, width,
 * height, blurhash }` shape `POST /api/items` expects (API.md), by
 * presigning and uploading both variants straight to R2. Browser-only: the
 * bytes never pass through a route handler (DECISIONS.md, 2026-08-08).
 */

export type ImageUploadErrorCode =
  'RATE_LIMITED' | 'UNAUTHORIZED' | 'PRESIGN_FAILED' | 'PUT_FAILED';

export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode;
  /** Only ever set when `code === 'RATE_LIMITED'` (API.md: `Retry-After`). */
  readonly retryAfterSeconds?: number;

  constructor(code: ImageUploadErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ImageUploadError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type UploadedImage = {
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  blurhash: string;
};

function toImageUploadError(error: unknown, fallbackCode: ImageUploadErrorCode): ImageUploadError {
  if (error instanceof ApiClientError) {
    if (error.code === 'RATE_LIMITED') {
      return new ImageUploadError('RATE_LIMITED', error.message, error.retryAfterSeconds);
    }
    if (error.code === 'UNAUTHORIZED') {
      return new ImageUploadError('UNAUTHORIZED', error.message);
    }
    return new ImageUploadError(fallbackCode, error.message);
  }

  return new ImageUploadError(fallbackCode, String(error));
}

/**
 * Presigns one variant and PUTs the blob to R2. `Content-Type` is set
 * explicitly; `Content-Length` is never set by hand — it is a forbidden
 * header for `fetch` and the browser derives it from `blob.size` on its
 * own, which is exactly the number just presigned, since `blob` is not
 * touched in between. That equality is what the signature needs (API.md:
 * "Content-Type and Content-Length matching exactly what you declared").
 *
 * No retry: a presigned URL is single-use in spirit (5-minute window,
 * DECISIONS.md's orphan-object tradeoff already accepts an abandoned
 * attempt as a cost), so a failure here surfaces as a typed error for the
 * caller to show, not something this function silently retries.
 */
async function uploadVariant(
  blob: Blob,
  contentType: AllowedContentType,
  variant: ImageVariant,
): Promise<{ key: string }> {
  let presign;
  try {
    presign = await api.images.presign({ contentType, contentLength: blob.size, variant });
  } catch (error) {
    throw toImageUploadError(error, 'PRESIGN_FAILED');
  }

  let response: Response;
  try {
    response = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
  } catch (cause) {
    throw new ImageUploadError('PUT_FAILED', `Network error uploading to R2: ${String(cause)}`);
  }

  if (!response.ok) {
    throw new ImageUploadError(
      'PUT_FAILED',
      `R2 rejected the upload with status ${response.status}`,
    );
  }

  return { key: presign.key };
}

/**
 * Uploads both variants of one prepared photo, in parallel — the two are
 * independent presign+PUT pairs, so there is nothing to gain by serializing
 * them. The bounded concurrency PART 3 asks for is about how many *photos*
 * are in flight at once (see `createUploadQueue`), not about the two
 * requests that make up a single photo.
 */
export async function uploadPreparedImage(prepared: PreparedImage): Promise<UploadedImage> {
  const [original, thumb] = await Promise.all([
    uploadVariant(prepared.original, prepared.contentType, 'original'),
    uploadVariant(prepared.thumb, prepared.contentType, 'thumb'),
  ]);

  return {
    key: original.key,
    thumbKey: thumb.key,
    width: prepared.width,
    height: prepared.height,
    blurhash: prepared.blurhash,
  };
}

/** Six photos is twelve presigns and twelve PUTs (API.md) — enough at once
 * to be worth bounding, but bounding to 1 would leave the raised rate
 * limits (60/user/hour) unused for no benefit. */
export const MAX_CONCURRENT_UPLOADS = 3;

export type UploadQueue = {
  /** Runs `task` once fewer than the queue's limit are already running. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

/**
 * A minimal semaphore: `run` resolves immediately while under `concurrency`
 * tasks are in flight, and queues (FIFO) once at the limit. Used so that
 * photos added to the create-item form — one at a time or several from a
 * single multi-select — upload with bounded concurrency rather than either
 * all twelve requests firing at once or one photo waiting on the last.
 *
 * Plain promises and a counter, no timers or external state, so it is
 * unit-testable synchronously under Node.
 */
export function createUploadQueue(concurrency: number): UploadQueue {
  let active = 0;
  const waiting: Array<() => void> = [];

  function release(): void {
    active -= 1;
    const resume = waiting.shift();
    if (resume) resume();
  }

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
