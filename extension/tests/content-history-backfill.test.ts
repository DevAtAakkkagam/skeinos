// Content-script orchestration of the history backfill (chatgpt-history-backfill,
// section 5): the sweep runs once per install per platform, list ingest is suspended
// while it runs, exactly one backfill-flagged ingest follows it, and the whole thing
// is best-effort. Maps to the platform-adapter scenarios "First visit sweeps, later
// visits do not" and "Ingest is suspended during the sweep".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  listConversations: vi.fn(() => [{ nativeId: 'n1', title: 'First chat' }]),
  detectConversation: vi.fn(() => ({ nativeId: 'n1', title: 'First chat', url: '/c/n1' })),
  observe: vi.fn((_cb: (e: unknown) => void) => () => {}),
  selfCheck: vi.fn(() => ({ ok: true, missing: [] as string[] })),
  classify: vi.fn((): string => 'ready'),
  expandHistory: vi.fn(
    async (): Promise<import('../src/adapters/types').HistoryExpansionSummary> => ({
      startCount: 5,
      finalCount: 17,
      distinctSeen: 17,
      rounds: 6,
      stoppedBy: 'plateau',
    }),
  ),
  mutateWorkspaceRemote: vi.fn(async () => ({ ok: true, data: {} })),
  isHistoryBackfilled: vi.fn(async () => false),
  recordHistoryBackfillRemote: vi.fn(async () => ({ ok: true, data: {} })),
  loadConfig: vi.fn(async (): Promise<Record<string, unknown>> => ({
    platformId: 'chatgpt',
    behaviors: { historyExpansion: { mode: 'scroll' } },
  })),
}));

vi.mock('../src/adapters', () => ({
  matchPlatform: () => 'chatgpt',
  getPlatformHealth: async () => ({ hotfixWanted: false }),
  loadConfig: m.loadConfig,
  createAdapter: () => ({
    selfCheck: m.selfCheck,
    classify: m.classify,
    listConversations: m.listConversations,
    detectConversation: m.detectConversation,
    expandHistory: m.expandHistory,
    // No message content in these tests — the content-index seam is covered
    // elsewhere; an empty read keeps it a no-op here.
    readMessages: async () => [],
    observe: m.observe,
    mountPoints: () => null,
    inputBarMount: () => null,
    insertText: () => true,
    configVersion: '1.3.0',
  }),
  reportHealth: async () => {},
  mountBanner: vi.fn(),
  installDebugGlobal: () => () => {},
  waitForSelfCheck: async (a: { selfCheck: () => { ok: boolean; missing: string[] } }) =>
    a.selfCheck(),
}));

vi.mock('../src/core/folders', () => ({
  mutateWorkspaceRemote: m.mutateWorkspaceRemote,
  isHistoryBackfilled: m.isHistoryBackfilled,
  recordHistoryBackfillRemote: m.recordHistoryBackfillRemote,
}));

import { runContent } from '../src/content';

/** Every `conversation.ingest` sent so far. */
function ingests(): { backfill?: boolean }[] {
  return (m.mutateWorkspaceRemote.mock.calls as unknown as Array<[{ op: string }]>)
    .map(([msg]) => msg)
    .filter((msg) => msg.op === 'conversation.ingest') as { backfill?: boolean }[];
}

/** Run the content script and let its async backfill chain settle. */
async function activate(): Promise<void> {
  await runContent();
  await vi.waitFor(() => expect(m.mutateWorkspaceRemote).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  m.selfCheck.mockReturnValue({ ok: true, missing: [] });
  m.classify.mockReturnValue('ready');
  m.isHistoryBackfilled.mockResolvedValue(false);
  m.expandHistory.mockResolvedValue({
    startCount: 5,
    finalCount: 17,
    distinctSeen: 17,
    rounds: 6,
    stoppedBy: 'plateau',
  });
  m.loadConfig.mockResolvedValue({
    platformId: 'chatgpt',
    behaviors: { historyExpansion: { mode: 'scroll' } },
  });
  document.body.innerHTML = '';
  (globalThis as { chrome?: unknown }).chrome = { runtime: { id: 'test-extension' } };
  delete (globalThis as { __skeinosContentStarted?: boolean }).__skeinosContentStarted;
});

afterEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('history backfill: once per install per platform', () => {
  it('sweeps on the first activation, then ingests once and records the outcome', async () => {
    await activate();
    await vi.waitFor(() => expect(m.recordHistoryBackfillRemote).toHaveBeenCalled());

    expect(m.expandHistory).toHaveBeenCalledTimes(1);
    expect(m.recordHistoryBackfillRemote).toHaveBeenCalledWith('chatgpt', 'plateau');
    // Exactly one ingest, and it carries the backfill flag so the worker stamps the
    // newly-discovered conversations below the existing floor instead of at "now".
    expect(ingests()).toEqual([expect.objectContaining({ backfill: true })]);
  });

  it('does not sweep again once a backfill is recorded', async () => {
    m.isHistoryBackfilled.mockResolvedValue(true);

    await activate();
    await vi.waitFor(() => expect(ingests()).toHaveLength(1));

    expect(m.expandHistory).not.toHaveBeenCalled();
    expect(m.recordHistoryBackfillRemote).not.toHaveBeenCalled();
    // The ordinary on-load ingest still happens — and is NOT flagged as a backfill,
    // so it keeps today's `now - position` stamping.
    expect(ingests()[0].backfill).toBeUndefined();
  });

  it('records a capped sweep as the incomplete outcome it was', async () => {
    m.expandHistory.mockResolvedValue({
      startCount: 5,
      finalCount: 400,
      distinctSeen: 400,
      rounds: 120,
      stoppedBy: 'cap',
    });

    await activate();

    await vi.waitFor(() =>
      expect(m.recordHistoryBackfillRemote).toHaveBeenCalledWith('chatgpt', 'cap'),
    );
  });

  it('never sweeps a platform whose config declares no historyExpansion', async () => {
    m.loadConfig.mockResolvedValue({ platformId: 'claude', behaviors: {} });

    await activate();

    expect(m.expandHistory).not.toHaveBeenCalled();
    expect(m.isHistoryBackfilled).not.toHaveBeenCalled();
    expect(ingests()).toHaveLength(1);
    expect(ingests()[0].backfill).toBeUndefined();
  });

  it('never sweeps on the signed-out compose path', async () => {
    m.selfCheck.mockReturnValue({ ok: false, missing: ['conversationList'] });
    m.classify.mockReturnValue('signed-out-compose');

    await runContent();

    expect(m.expandHistory).not.toHaveBeenCalled();
    expect(m.mutateWorkspaceRemote).not.toHaveBeenCalled();
  });
});

describe('history backfill: ingest is suspended for the duration', () => {
  it('sends no ingest while the sweep runs, then exactly one afterwards', async () => {
    let release!: () => void;
    const sweeping = new Promise<void>((resolve) => {
      release = resolve;
    });
    let onChange: ((e: { type: string }) => void) | undefined;
    m.observe.mockImplementationOnce((cb) => {
      onChange = cb as (e: { type: string }) => void;
      return () => {};
    });
    m.expandHistory.mockImplementationOnce(async () => {
      await sweeping;
      return {
        startCount: 5,
        finalCount: 17,
        distinctSeen: 17,
        rounds: 6,
        stoppedBy: 'plateau' as const,
      };
    });

    vi.useFakeTimers();
    try {
      void runContent();
      await vi.waitFor(() => expect(m.expandHistory).toHaveBeenCalled());

      // The sweep's own scrolling makes the host list mutate repeatedly — every
      // one of those would otherwise debounce into a partial-snapshot ingest.
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(600);
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(600);
      expect(ingests()).toHaveLength(0);

      release();
      await vi.waitFor(() => expect(ingests()).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(600);

      // Still exactly one — the pending debounce from mid-sweep was dropped rather
      // than firing a second, unflagged ingest right after the backfill one.
      expect(ingests()).toEqual([expect.objectContaining({ backfill: true })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes ordinary ingest once the sweep is done', async () => {
    let onChange: ((e: { type: string }) => void) | undefined;
    m.observe.mockImplementationOnce((cb) => {
      onChange = cb as (e: { type: string }) => void;
      return () => {};
    });
    await activate();
    await vi.waitFor(() => expect(ingests()).toHaveLength(1));

    vi.useFakeTimers();
    try {
      // A genuinely new chat appears after the sweep: normal ingest still works.
      onChange?.({ type: 'list-changed' });
      await vi.advanceTimersByTimeAsync(600);
      expect(ingests()).toHaveLength(2);
      expect(ingests()[1].backfill).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('history backfill is best-effort', () => {
  it('logs a warning and still ingests when the sweep throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.expandHistory.mockRejectedValueOnce(new Error('host changed shape'));

    await activate();
    await vi.waitFor(() => expect(ingests()).toHaveLength(1));

    expect(warn).toHaveBeenCalledWith(
      '[Skeinos] history backfill failed',
      'chatgpt',
      expect.any(Error),
    );
    // A failed sweep is not a recorded backfill — the next visit may try again —
    // and the ingest that follows is an ordinary one.
    expect(m.recordHistoryBackfillRemote).not.toHaveBeenCalled();
    expect(ingests()[0].backfill).toBeUndefined();
    warn.mockRestore();
  });

  it('still ingests when the durable-state read fails', async () => {
    m.isHistoryBackfilled.mockRejectedValueOnce(new Error('worker asleep'));

    await activate();

    await vi.waitFor(() => expect(ingests()).toHaveLength(1));
    expect(m.expandHistory).not.toHaveBeenCalled();
  });
});
