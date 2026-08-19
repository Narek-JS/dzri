import type { Metadata } from 'next';

import { hasLocale } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import '../globals.css';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { routing } from '@/i18n/routing';
import { getSession, getSessionProfile } from '@/lib/auth/session';
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

/** OG locale tags (`language_TERRITORY`) for the three routing.locales. */
const OG_LOCALES: Record<(typeof routing.locales)[number], string> = {
  hy: 'hy_AM',
  ru: 'ru_RU',
  en: 'en_US',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'shell' });

  const wordmark = t('wordmark');
  const bio = t('bio');
  // `localePrefix: 'as-needed'` (src/i18n/routing.ts) — hy is the bare root,
  // ru/en get a path prefix.
  const path = locale === routing.defaultLocale ? '/' : `/${locale}`;
  const otherLocales = routing.locales.filter((candidate) => candidate !== locale);

  return {
    metadataBase: new URL('https://dzri.am'),
    title: wordmark,
    description: t('footer.tagline'),
    openGraph: {
      title: wordmark,
      description: bio,
      url: path,
      siteName: wordmark,
      locale: OG_LOCALES[locale],
      alternateLocale: otherLocales.map((candidate) => OG_LOCALES[candidate]),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: wordmark,
      description: bio,
    },
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

  // Whether to render the Admin nav link, and the header's avatar photo.
  // Only checked for a signed-in visitor, since `getSessionProfile()` is a
  // database round trip and every anonymous request trivially has neither.
  // `isAdmin` is deliberately re-read from the database on every render
  // rather than trusted from a claim embedded in the JWT — see the note on
  // `ClientSession` — so revoking is_admin takes effect on the very next
  // page load, not in up to 90 days.
  const profile = session ? await getSessionProfile(session.userId) : null;

  return (
    <html
      lang={locale}
      className={`h-full antialiased ${notoSansArmenian.variable} ${notoSans.variable} ${manrope.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale}>
          <SessionProvider
            session={
              session && profile
                ? { ...session, isAdmin: profile.isAdmin, avatarUrl: profile.avatarUrl }
                : null
            }
          >
            <LanguagePicker />
            <Header />
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
