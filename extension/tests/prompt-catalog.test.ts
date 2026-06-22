// prompt-seed-catalog spec coverage (Vitest + fake-indexeddb).
// Maps to openspec/changes/prompt-seed-catalog/specs/prompt-catalog/spec.md and the
// workspace-store migration scenario: catalog validity (6.1), the idempotent installer
// (6.2), the worker `prompts.install` request (6.3), and the v5 no-op migration (6.4).

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, type IDBPDatabase } from 'idb';
import {
  makeWorkspaceStore,
  openDb,
  MIGRATIONS,
  type Migration,
  type WorkspaceStore,
} from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import {
  CATALOG,
  installSeeds,
  mutatePromptLibrary,
  registerPromptHandlers,
  seedsForDomain,
  type SeedPrompt,
} from '../src/core/prompts';
import { parseVariables } from '../src/core/prompts/template';
import { DOMAIN_REGISTRY, type DomainId } from '../src/shared/domains';
import type { Prompt } from '../src/shared/types';
import type { RequestOf } from '../src/shared/messages';

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-catalog-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

// ---------------------------------------------------------------------------
// 6.1 Catalog validity
// ---------------------------------------------------------------------------

describe('starter-prompt catalog validity (6.1)', () => {
  it('has exactly five seeds per registry domain and 20 total', () => {
    expect(CATALOG).toHaveLength(5 * DOMAIN_REGISTRY.length);
    for (const { id } of DOMAIN_REGISTRY) {
      expect(seedsForDomain(id)).toHaveLength(5);
    }
  });

  it('uses unique, present seedIds and a registry domain for every entry', () => {
    const ids = CATALOG.map((s) => s.seedId);
    expect(new Set(ids).size).toBe(ids.length);
    const domains = new Set<DomainId>(DOMAIN_REGISTRY.map((d) => d.id));
    for (const s of CATALOG) {
      expect(s.seedId).toBeTruthy();
      expect(domains.has(s.domain)).toBe(true);
    }
  });

  it('parses every seed body via parseVariables without throwing', () => {
    for (const s of CATALOG) {
      expect(() => parseVariables(s.body)).not.toThrow();
      const vars = parseVariables(s.body);
      for (const v of vars) {
        expect(v.name).toBeTruthy();
        expect(['text', 'select']).toContain(v.type);
      }
    }
  });

  it('registry enumerates the four domains in order with non-empty labels', () => {
    expect(DOMAIN_REGISTRY.map((d) => d.id)).toEqual([
      'software-engineering',
      'marketing-content',
      'data-analytics',
      'education-research',
    ]);
    for (const d of DOMAIN_REGISTRY) expect(d.label.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6.2 Installer
// ---------------------------------------------------------------------------

describe('idempotent domain seed installation (6.2)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('inserts a domain\'s five seeds, stamping domain/seedId/null category/derived vars', async () => {
    const count = await installSeeds(store, 'software-engineering');
    expect(count).toBe(5);

    const prompts = await store.prompts.query();
    expect(prompts).toHaveLength(5);
    const expected = new Map(
      seedsForDomain('software-engineering').map((s) => [s.seedId, s]),
    );
    for (const p of prompts) {
      expect(p.domain).toBe('software-engineering');
      expect(p.seedId).toBeTruthy();
      expect(p.promptFolderId).toBeNull();
      expect(p.usageCount).toBe(0);
      expect(p.id).toBeTruthy();
      // variables are derived from the seed body, not carried by the catalog.
      const seed = expected.get(p.seedId!) as SeedPrompt;
      expect(p.variables).toEqual(parseVariables(seed.body));
    }
  });

  it('re-running the same domain installs nothing (returns 0)', async () => {
    await installSeeds(store, 'software-engineering');
    const again = await installSeeds(store, 'software-engineering');
    expect(again).toBe(0);
    expect(await store.prompts.query()).toHaveLength(5);
  });

  it('installing a second domain leaves the first untouched', async () => {
    await installSeeds(store, 'software-engineering');
    const before = await store.prompts.query();
    const beforeById = new Map(before.map((p) => [p.id, p]));

    const count = await installSeeds(store, 'marketing-content');
    expect(count).toBe(5);

    const after = await store.prompts.query();
    expect(after).toHaveLength(10);
    // every original software-engineering record is byte-for-byte unchanged.
    for (const p of after.filter((q) => q.domain === 'software-engineering')) {
      expect(p).toEqual(beforeById.get(p.id));
    }
    expect(after.filter((q) => q.domain === 'marketing-content')).toHaveLength(5);
  });

  it('never modifies or removes prompts that lack a seedId', async () => {
    // A user-authored prompt (no seedId) via the normal create path.
    await mutatePromptLibrary(store, {
      op: 'prompt.create',
      id: 'user-1',
      title: 'Mine',
      body: 'Hello {{name}}',
    });
    const userBefore = await store.prompts.get('user-1');

    await installSeeds(store, 'data-analytics');

    const userAfter = await store.prompts.get('user-1');
    expect(userAfter).toEqual(userBefore);
    expect(userAfter!.seedId).toBeUndefined();
    expect(userAfter!.domain).toBeUndefined();
    // only the data-analytics seeds were added alongside the user prompt.
    const seeds = (await store.prompts.query()).filter((p) => p.seedId);
    expect(seeds).toHaveLength(5);
    expect(seeds.every((p) => p.domain === 'data-analytics')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6.3 Worker prompts.install
// ---------------------------------------------------------------------------

const installReq = (domain: DomainId): RequestOf<'prompts.install'> => ({
  kind: 'prompts.install',
  domain,
});

describe('worker prompts.install broadcast semantics (6.3)', () => {
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

  it('returns the count and broadcasts prompts when seeds are added', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerPromptHandlers();

    const res = await dispatch(installReq('software-engineering'));
    expect(res.ok).toBe(true);
    expect((res as { data: { installed: number } }).data.installed).toBe(5);
    expect(stateChanged(delivered)?.payload?.stores).toEqual(['prompts']);
  });

  it('does not broadcast on a no-op install', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerPromptHandlers();

    await dispatch(installReq('software-engineering')); // first: installs 5
    const beforeSecond = delivered.length;
    const res = await dispatch(installReq('software-engineering')); // second: no-op
    expect(res.ok).toBe(true);
    expect((res as { data: { installed: number } }).data.installed).toBe(0);
    // no NEW state.changed emitted by the second (no-op) install.
    const newlyDelivered = delivered.slice(beforeSecond);
    const broadcastAfter = newlyDelivered
      .map((m) => m as { payload?: { kind?: string } })
      .some((m) => m.payload?.kind === 'state.changed');
    expect(broadcastAfter).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6.4 Migration v5 is a no-op additive bump
// ---------------------------------------------------------------------------

describe('Prompt domain/seedId additions are a no-data migration (6.4)', () => {
  it('v5 is a no-op bump; pre-v5 prompts rows stay readable with domain/seedId undefined', async () => {
    const name = `skeinos-prompt-v5-${dbCounter++}`;

    // Build a pre-v5 history: the real v1..v4 steps (everything before this change).
    const preV5: Migration[] = MIGRATIONS.slice(0, 4);
    let db: IDBPDatabase = await openDb(name, preV5, 4);
    const store4 = makeWorkspaceStore(db);
    // Seed a prompt under the pre-v5 model (no domain/seedId).
    await mutatePromptLibrary(store4, {
      op: 'prompt.create',
      id: 'old-1',
      title: 'Legacy',
      body: 'Hi {{name}}',
    });
    const objectStoresBefore = [...db.objectStoreNames].sort();
    db.close();

    // Reopen at v5 with the REAL appended step — the additive no-op bump.
    const withV5: Migration[] = [...preV5, MIGRATIONS[4]];
    db = await openDb(name, withV5, 5);
    try {
      // No structural change: the same object stores exist after the bump.
      expect([...db.objectStoreNames].sort()).toEqual(objectStoresBefore);

      const store5 = makeWorkspaceStore(db);
      const old = (await store5.prompts.get('old-1')) as Prompt;
      expect(old).toBeTruthy();
      expect(old.title).toBe('Legacy');
      expect(old.domain).toBeUndefined();
      expect(old.seedId).toBeUndefined();
    } finally {
      db.close();
      await deleteDB(name);
    }
  });

  it('the shipped MIGRATIONS list is at version 6', () => {
    expect(MIGRATIONS).toHaveLength(6);
  });
});
