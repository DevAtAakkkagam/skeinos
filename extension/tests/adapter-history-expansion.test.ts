// platform-adapter spec coverage for the history-expansion sweep
// (chatgpt-history-backfill): the optional `behaviors.historyExpansion` schema,
// runtime scroller discovery, and the sweep's stop conditions / bounds / restore
// guarantees. happy-dom does no layout, so the fixtures below define
// `scrollHeight`/`clientHeight`/`scrollTop` explicitly and paginate on the same
// signal a real host does — reaching the end of the scroller.

import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { findScroller } from '../src/adapters/runtime/scroller';
import { loadConfig } from '../src/adapters/runtime/loader';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import type { AdapterConfig } from '../src/adapters/types';

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    platformId: 'chatgpt',
    configVersion: '1.0.0',
    hostMatch: ['*://chatgpt.com/*'],
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
    behaviors: { insertMode: 'execCommand', submitMode: 'click', supportsSystemPrompt: false },
    ...overrides,
  };
}

function withExpansion(expansion: unknown): AdapterConfig {
  const cfg = makeConfig();
  (cfg.behaviors as unknown as Record<string, unknown>).historyExpansion = expansion;
  return cfg;
}

// ---------------------------------------------------------------------------
// 1.4 — schema validation
// ---------------------------------------------------------------------------

