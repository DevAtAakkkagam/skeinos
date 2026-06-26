// Gate an adapter's `selfCheck()` on the host SPA actually hydrating its anchors.
// The content script runs at `document_idle`, but host apps (claude.ai et al.) mount
// their nav / composer / fieldset *after* idle — so a single synchronous probe at
// injection sees nothing and reports every REQUIRED_ANCHOR missing on a perfectly
// healthy page (the observed "self-check failed composer,conversationList,…"). We
// re-probe on DOM mutations until the check passes, giving up only after `timeoutMs`
// so a genuinely broken or renamed selector still surfaces its breakage banner
// within a bounded time rather than hanging forever.

import type { PlatformAdapter, SelfCheckResult } from '../types';

type Root = Document | HTMLElement;

/** What the probe loop needs: the anchor check, plus the optional classifier used
 *  for the signed-out early-exit (absent on older test stubs → no early-exit). */
type Probeable = Pick<PlatformAdapter, 'selfCheck'> & Partial<Pick<PlatformAdapter, 'classify'>>;

/** Whether a still-failing check can stop waiting now: only a CONFIDENT signed-out
 *  read (the composer tier has resolved) short-circuits, so a banner-worthy breakage
 *  or a half-hydrated dormant page still uses the full grace period. */
function settledSignedOut(adapter: Probeable): boolean {
  return typeof adapter.classify === 'function' && adapter.classify() === 'signed-out-compose';
}

export interface WaitForSelfCheckOptions {
  /** Max time to wait for anchors to hydrate before returning the last result. */
  timeoutMs?: number;
  /** DOM root to observe for mutations (defaults to the page `document`). */
  root?: Root;
}

/** Grace period for SPA hydration: long enough for a slow first paint, short
 *  enough that a genuinely broken platform surfaces its banner promptly. */
export const SELF_CHECK_TIMEOUT_MS = 8000;

/**
 * Resolve once the adapter's `selfCheck()` passes, or with the final failing
 * result after `timeoutMs`. Never rejects. Fast-paths when the anchors are already
 * present or there is no DOM/`MutationObserver` to observe (e.g. a worker context).
 */
export function waitForSelfCheck(
  adapter: Probeable,
  opts: WaitForSelfCheckOptions = {},
): Promise<SelfCheckResult> {
  const timeoutMs = opts.timeoutMs ?? SELF_CHECK_TIMEOUT_MS;
  const root = opts.root ?? (globalThis as { document?: Document }).document;
  const MO = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;

  const first = adapter.selfCheck();
  // Stop early when the page is already known good, when there is no DOM to observe,
  // or when it is confidently signed-out (no point waiting out the grace period for
  // anchors that won't arrive until the user signs in).
  if (first.ok || !root || typeof MO !== 'function' || settledSignedOut(adapter)) {
    return Promise.resolve(first);
  }

  return new Promise<SelfCheckResult>((resolve) => {
    let settled = false;

    // `finish` references `observer`/`timer` below; safe because it only ever runs
    // asynchronously (mutation callback or timeout), long after both are assigned.
    const finish = (result: SelfCheckResult): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };

    // Re-probe whenever the host mutates the DOM; resolve the moment it passes — or
    // the moment it becomes a confident signed-out page (composer present, no auth),
    // returning the still-failing anchor result for the caller to classify.
    const observer = new MO(() => {
      const check = adapter.selfCheck();
      if (check.ok || settledSignedOut(adapter)) finish(check);
    });
    const target: Node = root instanceof Document ? (root.documentElement ?? root) : root;
    observer.observe(target, { childList: true, subtree: true, attributes: true });

    // Bounded wait: return the final (still-failing) check so the caller marks the
    // platform degraded and raises the banner instead of waiting forever.
    const timer = setTimeout(() => finish(adapter.selfCheck()), timeoutMs);
  });
}
