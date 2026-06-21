// Profiles tab UI (happy-dom) over an injected library view — no worker. Mirrors the
// prompts-panel modal-editor test: the single first-run empty state (the old double-
// empty bug is fixed), loading/error states, clicking a row opens the editor MODAL
// seeded with the profile, editing fields + Save sends ONE profile.update, the create
// flow sends profile.create, the name-required guard, the PREPEND-only per-platform
// mode indicator (never a SYSTEM mode), and the confirm-gated delete. Maps to
// profiles-library task 5.3.

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
// reproduces that pairing so a single mount exercises the panel over an injected view.
function Tab({ view }: { view: ProfileLibraryView }) {
  const c = useProfilesController(view);
  return <ProfilesPanel controller={c} />;
}

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
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

describe('ProfilesPanel states (5.3)', () => {
  it('shows a SINGLE first-run empty state (no second no-selection element)', () => {
    mount(<Tab view={makeView({ profiles: [] })} />);
    expect($('[data-testid=sk-profiles-empty-first-run]')).toBeTruthy();
    // The "New profile" affordance is present (the header button + the first-run CTA).
    expect($('[data-testid=sk-profile-new]')).toBeTruthy();
    expect($('[data-testid=sk-profiles-create-first]')).toBeTruthy();
    // The old double-empty bug is fixed: there is exactly one empty state, and no
    // separate "Select a profile" / no-selection placeholder beside it.
    expect($$('[data-testid=sk-profiles-empty-first-run]')).toHaveLength(1);
    const text = container!.textContent ?? '';
    expect(text).not.toContain('Select a profile');
    expect(text).not.toContain('No profile selected');
    // The editor modal is not mounted until the user opens it.
    expect($('[data-testid=sk-profile-editor]')).toBeNull();
  });

  it('loading and error states render their testids and not an empty library', () => {
    mount(<Tab view={makeView({ status: 'loading' })} />);
    expect($('[data-testid=sk-profiles-loading]')).toBeTruthy();
    expect($('[data-testid=sk-profiles-empty-first-run]')).toBeNull();
    render(null, container!);

    mount(<Tab view={makeView({ status: 'error' })} />);
    expect($('[data-testid=sk-profiles-error]')).toBeTruthy();
    expect($('[data-testid=sk-profiles-empty-first-run]')).toBeNull();
  });

  it('lists a row per profile and opens no editor until a row is clicked', () => {
    mount(<Tab view={makeView({ profiles: [profile('a'), profile('b')] })} />);
    expect($('[data-testid=sk-profile-row-a]')).toBeTruthy();
    expect($('[data-testid=sk-profile-row-b]')).toBeTruthy();
    expect($('[data-testid=sk-profile-editor]')).toBeNull();
  });
});

