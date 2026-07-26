// Runtime validation for an `AdapterConfig`. This is the trust
// boundary for remote configs: only data that fully validates is ever adopted,
// and anything else falls back to bundled (design D-A2/D-A3). Hand-written so the
// MV3 bundle takes on no schema-library dependency.

import {
  type AdapterConfig,
  type AdapterSelectors,
  type HistoryExpansion,
  type HistoryExpansionMode,
  type InsertMode,
  type PlatformId,
  type SubmitMode,
} from '../types';

export interface ValidationError {
  path: string;
  message: string;
}

const PLATFORM_IDS: readonly PlatformId[] = [
  'claude',
  'gemini',
  'perplexity',
  'grok',
  'deepseek',
  'chatgpt',
  'mistral',
];

const SELECTOR_KEYS: readonly (keyof AdapterSelectors)[] = [
  'conversationList',
  'conversationItem',
  'conversationTitle',
  'conversationIdAttr',
  'messageUser',
  'messageAssistant',
  'composer',
  'sendButton',
  'sidebarAnchor',
  'inputBarAnchor',
];

const INSERT_MODES: readonly InsertMode[] = ['execCommand', 'react-set', 'paste'];
const SUBMIT_MODES: readonly SubmitMode[] = ['click', 'enter'];
// `scroll` is the only IMPLEMENTED mode; `route` is reserved but unbuilt, so a
// config asking for it must be rejected rather than silently doing nothing.
const HISTORY_EXPANSION_MODES: readonly HistoryExpansionMode[] = ['scroll'];
const HISTORY_EXPANSION_TUNING: readonly (keyof HistoryExpansion)[] = [
  'settleMs',
  'stableRounds',
  'maxRounds',
  'maxMs',
];

// Permissive semver: major.minor.patch with an optional pre-release/build suffix.
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A `ValidationError[]` (the failure arm of {@link validateAdapterConfig}). */
export function isValidationErrors(
  result: AdapterConfig | ValidationError[],
): result is ValidationError[] {
  return Array.isArray(result);
}

/**
 * Validate an unknown value against the `AdapterConfig` schema. Returns the typed
 * config on success, or a non-empty list of `ValidationError`s on failure — never
 * throws, so the loader can treat a bad config as "fall back to bundled".
 */
