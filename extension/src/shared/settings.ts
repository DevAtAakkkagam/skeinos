// The typed settings schema + privacy-first defaults (D4, PRD §8.3/§6.11).
//
// Settings live in `chrome.storage.local` (decision D4), NOT IndexedDB — they
// are tiny, must be readable before the workspace DB opens, and are decoupled
// from the store so the options page ships independently. This module holds only
// the shape and defaults; the accessors live in `core/settings`.

import type { DomainId } from './domains';

/** Theme preference. Structurally identical to ui/mount's `Theme`. */
export type Theme = 'light' | 'dark' | 'system';

/**
 * The monetization tier (tier-gate). `FREE` is the default and the fallback for
 * any settings record that predates the field; `PRO` lifts every quota. Defined
 * here (not in `core/tier`) so the type is dependency-free and importable by both
 * the worker's limit table and the UI without crossing the deps-inward boundary.
 */
export type Tier = 'FREE' | 'PRO';

export interface Settings {
  /** UI theme. Drives the `--sk-*` token set via the host `data-theme` attr. */
  theme: Theme;
  /** Usage telemetry opt-in. Off by default — a product commitment (PRD §8.3). */
  telemetry: boolean;
  /**
   * First-run gate (onboarding-foundation). Additive optional key: a settings
   * object written before it existed reads back `false` via the defaults merge,
   * which is exactly the "not yet onboarded" first-run state.
   */
  onboardingCompleted: boolean;
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
   * written before it existed reads back `FREE` via the defaults merge, which is
   * exactly the free-tier state. Device-local until billing/sync ships (M5): tier
   * is read by the worker for quota enforcement and by the sidebar badge, both via
   * the single source here. A `PRO` value lifts every per-resource limit.
   */
  tier?: Tier;
  // Later features extend this: per-platform toggles (adapters), shortcuts
  // (T3.7), sync controls (T5.5). Missing keys fall back to DEFAULT_SETTINGS on
  // read, so adding a key never invalidates an existing install.
}

/**
 * Privacy-first defaults. These are not incidental — telemetry-off and
 * theme-system are baked-in product commitments and are asserted by tests.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  telemetry: false,
  onboardingCompleted: false,
  // The free tier is the privacy-first, no-cost default; the merge fills it for
  // every record that predates the field, so quotas are enforced from day one.
  tier: 'FREE',
  // `domain` is intentionally absent — it defaults to undefined until the user
  // picks one, and stays optional so the merge never forces a value.
};

/** The single `chrome.storage.local` key the settings object is stored under. */
export const SETTINGS_KEY = 'skeinos.settings';
