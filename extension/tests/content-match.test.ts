import { describe, it, expect } from 'vitest';
import { P0_MATCHES } from '../src/manifest.config';

// Minimal Chrome match-pattern evaluator, enough to prove our patterns admit the
// supported hosts and reject everything else (spec: extension-shell §"does not
// execute on an unsupported page").
function matchPatternToRegex(pattern: string): RegExp {
  const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) throw new Error(`bad match pattern: ${pattern}`);
  const [, scheme, host, path] = m;

  const schemeRe = scheme === '*' ? 'https?' : scheme;

  let hostRe: string;
  if (host.startsWith('*.')) {
    // "*." matches the domain itself and any subdomain
    const base = host.slice(2).replace(/[.]/g, '\\.');
    hostRe = `(?:[^/]+\\.)?${base}`;
  } else {
    hostRe = host.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*');
  }

  const pathRe = path.replace(/[.]/g, '\\.').replace(/\*/g, '.*');
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

function matchesAny(url: string): boolean {
  return P0_MATCHES.some((p) => matchPatternToRegex(p).test(url));
}

describe('content-script match patterns', () => {
  it('matches the supported P0 hosts', () => {
    expect(matchesAny('https://claude.ai/chat/abc')).toBe(true);
    expect(matchesAny('https://gemini.google.com/app')).toBe(true);
    expect(matchesAny('https://www.perplexity.ai/search')).toBe(true);
    expect(matchesAny('https://perplexity.ai/')).toBe(true);
    expect(matchesAny('https://chatgpt.com/c/abc')).toBe(true);
  });

  it('does not match unsupported pages', () => {
    expect(matchesAny('https://example.com/')).toBe(false);
    // ChatGPT is scoped to chatgpt.com only — the legacy host stays out.
    expect(matchesAny('https://chat.openai.com/')).toBe(false);
    // look-alike host must not match
    expect(matchesAny('https://claude.ai.attacker.com/')).toBe(false);
    expect(matchesAny('https://notgemini.google.com.evil.com/')).toBe(false);
  });
});
