// starter-kit-provenance — the provenance band UI (happy-dom). Covers: it names the
// kit + states editability with a pluralized count; the panel shows it only while
// seeded records remain (controller derivation); and the swap dialog only fires for a
// DIFFERENT kit (re-picking the same one is inert).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { StarterKitBand } from '../src/ui/starter/StarterKitBand';
import { PromptsPanel } from '../src/ui/prompts/PromptsPanel';
import { usePromptsController } from '../src/ui/prompts/usePromptsController';
import type { PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';
import type { Prompt } from '../src/shared/types';

let container: HTMLElement | null = null;
const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
function mount(node: preact.ComponentChild) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}
afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
  vi.clearAllMocks();
});

function prompt(id: string, over: Partial<Prompt> = {}): Prompt {
  return {
    id, title: id, body: '', variables: [], tags: [], targetModels: [],
    promptFolderId: null, usageCount: 0,
    rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over,
  };
}
function makeView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
  return {
    prompts: [], folders: [], status: 'ready',
    refresh: vi.fn(), retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}
function Tab({ view }: { view: PromptLibraryView }) {
  return <PromptsPanel controller={usePromptsController(view)} />;
}

describe('StarterKitBand', () => {
  it('names the kit and pluralizes the editable-count caption', () => {
    mount(<StarterKitBand kit={{ domain: 'software-engineering', count: 3 }} kind="prompts" swap={vi.fn()} />);
    expect($('[data-testid=sk-starter-kit-label]')!.textContent).toBe('Software engineering starter kit');
    expect($('[data-testid=sk-starter-kit]')!.textContent).toContain('3 starter prompts — edit or delete any');
  });

  it('uses the singular profile caption for one seed', () => {
    mount(<StarterKitBand kit={{ domain: 'marketing-content', count: 1 }} kind="profiles" swap={vi.fn()} />);
    expect($('[data-testid=sk-starter-kit]')!.textContent).toContain('1 starter profile — edit or delete any');
  });

  it('swaps to a different kit and is inert for the same kit', async () => {
    const swap = vi.fn(async () => {});
    mount(<StarterKitBand kit={{ domain: 'software-engineering', count: 2 }} kind="prompts" swap={swap} />);

    $('[data-testid=sk-starter-kit-change]')!.click();
    await flush();
    // Same kit pre-selected → Replace disabled.
    const replace = $('[data-testid=sk-starter-kit-replace]') as HTMLButtonElement;
    expect(replace.disabled).toBe(true);

    const select = $('[data-testid=sk-starter-kit-select]') as HTMLSelectElement;
    select.value = 'data-analytics';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(replace.disabled).toBe(false);

    replace.click();
    await flush();
    expect(swap).toHaveBeenCalledWith('software-engineering', 'data-analytics');
  });
});

describe('PromptsPanel provenance band visibility (controller derivation)', () => {
  it('shows the band only while seeded prompts remain', async () => {
    mount(<Tab view={makeView({ prompts: [prompt('a', { domain: 'software-engineering' }), prompt('b')] })} />);
    await flush();
    expect($('[data-testid=sk-starter-kit]')).not.toBeNull();
    expect($('[data-testid=sk-starter-kit-label]')!.textContent).toBe('Software engineering starter kit');
    // One seeded prompt → singular.
    expect($('[data-testid=sk-starter-kit]')!.textContent).toContain('1 starter prompt — edit or delete any');
  });

  it('hides the band when no prompt carries a domain', async () => {
    mount(<Tab view={makeView({ prompts: [prompt('a'), prompt('b')] })} />);
    await flush();
    expect($('[data-testid=sk-starter-kit]')).toBeNull();
  });
});
