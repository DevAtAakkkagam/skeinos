// Pure compose helper for profile activation (profile-activation, D-2). Builds the
// text injected into the host composer when a profile is activated: the profile's
// `instructionText`, optionally followed by a response-style directive derived from
// `responseStyle` (verbosity + format). No I/O — fully unit-testable.
//
// The directive is a single natural-language line so it reads as one more standing
// instruction riding the next message (PRD §6.4). PREPEND-only this slice (D-5): the
// caller appends this through the bar's `onInsert` seam, never auto-submitting.

import type { InstructionProfile } from '../../shared/types';

type ResponseStyle = NonNullable<InstructionProfile['responseStyle']>;

/** Verbosity → the adverb phrase used in the response-style directive. */
const VERBOSITY_PHRASE: Record<ResponseStyle['verbosity'], string> = {
  brief: 'briefly',
  balanced: 'at a balanced length',
  thorough: 'thoroughly',
};

/** Format → the trailing phrase used in the response-style directive. */
const FORMAT_PHRASE: Record<ResponseStyle['format'], string> = {
  markdown: 'in Markdown',
  plain: 'in plain text',
};

/** The one-line directive for a response style, e.g. "Respond briefly, in Markdown." */
export function responseStyleDirective(style: ResponseStyle): string {
  return `Respond ${VERBOSITY_PHRASE[style.verbosity]}, ${FORMAT_PHRASE[style.format]}.`;
}

/**
 * Compose the text a profile injects: its instruction, plus a response-style
 * directive when one is set. With no response style, only the (trimmed) instruction
 * is returned; the directive is separated by a blank line so it reads as its own
 * standing instruction. An empty instruction with a style yields just the directive.
 */
export function composeProfileText(
  profile: Pick<InstructionProfile, 'instructionText' | 'responseStyle'>,
): string {
  const instruction = profile.instructionText.trim();
  if (!profile.responseStyle) return instruction;
  const directive = responseStyleDirective(profile.responseStyle);
  return instruction ? `${instruction}\n\n${directive}` : directive;
}
