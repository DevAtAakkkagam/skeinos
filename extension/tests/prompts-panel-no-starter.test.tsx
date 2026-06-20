// Regression: onboarding-flow §7.1 removed the temporary "Add starter prompts"
// affordance from the Prompts tab. This asserts the PromptsPanel no longer renders
// `sk-prompts-starter` / `sk-prompts-starter-add`, that the panel itself still
// renders, and that the controller still exposes a working `installSeeds` driving the
// unchanged `prompts.install` path. Maps to openspec/changes/onboarding-flow/tasks.md §8.6.
//
// Harness mirrors tests/prompts-panel.test.tsx (a `Tab` pairing the controller with
// the panel over an injected library view). The worker client `installPromptSeedsRemote`
// is mocked so `installSeeds` resolves without a service worker.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { PromptsPanel } from '../src/ui/prompts/PromptsPanel';
import { usePromptsController } from '../src/ui/prompts/usePromptsController';
import type { PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';

// Mock only the worker client the controller calls; everything else is real.
// `vi.hoisted` lets the spy exist before the hoisted `vi.mock` factory runs.
const { installPromptSeedsRemote } = vi.hoisted(() => ({
  installPromptSeedsRemote: vi.fn(async () => ({ ok: true as const, data: { installed: 5 } })),
}));
vi.mock('../src/core/prompts', async () => {
  const actual = await vi.importActual<typeof import('../src/core/prompts')>('../src/core/prompts');
  return { ...actual, installPromptSeedsRemote };
});

function makeView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
  return {
    prompts: [],
    folders: [],
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

// Expose the controller instance so the test can drive `installSeeds` directly.
let captured: ReturnType<typeof usePromptsController> | null = null;
function Tab({ view }: { view: PromptLibraryView }) {
  const c = usePromptsController(view);
  captured = c;
  return <PromptsPanel controller={c} />;
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
  captured = null;
  installPromptSeedsRemote.mockClear();
});

describe('PromptsPanel without the starter affordance (8.6)', () => {
  it('renders the panel but no "Add starter prompts" control', () => {
    mount(<Tab view={makeView()} />);
    // The panel itself still renders.
    expect($('[data-testid=sk-prompts-panel]')).toBeTruthy();
    // The temporary seed affordance is gone.
    expect($('[data-testid=sk-prompts-starter]')).toBeNull();
    expect($('[data-testid=sk-prompts-starter-add]')).toBeNull();
  });

  it('the controller still exposes a working installSeeds (prompts.install path unchanged)', async () => {
    mount(<Tab view={makeView()} />);
    expect(captured).toBeTruthy();
    expect(typeof captured!.installSeeds).toBe('function');

    const count = await captured!.installSeeds('software-engineering');
    await flush();

    expect(installPromptSeedsRemote).toHaveBeenCalledWith('software-engineering');
    expect(count).toBe(5);
  });
});
