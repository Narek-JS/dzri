import { getTranslations, setRequestLocale } from 'next-intl/server';

import { containerClassName } from '@/components/ui/Container';
import { redirect } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/auth/session';
import { getReferenceData } from '@/lib/reference';

import { CreateItemForm } from './CreateItemForm';

/**
 * The locale-less path `resolveSafeNext` expects and the login page's
 * `next` param round-trips back to. Must never carry a locale prefix
 * (src/lib/safeNext.ts) — `redirect()` below adds the current one itself.
 */
const CREATE_ITEM_PATH = '/items/new';

/**
 * Post an item: gate on a session, then hand reference data to the client
 * form as props. `getSession()` is the cheap cookie-only check (same one
 * the layout uses for the header) — enough to decide "signed in or not";
 * the route handler is what actually enforces auth on submit.
 *
 * Reference data (districts, categories) is fetched here, server-side, and
 * passed down as props rather than left for the client form to fetch after
 * mount — one request instead of a client-side waterfall, and no risk of a
 * moment where the dropdowns are empty.
 */
export default async function CreateItemPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: '/login', query: { next: CREATE_ITEM_PATH } }, locale });
  }

  const [{ districts, categories }, t] = await Promise.all([
    getReferenceData(),
    getTranslations('pages'),
  ]);

  return (
    <main className={containerClassName({ size: 'sm', className: 'flex-1 py-10' })}>
      <h1 className="mb-6 text-2xl font-semibold">{t('create')}</h1>
      <CreateItemForm districts={districts} categories={categories} />
    </main>
  );
}
