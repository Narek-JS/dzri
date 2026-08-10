import { describe, expect, it } from 'vitest';

import { countdownMessage, relativeTimeMessage } from './relativeTime';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

function secondsFromNow(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000);
}

describe('relativeTimeMessage', () => {
  it('buckets under a minute as "now", with no count', () => {
    expect(relativeTimeMessage(secondsAgo(0), NOW)).toEqual({ key: 'common.relativeTime.now' });
    expect(relativeTimeMessage(secondsAgo(59), NOW)).toEqual({ key: 'common.relativeTime.now' });
  });

  it('buckets minutes just below an hour', () => {
    expect(relativeTimeMessage(secondsAgo(60), NOW)).toEqual({
      key: 'common.relativeTime.minute',
      values: { count: 1 },
    });
    expect(relativeTimeMessage(secondsAgo(59 * 60), NOW)).toEqual({
      key: 'common.relativeTime.minute',
      values: { count: 59 },
    });
  });

  it('buckets hours just below a day', () => {
    expect(relativeTimeMessage(secondsAgo(60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.hour',
      values: { count: 1 },
    });
    expect(relativeTimeMessage(secondsAgo(23 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.hour',
      values: { count: 23 },
    });
  });

  it('buckets days just below a week', () => {
    expect(relativeTimeMessage(secondsAgo(24 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.day',
      values: { count: 1 },
    });
    expect(relativeTimeMessage(secondsAgo(6 * 24 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.day',
      values: { count: 6 },
    });
  });

  it('buckets weeks, months and years beyond that', () => {
    expect(relativeTimeMessage(secondsAgo(7 * 24 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.week',
      values: { count: 1 },
    });
    expect(relativeTimeMessage(secondsAgo(30 * 24 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.month',
      values: { count: 1 },
    });
    expect(relativeTimeMessage(secondsAgo(365 * 24 * 60 * 60), NOW)).toEqual({
      key: 'common.relativeTime.year',
      values: { count: 1 },
    });
  });

  it('clamps a date after `now` (clock skew) to "now" instead of going negative', () => {
    const future = new Date(NOW.getTime() + 5000);

    expect(relativeTimeMessage(future, NOW)).toEqual({ key: 'common.relativeTime.now' });
  });
});

describe('countdownMessage', () => {
  it('buckets minutes under an hour, never below a count of 1', () => {
    expect(countdownMessage(secondsFromNow(90 * 60), NOW)).toEqual({
      key: 'common.countdown.hour',
      values: { count: 1 },
    });
    expect(countdownMessage(secondsFromNow(59 * 60), NOW)).toEqual({
      key: 'common.countdown.minute',
      values: { count: 59 },
    });
    expect(countdownMessage(secondsFromNow(30), NOW)).toEqual({
      key: 'common.countdown.minute',
      values: { count: 1 },
    });
  });

  it('buckets hours up to the 48-hour reservation window', () => {
    expect(countdownMessage(secondsFromNow(60 * 60), NOW)).toEqual({
      key: 'common.countdown.hour',
      values: { count: 1 },
    });
    expect(countdownMessage(secondsFromNow(48 * 60 * 60), NOW)).toEqual({
      key: 'common.countdown.hour',
      values: { count: 48 },
    });
  });

  it('treats a deadline at or before `now` as lapsed, not a negative count', () => {
    expect(countdownMessage(NOW, NOW)).toEqual({ key: 'common.countdown.lapsed' });
    expect(countdownMessage(secondsFromNow(-600), NOW)).toEqual({ key: 'common.countdown.lapsed' });
  });
});
