import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { deviceTokens } from '@/db/schema';

export class PushError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PushError';
  }
}

/** The shape of the JSON Firebase hands out — snake_case, straight off the download. */
type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseServiceAccountKey(raw: string): ServiceAccount {
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch (error) {
    throw new PushError('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON', error);
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new PushError(
      'FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id, client_email, or private_key',
    );
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

let app: App | null = null;

/**
 * `FIREBASE_SERVICE_ACCOUNT_KEY` is read lazily, never at module scope, so a
 * `next build` on a machine without secrets still succeeds — same reasoning
 * as every other provider under `lib/`. Initialized once and cached; a
 * second call reuses the same app rather than re-registering it, which
 * firebase-admin throws on.
 */
function getPushApp(): App {
  if (app) return app;

  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    throw new PushError('Push not configured: FIREBASE_SERVICE_ACCOUNT_KEY is not set');
  }

  app = initializeApp({ credential: cert(parseServiceAccountKey(key)) });
  return app;
}

/**
 * FCM error codes for a token that will never succeed again — the app was
 * uninstalled, or the token was rotated out from under a stale registration.
 * Self-healing, same reasoning as the sweep cron cleaning up stale rows
 * elsewhere in this project (CLAUDE.md).
 */
const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

/**
 * Sends a push notification to every device registered for `userId`.
 *
 * Never throws past its own boundary: a push is a side effect of some other
 * action (a claim was created, a claim was approved), and a caller's HTTP
 * response must never change shape or status because FCM is unreachable, a
 * key is missing, or misconfigured. Every failure is caught and logged
 * instead.
 */
export async function sendPushToUser(
  userId: string,
  notification: PushNotification,
): Promise<void> {
  try {
    const tokens = await db
      .select({ id: deviceTokens.id, token: deviceTokens.token })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));

    if (tokens.length === 0) return;

    const messaging = getMessaging(getPushApp());

    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map((row) => row.token),
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    });

    const staleIds = response.responses
      .map((result, index) => ({ result, id: tokens[index].id }))
      .filter(
        ({ result }) =>
          !result.success && !!result.error && STALE_TOKEN_CODES.has(result.error.code),
      )
      .map(({ id }) => id);

    if (staleIds.length > 0) {
      await db.delete(deviceTokens).where(inArray(deviceTokens.id, staleIds));
    }
  } catch (error) {
    console.error('sendPushToUser failed', error);
  }
}
