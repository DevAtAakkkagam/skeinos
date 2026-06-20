// Prompts tab in real Chromium: shadow-root scoping + `--sk-*` token resolution, the
// Folders ⇄ Prompts tab switch, and keyboard operation of the card overflow menu and
// the editor dialog. The happy-dom suite covers the logic; this asserts the parts
// that need a real engine (token cascade, Zag focus/keyboard) hold in the shadow DOM.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { PromptsPanel } from '../../src/ui/prompts/PromptsPanel';
import { PromptCategoryChips } from '../../src/ui/prompts/PromptCategoryChips';
import { usePromptsController } from '../../src/ui/prompts/usePromptsController';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import type { PromptLibraryView } from '../../src/ui/prompts/usePromptLibrary';
import type { WorkspaceView } from '../../src/ui/sidebar/useWorkspace';
import type { Prompt, PromptFolder } from '../../src/shared/types';

// Pairs the chip row + panel body over one controller, as the shell does.
function Tab({ view }: { view: PromptLibraryView }) {
  const c = usePromptsController(view);
  return (
    <>
      <PromptCategoryChips controller={c} />
      <PromptsPanel controller={c} />
    </>
  );
}

let handle: MountHandle | null = null;

function prompt(id: string, over: Partial<Prompt> = {}): Prompt {
  return {
    id, title: id, body: 'Write {{topic}}', variables: [{ name: 'topic', type: 'text' }],
    tags: [], targetModels: ['claude'], promptFolderId: null, usageCount: 0,
    rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over,
  };
}
function folder(id: string, name: string): PromptFolder {
  return { id, name, parentId: null, order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}
function makeView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
  return {
    prompts: [prompt('p1', { title: 'Explainer' })], folders: [folder('f1', 'Work')],
    status: 'ready', refresh: vi.fn(), retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

const workspaceView: WorkspaceView = {
  tree: { active: [], pinned: [], archived: [] },
  conversations: [], active: null, platformFilter: 'all', setPlatformFilter: vi.fn(),
  status: 'ready', refresh: vi.fn(), retry: vi.fn(), mutate: vi.fn(async () => ({ ok: true, applied: true })),
};

function mountPanel(node: preact.ComponentChild) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(target, node, { theme: 'light' });
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}
const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;
const key = (el: HTMLElement, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

describe('Prompts tab (real browser)', () => {
  it('mounts inside the shadow root and resolves --sk-* tokens for the variable chip', () => {
    mountPanel(<Tab view={makeView()} />);
    const panel = $('[data-testid=sk-prompts-panel]')!;
    expect(panel).toBeTruthy();
    // Nothing leaked into the host light DOM.
    expect(document.body.querySelector('[data-testid=sk-prompts-panel]')).toBeNull();
    // The variable chip is token-styled: the accent custom property resolves and the
    // chip's computed color is a real, applied color (not an unresolved var).
    const chip = $('[data-testid=sk-prompt-var]')!;
    expect(getComputedStyle(chip).getPropertyValue('--sk-color-accent').trim()).not.toBe('');
    expect(getComputedStyle(chip).color).toMatch(/^rgb/);
  });

  it('switches from Folders to the Prompts body within the shadow root', async () => {
    mountPanel(<SidebarShell platform="claude" view={workspaceView} />);
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    $('[data-testid=sk-tab-prompts]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-prompts-panel]')).toBeTruthy());
    expect($('[data-testid=sk-filters]')).toBeNull();
  });

  it('opens the editor from the card overflow menu with the keyboard', async () => {
    mountPanel(<Tab view={makeView()} />);
    const trigger = $('[data-testid=sk-prompt-card-menu]')!;
    trigger.focus();
    trigger.click();
    await vi.waitFor(() => expect($('[data-testid=sk-prompt-card-menu-content]')).toBeTruthy());
    const content = $('[data-testid=sk-prompt-card-menu-content]')!;
    key(content, 'ArrowDown'); // highlight Edit
    await vi.waitFor(() => expect(content.getAttribute('aria-activedescendant')).toBeTruthy());
    key(content, 'Enter'); // activate Edit → opens the editor
    await vi.waitFor(() => expect($('[data-testid=sk-prompt-editor]')).toBeTruthy());
  });

  it('the editor dialog closes on Escape', async () => {
    mountPanel(<Tab view={makeView({ prompts: [], folders: [] })} />);
    const newBtn = $('[data-testid=sk-prompt-new]')!;
    newBtn.focus();
    newBtn.click();
    await vi.waitFor(() => expect($('[data-testid=sk-prompt-editor]')).toBeTruthy());
    $('[data-testid=sk-prompt-editor]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await vi.waitFor(() => expect($('[data-testid=sk-prompt-editor]')).toBeNull());
  });
});
