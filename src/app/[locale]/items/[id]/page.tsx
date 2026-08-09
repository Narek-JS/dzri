import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/auth/session';
import { getItemForViewer } from '@/lib/items/visibility';

import type { ItemCondition } from '@/db/schema';

import { ClaimButton } from './ClaimButton';
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

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path d="M8 6h12M8 12h12M8 18h12" strokeLinecap="round" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Item detail: the page a shared link lands on. Server component — reads
 * the session, asks `getItemForViewer` (src/lib/items/visibility.ts, the
 * same function `GET /api/items/[id]` calls) who may see this item, and
 * renders `notFound()` when it refuses. Browsing this page needs no
 * account (CLAUDE.md Rule 4) — only the claim button gates on a session,
 * and only at the moment it is pressed.
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

  const { item, isOwner, isEntitledClaimant, isPrivateView } = view;

  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);

  const postedAt = format.dateTime(item.createdAt, { dateStyle: 'long' });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <ItemGallery images={item.images} title={item.title} />

      {isOwner && item.status === 'pending_review' && (
        <div className="flex items-center gap-3 rounded border border-neutral-300 bg-neutral-50 p-4 text-neutral-700">
          <ClockIcon />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('itemDetail.banner.pendingReview.title')}
            </span>
            <span className="text-sm">{t('itemDetail.banner.pendingReview.description')}</span>
          </div>
        </div>
      )}

      {isOwner && item.status === 'rejected' && (
        <div className="flex items-start gap-3 rounded border border-red-300 bg-red-50 p-4 text-red-800">
          <AlertIcon />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('itemDetail.banner.rejected.title')}</span>
            <span className="text-sm">{item.rejectionReason}</span>
          </div>
        </div>
      )}

      {isOwner && item.status === 'active' && (
        <Link
          href={`/items/${item.id}/claims`}
          className="flex items-center gap-3 rounded border border-neutral-300 bg-neutral-50 p-4 text-neutral-700 hover:border-brand-strong hover:text-brand-strong"
        >
          <ListIcon />
          <span className="text-sm font-medium">{t('itemDetail.banner.active.viewClaims')}</span>
        </Link>
      )}

      {isEntitledClaimant && (
        <div className="flex items-center gap-3 rounded border border-brand-strong bg-brand-tint p-4 text-brand-strong">
          <CheckIcon />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t('itemDetail.banner.reservedForYou.title')}
            </span>
            <span className="text-sm">{t('itemDetail.banner.reservedForYou.description')}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
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
          <span className="text-sm font-medium">{t('itemDetail.pickupNotes.label')}</span>
          <p className="text-sm text-neutral-800">{item.pickupNotes}</p>
        </div>
      )}

      <p className="text-sm text-neutral-500">
        {t('itemDetail.postedBy', { name: item.giver.displayName, date: postedAt })}
      </p>

      {!isPrivateView && <ClaimButton itemId={item.id} />}
    </main>
  );
}
