import type { NextConfig } from 'next';

import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile above this directory otherwise
  // makes Next infer the wrong one.
  turbopack: { root: import.meta.dirname },

  // The integration test harness runs its own dev server and force-kills it
  // at the end of the run. Pointed at the default `.next`, that kill can land
  // mid-write and truncate a generated type file, which then breaks
  // `npm run typecheck` and the next test run. Its own build directory keeps
  // the damage where nothing else looks.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

// Wires src/i18n/request.ts into the RSC render so server components can
// call getTranslations()/getMessages() without threading the locale
// through every call site by hand.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
