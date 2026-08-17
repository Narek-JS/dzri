import { sql } from 'drizzle-orm';

import { db } from './index';
import {
  categories,
  categoryGroups,
  districts,
  type NewCategory,
  type NewCategoryGroup,
  type NewDistrict,
} from './schema';

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

type CategorySeed = { slug: string; nameHy: string; nameRu: string; nameEn: string };

/**
 * The 11 category groups, each carrying its own categories nested — 41 in
 * total. Nesting (rather than a flat category list with a `groupSlug`
 * column) is what lets both `position` columns be derived by index below,
 * matching the editorial order CLAUDE.md's category restructure lists them
 * in, instead of being typed out by hand and risking drift from the array
 * order.
 */
const categoryGroupSeeds: {
  slug: string;
  nameHy: string;
  nameRu: string;
  nameEn: string;
  categories: CategorySeed[];
}[] = [
  {
    slug: 'furniture-decor',
    nameHy: 'Կահույք և դեկոր',
    nameRu: 'Мебель и декор',
    nameEn: 'Furniture & Decor',
    categories: [
      { slug: 'furniture', nameHy: 'Կահույք', nameRu: 'Мебель', nameEn: 'Furniture' },
      { slug: 'decor', nameHy: 'Դեկոր', nameRu: 'Декор', nameEn: 'Decor' },
      {
        slug: 'lighting',
        nameHy: 'Լուսավորություն',
        nameRu: 'Освещение',
        nameEn: 'Lighting',
      },
      {
        slug: 'rugs-textiles',
        nameHy: 'Գորգեր և տեքստիլ',
        nameRu: 'Ковры и текстиль',
        nameEn: 'Rugs & Textiles',
      },
      {
        slug: 'kitchenware',
        nameHy: 'Խոհանոցի իրեր',
        nameRu: 'Кухонная утварь',
        nameEn: 'Kitchenware',
      },
      {
        slug: 'storage',
        nameHy: 'Պահեստավորման իրեր',
        nameRu: 'Хранение',
        nameEn: 'Storage',
      },
    ],
  },
  {
    slug: 'clothing-shoes',
    nameHy: 'Հագուստ և կոշիկ',
    nameRu: 'Одежда и обувь',
    nameEn: 'Clothing & Shoes',
    categories: [
      {
        slug: 'womens-clothing',
        nameHy: 'Կանացի հագուստ',
        nameRu: 'Женская одежда',
        nameEn: "Women's Clothing",
      },
      {
        slug: 'mens-clothing',
        nameHy: 'Տղամարդու հագուստ',
        nameRu: 'Мужская одежда',
        nameEn: "Men's Clothing",
      },
      { slug: 'shoes', nameHy: 'Կոշիկ', nameRu: 'Обувь', nameEn: 'Shoes' },
      {
        slug: 'bags-accessories',
        nameHy: 'Պայուսակներ և աքսեսուարներ',
        nameRu: 'Сумки и аксессуары',
        nameEn: 'Bags & Accessories',
      },
    ],
  },
  {
    slug: 'kids',
    nameHy: 'Մանկական աշխարհ',
    nameRu: 'Детский мир',
    nameEn: 'Kids',
    categories: [
      {
        slug: 'kids-clothing',
        nameHy: 'Մանկական հագուստ',
        nameRu: 'Детская одежда',
        nameEn: "Kids' Clothing",
      },
      { slug: 'toys', nameHy: 'Խաղալիքներ', nameRu: 'Игрушки', nameEn: 'Toys' },
      {
        slug: 'strollers-kids-furniture',
        nameHy: 'Սայլակներ, մանկական կահույք',
        nameRu: 'Коляски, детская мебель',
        nameEn: "Strollers & Kids' Furniture",
      },
      {
        slug: 'school-supplies',
        nameHy: 'Դպրոցական պարագաներ',
        nameRu: 'Школьные принадлежности',
        nameEn: 'School Supplies',
      },
      {
        slug: 'feeding-supplies-kids',
        nameHy: 'Կերակրման պարագաներ',
        nameRu: 'Принадлежности для кормления',
        nameEn: 'Feeding Supplies',
      },
    ],
  },
  {
    slug: 'electronics',
    nameHy: 'Էլեկտրոնիկա',
    nameRu: 'Электроника',
    nameEn: 'Electronics',
    categories: [
      {
        slug: 'phones-accessories',
        nameHy: 'Հեռախոսներ և աքսեսուարներ',
        nameRu: 'Телефоны и аксессуары',
        nameEn: 'Phones & Accessories',
      },
      {
        slug: 'computers-tablets',
        nameHy: 'Համակարգիչներ և պլանշետներ',
        nameRu: 'Компьютеры и планшеты',
        nameEn: 'Computers & Tablets',
      },
      { slug: 'tv-audio', nameHy: 'TV և աուդիո', nameRu: 'Телевизоры и аудио', nameEn: 'TV & Audio' },
      {
        slug: 'gaming',
        nameHy: 'Խաղային տեխնիկա',
        nameRu: 'Игровая техника',
        nameEn: 'Gaming',
      },
      {
        slug: 'cables-chargers',
        nameHy: 'Մալուխներ, լիցքավորիչներ',
        nameRu: 'Кабели, зарядные устройства',
        nameEn: 'Cables & Chargers',
      },
    ],
  },
  {
    slug: 'appliances',
    nameHy: 'Կենցաղային տեխնիկա',
    nameRu: 'Бытовая техника',
    nameEn: 'Appliances',
    categories: [
      {
        slug: 'kitchen-appliances',
        nameHy: 'Խոհանոցի տեխնիկա',
        nameRu: 'Кухонная техника',
        nameEn: 'Kitchen Appliances',
      },
      {
        slug: 'washing-cleaning-appliances',
        nameHy: 'Լվացքի, մաքրման տեխնիկա',
        nameRu: 'Стиральная, чистящая техника',
        nameEn: 'Washing & Cleaning Appliances',
      },
      {
        slug: 'climate-appliances',
        nameHy: 'Կլիմայական տեխնիկա',
        nameRu: 'Климатическая техника',
        nameEn: 'Climate Appliances',
      },
      {
        slug: 'sewing-machines',
        nameHy: 'Կարի մեքենաներ',
        nameRu: 'Швейные машины',
        nameEn: 'Sewing Machines',
      },
    ],
  },
  {
    slug: 'garden',
    nameHy: 'Այգի և բակ',
    nameRu: 'Сад и двор',
    nameEn: 'Garden & Yard',
    categories: [
      { slug: 'plants', nameHy: 'Բույսեր', nameRu: 'Растения', nameEn: 'Plants' },
      {
        slug: 'garden-tools',
        nameHy: 'Այգու գործիքներ',
        nameRu: 'Садовый инвентарь',
        nameEn: 'Garden Tools',
      },
      {
        slug: 'outdoor-furniture',
        nameHy: 'Բացօթյա կահույք',
        nameRu: 'Уличная мебель',
        nameEn: 'Outdoor Furniture',
      },
    ],
  },
  {
    slug: 'tools-materials',
    nameHy: 'Գործիքներ և շինանյութ',
    nameRu: 'Инструменты и материалы',
    nameEn: 'Tools & Materials',
    categories: [
      {
        slug: 'hand-tools',
        nameHy: 'Ձեռքի գործիքներ',
        nameRu: 'Ручные инструменты',
        nameEn: 'Hand Tools',
      },
      {
        slug: 'power-tools',
        nameHy: 'Էլեկտրական գործիքներ',
        nameRu: 'Электроинструменты',
        nameEn: 'Power Tools',
      },
      {
        slug: 'building-materials-leftover',
        nameHy: 'Շինանյութի մնացորդներ',
        nameRu: 'Остатки стройматериалов',
        nameEn: 'Leftover Building Materials',
      },
      { slug: 'plumbing', nameHy: 'Սանտեխնիկա', nameRu: 'Сантехника', nameEn: 'Plumbing' },
    ],
  },
  {
    slug: 'hobby-sport',
    nameHy: 'Գրքեր, հոբբի, սպորտ',
    nameRu: 'Книги, хобби и спорт',
    nameEn: 'Books, Hobby & Sport',
    categories: [
      { slug: 'books', nameHy: 'Գրքեր', nameRu: 'Книги', nameEn: 'Books' },
      {
        slug: 'musical-instruments',
        nameHy: 'Երաժշտական գործիքներ',
        nameRu: 'Музыкальные инструменты',
        nameEn: 'Musical Instruments',
      },
      {
        slug: 'sports-equipment',
        nameHy: 'Սպորտային պարագաներ',
        nameRu: 'Спортивный инвентарь',
        nameEn: 'Sports Equipment',
      },
      {
        slug: 'collectibles-antiques',
        nameHy: 'Հավաքածուներ, հնություններ',
        nameRu: 'Коллекционные и антикварные вещи',
        nameEn: 'Collectibles & Antiques',
      },
      {
        slug: 'craft-supplies',
        nameHy: 'Ստեղծագործական պարագաներ',
        nameRu: 'Принадлежности для творчества',
        nameEn: 'Craft Supplies',
      },
    ],
  },
  {
    slug: 'beauty-health',
    nameHy: 'Գեղեցկություն և առողջություն',
    nameRu: 'Красота и здоровье',
    nameEn: 'Beauty & Health',
    categories: [
      {
        slug: 'cosmetics-perfume',
        nameHy: 'Կոսմետիկա, օծանելիք',
        nameRu: 'Косметика и парфюмерия',
        nameEn: 'Cosmetics & Perfume',
      },
      {
        slug: 'medical-supplies',
        nameHy: 'Բժշկական պարագաներ',
        nameRu: 'Медицинские принадлежности',
        nameEn: 'Medical Supplies',
      },
    ],
  },
  {
    slug: 'pet-supplies',
    nameHy: 'Կենդանիների պարագաներ',
    nameRu: 'Товары для животных',
    nameEn: 'Pet Supplies',
    categories: [
      {
        slug: 'pet-feeding-care',
        nameHy: 'Կերակրման, խնամքի պարագաներ',
        nameRu: 'Принадлежности для кормления и ухода',
        nameEn: 'Feeding & Care Supplies',
      },
      {
        slug: 'pet-toys-furniture',
        nameHy: 'Խաղալիքներ, կահույք',
        nameRu: 'Игрушки и мебель',
        nameEn: 'Toys & Furniture',
      },
    ],
  },
  {
    slug: 'other',
    nameHy: 'Այլ',
    nameRu: 'Разное',
    nameEn: 'Other',
    categories: [{ slug: 'other', nameHy: 'Այլ', nameRu: 'Разное', nameEn: 'Other' }],
  },
];

