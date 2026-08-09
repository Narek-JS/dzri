import type { NextConfig } from 'next';

import createNextIntlPlugin from 'next-intl/plugin';

/**
 * `next/image` refuses to optimize a remote host it doesn't know about, and
 * item photos are served from `R2_PUBLIC_URL` (src/lib/r2/publicUrl.ts) —
 * a bucket domain or a CDN in front of it, not fixed ahead of time. Read
 * directly from `process.env` here rather than importing `publicUrl.ts`:
 * this file runs at config-eval time, before Next has wired up any app
 * code, and the env var is exactly what the deployment already sets (see
 * .env.example) — nothing new to configure.
 *
 * Absent or unparseable is only expected where no image ever gets rendered
 * (a build with no R2 configured, e.g. most test runs) — an empty pattern
 * list there just means `next/image` has nothing to allow, not an error.
 */
function r2RemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];

    return [{ protocol: url.protocol.slice(0, -1) as 'http' | 'https', hostname: url.hostname }];
  } catch {
    return [];
  }
}

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

  images: {
    remotePatterns: r2RemotePatterns(),
  },
};

// Wires src/i18n/request.ts into the RSC render so server components can
// call getTranslations()/getMessages() without threading the locale
// through every call site by hand.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
