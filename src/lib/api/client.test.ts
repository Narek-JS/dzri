import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, api, apiErrorMessageKey } from './client';

import type { ApiErrorCode } from '@/lib/http';

import hy from '../../../messages/hy.json';

/** Follows a dotted path like 'errors.notFound' into a nested object. */
function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[segment];
  }, source);
}

const ALL_CODES: ApiErrorCode[] = [
  'INVALID_PHONE',
  'RATE_LIMITED',
  'INVALID_CODE',
  'CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'USER_BANNED',
  'NAME_REQUIRED',
  'INVALID_FILE_TYPE',
  'FILE_TOO_LARGE',
  'INVALID_CATEGORY',
  'INVALID_DISTRICT',
  'IMAGES_REQUIRED',
  'TOO_MANY_IMAGES',
  'INVALID_IMAGE_KEY',
  'IMAGE_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'CANNOT_CLAIM_OWN_ITEM',
  'ALREADY_CLAIMED',
  'CLAIM_NOT_FOUND',
  'INVALID_STATUS_TRANSITION',
  'NOT_FOUND',
  'INVALID_BODY',
  'UNAUTHORIZED',
  'SMS_FAILED',
  'INTERNAL',
];

describe('apiErrorMessageKey', () => {
  it('maps every ApiErrorCode to a key that exists in the message catalog', () => {
    for (const code of ALL_CODES) {
      const key = apiErrorMessageKey(code);
      expect(resolvePath(hy, key), `${code} -> ${key}`).toBeTypeOf('string');
    }
  });

  // API.md Rule 2: several endpoints return 404 where 403 would be natural,
  // deliberately, so the UI must render "not found," never "no permission."
  it('maps every 404-producing code to the same generic not-found key', () => {
    expect(apiErrorMessageKey('ITEM_NOT_FOUND')).toBe('errors.notFound');
    expect(apiErrorMessageKey('CLAIM_NOT_FOUND')).toBe('errors.notFound');
    expect(apiErrorMessageKey('NOT_FOUND')).toBe('errors.notFound');
  });
});

describe('ApiClientError', () => {
  it('carries the status and code separately from the log-only message', () => {
    const error = new ApiClientError(404, 'ITEM_NOT_FOUND', 'No item with that id is visible');

    expect(error.status).toBe(404);
    expect(error.code).toBe('ITEM_NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('carries an explicit retryAfterSeconds when given one', () => {
    const error = new ApiClientError(429, 'RATE_LIMITED', 'Too many requests', 30);

    expect(error.retryAfterSeconds).toBe(30);
  });
});

describe('retryAfterSeconds parsed off a 429 response', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(headers: Record<string, string>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'log only' } }), {
            status: 429,
            headers,
          }),
      ),
    );
  }

  async function requestOtpError(): Promise<ApiClientError> {
    const error: unknown = await api.auth.requestOtp({ phone: '077123456' }).catch((e) => e);

    if (!(error instanceof ApiClientError)) {
      throw new Error('expected api.auth.requestOtp to reject with an ApiClientError');
    }

    return error;
  }

  it('is the whole-second value when the header is present', async () => {
    stubFetch({ 'Retry-After': '30' });

    expect((await requestOtpError()).retryAfterSeconds).toBe(30);
  });

  it('is undefined when the header is absent', async () => {
    stubFetch({});

    expect((await requestOtpError()).retryAfterSeconds).toBeUndefined();
  });

  it('is undefined when the header is not a whole non-negative integer', async () => {
    stubFetch({ 'Retry-After': 'soon' });

    expect((await requestOtpError()).retryAfterSeconds).toBeUndefined();
  });
});
