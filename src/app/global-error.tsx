'use client';

import './globals.css';

/**
 * Catches an error thrown by `[locale]/layout.tsx` itself, which replaces
 * the entire tree that layout would otherwise render — including
 * `NextIntlClientProvider` — so this cannot assume any provider or locale
 * context exists. Hardcoded hy/en text is the deliberate exception to "all
 * user-facing strings go through i18n": there is nothing left to read a
 * translation from at this point.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="hy" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">Ինչ-որ բան այնպես չգնաց · Something went wrong</p>
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded bg-brand px-3 py-1.5 text-sm font-medium text-neutral-900"
        >
          Փորձել կրկին · Try again
        </button>
      </body>
    </html>
  );
}
