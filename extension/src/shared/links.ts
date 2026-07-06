// External links surfaced in the UI (welcome page, options, empty states, …).
// Centralized here so a URL change is ONE edit, not a hunt across components —
// "add the feedback link everywhere" means "import FEEDBACK_URL here".
//
// Kept in `shared/` so it stays Preact-free and is importable by the UI and any
// worker-side caller alike.

/**
 * Where "Send feedback" points. This is the Google Form's **published** (responder)
 * URL — the `.../viewform` link, NOT the `/edit` link.
 */
export const FEEDBACK_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdwvGDEqZ3cv9_Fbpt0GqS70tLQWHRl209wUW3uzejlusmvXg/viewform';

/** Deep-link to the Chrome Web Store review pane — ratings drive discovery. */
export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/skeinos/kaajkklgkepoeoelogkdpkenjoihobdj/reviews';

/** True for a web URL we should open in a new tab (a `mailto:` opens in the mail
 *  client and needs no target). Lets callers set `target`/`rel` correctly whether
 *  FEEDBACK_URL is still the mailto fallback or the live form URL. */
export const isExternalHttp = (url: string): boolean => /^https?:/i.test(url);
