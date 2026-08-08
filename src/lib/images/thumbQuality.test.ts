import { describe, expect, it, vi } from 'vitest';

import { ImagePrepareError } from './errors';
import { THUMB_QUALITY_STEPS, encodeUnderCap } from './thumbQuality';

describe('encodeUnderCap', () => {
  it('returns the first encode that already fits, without trying further steps', async () => {
    const encode = vi.fn(async (quality: number | undefined) => ({ size: 1000, quality }));

    const result = await encodeUnderCap(encode, [0.9, 0.7, 0.5], 2000);

    expect(result).toEqual({ size: 1000, quality: 0.9 });
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('keeps reducing quality until a step fits', async () => {
    const sizesByQuality: Record<number, number> = { 0.9: 5000, 0.7: 3000, 0.5: 1500 };
    const encode = vi.fn(async (quality: number | undefined) => ({
      size: sizesByQuality[quality as number],
    }));

    const result = await encodeUnderCap(encode, [0.9, 0.7, 0.5], 2000);

    expect(result.size).toBe(1500);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it('treats the cap as inclusive — a result exactly at maxBytes is accepted', async () => {
    const encode = vi.fn(async () => ({ size: 2000 }));

    const result = await encodeUnderCap(encode, [0.9], 2000);

    expect(result.size).toBe(2000);
  });

  it('throws ImagePrepareError with code THUMB_TOO_LARGE when every step is over the cap', async () => {
    const encode = vi.fn(async () => ({ size: 9000 }));

    await expect(encodeUnderCap(encode, [0.9, 0.7, 0.5], 2000)).rejects.toMatchObject({
      code: 'THUMB_TOO_LARGE',
    });
    await expect(encodeUnderCap(encode, [0.9, 0.7, 0.5], 2000)).rejects.toBeInstanceOf(
      ImagePrepareError,
    );
    expect(encode).toHaveBeenCalledTimes(6); // 3 + 3, one call per step per assertion above
  });

  it('makes exactly one attempt for a single-step list (the PNG case, which has no quality lever)', async () => {
    const encode = vi.fn(async () => ({ size: 9000 }));

    await expect(encodeUnderCap(encode, [undefined], 2000)).rejects.toMatchObject({
      code: 'THUMB_TOO_LARGE',
    });
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('exports quality steps that are strictly decreasing', () => {
    for (let i = 1; i < THUMB_QUALITY_STEPS.length; i++) {
      expect(THUMB_QUALITY_STEPS[i]).toBeLessThan(THUMB_QUALITY_STEPS[i - 1]);
    }
  });
});
