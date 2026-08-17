import { NextResponse } from 'next/server';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { categories, categoryGroups, districts } from '@/db/schema';

/**
 * Reference data changes about once a year, and every form and filter on the
 * site needs it, so it is cached hard: five minutes fresh, a day of
 * stale-while-revalidate behind it. `public` is safe because the response is
 * identical for everyone — there is no auth on this route and nothing
 * user-specific in it.
 */
const CACHE = 'public, max-age=300, stale-while-revalidate=86400';

/**
 * GET /api/reference — every district and every category, in one response.
 *
 * PUBLIC. The create-item form needs both as dropdowns and the feed needs them
 * as filters, and a client that had to fetch them separately would either make
 * two round trips or render half a form. Both tables are small and fixed (32
 * districts, 41 categories), so there is no pagination and no filtering: the
 * whole thing is one cached payload.
 *
 * Ordering is server-side so every client renders the same list. Districts by
 * `region` then `nameHy`. `region` itself is returned too (see DECISIONS.md,
 * region-exposure reversal) because the District combobox groups its options
 * by it — Yerevan, then each marz.
 *
 * Categories are joined to `category_groups` and carry their group's slug and
 * three names (`groupSlug`, `groupNameHy`, `groupNameRu`, `groupNameEn`) —
 * the same "return the column the UI already groups by" reasoning the region
 * entry above gives, applied to categories now that they have a real group
 * table instead of a district's borrowed `region` column (DECISIONS.md).
 * Ordered by the group's `position`, then the category's own `position`
 * within that group, then `slug` — a defensive final tiebreak, same as
 * before, for two rows that end up sharing a position.
 *
 * No user data is touched on this path, so there is no phone to leak and no
 * session to read.
 */
export async function GET(): Promise<NextResponse> {
  const [districtRows, categoryRows] = await Promise.all([
    db
      .select({
        id: districts.id,
        slug: districts.slug,
        nameHy: districts.nameHy,
        nameRu: districts.nameRu,
        nameEn: districts.nameEn,
        region: districts.region,
      })
      .from(districts)
      .orderBy(asc(districts.region), asc(districts.nameHy)),

    db
      .select({
        id: categories.id,
        slug: categories.slug,
        nameHy: categories.nameHy,
        nameRu: categories.nameRu,
        nameEn: categories.nameEn,
        icon: categories.icon,
        position: categories.position,
        groupSlug: categoryGroups.slug,
        groupNameHy: categoryGroups.nameHy,
        groupNameRu: categoryGroups.nameRu,
        groupNameEn: categoryGroups.nameEn,
      })
      .from(categories)
      .innerJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .orderBy(asc(categoryGroups.position), asc(categories.position), asc(categories.slug)),
  ]);

  return NextResponse.json(
    { districts: districtRows, categories: categoryRows },
    { headers: { 'Cache-Control': CACHE } },
  );
}
