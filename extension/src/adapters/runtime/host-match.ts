// Map a URL to the platform whose bundled config claims it. Used by the content
// entry to pick which adapter (if any) to load on the current host.

import type { PlatformId } from '../../shared/types';
import { BUNDLED_CONFIGS } from '../configs';

/** Compile an MV3-style match pattern (e.g. `*://claude.ai/*`) to a `RegExp`. */
function patternToRegex(pattern: string): RegExp {
  // Escape every regex metacharacter except `*`, then turn `*` into `.*`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

/** Whether `url` matches an MV3 host match pattern. */
export function matchesHostPattern(pattern: string, url: string): boolean {
  return patternToRegex(pattern).test(url);
}

/** The platform that claims this URL, or `null` if none of the bundled configs do. */
export function matchPlatform(url: string): PlatformId | null {
  for (const [platformId, config] of Object.entries(BUNDLED_CONFIGS)) {
    if (config && config.hostMatch.some((pattern) => matchesHostPattern(pattern, url))) {
      return platformId as PlatformId;
    }
  }
  return null;
}
