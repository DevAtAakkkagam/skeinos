// composeProfileText / responseStyleDirective (profile-activation 4.1): the pure
// helper that builds the text a profile injects — its instruction, optionally
// followed by a one-line response-style directive (verbosity × format). No I/O; the
// exact wording is asserted (it is user-visible, riding the next message).

import { describe, expect, it } from 'vitest';
import { composeProfileText, responseStyleDirective } from '../src/ui/profiles/compose';
import type { InstructionProfile } from '../src/shared/types';

type ResponseStyle = NonNullable<InstructionProfile['responseStyle']>;

function style(over: Partial<ResponseStyle> = {}): ResponseStyle {
  return { verbosity: 'balanced', format: 'markdown', ...over };
}

describe('responseStyleDirective (4.1)', () => {
  // Every verbosity × format pair, exact wording.
  const cases: Array<[ResponseStyle, string]> = [
    [style({ verbosity: 'brief', format: 'markdown' }), 'Respond briefly, in Markdown.'],
    [style({ verbosity: 'brief', format: 'plain' }), 'Respond briefly, in plain text.'],
    [style({ verbosity: 'balanced', format: 'markdown' }), 'Respond at a balanced length, in Markdown.'],
    [style({ verbosity: 'balanced', format: 'plain' }), 'Respond at a balanced length, in plain text.'],
    [style({ verbosity: 'thorough', format: 'markdown' }), 'Respond thoroughly, in Markdown.'],
    [style({ verbosity: 'thorough', format: 'plain' }), 'Respond thoroughly, in plain text.'],
  ];
  for (const [s, expected] of cases) {
    it(`${s.verbosity} × ${s.format} → "${expected}"`, () => {
      expect(responseStyleDirective(s)).toBe(expected);
    });
  }
});

describe('composeProfileText (4.1)', () => {
  it('returns the instruction only when no responseStyle is set', () => {
    expect(composeProfileText({ instructionText: 'Be a senior staff engineer.' })).toBe(
      'Be a senior staff engineer.',
    );
  });

  it('trims the instruction when there is no responseStyle', () => {
    expect(composeProfileText({ instructionText: '  Be terse.  ' })).toBe('Be terse.');
  });

  it('joins instruction + directive with a blank line, for each verbosity × format', () => {
    const instruction = 'Be a senior staff engineer.';
    const cases: Array<[ResponseStyle, string]> = [
      [style({ verbosity: 'brief', format: 'markdown' }), 'Respond briefly, in Markdown.'],
      [style({ verbosity: 'brief', format: 'plain' }), 'Respond briefly, in plain text.'],
      [style({ verbosity: 'balanced', format: 'markdown' }), 'Respond at a balanced length, in Markdown.'],
      [style({ verbosity: 'balanced', format: 'plain' }), 'Respond at a balanced length, in plain text.'],
      [style({ verbosity: 'thorough', format: 'markdown' }), 'Respond thoroughly, in Markdown.'],
      [style({ verbosity: 'thorough', format: 'plain' }), 'Respond thoroughly, in plain text.'],
    ];
    for (const [s, directive] of cases) {
      expect(composeProfileText({ instructionText: instruction, responseStyle: s })).toBe(
        `${instruction}\n\n${directive}`,
      );
    }
  });

  it('returns the directive only when the instruction is empty but a style is set', () => {
    expect(
      composeProfileText({ instructionText: '   ', responseStyle: style({ verbosity: 'brief', format: 'plain' }) }),
    ).toBe('Respond briefly, in plain text.');
  });
});
