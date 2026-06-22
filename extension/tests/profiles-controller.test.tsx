// Profiles controller (happy-dom) over an injected library view — no worker. Covers
// the modal-editor view-model seams (mirrors `usePromptsController`): openCreate→save
// drives a single `profile.create` carrying the editor fields, openEdit(p)→save drives
// a `profile.update` carrying that id, deleteProfile drives a `profile.delete`, and the
// controller is a pure view (it renders `view.profiles` verbatim and holds no
// authoritative profile state — reconcile-on-broadcast lives in `useProfileLibrary`).
// Maps to profiles-library task 5.2.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { ProfilesPanel } from '../src/ui/profiles/ProfilesPanel';
import { useProfilesController } from '../src/ui/profiles/useProfilesController';
import type { ProfileLibraryView } from '../src/ui/profiles/useProfileLibrary';
import type { InstructionProfile } from '../src/shared/types';

function profile(id: string, over: Partial<InstructionProfile> = {}): InstructionProfile {
  return {
    id, name: id, instructionText: '', appliesTo: [],
    rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over,
  };
}
function makeView(over: Partial<ProfileLibraryView> = {}): ProfileLibraryView {
  return {
    profiles: [], status: 'ready',
    refresh: vi.fn(), retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

// The shell holds one controller and renders the panel over it; this harness
// reproduces that pairing so a single mount drives the controller's actions through
// the panel + editor modal over an injected library view.
function Tab({ view }: { view: ProfileLibraryView }) {
  const c = useProfilesController(view);
  return <ProfilesPanel controller={c} />;
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
function setValue(el: HTMLElement | null, value: string) {
  (el as HTMLInputElement).value = value;
  el!.dispatchEvent(new Event('input', { bubbles: true }));
}
// The row is non-interactive; editing is reached through the row's ⋯ menu.
const openEditor = async () => {
  $('[data-testid=sk-profile-row-menu]')!.click();
  await flush();
  $('[data-testid=sk-profile-menu-edit]')!.click();
};
const mockOf = (v: ProfileLibraryView) => v.mutate as ReturnType<typeof vi.fn>;
const lastOp = (v: ProfileLibraryView) => {
  const calls = mockOf(v).mock.calls;
  return calls[calls.length - 1][0];
};

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('useProfilesController (5.2)', () => {
  it('renders view.profiles verbatim (pure view, no local replay)', () => {
    const view = makeView({ profiles: [profile('a', { name: 'Alpha' }), profile('b', { name: 'Beta' })] });
    mount(<Tab view={view} />);
    // The list rows are exactly the view's profiles, in order.
    expect($('[data-testid=sk-profile-row-a]')).toBeTruthy();
    expect($('[data-testid=sk-profile-row-b]')).toBeTruthy();
  });

  it('passes through the library status (a loading view shows loading, not an empty list)', () => {
    mount(<Tab view={makeView({ status: 'loading' })} />);
    expect($('[data-testid=sk-profiles-loading]')).toBeTruthy();
    expect($('[data-testid=sk-profiles-empty-first-run]')).toBeNull();
  });

  it('openCreate → save drives a single profile.create carrying the editor fields', async () => {
    const view = makeView({ profiles: [] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-profile-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-profile-name]'), 'Staff engineer');
    setValue($('[data-testid=sk-profile-instruction]'), 'Be terse.');
    await flush();
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();

    expect(mockOf(view)).toHaveBeenCalledTimes(1);
    const op = lastOp(view);
    expect(op.op).toBe('profile.create');
    expect(op.id).toBeTruthy();
    expect(op.name).toBe('Staff engineer');
    expect(op.instructionText).toBe('Be terse.');
  });

  it('openEdit(p) → save drives a profile.update carrying that profile id', async () => {
    const view = makeView({ profiles: [profile('p1', { name: 'Original' })] });
    mount(<Tab view={view} />);

    await openEditor();
    await flush();
    setValue($('[data-testid=sk-profile-name]'), 'Renamed');
    await flush();
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();

    expect(mockOf(view)).toHaveBeenCalledTimes(1);
    expect(lastOp(view)).toMatchObject({ op: 'profile.update', id: 'p1', name: 'Renamed' });
  });

  it('deleteProfile drives a single profile.delete for that id', async () => {
    const view = makeView({ profiles: [profile('p1')] });
    mount(<Tab view={view} />);

    await openEditor();
    await flush();
    $('[data-testid=sk-profile-delete]')!.click();
    await flush();
    $('[data-testid=sk-profile-delete-confirm-btn]')!.click();
    await flush();

    expect(mockOf(view)).toHaveBeenCalledTimes(1);
    expect(lastOp(view)).toEqual({ op: 'profile.delete', id: 'p1' });
  });
});
