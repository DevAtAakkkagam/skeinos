// Locale resolution (D-i18n-2). Picks the active UI locale from the browser and
// falls back to English, matching by primary subtag against the supported set.
// UI-only: the service worker never resolves a locale (translation is a view
// concern — design "Translation is UI-only").

import { extApi } from '../platform/ext-api';

/** Production locales shipped as authored catalogs. English is the source of truth. */
export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Development/test pseudo-locale (derived from English, never authored). */
export const PSEUDO_LOCALE = 'en-XA';
export type PseudoLocale = typeof PSEUDO_LOCALE;

/** Any locale the runtime can render. */
export type Locale = SupportedLocale | PseudoLocale;

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

/** Match a BCP-47 tag to a supported locale by primary subtag (`de-AT` → `de`). */
function matchSupported(tag: string | undefined | null): SupportedLocale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().split('-')[0];
  return SUPPORTED_SET.has(primary) ? (primary as SupportedLocale) : null;
}

// Dev/test override (the pseudo-locale flag and locale-forced render tests, D-i18n-2
// / task 5.2). Takes precedence over browser detection when set. `cached` memoizes
// the resolved locale so a session freezes to one value; forcing clears it.
let forced: Locale | null = null;
let cached: Locale | null = null;

/** Force a locale (pseudo-loc dev flag, locale-forced tests). `null` clears it. */
export function forceLocale(locale: Locale | null): void {
  forced = locale;
  cached = null;
}

// A persisted dev/test override (task 5.2): set `localStorage['sk:locale']` to any
// supported locale or the pseudo-locale (`en-XA`) to force the UI into it without
// changing the browser language — the ergonomic way to eyeball the pseudo-locale
// expansion pass in a dev build. Read defensively (no `localStorage` in the worker).
const LOCALE_FLAG = 'sk:locale';
const ALL_LOCALES = new Set<string>([...SUPPORTED_LOCALES, PSEUDO_LOCALE]);

function readLocaleOverride(): Locale | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOCALE_FLAG);
    return raw && ALL_LOCALES.has(raw) ? (raw as Locale) : null;
  } catch {
    // Storage can throw (disabled cookies, sandboxed frame) — treat as no override.
    return null;
  }
}

/**
 * Resolve the active locale: forced override → `browser.i18n.getUILanguage()` →
 * `navigator.languages[]` → `'en'`, matching by primary subtag. Browser locale
 * does not change live, so the result is memoized for the session.
 */
export function resolveLocale(): Locale {
  if (forced) return forced;

  const override = readLocaleOverride();
  if (override) return override;

  const api = extApi<{ i18n?: { getUILanguage?: () => string } }>();
  const fromExt = matchSupported(api?.i18n?.getUILanguage?.());
  if (fromExt) return fromExt;

  if (typeof navigator !== 'undefined') {
    const tags = navigator.languages ?? (navigator.language ? [navigator.language] : []);
    for (const tag of tags) {
      const m = matchSupported(tag);
      if (m) return m;
    }
  }

  return 'en';
}

/** Memoized active locale for the session (frozen until `forceLocale` clears it). */
export function activeLocale(): Locale {
  return (cached ??= resolveLocale());
}
