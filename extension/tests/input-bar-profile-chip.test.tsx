// Profile chip (profile-activation 4.3/4.4/4.5): the input bar's functional Profile
// control. Rendered over fully injected seams (queryProfiles / getSettings /
// setSettings / subscribeSettings) so nothing touches chrome or the worker. Covers:
//   4.3 the menu lists profiles, marks the active one, disables non-applicable ones,
//       and reflects the persisted active profile on open.
//   4.4 selecting an applicable profile activates it (setSettings) AND inserts its
//       composed text (onInsert); a non-applicable profile does neither.
//   4.5 a live settings change re-marks the active item without a reload; a dangling
//       active id renders as "no active profile" and never throws.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { ProfileChip } from '../src/ui/input-bar/ProfileChip';
import { composeProfileText } from '../src/ui/profiles/compose';
import { STR } from '../src/ui/input-bar/strings';
import type { InstructionProfile, PlatformId } from '../src/shared/types';
import type { ProfileSnapshot } from '../src/shared/profiles';
import type { Settings, SettingsHandler } from '../src/core/settings';
import type { Response } from '../src/shared/messages';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];

function mount(node: preact.ComponentChild): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// Stamp the sync envelope so a partial fixture is a full InstructionProfile.
function profile(over: Partial<InstructionProfile> & { id: string }): InstructionProfile {
  return {
    name: over.id,
    instructionText: '',
    appliesTo: ['claude'],
    rev: 1,
    updatedAt: 0,
    deviceId: 'd',
    hash: 'h',
    ...over,
  };
}

function makeQueryProfiles(profiles: InstructionProfile[]) {
  return vi.fn(
    async (sel: { kind: string }): Promise<Response<ProfileSnapshot>> => {
      expect(sel).toEqual({ kind: 'profile.library' });
      return { ok: true, data: { kind: 'profile.library', profiles } };
    },
  );
}

// Settings seams: getSettings resolves a fixed snapshot; subscribeSettings captures
// the handler so a test can fire a cross-tab change.
function makeSettings(activeProfileId?: string) {
  const handlers = new Set<SettingsHandler>();
  const setSettings = vi.fn(async (_partial: Partial<Settings>) => {});
  const getSettings = vi.fn(async (): Promise<Settings> => ({
    theme: 'system',
    telemetry: false,
    onboardingCompleted: false,
    activeProfileId,
  }));
  const subscribeSettings = (h: SettingsHandler): (() => void) => {
    handlers.add(h);
    return () => handlers.delete(h);
  };
  const fire = (next: Partial<Settings>): void => {
    const full: Settings = { theme: 'system', telemetry: false, onboardingCompleted: false, ...next };
    for (const h of handlers) h(full);
  };
  return { getSettings, setSettings, subscribeSettings, fire };
}

interface RenderOpts {
  profiles: InstructionProfile[];
  platform?: PlatformId;
  activeProfileId?: string;
  onInsert?: (t: string) => void;
}

async function renderChip(opts: RenderOpts) {
  const onInsert = vi.fn(opts.onInsert);
  const queryProfiles = makeQueryProfiles(opts.profiles);
  const settings = makeSettings(opts.activeProfileId);
  mount(
    <ProfileChip
      platform={opts.platform ?? 'claude'}
      onInsert={onInsert}
      queryProfiles={queryProfiles as never}
      getSettings={settings.getSettings}
      setSettings={settings.setSettings}
      subscribeSettings={settings.subscribeSettings}
    />,
  );
  // Flush the load effect + the settings-read effect (both async).
  for (let i = 0; i < 6; i++) await Promise.resolve();
  return { onInsert, queryProfiles, settings };
}

