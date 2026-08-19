'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path
        d={direction === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One slide inside a scroll-snap track: the blurhash placeholder underneath
 * until this exact `src` has fired `onLoad` (tracked in the shared
 * `loadedSrcs` set so hero and lightbox slides don't fight over one
 * boolean), then the real photo, `object-contain` so nothing crops.
 */
function Slide({
  src,
  alt,
  blurhash,
  loaded,
  onLoad,
  priority,
  sizes,
}: {
  src: string;
  alt: string;
  blurhash: string | null;
  loaded: boolean;
  onLoad: () => void;
  priority: boolean;
  sizes: string;
}) {
  return (
    <div className="relative h-full w-full shrink-0 snap-start snap-always">
      {blurhash && !loaded && (
        <BlurhashCanvas hash={blurhash} className="absolute inset-0 h-full w-full" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className="object-contain"
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        onLoad={onLoad}
      />
    </div>
  );
}

/**
 * Photo gallery for the item detail page: a swipeable hero slider with a
 * synced thumbnail strip below it, and a tap-to-enlarge lightbox that is
 * itself a swipeable slider over the full-size originals.
 *
 * API.md is explicit about which variant goes where: "`thumbUrl` for the
 * gallery strip and the first paint, `url` for the full-size view." Every
 * hero slide therefore renders `thumbUrl`, and only the lightbox — opened by
 * tapping a slide — ever requests `url`. `thumbUrl` is null on rows from
 * before the two-variant pipeline, so every read falls back to `url`.
 *
 * Both sliders are plain CSS scroll-snap tracks, not a carousel library:
 * every slide is mounted at once (`overflow-x-auto` + `snap-x snap-mandatory`
 * on the track, `snap-start` on each slide), which is what makes touch drag,
 * trackpad swipe and two-finger scroll all work for free — the browser owns
 * the gesture, so there's no pointer-tracking code to fight it. `selected`
 * is kept in sync in both directions: `goToIndex` drives the scroller
 * (arrow buttons, thumbnail clicks, arrow keys), and an `onScroll` handler
 * — rAF-throttled so it runs at most once per frame — derives `selected`
 * back from `scrollLeft` while the user swipes freely, so the thumbnail
 * strip and counter never drift from whatever is actually centered.
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
 * The lightbox has no such constraint (it's a fixed overlay, nothing below
 * it to shift), so its box still follows the selected photo's own ratio.
 *
 * A client component because swiping, opening the lightbox, and navigating
 * within it are all interactions with no reason to round-trip the server —
 * the images themselves already came down with the page.
 */
export function ItemGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations('itemDetail.gallery');
  const [selected, setSelected] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Every src whose `onLoad` has fired, hero and lightbox variants alike —
  // a set rather than a single boolean so each slide's placeholder tracks
  // only itself.
  const [loadedSrcs, setLoadedSrcs] = useState<ReadonlySet<string>>(() => new Set());

  const heroTrackRef = useRef<HTMLDivElement>(null);
  const lightboxTrackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const heroRafRef = useRef<number | null>(null);
  const lightboxRafRef = useRef<number | null>(null);

  const markLoaded = useCallback((src: string) => {
    setLoadedSrcs((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);

  const goToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const clamped = clampIndex(index, images.length);
      setSelected(clamped);
      const heroSlide = heroTrackRef.current?.children[clamped];
      if (heroSlide instanceof HTMLElement) {
        heroSlide.scrollIntoView({ behavior, block: 'nearest', inline: 'start' });
      }
      const lightboxSlide = lightboxTrackRef.current?.children[clamped];
      if (lightboxSlide instanceof HTMLElement) {
        lightboxSlide.scrollIntoView({ behavior, block: 'nearest', inline: 'start' });
      }
    },
    [images.length],
  );

  // Derives `selected` from wherever the track actually is, so a manual
  // swipe (not a button/keyboard press) still keeps the thumbnail strip and
  // counter honest. rAF-throttled: `scroll` fires far more often than the
  // index can change.
  const handleHeroScroll = useCallback(() => {
    if (heroRafRef.current !== null) return;
    heroRafRef.current = requestAnimationFrame(() => {
      heroRafRef.current = null;
      const el = heroTrackRef.current;
      if (!el || el.clientWidth === 0) return;
      setSelected(clampIndex(Math.round(el.scrollLeft / el.clientWidth), images.length));
    });
  }, [images.length]);

  const handleLightboxScroll = useCallback(() => {
    if (lightboxRafRef.current !== null) return;
    lightboxRafRef.current = requestAnimationFrame(() => {
      lightboxRafRef.current = null;
      const el = lightboxTrackRef.current;
      if (!el || el.clientWidth === 0) return;
      setSelected(clampIndex(Math.round(el.scrollLeft / el.clientWidth), images.length));
    });
  }, [images.length]);

  useEffect(
    () => () => {
      if (heroRafRef.current !== null) cancelAnimationFrame(heroRafRef.current);
      if (lightboxRafRef.current !== null) cancelAnimationFrame(lightboxRafRef.current);
    },
    [],
  );

  // Keeps the active thumbnail scrolled into view as `selected` changes,
  // regardless of whether the change came from the hero, the lightbox, or
  // the thumbnail strip itself.
  useEffect(() => {
    thumbRefs.current[selected]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selected]);

  // The lightbox mounts fresh on every open, always at scrollLeft 0 — jump
  // it straight to the hero's current slide before paint (no CSS
  // `scroll-behavior: smooth` is applied to the track, so `'auto'` here is
  // an instant native jump, not an animation) rather than letting the
  // viewer watch it fly in from the first photo.
  useLayoutEffect(() => {
    if (!lightboxOpen) return;
    const slide = lightboxTrackRef.current?.children[selected];
    if (slide instanceof HTMLElement) {
      slide.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'start' });
    }
    // Only on open — `selected` changing while already open is normal
    // in-lightbox navigation and must not re-trigger this jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightboxOpen(false);
      if (event.key === 'ArrowLeft') goToIndex(selected - 1);
      if (event.key === 'ArrowRight') goToIndex(selected + 1);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, selected, goToIndex]);

  if (images.length === 0) return null;

  const current = images[selected] ?? images[0];
  const hasMultiple = images.length > 1;
  const lightboxAspectRatio =
    current.width && current.height
      ? `${current.width} / ${current.height}`
      : FALLBACK_ASPECT_RATIO;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative aspect-square w-full overflow-hidden rounded bg-neutral-100"
        role="group"
        aria-roledescription="carousel"
        aria-label={title}
      >
        <div
          ref={heroTrackRef}
          onScroll={handleHeroScroll}
          className="flex h-full w-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => {
            const src = image.thumbUrl ?? image.url;
            return (
              <button
                key={image.url}
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={t('openFullSize')}
                aria-roledescription="slide"
                className="relative h-full w-full shrink-0 cursor-pointer snap-start snap-always"
              >
                {image.blurhash && !loadedSrcs.has(src) && (
                  <BlurhashCanvas
                    hash={image.blurhash}
                    className="absolute inset-0 h-full w-full"
                  />
                )}
                <Image
                  src={src}
                  alt={t('photoAlt', { title })}
                  fill
                  sizes="(min-width: 768px) 768px, 100vw"
                  className="object-contain"
                  priority={index === 0}
                  loading={index === 0 ? undefined : 'lazy'}
                  onLoad={() => markLoaded(src)}
                />
              </button>
            );
          })}
        </div>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() => goToIndex(selected - 1)}
              disabled={selected === 0}
              aria-label={t('previous')}
              className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-900/50 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => goToIndex(selected + 1)}
              disabled={selected === images.length - 1}
              aria-label={t('next')}
              className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-900/50 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronIcon direction="right" />
            </button>
            <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-neutral-900/50 px-2 py-0.5 text-xs text-white">
              {t('counter', { current: selected + 1, total: images.length })}
            </span>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              ref={(el) => {
                thumbRefs.current[index] = el;
              }}
              type="button"
              onClick={() => goToIndex(index)}
              aria-label={t('photoThumbnailAlt', { index: index + 1 })}
              aria-current={index === selected}
              className={`relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded border ${
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
            className="absolute top-4 right-4 cursor-pointer text-2xl leading-none text-white"
          >
            ×
          </button>
          <div
            className="relative max-h-full w-full max-w-3xl"
            style={{ aspectRatio: lightboxAspectRatio }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              ref={lightboxTrackRef}
              onScroll={handleLightboxScroll}
              className="flex h-full w-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
            >
              {images.map((image, index) => (
                <Slide
                  key={image.url}
                  src={image.url}
                  alt={t('photoAlt', { title })}
                  blurhash={image.blurhash}
                  loaded={loadedSrcs.has(image.url)}
                  onLoad={() => markLoaded(image.url)}
                  priority={index === selected}
                  sizes="90vw"
                />
              ))}
            </div>

            {hasMultiple && (
              <>
                <button
                  type="button"
                  onClick={() => goToIndex(selected - 1)}
                  disabled={selected === 0}
                  aria-label={t('previous')}
                  className="absolute top-1/2 left-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-900/50 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  type="button"
                  onClick={() => goToIndex(selected + 1)}
                  disabled={selected === images.length - 1}
                  aria-label={t('next')}
                  className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-900/50 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0"
                >
                  <ChevronIcon direction="right" />
                </button>
                <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/50 px-2 py-0.5 text-xs text-white">
                  {t('counter', { current: selected + 1, total: images.length })}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
