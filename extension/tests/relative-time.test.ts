import { describe, it, expect } from 'vitest';
import { formatRelativeTime, type RelativeTimeStrings } from '../src/ui/sidebar/relativeTime';

const STR: RelativeTimeStrings = {
  justNow: 'just now',
  minute: 'm',
  hour: 'h',
  day: 'd',
  week: 'w',
  ago: 'ago',
};

const NOW = 1_000_000_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const at = (delta: number) => formatRelativeTime(NOW - delta, NOW, STR);

describe('formatRelativeTime', () => {
  it('renders sub-minute and future gaps as "just now"', () => {
    expect(at(0)).toBe('just now');
    expect(at(30 * SEC)).toBe('just now');
    expect(at(-5 * MIN)).toBe('just now'); // clock skew / future timestamp
  });

  it('buckets minutes, hours, days, and weeks with terse units', () => {
    expect(at(5 * MIN)).toBe('5m ago');
    expect(at(3 * HOUR)).toBe('3h ago');
    expect(at(2 * DAY)).toBe('2d ago');
    expect(at(3 * WEEK)).toBe('3w ago');
  });

  it('rounds down at each boundary', () => {
    expect(at(MIN - 1)).toBe('just now');
    expect(at(HOUR - 1)).toBe('59m ago');
    expect(at(DAY - 1)).toBe('23h ago');
    expect(at(WEEK - 1)).toBe('6d ago');
  });
});
