// The Profile chip (profile-activation, design D-2/D-3/D-4). Replaces the input
// bar's old disabled Profile stub with a functional control: a button showing the
// active profile's name that opens a menu of saved instruction profiles. Selecting a
// profile that applies to the current platform sets it as the global active profile
// (`Settings.activeProfileId`). Selection only ACTIVATES — the chip no longer injects
// on its own; it reports the active profile's composed text up via
// `onActiveProfileChange`, and the bar prepends it on the next prompt insert into an
// empty composer (profile-prepend, PREPEND-only, never auto-submit — D-5).
//
// Like the rest of the bar it is a pure view over injectable seams: profile reads go
// through `queryProfiles` (the worker client by default), and the active selection is
// read/written/subscribed through the settings accessors — all defaulted to the live
// implementations and overridable in tests. A `activeProfileId` pointing at a deleted
// profile is treated as "no active profile" (defensive) and never throws.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { InstructionProfile, PlatformId } from '../../shared/types';
import type { ProfileSelector, ProfileSnapshot } from '../../shared/profiles';
import type { Response } from '../../shared/messages';
import {
  getSettings as getSettingsLive,
  setSettings as setSettingsLive,
  subscribeSettings as subscribeSettingsLive,
  type Settings,
  type SettingsHandler,
} from '../../core/settings';
import { queryProfilesRemote } from '../../core/profiles';
import { subscribe as subscribeBroadcastLive, type BroadcastHandler } from '../../core/messaging';
import { useFloating } from '../primitives/useFloating';
import { composeProfileText } from '../profiles/compose';
import { useShadowDismiss } from './hooks';
import { useT } from '../../core/i18n';

type QueryProfilesFn = (selector: ProfileSelector) => Promise<Response<ProfileSnapshot>>;
type LoadStatus = 'loading' | 'ready' | 'error';

export interface ProfileChipProps {
  /** The current platform — resolves each profile's `appliesTo` gating. */
  platform: PlatformId;
  /** Report the active profile's composed text (or null when none applies here) to
   *  the bar, which prepends it on the next prompt insert. Selecting a profile only
   *  ACTIVATES it — the chip no longer injects on its own (profile-prepend). */
  onActiveProfileChange?: (text: string | null) => void;
  /** Library reads. Injectable for tests; production uses the live worker client. */
  queryProfiles?: QueryProfilesFn;
  /** Settings read. Injectable for tests; production reads `chrome.storage.local`. */
  getSettings?: () => Promise<Settings>;
  /** Settings write. Injectable for tests; production writes `chrome.storage.local`. */
  setSettings?: (partial: Partial<Settings>) => Promise<void>;
  /** Live settings subscription. Injectable for tests; drives cross-tab updates. */
  subscribeSettings?: (handler: SettingsHandler) => () => void;
  /** Worker broadcast subscription. Injectable for tests; drives library refresh
   *  when a profile is created/deleted elsewhere (the Profiles tab, another tab). */
  subscribeBroadcast?: (handler: BroadcastHandler) => () => void;
}

