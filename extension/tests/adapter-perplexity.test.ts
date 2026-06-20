// adapter-perplexity spec coverage: the bundled Perplexity config is schema-valid,
// the host router resolves Perplexity URLs to it, it passes the shared contract
// suite against the recorded fixture (proving the framework drives it with no
// per-platform code), and its self-check fails cleanly on a broken fixture.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { matchPlatform } from '../src/adapters/runtime/host-match';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { getBundledConfig } from '../src/adapters/configs';
import type { AdapterConfig } from '../src/adapters/types';
import perplexityRaw from '../src/adapters/configs/perplexity.json';
import expected from './fixtures/perplexity.expected.json';
import { runAdapterContract, type ContractExpectations } from './adapter-contract';

const perplexityHtml = readFileSync('tests/fixtures/perplexity.html', 'utf8');
const perplexityConfig = getBundledConfig('perplexity') as AdapterConfig;

describe('Perplexity adapter config', () => {
  it('the bundled Perplexity config is valid', () => {
    const result = validateAdapterConfig(perplexityRaw);
    expect(isValidationErrors(result)).toBe(false);
    if (!isValidationErrors(result)) {
      expect(result.platformId).toBe('perplexity');
      expect(result.hostMatch).toContain('*://*.perplexity.ai/*');
    }
  });

  it('the host router resolves a Perplexity URL to "perplexity"', () => {
    expect(matchPlatform('https://www.perplexity.ai/search/abc123')).toBe('perplexity');
  });

  it('reads each title from aria-label when the item has no title text (conversationTitleAttr)', () => {
    const root = document.createElement('div');
    root.innerHTML = perplexityHtml;
    document.body.appendChild(root);
    const adapter = createAdapter(perplexityConfig, { root });
    // The overlay <a> carries no text — its label lives in aria-label, so the
    // generic adapter must fall back to `conversationTitleAttr` for every item.
    expect(adapter.listConversations().map((c) => c.title)).toEqual([
      'Rump steaks',
      'Cast-iron skillet care',
    ]);
    root.remove();
  });
});

// Perplexity passes the shared contract suite against the recorded fixture.
runAdapterContract({
  name: 'perplexity',
  config: perplexityConfig,
  html: perplexityHtml,
  expected: expected as ContractExpectations,
});

describe('Perplexity self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the #ask-input composer removed.
    root.innerHTML = perplexityHtml.replace(
      /<div id="ask-input"[^>]*><\/div>/,
      '',
    );
    document.body.appendChild(root);

    const adapter = createAdapter(perplexityConfig, { root });
    let result!: ReturnType<typeof adapter.selfCheck>;
    expect(() => {
      result = adapter.selfCheck();
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');

    root.remove();
  });
});
