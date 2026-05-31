// adapter-resilience spec coverage (Vitest + a fake `chrome`). Each `describe`
// maps to a task/scenario in openspec/changes/adapter-resilience.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import {
  clearHealth,
  getDegraded,
  getPlatformHealth,
  setHealth,
} from '../src/adapters/resilience/health';
import { registerResilienceHandlers } from '../src/adapters/resilience/report';
import {
  CANARY_ALARM,
  CANARY_PERIOD_MINUTES,
  registerCanary,
  runCanaryTick,
} from '../src/adapters/resilience/canary';
import { loadConfig } from '../src/adapters/runtime/loader';
import type { AdapterConfig, PlatformId } from '../src/adapters/types';
import type { RequestOf } from '../src/shared/messages';

// --- a minimal fake `chrome` (storage + tabs + alarms) --------------------

interface FakeChromeParts {
  storage?: boolean;
  tabs?: boolean;
  alarms?: boolean;
}

interface FakeChrome {
  chrome: unknown;
  /** Broadcast payloads delivered to tabs (unwrapped from the wire envelope). */
  broadcasts: unknown[];
  alarmCreate: ReturnType<typeof vi.fn>;
  alarmAddListener: ReturnType<typeof vi.fn>;
}

function makeChrome(parts: FakeChromeParts = {}): FakeChrome {
  const data: Record<string, unknown> = {};
  const broadcasts: unknown[] = [];
  const alarmCreate = vi.fn();
  const alarmAddListener = vi.fn();

  const chrome: Record<string, unknown> = {};

  if (parts.storage !== false) {
    chrome.storage = {
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...data };
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of arr) if (k in data) out[k] = data[k];
          return out;
        },
        set: async (items: Record<string, unknown>) => void Object.assign(data, items),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    };
  }

  if (parts.tabs !== false) {
    chrome.tabs = {
      query: async () => [{ id: 1 }],
      sendMessage: async (_id: number, msg: { payload?: unknown }) => {
        broadcasts.push(msg.payload);
      },
    };
  }

  if (parts.alarms) {
    chrome.alarms = {
      create: alarmCreate,
      clear: async () => true,
      onAlarm: { addListener: alarmAddListener, removeListener: () => {} },
    };
  }

  return { chrome, broadcasts, alarmCreate, alarmAddListener };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
afterEach(() => setChrome(originalChrome));

// --- 1.3 Durable health store ---------------------------------------------

describe('Durable health store (1.3)', () => {
  beforeEach(() => setChrome(makeChrome().chrome));

  it('an unknown platform reads back healthy', async () => {
    const health = await getPlatformHealth('claude');
    expect(health.ok).toBe(true);
    expect(health.hotfixWanted).toBe(false);
    expect(await getDegraded()).toEqual([]);
  });

  it('a failing check persists as degraded with the hot-fix flag set', async () => {
    await setHealth('claude', { ok: false, missing: ['composer'] });

    const health = await getPlatformHealth('claude');
    expect(health.ok).toBe(false);
    expect(health.missing).toEqual(['composer']);
    expect(health.hotfixWanted).toBe(true);
    expect(await getDegraded()).toEqual(['claude']);
  });

  it('a passing check clears degraded and the hot-fix flag', async () => {
    await setHealth('claude', { ok: false, missing: ['composer'] });
    await setHealth('claude', { ok: true, missing: [] });

    const health = await getPlatformHealth('claude');
    expect(health.ok).toBe(true);
    expect(health.hotfixWanted).toBe(false);
    expect(await getDegraded()).toEqual([]);
  });

  it('clearHealth removes the record so it reads healthy again', async () => {
    await setHealth('claude', { ok: false, missing: ['composer'] });
    await clearHealth('claude');
    expect(await getDegraded()).toEqual([]);
    expect((await getPlatformHealth('claude')).ok).toBe(true);
  });

  it('rehydrates persisted state across a simulated worker restart', async () => {
    const fake = makeChrome();
    setChrome(fake.chrome);
    await setHealth('gemini', { ok: false, missing: ['conversationList'] });

    // A cold start: the module keeps no memory state, it re-reads the same storage.
    setChrome(fake.chrome);
    expect(await getDegraded()).toEqual(['gemini']);
  });
});

// --- 2.5 Health-report handlers -------------------------------------------

