// input-bar insertion seam (6.5): the confirmed text reaches the adapter's
// `insertText` APPENDED (the existing composer draft is preserved) and `submit` is
// NEVER called — exactly the content-script wiring
// `onInsert={(t) => adapter.insertText(t)}` (append-only, no auto-submit; design
// D-5). A real `createAdapter(config, { root })` over a <textarea class="composer">
// that already holds a draft is the seam.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
// Stub the Profile chip's default seams (worker library + chrome settings) so the
// insertion tests stay hermetic and the chip never issues a live request.
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
import { createAdapter } from '../src/adapters/runtime/adapter';
import type { AdapterConfig } from '../src/adapters/types';
import type { Prompt } from '../src/shared/types';
import type { PromptSearchResult } from '../src/shared/prompts';

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

let container: HTMLElement;
let root: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
// The variable modal mounts as its own shadow-root overlay at document.body, so its
// elements are found by sweeping the Skeinos shadow roots, not the bar's container.
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
  root?.remove();
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

function makeQuery(prompts: Prompt[]) {
  const results: PromptSearchResult[] = prompts.map((p) => ({
    id: p.id,
    title: p.title,
    snippet: [{ text: p.title, match: false }],
    targetModels: [],
  }));
  return vi.fn(async (sel: { kind: string }) => {
    if (sel.kind === 'prompt.library') {
      return { ok: true as const, data: { kind: 'prompt.library' as const, prompts, folders: [] } };
    }
    return { ok: true as const, data: { kind: 'prompt.search' as const, results } };
  });
}

async function pickFirst(): Promise<void> {
  $('[data-testid="sk-ib-trigger"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  const input = $('[data-testid="sk-ib-search"]') as HTMLInputElement;
  input.value = 'q';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 220));
  $('[data-testid="sk-ib-result"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 60));
}

describe('input bar insertion seam (6.5)', () => {
  function buildFixture(draft: string) {
    root = document.createElement('div');
    root.innerHTML = `
      <div class="sidebar"><div class="list"></div></div>
      <div class="input-bar">
        <textarea class="composer"></textarea>
        <button class="send">Send</button>
      </div>
    `;
    document.body.appendChild(root);
    const adapter = createAdapter(makeConfig(), { root });
    const composer = root.querySelector<HTMLTextAreaElement>('textarea.composer')!;
    composer.value = draft;
    const sendClick = vi.fn();
    root.querySelector('button.send')!.addEventListener('click', sendClick);
    const submitSpy = vi.spyOn(adapter, 'submit');
    return { adapter, composer, sendClick, submitSpy };
  }

  it('appends the inserted prompt to the existing draft and never submits', async () => {      const { adapter, composer, sendClick, submitSpy } = buildFixture('my draft ');
      const prompt = makePrompt({ id: 'p1', title: 'Snippet', body: 'INSERTED TEXT' });

      mount(<InputBar platform="claude" onInsert={(t) => adapter.insertText(t)} query={makeQuery([prompt]) as never} />);
      await pickFirst();

      // No variables → inserted immediately, APPENDED to the draft.
      expect(composer.value).toBe('my draft INSERTED TEXT');
      expect(composer.value).toContain('my draft ');
      expect(composer.value).toContain('INSERTED TEXT');

      // The bar never auto-submits: no submit() call, no send-button click, no Enter.
      expect(submitSpy).not.toHaveBeenCalled();
      expect(sendClick).not.toHaveBeenCalled();
  });

  it('appends the substituted text after a variable fill, still without submitting', async () => {      const { adapter, composer, sendClick, submitSpy } = buildFixture('Hello — ');
      const prompt = makePrompt({ id: 'p2', title: 'Greeting', body: 'Dear {{name}}.' });

      mount(<InputBar platform="claude" onInsert={(t) => adapter.insertText(t)} query={makeQuery([prompt]) as never} />);
      await pickFirst();

      const nameField = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
      nameField.value = 'Sam';
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();

      $modal('[data-testid="sk-ib-var-insert"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Insertion is deferred until the modal unmounts (focus-trap release).
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 60));
      expect(composer.value).toBe('Hello — Dear Sam.');
      expect(submitSpy).not.toHaveBeenCalled();
      expect(sendClick).not.toHaveBeenCalled();
  });
});

describe('inserting a prompt records its use (prompt-recents 6.3)', () => {
  function mountBar(prompt: Prompt) {
    const onInsert = vi.fn();
    const mutate = vi.fn(async () => ({ ok: true as const, data: { stores: ['prompts'] as string[] } }));
    mount(
      <InputBar platform="claude" onInsert={onInsert} query={makeQuery([prompt]) as never} mutate={mutate as never} />,
    );
    return { onInsert, mutate };
  }

  it('records a use on a direct (no-variable) insert', async () => {
    const { onInsert, mutate } = mountBar(makePrompt({ id: 'p1', title: 'Snippet', body: 'INSERTED' }));
    await pickFirst();

    expect(onInsert).toHaveBeenCalledWith('INSERTED');
    expect(mutate).toHaveBeenCalledWith({ op: 'prompt.recordUse', id: 'p1' });
  });

  it('records a use when the variable modal is confirmed', async () => {
    const { mutate } = mountBar(makePrompt({ id: 'p2', title: 'Greeting', body: 'Dear {{name}}.' }));
    await pickFirst();

    const nameField = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
    nameField.value = 'Sam';
    nameField.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    $modal('[data-testid="sk-ib-var-insert"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 60));

    expect(mutate).toHaveBeenCalledWith({ op: 'prompt.recordUse', id: 'p2' });
  });

  it('records nothing and inserts nothing when the modal is cancelled', async () => {
    const { onInsert, mutate } = mountBar(makePrompt({ id: 'p3', title: 'Greeting', body: 'Dear {{name}}.' }));
    await pickFirst();

    $modal('[data-testid="sk-ib-var-cancel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 60));

    expect(mutate).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });
});
