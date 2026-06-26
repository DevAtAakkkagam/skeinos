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
import { t } from '../src/core/i18n';
import type { InstructionProfile, PlatformId } from '../src/shared/types';
import type { ProfileSnapshot } from '../src/shared/profiles';
import type { Settings, SettingsHandler } from '../src/core/settings';
import type { BroadcastHandler } from '../src/core/messaging';
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

// Settings seams: getSettings resolves the current snapshot; subscribeSettings captures
// the handler. setSettings PERSISTS and notifies subscribers — mirroring production,
// where a write to chrome.storage.local fires the storage subscription that re-marks
// the chip (so activating a profile updates `activeId` without a manual `fire`).
function makeSettings(activeProfileId?: string) {
  const handlers = new Set<SettingsHandler>();
  let current: Settings = {
    theme: 'system',
    telemetry: false,
    diagnosticsOptIn: true,
    onboardingCompleted: false,
    activeProfileId,
  };
  const setSettings = vi.fn(async (partial: Partial<Settings>) => {
    current = { ...current, ...partial };
    for (const h of handlers) h(current);
  });
  const getSettings = vi.fn(async (): Promise<Settings> => current);
  const subscribeSettings = (h: SettingsHandler): (() => void) => {
    handlers.add(h);
    return () => handlers.delete(h);
  };
  const fire = (next: Partial<Settings>): void => {
    current = { ...current, ...next };
    for (const h of handlers) h(current);
  };
  return { getSettings, setSettings, subscribeSettings, fire };
}

// Broadcast seam: captures the handler so a test can fire a `state.changed` to drive
// the library refresh, mirroring how the worker fans mutations to open views.
function makeBroadcast() {
  const handlers = new Set<BroadcastHandler>();
  const subscribeBroadcast = (h: BroadcastHandler): (() => void) => {
    handlers.add(h);
    return () => handlers.delete(h);
  };
  const fire = (): void => {
    for (const h of handlers) h({ kind: 'state.changed', stores: ['profiles'] });
  };
  return { subscribeBroadcast, fire };
}

interface RenderOpts {
  profiles: InstructionProfile[];
  platform?: PlatformId;
  activeProfileId?: string;
}

async function renderChip(opts: RenderOpts) {
  const onActiveProfileChange = vi.fn<(t: string | null) => void>();
  const queryProfiles = makeQueryProfiles(opts.profiles);
  const settings = makeSettings(opts.activeProfileId);
  const broadcast = makeBroadcast();
  mount(
    <ProfileChip
      platform={opts.platform ?? 'claude'}
      onActiveProfileChange={onActiveProfileChange}
      queryProfiles={queryProfiles as never}
      getSettings={settings.getSettings}
      setSettings={settings.setSettings}
      subscribeSettings={settings.subscribeSettings}
      subscribeBroadcast={broadcast.subscribeBroadcast}
    />,
  );
  // Flush the load effect + the settings-read effect (both async).
  for (let i = 0; i < 6; i++) await Promise.resolve();
  return { onActiveProfileChange, queryProfiles, settings, broadcast };
}

