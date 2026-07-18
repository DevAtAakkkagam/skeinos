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

describe('Claude conversationIdPattern id normalization', () => {
  function mount(config: AdapterConfig): { adapter: ReturnType<typeof createAdapter>; root: HTMLElement } {
    const root = document.createElement('div');
    root.innerHTML = claudeHtml;
    document.body.appendChild(root);
    return {
      adapter: createAdapter(config, { root, getUrl: () => 'https://claude.ai/chat/conv-1' }),
      root,
    };
  }

  it('list ids are the bare uuid (the `chat:` row prefix is stripped)', () => {
    const { adapter, root } = mount(claudeConfig);
    expect(adapter.listConversations().map((r) => r.nativeId)).toEqual(['conv-1', 'conv-2']);
    root.remove();
  });

  it('the DOM id equals the URL-derived id, so the active row supplies the title', () => {
    const { adapter, root } = mount(claudeConfig);
    const ref = adapter.detectConversation();
    expect(ref?.nativeId).toBe('conv-1');
    expect(ref?.title).toBe('Quantum basics');
    root.remove();
  });

  it('fails open: a malformed pattern falls back to the raw attribute value', () => {
    const broken: AdapterConfig = {
      ...claudeConfig,
      selectors: { ...claudeConfig.selectors, conversationIdPattern: '(' },
    };
    const { adapter, root } = mount(broken);
    expect(adapter.listConversations().map((r) => r.nativeId)).toEqual([
      'chat:conv-1',
      'chat:conv-2',
    ]);
    root.remove();
  });

  it('fails open: a non-matching value passes through raw', () => {
    const strict: AdapterConfig = {
      ...claudeConfig,
      selectors: { ...claudeConfig.selectors, conversationIdPattern: '^session:(.+)$' },
    };
    const { adapter, root } = mount(strict);
    expect(adapter.listConversations().map((r) => r.nativeId)).toEqual([
      'chat:conv-1',
      'chat:conv-2',
    ]);
    root.remove();
  });
});

describe('Claude self-check fails cleanly on a broken fixture', () => {
  it('reports the missing composer anchor and does not throw', () => {
    const root = document.createElement('div');
    // Same fixture with the composer removed.
    root.innerHTML = claudeHtml.replace(
      /<div contenteditable="true" data-testid="chat-input"[^>]*><\/div>/,
      '',
    );
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
