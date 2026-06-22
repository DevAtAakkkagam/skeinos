// input-bar slash popover (6.3): the `/` trigger opens the picker, typing drives
// `prompt.search`, rows render title + snippet, the empty state appears on
// no matches, and dismissing (Escape / outside click / trigger toggle) closes
// WITHOUT inserting. Rows/empty/keyboard are tested against `<SlashPopover>` with an
// injected `view` (bypassing the 160ms debounce + worker subscription); the search
// CALL is asserted through `<InputBar>` with an injected `query`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { InputBar } from '../src/ui/input-bar/InputBar';
import { SlashPopover } from '../src/ui/input-bar/SlashPopover';
import type { PromptSearchResult } from '../src/shared/prompts';
import type { PromptSearchView } from '../src/ui/search/usePromptSearch';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];

function mount(node: preact.ComponentChild): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  vi.restoreAllMocks();
});

function result(over: Partial<PromptSearchResult> & { id: string }): PromptSearchResult {
  return {
    title: over.id,
    snippet: [{ text: 'write a ', match: false }, { text: 'budget', match: true }],
    targetModels: [],
    ...over,
  };
}

function makeView(over: Partial<PromptSearchView> = {}): PromptSearchView {
  return { results: [], status: 'ready', ...over };
}

// --- SlashPopover (injected view): rows / empty / states / keyboard -----------

