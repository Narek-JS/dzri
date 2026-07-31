import { SmsError, type SmsProvider } from './types';

/**
 * Placeholder for the local Armenian SMS gateway.
 *
 * The vendor is not chosen yet — DECISIONS.md records that Twilio's +374
 * pricing was rejected and that a local gateway must be priced first, and
 * lists the vendor as an open question. So this reads the credentials it
 * will need and then refuses, loudly, instead of silently dropping codes.
 *
 * To finish it: keep `send`'s signature, replace the throw with the
 * vendor's HTTP call, and map a non-2xx response to `SmsError`. Nothing
 * outside this file should need to change.
 */
export const gatewaySmsProvider: SmsProvider = {
  name: 'gateway',

  async send(phone, message) {
    const apiKey = process.env.SMS_API_KEY;
    const sender = process.env.SMS_SENDER;

    if (!apiKey || !sender) {
      throw new SmsError('SMS gateway not configured: SMS_API_KEY and SMS_SENDER are not set');
    }

    void phone;
    void message;

    throw new SmsError('SMS gateway not configured: no gateway vendor has been selected yet');
  },
};
