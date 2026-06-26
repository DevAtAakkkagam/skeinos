// Instruction-profile query/mutate payloads carried by the `profiles.query` and
// `profiles.mutate` request kinds (profiles-library, design D-1). Mirrors
// `shared/prompts.ts`: a discriminated read selector, its snapshot, and the write
// op union — reusing the existing `MutationResult` (`{ stores }`). The request-kind
// contracts are registered via declaration merging in `core/profiles/handlers.ts`
// (the messaging seam), so profiles get their own kind pair without editing the hub.
//
// This slice is CRUD + view only: there is no activation or injection here, so the
// ops carry only the editable record fields. `appliesTo` is the per-platform set the
// editor toggles; the per-platform injection mode is PREPEND-only until the
// system-prompt slice (D-3 / D13 honesty), so nothing here advertises a SYSTEM mode.

import type { InstructionProfile, PlatformId } from './types';
import type { DomainId } from './domains';

export type { MutationResult } from './workspace';

/** The reply to a `profiles.install` request: how many seeds the worker inserted
 *  (0 when the domain's seeds were all already present — an idempotent no-op). */
export interface ProfileInstallResult {
  installed: number;
}

/** The payload of a `profiles.install` request: the domain whose seeds to install. */
export interface ProfileInstallRequest {
  domain: DomainId;
}

/** A read request against the profile library, discriminated by `kind`. One variant
 *  today (the full library); shaped as a union so future reads (e.g. a profile
 *  search) ride the same `profiles.query` kind, mirroring {@link PromptSelector}. */
export type ProfileSelector = { kind: 'profile.library' };

/** The result of a {@link ProfileSelector}. `profile.library` returns every
 *  non-tombstoned profile with all fields; tombstones are excluded by the repo. */
export type ProfileSnapshot = {
  kind: 'profile.library';
  profiles: InstructionProfile[];
};

/** A write request against the profile library, discriminated by `op`. The client
 *  supplies a generated id on creates; `profile.update` is a partial patch (only the
 *  present fields change, the rest are preserved by the worker, D-1). */
export type ProfileMutationOp =
  | {
      op: 'profile.create';
      id: string;
      name: string;
      instructionText: string;
      description?: string;
      appliesTo?: PlatformId[];
      responseStyle?: InstructionProfile['responseStyle'];
    }
  | {
      op: 'profile.update';
      id: string;
      name?: string;
      description?: string;
      instructionText?: string;
      appliesTo?: PlatformId[];
      responseStyle?: InstructionProfile['responseStyle'];
    }
  | { op: 'profile.delete'; id: string }
  | {
      /** Remove every profile still tagged with `domain` — the untouched starter
       *  profiles of a kit (an edit strips `domain`, so edited/created profiles are
       *  never matched). Drives the starter-kit swap's "replace" step. Mirrors
       *  {@link PromptMutationOp}'s `prompt.clearDomain`. */
      op: 'profile.clearDomain';
      domain: DomainId;
    };
