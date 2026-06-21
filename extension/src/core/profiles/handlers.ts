// Worker-side instruction-profile query/mutate handlers (profiles-library, design
// D-1). The single writer loads from the `profiles` repo on every call, applies the
// mutation, and writes back — so a cold MV3 worker needs no in-memory state
// (SW-1/SW-2). Reads/writes ride the existing messaging hub via two new kinds
// (`profiles.query`/`profiles.mutate`) added through the declaration-merging seam;
// after a write that changed data the worker broadcasts `state.changed` naming the
// `profiles` store so every open surface re-queries. Mirrors `core/prompts/handlers.ts`.
//
// CRUD only: no activation, no injection (those are later slices). No DOM access here.

import { broadcast, registerHandler } from '../../core/messaging';
import { workspaceStore, type WorkspaceStore } from '../../core/store';
import type { InstructionProfile } from '../../shared/types';
import type { DomainId } from '../../shared/domains';
import type {
  MutationResult,
  ProfileInstallResult,
  ProfileMutationOp,
  ProfileSelector,
  ProfileSnapshot,
} from '../../shared/profiles';
import { installProfileSeeds } from './seed';

declare module '../../shared/messages' {
  interface RequestContracts {
    'profiles.query': { request: { selector: ProfileSelector }; response: ProfileSnapshot };
    'profiles.mutate': { request: { op: ProfileMutationOp }; response: MutationResult };
    'profiles.install': { request: { domain: DomainId }; response: ProfileInstallResult };
  }
}

/** Error codes that survive the messaging boundary (mirror `PROMPT_ERROR`). */
export const PROFILE_ERROR = {
  notFound: 'profile_not_found',
} as const;

/** A domain error that survives the messaging boundary with its `code` intact. */
export class ProfileError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProfileError';
    this.code = code;
  }
}

async function requireProfile(store: WorkspaceStore, id: string): Promise<InstructionProfile> {
  const p = await store.profiles.get(id);
  if (!p) throw new ProfileError(PROFILE_ERROR.notFound, `No profile ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The full profile library (D-1): every non-tombstoned profile with all fields.
 *  `query()` already excludes tombstones, so deleted profiles never surface. */
export async function queryProfileLibrary(
  store: WorkspaceStore,
  selector: ProfileSelector,
): Promise<ProfileSnapshot> {
  switch (selector.kind) {
    case 'profile.library': {
      const profiles = await store.profiles.query();
      return { kind: 'profile.library', profiles };
    }
  }
}

// ---------------------------------------------------------------------------
// Writes — each returns the stores it touched (for the broadcast)
// ---------------------------------------------------------------------------

export async function mutateProfileLibrary(
  store: WorkspaceStore,
  op: ProfileMutationOp,
): Promise<MutationResult> {
  switch (op.op) {
    case 'profile.create': {
      // The envelope is stamped by the repo on `put`. `appliesTo` defaults to empty;
      // `description`/`responseStyle` are only set when provided (optional fields).
      const profile: InstructionProfile = {
        id: op.id,
        name: op.name,
        instructionText: op.instructionText,
        appliesTo: op.appliesTo ?? [],
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.responseStyle !== undefined ? { responseStyle: op.responseStyle } : {}),
      } as InstructionProfile;
      await store.profiles.put(profile);
      return { stores: ['profiles'] };
    }
    case 'profile.update': {
      // Read-modify-write partial patch (D-1): apply only the present fields, preserve
      // the rest verbatim. The repo re-stamps the envelope on `put`.
      const prev = await requireProfile(store, op.id);
      const next: InstructionProfile = { ...prev };
      if (op.name !== undefined) next.name = op.name;
      if (op.description !== undefined) next.description = op.description;
      if (op.instructionText !== undefined) next.instructionText = op.instructionText;
      if (op.appliesTo !== undefined) next.appliesTo = op.appliesTo;
      if (op.responseStyle !== undefined) next.responseStyle = op.responseStyle;
      await store.profiles.put(next);
      return { stores: ['profiles'] };
    }
    case 'profile.delete': {
      // Tombstone via the repo (profiles are syncable, so `delete` writes a tombstone).
      await requireProfile(store, op.id);
      await store.profiles.delete(op.id);
      return { stores: ['profiles'] };
    }
  }
}

// ---------------------------------------------------------------------------
// Registration (worker)
// ---------------------------------------------------------------------------

/** Worker side: register the profile query/mutate handlers and broadcast on writes. */
export function registerProfileHandlers(): void {
  registerHandler('profiles.query', async (req) => {
    return queryProfileLibrary(await workspaceStore(), req.selector);
  });
  registerHandler('profiles.mutate', async (req) => {
    const result = await mutateProfileLibrary(await workspaceStore(), req.op);
    // Skip the fan-out when a mutation touched nothing (mirror the prompt handler).
    if (result.stores.length > 0) {
      await broadcast({ kind: 'state.changed', stores: result.stores });
    }
    return result;
  });
  registerHandler('profiles.install', async (req) => {
    // The single writer installs a domain's profile seeds. Broadcast only when at
    // least one profile was inserted, so a no-op re-install never wakes every tab
    // (mirrors the prompt install + mutate broadcast gate).
    const installed = await installProfileSeeds(await workspaceStore(), req.domain);
    if (installed > 0) {
      await broadcast({ kind: 'state.changed', stores: ['profiles'] });
    }
    return { installed };
  });
}
