import { getTranslations, setRequestLocale } from 'next-intl/server';

import { containerClassName } from '@/components/ui/Container';
import { redirect } from '@/i18n/navigation';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { requireUser } from '@/lib/auth/session';

import { DeleteAccountSection } from './DeleteAccountSection';

/**
 * The locale-less path the login page's `next` param round-trips back to
 * (src/lib/safeNext.ts) — mirrors `MY_CLAIMS_PATH` in `my/claims/page.tsx`.
 */
const MY_ACCOUNT_PATH = '/my/account';

/**
 * Account settings. Today this is one thing: deleting the account
 * (DECISIONS.md, 2026-08-30) — Google Play requires an in-app path to it for
 * any app with account creation. Server component, same gate as
 * `/my/claims` and `/my/items`: a signed-out visitor is redirected to login
 * with a `next` back here, not shown a 404, because this page's existence at
 * a fixed, nav-reachable path is not a secret.
 */
export default async function MyAccountPage({ params }: { params: Promise<LocaleParams> }) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const user = await requireUser();
  if (!user) {
    return redirect({ href: { pathname: '/login', query: { next: MY_ACCOUNT_PATH } }, locale });
  }

  const t = await getTranslations();

  return (
    <main
      className={containerClassName({ size: 'sm', className: 'flex flex-1 flex-col gap-6 py-8' })}
    >
      <h1 className="text-2xl font-semibold text-neutral-900">{t('pages.account')}</h1>

      <DeleteAccountSection />
    </main>
  );
}