describe('AdapterConfig validation: behaviors.historyExpansion', () => {
  it('accepts a config that declares scroll mode', () => {
    expect(isValidationErrors(validateAdapterConfig(withExpansion({ mode: 'scroll' })))).toBe(false);
  });

  it('accepts a config that omits historyExpansion entirely', () => {
    expect(isValidationErrors(validateAdapterConfig(makeConfig()))).toBe(false);
  });

  it('accepts positive tuning fields', () => {
    const cfg = withExpansion({
      mode: 'scroll',
      settleMs: 500,
      stableRounds: 3,
      maxRounds: 50,
      maxMs: 30_000,
    });
    expect(isValidationErrors(validateAdapterConfig(cfg))).toBe(false);
  });

  it('rejects a mode outside the enum (including the reserved-but-unbuilt "route")', () => {
    for (const mode of ['route', 'teleport', 42, undefined]) {
      const result = validateAdapterConfig(withExpansion({ mode }));
      expect(isValidationErrors(result)).toBe(true);
      if (isValidationErrors(result)) {
        expect(result.some((e) => e.path === 'behaviors.historyExpansion.mode')).toBe(true);
      }
    }
  });

  it('rejects a tuning field that is not a positive number', () => {
    for (const [key, value] of [
      ['settleMs', 0],
      ['stableRounds', -1],
      ['maxRounds', 'lots'],
      ['maxMs', Number.NaN],
    ] as const) {
      const result = validateAdapterConfig(withExpansion({ mode: 'scroll', [key]: value }));
      expect(isValidationErrors(result)).toBe(true);
      if (isValidationErrors(result)) {
        expect(result.some((e) => e.path === `behaviors.historyExpansion.${key}`)).toBe(true);
      }
    }
  });

  it('rejects a non-object historyExpansion', () => {
    const result = validateAdapterConfig(withExpansion('scroll'));
    expect(isValidationErrors(result)).toBe(true);
    if (isValidationErrors(result)) {
      expect(result.some((e) => e.path === 'behaviors.historyExpansion')).toBe(true);
    }
  });

  it('builds no adapter from an invalid historyExpansion — the loader keeps bundled', async () => {
    const bundled = makeConfig({ configVersion: '1.0.0' });
    const result = await loadConfig('chatgpt', {
      bundled,
      cache: { read: async () => undefined, write: async () => {} },
      // A newer remote config that would otherwise win, spoiled by a bad mode.
      fetchRemote: async () => {
        const remote = withExpansion({ mode: 'route' });
        remote.configVersion = '9.9.9';
        return remote;
      },
    });
    expect(result?.configVersion).toBe('1.0.0');
    expect(result?.behaviors.historyExpansion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A fake paginating host list. `onEnd` fires when something scrolls the container
// to its end — exactly the signal ChatGPT uses to fetch its next page.
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 40;
const VIEWPORT = 100;

/** One host reaction to reaching the end of the scroller: append rows, and/or grow
 *  the scroll height alone (the placeholder rounds the live trace showed). */
interface Page {
  rows?: number;
  extraHeight?: number;
}

interface FakeList {
  root: HTMLElement;
  scroller: HTMLElement;
  /** How many rows the host has rendered so far. */
  rendered(): number;
  dispose(): void;
}

/**
 * Build a host-shaped DOM whose scroller paginates. `nextPage(round)` returns what
 * the host renders when the scroller next reaches its end, or `null` when it has
 * nothing left (the plateau).
 */
function buildFakeList(opts: {
  initialRows: number;
  nextPage: (round: number) => Page | null;
  /** Where the scrolling element sits relative to the configured list element. */
  scrollerAt?: 'ancestor' | 'self' | 'descendant';
}): FakeList {
  const scrollerAt = opts.scrollerAt ?? 'ancestor';
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="outer">
      <div class="scrollport">
        <div class="list"><div class="inner"></div></div>
      </div>
    </div>
    <div class="sidebar"></div>
    <div class="input-bar"><textarea class="composer"></textarea><button class="send"></button></div>
  `;
  document.body.appendChild(root);

  const rowHost = root.querySelector<HTMLElement>(
    scrollerAt === 'descendant' ? '.inner' : '.list',
  )!;
  const scroller = root.querySelector<HTMLElement>(
    scrollerAt === 'ancestor' ? '.scrollport' : scrollerAt === 'self' ? '.list' : '.inner',
  )!;
  scroller.setAttribute('style', 'overflow-y: auto');

  let rows = 0;
  let extraHeight = 0;
  let round = 0;
  let top = 0;

  const addRows = (n: number): void => {
    for (let i = 0; i < n; i++) {
      const id = `c-${rows + i + 1}`;
      const item = document.createElement('a');
      item.className = 'item';
      item.setAttribute('data-id', id);
      item.setAttribute('href', `/c/${id}`);
      item.innerHTML = `<span class="title">Chat ${rows + i + 1}</span>`;
      rowHost.appendChild(item);
    }
    rows += n;
  };
  addRows(opts.initialRows);

  const height = (): number => rows * ROW_HEIGHT + extraHeight;
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: height });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
      if (value < height() - VIEWPORT) return; // not at the end: nothing to fetch
      const page = opts.nextPage(round++);
      if (!page) return;
      if (page.extraHeight) extraHeight += page.extraHeight;
      if (page.rows) addRows(page.rows);
    },
  });

  return { root, scroller, rendered: () => rows, dispose: () => root.remove() };
}

/** The sweep's tuning, shrunk so a test round costs ~1ms instead of ~900ms. */
const FAST = { settleMs: 1, stableRounds: 2 };

// ---------------------------------------------------------------------------
// 2.2 / 2.3 — runtime scroller discovery
// ---------------------------------------------------------------------------

describe('findScroller: runtime discovery in both directions', () => {
  function scrollable(el: HTMLElement, overflow: number): HTMLElement {
    el.setAttribute('style', 'overflow-y: auto');
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: VIEWPORT + overflow });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: VIEWPORT });
    return el;
  }

  function shape(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('finds the list element itself', () => {
    const root = shape('<div class="wrap"><div class="list"></div></div>');
    const list = scrollable(root.querySelector('.list')!, 500);
    expect(findScroller(list)).toBe(list);
    root.remove();
  });

  it('finds an ancestor of the list (the ChatGPT shape)', () => {
    const root = shape('<div class="scrollport"><div class="mid"><div class="list"></div></div></div>');
    const port = scrollable(root.querySelector('.scrollport')!, 500);
    expect(findScroller(root.querySelector('.list'))).toBe(port);
    root.remove();
  });

  it('finds a descendant of the list (the Claude shape)', () => {
    const root = shape('<div class="list"><div class="nav-scroll"></div></div>');
    const inner = scrollable(root.querySelector('.nav-scroll')!, 500);
    expect(findScroller(root.querySelector('.list'))).toBe(inner);
    root.remove();
  });

  it('returns null when nothing in the tree — or the document — scrolls', () => {
    const root = shape('<div class="wrap"><div class="list"><div class="inner"></div></div></div>');
    expect(findScroller(root.querySelector('.list'))).toBeNull();
    root.remove();
  });

  it('ignores an element that overflows but is not scrollable', () => {
    const root = shape('<div class="wrap"><div class="list"></div></div>');
    const list = root.querySelector<HTMLElement>('.list')!;
    // Overflowing content, but `overflow-y: visible` — the page scrolls, not this.
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 5000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: VIEWPORT });
    expect(findScroller(list)).toBeNull();
    root.remove();
  });

  it('picks the largest-overflow candidate when several qualify', () => {
    const root = shape(
      '<div class="outer"><div class="scrollport"><div class="list"><div class="inner"></div></div></div></div>',
    );
    scrollable(root.querySelector('.outer')!, 100);
    const port = scrollable(root.querySelector('.scrollport')!, 4000);
    scrollable(root.querySelector('.list')!, 300);
    scrollable(root.querySelector('.inner')!, 900);
    expect(findScroller(root.querySelector('.list'))).toBe(port);
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// 3.5 — the sweep
// ---------------------------------------------------------------------------

describe('expandHistory: the sweep', () => {
  const config = makeConfig({
    behaviors: {
      insertMode: 'execCommand',
      submitMode: 'click',
      supportsSystemPrompt: false,
      historyExpansion: { mode: 'scroll' },
    },
  });

  it('loads a paginating list to completion and reports a plateau', async () => {
    // 3 further pages of 4, then the host has nothing left — 5 + 12 = 17 rows.
    const pages: Page[] = [{ rows: 4 }, { rows: 4 }, { rows: 4 }];
    const fake = buildFakeList({ initialRows: 5, nextPage: (r) => pages[r] ?? null });
    const adapter = createAdapter(config, { root: fake.root });

    const summary = await adapter.expandHistory(FAST);

    expect(summary.stoppedBy).toBe('plateau');
    expect(summary.startCount).toBe(5);
    expect(summary.finalCount).toBe(17);
    expect(adapter.listConversations()).toHaveLength(17);
    // Nothing was recycled: every id ever seen is still rendered (append-only).
    expect(summary.distinctSeen).toBe(summary.finalCount);
    fake.dispose();
  });

  it('does not stop early on a placeholder round that grows only the scroll height', async () => {
    // The live trace's shape: a short height-only round before each real page.
    const pages: Page[] = [
      { extraHeight: 200 },
      { rows: 6 },
      { extraHeight: 200 },
      { rows: 6 },
    ];
    const fake = buildFakeList({ initialRows: 5, nextPage: (r) => pages[r] ?? null });
    const adapter = createAdapter(config, { root: fake.root });

    const summary = await adapter.expandHistory(FAST);

    // Counting rows alone would have plateaued at the first placeholder round and
    // stopped at 5; treating height growth as growth carries it to the end.
    expect(summary.finalCount).toBe(17);
    expect(summary.stoppedBy).toBe('plateau');
    fake.dispose();
  });

  it('stops at the round cap on a list that never stops growing', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: () => ({ rows: 2 }) });
    const adapter = createAdapter(config, { root: fake.root });

    const summary = await adapter.expandHistory({ ...FAST, maxRounds: 4 });

    expect(summary.stoppedBy).toBe('cap');
    expect(summary.rounds).toBe(4);
    expect(summary.finalCount).toBe(13); // 5 + 4 rounds × 2
    fake.dispose();
  });

  it('stops at the wall-clock cap on a list that never stops growing', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: () => ({ rows: 2 }) });
    const adapter = createAdapter(config, { root: fake.root });

    const summary = await adapter.expandHistory({ settleMs: 5, stableRounds: 99, maxMs: 12 });

    expect(summary.stoppedBy).toBe('cap');
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.rounds).toBeLessThan(20); // bounded by time, not by the round cap
    fake.dispose();
  });

  it('restores the original scroll position after a plateau', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: (r) => (r < 2 ? { rows: 4 } : null) });
    fake.scroller.scrollTop = 40; // where the user had left their sidebar
    const adapter = createAdapter(config, { root: fake.root });

    await adapter.expandHistory(FAST);

    expect(fake.scroller.scrollTop).toBe(40);
    fake.dispose();
  });

  it('restores the original scroll position after a cap', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: () => ({ rows: 2 }) });
    fake.scroller.scrollTop = 40;
    const adapter = createAdapter(config, { root: fake.root });

    await adapter.expandHistory({ ...FAST, maxRounds: 3 });

    expect(fake.scroller.scrollTop).toBe(40);
    fake.dispose();
  });

  it('restores the original scroll position when the sweep throws mid-round', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: () => ({ rows: 2 }) });
    fake.scroller.scrollTop = 60;
    const adapter = createAdapter(config, { root: fake.root });
    // A host that tears its list out mid-sweep: the next measurement throws.
    let calls = 0;
    const list = fake.root.querySelector<HTMLElement>('.list')!;
    const original = list.querySelectorAll.bind(list);
    list.querySelectorAll = ((sel: string) => {
      if (++calls > 1) throw new Error('list detached');
      return original(sel);
    }) as typeof list.querySelectorAll;

    const summary = await adapter.expandHistory(FAST);

    expect(summary.stoppedBy).toBe('noop');
    expect(fake.scroller.scrollTop).toBe(60);
    fake.dispose();
  });

  it('runs zero rounds when the config declares no historyExpansion', async () => {
    const fake = buildFakeList({ initialRows: 5, nextPage: () => ({ rows: 4 }) });
    const adapter = createAdapter(makeConfig(), { root: fake.root });

    const summary = await adapter.expandHistory(FAST);

    expect(summary).toEqual({
      startCount: 0,
      finalCount: 0,
      distinctSeen: 0,
      rounds: 0,
      stoppedBy: 'noop',
    });
    // Nothing scrolled, so the host never paginated.
    expect(fake.rendered()).toBe(5);
    fake.dispose();
  });

  it('resolves as a no-op when the conversation list does not resolve', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="sidebar"></div>';
    document.body.appendChild(root);
    const adapter = createAdapter(config, { root });

    await expect(adapter.expandHistory(FAST)).resolves.toMatchObject({
      rounds: 0,
      stoppedBy: 'noop',
    });
    root.remove();
  });

  it('resolves as a no-op when nothing scrolls', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="list"><a class="item" data-id="c-1"></a></div>';
    document.body.appendChild(root);
    const adapter = createAdapter(config, { root });

    await expect(adapter.expandHistory(FAST)).resolves.toMatchObject({
      rounds: 0,
      stoppedBy: 'noop',
    });
    root.remove();
  });
});