describe('SlashPopover rows + states (6.3)', () => {
  function mountPopover(view: PromptSearchView, spies: { onSelect?: () => void; onClose?: () => void } = {}) {
    const onSelect = vi.fn<(r: PromptSearchResult) => void>(spies.onSelect);
    const onClose = vi.fn(spies.onClose);
    mount(
      <SlashPopover
        setFloating={() => {}}
        floatingStyles={{}}
        onSelect={onSelect}
        onClose={onClose}
        view={view}
      />,
    );
    return { onSelect, onClose };
  }

  function type(value: string): void {
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('renders the popover with its own search field (combobox)', () => {
    mountPopover(makeView());
    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();
    const search = $('[data-testid="sk-ib-search"]');
    expect(search?.getAttribute('role')).toBe('combobox');
  });

  it('shows the idle hint until a query is entered, then real rows', async () => {
    mountPopover(makeView({ results: [result({ id: 'p1', title: 'Budget email' })] }));
    // No query text yet → idle, even though the view carries results.
    expect($('[data-testid="sk-ib-idle"]')).toBeTruthy();
    expect($$('[data-testid="sk-ib-result"]')).toHaveLength(0);

    type('budget');
    await Promise.resolve();
    expect($('[data-testid="sk-ib-idle"]')).toBeNull();
    expect($$('[data-testid="sk-ib-result"]')).toHaveLength(1);
  });

  it('renders each row with title and a highlighted snippet', async () => {
    mountPopover(
      makeView({
        results: [
          result({
            id: 'p1',
            title: 'Budget email',
            snippet: [{ text: 'write a ', match: false }, { text: 'budget', match: true }],
          }),
        ],
      }),
    );
    type('budget');
    await Promise.resolve();

    const row = $('[data-testid="sk-ib-result"]')!;
    expect(row.querySelector('.sk-ib-row__title')?.textContent).toBe('Budget email');
    expect(row.querySelector('mark')?.textContent).toBe('budget');
  });

  it('shows the empty state when a query matches nothing', async () => {
    mountPopover(makeView({ results: [], status: 'ready' }));
    type('zzz');
    await Promise.resolve();
    expect($('[data-testid="sk-ib-empty"]')).toBeTruthy();
    expect($$('[data-testid="sk-ib-result"]')).toHaveLength(0);
  });

  it('ArrowDown/ArrowUp move the active row, Enter selects it', async () => {
    const { onSelect } = mountPopover(
      makeView({
        results: [result({ id: 'a', title: 'A' }), result({ id: 'b', title: 'B' })],
      }),
    );
    type('q');
    await Promise.resolve();
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;

    const rows = () => $$('[data-testid="sk-ib-result"]');
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await Promise.resolve();
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await Promise.resolve();
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 'a' });
  });

  it('clicking a row selects it', async () => {
    const { onSelect } = mountPopover(makeView({ results: [result({ id: 'a', title: 'A' })] }));
    type('q');
    await Promise.resolve();
    $('[data-testid="sk-ib-result"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('Escape calls onClose and selects nothing', () => {
    const { onSelect, onClose } = mountPopover(makeView());
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('an outside pointerdown calls onClose', async () => {
    const { onClose } = mountPopover(makeView());
    // Preact flushes useEffect after a frame; await an animation frame (then a
    // macrotask) so the effect that registers the document pointerdown listener runs.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });
});

// --- SlashPopover recents empty state (prompt-recents 6.2) --------------------

describe('SlashPopover "Last used" empty state (prompt-recents 6.2)', () => {
  function mountWithRecents(
    recents: PromptSearchResult[],
    view: PromptSearchView = makeView(),
    spies: { onSelect?: () => void } = {},
  ) {
    const onSelect = vi.fn<(r: PromptSearchResult) => void>(spies.onSelect);
    mount(
      <SlashPopover
        setFloating={() => {}}
        floatingStyles={{}}
        onSelect={onSelect}
        onClose={vi.fn()}
        view={view}
        recents={recents}
      />,
    );
    return { onSelect };
  }

  function type(value: string): void {
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('lists recents under a "Last used" heading when the field is empty', () => {
    mountWithRecents([result({ id: 'r1', title: 'Recent one' }), result({ id: 'r2', title: 'Recent two' })]);
    expect($('[data-testid="sk-ib-recents-head"]')?.textContent).toBe('Last used');
    expect($('[data-testid="sk-ib-idle"]')).toBeNull();
    expect($$('[data-testid="sk-ib-result"]')).toHaveLength(2);
  });

  it('recents are selectable via Enter and via click', async () => {
    const { onSelect } = mountWithRecents([result({ id: 'r1', title: 'Recent one' })]);
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));

    $('[data-testid="sk-ib-result"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('shows the idle hint (no heading) when there are no recents', () => {
    mountWithRecents([]);
    expect($('[data-testid="sk-ib-idle"]')).toBeTruthy();
    expect($('[data-testid="sk-ib-recents-head"]')).toBeNull();
    expect($$('[data-testid="sk-ib-result"]')).toHaveLength(0);
  });

  it('typing replaces the recents list with search results', async () => {
    mountWithRecents(
      [result({ id: 'r1', title: 'Recent one' })],
      makeView({ results: [result({ id: 's1', title: 'Search hit' })] }),
    );
    expect($('[data-testid="sk-ib-recents-head"]')).toBeTruthy();

    type('budget');
    await Promise.resolve();
    // Heading gone, search result shown instead of the recent.
    expect($('[data-testid="sk-ib-recents-head"]')).toBeNull();
    const titles = $$('[data-testid="sk-ib-result"] .sk-ib-row__title').map((n) => n.textContent);
    expect(titles).toEqual(['Search hit']);
  });
});

// --- InputBar (injected query): trigger toggles + the search call fires -------

describe('InputBar slash trigger + search call (6.3)', () => {
  function makeQuery(results: PromptSearchResult[]) {
    return vi.fn(async (sel: { kind: string }) => {
      if (sel.kind === 'prompt.library') {
        return { ok: true as const, data: { kind: 'prompt.library' as const, prompts: [], folders: [] } };
      }
      return { ok: true as const, data: { kind: 'prompt.search' as const, results } };
    });
  }

  // The Profile chip reads its own library; inject an empty list so it never touches
  // the (absent) worker. These tests don't exercise the chip — they keep it closed.
  const emptyProfiles = () =>
    vi.fn(async () => ({ ok: true as const, data: { kind: 'profile.library' as const, profiles: [] } }));

  function clickTrigger(): void {
    $('[data-testid="sk-ib-trigger"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('the / trigger toggles the popover and reflects aria-expanded', async () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    const trigger = $('[data-testid="sk-ib-trigger"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();

    clickTrigger();
    await Promise.resolve();
    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();
    expect($('[data-testid="sk-ib-trigger"]')!.getAttribute('aria-expanded')).toBe('true');

    // Toggling again closes it.
    clickTrigger();
    await Promise.resolve();
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();
  });

  it('renders an interactive Profile chip and no Model stub', () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    // The Profile control is the functional chip (not a disabled stub).
    const chip = $('[data-testid="sk-ib-profile"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    expect(chip.disabled).toBe(false);
    // The deferred Model stub has been removed.
    expect($('[data-testid="sk-ib-model-stub"]')).toBeNull();
  });

  it('typing in the popover issues prompt.search with the entered terms', async () => {
    vi.useFakeTimers();
    try {
      const query = makeQuery([result({ id: 'p1', title: 'Budget email' })]);
      mount(<InputBar platform="claude" onInsert={vi.fn()} query={query as never} queryProfiles={emptyProfiles() as never} />);
      clickTrigger();
      await Promise.resolve();

      const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
      input.value = 'budget email';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // The hook debounces 160ms before issuing the query.
      await vi.advanceTimersByTimeAsync(200);

      expect(query).toHaveBeenCalledWith({ kind: 'prompt.search', terms: ['budget', 'email'] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape inside the popover closes it without inserting', async () => {
    const onInsert = vi.fn();
    mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    clickTrigger();
    await Promise.resolve();
    const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('an outside click closes the popover without inserting', async () => {
    const onInsert = vi.fn();
    mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    clickTrigger();
    // Flush the popover mount + its outside-pointerdown listener (effects run after
    // a frame, so wait a macrotask, not just microtasks).
    await new Promise((r) => setTimeout(r, 0));
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('makes the brand a button that fires onOpenSidebar, or a plain label without it', () => {
    // Without onOpenSidebar the brand is a non-interactive label (a <span>).
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    const label = $('[data-testid="sk-ib-brand"]')!;
    expect(label.tagName).toBe('SPAN');

    // With it, the brand becomes a labelled button; clicking opens the side panel.
    const onOpenSidebar = vi.fn();
    mount(<InputBar platform="claude" onInsert={vi.fn()} onOpenSidebar={onOpenSidebar} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    const btn = $('[data-testid="sk-ib-brand"]') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-label')).toBe('Open Skeinos panel');

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders the clear button only when onClear is wired, and clicking it fires onClear', () => {
    // No onClear → no button (the host content script always wires it; tests that
    // don't exercise clearing simply omit it).
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    expect($('[data-testid="sk-ib-clear"]')).toBeNull();

    const onClear = vi.fn();
    mount(<InputBar platform="claude" onInsert={vi.fn()} onClear={onClear} query={makeQuery([]) as never} queryProfiles={emptyProfiles() as never} />);
    const clear = $('[data-testid="sk-ib-clear"]') as HTMLButtonElement;
    expect(clear).toBeTruthy();
    // It sits immediately to the LEFT of the Insert-prompt trigger.
    expect(clear.nextElementSibling).toBe($('[data-testid="sk-ib-trigger"]'));

    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
