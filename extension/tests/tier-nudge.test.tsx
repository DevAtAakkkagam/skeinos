// tier-gate spec coverage — the block-with-nudge UI across the three create
// surfaces (folders / prompts / profiles). Maps to
// openspec/changes/tier-gate/specs/tier-gate/spec.md "Block-with-nudge preserves
// user input": a create the worker refuses with `quota_exceeded` keeps the form
// open with the typed values intact, shows an upgrade nudge naming the limit, and
// presents NO purchase/checkout action. Runs over injected views (no worker).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Sidebar } from '../src/ui/sidebar/Sidebar';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import { ProfilesPanel } from '../src/ui/profiles/ProfilesPanel';
import { useProfilesController } from '../src/ui/profiles/useProfilesController';
import type { ProfileLibraryView } from '../src/ui/profiles/useProfileLibrary';
import { PromptsPanel } from '../src/ui/prompts/PromptsPanel';
import { usePromptsController } from '../src/ui/prompts/usePromptsController';
import type { PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';
import type { FolderTreeSnapshot } from '../src/shared/workspace';
import type { Resource } from '../src/core/tier';

// A `quota_exceeded` rejection envelope for `resource` at its `limit`.
function quotaError(resource: Resource, limit: number) {
  return {
    ok: false as const,
    applied: false,
    error: {
      code: 'quota_exceeded',
      message: `Quota exceeded for ${resource}`,
      detail: { resource, count: limit, limit },
    },
  };
}

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
function mount(node: preact.ComponentChild) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}
function setValue(el: HTMLElement | null, value: string) {
  (el as HTMLInputElement).value = value;
  el!.dispatchEvent(new Event('input', { bubbles: true }));
}
// happy-dom does not submit a form when its submit button is clicked; drive the
// form directly (mirrors sidebar.test.tsx).
function submitForm(form: HTMLElement | null) {
  const f = form as HTMLFormElement;
  if (typeof f.requestSubmit === 'function') f.requestSubmit();
  else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

// --- folders -----------------------------------------------------------------

function makeWorkspaceView(over: Partial<WorkspaceView> = {}): WorkspaceView {
  const tree: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };
  return {
    tree,
    conversations: [],
    active: null,
    listCollapsed: false,
    platformFilter: 'all',
    setPlatformFilter: vi.fn(),
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

describe('folder create — block-with-nudge (3.2/3.6)', () => {
  it('keeps the dialog + typed name and shows the nudge, with no purchase action', async () => {
    const view = makeWorkspaceView({ mutate: vi.fn(async () => quotaError('folders', 5)) });
    mount(<Sidebar platform="claude" view={view} />);

    $('[data-testid=sk-empty-new-folder]')!.click();
    await flush();
    setValue($('[data-testid=sk-folder-name]'), 'Archive');
    await flush(); // let the name state settle before submit
    submitForm($('.sk-dialog__body'));
    await flush();

    // Dialog stays open with the typed value intact.
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();
    expect(($('[data-testid=sk-folder-name]') as HTMLInputElement).value).toBe('Archive');
    // The nudge is shown and names the limit; the generic error is NOT shown.
    const nudge = $('[data-testid=sk-folder-quota-nudge]');
    expect(nudge).toBeTruthy();
    expect(nudge!.textContent).toContain('5');
    expect($('[data-testid=sk-folder-error]')).toBeNull();
    // Informational only — no purchase/checkout control inside the nudge.
    expect(nudge!.querySelector('button, a')).toBeNull();
  });

  it('a successful create closes the dialog (no nudge)', async () => {
    const view = makeWorkspaceView({ mutate: vi.fn(async () => ({ ok: true, applied: true })) });
    mount(<Sidebar platform="claude" view={view} />);

    $('[data-testid=sk-empty-new-folder]')!.click();
    await flush();
    setValue($('[data-testid=sk-folder-name]'), 'Work');
    await flush(); // let the name state settle before submit
    submitForm($('.sk-dialog__body'));
    await flush();

    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
    expect($('[data-testid=sk-folder-quota-nudge]')).toBeNull();
  });
});

// --- profiles ----------------------------------------------------------------

function makeProfileView(over: Partial<ProfileLibraryView> = {}): ProfileLibraryView {
  return {
    profiles: [],
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}
function ProfilesTab({ view }: { view: ProfileLibraryView }) {
  const c = useProfilesController(view);
  return <ProfilesPanel controller={c} />;
}

describe('profile create — block-with-nudge (3.4/3.6)', () => {
  it('keeps the editor + typed values and shows the nudge, no purchase action', async () => {
    const view = makeProfileView({ mutate: vi.fn(async () => quotaError('profiles', 3)) });
    mount(<ProfilesTab view={view} />);

    $('[data-testid=sk-profile-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-profile-name]'), 'Staff voice');
    setValue($('[data-testid=sk-profile-instruction]'), 'Be terse.');
    await flush(); // let the name/instruction state settle before submit
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();

    // Editor stays open with the typed values intact.
    expect($('[data-testid=sk-profile-editor]')).toBeTruthy();
    expect(($('[data-testid=sk-profile-name]') as HTMLInputElement).value).toBe('Staff voice');
    const nudge = $('[data-testid=sk-profile-quota-nudge]');
    expect(nudge).toBeTruthy();
    expect(nudge!.textContent).toContain('3');
    expect(nudge!.querySelector('button, a')).toBeNull();
  });
});

// --- prompts -----------------------------------------------------------------

function makePromptView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
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
function PromptsTab({ view }: { view: PromptLibraryView }) {
  const c = usePromptsController(view);
  return <PromptsPanel controller={c} />;
}

describe('prompt create — block-with-nudge (3.3/3.6)', () => {
  it('keeps the editor + typed title and shows the nudge, no purchase action', async () => {
    const view = makePromptView({ mutate: vi.fn(async () => quotaError('prompts', 25)) });
    mount(<PromptsTab view={view} />);

    $('[data-testid=sk-prompt-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-editor-title]'), 'My prompt');
    setValue($('[data-testid=sk-prompt-editor-body]'), 'Do the thing.');
    $('[data-testid=sk-prompt-editor-target-claude]')!.click();
    await flush(); // let the title/body state settle before submit
    $('[data-testid=sk-prompt-editor-save]')!.click();
    await flush();

    expect(($('[data-testid=sk-prompt-editor-title]') as HTMLInputElement).value).toBe('My prompt');
    const nudge = $('[data-testid=sk-prompt-quota-nudge]');
    expect(nudge).toBeTruthy();
    expect(nudge!.textContent).toContain('25');
    expect(nudge!.querySelector('button, a')).toBeNull();
  });
});
