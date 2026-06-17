// The shared transport retry seam (`sendWithRetry`) must survive a waking MV3
// service worker: on cold open, `chrome.runtime.sendMessage` can resolve with no
// response (→ `no_response`) or the channel can drop (→ `send_failed`) before the
// worker is ready to dispatch. The helper retries only those transient transport
// codes so an idempotent read recovers, while logic/domain errors are returned on
// the first attempt. Regression for the empty-on-first-open / populated-on-reopen
// symptom, now covered at the transport boundary every read inherits.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendWithRetry } from '../src/core/messaging';
import type { RequestOf } from '../src/shared/messages';

const REQ: RequestOf<'workspace.query'> = {
  kind: 'workspace.query',
  selector: { kind: 'folder.tree' },
};

// A fake `chrome` whose `runtime.sendMessage` returns a queued sequence of
// replies. `undefined` models a no-response (→ `no_response`); a thrown value
// models a dropped channel (→ `send_failed`); an object is returned verbatim.
function setChromeWithReplies(replies: Array<unknown | (() => never)>) {
  let i = 0;
  const sendMessage = vi.fn(async () => {
    const r = replies[Math.min(i, replies.length - 1)];
    i += 1;
    if (typeof r === 'function') (r as () => never)();
    return r;
  });
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage, onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
  };
  return sendMessage;
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
  vi.restoreAllMocks();
});

describe('sendWithRetry (transient transport resilience)', () => {
  it('retries a waking-worker no_response, then resolves with the success', async () => {
    // Two no-responses (undefined) then a real success envelope.
    const ok = { ok: true as const, data: { kind: 'folder.tree', tree: { active: [], pinned: [], archived: [] } } };
    const send = setChromeWithReplies([undefined, undefined, ok]);

    const res = await sendWithRetry(REQ, { tries: 5, delayMs: 1 });

    expect(res.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('retries a dropped channel (send_failed), then resolves with the success', async () => {
    const ok = { ok: true as const, data: { kind: 'folder.tree', tree: { active: [], pinned: [], archived: [] } } };
    const send = setChromeWithReplies([
      () => {
        throw new Error('channel closed');
      },
      ok,
    ]);

    const res = await sendWithRetry(REQ, { tries: 5, delayMs: 1 });

    expect(res.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('makes a single attempt when no retry is opted in (plain send semantics)', async () => {
    // `tries: 1` is the non-retryable path: one attempt, transient error returned.
    const send = setChromeWithReplies([undefined]);

    const res = await sendWithRetry(REQ, { tries: 1, delayMs: 1 });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('no_response');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a logic error like unknown_kind', async () => {
    const logicErr = { ok: false as const, error: { code: 'unknown_kind', message: 'unknown_kind' } };
    const send = setChromeWithReplies([logicErr]);

    const res = await sendWithRetry(REQ, { tries: 5, delayMs: 1 });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('unknown_kind');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('gives up after the budget, returns the last transient error, and logs the code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const send = setChromeWithReplies([undefined]); // always no_response

    const res = await sendWithRetry(REQ, { tries: 3, delayMs: 1 });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('no_response');
    expect(send).toHaveBeenCalledTimes(3);
    // Diagnostic: the exhausted-budget code is recorded for observability.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sendWithRetry exhausted budget'),
      'workspace.query',
      'no_response',
    );
  });

  it('does NOT log when the budget is not exhausted (logic error short-circuits)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setChromeWithReplies([{ ok: false as const, error: { code: 'handler_error', message: 'boom' } }]);

    await sendWithRetry(REQ, { tries: 3, delayMs: 1 });

    expect(warn).not.toHaveBeenCalled();
  });
});
