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
  adapter: Pick<PlatformAdapter, 'selfCheck'>,
  opts: WaitForSelfCheckOptions = {},
): Promise<SelfCheckResult> {
  const timeoutMs = opts.timeoutMs ?? SELF_CHECK_TIMEOUT_MS;
  const root = opts.root ?? (globalThis as { document?: Document }).document;
  const MO = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;

  const first = adapter.selfCheck();
  if (first.ok || !root || typeof MO !== 'function') return Promise.resolve(first);

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

    // Re-probe whenever the host mutates the DOM; resolve the moment it passes.
    const observer = new MO(() => {
      const check = adapter.selfCheck();
      if (check.ok) finish(check);
    });
    const target: Node = root instanceof Document ? (root.documentElement ?? root) : root;
    observer.observe(target, { childList: true, subtree: true, attributes: true });

    // Bounded wait: return the final (still-failing) check so the caller marks the
    // platform degraded and raises the banner instead of waiting forever.
    const timer = setTimeout(() => finish(adapter.selfCheck()), timeoutMs);
  });
}
