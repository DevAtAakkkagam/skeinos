// SearchOverlay prompts-group coverage (slice 4 of prompts-library, design D-D..D-F).
//
// TARGETS THE UNIMPLEMENTED `prompt-search-results` CHANGE — these are TDD/red tests
// and are EXPECTED TO FAIL until `/opsx:apply prompt-search-results` adds the
// `onOpenPrompt` prop, composes `usePromptSearch(queryText)`, and renders the two
// labelled result groups (Conversations, Prompts) in one keyboard-navigable listbox.
//
// Maps to openspec/changes/prompt-search-results/specs/search/spec.md (the MODIFIED
// "Search overlay is keyboard-operable and token-styled" requirement) + tasks.md §4.2:
//   - prompts appear as their own group
//   - keyboard navigation crosses the group boundary
//   - selecting a prompt navigates (calls onOpenPrompt) and closes
//   - empty state only when BOTH sources are empty
//   - a group with no matches shows no header
//   - conversation opening is unchanged
//
// Mirrors prompts-panel.test.tsx: happy-dom + Preact `render`, an INJECTED view (here
// both the conversation `SearchView` and the prompt-search view are injected, so no
// worker/IndexedDB is required). CONTRACT ASSUMPTION: the overlay accepts an injectable
// prompt-search view via a `promptView` prop mirroring the existing `view?: SearchView`
// seam, shaped `{ results: PromptSearchResult[]; status }`. If the implementation names
// that seam differently, this is the single point to rename.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { SearchOverlay } from '../src/ui/search/SearchOverlay';
import type { SearchView } from '../src/ui/search/useSearch';
import type { PromptSearchView } from '../src/ui/search/usePromptSearch';
import type { PlatformId, SearchResult, SnippetSegment } from '../src/shared/types';
import type { PromptSearchResult } from '../src/shared/prompts';

// --- fixtures ---------------------------------------------------------------

function seg(text: string, match = false): SnippetSegment {
  return { text, match };
}

function convResult(over: Partial<SearchResult> & { docId: string }): SearchResult {
  return {
    platform: 'claude',
    nativeId: over.docId,
    title: over.docId,
    score: 1,
    snippet: [seg('a'), seg('match', true)],
    folderId: null,
    updatedAt: 0,
    ...over,
  };
}

function promptResult(over: Partial<PromptSearchResult> & { id: string }): PromptSearchResult {
  return {
    title: over.id,
    snippet: [seg('prompt'), seg('match', true)],
    targetModels: ['claude'],
    ...over,
  } as PromptSearchResult;
}

// Injected conversation-search view (the overlay owns `queryText` through this).
function makeSearchView(over: Partial<SearchView> = {}): SearchView {
  return {
    queryText: 'budget',
    setQueryText: vi.fn(),
    filters: {},
    setFilters: vi.fn(),
    results: [],
    status: 'ready',
    ...over,
  };
}

// Injected prompt-search view (mirrors `usePromptSearch(queryText)` → { results, status }).
function makePromptView(over: Partial<PromptSearchView> = {}): PromptSearchView {
  return { results: [], status: 'ready', ...over };
}

