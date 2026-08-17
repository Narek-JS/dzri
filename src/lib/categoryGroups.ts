import type { ComboboxGroup, ComboboxOption } from '@/components/ui/Combobox';
import type { Category } from '@/lib/api/client';

type BuildCategoryGroupsArgs = {
  categories: Category[];
  /** Each caller already has its own locale-fallback name resolver — reused here rather than duplicated. */
  nameOf: (category: Category) => string;
  groupNameOf: (category: Category) => string;
  /** FeedFilters filters by slug (a URL param); CreateItemForm submits a numeric id. */
  valueOf: (category: Category) => string;
};

/**
 * Groups category rows by `groupSlug` for the Combobox — the category
 * equivalent of `buildDistrictGroups` (src/lib/districtGroups.ts), kept as
 * its own small function rather than folded into that one or generalized
 * into a shared abstraction over both: a category group has no "anywhere
 * in this group" pseudo-row and nothing to hoist or reorder, since
 * `GET /api/reference` already returns categories ordered by their group's
 * `position` (DECISIONS.md) — the groups here come out in exactly that
 * order just by taking each category's `groupSlug` the first time it's
 * seen. There is nothing left that the district version's region-hoisting
 * and marz-label logic would even share. What both genuinely reuse is
 * `Combobox`'s own `groups` + `options[].group` shape, which is already
 * generic and needed no changes.
 */
export function buildCategoryGroups({
  categories,
  nameOf,
  groupNameOf,
  valueOf,
}: BuildCategoryGroupsArgs): { groups: ComboboxGroup[]; options: ComboboxOption[] } {
  const groups: ComboboxGroup[] = [];
  const seenGroupSlugs = new Set<string>();
  for (const category of categories) {
    if (seenGroupSlugs.has(category.groupSlug)) continue;
    seenGroupSlugs.add(category.groupSlug);
    groups.push({ id: category.groupSlug, heading: groupNameOf(category) });
  }

  const options: ComboboxOption[] = categories.map((category) => ({
    value: valueOf(category),
    label: nameOf(category),
    group: category.groupSlug,
  }));

  return { groups, options };
}
