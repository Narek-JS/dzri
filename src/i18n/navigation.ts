import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware drop-ins for `next/link` and `next/navigation`. `Link`
 * writes the right prefix (none for hy, `/ru` or `/en` otherwise);
 * `usePathname` strips the prefix back off so route code never has to
 * think about it.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
