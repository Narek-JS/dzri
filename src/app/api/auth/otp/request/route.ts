import { NextResponse } from 'next/server';

import { z } from 'zod';

import { OTP_TTL_MINUTES, issueOtpCode } from '@/lib/auth/otp';
import { apiError, readJson } from '@/lib/http';
import { MAX_PHONE_INPUT_LENGTH, normalizeArmenianPhone } from '@/lib/phone';
import {
  getClientIp,
  otpRequestCooldown,
  otpRequestPerIp,
  otpRequestPerPhone,
  retryAfterHeader,
} from '@/lib/ratelimit';
import { SmsError, getSmsProvider, otpMessage } from '@/lib/sms';

const requestSchema = z.object({
  phone: z.string().min(1).max(MAX_PHONE_INPUT_LENGTH),
});

/**
 * The only success shape this endpoint has. It is returned whether the
 * number belongs to an existing account or a brand-new one — anything
 * that differs between the two turns this into an oracle for "does this
 * person have a dzri account", which is exactly the kind of leak the
 * whole phone-privacy model exists to prevent.
 */
const success = { sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 } as const;

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError('INVALID_PHONE');
  }

  const phone = normalizeArmenianPhone(parsed.data.phone);

  if (!phone) {
    return apiError('INVALID_PHONE');
  }

  // Limiters run before anything else touches the database or the SMS
  // provider (CLAUDE.md). Order matters: the 30-second cooldown is
  // checked first so an impatient double-tap costs a cooldown rather
  // than one of only three codes an hour.
  const cooldown = await otpRequestCooldown().limit(phone);
  if (!cooldown.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(cooldown.reset) });
  }

  const perPhone = await otpRequestPerPhone().limit(phone);
  if (!perPhone.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perPhone.reset) });
  }

  const perIp = await otpRequestPerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const { code } = await issueOtpCode(phone);

  try {
    await getSmsProvider().send(phone, otpMessage(code, OTP_TTL_MINUTES));
  } catch (error) {
    // The code is already stored and the budgets already spent. Say the
    // delivery failed rather than claiming a message is on its way — but
    // still without revealing anything about the account.
    console.error('[otp:request] SMS delivery failed', {
      phone,
      reason: error instanceof SmsError ? error.message : 'unknown',
    });

    return apiError('SMS_FAILED');
  }

  return NextResponse.json(success);
}
