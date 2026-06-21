// input-bar variable fill (6.4): selecting a prompt WITH variables opens the
// pre-filled modal (defaults parsed from the body; a `select` var renders a
// <select> with its options); confirming inserts the substituted body; a prompt
// with NO variables inserts its body directly with no modal. Plus a direct
// `substituteVariables` unit test (text/select/default/cleared/malformed).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
// The bar now embeds the functional Profile chip, whose default seams talk to the
// worker (`core/profiles`) and `chrome.storage.local` (`core/settings`). These tests
// don't exercise the chip; stub both so it reads an empty library and never touches
// chrome — keeping the suite hermetic and free of unhandled rejections.
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
import { substituteVariables } from '../src/ui/input-bar/substitute';
import type { Prompt } from '../src/shared/types';
import type { PromptSearchResult } from '../src/shared/prompts';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
// The variable modal mounts as its own shadow-root overlay at document.body (so its
// backdrop isn't clipped by a transformed host ancestor), so modal elements are found
// by sweeping the Skeinos shadow roots in the document, not the bar's container.
const $modal = (sel: string): HTMLElement | null => {
  for (const host of document.querySelectorAll('[data-skeinos-root]')) {
    const el = (host as HTMLElement).shadowRoot?.querySelector(sel);
    if (el) return el as HTMLElement;
  }
  return null;
};

function mount(node: preact.ComponentChild): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function makePrompt(over: Partial<Prompt> & { id: string; body: string }): Prompt {
  return {
    title: over.id,
    description: '',
    variables: [],
    tags: [],
    targetModels: [],
    promptFolderId: null,
    usageCount: 0,
    rev: 1,
    updatedAt: 0,
    deviceId: 'd',
    hash: 'h',
    ...over,
  };
}

function searchResult(id: string, title: string): PromptSearchResult {
  return { id, title, snippet: [{ text: title, match: false }], targetModels: [] };
}

// A query stub: prompt.library returns the seeded prompts; prompt.search returns
// matching result rows so the popover lists them.
function makeQuery(prompts: Prompt[]) {
  const results = prompts.map((p) => searchResult(p.id, p.title));
  return vi.fn(async (sel: { kind: string }) => {
    if (sel.kind === 'prompt.library') {
      return { ok: true as const, data: { kind: 'prompt.library' as const, prompts, folders: [] } };
    }
    return { ok: true as const, data: { kind: 'prompt.search' as const, results } };
  });
}

// Open the popover, type a query, wait the debounce, and click the first row —
// driving InputBar's real pick flow (search → resolvePrompt → parseVariables).
async function pickFirst(): Promise<void> {
  $('[data-testid="sk-ib-trigger"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
  input.value = 'q';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 220));
  const row = $('[data-testid="sk-ib-result"]')!;
  row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // resolvePrompt awaits the library query; flush the microtask queue.
  for (let i = 0; i < 6; i++) await Promise.resolve();
  // Flush the modal-mount effect (the modal is a separate viewport overlay).
  await new Promise((r) => setTimeout(r, 60));
}

describe('substituteVariables (6.4 unit)', () => {
  it('replaces {{name}} tokens with their values', () => {
    expect(substituteVariables('Hi {{name}}!', { name: 'Sam' })).toBe('Hi Sam!');
  });

  it('uses a select value just like a text value', () => {
    expect(substituteVariables('Tone: {{tone=formal|casual}}', { tone: 'casual' })).toBe('Tone: casual');
  });

  it('substitutes a default that was kept (caller passes the parsed default through)', () => {
    expect(substituteVariables('Lang: {{lang=en}}', { lang: 'en' })).toBe('Lang: en');
  });

  it('emits empty string for a cleared (empty) value', () => {
    expect(substituteVariables('X={{a}}Y', { a: '' })).toBe('X=Y');
    // Missing key also falls back to empty.
    expect(substituteVariables('X={{a}}Y', {})).toBe('X=Y');
  });

  it('leaves a malformed {{...}} token intact as literal text', () => {
    // `{{}}` and `{{ }}` are not recognized vars (empty name) → preserved verbatim.
    expect(substituteVariables('a {{}} b {{ }} c', { '': 'X' })).toBe('a {{}} b {{ }} c');
    // An unclosed `{{` is literal too.
    expect(substituteVariables('keep {{ this', { this: 'X' })).toBe('keep {{ this');
  });

  it('substitutes every occurrence of a repeated variable', () => {
    expect(substituteVariables('{{x}}-{{x}}', { x: '7' })).toBe('7-7');
  });
});

