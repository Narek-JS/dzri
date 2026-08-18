'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Combobox } from '@/components/ui/Combobox';
import { Notice } from '@/components/ui/Notice';
import { Link } from '@/i18n/navigation';
import { buildCategoryGroups } from '@/lib/categoryGroups';
import { buildDistrictGroups } from '@/lib/districtGroups';
import {
  ApiClientError,
  api,
  apiErrorMessageKey,
  type Category,
  type CreateItemImage,
  type District,
  type ItemLocale,
} from '@/lib/api/client';
import {
  ImagePrepareError,
  ImageUploadError,
  MAX_CONCURRENT_UPLOADS,
  createUploadQueue,
  prepareImage,
  uploadPreparedImage,
  type UploadedImage,
  type UploadQueue,
} from '@/lib/images';

import { PhotoTile, type PhotoStatus } from './PhotoTile';

import type { ApiErrorCode } from '@/lib/http';

// API.md: 1-6 images, title 3-100, description/pickupNotes are optional
// with a max length. Not imported from a schema module — the create-item
// route's Zod schema lives server-side and has no reason to ship to the
// browser.
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 6;
const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const PICKUP_NOTES_MAX_LENGTH = 300;

const ITEM_LOCALES: readonly ItemLocale[] = ['hy', 'ru', 'en'];

const EMPTY_LOCALIZED_TEXT: Record<ItemLocale, string> = { hy: '', ru: '', en: '' };

type Condition = 'working' | 'needs_repair' | 'for_parts';
const CONDITIONS: readonly Condition[] = ['working', 'needs_repair', 'for_parts'];
const CONDITION_LABEL_KEYS: Record<Condition, string> = {
  working: 'createItem.condition.working',
  needs_repair: 'createItem.condition.needsRepair',
  for_parts: 'createItem.condition.forParts',
};
// Matches the `condition` column's own default (schema.sql) — applied here
// when the giver leaves Condition unselected, since it's not required in
// the UI.
const DEFAULT_CONDITION: Condition = 'working';
const OTHER_CATEGORY_SLUG = 'other';

type LocalizedRef = { nameHy: string; nameRu: string; nameEn: string };

function localizedName(ref: LocalizedRef, locale: string): string {
  if (locale === 'ru') return ref.nameRu;
  if (locale === 'en') return ref.nameEn;
  return ref.nameHy;
}

type PhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: PhotoStatus;
  errorCode: string | null;
  uploaded: UploadedImage | null;
};

/**
 * Client-side pipeline codes (ImagePrepareError, ImageUploadError) are not
 * `ApiErrorCode`s — `apiErrorMessageKey` doesn't know them — so they get
 * their own small map onto `createItem.photos.errors.*`. RATE_LIMITED and
 * UNAUTHORIZED from a failed presign reuse the existing global `errors.*`
 * keys instead of duplicating that copy.
 */
function photoErrorKey(code: string): string {
  switch (code) {
    case 'UNSUPPORTED_TYPE':
      return 'createItem.photos.errors.unsupportedType';
    case 'THUMB_TOO_LARGE':
      return 'createItem.photos.errors.thumbTooLarge';
    case 'DECODE_FAILED':
      return 'createItem.photos.errors.decodeFailed';
    case 'RATE_LIMITED':
      return 'errors.rateLimited';
    case 'UNAUTHORIZED':
      return 'errors.unauthorized';
    default:
      return 'createItem.photos.errors.generic';
  }
}

// An i18n key plus any interpolation params for a client-validation
// message — `t()`'s own param type is awkward to spell outside a `t(...)`
// call site, so this narrows to what these messages actually need.
type FieldMsg = { key: string; params?: Record<string, string | number> } | null;

type Props = { districts: District[]; categories: Category[] };

/**
 * The create-item form. Fields per API.md's `POST /api/items`; photos go
 * through `prepareImage` → `uploadPreparedImage` (src/lib/images) the
 * moment they're added, not on submit — submit only assembles the
 * `{ key, thumbKey, width, height, blurhash }` entries already produced.
 */
