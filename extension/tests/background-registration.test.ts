// Guards SW-3 for the background entry: request handlers must be registered as a
// top-level module side effect, so a worker woken from MV3 idle teardown can
// answer the first dispatched message. Regression for the bug where handlers were
// registered inside the `defineBackground` callback (which does not reliably
// re-run on wake), leaving a woken worker that returned `unknown_kind` for every
// request while the side panel sat empty.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalChrome = (globalThis as { chrome?: unknown }).chrome;

beforeEach(() => {
  vi.resetModules();
  // Minimal worker-side chrome: only runtime.onMessage is needed; the alarms /
  // sidePanel / tabs APIs are absent, so registerCanary/registerSidePanel no-op.
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
  };
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
  vi.resetModules();
});

describe('Background handler registration (SW-3)', () => {
  it('registers request handlers at module load, not inside the entry callback', async () => {
    // Importing the background module must populate the registry by itself —
    // without anyone calling initBackground (which models the defineBackground
    // callback that does not re-run on a worker wake).
    await import('../src/background');
    const { getHandler } = await import('../src/core/messaging/registry');

    expect(getHandler('workspace.query')).toBeTypeOf('function');
    expect(getHandler('workspace.mutate')).toBeTypeOf('function');
    expect(getHandler('platform.report-health')).toBeTypeOf('function');
    expect(getHandler('platform.report-degraded')).toBeTypeOf('function');
  });
});
