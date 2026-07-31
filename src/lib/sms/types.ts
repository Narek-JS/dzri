/**
 * The seam the gateway vendor plugs into. DECISIONS.md still lists the
 * Armenian gateway as an open question, so nothing above this interface
 * may know which vendor sends the message.
 */
export interface SmsProvider {
  /** Human-readable, for logs. */
  readonly name: string;
  /**
   * @param phone E.164, already normalized.
   * @throws SmsError when the message could not be handed to the carrier.
   */
  send(phone: string, message: string): Promise<void>;
}

export class SmsError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SmsError';
  }
}
