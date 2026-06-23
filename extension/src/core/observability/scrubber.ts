// The `$exception` scrubber (design Risks, task 4.4). The exception message is the
// ONLY free-text field in the whole telemetry surface, so it is the entire
// content-leak audit boundary. We send only: the error name, a truncated +
// denylist-masked message, and stack frames limited to our OWN bundle files
// (host-page frames — which can embed conversation URLs/content — are dropped).

/** Max characters kept from an exception message. Anything longer is truncated. */
export const MAX_MESSAGE_LEN = 256;

/** Mask used in place of a matched sensitive substring. */
export const MASK = '«redacted»';

/**
 * Sensitive-substring patterns masked out of any exception message before it is
 * sent. These backstop the truncation: even a short message must not smuggle
 * tokens, emails, URLs, or key/secret-looking values. The CI denylist test asserts
 * each pattern actually masks.
 */
export const DENYLIST: readonly RegExp[] = [
  // Bearer/JWT-ish tokens and long opaque secrets.
  /\beyJ[\w-]{10,}\b/g,
  /\b[A-Za-z0-9_-]{32,}\b/g,
  // Email addresses.
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  // Any URL (may carry a conversation id / query in its path).
  /\bhttps?:\/\/\S+/gi,
  // key=value / "secret": "…" shaped fragments.
  /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*\S+/gi,
];

/** Apply the denylist masks to a string. */
function mask(input: string): string {
  let out = input;
  for (const pattern of DENYLIST) out = out.replace(pattern, MASK);
  return out;
}

/** Scrub an exception message: mask sensitive substrings, then truncate. */
export function scrubMessage(message: string): string {
  const masked = mask(message);
  return masked.length > MAX_MESSAGE_LEN ? `${masked.slice(0, MAX_MESSAGE_LEN)}…` : masked;
}

/**
 * Keep only stack frames that reference our OWN extension bundle, and reduce each
 * to a safe token (the bundle filename + position) so no host-page URL, query
 * string, or inline content survives. A frame is "ours" when it points at an
 * `chrome-extension://`/`moz-extension://` resource — host-page frames (https://…)
 * are dropped entirely.
 */
export function scrubFrames(stack: string | undefined): string[] {
  if (!stack) return [];
  const frames: string[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    if (!/(?:chrome|moz)-extension:\/\//.test(line)) continue; // host-page or noise → drop
    // Reduce to `<filename>:<line>:<col>` — strip the extension origin and any query.
    const match = line.match(/(?:chrome|moz)-extension:\/\/[^/]+\/([^):\s?]+)(?::(\d+):(\d+))?/);
    if (!match) continue;
    const file = match[1];
    const pos = match[2] ? `:${match[2]}:${match[3] ?? '0'}` : '';
    frames.push(`${file}${pos}`);
  }
  return frames;
}

/** A scrubbed exception ready to be turned into `$exception` properties. */
export interface ScrubbedException {
  type: string;
  message: string;
  frames: string[];
}

/** Scrub a raw error into its sendable, content-free parts. */
export function scrubException(error: { name?: string; message?: string; stack?: string }): ScrubbedException {
  // Error names are constructor identifiers; fall back to a safe token, never raw text.
  const rawName = error.name ?? 'Error';
  const type = /^[\w.$]+$/.test(rawName) ? rawName : 'Error';
  return {
    type,
    message: scrubMessage(error.message ?? ''),
    frames: scrubFrames(error.stack),
  };
}
