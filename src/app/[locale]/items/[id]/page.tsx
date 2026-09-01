import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { containerClassName } from '@/components/ui/Container';
import { Notice } from '@/components/ui/Notice';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/auth/session';
import { resolveDisplayName } from '@/lib/displayName';
import { getItemForViewer } from '@/lib/items/visibility';
import { resolveLocalizedText } from '@/lib/items/localizedText';

import type { ItemCondition } from '@/db/schema';

import { ItemGallery } from './ItemGallery';

const CONDITION_LABEL_KEYS: Record<ItemCondition, string> = {
  working: 'createItem.condition.working',
  needs_repair: 'createItem.condition.needsRepair',
  for_parts: 'createItem.condition.forParts',
};

type LocalizedRef = { nameHy: string; nameRu: string; nameEn: string };

function localizedName(ref: LocalizedRef, locale: string): string {
  if (locale === 'ru') return ref.nameRu;
  if (locale === 'en') return ref.nameEn;
  return ref.nameHy;
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path d="M12 4 3 19h18L12 4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <path d="M12 17.5v.01" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Item detail: the page a shared link lands on. Server component — reads
 * the session, asks `getItemForViewer` (src/lib/items/visibility.ts, the
 * same function `GET /api/items/[id]` calls) who may see this item, and
 * renders `notFound()` when it refuses. Browsing this page needs no account
 * (CLAUDE.md Rule 4).
 *
 * The giver's phone is shown to whoever the page renders for at all — the
 * visibility check above already decided that (a public viewer of an
 * `active` item, the owner, or an approved/completed claimant), so there is
 * no second gate here. DECISIONS.md, 2026-08-25, records why this replaced
 * the claim-then-reveal flow the claims system (still live, just no longer
 * linked from this page) was built around.
 *
 * `giver.phone` can still be `null` in one case: the giver deleted their
 * account since. A `given` item is terminal and untouched by deletion, so a
 * claimant who completed a handover long ago can still land here — the
 * contact block below renders nothing in that case instead of a `tel:` link
 * to a number that no longer exists (DECISIONS.md, 2026-08-30).
 */
export default async function ItemDetailPage({
  params,
}: {
  params: Promise<LocaleParams & { id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);

  const session = await getSession();
  const view = await getItemForViewer(id, session);
  if (!view) {
    notFound();
  }

  const { item, isOwner, isEntitledClaimant } = view;

  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);

  const postedAt = format.dateTime(item.createdAt, { dateStyle: 'long' });

  // Public (`active`) views never need the fallback — item_translations_
  // complete_when_active guarantees every title column and description/
  // pickup-notes column (each all three or none) is filled. It exists for
  // isPrivateView: the owner reading their own pending_review or rejected
  // listing, where only item.sourceLocale's column is guaranteed to hold
  // anything.
  const title = resolveLocalizedText(
    { hy: item.titleHy, ru: item.titleRu, en: item.titleEn },
    item.sourceLocale,
    locale,
  );
  const description = resolveLocalizedText(
    { hy: item.descriptionHy, ru: item.descriptionRu, en: item.descriptionEn },
    item.sourceLocale,
    locale,
  );
  const pickupNotes = resolveLocalizedText(
    { hy: item.pickupNotesHy, ru: item.pickupNotesRu, en: item.pickupNotesEn },
    item.sourceLocale,
    locale,
  );

  return (
    <main
      className={containerClassName({ size: 'md', className: 'flex flex-1 flex-col gap-6 py-10' })}
    >
      <ItemGallery images={item.images} title={title ?? ''} />

      {isOwner && item.status === 'pending_review' && (
        <Notice tone="neutral" className="flex items-center gap-3 text-neutral-700">
          <ClockIcon />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('itemDetail.banner.pendingReview.title')}
            </span>
            <span className="text-sm">{t('itemDetail.banner.pendingReview.description')}</span>
          </div>
        </Notice>
      )}

      {isOwner && item.status === 'rejected' && (
        <Notice tone="error" className="flex items-start gap-3 text-red-800">
          <AlertIcon />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('itemDetail.banner.rejected.title')}</span>
            <span className="text-sm">{item.rejectionReason}</span>
          </div>
        </Notice>
      )}

      {isEntitledClaimant && (
        <Notice tone="brand" className="flex items-center gap-3 text-brand-strong">
          <CheckIcon />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('itemDetail.banner.reservedForYou.title')}
            </span>
            <span className="text-sm">{t('itemDetail.banner.reservedForYou.description')}</span>
          </div>
        </Notice>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
          <span>{t(CONDITION_LABEL_KEYS[item.condition] as Parameters<typeof t>[0])}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.district, locale)}</span>
          <span aria-hidden="true">·</span>
          <span>{localizedName(item.category, locale)}</span>
        </div>
      </div>

      {description && <p className="text-sm whitespace-pre-wrap text-neutral-800">{description}</p>}

      {pickupNotes && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('itemDetail.pickupNotes.label')}</span>
          <p className="text-sm text-neutral-800">{pickupNotes}</p>
        </div>
      )}

      <p className="text-sm text-neutral-500">
        {t('itemDetail.postedBy', {
          name: resolveDisplayName(item.giver.displayName, t),
          date: postedAt,
        })}
      </p>

      {item.giver.phone && (
        <Notice tone="subtle" className="flex items-center gap-3 text-neutral-900">
          <PhoneIcon />
          <div className="flex flex-col">
            <span className="text-sm text-neutral-600">{t('itemDetail.contact.label')}</span>
            <a href={`tel:${item.giver.phone}`} className="text-lg font-semibold hover:underline">
              {item.giver.phone}
            </a>
          </div>
        </Notice>
      )}
    </main>
  );
}
