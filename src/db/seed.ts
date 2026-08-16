import { sql } from 'drizzle-orm';

import { db } from './index';
import { categories, districts, type NewCategory, type NewDistrict } from './schema';

/** The 12 administrative districts of Yerevan. */
const yerevanDistricts: NewDistrict[] = [
  { slug: 'ajapnyak', nameHy: 'Աջափնյակ', nameRu: 'Аджапняк', nameEn: 'Ajapnyak' },
  { slug: 'arabkir', nameHy: 'Արաբկիր', nameRu: 'Арабкир', nameEn: 'Arabkir' },
  { slug: 'avan', nameHy: 'Ավան', nameRu: 'Аван', nameEn: 'Avan' },
  { slug: 'davtashen', nameHy: 'Դավթաշեն', nameRu: 'Давташен', nameEn: 'Davtashen' },
  { slug: 'erebuni', nameHy: 'Էրեբունի', nameRu: 'Эребуни', nameEn: 'Erebuni' },
  {
    slug: 'kanaker-zeytun',
    nameHy: 'Քանաքեռ-Զեյթուն',
    nameRu: 'Канакер-Зейтун',
    nameEn: 'Kanaker-Zeytun',
  },
  { slug: 'kentron', nameHy: 'Կենտրոն', nameRu: 'Кентрон', nameEn: 'Kentron' },
  {
    slug: 'malatia-sebastia',
    nameHy: 'Մալաթիա-Սեբաստիա',
    nameRu: 'Малатия-Себастия',
    nameEn: 'Malatia-Sebastia',
  },
  { slug: 'nor-nork', nameHy: 'Նոր Նորք', nameRu: 'Нор Норк', nameEn: 'Nor Nork' },
  { slug: 'nork-marash', nameHy: 'Նորք-Մարաշ', nameRu: 'Норк-Мараш', nameEn: 'Nork-Marash' },
  { slug: 'nubarashen', nameHy: 'Նուբարաշեն', nameRu: 'Нубарашен', nameEn: 'Nubarashen' },
  { slug: 'shengavit', nameHy: 'Շենգավիթ', nameRu: 'Шенгавит', nameEn: 'Shengavit' },
].map((d) => ({ ...d, region: 'yerevan' }));

/** The 10 marzes. Yerevan itself is a separate administrative unit, above. */
const marzes: NewDistrict[] = [
  { slug: 'aragatsotn', nameHy: 'Արագածոտն', nameRu: 'Арагацотн', nameEn: 'Aragatsotn' },
  { slug: 'ararat', nameHy: 'Արարատ', nameRu: 'Арарат', nameEn: 'Ararat' },
  { slug: 'armavir', nameHy: 'Արմավիր', nameRu: 'Армавир', nameEn: 'Armavir' },
  { slug: 'gegharkunik', nameHy: 'Գեղարքունիք', nameRu: 'Гегаркуник', nameEn: 'Gegharkunik' },
  { slug: 'kotayk', nameHy: 'Կոտայք', nameRu: 'Котайк', nameEn: 'Kotayk' },
  { slug: 'lori', nameHy: 'Լոռի', nameRu: 'Лори', nameEn: 'Lori' },
  { slug: 'shirak', nameHy: 'Շիրակ', nameRu: 'Ширак', nameEn: 'Shirak' },
  { slug: 'syunik', nameHy: 'Սյունիք', nameRu: 'Сюник', nameEn: 'Syunik' },
  { slug: 'tavush', nameHy: 'Տավուշ', nameRu: 'Тавуш', nameEn: 'Tavush' },
  { slug: 'vayots-dzor', nameHy: 'Վայոց ձոր', nameRu: 'Вайоц Дзор', nameEn: 'Vayots Dzor' },
].map((m) => ({ ...m, region: m.slug }));

/**
 * One district row per marz capital — the city itself, not "anywhere in
 * the marz", so each carries its marz's `region` value (the comment on
 * `region` above still holds: a capital groups with its own marz, it
 * doesn't get one of its own).
 *
 * Sourced from Wikipedia/Mappr, not official government data. The
 * Armenian names are solid; the Russian transliterations should be
 * eyeballed by a native speaker before this ships.
 *
 * Armavir marz's capital is also named Armavir — identical to the
 * marz-wide entry seeded above. "(city)" / "(քաղաք)" / "(город)"
 * disambiguates it in all three locales without touching that existing
 * row or its slug.
 */
