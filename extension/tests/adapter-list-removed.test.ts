// Row-removal detection: the adapter turns a genuine host-side delete (a conversation
// row disappearing from the list) into a `list-removed` event, while suppressing the
// look-alikes — virtualization/scroll recycling, a collapsed/torn-down list, and a
// full re-render — so the worker never prunes a conversation the user did not delete.

import { describe, expect, it, vi } from 'vitest';
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

/** A fixture whose `.list` holds one `.item` per id. */
function makeRoot(ids: string[]): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="list">
      ${ids.map((id) => `<a class="item" data-id="${id}"><span class="title">${id}</span></a>`).join('')}
    </div>
    <div class="sidebar"></div>
    <div class="input-bar"><textarea class="composer"></textarea><button class="send"></button></div>
  `;
  return root;
}

const removeItem = (root: HTMLElement, id: string): void =>
  root.querySelector(`.item[data-id="${id}"]`)!.remove();

describe('adapter row-removal detection (list-removed)', () => {
  it('emits list-removed with the deleted id when a single row vanishes', async () => {
    const root = makeRoot(['conv-1', 'conv-2', 'conv-3']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));

    removeItem(root, 'conv-2');

    await vi.waitFor(() =>
      expect(seen).toContainEqual({ type: 'list-removed', nativeIds: ['conv-2'] }),
    );
    dispose();
  });

  it('does NOT emit when a scroll just preceded the removal (virtualization recycle)', async () => {
    const root = makeRoot(['conv-1', 'conv-2', 'conv-3']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));

    // A scroll within the grace window marks the next disappearance as recycling.
    root.querySelector('.list')!.dispatchEvent(new Event('scroll'));
    removeItem(root, 'conv-2');

    // The count change still fires list-changed — proves the observer ran — but no prune.
    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'list-changed' }));
    expect(seen.some((e) => e.type === 'list-removed')).toBe(false);
    dispose();
  });

  it('does NOT emit when the whole list empties (collapse / teardown)', async () => {
    const root = makeRoot(['conv-1', 'conv-2']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));

    root.querySelector('.list')!.innerHTML = '';

    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'list-changed' }));
    expect(seen.some((e) => e.type === 'list-removed')).toBe(false);
    dispose();
  });

  it('does NOT emit when a large burst vanishes at once (full re-render)', async () => {
    const root = makeRoot(['a', 'b', 'c', 'd', 'e', 'f']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));

    // Five disappear but one remains, so this is not the empty-list case — it is still
    // rejected because the burst exceeds the cap (a user deletes one at a time).
    for (const id of ['a', 'b', 'c', 'd', 'e']) removeItem(root, id);

    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'list-changed' }));
    expect(seen.some((e) => e.type === 'list-removed')).toBe(false);
    dispose();
  });

  it('does NOT emit when rows are only added', async () => {
    const root = makeRoot(['conv-1']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));

    const item = document.createElement('a');
    item.className = 'item';
    item.setAttribute('data-id', 'conv-2');
    root.querySelector('.list')!.appendChild(item);

    await vi.waitFor(() => expect(seen).toContainEqual({ type: 'list-changed' }));
    expect(seen.some((e) => e.type === 'list-removed')).toBe(false);
    dispose();
  });

  it('stops emitting after dispose', async () => {
    const root = makeRoot(['conv-1', 'conv-2']);
    const adapter = createAdapter(makeConfig(), { root, getUrl: () => 'https://gemini.google.com/app' });
    const seen: AdapterEvent[] = [];
    const dispose = adapter.observe((e) => seen.push(e));
    dispose();

    removeItem(root, 'conv-2');
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toHaveLength(0);
  });
});
