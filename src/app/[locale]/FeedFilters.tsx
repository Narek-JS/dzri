'use client';

import { useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Select } from '@/components/ui/Select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { buildCategoryGroups } from '@/lib/categoryGroups';
import { buildDistrictGroups } from '@/lib/districtGroups';

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
type FilterValues = Record<FilterKey, string>;

const EMPTY_FILTERS: FilterValues = { district: '', category: '', condition: '' };

function readFilters(searchParams: URLSearchParams): FilterValues {
  return {
    district: searchParams.get('district') ?? '',
    category: searchParams.get('category') ?? '',
    condition: searchParams.get('condition') ?? '',
  };
}

/**
 * The three district/category/condition selects, bound to whatever
 * value/onChange pair the caller passes — the same markup backs both the
 * real-time desktop row and the pending-state mobile drawer, so there is
 * one place that renders a `<Select>` against reference data, not two.
 * `idPrefix` keeps ids unique since both instances are in the DOM at once
 * (the desktop row is only hidden via CSS below `md`).
 *
 * Each field wrapper is `md:flex-1` rather than a bare `flex-1`: at `md`
 * and up these three divs are children of a horizontal row (`FeedFilters`'
 * desktop container below), where `flex-1` makes them equal-width columns.
 * Below `md` they're stacked children of `BottomSheet`'s own vertical,
 * genuinely-tall (`h-[90vh]`) content column instead — an unqualified
 * `flex-1` there stretched each wrapper to a third of that column's full
 * height, with the label+input anchored at its top, which read as huge,
 * evenly-spaced gaps between fields. Mobile doesn't need flex-grow at
 * all: it just stacks at natural height, gap-4 (from BottomSheet's own
 * content wrapper) apart.
 */
function FilterFields({
  idPrefix,
  values,
  onChange,
  districts,
  categories,
  locale,
}: {
  idPrefix: string;
  values: FilterValues;
  onChange: (key: FilterKey, value: string) => void;
  districts: District[];
  categories: Category[];
  locale: string;
}) {
  const t = useTranslations();

  const { groups: districtGroups, options: districtOptions } = buildDistrictGroups({
    districts,
    nameOf: (district) => localizedName(district, locale),
    valueOf: (district) => district.slug,
    yerevanHeading: t('districts.yerevan'),
    allOfMarzLabel: (marz) => t('districts.allOfMarz', { marz }),
  });

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
    valueOf: (category) => category.slug,
  });

  return (
    <>
      <div className="flex flex-col gap-1 md:flex-1">
        <label htmlFor={`${idPrefix}-district`} className="text-sm font-medium text-neutral-800">
          {t('feed.filters.district.label')}
        </label>
        <Combobox
          id={`${idPrefix}-district`}
          value={values.district}
          onValueChange={(value) => onChange('district', value)}
          searchPlaceholder={t('combobox.search')}
          emptyText={t('combobox.noResults')}
          groups={districtGroups}
          options={[
            { value: '', label: t('feed.filters.district.all'), pinned: true },
            ...districtOptions,
          ]}
        />
      </div>

      <div className="flex flex-col gap-1 md:flex-1">
        <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium text-neutral-800">
          {t('feed.filters.category.label')}
        </label>
        <Combobox
          id={`${idPrefix}-category`}
          value={values.category}
          onValueChange={(value) => onChange('category', value)}
          searchPlaceholder={t('combobox.search')}
          emptyText={t('combobox.noResults')}
          groups={categoryGroups}
          options={[
            { value: '', label: t('feed.filters.category.all'), pinned: true },
            ...categoryOptions,
          ]}
        />
      </div>

      <div className="flex flex-col gap-1 md:flex-1">
        <label htmlFor={`${idPrefix}-condition`} className="text-sm font-medium text-neutral-800">
          {t('feed.filters.condition.label')}
        </label>
        <Select
          id={`${idPrefix}-condition`}
          value={values.condition}
          onValueChange={(value) => onChange('condition', value)}
        >
          <Select.Item value="">{t('feed.filters.condition.all')}</Select.Item>
          {CONDITIONS.map((value) => (
            <Select.Item key={value} value={value}>
              {t(CONDITION_LABEL_KEYS[value] as Parameters<typeof t>[0])}
            </Select.Item>
          ))}
        </Select>
      </div>
    </>
  );
}