// --- harness ----------------------------------------------------------------

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
function mount(node: preact.ComponentChild) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}
function press(key: string): void {
  const input = $('[data-testid=sk-search-input]') as HTMLInputElement;
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

const ACTIVE_PLATFORM: PlatformId = 'claude';

/** Mount the overlay with both sources injected. */
function mountOverlay(args: {
  conversations?: SearchResult[];
  prompts?: PromptSearchResult[];
  searchStatus?: SearchView['status'];
  promptStatus?: PromptSearchView['status'];
  queryText?: string;
  onOpenPrompt?: (id: string) => void;
  onClose?: () => void;
}) {
  const view = makeSearchView({
    queryText: args.queryText ?? 'budget',
    results: args.conversations ?? [],
    status: args.searchStatus ?? 'ready',
  });
  const promptView = makePromptView({
    results: args.prompts ?? [],
    status: args.promptStatus ?? 'ready',
  });
  mount(
    <SearchOverlay
      activePlatform={ACTIVE_PLATFORM}
      onClose={args.onClose ?? vi.fn()}
      onOpenPrompt={args.onOpenPrompt ?? vi.fn()}
      view={view}
      promptView={promptView}
    />,
  );
}

const rows = () => $$('[role=option]');

describe('SearchOverlay prompts group (4.2)', () => {
  it('Prompts appear as their own labelled group beside conversations, in one listbox', () => {
    mountOverlay({
      conversations: [convResult({ docId: 'c1', title: 'Quarterly budget report' })],
      prompts: [promptResult({ id: 'p1', title: 'Budget email' })],
    });
    // A single listbox frames both groups.
    expect($$('[role=listbox]')).toHaveLength(1);
    // Two group headers — one labelled Conversations, one labelled Prompts.
    const headers = $$('[data-testid=sk-search-group-header]').map((h) => h.textContent ?? '');
    expect(headers.some((t) => /conversation/i.test(t))).toBe(true);
    expect(headers.some((t) => /prompt/i.test(t))).toBe(true);
    // Both result kinds render as options in the one listbox.
    expect(rows().length).toBe(2);
  });

  it('a group with no matches shows no header (conversations matched, prompts empty)', () => {
    mountOverlay({
      conversations: [convResult({ docId: 'c1', title: 'Quarterly budget report' })],
      prompts: [],
    });
    const headers = $$('[data-testid=sk-search-group-header]').map((h) => h.textContent ?? '');
    expect(headers.some((t) => /conversation/i.test(t))).toBe(true);
    // No empty "Prompts" header when prompts has zero results.
    expect(headers.some((t) => /prompt/i.test(t))).toBe(false);
    expect(rows().length).toBe(1);
  });

  it('the prompts group shows no header when only prompts matched (conversations empty)', () => {
    mountOverlay({
      conversations: [],
      prompts: [promptResult({ id: 'p1', title: 'Budget email' })],
    });
    const headers = $$('[data-testid=sk-search-group-header]').map((h) => h.textContent ?? '');
    expect(headers.some((t) => /prompt/i.test(t))).toBe(true);
    expect(headers.some((t) => /conversation/i.test(t))).toBe(false);
    expect(rows().length).toBe(1);
  });

  it('keyboard navigation crosses the group boundary from last conversation to first prompt', async () => {
    mountOverlay({
      conversations: [convResult({ docId: 'c1', title: 'Conv one' })],
      prompts: [promptResult({ id: 'p1', title: 'Prompt one' })],
    });
    const all = rows();
    expect(all).toHaveLength(2);
    // Selection starts on the first (conversation) row.
    expect(all[0].getAttribute('aria-selected')).toBe('true');

    // ArrowDown moves across the boundary into the first prompt row.
    press('ArrowDown');
    await flush();
    const after = rows();
    expect(after[1].getAttribute('aria-selected')).toBe('true');
    expect(after[0].getAttribute('aria-selected')).toBe('false');

    // ArrowUp crosses back to the conversation row.
    press('ArrowUp');
    await flush();
    const back = rows();
    expect(back[0].getAttribute('aria-selected')).toBe('true');
    expect(back[1].getAttribute('aria-selected')).toBe('false');
  });

  it('Enter on a prompt row calls onOpenPrompt(id) then closes the overlay', async () => {
    const onOpenPrompt = vi.fn();
    const onClose = vi.fn();
    mountOverlay({
      conversations: [convResult({ docId: 'c1', title: 'Conv one' })],
      prompts: [promptResult({ id: 'p-target', title: 'Prompt one' })],
      onOpenPrompt,
      onClose,
    });
    // Move into the prompt row (index 1) and activate it.
    press('ArrowDown');
    await flush();
    press('Enter');
    await flush();
    expect(onOpenPrompt).toHaveBeenCalledWith('p-target');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking a prompt row calls onOpenPrompt(id) then closes', async () => {
    const onOpenPrompt = vi.fn();
    const onClose = vi.fn();
    mountOverlay({
      conversations: [],
      prompts: [promptResult({ id: 'p-click', title: 'Prompt' })],
      onOpenPrompt,
      onClose,
    });
    rows()[0].click();
    await flush();
    expect(onOpenPrompt).toHaveBeenCalledWith('p-click');
    expect(onClose).toHaveBeenCalled();
  });

  it('opening a conversation row is unchanged — it does NOT call onOpenPrompt', async () => {
    const onOpenPrompt = vi.fn();
    const onClose = vi.fn();
    mountOverlay({
      conversations: [convResult({ docId: 'c1', title: 'Conv one' })],
      prompts: [promptResult({ id: 'p1', title: 'Prompt one' })],
      onOpenPrompt,
      onClose,
    });
    // Selection starts on the conversation row; Enter routes through openConversation.
    press('Enter');
    await flush();
    expect(onOpenPrompt).not.toHaveBeenCalled();
    // Opening a result still dismisses the overlay.
    expect(onClose).toHaveBeenCalled();
  });

  it('combined empty state shows ONLY when both sources are empty for a non-empty query', () => {
    mountOverlay({ conversations: [], prompts: [], queryText: 'budget' });
    expect($('[data-testid=sk-search-empty]')).toBeTruthy();
    expect(rows().length).toBe(0);
  });

  it('no combined empty state when prompts match but conversations are empty', () => {
    mountOverlay({
      conversations: [],
      prompts: [promptResult({ id: 'p1', title: 'Budget email' })],
      queryText: 'budget',
    });
    expect($('[data-testid=sk-search-empty]')).toBeNull();
    expect(rows().length).toBe(1);
  });

  it('a prompt row renders its highlighted snippet (matched run as <mark>)', () => {
    mountOverlay({
      conversations: [],
      prompts: [
        promptResult({ id: 'p1', title: 'Budget email', snippet: [seg('write a '), seg('budget', true), seg(' email')] }),
      ],
    });
    const marks = $$('mark').map((m) => m.textContent);
    expect(marks).toContain('budget');
  });
});
