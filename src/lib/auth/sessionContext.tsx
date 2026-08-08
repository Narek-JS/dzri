'use client';

import { createContext, useContext } from 'react';

import type { Session } from './session';

/**
 * Client-side mirror of `getSession()` — the same `Session | null` a
 * server component gets, handed down once from `[locale]/layout.tsx` so
 * the header and nav (client components, for locale-aware pathname
 * hooks and interactivity) don't each need their own cookie read.
 *
 * `undefined` (as opposed to `null`) marks "no provider above this in
 * the tree" — `useSession` throws on it, since that means the layout
 * forgot to wrap the page, not that the visitor is signed out.
 */
const SessionContext = createContext<Session | null | undefined>(undefined);

export function SessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null. Never fetches — the value came from the server. */
export function useSession(): Session | null {
  const session = useContext(SessionContext);

  if (session === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  return session;
}