async function openMenu(): Promise<void> {
  $('[data-testid="sk-ib-profile"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Preact batches the open state update; flush the re-render before asserting.
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

// Click a menu item and flush the activation round-trip: setSettings persists and
// notifies the subscription, which re-marks the chip and re-runs the effect that
// reports the active profile's composed text up. Flush microtasks and a macrotask so
// Preact's effect callback has fired.
async function selectItem(el: HTMLElement): Promise<void> {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 4; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
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

  it('refreshes the library on a state.changed broadcast (profile created elsewhere)', async () => {
    // Start with an empty library: the picker shows the empty state.
    const profiles: InstructionProfile[] = [];
    const { broadcast } = await renderChip({ profiles });
    await openMenu();
    expect($('[data-testid="sk-ib-profile-empty"]')).toBeTruthy();
    expect(items()).toHaveLength(0);

    // A profile is created in the Profiles tab — the worker fans `state.changed`.
    profiles.push(profile({ id: 'new', name: 'Fresh' }));
    broadcast.fire();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // The picker re-queried and now lists the new profile (no more empty state).
    expect($('[data-testid="sk-ib-profile-empty"]')).toBeNull();
    expect(items()).toHaveLength(1);
    expect(itemById('new')!.textContent).toContain('Fresh');
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
  it('clicking an applicable profile sets activeProfileId AND reports its composed text', async () => {
    const p = profile({
      id: 'a',
      name: 'Staff',
      instructionText: 'Be a senior staff engineer.',
      appliesTo: ['claude'],
      responseStyle: { verbosity: 'brief', format: 'markdown' },
    });
    const { onActiveProfileChange, settings } = await renderChip({ profiles: [p], platform: 'claude' });
    await openMenu();
    await selectItem(itemById('a')!);

    // Selection only activates; it does NOT inject on its own.
    expect(settings.setSettings).toHaveBeenCalledWith({ activeProfileId: 'a' });
    // The active profile's composed text is reported up so the bar can prepend it on
    // the next prompt insert.
    expect(onActiveProfileChange).toHaveBeenLastCalledWith(composeProfileText(p));
    // Sanity: the composed text carries both the instruction and the directive.
    expect(onActiveProfileChange).toHaveBeenLastCalledWith(
      'Be a senior staff engineer.\n\nRespond briefly, in Markdown.',
    );
  });

  it('a profile with no responseStyle reports only the instruction text', async () => {
    const p = profile({ id: 'a', name: 'Plain', instructionText: 'Just be terse.', appliesTo: ['claude'] });
    const { onActiveProfileChange } = await renderChip({ profiles: [p] });
    await openMenu();
    await selectItem(itemById('a')!);
    expect(onActiveProfileChange).toHaveBeenLastCalledWith('Just be terse.');
  });

  it('a non-applicable (disabled) profile does NOT activate when clicked', async () => {
    const p = profile({ id: 'b', name: 'Elsewhere', instructionText: 'No.', appliesTo: ['gemini'] });
    const { onActiveProfileChange, settings } = await renderChip({ profiles: [p], platform: 'claude' });
    await openMenu();
    // The disabled button still receives a programmatic click; the handler must guard.
    await selectItem(itemById('b')!);
    expect(settings.setSettings).not.toHaveBeenCalled();
    // Never reports the non-applicable profile's text — it stays "no active profile".
    expect(onActiveProfileChange).not.toHaveBeenCalledWith(composeProfileText(p));
  });

  it('activating an applicable profile, then deactivating, reports null', async () => {
    const p = profile({ id: 'a', name: 'Staff', instructionText: 'Be terse.', appliesTo: ['claude'] });
    const { onActiveProfileChange, settings } = await renderChip({ profiles: [p], platform: 'claude' });
    await openMenu();
    await selectItem(itemById('a')!);
    expect(onActiveProfileChange).toHaveBeenLastCalledWith('Be terse.');

    // The profile is cleared elsewhere — the bar must stop prepending it.
    settings.fire({ activeProfileId: undefined });
    await vi.waitFor(() => expect(onActiveProfileChange).toHaveBeenLastCalledWith(null));
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
    const { onActiveProfileChange } = await renderChip({
      profiles: [profile({ id: 'a', name: 'Alpha' })],
      activeProfileId: 'ghost',
    });
    // Chip falls back to the default label, no active mark.
    expect($('[data-testid="sk-ib-profile-name"]')!.textContent).toBe(t('inputBar.profileChip'));
    await openMenu();
    expect(items().some((el) => el.getAttribute('aria-checked') === 'true')).toBe(false);
    // A dangling id reports as "no active profile" — never a composed string.
    expect(onActiveProfileChange).not.toHaveBeenCalledWith(expect.any(String));
  });
});
