// openConversation — platform-aware routing (design D4). Same-platform opens
// navigate the active tab (relative nativeId resolved against its URL). A
// cross-platform open builds the absolute URL from the branding origin and opens it
// in a tab: if a tab for that platform's origin is already open it is reused
// (navigated + its window focused), otherwise a new tab is created. The helper reads
// only tab URLs (active tab / platform-origin lookup) and writes a
// location/tab/window-focus — never page content — and uses no permission beyond the
// existing manifest.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openConversation } from '../src/ui/sidebar/openConversation';

type Chrome = { tabs?: unknown; windows?: unknown };
const g = globalThis as { chrome?: Chrome };

afterEach(() => {
  delete g.chrome;
  vi.restoreAllMocks();
});

function stubChrome(opts: {
  tab?: { id?: number; url?: string };
  platformTabs?: { id?: number; url?: string; windowId?: number }[];
  withTabs?: boolean;
  withWindows?: boolean;
} = {}) {
  const update = vi.fn(async () => undefined);
  const query = vi.fn(async (q: { active?: boolean; url?: string | string[] }) =>
    q.url ? (opts.platformTabs ?? []) : opts.tab ? [opts.tab] : [],
  );
  const create = vi.fn(async () => undefined);
  const winUpdate = vi.fn(async () => undefined);
  const chrome: Chrome = {};
  if (opts.withTabs !== false) chrome.tabs = { query, update, create };
  if (opts.withWindows !== false) chrome.windows = { update: winUpdate };
  g.chrome = chrome;
  return { query, update, create, winUpdate };
}

describe('openConversation — same-platform (active tab navigation)', () => {
  it('navigates the active tab when the conversation matches the active platform', async () => {
    const { update, create } = stubChrome({ tab: { id: 7, url: 'https://claude.ai/chat/current' } });
    await openConversation({ platform: 'claude', nativeId: '/chat/abc' }, 'claude');
    expect(update).toHaveBeenCalledWith(7, { url: 'https://claude.ai/chat/abc', active: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('navigates the active tab when no active platform is supplied (back-compat)', async () => {
    const { update } = stubChrome({ tab: { id: 3, url: 'https://claude.ai/chat/current' } });
    await openConversation({ platform: 'claude', nativeId: 'https://claude.ai/chat/xyz' });
    expect(update).toHaveBeenCalledWith(3, { url: 'https://claude.ai/chat/xyz', active: true });
  });
});

describe('openConversation — cross-platform (reuse existing platform tab)', () => {
  it('navigates the existing platform tab and focuses its window', async () => {
    const { update, winUpdate, create } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
      platformTabs: [{ id: 12, url: 'https://gemini.google.com/app/old', windowId: 4 }],
    });
    await openConversation({ platform: 'gemini', nativeId: '/app/g1' }, 'claude');
    expect(update).toHaveBeenCalledWith(12, { url: 'https://gemini.google.com/app/g1', active: true });
    expect(winUpdate).toHaveBeenCalledWith(4, { focused: true });
    // The active (claude) tab is left untouched and no new tab is created.
    expect(create).not.toHaveBeenCalled();
  });

  it('queries by the platform origin pattern', async () => {
    const { query } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
      platformTabs: [{ id: 12, url: 'https://gemini.google.com/app/old', windowId: 4 }],
    });
    await openConversation({ platform: 'gemini', nativeId: '/app/g1' }, 'claude');
    expect(query).toHaveBeenCalledWith({ url: 'https://gemini.google.com/*' });
  });

  it('skips the window focus when the existing tab has no windowId', async () => {
    const { update, winUpdate } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
      platformTabs: [{ id: 12, url: 'https://gemini.google.com/app/old' }],
    });
    await openConversation({ platform: 'gemini', nativeId: '/app/g1' }, 'claude');
    expect(update).toHaveBeenCalledWith(12, { url: 'https://gemini.google.com/app/g1', active: true });
    expect(winUpdate).not.toHaveBeenCalled();
  });
});

describe('openConversation — cross-platform (new tab)', () => {
  it('opens a new tab when no tab for that platform is open', async () => {
    const { create, update, winUpdate } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
      platformTabs: [],
    });
    await openConversation({ platform: 'gemini', nativeId: '/app/g1' }, 'claude');
    expect(create).toHaveBeenCalledWith({ url: 'https://gemini.google.com/app/g1' });
    expect(update).not.toHaveBeenCalled();
    expect(winUpdate).not.toHaveBeenCalled();
  });

  it('does nothing for a cross-platform open when the platform has no registered origin', async () => {
    const { create, update } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
    });
    await openConversation({ platform: 'grok', nativeId: '/c/x' }, 'claude');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('openConversation — guards & privacy', () => {
  it('is a no-op when there is no chrome (non-extension context)', async () => {
    await expect(openConversation({ platform: 'claude', nativeId: '/chat/abc' }, 'claude')).resolves.toBeUndefined();
  });

  it('reads only tab URLs — never page content', async () => {
    const { query } = stubChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/current' },
      platformTabs: [{ id: 12, url: 'https://gemini.google.com/app/old', windowId: 4 }],
    });
    await openConversation({ platform: 'gemini', nativeId: '/app/g1' }, 'claude');
    // The only read is the platform-origin tab query; no executeScript / content
    // read exists on the shim and none is reached for.
    expect(query).toHaveBeenCalledWith({ url: 'https://gemini.google.com/*' });
  });
});