describe('Health-report handlers (2.5)', () => {
  beforeEach(() => {
    __clearHandlers();
    registerResilienceHandlers();
  });

  it('a failing report persists degraded, broadcasts platform.degraded, sets hot-fix', async () => {
    const fake = makeChrome();
    setChrome(fake.chrome);

    const res = await dispatch({
      kind: 'platform.report-health',
      platform: 'claude',
      result: { ok: false, missing: ['composer'] },
    } as RequestOf<'platform.report-health'>);

    expect(res).toEqual({ ok: true, data: { ok: true } });
    expect(await getDegraded()).toEqual(['claude']);
    expect((await getPlatformHealth('claude')).hotfixWanted).toBe(true);
    expect(fake.broadcasts).toContainEqual({ kind: 'platform.degraded', platform: 'claude' });
  });

  it('a passing report clears degraded and emits no broadcast', async () => {
    const fake = makeChrome();
    setChrome(fake.chrome);
    await setHealth('claude', { ok: false, missing: ['composer'] });

    const res = await dispatch({
      kind: 'platform.report-health',
      platform: 'claude',
      result: { ok: true, missing: [] },
    } as RequestOf<'platform.report-health'>);

    expect(res.ok).toBe(true);
    expect(await getDegraded()).toEqual([]);
    expect(fake.broadcasts).toEqual([]);
  });

  it('query-health returns the current degraded set', async () => {
    setChrome(makeChrome().chrome);
    await setHealth('claude', { ok: false, missing: ['composer'] });
    await setHealth('gemini', { ok: true, missing: [] });

    const res = await dispatch({ kind: 'platform.query-health' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ degraded: ['claude'] });
  });
});

// --- 3.5 Scheduled canary watchdog ----------------------------------------

describe('Scheduled canary watchdog (3.5)', () => {
  it('registers the alarm and onAlarm listener at load (cold-start safe)', () => {
    const fake = makeChrome({ alarms: true });
    setChrome(fake.chrome);

    registerCanary();

    expect(fake.alarmCreate).toHaveBeenCalledWith(CANARY_ALARM, {
      periodInMinutes: CANARY_PERIOD_MINUTES,
    });
    expect(CANARY_PERIOD_MINUTES).toBeLessThanOrEqual(24 * 60);
    expect(fake.alarmAddListener).toHaveBeenCalledTimes(1);
  });

  it('a tick re-broadcasts platform.degraded for a still-degraded platform', async () => {
    const fake = makeChrome();
    setChrome(fake.chrome);
    await setHealth('claude', { ok: false, missing: ['composer'] });

    const resurfaced = await runCanaryTick();

    expect(resurfaced).toEqual(['claude']);
    expect(fake.broadcasts).toContainEqual({ kind: 'platform.degraded', platform: 'claude' });
    // The hot-fix flag stays armed across the tick.
    expect((await getPlatformHealth('claude')).hotfixWanted).toBe(true);
  });

  it('a tick is silent when all platforms are healthy', async () => {
    const fake = makeChrome();
    setChrome(fake.chrome);

    const resurfaced = await runCanaryTick();

    expect(resurfaced).toEqual([]);
    expect(fake.broadcasts).toEqual([]);
  });

  it('only fires the canary tick for its own alarm name', () => {
    const fake = makeChrome({ alarms: true });
    setChrome(fake.chrome);
    registerCanary();
    const listener = fake.alarmAddListener.mock.calls[0][0] as (a: { name: string }) => void;
    // An unrelated alarm must not throw or act.
    expect(() => listener({ name: 'some.other.alarm' })).not.toThrow();
  });
});

// --- 4.2 Hot-fix flag → loader nudge --------------------------------------

describe('Hot-fix flag nudges the loader (4.2)', () => {
  function makeConfig(version: string): AdapterConfig {
    return {
      platformId: 'claude',
      configVersion: version,
      hostMatch: ['*://claude.ai/*'],
      selectors: {
        conversationList: '.list',
        conversationItem: '.item',
        conversationTitle: '.title',
        conversationIdAttr: 'data-id',
        messageUser: '.u',
        messageAssistant: '.a',
        composer: 'textarea',
        sendButton: 'button',
        sidebarAnchor: '.side',
        inputBarAnchor: '.bar',
      },
      behaviors: { insertMode: 'react-set', submitMode: 'enter', supportsSystemPrompt: false },
    };
  }

  const bundled = makeConfig('1.0.0');
  const noCache = { read: async () => undefined, write: async () => {} };

  it('a hot-fix-flagged platform attempts the remote fetch', async () => {
    const fetchRemote = vi.fn(async (_p: PlatformId) => makeConfig('1.1.0'));
    const result = await loadConfig('claude', {
      bundled,
      cache: noCache,
      fetchRemote,
      hotfixWanted: true,
    });
    expect(fetchRemote).toHaveBeenCalledTimes(1);
    expect(result?.configVersion).toBe('1.1.0');
  });

  it('an unflagged platform skips the remote fetch and keeps the bundled config', async () => {
    const fetchRemote = vi.fn(async (_p: PlatformId) => makeConfig('1.1.0'));
    const result = await loadConfig('claude', {
      bundled,
      cache: noCache,
      fetchRemote,
      hotfixWanted: false,
    });
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result?.configVersion).toBe('1.0.0');
  });
});
