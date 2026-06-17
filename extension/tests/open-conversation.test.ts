// openConversation — navigating the active tab to a filed conversation. The
// nativeId is a platform-relative href; it resolves against the active tab's URL
// (the panel is scoped to that tab's platform) to the full conversation URL. The
// helper only reads the active tab's URL and updates its location — never content.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openConversation } from '../src/ui/sidebar/openConversation';

type Chrome = { tabs?: unknown };
const g = globalThis as { chrome?: Chrome };

afterEach(() => {
  delete g.chrome;
  vi.restoreAllMocks();
});

function stubTabs(tab: { id?: number; url?: string } | undefined) {
  const update = vi.fn(async () => undefined);
  const query = vi.fn(async () => (tab ? [tab] : []));
  g.chrome = { tabs: { query, update } };
  return { query, update };
}

describe('openConversation', () => {
  it('resolves a relative nativeId against the active tab URL and navigates it', async () => {
    const { update } = stubTabs({ id: 7, url: 'https://claude.ai/chat/current' });
    await openConversation({ nativeId: '/chat/abc' });
    expect(update).toHaveBeenCalledWith(7, { url: 'https://claude.ai/chat/abc', active: true });
  });

  it('passes an absolute nativeId through unchanged', async () => {
    const { update } = stubTabs({ id: 3, url: 'https://claude.ai/chat/current' });
    await openConversation({ nativeId: 'https://claude.ai/chat/xyz' });
    expect(update).toHaveBeenCalledWith(3, { url: 'https://claude.ai/chat/xyz', active: true });
  });

  it('is a no-op when there is no chrome.tabs (non-extension context)', async () => {
    await expect(openConversation({ nativeId: '/chat/abc' })).resolves.toBeUndefined();
  });

  it('does nothing when there is no active tab id or url', async () => {
    const { update } = stubTabs({ url: 'https://claude.ai/chat/current' }); // no id
    await openConversation({ nativeId: '/chat/abc' });
    expect(update).not.toHaveBeenCalled();
  });
});
