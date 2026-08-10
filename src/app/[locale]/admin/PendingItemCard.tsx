'use client';

import { useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';

import { apiErrorMessageKey } from '@/lib/api/client';
import { relativeTimeMessage } from '@/lib/relativeTime';

import type { PendingItem } from '@/lib/api/client';
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

type LocalizedRef = { nameHy: string; nameRu: string; nameEn: string };

function localizedName(ref: LocalizedRef, locale: string): string {
  if (locale === 'ru') return ref.nameRu;
  if (locale === 'en') return ref.nameEn;
  return ref.nameHy;
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
  onApprove: () => void;
  onReject: (reason: string) => void;
};

/**
 * One row in the moderation queue: every photo, the full listing text, and
 * the giver's prior record — everything PART 2 asks for, because a
 * reviewer who has to open a second page to see a photo clearly is a
 * reviewer who reviews slower, and speed is the whole point (DECISIONS.md,
 * 2026-07-31).
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
 * Approve is one tap, no confirmation (PART 3: a reviewer working a queue
 * will not confirm every row). Reject opens an inline form instead of
 * acting immediately, because it needs a reason — the copy next to the
 * textarea says the reason is shown to the giver verbatim, since a
 * reviewer who thinks they're leaving an internal note will write the
 * wrong thing.
 */
export function PendingItemCard({ item, now, busy, errorCode, onApprove, onReject }: Props) {
  const t = useTranslations();
  const locale = useLocale();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const trimmedLength = reason.trim().length;
  const reasonValid = trimmedLength >= MIN_REASON_LENGTH && trimmedLength <= MAX_REASON_LENGTH;

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
        <h2 className="font-medium text-neutral-900">{item.title}</h2>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-neutral-600">
          <span>{t(CONDITION_LABEL_KEYS[item.condition] as Parameters<typeof t>[0])}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.district, locale)}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.category, locale)}</span>
        </div>
      </div>

      {item.description && (
        <p className="text-sm whitespace-pre-wrap text-neutral-800">{item.description}</p>
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
            onClick={onApprove}
            disabled={busy}
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
