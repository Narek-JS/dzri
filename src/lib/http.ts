import { NextResponse } from 'next/server';

/**
 * Stable error codes. The client switches on `code`; `message` is for
 * logs and is never shown to a user (all user-facing copy is i18n'd on
 * the client). Add codes here — never inline a string at a call site.
 */
export type ApiErrorCode =
  // auth / OTP
  | 'INVALID_PHONE'
  | 'RATE_LIMITED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'USER_BANNED'
  | 'NAME_REQUIRED'
  // generic
  | 'INVALID_BODY'
  | 'UNAUTHORIZED'
  | 'SMS_FAILED'
  | 'INTERNAL';

const status: Record<ApiErrorCode, number> = {
  INVALID_PHONE: 400,
  RATE_LIMITED: 429,
  INVALID_CODE: 400,
  CODE_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
  USER_BANNED: 403,
  NAME_REQUIRED: 400,
  INVALID_BODY: 400,
  UNAUTHORIZED: 401,
  SMS_FAILED: 502,
  INTERNAL: 500,
};

const message: Record<ApiErrorCode, string> = {
  INVALID_PHONE: 'Phone number is not a valid Armenian (+374) number',
  RATE_LIMITED: 'Too many requests',
  INVALID_CODE: 'Verification code is incorrect or no longer valid',
  CODE_EXPIRED: 'Verification code has expired',
  TOO_MANY_ATTEMPTS: 'Too many incorrect attempts for this code',
  USER_BANNED: 'This account is banned',
  NAME_REQUIRED: 'A display name is required to create an account',
  INVALID_BODY: 'Request body failed validation',
  UNAUTHORIZED: 'Not signed in',
  SMS_FAILED: 'Could not deliver the verification code',
  INTERNAL: 'Unexpected server error',
};

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string } };

export function apiError(
  code: ApiErrorCode,
  init?: { headers?: HeadersInit },
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message: message[code] } },
    { status: status[code], headers: init?.headers },
  );
}

/**
 * `request.json()` throws on a malformed or absent body; every handler
 * would otherwise need the same try/catch.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
