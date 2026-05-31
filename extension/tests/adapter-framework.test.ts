// platform-adapter spec coverage: config validation (T1.1), the bundled/remote
// loader with fallback (T1.1), host matching, and a reference run of the shared
// contract harness proving it is config-driven (T1.3) against a *synthetic*
// platform distinct from Claude.

import { describe, expect, it } from 'vitest';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { loadConfig } from '../src/adapters/runtime/loader';
import { matchPlatform, matchesHostPattern } from '../src/adapters/runtime/host-match';
import type { AdapterConfig, PlatformId } from '../src/adapters/types';
import { runAdapterContract } from './adapter-contract';

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    platformId: 'gemini',
    configVersion: '1.0.0',
    hostMatch: ['*://gemini.google.com/*'],
    selectors: {
      conversationList: '.list',
      conversationItem: '.item',
      conversationTitle: '.title',
      conversationIdAttr: 'data-id',
      messageUser: '.msg-user',
      messageAssistant: '.msg-ai',
      composer: 'textarea.composer',
      sendButton: 'button.send',
      sidebarAnchor: '.sidebar',
      inputBarAnchor: '.input-bar',
    },
    behaviors: { insertMode: 'react-set', submitMode: 'enter', supportsSystemPrompt: false },
    ...overrides,
  };
}

describe('AdapterConfig validation (T1.1)', () => {
  it('a complete, well-typed config passes', () => {
    const result = validateAdapterConfig(makeConfig());
    expect(isValidationErrors(result)).toBe(false);
  });

  it('rejects a missing required selector', () => {
    const cfg = makeConfig();
    delete (cfg.selectors as unknown as Record<string, unknown>).composer;
    const result = validateAdapterConfig(cfg);
    expect(isValidationErrors(result)).toBe(true);
    if (isValidationErrors(result)) {
      expect(result.some((e) => e.path === 'selectors.composer')).toBe(true);
    }
  });

  it('rejects an unknown platformId', () => {
    const result = validateAdapterConfig(makeConfig({ platformId: 'nope' as PlatformId }));
    expect(isValidationErrors(result)).toBe(true);
  });

  it('rejects a non-semver configVersion', () => {
    const result = validateAdapterConfig(makeConfig({ configVersion: 'v1' }));
    expect(isValidationErrors(result)).toBe(true);
  });

  it('rejects an invalid behavior enum', () => {
    const cfg = makeConfig();
    (cfg.behaviors as unknown as Record<string, unknown>).insertMode = 'telepathy';
    const result = validateAdapterConfig(cfg);
    expect(isValidationErrors(result)).toBe(true);
  });
});

describe('Config loader: newest valid, bundled fallback (T1.1)', () => {
  const bundled = makeConfig({ configVersion: '1.0.0' });
  const noCache = { read: async () => undefined, write: async () => {} };

  it('adopts a newer valid remote config', async () => {
    const remote = makeConfig({ configVersion: '1.2.0' });
    const result = await loadConfig('gemini', {
      bundled,
      cache: noCache,
      fetchRemote: async () => remote,
    });
    expect(result?.configVersion).toBe('1.2.0');
  });

  it('falls back to bundled when the remote config is invalid', async () => {
    const result = await loadConfig('gemini', {
      bundled,
      cache: noCache,
      fetchRemote: async () => ({ platformId: 'gemini', configVersion: 'broken' }),
    });
    expect(result?.configVersion).toBe('1.0.0');
  });

  it('falls back to bundled when the remote fetch fails', async () => {
    const result = await loadConfig('gemini', {
      bundled,
      cache: noCache,
      fetchRemote: async () => {
        throw new Error('offline');
      },
    });
    expect(result?.configVersion).toBe('1.0.0');
  });

  it('ignores an older-or-equal remote config', async () => {
    const result = await loadConfig('gemini', {
      bundled,
      cache: noCache,
      fetchRemote: async () => makeConfig({ configVersion: '1.0.0' }),
    });
    expect(result?.configVersion).toBe('1.0.0');
  });

  it('caches the adopted config as the next baseline', async () => {
    const writes: AdapterConfig[] = [];
    const result = await loadConfig('gemini', {
      bundled,
      cache: { read: async () => undefined, write: async (_p, c) => void writes.push(c) },
      fetchRemote: async () => makeConfig({ configVersion: '2.0.0' }),
    });
    expect(result?.configVersion).toBe('2.0.0');
    expect(writes).toHaveLength(1);
    expect(writes[0].configVersion).toBe('2.0.0');
  });
});

describe('Host matching', () => {
  it('matches an MV3 pattern against a URL', () => {
    expect(matchesHostPattern('*://claude.ai/*', 'https://claude.ai/chat/123')).toBe(true);
    expect(matchesHostPattern('*://claude.ai/*', 'https://example.com/')).toBe(false);
  });

  it('maps a Claude URL to the claude platform', () => {
    expect(matchPlatform('https://claude.ai/chat/abc')).toBe('claude');
    expect(matchPlatform('https://unsupported.example/')).toBeNull();
  });
});

// The harness is config-driven: a synthetic platform (distinct selectors, an
// 'enter' submit mode, a <textarea> composer) passes the same suite as Claude.
const referenceConfig = makeConfig();
const referenceHtml = `
  <div class="sidebar">
    <div class="list">
      <a class="item" data-id="r-1" href="/c/r-1" aria-current="true"><span class="title">First</span></a>
      <a class="item" data-id="r-2" href="/c/r-2"><span class="title">Second</span></a>
    </div>
  </div>
  <div class="thread">
    <div class="msg-user">ping</div>
    <div class="msg-ai">pong</div>
  </div>
  <div class="input-bar">
    <textarea class="composer"></textarea>
    <button class="send">Send</button>
  </div>
`;

runAdapterContract({
  name: 'reference (synthetic)',
  config: referenceConfig,
  html: referenceHtml,
  expected: {
    activeUrl: 'https://gemini.google.com/c/r-1',
    active: { nativeId: 'r-1', title: 'First' },
    conversationCount: 2,
    messages: [
      { role: 'user', text: 'ping' },
      { role: 'assistant', text: 'pong' },
    ],
    inserted: 'reference insert',
  },
});
