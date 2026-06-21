// input-bar mount lifecycle (6.2).
//
// SEAM CHOICE: the content script's `runContent()` is already exercised end-to-end
// in `tests/content-domonly.test.ts` with a fully mocked adapter/messaging
// environment — reproducing that here just to drive the bar would be heavy and
// brittle. Instead this test covers the OBSERVABLE bar lifecycle at the cleanest
// seam: a real `createAdapter(config, { root }).observe(...)` wired to a small
// `remountInputBar`-style handler over a fixture DOM (exactly the
// dispose-then-mount loop the content script runs). That proves the load-bearing
// behaviours — mount on ready, no mount when self-check fails, EXACTLY ONE bar
// after a composer swap, and dispose on teardown — without the chrome/messaging
// scaffolding. The `mountInputBar` host structure is asserted directly.

import { afterEach, describe, expect, it, vi } from 'vitest';
// The real bar mounts the functional Profile chip, whose default seams hit the worker
// (`core/profiles`) and `chrome.storage.local` (`core/settings`). These lifecycle
// tests don't exercise the chip; stub both so it reads an empty library and never
// touches chrome — keeping the suite hermetic and free of unhandled rejections.
vi.mock('../src/core/profiles', () => ({
  queryProfilesRemote: vi.fn(async () => ({
    ok: true as const,
    data: { kind: 'profile.library' as const, profiles: [] },
  })),
}));
vi.mock('../src/core/settings', () => ({
  getSettings: vi.fn(async () => ({ theme: 'system', telemetry: false, onboardingCompleted: false })),
  setSettings: vi.fn(async () => {}),
  subscribeSettings: vi.fn(() => () => {}),
}));
import { createAdapter } from '../src/adapters/runtime/adapter';
import { mountInputBar } from '../src/ui/input-bar/mountInputBar';
import type { MountHandle } from '../src/ui/mount';
import type { AdapterConfig } from '../src/adapters/types';

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
    </div>
  </div>
  <div class="input-bar"><textarea class="composer"></textarea><button class="send"></button></div>
`;

let root: HTMLElement;
const bars = () => Array.from(document.querySelectorAll('[data-skeinos-root]'))
  .filter((host) => host.shadowRoot?.querySelector('[data-testid="sk-input-bar"]'));

afterEach(() => {
  root?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function mountFixture(markup = html): void {
  root = document.createElement('div');
  root.innerHTML = markup;
  document.body.appendChild(root);
}

describe('input bar mount lifecycle (6.2)', () => {
  it('mountInputBar mounts the bar inside an open shadow root and disposes cleanly', () => {
    mountFixture();
    const anchor = root.querySelector<HTMLElement>('.input-bar')!;
    const handle = mountInputBar(anchor, { platform: 'claude', onInsert: vi.fn() });

    // The shared harness host lives in light DOM with an OPEN shadow root…
    expect(handle.host.getAttribute('data-skeinos-root')).toBe('');
    expect(handle.shadowRoot).toBe(handle.host.shadowRoot);
    // …docked as a block sibling immediately AFTER the anchor (not inside it, so the
    // anchor's own flex/grid layout can't lay the bar out beside the composer).
    expect(anchor.contains(handle.host)).toBe(false);
    expect(anchor.nextElementSibling).toBe(handle.host);
    // …and the bar renders inside it (the toolbar + trigger + stubs).
    const bar = handle.shadowRoot.querySelector('[data-testid="sk-input-bar"]');
    expect(bar).toBeTruthy();
    expect(handle.shadowRoot.querySelector('[data-testid="sk-ib-trigger"]')).toBeTruthy();

    handle.dispose();
    expect(anchor.contains(handle.host)).toBe(false);
    expect(bars()).toHaveLength(0);
  });

  it('mounts the bar when the adapter is ready (self-check passes)', () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root });
    expect(adapter.selfCheck().ok).toBe(true);

    const points = adapter.mountPoints();
    expect(points).not.toBeNull();
    const handle = mountInputBar(points!.inputBar, { platform: 'claude', onInsert: vi.fn() });

    expect(bars()).toHaveLength(1);
    handle.dispose();
  });

  it('does NOT mount the bar when the adapter self-check fails', () => {
    // A fixture missing the composer anchor: self-check fails, so the content
    // script returns early and never reaches the mount call.
    mountFixture(`
      <div class="sidebar"><div class="list"></div></div>
      <div class="input-bar"><button class="send"></button></div>
    `);
    const adapter = createAdapter(makeConfig(), { root });
    const check = adapter.selfCheck();
    expect(check.ok).toBe(false);
    expect(check.missing).toContain('composer');

    // Mirror the content script: on a failed self-check, mount nothing.
    let handle: MountHandle | undefined;
    if (check.ok) handle = mountInputBar(adapter.mountPoints()!.inputBar, { platform: 'claude', onInsert: vi.fn() });

    expect(handle).toBeUndefined();
    expect(bars()).toHaveLength(0);
  });

  it('re-anchors to EXACTLY ONE bar when the composer is swapped (observe → composer-ready)', async () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root });

    // The content script's idempotent (re)mount loop: dispose any prior bar, then
    // mount into the current anchor.
    const handles: { bar?: MountHandle } = {};
    const remount = (): void => {
      handles.bar?.dispose();
      handles.bar = undefined;
      const points = adapter.mountPoints();
      if (!points) return;
      handles.bar = mountInputBar(points.inputBar, { platform: 'claude', onInsert: vi.fn() });
    };

    remount(); // initial dock
    const dispose = adapter.observe((e) => {
      if (e.type === 'composer-ready') remount();
    });

    expect(bars()).toHaveLength(1);

    // SPA navigation replaces the composer node → observe re-emits composer-ready →
    // the bar disposes its orphaned mount and re-anchors. Still exactly one bar.
    const old = root.querySelector<HTMLTextAreaElement>('textarea.composer')!;
    const fresh = document.createElement('textarea');
    fresh.className = 'composer';
    old.replaceWith(fresh);

    await vi.waitFor(() => expect(bars()).toHaveLength(1));
    // And it is docked right after the live input-bar anchor, not orphaned.
    expect(root.querySelector('.input-bar')!.nextElementSibling).toBe(handles.bar!.host);

    dispose();
    handles.bar?.dispose();
    expect(bars()).toHaveLength(0);
  });

  it('disposes the bar on teardown (context invalidation)', () => {
    mountFixture();
    const adapter = createAdapter(makeConfig(), { root });
    const handle = mountInputBar(adapter.mountPoints()!.inputBar, { platform: 'claude', onInsert: vi.fn() });
    expect(bars()).toHaveLength(1);

    // teardown() disposes the bar handle.
    handle.dispose();
    expect(bars()).toHaveLength(0);
  });
});
