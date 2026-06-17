// adapter-gemini spec coverage: the bundled Gemini config is schema-valid, the host
// router resolves Gemini URLs to it, it passes the shared contract suite against the
// recorded fixture, and its self-check fails cleanly on a broken fixture.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { matchPlatform } from '../src/adapters/runtime/host-match';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { getBundledConfig } from '../src/adapters/configs';
import type { AdapterConfig } from '../src/adapters/types';
import geminiRaw from '../src/adapters/configs/gemini.json';
import expected from './fixtures/gemini.expected.json';
import { runAdapterContract, type ContractExpectations } from './adapter-contract';

const geminiHtml = readFileSync('tests/fixtures/gemini.html', 'utf8');
const geminiConfig = getBundledConfig('gemini') as AdapterConfig;

describe('Gemini adapter config', () => {
  it('the bundled Gemini config is valid', () => {
    const result = validateAdapterConfig(geminiRaw);
    expect(isValidationErrors(result)).toBe(false);
    if (!isValidationErrors(result)) {
      expect(result.platformId).toBe('gemini');
      expect(result.hostMatch).toContain('*://gemini.google.com/*');
    }
  });

  it('the host router resolves a Gemini URL to "gemini"', () => {
    expect(matchPlatform('https://gemini.google.com/app/abc123')).toBe('gemini');
  });
});

// Gemini passes the shared contract suite against the recorded fixture.
runAdapterContract({
  name: 'gemini',
  config: geminiConfig,
  html: geminiHtml,
  expected: expected as ContractExpectations,
});

describe('Gemini self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the Quill composer removed.
    root.innerHTML = geminiHtml.replace(
      /<div class="ql-editor"[^>]*><\/div>/,
      '',
    );
    document.body.appendChild(root);

    const adapter = createAdapter(geminiConfig, { root });
    let result!: ReturnType<typeof adapter.selfCheck>;
    expect(() => {
      result = adapter.selfCheck();
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');

    root.remove();
  });
});
