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
  selfCheck: vi.fn((): { ok: boolean; missing: string[] } => ({ ok: true, missing: [] })),
  mountBanner: vi.fn(),
  reportHealth: vi.fn(async () => {}),
  mutateWorkspaceRemote: vi.fn(async () => ({ ok: true, data: {} })),
}));
const { selfCheck, mountBanner, reportHealth, mutateWorkspaceRemote } = m;

vi.mock('../src/adapters', () => ({
  matchPlatform: () => 'claude',
  getPlatformHealth: async () => ({ hotfixWanted: false }),
  loadConfig: async () => ({ platformId: 'claude' }),
  createAdapter: () => ({
    selfCheck: m.selfCheck,
    listConversations: m.listConversations,
    configVersion: '1.0.0',
  }),
  reportHealth: m.reportHealth,
  mountBanner: m.mountBanner,
}));

vi.mock('../src/core/folders', () => ({ mutateWorkspaceRemote: m.mutateWorkspaceRemote }));

import { runContent } from '../src/content';

beforeEach(() => {
  vi.clearAllMocks();
  selfCheck.mockReturnValue({ ok: true, missing: [] });
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('content script is DOM-only (7.4)', () => {
  it('runs the adapter pipeline and ingests, but mounts no workspace UI', async () => {
    await runContent();

    // It ingested the host's conversation list through the worker…
    expect(mutateWorkspaceRemote).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'conversation.ingest', platform: 'claude' }),
    );
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

  it('raises the breakage banner (not UI) when the adapter self-check fails', async () => {
    selfCheck.mockReturnValue({ ok: false, missing: ['composer'] });
    await runContent();

    expect(mountBanner).toHaveBeenCalled();
    expect(mutateWorkspaceRemote).not.toHaveBeenCalled();
    expect(document.querySelector('[data-skeinos-dock]')).toBeNull();
  });
});
