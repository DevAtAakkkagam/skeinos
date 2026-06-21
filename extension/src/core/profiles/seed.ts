// Idempotent domain profile-seed installer (profiles-library seeding). Runs in the
// service worker (the single writer, SW-1): the `profiles.install` handler calls this
// with the worker's store and a `DomainId`. It copies that domain's catalog seeds into
// the `profiles` store as ordinary, editable `InstructionProfile` records and returns
// the count it inserted. Mirrors `core/prompts/seed.ts`.
//
// Idempotent by `seedId` presence: it collects the `seedId`s already in the store and
// inserts only the missing ones, so re-running a domain — or installing a second
// domain — never duplicates. A user-authored profile has no `seedId`, so it is never
// matched and never touched.

import type { WorkspaceStore } from '../store';
import type { DomainId } from '../../shared/domains';
import type { InstructionProfile } from '../../shared/types';
import { profileSeedsForDomain } from './catalog';

/** Mint a fresh profile id (mirrors the UI's `makeProfileId`, but core-side). */
function mintId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `pf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Install the catalog's profile seeds for `domain` into `store`, skipping any whose
 * `seedId` is already present. Returns the number inserted (0 when all are present).
 */
export async function installProfileSeeds(store: WorkspaceStore, domain: DomainId): Promise<number> {
  const existing = await store.profiles.query();
  const present = new Set(existing.map((p) => p.seedId).filter((s): s is string => !!s));

  let installed = 0;
  for (const seed of profileSeedsForDomain(domain)) {
    if (present.has(seed.seedId)) continue;
    const profile: InstructionProfile = {
      id: mintId(),
      name: seed.name,
      instructionText: seed.instructionText,
      appliesTo: seed.appliesTo ?? [],
      domain: seed.domain,
      seedId: seed.seedId,
      ...(seed.description !== undefined ? { description: seed.description } : {}),
      ...(seed.responseStyle !== undefined ? { responseStyle: seed.responseStyle } : {}),
    } as InstructionProfile;
    await store.profiles.put(profile);
    installed += 1;
  }
  return installed;
}