const marzCapitals: NewDistrict[] = [
  {
    slug: 'ashtarak',
    nameHy: 'Աշտարակ',
    nameRu: 'Аштарак',
    nameEn: 'Ashtarak',
    region: 'aragatsotn',
  },
  { slug: 'artashat', nameHy: 'Արտաշատ', nameRu: 'Арташат', nameEn: 'Artashat', region: 'ararat' },
  {
    slug: 'armavir-city',
    nameHy: 'Արմավիր (քաղաք)',
    nameRu: 'Армавир (город)',
    nameEn: 'Armavir (city)',
    region: 'armavir',
  },
  { slug: 'gavar', nameHy: 'Գավառ', nameRu: 'Гавар', nameEn: 'Gavar', region: 'gegharkunik' },
  { slug: 'hrazdan', nameHy: 'Հրազդան', nameRu: 'Раздан', nameEn: 'Hrazdan', region: 'kotayk' },
  { slug: 'vanadzor', nameHy: 'Վանաձոր', nameRu: 'Ванадзор', nameEn: 'Vanadzor', region: 'lori' },
  { slug: 'gyumri', nameHy: 'Գյումրի', nameRu: 'Гюмри', nameEn: 'Gyumri', region: 'shirak' },
  { slug: 'kapan', nameHy: 'Կապան', nameRu: 'Капан', nameEn: 'Kapan', region: 'syunik' },
  { slug: 'ijevan', nameHy: 'Իջևան', nameRu: 'Иджеван', nameEn: 'Ijevan', region: 'tavush' },
  {
    slug: 'yeghegnadzor',
    nameHy: 'Եղեգնաձոր',
    nameRu: 'Ехегнадзор',
    nameEn: 'Yeghegnadzor',
    region: 'vayots-dzor',
  },
];

const categoryRows: NewCategory[] = [
  { slug: 'furniture', nameHy: 'Կահույք', nameRu: 'Мебель', nameEn: 'Furniture' },
  {
    slug: 'appliances',
    nameHy: 'Կենցաղային տեխնիկա',
    nameRu: 'Бытовая техника',
    nameEn: 'Appliances',
  },
  { slug: 'electronics', nameHy: 'Էլեկտրոնիկա', nameRu: 'Электроника', nameEn: 'Electronics' },
  { slug: 'clothes', nameHy: 'Հագուստ', nameRu: 'Одежда', nameEn: 'Clothes' },
  { slug: 'kids', nameHy: 'Մանկական', nameRu: 'Детское', nameEn: 'Kids' },
  { slug: 'books', nameHy: 'Գրքեր', nameRu: 'Книги', nameEn: 'Books' },
  {
    slug: 'kitchen',
    nameHy: 'Խոհանոցային պարագաներ',
    nameRu: 'Кухонная утварь',
    nameEn: 'Kitchen',
  },
  {
    slug: 'building_materials',
    nameHy: 'Շինանյութ',
    nameRu: 'Стройматериалы',
    nameEn: 'Building materials',
  },
  { slug: 'plants', nameHy: 'Բույսեր', nameRu: 'Растения', nameEn: 'Plants' },
  { slug: 'other', nameHy: 'Այլ', nameRu: 'Другое', nameEn: 'Other' },
].map((c, position) => ({ ...c, position }));

/**
 * Idempotent — safe to re-run. Conflicts on `slug` refresh the
 * translations rather than being skipped, so fixing a name and
 * re-seeding actually applies it.
 */
async function seed(): Promise<void> {
  const districtRows = [...yerevanDistricts, ...marzes, ...marzCapitals];

  await db
    .insert(districts)
    .values(districtRows)
    .onConflictDoUpdate({
      target: districts.slug,
      set: {
        nameHy: sql`excluded.name_hy`,
        nameRu: sql`excluded.name_ru`,
        nameEn: sql`excluded.name_en`,
        region: sql`excluded.region`,
      },
    });

  await db
    .insert(categories)
    .values(categoryRows)
    .onConflictDoUpdate({
      target: categories.slug,
      set: {
        nameHy: sql`excluded.name_hy`,
        nameRu: sql`excluded.name_ru`,
        nameEn: sql`excluded.name_en`,
        position: sql`excluded.position`,
      },
    });

  console.log(`seeded ${districtRows.length} districts, ${categoryRows.length} categories`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
