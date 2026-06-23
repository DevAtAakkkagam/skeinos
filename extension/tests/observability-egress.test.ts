// Egress coverage (observability spec: consent gate, durable batching, opt-out,
// single endpoint — tasks 8.3 + the consent/endpoint scenarios). The worker is the
// single egress: it gates on the two consent flags, buffers durably, re-checks
// consent at flush, drops (not drains) buffered events on opt-out, and POSTs only
// to the PostHog EU endpoint.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  recordEvent,
  flush,
  postHogTransport,
  __setTransport,
  __resetTransport,
  type Transport,
} from '../src/core/observability/egress';
import { readBuffer, dropCategory, BUFFER_KEY } from '../src/core/observability/buffer';
import { POSTHOG_BATCH_URL } from '../src/core/observability/config';
import { ANON_DISTINCT_ID } from '../src/core/observability/identity';
import { SETTINGS_KEY } from '../src/core/settings';
import type { BuiltEvent } from '../src/core/observability/validator';

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
function consent(diagnostics: boolean) {
  return { [SETTINGS_KEY]: { diagnosticsOptIn: diagnostics } };
}
const RECOVERED = {
  name: 'adapter_recovered',
  props: { platform: 'claude', configVer: '1.0' },
} as const;
const SELFCHECK = {
  name: 'adapter_selfcheck_failed',
  props: { platform: 'gemini', configVer: '1.0.1', anchorKey: 'composer' },
} as const;
afterEach(() => {
  setChrome(originalChrome);
  __resetTransport();
  vi.restoreAllMocks();
});

describe('Consent gate', () => {
  it('diagnostics on: the event is accepted', async () => {
    setChrome(makeChrome(consent(true)));
    const diag = await recordEvent({ ...RECOVERED });
    expect(diag.accepted).toBe(true);
  });

  it('diagnostics off: the event is dropped at the gate', async () => {
    setChrome(makeChrome(consent(false)));
    const diag = await recordEvent({ ...RECOVERED });
    expect(diag).toEqual({ accepted: false, reason: 'consent_off' });
  });

  it('fresh install defaults diagnostics off, so an event buffers nothing', async () => {
    setChrome(makeChrome());
    const res = await recordEvent({ ...RECOVERED });
    expect(res).toEqual({ accepted: false, reason: 'consent_off' });
    expect(await readBuffer()).toEqual([]);
  });
});

describe('Durable buffer + flush (8.3)', () => {
  it('buffered events survive a worker restart and flush afterwards', async () => {
    const fake = makeChrome(consent(true));
    setChrome(fake);
    await recordEvent({ ...SELFCHECK });
    await recordEvent({ ...RECOVERED });
    expect((await readBuffer()).length).toBe(2);

    // "Restart": a new context over the SAME backing store — buffer is storage-backed.
    setChrome(makeChrome(fake.store));
    const sent: BuiltEvent[][] = [];
    const transport: Transport = async (events) => {
      sent.push(events);
      return true;
    };
    __setTransport(transport);
    await flush();
    expect(sent[0].map((e) => e.event)).toEqual(['adapter_selfcheck_failed', 'adapter_recovered']);
    expect(await readBuffer()).toEqual([]); // cleared on success
  });

  it('flush re-checks consent and drops the buffer when diagnostics is turned off', async () => {
    const fake = makeChrome(consent(true));
    setChrome(fake);
    await recordEvent({ ...RECOVERED });

    // Consent withdrawn after buffering.
    fake.store[SETTINGS_KEY] = { diagnosticsOptIn: false };
    const transport = vi.fn(async () => true);
    __setTransport(transport);
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(await readBuffer()).toEqual([]); // dropped, not retained
  });

  it('a transport failure retains the buffered events to retry', async () => {
    setChrome(makeChrome(consent(true)));
    await recordEvent({ ...RECOVERED });
    __setTransport(async () => false);
    await flush();
    expect((await readBuffer()).length).toBe(1); // retained for next alarm
  });
});

describe('Opt-out drops buffered events (8.3)', () => {
  it('dropping the diagnostics category discards buffered events', async () => {
    const fake = makeChrome(consent(true));
    setChrome(fake);
    await recordEvent({ ...SELFCHECK });
    await recordEvent({ ...RECOVERED });
    expect((await readBuffer()).length).toBe(2);

    await dropCategory('diagnostics');
    expect(await readBuffer()).toEqual([]);
  });
});

describe('Single endpoint, no SDK', () => {
  it('postHogTransport POSTs hand-built JSON only to the PostHog EU endpoint', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const event: BuiltEvent = {
      event: 'adapter_recovered',
      properties: { platform: 'claude', configVer: '1.0' },
      distinct_id: ANON_DISTINCT_ID,
    };
    const ok = await postHogTransport([event]);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(POSTHOG_BATCH_URL);
    expect(url.startsWith('https://eu.i.posthog.com')).toBe(true);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.batch[0].event).toBe('adapter_recovered');
  });

  it('a flushed diagnostics event carries the anonymous distinct_id on the wire', async () => {
    setChrome(makeChrome(consent(true)));
    await recordEvent({ ...SELFCHECK });
    let captured: BuiltEvent[] = [];
    __setTransport(async (events) => {
      captured = events;
      return true;
    });
    await flush();
    expect(captured[0].event).toBe('adapter_selfcheck_failed');
    // PostHog requires a distinct_id; diagnostics use the fixed, non-identifying constant.
    expect(captured[0].distinct_id).toBe(ANON_DISTINCT_ID);
  });
});

describe('buffer key', () => {
  it('uses a single storage key', () => {
    expect(BUFFER_KEY).toBe('skeinos.telemetryBuffer');
  });
});
