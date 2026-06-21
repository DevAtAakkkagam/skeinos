// input-bar-shortcut: the prompt-picker trigger is relabelled "Insert prompt" (its
// visible text and accessible name converge), and a fixed `Cmd/Ctrl + /` accelerator
// toggles the popover from the keyboard. The chord is bound on the bar's
// `ownerDocument` in the capture phase (so it pre-empts the host's type-anywhere
// handler) and is torn down with the bar. See design D-1..D-4.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
// Stub the Profile chip's default seams (worker library + chrome settings) so these
// shortcut tests stay hermetic and the chip never issues a live request.
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
import { InputBar } from '../src/ui/input-bar/InputBar';
import { STR } from '../src/ui/input-bar/strings';
import type { PromptSearchResult } from '../src/shared/prompts';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;

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

// A query stub that resolves the library/search reads the bar issues (no real worker).
function makeQuery(results: PromptSearchResult[] = []) {
  return vi.fn(async (sel: { kind: string }) => {
    if (sel.kind === 'prompt.library') {
      return { ok: true as const, data: { kind: 'prompt.library' as const, prompts: [], folders: [] } };
    }
    return { ok: true as const, data: { kind: 'prompt.search' as const, results } };
  });
}

// Flush Preact's effect queue + a re-render. Preact defers effects to a frame, so
// wait a `requestAnimationFrame` (then a macrotask) — a bare `setTimeout` is too early
// and the accelerator's `useEffect` would not yet have registered its listener.
const flush = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function chord(over: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: '/',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...over,
  });
}

// --- 3.1 Relabel ---------------------------------------------------------------

describe('input-bar-shortcut: trigger label', () => {
  it('renders the visible "Insert prompt" label and a matching accessible name', () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
    const trigger = $('[data-testid="sk-ib-trigger"]')!;
    expect(STR.slashTrigger).toBe('Insert prompt');
    expect(trigger.textContent).toContain('Insert prompt');
    // Accessible name is the explicit aria-label; the decorative kbd chip (aria-hidden)
    // never leaks into it.
    expect(trigger.getAttribute('aria-label')).toBe('Insert prompt');
    expect($('[data-testid="sk-ib-kbd"]')!.getAttribute('aria-hidden')).toBe('true');
  });
});

// --- OS-aware shortcut hint ----------------------------------------------------

describe('input-bar-shortcut: OS-aware kbd hint', () => {
  function withPlatform(value: string, run: () => void): void {
    const orig = Object.getOwnPropertyDescriptor(navigator, 'platform');
    Object.defineProperty(navigator, 'platform', { value, configurable: true });
    try {
      run();
    } finally {
      if (orig) Object.defineProperty(navigator, 'platform', orig);
    }
  }

  it('shows ⌘/ on macOS', () => {
    withPlatform('MacIntel', () => {
      mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
      expect($('[data-testid="sk-ib-kbd"]')!.textContent).toBe('⌘/');
    });
  });

  it('shows Ctrl+/ on non-mac platforms', () => {
    withPlatform('Win32', () => {
      mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
      expect($('[data-testid="sk-ib-kbd"]')!.textContent).toBe('Ctrl+/');
    });
  });
});

// --- 3.2 Accelerator -----------------------------------------------------------

describe('input-bar-shortcut: Cmd/Ctrl + / accelerator', () => {
  it('opens the popover, focuses its search field, and prevents the host default', async () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
    await flush(); // let the accelerator effect register its listener
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();

    const ev = chord();
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true); // host page does not act on the chord
    await flush();

    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();
    expect($('[data-testid="sk-ib-trigger"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe($('[data-testid="sk-ib-search"]'));
  });

  it('a second press closes the popover and inserts nothing', async () => {
    const onInsert = vi.fn();
    mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery() as never} />);
    await flush();

    document.dispatchEvent(chord());
    await flush();
    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();

    document.dispatchEvent(chord());
    await flush();
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('works with metaKey (macOS) as well as ctrlKey', async () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
    await flush();
    document.dispatchEvent(chord({ ctrlKey: false, metaKey: true }));
    await flush();
    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();
  });

  it('ignores a bare "/" and extra-modifier combos (no interception)', async () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
    await flush();
    for (const ev of [
      chord({ ctrlKey: false }), // bare slash — host typing, never intercepted
      chord({ shiftKey: true }), // extra modifier
      chord({ metaKey: true }), // both ctrl AND meta
    ]) {
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    await flush();
    expect($('[data-testid="sk-ib-popover"]')).toBeNull();
  });
});

// --- 3.3 Teardown --------------------------------------------------------------

describe('input-bar-shortcut: accelerator lifecycle', () => {
  it('removes the accelerator when the bar unmounts', async () => {
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery() as never} />);
    await flush(); // let the accelerator effect register

    // Handled while mounted.
    const live = chord();
    document.dispatchEvent(live);
    expect(live.defaultPrevented).toBe(true);

    render(null, container); // teardown (as the content script does on invalidation)

    // No longer responds: the listener calling preventDefault is gone.
    const dead = chord();
    document.dispatchEvent(dead);
    expect(dead.defaultPrevented).toBe(false);
  });
});
