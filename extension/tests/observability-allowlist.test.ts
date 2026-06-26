// The allowlist CI gate (observability spec "Allowlist enforcement is covered by a
// fake-transport test", tasks 8.1 + 8.4). For every event type's representative
// payload, `auditEvent` must assert the six D-OBS-5 rules; a payload that breaks
// any rule must be rejected and, through `recordEvent`, must reach NO transport.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEvent } from '../src/core/observability/builder';
import { auditEvent, type BuiltEvent } from '../src/core/observability/validator';
import { EVENT_NAMES, type EventName } from '../src/core/observability/taxonomy';
import { ANON_DISTINCT_ID } from '../src/core/observability/identity';
import { recordEvent, __setTransport, __resetTransport } from '../src/core/observability/egress';
import type { TelemetryEmit } from '../src/core/observability/types';
import { SETTINGS_KEY } from '../src/core/settings';

// --- fake chrome.storage.local (consent on so recordEvent reaches the gate) ----
function makeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  return {
    store,
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys == null) return { ...store };
          const ks = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of ks) if (k in store) out[k] = store[k];
          return out;
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
}
const originalChrome = (globalThis as { chrome?: unknown }).chrome;
function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
afterEach(() => {
  setChrome(originalChrome);
  __resetTransport();
});

/** A representative VALID emission for each event name. */
const VALID_EMITS: Record<EventName, TelemetryEmit> = {
  adapter_selfcheck_failed: {
    name: 'adapter_selfcheck_failed',
    props: { platform: 'gemini', configVer: '1.0.1', anchorKey: 'composer' },
  },
  adapter_fallback_shown: {
    name: 'adapter_fallback_shown',
    props: { platform: 'gemini', configVer: '1.0.1', reason: 'selfcheck_failed' },
  },
  adapter_signed_out: {
    name: 'adapter_signed_out',
    props: { platform: 'gemini', configVer: '1.0.1' },
  },
  adapter_recovered: {
    name: 'adapter_recovered',
    props: { platform: 'gemini', configVer: '2.0' },
  },
  $exception: {
    name: '$exception',
    source: 'ui',
    error: { name: 'TypeError', message: 'boom', stack: '' },
  },
};

describe('Allowlist — conformant payloads pass (8.1)', () => {
  beforeEach(() => setChrome(makeChrome()));

  it('every event type builds a payload that satisfies all six rules', async () => {
    for (const name of EVENT_NAMES) {
      const built = await buildEvent(VALID_EMITS[name]);
      expect(auditEvent(built), `${name} should be conformant`).toEqual([]);
    }
  });

  it('rule 5: every event carries the anonymous distinct_id', async () => {
    for (const name of EVENT_NAMES) {
      const built = await buildEvent(VALID_EMITS[name]);
      expect(built.distinct_id, `${name} must carry the anonymous id`).toBe(ANON_DISTINCT_ID);
    }
  });
});

describe('Allowlist — violations are rejected (8.1/8.4)', () => {
  it('rule 1: an event name not in the enum is rejected', () => {
    const bad = { event: 'totally_made_up', properties: {} } as BuiltEvent;
    expect(auditEvent(bad).length).toBeGreaterThan(0);
  });

  it('rule 2: a property key not in the allowlist is rejected', () => {
    const bad: BuiltEvent = {
      event: 'adapter_recovered',
      properties: { platform: 'claude', configVer: '1.0', folderName: 'Taxes' },
      distinct_id: ANON_DISTINCT_ID,
    };
    expect(auditEvent(bad).length).toBeGreaterThan(0);
  });

  it('rule 3: a categorical value outside its value-enum is rejected', () => {
    const bad: BuiltEvent = {
      event: 'adapter_recovered',
      properties: { platform: 'myspace', configVer: '1.0' },
      distinct_id: ANON_DISTINCT_ID,
    };
    expect(auditEvent(bad).length).toBeGreaterThan(0);
  });

  it('rule 5: an event missing distinct_id is rejected (PostHog requires one)', () => {
    const bad: BuiltEvent = {
      event: 'adapter_recovered',
      properties: { platform: 'claude', configVer: '1.0' },
    };
    expect(auditEvent(bad)).toContain('adapter_recovered: event must use the anonymous distinct_id');
  });

  it('rule 5: an event carrying a non-anonymous distinct_id is rejected', () => {
    const bad: BuiltEvent = {
      event: 'adapter_recovered',
      properties: { platform: 'claude', configVer: '1.0' },
      distinct_id: 'a1b2c3-identifying-id',
    };
    expect(auditEvent(bad)).toContain('adapter_recovered: event must use the anonymous distinct_id');
  });

  it('$exception_list: the built structure is conformant (type/value/frames)', async () => {
    const built = await buildEvent({
      name: '$exception',
      source: 'service_worker',
      error: {
        name: 'TypeError',
        message: 'boom',
        stack: 'at x (chrome-extension://abc/background.js:10:5)',
      },
    });
    expect(auditEvent(built)).toEqual([]);
    const list = (built.properties.$exception_list as unknown[])[0] as Record<string, unknown>;
    expect(list.type).toBe('TypeError');
    expect((list.stacktrace as { frames: unknown[] }).frames[0]).toMatchObject({
      filename: 'background.js',
      lineno: 10,
      colno: 5,
    });
  });

  it('$exception_list: a denylisted message inside an entry is rejected', () => {
    const bad: BuiltEvent = {
      event: '$exception',
      properties: {
        $exception_source: 'ui',
        $exception_type: 'Error',
        $exception_message: 'ok',
        $exception_list: [{ type: 'Error', value: 'token eyJhbGciOiJIUzI1Niwill-leak' }],
      },
      distinct_id: ANON_DISTINCT_ID,
    };
    expect(auditEvent(bad).length).toBeGreaterThan(0);
  });

  it('$exception_list: a frame whose filename is a host URL is rejected', () => {
    const bad: BuiltEvent = {
      event: '$exception',
      properties: {
        $exception_source: 'content',
        $exception_type: 'Error',
        $exception_message: 'ok',
        $exception_list: [
          {
            type: 'Error',
            value: 'ok',
            stacktrace: { type: 'raw', frames: [{ filename: 'https://claude.ai/chat/secret' }] },
          },
        ],
      },
      distinct_id: ANON_DISTINCT_ID,
    };
    expect(auditEvent(bad)).toContain('$exception_list: frame.filename is not own-bundle-safe');
  });
});

describe('Negative path — invalid events reach no transport (8.4)', () => {
  beforeEach(() => setChrome(makeChrome({ [SETTINGS_KEY]: { diagnosticsOptIn: true } })));

  it('a disallowed event name is dropped and nothing is sent', async () => {
    const transport = vi.fn(async () => true);
    __setTransport(transport);
    // A name outside the enum: cast through to bypass the compile-time guard.
    const res = await recordEvent({ name: 'made_up' } as unknown as TelemetryEmit);
    expect(res.accepted).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('a disallowed property value is dropped and nothing is sent', async () => {
    const transport = vi.fn(async () => true);
    __setTransport(transport);
    const res = await recordEvent({
      name: 'adapter_recovered',
      props: { platform: 'aol', configVer: '1.0' },
    } as TelemetryEmit);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('invalid');
    expect(transport).not.toHaveBeenCalled();
  });
});
