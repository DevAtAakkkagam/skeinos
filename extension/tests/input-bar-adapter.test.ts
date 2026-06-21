// input-bar adapter re-anchor coverage (6.1). The adapter's `observe()` is the
// signal the input bar rides to re-anchor itself when an SPA navigation REPLACES
// the composer subtree (design D-3): it must re-emit `composer-ready` on a real
// element-identity change, while leaving the existing initial-emit + disposer
// behaviour intact. Mirrors `tests/adapter-framework.test.ts` (live-document
// fixture + MutationObserver + `vi.waitFor`).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import type { AdapterConfig, AdapterEvent } from '../src/adapters/types';

function makeConfig(): AdapterConfig {
  return {
    platformId: 'gemini',
    configVersion: '1.0.0',
    hostMatch: ['*://gemini.google.com/*'],
    selectors: {
      conversationList: '.list',
      conversationItem: '.item',
      conversationTitle: '.title',
      conversationIdAttr: 'data-id',
      messageUser: '.msg-user',
      messageAssistant: '.msg-ai',
      composer: 'textarea.composer',
      sendButton: 'button.send',
      sidebarAnchor: '.sidebar',
      inputBarAnchor: '.input-bar',
    },
    behaviors: { insertMode: 'react-set', submitMode: 'enter', supportsSystemPrompt: false },
  };
}

const html = `
  <div class="sidebar">
    <div class="list">
      <a class="item" data-id="r-1" aria-current="page"><span class="title">First</span></a>
      <a class="item" data-id="r-2"><span class="title">Second</span></a>
    </div>
  </div>
  <div class="input-bar"><textarea class="composer"></textarea><button class="send"></button></div>
`;

let root: HTMLElement;

function mountFixture(): void {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
}

afterEach(() => {
  root?.remove();
});

describe('adapter observe() re-anchor (6.1)', () => {
  it('emits the initial composer-ready exactly once', async () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/c/r-1' });
    const seen = vi.fn<(e: AdapterEvent) => void>();
    const dispose = adapter.observe(seen);

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'composer-ready' })),
    );
    // No DOM mutation yet → only the single queued initial emit.
    const readyCount = seen.mock.calls.filter(([e]) => e.type === 'composer-ready').length;
    expect(readyCount).toBe(1);

    dispose();
  });

  it('re-emits composer-ready when the composer element identity changes', async () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/c/r-1' });
    const seen = vi.fn<(e: AdapterEvent) => void>();
    const dispose = adapter.observe(seen);

    // Drain the initial emit, then prove the RE-EMIT in isolation.
    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'composer-ready' })),
    );
    seen.mockClear();

    const old = root.querySelector<HTMLTextAreaElement>('textarea.composer')!;
    const fresh = document.createElement('textarea');
    fresh.className = 'composer';
    old.replaceWith(fresh);

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'composer-ready' })),
    );

    dispose();
  });

  it('does NOT re-emit composer-ready when the composer node is re-rendered in place', async () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/c/r-1' });
    const seen = vi.fn<(e: AdapterEvent) => void>();
    const dispose = adapter.observe(seen);

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'composer-ready' })),
    );
    seen.mockClear();

    // Mutate the SAME node (same identity) — an in-place re-render, no swap.
    const composer = root.querySelector<HTMLTextAreaElement>('textarea.composer')!;
    composer.setAttribute('data-rendered', '1');
    composer.value = 'typing';

    await new Promise((r) => setTimeout(r, 20));
    expect(
      seen.mock.calls.filter(([e]) => e.type === 'composer-ready'),
    ).toHaveLength(0);

    dispose();
  });

  it('the disposer stops further re-emit events', async () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/c/r-1' });
    const seen = vi.fn<(e: AdapterEvent) => void>();
    const dispose = adapter.observe(seen);

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'composer-ready' })),
    );

    dispose();
    seen.mockClear();

    // After dispose, a composer swap must produce no events.
    const old = root.querySelector<HTMLTextAreaElement>('textarea.composer')!;
    const fresh = document.createElement('textarea');
    fresh.className = 'composer';
    old.replaceWith(fresh);

    await new Promise((r) => setTimeout(r, 20));
    expect(seen).not.toHaveBeenCalled();
  });
});
