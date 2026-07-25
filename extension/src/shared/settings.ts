// The typed settings schema + privacy-first defaults (D4, §6.11).
//
// Settings live in `chrome.storage.local` (decision D4), NOT IndexedDB — they
// are tiny, must be readable before the workspace DB opens, and are decoupled
// from the store so the options page ships independently. This module holds only
// the shape and defaults; the accessors live in `core/settings`.

import type { DomainId } from './domains';

/** Theme preference. Structurally identical to ui/mount's `Theme`. */
export type Theme = 'light' | 'dark' | 'system';

/**
 * The monetization tier (tier-gate). `PRO` is the current default (every quota
 * lifted) while billing is unbuilt and Pro is not yet purchasable (M5) — gating
 * users on FREE with no upgrade path is the wrong launch state. Flip the default
 * back to `FREE` when billing + server-side entitlement land. Defined here (not in
 * `core/tier`) so the type is dependency-free and importable by both the worker's
 * limit table and the UI without crossing the deps-inward boundary.
 */
export type Tier = 'FREE' | 'PRO';

export interface Settings {
  /** UI theme. Drives the `--sk-*` token set via the host `data-theme` attr. */
  theme: Theme;
  /**
   * First-run gate (onboarding-foundation). Additive optional key: a settings
   * object written before it existed reads back `false` via the defaults merge,
   * which is exactly the "not yet onboarded" first-run state.
   */
  onboardingCompleted: boolean;
  /**
   * First-run welcome page (install-welcome). Additive optional key — a settings
   * object written before it existed reads back `false` via the defaults merge.
   * Set to `true` by the worker the first time it opens `welcome.html` on install,
   * so an unpacked dev reload (which also fires `onInstalled` with reason
   * `install`) never reopens the tab. Independent of {@link onboardingCompleted}:
   * the welcome page is a browser-orientation signpost, NOT the onboarding gate.
   */
  welcomeShown?: boolean;
  /**
   * The user's chosen professional domain, picked during onboarding. Additive
   * optional key — absent (undefined) until the user picks one. Stays the stable
   * filter axis for the prompt library (shared/domains).
   */
  domain?: DomainId;
  /**
   * The globally active instruction profile (profile-activation, D-1). Additive
   * optional key — absent (undefined) means no active profile. Device-local by
   * intent: it is a UI preference (which profile the input bar's chip shows and
   * injects), NOT workspace data, so it lives in settings and is never part of the
   * synced set. The chip reads it via `getSettings`, writes via `setSettings`, and
   * re-renders across tabs via `subscribeSettings`. A dangling id (the profile was
   * deleted) is treated by readers as "no active profile" — never an error.
   */
  activeProfileId?: string;
  /**
   * The monetization tier (tier-gate). Additive optional key — a settings object
   * written before it existed reads back the default (`PRO`) via the defaults
   * merge. Device-local until billing/sync ships (M5): tier is read by the worker
   * for quota enforcement and by the sidebar badge, both via the single source
   * here. `PRO` lifts every per-resource limit; `FREE` enforces the caps.
   */
  tier?: Tier;
  // Later features extend this: per-platform toggles (adapters), shortcuts
  // (T3.7), sync controls (T5.5). Missing keys fall back to DEFAULT_SETTINGS on
  // read, so adding a key never invalidates an existing install.
}

/**
 * Privacy-first defaults. There is no telemetry key to default off: Skeinos
 * collects nothing at all (remove-observability, supersedes D29), so the absence
 * of the setting IS the commitment — asserted by tests.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  onboardingCompleted: false,
  // PRO is the default while Pro is not yet purchasable (M5): unlock everything
  // rather than block users on FREE with no checkout. Revert to 'FREE' when
  // billing + server-side entitlement ship. See the `Tier` doc above.
  tier: 'PRO',
  // `domain` is intentionally absent — it defaults to undefined until the user
  // picks one, and stays optional so the merge never forces a value.
};

/** The single `chrome.storage.local` key the settings object is stored under. */
export const SETTINGS_KEY = 'skeinos.settings';