export function CreateItemForm({ districts, categories }: Props) {
  const t = useTranslations();
  const locale = useLocale() as ItemLocale;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // Checked (the default): the single title/description/pickup notes below
  // go to titleHy/titleRu/titleEn's or descriptionHy/... or
  // pickupNotesHy/... equivalent for the current locale only, and
  // needsTranslation=true asks an admin to fill the other two in during
  // moderation (PART 2). Unchecked: `multiTitles`/`multiDescriptions`/
  // `multiPickupNotes` hold all three locales directly and nothing is left
  // for an admin to do.
  const [needsTranslation, setNeedsTranslation] = useState(true);
  const [multiTitles, setMultiTitles] = useState<Record<ItemLocale, string>>({
    ...EMPTY_LOCALIZED_TEXT,
  });
  const [multiDescriptions, setMultiDescriptions] = useState<Record<ItemLocale, string>>({
    ...EMPTY_LOCALIZED_TEXT,
  });
  const [multiPickupNotes, setMultiPickupNotes] = useState<Record<ItemLocale, string>>({
    ...EMPTY_LOCALIZED_TEXT,
  });
  const [activeTab, setActiveTab] = useState<ItemLocale>(locale);

  const [submitting, setSubmitting] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);

  const [categoryError, setCategoryError] = useState<ApiErrorCode | null>(null);
  const [districtError, setDistrictError] = useState<ApiErrorCode | null>(null);
  const [imagesError, setImagesError] = useState<ApiErrorCode | null>(null);
  const [bodyError, setBodyError] = useState<ApiErrorCode | null>(null);
  const [formError, setFormError] = useState<ApiErrorCode | null>(null);

  // Client-side validation layer, checked on submit — separate from the
  // ApiErrorCode states above, which only ever come from the server. Each
  // holds an i18n key (plus any interpolation params) rather than a
  // translated string, so the message is re-resolved on every render if
  // the locale changes.
  const [titleFieldError, setTitleFieldError] = useState<FieldMsg>(null);
  const [multiTitleFieldErrors, setMultiTitleFieldErrors] = useState<
    Partial<Record<ItemLocale, FieldMsg>>
  >({});
  const [districtFieldError, setDistrictFieldError] = useState<FieldMsg>(null);
  const [photosFieldError, setPhotosFieldError] = useState<FieldMsg>(null);
  // On a failed validation, handleSubmit stores the first invalid field's
  // DOM id here and bumps `scrollTick` so the effect below re-runs and
  // scrolls to it — a ref rather than state for the id itself, since the
  // effect only needs to read it once (not re-render on it), and doing the
  // scroll as a plain read avoids setState-in-effect cascading renders.
  const scrollTargetRef = useRef<string | null>(null);
  const [scrollTick, setScrollTick] = useState(0);

  // Lazily created once and reused for the component's lifetime, so photos
  // added across several selections still share one bounded queue rather
  // than each getting its own.
  const uploadQueueRef = useRef<UploadQueue | null>(null);
  function getUploadQueue(): UploadQueue {
    if (uploadQueueRef.current === null) {
      uploadQueueRef.current = createUploadQueue(MAX_CONCURRENT_UPLOADS);
    }
    return uploadQueueRef.current;
  }

  // Mirrors `photos` so the unmount cleanup effect (which must run only
  // once, with an empty dependency array) can still see the latest object
  // URLs to revoke instead of the stale ones from the first render.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (scrollTick === 0 || scrollTargetRef.current === null) return;
    document
      .getElementById(scrollTargetRef.current)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollTick]);

  function errorText(code: ApiErrorCode): string {
    return t(apiErrorMessageKey(code) as Parameters<typeof t>[0]);
  }

  function fieldMsgText(msg: NonNullable<FieldMsg>): string {
    return t(msg.key as Parameters<typeof t>[0], msg.params);
  }

  function clearErrors() {
    setCategoryError(null);
    setDistrictError(null);
    setImagesError(null);
    setBodyError(null);
    setFormError(null);
  }

  function updatePhoto(id: string, patch: Partial<PhotoItem>) {
    setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));
  }

  async function processPhoto(id: string, file: File): Promise<void> {
    try {
      const prepared = await prepareImage(file);
      updatePhoto(id, { status: 'uploading' });

      // Queued rather than started immediately: bounds how many of these
      // run at once across every photo the form is currently handling, not
      // just the ones from a single selection (API.md: twelve requests for
      // a full six-photo listing, deliberately not fired all at once).
      const uploaded = await getUploadQueue().run(() => uploadPreparedImage(prepared));
      updatePhoto(id, { status: 'done', uploaded });
    } catch (error) {
      const code =
        error instanceof ImagePrepareError || error instanceof ImageUploadError
          ? error.code
          : 'UNKNOWN';
      updatePhoto(id, { status: 'error', errorCode: code });
    }
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    // Otherwise picking the same file again after removing it is a no-op —
    // the input's value already "contains" it and fires no change event.
    event.target.value = '';
    if (selected.length === 0) return;

    const room = Math.max(0, MAX_PHOTOS - photos.length);
    const accepted = selected.slice(0, room);
    const newItems: PhotoItem[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      // The file the browser already holds, previewed immediately — no
      // reason to wait on prepareImage's decode for something already in
      // memory, and it is at least as accurate as either variant it produces.
      previewUrl: URL.createObjectURL(file),
      status: 'preparing',
      errorCode: null,
      uploaded: null,
    }));

    setPhotos((prev) => [...prev, ...newItems]);
    for (const item of newItems) void processPhoto(item.id, item.file);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== id);
    });
  }

  function movePhoto(id: string, direction: -1 | 1) {
    setPhotos((prev) => {
      const index = prev.findIndex((photo) => photo.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  const { groups: categoryGroups, options: categoryOptions } = buildCategoryGroups({
    categories,
    nameOf: (category) => localizedName(category, locale),
    groupNameOf: (category) =>
      localizedName(
        {
          nameHy: category.groupNameHy,
          nameRu: category.groupNameRu,
          nameEn: category.groupNameEn,
        },
        locale,
      ),
    valueOf: (category) => String(category.id),
  });

  const { groups: districtGroups, options: districtOptions } = buildDistrictGroups({
    districts,
    nameOf: (district) => localizedName(district, locale),
    valueOf: (district) => String(district.id),
    yerevanHeading: t('districts.yerevan'),
    allOfMarzLabel: (marz) => t('districts.allOfMarz', { marz }),
  });

  const trimmedTitle = title.trim();

  type Validation = {
    title: FieldMsg;
    multiTitle: Partial<Record<ItemLocale, FieldMsg>>;
    district: FieldMsg;
    images: FieldMsg;
    firstInvalidId: string | null;
    firstInvalidLocale: ItemLocale | null;
  };

  /**
   * Title, Location and Photos are the only fields required in the UI
   * (asterisked labels) — Category and Condition are required by the
   * server's Zod schema too, but rather than block submit on them, the
   * server request below fills in an "other"-category/`working`-condition
   * default when either is left unset, so the UI never nags for them.
   * Description/Pickup notes stay genuinely optional on both sides.
   * Images get their own check — "at least one" plus "every one finished
   * uploading," since submitting mid-upload would otherwise hit the
   * `!photo.uploaded` throw below. Everything else the server might still
   * reject (e.g. the multi-locale description all-or-nothing rule) is
   * intentionally left to the existing bodyError/formError round trip
   * rather than duplicated here.
   */
  function validateForm(): Validation {
    let firstInvalidId: string | null = null;
    let firstInvalidLocale: ItemLocale | null = null;

    function claim(id: string, loc?: ItemLocale) {
      if (firstInvalidId === null) {
        firstInvalidId = id;
        firstInvalidLocale = loc ?? null;
      }
    }

    let titleMsg: FieldMsg = null;
    const multiTitleMsgs: Partial<Record<ItemLocale, FieldMsg>> = {};

    if (needsTranslation) {
      if (trimmedTitle.length === 0) {
        titleMsg = { key: 'createItem.validation.titleRequired' };
        claim('title');
      } else if (trimmedTitle.length < TITLE_MIN_LENGTH) {
        titleMsg = { key: 'createItem.validation.titleTooShort', params: { min: TITLE_MIN_LENGTH } };
        claim('title');
      }
    } else {
      for (const loc of ITEM_LOCALES) {
        const length = multiTitles[loc].trim().length;
        if (length === 0) {
          multiTitleMsgs[loc] = { key: 'createItem.validation.titleRequired' };
          claim(`title-${loc}`, loc);
        } else if (length < TITLE_MIN_LENGTH) {
          multiTitleMsgs[loc] = {
            key: 'createItem.validation.titleTooShort',
            params: { min: TITLE_MIN_LENGTH },
          };
          claim(`title-${loc}`, loc);
        }
      }
    }

    let districtMsg: FieldMsg = null;
    if (districtId === '') {
      districtMsg = { key: 'createItem.validation.districtRequired' };
      claim('district');
    }

    let imagesMsg: FieldMsg = null;
    if (photos.length < MIN_PHOTOS) {
      imagesMsg = { key: 'errors.imagesRequired' };
      claim('photos-note');
    } else if (photos.some((photo) => photo.status !== 'done')) {
      imagesMsg = { key: 'createItem.validation.photosNotReady' };
      claim('photos-note');
    }

    return {
      title: titleMsg,
      multiTitle: multiTitleMsgs,
      district: districtMsg,
      images: imagesMsg,
      firstInvalidId,
      firstInvalidLocale,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const validation = validateForm();
    setTitleFieldError(validation.title);
    setMultiTitleFieldErrors(validation.multiTitle);
    setDistrictFieldError(validation.district);
    setPhotosFieldError(validation.images);

    if (validation.firstInvalidId) {
      if (validation.firstInvalidLocale) setActiveTab(validation.firstInvalidLocale);
      scrollTargetRef.current = validation.firstInvalidId;
      setScrollTick((tick) => tick + 1);
      return;
    }

    clearErrors();
    setSubmitting(true);
    try {
      const images: CreateItemImage[] = photos.map((photo) => {
        if (!photo.uploaded) {
          // validateForm() already requires every photo to be 'done', which
          // is only ever set alongside `uploaded` — this is unreachable.
          throw new Error('Cannot submit: a photo finished without upload data');
        }
        return {
          key: photo.uploaded.key,
          thumbKey: photo.uploaded.thumbKey,
          width: photo.uploaded.width,
          height: photo.uploaded.height,
          blurhash: photo.uploaded.blurhash,
        };
      });

      // Explicit per-locale keys rather than a computed `title${Locale}`
      // lookup — there are only three, and this keeps every field visible
      // and type-checked instead of built through a dynamic property name.
      const textFields = needsTranslation
        ? {
            titleHy: locale === 'hy' ? trimmedTitle : undefined,
            titleRu: locale === 'ru' ? trimmedTitle : undefined,
            titleEn: locale === 'en' ? trimmedTitle : undefined,
            descriptionHy: locale === 'hy' ? description.trim() || undefined : undefined,
            descriptionRu: locale === 'ru' ? description.trim() || undefined : undefined,
            descriptionEn: locale === 'en' ? description.trim() || undefined : undefined,
            pickupNotesHy: locale === 'hy' ? pickupNotes.trim() || undefined : undefined,
            pickupNotesRu: locale === 'ru' ? pickupNotes.trim() || undefined : undefined,
            pickupNotesEn: locale === 'en' ? pickupNotes.trim() || undefined : undefined,
          }
        : {
            titleHy: multiTitles.hy.trim(),
            titleRu: multiTitles.ru.trim(),
            titleEn: multiTitles.en.trim(),
            descriptionHy: multiDescriptions.hy.trim() || undefined,
            descriptionRu: multiDescriptions.ru.trim() || undefined,
            descriptionEn: multiDescriptions.en.trim() || undefined,
            pickupNotesHy: multiPickupNotes.hy.trim() || undefined,
            pickupNotesRu: multiPickupNotes.ru.trim() || undefined,
            pickupNotesEn: multiPickupNotes.en.trim() || undefined,
          };

      // Category and Condition aren't required in the UI, but the server
      // still requires both — default silently to "other"/`working` rather
      // than block submit on fields the giver may not have an opinion on.
      const otherCategory = categories.find((category) => category.slug === OTHER_CATEGORY_SLUG);
      const resolvedCategoryId = categoryId !== '' ? Number(categoryId) : (otherCategory?.id ?? 0);
      const resolvedCondition: Condition = condition !== '' ? condition : DEFAULT_CONDITION;

      const result = await api.items.create({
        ...textFields,
        needsTranslation,
        sourceLocale: locale,
        categoryId: resolvedCategoryId,
        districtId: Number(districtId),
        condition: resolvedCondition,
        images,
      });

      setCreatedItemId(result.id);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'INVALID_CATEGORY') setCategoryError(error.code);
        else if (error.code === 'INVALID_DISTRICT') setDistrictError(error.code);
        else if (error.code === 'IMAGES_REQUIRED' || error.code === 'TOO_MANY_IMAGES') {
          setImagesError(error.code);
        } else if (error.code === 'INVALID_BODY') setBodyError(error.code);
        else setFormError(error.code);
      } else {
        setFormError('INTERNAL');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (createdItemId) {
    return (
      <Notice tone="brand" size="lg" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-brand-strong">{t('createItem.success.title')}</h2>
        <p className="text-sm text-neutral-700">{t('createItem.success.description')}</p>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-brand-strong hover:underline">
            {t('createItem.success.backToFeed')}
          </Link>
          <Link href="/my/items" className="text-brand-strong hover:underline">
            {t('createItem.success.viewMyItems')}
          </Link>
        </div>
      </Notice>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {formError && (
        <p className="text-sm text-red-700" role="alert">
          {errorText(formError)}
        </p>
      )}

      <label className="flex items-center gap-2 text-xs text-neutral-800 sm:text-sm">
        <span className="relative inline-flex shrink-0">
          <input
            type="checkbox"
            checked={needsTranslation}
            onChange={(event) => setNeedsTranslation(event.target.checked)}
            className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-neutral-300 bg-white checked:border-brand-strong checked:bg-brand-strong focus:ring-1 focus:ring-brand-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute inset-0 hidden h-4 w-4 text-white peer-checked:block"
          >
            <path
              d="M4 10.5L8 14.5L16 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {t('createItem.translation.checkboxLabel')}
      </label>

      {needsTranslation ? (
        <>
          <div className="relative flex flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium">
              {t('createItem.title.label')}{' '}
              <span className="text-red-700" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="title"
              type="text"
              minLength={TITLE_MIN_LENGTH}
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            {titleFieldError && (
              <p className="absolute top-full left-0 mt-1 text-xs text-red-700">
                {fieldMsgText(titleFieldError)}
              </p>
            )}
            {bodyError && <p className="text-sm text-red-700">{errorText(bodyError)}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-sm font-medium">
              {t('createItem.description.label')}
            </label>
            <textarea
              id="description"
              rows={4}
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pickupNotes" className="text-sm font-medium">
              {t('createItem.pickupNotes.label')}
            </label>
            <input
              id="pickupNotes"
              type="text"
              maxLength={PICKUP_NOTES_MAX_LENGTH}
              value={pickupNotes}
              onChange={(event) => setPickupNotes(event.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="flex gap-2"
            role="tablist"
            aria-label={t('createItem.translation.tabsLabel')}
          >
            {ITEM_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                role="tab"
                aria-selected={activeTab === loc}
                onClick={() => setActiveTab(loc)}
                className={
                  activeTab === loc
                    ? 'cursor-pointer rounded bg-brand px-3 py-1.5 text-sm font-medium text-neutral-900'
                    : 'cursor-pointer rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700'
                }
              >
                {t(`languageSwitcher.${loc}`)}
              </button>
            ))}
          </div>

          {ITEM_LOCALES.map((loc) => {
            if (activeTab !== loc) return null;
            const titleErr = multiTitleFieldErrors[loc] ?? null;

            return (
              <div key={loc} role="tabpanel" className="flex flex-col gap-4">
                <div className="relative flex flex-col gap-1">
                  <label htmlFor={`title-${loc}`} className="text-sm font-medium">
                    {t('createItem.title.label')}{' '}
                    <span className="text-red-700" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id={`title-${loc}`}
                    type="text"
                    minLength={TITLE_MIN_LENGTH}
                    maxLength={TITLE_MAX_LENGTH}
                    value={multiTitles[loc]}
                    onChange={(event) =>
                      setMultiTitles((prev) => ({ ...prev, [loc]: event.target.value }))
                    }
                    className="rounded border border-neutral-300 px-3 py-2 text-sm"
                  />
                  {titleErr && (
                    <p className="absolute top-full left-0 mt-1 text-xs text-red-700">
                      {fieldMsgText(titleErr)}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={`description-${loc}`} className="text-sm font-medium">
                    {t('createItem.description.label')}
                  </label>
                  <textarea
                    id={`description-${loc}`}
                    rows={4}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    value={multiDescriptions[loc]}
                    onChange={(event) =>
                      setMultiDescriptions((prev) => ({ ...prev, [loc]: event.target.value }))
                    }
                    className="rounded border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor={`pickupNotes-${loc}`} className="text-sm font-medium">
                    {t('createItem.pickupNotes.label')}
                  </label>
                  <input
                    id={`pickupNotes-${loc}`}
                    type="text"
                    maxLength={PICKUP_NOTES_MAX_LENGTH}
                    value={multiPickupNotes[loc]}
                    onChange={(event) =>
                      setMultiPickupNotes((prev) => ({ ...prev, [loc]: event.target.value }))
                    }
                    className="rounded border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            );
          })}

          {bodyError && <p className="text-sm text-red-700">{errorText(bodyError)}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium">
          {t('createItem.category.label')}
        </label>
        <Combobox
          id="category"
          value={categoryId}
          onValueChange={setCategoryId}
          placeholder={t('createItem.category.placeholder')}
          searchPlaceholder={t('combobox.search')}
          emptyText={t('combobox.noResults')}
          groups={categoryGroups}
          options={categoryOptions}
        />
        {categoryError && <p className="text-sm text-red-700">{errorText(categoryError)}</p>}
      </div>

      <div className="relative flex flex-col gap-1">
        <label htmlFor="district" className="text-sm font-medium">
          {t('createItem.district.label')}{' '}
          <span className="text-red-700" aria-hidden="true">
            *
          </span>
        </label>
        <Combobox
          id="district"
          value={districtId}
          onValueChange={setDistrictId}
          placeholder={t('createItem.district.placeholder')}
          searchPlaceholder={t('combobox.search')}
          emptyText={t('combobox.noResults')}
          groups={districtGroups}
          options={districtOptions}
        />
        {districtFieldError && (
          <p className="absolute top-full left-0 mt-1 text-xs text-red-700">
            {fieldMsgText(districtFieldError)}
          </p>
        )}
        {districtError && <p className="text-sm text-red-700">{errorText(districtError)}</p>}
      </div>

      <fieldset id="condition" className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('createItem.condition.label')}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 sm:mt-0">
          {CONDITIONS.map((value) => (
            <label key={value} className="flex items-center gap-1.5 text-sm whitespace-nowrap">
              <span className="relative inline-flex shrink-0">
                <input
                  type="radio"
                  name="condition"
                  value={value}
                  checked={condition === value}
                  onChange={() => setCondition(value)}
                  className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-neutral-300 bg-white checked:border-brand-strong focus:ring-1 focus:ring-brand-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="pointer-events-none absolute inset-0 hidden items-center justify-center peer-checked:flex">
                  <span className="h-2 w-2 rounded-full bg-brand-strong" />
                </span>
              </span>
              {t(CONDITION_LABEL_KEYS[value] as Parameters<typeof t>[0])}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t('createItem.photos.label')}{' '}
          <span className="text-red-700" aria-hidden="true">
            *
          </span>
        </span>
        <p className="text-sm text-neutral-600">{t('createItem.photos.help')}</p>
        <p
          id="photos-note"
          className={`text-xs ${photosFieldError ? 'text-red-700' : 'text-neutral-500'}`}
        >
          {fieldMsgText(photosFieldError ?? { key: 'errors.imagesRequired' })}
        </p>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <PhotoTile
                key={photo.id}
                previewUrl={photo.previewUrl}
                status={photo.status}
                errorMessage={
                  photo.errorCode
                    ? t(photoErrorKey(photo.errorCode) as Parameters<typeof t>[0])
                    : null
                }
                isCover={index === 0}
                canMoveUp={index > 0}
                canMoveDown={index < photos.length - 1}
                onRemove={() => removePhoto(photo.id)}
                onMoveUp={() => movePhoto(photo.id, -1)}
                onMoveDown={() => movePhoto(photo.id, 1)}
              />
            ))}
          </div>
        )}

        {photos.length < MAX_PHOTOS && (
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm">
            {t('createItem.photos.add')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
          </label>
        )}

        {imagesError && <p className="text-sm text-red-700">{errorText(imagesError)}</p>}
      </div>

      <button
        type="submit"
        className="cursor-pointer rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900"
      >
        {t('createItem.submit')}
      </button>
    </form>
  );
}
