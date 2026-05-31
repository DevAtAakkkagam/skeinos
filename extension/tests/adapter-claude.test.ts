// adapter-claude spec coverage (T1.4): the bundled Claude config is schema-valid,
// passes the shared contract suite against the recorded fixture, and its
// self-check fails cleanly on a broken fixture.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { isValidationErrors, validateAdapterConfig } from '../src/adapters/runtime/validate';
import { getBundledConfig } from '../src/adapters/configs';
import type { AdapterConfig } from '../src/adapters/types';
import claudeRaw from '../src/adapters/configs/claude.json';
import expected from './fixtures/claude.expected.json';
import { runAdapterContract, type ContractExpectations } from './adapter-contract';

const claudeHtml = readFileSync('tests/fixtures/claude.html', 'utf8');
const claudeConfig = getBundledConfig('claude') as AdapterConfig;

describe('Claude adapter config', () => {
  it('the bundled Claude config is valid', () => {
    const result = validateAdapterConfig(claudeRaw);
    expect(isValidationErrors(result)).toBe(false);
    if (!isValidationErrors(result)) {
      expect(result.platformId).toBe('claude');
      expect(result.hostMatch).toContain('*://claude.ai/*');
    }
  });
});

// Claude passes the shared contract suite against the recorded fixture.
runAdapterContract({
  name: 'claude',
  config: claudeConfig,
  html: claudeHtml,
  expected: expected as ContractExpectations,
});

describe('Claude self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the composer removed.
    root.innerHTML = claudeHtml.replace(/<div class="ProseMirror"[^>]*><\/div>/, '');
    document.body.appendChild(root);

    const adapter = createAdapter(claudeConfig, { root });
    let result!: ReturnType<typeof adapter.selfCheck>;
    expect(() => {
      result = adapter.selfCheck();
    }).not.toThrow();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('composer');

    root.remove();
  });
});
