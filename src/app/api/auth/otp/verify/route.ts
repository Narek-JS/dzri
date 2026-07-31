import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
  consumeOtpCode,
  findActiveOtpCode,
  hashOtpCode,
  otpHashesMatch,
  recordFailedOtpAttempt,
} from '@/lib/auth/otp';
import { setSessionCookie } from '@/lib/auth/session';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  type AuthUser,
  createOrTouchUser,
  findUserByPhone,
  touchLastSeen,
} from '@/lib/auth/users';
import { type ApiErrorCode, apiError, readJson } from '@/lib/http';
import { MAX_PHONE_INPUT_LENGTH, normalizeArmenianPhone } from '@/lib/phone';
import { getClientIp, otpVerifyPerIp, otpVerifyPerPhone, retryAfterHeader } from '@/lib/ratelimit';

const verifySchema = z.object({
  phone: z.string().min(1).max(MAX_PHONE_INPUT_LENGTH),
  code: z.string().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`)),
  /**
   * Only read when the phone has no account yet. For an existing user it
   * is ignored — logging in is not how you rename yourself.
   */
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH)
    .max(DISPLAY_NAME_MAX_LENGTH)
    .nullish(),
});

/**
 * Discriminated on `isNewUser` rather than on the status code: both arms
 * are a 200, because a valid code for a phone with no account yet is a
 * step in the flow, not a failure.
 *
 * `isNewUser: true` means the code was correct but is still unconsumed —
 * re-submit the same code together with a `displayName`.
 */
type VerifyResponse =
  { isNewUser: true } | { isNewUser: false; user: { id: string; displayName: string } };

/** Map a schema failure onto the stable code for the field that failed. */
function bodyErrorCode(error: z.ZodError): ApiErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));

  if (fields.has('phone')) return 'INVALID_PHONE';
  if (fields.has('code')) return 'INVALID_CODE';
  if (fields.has('displayName')) return 'NAME_REQUIRED';

  return 'INVALID_BODY';
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJson(request);
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    return apiError(bodyErrorCode(parsed.error));
  }

  const phone = normalizeArmenianPhone(parsed.data.phone);

  if (!phone) {
    return apiError('INVALID_PHONE');
  }

  // The per-code attempt counter kills one code; these cap how many codes
  // a caller can burn through, and how many queries they can force.
  const perPhone = await otpVerifyPerPhone().limit(phone);
  if (!perPhone.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perPhone.reset) });
  }

  const perIp = await otpVerifyPerIp().limit(getClientIp(request));
  if (!perIp.success) {
    return apiError('RATE_LIMITED', { headers: retryAfterHeader(perIp.reset) });
  }

  const record = await findActiveOtpCode(phone);

  if (!record) {
    return apiError('INVALID_CODE');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return apiError('CODE_EXPIRED');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return apiError('TOO_MANY_ATTEMPTS');
  }

  if (!otpHashesMatch(record.codeHash, hashOtpCode(phone, parsed.data.code))) {
    const attempts = await recordFailedOtpAttempt(record.id);

    return apiError(attempts >= OTP_MAX_ATTEMPTS ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE');
  }

  // The code is correct from here on.
  const displayName = parsed.data.displayName ?? null;
  const existing = await findUserByPhone(phone);

  // `users.display_name` is NOT NULL and a placeholder would become the
  // name a stranger sees on a listing. So: hand the client back a flag,
  // leave the code unconsumed, and let it re-submit with a real name.
  if (!existing && displayName === null) {
    return NextResponse.json<VerifyResponse>({ isNewUser: true });
  }

  // Consume before doing anything else. The `consumed_at is null` guard
  // inside makes this the point at which two racing verifications of the
  // same code are resolved — exactly one of them proceeds.
  if (!(await consumeOtpCode(record.id))) {
    return apiError('INVALID_CODE');
  }

  let user: AuthUser;

  if (existing) {
    if (existing.isBanned) {
      return apiError('USER_BANNED');
    }

    await touchLastSeen(existing.id);
    user = existing;
  } else if (displayName !== null) {
    // Upsert, not insert: another request may have created this phone
    // between the lookup above and here.
    user = await createOrTouchUser(phone, displayName);

    if (user.isBanned) {
      return apiError('USER_BANNED');
    }
  } else {
    // Unreachable — guarded above. Here so the compiler proves that no
    // path reaches user creation without a name.
    return apiError('NAME_REQUIRED');
  }

  await setSessionCookie(user.id, user.displayName);

  return NextResponse.json<VerifyResponse>({
    isNewUser: false,
    user: { id: user.id, displayName: user.displayName },
  });
}
