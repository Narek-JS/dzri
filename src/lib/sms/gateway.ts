import { SmsError, type SmsProvider } from './types';

const SEND_URL = 'https://msg.messaggio.com/api/v1/send';

/**
 * Messaggio, chosen per DECISIONS.md — see "SMS gateway vendor chosen:
 * Messaggio" for the pricing comparison and why no signature header is
 * sent. `MESSAGGIO_SECRET_KEY` exists in the environment but is unused
 * here; a confirmed live test on 2026-08-16 delivered with only the
 * `Messaggio-Login` header.
 */
export const gatewaySmsProvider: SmsProvider = {
  name: 'gateway',

  async send(phone, message) {
    const login = process.env.MESSAGGIO_PROJECT_LOGIN;
    const sender = process.env.MESSAGGIO_SENDER_CODE;

    if (!login || !sender) {
      throw new SmsError(
        'SMS gateway not configured: MESSAGGIO_PROJECT_LOGIN and MESSAGGIO_SENDER_CODE are not set',
      );
    }

    let response: Response;
    try {
      response = await fetch(SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Messaggio-Login': login,
        },
        body: JSON.stringify({
          recipients: [{ phone }],
          channels: ['sms'],
          sms: { from: sender, content: [{ type: 'text', text: message }] },
        }),
      });
    } catch (error) {
      throw new SmsError('SMS gateway request failed', error);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new SmsError(`SMS gateway returned ${response.status}: ${body}`);
    }
  },
};
