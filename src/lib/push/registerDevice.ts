import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Guards `registerDevice` to at most once per page session. The one call
 * site (`completeSignIn` in the login page) only runs once per successful
 * sign-in anyway, but this stays defensive against React StrictMode's
 * double-invoke in dev and against a second sign-in happening later in the
 * same tab (logout, then a different account).
 */
let hasRegistered = false;

/**
 * Asks for push permission and hands the resulting device token to the
 * server. Called once, right after sign-in completes.
 *
 * A no-op on regular web: `mobile/` loads this same web app in a WebView,
 * so `Capacitor.isNativePlatform()` is the only signal that distinguishes
 * "running inside the native shell," where `@capacitor/push-notifications`
 * has a real bridge to talk to, from "running in a browser tab," where it
 * does not. Safe to call unconditionally from either.
 *
 * Never throws. Permission can be denied, the platform can have no bridge,
 * the register POST can fail — none of that is the caller's problem, and a
 * user who just finished signing in must not see any of it.
 */
export function registerDevice(): void {
  if (hasRegistered) return;
  if (!Capacitor.isNativePlatform()) return;

  hasRegistered = true;
  void runRegistration();
}

async function runRegistration(): Promise<void> {
  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.addListener('registration', (token) => {
      void submitToken(token.value);
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error', error.error);
    });

    await PushNotifications.register();
  } catch (error) {
    console.error('Push registration failed', error);
  }
}

async function submitToken(token: string): Promise<void> {
  try {
    await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
  } catch (error) {
    console.error('Failed to send push token to server', error);
  }
}
