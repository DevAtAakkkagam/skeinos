// Runs in real Chromium, so `overflow-y`, `scrollHeight`/`clientHeight`, and
// scrolling are real layout — the guarantee a DOM emulator cannot make, and the
// one runtime scroller discovery actually depends on (chatgpt-history-backfill,
// design D1). The happy-dom suite defines those metrics by hand; this one earns
// them from the browser's own layout engine.

import { afterEach, describe, expect, it } from 'vitest';
import { createAdapter } from '../../src/adapters/runtime/adapter';
import { findScroller } from '../../src/adapters/runtime/scroller';
import type { AdapterConfig } from '../../src/adapters/types';

const CONFIG: AdapterConfig = {
  platformId: 'chatgpt',
  configVersion: '1.0.0',
  hostMatch: ['*://chatgpt.com/*'],
  selectors: {
    conversationList: '#history',
    conversationItem: 'a[href^="/c/"]',
    conversationTitle: '.truncate',
    conversationIdAttr: 'href',
    messageUser: '.msg-user',
    messageAssistant: '.msg-ai',
    composer: '#prompt-textarea',
    sendButton: 'button.send',
    sidebarAnchor: 'nav',
    inputBarAnchor: 'form',
  },
  behaviors: {
    insertMode: 'execCommand',
    submitMode: 'click',
    supportsSystemPrompt: false,
    historyExpansion: { mode: 'scroll' },
  },
};

const PAGE_SIZE = 6;
const TOTAL_ROWS = 30;

afterEach(() => {
  document.body.innerHTML = '';
});

function row(n: number): string {
  return `<a href="/c/conv-${n}" style="display:block;height:40px"><div class="truncate">Chat ${n}</div></a>`;
}

/**
 * The ChatGPT shape, with real layout: `#history` does not scroll — the `nav`
 * scrollport ABOVE it does, because it is the element with the bounded height.
 * The host fetches its next page when that scrollport reaches its end.
 */
function mountHost(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <nav class="scrollport" style="height:120px;overflow-y:auto">
      <div class="pad"><aside id="history"></aside></div>
    </nav>
    <form><div id="prompt-textarea" contenteditable="true"></div><button class="send"></button></form>
  `;
  document.body.appendChild(root);

  const scroller = root.querySelector<HTMLElement>('nav.scrollport')!;
  const history = root.querySelector<HTMLElement>('#history')!;
  let rendered = 0;
  const renderPage = (): void => {
    if (rendered >= TOTAL_ROWS) return;
    const next = Math.min(PAGE_SIZE, TOTAL_ROWS - rendered);
    for (let i = 0; i < next; i++) history.insertAdjacentHTML('beforeend', row(rendered + i + 1));
    rendered += next;
  };
  renderPage();
  // The host's own lazy-load trigger: reaching the end of the scrollport.
  scroller.addEventListener('scroll', () => {
    if (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1) renderPage();
  });
  return root;
}

describe('history expansion (real browser)', () => {
  it('discovers the scrolling ancestor of the configured list', () => {
    const root = mountHost();
    const list = root.querySelector('#history')!;

    // `#history` itself has no bounded height, so it cannot be the scroller — the
    // reason this is discovered at runtime instead of configured as a selector.
    expect(list.scrollHeight - list.clientHeight).toBeLessThanOrEqual(4);
    expect(findScroller(list)).toBe(root.querySelector('nav.scrollport'));
  });

  it('drives a real scrollport to its end until the list stops growing', async () => {
    const root = mountHost();
    const adapter = createAdapter(CONFIG, { root });
    expect(adapter.listConversations()).toHaveLength(PAGE_SIZE);

    // Real scroll events are asynchronous, so the settle wait has to be a real one
    // — short, but long enough for the host's listener to render its next page.
    const summary = await adapter.expandHistory({ settleMs: 30, stableRounds: 2 });

    expect(summary.stoppedBy).toBe('plateau');
    expect(summary.finalCount).toBe(TOTAL_ROWS);
    expect(summary.distinctSeen).toBe(TOTAL_ROWS);
    expect(adapter.listConversations()).toHaveLength(TOTAL_ROWS);
  });

  it('leaves the scrollport where the user had it', async () => {
    const root = mountHost();
    const scroller = root.querySelector<HTMLElement>('nav.scrollport')!;
    scroller.scrollTop = 20;
    const adapter = createAdapter(CONFIG, { root });

    await adapter.expandHistory({ settleMs: 30, stableRounds: 2 });

    expect(scroller.scrollTop).toBe(20);
  });
});
