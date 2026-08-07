import { describe, expect, it } from 'vitest';

import { THUMB_LONGEST_EDGE, blurhashComponents, scaleToFit } from './dimensions';

describe('scaleToFit', () => {
  it('scales a landscape image by its width', () => {
    expect(scaleToFit({ width: 4000, height: 3000 }, 400)).toEqual({ width: 400, height: 300 });
  });

  it('scales a portrait image by its height', () => {
    expect(scaleToFit({ width: 3000, height: 4000 }, 400)).toEqual({ width: 300, height: 400 });
  });

  it('leaves an image already inside the bound alone, rather than upscaling it', () => {
    // Upscaling would add bytes and no detail.
    expect(scaleToFit({ width: 320, height: 200 }, 400)).toEqual({ width: 320, height: 200 });
  });

  it('treats the bound as an exact fit, not a threshold to cross', () => {
    expect(scaleToFit({ width: 400, height: 400 }, 400)).toEqual({ width: 400, height: 400 });
  });

  it('preserves the aspect ratio within a pixel of rounding', () => {
    const source = { width: 4032, height: 3024 };
    const scaled = scaleToFit(source, THUMB_LONGEST_EDGE);

    expect(Math.abs(scaled.width / scaled.height - source.width / source.height)).toBeLessThan(
      0.01,
    );
  });

  it('never produces a zero side for an extreme panorama', () => {
    // 8000x3 scaled to 400 would round the short side to 0, and a zero-width
    // canvas throws.
    const scaled = scaleToFit({ width: 8000, height: 3 }, 400);

    expect(scaled.width).toBe(400);
    expect(scaled.height).toBeGreaterThanOrEqual(1);
  });

  it('never produces a zero side for a 1px source', () => {
    expect(scaleToFit({ width: 1, height: 1 }, 400)).toEqual({ width: 1, height: 1 });
  });
});

describe('blurhashComponents', () => {
  it('gives the extra component to the wider axis', () => {
    expect(blurhashComponents({ width: 1600, height: 900 })).toEqual({ x: 4, y: 3 });
  });

  it('gives the extra component to the taller axis', () => {
    expect(blurhashComponents({ width: 900, height: 1600 })).toEqual({ x: 3, y: 4 });
  });

  it('is square for a square image', () => {
    expect(blurhashComponents({ width: 800, height: 800 })).toEqual({ x: 4, y: 4 });
  });

  it('stays inside the 1-9 the format allows', () => {
    for (const size of [
      { width: 8000, height: 1 },
      { width: 1, height: 8000 },
      { width: 1, height: 1 },
    ]) {
      const { x, y } = blurhashComponents(size);

      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(9);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(9);
    }
  });
});
