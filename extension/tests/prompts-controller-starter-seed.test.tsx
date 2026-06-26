// usePromptsController.installSeeds: loading the starter kit must seed BOTH the prompt
// library and the instruction-profile library for the picked domain — even when the
// only trigger is the prompts empty-state StarterSeed control. Mocks both worker
// clients and drives the real controller through the empty-state seed button.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';

const installPromptSeedsRemote = vi.fn(async (_domain: string) => ({ ok: true, data: { installed: 5 } }));
const installProfileSeedsRemote = vi.fn(async (_domain: string) => ({ ok: true, data: { installed: 1 } }));

vi.mock('../src/core/prompts', async (orig) => ({
  ...(await orig<typeof import('../src/core/prompts')>()),
  installPromptSeedsRemote: (d: unknown) => installPromptSeedsRemote(d as never),
}));
vi.mock('../src/core/profiles', async (orig) => ({
  ...(await orig<typeof import('../src/core/profiles')>()),
  installProfileSeedsRemote: (d: unknown) => installProfileSeedsRemote(d as never),
}));

const { usePromptsController } = await import('../src/ui/prompts/usePromptsController');
const { PromptsPanel } = await import('../src/ui/prompts/PromptsPanel');
import type { PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';

vi.mock('../src/ui/onboarding/gate', () => ({ setOnboardingDomain: vi.fn() }));

function makeView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
  return {
    prompts: [], folders: [], status: 'ready',
    refresh: vi.fn(), retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

function Tab({ view }: { view: PromptLibraryView }) {
  const c = usePromptsController(view);
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
  vi.clearAllMocks();
});

describe('usePromptsController.installSeeds (starter kit seeds prompts + profiles)', () => {
  it('seeds BOTH prompt and profile libraries for the picked domain from the empty state', async () => {
    const view = makeView();
    mount(<Tab view={view} />);

    $('[data-testid=sk-prompts-seed-add]')!.click();
    await flush();

    expect(installPromptSeedsRemote).toHaveBeenCalledWith('software-engineering');
    expect(installProfileSeedsRemote).toHaveBeenCalledWith('software-engineering');
    // The library re-read surfaces the new rows so the empty state dismisses.
    expect(view.refresh).toHaveBeenCalled();
  });

  it('still seeds prompts when profile seeding fails (non-blocking)', async () => {
    installProfileSeedsRemote.mockRejectedValueOnce(new Error('boom'));
    const view = makeView();
    mount(<Tab view={view} />);

    $('[data-testid=sk-prompts-seed-add]')!.click();
    await flush();

    expect(installPromptSeedsRemote).toHaveBeenCalledWith('software-engineering');
    expect(view.refresh).toHaveBeenCalled();
  });
});
