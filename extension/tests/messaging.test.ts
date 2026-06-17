// messaging spec coverage (Vitest + a fake `chrome`). Each `describe` maps to
// one task/scenario in openspec/changes/messaging.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcast, dispatch, registerHandler, subscribe, send } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import type { RequestOf } from '../src/shared/messages';

// Exercise the contract seam: feature changes add their kinds by augmenting
// `RequestContracts`. These are the test's kinds.
declare module '../src/shared/messages' {
  interface RequestContracts {
    'test.echo': { request: { value: string }; response: { echoed: string } };
    'test.boom': { request: { reason?: string }; response: never };
  }
}

// --- a minimal fake `chrome` ----------------------------------------------

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

function makeContext() {
  const listeners = new Set<Listener>();
  return {
    onMessage: {
      addListener: (cb: Listener) => void listeners.add(cb),
      removeListener: (cb: Listener) => void listeners.delete(cb),
    },
    deliver(message: unknown) {
      for (const cb of listeners) cb(message, {}, () => undefined);
    },
  };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
afterEach(() => setChrome(originalChrome));

describe('Typed request/response round-trip (4.1)', () => {
  beforeEach(() => __clearHandlers());

  it('dispatches a registered kind and returns a typed success response', async () => {
    registerHandler('test.echo', (req) => ({ echoed: req.value }));
    const req: RequestOf<'test.echo'> = { kind: 'test.echo', value: 'hi' };
    const res = await dispatch(req);
    expect(res).toEqual({ ok: true, data: { echoed: 'hi' } });
  });

  it('awaits an async handler', async () => {
    registerHandler('test.echo', async (req) => ({ echoed: req.value.toUpperCase() }));
    const res = await dispatch({ kind: 'test.echo', value: 'yo' } as RequestOf<'test.echo'>);
    expect(res).toEqual({ ok: true, data: { echoed: 'YO' } });
  });
});

describe('Error envelope, no throw escapes (4.2)', () => {
  beforeEach(() => __clearHandlers());

  it('an unknown kind returns { ok:false, error } with no throw', async () => {
    const res = await dispatch({ kind: 'nope.unregistered' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('unknown_kind');
  });

  it('a throwing handler is mapped to an error response', async () => {
    registerHandler('test.boom', () => {
      throw new Error('kaboom');
    });
    const res = await dispatch({ kind: 'test.boom' } as RequestOf<'test.boom'>);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('handler_error');
      expect(res.error.message).toBe('kaboom');
    }
  });

  it('send surfaces a missing runtime as an error envelope, not a rejection', async () => {
    setChrome(undefined);
    const res = await send({ kind: 'test.echo', value: 'x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('no_runtime');
  });
});

describe('Synchronous handler registration (4.3)', () => {
  it('installMessageHub registers exactly one dispatch listener (worker-only, idempotent)', async () => {
    vi.resetModules();
    const addListener = vi.fn();
    setChrome({ runtime: { onMessage: { addListener, removeListener: vi.fn() } } });
    // Importing the hub must NOT register the listener (extension pages import it
    // transitively for send/subscribe and must not become responders).
    const { installMessageHub } = await import('../src/core/messaging/hub');
    expect(addListener).not.toHaveBeenCalled();
    // The worker entry installs it explicitly; repeated calls stay singular.
    installMessageHub();
    installMessageHub();
    expect(addListener).toHaveBeenCalledTimes(1);
  });
});

describe('Broadcast to all subscribed tabs (4.4)', () => {
  it('reaches two subscribed tabs; unsubscribe stops delivery', async () => {
    const tabA = makeContext();
    const tabB = makeContext();
    const byId: Record<number, typeof tabA> = { 1: tabA, 2: tabB };
    const swChrome = {
      tabs: {
        query: async () => Object.keys(byId).map((id) => ({ id: Number(id) })),
        sendMessage: async (id: number, msg: unknown) => void byId[id]?.deliver(msg),
      },
    };

    const spyA = vi.fn();
    const spyB = vi.fn();

    // Each tab subscribes within its own context.
    setChrome({ runtime: tabA });
    const unsubA = subscribe(spyA);
    setChrome({ runtime: tabB });
    const unsubB = subscribe(spyB);

    // The worker broadcasts.
    setChrome(swChrome);
    await broadcast({ kind: 'state.changed', stores: ['folders'] });

    const expected = { kind: 'state.changed', stores: ['folders'] };
    expect(spyA).toHaveBeenCalledWith(expected);
    expect(spyB).toHaveBeenCalledWith(expected);

    // After B unsubscribes, only A still receives.
    unsubB();
    spyA.mockClear();
    spyB.mockClear();
    await broadcast({ kind: 'state.changed', stores: ['prompts'] });
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).not.toHaveBeenCalled();

    unsubA();
  });

  it('reaches an extension-page subscriber (side panel) with no tabs open', async () => {
    // The side panel is an extension page, not a tab: it listens on
    // chrome.runtime.onMessage and never receives a tabs.sendMessage. The worker
    // must fan the broadcast out via runtime.sendMessage too.
    const page = makeContext();
    const spy = vi.fn();

    setChrome({ runtime: page });
    const unsub = subscribe(spy);

    // The worker broadcasts with NO host tabs open; delivery must still reach the
    // page through runtime.sendMessage.
    setChrome({
      runtime: { ...page, sendMessage: async (msg: unknown) => void page.deliver(msg) },
      tabs: { query: async () => [], sendMessage: async () => undefined },
    });
    await broadcast({ kind: 'state.changed', stores: ['folders'] });

    expect(spy).toHaveBeenCalledWith({ kind: 'state.changed', stores: ['folders'] });
    unsub();
  });

  it('swallows the rejection when no extension page is listening', async () => {
    // runtime.sendMessage rejects ("Could not establish connection") when no page
    // is open; broadcast must not reject.
    setChrome({
      runtime: { sendMessage: async () => Promise.reject(new Error('no receiver')) },
      tabs: { query: async () => [], sendMessage: async () => undefined },
    });
    await expect(broadcast({ kind: 'state.changed', stores: ['folders'] })).resolves.toBeUndefined();
  });

  it('a missed broadcast self-heals: the change is observable on the next re-query', async () => {
    // Broadcast is best-effort — a subscriber can miss it (worker torn down before
    // fan-out, or no page listening). Durable truth lives in the store, so the
    // change is recovered by re-querying the worker. Here the broadcast reaches no
    // one and is swallowed, yet a re-query (dispatch) returns the current truth.
    __clearHandlers();
    let folderCount = 0;
    registerHandler('test.echo', () => ({ echoed: String(folderCount) }));

    // The worker commits a change and broadcasts it with no subscriber listening.
    folderCount = 1;
    setChrome({
      runtime: { sendMessage: async () => Promise.reject(new Error('no receiver')) },
      tabs: { query: async () => [], sendMessage: async () => undefined },
    });
    await expect(broadcast({ kind: 'state.changed', stores: ['folders'] })).resolves.toBeUndefined();

    // The subscriber missed the broadcast but observes the change on its next read.
    const res = await dispatch({ kind: 'test.echo', value: 'x' } as RequestOf<'test.echo'>);
    expect(res).toEqual({ ok: true, data: { echoed: '1' } });
  });
});
