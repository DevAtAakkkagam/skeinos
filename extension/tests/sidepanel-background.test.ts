// Background side-panel wiring (the `side-panel` change, D2). Proves the toolbar
// open behavior is registered, the already-active tab is enabled at worker start
// (the cold-start gap that left the panel unopenable), and per-tab enablement
// tracks the active host on later switches/navigations. A fake `chrome.sidePanel`
// + `chrome.tabs` stands in for the extension APIs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSidePanel } from '../src/background/sidePanel';

type ActivatedCb = (info: { tabId: number }) => void;
type UpdatedCb = (
  tabId: number,
  changeInfo: { status?: string; url?: string },
  tab: { url?: string },
) => void;

function makeChrome(activeTab: { id?: number; url?: string } | undefined) {
  const setPanelBehavior = vi.fn(async () => {});
  const setOptions = vi.fn(async () => {});
  const get = vi.fn(async (tabId: number) => ({ id: tabId, url: undefined as string | undefined }));
  let activatedCb: ActivatedCb | undefined;
  let updatedCb: UpdatedCb | undefined;
  return {
    setPanelBehavior,
    setOptions,
    get,
    fireActivated: (tabId: number) => activatedCb?.({ tabId }),
    fireUpdated: (...args: Parameters<UpdatedCb>) => updatedCb?.(...args),
    chrome: {
      sidePanel: { setPanelBehavior, setOptions },
      tabs: {
        query: async () => (activeTab ? [activeTab] : []),
        get,
        onActivated: { addListener: (cb: ActivatedCb) => void (activatedCb = cb) },
        onUpdated: { addListener: (cb: UpdatedCb) => void (updatedCb = cb) },
      },
    },
  };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

describe('registerSidePanel', () => {
  it('opens on toolbar click and enables the already-active supported tab at start', async () => {
    const fake = makeChrome({ id: 7, url: 'https://claude.ai/new' });
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    registerSidePanel();
    await flush();

    expect(fake.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    // The cold-start active claude tab is explicitly enabled (with a path).
    expect(fake.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 7, enabled: true, path: 'sidepanel.html' }),
    );
  });

  it('disables the panel when the already-active tab is unsupported', async () => {
    const fake = makeChrome({ id: 3, url: 'https://example.com/' });
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    registerSidePanel();
    await flush();

    expect(fake.setOptions).toHaveBeenCalledWith({ tabId: 3, enabled: false });
  });

  it('re-syncs enablement on tab navigation and activation', async () => {
    const fake = makeChrome(undefined); // no active tab at start
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    registerSidePanel();
    await flush();

    // Navigating a tab to a supported host enables it.
    fake.fireUpdated(11, { status: 'complete' }, { url: 'https://claude.ai/chat/x' });
    await flush();
    expect(fake.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 11, enabled: true }),
    );

    // Switching to a tab we read as unsupported disables it.
    fake.get.mockResolvedValueOnce({ id: 12, url: 'https://example.org/' });
    fake.fireActivated(12);
    await flush();
    expect(fake.setOptions).toHaveBeenCalledWith({ tabId: 12, enabled: false });
  });

  it('is a no-op without the chrome.sidePanel API (non-Chromium)', () => {
    (globalThis as { chrome?: unknown }).chrome = { tabs: {} };
    expect(() => registerSidePanel()).not.toThrow();
  });
});
