// i18n-safe selector guard (platform-adapter spec "Adapter selectors are
// language-independent"). Adapter selectors must not match on visible text,
// `aria-label` values, or assumed auth/route URLs — those are localized or
// login-state-dependent and have broken the extension before. This guard runs over
// every bundled config so the rule cannot regress.

import { describe, expect, it } from 'vitest';
import { BUNDLED_CONFIGS } from '../src/adapters/configs';
import type { AdapterConfig, AdapterSelectors, PlatformId } from '../src/adapters/types';

// Keys that are CSS selectors (matched against the DOM) and so must obey the rule.
// Excluded: `conversationIdAttr`/`conversationTitleAttr` (attribute NAMES to read,
// not matchers) and `conversationUrlPattern` (a regex). `sendButton` is excluded
// BY DESIGN — it is not a runtime selector: the overlay is append-only and never
// auto-submits (design D-5), so `adapter.submit()` (the only `sendButton` consumer)
// is never called in the live product and is exercised solely by the contract
// suite. A localized `aria-label` send selector therefore cannot break a user, and
// the platforms expose no stable testid on their send buttons anyway (Claude is
// aria-label-only; Perplexity's only hook is a namespaced SVG sprite ref that the
// happy-dom parser rejects). When multi-model comparison makes programmatic send a
// runtime path, the i18n-safe answer is `submitMode:"enter"` (no selector), not a
// send-button testid — revisit the guard then.
const LINTED_KEYS: readonly (keyof AdapterSelectors)[] = [
  'conversationList',
  'conversationItem',
  'conversationTitle',
  'messageUser',
  'messageAssistant',
  'composer',
  'sidebarAnchor',
  'inputBarAnchor',
  'authedMarker',
  'signedOutMarker',
];

/** A localized `[aria-label="…"]` value match (the attribute-name read form
 *  `[attr=aria-label]` is not flagged — only matching ON an aria-label value). */
const ARIA_LABEL_VALUE = /aria-label\s*[*^$~|]?=/i;
/** Text-content pseudo-classes (jQuery/soup style) — locale-dependent. */
const TEXT_PSEUDO = /:(-soup-)?contains\(|:has-text\(/i;
/** An assumed auth/route URL baked into a selector (conversation `href`-prefixes
 *  like `/c/`, `/chat/`, `/search/` are the identity model and intentionally NOT
 *  matched here). */
const AUTH_URL = /href[*^$~|]?=['"]?[^'"\]]*\/(login|signin|sign-in|auth|logout)/i;

function violations(selector: string): string[] {
  const found: string[] = [];
  if (ARIA_LABEL_VALUE.test(selector)) found.push('matches on an aria-label value');
  if (TEXT_PSEUDO.test(selector)) found.push('uses a text-content pseudo-class');
  if (AUTH_URL.test(selector)) found.push('hardcodes an auth/route URL');
  return found;
}

describe('adapter selector i18n guard', () => {
  const configs = Object.entries(BUNDLED_CONFIGS) as [PlatformId, AdapterConfig][];

  it('every bundled platform has at least one config to lint', () => {
    expect(configs.length).toBeGreaterThan(0);
  });

  for (const [platform, config] of configs) {
    for (const key of LINTED_KEYS) {
      const selector = config.selectors[key];
      if (selector === undefined) continue; // optional selector not set on this platform
      it(`${platform}.${key} is text/aria-label/auth-URL-free`, () => {
        expect(violations(selector), `${platform}.${key} = "${selector}"`).toEqual([]);
      });
    }
  }

  it('the guard actually rejects a text/aria-label/url selector', () => {
    expect(violations('nav[aria-label="Chat history"]')).not.toEqual([]);
    expect(violations('button:has-text("Send")')).not.toEqual([]);
    expect(violations('a[href^="/login"]')).not.toEqual([]);
    // Allowed: a conversation href-prefix and a data-testid.
    expect(violations('a[href^="/c/"]')).toEqual([]);
    expect(violations('[data-testid="accounts-profile-button"]')).toEqual([]);
  });

  // `sendButton` is intentionally NOT linted: it is contract-only surface, not a
  // runtime selector (see LINTED_KEYS note above). It joins the guard only if/when
  // `adapter.submit()` becomes a live path (multi-model comparison), and even then
  // the fix is `submitMode:"enter"`, not a send-button testid the platforms don't
  // expose. Documented here so the omission reads as a decision, not an oversight.
});
