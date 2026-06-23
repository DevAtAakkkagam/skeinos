// The closed event taxonomy + per-event property allowlist (design D-OBS-5, tasks
// 4.1/4.3). This is the heart of PII-by-construction: every event name is in a
// fixed enum, and every property is either a value from a fixed value-enum, a
// strict version/token string, or — for the SINGLE audited free-text field — the
// scrubbed `$exception` message. No code path may assign raw user text to any
// property. The worker-side validator (validator.ts) enforces all of this; a
// fake-transport test (tests/observability-allowlist.test.ts) turns the rules into
// a CI gate ([PRIV-1]).
//
// Diagnostics is the ONLY telemetry stream: crashes (`$exception`) and adapter
// health. The usage/analytics stream and its anonymous-DAU identity were removed.

import type { PlatformId } from '../../shared/types';

/** Every platform we may report (the full `PlatformId` set, value-enum'd). */
export const PLATFORMS: readonly PlatformId[] = [
  'claude',
  'gemini',
  'perplexity',
  'grok',
  'deepseek',
  'chatgpt',
  'mistral',
];

/**
 * The fixed adapter-anchor enum for `adapter_selfcheck_failed.anchorKey` (task
 * 6.5). These are exactly the selector *keys* of `AdapterSelectors` — never a CSS
 * selector string or any DOM content (adapter-resilience spec "Anchor identity is
 * an enum, not a selector").
 */
export const ANCHOR_KEYS = [
  'conversationList',
  'conversationItem',
  'conversationTitle',
  'conversationTitleAttr',
  'conversationIdAttr',
  'conversationUrlPattern',
  'messageUser',
  'messageAssistant',
  'composer',
  'sendButton',
  'sidebarAnchor',
  'inputBarAnchor',
  'unknown',
] as const;
export type AnchorKey = (typeof ANCHOR_KEYS)[number];

/** Why a fallback banner was shown (`adapter_fallback_shown.reason`). */
export const FALLBACK_REASONS = ['selfcheck_failed', 'config_missing', 'load_error'] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

/** Which runtime context a crash came from (`$exception` source). */
export const EXCEPTION_SOURCES = ['service_worker', 'content', 'ui'] as const;
export type ExceptionSource = (typeof EXCEPTION_SOURCES)[number];

// ---------------------------------------------------------------------------
// Property specs — how each property value is validated
// ---------------------------------------------------------------------------

/** A property is validated as exactly one of these kinds. */
export type PropSpec =
  /** String value ∈ a fixed value-enum. */
  | { kind: 'enum'; values: readonly string[] }
  /** Strict dotted version string (no spaces/content possible). */
  | { kind: 'version' }
  /** Single identifier-like token (e.g. an error constructor name). */
  | { kind: 'token' }
  /** The SOLE free-text field: the scrubbed, truncated `$exception` message. */
  | { kind: 'message' }
  /** An array of own-bundle stack-frame tokens (host-page frames already dropped). */
  | { kind: 'frames' }
  /**
   * PostHog Error Tracking's `$exception_list` — an array of exception entries each
   * with a `type` token, a scrubbed `value` message, and a `stacktrace.frames` array
   * of own-bundle-safe frame objects. The audit re-applies the message denylist and
   * the own-bundle frame rule inside the structure, so the content boundary holds.
   */
  | { kind: 'exception_list' };

/** A per-event property allowlist: property key → how to validate its value. */
export type EventProps = Record<string, PropSpec>;

/**
 * The closed event-name → property-allowlist map. An event name not present here
 * is rejected outright; a property key not present in its event's map is rejected.
 */
export const EVENT_ALLOWLIST = {
  // — Diagnostics (crashes + adapter health). The only telemetry stream. —
  adapter_selfcheck_failed: {
    platform: { kind: 'enum', values: PLATFORMS },
    configVer: { kind: 'version' },
    anchorKey: { kind: 'enum', values: ANCHOR_KEYS },
  },
  adapter_fallback_shown: {
    platform: { kind: 'enum', values: PLATFORMS },
    configVer: { kind: 'version' },
    reason: { kind: 'enum', values: FALLBACK_REASONS },
  },
  adapter_recovered: {
    platform: { kind: 'enum', values: PLATFORMS },
    configVer: { kind: 'version' },
  },
  $exception: {
    $exception_source: { kind: 'enum', values: EXCEPTION_SOURCES },
    // PostHog Error Tracking renders from `$exception_list`; `$exception_type` /
    // `$exception_message` are kept as the SDK-compatible top-level summary fields
    // (same scrubbed parts) so the events list shows a label too.
    $exception_type: { kind: 'token' },
    $exception_message: { kind: 'message' },
    $exception_list: { kind: 'exception_list' },
  },
} as const satisfies Record<string, EventProps>;

/** Every valid event name. */
export type EventName = keyof typeof EVENT_ALLOWLIST;

/** The full set of event names, for iteration in tests. */
export const EVENT_NAMES = Object.keys(EVENT_ALLOWLIST) as EventName[];

/**
 * The consent category an event is gated under. Diagnostics is the only stream, so
 * the type is single-member — kept as a named type so the buffer/egress code reads
 * clearly and a future second stream is a localized change.
 */
export type Category = 'diagnostics';

/** Which consent flag gates an event. Every event is diagnostics. */
export function categoryOf(_name: EventName): Category {
  return 'diagnostics';
}