describe('InputBar variable flow (6.4)', () => {
  it('selecting a prompt with NO variables inserts the body directly, no modal', async () => {      const onInsert = vi.fn();
      const prompt = makePrompt({ id: 'p1', title: 'Plain', body: 'No variables here.' });
      mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery([prompt]) as never} />);

      await pickFirst();

      expect($modal('[data-testid="sk-ib-var-modal"]')).toBeNull();
      expect(onInsert).toHaveBeenCalledWith('No variables here.');
      // The popover closed on selection.
      expect($('[data-testid="sk-ib-popover"]')).toBeNull();
  });

  it('selecting a prompt WITH variables opens the pre-filled modal', async () => {      const prompt = makePrompt({
        id: 'p2',
        title: 'Email',
        body: 'Dear {{name}}, tone {{tone=formal|casual}}, lang {{lang=en}}.',
      });
      mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([prompt]) as never} />);

      await pickFirst();

      expect($modal('[data-testid="sk-ib-var-modal"]')).toBeTruthy();
      // The popover closed when the modal opened.
      expect($('[data-testid="sk-ib-popover"]')).toBeNull();

      // Text var: empty default.
      const nameField = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
      expect(nameField.tagName).toBe('INPUT');
      expect(nameField.value).toBe('');

      // Text var with a default.
      const langField = $modal('[data-testid="sk-ib-var-lang"]') as HTMLInputElement;
      expect(langField.value).toBe('en');

      // Select var renders a <select> with its options, defaulted to the first.
      const toneField = $modal('[data-testid="sk-ib-var-tone"]') as HTMLSelectElement;
      expect(toneField.tagName).toBe('SELECT');
      expect([...toneField.options].map((o) => o.value)).toEqual(['formal', 'casual']);
      expect(toneField.value).toBe('formal');
  });

  it('confirming the modal inserts the body with the filled values substituted', async () => {      const onInsert = vi.fn();
      const prompt = makePrompt({
        id: 'p3',
        title: 'Email',
        body: 'Dear {{name}}, tone {{tone=formal|casual}}.',
      });
      mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery([prompt]) as never} />);
      await pickFirst();

      // Fill the text var and flip the select to its second option.
      const nameField = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
      nameField.value = 'Sam';
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();

      const toneField = $modal('[data-testid="sk-ib-var-tone"]') as HTMLSelectElement;
      toneField.value = 'casual';
      toneField.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();

      $modal('[data-testid="sk-ib-var-insert"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Insertion is deferred until the modal unmounts (focus-trap release), so flush
      // the close re-render + the effect that commits the queued text.
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 60));
      expect(onInsert).toHaveBeenCalledWith('Dear Sam, tone casual.');
      expect($modal('[data-testid="sk-ib-var-modal"]')).toBeNull();
  });

  it('cancelling the modal inserts nothing', async () => {      const onInsert = vi.fn();
      const prompt = makePrompt({ id: 'p4', title: 'Email', body: 'Hi {{name}}' });
      mount(<InputBar platform="claude" onInsert={onInsert} query={makeQuery([prompt]) as never} />);
      await pickFirst();

      expect($modal('[data-testid="sk-ib-var-modal"]')).toBeTruthy();
      $modal('[data-testid="sk-ib-var-cancel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The modal overlay is disposed in the effect cleanup (a frame after close).
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 60));

      expect(onInsert).not.toHaveBeenCalled();
      expect($modal('[data-testid="sk-ib-var-modal"]')).toBeNull();
  });

  it('stops variable-field keystrokes from reaching the host, but lets Escape through', async () => {
    const prompt = makePrompt({ id: 'p5', title: 'Quiz', body: 'On {{topic}}.' });
    mount(<InputBar platform="claude" onInsert={vi.fn()} query={makeQuery([prompt]) as never} />);
    await pickFirst();
    const topic = $modal('[data-testid="sk-ib-var-topic"]') as HTMLInputElement;
    expect(topic).toBeTruthy();

    // The host's document-level key handler is the leak target (composed events
    // bubble out of the shadow root onto the page).
    const onDocKey = vi.fn();
    document.addEventListener('keydown', onDocKey);
    try {
      topic.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true, composed: true }));
      expect(onDocKey).not.toHaveBeenCalled(); // a character key never reaches the host
      topic.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      expect(onDocKey).toHaveBeenCalledTimes(1); // Escape still propagates (Dialog can close)
    } finally {
      document.removeEventListener('keydown', onDocKey);
    }
  });
});
