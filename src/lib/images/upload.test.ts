import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, api } from '@/lib/api/client';

import { ImageUploadError, createUploadQueue, uploadPreparedImage } from './upload';

import type { PreparedImage } from './prepare';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    api: { ...actual.api, images: { presign: vi.fn() } },
  };
});

function fakePrepared(overrides: Partial<PreparedImage> = {}): PreparedImage {
  return {
    contentType: 'image/jpeg',
    original: new Blob(['original-bytes'], { type: 'image/jpeg' }),
    thumb: new Blob(['thumb-bytes'], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    ...overrides,
  };
}

describe('createUploadQueue', () => {
  it('runs tasks up to the concurrency limit but never past it', async () => {
    const queue = createUploadQueue(2);
    let active = 0;
    let maxActive = 0;

    function task(): Promise<void> {
      return queue.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      });
    }

    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxActive).toBe(2);
  });

  it('runs every task exactly once and propagates each result', async () => {
    const queue = createUploadQueue(2);

    const results = await Promise.all([1, 2, 3, 4].map((n) => queue.run(async () => n * 10)));

    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('propagates a rejection without blocking tasks still queued', async () => {
    const queue = createUploadQueue(1);

    const first = queue.run(async () => {
      throw new Error('boom');
    });
    const second = queue.run(async () => 'ok');

    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });
});

describe('uploadPreparedImage', () => {
  const presign = vi.mocked(api.images.presign);

  afterEach(() => {
    vi.unstubAllGlobals();
    presign.mockReset();
  });

  it('presigns both variants and PUTs each blob with a matching Content-Type', async () => {
    presign.mockImplementation(async ({ variant }) => ({
      uploadUrl: `https://r2.example/${variant}`,
      key: `uploads/u1/${variant}.jpg`,
      publicUrl: `https://pub.example/${variant}.jpg`,
    }));

    const puts: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        puts.push({ url, init });
        return new Response(null, { status: 200 });
      }),
    );

    const prepared = fakePrepared();
    const result = await uploadPreparedImage(prepared);

    expect(presign).toHaveBeenCalledTimes(2);
    expect(presign).toHaveBeenCalledWith({
      contentType: 'image/jpeg',
      contentLength: prepared.original.size,
      variant: 'original',
    });
    expect(presign).toHaveBeenCalledWith({
      contentType: 'image/jpeg',
      contentLength: prepared.thumb.size,
      variant: 'thumb',
    });

    expect(puts).toHaveLength(2);
    for (const { init } of puts) {
      expect(init.method).toBe('PUT');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
    }

    expect(result).toEqual({
      key: 'uploads/u1/original.jpg',
      thumbKey: 'uploads/u1/thumb.jpg',
      width: 1600,
      height: 1200,
      blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    });
  });

  it('maps a RATE_LIMITED presign failure to a typed ImageUploadError carrying retryAfterSeconds', async () => {
    presign.mockRejectedValue(new ApiClientError(429, 'RATE_LIMITED', 'log only', 42));

    const error: unknown = await uploadPreparedImage(fakePrepared()).catch((e) => e);

    expect(error).toBeInstanceOf(ImageUploadError);
    expect((error as ImageUploadError).code).toBe('RATE_LIMITED');
    expect((error as ImageUploadError).retryAfterSeconds).toBe(42);
  });

  it('throws a typed PUT_FAILED error when R2 rejects the upload', async () => {
    presign.mockResolvedValue({
      uploadUrl: 'https://r2.example/x',
      key: 'uploads/u1/x.jpg',
      publicUrl: 'https://pub.example/x.jpg',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );

    const error: unknown = await uploadPreparedImage(fakePrepared()).catch((e) => e);

    expect(error).toBeInstanceOf(ImageUploadError);
    expect((error as ImageUploadError).code).toBe('PUT_FAILED');
  });
});
