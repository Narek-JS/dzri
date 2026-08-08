import type { Metadata } from 'next';

import { hasLocale } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import '../globals.css';
import { type LocaleParams, resolveLocale } from '@/i18n/params';
import { routing } from '@/i18n/routing';

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
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
