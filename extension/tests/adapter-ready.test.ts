// `waitForSelfCheck` gates the adapter's anchor probe on the host SPA hydrating,
// so a content script injected at `document_idle` no longer reports every anchor
// missing just because the nav/composer mounted a frame later. Three behaviours:
// already-ready resolves immediately, late-appearing anchors resolve on mutation,
// and anchors that never appear resolve (still failing) after the timeout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SELF_CHECK_TIMEOUT_MS, waitForSelfCheck } from '../src/adapters';
import type { SelfCheckResult } from '../src/adapters';

/** A fake adapter whose selfCheck reflects whether `#anchor` is in the document. */
function anchorAdapter(): { selfCheck: () => SelfCheckResult } {
  return {
    selfCheck: () =>
      document.getElementById('anchor')
        ? { ok: true, missing: [] }
        : { ok: false, missing: ['composer'] },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('waitForSelfCheck', () => {
  it('resolves immediately when the anchors are already present', async () => {
    document.body.innerHTML = '<div id="anchor"></div>';
    const result = await waitForSelfCheck(anchorAdapter(), { root: document });
    expect(result.ok).toBe(true);
  });

  it('resolves as soon as a late-mounted anchor appears (re-probes on mutation)', async () => {
    const adapter = anchorAdapter();
    const pending = waitForSelfCheck(adapter, { root: document });

    // Simulate the SPA hydrating the anchor a tick after injection.
    const el = document.createElement('div');
    el.id = 'anchor';
    document.body.appendChild(el);

    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('resolves with the failing result after the timeout when anchors never appear', async () => {
    vi.useFakeTimers();
    const adapter = anchorAdapter();
    const pending = waitForSelfCheck(adapter, { root: document });

    await vi.advanceTimersByTimeAsync(SELF_CHECK_TIMEOUT_MS);

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');
  });
});
