import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Real route, real Neon, no mocks (CLAUDE.md).
 *
 * `/api/reference` returns *every* district and category on the branch, which
 * is shared with the seed and with whatever the other suites are doing. So no
 * assertion here is about the whole list: the suite inserts its own rows with
 * slugs unique to the run, then checks that those rows are present, correctly
 * shaped, and in the right order *relative to each other*. Rows belonging to
 * anybody else ride along and are ignored.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';

type ReferenceDistrict = {
  id: number;
  slug: string;
  nameHy: string;
  nameRu: string;
  nameEn: string;
  region: string;
};

type ReferenceCategory = ReferenceDistrict & {
  icon: string | null;
  position: number;
  groupSlug: string;
  groupNameHy: string;
  groupNameRu: string;
  groupNameEn: string;
};

type ReferenceResponse = {
  districts: ReferenceDistrict[];
  categories: ReferenceCategory[];
};

// `@/db` throws at import time without DATABASE_URL, so it is imported lazily —
// otherwise this file could not be collected on a machine with no secrets and
// `skipIf` would never get the chance to run.
let db: (typeof import('@/db'))['db'];
let categories: (typeof import('@/db/schema'))['categories'];
let categoryGroups: (typeof import('@/db/schema'))['categoryGroups'];
let districts: (typeof import('@/db/schema'))['districts'];

