// usePromptLibrary: the Prompts tab's data layer (design D-C). Mirrors the
// useWorkspace recovery suite — driven through a probe component with the prompt
// client + broadcast subscription mocked, so it runs without the worker.
//
//   load status: loading→ready, loading→error, error→ready (retry)
//   observe-don't-replay: a lost-ack create whose re-read shows it renders it, and
//     the mutation is sent exactly once; a reconcile-to-absent reports failure
//   a state.changed broadcast triggers a re-read (cross-tab convergence)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import type { Response } from '../src/shared/messages';
import type { PromptSnapshot, PromptMutationOp } from '../src/shared/prompts';
import type { Prompt } from '../src/shared/types';

vi.mock('../src/core/prompts', () => ({
  queryPromptLibraryRemote: vi.fn(),
  mutatePromptLibraryRemote: vi.fn(),
}));
let broadcastCb: ((msg: { kind: string }) => void) | null = null;
vi.mock('../src/core/messaging', () => ({
  subscribe: vi.fn((cb: (msg: { kind: string }) => void) => {
    broadcastCb = cb;
    return () => {
      broadcastCb = null;
    };
  }),
}));

import { queryPromptLibraryRemote, mutatePromptLibraryRemote } from '../src/core/prompts';
import { usePromptLibrary, type PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';

const mockQuery = vi.mocked(queryPromptLibraryRemote);
const mockMutate = vi.mocked(mutatePromptLibraryRemote);

function prompt(id: string): Prompt {
  return {
    id, title: id, body: '', variables: [], tags: [], targetModels: [], promptFolderId: null,
    usageCount: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h',
  };
}
const lib = (ids: string[]): Response<PromptSnapshot> => ({
  ok: true,
  data: { kind: 'prompt.library', prompts: ids.map(prompt), folders: [] },
});
const qErr = (code: string): Response<PromptSnapshot> => ({ ok: false, error: { code, message: code } });

let latest: PromptLibraryView | null = null;
function Probe() {
  const view = usePromptLibrary();
  latest = view;
  return <div data-testid="probe" data-status={view.status} data-count={String(view.prompts.length)} />;
}

let container: HTMLElement | null = null;
function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(<Probe />, container);
}
const read = (attr: string) => container!.querySelector('[data-testid=probe]')!.getAttribute(attr);
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  latest = null;
  broadcastCb = null;
  mockQuery.mockReset();
  mockMutate.mockReset();
});
afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('usePromptLibrary load status', () => {
  it('loading → ready when the first read succeeds', async () => {
    mockQuery.mockResolvedValue(lib(['a', 'b']));
    mount();
    expect(read('data-status')).toBe('loading');
    await flush();
    expect(read('data-status')).toBe('ready');
    expect(read('data-count')).toBe('2');
  });

  it('loading → error when the first read fails after the retry budget', async () => {
    mockQuery.mockResolvedValue(qErr('no_response'));
    mount();
    await flush();
    expect(read('data-status')).toBe('error');
  });

  it('error → ready when retry() re-reads successfully', async () => {
    mockQuery.mockResolvedValue(qErr('no_response'));
    mount();
    await flush();
    expect(read('data-status')).toBe('error');

    mockQuery.mockResolvedValue(lib(['a']));
    latest!.retry();
    await flush();
    expect(read('data-status')).toBe('ready');
    expect(read('data-count')).toBe('1');
  });

  it('a failed reconcile after we already had data keeps the last good library', async () => {
    mockQuery.mockResolvedValue(lib(['a']));
    mount();
    await flush();
    expect(read('data-status')).toBe('ready');

    mockQuery.mockResolvedValue(qErr('no_response'));
    latest!.refresh();
    await flush();
    expect(read('data-status')).toBe('ready'); // not flipped to error
    expect(read('data-count')).toBe('1'); // last good data retained
  });
});

describe('usePromptLibrary observe-don’t-replay mutate', () => {
  const createOp: PromptMutationOp = { op: 'prompt.create', id: 'new', title: 'New', body: '' };

  it('a lost-ack create whose re-read shows it renders it, sent exactly once', async () => {
    mockQuery.mockResolvedValue(lib([]));
    mount();
    await flush();

    // Ack lost, but the worker committed — the reconciling re-read returns it.
    mockMutate.mockResolvedValueOnce(qErr('no_response') as Response<never>);
    mockQuery.mockResolvedValue(lib(['new']));

    const result = await latest!.mutate(createOp);
    await flush();

    expect(result).toEqual({ ok: false, applied: true });
    expect(mockMutate).toHaveBeenCalledTimes(1); // never replayed
    expect(read('data-count')).toBe('1'); // reconciled into view
  });

  it('a create that reconciles to absent reports failure, not swallowed', async () => {
    mockQuery.mockResolvedValue(lib([]));
    mount();
    await flush();

    mockMutate.mockResolvedValueOnce(qErr('send_failed') as Response<never>);
    mockQuery.mockResolvedValue(lib([])); // re-read still empty — did not take effect

    const result = await latest!.mutate(createOp);
    await flush();

    expect(result).toEqual({ ok: false, applied: false });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('an acked mutation reports ok + applied and reconciles by re-reading', async () => {
    mockQuery.mockResolvedValue(lib([]));
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    mockMutate.mockResolvedValueOnce({ ok: true, data: { stores: ['prompts'] } } as Response<never>);
    mockQuery.mockResolvedValue(lib(['new']));

    const result = await latest!.mutate(createOp);
    await flush();

    expect(result).toEqual({ ok: true, applied: true });
    expect(mockQuery.mock.calls.length).toBeGreaterThan(before); // re-read after the write
  });
});

describe('usePromptLibrary cross-tab convergence', () => {
  it('a state.changed broadcast triggers a re-read', async () => {
    mockQuery.mockResolvedValue(lib(['a']));
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    mockQuery.mockResolvedValue(lib(['a', 'b']));
    broadcastCb?.({ kind: 'state.changed' });
    await flush();

    expect(mockQuery.mock.calls.length).toBeGreaterThan(before);
    expect(read('data-count')).toBe('2');
  });
});
