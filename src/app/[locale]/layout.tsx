import type { Metadata } from 'next';

import { hasLocale } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import '../globals.css';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { routing } from '@/i18n/routing';
import { getSession, requireAdmin } from '@/lib/auth/session';
import { SessionProvider } from '@/lib/auth/sessionContext';
import { manrope, notoSans, notoSansArmenian } from '@/lib/fonts';

/**
 * There used to be a `generateStaticParams` here returning `routing.locales`,
 * on the theory that `getSession()` below (which reads the session cookie on
 * every render) would force dynamic rendering regardless, so declaring the
 * locales as static params was a harmless nod to next-intl's own docs.
 *
 * It was not harmless. In dev (`next dev`, Turbopack), Next writes every
 * path `generateStaticParams` returns into `.next/dev/prerender-manifest.json`
 * as soon as the route is first hit — independent of whether the render also
 * reads a dynamic API — and a route present in that manifest gets treated as
 * SSG for client-router (RSC) navigations specifically: the server tags the
 * response `x-nextjs-cache` / `NEXT_IS_PRERENDER_HEADER`, and the client
 * router then caches it under the `static` staleTime bucket (300s) instead
 * of `dynamic` (0s, always-revalidate). Confirmed by inspecting that
 * manifest directly — it listed `/hy`, `/ru`, `/en` and every nested page
 * under them — and by capturing real `router.push`/`router.refresh` traffic
 * in a browser, where both came back `x-nextjs-cache: HIT` serving the
 * pre-sign-in render. That is what left the header showing "log in" after a
 * real sign-in until a full reload bypassed the client router entirely.
 *
 * `force-dynamic` is the explicit version of what the removed comment
 * assumed implicitly: this layout is never eligible for the Full Route
 * Cache, full stop — `npm run build` already showed every `[locale]` route
 * as `ƒ Dynamic`, so no real static optimization is lost.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'shell' });

  return {
    title: t('wordmark'),
    description: t('footer.tagline'),
  };
}

/**
 * The only layout in the app — there is no `src/app/layout.tsx`. Next
 * treats this as the root layout because nothing above it in the tree
 * defines `<html>`/`<body>`, which is what next-intl's own app router
 * setup relies on: everything under here shares one locale.
 *
 * `src/app/api` sits outside this segment entirely and never renders
 * through it.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<LocaleParams>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Still required by next-intl even without generateStaticParams — see
  // https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing.
  // It just no longer buys any static rendering here (see `dynamic` above).
  setRequestLocale(locale);

  // Cookie-only (see src/lib/auth/session.ts) — cheap enough to call on
  // every page for the header, unlike requireUser()'s database round trip.
  const session = await getSession();

  // Whether to render the Admin nav link. Only checked for a signed-in
  // visitor, since `requireAdmin()` is a database round trip and every
  // anonymous request is trivially not an admin. Deliberately re-read
  // from the database on every render rather than trusting a claim
  // embedded in the JWT — see the note on `ClientSession` — so revoking
  // is_admin takes effect on the very next page load, not in up to 90
  // days.
  const isAdmin = session ? (await requireAdmin()) !== null : false;

  return (
    <html
      lang={locale}
      className={`h-full antialiased ${notoSansArmenian.variable} ${notoSans.variable} ${manrope.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale}>
          <SessionProvider session={session ? { ...session, isAdmin } : null}>
            <Header />
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
