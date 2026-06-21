// Profiles tab in real Chromium: shadow-root scoping + `--sk-*` token resolution, the
// Folders ⇄ Profiles tab switch, and the editor MODAL opened by clicking a row (Esc
// closes it). The happy-dom suite covers the logic; this asserts the parts that need a
// real engine (token cascade in the shadow DOM, Zag-free dialog focus/keyboard).
// Mirrors `prompts.browser.test.tsx`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { ProfilesPanel } from '../../src/ui/profiles/ProfilesPanel';
import { useProfilesController } from '../../src/ui/profiles/useProfilesController';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import type { ProfileLibraryView } from '../../src/ui/profiles/useProfileLibrary';
import type { WorkspaceView } from '../../src/ui/sidebar/useWorkspace';
import type { InstructionProfile } from '../../src/shared/types';

function Tab({ view }: { view: ProfileLibraryView }) {
  const c = useProfilesController(view);
  return <ProfilesPanel controller={c} />;
}

let handle: MountHandle | null = null;

function profile(id: string, over: Partial<InstructionProfile> = {}): InstructionProfile {
  return {
    id, name: id, instructionText: 'Be terse', description: 'A profile',
    appliesTo: ['claude'], rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over,
  };
}
function makeView(over: Partial<ProfileLibraryView> = {}): ProfileLibraryView {
  return {
    profiles: [profile('p1', { name: 'Staff engineer' })],
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

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

describe('Profiles tab (real browser)', () => {
  it('mounts inside the shadow root and resolves --sk-* tokens for a profile row', () => {
    mountPanel(<Tab view={makeView()} />);
    const panel = $('[data-testid=sk-profiles-panel]')!;
    expect(panel).toBeTruthy();
    // Nothing leaked into the host light DOM.
    expect(document.body.querySelector('[data-testid=sk-profiles-panel]')).toBeNull();
    // The row is token-styled: the accent custom property resolves and the row's
    // computed background is a real applied color, never an unresolved `var()`.
    const row = $('[data-testid=sk-profile-row-p1]')!;
    expect(getComputedStyle(row).getPropertyValue('--sk-color-accent').trim()).not.toBe('');
    const bg = getComputedStyle(row).backgroundColor;
    expect(bg).not.toContain('var(');
  });

  it('switches from Folders to the Profiles body within the shadow root', async () => {
    mountPanel(
      <SidebarShell platform="claude" view={workspaceView} profileView={makeView({ profiles: [] })} />,
    );
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    $('[data-testid=sk-tab-profiles]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-profiles-panel]')).toBeTruthy());
    // Folder-specific chrome and the prompt body are gone.
    expect($('[data-testid=sk-filters]')).toBeNull();
    expect($('[data-testid=sk-prompts-panel]')).toBeNull();
  });

  it('clicking a row opens the editor modal, and Escape closes it', async () => {
    mountPanel(<Tab view={makeView()} />);
    const row = $('[data-testid=sk-profile-row-p1]')!;
    row.focus();
    row.click();
    await vi.waitFor(() => expect($('[data-testid=sk-profile-editor]')).toBeTruthy());
    $('[data-testid=sk-profile-editor]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await vi.waitFor(() => expect($('[data-testid=sk-profile-editor]')).toBeNull());
  });

  it('opens the editor for a create via the header + button', async () => {
    mountPanel(<Tab view={makeView({ profiles: [] })} />);
    const newBtn = $('[data-testid=sk-profile-new]')!;
    newBtn.focus();
    newBtn.click();
    await vi.waitFor(() => expect($('[data-testid=sk-profile-editor]')).toBeTruthy());
  });
});