/**
 * Idempotent — safe to re-run. Conflicts on `slug` refresh the
 * translations rather than being skipped, so fixing a name and
 * re-seeding actually applies it.
 *
 * Category groups are seeded first, then categories, since a category row
 * needs its group's id — resolved from the `slug`s above with one
 * `returning()`, rather than a second round trip to look them up.
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

  const groupRows: NewCategoryGroup[] = categoryGroupSeeds.map((group, position) => ({
    slug: group.slug,
    nameHy: group.nameHy,
    nameRu: group.nameRu,
    nameEn: group.nameEn,
    position,
  }));

  const insertedGroups = await db
    .insert(categoryGroups)
    .values(groupRows)
    .onConflictDoUpdate({
      target: categoryGroups.slug,
      set: {
        nameHy: sql`excluded.name_hy`,
        nameRu: sql`excluded.name_ru`,
        nameEn: sql`excluded.name_en`,
        position: sql`excluded.position`,
      },
    })
    .returning({ id: categoryGroups.id, slug: categoryGroups.slug });

  const groupIdBySlug = new Map(insertedGroups.map((group) => [group.slug, group.id]));

  const categoryRows: NewCategory[] = categoryGroupSeeds.flatMap((group) => {
    const groupId = groupIdBySlug.get(group.slug);
    if (groupId === undefined) {
      throw new Error(`category_groups upsert did not return an id for slug "${group.slug}"`);
    }
    return group.categories.map((category, position) => ({ ...category, groupId, position }));
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
        groupId: sql`excluded.group_id`,
      },
    });

  console.log(
    `seeded ${districtRows.length} districts, ${groupRows.length} category groups, ${categoryRows.length} categories`,
  );
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