async function openMenu(): Promise<void> {
  $('[data-testid="sk-ib-profile"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Preact batches the open state update; flush the re-render before asserting.
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

const items = () => $$('[data-testid="sk-ib-profile-item"]');
const itemById = (id: string) =>
  items().find((el) => el.getAttribute('data-profile-id') === id) ?? null;

// --- 4.3 menu render -----------------------------------------------------------

describe('ProfileChip menu (4.3)', () => {
  it('opening the menu lists the profiles', async () => {
    await renderChip({ profiles: [profile({ id: 'a', name: 'Alpha' }), profile({ id: 'b', name: 'Beta' })] });
    expect($('[data-testid="sk-ib-profile-menu"]')).toBeNull();
    await openMenu();
    expect($('[data-testid="sk-ib-profile-menu"]')).toBeTruthy();
    expect(items()).toHaveLength(2);
    expect(itemById('a')!.textContent).toContain('Alpha');
    expect(itemById('b')!.textContent).toContain('Beta');
  });

  it('marks the active profile (aria-checked + active class) per the injected settings', async () => {
    await renderChip({
      profiles: [profile({ id: 'a', name: 'Alpha' }), profile({ id: 'b', name: 'Beta' })],
      activeProfileId: 'b',
    });
    await openMenu();
    const a = itemById('a')!;
    const b = itemById('b')!;
    expect(b.getAttribute('aria-checked')).toBe('true');
    expect(b.classList.contains('sk-ib-menu__item--active')).toBe(true);
    expect(a.getAttribute('aria-checked')).toBe('false');
    expect(a.classList.contains('sk-ib-menu__item--active')).toBe(false);
    // The chip name reflects the active profile.
    expect($('[data-testid="sk-ib-profile-name"]')!.textContent).toBe('Beta');
  });

  it('renders profiles whose appliesTo excludes the platform as disabled', async () => {
    await renderChip({
      platform: 'claude',
      profiles: [
        profile({ id: 'a', name: 'Here', appliesTo: ['claude'] }),
        profile({ id: 'b', name: 'Elsewhere', appliesTo: ['gemini'] }),
      ],
    });
    await openMenu();
    expect((itemById('a') as HTMLButtonElement).disabled).toBe(false);
    expect((itemById('b') as HTMLButtonElement).disabled).toBe(true);
    expect(itemById('b')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('reflects the persisted active profile when the menu is opened', async () => {
    // The chip read the active id from getSettings before any interaction.
    await renderChip({
      profiles: [profile({ id: 'x', name: 'Exes' })],
      activeProfileId: 'x',
    });
    await openMenu();
    expect(itemById('x')!.getAttribute('aria-checked')).toBe('true');
  });
});

// --- 4.4 activation ------------------------------------------------------------

describe('ProfileChip activation (4.4)', () => {
  it('clicking an applicable profile sets activeProfileId AND inserts composeProfileText', async () => {
    const p = profile({
      id: 'a',
      name: 'Staff',
      instructionText: 'Be a senior staff engineer.',
      appliesTo: ['claude'],
      responseStyle: { verbosity: 'brief', format: 'markdown' },
    });
    const { onInsert, settings } = await renderChip({ profiles: [p], platform: 'claude' });
    await openMenu();
    itemById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(settings.setSettings).toHaveBeenCalledWith({ activeProfileId: 'a' });
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(composeProfileText(p));
    // Sanity: the composed text carries both the instruction and the directive.
    expect(onInsert).toHaveBeenCalledWith('Be a senior staff engineer.\n\nRespond briefly, in Markdown.');
  });

  it('a profile with no responseStyle inserts only the instruction text', async () => {
    const p = profile({ id: 'a', name: 'Plain', instructionText: 'Just be terse.', appliesTo: ['claude'] });
    const { onInsert } = await renderChip({ profiles: [p] });
    await openMenu();
    itemById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onInsert).toHaveBeenCalledWith('Just be terse.');
  });

  it('a non-applicable (disabled) profile does NOT activate or insert when clicked', async () => {
    const p = profile({ id: 'b', name: 'Elsewhere', instructionText: 'No.', appliesTo: ['gemini'] });
    const { onInsert, settings } = await renderChip({ profiles: [p], platform: 'claude' });
    await openMenu();
    // The disabled button still receives a programmatic click; the handler must guard.
    itemById('b')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(settings.setSettings).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });
});

// --- 4.5 cross-tab + dangling id -----------------------------------------------

describe('ProfileChip cross-tab + dangling id (4.5)', () => {
  it('a live settings change re-marks the active item without a reload', async () => {
    const { settings } = await renderChip({
      profiles: [profile({ id: 'a', name: 'Alpha' }), profile({ id: 'b', name: 'Beta' })],
      activeProfileId: 'a',
    });
    await openMenu();
    expect(itemById('a')!.getAttribute('aria-checked')).toBe('true');
    expect(itemById('b')!.getAttribute('aria-checked')).toBe('false');

    // Another tab activates Beta — the subscription fires.
    settings.fire({ activeProfileId: 'b' });
    for (let i = 0; i < 4; i++) await Promise.resolve();

    expect(itemById('a')!.getAttribute('aria-checked')).toBe('false');
    expect(itemById('b')!.getAttribute('aria-checked')).toBe('true');
    expect($('[data-testid="sk-ib-profile-name"]')!.textContent).toBe('Beta');
  });

  it('a dangling active id renders as "no active profile" and never throws', async () => {
    // activeProfileId points at a profile that is not in the library.
    const { onInsert } = await renderChip({
      profiles: [profile({ id: 'a', name: 'Alpha' })],
      activeProfileId: 'ghost',
    });
    // Chip falls back to the default label, no active mark.
    expect($('[data-testid="sk-ib-profile-name"]')!.textContent).toBe(STR.profileChip);
    await openMenu();
    expect(items().some((el) => el.getAttribute('aria-checked') === 'true')).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
