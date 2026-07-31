import { describe, expect, it } from 'vitest';

import { isOwnedImageKey } from './imageKeys';

// Two ids shaped like the real thing (users.id is a v4 uuid).
const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

describe('isOwnedImageKey', () => {
  it("accepts a key under the caller's own prefix", () => {
    const key = `uploads/${USER_ID}/2b1c8a3e-0000-4000-8000-000000000000.jpg`;

    expect(isOwnedImageKey(USER_ID, key)).toBe(true);
  });

  it("rejects a key under another user's prefix", () => {
    const key = `uploads/${OTHER_ID}/2b1c8a3e-0000-4000-8000-000000000000.jpg`;

    expect(isOwnedImageKey(USER_ID, key)).toBe(false);
  });

  it('rejects a traversal that escapes the caller prefix', () => {
    // Starts with the caller's prefix but climbs back out into another user's.
    const key = `uploads/${USER_ID}/../${OTHER_ID}/owned.jpg`;

    expect(isOwnedImageKey(USER_ID, key)).toBe(false);
  });

  it('rejects an absolute path', () => {
    const key = `/uploads/${USER_ID}/photo.jpg`;

    expect(isOwnedImageKey(USER_ID, key)).toBe(false);
  });

  it('rejects the prefix with nothing after it', () => {
    expect(isOwnedImageKey(USER_ID, `uploads/${USER_ID}/`)).toBe(false);
  });

  it('rejects a nested sub-path even under the caller prefix', () => {
    expect(isOwnedImageKey(USER_ID, `uploads/${USER_ID}/nested/photo.jpg`)).toBe(false);
  });

  it('rejects a key for a different resource root', () => {
    expect(isOwnedImageKey(USER_ID, `thumbnails/${USER_ID}/photo.jpg`)).toBe(false);
  });

  it('is not fooled by a prefix that only shares a leading substring', () => {
    // uploads/{USER_ID}extra/... must not read as belonging to USER_ID.
    const key = `uploads/${USER_ID}extra/photo.jpg`;

    expect(isOwnedImageKey(USER_ID, key)).toBe(false);
  });
});
