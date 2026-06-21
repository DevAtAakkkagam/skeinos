// Profile prepend (profile-prepend): when a profile is active, Inserting a prompt
// PREPENDS the profile's composed text above the prompt body — but ONLY into an empty
// composer, so the standing instruction never clobbers or duplicates over a draft.
// Activating a profile no longer injects on its own; its text rides the next insert.
//
// The chip resolves its active profile through the (mocked) settings + profile-library
// seams; the bar's `isComposerEmpty` seam is injected per test to drive the gate.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';

// An active profile in storage + a one-profile library, so the chip marks `pr1` active
// and reports its composed text up to the bar.
vi.mock('../src/core/settings', () => ({
  getSettings: vi.fn(async () => ({
    theme: 'system',
    telemetry: false,
    onboardingCompleted: false,
    activeProfileId: 'pr1',
  })),
  setSettings: vi.fn(async () => {}),
  subscribeSettings: vi.fn(() => () => {}),
}));
vi.mock('../src/core/profiles', () => ({
  queryProfilesRemote: vi.fn(async () => ({
    ok: true as const,
    data: {
      kind: 'profile.library' as const,
      profiles: [
        {
          id: 'pr1',
          name: 'Brand copywriter',
          instructionText: 'Act as a brand copywriter.',
          appliesTo: ['claude'],
          rev: 1,
          updatedAt: 0,
          deviceId: 'd',
          hash: 'h',
        },
      ],
    },
  })),
}));

import { InputBar } from '../src/ui/input-bar/InputBar';
import type { Prompt } from '../src/shared/types';
import type { PromptSearchResult } from '../src/shared/prompts';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
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
    title: over.id, description: '', variables: [], tags: [], targetModels: [],
    promptFolderId: null, usageCount: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h',
    ...over,
  };
}

function makeQuery(prompts: Prompt[]) {
  const results: PromptSearchResult[] = prompts.map((p) => ({
    id: p.id, title: p.title, snippet: [{ text: p.title, match: false }], targetModels: [],
  }));
  return vi.fn(async (sel: { kind: string }) =>
    sel.kind === 'prompt.library'
      ? { ok: true as const, data: { kind: 'prompt.library' as const, prompts, folders: [] } }
      : { ok: true as const, data: { kind: 'prompt.search' as const, results } },
  );
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

// Let the chip's load + settings effects resolve so the active profile is reported up
// before a prompt is picked.
async function settleChip(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('profile prepend on prompt insert (profile-prepend)', () => {
  it('prepends the active profile above the prompt body when the composer is empty', async () => {
    const onInsert = vi.fn();
    const prompt = makePrompt({ id: 'p1', title: 'Linked', body: 'Write a LinkedIn post.' });
    mount(
      <InputBar
        platform="claude"
        onInsert={onInsert}
        isComposerEmpty={() => true}
        query={makeQuery([prompt]) as never}
      />,
    );
    await settleChip();
    await pickFirst();

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith('Act as a brand copywriter.\n\nWrite a LinkedIn post.');
  });

  it('inserts only the prompt body when the composer already holds a draft', async () => {
    const onInsert = vi.fn();
    const prompt = makePrompt({ id: 'p1', title: 'Linked', body: 'Write a LinkedIn post.' });
    mount(
      <InputBar
        platform="claude"
        onInsert={onInsert}
        isComposerEmpty={() => false}
        query={makeQuery([prompt]) as never}
      />,
    );
    await settleChip();
    await pickFirst();

    // A non-empty composer is left untouched by the profile — no duplicate block.
    expect(onInsert).toHaveBeenCalledWith('Write a LinkedIn post.');
  });

  it('prepends the profile ahead of the substituted body of a variable prompt', async () => {
    const onInsert = vi.fn();
    const prompt = makePrompt({ id: 'p2', title: 'Greeting', body: 'Dear {{name}}.' });
    mount(
      <InputBar
        platform="claude"
        onInsert={onInsert}
        isComposerEmpty={() => true}
        query={makeQuery([prompt]) as never}
      />,
    );
    await settleChip();
    await pickFirst();

    const name = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
    name.value = 'Sam';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    $modal('[data-testid="sk-ib-var-insert"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 60));

    expect(onInsert).toHaveBeenCalledWith('Act as a brand copywriter.\n\nDear Sam.');
  });

  it('does not prepend when no profile is active', async () => {
    // Re-point the active id at nothing for this test only.
    const settings = await import('../src/core/settings');
    (settings.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      theme: 'system', telemetry: false, onboardingCompleted: false, activeProfileId: undefined,
    });
    const onInsert = vi.fn();
    const prompt = makePrompt({ id: 'p1', title: 'Linked', body: 'Write a LinkedIn post.' });
    mount(
      <InputBar
        platform="claude"
        onInsert={onInsert}
        isComposerEmpty={() => true}
        query={makeQuery([prompt]) as never}
      />,
    );
    await settleChip();
    await pickFirst();

    expect(onInsert).toHaveBeenCalledWith('Write a LinkedIn post.');
  });
});
