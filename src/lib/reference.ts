import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { categories, districts } from '@/db/schema';

import type { Category, District } from '@/lib/api/client';

export type ReferenceData = { districts: District[]; categories: Category[] };

/**
 * The same query `GET /api/reference` runs, for a server component that
 * needs the same data without a client-side round trip (Part 4 of the
 * create-item brief: "do not fetch reference data from the browser").
 *
 * This duplicates that route handler's query rather than importing a
 * shared helper from it, because the brief for this change explicitly
 * rules out touching any route handler — there is nowhere to extract a
 * shared function to without editing `src/app/api/reference/route.ts`.
 * The ordering must stay in sync by hand: districts by `region` then
 * `nameHy` (groups Yerevan together, marzes after), categories by
 * `position` then `slug` (API.md).
 */
export async function getReferenceData(): Promise<ReferenceData> {
  const [districtRows, categoryRows] = await Promise.all([
    db
      .select({
        id: districts.id,
        slug: districts.slug,
        nameHy: districts.nameHy,
        nameRu: districts.nameRu,
        nameEn: districts.nameEn,
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
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.slug)),
  ]);

  return { districts: districtRows, categories: categoryRows };
}
