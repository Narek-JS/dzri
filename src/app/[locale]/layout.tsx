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
import { getSession } from '@/lib/auth/session';
import { SessionProvider } from '@/lib/auth/sessionContext';
import { manrope, notoSans, notoSansArmenian } from '@/lib/fonts';

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

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

  // Opts this layout and everything under it into static rendering — see
  // https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing.
  // getSession() below reads the session cookie regardless, which makes
  // Next render the page dynamically anyway — the header needs to know
  // who's signed in on every request, so that trade is intentional.
  setRequestLocale(locale);

  // Cookie-only (see src/lib/auth/session.ts) — cheap enough to call on
  // every page for the header, unlike requireUser()'s database round trip.
  const session = await getSession();

  return (
    <html
      lang={locale}
      className={`h-full antialiased ${notoSansArmenian.variable} ${notoSans.variable} ${manrope.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale}>
          <SessionProvider session={session}>
            <Header />
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
