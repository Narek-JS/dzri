import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';

/**
 * Resolves the locale for every page request — from the `/ru`/`/en`
 * prefix, then the `NEXT_LOCALE` cookie, then `Accept-Language` — and
 * redirects or rewrites accordingly. There is no auth middleware to
 * compose with: sessions are read cookie-only inside route handlers and
 * server components (`src/lib/auth/session.ts`), never at the edge, so
 * this is the only middleware in the app.
 */
export default createMiddleware(routing);

export const config = {
  // Runs on page routes only. `/api` has its own error envelope and must
  // never be rewritten or redirected by locale detection; `/_next` is
  // Next's own asset pipeline; anything with a dot in the last segment
  // (favicon.ico, robots.txt, …) is a static file, not a page.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
