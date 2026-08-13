'use client';

import { useId, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Select';
import { usePathname, useRouter } from '@/i18n/navigation';

import type { Category, District } from '@/lib/api/client';
import type { ItemCondition } from '@/db/schema';

const CONDITIONS: readonly ItemCondition[] = ['working', 'needs_repair', 'for_parts'];
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

type FilterKey = 'district' | 'category' | 'condition';

/**
 * District / category / condition filters for the feed. Collapsed by
 * default — PART 2 asks for something "usable one-handed on a phone," and a
 * panel open by default would push the first row of cards below the fold
 * on exactly the device where that matters most.
 *
 * Filter state lives entirely in the URL, never in local component state
 * (PART 2): this reads `useSearchParams()` and writes back through
 * `router.push()` with no draft/staging state in between, so a filtered
 * link pasted fresh into the address bar and the back button both
 * reproduce the same list. Each change is its own navigation, which is
 * also what makes "changing a filter resets pagination to the first page"
 * true for free — the server page re-renders with a fresh first page and
 * `FeedList` on it remounts (keyed on the filter string in `page.tsx`).
 */
export function FeedFilters({
  districts,
  categories,
}: {
  districts: District[];
  categories: Category[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelId = useId();

  const [open, setOpen] = useState(false);

  const district = searchParams.get('district') ?? '';
  const category = searchParams.get('category') ?? '';
  const condition = searchParams.get('condition') ?? '';
  const activeCount = [district, category, condition].filter((value) => value !== '').length;

  function setParam(key: FilterKey, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-left hover:bg-neutral-100"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          {t('feed.filters.toggle')}
          {!open && activeCount > 0 && (
            <span
              aria-hidden="true"
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-tint px-1.5 text-xs font-semibold text-brand-strong"
            >
              {activeCount}
            </span>
          )}
          <span className="sr-only">
            {activeCount > 0 ? t('feed.filters.toggleActive', { count: activeCount }) : ''}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="feed-filter-district" className="text-sm font-medium text-neutral-800">
              {t('feed.filters.district.label')}
            </label>
            <Select
              id="feed-filter-district"
              value={district}
              onChange={(event) => setParam('district', event.target.value)}
            >
              <option value="">{t('feed.filters.district.all')}</option>
              {districts.map((option) => (
                <option key={option.id} value={option.slug}>
                  {localizedName(option, locale)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feed-filter-category" className="text-sm font-medium text-neutral-800">
              {t('feed.filters.category.label')}
            </label>
            <Select
              id="feed-filter-category"
              value={category}
              onChange={(event) => setParam('category', event.target.value)}
            >
              <option value="">{t('feed.filters.category.all')}</option>
              {categories.map((option) => (
                <option key={option.id} value={option.slug}>
                  {localizedName(option, locale)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feed-filter-condition" className="text-sm font-medium text-neutral-800">
              {t('feed.filters.condition.label')}
            </label>
            <Select
              id="feed-filter-condition"
              value={condition}
              onChange={(event) => setParam('condition', event.target.value)}
            >
              <option value="">{t('feed.filters.condition.all')}</option>
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {t(CONDITION_LABEL_KEYS[value] as Parameters<typeof t>[0])}
                </option>
              ))}
            </Select>
          </div>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="w-fit text-sm text-brand-strong hover:underline"
            >
              {t('feed.filters.clearAll')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
