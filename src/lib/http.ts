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
  // images
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  // item create
  | 'INVALID_CATEGORY'
  | 'INVALID_DISTRICT'
  | 'IMAGES_REQUIRED'
  | 'TOO_MANY_IMAGES'
  | 'INVALID_IMAGE_KEY'
  | 'IMAGE_NOT_FOUND'
  // item read
  | 'ITEM_NOT_FOUND'
  // claims
  | 'CANNOT_CLAIM_OWN_ITEM'
  | 'ALREADY_CLAIMED'
  | 'CLAIM_NOT_FOUND'
  // moderation
  | 'INVALID_STATUS_TRANSITION'
  // generic
  | 'NOT_FOUND'
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
  INVALID_FILE_TYPE: 400,
  FILE_TOO_LARGE: 400,
  INVALID_CATEGORY: 400,
  INVALID_DISTRICT: 400,
  IMAGES_REQUIRED: 400,
  TOO_MANY_IMAGES: 400,
  INVALID_IMAGE_KEY: 400,
  IMAGE_NOT_FOUND: 400,
  ITEM_NOT_FOUND: 404,
  CANNOT_CLAIM_OWN_ITEM: 400,
  ALREADY_CLAIMED: 409,
  CLAIM_NOT_FOUND: 404,
  INVALID_STATUS_TRANSITION: 409,
  NOT_FOUND: 404,
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
  INVALID_FILE_TYPE: 'File type is not an allowed image format',
  FILE_TOO_LARGE: 'File exceeds the maximum allowed size',
  INVALID_CATEGORY: 'Category does not exist',
  INVALID_DISTRICT: 'District does not exist',
  IMAGES_REQUIRED: 'At least one image is required',
  TOO_MANY_IMAGES: 'Too many images for one item',
  INVALID_IMAGE_KEY: 'An image key is malformed or not owned by the caller',
  IMAGE_NOT_FOUND: 'A referenced image was never uploaded',
  ITEM_NOT_FOUND: 'No item with that id is visible to the requester',
  CANNOT_CLAIM_OWN_ITEM: 'A giver cannot claim their own item',
  ALREADY_CLAIMED: 'This user already has a claim on this item',
  CLAIM_NOT_FOUND: 'No claim with that id is visible to the requester',
  INVALID_STATUS_TRANSITION:
    'The item or claim is not in a status from which this action is allowed',
  NOT_FOUND: 'Not found',
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