describe.skipIf(!hasDatabase)('GET /api/reference', () => {
  /** Slugs this run owns, in the order the endpoint is expected to return them. */
  let districtSlugs: string[];
  let categorySlugs: string[];
  let districtRegionA: string;
  let insertedDistrictIds: number[] = [];
  let insertedCategoryIds: number[] = [];
  let categoryGroupId: number;
  let categoryGroupSlug: string;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ categories, categoryGroups, districts } = await import('@/db/schema'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // Two regions that sort against each other, and two districts inside the
    // first one whose names sort against each other — enough to prove the
    // `region, name_hy` ordering rather than just "some order".
    const regionA = `test-region-a-${suffix}`;
    const regionB = `test-region-b-${suffix}`;
    districtRegionA = regionA;
    districtSlugs = [
      `test-ref-dist-a1-${suffix}`,
      `test-ref-dist-a2-${suffix}`,
      `test-ref-dist-b1-${suffix}`,
    ];

    const insertedDistricts = await db
      .insert(districts)
      .values([
        // Deliberately inserted out of order, so a route that forgot to sort
        // would hand them back the way they were written.
        {
          slug: districtSlugs[2],
          nameHy: 'Alpha',
          nameRu: 'Альфа',
          nameEn: 'Alpha',
          region: regionB,
        },
        {
          slug: districtSlugs[1],
          nameHy: 'Beta',
          nameRu: 'Бета',
          nameEn: 'Beta',
          region: regionA,
        },
        {
          slug: districtSlugs[0],
          nameHy: 'Alpha',
          nameRu: 'Альфа',
          nameEn: 'Alpha',
          region: regionA,
        },
      ])
      .returning({ id: districts.id });
    insertedDistrictIds = insertedDistricts.map((row) => row.id);

    // One group for all three test categories — group position is therefore
    // constant across them, so this still isolates the `position`-then-`slug`
    // ordering within a group, same as before the group column existed.
    categoryGroupSlug = `test-ref-cat-group-${suffix}`;
    const [group] = await db
      .insert(categoryGroups)
      .values({ slug: categoryGroupSlug, nameHy: 'Խումբ', nameRu: 'Группа', nameEn: 'Group' })
      .returning({ id: categoryGroups.id });
    categoryGroupId = group.id;

    // Positions 1 and 2, with two categories sharing position 2 so the `slug`
    // tiebreak is exercised and not just the position sort.
    categorySlugs = [
      `test-ref-cat-a-${suffix}`,
      `test-ref-cat-b-${suffix}`,
      `test-ref-cat-c-${suffix}`,
    ];

    const insertedCategories = await db
      .insert(categories)
      .values([
        {
          slug: categorySlugs[2],
          nameHy: 'Գ',
          nameRu: 'В',
          nameEn: 'C',
          icon: null,
          position: 2,
          groupId: categoryGroupId,
        },
        {
          slug: categorySlugs[0],
          nameHy: 'Ա',
          nameRu: 'А',
          nameEn: 'A',
          icon: '📦',
          position: 1,
          groupId: categoryGroupId,
        },
        {
          slug: categorySlugs[1],
          nameHy: 'Բ',
          nameRu: 'Б',
          nameEn: 'B',
          icon: null,
          position: 2,
          groupId: categoryGroupId,
        },
      ])
      .returning({ id: categories.id });
    insertedCategoryIds = insertedCategories.map((row) => row.id);
  });

  afterAll(async () => {
    // Nothing here references these rows — the suite creates no items — so the
    // deletes cannot hit a foreign key, as long as categories (which reference
    // the group) are dropped before the group itself.
    if (insertedDistrictIds.length) {
      await db.delete(districts).where(inArray(districts.id, insertedDistrictIds));
    }
    if (insertedCategoryIds.length) {
      await db.delete(categories).where(inArray(categories.id, insertedCategoryIds));
    }
    if (categoryGroupId !== undefined) {
      await db.delete(categoryGroups).where(eq(categoryGroups.id, categoryGroupId));
    }
  });

  /** No cookie is ever sent: this endpoint is for a signed-out visitor. */
  async function get(): Promise<{ status: number; text: string; cacheControl: string | null }> {
    const res = await fetch(`${BASE_URL}/api/reference`, {
      headers: {
        'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.4`,
      },
    });

    return {
      status: res.status,
      text: await res.text(),
      cacheControl: res.headers.get('cache-control'),
    };
  }

  it('serves districts and categories to an anonymous caller', async () => {
    const response = await get();
    expect(response.status, response.text).toBe(200);

    const body = JSON.parse(response.text) as ReferenceResponse;
    expect(Array.isArray(body.districts)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);

    const slugs = body.districts.map((row) => row.slug);
    for (const slug of districtSlugs) {
      expect(slugs).toContain(slug);
    }
  });

  it('returns exactly the documented district fields', async () => {
    const response = await get();
    const body = JSON.parse(response.text) as ReferenceResponse;

    const row = body.districts.find((d) => d.slug === districtSlugs[0]);
    expect(row, 'the suite district must be in the response').toBeDefined();
    if (!row) return;

    // Exactly these keys — `region` is returned now too (DECISIONS.md,
    // 2026-08-17: the District combobox groups its options by it).
    expect(Object.keys(row).sort()).toEqual([
      'id',
      'nameEn',
      'nameHy',
      'nameRu',
      'region',
      'slug',
    ]);
    expect(row.nameHy).toBe('Alpha');
    expect(row.region).toBe(districtRegionA);
    expect(typeof row.id).toBe('number');
  });

  it('returns icon and position on a category', async () => {
    const response = await get();
    const body = JSON.parse(response.text) as ReferenceResponse;

    const row = body.categories.find((c) => c.slug === categorySlugs[0]);
    expect(row, 'the suite category must be in the response').toBeDefined();
    if (!row) return;

    // `groupSlug`/`groupName{Hy,Ru,En}` are returned too now — the Category
    // combobox groups its options by them (DECISIONS.md, category
    // restructure), the same reasoning `region` is returned on a district.
    expect(Object.keys(row).sort()).toEqual([
      'groupNameEn',
      'groupNameHy',
      'groupNameRu',
      'groupSlug',
      'icon',
      'id',
      'nameEn',
      'nameHy',
      'nameRu',
      'position',
      'slug',
    ]);
    expect(row.icon).toBe('📦');
    expect(row.position).toBe(1);
    expect(row.groupSlug).toBe(categoryGroupSlug);
  });

  it('orders districts by region then nameHy', async () => {
    const response = await get();
    const body = JSON.parse(response.text) as ReferenceResponse;

    const positions = districtSlugs.map((slug) => body.districts.findIndex((d) => d.slug === slug));
    expect(positions.every((index) => index >= 0)).toBe(true);

    // region-a/Alpha, then region-a/Beta, then region-b/Alpha — the insert
    // order was the reverse of this.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('orders categories by position then slug', async () => {
    const response = await get();
    const body = JSON.parse(response.text) as ReferenceResponse;

    const positions = categorySlugs.map((slug) =>
      body.categories.findIndex((c) => c.slug === slug),
    );
    expect(positions.every((index) => index >= 0)).toBe(true);

    // position 1, then the two position-2 rows broken apart by slug.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('is publicly cacheable for five minutes', async () => {
    const response = await get();

    expect(response.cacheControl).toBe('public, max-age=300, stale-while-revalidate=86400');
  });

  it('never returns a phone number', async () => {
    const response = await get();

    // A bare /phone/i substring match is no longer safe to assert: the
    // category restructure (DECISIONS.md, 2026-08-18) added a real category
    // named "Phones & Accessories" (slug `phones-accessories`), which this
    // very route legitimately returns. What must actually be absent is a
    // `phone` field in the JSON — this route never selects user data at all
    // (route doc comment), so there is nothing to leak in the first place.
    expect(response.text).not.toMatch(/"phone"\s*:/i);
  });
});
