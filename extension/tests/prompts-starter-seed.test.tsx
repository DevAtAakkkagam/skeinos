// StarterSeed: the seeding recovery path in the Prompts empty state for users who
// skipped onboarding's domain pick. It appears ONLY while no domain is chosen, picks
// a domain, installs that domain's seeds via the controller, and persists the domain.
// Driven through the `domainChosen` / `persistDomain` test seams so it runs without a
// chrome settings shim. Mirrors tests/prompts-panel-no-starter.test.tsx's harness.

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

describe('StarterSeed (empty-state seeding when no domain is chosen)', () => {
  it('renders nothing once a domain has been chosen', () => {
    mount(<StarterSeed controller={makeController()} domainChosen={true} />);
    expect($('[data-testid=sk-prompts-seed]')).toBeNull();
  });

  it('offers the domain picker + seed button when no domain is chosen', () => {
    mount(<StarterSeed controller={makeController()} domainChosen={false} />);
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
        domainChosen={false}
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
        domainChosen={false}
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
