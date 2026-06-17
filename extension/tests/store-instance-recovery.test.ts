// Regression: the worker caches a single WorkspaceStore handle for its lifetime
// (one open per worker generation). But a *rejected* open must not poison the
// cache — otherwise every later read/write would re-throw the cached rejection
// (surfacing as `handler_error`) until the worker restarts. A failed open resets
// the handle so the next `workspaceStore()` call re-opens; a successful open
// stays cached.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openWorkspaceStore } = vi.hoisted(() => ({ openWorkspaceStore: vi.fn() }));
vi.mock('../src/core/store/index', () => ({ openWorkspaceStore }));

import { workspaceStore, __resetWorkspaceStore } from '../src/core/store/instance';

beforeEach(() => {
  __resetWorkspaceStore();
  openWorkspaceStore.mockReset();
});
afterEach(() => __resetWorkspaceStore());

describe('workspaceStore handle recovery', () => {
  it('does not cache a rejected open — the next call re-opens and succeeds', async () => {
    const handle = { id: 'store' };
    openWorkspaceStore
      .mockRejectedValueOnce(new Error('IndexedDB open failed'))
      .mockResolvedValueOnce(handle);

    // First call rejects (transient open failure).
    await expect(workspaceStore()).rejects.toThrow('IndexedDB open failed');

    // Next call must re-open rather than return the cached rejection.
    await expect(workspaceStore()).resolves.toBe(handle);
    expect(openWorkspaceStore).toHaveBeenCalledTimes(2);
  });

  it('caches a successful open (single open per worker generation)', async () => {
    const handle = { id: 'store' };
    openWorkspaceStore.mockResolvedValue(handle);

    const a = await workspaceStore();
    const b = await workspaceStore();

    expect(a).toBe(handle);
    expect(b).toBe(handle);
    expect(openWorkspaceStore).toHaveBeenCalledTimes(1);
  });
});
