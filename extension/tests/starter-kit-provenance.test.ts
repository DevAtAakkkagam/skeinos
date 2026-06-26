// starter-kit-provenance — worker-side guarantees behind the provenance band:
//  · editing a seeded prompt/profile graduates it (drops `domain`/`seedId`), so it
//    stops reading as "from the kit";
//  · `prompt.clearDomain` / `profile.clearDomain` (the swap "replace" step) remove
//    only the kit's UNTOUCHED seeds, never edited or hand-created records.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import {
  installSeeds as installPromptSeeds,
  mutatePromptLibrary,
  queryPromptLibrary,
} from '../src/core/prompts';
import {
  installProfileSeeds,
  mutateProfileLibrary,
  queryProfileLibrary,
} from '../src/core/profiles';
import type { Prompt, InstructionProfile } from '../src/shared/types';

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-starter-kit-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

async function prompts(store: WorkspaceStore): Promise<Prompt[]> {
  const snap = await queryPromptLibrary(store, { kind: 'prompt.library' });
  if (snap.kind !== 'prompt.library') throw new Error('expected library');
  return snap.prompts;
}

async function profiles(store: WorkspaceStore): Promise<InstructionProfile[]> {
  const snap = await queryProfileLibrary(store, { kind: 'profile.library' });
  return snap.profiles;
}

describe('editing a seed graduates it (drops kit provenance)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('prompt.update strips domain + seedId, leaving siblings tagged', async () => {
    await installPromptSeeds(store, 'software-engineering');
    const before = await prompts(store);
    expect(before.length).toBeGreaterThan(1);
    expect(before.every((p) => p.domain === 'software-engineering' && p.seedId)).toBe(true);

    const target = before[0];
    const res = await mutatePromptLibrary(store, {
      op: 'prompt.update',
      id: target.id,
      title: 'My own title',
    });
    expect(res.stores).toEqual(['prompts']);

    const after = await prompts(store);
    const edited = after.find((p) => p.id === target.id)!;
    expect(edited.title).toBe('My own title');
    expect(edited.domain).toBeUndefined();
    expect(edited.seedId).toBeUndefined();
    // Untouched siblings keep their provenance.
    const siblings = after.filter((p) => p.id !== target.id);
    expect(siblings.every((p) => p.domain === 'software-engineering')).toBe(true);
  });

  it('profile.update strips domain + seedId', async () => {
    await installProfileSeeds(store, 'software-engineering');
    const target = (await profiles(store))[0];
    expect(target.domain).toBe('software-engineering');

    await mutateProfileLibrary(store, {
      op: 'profile.update',
      id: target.id,
      name: 'Mine now',
    });

    const edited = (await profiles(store)).find((p) => p.id === target.id)!;
    expect(edited.name).toBe('Mine now');
    expect(edited.domain).toBeUndefined();
    expect(edited.seedId).toBeUndefined();
  });
});

describe('clearDomain removes only untouched seeds (swap replace)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('prompt.clearDomain keeps edited + hand-created prompts', async () => {
    await installPromptSeeds(store, 'software-engineering');
    const seeded = await prompts(store);
    // Edit one (graduates) and hand-create one (never had a domain).
    await mutatePromptLibrary(store, { op: 'prompt.update', id: seeded[0].id, title: 'Kept' });
    await mutatePromptLibrary(store, {
      op: 'prompt.create',
      id: 'mine',
      title: 'Hand made',
      body: 'no vars',
    });

    const res = await mutatePromptLibrary(store, {
      op: 'prompt.clearDomain',
      domain: 'software-engineering',
    });
    expect(res.stores).toEqual(['prompts']);

    const left = await prompts(store);
    // Only the graduated edit + the hand-created prompt survive; every still-tagged
    // seed is gone.
    expect(left.map((p) => p.id).sort()).toEqual([seeded[0].id, 'mine'].sort());
    expect(left.every((p) => p.domain === undefined)).toBe(true);
  });

  it('prompt.clearDomain reports no touched store when nothing matches', async () => {
    const res = await mutatePromptLibrary(store, {
      op: 'prompt.clearDomain',
      domain: 'marketing-content',
    });
    expect(res.stores).toEqual([]);
  });

  it('profile.clearDomain keeps edited + hand-created profiles', async () => {
    await installProfileSeeds(store, 'software-engineering');
    const seeded = await profiles(store);
    await mutateProfileLibrary(store, { op: 'profile.update', id: seeded[0].id, name: 'Kept' });
    await mutateProfileLibrary(store, {
      op: 'profile.create',
      id: 'mine',
      name: 'Hand made',
      instructionText: 'be terse',
    });

    await mutateProfileLibrary(store, {
      op: 'profile.clearDomain',
      domain: 'software-engineering',
    });

    const left = await profiles(store);
    expect(left.map((p) => p.id).sort()).toEqual([seeded[0].id, 'mine'].sort());
    expect(left.every((p) => p.domain === undefined)).toBe(true);
  });
});
