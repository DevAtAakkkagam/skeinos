// The typed settings schema + privacy-first defaults (D4, PRD §8.3/§6.11).
//
// Settings live in `chrome.storage.local` (decision D4), NOT IndexedDB — they
// are tiny, must be readable before the workspace DB opens, and are decoupled
// from the store so the options page ships independently. This module holds only
// the shape and defaults; the accessors live in `core/settings`.

import type { DomainId } from './domains';

/** Theme preference. Structurally identical to ui/mount's `Theme`. */
export type Theme = 'light' | 'dark' | 'system';

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
  // `domain` is intentionally absent — it defaults to undefined until the user
  // picks one, and stays optional so the merge never forces a value.
};

/** The single `chrome.storage.local` key the settings object is stored under. */
export const SETTINGS_KEY = 'skeinos.settings';
