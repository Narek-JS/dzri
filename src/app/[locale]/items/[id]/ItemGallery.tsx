'use client';

import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { BlurhashCanvas } from './BlurhashCanvas';

export type GalleryImage = {
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
};

/**
 * Used only by the lightbox, whose own aspect ratio may follow the photo:
 * it is a fixed-position overlay, so resizing it never moves page content.
 * Falls back for a row that predates width/height (API.md: layout metadata
 * only).
 */
const FALLBACK_ASPECT_RATIO = '4 / 3';

/**
 * Photo gallery for the item detail page: a hero image with a thumbnail
 * strip below it, and a tap-to-enlarge lightbox for the full-size original.
 *
 * API.md is explicit about which variant goes where: "`thumbUrl` for the
 * gallery strip and the first paint, `url` for the full-size view." The
 * hero therefore renders `thumbUrl` at every selection — that covers both
 * "the strip" and "the first paint" — and only the lightbox, opened by
 * tapping the hero, ever requests `url`. `thumbUrl` is null on rows from
 * before the two-variant pipeline, so every read falls back to `url`.
 *
 * The hero's box is a fixed `aspect-square` — not derived from whichever
 * photo is selected. It used to be (`style={{ aspectRatio }}` off the
 * current image's stored width/height), which meant every thumbnail click
 * resized the box and shifted everything below it: correct on first paint,
 * wrong the moment the viewer interacts. A stable box is the fix, and
 * square is the specific shape because (1) it already reads as this app's
 * language for a photo slot — PhotoTile.tsx uses the same class for the
 * create-item tiles — and (2) on a phone-width viewport it caps the hero's
 * height at the viewport's width, where a portrait-biased ratio would run
 * taller than the screen for a landscape photo's letterbox gutters, or a
 * landscape-biased one would do the same sideways for a portrait photo.
 *
 * A mismatched photo is `object-contain`, not `object-cover`: the whole
 * photo stays visible, gutters open up on whichever axis is shorter. Those
 * gutters must not stay the blurhash forever — that reads as a stuck
 * loading state — so the placeholder is unmounted the moment the real
 * image's `onLoad` fires for the currently-selected source, leaving the
 * container's own neutral background as the resting gutter color.
 *
 * A client component because switching the hero photo and opening the
 * lightbox are both interactions with no reason to round-trip the server —
 * the images themselves already came down with the page.
 */
export function ItemGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations('itemDetail.gallery');
  const [selected, setSelected] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // The src whose `onLoad` most recently fired. Compared against the current
  // heroSrc rather than a plain boolean, so switching to a photo the browser
  // has not cached yet (or has evicted) correctly shows the blurhash again
  // instead of carrying over the previous photo's "loaded" state.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightboxOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  if (images.length === 0) return null;

  const current = images[selected] ?? images[0];
  const heroSrc = current.thumbUrl ?? current.url;
  const heroLoaded = loadedSrc === heroSrc;
  const lightboxAspectRatio =
    current.width && current.height
      ? `${current.width} / ${current.height}`
      : FALLBACK_ASPECT_RATIO;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={t('openFullSize')}
        className="relative block aspect-square w-full overflow-hidden rounded bg-neutral-100"
      >
        {current.blurhash && !heroLoaded && (
          <BlurhashCanvas hash={current.blurhash} className="absolute inset-0 h-full w-full" />
        )}
        <Image
          key={heroSrc}
          src={heroSrc}
          alt={t('photoAlt', { title })}
          fill
          sizes="(min-width: 768px) 768px, 100vw"
          className="object-contain"
          priority={selected === 0}
          onLoad={() => setLoadedSrc(heroSrc)}
        />
      </button>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={t('photoThumbnailAlt', { index: index + 1 })}
              aria-current={index === selected}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded border ${
                index === selected ? 'border-brand-strong' : 'border-neutral-300'
              }`}
            >
              <Image
                src={image.thumbUrl ?? image.url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label={t('close')}
            className="absolute top-4 right-4 text-2xl leading-none text-white"
          >
            ×
          </button>
          <div
            className="relative max-h-full w-full max-w-3xl"
            style={{ aspectRatio: lightboxAspectRatio }}
            onClick={(event) => event.stopPropagation()}
          >
            {current.blurhash && (
              <BlurhashCanvas hash={current.blurhash} className="absolute inset-0 h-full w-full" />
            )}
            <Image
              src={current.url}
              alt={t('photoAlt', { title })}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
