import type { SmsProvider } from './types';

/**
 * Development only. Prints the message — including the code — to the
 * server console so there is nothing to sign up for to log in locally.
 *
 * `getSmsProvider()` only ever returns this outside production, which is
 * the one thing keeping a real code out of the logs.
 */
export const consoleSmsProvider: SmsProvider = {
  name: 'console',

  async send(phone, message) {
    console.log(`\n[sms:console] → ${phone}\n${message}\n`);
  },
};