describe('ProfilesPanel editor modal (5.3)', () => {
  const p = profile('p1', {
    name: 'Staff engineer',
    description: 'My voice',
    instructionText: 'Be terse.',
  });

  it('clicking a row opens the editor modal seeded with the profile values', async () => {
    mount(<Tab view={makeView({ profiles: [p] })} />);
    $('[data-testid=sk-profile-row-p1]')!.click();
    await flush();
    expect($('[data-testid=sk-profile-editor]')).toBeTruthy();
    expect(($('[data-testid=sk-profile-name]') as HTMLInputElement).value).toBe('Staff engineer');
    expect(($('[data-testid=sk-profile-description]') as HTMLInputElement).value).toBe('My voice');
    expect(($('[data-testid=sk-profile-instruction]') as HTMLTextAreaElement).value).toBe('Be terse.');
  });

  it('editing fields then Save sends ONE profile.update carrying those fields', async () => {
    const view = makeView({ profiles: [profile('p1', { name: 'Original' })] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-profile-row-p1]')!.click();
    await flush();

    setValue($('[data-testid=sk-profile-name]'), 'Renamed');
    setValue($('[data-testid=sk-profile-instruction]'), 'Be verbose.');
    $('[data-testid=sk-profile-applies-claude]')!.click();
    $('[data-testid=sk-profile-verbosity-brief]')!.click();
    $('[data-testid=sk-profile-format-plain]')!.click();
    await flush();
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();

    expect(mockOf(view)).toHaveBeenCalledTimes(1);
    const op = lastOp(view);
    expect(op).toMatchObject({
      op: 'profile.update',
      id: 'p1',
      name: 'Renamed',
      instructionText: 'Be verbose.',
      appliesTo: ['claude'],
    });
    expect(op.responseStyle).toEqual({ verbosity: 'brief', format: 'plain' });
  });

  it('the create flow (sk-profile-new → fill name → Save) sends a profile.create', async () => {
    const view = makeView({ profiles: [] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-profile-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-profile-name]'), 'New voice');
    await flush();
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();

    expect(mockOf(view)).toHaveBeenCalledTimes(1);
    const op = lastOp(view);
    expect(op.op).toBe('profile.create');
    expect(op.id).toBeTruthy();
    expect(op.name).toBe('New voice');
  });

  it('requires a name before it will save (shows the error, sends nothing)', async () => {
    const view = makeView({ profiles: [] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-profile-new]')!.click();
    await flush();
    $('[data-testid=sk-profile-editor-save]')!.click();
    await flush();
    expect(mockOf(view)).not.toHaveBeenCalled();
    expect($('[data-testid=sk-profile-editor-error]')).toBeTruthy();
  });
});

describe('ProfilesPanel mode indicator is PREPEND-only (5.3)', () => {
  it('shows PREPEND for every per-platform mode and never a system-prompt mode', async () => {
    mount(<Tab view={makeView({ profiles: [profile('p1', { appliesTo: ['claude', 'gemini', 'perplexity'] })] })} />);
    $('[data-testid=sk-profile-row-p1]')!.click();
    await flush();

    const modes = $$('[data-testid^=sk-profile-mode-]');
    expect(modes.length).toBeGreaterThan(0);
    for (const m of modes) expect(m.textContent).toBe('PREPEND');

    // The editor never advertises a system-prompt mode.
    const text = $('[data-testid=sk-profile-editor]')!.textContent ?? '';
    expect(text).not.toContain('SYSTEM');
    expect(text).not.toContain('System prompt');
  });

  it('the panel never shows a SYSTEM / system-prompt label anywhere', () => {
    mount(<Tab view={makeView({ profiles: [profile('p1')] })} />);
    const text = container!.textContent ?? '';
    expect(text).not.toContain('SYSTEM');
    expect(text).not.toContain('System prompt');
  });
});

describe('ProfilesPanel row overflow (⋯) menu', () => {
  it('Edit in the row menu opens the editor seeded with that profile', async () => {
    const p = profile('p1', { name: 'Staff engineer', instructionText: 'Be terse.' });
    mount(<Tab view={makeView({ profiles: [p] })} />);

    // The editor is not open until the menu's Edit is chosen.
    expect($('[data-testid=sk-profile-editor]')).toBeNull();
    $('[data-testid=sk-profile-row-menu]')!.click();
    await flush();
    $('[data-testid=sk-profile-menu-edit]')!.click();
    await flush();

    expect($('[data-testid=sk-profile-editor]')).toBeTruthy();
    expect(($('[data-testid=sk-profile-name]') as HTMLInputElement).value).toBe('Staff engineer');
  });

  it('Delete in the row menu is confirm-gated and only deletes on confirm', async () => {
    const view = makeView({ profiles: [profile('p1')] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-profile-row-menu]')!.click();
    await flush();
    $('[data-testid=sk-profile-menu-delete]')!.click();
    await flush();

    // Confirm is up; nothing deleted yet, and the editor never opened.
    expect($('[data-testid=sk-profile-row-delete-confirm]')).toBeTruthy();
    expect($('[data-testid=sk-profile-editor]')).toBeNull();
    expect(mockOf(view)).not.toHaveBeenCalled();

    $('[data-testid=sk-profile-row-delete-confirm-btn]')!.click();
    await flush();
    expect(mockOf(view)).toHaveBeenCalledWith({ op: 'profile.delete', id: 'p1' });
  });

  it('cancelling the row-menu delete confirm sends nothing', async () => {
    const view = makeView({ profiles: [profile('p1')] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-profile-row-menu]')!.click();
    await flush();
    $('[data-testid=sk-profile-menu-delete]')!.click();
    await flush();
    expect($('[data-testid=sk-profile-row-delete-confirm]')).toBeTruthy();

    $('[data-testid=sk-profile-row-delete-cancel]')!.click();
    await flush();
    expect(mockOf(view)).not.toHaveBeenCalled();
  });
});

describe('ProfilesPanel delete is confirm-gated (5.3)', () => {
  it('shows a confirm before deleting and only deletes on confirm', async () => {
    const view = makeView({ profiles: [profile('p1')] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-profile-row-p1]')!.click();
    await flush();

    $('[data-testid=sk-profile-delete]')!.click();
    await flush();
    // The confirm is up; nothing deleted yet.
    expect($('[data-testid=sk-profile-delete-confirm]')).toBeTruthy();
    expect(mockOf(view)).not.toHaveBeenCalled();

    $('[data-testid=sk-profile-delete-confirm-btn]')!.click();
    await flush();
    expect(mockOf(view)).toHaveBeenCalledWith({ op: 'profile.delete', id: 'p1' });
  });

  it('cancelling the confirm sends no delete', async () => {
    const view = makeView({ profiles: [profile('p1')] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-profile-row-p1]')!.click();
    await flush();

    $('[data-testid=sk-profile-delete]')!.click();
    await flush();
    expect($('[data-testid=sk-profile-delete-confirm]')).toBeTruthy();
    $('[data-testid=sk-profile-delete-cancel]')!.click();
    await flush();
    expect(mockOf(view)).not.toHaveBeenCalled();
  });
});
