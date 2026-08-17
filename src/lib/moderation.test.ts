import { afterEach, describe, expect, it } from 'vitest';

import { initialItemStatus } from './moderation';

/**
 * The failure that matters is publishing an unreviewed item, so anything
 * that is not exactly `post` must hold the item for review. The env var is
 * read lazily, which is what lets these cases mutate it between calls.
 */
describe('initialItemStatus', () => {
  const original = process.env.MODERATION_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.MODERATION_MODE;
    else process.env.MODERATION_MODE = original;
  });

  it("defaults to 'pending_review' when MODERATION_MODE is unset", () => {
    delete process.env.MODERATION_MODE;
    expect(initialItemStatus(false)).toBe('pending_review');
  });

  it("returns 'pending_review' in pre mode", () => {
    process.env.MODERATION_MODE = 'pre';
    expect(initialItemStatus(false)).toBe('pending_review');
  });

  it("returns 'active' in post mode", () => {
    process.env.MODERATION_MODE = 'post';
    expect(initialItemStatus(false)).toBe('active');
  });

  it("falls back to 'pending_review' for any unrecognized value", () => {
    for (const value of ['', 'PRE', 'POST', 'post ', ' post', 'pre-moderation', 'off', 'true']) {
      process.env.MODERATION_MODE = value;
      expect(initialItemStatus(false), JSON.stringify(value)).toBe('pending_review');
    }
  });

  it("returns 'pending_review' for a translation request even in post mode", () => {
    process.env.MODERATION_MODE = 'post';
    expect(initialItemStatus(true)).toBe('pending_review');
  });
});
