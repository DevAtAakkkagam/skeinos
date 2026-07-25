// search normalize primitives (task 2.4). Covers the pure text→tokens helpers in
// src/core/search/normalize.ts that must run identically at index and query time
//. Vitest, no storage/DOM.

import { describe, expect, it } from 'vitest';
import {
  hashContent,
  indexableText,
  normalize,
  prefixOf,
  stem,
  tokenize,
} from '../src/core/search/normalize';

describe('normalize (lowercase, strip punctuation, collapse whitespace)', () => {
  it('lowercases', () => {
    expect(normalize('Running TESTS')).toBe('running tests');
  });

  it('strips punctuation into separators (no gluing)', () => {
    expect(normalize('foo, bar!')).toBe('foo bar');
    expect(normalize('foo!bar')).toBe('foo bar');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(normalize('  a   b\t\nc  ')).toBe('a b c');
  });

  it('keeps letters/numbers from any script', () => {
    expect(normalize('Café 北京 42')).toBe('café 北京 42');
  });
});

describe('index/query normalization & stemming symmetry', () => {
  it('a term from a document equals the same term typed as a query', () => {
    const docTerm = tokenize('Running Tests!')[0].term; // from a "document"
    const queryTerm = tokenize('running')[0].term; // from the search box
    expect(docTerm).toBe(queryTerm);
  });

  it('plural in document collapses to the singular query term', () => {
    const docTokens = tokenize('We ran many tests today');
    const queryTerm = tokenize('test')[0].term;
    expect(docTokens.map((t) => t.term)).toContain(queryTerm);
  });
});

describe('tokenize positions are stable and dense', () => {
  it('positions are 0,1,2… over the normalized stream', () => {
    const tokens = tokenize('alpha, beta!  gamma');
    expect(tokens.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('positions are identical across repeated calls on the same input', () => {
    const a = tokenize('one two three four');
    const b = tokenize('one two three four');
    expect(a).toEqual(b);
  });

  it('empty / punctuation-only input yields no tokens', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('!!! ,,, ???')).toEqual([]);
  });
});

describe('prefixOf is code-point aware', () => {
  it('returns the whole term for a 1-char term', () => {
    expect(prefixOf('a')).toBe('a');
  });

  it('returns the whole term for a 2-char term', () => {
    expect(prefixOf('ab')).toBe('ab');
  });

  it('returns the first two characters for a >2-char term', () => {
    expect(prefixOf('alpha')).toBe('al');
  });

  it('does not split a surrogate pair on a multibyte leading character', () => {
    const result = prefixOf('🎉x');
    // Two code points (emoji + x), not a broken surrogate half.
    expect([...result]).toHaveLength(2);
    expect([...result]).toEqual(['🎉', 'x']);
    // The string must be well-formed (no lone surrogate).
    expect(result.isWellFormed?.() ?? true).toBe(true);
  });

  it('a single emoji term is returned whole (length-1 code point)', () => {
    const result = prefixOf('🎉');
    expect([...result]).toHaveLength(1);
    expect(result).toBe('🎉');
  });
});

describe('hashContent change detection', () => {
  it('identical input → identical hash', () => {
    expect(hashContent('hello world')).toBe(hashContent('hello world'));
  });

  it('a single-character change → different hash', () => {
    expect(hashContent('hello world')).not.toBe(hashContent('hello worle'));
  });

  it('produces a stable 16-hex-char digest', () => {
    expect(hashContent('anything at all')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('indexableText field provenance', () => {
  it('titleTokenCount equals the number of title tokens', () => {
    const { titleTokenCount } = indexableText('Hello Brave World', 'body here');
    expect(titleTokenCount).toBe(tokenize('Hello Brave World').length);
    expect(titleTokenCount).toBe(3);
  });

  it('combined text re-tokenizes to title tokens then body tokens', () => {
    const title = 'My Great Title';
    const body = 'some body words here';
    const { text, titleTokenCount } = indexableText(title, body);

    const recombined = tokenize(text).map((t) => t.term);
    const expected = [
      ...tokenize(title).map((t) => t.term),
      ...tokenize(body).map((t) => t.term),
    ];
    expect(recombined).toEqual(expected);

    // The split point is recoverable by position: first N are title tokens.
    expect(recombined.slice(0, titleTokenCount)).toEqual(
      tokenize(title).map((t) => t.term),
    );
    expect(recombined.slice(titleTokenCount)).toEqual(
      tokenize(body).map((t) => t.term),
    );
  });

  it('handles empty title (titleTokenCount 0) and empty body', () => {
    const a = indexableText('', 'just body');
    expect(a.titleTokenCount).toBe(0);
    expect(tokenize(a.text).map((t) => t.term)).toEqual(
      tokenize('just body').map((t) => t.term),
    );

    const b = indexableText('just title', '');
    expect(b.titleTokenCount).toBe(2);
    expect(tokenize(b.text).map((t) => t.term)).toEqual(
      tokenize('just title').map((t) => t.term),
    );
  });
});

describe('stemming is light & idempotent', () => {
  it('stem(stem(w)) === stem(w)', () => {
    for (const w of [
      'tests',
      'parties',
      'boxes',
      'classes',
      'buses',
      'running',
      'status', // ends in -us: must not be stripped
      'class', // ends in -ss: must not be stripped
      'go',
      'a',
      'ies', // short word — guarded by length checks
    ]) {
      expect(stem(stem(w))).toBe(stem(w));
    }
  });

  it('folds common plurals', () => {
    expect(stem('tests')).toBe('test');
    expect(stem('parties')).toBe('party');
    expect(stem('boxes')).toBe('box');
  });

  it('does not over-collapse -ss / -us endings', () => {
    expect(stem('class')).toBe('class');
    expect(stem('status')).toBe('status');
  });
});
