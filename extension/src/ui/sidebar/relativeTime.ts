// A compact relative-time formatter for conversation rows ("2d ago"). Pure and
// `now`-injectable so it is deterministic to test. Buckets the gap, then formats
// the value through `Intl.RelativeTimeFormat` so the units and ordering follow the
// active locale (D-i18n-5) rather than hard-coded English suffixes. The terse
// "narrow" style keeps it inside the row's meta line. The sub-minute / future
// "just now" copy is the one phrase Intl has no slot for, so it is passed in from
// the catalog.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Bucket the gap between `then` and `now` into a terse, locale-formatted relative
 * label. Caps at weeks (a row is "at a glance" — older than that, the exact age
 * stops mattering). Future timestamps and sub-minute gaps both render as `justNow`.
 */
export function formatRelativeTime(
  then: number,
  now: number,
  locale: string,
  justNow: string,
): string {
  const delta = now - then;
  if (delta < MINUTE) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' });
  if (delta < HOUR) return rtf.format(-Math.floor(delta / MINUTE), 'minute');
  if (delta < DAY) return rtf.format(-Math.floor(delta / HOUR), 'hour');
  if (delta < WEEK) return rtf.format(-Math.floor(delta / DAY), 'day');
  return rtf.format(-Math.floor(delta / WEEK), 'week');
}
