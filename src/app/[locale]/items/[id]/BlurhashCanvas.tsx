'use client';

import { useEffect, useRef } from 'react';

import { decode } from 'blurhash';

/**
 * Small on purpose: this is a placeholder painted while a real image loads,
 * not something anyone looks at closely, and `decode`'s cost scales with
 * width × height. CSS stretches the canvas to fill its container.
 */
const DECODE_SIZE = 32;

/**
 * Paints a blurhash string onto a `<canvas>` that fills its container.
 * `decode(blurhash, width, height, punch?)` returns RGBA pixel data —
 * exactly what `ImageData` expects — per the blurhash package's own type
 * declarations (there is no further documentation on the signature).
 *
 * Client-only: `decode` and `CanvasRenderingContext2D` are both
 * browser-only, so this can never run during the server render that
 * produces the item detail page.
 */
export function BlurhashCanvas({ hash, className }: { hash: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;

    let pixels: Uint8ClampedArray;
    try {
      pixels = decode(hash, DECODE_SIZE, DECODE_SIZE);
    } catch {
      // A malformed hash (never expected from our own pipeline, but this
      // reads whatever is in the database) just leaves the canvas blank
      // rather than crashing the gallery around it.
      return;
    }

    const imageData = context.createImageData(DECODE_SIZE, DECODE_SIZE);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  }, [hash]);

  return (
    <canvas
      ref={canvasRef}
      width={DECODE_SIZE}
      height={DECODE_SIZE}
      aria-hidden="true"
      className={className}
    />
  );
}
