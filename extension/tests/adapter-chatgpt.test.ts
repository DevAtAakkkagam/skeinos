// adapter-chatgpt spec coverage: the bundled ChatGPT config is schema-valid, the
// host router resolves ChatGPT URLs to it, it passes the shared contract suite
// against the recorded fixture (proving the framework drives it with no per-platform
// code), and its self-check fails cleanly on a broken fixture.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { matchPlatform } from '../src/adapters/runtime/host-match';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { getBundledConfig } from '../src/adapters/configs';
import type { AdapterConfig } from '../src/adapters/types';
import chatgptRaw from '../src/adapters/configs/chatgpt.json';
import expected from './fixtures/chatgpt.expected.json';
import { runAdapterContract, type ContractExpectations } from './adapter-contract';

const chatgptHtml = readFileSync('tests/fixtures/chatgpt.html', 'utf8');
const chatgptConfig = getBundledConfig('chatgpt') as AdapterConfig;

describe('ChatGPT adapter config', () => {
  it('the bundled ChatGPT config is valid', () => {
    const result = validateAdapterConfig(chatgptRaw);
    expect(isValidationErrors(result)).toBe(false);
    if (!isValidationErrors(result)) {
      expect(result.platformId).toBe('chatgpt');
      expect(result.hostMatch).toContain('*://chatgpt.com/*');
    }
  });

  it('the host router resolves a ChatGPT URL to "chatgpt"', () => {
    expect(matchPlatform('https://chatgpt.com/c/abc123')).toBe('chatgpt');
  });
});

// ChatGPT passes the shared contract suite against the recorded fixture.
runAdapterContract({
  name: 'chatgpt',
  config: chatgptConfig,
  html: chatgptHtml,
  expected: expected as ContractExpectations,
});

describe('ChatGPT self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the #prompt-textarea composer removed.
    root.innerHTML = chatgptHtml.replace(
      /<div id="prompt-textarea"[^>]*><\/div>/,
      '',
    );
    document.body.appendChild(root);

    const adapter = createAdapter(chatgptConfig, { root });
    let result!: ReturnType<typeof adapter.selfCheck>;
    expect(() => {
      result = adapter.selfCheck();
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');

    root.remove();
  });
});
