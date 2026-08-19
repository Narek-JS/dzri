import { Resend } from 'resend';

export class EmailError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Thin Resend wrapper. `RESEND_API_KEY` and `EMAIL_FROM` are read lazily,
 * never at module scope, so a `next build` on a machine without secrets
 * still succeeds — same reasoning as every other provider under `lib/`.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new EmailError('Email not configured: RESEND_API_KEY and EMAIL_FROM are not both set');
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  if (error) {
    throw new EmailError(`Resend returned an error: ${error.message}`, error);
  }
}