export function validateAdapterConfig(raw: unknown): AdapterConfig | ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isRecord(raw)) {
    return [{ path: '', message: 'config must be an object' }];
  }

  if (!PLATFORM_IDS.includes(raw.platformId as PlatformId)) {
    errors.push({ path: 'platformId', message: `unknown platformId "${String(raw.platformId)}"` });
  }

  if (typeof raw.configVersion !== 'string' || !SEMVER.test(raw.configVersion)) {
    errors.push({ path: 'configVersion', message: 'configVersion must be a semver string' });
  }

  if (!Array.isArray(raw.hostMatch) || raw.hostMatch.length === 0) {
    errors.push({ path: 'hostMatch', message: 'hostMatch must be a non-empty array' });
  } else if (!raw.hostMatch.every((p) => typeof p === 'string' && p.length > 0)) {
    errors.push({ path: 'hostMatch', message: 'hostMatch entries must be non-empty strings' });
  }

  if (!isRecord(raw.selectors)) {
    errors.push({ path: 'selectors', message: 'selectors must be an object' });
  } else {
    for (const key of SELECTOR_KEYS) {
      const value = raw.selectors[key];
      if (typeof value !== 'string' || value.length === 0) {
        errors.push({ path: `selectors.${key}`, message: 'must be a non-empty string' });
      }
    }
    // Optional: an attribute name carrying the conversation title, when present,
    // must be a non-empty string.
    const titleAttr = raw.selectors.conversationTitleAttr;
    if (titleAttr !== undefined && (typeof titleAttr !== 'string' || titleAttr.length === 0)) {
      errors.push({
        path: 'selectors.conversationTitleAttr',
        message: 'must be a non-empty string when present',
      });
    }

    // Optional: a signed-in marker selector (design D2), when present, must be a
    // non-empty string. Its content rule (no text/aria-label/auth-URL) is enforced
    // separately by the selector guard test, not by schema validation.
    const authedMarker = raw.selectors.authedMarker;
    if (authedMarker !== undefined && (typeof authedMarker !== 'string' || authedMarker.length === 0)) {
      errors.push({
        path: 'selectors.authedMarker',
        message: 'must be a non-empty string when present',
      });
    }

    // Optional: a signed-out marker selector (design D2), same rule as authedMarker.
    const signedOutMarker = raw.selectors.signedOutMarker;
    if (
      signedOutMarker !== undefined &&
      (typeof signedOutMarker !== 'string' || signedOutMarker.length === 0)
    ) {
      errors.push({
        path: 'selectors.signedOutMarker',
        message: 'must be a non-empty string when present',
      });
    }

    // Optional: an id-normalization pattern applied to `conversationIdAttr` values,
    // when present, must be a non-empty string and a valid regex.
    const idPattern = raw.selectors.conversationIdPattern;
    if (idPattern !== undefined) {
      if (typeof idPattern !== 'string' || idPattern.length === 0) {
        errors.push({
          path: 'selectors.conversationIdPattern',
          message: 'must be a non-empty string when present',
        });
      } else {
        try {
          new RegExp(idPattern);
        } catch {
          errors.push({
            path: 'selectors.conversationIdPattern',
            message: 'must be a valid regular expression',
          });
        }
      }
    }

    // Optional: a URL pattern for active-conversation detection, when present, must
    // be a non-empty string and a valid regex.
    const urlPattern = raw.selectors.conversationUrlPattern;
    if (urlPattern !== undefined) {
      if (typeof urlPattern !== 'string' || urlPattern.length === 0) {
        errors.push({
          path: 'selectors.conversationUrlPattern',
          message: 'must be a non-empty string when present',
        });
      } else {
        try {
          new RegExp(urlPattern);
        } catch {
          errors.push({
            path: 'selectors.conversationUrlPattern',
            message: 'must be a valid regular expression',
          });
        }
      }
    }
  }

  if (!isRecord(raw.behaviors)) {
    errors.push({ path: 'behaviors', message: 'behaviors must be an object' });
  } else {
    if (!INSERT_MODES.includes(raw.behaviors.insertMode as InsertMode)) {
      errors.push({
        path: 'behaviors.insertMode',
        message: `must be one of ${INSERT_MODES.join(', ')}`,
      });
    }
    if (!SUBMIT_MODES.includes(raw.behaviors.submitMode as SubmitMode)) {
      errors.push({
        path: 'behaviors.submitMode',
        message: `must be one of ${SUBMIT_MODES.join(', ')}`,
      });
    }
    if (typeof raw.behaviors.supportsSystemPrompt !== 'boolean') {
      errors.push({ path: 'behaviors.supportsSystemPrompt', message: 'must be a boolean' });
    }
    // Optional flag: validate only when present so existing configs stay valid.
    if (
      raw.behaviors.listHiddenWhenCollapsed !== undefined &&
      typeof raw.behaviors.listHiddenWhenCollapsed !== 'boolean'
    ) {
      errors.push({ path: 'behaviors.listHiddenWhenCollapsed', message: 'must be a boolean' });
    }
    if (
      raw.behaviors.composerStealsFocus !== undefined &&
      typeof raw.behaviors.composerStealsFocus !== 'boolean'
    ) {
      errors.push({ path: 'behaviors.composerStealsFocus', message: 'must be a boolean' });
    }
    // Optional history-expansion block: absent means the platform sweeps nothing.
    // When present its `mode` must be an implemented member and every supplied
    // tuning field a positive number — a zero/negative settle or round cap would
    // turn the sweep into a busy loop or a no-op that still claims to have run.
    const expansion = raw.behaviors.historyExpansion;
    if (expansion !== undefined) {
      if (!isRecord(expansion)) {
        errors.push({ path: 'behaviors.historyExpansion', message: 'must be an object' });
      } else {
        if (!HISTORY_EXPANSION_MODES.includes(expansion.mode as HistoryExpansionMode)) {
          errors.push({
            path: 'behaviors.historyExpansion.mode',
            message: `must be one of ${HISTORY_EXPANSION_MODES.join(', ')}`,
          });
        }
        for (const key of HISTORY_EXPANSION_TUNING) {
          const value = expansion[key];
          if (value === undefined) continue;
          if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            errors.push({
              path: `behaviors.historyExpansion.${key}`,
              message: 'must be a positive number when present',
            });
          }
        }
      }
    }
  }

  return errors.length > 0 ? errors : (raw as unknown as AdapterConfig);
}
