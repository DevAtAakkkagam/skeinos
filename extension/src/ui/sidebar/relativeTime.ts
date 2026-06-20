// A compact relative-time formatter for conversation rows ("2d ago"). Pure and
// `now`-injectable so it is deterministic to test. Units stay terse to fit the
// row's meta line; the unit suffixes live in `STR` (i18n-ready) and are passed in
// rather than hard-coded here, so this stays a pure number→bucket mapper.

export interface RelativeTimeStrings {
  justNow: string;
  /** Single-letter unit suffixes, combined as `${value}${unit} ${ago}`. */
  minute: string;
  hour: string;
  day: string;
  week: string;
  /** Trailing word, e.g. "ago". */
  ago: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Bucket the gap between `then` and `now` into a terse relative label. Caps at
 * weeks (a row is "at a glance" — older than that, the exact age stops mattering
 * and the absolute date would be a separate affordance). Future timestamps and
 * sub-minute gaps both render as "just now".
 */
export function formatRelativeTime(then: number, now: number, str: RelativeTimeStrings): string {
  const delta = now - then;
  if (delta < MINUTE) return str.justNow;
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}${str.minute} ${str.ago}`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}${str.hour} ${str.ago}`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}${str.day} ${str.ago}`;
  return `${Math.floor(delta / WEEK)}${str.week} ${str.ago}`;
}
