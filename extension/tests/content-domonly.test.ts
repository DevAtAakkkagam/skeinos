// Content-script DOM-only behaviour (the `side-panel` change, D4). On a supported
// host the script still runs the adapter pipeline and ingests conversations
// through the worker — but it mounts NO workspace UI into the host page (the
// sidebar shell now lives in the browser side panel). Maps to the side-panel
// spec scenario "Workspace UI is not injected into the host page".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the adapter runtime so the test drives a known happy-path pipeline without
// any real DOM config or selectors. `vi.hoisted` keeps the spies available to the
// hoisted `vi.mock` factories.
const m = vi.hoisted(() => ({
  listConversations: vi.fn(() => [{ nativeId: 'n1', title: 'First chat' }]),
  detectConversation: vi.fn<() => { nativeId: string; title: string; url: string } | null>(() => ({
    nativeId: 'n1',
    title: 'First chat',
    url: '/c/n1',
  })),
  observe: vi.fn((_cb: (e: unknown) => void) => () => {}),
  selfCheck: vi.fn((): { ok: boolean; missing: string[] } => ({ ok: true, missing: [] })),
  mountBanner: vi.fn(),
  reportHealth: vi.fn(async () => {}),
  mutateWorkspaceRemote: vi.fn(async () => ({ ok: true, data: {} })),
  loadConfig: vi.fn(async (): Promise<Record<string, unknown>> => ({ platformId: 'claude' })),
}));
const { selfCheck, mountBanner, reportHealth, mutateWorkspaceRemote } = m;

vi.mock('../src/adapters', () => ({
  matchPlatform: () => 'claude',
  getPlatformHealth: async () => ({ hotfixWanted: false }),
  loadConfig: m.loadConfig,
  createAdapter: () => ({
    selfCheck: m.selfCheck,
    listConversations: m.listConversations,
    detectConversation: m.detectConversation,
    observe: m.observe,
    configVersion: '1.0.0',
  }),
  reportHealth: m.reportHealth,
  mountBanner: m.mountBanner,
  // Delegate the readiness gate straight to the adapter's selfCheck so the
  // pipeline's success/failure paths stay driven by the `selfCheck` spy.
  waitForSelfCheck: async (a: { selfCheck: () => { ok: boolean; missing: string[] } }) =>
    a.selfCheck(),
}));

vi.mock('../src/core/folders', () => ({ mutateWorkspaceRemote: m.mutateWorkspaceRemote }));

import { runContent } from '../src/content';

beforeEach(() => {
  vi.clearAllMocks();
  selfCheck.mockReturnValue({ ok: true, missing: [] });
  document.body.innerHTML = '';
  // The content script now self-terminates once its extension context is
  // invalidated (uninstall/reload) — gated on `chrome.runtime.id`. Stub a live
  // context so the happy-path pipeline runs; the dead-context path is covered
  // by its own test below.
  (globalThis as { chrome?: unknown }).chrome = { runtime: { id: 'test-extension' } };
  // runContent guards against double-injection via a page-global flag; reset it so
  // each test gets a fresh run rather than an early no-op return.
  delete (globalThis as { __skeinosContentStarted?: boolean }).__skeinosContentStarted;
});

afterEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('content script is DOM-only (7.4)', () => {
  it('runs the adapter pipeline and ingests, but mounts no workspace UI', async () => {
    await runContent();

    // It ingested the host's conversation list through the worker…
    expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'conversation.ingest', platform: 'claude' }),
    );
    // …reported the active conversation (id/title only, no content)…
    expect(mutateWorkspaceRemote).toHaveBeenCalledWith({
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'n1',
      title: 'First chat',
      // The mock platform has no `listHiddenWhenCollapsed` flag, so the nudge hint
      // is always false — only Gemini-like platforms ever raise it.
      listCollapsedHint: false,
    });
    // …reported health and (on success) raised no breakage banner…
    expect(reportHealth).toHaveBeenCalled();
    expect(mountBanner).not.toHaveBeenCalled();
    // …and injected NO workspace UI into the host page (no dock, no shadow host).
    expect(document.querySelector('[data-skeinos-dock]')).toBeNull();
    expect(document.querySelector('[data-skeinos-root]')).toBeNull();
    expect(document.body.children.length).toBe(0);
    // The host page layout is untouched (the old reflow set this).
    expect(document.documentElement.style.marginRight).toBe('');
  });

  it('clears the active record when the tab is not on a conversation (home/new-chat)', async () => {
    // The adapter detects no open conversation (a new-chat/home page).
    m.detectConversation.mockReturnValueOnce(null);
    await runContent();

    // It tells the worker to CLEAR the platform's active record rather than leaving
    // a stale highlight — and never sends a reportActive for a missing conversation.
    expect(mutateWorkspaceRemote).toHaveBeenCalledWith({
      op: 'conversation.clearActive',
      platform: 'claude',
    });
    expect(mutateWorkspaceRemote).not.toHaveBeenCalledWith(
      expect.objectContaining({ op: 'conversation.reportActive' }),
    );
  });

  it('clears the active record on SPA navigation away from a conversation (observe → null ref)', async () => {
    // Capture the observe callback so we can drive a live `conversation-changed`
    // event, exercising the content-script wiring (not just the on-load path).
    let onChange: ((e: { type: string; ref: unknown }) => void) | undefined;
    m.observe.mockImplementationOnce((cb) => {
      onChange = cb as (e: { type: string; ref: unknown }) => void;
      return () => {};
    });
    await runContent();
    mutateWorkspaceRemote.mockClear();

    // The host SPA navigates to a new chat: the adapter emits a null ref.
    onChange?.({ type: 'conversation-changed', ref: null });

    expect(mutateWorkspaceRemote).toHaveBeenCalledWith({
      op: 'conversation.clearActive',
      platform: 'claude',
    });
  });

  it('raises the breakage banner (not UI) when the adapter self-check fails', async () => {
    selfCheck.mockReturnValue({ ok: false, missing: ['composer'] });
    await runContent();

    expect(mountBanner).toHaveBeenCalled();
    expect(mutateWorkspaceRemote).not.toHaveBeenCalled();
    expect(document.querySelector('[data-skeinos-dock]')).toBeNull();
  });

  // Indexing-trigger resilience: on SPA hosts the chat list often isn't rendered
  // when self-check passes, and the user navigates without a reload. A one-shot
  // ingest on load silently lost everything; we now re-ingest on `list-changed`
  // (debounced) and recover from an empty first probe.
  describe('re-ingests as the SPA list changes', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('recovers when the list is empty on load, then renders later', async () => {
      // The list hasn't hydrated when self-check passes…
      m.listConversations.mockReturnValueOnce([]);
      let onChange: ((e: { type: string; ref?: unknown }) => void) | undefined;
      m.observe.mockImplementationOnce((cb) => {
        onChange = cb as (e: { type: string }) => void;
        return () => {};
      });
      await runContent();

      // …so nothing was ingested on the empty first probe.
      expect(mutateWorkspaceRemote).not.toHaveBeenCalledWith(
        expect.objectContaining({ op: 'conversation.ingest' }),
      );

      // The list renders and the adapter reports it; the debounced re-ingest fires.
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(500);
      expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'conversation.ingest', platform: 'claude' }),
      );
    });

    it('debounces a burst of list-changed events into a single ingest', async () => {
      let onChange: ((e: { type: string }) => void) | undefined;
      m.observe.mockImplementationOnce((cb) => {
        onChange = cb as (e: { type: string }) => void;
        return () => {};
      });
      await runContent();
      mutateWorkspaceRemote.mockClear();

      // The host mutates its list several times in quick succession.
      onChange?.({ type: 'list-changed' });
      onChange?.({ type: 'list-changed' });
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(500);

      const calls = mutateWorkspaceRemote.mock.calls as unknown as Array<[{ op: string }]>;
      const ingests = calls.filter(([msg]) => msg.op === 'conversation.ingest');
      expect(ingests).toHaveLength(1);
    });
  });

  describe('self-terminates on an invalidated extension context (uninstall/reload)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('disconnects the observer and stops ingesting once the context dies', async () => {
      const dispose = vi.fn();
      let onChange: ((e: { type: string }) => void) | undefined;
      m.observe.mockImplementationOnce((cb) => {
        onChange = cb as (e: { type: string }) => void;
        return dispose;
      });
      await runContent();
      mutateWorkspaceRemote.mockClear();

      // Chrome leaves the script running after uninstall but clears runtime.id.
      delete (globalThis as { chrome?: unknown }).chrome;

      // A host mutation now arrives on the orphaned observer: the script must
      // disconnect and fire NO ingest rather than logging + sending to a dead worker.
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(500);

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(mutateWorkspaceRemote).not.toHaveBeenCalled();
    });
  });

  describe('collapsed-list nudge hint', () => {
    const geminiLike = { platformId: 'gemini', behaviors: { listHiddenWhenCollapsed: true } };

    it('flags listCollapsedHint when a chat is open but the list is empty (drawer collapsed)', async () => {
      m.loadConfig.mockResolvedValueOnce(geminiLike);
      m.listConversations.mockReturnValueOnce([]); // collapsed drawer: no list items
      await runContent();

      // The open conversation is still reported (from the URL), now carrying the
      // nudge hint so the panel can prompt the user to open the drawer.
      expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'conversation.reportActive', listCollapsedHint: true }),
      );
    });

    it('never flags the hint on a platform whose list stays in the DOM when collapsed', async () => {
      // The default mock config omits `listHiddenWhenCollapsed` (Claude/Perplexity).
      m.listConversations.mockReturnValueOnce([]);
      await runContent();

      expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'conversation.reportActive', listCollapsedHint: false }),
      );
    });

    it('clears the hint and ingests once the list renders (drawer opened)', async () => {
      vi.useFakeTimers();
      try {
        m.loadConfig.mockResolvedValueOnce(geminiLike);
        // First probe (collapsed) is empty; after the drawer opens the list renders.
        m.listConversations.mockReturnValueOnce([]).mockReturnValueOnce([
          { nativeId: 'n1', title: 'First chat' },
        ]);
        let onChange: ((e: { type: string }) => void) | undefined;
        m.observe.mockImplementationOnce((cb) => {
          onChange = cb as (e: { type: string }) => void;
          return () => {};
        });
        await runContent();
        mutateWorkspaceRemote.mockClear(); // drop the initial hint=true report

        // The user opens the drawer: items render and the adapter reports the change.
        onChange?.({ type: 'list-changed' });
        await vi.advanceTimersByTimeAsync(500);

        // The full list now ingests, and the active record's hint is re-asserted false.
        expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
          expect.objectContaining({ op: 'conversation.ingest' }),
        );
        expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
          expect.objectContaining({ op: 'conversation.reportActive', listCollapsedHint: false }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
