import { inArray } from 'drizzle-orm';
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
};

type ReferenceCategory = ReferenceDistrict & { icon: string | null; position: number };

type ReferenceResponse = {
  districts: ReferenceDistrict[];
  categories: ReferenceCategory[];
};

// `@/db` throws at import time without DATABASE_URL, so it is imported lazily —
// otherwise this file could not be collected on a machine with no secrets and
// `skipIf` would never get the chance to run.
let db: (typeof import('@/db'))['db'];
let categories: (typeof import('@/db/schema'))['categories'];
let districts: (typeof import('@/db/schema'))['districts'];

describe.skipIf(!hasDatabase)('GET /api/reference', () => {
  /** Slugs this run owns, in the order the endpoint is expected to return them. */
  let districtSlugs: string[];
  let categorySlugs: string[];
  let insertedDistrictIds: number[] = [];
  let insertedCategoryIds: number[] = [];

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({ categories, districts } = await import('@/db/schema'));

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // Two regions that sort against each other, and two districts inside the
    // first one whose names sort against each other — enough to prove the
    // `region, name_hy` ordering rather than just "some order".
    const regionA = `test-region-a-${suffix}`;
    const regionB = `test-region-b-${suffix}`;
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
        { slug: categorySlugs[2], nameHy: 'Գ', nameRu: 'В', nameEn: 'C', icon: null, position: 2 },
        { slug: categorySlugs[0], nameHy: 'Ա', nameRu: 'А', nameEn: 'A', icon: '📦', position: 1 },
        { slug: categorySlugs[1], nameHy: 'Բ', nameRu: 'Б', nameEn: 'B', icon: null, position: 2 },
      ])
      .returning({ id: categories.id });
    insertedCategoryIds = insertedCategories.map((row) => row.id);
  });

  afterAll(async () => {
    // Nothing here references these rows — the suite creates no items — so the
    // deletes cannot hit a foreign key.
    if (insertedDistrictIds.length) {
      await db.delete(districts).where(inArray(districts.id, insertedDistrictIds));
    }
    if (insertedCategoryIds.length) {
      await db.delete(categories).where(inArray(categories.id, insertedCategoryIds));
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

    // Exactly these keys — `region` orders the list but is not part of it.
    expect(Object.keys(row).sort()).toEqual(['id', 'nameEn', 'nameHy', 'nameRu', 'slug']);
    expect(row.nameHy).toBe('Alpha');
    expect(typeof row.id).toBe('number');
  });

  it('returns icon and position on a category', async () => {
    const response = await get();
    const body = JSON.parse(response.text) as ReferenceResponse;

    const row = body.categories.find((c) => c.slug === categorySlugs[0]);
    expect(row, 'the suite category must be in the response').toBeDefined();
    if (!row) return;

    expect(Object.keys(row).sort()).toEqual([
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

    const positions = categorySlugs.map((slug) => body.categories.findIndex((c) => c.slug === slug));
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

    expect(response.text).not.toMatch(/phone/i);
  });
});
