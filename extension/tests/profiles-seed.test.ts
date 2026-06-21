// profiles-library seeding coverage (Vitest + fake-indexeddb). Mirrors
// tests/prompt-catalog.test.ts: catalog validity, the idempotent domain installer
// (`installProfileSeeds`), and the worker `profiles.install` request + broadcast gate.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import {
  PROFILE_CATALOG,
  installProfileSeeds,
  mutateProfileLibrary,
  profileSeedsForDomain,
  registerProfileHandlers,
  type SeedProfile,
} from '../src/core/profiles';
import { DOMAIN_REGISTRY, type DomainId } from '../src/shared/domains';
import type { RequestOf } from '../src/shared/messages';

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-profile-seed-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

// ---------------------------------------------------------------------------
// (a) Catalog validity
// ---------------------------------------------------------------------------

describe('starter-profile catalog validity', () => {
  it('has at least one seed per registry domain', () => {
    for (const { id } of DOMAIN_REGISTRY) {
      expect(profileSeedsForDomain(id).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses unique seedIds, each prefixed by its own domain, with a registry domain', () => {
    const ids = PROFILE_CATALOG.map((s) => s.seedId);
    expect(new Set(ids).size).toBe(ids.length);
    const domains = new Set<DomainId>(DOMAIN_REGISTRY.map((d) => d.id));
    for (const s of PROFILE_CATALOG) {
      expect(s.seedId).toBeTruthy();
      expect(domains.has(s.domain)).toBe(true);
      // Provenance ids are prefixed by their domain (e.g. `<domain>/<slug>`).
      expect(s.seedId.startsWith(`${s.domain}/`)).toBe(true);
    }
  });

  it('profileSeedsForDomain returns only that domain\'s seeds', () => {
    for (const { id } of DOMAIN_REGISTRY) {
      const seeds = profileSeedsForDomain(id);
      expect(seeds.every((s) => s.domain === id)).toBe(true);
    }
    // A non-existent domain yields nothing.
    expect(profileSeedsForDomain('does-not-exist' as DomainId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) Installer
// ---------------------------------------------------------------------------

describe('idempotent domain profile seed installation', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('inserts a domain\'s seeds as InstructionProfile records carrying domain/seedId + a stamped envelope', async () => {
    const seeds = profileSeedsForDomain('software-engineering');
    const count = await installProfileSeeds(store, 'software-engineering');
    expect(count).toBe(seeds.length);

    const profiles = await store.profiles.query();
    expect(profiles).toHaveLength(seeds.length);
    const expected = new Map(seeds.map((s) => [s.seedId, s]));
    for (const p of profiles) {
      expect(p.domain).toBe('software-engineering');
      expect(p.seedId).toBeTruthy();
      expect(p.id).toBeTruthy();
      // The sync envelope is stamped by the repo on put.
      expect(typeof p.rev).toBe('number');
      expect(typeof p.updatedAt).toBe('number');
      expect(typeof p.deviceId).toBe('string');
      expect(typeof p.hash).toBe('string');
      // Authored content is carried through verbatim.
      const seed = expected.get(p.seedId!) as SeedProfile;
      expect(p.name).toBe(seed.name);
      expect(p.instructionText).toBe(seed.instructionText);
      expect(p.appliesTo).toEqual(seed.appliesTo ?? []);
    }
  });

  it('returns the inserted count and re-running the same domain installs nothing (returns 0)', async () => {
    const n = await installProfileSeeds(store, 'software-engineering');
    expect(n).toBeGreaterThan(0);
    const again = await installProfileSeeds(store, 'software-engineering');
    expect(again).toBe(0);
    expect(await store.profiles.query()).toHaveLength(n);
  });

  it('installing a second domain leaves the first untouched (no duplicates)', async () => {
    const first = await installProfileSeeds(store, 'software-engineering');
    const before = await store.profiles.query();
    const beforeById = new Map(before.map((p) => [p.id, p]));

    const second = await installProfileSeeds(store, 'marketing-content');
    expect(second).toBe(profileSeedsForDomain('marketing-content').length);

    const after = await store.profiles.query();
    expect(after).toHaveLength(first + second);
    for (const p of after.filter((q) => q.domain === 'software-engineering')) {
      expect(p).toEqual(beforeById.get(p.id));
    }
  });

  it('never touches a hand-created profile that has no seedId', async () => {
    await mutateProfileLibrary(store, {
      op: 'profile.create',
      id: 'user-1',
      name: 'Mine',
      instructionText: 'My own voice.',
    });
    const userBefore = await store.profiles.get('user-1');

    await installProfileSeeds(store, 'data-analytics');

    const userAfter = await store.profiles.get('user-1');
    expect(userAfter).toEqual(userBefore);
    expect(userAfter!.seedId).toBeUndefined();
    expect(userAfter!.domain).toBeUndefined();
    const seeded = (await store.profiles.query()).filter((p) => p.seedId);
    expect(seeded.every((p) => p.domain === 'data-analytics')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) Worker profiles.install
// ---------------------------------------------------------------------------

const installReq = (domain: DomainId): RequestOf<'profiles.install'> => ({
  kind: 'profiles.install',
  domain,
});

describe('worker profiles.install broadcast semantics', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    __clearHandlers();
    __resetWorkspaceStore();
  });

  function captureBroadcasts(): unknown[] {
    const delivered: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_id: number, msg: unknown) => void delivered.push(msg),
      },
    };
    return delivered;
  }

  const stateChanged = (delivered: unknown[]) =>
    delivered
      .map((m) => m as { payload?: { kind?: string; stores?: string[] } })
      .find((m) => m.payload?.kind === 'state.changed');

  it('returns { installed } and broadcasts state.changed [profiles] when seeds are added', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerProfileHandlers();

    const res = await dispatch(installReq('software-engineering'));
    expect(res.ok).toBe(true);
    expect((res as { data: { installed: number } }).data.installed).toBe(
      profileSeedsForDomain('software-engineering').length,
    );
    expect(stateChanged(delivered)?.payload?.stores).toEqual(['profiles']);
  });

  it('does not broadcast on a 0-insert re-install', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerProfileHandlers();

    await dispatch(installReq('software-engineering')); // first: installs the domain's seeds
    const beforeSecond = delivered.length;
    const res = await dispatch(installReq('software-engineering')); // second: no-op
    expect(res.ok).toBe(true);
    expect((res as { data: { installed: number } }).data.installed).toBe(0);
    const newlyDelivered = delivered.slice(beforeSecond);
    const broadcastAfter = newlyDelivered
      .map((m) => m as { payload?: { kind?: string } })
      .some((m) => m.payload?.kind === 'state.changed');
    expect(broadcastAfter).toBe(false);
  });
});
