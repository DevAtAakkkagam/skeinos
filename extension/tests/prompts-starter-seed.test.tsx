// StarterSeed: the starter-pack pre-load in the Prompts empty state. It is always
// shown on the empty state, picks a professional domain, installs that domain's seeds
// via the controller, and records the chosen domain. Driven through the `persistDomain`
// test seam so it runs without a chrome settings shim.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { StarterSeed } from '../src/ui/prompts/StarterSeed';
import type { PromptsController } from '../src/ui/prompts/usePromptsController';

/** A minimal controller stub — StarterSeed only touches `installSeeds`. */
function makeController(installSeeds = vi.fn(async () => 5)): PromptsController {
  return { installSeeds } as unknown as PromptsController;
}

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
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
});

describe('StarterSeed (always-shown empty-state starter-pack pre-load)', () => {
  it('always offers the domain picker + seed button on the empty state', () => {
    mount(<StarterSeed controller={makeController()} />);
    expect($('[data-testid=sk-prompts-seed]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-seed-domain]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-seed-add]')).toBeTruthy();
  });

  it('installs the default domain and persists it on "Add starter prompts"', async () => {
    const installSeeds = vi.fn(async () => 5);
    const persistDomain = vi.fn();
    mount(
      <StarterSeed
        controller={makeController(installSeeds)}
        persistDomain={persistDomain}
      />,
    );

    $('[data-testid=sk-prompts-seed-add]')!.click();
    await flush();

    // Defaults to the first registry domain (software-engineering).
    expect(installSeeds).toHaveBeenCalledWith('software-engineering');
    expect(persistDomain).toHaveBeenCalledWith('software-engineering');
  });

  it('installs the selected domain when the picker is changed', async () => {
    const installSeeds = vi.fn(async () => 3);
    const persistDomain = vi.fn();
    mount(
      <StarterSeed
        controller={makeController(installSeeds)}
        persistDomain={persistDomain}
      />,
    );

    const select = $('[data-testid=sk-prompts-seed-domain]') as HTMLSelectElement;
    select.value = 'data-analytics';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    $('[data-testid=sk-prompts-seed-add]')!.click();
    await flush();

    expect(installSeeds).toHaveBeenCalledWith('data-analytics');
    expect(persistDomain).toHaveBeenCalledWith('data-analytics');
  });
});
