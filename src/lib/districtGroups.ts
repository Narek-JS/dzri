import type { ComboboxGroup, ComboboxOption } from '@/components/ui/Combobox';
import type { District } from '@/lib/api/client';

type BuildDistrictGroupsArgs = {
  districts: District[];
  /** Each caller already has its own locale-fallback name resolver — reused here rather than duplicated. */
  nameOf: (district: District) => string;
  /** FeedFilters filters by slug (a URL param); CreateItemForm submits a numeric id. */
  valueOf: (district: District) => string;
  yerevanHeading: string;
  /** Label for a marz-wide "anywhere in this marz" row, distinct from its own group heading. */
  allOfMarzLabel: (marzName: string) => string;
};

/**
 * Groups district rows by `region` for the Combobox: Yerevan first, then
 * each marz in the same relative order `GET /api/reference` already
 * returns them in (region ASC, which today alphabetizes marz slugs and
 * puts `'yerevan'` last — this hoists it to the front rather than
 * re-deriving a new order, per DECISIONS.md 2026-08-17).
 *
 * A marz-wide "anywhere in this marz" row is identified structurally —
 * `district.slug === district.region`, true for exactly the ten marz rows
 * seeded in `src/db/seed.ts` and never for a Yerevan district or a marz
 * capital — rather than a hardcoded slug list, and gets `allOfMarzLabel`
 * instead of its plain name so it doesn't repeat its own group heading
 * verbatim.
 */
export function buildDistrictGroups({
  districts,
  nameOf,
  valueOf,
  yerevanHeading,
  allOfMarzLabel,
}: BuildDistrictGroupsArgs): { groups: ComboboxGroup[]; options: ComboboxOption[] } {
  const groupOrder: string[] = [];
  for (const district of districts) {
    if (!groupOrder.includes(district.region)) groupOrder.push(district.region);
  }
  // Stable sort: only hoists 'yerevan' to the front, leaves every marz's
  // relative order exactly as the API returned it.
  groupOrder.sort((a, b) => {
    if (a === 'yerevan') return -1;
    if (b === 'yerevan') return 1;
    return 0;
  });

  const marzHeadingByRegion = new Map<string, string>();
  for (const district of districts) {
    if (district.slug === district.region) {
      marzHeadingByRegion.set(district.region, nameOf(district));
    }
  }

  const groups: ComboboxGroup[] = groupOrder.map((region) => ({
    id: region,
    heading: region === 'yerevan' ? yerevanHeading : (marzHeadingByRegion.get(region) ?? region),
  }));

  const options: ComboboxOption[] = districts.map((district) => ({
    value: valueOf(district),
    label:
      district.slug === district.region
        ? allOfMarzLabel(nameOf(district))
        : nameOf(district),
    group: district.region,
  }));

  return { groups, options };
}