/**
 * District / category / condition filters for the feed.
 *
 * Baymard-grounded split: three filter types is squarely "horizontal bar"
 * territory, and desktop users prefer real-time filtering with no separate
 * apply step — so `md` and up shows all three selects in a row, always
 * visible, each change going straight to the URL. There is no accordion
 * and no "N active" summary there: every select already shows its own
 * selection, which is the summary.
 *
 * Below `md`, the same real-time updates would cause a disorienting page
 * jump mid-interaction on a small screen, so the three selects move into a
 * shared `BottomSheet` (vaul) with local *pending* state — nothing reaches
 * the URL until the sheet's primary button is tapped. Opening the sheet
 * seeds that pending state from whatever is currently applied, so
 * reopening it after a cancel never loses the real selection.
 *
 * Applied filter state itself lives entirely in the URL, never in local
 * component state — this reads `useSearchParams()` and writes back through
 * `router.push()`, so a filtered link pasted fresh into the address bar
 * and the back button both reproduce the same list. The sheet's pending
 * state is the one deliberate exception, and it is never the source of
 * truth: Apply is the only thing that promotes it to the URL.
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

  const applied = readFilters(searchParams);
  const activeCount = Object.values(applied).filter((value) => value !== '').length;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState<FilterValues>(applied);

  function navigateTo(values: FilterValues) {
    const next = new URLSearchParams();
    (Object.keys(values) as FilterKey[]).forEach((key) => {
      if (values[key]) next.set(key, values[key]);
    });

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // Desktop: every change goes straight to the URL — no draft, no submit.
  function setAppliedParam(key: FilterKey, value: string) {
    navigateTo({ ...applied, [key]: value });
  }

  function openDrawer() {
    setPending(applied);
    setDrawerOpen(true);
  }

  function applyDrawer() {
    navigateTo(pending);
    setDrawerOpen(false);
  }

  function clearAll() {
    setPending(EMPTY_FILTERS);
    router.push(pathname);
    setDrawerOpen(false);
  }

  return (
    <div>
      {/* md and up: always visible, horizontal, real-time. */}
      <div className="hidden items-end gap-3 md:flex">
        <FilterFields
          idPrefix="feed-filter-desktop"
          values={applied}
          onChange={setAppliedParam}
          districts={districts}
          categories={categories}
          locale={locale}
        />
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer pb-2 text-sm text-brand-strong hover:underline"
          >
            {t('feed.filters.clearAll')}
          </button>
        )}
      </div>

      {/* Below md: a compact trigger opens a bottom-sheet drawer. The 36px
          tap-target floor now lives in Button's own `sm` size classes
          (Button.tsx), so this needs no per-instance override. */}
      <div className="md:hidden">
        <Button type="button" variant="secondary" size="sm" onClick={openDrawer}>
          {t('feed.filters.toggle')}
          {activeCount > 0 && (
            <span
              aria-hidden="true"
              className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold"
            >
              {activeCount}
            </span>
          )}
          <span className="sr-only">
            {activeCount > 0 ? t('feed.filters.toggleActive', { count: activeCount }) : ''}
          </span>
        </Button>
      </div>

      <BottomSheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={t('feed.filters.toggle')}
        closeLabel={t('feed.filters.close')}
        footer={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={clearAll}
              className="cursor-pointer text-sm text-brand-strong hover:underline"
            >
              {t('feed.filters.clearAll')}
            </button>
            <Button type="button" onClick={applyDrawer} className="flex-1">
              {t('feed.filters.apply')}
            </Button>
          </div>
        }
      >
        <FilterFields
          idPrefix="feed-filter-mobile"
          values={pending}
          onChange={(key, value) => setPending((previous) => ({ ...previous, [key]: value }))}
          districts={districts}
          categories={categories}
          locale={locale}
        />
      </BottomSheet>
    </div>
  );
}
