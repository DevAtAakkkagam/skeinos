// The worker-side allowlist validator (design D-OBS-5, tasks 4.5 + 8.1). Every
// built event passes through `auditEvent` before it is buffered/sent; any event
// that violates a rule is dropped and nothing is sent. The same `auditEvent`
// powers the fake-transport CI gate, so the rules are enforced identically in
// production and test.
//
// The rules (D-OBS-5):
//   1. event name ∈ the closed enum
//   2. every property key ∈ that event's allowlist
//   3. every string value is valid for its property's kind (enum/version/token/
//      message/frames) — i.e. no free user text except the scrubbed message
//   4. the `$exception` message passes the sensitive-substring denylist
//   5. `distinct_id` is exactly the fixed anonymous constant (no per-user identity)

import { EVENT_ALLOWLIST, type EventName, type PropSpec } from './taxonomy';
import { DENYLIST, MAX_MESSAGE_LEN } from './scrubber';
import { ANON_DISTINCT_ID } from './identity';

/** The canonical built-event shape the validator audits (== the wire payload). */
export interface BuiltEvent {
  event: string;
  properties: Record<string, unknown>;
  distinct_id?: string;
  /** PostHog top-level event timestamp (ISO-8601). Not audited — never a property. */
  timestamp?: string;
}

const VERSION_RE = /^\d+(?:\.\d+)*$/;
const TOKEN_RE = /^[\w.$]+$/;

/** Validate one property value against its spec; return a violation or `null`. */
function checkValue(key: string, spec: PropSpec, value: unknown): string | null {
  switch (spec.kind) {
    case 'enum':
      if (typeof value !== 'string') return `${key}: expected string enum, got ${typeof value}`;
      return spec.values.includes(value) ? null : `${key}: "${value}" not in value-enum`;
    case 'version':
      return typeof value === 'string' && VERSION_RE.test(value)
        ? null
        : `${key}: not a valid version string`;
    case 'token':
      return typeof value === 'string' && TOKEN_RE.test(value)
        ? null
        : `${key}: not a valid identifier token`;
    case 'message': {
      if (typeof value !== 'string') return `${key}: message must be a string`;
      if (value.length > MAX_MESSAGE_LEN + 1) return `${key}: message exceeds max length`;
      for (const pattern of DENYLIST) {
        // Use a fresh, non-global test so lastIndex never carries between calls.
        if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(value)) {
          return `${key}: message contains a denylisted substring`;
        }
      }
      return null;
    }
    case 'frames': {
      if (!Array.isArray(value)) return `${key}: frames must be an array`;
      for (const frame of value) {
        if (typeof frame !== 'string') return `${key}: a frame is not a string`;
        // A safe frame is a bundle-relative `file:line:col` token — never a URL.
        if (/:\/\//.test(frame) || frame.length > 200) return `${key}: frame is not own-bundle-safe`;
      }
      return null;
    }
    case 'exception_list':
      return checkExceptionList(key, value);
  }
}

/**
 * Validate PostHog's `$exception_list` structure, re-applying the content boundary
 * INSIDE it: each entry's `type` is a token, its `value` passes the message
 * denylist+length rule, and every stack frame's filename is own-bundle-safe (never
 * a URL). Returns the first violation or `null`.
 */
function checkExceptionList(key: string, value: unknown): string | null {
  if (!Array.isArray(value)) return `${key}: must be an array`;
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return `${key}: entry is not an object`;
    const e = entry as Record<string, unknown>;
    const typeBad = checkValue(`${key}.type`, { kind: 'token' }, e.type);
    if (typeBad) return typeBad;
    const valueBad = checkValue(`${key}.value`, { kind: 'message' }, e.value);
    if (valueBad) return valueBad;
    const stack = e.stacktrace;
    if (stack === undefined) continue;
    if (typeof stack !== 'object' || stack === null) return `${key}: stacktrace is not an object`;
    const frames = (stack as { frames?: unknown }).frames;
    if (frames === undefined) continue;
    if (!Array.isArray(frames)) return `${key}: stacktrace.frames must be an array`;
    for (const frame of frames) {
      if (typeof frame !== 'object' || frame === null) return `${key}: a frame is not an object`;
      const fr = frame as Record<string, unknown>;
      if (typeof fr.filename !== 'string') return `${key}: frame.filename must be a string`;
      // The frame filename is the content boundary — never a host URL.
      if (/:\/\//.test(fr.filename) || fr.filename.length > 200) {
        return `${key}: frame.filename is not own-bundle-safe`;
      }
      if (fr.lineno !== undefined && typeof fr.lineno !== 'number') return `${key}: frame.lineno must be a number`;
      if (fr.colno !== undefined && typeof fr.colno !== 'number') return `${key}: frame.colno must be a number`;
    }
  }
  return null;
}

/**
 * Audit a built event against the allowlist. Returns the list of rule violations
 * (empty == conformant). Never throws.
 */
export function auditEvent(event: BuiltEvent): string[] {
  const violations: string[] = [];

  // Rule 1: event name ∈ enum.
  if (!(event.event in EVENT_ALLOWLIST)) {
    return [`event name "${event.event}" is not in the taxonomy`];
  }
  const name = event.event as EventName;
  const allow = EVENT_ALLOWLIST[name] as Record<string, PropSpec>;
  const props = event.properties ?? {};

  // Rules 2/3/6: every property key is allowed and its value is valid for its kind.
  for (const [key, value] of Object.entries(props)) {
    const spec = allow[key];
    if (!spec) {
      violations.push(`property "${key}" is not allowlisted for ${name}`);
      continue;
    }
    const bad = checkValue(key, spec, value);
    if (bad) violations.push(bad);
  }

  // Rule 5: every event carries the fixed anonymous distinct_id. PostHog ingest
  // requires *some* id; diagnostics carry no per-user identity, so it must be exactly
  // the non-identifying constant — never anything that could identify a device
  // (D-OBS-6).
  if (event.distinct_id !== ANON_DISTINCT_ID) {
    violations.push(`${name}: event must use the anonymous distinct_id`);
  }

  return violations;
}

/** True when a built event satisfies every allowlist rule. */
export function isValidEvent(event: BuiltEvent): boolean {
  return auditEvent(event).length === 0;
}
