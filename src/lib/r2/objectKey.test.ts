import { describe, expect, it } from 'vitest';

import { ALLOWED_IMAGE_CONTENT_TYPES, generateObjectKey, isAllowedContentType } from './objectKey';

// A user id shaped like the real thing (users.id is a v4 uuid), so the
// namespacing assertions match production keys.
const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('isAllowedContentType', () => {
  it('accepts jpeg, png and webp', () => {
    expect(isAllowedContentType('image/jpeg')).toBe(true);
    expect(isAllowedContentType('image/png')).toBe(true);
    expect(isAllowedContentType('image/webp')).toBe(true);
  });

  it('rejects anything outside the allowlist', () => {
    expect(isAllowedContentType('image/gif')).toBe(false);
    expect(isAllowedContentType('image/svg+xml')).toBe(false);
    expect(isAllowedContentType('application/octet-stream')).toBe(false);
    expect(isAllowedContentType('text/html')).toBe(false);
    expect(isAllowedContentType('')).toBe(false);
    // Not fooled by a prototype-chain property name.
    expect(isAllowedContentType('toString')).toBe(false);
  });
});

describe('generateObjectKey', () => {
  it('namespaces the key under uploads/{userId}/', () => {
    const key = generateObjectKey(USER_ID, 'image/jpeg');

    expect(key.startsWith(`uploads/${USER_ID}/`)).toBe(true);
  });

  it('derives the extension from the content type, not a filename', () => {
    expect(generateObjectKey(USER_ID, 'image/jpeg').endsWith('.jpg')).toBe(true);
    expect(generateObjectKey(USER_ID, 'image/png').endsWith('.png')).toBe(true);
    expect(generateObjectKey(USER_ID, 'image/webp').endsWith('.webp')).toBe(true);
  });

  it('produces a full uploads/{userId}/{uuid}.{ext} shape', () => {
    const key = generateObjectKey(USER_ID, 'image/webp');

    // uploads / <userId> / <uuidv4>.webp
    expect(key).toMatch(
      new RegExp(
        `^uploads/${USER_ID}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`,
      ),
    );
  });

  it('is unique across calls, so two uploads never collide', () => {
    const first = generateObjectKey(USER_ID, 'image/jpeg');
    const second = generateObjectKey(USER_ID, 'image/jpeg');

    expect(first).not.toBe(second);
  });

  it('keeps one user out of another user’s prefix', () => {
    const other = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const key = generateObjectKey(USER_ID, 'image/png');

    expect(key.startsWith(`uploads/${other}/`)).toBe(false);
  });

  it('refuses a content type outside the allowlist', () => {
    expect(() => generateObjectKey(USER_ID, 'image/gif')).toThrow();
    expect(() => generateObjectKey(USER_ID, 'application/pdf')).toThrow();
    expect(() => generateObjectKey(USER_ID, '')).toThrow();
  });

  it('covers every allowlisted type', () => {
    // Guards against the map and the generator drifting apart.
    for (const contentType of Object.keys(ALLOWED_IMAGE_CONTENT_TYPES)) {
      expect(() => generateObjectKey(USER_ID, contentType)).not.toThrow();
    }
  });
});
