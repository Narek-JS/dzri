'use client';

import { useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';

import { apiErrorMessageKey } from '@/lib/api/client';
import { relativeTimeMessage } from '@/lib/relativeTime';

import type { ApproveItemTranslations, ItemLocale, PendingItem } from '@/lib/api/client';
import type { ApiErrorCode } from '@/lib/http';
import type { ItemCondition } from '@/db/schema';

const CONDITION_LABEL_KEYS: Record<ItemCondition, string> = {
  working: 'createItem.condition.working',
  needs_repair: 'createItem.condition.needsRepair',
  for_parts: 'createItem.condition.forParts',
};

/** API.md: reject's `reason` is 5–500 chars, trimmed. Enforced here too, so a
 * reviewer sees why the button is disabled before they ever submit. */
const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

/** API.md: title is 3–100 chars, description max 2000 — the same rule POST
 * /api/items enforces, enforced here too for the same reason as the reject
 * reason above. */
const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;

const ITEM_LOCALES: readonly ItemLocale[] = ['hy', 'ru', 'en'];

type LocalizedRef = { nameHy: string; nameRu: string; nameEn: string };

function localizedName(ref: LocalizedRef, locale: string): string {
  if (locale === 'ru') return ref.nameRu;
  if (locale === 'en') return ref.nameEn;
  return ref.nameHy;
}

/** Raw per-locale lookup, no fallback — `null` here means "not translated yet". */
function textForLocale(
  hy: string | null,
  ru: string | null,
  en: string | null,
  locale: ItemLocale,
): string | null {
  if (locale === 'ru') return ru;
  if (locale === 'en') return en;
  return hy;
}

function titleKey(locale: ItemLocale): 'titleHy' | 'titleRu' | 'titleEn' {
  if (locale === 'ru') return 'titleRu';
  if (locale === 'en') return 'titleEn';
  return 'titleHy';
}

function descriptionKey(locale: ItemLocale): 'descriptionHy' | 'descriptionRu' | 'descriptionEn' {
  if (locale === 'ru') return 'descriptionRu';
  if (locale === 'en') return 'descriptionEn';
  return 'descriptionHy';
}

type Props = {
  item: PendingItem;
  /**
   * The reference instant "submitted ago" is measured against. Passed down
   * from `ModerationQueue` rather than read here via `new Date()` — see
   * that component's doc comment for why a shared, stable value matters.
   */
  now: Date;
  /** True while this item's own approve/reject request is in flight. */
  busy: boolean;
  errorCode: ApiErrorCode | null;
  /**
   * Carries the missing locales' translations when `item.needsTranslation`
   * is true and is `undefined` otherwise — mirrors exactly what
   * `POST /api/admin/items/[id]/approve` accepts (API.md).
   */
  onApprove: (translations?: ApproveItemTranslations) => void;
  onReject: (reason: string) => void;
};

/**
 * One row in the moderation queue: every photo, the full listing text, and
 * the giver's prior record — everything PART 2 asks for, because a
 * reviewer who has to open a second page to see a photo clearly is a
 * reviewer who reviews slower, and speed is the whole point (DECISIONS.md,
 * 2026-07-31).
 *
 * Title and description come off `item.title{Hy,Ru,En}`/
 * `item.description{Hy,Ru,En}` — the raw per-locale columns, not resolved to
 * one string, since this card (unlike every public-facing view) needs to
 * know exactly which locales are missing. The card heading always shows
 * `item.sourceLocale`'s text, since that column is the one guaranteed
 * filled regardless of `needsTranslation`.
 *
 * When `needsTranslation` is true, the card grows a translation section:
 * one required input per missing title, and one required textarea per
 * missing description — only when the source locale actually has a
 * description to translate (task PART 4). Approve is disabled until every
 * one of those is filled, the same gating shape reject's reason textarea
 * already uses on this same card, just wired to a different condition.
 *
 * Images. `GET /api/admin/items/pending` returns `images` as plain URLs —
 * the originals, with no thumb variant, no dimensions and no blurhash
 * (API.md). Rendered here through `next/image` anyway, at a fixed small
 * display size: Next's image optimizer still resizes what it serves to the
 * browser, so the admin's own downloaded bytes stay small even though the
 * *source* fetch is the full original. That is a real egress cost, but a
 * bounded and rare one — one admin, working a queue that is explicitly not
 * meant to scale — set against a reviewer who cannot judge a rejection-
 * worthy photo without seeing it clearly. Rejecting an out-of-focus photo
 * is the example PART 2 itself gives for why "not just the first" matters.
 *
 * Approve is one tap when nothing needs translating, no confirmation (PART
 * 3: a reviewer working a queue will not confirm every row). Reject opens
 * an inline form instead of acting immediately, because it needs a reason —
 * the copy next to the textarea says the reason is shown to the giver
 * verbatim, since a reviewer who thinks they're leaving an internal note
 * will write the wrong thing.
 */
export function PendingItemCard({ item, now, busy, errorCode, onApprove, onReject }: Props) {
  const t = useTranslations();
  const locale = useLocale();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [titleDrafts, setTitleDrafts] = useState<Partial<Record<ItemLocale, string>>>({});
  const [descriptionDrafts, setDescriptionDrafts] = useState<Partial<Record<ItemLocale, string>>>(
    {},
  );

  const trimmedLength = reason.trim().length;
  const reasonValid = trimmedLength >= MIN_REASON_LENGTH && trimmedLength <= MAX_REASON_LENGTH;

  const sourceTitle =
    textForLocale(item.titleHy, item.titleRu, item.titleEn, item.sourceLocale) ?? '';
  const sourceDescription = textForLocale(
    item.descriptionHy,
    item.descriptionRu,
    item.descriptionEn,
    item.sourceLocale,
  );

  const missingTitleLocales = item.needsTranslation
    ? ITEM_LOCALES.filter(
        (loc) => textForLocale(item.titleHy, item.titleRu, item.titleEn, loc) === null,
      )
    : [];
  // Only the source description needs a home in the other locales — an item
  // posted with no description at all has nothing to translate.
  const missingDescriptionLocales =
    item.needsTranslation && sourceDescription !== null
      ? ITEM_LOCALES.filter(
          (loc) =>
            textForLocale(item.descriptionHy, item.descriptionRu, item.descriptionEn, loc) === null,
        )
      : [];

  const translationsComplete =
    !item.needsTranslation ||
    (missingTitleLocales.every((loc) => {
      const length = (titleDrafts[loc] ?? '').trim().length;
      return length >= TITLE_MIN_LENGTH && length <= TITLE_MAX_LENGTH;
    }) &&
      missingDescriptionLocales.every((loc) => {
        const length = (descriptionDrafts[loc] ?? '').trim().length;
        return length > 0 && length <= DESCRIPTION_MAX_LENGTH;
      }));

  function openReject() {
    setReason('');
    setRejecting(true);
  }

  function cancelReject() {
    setRejecting(false);
    setReason('');
  }

  function submitReject() {
    if (!reasonValid) return;
    onReject(reason.trim());
  }

  function submitApprove() {
    if (!translationsComplete) return;
    if (!item.needsTranslation) {
      onApprove();
      return;
    }

    const translations: ApproveItemTranslations = {};
    for (const loc of missingTitleLocales) {
      translations[titleKey(loc)] = (titleDrafts[loc] ?? '').trim();
    }
    for (const loc of missingDescriptionLocales) {
      translations[descriptionKey(loc)] = (descriptionDrafts[loc] ?? '').trim();
    }
    onApprove(translations);
  }

  const submittedAgo = relativeTimeMessage(new Date(item.createdAt), now);

  return (
    <li className="flex flex-col gap-3 rounded border border-neutral-300 p-4">
      {item.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {item.images.map((url, index) => (
            <div
              key={url}
              className="relative h-32 w-32 shrink-0 overflow-hidden rounded bg-neutral-100"
            >
              <Image
                src={url}
                alt={t('itemDetail.gallery.photoThumbnailAlt', { index: index + 1 })}
                fill
                sizes="128px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium text-neutral-900">{sourceTitle}</h2>
          {item.needsTranslation && (
            <span className="rounded bg-brand-tint px-1.5 py-0.5 text-xs font-medium text-brand-strong">
              {t('admin.queue.translate.badge')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-neutral-600">
          <span>{t(CONDITION_LABEL_KEYS[item.condition] as Parameters<typeof t>[0])}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.district, locale)}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.category, locale)}</span>
        </div>
      </div>

      {sourceDescription && (
        <p className="text-sm whitespace-pre-wrap text-neutral-800">{sourceDescription}</p>
      )}

      {item.pickupNotes && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">
            {t('itemDetail.pickupNotes.label')}
          </span>
          <p className="text-sm text-neutral-800">{item.pickupNotes}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-neutral-900">{item.giver.displayName}</span>
          <span className="text-neutral-600">
            {t('admin.queue.giver.approvedCount', { count: item.giver.approvedCount })}
            {' · '}
            {t('admin.queue.giver.rejectedCount', { count: item.giver.rejectedCount })}
          </span>
        </div>
        <span className="text-neutral-500">
          {t('admin.queue.submittedAgo', {
            time: t(submittedAgo.key as Parameters<typeof t>[0], submittedAgo.values),
          })}
        </span>
      </div>

      {item.needsTranslation &&
        (missingTitleLocales.length > 0 || missingDescriptionLocales.length > 0) && (
          <div className="flex flex-col gap-3 rounded border border-neutral-300 bg-brand-tint p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-neutral-900">
                {t('admin.queue.translate.heading')}
              </span>
              <span className="text-xs text-neutral-600">{t('admin.queue.translate.hint')}</span>
            </div>

            {missingTitleLocales.map((loc) => (
              <div key={`title-${loc}`} className="flex flex-col gap-1">
                <label
                  htmlFor={`translate-title-${item.id}-${loc}`}
                  className="text-sm font-medium text-neutral-800"
                >
                  {t('admin.queue.translate.titleLabel', {
                    language: t(`languageSwitcher.${loc}`),
                  })}
                </label>
                <input
                  id={`translate-title-${item.id}-${loc}`}
                  type="text"
                  minLength={TITLE_MIN_LENGTH}
                  maxLength={TITLE_MAX_LENGTH}
                  value={titleDrafts[loc] ?? ''}
                  onChange={(event) =>
                    setTitleDrafts((previous) => ({ ...previous, [loc]: event.target.value }))
                  }
                  disabled={busy}
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
            ))}

            {missingDescriptionLocales.map((loc) => (
              <div key={`description-${loc}`} className="flex flex-col gap-1">
                <label
                  htmlFor={`translate-description-${item.id}-${loc}`}
                  className="text-sm font-medium text-neutral-800"
                >
                  {t('admin.queue.translate.descriptionLabel', {
                    language: t(`languageSwitcher.${loc}`),
                  })}
                </label>
                <textarea
                  id={`translate-description-${item.id}-${loc}`}
                  rows={3}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  value={descriptionDrafts[loc] ?? ''}
                  onChange={(event) =>
                    setDescriptionDrafts((previous) => ({ ...previous, [loc]: event.target.value }))
                  }
                  disabled={busy}
                  required
                  className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        )}

      {errorCode && (
        <p className="text-sm text-red-700" role="alert">
          {t(apiErrorMessageKey(errorCode) as Parameters<typeof t>[0])}
        </p>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`reject-reason-${item.id}`}
            className="text-sm font-medium text-neutral-800"
          >
            {t('admin.queue.reject.reasonLabel')}
          </label>
          <p className="text-xs text-neutral-600">{t('admin.queue.reject.reasonHint')}</p>
          <textarea
            id={`reject-reason-${item.id}`}
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          />
          <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-neutral-500">
              {trimmedLength}/{MAX_REASON_LENGTH}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={cancelReject}
                disabled={busy}
                className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {t('admin.queue.reject.cancel')}
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={busy || !reasonValid}
                aria-busy={busy}
                className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t('admin.queue.reject.submit')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitApprove}
            disabled={busy || !translationsComplete}
            aria-busy={busy}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {t('admin.queue.approve')}
          </button>
          <button
            type="button"
            onClick={openReject}
            disabled={busy}
            className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            {t('admin.queue.reject.open')}
          </button>
        </div>
      )}
    </li>
  );
}