export function ProfileChip({
  platform,
  onActiveProfileChange,
  queryProfiles = queryProfilesRemote,
  getSettings = getSettingsLive,
  setSettings = setSettingsLive,
  subscribeSettings = subscribeSettingsLive,
  subscribeBroadcast = subscribeBroadcastLive,
}: ProfileChipProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<InstructionProfile[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Load the profile library. Re-run on retry (the error state's button). Survives a
  // failed/empty read: status drives the menu's loading/error/empty branches.
  const load = useCallback(async (): Promise<void> => {
    setStatus('loading');
    try {
      const res = await queryProfiles({ kind: 'profile.library' });
      if (res.ok && res.data.kind === 'profile.library') {
        setProfiles(res.data.profiles);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [queryProfiles]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read the library whenever the worker fans `state.changed` (a profile created or
  // deleted in the Profiles tab or another tab). Without this the picker keeps the
  // stale mount-time snapshot and shows "No profiles yet" after a profile is added.
  useEffect(() => {
    const dispose = subscribeBroadcast((msg) => {
      if (msg.kind === 'state.changed') void load();
    });
    return dispose;
  }, [subscribeBroadcast, load]);

  // Read the active id once, then track it live so a change in another tab (or the
  // options page) re-marks the chip without a reload (D-1, the settings subscription).
  useEffect(() => {
    let alive = true;
    void getSettings().then((s) => {
      if (alive) setActiveId(s.activeProfileId);
    });
    const dispose = subscribeSettings((s) => setActiveId(s.activeProfileId));
    return () => {
      alive = false;
      dispose();
    };
  }, [getSettings, subscribeSettings]);

  // The active profile, resolved defensively: a missing/dangling id reads as "none".
  const active = activeId ? profiles.find((p) => p.id === activeId) : undefined;
  const activeApplies = active ? active.appliesTo.includes(platform) : false;

  // Report the active profile's composed text up to the bar so it can prepend it on
  // the next prompt insert. Null unless a profile is active AND applies here — an
  // active profile that doesn't apply to this platform never rides an insert. The
  // string identity is stable across renders when unchanged, so this fires only on a
  // real activation/deactivation, not every render.
  const activeText = active && activeApplies ? composeProfileText(active) : null;
  useEffect(() => {
    onActiveProfileChange?.(activeText);
  }, [activeText, onActiveProfileChange]);

  const floating = useFloating({ placement: 'top-start', open });
  // Combined ref for the floating panel: keeps `panelRef` (for outside-click hit
  // testing) AND wires the element into `useFloating`. MUST depend only on the STABLE
  // `setFloating` (not the whole `floating` object, which is a fresh identity each
  // render): a callback that changes every render makes Preact re-run the ref every
  // render → `setFloating` → `computePosition` → `setState` → re-render, an unbounded
  // loop that freezes the tab. `setFloating` is memoized in the hook, so this is stable.
  const { setFloating } = floating;
  const setPanel = useCallback(
    (el: HTMLDivElement | null) => {
      panelRef.current = el;
      setFloating(el);
    },
    [setFloating],
  );
  useShadowDismiss(panelRef, () => setOpen(false));

  const handleSelect = (p: InstructionProfile): void => {
    // Non-applicable profiles are rendered disabled and cannot activate here (D-3);
    // guard anyway so a stray call never activates on the wrong platform. Selection
    // only ACTIVATES — the composed text rides the next prompt insert (profile-prepend),
    // reported up via the `activeText` effect above once the settings change lands.
    if (!p.appliesTo.includes(platform)) return;
    void setSettings({ activeProfileId: p.id });
    setOpen(false);
  };

  // The chip's accessible name reflects the active profile when one is set.
  const chipLabel = active ? t('inputBar.profileActiveLabel', { name: active.name }) : t('inputBar.profileChipLabel');

  return (
    <>
      <button
        type="button"
        class={`sk-ib-chip${active && !activeApplies ? ' sk-ib-chip--inactive' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={chipLabel}
        title={active && !activeApplies ? t('inputBar.profileInactiveHere') : chipLabel}
        data-testid="sk-ib-profile"
        ref={floating.setReference}
        onClick={() => setOpen((v) => !v)}
      >
        <span class="sk-ib-chip__name" data-testid="sk-ib-profile-name">
          {active ? active.name : t('inputBar.profileChip')}
        </span>
      </button>

      {open ? (
        <div
          ref={setPanel}
          class="sk-ib-menu"
          style={floating.floatingStyles}
          role="menu"
          aria-label={t('inputBar.profileMenuLabel')}
          data-testid="sk-ib-profile-menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          {status === 'loading' ? (
            <p class="sk-ib-menu__status" data-testid="sk-ib-profile-loading">
              {t('inputBar.profileMenuLoading')}
            </p>
          ) : status === 'error' ? (
            <div class="sk-ib-menu__status" data-testid="sk-ib-profile-error" role="alert">
              <span>{t('inputBar.profileMenuError')}</span>
              <button
                type="button"
                class="sk-ib-menu__retry"
                data-testid="sk-ib-profile-retry"
                onClick={() => void load()}
              >
                {t('inputBar.profileMenuRetry')}
              </button>
            </div>
          ) : profiles.length === 0 ? (
            <p class="sk-ib-menu__status" data-testid="sk-ib-profile-empty">
              {t('inputBar.profileMenuEmpty')}
            </p>
          ) : (
            <ul class="sk-ib-menu__list" role="none">
              {profiles.map((p) => {
                const applies = p.appliesTo.includes(platform);
                const isActive = p.id === active?.id;
                return (
                  <li key={p.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      disabled={!applies}
                      aria-disabled={!applies}
                      class={`sk-ib-menu__item${isActive ? ' sk-ib-menu__item--active' : ''}`}
                      data-testid="sk-ib-profile-item"
                      data-profile-id={p.id}
                      title={applies ? undefined : t('inputBar.profileNotApplicable')}
                      onClick={() => handleSelect(p)}
                    >
                      <span class="sk-ib-menu__mark" aria-hidden="true">
                        {isActive ? t('inputBar.profileActiveMark') : ''}
                      </span>
                      <span class="sk-ib-menu__name">{p.name || t('inputBar.profileChip')}</span>
                      {!applies ? (
                        <span class="sk-ib-menu__note">{t('inputBar.profileNotApplicable')}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
