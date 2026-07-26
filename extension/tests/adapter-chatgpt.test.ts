// adapter-chatgpt spec coverage: the bundled ChatGPT config is schema-valid, the
// host router resolves ChatGPT URLs to it, it passes the shared contract suite
// against the recorded fixture (proving the framework drives it with no per-platform
// code), and its self-check fails cleanly on a broken fixture.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { matchPlatform } from '../src/adapters/runtime/host-match';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { getBundledConfig } from '../src/adapters/configs';
import type { AdapterConfig } from '../src/adapters/types';
import chatgptRaw from '../src/adapters/configs/chatgpt.json';
import expected from './fixtures/chatgpt.expected.json';
import { runAdapterContract, type ContractExpectations } from './adapter-contract';

const chatgptHtml = readFileSync('tests/fixtures/chatgpt.html', 'utf8');
const paginatingHtml = readFileSync('tests/fixtures/chatgpt-paginating.html', 'utf8');
const chatgptConfig = getBundledConfig('chatgpt') as AdapterConfig;

describe('ChatGPT adapter config', () => {
  it('the bundled ChatGPT config is valid', () => {
    const result = validateAdapterConfig(chatgptRaw);
    expect(isValidationErrors(result)).toBe(false);
    if (!isValidationErrors(result)) {
      expect(result.platformId).toBe('chatgpt');
      expect(result.hostMatch).toContain('*://chatgpt.com/*');
    }
  });

  it('the host router resolves a ChatGPT URL to "chatgpt"', () => {
    expect(matchPlatform('https://chatgpt.com/c/abc123')).toBe('chatgpt');
  });

  it('enables the scroll history sweep', () => {
    // ChatGPT paginates its sidebar (~28 rows a page, fetched only on reaching the
    // end), so without a sweep the majority of a user's history never reaches the
    // index. This is the one platform that opts in.
    expect(chatgptConfig.behaviors.historyExpansion?.mode).toBe('scroll');
  });
});

// ---------------------------------------------------------------------------
// The paginating fixture: rows arrive a page at a time as the sidebar scrollport
// is driven to its end, and previously-rendered rows are never removed
// (ChatGPT's list is append-only — the assumption the backfill rests on).
// happy-dom does no layout, so the scroll metrics are defined explicitly.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 4;
const TOTAL_PAGES = 5;
const TOTAL_ROWS = PAGE_SIZE * TOTAL_PAGES;
const ROW_HEIGHT = 40;
const VIEWPORT = 100;

function mountPaginatingFixture(): { root: HTMLElement; scroller: HTMLElement } {
  const root = document.createElement('div');
  root.innerHTML = paginatingHtml;
  document.body.appendChild(root);

  const scroller = root.querySelector<HTMLElement>('nav.scrollport')!;
  const history = root.querySelector<HTMLElement>('#history')!;
  let rendered = 0;
  let top = 0;

  const renderPage = (): void => {
    if (rendered >= TOTAL_ROWS) return; // the account has no more conversations
    for (let i = 0; i < PAGE_SIZE; i++) {
      const n = rendered + i + 1;
      const row = document.createElement('a');
      row.setAttribute('href', `/c/conv-${n}`);
      row.innerHTML = `<div class="truncate"><span>Chat ${n}</span></div>`;
      history.appendChild(row);
    }
    rendered += PAGE_SIZE;
  };
  renderPage(); // the page ChatGPT renders on load

  const height = (): number => rendered * ROW_HEIGHT;
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: height });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
      if (value >= height() - VIEWPORT) renderPage(); // reached the end: fetch next
    },
  });

  return { root, scroller };
}

describe('ChatGPT: the paginating sidebar is swept to completion', () => {
  // Real-time settle waits would make this a ~9s test; the sweep's tuning is the
  // adapter's, and the shortened settle only changes how long we wait per round.
  const FAST = { settleMs: 1, stableRounds: 2 };

  it('loads every page and completes by plateau', async () => {
    const { root } = mountPaginatingFixture();
    const adapter = createAdapter(chatgptConfig, { root });

    // The initial DOM shows one page — the truncated view of history the user's
    // index would otherwise be built from.
    expect(adapter.listConversations()).toHaveLength(PAGE_SIZE);

    const summary = await adapter.expandHistory(FAST);

    expect(summary.stoppedBy).toBe('plateau');
    expect(summary.startCount).toBe(PAGE_SIZE);
    expect(summary.finalCount).toBe(TOTAL_ROWS);

    const refs = adapter.listConversations();
    expect(refs).toHaveLength(TOTAL_ROWS);
    expect(refs.map((r) => r.nativeId)).toEqual(
      Array.from({ length: TOTAL_ROWS }, (_, i) => `/c/conv-${i + 1}`),
    );
    expect(refs.map((r) => r.title)).toEqual(
      Array.from({ length: TOTAL_ROWS }, (_, i) => `Chat ${i + 1}`),
    );
    root.remove();
  });

  it('recycles no rows — distinct ids seen equals the final row count', async () => {
    const { root } = mountPaginatingFixture();
    const adapter = createAdapter(chatgptConfig, { root });

    const summary = await adapter.expandHistory(FAST);

    // If ChatGPT ever switched to windowed virtualization, more ids would have been
    // seen than remain rendered — the signal that one sweep is no longer enough.
    expect(summary.distinctSeen).toBe(summary.finalCount);
    expect(summary.distinctSeen).toBe(TOTAL_ROWS);
    root.remove();
  });

  it('restores the sidebar scroll position the user had', async () => {
    const { root, scroller } = mountPaginatingFixture();
    scroller.scrollTop = 20;
    const adapter = createAdapter(chatgptConfig, { root });

    await adapter.expandHistory(FAST);

    expect(scroller.scrollTop).toBe(20);
    root.remove();
  });
});

// ChatGPT passes the shared contract suite against the recorded fixture.
runAdapterContract({
  name: 'chatgpt',
  config: chatgptConfig,
  html: chatgptHtml,
  expected: expected as ContractExpectations,
});

describe('ChatGPT self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the #prompt-textarea composer removed.
    root.innerHTML = chatgptHtml.replace(
      /<div id="prompt-textarea"[^>]*><\/div>/,
      '',
    );
    document.body.appendChild(root);

    const adapter = createAdapter(chatgptConfig, { root });
    let result!: ReturnType<typeof adapter.selfCheck>;
    expect(() => {
      result = adapter.selfCheck();
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');

    root.remove();
  });
});
