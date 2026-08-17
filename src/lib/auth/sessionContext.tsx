'use client';

import { createContext, useContext } from 'react';

import type { Session } from './session';

/**
 * Client-side mirror of `getSession()`, plus `isAdmin` and `avatarUrl` —
 * neither of which `Session` itself carries, since the JWT only encodes
 * `displayName` (see `signSessionToken` in `jwt.ts`). `[locale]/layout.tsx`
 * resolves both together with one `getSessionProfile()` database call and
 * hands them down once, so the header and nav (client components, for
 * locale-aware pathname hooks and interactivity) don't each need their own
 * check. `isAdmin` in particular is read fresh from the database rather
 * than trusted from a JWT claim, so a revoked admin can't keep nav access
 * via a stale 90-day cookie; see `requireAdmin` in `session.ts` for the
 * equivalent gate route handlers use.
 *
 * `undefined` (as opposed to `null`) marks "no provider above this in
 * the tree" — `useSession` throws on it, since that means the layout
 * forgot to wrap the page, not that the visitor is signed out.
 */
export type ClientSession = Session & { isAdmin: boolean; avatarUrl: string | null };

const SessionContext = createContext<ClientSession | null | undefined>(undefined);

export function SessionProvider({
  session,
  children,
}: {
  session: ClientSession | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null. Never fetches — the value came from the server. */
export function useSession(): ClientSession | null {
  const session = useContext(SessionContext);

  if (session === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  return session;
}
