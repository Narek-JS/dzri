import Link from 'next/link';

import './globals.css';

/**
 * The fallback for a URL that matches no route at all — a typo'd path, a
 * stale shared link, `/anything-not-under-a-known-segment`. Verified
 * directly against a running server (both `next dev` and a production
 * build) that this is where those land even under a syntactically valid
 * `/ru/...` or `/en/...` prefix: Next resolves "no route matches" before
 * any layout renders, so `[locale]/layout.tsx` never gets a chance to run
 * and there is no locale to read here — that's what
 * `[locale]/not-found.tsx` is for instead, and it does get used, for an
 * explicit `notFound()` call from a page that *did* match (a future
 * item-detail 404, say). Hardcoded hy/en text is the deliberate exception
 * to "all user-facing strings go through i18n": there is nothing to read
 * a translation from at this point.
 */
export default function RootNotFound() {
  return (
    <html lang="hy" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-semibold">Չգտնվեց · Not found</p>
        <Link href="/" className="text-sm text-brand-strong hover:underline">
          dzri.am
        </Link>
      </body>
    </html>
  );
}
