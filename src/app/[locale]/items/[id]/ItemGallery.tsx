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

/** Used when a row predates width/height (API.md: layout metadata only). */
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
 * A client component because switching the hero photo and opening the
 * lightbox are both interactions with no reason to round-trip the server —
 * the images themselves already came down with the page.
 */
export function ItemGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations('itemDetail.gallery');
  const [selected, setSelected] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
  const aspectRatio =
    current.width && current.height
      ? `${current.width} / ${current.height}`
      : FALLBACK_ASPECT_RATIO;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={t('openFullSize')}
        className="relative block w-full overflow-hidden rounded bg-neutral-100"
        style={{ aspectRatio }}
      >
        {current.blurhash && (
          <BlurhashCanvas hash={current.blurhash} className="absolute inset-0 h-full w-full" />
        )}
        <Image
          key={heroSrc}
          src={heroSrc}
          alt={t('photoAlt', { title })}
          fill
          sizes="(min-width: 768px) 768px, 100vw"
          className="object-cover"
          priority={selected === 0}
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
            style={{ aspectRatio }}
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
