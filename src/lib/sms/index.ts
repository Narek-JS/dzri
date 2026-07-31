import { consoleSmsProvider } from './console';
import { gatewaySmsProvider } from './gateway';
import type { SmsProvider } from './types';

export { SmsError } from './types';
export type { SmsProvider } from './types';
export { otpMessage } from './messages';

/**
 * Chosen by NODE_ENV, read lazily so a build without secrets still works.
 * Production gets the real gateway; everything else prints to the console.
 */
export function getSmsProvider(): SmsProvider {
  return process.env.NODE_ENV === 'production' ? gatewaySmsProvider : consoleSmsProvider;
}
